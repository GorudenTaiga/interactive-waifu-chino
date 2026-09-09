import { io } from 'socket.io-client';
import { SceneManager } from './3d/sceneManager.js';
import { ChinoLoader } from './3d/chinoLoader.js';
import { AnimationController } from './3d/animationController.js';
import { SpeechManager } from './audio/speechManager.js';
import { ChatUI } from './ui/chatUI.js';

class ChinoApp {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.sceneManager = null;
    this.chinoLoader = null;
    this.animationController = null;
    this.speechManager = null;
    this.chatUI = null;
    this.socket = null;

    this.init();
  }

  async init() {
    console.log('[App] Inisialisasi Kafuu Chino 3D Platform...');

    // 1. UI & Audio Managers
    this.chatUI = new ChatUI();
    this.speechManager = new SpeechManager();

    // 2. Three.js Scene Setup
    this.sceneManager = new SceneManager(this.canvas);
    this.chinoLoader = new ChinoLoader();

    // 3. Socket.io Client
    this.initSocket();

    // 4. Bind Events & Callbacks
    this.bindEvents();

    // 5. Load 3D Model
    try {
      const { mesh, morphDict, bones } = await this.chinoLoader.load(
        '/model/Chino MMD mine/Chino.pmx',
        (percent) => this.chatUI.updateLoadingProgress(percent)
      );

      this.sceneManager.add(mesh);
      this.animationController = new AnimationController(mesh, morphDict, bones);

      // Register Animation Tick
      this.sceneManager.onUpdate((delta, time) => {
        if (this.animationController) {
          this.animationController.update(delta, time);
        }
      });

      // Sembunyikan Loading Screen
      this.chatUI.hideLoading();
      this.sceneManager.start();

      // Debug exposure
      window.__animController = this.animationController;
      window.__chinoLoader = this.chinoLoader;

      console.log('[App] Aplikasi siap dijalankan!');
      console.log('[App] Bones tersedia:', Object.keys(bones).length);
      console.log('[App] Morphs tersedia:', Object.keys(morphDict));
      console.log('[App] Arm bones:', {
        leftArm: !!this.animationController.leftArm,
        rightArm: !!this.animationController.rightArm,
        leftElbow: !!this.animationController.leftElbow,
        rightElbow: !!this.animationController.rightElbow,
        head: !!this.animationController.headBone,
        upper: !!this.animationController.upperBodyBone
      });
    } catch (err) {
      console.error('[App] Error memuat model 3D:', err);
      alert('Gagal memuat model 3D Chino. Pastikan file Chino.pmx tersedia.');
      this.chatUI.hideLoading();
    }
  }

  initSocket() {
    this.socket = io({
      reconnection: true,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Terhubung ke backend server!');
    });

    this.socket.on('chino_response', (data) => {
      console.log('[Socket] Menerima respon Chino:', data);
      this.handleChinoResponse(data);
    });

    this.socket.on('chino_typing', ({ isTyping }) => {
      if (isTyping) {
        this.chatUI.updateMoodBadge('neutral');
        if (this.animationController) {
          this.animationController.triggerAction('tilt_head');
        }
      }
    });

    this.socket.on('disconnect', () => {
      console.warn('[Socket] Terputus dari server.');
    });
  }

  bindEvents() {
    window.addEventListener('pointermove', (event) => {
      if (!this.animationController) return;

      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      this.animationController.setMousePosition(x, y);
    });

    // 1. Kirim pesan dari UI Chat
    this.chatUI.onSendMessage = (text) => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('user_message', { message: text });
      } else {
        console.warn('[App] Socket belum terhubung, mengirim via HTTP fallback...');
        this.sendHttpFallback(text);
      }
    };

    // 2. Mic STT Speech Result
    this.speechManager.onSpeechResult = (transcript) => {
      if (this.chatUI.chatInput) {
        this.chatUI.chatInput.value = transcript;
      }
      this.chatUI.onSendMessage(transcript);
    };

    // 3. Mic Listening State
    this.speechManager.onListeningChange = (isListening) => {
      this.chatUI.setMicListening(isListening);
    };

    // 4. Toggle Sound
    this.chatUI.onToggleSound = () => {
      return this.speechManager.toggleTts();
    };

    // 5. Toggle Mic
    this.chatUI.onToggleMic = () => {
      this.speechManager.toggleListening();
    };

    // 6. Reset History
    this.chatUI.onResetChat = () => {
      if (this.socket) {
        this.socket.emit('reset_history');
      }
      this.speechManager.stopSpeaking();
      this.chatUI.displayResponse({
        text: "Ingatan percakapan telah dibersihkan, Taiga-san. Mari mulai obrolan baru!",
        emotion: "happy",
        action: "nod",
        provider: "System"
      });
    };

    // 7. TTS & Lip Sync Synchronization
    this.speechManager.onSpeechStart = () => {
      this.chatUI.setSpeakingVisual(true);
      if (this.animationController) {
        this.animationController.setSpeaking(true, 0.7);
      }
    };

    this.speechManager.onSpeechEnd = () => {
      this.chatUI.setSpeakingVisual(false);
      if (this.animationController) {
        this.animationController.setSpeaking(false);
      }
    };

    this.speechManager.onAudioVolumeUpdate = (volume) => {
      if (this.animationController) {
        this.animationController.setSpeaking(true, volume);
      }
    };
  }

  handleChinoResponse(data) {
    const { text, emotion, action, audioUrl, provider } = data;

    // 1. Update UI Text
    this.chatUI.displayResponse({ text, emotion, provider });

    // 2. Update 3D Facial Expression
    if (this.animationController) {
      if (emotion) this.animationController.setEmotion(emotion);
      if (action) this.animationController.triggerAction(action);
    }

    // 3. Speak Voice (TTS / Custom Model)
    this.speechManager.speak(text, audioUrl);
  }

  async sendHttpFallback(text) {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      this.handleChinoResponse(data);
    } catch (err) {
      console.error('[App] HTTP Fallback Error:', err);
    }
  }
}

// Inisialisasi saat DOM siap
window.addEventListener('DOMContentLoaded', () => {
  new ChinoApp();
});
