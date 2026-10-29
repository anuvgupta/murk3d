import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AtmospherePass } from '../world/AtmospherePass.js';

import { Terrain } from '../world/Terrain.js';
import { GroundMask } from '../world/GroundMask.js';
import { createTerrainMaterial, createTurfMaterial } from '../world/TerrainMaterial.js';
import { createNoiseTexture } from '../util/noiseTexture.js';
import { Environment } from '../world/Environment.js';
import { Wind } from '../world/Wind.js';
import { Grass } from '../world/Grass.js';
import { Water } from '../world/Water.js';
import { createBuildingMaterials } from '../buildings/materials.js';
import { Village } from '../buildings/Village.js';
import { Castle } from '../buildings/Castle.js';
import { CASTLES, RUINS, PITS, GLADE } from '../world/plan.js';
import { Portals } from '../world/Portals.js';
import { Falls } from '../world/Falls.js';
import { Arches } from '../world/Arches.js';
import { Crystals } from '../world/Crystals.js';
import { SkyIslands } from '../world/SkyIslands.js';
import { REGIONS } from '../world/regions.js';
import { RockField } from '../world/Rocks.js';
import { Plates } from '../world/Plates.js';
import { Ruins } from '../buildings/Ruins.js';
import { Forest } from '../world/trees/Forest.js';
import { Motes } from '../world/Motes.js';
import { CLOUD_STYLES, saveCloudStyle } from '../world/clouds.js';
import { SPAWN } from '../world/plan.js';
import { Input } from '../player/Input.js';
import { Player } from '../player/Player.js';
import { HUD } from '../ui/HUD.js';
import { settings, QUALITY, PRESET_ORDER, rememberQuality } from './settings.js';
import { Feedback } from '../ui/Feedback.js';
import { MapScreen } from '../ui/MapScreen.js';

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
    renderer.info.autoReset = false;
    this.perf = { el: document.getElementById('perf'), frames: 0, time: 0, fps: 0, ms: 0, show: false };
    // Adaptive quality: after a few slow seconds, step the cost down (and remember).
    this.adapt = { slow: 0, step: 0, settleUntil: 4 };

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
    this.rocks = new RockField(this.terrain);
    const cutouts = [
      ...this.rocks.footprints,
      ...RUINS.map((s) => ({ x: s.x, z: s.z, r: s.kind === 'forest' ? 3 : s.r * 0.6 })),
      ...PITS.filter((p) => p.depth > 0).map((p) => ({ x: p.x, z: p.z, r: Math.max(p.hx, p.hz) * 0.75 })),
      { x: GLADE.x, z: GLADE.z, r: GLADE.r - 6.5 },
      ...REGIONS.map((R, i) => ({ x: GLADE.x + Math.cos((i / REGIONS.length) * Math.PI * 2) * GLADE.r, z: GLADE.z + Math.sin((i / REGIONS.length) * Math.PI * 2) * GLADE.r, r: 3.8 })),
      ...REGIONS.map((R) => ({ x: R.x + (R.gate || { dx: 50 }).dx, z: R.z + (R.gate || { dz: 50 }).dz, r: 3.5 })),
    ];
    this.groundMask = new GroundMask(this.terrain, { cutouts });
    mark('mask');
    this.wind = new Wind();
    // Sun (or moon) direction and colour × intensity, for shader effects.
    this.sunInfo = { direction: this.environment.lightDir, color: new THREE.Color() };

    const terrainMaterial = createTerrainMaterial({ noise: this.noiseTexture, mask: this.groundMask.texture });
    this.terrainGroup = new THREE.Group();
    this.terrainGroup.name = 'terrain';
    for (const chunk of this.terrain.buildChunks(terrainMaterial)) this.terrainGroup.add(chunk);
    scene.add(this.terrainGroup);
    scene.add(this.rocks.build(this.noiseTexture));

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
    this.buildingMaterials.turf = createTurfMaterial({ noise: this.noiseTexture, mask: this.groundMask.texture });
    this.plates = new Plates({ terrain: this.terrain, noise: this.noiseTexture, turf: this.buildingMaterials.turf });
    scene.add(this.plates.group);
    mark('textures');
    this.village = new Village({ terrain: this.terrain, materials: this.buildingMaterials });
    scene.add(this.village.group);
    mark('village');
    this.castles = CASTLES.map((cfg) => new Castle({ terrain: this.terrain, materials: this.buildingMaterials, castle: cfg }));
    for (const c of this.castles) scene.add(c.group);
    mark('castle');
    this.islands = new SkyIslands({ noise: this.noiseTexture, materials: this.buildingMaterials });
    scene.add(this.islands.group);
    this.portals = new Portals({ terrain: this.terrain, materials: this.buildingMaterials, noise: this.noiseTexture, yAt: (x, z) => this.islands.surfaceAt(x, z) });
    scene.add(this.portals.group);
    this.crystals = new Crystals({ terrain: this.terrain });
    scene.add(this.crystals.group);
    this.falls = new Falls({ terrain: this.terrain, noise: this.noiseTexture });
    scene.add(this.falls.group);
    this.arches = new Arches({ terrain: this.terrain, noise: this.noiseTexture });
    scene.add(this.arches.group);
    mark('realms');
    this.ruins = new Ruins({ terrain: this.terrain, materials: this.buildingMaterials, items: this.village.itemMaterials, noise: this.noiseTexture });
    scene.add(this.ruins.group);
    for (const l of this.ruins.lights) {
      const light = new THREE.PointLight(l.color, l.intensity, l.distance, 1.6);
      light.position.set(l.x, l.y, l.z);
      scene.add(light);
    }
    mark('ruins');

    this.forest = new Forest({ terrain: this.terrain, mask: this.groundMask, noise: this.noiseTexture, wind: this.wind, rocks: this.rocks, sun: this.sunInfo });
    scene.add(this.forest.group);
    mark('trees');

    this.motes = new Motes({ wind: this.wind, sun: this.sunInfo });
    scene.add(this.motes.points);

    const colliders = [...this.village.colliders, ...this.castles.flatMap((c) => c.worldColliders()), ...this.ruins.colliders, ...this.portals.colliders, ...this.crystals.colliders, ...this.arches.colliders, ...this.rocks.colliders, ...this.forest.colliders];
    this.player = new Player(this.camera, this.input, this.terrain, colliders);
    this.player.waterLevelAt = (x, z) => this.water.levelAt(x, z);
    this.player.surfaces.push((x, z) => this.village.surfaceAt(x, z));
    for (const c of this.castles) this.player.surfaces.push((x, z) => c.surfaceAt(x, z));
    this.player.surfaces.push((x, z) => this.islands.surfaceAt(x, z));
    this.player.surfaces.push((x, z) => this.plates.surfaceAt(x, z));
    this.player.surfaces.push((x, z) => this.ruins.surfaceAt(x, z));
    this.player.spawn(SPAWN.x, SPAWN.z, SPAWN.yaw);
    this.applyViewLink();
    this.feedback = new Feedback(this);
    this.map = new MapScreen(this);

    this.setupPostProcessing();

    // Prime shaders and the first frame behind the menu.
    this.updateWorld(0);
    this.renderer.compile(scene, this.camera);
    this.render();
    mark('ready');
  }

  // ?at=x,z,yaw,pitch,time drops you at a saved view (used by feedback notes).
  applyViewLink() {
    const at = new URLSearchParams(location.search).get('at');
    if (!at) return;
    const [x, z, yaw = 0, pitch = 0, time] = at.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.player.spawn(x, z, yaw);
    this.player.pitch = pitch;
    if (Number.isFinite(time)) {
      this.environment.setTime(time);
      this.environment.paused = true;
    }
  }

  // Step through a gate: a flash, then the player stands before the twin gate.
  travelTo(id) {
    const to = this.portals.arrivalFor(id);
    const flash = document.getElementById('flash');
    if (flash) {
      flash.classList.add('on');
      setTimeout(() => flash.classList.remove('on'), 700);
    }
    this.player.spawn(to.x, to.z, to.yaw);
    this.portals.cooldown = 2.5;
    const R = REGIONS.find((r) => r.id === id);
    this.hud.toast(R ? R.name : 'The Vale');
    // Let the grass and trees stream in around the new position.
    this.grass.update(this.camera, this.player.position);
  }

  cycleClouds() {
    const i = CLOUD_STYLES.indexOf(this.environment.cloudStyle);
    const next = CLOUD_STYLES[(i + 1) % CLOUD_STYLES.length];
    this.environment.setCloudStyle(next);
    saveCloudStyle(next);
    this.hud.toast(`Clouds: ${next}`);
  }

  openFeedback() {
    this.feedbackOpen = true;
    this.feedback.show();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onFeedbackClosed() {
    this.feedbackOpen = false;
    if (this.input.dragMode) this.setActive(true);
    else this.input.lock();
  }

  setupPostProcessing() {
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    const dpr = this.renderer.getPixelRatio();
    // The atmosphere pass reads scene depth, so the composer's buffers carry one.
    const target = new THREE.WebGLRenderTarget(size.x * dpr, size.y * dpr, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(size.x * dpr, size.y * dpr, THREE.UnsignedIntType),
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.atmosphere = new AtmospherePass(this.camera);
    this.atmosphere.setSize(size.x * dpr, size.y * dpr);
    this.composer.addPass(this.atmosphere);
    if (settings.bloom) {
      // High threshold: only the sun, glowing windows and bright cloud edges bloom.
      this.composer.addPass(new UnrealBloomPass(size, 0.25, 0.6, 4.0));
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
      if (input.wasPressed('KeyF')) this.openFeedback();
      if (input.wasPressed('KeyC')) this.cycleClouds();
      if (input.wasPressed('KeyM')) this.map.show(!this.map.open);
      if (input.wasPressed('F3')) {
        this.perf.show = !this.perf.show;
        this.perf.el.classList.toggle('hidden', !this.perf.show);
      }
      if (!this.map.open) this.player.update(dt);
      const dest = this.portals.update(dt, this.player.position);
      if (dest) this.travelTo(dest);
    }

    this.updateWorld(dt);
    this.hud.update(this.player.yaw, this.environment.timeLabel());

    const t0 = performance.now();
    this.renderer.info.reset();
    this.render();
    this.updatePerf(dt, performance.now() - t0);
    input.endFrame();
  }

  // Step rendering cost down while the frame rate stays under ~28 fps:
  // resolution first, then grass reach, then bloom; past that, reload on a
  // lower preset next time. Only counts while playing (the menu doesn't move).
  adaptQuality(fps) {
    if (!this.active) return;
    const a = this.adapt;
    if (this.elapsed < a.settleUntil) return;
    if (fps >= 28) {
      a.slow = Math.max(0, a.slow - 1);
      return;
    }
    if (++a.slow < 6) return; // ~3 s of slow frames
    a.slow = 0;
    a.step++;
    a.settleUntil = this.elapsed + 4;
    if (a.step === 1) {
      this.renderer.setPixelRatio(Math.max(0.85, this.renderer.getPixelRatio() * 0.8));
      this.onResize();
      this.hud.toast('Lowering resolution for a smoother frame rate');
    } else if (a.step === 2) {
      this.grass.radiusScale = 0.7;
      this.hud.toast('Shortening grass distance');
    } else if (a.step === 3) {
      for (const pass of this.composer.passes) if (pass.strength !== undefined) pass.enabled = false;
      this.hud.toast('Bloom off');
    } else if (a.step === 4) {
      const i = PRESET_ORDER.indexOf(QUALITY);
      if (i >= 0 && i < PRESET_ORDER.length - 1) {
        rememberQuality(PRESET_ORDER[i + 1]);
        this.hud.toast(`Next visit will start on the ${PRESET_ORDER[i + 1]} preset`);
      }
    }
  }

  updatePerf(dt, renderMs) {
    const p = this.perf;
    p.frames++;
    p.time += dt;
    p.ms += renderMs;
    if (p.time < 0.5) return;
    p.fps = p.frames / p.time;
    const cpu = p.ms / p.frames;
    p.frames = 0;
    p.time = 0;
    p.ms = 0;
    this.adaptQuality(p.fps);
    if (!p.show) return;
    const r = this.renderer.info.render;
    const m = this.renderer.info.memory;
    let grass = 0;
    for (const s of this.grass.slots) if (s.mesh.visible) grass += s.mesh.count;
    let trees = 0;
    for (const set of this.forest.sets) for (const tier of set.tiers) trees += tier[0].count;
    const pos = this.player.position;
    p.el.textContent = [
      `${p.fps.toFixed(0)} fps   ${(1000 / p.fps).toFixed(1)} ms/frame   render cpu ${cpu.toFixed(1)} ms`,
      `draw calls ${r.calls}   triangles ${(r.triangles / 1e6).toFixed(2)} M`,
      `grass blades ${(grass / 1000).toFixed(0)} k   trees ${trees}`,
      `textures ${m.textures}   geometries ${m.geometries}`,
      `position ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`,
    ].join('\n');
  }

  // Everything that animates regardless of input.
  updateWorld(dt) {
    const env = this.environment;
    env.update(dt, this.player.position, this.wind);
    // Eyes below the water surface: the view goes murky.
    if (this.water) {
      const level = this.water.levelAt(this.camera.position.x, this.camera.position.z);
      env.atmosphere.underwater = this.camera.position.y < level ? 1 : 0;
    }
    this.renderer.toneMappingExposure = env.exposure;
    if (this.atmosphere) this.atmosphere.update(env.atmosphere, this.wind, this.noiseTexture, this.elapsed);
    // Water reflects the sky at full strength, independent of the scene's ambient level.
    if (this.water && this.water.material.envMap !== env.envTexture) {
      this.water.material.envMap = env.envTexture;
      this.water.material.needsUpdate = true;
    }
    this.sunInfo.color.copy(env.sun.color).multiplyScalar(env.sun.intensity);
    this.wind.update(dt);
    this.grass.update(this.camera, this.player.position);
    this.forest.update(this.camera, this.elapsed);
    this.village.setViewport(this.renderer.getDrawingBufferSize(this._bufferSize).y, this.camera.fov);
    this.village.update(dt, this.elapsed, this.wind, env.nightFactor, env.lightLevel);
    this.motes.setViewport(this._bufferSize.y, this.camera.fov);
    this.motes.update(dt, this.player.position, this.terrain, env.nightFactor, env.lightLevel);
    if (!this.active) this.portals.update(dt, { x: 1e9, y: 0, z: 1e9 });
    this.falls.update(dt);
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
    if (this.composer) {
      this.composer.setSize(w, h);
      const dpr = this.renderer.getPixelRatio();
      this.composer.renderTarget1.depthTexture.image.width = w * dpr;
      this.composer.renderTarget1.depthTexture.image.height = h * dpr;
      this.atmosphere.setSize(w * dpr, h * dpr);
    }
  }
}
