import * as THREE from 'three';
import { regionAt } from './regions.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { smoothstep, mulberry32 } from '../util/noise.js';
import { settings } from '../core/settings.js';
import { applyCloudStyle, readCloudStyle } from './clouds.js';

const SHADOW_EXTENT = 70; // half-size of the sun's shadow frustum, metres
const LATITUDE_TILT = 0.6; // radians; noon sun sits ~56° up in the south (+z)
const SUNRISE = 5.5; // hours; the sun is up for 14 hours, so evenings linger
const DAY_LENGTH = 14;

// The sky's final output: soft-clip the in-scatter so a low sun grades into
// a glow rather than a white-out, and cap it so bloom never runs away. Goes
// on after the cloud style is spliced in (the splice replaces the tail).
function finishSkyFragment(fragment) {
  return fragment.replace(
    'gl_FragColor = vec4( texColor, 1.0 );',
    `{
      // Hue-preserving soft clip: compress luminance, keep the colour ratio,
      // so a bright noon sky stays blue instead of bleaching to white.
      float l = dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) );
      texColor *= ( l / ( 1.0 + l * 0.7 ) ) / max( l, 1e-4 );
    }
    {
      // By day the sky deepens to a saturated blue away from the horizon.
      float dayF = smoothstep( 0.1, 0.4, vSunDirection.y );
      float up = smoothstep( 0.02, 0.5, direction.y );
      texColor = mix( texColor, texColor * vec3( 0.6, 0.76, 1.04 ), dayF * up * 0.8 );
    }
    {
      // Golden hour: the whole horizon warms, not just the sun's side.
      float g = ( 1.0 - smoothstep( 0.02, 0.45, vSunDirection.y ) ) * smoothstep( -0.16, 0.0, vSunDirection.y );
      float hz = 1.0 - smoothstep( 0.0, 0.28, direction.y );
      texColor = mix( texColor, texColor * vec3( 1.2, 0.92, 0.78 ) + vec3( 0.16, 0.07, 0.03 ), g * hz * 0.75 );
    }
    {
      // Afterglow: for a while after sunset (and before sunrise) the horizon
      // around the sun keeps a band of apricot that fades up through rose to
      // violet, so dusk lingers instead of dropping straight to night.
      float below = smoothstep( 0.03, -0.05, vSunDirection.y ) * ( 1.0 - smoothstep( -0.14, -0.3, vSunDirection.y ) );
      vec2 sunH = normalize( vSunDirection.xz + vec2( 1e-5, 0.0 ) );
      vec2 dirH = normalize( direction.xz + vec2( 1e-5, 0.0 ) );
      // Straight away from the sun the dot rounds a hair below -1; pow() of
      // that negative is NaN on real GPUs, which painted a navy line down the
      // anti-sun meridian. Clamp, and cube by hand.
      float toward = clamp( 0.5 + 0.5 * dot( sunH, dirH ), 0.0, 1.0 );
      float band = exp( -max( direction.y, 0.0 ) * ( 5.0 + 9.0 * ( 1.0 - toward ) ) ) * smoothstep( -0.06, 0.01, direction.y );
      float hgt = clamp( direction.y * 6.0, 0.0, 1.0 );
      vec3 glowC = mix( vec3( 1.0, 0.52, 0.22 ), vec3( 0.62, 0.32, 0.55 ), hgt );
      float strength = below * band * ( 0.1 + 0.9 * toward * toward * toward );
      texColor += glowC * strength * 0.55;
    }
    // Guard before the clamp: clamp() turns NaN into 0, which would let the
    // navy floor below show through instead of tripping the guard.
    if ( any( isnan( texColor ) ) || any( isinf( texColor ) ) ) texColor = vec3( 0.5, 0.6, 0.7 );
    texColor = clamp( texColor, vec3( 0.0 ), vec3( 1.6 ) );
    // Night sky is deep navy, never pure black.
    texColor = max( texColor, vec3( 0.006, 0.009, 0.02 ) );
    gl_FragColor = vec4( texColor, 1.0 );`
  );
}

const C = (hex) => new THREE.Color(hex);
const PALETTE = {
  sunHigh: C(0xfff1d6),
  sunLow: C(0xff7a2e),
  moon: C(0x8fa8ea),
  dusk: C(0xff6a6a),
  fogDay: C(0xb9cde4),
  fogGolden: C(0xe2a383),
  fogNight: C(0x0b0f19),
  hemiSkyDay: C(0xc4d2e4), // the open sky is blue: shade under a noon sun is cool, not grey-brown
  hemiSkyGolden: C(0xf0b08a),
  hemiSkyNight: C(0x5a6fa8),
  hemiGround: C(0x7e8660), // bounce off a meadow is olive-green, not brown: shaded slopes stay grass
  hemiGroundNight: C(0x2a3250),
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
      mistFill: 0,
      underwater: 0,
      contrast: 1,
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
      ;
    this.cloudStyle = readCloudStyle();
    this.baseSkyFragment = this.sky.material.fragmentShader;
    this.sky.material.fragmentShader = finishSkyFragment(applyCloudStyle(this.baseSkyFragment, this.cloudStyle));
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
    this.sky.material.fragmentShader = finishSkyFragment(applyCloudStyle(this.baseSkyFragment, style));
    this.sky.material.needsUpdate = true;
    this.lastEnvSunDir.set(0, -5, 0); // re-render the light probe
  }

  setTime(hours) {
    this.timeOfDay = ((hours % 24) + 24) % 24;
  }

  computeSunDirection(hours, target) {
    // Rises due east (+x) at SUNRISE, sets due west (-x) DAY_LENGTH hours later.
    const theta = ((hours - SUNRISE) / DAY_LENGTH) * Math.PI;
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
    const skyU = this.sky.material.uniforms;
    const cov = skyU.cloudCoverage ? skyU.cloudCoverage.value : 0;
    if (skyU.cloudCoverage) skyU.cloudCoverage.value = 0; // the probe wants the light, not the clouds
    const target = this.pmrem.fromScene(this.envScene, 0.04, 0.1, 5000);
    if (skyU.cloudCoverage) skyU.cloudCoverage.value = cov;
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
    // Clouds move with the wind, a little faster in gusts (never a timelapse).
    this.skyTime = (this.skyTime || 0) + dt * (0.5 + (wind ? wind.uniforms.uWindStrength.value * 0.6 : 0.5));
    this.focusHeight = focus.y;

    // Inside a realm, its palette takes over; the moonlit realm is always night.
    const realm = regionAt(focus.x, focus.z);
    const rw = realm.region ? realm.weight : 0;
    const nightRealm = realm.region && realm.region.night ? rw : 0;
    const sunTime = nightRealm > 0 ? THREE.MathUtils.lerp(this.timeOfDay, 0.5, nightRealm) : this.timeOfDay;
    const sunDir = this.computeSunDirection(sunTime, this.sunDir);
    const elev = sunDir.y;
    if (this.sky.material.uniforms.time) this.sky.material.uniforms.time.value = this.skyTime || 0;

    // A long twilight: the light fails slowly after the sun has set.
    const day = smoothstep(-0.2, 0.1, elev);
    // Golden hour runs from a fair way up the sky down to the horizon.
    const golden = (1 - smoothstep(0.02, 0.45, elev)) * smoothstep(-0.14, 0.0, elev);
    this.nightFactor = 1 - smoothstep(-0.2, 0.02, elev);

    // Sky scattering: hazier and redder as the sun nears the horizon.
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(sunDir).multiplyScalar(450000);
    // Clear, deep-blue zenith by day; hazier and redder toward the horizon at low sun.
    u.turbidity.value = THREE.MathUtils.lerp(2.0, 5.0, golden);
    u.rayleigh.value = THREE.MathUtils.lerp(1.9, 2.8, golden);
    u.mieCoefficient.value = THREE.MathUtils.lerp(0.0022, 0.0048, golden);

    // Direct light: the sun by day, a dim cool moon by night. Their intensities
    // both pass through ~0 around the horizon, hiding the swap in direction.
    const sunI = 4.4 * smoothstep(-0.03, 0.14, elev) * (0.72 + 0.28 * smoothstep(0.1, 0.5, elev));
    // Civil twilight: with the sun just under the horizon the sky on that side
    // still lights the land, a dim rose rim light from low in the west (or
    // east), so dusk and dawn are not a flat window between sun and moon.
    const duskI = 1.1 * smoothstep(-0.17, -0.06, elev) * (1 - smoothstep(-0.06, 0.0, elev));
    const moonI = 2.0 * smoothstep(-0.1, -0.2, elev);
    if (sunI + duskI > moonI || moonI <= 0.0001) {
      this.lightDir.copy(sunDir);
      if (this.lightDir.y < 0.1) {
        this.lightDir.y = 0.1;
        this.lightDir.normalize();
      }
      this.sun.color.copy(PALETTE.sunLow).lerp(PALETTE.sunHigh, smoothstep(0.04, 0.6, elev));
      this.sun.color.lerp(PALETTE.dusk, duskI / (sunI + duskI + 1e-6));
      this.sun.intensity = sunI + duskI;
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
    // By night the ground bounce is moonlit blue-grey, so grass and stone go
    // cool and silver instead of khaki.
    this.hemi.groundColor.copy(PALETTE.hemiGroundNight).lerp(this._tmpColor.copy(PALETTE.hemiGround), day);
    // Twilight keeps a fair amount of sky light so dusk reads as dusk, not black.
    const twilight = smoothstep(-0.2, 0.0, elev) * (1 - day);
    // Moonlit stone in the moon's shadow still reads pale: a little more sky light by night.
    this.hemi.intensity = 0.56 + 0.16 * day + 0.45 * twilight + 0.14 * (1 - day);
    this.scene.environmentIntensity = 0.1 + 0.26 * day;

    // Atmosphere pass settings for this time of day.
    const a = this.atmosphere;
    const low = 1 - smoothstep(0.05, 0.45, elev); // sun near the horizon
    // The glow sits on the true sun, not the clamped twilight light direction.
    a.sunDir.copy(sunDir);
    // The glow goes with the disc: once the sun is under the horizon the sky
    // dome's afterglow takes over (a screen-space glow would sit on the grass).
    a.sunVisible = smoothstep(-0.03, 0.02, elev);
    // Glow colour: white-gold high, apricot low.
    a.sunColor.setRGB(1.0, 0.93, 0.8).lerp(this._tmpColor.setRGB(1.0, 0.72, 0.45), low);
    a.shaft = 0.25 + 0.85 * low; // god rays: strongest at a low sun, where trees and roofs cut them
    a.glow = 0.5 + 1.1 * low;
    a.disc = 9.0;
    // Haze: pale blue-white by day, warm amber-rose at low sun, deep blue at night.
    // The haze darkens faster than the light does, so at twilight the far hills
    // are not a pale pink wall brighter than the sky above them; toward the
    // set sun it carries a little of the afterglow's rose.
    const dayFog = smoothstep(-0.04, 0.08, elev);
    a.fogColor.copy(PALETTE.fogNight).lerp(this._tmpColor.copy(PALETTE.fogDay).lerp(PALETTE.fogGolden, golden * 0.85), dayFog);
    a.fogSunColor.copy(PALETTE.fogNight).lerp(this._tmpColor2.setRGB(0.3, 0.14, 0.2), duskI / 1.1);
    a.fogSunColor.lerp(this._tmpColor.setRGB(0.86, 0.84, 0.78).lerp(this._tmpColor2.setRGB(0.82, 0.58, 0.4), low), dayFog);
    // Clear air at midday; haze thickens as the sun drops.
    a.fogDensity = 0.00075 + 0.0011 * low * dayFog + 0.0003 * (1 - day);
    a.fogHeight = this.focusHeight - 6;
    a.fogFalloff = 0.015;
    // Mist lies in the valley at dawn and dusk and thins through the day.
    a.groundMist = 0.07 + 0.14 * low * day + 0.14 * (1 - day);
    a.mistFill = 0;
    a.saturation = THREE.MathUtils.lerp(0.98, 1.12 + 0.06 * day + 0.1 * golden, day);
    // Shadows lift warm by day and blue by night (a warm lift browned the night sky).
    this._tmpColor2.setRGB(0.012, 0.009, 0.006).lerp(this._tmpColor.setRGB(0.03, 0.018, 0.01), low);
    a.lift.setRGB(0.004, 0.008, 0.022).lerp(this._tmpColor2, day);
    a.vignette = 0.22;
    a.moon = 0;
    // Punchier by day; flat light at dusk and night stays soft.
    a.contrast = 1.0 + 0.14 * day * (1 - 0.5 * golden) + 0.06 * (1 - day);
    // By night the pass draws the moon instead: a small pale disc, faint halo.
    if (moonI > 0.0001 && sunI <= 0.0001) {
      // The moon disc is drawn from the moon's own direction even while the
      // dusk light still comes from the sunset side.
      a.sunDir.copy(sunDir).negate();
      a.sunDir.y = Math.max(a.sunDir.y, 0.25);
      a.sunDir.normalize();
      a.sunVisible = smoothstep(-0.05, -0.16, elev);
      a.sunColor.setRGB(0.8, 0.86, 0.98);
      a.disc = 0.75; // below clipping, so the maria and craters read
      a.moon = 1;
      a.glow = 0.07;
      a.shaft = 0.03;
    }
    if (rw > 0) {
      const P = realm.region.palette;
      const k = rw * (0.12 + 0.7 * day);
      a.fogColor.lerp(this._tmpColor.setRGB(P.fog[0], P.fog[1], P.fog[2]), k);
      a.fogSunColor.lerp(this._tmpColor.setRGB(P.fog[0] * 1.05, P.fog[1] * 1.02, P.fog[2] * 0.95), k * 0.6);
      a.fogDensity *= THREE.MathUtils.lerp(1, P.fogDensity, rw);
      a.saturation = THREE.MathUtils.lerp(a.saturation, P.saturation, rw);
      if (realm.region.mist) {
        a.groundMist = Math.max(a.groundMist, 0.95 * rw);
        a.mistFill = rw;
        a.fogHeight = THREE.MathUtils.lerp(a.fogHeight, realm.region.mist.top - 9, rw);
      }
    }

    this.lightLevel = 0.12 + 0.88 * day;

    // Eye adaptation: open up the exposure as the light fails.
    const dayExposure = THREE.MathUtils.lerp(0.8, 0.6, smoothstep(0.0, 0.3, elev));
    this.exposure = THREE.MathUtils.lerp(1.45, dayExposure, smoothstep(-0.18, -0.02, elev));

    const starFactor = smoothstep(-0.04, -0.2, elev) * 0.85;
    this.stars.material.opacity = starFactor;
    if (this.stars.material.userData.shader) this.stars.material.userData.shader.uniforms.uTime.value = this.skyTime || 0;
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
  // Per star: size (a few bright, most faint), twinkle phase and rate.
  const star = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = random();
    star[i * 3] = r < 0.05 ? 2.6 + random() * 0.9 : r < 0.25 ? 1.9 + random() * 0.4 : 1.4 + random() * 0.3;
    star[i * 3 + 1] = random() * 6.2832;
    star[i * 3 + 2] = 0.15 + random() * 0.35; // radians per second: a wink takes seconds, not frames
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('aStar', new THREE.BufferAttribute(star, 3));
  const m = new THREE.PointsMaterial({
    size: 2.4,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  // Soft round sprites (a hard 1-2 px point shimmers as the view moves), dim
  // toward the horizon where the air is thickest, and a slow twinkle that
  // only a handful of stars are doing at any moment.
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    m.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aStar;\nuniform float uTime;\nvarying float vElev;\nvarying float vTwinkle;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvElev = normalize( position ).y;\nvTwinkle = smoothstep( 0.82, 1.0, sin( uTime * aStar.z + aStar.y ) );')
      .replace('gl_PointSize = size;', 'gl_PointSize = aStar.x * ( 1.0 + 0.35 * vTwinkle );');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vElev;\nvarying float vTwinkle;')
      .replace(
        '#include <opaque_fragment>',
        `{
          float rr = length( gl_PointCoord - 0.5 ) * 2.0;
          diffuseColor.a *= exp( -rr * rr * 3.2 ) * smoothstep( 0.02, 0.35, vElev ) * ( 0.5 + 0.6 * vTwinkle );
        }
        #include <opaque_fragment>`
      );
  };
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = -1;
  return points;
}
