import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Terrain } from '../world/Terrain.js';
import { Grass } from '../world/Grass.js';
import { House } from '../world/House.js';
import { Rocks } from '../world/Rocks.js';
import { Environment } from '../world/Environment.js';
import { HOUSE, SPAWN, SPAWN_YAW } from '../world/layout.js';
import { Input } from '../player/Input.js';
import { Player } from '../player/Player.js';
import { HUD } from '../ui/HUD.js';
import { settings } from './settings.js';

export class Game {
  constructor(container) {
    this.container = container;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.55;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 20000);

    this.input = new Input(renderer.domElement);
    this.hud = new HUD();
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.elapsed = 0;
    this.running = false;

    window.addEventListener('resize', () => this.onResize());
  }

  // Builds the world. Synchronous and a little slow (terrain + grass generation).
  init() {
    const scene = this.scene;

    this.environment = new Environment(scene, this.renderer);

    this.terrain = new Terrain();
    scene.add(this.terrain.mesh);

    this.house = new House();
    this.house.group.position.copy(HOUSE.position);
    this.house.group.rotation.y = HOUSE.rotationY;
    scene.add(this.house.group);

    this.rocks = new Rocks(this.terrain);
    scene.add(this.rocks.group);

    this.grass = new Grass(this.terrain, { exclude: (x, z) => this.rocks.occupies(x, z) });
    scene.add(this.grass.group);

    const colliders = [...this.house.worldColliders(), ...this.rocks.colliders];
    this.player = new Player(this.camera, this.input, this.terrain, colliders);
    this.player.spawn(SPAWN.x, SPAWN.z, SPAWN_YAW);

    this.setupPostProcessing();

    // Prime shaders and the first frame behind the menu.
    this.environment.update(0, this.player.position);
    this.grass.update(0, this.camera, this.player.position);
    this.renderer.compile(scene, this.camera);
    this.render();
  }

  setupPostProcessing() {
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (settings.bloom) {
      // High threshold: only the sun, glowing windows and bright cloud edges bloom.
      this.composer.addPass(new UnrealBloomPass(size, 0.3, 0.5, 5.0));
    }
    this.composer.addPass(new OutputPass());
  }

  start() {
    this.running = true;
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  setActive(active) {
    this.active = active;
    this.hud.show(active);
  }

  frame(timestamp) {
    this.timer.update(timestamp);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.elapsed += dt;
    const input = this.input;

    if (this.active) {
      if (input.wasPressed('BracketRight')) this.environment.setTime(this.environment.timeOfDay + 0.5);
      if (input.wasPressed('BracketLeft')) this.environment.setTime(this.environment.timeOfDay - 0.5);
      if (input.wasPressed('KeyT')) this.environment.paused = !this.environment.paused;
      this.player.update(dt);
    }

    this.environment.update(dt, this.player.position);
    this.renderer.toneMappingExposure = this.environment.exposure;
    this.grass.update(this.elapsed, this.camera, this.player.position);
    this.house.update(dt, this.elapsed, this.environment.nightFactor, this.environment.lightLevel);
    this.hud.update(this.player.yaw, this.environment.timeLabel());

    this.render();
    input.endFrame();
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
  }
}
