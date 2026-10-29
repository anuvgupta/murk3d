import * as THREE from 'three';
import { regionAt } from './regions.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { smoothstep, mulberry32 } from '../util/noise.js';
import { settings } from '../core/settings.js';
import { applyCloudStyle, readCloudStyle } from './clouds.js';

const SHADOW_EXTENT = 70; // half-size of the sun's shadow frustum, metres
const LATITUDE_TILT = 0.6; // radians; noon sun sits ~56° up in the south (+z)

const C = (hex) => new THREE.Color(hex);
const PALETTE = {
  sunHigh: C(0xfff1d6),
  sunLow: C(0xff7a2e),
  moon: C(0x9bb2e6),
  fogDay: C(0xd4dde6),
  fogGolden: C(0xd9a070),
  fogNight: C(0x0b0f19),
  hemiSkyDay: C(0xd3d8d6),
  hemiSkyGolden: C(0xf0b08a),
  hemiSkyNight: C(0x5a6fa8),
  hemiGround: C(0x7a6240),
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
    this.focusHeight = 0;
    this._tmpColor = new THREE.Color();
    this._tmpColor2 = new THREE.Color();
    this.atmosphere = {
      sunDir: new THREE.Vector3(0, 1, 0),
      sunColor: new THREE.Color(),
      sunVisible: 0,
      fogColor: new THREE.Color(),
      fogSunColor: new THREE.Color(),
      fogDensity: 0.001,
      fogHeight: 0,
      fogFalloff: 0.02,
      groundMist: 0,
      shaft: 0,
      glow: 0,
      disc: 0,
      saturation: 1,
      lift: new THREE.Color(),
      vignette: 0,
    };

    // Sky dome with built-in clouds.
    this.sky = new Sky();
    this.sky.scale.setScalar(9000);
    // The stock disc is a hard 0.5° dot; make it a soft 2.5° orb with a corona.
    this.sky.material.fragmentShader = this.sky.material.fragmentShader
      .replace(
        'float sundisc = clamp( ( cosTheta - sunAngularDiameterCos ) * 50000.0, 0.0, 1.0 ) * showSunDisc;',
        `float sunAngle = acos( clamp( cosTheta, -1.0, 1.0 ) );
        float sundisc = ( smoothstep( 0.024, 0.012, sunAngle ) * 0.8 + exp( -sunAngle * 60.0 ) * 0.5 ) * showSunDisc;`
      )
      .replace(
        'vec3 sundiscColor = ( 760.0 * sundisc ) * min( vSunE * Fex, 80.0 );',
        'vec3 sundiscColor = ( 520.0 * sundisc ) * min( vSunE * Fex, 80.0 );'
      )
      .replace(
        'gl_FragColor = vec4( texColor, 1.0 );',
        `// Soft-clip the in-scatter so a low sun grades into a glow rather than a
        // white-out, and cap it so bloom never runs away.
        texColor = texColor / ( 1.0 + texColor * 0.9 );
        texColor = min( texColor, vec3( 1.5 ) );
        gl_FragColor = vec4( texColor, 1.0 );`
      );
    this.cloudStyle = readCloudStyle();
    this.baseSkyFragment = this.sky.material.fragmentShader;
    this.sky.material.fragmentShader = applyCloudStyle(this.baseSkyFragment, this.cloudStyle);
    this.sky.material.needsUpdate = true;
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.mieDirectionalG.value = 0.8;
    if (u.showSunDisc) u.showSunDisc.value = 0;
    if (u.cloudCoverage) {
      u.cloudCoverage.value = 0.45;
      u.cloudDensity.value = 0.5;
      u.cloudScale.value = 0.00028;
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
    sc.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    scene.add(this.hemi);


    this.stars = createStars();
    scene.add(this.stars);

    this._lightRot = new THREE.Matrix4();
    this._lightRotInv = new THREE.Matrix4();
    this._tmp = new THREE.Vector3();
    this._color = new THREE.Color();

    this.update(0, new THREE.Vector3());
    this.refreshEnvironment();
  }

  setCloudStyle(style) {
    this.cloudStyle = style;
    this.sky.material.fragmentShader = applyCloudStyle(this.baseSkyFragment, style);
    this.sky.material.needsUpdate = true;
    this.lastEnvSunDir.set(0, -5, 0); // re-render the light probe
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

  // The scene's image-based light. The sky probe is rendered without the sun
  // disc and with the haze (mie) turned down, so it carries sky colour and not
  // a second, blurred sun; the directional light is the sun.
  refreshEnvironment() {
    const u = this.sky.material.uniforms;
    const disc = u.showSunDisc;
    const mie = u.mieCoefficient.value;
    const mieG = u.mieDirectionalG.value;
    if (disc) disc.value = false;
    u.mieCoefficient.value = 0.0008;
    u.mieDirectionalG.value = 0.3;
    const target = this.pmrem.fromScene(this.envScene, 0.04, 0.1, 5000);
    if (disc) disc.value = true;
    u.mieCoefficient.value = mie;
    u.mieDirectionalG.value = mieG;
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = target;
    this.scene.environment = target.texture;
    this.envTexture = target.texture;
    this.lastEnvSunDir.copy(this.sunDir);
  }

  update(dt, focus, wind = null) {
    if (!this.paused) this.setTime(this.timeOfDay + dt * this.timeScale);
    // Clouds move with the wind, faster in gusts.
    this.skyTime = (this.skyTime || 0) + dt * (0.6 + (wind ? wind.uniforms.uWindStrength.value * 2.5 : 1.0));
    this.focusHeight = focus.y;

    // Inside a realm, its palette takes over; the moonlit realm is always night.
    const realm = regionAt(focus.x, focus.z);
    const rw = realm.region ? realm.weight : 0;
    const nightRealm = realm.region && realm.region.night ? rw : 0;
    const sunTime = nightRealm > 0 ? THREE.MathUtils.lerp(this.timeOfDay, 0.5, nightRealm) : this.timeOfDay;
    const sunDir = this.computeSunDirection(sunTime, this.sunDir);
    const elev = sunDir.y;
    if (this.sky.material.uniforms.time) this.sky.material.uniforms.time.value = this.skyTime || 0;

    const day = smoothstep(-0.1, 0.12, elev);
    const golden = (1 - smoothstep(0.03, 0.4, elev)) * smoothstep(-0.12, 0.0, elev);
    this.nightFactor = 1 - smoothstep(-0.12, 0.05, elev);

    // Sky scattering: hazier and redder as the sun nears the horizon.
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(sunDir).multiplyScalar(450000);
    u.turbidity.value = THREE.MathUtils.lerp(3.0, 5.5, golden);
    u.rayleigh.value = THREE.MathUtils.lerp(1.1, 2.6, golden);
    u.mieCoefficient.value = THREE.MathUtils.lerp(0.0035, 0.0045, golden);

    // Direct light: the sun by day, a dim cool moon by night. Their intensities
    // both pass through ~0 around the horizon, hiding the swap in direction.
    const sunI = 4.4 * smoothstep(-0.03, 0.14, elev);
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
    this.hemi.intensity = 0.48 + 0.12 * day + 0.45 * twilight;
    this.scene.environmentIntensity = 0.1 + 0.18 * day;

    // Atmosphere pass settings for this time of day.
    const a = this.atmosphere;
    const low = 1 - smoothstep(0.05, 0.45, elev); // sun near the horizon
    a.sunDir.copy(this.lightDir);
    a.sunVisible = this.sun.intensity > 0.05 && this.lightDir === this.lightDir ? smoothstep(-0.08, 0.02, elev) : 0;
    // Glow colour: white-gold high, apricot low.
    a.sunColor.setRGB(1.0, 0.93, 0.8).lerp(this._tmpColor.setRGB(1.0, 0.72, 0.45), low);
    a.shaft = 0.1 + 0.35 * low;
    a.glow = 0.35 + 0.9 * low;
    a.disc = 9.0;
    // Haze: pale blue-white by day, warm amber-rose at low sun, deep blue at night.
    a.fogColor.copy(PALETTE.fogNight).lerp(this._tmpColor.copy(PALETTE.fogDay).lerp(PALETTE.fogGolden, golden * 0.6), day);
    a.fogSunColor.copy(PALETTE.fogNight).lerp(this._tmpColor.setRGB(0.86, 0.84, 0.78).lerp(this._tmpColor2.setRGB(0.82, 0.58, 0.4), low), day);
    a.fogDensity = 0.0012 + 0.001 * low * day + 0.0003 * (1 - day);
    a.fogHeight = this.focusHeight - 6;
    a.fogFalloff = 0.025;
    // Mist lies in the valley at dawn and dusk and thins through the day.
    a.groundMist = 0.1 + 0.35 * low * day + 0.2 * (1 - day);
    a.saturation = 1.1 + 0.05 * day;
    a.lift.setRGB(0.012, 0.009, 0.006).lerp(this._tmpColor.setRGB(0.03, 0.018, 0.01), low);
    a.vignette = 0.22;
    if (rw > 0) {
      const P = realm.region.palette;
      const k = rw * (0.35 + 0.5 * day);
      a.fogColor.lerp(this._tmpColor.setRGB(P.fog[0], P.fog[1], P.fog[2]), k);
      a.fogSunColor.lerp(this._tmpColor.setRGB(P.fog[0] * 1.05, P.fog[1] * 1.02, P.fog[2] * 0.95), k * 0.6);
      a.fogDensity *= THREE.MathUtils.lerp(1, P.fogDensity, rw);
      a.saturation = THREE.MathUtils.lerp(a.saturation, P.saturation, rw);
      if (realm.region.mist) a.groundMist = Math.max(a.groundMist, 0.9 * rw);
    }

    this.lightLevel = 0.12 + 0.88 * day;

    // Eye adaptation: open up the exposure as the light fails.
    const dayExposure = THREE.MathUtils.lerp(0.8, 0.6, smoothstep(0.0, 0.3, elev));
    this.exposure = THREE.MathUtils.lerp(1.45, dayExposure, smoothstep(-0.18, -0.02, elev));

    const starFactor = smoothstep(-0.04, -0.2, elev) * 0.85;
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
  // Stars dim toward the horizon, where the air is thickest.
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vElev;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvElev = normalize( position ).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vElev;')
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= smoothstep( 0.02, 0.35, vElev );\n#include <opaque_fragment>');
  };
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = -1;
  return points;
}
