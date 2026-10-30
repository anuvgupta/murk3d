import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';

// Ambient particles around the player: drifting dust motes and pollen that
// catch the light, and a few faint sparks at night. One point cloud; the
// particles live in a box that follows the player and wrap round when they
// leave it, so the air is never empty.
const COUNT = 1500; // particles
const TRAIL = 2; // ghost points behind each trailing particle
const BOX = 28; // metres across
const HEIGHT = 10;

export class Motes {
  constructor({ wind, sun }) {
    this.wind = wind;
    const random = mulberry32(5);
    const positions = new Float32Array(COUNT * 3);
    // Particles, then the trail ghosts: each trailing particle (kind 0.08-0.22)
    // owns TRAIL extra points drawn a little way back along its motion.
    const trailers = [];
    const seedsAll = [];
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (random() - 0.5) * BOX;
      positions[i * 3 + 1] = random() * HEIGHT;
      positions[i * 3 + 2] = (random() - 0.5) * BOX;
      const kind = random();
      // Sizes skew small: many fine specks, a few larger glowing motes.
      seedsAll.push(random(), Math.pow(random(), 1.6) * 1.2 + 0.15, kind, random());
      speeds[i] = 0.35 + Math.pow(random(), 1.5) * 1.6; // each drifts at its own pace
      if (kind >= 0.08 && kind < 0.22) trailers.push(i);
    }
    this.trailers = trailers;
    this.speeds = speeds;
    const total = COUNT + trailers.length * TRAIL;
    for (let t = 0; t < trailers.length; t++) {
      const i = trailers[t];
      for (let k = 0; k < TRAIL; k++) {
        // A ghost: same look as its particle, fainter the further back.
        seedsAll.push(seedsAll[i * 4], seedsAll[i * 4 + 1] * (0.85 - 0.25 * k), seedsAll[i * 4 + 2], -1 - k);
      }
    }
    const seeds = new Float32Array(seedsAll);
    this.offsets = positions;
    this.total = total;
    const geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(total * 3), 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.posAttr);
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelScale: { value: 1 },
        uSunDir: { value: sun.direction },
        uSunColor: { value: sun.color },
        uNight: { value: 0 },
        uLight: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform float uPixelScale;
        uniform vec3 uSunDir;
        uniform float uNight;
        varying float vAlpha;
        varying float vKind;
        void main() {
          vec4 mv = modelViewMatrix * vec4( position, 1.0 );
          float spark = step( aSeed.z, 0.08 );
          vKind = spark;
          // Trail ghosts carry a negative rate: fainter, and no twinkle of their own.
          float ghost = aSeed.w < 0.0 ? ( aSeed.w < -1.5 ? 0.22 : 0.45 ) : 1.0;
          float rate = max( aSeed.w, 0.3 );
          // Motes glint when between the viewer and the sun; sparks glow at night.
          vec3 toCam = normalize( position - cameraPosition );
          float back = pow( max( dot( toCam, uSunDir ), 0.0 ), 3.0 );
          float twinkle = 0.6 + 0.4 * sin( uTime * ( 0.8 + rate * 1.6 ) + aSeed.x * 6.283 );
          float mote = ( 0.3 + 0.8 * back ) * twinkle * ( 1.0 - uNight * 0.55 );
          vAlpha = mix( mote, twinkle * uNight, spark ) * ghost;
          // Fade with distance so they never read as a wall of dots.
          float d = -mv.z;
          vAlpha *= smoothstep( 1.0, 3.0, d ) * ( 1.0 - smoothstep( 10.0, 16.0, d ) );
          gl_PointSize = ( 0.012 + 0.03 * aSeed.y ) * mix( 1.0, 1.6, spark ) * uPixelScale / d;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunColor;
        uniform float uLight;
        varying float vAlpha;
        varying float vKind;
        void main() {
          float r = length( gl_PointCoord - 0.5 ) * 2.0;
          // A hot core with a soft glow round it.
          float a = ( exp( -r * r * 9.0 ) * 0.7 + exp( -r * r * 2.2 ) * 0.5 ) * vAlpha;
          vec3 mote = mix( vec3( 0.95, 0.9, 0.74 ), uSunColor / max( 0.001, length( uSunColor ) ), 0.5 ) * ( 0.35 + 0.75 * uLight );
          vec3 spark = vec3( 1.0, 0.78, 0.42 );
          gl_FragColor = vec4( mix( mote, spark, vKind ), a * 0.7 );
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.center = new THREE.Vector3();
    this.time = 0;
  }

  setViewport(heightPx, fovDeg) {
    this.material.uniforms.uPixelScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  update(dt, playerPos, terrain, night, light) {
    this.time += dt;
    const w = this.wind;
    const strength = w.uniforms.uWindStrength.value;
    const dx = w.direction.x * strength * 1.6 * dt;
    const dz = w.direction.y * strength * 1.6 * dt;
    const arr = this.posAttr.array;
    const off = this.offsets;
    const cx = playerPos.x;
    const cz = playerPos.z;
    const baseY = playerPos.y;
    const half = BOX / 2;
    const sp = this.speeds;
    const vel = this.vel || (this.vel = new Float32Array(COUNT * 3));
    for (let i = 0; i < COUNT; i++) {
      const k = i * 3;
      // Drift downwind at its own pace with a slow swirl and a gentle bob; wrap inside the box.
      const mx = dx * sp[i] + Math.sin(this.time * 0.7 * sp[i] + i) * 0.12 * dt;
      const mz = dz * sp[i] + Math.cos(this.time * 0.6 * sp[i] + i * 1.3) * 0.12 * dt;
      const my = Math.sin(this.time * 0.5 + i * 0.7) * 0.08 * dt + (i % 11 === 0 ? 0.3 * dt : 0.0);
      vel[k] = mx;
      vel[k + 1] = my;
      vel[k + 2] = mz;
      off[k] += mx;
      off[k + 2] += mz;
      off[k + 1] += my;
      if (off[k] > half) off[k] -= BOX;
      if (off[k] < -half) off[k] += BOX;
      if (off[k + 2] > half) off[k + 2] -= BOX;
      if (off[k + 2] < -half) off[k + 2] += BOX;
      if (off[k + 1] > HEIGHT) off[k + 1] -= HEIGHT;
      if (off[k + 1] < 0) off[k + 1] += HEIGHT;
      const x = cx + off[k];
      const z = cz + off[k + 2];
      // Sit above the local ground, not the player's height, so motes follow slopes.
      const ground = i % 3 === 0 ? terrain.heightAt(x, z) : baseY;
      arr[k] = x;
      arr[k + 1] = Math.max(ground, baseY - 3) + 0.2 + off[k + 1];
      arr[k + 2] = z;
    }
    // Trail ghosts sit a little way back along the particle's recent motion.
    const inv = dt > 1e-4 ? 1 / dt : 0;
    for (let t = 0; t < this.trailers.length; t++) {
      const i = this.trailers[t];
      const k = i * 3;
      for (let g = 0; g < TRAIL; g++) {
        const j = (COUNT + t * TRAIL + g) * 3;
        const back = (g + 1) * 0.18; // seconds behind
        arr[j] = arr[k] - vel[k] * inv * back;
        arr[j + 1] = arr[k + 1] - vel[k + 1] * inv * back;
        arr[j + 2] = arr[k + 2] - vel[k + 2] * inv * back;
      }
    }
    this.posAttr.needsUpdate = true;
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uNight.value = night;
    this.material.uniforms.uLight.value = light;
  }
}
