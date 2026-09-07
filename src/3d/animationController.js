import * as THREE from 'three';

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
    this.currentEmotion = 'neutral';
    
    // Action Gestures State
    this.actionState = {
      type: 'idle',
      startTime: 0,
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
    // Initial cute resting pose
    if (this.leftArm) {
      this.leftArm.rotation.set(THREE.MathUtils.degToRad(10), THREE.MathUtils.degToRad(12), -THREE.MathUtils.degToRad(58));
    }
    if (this.rightArm) {
      this.rightArm.rotation.set(THREE.MathUtils.degToRad(10), -THREE.MathUtils.degToRad(12), THREE.MathUtils.degToRad(58));
    }
    if (this.leftElbow) {
      this.leftElbow.rotation.set(0, THREE.MathUtils.degToRad(25), THREE.MathUtils.degToRad(20));
    }
    if (this.rightElbow) {
      this.rightElbow.rotation.set(0, -THREE.MathUtils.degToRad(25), -THREE.MathUtils.degToRad(20));
    }
    if (this.leftWrist) {
      this.leftWrist.rotation.set(0, 0, -THREE.MathUtils.degToRad(10));
    }
    if (this.rightWrist) {
      this.rightWrist.rotation.set(0, 0, THREE.MathUtils.degToRad(10));
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
   * Trigger rich action gesture with dynamic durations
   */
  triggerAction(action) {
    console.log(`[AnimationController] Trigger Gesture Action: ${action}`);

    let duration = 2.0;
    if (action === 'wave') duration = 3.2;
    if (action === 'present_coffee' || action === 'serve') duration = 3.5;
    if (action === 'shy_pose' || action === 'blush') duration = 3.0;
    if (action === 'pout_pose') duration = 3.0;
    if (action === 'think') duration = 3.0;
    if (action === 'happy_bounce') duration = 2.2;
    if (action === 'nod') duration = 1.6;
    if (action === 'tilt_head') duration = 2.5;

    this.actionState = {
      type: action,
      startTime: performance.now() / 1000,
      duration: duration,
      intensity: 1.0
    };

    // Auto synchronize emotion if triggered by gesture
    if (action === 'wave' || action === 'happy_bounce') {
      this.setEmotion('happy');
    } else if (action === 'shy_pose' || action === 'blush') {
      this.setEmotion('shy');
    } else if (action === 'pout_pose') {
      this.setEmotion('pout');
    } else if (action === 'present_coffee' || action === 'serve') {
      this.setEmotion('happy');
    }
  }

  /**
   * Set speaking state for Lip-Sync
   */
  setSpeaking(speaking, volume = 0.6) {
    this.isSpeaking = speaking;
    this.speechVolume = volume;
    if (!speaking) {
      this.setMorphTarget('vowel_a', 0);
      this.setMorphTarget('vowel_i', 0);
      this.setMorphTarget('vowel_u', 0);
      this.setMorphTarget('vowel_e', 0);
      this.setMorphTarget('vowel_o', 0);
    }
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
    this.updateLipSync(time);
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
  updateLipSync(time) {
    if (this.isSpeaking) {
      const flap1 = Math.sin(time * 16) * 0.5 + 0.5;
      const flap2 = Math.sin(time * 26 + 1.4) * 0.3;
      const openAmount = Math.max(0, Math.min(1.0, (flap1 + flap2) * (this.speechVolume || 0.7)));

      this.applyDirectMorph('vowel_a', openAmount * 0.85);
      this.applyDirectMorph('vowel_e', openAmount * 0.35);
      this.applyDirectMorph('vowel_o', (1.0 - openAmount) * openAmount * 0.5);
    }
  }

  /**
   * Smooth Lerp morph transitions
   */
  updateMorphTransitions(delta) {
    const lerpSpeed = Math.min(1.0, delta * 9.0);

    for (const [name, target] of Object.entries(this.targetMorphs)) {
      const current = this.currentMorphs[name] || 0;
      const next = THREE.MathUtils.lerp(current, target, lerpSpeed);
      this.currentMorphs[name] = next;

      if (name !== 'blink' && !name.startsWith('vowel_')) {
        this.applyDirectMorph(name, next);
      }
    }
  }

  applyDirectMorph(aliasName, weight) {
    const entry = this.morphDict[aliasName];
    if (entry && entry.mesh && entry.mesh.morphTargetInfluences) {
      entry.mesh.morphTargetInfluences[entry.index] = weight;
    }
  }

  /**
   * Procedural Full-Body Gesture & Motion Engine
   */
  updateFullBodyAnimation(delta, time) {
    const currentTime = performance.now() / 1000;
    const elapsedAction = currentTime - this.actionState.startTime;
    const actionActive = elapsedAction < this.actionState.duration;
    
    // Normalized progress (0.0 to 1.0) with smooth ease in/out curve
    const progress = actionActive ? elapsedAction / this.actionState.duration : 1.0;
    // Bell curve for action envelope (0 -> 1 -> 0)
    const curve = actionActive ? Math.sin(progress * Math.PI) : 0;

    const actionType = actionActive ? this.actionState.type : 'idle';

    // -------------------------------------------------------------
    // 1. BASE IDLE LIVING BREATHING & SWAY
    // -------------------------------------------------------------
    const breatheSine = Math.sin(time * 2.2);
    const breatheCos = Math.cos(time * 1.8);
    const breathArm = breatheSine * 0.025;

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

    // -------------------------------------------------------------
    // 2. HEAD & NECK PROCEDURAL GESTURES
    // -------------------------------------------------------------
    if (this.headBone) {
      let headPitch = breatheCos * 0.015;
      let headYaw = Math.sin(time * 1.0) * 0.025;
      let headRoll = Math.sin(time * 0.8) * 0.018;

      if (actionType === 'nod') {
        headPitch += Math.sin(progress * Math.PI * 4) * 0.18 * curve;
      } else if (actionType === 'wave') {
        headRoll -= 0.12 * curve; // Tilt head while waving
        headPitch -= 0.05 * curve;
      } else if (actionType === 'tilt_head' || actionType === 'think') {
        headRoll += 0.22 * curve; // Inquisitive tilt
        headYaw -= 0.1 * curve;
      } else if (actionType === 'shy_pose' || actionType === 'blush') {
        headPitch += 0.1 * curve;  // Look down bashfully
        headRoll -= 0.12 * curve;
        headYaw += 0.08 * curve;
      } else if (actionType === 'pout_pose') {
        headYaw -= 0.28 * curve;  // Turn head away
        headRoll += 0.1 * curve;
        headPitch += 0.05 * curve;
      } else if (actionType === 'present_coffee' || actionType === 'serve') {
        headPitch += 0.08 * curve;
      }

      this.headBone.rotation.x = headPitch;
      this.headBone.rotation.y = headYaw;
      this.headBone.rotation.z = headRoll;
    }

    // -------------------------------------------------------------
    // 3. ARMS & HANDS DYNAMIC GESTURE ENGINE
    // -------------------------------------------------------------
    // Base resting rotations
    let lArmX = THREE.MathUtils.degToRad(10);
    let lArmY = THREE.MathUtils.degToRad(12);
    let lArmZ = -THREE.MathUtils.degToRad(58) + breathArm;

    let rArmX = THREE.MathUtils.degToRad(10);
    let rArmY = -THREE.MathUtils.degToRad(12);
    let rArmZ = THREE.MathUtils.degToRad(58) - breathArm;

    let lElbowX = 0, lElbowY = THREE.MathUtils.degToRad(25), lElbowZ = THREE.MathUtils.degToRad(20);
    let rElbowX = 0, rElbowY = -THREE.MathUtils.degToRad(25), rElbowZ = -THREE.MathUtils.degToRad(20);

    let lWristX = 0, lWristY = 0, lWristZ = -THREE.MathUtils.degToRad(10);
    let rWristX = 0, rWristY = 0, rWristZ = THREE.MathUtils.degToRad(10);

    // Apply specific dynamic gestures
    if (actionType === 'wave') {
      // Right hand raises up and waves side to side
      rArmX = THREE.MathUtils.lerp(rArmX, -THREE.MathUtils.degToRad(25), curve);
      rArmY = THREE.MathUtils.lerp(rArmY, THREE.MathUtils.degToRad(35), curve);
      rArmZ = THREE.MathUtils.lerp(rArmZ, -THREE.MathUtils.degToRad(65), curve);

      rElbowZ = THREE.MathUtils.lerp(rElbowZ, -THREE.MathUtils.degToRad(95), curve);
      rElbowY = THREE.MathUtils.lerp(rElbowY, -THREE.MathUtils.degToRad(40), curve);

      const waveMotion = Math.sin(progress * Math.PI * 10) * 0.45 * curve;
      rWristZ = THREE.MathUtils.lerp(rWristZ, waveMotion, curve);
    }
    else if (actionType === 'present_coffee' || actionType === 'serve') {
      // Both hands reach forward gently holding a coffee cup
      lArmX = THREE.MathUtils.lerp(lArmX, -THREE.MathUtils.degToRad(35), curve);
      rArmX = THREE.MathUtils.lerp(rArmX, -THREE.MathUtils.degToRad(35), curve);
      lArmZ = THREE.MathUtils.lerp(lArmZ, -THREE.MathUtils.degToRad(25), curve);
      rArmZ = THREE.MathUtils.lerp(rArmZ, THREE.MathUtils.degToRad(25), curve);

      lElbowY = THREE.MathUtils.lerp(lElbowY, THREE.MathUtils.degToRad(55), curve);
      rElbowY = THREE.MathUtils.lerp(rElbowY, -THREE.MathUtils.degToRad(55), curve);
      lElbowZ = THREE.MathUtils.lerp(lElbowZ, THREE.MathUtils.degToRad(40), curve);
      rElbowZ = THREE.MathUtils.lerp(rElbowZ, -THREE.MathUtils.degToRad(40), curve);

      lWristY = THREE.MathUtils.lerp(lWristY, -THREE.MathUtils.degToRad(30), curve);
      rWristY = THREE.MathUtils.lerp(rWristY, THREE.MathUtils.degToRad(30), curve);
    }
    else if (actionType === 'shy_pose' || actionType === 'blush') {
      // Both hands come close to chest/cheeks bashfully
      lArmZ = THREE.MathUtils.lerp(lArmZ, -THREE.MathUtils.degToRad(25), curve);
      rArmZ = THREE.MathUtils.lerp(rArmZ, THREE.MathUtils.degToRad(25), curve);
      lArmX = THREE.MathUtils.lerp(lArmX, -THREE.MathUtils.degToRad(15), curve);
      rArmX = THREE.MathUtils.lerp(rArmX, -THREE.MathUtils.degToRad(15), curve);

      lElbowZ = THREE.MathUtils.lerp(lElbowZ, THREE.MathUtils.degToRad(75), curve);
      rElbowZ = THREE.MathUtils.lerp(rElbowZ, -THREE.MathUtils.degToRad(75), curve);
      lElbowY = THREE.MathUtils.lerp(lElbowY, THREE.MathUtils.degToRad(45), curve);
      rElbowY = THREE.MathUtils.lerp(rElbowY, -THREE.MathUtils.degToRad(45), curve);

      lWristZ = THREE.MathUtils.lerp(lWristZ, -THREE.MathUtils.degToRad(40), curve);
      rWristZ = THREE.MathUtils.lerp(rWristZ, THREE.MathUtils.degToRad(40), curve);
    }
    else if (actionType === 'pout_pose') {
      // Hands on hips / elbows out
      lArmZ = THREE.MathUtils.lerp(lArmZ, -THREE.MathUtils.degToRad(40), curve);
      rArmZ = THREE.MathUtils.lerp(rArmZ, THREE.MathUtils.degToRad(40), curve);
      lArmY = THREE.MathUtils.lerp(lArmY, -THREE.MathUtils.degToRad(30), curve);
      rArmY = THREE.MathUtils.lerp(rArmY, THREE.MathUtils.degToRad(30), curve);

      lElbowZ = THREE.MathUtils.lerp(lElbowZ, THREE.MathUtils.degToRad(90), curve);
      rElbowZ = THREE.MathUtils.lerp(rElbowZ, -THREE.MathUtils.degToRad(90), curve);
      lElbowY = THREE.MathUtils.lerp(lElbowY, THREE.MathUtils.degToRad(35), curve);
      rElbowY = THREE.MathUtils.lerp(rElbowY, -THREE.MathUtils.degToRad(35), curve);
    }
    else if (actionType === 'think') {
      // Right hand touches chin
      rArmX = THREE.MathUtils.lerp(rArmX, -THREE.MathUtils.degToRad(25), curve);
      rArmY = THREE.MathUtils.lerp(rArmY, THREE.MathUtils.degToRad(20), curve);
      rArmZ = THREE.MathUtils.lerp(rArmZ, THREE.MathUtils.degToRad(15), curve);

      rElbowZ = THREE.MathUtils.lerp(rElbowZ, -THREE.MathUtils.degToRad(110), curve);
      rElbowY = THREE.MathUtils.lerp(rElbowY, -THREE.MathUtils.degToRad(45), curve);
      rWristZ = THREE.MathUtils.lerp(rWristZ, THREE.MathUtils.degToRad(35), curve);
    }
    else if (actionType === 'happy_bounce') {
      // Cheerful arm flair
      lArmZ = THREE.MathUtils.lerp(lArmZ, -THREE.MathUtils.degToRad(75), curve);
      rArmZ = THREE.MathUtils.lerp(rArmZ, THREE.MathUtils.degToRad(75), curve);
      lElbowZ = THREE.MathUtils.lerp(lElbowZ, THREE.MathUtils.degToRad(40), curve);
      rElbowZ = THREE.MathUtils.lerp(rElbowZ, -THREE.MathUtils.degToRad(40), curve);
    }

    // Apply Arm transforms
    if (this.leftArm) this.leftArm.rotation.set(lArmX, lArmY, lArmZ);
    if (this.rightArm) this.rightArm.rotation.set(rArmX, rArmY, rArmZ);
    if (this.leftElbow) this.leftElbow.rotation.set(lElbowX, lElbowY, lElbowZ);
    if (this.rightElbow) this.rightElbow.rotation.set(rElbowX, rElbowY, rElbowZ);
    if (this.leftWrist) this.leftWrist.rotation.set(lWristX, lWristY, lWristZ);
    if (this.rightWrist) this.rightWrist.rotation.set(rWristX, rWristY, rWristZ);

    // -------------------------------------------------------------
    // 4. SECONDARY PROCEDURAL PHYSICS: HAIR, RIBBONS & SKIRT
    // -------------------------------------------------------------
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
}
