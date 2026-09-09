import * as THREE from 'three';

// ── Shorthand ─────────────────────────────────────────────────────────────────
const DEG = THREE.MathUtils.degToRad;

// ── Rest Pose (degrees) ───────────────────────────────────────────────────────
// Baseline arm rotations when idle. Tweak these to change the default stance.
const REST_POSE = {
  lArm:   { x:  10, y:  12, z: -58 },
  rArm:   { x:  10, y: -12, z:  58 },
  lElbow: { x:   0, y:  25, z:  20 },
  rElbow: { x:   0, y: -25, z: -20 },
  lWrist: { x:   0, y:   0, z: -10 },
  rWrist: { x:   0, y:   0, z:  10 },
};

// ── Gesture Durations (seconds) ───────────────────────────────────────────────
const GESTURE_DURATIONS = {
  wave:           3.2,
  present_coffee: 3.5,
  serve:          3.5,
  shy_pose:       3.0,
  blush:          3.0,
  pout_pose:      3.0,
  think:          3.0,
  happy_bounce:   2.2,
  nod:            1.6,
  tilt_head:      2.5,
};

// ── Gesture → Auto-Emotion Map ────────────────────────────────────────────────
const GESTURE_EMOTIONS = {
  wave:           'happy',
  happy_bounce:   'happy',
  shy_pose:       'shy',
  blush:          'shy',
  pout_pose:      'pout',
  present_coffee: 'happy',
  serve:          'happy',
};

// ── Target Arm Poses per Gesture (degrees) ────────────────────────────────────
// Only bones that differ from REST_POSE need to be specified.
// Unspecified bones will keep their rest pose + breathing offset.
const GESTURE_POSES = {

  // Cute shy wave — right hand in front of chest, wrist oscillates gently
  wave: {
    rArm:   { x: -25, y: -10, z:  35 },
    rElbow: { x:   0, y: -10, z: -80 },
    rWrist: { x:   0, y:   0, z:   0 },  // oscillation applied dynamically
  },

  // Holding a tray/cup — both hands forward & level, palms facing up
  present_coffee: {
    lArm:   { x: -40, y:  20, z: -30 },
    rArm:   { x: -40, y: -20, z:  30 },
    lElbow: { x:   0, y:  35, z:  55 },
    rElbow: { x:   0, y: -35, z: -55 },
    lWrist: { x: -20, y: -15, z:  -5 },
    rWrist: { x: -20, y:  15, z:   5 },
  },

  // Hands clasped at chest — bashful, fingers touching
  shy_pose: {
    lArm:   { x: -20, y:  30, z: -25 },
    rArm:   { x: -20, y: -30, z:  25 },
    lElbow: { x:   0, y:  25, z:  85 },
    rElbow: { x:   0, y: -25, z: -85 },
    lWrist: { x:   0, y: -15, z: -20 },
    rWrist: { x:   0, y:  15, z:  20 },
  },

  // Hands on hips — tsundere classic, elbows out
  pout_pose: {
    lArm:   { x:  15, y: -35, z: -35 },
    rArm:   { x:  15, y:  35, z:  35 },
    lElbow: { x:   0, y:  30, z:  95 },
    rElbow: { x:   0, y: -30, z: -95 },
    lWrist: { x:   0, y: -10, z:  -5 },
    rWrist: { x:   0, y:  10, z:   5 },
  },

  // Right hand to chin, left arm supports right elbow
  think: {
    lArm:   { x: -20, y:  25, z: -30 },
    rArm:   { x: -35, y:  15, z:  20 },
    lElbow: { x:   0, y:  30, z:  85 },
    rElbow: { x:   0, y: -30, z: -125 },
    lWrist: { x:   0, y: -10, z:  -5 },
    rWrist: { x:   0, y:   0, z:  25 },
  },

  // "Yay!" — arms raised to shoulder level, slight elbow bend
  happy_bounce: {
    lArm:   { x:  -5, y:  12, z: -80 },
    rArm:   { x:  -5, y: -12, z:  80 },
    lElbow: { x:   0, y:  20, z:  45 },
    rElbow: { x:   0, y: -20, z: -45 },
    lWrist: { x:   0, y:   0, z:  -5 },
    rWrist: { x:   0, y:   0, z:   5 },
  },
};

// Aliases — serve reuses present_coffee, blush reuses shy_pose
GESTURE_POSES.serve = GESTURE_POSES.present_coffee;
GESTURE_POSES.blush = GESTURE_POSES.shy_pose;

// Expose for runtime debugging
window._GESTURE_POSES = GESTURE_POSES;
window._GESTURE_DURATIONS = GESTURE_DURATIONS;


// ── AnimationController Class ─────────────────────────────────────────────────

export class AnimationController {
  constructor(mesh, morphDict, bones) {
    this.mesh = mesh;
    this.morphDict = morphDict || {};
    this.bones = bones || {};

    // Current & Target Morph Influences
    this.currentMorphs = {};
    this.targetMorphs = {};

    // State
    this.isSpeaking = false;
    this.speechVolume = 0;
    this.smoothedSpeechVolume = 0;
    this.currentEmotion = 'neutral';
    this.mousePos = new THREE.Vector2();
    this.lookAtRotation = new THREE.Vector2();
    
    // Action Gestures State
    this.actionState = {
      type: 'idle',
      elapsed: 0,
      duration: 1.0,
      intensity: 1.0
    };

    // Auto-blink state
    this.blinkTimer = 0;
    this.nextBlinkTime = 3.0;
    this.blinkProgress = 0;
    this.isBlinking = false;

    // Find and store all relevant PMX bones
    this.findBones();
    this.setupRestPose();
  }

  findBones() {
    // Body Core
    this.centerBone = this.bones['センター'] || this.bones['center'] || this.bones['root'];
    this.lowerBodyBone = this.bones['下半身'] || this.bones['lower body'];
    this.upperBodyBone = this.bones['上半身'] || this.bones['upper body'];
    this.upperBodyBone2 = this.bones['上半身2'] || this.bones['upper body 2'];
    this.neckBone = this.bones['首'] || this.bones['neck'];
    this.headBone = this.bones['頭'] || this.bones['head'];

    // Left Arm & Hand
    this.leftShoulder = this.bones['左肩'] || this.bones['shoulder_L'];
    this.leftArm = this.bones['左腕'] || this.bones['arm_L'];
    this.leftElbow = this.bones['左ひじ'] || this.bones['elbow_L'];
    this.leftWrist = this.bones['左手首'] || this.bones['wrist_L'];

    // Right Arm & Hand
    this.rightShoulder = this.bones['右肩'] || this.bones['shoulder_R'];
    this.rightArm = this.bones['右腕'] || this.bones['arm_R'];
    this.rightElbow = this.bones['右ひじ'] || this.bones['elbow_R'];
    this.rightWrist = this.bones['右手首'] || this.bones['wrist_R'];

    // Hair & Ribbons for secondary physics/wind motion
    this.hairL = [this.bones['hairside_l_01_wj'], this.bones['hairside_l_02_wj']].filter(Boolean);
    this.hairR = [this.bones['hairside_r_01_wj'], this.bones['hairside_r_02_wj']].filter(Boolean);
    this.hairBack = [this.bones['hairback_c_01_wj'], this.bones['hairback_c_02_wj'], this.bones['hairback_c_03_wj']].filter(Boolean);
    this.ribbons = [this.bones['ribbon_l_01_wj'], this.bones['ribbon_l_02_wj'], this.bones['ribbon_r_01_wj'], this.bones['ribbon_r_02_wj']].filter(Boolean);
    
    // Skirt bones for living cloth sway
    this.skirtBones = [];
    for (let i = 89; i <= 112; i++) {
      const b = this.bones[`lskirt_${String.fromCharCode(97 + Math.floor((i - 89) / 3))}_0${(i - 89) % 3 + 1}_wj`];
      if (b) this.skirtBones.push(b);
    }

    console.log('[AnimationController] Bones linked successfully. Ready for rich procedural full-body animation.');
  }

  setupRestPose() {
    // Apply initial rest pose from config
    const boneMap = {
      lArm:   this.leftArm,
      rArm:   this.rightArm,
      lElbow: this.leftElbow,
      rElbow: this.rightElbow,
      lWrist: this.leftWrist,
      rWrist: this.rightWrist,
    };

    for (const [key, bone] of Object.entries(boneMap)) {
      if (bone && REST_POSE[key]) {
        const p = REST_POSE[key];
        bone.rotation.set(DEG(p.x), DEG(p.y), DEG(p.z));
      }
    }
  }

  /**
   * Set target emotion with rich morph target blending
   */
  setEmotion(emotion) {
    this.currentEmotion = emotion;
    console.log(`[AnimationController] Set Emotion: ${emotion}`);

    // Reset all emotion morphs to 0
    const allMorphKeys = [
      'smile', 'cheerful', 'wink', 'wink_r', 'stare', 'surprise', 
      'troubled', 'anger', 'mouth_smile', 'mouth_frown', 'serious', 'grin'
    ];
    allMorphKeys.forEach(k => this.setMorphTarget(k, 0));

    switch (emotion) {
      case 'happy':
        this.setMorphTarget('cheerful', 0.85);
        this.setMorphTarget('smile', 0.8);
        this.setMorphTarget('mouth_smile', 1.0);
        break;

      case 'shy':
        this.setMorphTarget('troubled', 0.95);
        this.setMorphTarget('wink', 0.7);
        this.setMorphTarget('mouth_smile', 0.65);
        this.setMorphTarget('cheerful', 0.3);
        break;

      case 'pout':
        this.setMorphTarget('anger', 0.9);
        this.setMorphTarget('stare', 0.85);
        this.setMorphTarget('mouth_frown', 1.0);
        this.setMorphTarget('vowel_u', 0.35);
        break;

      case 'surprised':
        this.setMorphTarget('surprise', 1.0);
        this.setMorphTarget('troubled', 0.6);
        this.setMorphTarget('vowel_o', 0.5);
        break;

      case 'neutral':
      default:
        this.setMorphTarget('mouth_smile', 0.15); // gentle resting smile
        break;
    }
  }

  /**
   * Trigger gesture action — durations & emotions pulled from config
   */
  triggerAction(action) {
    console.log(`[AnimationController] Trigger Gesture Action: ${action}`, {
      hasPose: !!GESTURE_POSES[action],
      poseKeys: GESTURE_POSES[action] ? Object.keys(GESTURE_POSES[action]) : 'none',
      duration: GESTURE_DURATIONS[action] || 2.0,
    });

    this.actionState = {
      type: action,
      elapsed: 0,
      duration: GESTURE_DURATIONS[action] || 2.0,
      intensity: 1.0
    };

    // Auto synchronize emotion if mapped
    const emotion = GESTURE_EMOTIONS[action];
    if (emotion) {
      this.setEmotion(emotion);
    }
  }

  /**
   * Set speaking state for Lip-Sync
   */
  setSpeaking(speaking, volume = 0.6) {
    this.isSpeaking = speaking;
    this.speechVolume = THREE.MathUtils.clamp(volume, 0, 1);
    if (!speaking) {
      this.speechVolume = 0;
      this.setMorphTarget('vowel_a', 0);
      this.setMorphTarget('vowel_i', 0);
      this.setMorphTarget('vowel_u', 0);
      this.setMorphTarget('vowel_e', 0);
      this.setMorphTarget('vowel_o', 0);
    }
  }

  setMousePosition(x, y) {
    this.mousePos.set(
      THREE.MathUtils.clamp(x, -1, 1),
      THREE.MathUtils.clamp(y, -1, 1)
    );
  }

  setMorphTarget(name, targetValue) {
    this.targetMorphs[name] = targetValue;
    if (this.currentMorphs[name] === undefined) {
      this.currentMorphs[name] = 0;
    }
  }

  /**
   * Main animation tick called on every render frame
   */
  update(delta, time) {
    this.updateAutoBlink(delta);
    this.updateLipSync(delta, time);
    this.updateMorphTransitions(delta);
    this.updateFullBodyAnimation(delta, time);
  }

  /**
   * Natural Eye Blinking
   */
  updateAutoBlink(delta) {
    this.blinkTimer += delta;

    if (!this.isBlinking && this.blinkTimer >= this.nextBlinkTime) {
      this.isBlinking = true;
      this.blinkProgress = 0;
      this.blinkTimer = 0;
      this.nextBlinkTime = 2.5 + Math.random() * 3.5;
    }

    if (this.isBlinking) {
      this.blinkProgress += delta * 7.5;
      let blinkWeight = 0;

      if (this.blinkProgress < 0.5) {
        blinkWeight = this.blinkProgress * 2;
      } else if (this.blinkProgress <= 1.0) {
        blinkWeight = (1.0 - this.blinkProgress) * 2;
      } else {
        this.isBlinking = false;
        blinkWeight = 0;
      }

      this.applyDirectMorph('blink', Math.min(1.0, blinkWeight));
    }
  }

  /**
   * Dynamic Lip Sync (Phonetic mouth flapping)
   */
  updateLipSync(delta, time) {
    const volumeSmoothing = 1 - Math.exp(-12 * delta);
    this.smoothedSpeechVolume = THREE.MathUtils.lerp(
      this.smoothedSpeechVolume,
      this.speechVolume,
      volumeSmoothing
    );

    if (this.isSpeaking) {
      const flap1 = Math.sin(time * 16) * 0.5 + 0.5;
      const flap2 = Math.sin(time * 26 + 1.4) * 0.3;
      const audioAmount = this.smoothedSpeechVolume > 0.02 ? this.smoothedSpeechVolume : 0.7;
      const openAmount = THREE.MathUtils.clamp((flap1 + flap2) * audioAmount, 0, 1);

      this.applyDirectMorph('vowel_a', openAmount * 0.85);
      this.applyDirectMorph('vowel_e', openAmount * 0.35);
      this.applyDirectMorph('vowel_o', (1.0 - openAmount) * openAmount * 0.5);
    }
  }

  /**
   * Smooth Lerp morph transitions
   */
  updateMorphTransitions(delta) {
    const frameProgress = THREE.MathUtils.clamp(delta * 10.0, 0, 1);
    const lerpSpeed = this.easeInOutCubic(frameProgress);

    for (const [name, target] of Object.entries(this.targetMorphs)) {
      const current = this.currentMorphs[name] || 0;
      const next = THREE.MathUtils.lerp(current, target, lerpSpeed);
      this.currentMorphs[name] = next;

      if (name !== 'blink' && !name.startsWith('vowel_')) {
        this.applyDirectMorph(name, next);
      }

    }
  }

  easeInOutCubic(value) {
    return value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2;
  }

  applyDirectMorph(aliasName, weight) {
    const entry = this.morphDict[aliasName];
    if (entry && entry.mesh && entry.mesh.morphTargetInfluences) {
      entry.mesh.morphTargetInfluences[entry.index] = weight;
    }
  }

  /**
   * Lerp a bone's XYZ rotations toward a target pose (degrees → radians).
   * Returns { x, y, z } in radians. If targetDeg is null/undefined,
   * the current values are returned unchanged.
   */
  _lerpPose(currentX, currentY, currentZ, targetDeg, weight) {
    if (!targetDeg) return { x: currentX, y: currentY, z: currentZ };
    return {
      x: THREE.MathUtils.lerp(currentX, DEG(targetDeg.x), weight),
      y: THREE.MathUtils.lerp(currentY, DEG(targetDeg.y), weight),
      z: THREE.MathUtils.lerp(currentZ, DEG(targetDeg.z), weight),
    };
  }

  /**
   * Procedural Full-Body Gesture & Motion Engine
   */
  updateFullBodyAnimation(delta, time) {
    this.actionState.elapsed = Math.min(
      this.actionState.duration,
      this.actionState.elapsed + delta
    );
    const elapsedAction = this.actionState.elapsed;
    const actionActive = elapsedAction < this.actionState.duration;
    
    // Normalized progress (0.0 to 1.0) with smooth ease in/out curve
    const progress = actionActive ? elapsedAction / this.actionState.duration : 1.0;
    // Bell curve for action envelope (0 → 1 → 0)
    const curve = actionActive ? Math.sin(this.easeInOutCubic(progress) * Math.PI) : 0;

    const actionType = actionActive ? this.actionState.type : 'idle';

    // ─── 1. BASE IDLE: BREATHING & MICRO-SWAY ────────────────────────
    const breatheSine = Math.sin(time * 2.2);
    const breatheCos = Math.cos(time * 1.8);
    const breathArm = breatheSine * 0.025;
    const microSway = Math.sin(time * 1.37) * 0.008 + Math.sin(time * 2.83 + 1.7) * 0.004;
    const microRoll = Math.cos(time * 1.11 + 0.4) * 0.006;

    // Center / Pelvis
    if (this.centerBone) {
      let bounceY = breatheSine * 0.02;
      if (actionType === 'happy_bounce') {
        bounceY += Math.abs(Math.sin(progress * Math.PI * 4)) * 0.45 * curve;
      }
      this.centerBone.position.y = bounceY;
    }

    if (this.lowerBodyBone) {
      this.lowerBodyBone.rotation.y = Math.sin(time * 0.9) * 0.015;
      this.lowerBodyBone.rotation.z = Math.cos(time * 0.7) * 0.01;
    }

    // Spine & Chest
    if (this.upperBodyBone) {
      let bowPitch = breatheSine * 0.015;
      if (actionType === 'present_coffee' || actionType === 'serve') {
        bowPitch += 0.16 * curve; // Bow forward respectfully
      } else if (actionType === 'nod') {
        bowPitch += Math.sin(progress * Math.PI * 3) * 0.09 * curve;
      }
      this.upperBodyBone.rotation.x = bowPitch;
      this.upperBodyBone.rotation.y = Math.sin(time * 1.1) * 0.012;
    }

    if (this.upperBodyBone2) {
      let chestX = breatheSine * 0.018;
      if (actionType === 'pout_pose') {
        chestX -= 0.1 * curve; // Puff chest out
      }
      this.upperBodyBone2.rotation.x = chestX;
    }

    // ─── 2. HEAD & NECK PROCEDURAL GESTURES ──────────────────────────
    if (this.headBone) {
      let headPitch = breatheCos * 0.015;
      let headYaw = Math.sin(time * 1.0) * 0.025;
      let headRoll = Math.sin(time * 0.8) * 0.018;

      switch (actionType) {
        case 'nod':
          headPitch += Math.sin(progress * Math.PI * 4) * 0.18 * curve;
          break;
        case 'wave':
          headRoll -= 0.12 * curve; // Tilt head while waving
          headPitch -= 0.05 * curve;
          break;
        case 'tilt_head':
        case 'think':
          headRoll += 0.22 * curve; // Inquisitive tilt
          headYaw -= 0.1 * curve;
          break;
        case 'shy_pose':
        case 'blush':
          headPitch += 0.1 * curve;  // Look down bashfully
          headRoll -= 0.12 * curve;
          headYaw += 0.08 * curve;
          break;
        case 'pout_pose':
          headYaw -= 0.28 * curve;  // Turn head away
          headRoll += 0.1 * curve;
          headPitch += 0.05 * curve;
          break;
        case 'present_coffee':
        case 'serve':
          headPitch += 0.08 * curve;
          break;
      }

      headPitch += microSway;
      headRoll += microRoll;
      this.updateLookAt(delta, headPitch, headYaw, headRoll);
    }

    if (this.neckBone) {
      this.neckBone.rotation.x = this.lookAtRotation.x * 0.35 + microSway * 0.5;
      this.neckBone.rotation.y = this.lookAtRotation.y * 0.35;
      this.neckBone.rotation.z = microRoll * 0.35;
    }

    // ─── 3. ARMS & HANDS — DATA-DRIVEN GESTURE ENGINE ───────────────
    // Start with rest pose + breathing offset
    let lArmX   = DEG(REST_POSE.lArm.x);
    let lArmY   = DEG(REST_POSE.lArm.y);
    let lArmZ   = DEG(REST_POSE.lArm.z) + breathArm;

    let rArmX   = DEG(REST_POSE.rArm.x);
    let rArmY   = DEG(REST_POSE.rArm.y);
    let rArmZ   = DEG(REST_POSE.rArm.z) - breathArm;

    let lElbowX = DEG(REST_POSE.lElbow.x);
    let lElbowY = DEG(REST_POSE.lElbow.y);
    let lElbowZ = DEG(REST_POSE.lElbow.z);

    let rElbowX = DEG(REST_POSE.rElbow.x);
    let rElbowY = DEG(REST_POSE.rElbow.y);
    let rElbowZ = DEG(REST_POSE.rElbow.z);

    let lWristX = DEG(REST_POSE.lWrist.x);
    let lWristY = DEG(REST_POSE.lWrist.y);
    let lWristZ = DEG(REST_POSE.lWrist.z);

    let rWristX = DEG(REST_POSE.rWrist.x);
    let rWristY = DEG(REST_POSE.rWrist.y);
    let rWristZ = DEG(REST_POSE.rWrist.z);

    // Look up gesture pose from config and apply via lerp
    const pose = GESTURE_POSES[actionType];
    if (pose && curve > 0) {
      if (!this._debuggedPose || this._debuggedPose !== actionType) {
        this._debuggedPose = actionType;
        console.log(`[AnimationController] Applying pose '${actionType}' curve=${curve.toFixed(3)}`, JSON.stringify(pose));
      }
      let r;

      r = this._lerpPose(lArmX, lArmY, lArmZ, pose.lArm, curve);
      lArmX = r.x; lArmY = r.y; lArmZ = r.z;

      r = this._lerpPose(rArmX, rArmY, rArmZ, pose.rArm, curve);
      rArmX = r.x; rArmY = r.y; rArmZ = r.z;

      r = this._lerpPose(lElbowX, lElbowY, lElbowZ, pose.lElbow, curve);
      lElbowX = r.x; lElbowY = r.y; lElbowZ = r.z;

      r = this._lerpPose(rElbowX, rElbowY, rElbowZ, pose.rElbow, curve);
      rElbowX = r.x; rElbowY = r.y; rElbowZ = r.z;

      r = this._lerpPose(lWristX, lWristY, lWristZ, pose.lWrist, curve);
      lWristX = r.x; lWristY = r.y; lWristZ = r.z;

      r = this._lerpPose(rWristX, rWristY, rWristZ, pose.rWrist, curve);
      rWristX = r.x; rWristY = r.y; rWristZ = r.z;

      // ── Dynamic overlays for gestures with oscillation ──
      if (actionType === 'wave') {
        // Cute small wrist oscillation (shy/malu wave)
        rWristZ += Math.sin(time * 8) * DEG(12) * curve;
      }
    }

    // Apply shoulder micro-motion
    if (this.leftShoulder) {
      this.leftShoulder.rotation.x = microSway * 0.7;
      this.leftShoulder.rotation.z = -microRoll;
    }
    if (this.rightShoulder) {
      this.rightShoulder.rotation.x = microSway * 0.7;
      this.rightShoulder.rotation.z = microRoll;
    }

    // Apply final arm transforms
    if (this.leftArm)    this.leftArm.rotation.set(lArmX, lArmY, lArmZ);
    if (this.rightArm)   this.rightArm.rotation.set(rArmX, rArmY, rArmZ);
    if (this.leftElbow)  this.leftElbow.rotation.set(lElbowX, lElbowY, lElbowZ);
    if (this.rightElbow) this.rightElbow.rotation.set(rElbowX, rElbowY, rElbowZ);
    if (this.leftWrist)  this.leftWrist.rotation.set(lWristX, lWristY, lWristZ);
    if (this.rightWrist) this.rightWrist.rotation.set(rWristX, rWristY, rWristZ);

    // ─── 4. SECONDARY PROCEDURAL PHYSICS: HAIR, RIBBONS & SKIRT ─────
    const wind1 = Math.sin(time * 3.0) * 0.04;
    const wind2 = Math.cos(time * 2.5) * 0.035;

    this.hairL.forEach((b, i) => {
      b.rotation.z = -wind1 * (i + 1);
      b.rotation.x = wind2 * 0.5;
    });

    this.hairR.forEach((b, i) => {
      b.rotation.z = wind1 * (i + 1);
      b.rotation.x = wind2 * 0.5;
    });

    this.ribbons.forEach((b, i) => {
      b.rotation.z = (i % 2 === 0 ? -1 : 1) * wind2 * 1.2;
      b.rotation.x = wind1 * 0.8;
    });

    this.skirtBones.forEach((b, i) => {
      const phase = (i * 0.25) + time * 2.0;
      b.rotation.x = Math.sin(phase) * 0.015;
      b.rotation.z = Math.cos(phase) * 0.012;
    });
  }

  updateLookAt(delta, basePitch, baseYaw, baseRoll) {
    // Screen Y grows downward. Keep that convention so moving the pointer
    // upward makes the character look upward instead of downward.
    const targetPitch = THREE.MathUtils.clamp(this.mousePos.y * 0.2, -0.2, 0.2);
    const targetYaw = THREE.MathUtils.clamp(this.mousePos.x * 0.3, -0.4, 0.4);
    const smoothing = 1 - Math.exp(-7 * delta);

    this.lookAtRotation.x = THREE.MathUtils.lerp(this.lookAtRotation.x, targetPitch, smoothing);
    this.lookAtRotation.y = THREE.MathUtils.lerp(this.lookAtRotation.y, targetYaw, smoothing);

    this.headBone.rotation.x = basePitch + this.lookAtRotation.x;
    this.headBone.rotation.y = baseYaw + this.lookAtRotation.y;
    this.headBone.rotation.z = baseRoll;
  }
}
