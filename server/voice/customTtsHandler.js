import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const audioDir = path.join(__dirname, '../../audio');

// Pastikan direktori audio ada
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

/**
 * Handler modular untuk Custom Voice Model / External TTS
 */
export class CustomTtsHandler {
  constructor() {
    this.enabled = process.env.CUSTOM_TTS_ENABLED === 'true';
    this.endpoint = process.env.CUSTOM_TTS_ENDPOINT || 'http://localhost:50021/voice';
  }

  /**
   * Cek apakah Custom TTS aktif
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Set status & endpoint TTS dinamis dari client / env
   */
  updateConfig({ enabled, endpoint }) {
    if (typeof enabled === 'boolean') this.enabled = enabled;
    if (endpoint) this.endpoint = endpoint;
  }

  /**
   * Synthesize speech menggunakan custom endpoint jika aktif
   * Mendukung response format: audio/wav, audio/mp3, atau JSON { audioUrl / audioBase64 }
   */
  async synthesize(text) {
    if (!this.enabled || !this.endpoint) {
      return null;
    }

    try {
      console.log(`[TTS] Menghubungi Custom Voice Model: ${this.endpoint}`);
      
      const response = await axios.post(
        this.endpoint,
        { text: text },
        {
          responseType: 'arraybuffer',
          timeout: 60000,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const fileName = `voice_${Date.now()}.wav`;
      const filePath = path.join(audioDir, fileName);
      fs.writeFileSync(filePath, Buffer.from(response.data));

      return `/audio/${fileName}`;
    } catch (err) {
      console.warn(`[TTS] Gagal memanggil Custom Voice Model: ${err.message}. Fallback ke Web Speech API.`);
      return null;
    }
  }
}

export const customTts = new CustomTtsHandler();
