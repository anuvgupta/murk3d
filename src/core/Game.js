import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Terrain } from '../world/Terrain.js';
import { GroundMask } from '../world/GroundMask.js';
import { createTerrainMaterial } from '../world/TerrainMaterial.js';
import { createNoiseTexture } from '../util/noiseTexture.js';
import { Environment } from '../world/Environment.js';
import { Wind } from '../world/Wind.js';
import { Grass } from '../world/Grass.js';
import { Water } from '../world/Water.js';
import { createBuildingMaterials } from '../buildings/materials.js';
import { Village } from '../buildings/Village.js';
import { SPAWN } from '../world/plan.js';
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
    this._bufferSize = new THREE.Vector2();
    this.running = false;

    window.addEventListener('resize', () => this.onResize());
  }

  // Builds the world. Synchronous and a little slow (terrain generation).
  init() {
    const scene = this.scene;
    const t0 = performance.now();
    this.timings = {};
    const mark = (name) => {
      this.timings[name] = Math.round(performance.now() - t0);
    };

    this.environment = new Environment(scene, this.renderer);
    mark('environment');

    this.noiseTexture = createNoiseTexture();
    this.terrain = new Terrain();
    mark('terrain');
    this.groundMask = new GroundMask(this.terrain);
    mark('mask');
    this.wind = new Wind();
    // Sun (or moon) direction and colour × intensity, for shader effects.
    this.sunInfo = { direction: this.environment.lightDir, color: new THREE.Color() };

    const terrainMesh = new THREE.Mesh(
      this.terrain.geometry,
      createTerrainMaterial({ noise: this.noiseTexture, mask: this.groundMask.texture })
    );
    terrainMesh.name = 'terrain';
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);

    this.grass = new Grass({
      terrain: this.terrain,
      mask: this.groundMask.texture,
      noise: this.noiseTexture,
      wind: this.wind,
      sun: this.sunInfo,
    });
    scene.add(this.grass.group);
    mark('grass');

    this.water = new Water({ terrain: this.terrain, noise: this.noiseTexture, wind: this.wind });
    scene.add(this.water.group);
    mark('water');

    this.buildingMaterials = createBuildingMaterials(this.noiseTexture);
    mark('textures');
    this.village = new Village({ terrain: this.terrain, materials: this.buildingMaterials });
    scene.add(this.village.group);
    mark('village');

    const colliders = [...this.village.colliders];
    this.player = new Player(this.camera, this.input, this.terrain, colliders);
    this.player.surfaces.push((x, z) => this.village.surfaceAt(x, z));
    this.player.spawn(SPAWN.x, SPAWN.z, SPAWN.yaw);

    this.setupPostProcessing();

    // Prime shaders and the first frame behind the menu.
    this.updateWorld(0);
    this.renderer.compile(scene, this.camera);
    this.render();
    mark('ready');
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

    this.updateWorld(dt);
    this.hud.update(this.player.yaw, this.environment.timeLabel());

    this.render();
    input.endFrame();
  }

  // Everything that animates regardless of input.
  updateWorld(dt) {
    const env = this.environment;
    env.update(dt, this.player.position);
    this.renderer.toneMappingExposure = env.exposure;
    this.sunInfo.color.copy(env.sun.color).multiplyScalar(env.sun.intensity);
    this.wind.update(dt);
    this.grass.update(this.camera, this.player.position);
    this.village.setViewport(this.renderer.getDrawingBufferSize(this._bufferSize).y, this.camera.fov);
    this.village.update(dt, this.elapsed, this.wind, env.nightFactor, env.lightLevel);
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
