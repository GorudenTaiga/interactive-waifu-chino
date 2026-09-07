import * as THREE from 'three';
import { MMDLoader } from 'three/examples/jsm/loaders/MMDLoader.js';

export class ChinoLoader {
  constructor() {
    this.loader = new MMDLoader();
    this.model = null;
    this.morphDict = {};
    this.bones = {};
  }

  /**
   * Load Chino PMX model
   */
  load(modelPath = '/model/Chino MMD mine/Chino.pmx', onProgress = null) {
    return new Promise((resolve, reject) => {
      console.log(`[ChinoLoader] Memuat model dari: ${modelPath}`);

      this.loader.load(
        modelPath,
        (mesh) => {
          this.model = mesh;
          this.setupModel(mesh);
          resolve({
            mesh: this.model,
            morphDict: this.morphDict,
            bones: this.bones
          });
        },
        (xhr) => {
          if (onProgress && xhr.total) {
            const percent = (xhr.loaded / xhr.total) * 100;
            onProgress(percent);
          }
        },
        (error) => {
          console.error('[ChinoLoader] Gagal memuat model:', error);
          reject(error);
        }
      );
    });
  }

  /**
   * Setup materials, shadows, and inspect bones & morph targets
   */
  setupModel(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(0, 0, 0);

    // Optimize materials for vibrant anime look
    mesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => this.enhanceMaterial(mat));
        } else if (child.material) {
          this.enhanceMaterial(child.material);
        }

        // Collect morph targets
        if (child.morphTargetDictionary) {
          this.mapMorphTargets(child);
        }
      }

      // Collect bones
      if (child.isBone) {
        this.bones[child.name] = child;
      }
    });

    console.log('[ChinoLoader] Model berhasil dimuat!');
    console.log('[ChinoLoader] Morph targets ditemukan:', Object.keys(this.morphDict));
    console.log('[ChinoLoader] Bones ditemukan:', Object.keys(this.bones));
  }

  enhanceMaterial(mat) {
    if (!mat) return;
    mat.roughness = 0.6;
    mat.metalness = 0.05;
    mat.side = THREE.DoubleSide;
    // Jaga warna tekstur tetap cerah & natural
    if (mat.map) {
      mat.map.colorSpace = THREE.SRGBColorSpace;
    }
  }

  /**
   * Map standard MMD morph names to readable aliases
   */
  mapMorphTargets(mesh) {
    const dict = mesh.morphTargetDictionary;

    for (const [name, index] of Object.entries(dict)) {
      this.morphDict[name] = { mesh, index, name };

      // Direct Mapping to aliases
      if (name === 'まばたき') this.morphDict['blink'] = { mesh, index };
      if (name === '笑い') this.morphDict['smile'] = { mesh, index };
      if (name === 'にこり') this.morphDict['cheerful'] = { mesh, index };
      if (name === 'ウィンク') this.morphDict['wink'] = { mesh, index };
      if (name === 'ウィンク右') this.morphDict['wink_r'] = { mesh, index };
      if (name === 'じと目') this.morphDict['stare'] = { mesh, index };
      if (name === 'びっくり') this.morphDict['surprise'] = { mesh, index };
      if (name === '困る') this.morphDict['troubled'] = { mesh, index };
      if (name === '怒り') this.morphDict['anger'] = { mesh, index };
      if (name === '口角上げ') this.morphDict['mouth_smile'] = { mesh, index };
      if (name === '口角下げ') this.morphDict['mouth_frown'] = { mesh, index };
      if (name === '真面目') this.morphDict['serious'] = { mesh, index };
      if (name === 'にやり') this.morphDict['grin'] = { mesh, index };

      // Lip-sync Vowels
      if (name === 'あ') this.morphDict['vowel_a'] = { mesh, index };
      if (name === 'い') this.morphDict['vowel_i'] = { mesh, index };
      if (name === 'う') this.morphDict['vowel_u'] = { mesh, index };
      if (name === 'え') this.morphDict['vowel_e'] = { mesh, index };
      if (name === 'お') this.morphDict['vowel_o'] = { mesh, index };
    }
  }
}
