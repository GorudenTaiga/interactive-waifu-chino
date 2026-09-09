r"""
RVC API Server — Kafuu Chino Voice Integration
===============================================
FastAPI server that converts text → Chino voice via:
  1. edge-tts (online, ja-JP-NanamiNeural) → source WAV
  2. RVC pipeline (chinno-kafuu.pth + FAISS index) → converted WAV
  3. Returns binary audio/wav

Run from project root:
  .\Retrieval-based-Voice-Conversion-WebUI\.venv\Scripts\python.exe Retrieval-based-Voice-Conversion-WebUI\rvc_api_server.py

Endpoints:
  GET  /health      — Server health check
  GET  /info        — Model info
  POST /synthesize  — {text: str, pitch?: int} → audio/wav
"""

import asyncio
import io
import logging
import os
import sys
import tempfile
import time
import warnings
from pathlib import Path

import numpy as np
import soundfile as sf
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

# ── Suppress noisy deprecation warnings ─────────────────────────────────────
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

# ── Path setup ───────────────────────────────────────────────────────────────
# This script lives in: <project>/Retrieval-based-Voice-Conversion-WebUI/
RVC_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = RVC_DIR.parent

# Make RVC importable
sys.path.insert(0, str(RVC_DIR))

os.chdir(RVC_DIR)
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("weight_root", str(RVC_DIR / "assets" / "weights"))
os.environ.setdefault("index_root", str(RVC_DIR / "logs"))
os.environ.setdefault("outside_index_root", str(RVC_DIR / "assets" / "indices"))
os.environ.setdefault("rmvpe_root", str(RVC_DIR / "assets" / "rmvpe"))

# ── Config ───────────────────────────────────────────────────────────────────
PORT = int(os.environ.get("RVC_PORT", 50051))

# Voice model paths — relative to project root
MODEL_PATH = PROJECT_ROOT / os.environ.get("RVC_MODEL_PATH", "voice_model/chinno-kafuu.pth")
INDEX_PATH = PROJECT_ROOT / os.environ.get("RVC_INDEX_PATH", "voice_model/added_IVF209_Flat_nprobe_1_chinno-kafuu_v2.index")

# RVC parameters
PITCH         = int(os.environ.get("RVC_PITCH", 0))
INDEX_RATE    = float(os.environ.get("RVC_INDEX_RATE", 0.75))
RMS_MIX_RATE  = float(os.environ.get("RVC_RMS_MIX_RATE", 1.0))
PROTECT       = float(os.environ.get("RVC_PROTECT", 0.33))
F0_METHOD     = os.environ.get("RVC_F0_METHOD", "rmvpe")

# edge-tts voice — Nanami for Japanese (Chino's natural language)
# Uses Indonesian voice when text is detected as Indonesian
EDGE_VOICE_JA = "ja-JP-NanamiNeural"
EDGE_VOICE_ID = "ja-JP-NanamiNeural"
# EDGE_VOICE_ID = "id-ID-GadisNeural"

logging.basicConfig(
    level=logging.INFO,
    format="[RVC] %(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("rvc_api")

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="RVC Chino Voice API",
    description="Voice conversion API untuk Kafuu Chino 3D Interaktif",
    version="1.0.0",
)


# ── Global RVC instance (lazy loaded once) ────────────────────────────────────
_vc = None
_vc_loaded = False
_vc_load_error = None


def load_vc():
    """Load RVC VC pipeline. Called once on startup."""
    global _vc, _vc_loaded, _vc_load_error
    try:
        log.info("Memuat RVC Config...")
        # Import here so sys.path is already set
        original_argv = sys.argv[:]
        sys.argv = [sys.argv[0]]
        try:
            from configs.config import Config
            config = Config()
        finally:
            sys.argv = original_argv

        log.info("Memuat VC Module...")
        from infer.vc.modules import VC
        vc = VC(config)

        log.info(f"Memuat model: {MODEL_PATH.name}")
        # VC.get_vc expects model filename; set weight_root to model's parent
        os.environ["weight_root"] = str(MODEL_PATH.parent)
        vc.get_vc(MODEL_PATH.name)

        _vc = vc
        _vc_loaded = True
        log.info(f"✅ Model '{MODEL_PATH.name}' berhasil dimuat!")
        log.info(f"   Index  : {INDEX_PATH.name}")
        log.info(f"   Pitch  : {PITCH} semitones")
        log.info(f"   F0     : {F0_METHOD}")
    except Exception as e:
        _vc_load_error = str(e)
        log.error(f"❌ Gagal memuat model RVC: {e}")
        raise


# ── TTS: edge-tts (online) ────────────────────────────────────────────────────
def detect_language(text: str) -> str:
    """Simple heuristic: if text contains Japanese characters → 'ja', else 'id'."""
    for char in text:
        if "\u3000" <= char <= "\u9fff" or "\u30a0" <= char <= "\u30ff":
            return "ja"
    return "id"


async def tts_edge(text: str, voice: str, output_path: str) -> bool:
    """Generate TTS audio using edge-tts. Returns True on success."""
    try:
        import edge_tts
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_path)
        return True
    except Exception as e:
        log.warning(f"edge-tts gagal ({voice}): {e}")
        return False


def tts_pyttsx3(text: str, output_path: str) -> bool:
    """Offline TTS fallback using pyttsx3. Returns True on success."""
    try:
        import pyttsx3
        engine = pyttsx3.init()
        # Pick a female-sounding voice if available
        voices = engine.getProperty("voices")
        for v in voices:
            if any(kw in v.name.lower() for kw in ("female", "zira", "hazel", "japanese", "nanami")):
                engine.setProperty("voice", v.id)
                break
        engine.setProperty("rate", 160)
        engine.save_to_file(text, output_path)
        engine.runAndWait()
        return Path(output_path).exists() and Path(output_path).stat().st_size > 0
    except Exception as e:
        log.warning(f"pyttsx3 gagal: {e}")
        return False


async def generate_source_audio(text: str, tmp_path: str) -> bool:
    """
    Try edge-tts first (online), fallback to pyttsx3 (offline).
    Returns True if source audio was generated successfully.
    """
    lang = detect_language(text)
    voice = EDGE_VOICE_JA if lang == "ja" else EDGE_VOICE_ID
    log.info(f"TTS source: edge-tts ({voice}) untuk bahasa '{lang}'")

    # Try primary voice
    ok = await tts_edge(text, voice, tmp_path)
    if ok and Path(tmp_path).exists() and Path(tmp_path).stat().st_size > 100:
        return True

    # Try fallback to the other language voice
    other_voice = EDGE_VOICE_ID if lang == "ja" else EDGE_VOICE_JA
    log.info(f"Mencoba fallback voice: {other_voice}")
    ok = await tts_edge(text, other_voice, tmp_path)
    if ok and Path(tmp_path).exists() and Path(tmp_path).stat().st_size > 100:
        return True

    # Offline fallback: pyttsx3
    log.warning("Tidak ada koneksi internet atau edge-tts gagal. Fallback ke pyttsx3 (offline)...")
    ok = tts_pyttsx3(text, tmp_path)
    return ok


# ── RVC conversion ────────────────────────────────────────────────────────────
def convert_voice(input_wav: str, output_wav: str, pitch_override: int | None = None) -> tuple[int, np.ndarray]:
    """
    Run RVC voice conversion on input_wav.
    Returns (sample_rate, audio_array).
    """
    if not _vc_loaded or _vc is None:
        raise RuntimeError("RVC model belum dimuat.")

    pitch = pitch_override if pitch_override is not None else PITCH
    index_path = str(INDEX_PATH) if INDEX_PATH.is_file() else ""

    log.info(f"Konversi suara: pitch={pitch}, index_rate={INDEX_RATE}, f0={F0_METHOD}")

    status, result = _vc.vc_single(
        0,           # speaker_id
        input_wav,   # input audio path
        pitch,       # pitch shift in semitones
        F0_METHOD,   # f0 extraction method
        index_path,  # FAISS index path
        INDEX_RATE,  # index rate
        0,           # resample_sr (0 = no resample)
        RMS_MIX_RATE,
        PROTECT,
    )

    log.info(f"Status RVC: {status}")

    if result is None or result[0] is None or result[1] is None:
        raise RuntimeError(f"RVC konversi gagal: {status}")

    sample_rate, audio = result
    return sample_rate, audio


def audio_to_wav_bytes(sample_rate: int, audio: np.ndarray) -> bytes:
    """Convert numpy audio array to WAV bytes."""
    buf = io.BytesIO()
    sf.write(buf, audio, sample_rate, format="WAV", subtype="PCM_16")
    buf.seek(0)
    return buf.read()


# ── Request / Response models ─────────────────────────────────────────────────
class SynthesizeRequest(BaseModel):
    text: str
    pitch: int | None = None


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok" if _vc_loaded else "loading",
        "model_loaded": _vc_loaded,
        "model": MODEL_PATH.name,
        "index": INDEX_PATH.name if INDEX_PATH.is_file() else "not found",
        "load_error": _vc_load_error,
    }


@app.get("/info")
async def info():
    return {
        "model_path": str(MODEL_PATH),
        "index_path": str(INDEX_PATH),
        "pitch": PITCH,
        "index_rate": INDEX_RATE,
        "f0_method": F0_METHOD,
        "rms_mix_rate": RMS_MIX_RATE,
        "protect": PROTECT,
        "tts_voices": {
            "ja": EDGE_VOICE_JA,
            "id": EDGE_VOICE_ID,
        },
        "model_loaded": _vc_loaded,
    }


@app.post("/synthesize")
async def synthesize(req: SynthesizeRequest):
    """
    Convert text to Chino's voice.
    Pipeline: text → edge-tts (source WAV) → RVC (voice convert) → WAV bytes
    """
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="text tidak boleh kosong")

    if not _vc_loaded:
        if _vc_load_error:
            raise HTTPException(status_code=503, detail=f"Model gagal dimuat: {_vc_load_error}")
        raise HTTPException(status_code=503, detail="Model sedang dimuat, coba lagi sebentar...")

    t_start = time.perf_counter()

    # Use temp files for source & output
    with tempfile.NamedTemporaryFile(suffix="_src.mp3", delete=False) as src_f:
        src_path = src_f.name
    with tempfile.NamedTemporaryFile(suffix="_out.wav", delete=False) as out_f:
        out_path = out_f.name

    try:
        # Step 1: Generate source audio via TTS
        ok = await generate_source_audio(req.text.strip(), src_path)
        if not ok or not Path(src_path).exists() or Path(src_path).stat().st_size < 100:
            raise HTTPException(status_code=502, detail="TTS gagal generate audio sumber")

        t_tts = time.perf_counter()
        log.info(f"TTS selesai dalam {t_tts - t_start:.2f}s")

        # Step 2: RVC voice conversion (blocking — run in thread pool)
        loop = asyncio.get_event_loop()
        sample_rate, audio = await loop.run_in_executor(
            None, convert_voice, src_path, out_path, req.pitch
        )

        t_rvc = time.perf_counter()
        log.info(f"RVC selesai dalam {t_rvc - t_tts:.2f}s | Total: {t_rvc - t_start:.2f}s")

        # Step 3: Encode to WAV bytes
        wav_bytes = audio_to_wav_bytes(sample_rate, audio)
        log.info(f"Output WAV: {len(wav_bytes) / 1024:.1f} KB @ {sample_rate} Hz")

        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "X-Process-Time": f"{t_rvc - t_start:.2f}s",
                "X-Sample-Rate": str(sample_rate),
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Error synthesize: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup temp files
        for p in (src_path, out_path):
            try:
                Path(p).unlink(missing_ok=True)
            except Exception:
                pass


# ── Startup / Shutdown ────────────────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    log.info("=" * 60)
    log.info("  🎙️  RVC Chino Voice API Server")
    log.info(f"  Model : {MODEL_PATH.name}")
    log.info(f"  Index : {INDEX_PATH.name}")
    log.info(f"  Port  : {PORT}")
    log.info("=" * 60)

    if not MODEL_PATH.is_file():
        log.error(f"❌ Model tidak ditemukan: {MODEL_PATH}")
        _vc_load_error = f"Model tidak ditemukan: {MODEL_PATH}"
        return
    if not INDEX_PATH.is_file():
        log.warning(f"⚠️  Index tidak ditemukan: {INDEX_PATH} — akan berjalan tanpa index")

    # Load model in background so server starts fast
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, load_vc)


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "rvc_api_server:app",
        host="0.0.0.0",
        port=PORT,
        log_level="info",
        reload=False,
    )
