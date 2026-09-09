# ☕ Kafuu Chino 3D Interaktif - Rabbit House AI Platform

Platform web interaktif 3D yang menampilkan karakter **Kafuu Chino (香風 智乃)** dari *Gochuumon wa Usagi Desu ka?* dalam format model MMD (`.pmx`). Chino dapat merespons percakapan secara cerdas dan real-time melalui WebSocket (Socket.io), ditenagai oleh kecerdasan buatan (OpenAI GPT-4o / Ollama AI Local / Smart Persona Engine), memiliki output suara asli menggunakan **RVC (Retrieval-based Voice Conversion)**, input suara mikrofon (STT), serta animasi prosedural dan ekspresi wajah dinamis (*lip-sync, auto-blink, idle breathing, head tilt, dan morph targets*).

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
   - **Audio-Driven Lip-Sync**: Mulut Chino bergerak sinkron secara real-time saat berbicara mengikuti gelombang frekuensi suara.
   - **Ekspresi Wajah**: Transisi halus untuk emosi Senang (`happy`), Malu (`shy`/`blush`), Cemberut (`pout`), Kaget (`surprised`), dan Tenang (`neutral`).
   - **Gestur Responsif**: Mengangguk (`nod`), memiringkan kepala (`tilt_head`), dan menunduk malu (`blush`).

3. **Multi-Brain AI Support**:
   - **OpenAI API**: Menggunakan GPT-4o-mini dengan *Structured JSON Output*.
   - **Ollama AI Local**: Dukungan AI offline lokal tanpa internet (`qwen2.5`, `llama3`, dll).
   - **Smart Persona Engine Fallback**: Simulasi cerdas bawaan berkarakter Chino yang langsung aktif tanpa setup API key.

4. **Kafuu Chino RVC Voice Conversion & Sistem Suara**:
   - **RVC (Retrieval-based Voice Conversion)**: Menggunakan voice model khusus Kafuu Chino (`chinno-kafuu.pth` + FAISS index) via pipeline PyTorch/CUDA (RMVPE + HuBERT Base) yang berjalan di server FastAPI lokal port `50051`.
   - **Hybrid TTS Source**: Menghasilkan suara awal via Microsoft Edge TTS (`ja-JP-NanamiNeural` untuk Jepang / `id-ID-GadisNeural` untuk Indonesia) dengan fallback otomatis ke offline TTS (`pyttsx3`) jika internet terputus.
   - **Audio Caching & Streaming**: File suara WAV disimpan ke direktori `/audio` dan di-stream ke klien untuk pemutaran audio dan *lip-sync*.
   - **Web Speech API**: Fallback suara native browser serta input mic Speech-to-Text (STT).

5. **Antarmuka Rabbit House Cafe Aesthetic**:
   - *Glassmorphism* modern dengan palet warna pastel biru muda, krem, dan kayu manis.
   - Balon dialog melayang dengan *typewriter effect* dan indikator mood badge.
   - Tombol cepat (*quick prompts*), tombol mic, toggle suara, dan modal pengaturan.

---

## 🚀 Cara Menjalankan

### Prasyarat
- **Node.js**: v18+ sudah terinstall
- **Python**: v3.10+
- **GPU (Opsional tapi direkomendasikan)**: NVIDIA GPU dengan dukungan CUDA untuk inferensi suara RVC yang cepat (~3-5 detik).

### 1. Install Dependencies Node.js
Buka terminal di root direktori project:
```bash
npm install
```

### 2. Setup Python Virtual Environment
Ikuti panduan yang ada pada README.md yang berada [disini](Retrieval-based-Voice-Conversion-WebUI/docs/en/README.en.md)

### 3. Konfigurasi `.env`
Salin file `.env.example` menjadi `.env` (atau gunakan `.env` yang sudah terisi default):
```env
PORT=3000
AI_PROVIDER=auto

# OpenAI API Key (Opsional)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

# Ollama Local (Opsional)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:latest

# Custom Voice Model — RVC (Kafuu Chino Voice)
CUSTOM_TTS_ENABLED=true
CUSTOM_TTS_ENDPOINT=http://localhost:50051/synthesize
RVC_MODEL_PATH=voice_model/chinno-kafuu.pth
RVC_INDEX_PATH=voice_model/added_IVF209_Flat_nprobe_1_chinno-kafuu_v2.index
RVC_PORT=50051
RVC_PITCH=0
RVC_INDEX_RATE=0.75
RVC_F0_METHOD=rmvpe
RVC_PROTECT=0.33
```

### 3. Jalankan Aplikasi
Jalankan seluruh sistem (RVC Voice Server, Express Backend, dan Vite Frontend) sekaligus dengan satu perintah:
```bash
npm run dev
```

Perintah di atas akan menjalankan 3 proses secara bersamaan melalui `concurrently`:
1. `[RVC]` FastAPI Server di `http://localhost:50051`
2. `[SERVER]` Express + Socket.io Server di `http://localhost:3000`
3. `[CLIENT]` Vite Dev Server di `http://localhost:5173`

Buka browser di: **`http://localhost:5173`**

> [!TIP]
> Kamu juga bisa menjalankan masing-masing service secara terpisah:
> - `npm run rvc` — Hanya server RVC Voice API
> - `npm run server` — Hanya server Node.js backend
> - `npm run client` — Hanya frontend Vite

---

## 🎙️ Integrasi Voice Model RVC (Kafuu Chino Voice)

### Arsitektur Pipeline Suara
```
[Chat UI / User]
      │
      ▼ Socket.io
[Node.js Server :3000]
      │
      ▼ POST /synthesize {text}
[FastAPI RVC Server :50051]
      │
      ├── 1. TTS Source:
      │      • Online: Microsoft Edge TTS (ja-JP-NanamiNeural / id-ID-GadisNeural)
      │      • Offline: pyttsx3 (fallback otomatis jika offline)
      │
      ├── 2. RVC Voice Conversion (PyTorch / CUDA):
      │      • HuBERT Base (ContentVec)  → Ekstraksi representasi vokal
      │      • RMVPE                     → Deteksi pitch/F0 presisi tinggi
      │      • FAISS Index               → Pencocokan timbre suara Chino
      │      • chinno-kafuu.pth          → Generator bobot suara Chino
      │
      ▼
Output audio WAV (40kHz) ──► Node.js /audio/*.wav ──► Frontend Web Audio FFT (Lip-Sync)
```

### File Model yang Digunakan
- **Voice Weights**: `voice_model/chinno-kafuu.pth`
- **FAISS Feature Index**: `voice_model/added_IVF209_Flat_nprobe_1_chinno-kafuu_v2.index`
- **HuBERT Pretrained**: `Retrieval-based-Voice-Conversion-WebUI/assets/hubert_base/pytorch_model.bin`
- **RMVPE Pretrained**: `Retrieval-based-Voice-Conversion-WebUI/assets/rmvpe/rmvpe.pt`

### Parameter Tuning Suara di `.env`
| Parameter | Nilai Rekomendasi | Keterangan |
|-----------|-------------------|------------|
| `RVC_PITCH` | `0` | Pergeseran nada dalam semitone (`0` = nada asli, `-2` s/d `-4` = nada lebih tinggi/feminin). |
| `RVC_INDEX_RATE` | `0.75` | Bobot pencarian fitur FAISS (rentang `0.0` - `1.0`). Nilai `0.75` memberikan kemiripan karakter Chino yang optimal tanpa artifak. |
| `RVC_F0_METHOD` | `rmvpe` | Algoritma ekstraksi pitch (`rmvpe` paling akurat dan jernih; `pm` lebih cepat). |
| `RVC_PROTECT` | `0.33` | Proteksi suara konsonan dan napas tak bernada (rentang `0.0` - `0.5`). |

> [!NOTE]
> **Catatan Waktu Inferensi (Cold Start vs Warm)**:
> Saat request pertama kali dikirim, RVC server membutuhkan waktu ~15-18 detik untuk memuat model HuBERT dan RMVPE ke dalam VRAM GPU. Untuk percakapan berikutnya, proses konversi berjalan cepat (~3-5 detik per kalimat).

---

## 🔑 Panduan Konfigurasi AI

### A. Menggunakan OpenAI API
1. Buka [platform.openai.com](https://platform.openai.com/) dan login/daftar.
2. Masuk ke menu **API Keys** dan klik **Create new secret key**.
3. Masukkan key ke dalam `.env`: `OPENAI_API_KEY=sk-...`

### B. Menggunakan Ollama AI Local (Gratis & Offline)
1. Unduh dan pasang [Ollama](https://ollama.com/).
2. Unduh model pilihan melalui terminal:
   ```bash
   ollama run qwen2.5:latest
   ```
3. Atur konfigurasi pada `.env`:
   ```env
   AI_PROVIDER=ollama
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=qwen2.5:latest
   ```

### C. Smart Mock Persona (Tanpa Setup Tambahan)
Jika tidak ada API key OpenAI dan Ollama tidak berjalan, sistem secara cerdas akan beralih ke engine simulasi bawaan yang sudah diprogram dengan respon khas Kafuu Chino.

---

## 📂 Struktur Project

```
bini-interaktif/
├── audio/                                      # Direktori output file suara WAV yang di-generate
├── model/
│   └── Chino MMD mine/
│       ├── Chino.pmx                           # Model 3D MMD Kafuu Chino
│       └── textures/                           # Tekstur wajah, mata, pakaian
├── voice_model/
│   ├── chinno-kafuu.pth                        # Model bobot suara RVC Kafuu Chino
│   └── added_IVF209_Flat_nprobe_1_chinno-kafuu_v2.index # FAISS Index model suara
├── Retrieval-based-Voice-Conversion-WebUI/
│   ├── rvc_api_server.py                       # FastAPI Server (Edge-TTS + RVC Pipeline)
│   ├── assets/
│   │   ├── hubert_base/                        # Pretrained HuBERT Base Model
│   │   └── rmvpe/                              # Pretrained RMVPE Pitch Extractor
│   └── .venv/                                  # Python Virtual Environment
├── server/
│   ├── ai/
│   │   └── chinoBrain.js                       # Otak AI (OpenAI, Ollama, Smart Persona)
│   ├── voice/
│   │   └── customTtsHandler.js                 # Handler request TTS / RVC ke backend
│   └── server.js                               # Express + Socket.io Server
├── src/
│   ├── 3d/
│   │   ├── sceneManager.js                     # Three.js Scene, Lighting, Camera, Outline
│   │   ├── chinoLoader.js                      # MMDLoader & Morph Target Mapping
│   │   └── animationController.js              # Prosedural Idle, Lip-Sync, Auto-Blink
│   ├── audio/
│   │   └── speechManager.js                    # Web Audio FFT Analyser, Audio Player, STT
│   ├── styles/
│   │   └── main.css                            # Rabbit House Glassmorphism UI
│   ├── ui/
│   │   └── chatUI.js                           # Balon dialog, Mood badge, Modal setting
│   └── main.js                                 # Entrypoint frontend
├── index.html                                  # Halaman web utama
├── vite.config.js                              # Konfigurasi Vite & Proxy
├── package.json                                # Script npm (dev, rvc, server, client)
├── .env                                        # Konfigurasi environment lokal
└── README.md                                   # Dokumentasi lengkap project
```

---

## 📜 Credits & Attribution

Proyek ini dibangun di atas karya luar biasa dari komunitas open source dan para kreator konten. Ucapan terima kasih dan apresiasi sebesar-besarnya kami sampaikan kepada:

### 🎙️ AI Voice Conversion & TTS
* **[RVC-Project / Retrieval-based-Voice-Conversion-WebUI](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI)**:
  * Pengembang utama: **liujing04**, **源文雨**, **Ftps**, serta seluruh kontributor RVC-Project.
  * Lisensi: [MIT License](Retrieval-based-Voice-Conversion-WebUI/LICENSE).
  * Menyediakan arsitektur dasar dan pipeline konversi suara vokal AI (HuBERT, RMVPE, dan FAISS feature retrieval).
* **[edge-tts](https://github.com/rany2/edge-tts)** oleh **rany2**:
  * Pembangkitan sintesis suara (Text-to-Speech) dengan Microsoft Azure Speech Engine.
* **RMVPE (Robust Model for Vocal Pitch Estimation)** & **ContentVec (HuBERT Base)**:
  * Algoritma ekstraksi pitch F0 presisi tinggi dan representasi fitur vokal.

### 🎭 Karakter & 3D Model
* **Karakter Orisinal**: **Kafuu Chino (香風 智乃)** dari serial manga & anime *"Gochuumon wa Usagi Desu ka?" (ご注文はうさぎですか？ / Is the Order a Rabbit?)*.
  * Hak cipta karakter dan karya orisinal sepenuhnya merupakan milik **Koi** / **Houbunsha** / *Gochuumon wa Usagi Desu ka? Production Committee*.
* **MMD 3D Model**:
  * Konversi dan rigging model MMD PMX oleh: **kappa19-2000**.
  * Ripped aset 3D asli dari: *Miracle Girls Festival* oleh **Serbia**.
  * Digunakan untuk keperluan non-komersial, edukasi, dan proyek interaktif komunitas.

### 🌐 Frontend & 3D Engine
* **[Three.js](https://github.com/mrdoob/three.js/)** oleh **Mr.doob** dan kontributor:
  * WebGL 3D Engine serta modul `MMDLoader` oleh **takahirox**.
* **[Vite](https://vitejs.dev/)** oleh **Evan You** dan tim Vite.
* **[Express](https://expressjs.com/)** & **[Socket.io](https://socket.io/)**:
  * Komunikasi real-time dan penyajian server backend.

---

## ⚖️ Lisensi & Disclaimer

* Kode kustom proyek ini (Node.js backend, Three.js controller, UI, dan bridge API) dirilis di bawah lisensi **MIT License**.
* Kode RVC di dalam folder `Retrieval-based-Voice-Conversion-WebUI/` tetap dilisensikan di bawah lisensi aslinya (**MIT License - Copyright (c) 2023 RVC-Project Authors**).
* **Disclaimer**: Proyek ini dibuat murni untuk tujuan eksperimen, riset kecerdasan buatan, edukasi, dan apresiasi penggemar (fan-made non-profit project) tanpa tujuan komersial apapun.

