export class ChatUI {
  constructor() {
    this.initElements();
    this.initEventListeners();
    this.typewriterTimer = null;
  }

  initElements() {
    // Dialogue Elements
    this.dialogueText = document.getElementById('dialogue-text');
    this.moodBadge = document.getElementById('mood-badge');
    this.providerBadge = document.getElementById('provider-badge');
    this.voiceWave = document.getElementById('voice-wave');

    // Input Elements
    this.chatForm = document.getElementById('chat-form');
    this.chatInput = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('send-btn');
    this.micBtn = document.getElementById('mic-btn');
    this.soundToggleBtn = document.getElementById('sound-toggle-btn');
    this.resetBtn = document.getElementById('reset-btn');
    this.settingsBtn = document.getElementById('settings-btn');

    // Quick Prompts
    this.quickChips = document.querySelectorAll('.quick-chip');

    // Modal Elements
    this.settingsModal = document.getElementById('settings-modal');
    this.closeModalBtn = document.getElementById('close-modal-btn');
    this.saveSettingsBtn = document.getElementById('save-settings-btn');
    this.apiKeyInput = document.getElementById('setting-api-key');
    this.providerSelect = document.getElementById('setting-provider');
    this.customTtsEndpoint = document.getElementById('setting-tts-endpoint');

    // Loading Screen
    this.loadingScreen = document.getElementById('loading-screen');
    this.loadingProgress = document.getElementById('loading-progress');
  }

  initEventListeners() {
    // Submit Chat
    if (this.chatForm) {
      this.chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = this.chatInput.value.trim();
        if (text && this.onSendMessage) {
          this.onSendMessage(text);
          this.chatInput.value = '';
        }
      });
    }

    // Quick Chips
    this.quickChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        if (prompt && this.onSendMessage) {
          this.onSendMessage(prompt);
        }
      });
    });

    // Mic Toggle
    if (this.micBtn) {
      this.micBtn.addEventListener('click', () => {
        if (this.onToggleMic) this.onToggleMic();
      });
    }

    // Sound Toggle
    if (this.soundToggleBtn) {
      this.soundToggleBtn.addEventListener('click', () => {
        if (this.onToggleSound) {
          const isEnabled = this.onToggleSound();
          this.updateSoundState(isEnabled);
        }
      });
    }

    // Reset Chat
    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => {
        if (confirm('Reset ingatan percakapan Chino?')) {
          if (this.onResetChat) this.onResetChat();
        }
      });
    }

    // Settings Modal
    if (this.settingsBtn) {
      this.settingsBtn.addEventListener('click', () => {
        this.openSettingsModal();
      });
    }

    if (this.closeModalBtn) {
      this.closeModalBtn.addEventListener('click', () => {
        this.closeSettingsModal();
      });
    }

    if (this.saveSettingsBtn) {
      this.saveSettingsBtn.addEventListener('click', () => {
        this.closeSettingsModal();
      });
    }
  }

  /**
   * Tampilkan respons Chino dengan typewriter effect
   */
  displayResponse(data) {
    const { text, emotion = 'neutral', provider = '' } = data;

    // Update Mood Badge
    this.updateMoodBadge(emotion);

    // Update Provider
    if (this.providerBadge && provider) {
      this.providerBadge.textContent = `Brain: ${provider}`;
    }

    // Typewriter effect
    if (this.typewriterTimer) clearInterval(this.typewriterTimer);
    
    if (this.dialogueText) {
      this.dialogueText.textContent = '';
      let index = 0;
      this.typewriterTimer = setInterval(() => {
        if (index < text.length) {
          this.dialogueText.textContent += text.charAt(index);
          index++;
        } else {
          clearInterval(this.typewriterTimer);
        }
      }, 25);
    }
  }

  updateMoodBadge(emotion) {
    if (!this.moodBadge) return;

    const moodMap = {
      happy: { icon: '😊', label: 'Senang' },
      shy: { icon: '😳', label: 'Malu' },
      pout: { icon: '😤', label: 'Ngambek' },
      surprised: { icon: '😮', label: 'Kaget' },
      neutral: { icon: '☕', label: 'Santai' }
    };

    const mood = moodMap[emotion] || moodMap.neutral;
    this.moodBadge.innerHTML = `<span>${mood.icon}</span> <span>${mood.label}</span>`;
  }

  setSpeakingVisual(isSpeaking) {
    if (this.voiceWave) {
      if (isSpeaking) {
        this.voiceWave.classList.add('speaking');
      } else {
        this.voiceWave.classList.remove('speaking');
      }
    }
  }

  setMicListening(isListening) {
    if (this.micBtn) {
      if (isListening) {
        this.micBtn.classList.add('listening');
      } else {
        this.micBtn.classList.remove('listening');
      }
    }
  }

  updateSoundState(isEnabled) {
    if (this.soundToggleBtn) {
      if (isEnabled) {
        this.soundToggleBtn.classList.add('active');
        this.soundToggleBtn.innerHTML = '🔊';
        this.soundToggleBtn.title = 'Suara Aktif';
      } else {
        this.soundToggleBtn.classList.remove('active');
        this.soundToggleBtn.innerHTML = '🔇';
        this.soundToggleBtn.title = 'Suara Dimatikan';
      }
    }
  }

  hideLoading() {
    if (this.loadingScreen) {
      this.loadingScreen.classList.add('hidden');
    }
  }

  updateLoadingProgress(percent) {
    if (this.loadingProgress) {
      this.loadingProgress.textContent = `Memuat Chino... ${Math.round(percent)}%`;
    }
  }

  openSettingsModal() {
    if (this.settingsModal) this.settingsModal.classList.add('active');
  }

  closeSettingsModal() {
    if (this.settingsModal) this.settingsModal.classList.remove('active');
  }
}
