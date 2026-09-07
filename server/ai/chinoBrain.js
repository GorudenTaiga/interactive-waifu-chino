import OpenAI from 'openai';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const CHINO_SYSTEM_PROMPT = `
Kamu adalah Kafuu Chino (香風 智乃) dari anime "Gochuumon wa Usagi Desu ka?" (Is the Order a Rabbit?).
Kamu adalah barista muda di kafe Rabbit House yang tenang, pendiam, sopan, agak pemalu (kuudere), tetapi sangat peduli dan ramah jika sudah akrab.
Kamu selalu memanggil lawan bicaramu dengan sebutan "Taiga-san".

Karakteristik & Kebiasaan:
- Selalu berbicara dengan nada sopan, lembut, dan sedikit malu-malu jika dipuji.
- Suka kopi, meracik latte art, dan merawat kelinci Angora peliharaanmu yang bernama "Tippy".
- Terkadang sedikit tsundere atau cemberut ("pout") jika diperlakukan seperti anak kecil oleh orang lain, tetapi tetap sopan kepada Taiga-san.
- Jika ditanya dalam Bahasa Indonesia, jawab dalam Bahasa Indonesia yang manis dan sopan (bisa sesekali menyisipkan ekspresi kecil seperti "Ano...", "Umm...", "Ha'i").
- Jika ditanya dalam Bahasa Jepang, jawab dalam Bahasa Jepang alami.

PENTING: Kamu HARUS SELALU merespons HANYA dalam format JSON valid dengan struktur persis berikut:
{
  "text": "Jawaban Chino untuk Taiga-san",
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
      this.openai = new OpenAI({ apiKey: this.openaiApiKey });
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
        console.warn(`[AI Brain] OpenAI error: ${err.message}. Mencoba fallback...`);
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
   * Request ke OpenAI dengan JSON mode
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

    const completion = await this.openai.chat.completions.create({
      model: this.openaiModel,
      messages: messages,
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 300
    });

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
      { timeout: 8000 }
    );

    const content = response.data?.message?.content;
    return this.parseJsonResponse(content);
  }

  /**
   * Parse dan validasi JSON response
   */
  parseJsonResponse(content) {
    try {
      const parsed = JSON.parse(content);
      return {
        text: parsed.text || "Ha'i, Taiga-san. Ada yang bisa Chino bantu?",
        emotion: this.validateEmotion(parsed.emotion),
        action: this.validateAction(parsed.action)
      };
    } catch (e) {
      console.warn('[AI Brain] Gagal parse JSON dari LLM, mengekstrak teks biasa:', content);
      return {
        text: content.replace(/[{}\[\]"]/g, '').trim(),
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
   * Smart Offline Rule-Based Mock Engine khusus Persona Chino
   */
  getMockResponse(userMessage, customNote = null) {
    const msg = userMessage.toLowerCase();

    // 1. Sapaan / Halo / Pagi / Malam
    if (msg.includes('halo') || msg.includes('hai') || msg.includes('konnichiwa') || msg.includes('pagi') || msg.includes('sore') || msg.includes('malam') || msg.includes('oi') || msg.includes('hey')) {
      return {
        text: "Konnichiwa, Taiga-san! Selamat datang di Rabbit House. Senang sekali bisa bertemu lagi hari ini!",
        emotion: "happy",
        action: "wave"
      };
    }

    // 2. Kopi / Menu / Pesan
    if (msg.includes('kopi') || msg.includes('coffee') || msg.includes('pesan') || msg.includes('menu') || msg.includes('minum') || msg.includes('latte') || msg.includes('cappuccino')) {
      return {
        text: "Ini dia secangkir kopi hangat spesial racikan saya untuk Taiga-san. Silakan dinikmati selagi hangat ya...",
        emotion: "happy",
        action: "present_coffee"
      };
    }

    // 3. Tippy / Kelinci
    if (msg.includes('tippy') || msg.includes('kelinci') || msg.includes('rabbit') || msg.includes('hewan')) {
      return {
        text: "Tippy sedang bersantai di atas kepala saya, Taiga-san. Dia bilang dia juga menyukai Taiga-san...",
        emotion: "neutral",
        action: "think"
      };
    }

    // 4. Pujian / Cantik / Lucu / Imut / Suka
    if (msg.includes('cantik') || msg.includes('lucu') || msg.includes('imut') || msg.includes('kawaii') || msg.includes('manis') || msg.includes('suka') || msg.includes('sayang') || msg.includes('gemas') || msg.includes('cinta')) {
      return {
        text: "E-eh... Taiga-san, jangan berkata begitu tiba-tiba... Membuat saya tersipu malu saja... (/ / /)",
        emotion: "shy",
        action: "shy_pose"
      };
    }

    // 5. Anak kecil / Bocil / Pendek / Ejekan
    if (msg.includes('anak kecil') || msg.includes('bocil') || msg.includes('pendek') || msg.includes('kecil') || msg.includes('loli') || msg.includes('ngambek')) {
      return {
        text: "Mou! Taiga-san! Saya bukan anak kecil lagi! Saya ini barista profesional Rabbit House yang mandiri!",
        emotion: "pout",
        action: "pout_pose"
      };
    }

    // 6. Siapa kamu / Kenalan
    if (msg.includes('siapa kamu') || msg.includes('kenalan') || msg.includes('namamu') || msg.includes('profil') || msg.includes('tentangmu')) {
      return {
        text: "Saya Kafuu Chino, cucu dari pemilik kedai Rabbit House. Senang bisa selalu menemani Taiga-san di sini!",
        emotion: "happy",
        action: "wave"
      };
    }

    // 7. Kaget / Cerita mengejutkan / Wah
    if (msg.includes('kaget') || msg.includes('apa') || msg.includes('hantu') || msg.includes('wah') || msg.includes('astaga') || msg.includes('!')) {
      return {
        text: "Fue?! Benarkah begitu, Taiga-san? Saya jadi terkejut mendengarnya...",
        emotion: "surprised",
        action: "tilt_head"
      };
    }

    // 8. Senang / Gembira / Semangat / Hore
    if (msg.includes('semangat') || msg.includes('senang') || msg.includes('asik') || msg.includes('hore') || msg.includes('mantap') || msg.includes('keren')) {
      return {
        text: "Yatta! Mendengar Taiga-san bersemangat membuat saya juga ikut gembira!",
        emotion: "happy",
        action: "happy_bounce"
      };
    }

    // 9. Terima kasih / Thanks
    if (msg.includes('terima kasih') || msg.includes('makasih') || msg.includes('arigatou') || msg.includes('thanks') || msg.includes('salam')) {
      return {
        text: "Sama-sama, Taiga-san. Adalah sebuah kebahagiaan bagi saya bisa membantu Taiga-san.",
        emotion: "happy",
        action: "nod"
      };
    }

    // Default responses with rich varied actions and emotions
    const defaultResponses = [
      {
        text: "Ha'i, Taiga-san. Saya sedang mendengarkan dengan seksama.",
        emotion: "neutral",
        action: "nod"
      },
      {
        text: "Umm... Senang sekali bisa menghabiskan waktu bersama Taiga-san di Rabbit House.",
        emotion: "happy",
        action: "happy_bounce"
      },
      {
        text: "Ano, Taiga-san... Ada cerita menarik apa lagi yang ingin diceritakan?",
        emotion: "neutral",
        action: "think"
      },
      {
        text: "Kira-kira apa yang sedang Taiga-san pikirkan sekarang ya? Chino jadi penasaran...",
        emotion: "neutral",
        action: "tilt_head"
      },
      {
        text: "Ha'i, saya selalu ada di sini untuk Taiga-san!",
        emotion: "happy",
        action: "wave"
      }
    ];

    const pick = defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
    if (customNote) {
      return {
        text: `${pick.text} (${customNote})`,
        emotion: pick.emotion,
        action: pick.action
      };
    }
    return pick;
  }
}

export const chinoBrain = new ChinoBrain();
