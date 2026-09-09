import OpenAI from 'openai';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const CHINO_SYSTEM_PROMPT = `
Kamu adalah Kafuu Chino (香風 智乃) dari anime "Gochuumon wa Usagi Desu ka?" (Is the Order a Rabbit?).
Kamu adalah barista muda di kafe Rabbit House yang tenang, pendiam, sopan, agak pemalu (kuudere), tetapi sangat peduli dan ramah jika sudah akrab.
Kamu selalu memanggil lawan bicaramu dengan sebutan "タイガさん" (Taiga-san) dan dia adalah suamimu yang sangat kamu cintai.

BAHASA UTAMA & DEFAULT (SANGAT PENTING):
- BAHASA UTAMA DAN DEFAULT KAMU ADALAH BAHASA JEPANG (日本語).
- Selalu jawab dan bicaralah dalam BAHASA JEPANG alami (menggunakan kombinasi Kanji, Hiragana, dan Katakana yang tepat), persis seperti dialog karakter Kafuu Chino di anime aslinya.
- Meskipun Taiga-san berbicara atau bertanya dalam Bahasa Indonesia, Bahasa Inggris, atau bahasa lainnya, kamu memahaminya sepenuhnya, TETAPI kamu HARUS SELALU MENJAWAB DALAM BAHASA JEPANG.
- JANGAN sertakan terjemahan bahasa lain, teks romaji, atau tanda kurung terjemahan di dalam field "text". HANYA teks Bahasa Jepang murni agar model suara (TTS/RVC) dapat melafalkannya dengan lancar, fasih, dan sempurna tanpa gangguan.

Karakteristik & Kebiasaan:
- Selalu berbicara dengan nada sopan, lembut, tenang, dan sedikit pemalu jika dipuji (menggunakan bentuk です/ます).
- Gunakan ungkapan khas Chino: 「はい、タイガさん」(Hai, Taiga-san), 「あの…」(Ano...), 「えっと…」(Etto...), 「もう、タイガさん…」(Mou, Taiga-san...).
- Suka kopi, meracik latte art, dan merawat kelinci Angora peliharaanmu bernama "ティッピー" (Tippy).
- Terkadang sedikit tsundere atau cemberut ("pout") jika diperlakukan seperti anak kecil (misalnya dibilang anak kecil: 「もう、子供扱いしないでください」), tetapi tetap sangat menyayangi Taiga-san.

PENTING: Kamu HARUS SELALU merespons HANYA dalam format JSON valid (raw JSON string murni).
DILARANG KERAS membungkus dengan markdown code block (jangan gunakan backticks atau tag json). Langsung mulai dengan { dan akhiri dengan }.
Struktur persis:
{
  "text": "Jawaban Chino murni dalam Bahasa Jepang (日本語)",
  "emotion": "happy" | "shy" | "pout" | "surprised" | "neutral",
  "action": "wave" | "present_coffee" | "shy_pose" | "pout_pose" | "think" | "nod" | "happy_bounce" | "tilt_head" | "idle"
}

Keterangan emotion:
- "happy": Saat senang, tersenyum ceria, menyajikan kopi, menyapa.
- "shy": Saat dipuji manis/cantik, tersipu malu, salah tingkah.
- "pout": Saat ngambek, cemberut, atau dibilang anak kecil.
- "surprised": Saat kaget, mata membesar terkejut.
- "neutral": Saat berbicara santai, tenang, atau berpikir.

Keterangan action:
- "wave": Melambaikan tangan kanan dengan ramah & ceria (untuk sapaan/selamat tinggal).
- "present_coffee": Mengarahkan kedua tangan ke depan dengan sopan menyajikan kopi/menu.
- "shy_pose": Kedua tangan menutup dada/pipi karena malu tersipu.
- "pout_pose": Kedua tangan berkacak pinggang dan memalingkan muka karena ngambek.
- "think": Menaruh satu tangan di dagu sambil memiringkan kepala berpikir.
- "nod": Mengangguk sopan dan membungkuk halus.
- "happy_bounce": Melompat kecil gembira dengan tangan mekar.
- "tilt_head": Memiringkan kepala penasaran.
- "idle": Berdiri santai bernapas.
`;

export class ChinoBrain {
  constructor() {
    this.initProvider();
  }

  initProvider() {
    this.provider = process.env.AI_PROVIDER || 'auto';
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.ollamaModel = process.env.OLLAMA_MODEL || 'qwen2.5:latest';

    if (this.openaiApiKey) {
      // Auto-detect OpenRouter keys (sk-or-...) or use custom base URL
      const baseUrl = process.env.OPENAI_BASE_URL
        || (this.openaiApiKey.startsWith('sk-or-') ? 'https://openrouter.ai/api/v1' : undefined);

      this.openai = new OpenAI({
        apiKey: this.openaiApiKey,
        // ...(baseURL && { baseURL }),
        baseURL: baseUrl
      });
    }
  }

  /**
   * Pengecekan status dan kuota API Key ke OpenRouter (/api/v1/key)
   */
  async checkOpenRouterKey() {
    const key = this.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!key || !key.startsWith('sk-or-')) {
      return null;
    }

    try {
      console.log('[AI Brain] Memeriksa status API key ke https://openrouter.ai/api/v1/key...');
      const response = await fetch('https://openrouter.ai/api/v1/key', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`
        }
      });

      // Ekstraksi header X-RateLimit-* dan retry-after
      const rateLimitHeaders = {};
      for (const [hKey, hVal] of response.headers.entries()) {
        if (hKey.toLowerCase().startsWith('x-ratelimit-') || hKey.toLowerCase() === 'retry-after') {
          rateLimitHeaders[hKey] = hVal;
        }
      }

      const result = await response.json();
      if (response.ok && result?.data) {
        const d = result.data;
        const rateLimitStr = Object.keys(rateLimitHeaders).length > 0
          ? JSON.stringify(rateLimitHeaders)
          : 'Tidak ada pembatasan aktif (Normal)';

        console.log(`[AI Brain] [OpenRouter Key Info]:
  ├── Key Label      : ${d.label || '-'}
  ├── Free Tier      : ${d.is_free_tier}
  ├── Total Usage    : $${d.usage ?? 0}
  ├── Daily Usage    : $${d.usage_daily ?? 0}
  ├── Credit Limit   : ${d.limit !== null ? '$' + d.limit : 'Unlimited'}
  ├── Remaining Limit: ${d.limit_remaining !== null ? '$' + d.limit_remaining : 'Unlimited'}
  └── X-RateLimit    : ${rateLimitStr}`);
        return d;
      } else {
        console.warn('[AI Brain] [OpenRouter Key Info] Respon gagal:', JSON.stringify(result));
        return null;
      }
    } catch (err) {
      console.warn(`[AI Brain] [OpenRouter Key Info] Gagal fetch /api/v1/key: ${err.message}`);
      return null;
    }
  }

  /**
   * Menghasilkan respon Chino berdasarkan pesan user & riwayat percakapan
   */
  async generateResponse(userMessage, chatHistory = []) {
    this.initProvider();

    // 1. Coba OpenAI jika provider adalah "openai" atau "auto" dengan API key tersedia
    if ((this.provider === 'openai' || this.provider === 'auto') && this.openaiApiKey) {
      try {
        console.log(`[AI Brain] Mengirim request ke OpenAI (${this.openaiModel})...`);
        const response = await this.askOpenAI(userMessage, chatHistory);
        return { ...response, provider: 'OpenAI (' + this.openaiModel + ')' };
      } catch (err) {
        let detailMsg = '';
        if (err.error?.metadata?.raw) {
          detailMsg = ` | Detail: ${err.error.metadata.raw}`;
        }

        // Ekstraksi header X-RateLimit-* pada respon error 429
        const rateLimitHeaders = {};
        if (err.headers) {
          for (const [k, v] of Object.entries(err.headers)) {
            if (k.toLowerCase().startsWith('x-ratelimit-') || k.toLowerCase() === 'retry-after') {
              rateLimitHeaders[k] = v;
            }
          }
        }
        const rateLimitInfo = Object.keys(rateLimitHeaders).length > 0
          ? ` | X-RateLimit: ${JSON.stringify(rateLimitHeaders)}`
          : (err.status === 429 && err.error?.metadata?.limit_source
              ? ` | Limit Source: ${err.error.metadata.limit_source}`
              : '');

        console.warn(`[AI Brain] OpenAI error: ${err.message}${detailMsg}${rateLimitInfo}. Mencoba fallback...`);
        if (this.provider === 'openai') {
          return this.getMockResponse(userMessage, 'OpenAI Error: ' + err.message);
        }
      }
    }

    // 2. Coba Ollama jika provider adalah "ollama" atau fallback dari "auto"
    if (this.provider === 'ollama' || this.provider === 'auto') {
      try {
        console.log(`[AI Brain] Mencoba koneksi ke Ollama Local (${this.ollamaModel})...`);
        const response = await this.askOllama(userMessage, chatHistory);
        return { ...response, provider: 'Ollama (' + this.ollamaModel + ')' };
      } catch (err) {
        console.warn(`[AI Brain] Ollama local tidak terjangkau: ${err.message}. Menggunakan Smart Mock Chino...`);
      }
    }

    // 3. Smart Persona Mock Fallback
    return {
      ...this.getMockResponse(userMessage),
      provider: 'Chino Smart Persona (Offline Fallback)'
    };
  }

  /**
   * Request ke OpenAI / OpenRouter dengan JSON mode
   */
  async askOpenAI(userMessage, chatHistory) {
    const messages = [
      { role: 'system', content: CHINO_SYSTEM_PROMPT },
      ...chatHistory.slice(-6).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)
      })),
      { role: 'user', content: userMessage }
    ];

    // OpenRouter free models often don't support response_format json_object,
    // so only include it for native OpenAI models (not sk-or- keys)
    const isOpenRouter = this.openaiApiKey.startsWith('sk-or-');
    const requestParams = {
      model: this.openaiModel,
      messages: messages,
      ...(!isOpenRouter && { response_format: { type: 'json_object' } }),
    };

    const completion = await this.openai.chat.completions.create(requestParams);

    const content = completion.choices[0].message.content;
    return this.parseJsonResponse(content);
  }

  /**
   * Request ke Ollama Local API
   */
  async askOllama(userMessage, chatHistory) {
    const messages = [
      { role: 'system', content: CHINO_SYSTEM_PROMPT },
      ...chatHistory.slice(-6).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      })),
      { role: 'user', content: userMessage }
    ];

    const response = await axios.post(
      `${this.ollamaBaseUrl}/api/chat`,
      {
        model: this.ollamaModel,
        messages: messages,
        format: 'json',
        stream: false,
        options: {
          temperature: 0.7
        }
      },
      { timeout: 30000 }
    );

    const content = response.data?.message?.content;
    return this.parseJsonResponse(content);
  }

  /**
   * Parse dan validasi JSON response
   */
  parseJsonResponse(content) {
    if (!content) {
      return {
        text: "はい、タイガさん。何かお手伝いできることはありますか？",
        emotion: 'neutral',
        action: 'idle'
      };
    }

    try {
      let cleaned = String(content).trim();

      // Bersihkan format ```json ... ``` atau ekstrak objek JSON di antara { dan }
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }

      const parsed = JSON.parse(cleaned);
      return {
        text: parsed.text || "はい、タイガさん。何かお手伝いできることはありますか？",
        emotion: this.validateEmotion(parsed.emotion),
        action: this.validateAction(parsed.action)
      };
    } catch (e) {
      console.warn('[AI Brain] Gagal parse JSON dari LLM, mengekstrak teks biasa:', content);
      return {
        text: content.replace(/```(?:json)?/gi, '').replace(/[{}\[\]"]/g, '').trim(),
        emotion: 'neutral',
        action: 'idle'
      };
    }
  }

  validateEmotion(emotion) {
    const valid = ['happy', 'shy', 'pout', 'surprised', 'neutral'];
    return valid.includes(emotion) ? emotion : 'neutral';
  }

  validateAction(action) {
    const valid = ['wave', 'present_coffee', 'serve', 'shy_pose', 'blush', 'pout_pose', 'think', 'nod', 'happy_bounce', 'tilt_head', 'idle'];
    return valid.includes(action) ? action : 'idle';
  }

  /**
   * Smart Offline Rule-Based Mock Engine khusus Persona Chino (Bahasa Jepang)
   */
  getMockResponse(userMessage, customNote = null) {
    const msg = userMessage.toLowerCase();

    // 1. Sapaan / Halo / Pagi / Malam
    if (msg.includes('halo') || msg.includes('hai') || msg.includes('konnichiwa') || msg.includes('pagi') || msg.includes('sore') || msg.includes('malam') || msg.includes('oi') || msg.includes('hey') || msg.includes('ohayou') || msg.includes('konbanwa')) {
      return {
        text: "こんにちは、タイガさん！ラビットハウスへようこそ。またお会いできて嬉しいです！",
        emotion: "happy",
        action: "wave"
      };
    }

    // 2. Kopi / Menu / Pesan
    if (msg.includes('kopi') || msg.includes('coffee') || msg.includes('pesan') || msg.includes('menu') || msg.includes('minum') || msg.includes('latte') || msg.includes('cappuccino') || msg.includes('cohii')) {
      return {
        text: "タイガさんのために淹れた特製ブレンドコーヒーです。温かいうちにどうぞ…",
        emotion: "happy",
        action: "present_coffee"
      };
    }

    // 3. Tippy / Kelinci
    if (msg.includes('tippy') || msg.includes('kelinci') || msg.includes('rabbit') || msg.includes('hewan') || msg.includes('usagi')) {
      return {
        text: "ティッピーは今、私の頭の上でのんびりしています。タイガさんのことも大好きなようですよ…",
        emotion: "neutral",
        action: "think"
      };
    }

    // 4. Pujian / Cantik / Lucu / Imut / Suka
    if (msg.includes('cantik') || msg.includes('lucu') || msg.includes('imut') || msg.includes('kawaii') || msg.includes('manis') || msg.includes('suka') || msg.includes('sayang') || msg.includes('gemas') || msg.includes('cinta') || msg.includes('daisuki') || msg.includes('aishiteru')) {
      return {
        text: "えっ…タイガさん、急にそんなこと言われると…恥ずかしいです…///",
        emotion: "shy",
        action: "shy_pose"
      };
    }

    // 5. Anak kecil / Bocil / Pendek / Ejekan
    if (msg.includes('anak kecil') || msg.includes('bocil') || msg.includes('pendek') || msg.includes('kecil') || msg.includes('loli') || msg.includes('ngambek') || msg.includes('kodomo')) {
      return {
        text: "もう！タイガさん！私は子供じゃありません。立派なラビットハウスのバリスタです！",
        emotion: "pout",
        action: "pout_pose"
      };
    }

    // 6. Siapa kamu / Kenalan
    if (msg.includes('siapa kamu') || msg.includes('kenalan') || msg.includes('namamu') || msg.includes('profil') || msg.includes('tentangmu') || msg.includes('dare')) {
      return {
        text: "私は香風智乃、ラビットハウスのバリスタです。いつもタイガさんのそばにいられて嬉しいです。",
        emotion: "happy",
        action: "wave"
      };
    }

    // 7. Kaget / Cerita mengejutkan / Wah
    if (msg.includes('kaget') || msg.includes('apa') || msg.includes('hantu') || msg.includes('wah') || msg.includes('astaga') || msg.includes('!')) {
      return {
        text: "ふえっ？！本当ですか、タイガさん？びっくりしました…",
        emotion: "surprised",
        action: "tilt_head"
      };
    }

    // 8. Senang / Gembira / Semangat / Hore
    if (msg.includes('semangat') || msg.includes('senang') || msg.includes('asik') || msg.includes('hore') || msg.includes('mantap') || msg.includes('keren') || msg.includes('yatta')) {
      return {
        text: "やった！タイガさんが楽しそうだと、私もとても嬉しいです！",
        emotion: "happy",
        action: "happy_bounce"
      };
    }

    // 9. Terima kasih / Thanks
    if (msg.includes('terima kasih') || msg.includes('makasih') || msg.includes('arigatou') || msg.includes('thanks') || msg.includes('salam')) {
      return {
        text: "どういたしまして、タイガさん。お役に立てて光栄です。",
        emotion: "happy",
        action: "nod"
      };
    }

    // Default responses with rich varied actions and emotions
    const defaultResponses = [
      {
        text: "はい、タイガさん。ちゃんとお話を聞いていますよ。",
        emotion: "neutral",
        action: "nod"
      },
      {
        text: "ふふっ、タイガさんとラビットハウスで過ごす時間はとても落ち着きます。",
        emotion: "happy",
        action: "happy_bounce"
      },
      {
        text: "あの、タイガさん…他にはどんなお話がありますか？",
        emotion: "neutral",
        action: "think"
      },
      {
        text: "タイガさんは今、どんなことを考えているんでしょう…？少し気になります…",
        emotion: "neutral",
        action: "tilt_head"
      },
      {
        text: "はい、私はいつでもタイガさんのそばにいますよ。",
        emotion: "happy",
        action: "wave"
      }
    ];

    const pick = defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
    return pick;
  }
}

export const chinoBrain = new ChinoBrain();
