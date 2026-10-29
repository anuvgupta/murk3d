import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';

// Ambient particles around the player: drifting dust motes and pollen that
// catch the light, and a few faint sparks at night. One point cloud; the
// particles live in a box that follows the player and wrap round when they
// leave it, so the air is never empty.
const COUNT = 900;
const BOX = 28; // metres across
const HEIGHT = 10;

export class Motes {
  constructor({ wind, sun }) {
    this.wind = wind;
    const random = mulberry32(5);
    const positions = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (random() - 0.5) * BOX;
      positions[i * 3 + 1] = random() * HEIGHT;
      positions[i * 3 + 2] = (random() - 0.5) * BOX;
      seeds[i * 4] = random(); // phase
      seeds[i * 4 + 1] = 0.5 + random(); // size
      seeds[i * 4 + 2] = random(); // kind: < 0.08 sparks, else motes
      seeds[i * 4 + 3] = random(); // twinkle rate
    }
    this.offsets = positions;
    const geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3);
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
          // Motes glint when between the viewer and the sun; sparks glow at night.
          vec3 toCam = normalize( position - cameraPosition );
          float back = pow( max( dot( toCam, uSunDir ), 0.0 ), 3.0 );
          float twinkle = 0.55 + 0.45 * sin( uTime * ( 1.5 + aSeed.w * 3.0 ) + aSeed.x * 6.283 );
          float mote = ( 0.25 + 0.75 * back ) * twinkle * ( 1.0 - uNight * 0.6 );
          vAlpha = mix( mote, twinkle * uNight, spark );
          // Fade with distance so they never read as a wall of dots.
          float d = -mv.z;
          vAlpha *= smoothstep( 1.0, 3.0, d ) * ( 1.0 - smoothstep( 10.0, 16.0, d ) );
          gl_PointSize = ( 0.035 + 0.025 * aSeed.y ) * mix( 1.0, 1.8, spark ) * uPixelScale / d;
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
          float a = exp( -r * r * 4.0 ) * vAlpha;
          vec3 mote = mix( vec3( 0.9, 0.86, 0.72 ), uSunColor / max( 0.001, length( uSunColor ) ), 0.5 ) * ( 0.3 + 0.7 * uLight );
          vec3 spark = vec3( 1.0, 0.75, 0.4 );
          gl_FragColor = vec4( mix( mote, spark, vKind ), a * 0.55 );
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
    for (let i = 0; i < COUNT; i++) {
      const k = i * 3;
      // Drift downwind with a slow swirl and a gentle bob; wrap inside the box.
      off[k] += dx + Math.sin(this.time * 0.7 + i) * 0.12 * dt;
      off[k + 2] += dz + Math.cos(this.time * 0.6 + i * 1.3) * 0.12 * dt;
      off[k + 1] += Math.sin(this.time * 0.5 + i * 0.7) * 0.08 * dt + (i % 11 === 0 ? 0.3 * dt : 0.0);
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
    this.posAttr.needsUpdate = true;
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uNight.value = night;
    this.material.uniforms.uLight.value = light;
  }
}
