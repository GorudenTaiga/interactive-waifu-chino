# ☕ Kafuu Chino 3D Interaktif - Rabbit House AI Platform

Platform web interaktif 3D yang menampilkan karakter **Kafuu Chino (香風 智乃)** dari *Gochuumon wa Usagi Desu ka?* dalam format model MMD (`.pmx`). Chino dapat merespons percakapan secara cerdas dan real-time melalui WebSocket (Socket.io), ditenagai oleh kecerdasan buatan (OpenAI GPT-4o / Ollama AI Local / Smart Persona Engine), memiliki output suara Text-to-Speech (TTS), input suara mikrofon (STT), serta animasi prosedural dan ekspresi wajah dinamis (*lip-sync, auto-blink, idle breathing, head tilt, dan morph targets*).

---

## ✨ Fitur Utama

1. **Rendering 3D MMD Three.js Real-time**:
   - Memuat model `Chino.pmx` lengkap dengan tekstur mata dan pakaian.
   - Pencahayaan anime studio (*Key light, Fill light, Rim backlight, Hemisphere light*) yang cerah dan estetis.
   - *Cel-shading OutlineEffect* untuk garis anime yang tajam.
   - Kamera interaktif (*OrbitControls*) yang halus.

2. **Animasi Prosedural & Ekspresi Wajah (Morph Targets)**:
   - **Idle Breathing & Sway**: Gerakan nafas dada dan ayunan kepala yang alami.
   - **Auto-Blink**: Kedipan mata otomatis secara berkala.
   - **Audio-Driven Lip-Sync**: Mulut Chino bergerak sinkron secara real-time saat berbicara.
   - **Ekspresi Wajah**: Transisi halus untuk emosi Senang (`happy`), Malu (`shy`/`blush`), Cemberut (`pout`), Kaget (`surprised`), dan Tenang (`neutral`).
   - **Gestur Responsif**: Mengangguk (`nod`), memiringkan kepala (`tilt_head`), dan menunduk malu (`blush`).

3. **Multi-Brain AI Support**:
   - **OpenAI API**: Menggunakan GPT-4o-mini dengan *Structured JSON Output*.
   - **Ollama AI Local**: Dukungan AI offline lokal tanpa internet (`qwen2.5`, `llama3`, dll).
   - **Smart Persona Engine Fallback**: Simulasi cerdas bawaan berkarakter Chino yang langsung aktif tanpa setup API key.

4. **Sistem Suara Modular (TTS & STT)**:
   - **Langsung Aktif**: Output suara langsung aktif secara default sejak pertama kali dibuka.
   - **Web Speech API**: Text-to-Speech (TTS) suara Jepang/Natural dan Speech-to-Text (STT) input mikrofon.
   - **Custom Voice Model Ready**: Disediakan modul backend & visualizer FFT Web Audio API untuk memutar audio stream dari voice model kustom (seperti Voicevox, ElevenLabs, RVC, atau server TTS lokal yang kamu sediakan).

5. **Antarmuka Rabbit House Cafe Aesthetic**:
   - *Glassmorphism* modern dengan palet warna pastel biru muda, krem, dan kayu manis.
   - Balon dialog melayang dengan *typewriter effect* dan indikator mood badge.
   - Tombol cepat (*quick prompts*), tombol mic, toggle suara, dan modal pengaturan.

---

## 🚀 Cara Menjalankan

### 1. Install Dependencies
Buka terminal di root direktori project:
```bash
npm install
```

### 2. Konfigurasi `.env` (Opsional)
Salin `.env.example` menjadi `.env` (file `.env` sudah disediakan):
```env
PORT=3000
AI_PROVIDER=auto

# OpenAI API Key (Opsional)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

# Ollama Local (Opsional)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:latest

# Custom Voice Model (Opsional)
CUSTOM_TTS_ENABLED=false
CUSTOM_TTS_ENDPOINT=http://localhost:50021/voice
```

### 3. Jalankan Aplikasi
Jalankan backend server dan frontend Vite secara bersamaan dengan satu perintah:
```bash
npm run dev
```

Buka browser di: **`http://localhost:5173`** (atau `http://localhost:3000` untuk direct server).

---

## 🔑 Panduan Konfigurasi AI & Voice Model

### A. Mendapatkan OpenAI API Key
1. Buka [platform.openai.com](https://platform.openai.com/) dan login/daftar.
2. Buka menu **API Keys** di dashboard.
3. Klik tombol **Create new secret key**, beri nama, lalu copy key tersebut.
4. Masukkan ke file `.env`: `OPENAI_API_KEY=sk-...`

### B. Menggunakan Ollama AI Local (Gratis & Offline)
1. Download dan pasang [Ollama](https://ollama.com/).
2. Buka terminal lalu unduh dan jalankan model, contoh:
   ```bash
   ollama run qwen2.5:latest
   ```
3. Set di `.env`: `AI_PROVIDER=ollama`.

### C. Menghubungkan Custom Voice Model (TTS)
1. Jalankan server voice model / TTS kamu (misal Voicevox pada port 50021).
2. Set di `.env`:
   ```env
   CUSTOM_TTS_ENABLED=true
   CUSTOM_TTS_ENDPOINT=http://localhost:50021/voice
   ```
3. Backend akan otomatis mengarahkan sintesis suara ke endpoint tersebut dan mengirim audio ke frontend untuk dianalisis gelombang suaranya bagi *lip-sync* Chino.

---

## 📂 Struktur Project

```
bini-interaktif/
├── model/
│   └── Chino MMD mine/
│       ├── Chino.pmx           # Model 3D MMD Kafuu Chino
│       └── textures/           # Tekstur wajah, mata, baju
├── server/
│   ├── ai/
│   │   └── chinoBrain.js       # Otak AI (OpenAI, Ollama, Smart Persona)
│   ├── voice/
│   │   └── customTtsHandler.js # Handler modular untuk Voice Model kustom
│   └── server.js               # Express + Socket.io Server
├── src/
│   ├── 3d/
│   │   ├── sceneManager.js     # Three.js Scene, Lighting, Camera, Outline
│   │   ├── chinoLoader.js      # MMDLoader & Morph Target Mapping
│   │   └── animationController.js # Prosedural Idle, Lip-Sync, Auto-Blink
│   ├── audio/
│   │   └── speechManager.js    # TTS, STT Mic, Web Audio FFT Analyser
│   ├── styles/
│   │   └── main.css            # Rabbit House Glassmorphism UI
│   ├── ui/
│   │   └── chatUI.js           # Balon dialog, Mood badge, Modal setting
│   └── main.js                 # Entrypoint frontend
├── index.html                  # Halaman web utama
├── vite.config.js              # Konfigurasi Vite & Proxy
├── package.json
└── .env
```
