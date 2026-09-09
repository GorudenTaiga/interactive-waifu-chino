import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.animationCallbacks = [];
    this.clock = new THREE.Clock();

    this.initScene();
    this.initCamera();
    this.initRenderer();
    this.initLights();
    this.initControls();
    this.initEventListeners();
  }

  initScene() {
    this.scene = new THREE.Scene();
    // Soft subtle fog for depth
    this.scene.fog = new THREE.FogExp2(0x0f172a, 0.015);
  }

  initCamera() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // FOV 42 - show full body including arms and gestures
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    // Pull back enough to fully see arm gestures
    this.camera.position.set(0, 10.5, 32);
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'default'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Cel-shading outline effect for anime style
    this.effect = new OutlineEffect(this.renderer, {
      defaultThickness: 0.0025,
      defaultColor: [0.15, 0.18, 0.25],
      defaultAlpha: 0.8
    });
  }

  initLights() {
    // 1. Ambient Light - Bright and balanced
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    this.scene.add(ambientLight);

    // 2. Hemisphere Light (Pastel blue sky, warm cafe ground)
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0xfef3c7, 1.0);
    hemiLight.position.set(0, 20, 0);
    this.scene.add(hemiLight);

    // 3. Main Key Directional Light (Front-Right-Top)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(5, 18, 12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 40;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    // 4. Fill Directional Light (Front-Left-Bottom)
    const fillLight = new THREE.DirectionalLight(0xdbeafe, 1.0);
    fillLight.position.set(-8, 10, 10);
    this.scene.add(fillLight);

    // 5. Rim / Backlight (Highlights hair outline)
    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.6);
    rimLight.position.set(0, 15, -10);
    this.scene.add(rimLight);
  }

  initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    // Focus target at Chino's chest/face height
    this.controls.target.set(0, 6.4, 0);
    
    // Clamp zoom & angles for optimal view
    this.controls.minDistance = 8;
    this.controls.maxDistance = 35;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't go under floor
    this.controls.minPolarAngle = 0.2;
  }

  initEventListeners() {
    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.effect.setSize(width, height);
  }

  add(object) {
    this.scene.add(object);
  }

  onUpdate(callback) {
    this.animationCallbacks.push(callback);
  }

  start() {
    const animate = () => {
      requestAnimationFrame(animate);

      const delta = this.clock.getDelta();
      const time = this.clock.getElapsedTime();

      this.controls.update();

      for (const cb of this.animationCallbacks) {
        cb(delta, time);
      }

      this.effect.render(this.scene, this.camera);
    };

    animate();
  }
}
