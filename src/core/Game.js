import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AtmospherePass } from '../world/AtmospherePass.js';
import { TemporalPass } from '../world/TemporalPass.js';
import { PixelatePass } from '../world/PixelatePass.js';

import { Terrain } from '../world/Terrain.js';
import { GroundMask } from '../world/GroundMask.js';
import { createTerrainMaterial, createTurfMaterial, TERRAIN_DEBUG } from '../world/TerrainMaterial.js';
import { createNoiseTexture } from '../util/noiseTexture.js';
import { Environment } from '../world/Environment.js';
import { Wind } from '../world/Wind.js';
import { Grass } from '../world/Grass.js';
import { Water } from '../world/Water.js';
import { createBuildingMaterials } from '../buildings/materials.js';
import { Village } from '../buildings/Village.js';
import { Castle } from '../buildings/Castle.js';
import { CASTLES, RUINS, PITS, GLADE, WELL } from '../world/plan.js';
import { Portals } from '../world/Portals.js';
import { Falls } from '../world/Falls.js';
import { Arches } from '../world/Arches.js';
import { Crystals } from '../world/Crystals.js';
import { SkyIslands } from '../world/SkyIslands.js';
import { FallenLogs } from '../world/FallenLogs.js';
import { Mushrooms } from '../world/Mushrooms.js';
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
import { settings, QUALITY, PRESET_ORDER, rememberQuality, PIXEL_LEVELS, loadPixelLevel, rememberPixelLevel, ADAPT_LADDER, loadAdapt, rememberAdapt } from './settings.js';
import { Feedback } from '../ui/Feedback.js';
import { MapScreen } from '../ui/MapScreen.js';

// Loading stages in order: name (as marked in init), a weight (its share of
// the load time, from measured timings) and what the menu says while it is
// being made. 'frame' is the first full frame: shader linking and the first
// draw, which on a GPU is the last second or so.
const STAGES = [
  ['environment', 1, 'Kindling the sky'],
  ['terrain', 10, 'Raising the mountains'],
  ['mask', 13, 'Carving the rivers and roads'],
  ['grass', 1.5, 'Sowing the meadows'],
  ['water', 1.5, 'Filling the lakes'],
  ['textures', 9, 'Quarrying stone and timber'],
  ['village', 4.5, 'Building the village'],
  ['castle', 1, 'Raising the castles'],
  ['mushrooms', 1, 'Opening the realm gates'],
  ['realms', 1, 'Pouring the waterfalls'],
  ['ruins', 1, 'Weathering the ruins'],
  ['trees', 13, 'Growing the forests'],
  ['world0', 5, 'Gathering the light'],
  ['compile', 3, 'Waking the world'],
  ['frame', 10, 'Waking the world'],
];
const STAGE_TOTAL = STAGES.reduce((a, s) => a + s[1], 0);

// Give the browser a turn: paint the progress bar and handle input. Falls
// back to a timer so loading continues in a background tab (no frames there).
function nextTask() {
  return new Promise((resolve) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 50);
  });
}

export class Game {
  constructor(container) {
    this.container = container;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Rendering resolution: the preset's ratio, or a coarse grid when pixelated.
    this.fullRatio = Math.min(window.devicePixelRatio, settings.pixelRatio);
    this.baseRatio = this.fullRatio;
    this.pixelLevel = loadPixelLevel();
    renderer.setPixelRatio(this.effectiveRatio());
    renderer.domElement.style.imageRendering = PIXEL_LEVELS[this.pixelLevel].px ? 'pixelated' : 'auto';
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
    this.adapt = { level: 0, slow: 0, fast: 0, settleUntil: 4, trial: null, backoff: 60, nextTry: 0 };

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

  // Builds the world in stages, handing the browser back control between
  // them so the page stays responsive while the land is made. After each
  // stage onProgress(fraction, label) reports how far along it is, and once
  // the land, sky and water exist the view behind the menu is drawn as the
  // rest fills in. Resolves when the world is ready to walk in.
  async init(onProgress = () => {}) {
    const scene = this.scene;
    const t0 = performance.now();
    this.timings = {};
    let done = 0;
    onProgress(0, STAGES[0][2]);
    const mark = async (name) => {
      this.timings[name] = Math.round(performance.now() - t0);
      const i = STAGES.findIndex((st) => st[0] === name);
      done += i >= 0 ? STAGES[i][1] : 0;
      onProgress(Math.min(1, done / STAGE_TOTAL), (STAGES[i + 1] || STAGES[i])[2]);
      this.previewFrame();
      await nextTask();
    };

    this.environment = new Environment(scene, this.renderer);
    await mark('environment');

    this.noiseTexture = createNoiseTexture();
    this.terrain = new Terrain();
    this.placePreviewCamera();
    await mark('terrain');
    this.rocks = new RockField(this.terrain);
    const cutouts = [
      ...this.rocks.footprints,
      ...RUINS.map((s) => ({ x: s.x, z: s.z, r: s.kind === 'forest' ? 3 : s.r * 0.6 })),
      ...PITS.filter((p) => p.depth > 0).map((p) => ({ x: p.x, z: p.z, r: Math.max(p.hx, p.hz) * 0.75 })),
      { x: GLADE.x, z: GLADE.z, r: GLADE.r - 6.5 },
      ...REGIONS.map((R, i) => ({ x: GLADE.x + Math.cos((i / REGIONS.length) * Math.PI * 2) * GLADE.r, z: GLADE.z + Math.sin((i / REGIONS.length) * Math.PI * 2) * GLADE.r, r: 3.8 })),
      ...REGIONS.map((R) => ({ x: R.x + (R.gate || { dx: 50 }).dx, z: R.z + (R.gate || { dz: 50 }).dz, r: 3.5 })),
      // No grass in a waterfall's course.
      ...REGIONS.flatMap((R) =>
        (R.falls || []).flatMap((f) =>
          Array.from({ length: 14 }, (_, i) => {
            const t = (i + 0.5) / 14;
            return { x: R.x + f.from.dx + (f.to.dx - f.from.dx) * t, z: R.z + f.from.dz + (f.to.dz - f.from.dz) * t, r: f.w * 0.5 * (0.7 + 0.5 * t) + 0.4 };
          })
        )
      ),
    ];
    this.groundMask = new GroundMask(this.terrain, { cutouts });
    await mark('mask');
    this.wind = new Wind();
    this.wind.buildMap(this.terrain);
    this.setupPostProcessing();
    // Sun (or moon) direction and colour × intensity, for shader effects.
    this.sunInfo = { direction: this.environment.lightDir, color: new THREE.Color() };

    const terrainMaterial = createTerrainMaterial({ noise: this.noiseTexture, mask: this.groundMask.texture, heightMap: this.terrain.heightTexture });
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
    await mark('grass');

    this.water = new Water({ terrain: this.terrain, noise: this.noiseTexture, wind: this.wind });
    scene.add(this.water.group);
    await mark('water');

    this.buildingMaterials = createBuildingMaterials(this.noiseTexture, this.terrain.heightTexture);
    this.buildingMaterials.turf = createTurfMaterial({ noise: this.noiseTexture, mask: this.groundMask.texture });
    this.plates = new Plates({ terrain: this.terrain, noise: this.noiseTexture, turf: this.buildingMaterials.turf });
    scene.add(this.plates.group);
    await mark('textures');
    this.village = new Village({ terrain: this.terrain, materials: this.buildingMaterials });
    scene.add(this.village.group);
    await mark('village');
    this.castles = CASTLES.map((cfg) => new Castle({ terrain: this.terrain, materials: this.buildingMaterials, castle: cfg }));
    for (const c of this.castles) scene.add(c.group);
    this.castleLights = [];
    {
      // The fairy lights over the well pool a little warm light on the plaza.
      const light = new THREE.PointLight(0xffc27a, 0, 24, 1.4);
      light.position.set(WELL.x, this.terrain.plazaHeight + 3.4, WELL.z);
      scene.add(light);
      this.castleLights.push(light);
    }
    // Every lantern in the world lights the ground around it at night, from
    // a small pool of point lights that follow the player to the nearest few
    // (a point light per lantern would cost every fragment in the scene).
    this.lanternPosts = [...this.village.lanterns, ...this.castles.flatMap((c) => c.worldLamps())];
    this.lanternPool = [];
    for (let i = 0; i < 8; i++) {
      const light = new THREE.PointLight(0xffb060, 0, 15, 1.6);
      light.visible = false;
      scene.add(light);
      this.lanternPool.push(light);
    }
    await mark('castle');
    this.islands = new SkyIslands({ noise: this.noiseTexture, materials: this.buildingMaterials });
    scene.add(this.islands.group);
    this.grass.setDiscs(this.islands.tops);
    this.portals = new Portals({ terrain: this.terrain, materials: this.buildingMaterials, noise: this.noiseTexture, yAt: (x, z) => this.islands.surfaceAt(x, z) });
    scene.add(this.portals.group);
    this.crystals = new Crystals({ terrain: this.terrain });
    scene.add(this.crystals.group);
    this.mushrooms = new Mushrooms({ terrain: this.terrain, noise: this.noiseTexture });
    scene.add(this.mushrooms.group);
    await mark('mushrooms');
    this.falls = new Falls({ terrain: this.terrain, noise: this.noiseTexture });
    scene.add(this.falls.group);
    this.arches = new Arches({ terrain: this.terrain, noise: this.noiseTexture });
    scene.add(this.arches.group);
    await mark('realms');
    this.ruins = new Ruins({ terrain: this.terrain, materials: this.buildingMaterials, items: this.village.itemMaterials, noise: this.noiseTexture });
    scene.add(this.ruins.group);
    for (const l of this.ruins.lights) {
      const light = new THREE.PointLight(l.color, l.intensity, l.distance, 1.6);
      light.position.set(l.x, l.y, l.z);
      scene.add(light);
    }
    await mark('ruins');

    this.forest = new Forest({ terrain: this.terrain, mask: this.groundMask, noise: this.noiseTexture, wind: this.wind, rocks: this.rocks, sun: this.sunInfo });
    scene.add(this.forest.group);
    this.wind.addShelter(this.forest.placed);
    this.logs = new FallenLogs({ terrain: this.terrain, forest: this.forest, noise: this.noiseTexture });
    scene.add(this.logs.group);
    this.groundMask.cutSegments(this.logs.logs);
    await mark('trees');

    this.motes = new Motes({ wind: this.wind, sun: this.sunInfo });
    scene.add(this.motes.points);

    const colliders = [...this.village.colliders, ...this.castles.flatMap((c) => c.worldColliders()), ...this.ruins.colliders, ...this.portals.colliders, ...this.crystals.colliders, ...this.arches.colliders, ...this.rocks.colliders, ...this.forest.colliders, ...this.mushrooms.colliders, ...this.logs.colliders];
    this.player = new Player(this.camera, this.input, this.terrain, colliders);
    this.player.waterLevelAt = (x, z) => this.water.levelAt(x, z);
    this.player.surfaces.push((x, z) => this.village.surfaceAt(x, z));
    for (const c of this.castles) this.player.surfaces.push((x, z) => c.surfaceAt(x, z));
    this.player.surfaces.push((x, z) => this.islands.surfaceAt(x, z));
    this.player.surfaces.push((x, z) => this.plates.surfaceAt(x, z));
    this.player.surfaces.push((x, z) => this.ruins.surfaceAt(x, z));
    this.player.surfaces.push((x, z) => this.mushrooms.surfaceAt(x, z));
    this.player.surfaces.push((x, z) => this.logs.surfaceAt(x, z));
    this.player.bouncers.push((x, z) => this.mushrooms.bounceAt(x, z));
    this.player.spawn(SPAWN.x, SPAWN.z, SPAWN.yaw);
    // A shared view link wins; otherwise pick up where the last visit left off.
    if (!this.applyViewLink()) this.restoreSave();
    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && this.save());
    this.feedback = new Feedback(this);
    // Esc while recording ends the clip and opens the note instead of the menu.
    this.input.on('unlock', () => {
      if (this.feedback.recording) this.endRecording();
    });
    this.map = new MapScreen(this);

    this.applyPixelTuning();
    this.preview = false;
    // Start where the last visit's frame rate settled.
    const saved = loadAdapt();
    if (saved && saved.preset === QUALITY && saved.level > 0) this.applyAdaptLevel(Math.min(saved.level, ADAPT_LADDER.length - 1), true);

    // Prime shaders and the first frame behind the menu.
    this.updateWorld(0);
    await mark('world0');
    this.renderer.compile(scene, this.camera);
    await mark('compile');
    this.render();
    await mark('frame');
    this.timings.ready = Math.round(performance.now() - t0);
    this.ready = true;
    onProgress(1, '');
  }

  // Where the view will open: a shared view link, the last save, or the
  // spawn. Used to point the camera at the land while the rest loads.
  startPose() {
    const at = new URLSearchParams(location.search).get('at');
    if (at) {
      const [x, z, yaw = 0, pitch = 0, time] = at.split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(z)) return { x, z, yaw, pitch, time };
    }
    try {
      const d = JSON.parse(localStorage.getItem('murk.save') || 'null');
      if (d && Number.isFinite(d.x) && Number.isFinite(d.z)) return { x: d.x, z: d.z, yaw: d.yaw || 0, pitch: d.pitch || 0, time: d.time };
    } catch (e) {
      /* private mode */
    }
    return { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw, pitch: 0 };
  }

  placePreviewCamera() {
    const p = this.startPose();
    this.camera.position.set(p.x, this.terrain.heightAt(p.x, p.z) + 1.7, p.z);
    this.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    if (Number.isFinite(p.time)) this.environment.setTime(p.time);
    this.preview = new URLSearchParams(location.search).get('preview') !== '0';
  }

  // One frame of the half-built world behind the menu, once there is land,
  // sky, water and the atmosphere to see it through.
  previewFrame() {
    if (!this.preview || !this.water || !this.composer) return;
    const env = this.environment;
    env.update(0, this.camera.position, this.wind);
    this.renderer.toneMappingExposure = env.exposure;
    this.atmosphere.update(env.atmosphere, this.wind, this.noiseTexture, this.elapsed);
    this.sunInfo.color.copy(env.sun.color).multiplyScalar(env.sun.intensity);
    if (this.grass) this.grass.update(this.camera, this.camera.position);
    if (this.forest) this.forest.update(this.camera, this.elapsed);
    if (this.water.material.envMap !== env.envTexture) {
      this.water.material.envMap = env.envTexture;
      this.water.material.needsUpdate = true;
    }
    this.render();
  }

  // ?at=x,z,yaw,pitch,time drops you at a saved view (used by feedback notes).
  applyViewLink() {
    const at = new URLSearchParams(location.search).get('at');
    if (!at) return false;
    const [x, z, yaw = 0, pitch = 0, time] = at.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    this.player.spawn(x, z, yaw);
    this.player.pitch = pitch;
    if (Number.isFinite(time)) {
      this.environment.setTime(time);
      this.environment.paused = true;
    }
    return true;
  }

  // Autosave: where you stand, where you look and the time of day, written
  // every couple of seconds and when the tab is hidden or closed, so a reload
  // puts you back exactly where you were.
  save() {
    if (!this.player) return;
    const p = this.player;
    const data = { x: +p.position.x.toFixed(2), y: +p.position.y.toFixed(2), z: +p.position.z.toFixed(2), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), time: +this.environment.timeOfDay.toFixed(3), paused: this.environment.paused, clouds: this.environment.cloudStyle };
    try {
      localStorage.setItem('murk.save', JSON.stringify(data));
    } catch (e) {
      /* private mode */
    }
  }

  restoreSave() {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem('murk.save') || 'null');
    } catch (e) {
      data = null;
    }
    if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.z)) return false;
    this.player.spawn(data.x, data.z, Number.isFinite(data.yaw) ? data.yaw : 0);
    // Standing on something (a bridge, a cap, an island): keep the saved height if it is near a surface.
    if (Number.isFinite(data.y) && data.y > this.player.position.y + 0.3) {
      const h = this.player.groundAt(data.x, data.z, data.y + 0.2);
      if (Math.abs(h - data.y) < 0.6) this.player.position.y = h;
    }
    this.player.pitch = Number.isFinite(data.pitch) ? data.pitch : 0;
    this.player.updateCamera(0);
    if (Number.isFinite(data.time)) {
      this.environment.setTime(data.time);
      this.environment.paused = !!data.paused;
    }
    return true;
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

  openFeedback(clip = null) {
    this.feedbackOpen = true;
    this.feedback.show(clip);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // Ends a clip and opens the note with it. feedbackOpen is set at once so
  // the menu stays away while the recorder finishes writing.
  async endRecording() {
    this.feedbackOpen = true;
    const clip = await this.feedback.stopRecording();
    this.openFeedback(clip);
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
    // The pixelated modes: 2×2 box filter down to the pixel grid, then frame
    // blending to steady it. Both idle when pixels are off.
    this.pixelate = new PixelatePass();
    this.composer.addPass(this.pixelate);
    this.temporal = new TemporalPass();
    this.composer.addPass(this.temporal);
    this.composer.addPass(new OutputPass());
    this.applyPixelTuning();
  }

  // What else changes with the pixel level: the wind animates in steps, blades
  // broaden to hold their pixels, and frames blend so a pixel is slow to flip.
  applyPixelTuning() {
    const L = this.pixelLevel;
    if (this.wind) this.wind.stepHz = [0, 18, 12][L];
    if (this.grass) this.grass.uniforms.uPixelWiden.value = [1, 1.8, 2.6][L];
    if (this.pixelate) this.pixelate.enabled = L > 0;
    // Far leaf cards lose their alpha-tested coverage at the coarse grid; boost it.
    if (this.forest) this.forest.uniforms.uLeafBoost.value = [0, 1.5, 3.0][L];
    if (this.temporal) {
      this.temporal.baseWeight = [0, 0.42, 0.55][L];
      this.temporal.enabled = L > 0;
      this.temporal.fresh = true;
    }
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
      // F: a tap opens a note with a screenshot; holding it records a clip
      // until release. A clip started from the note panel stops on the next tap.
      const fb = this.feedback;
      if (input.wasPressed('KeyF')) {
        if (fb.recording && !fb.recording.hold) this.endRecording();
        else if (!fb.recording) this.fDownAt = this.elapsed;
      }
      if (this.fDownAt !== undefined && !fb.recording && input.down('KeyF') && this.elapsed - this.fDownAt > 0.3) {
        this.fDownAt = undefined;
        fb.startRecording({ hold: true });
      }
      if (input.wasReleased('KeyF')) {
        if (fb.recording?.hold) this.endRecording();
        else if (this.fDownAt !== undefined) this.openFeedback();
        this.fDownAt = undefined;
      }
      if (input.wasPressed('KeyC')) this.cycleClouds();
      if (input.wasPressed('KeyP')) this.setPixelLevel((this.pixelLevel + 1) % PIXEL_LEVELS.length);
      if (input.wasPressed('KeyM')) this.map.show(!this.map.open);
      if (input.wasPressed('F3')) {
        this.perf.show = !this.perf.show;
        this.perf.el.classList.toggle('hidden', !this.perf.show);
      }
      if (!this.map.open) this.player.update(dt);
      else this.map.update(dt, input);
      const dest = this.portals.update(dt, this.player.position);
      if (dest) this.travelTo(dest);
    }

    this.updateWorld(dt);
    this.hud.update(this.player.yaw, this.environment.timeLabel());
    this.hud.setSprintLock(this.player.sprintLock);
    this.saveTimer = (this.saveTimer || 0) + dt;
    if (this.saveTimer > 2) {
      this.saveTimer = 0;
      if (this.active) this.save();
    }

    if (this.temporal && this.temporal.enabled) {
      // Blend less the faster the view turns or moves, so nothing smears.
      const cam = this.camera;
      const dir = cam.getWorldDirection(this._tDir || (this._tDir = new THREE.Vector3()));
      const ang = this._pDir ? this._pDir.angleTo(dir) / Math.max(dt, 1e-3) : 0;
      const mv = this._pPos ? this._pPos.distanceTo(cam.position) / Math.max(dt, 1e-3) : 0;
      (this._pDir || (this._pDir = new THREE.Vector3())).copy(dir);
      (this._pPos || (this._pPos = new THREE.Vector3())).copy(cam.position);
      const calm = (1 - THREE.MathUtils.smoothstep(ang, 0.35, 2.5)) * (1 - THREE.MathUtils.smoothstep(mv, 2.5, 9));
      this.temporal.weight = (this.temporal.baseWeight || 0) * calm;
    }
    const t0 = performance.now();
    this.renderer.info.reset();
    this.render();
    this.updatePerf(dt, performance.now() - t0);
    input.endFrame();
  }

  // Adaptive quality: a ladder of live settings, stepped down while the
  // frame rate stays low and back up when there is headroom. The level is
  // remembered (with the preset it applies to), so the next visit starts
  // where this one settled instead of stuttering through the first seconds.
  //   down  ~3 s under 28 fps
  //   up    ~12 s at 55+ fps; kept only if it holds 45+ for the next 6 s,
  //         otherwise it reverts and waits longer before trying again
  // Past the bottom rung the next visit starts on a lighter preset; at the
  // top rung on a lighter preset with room to spare, on a heavier one.
  applyAdaptLevel(level, quiet = false) {
    const L = ADAPT_LADDER[level];
    const was = ADAPT_LADDER[this.adapt.level];
    this.adapt.level = level;
    this.baseRatio = Math.max(0.6, this.fullRatio * L.res);
    this.applyResolution();
    if (this.grass) this.grass.radiusScale = L.grass;
    if (this.composer) for (const pass of this.composer.passes) if (pass.strength !== undefined) pass.enabled = settings.bloom && L.bloom;
    rememberAdapt(QUALITY, level);
    if (!quiet && this.hud && was !== L) {
      // Say what changed: 'Smoother: resolution 72%', 'Sharper: bloom on'.
      const pct = (v) => `${Math.round(v * 100)}%`;
      const changes = [];
      if (L.res !== was.res) changes.push(L.res === 1 ? 'full resolution' : `resolution ${pct(L.res)}`);
      if (L.grass !== was.grass) changes.push(L.grass === 1 ? 'full grass distance' : `grass distance ${pct(L.grass)}`);
      if (L.bloom !== was.bloom) changes.push(L.bloom ? 'bloom on' : 'bloom off');
      this.hud.toast(`${level < ADAPT_LADDER.indexOf(was) ? 'Sharper' : 'Smoother'}: ${changes.join(', ')}`);
    }
  }

  adaptQuality(fps) {
    if (!this.active) return;
    const a = this.adapt;
    if (this.elapsed < a.settleUntil) {
      // Just stepped up: hold it only if it stays smooth.
      if (a.trial !== null && fps < 45) {
        this.applyAdaptLevel(a.trial);
        a.trial = null;
        a.settleUntil = this.elapsed + 4;
        a.nextTry = this.elapsed + a.backoff;
        a.backoff = Math.min(a.backoff * 2, 480);
      }
      return;
    }
    a.trial = null;
    if (fps < 28) {
      a.fast = 0;
      if (++a.slow < 6) return; // ~3 s of slow frames
      a.slow = 0;
      a.settleUntil = this.elapsed + 4;
      if (a.level < ADAPT_LADDER.length - 1) {
        this.applyAdaptLevel(a.level + 1);
      } else {
        const i = PRESET_ORDER.indexOf(QUALITY);
        if (i >= 0 && i < PRESET_ORDER.length - 1 && !a.presetNoted) {
          a.presetNoted = true;
          rememberQuality(PRESET_ORDER[i + 1]);
          rememberAdapt(PRESET_ORDER[i + 1], 0);
          this.hud.toast(`Next visit will start on the ${PRESET_ORDER[i + 1]} preset`);
        }
      }
      return;
    }
    a.slow = Math.max(0, a.slow - 1);
    if (fps < 55 || this.elapsed < a.nextTry) {
      a.fast = 0;
      return;
    }
    if (a.level > 0) {
      if (++a.fast < 24) return; // ~12 s of headroom
      a.fast = 0;
      a.trial = a.level;
      a.settleUntil = this.elapsed + 6;
      this.applyAdaptLevel(a.level - 1);
      return;
    }
    // Top rung of a lighter preset and still plenty of room.
    const i = PRESET_ORDER.indexOf(QUALITY);
    if (i > 0 && !a.presetNoted && ++a.fast >= 60) {
      a.presetNoted = true;
      rememberQuality(PRESET_ORDER[i - 1]);
      rememberAdapt(PRESET_ORDER[i - 1], 1);
      this.hud.toast(`Running smoothly: next visit will start on the ${PRESET_ORDER[i - 1]} preset`);
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
      `quality ${QUALITY} · level ${this.adapt.level}/${ADAPT_LADDER.length - 1} (${ADAPT_LADDER[this.adapt.level].name})`,
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
    this.mushrooms.update(env.nightFactor);
    if (this.castleLights) {
      const lf = 0.9 + 0.1 * Math.sin(this.elapsed * 11.3);
      for (const l of this.castleLights) l.intensity = env.nightFactor * 9 * lf;
    }
    this.updateLanterns(env.nightFactor);
  }

  // Hand the pooled point lights to the lanterns nearest the player, fading
  // each with distance so a light never pops on or off.
  updateLanterns(night) {
    if (!this.lanternPool) return;
    const p = this.player.position;
    if (night < 0.01) {
      for (const l of this.lanternPool) l.visible = false;
      return;
    }
    const near = [];
    for (const q of this.lanternPosts) {
      const d2 = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d2 > 60 * 60) continue;
      near.push({ q, d2 });
    }
    near.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < this.lanternPool.length; i++) {
      const l = this.lanternPool[i];
      const n = near[i];
      if (!n) {
        l.visible = false;
        continue;
      }
      const d = Math.sqrt(n.d2);
      const fade = 1 - THREE.MathUtils.smoothstep(d, 35, 58);
      const flicker = 0.88 + 0.12 * Math.sin(this.elapsed * (9.7 + (i % 3) * 2.3) + n.q.x);
      l.position.copy(n.q);
      l.intensity = night * 7 * fade * flicker;
      l.visible = l.intensity > 0.01;
    }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  // Device pixels per CSS pixel: the preset's ratio, or twice the pixel grid
  // when pixelated (the pixelate pass averages each 2×2 block down to one).
  effectiveRatio() {
    const px = PIXEL_LEVELS[this.pixelLevel].px;
    return px ? 2 / px : this.baseRatio;
  }

  applyResolution() {
    const ratio = this.effectiveRatio();
    this.renderer.setPixelRatio(ratio);
    this.renderer.domElement.style.imageRendering = PIXEL_LEVELS[this.pixelLevel].px ? 'pixelated' : 'auto';
    if (this.composer) this.composer.setPixelRatio(ratio);
    this.onResize();
  }

  // Pixelation level: 0 is the plain image, higher is chunkier.
  set terrainDebug(v) {
    TERRAIN_DEBUG.value = v | 0;
  }

    setPixelLevel(i, { quiet = false } = {}) {
    i = Math.max(0, Math.min(PIXEL_LEVELS.length - 1, i | 0));
    this.pixelLevel = i;
    rememberPixelLevel(i);
    this.applyResolution();
    this.applyPixelTuning();
    if (!quiet && this.hud) this.hud.toast(`Pixels: ${PIXEL_LEVELS[i].name.toLowerCase()}`);
    window.dispatchEvent(new CustomEvent('murk:pixels', { detail: i }));
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
