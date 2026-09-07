/**
 * SpeechManager - Mengelola Text-to-Speech (TTS), Custom Voice Model Audio Stream, & Speech Recognition (STT)
 */
export class SpeechManager {
  constructor() {
    // Default TTS langsung aktif sesuai permintaan user
    this.isTtsEnabled = true;
    this.isListening = false;
    this.selectedVoice = null;

    // Callbacks
    this.onSpeechStart = null;
    this.onSpeechEnd = null;
    this.onAudioVolumeUpdate = null;
    this.onSpeechResult = null;
    this.onListeningChange = null;

    // Web Audio API untuk Custom Voice Model & Lip Sync Analysis
    this.audioContext = null;
    this.analyser = null;
    this.audioElement = new Audio();
    this.audioSource = null;

    this.initSpeechSynthesis();
    this.initSpeechRecognition();
    this.initAudioContext();
  }

  initAudioContext() {
    // Audio context diaktifkan / di-resume pada gesture pertama user
    const unlockAudio = () => {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.audioContext = new AudioCtx();
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 256;
          
          try {
            this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
            this.audioSource.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
          } catch (e) {
            console.warn('[SpeechManager] MediaElementSource connect error:', e);
          }
        }
      } else if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };

    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);
  }

  initSpeechSynthesis() {
    if (!('speechSynthesis' in window)) {
      console.warn('[SpeechManager] Web Speech Synthesis tidak didukung di browser ini.');
      return;
    }

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      // Prioritaskan suara wanita Jepang (ja-JP) untuk nuansa otentik Chino
      this.selectedVoice = voices.find(v => v.lang.includes('ja') || v.name.includes('Japanese') || v.name.includes('Nanami') || v.name.includes('Kyoko') || v.name.includes('Ayumi')) ||
                           voices.find(v => v.lang.includes('id') && v.name.toLowerCase().includes('gadis')) ||
                           voices.find(v => v.lang.includes('id')) ||
                           voices[0];
      console.log('[SpeechManager] Suara TTS terpilih:', this.selectedVoice?.name, this.selectedVoice?.lang);
    };

    loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[SpeechManager] Web Speech Recognition tidak didukung di browser ini.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'id-ID'; // Default Bahasa Indonesia

    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onListeningChange) this.onListeningChange(true);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onListeningChange) this.onListeningChange(false);
    };

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      console.log('[SpeechManager] Transkrip suara:', transcript);
      if (this.onSpeechResult) this.onSpeechResult(transcript);
    };

    this.recognition.onerror = (event) => {
      console.error('[SpeechManager] Speech recognition error:', event.error);
      this.isListening = false;
      if (this.onListeningChange) this.onListeningChange(false);
    };
  }

  toggleListening() {
    if (!this.recognition) return;

    if (this.isListening) {
      this.recognition.stop();
    } else {
      // Hentikan TTS jika sedang bicara
      this.stopSpeaking();
      try {
        this.recognition.start();
      } catch (e) {
        console.warn('[SpeechManager] Recognition start error:', e);
      }
    }
  }

  toggleTts() {
    this.isTtsEnabled = !this.isTtsEnabled;
    if (!this.isTtsEnabled) {
      this.stopSpeaking();
    }
    return this.isTtsEnabled;
  }

  /**
   * Main Speak function: Memutar audio kustom atau Web Speech API
   */
  speak(text, customAudioUrl = null) {
    if (!this.isTtsEnabled) return;

    this.stopSpeaking();

    // 1. Jika ada Custom Voice Model Audio dari Backend
    if (customAudioUrl) {
      this.playCustomAudio(customAudioUrl);
      return;
    }

    // 2. Fallback: Browser Web Speech Synthesis
    if ('speechSynthesis' in window && text) {
      // Bersihkan emotikon / markdown sebelum dibaca
      const cleanText = text.replace(/[\(\/\\\*\_~#]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(cleanText);

      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      
      // Pitch sedikit lebih tinggi & rate tenang khas karakter Chino
      utterance.pitch = 1.25;
      utterance.rate = 1.0;

      utterance.onstart = () => {
        if (this.onSpeechStart) this.onSpeechStart();
      };

      utterance.onend = () => {
        if (this.onSpeechEnd) this.onSpeechEnd();
      };

      utterance.onerror = (e) => {
        console.warn('[SpeechManager] TTS Error:', e);
        if (this.onSpeechEnd) this.onSpeechEnd();
      };

      window.speechSynthesis.speak(utterance);
    }
  }

  /**
   * Putar audio dari Custom Voice Model dengan visualizer lip-sync analyser
   */
  playCustomAudio(audioUrl) {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.audioElement.src = audioUrl;
    
    this.audioElement.onplay = () => {
      if (this.onSpeechStart) this.onSpeechStart();
      this.startAudioAnalyserLoop();
    };

    this.audioElement.onended = () => {
      if (this.onSpeechEnd) this.onSpeechEnd();
    };

    this.audioElement.onerror = (e) => {
      console.warn('[SpeechManager] Custom Audio Error:', e);
      if (this.onSpeechEnd) this.onSpeechEnd();
    };

    this.audioElement.play().catch(err => {
      console.warn('[SpeechManager] Autoplay dicegah browser:', err);
    });
  }

  startAudioAnalyserLoop() {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    const analyze = () => {
      if (this.audioElement.paused || this.audioElement.ended) return;

      this.analyser.getByteFrequencyData(dataArray);

      // Hitung rata-rata volume suara
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const averageVolume = (sum / dataArray.length) / 255;

      if (this.onAudioVolumeUpdate) {
        this.onAudioVolumeUpdate(averageVolume);
      }

      requestAnimationFrame(analyze);
    };

    analyze();
  }

  stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    if (this.onSpeechEnd) {
      this.onSpeechEnd();
    }
  }
}
