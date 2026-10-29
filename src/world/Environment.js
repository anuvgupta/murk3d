import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { smoothstep, mulberry32 } from '../util/noise.js';
import { settings } from '../core/settings.js';

const SHADOW_EXTENT = 70; // half-size of the sun's shadow frustum, metres
const LATITUDE_TILT = 0.6; // radians; noon sun sits ~56° up in the south (+z)

const C = (hex) => new THREE.Color(hex);
const PALETTE = {
  sunHigh: C(0xfff4e2),
  sunLow: C(0xff7a2e),
  moon: C(0x9bb2e6),
  fogDay: C(0xaebfd0),
  fogGolden: C(0xe0a07a),
  fogNight: C(0x0b0f19),
  hemiSkyDay: C(0xa9c3e0),
  hemiSkyGolden: C(0xf0b08a),
  hemiSkyNight: C(0x5a6fa8),
  hemiGround: C(0x4a4230),
};

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    this.timeOfDay = 17.0; // hours; begin in the late-afternoon light
    this.timeScale = 1 / 60; // game hours per real second (24-minute day)
    this.paused = false;

    this.sunDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.nightFactor = 0;
    this.lightLevel = 1;
    this.exposure = 0.55;

    // Sky dome with built-in clouds.
    this.sky = new Sky();
    this.sky.scale.setScalar(9000);
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.mieDirectionalG.value = 0.86;
    if (u.cloudCoverage) {
      u.cloudCoverage.value = 0.42;
      u.cloudDensity.value = 0.45;
    }

    // A second sky in its own scene, rendered into the image-based lighting.
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.material = this.sky.material;
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = null;
    this.envTimer = 0;
    this.lastEnvSunDir = new THREE.Vector3(0, -2, 0);

    // Sun (or moon, at night) — the one shadow-casting light.
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    const sc = this.sun.shadow.camera;
    sc.left = -SHADOW_EXTENT;
    sc.right = SHADOW_EXTENT;
    sc.top = SHADOW_EXTENT;
    sc.bottom = -SHADOW_EXTENT;
    sc.near = 1;
    sc.far = 900;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xaebfd0, 0.0011);

    this.stars = createStars();
    scene.add(this.stars);

    this._lightRot = new THREE.Matrix4();
    this._lightRotInv = new THREE.Matrix4();
    this._tmp = new THREE.Vector3();
    this._color = new THREE.Color();

    this.update(0, new THREE.Vector3());
    this.refreshEnvironment();
  }

  setTime(hours) {
    this.timeOfDay = ((hours % 24) + 24) % 24;
  }

  computeSunDirection(hours, target) {
    // 06:00 rises due east (+x), 18:00 sets due west (-x).
    const theta = ((hours - 6) / 12) * Math.PI;
    return target
      .set(Math.cos(theta), Math.sin(theta) * Math.cos(LATITUDE_TILT), Math.sin(theta) * Math.sin(LATITUDE_TILT))
      .normalize();
  }

  refreshEnvironment() {
    const u = this.sky.material.uniforms;
    const disc = u.showSunDisc;
    if (disc) disc.value = false;
    const target = this.pmrem.fromScene(this.envScene, 0, 0.1, 5000);
    if (disc) disc.value = true;
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = target;
    this.scene.environment = target.texture;
    this.lastEnvSunDir.copy(this.sunDir);
  }

  update(dt, focus) {
    if (!this.paused) this.setTime(this.timeOfDay + dt * this.timeScale);

    const sunDir = this.computeSunDirection(this.timeOfDay, this.sunDir);
    const elev = sunDir.y;

    const day = smoothstep(-0.1, 0.12, elev);
    const golden = (1 - smoothstep(0.03, 0.4, elev)) * smoothstep(-0.12, 0.0, elev);
    this.nightFactor = 1 - smoothstep(-0.12, 0.05, elev);

    // Sky scattering: hazier and redder as the sun nears the horizon.
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(sunDir).multiplyScalar(450000);
    u.turbidity.value = THREE.MathUtils.lerp(3.2, 8.5, golden);
    u.rayleigh.value = THREE.MathUtils.lerp(1.1, 2.6, golden);
    u.mieCoefficient.value = THREE.MathUtils.lerp(0.003, 0.007, golden);

    // Direct light: the sun by day, a dim cool moon by night. Their intensities
    // both pass through ~0 around the horizon, hiding the swap in direction.
    const sunI = 3.4 * smoothstep(-0.03, 0.14, elev);
    const moonI = 1.6 * smoothstep(-0.03, -0.14, elev);
    if (sunI > 0.0001 || moonI <= 0.0001) {
      this.lightDir.copy(sunDir);
      this.sun.color.copy(PALETTE.sunLow).lerp(PALETTE.sunHigh, smoothstep(0.0, 0.5, elev));
      this.sun.intensity = sunI;
    } else {
      this.lightDir.copy(sunDir).negate();
      this.lightDir.y = Math.max(this.lightDir.y, 0.25);
      this.lightDir.normalize();
      this.sun.color.copy(PALETTE.moon);
      this.sun.intensity = moonI;
    }

    // Keep the shadow frustum on the player, snapped to whole shadow texels to
    // stop shadow edges shimmering as we move.
    this._lightRot.lookAt(this._tmp.set(0, 0, 0), this.lightDir.clone().negate(), THREE.Object3D.DEFAULT_UP);
    this._lightRotInv.copy(this._lightRot).invert();
    const texel = (SHADOW_EXTENT * 2) / settings.shadowMapSize;
    const snapped = this._tmp.copy(focus).applyMatrix4(this._lightRotInv);
    snapped.x = Math.round(snapped.x / texel) * texel;
    snapped.y = Math.round(snapped.y / texel) * texel;
    snapped.applyMatrix4(this._lightRot);
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(this.lightDir, 400);
    this.sun.target.updateMatrixWorld();

    // Ambient terms.
    const c = this._color;
    c.copy(PALETTE.hemiSkyDay).lerp(PALETTE.hemiSkyGolden, golden * 0.7);
    this.hemi.color.copy(PALETTE.hemiSkyNight).lerp(c, day);
    this.hemi.groundColor.copy(PALETTE.hemiGround).multiplyScalar(0.25 + 0.75 * day);
    // Twilight keeps a fair amount of sky light so dusk reads as dusk, not black.
    const twilight = smoothstep(-0.2, 0.0, elev) * (1 - day);
    this.hemi.intensity = 0.55 + 0.2 * day + 0.5 * twilight;
    this.scene.environmentIntensity = 0.15 + 0.55 * day;

    c.copy(PALETTE.fogDay).lerp(PALETTE.fogGolden, golden);
    this.scene.fog.color.copy(PALETTE.fogNight).lerp(c, day);

    this.lightLevel = 0.12 + 0.88 * day;

    // Eye adaptation: open up the exposure as the light fails.
    this.exposure = THREE.MathUtils.lerp(1.5, 0.55, smoothstep(-0.18, 0.3, elev));

    const starFactor = smoothstep(-0.04, -0.2, elev);
    this.stars.material.opacity = starFactor;
    this.stars.visible = starFactor > 0.01;
    this.stars.rotation.y = (this.timeOfDay / 24) * Math.PI * 2 * 0.25;
    this.stars.position.copy(focus);
    this.sky.position.copy(focus);

    // Re-render the lighting probe as the sun moves.
    this.envTimer -= dt;
    if (this.envTimer <= 0 && this.lastEnvSunDir.distanceToSquared(sunDir) > 1e-5) {
      this.envTimer = 0.5;
      this.refreshEnvironment();
    }
  }

  timeLabel() {
    const t = this.timeOfDay;
    const h = Math.floor(t);
    const m = Math.floor((t - h) * 60);
    const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    let name;
    if (t < 4.5) name = 'Deep Night';
    else if (t < 6.5) name = 'Dawn';
    else if (t < 11) name = 'Morning';
    else if (t < 14) name = 'Midday';
    else if (t < 17.5) name = 'Afternoon';
    else if (t < 19) name = 'Dusk';
    else if (t < 22) name = 'Evening';
    else name = 'Deep Night';
    return `${name} · ${clock}${this.paused ? ' · paused' : ''}`;
  }
}

function createStars() {
  const random = mulberry32(42);
  const count = 3000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.set(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);
    if (v.lengthSq() > 1 || v.lengthSq() < 0.01) {
      i--;
      continue;
    }
    v.normalize();
    v.y = Math.abs(v.y) * 0.95 + 0.05;
    v.normalize().multiplyScalar(8000);
    positions.set([v.x, v.y, v.z], i * 3);
    const b = 0.4 + random() * 0.6;
    const warm = random();
    colors.set([b * (0.85 + warm * 0.15), b * 0.9, b * (1 - warm * 0.15)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.PointsMaterial({
    size: 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = -1;
  return points;
}
