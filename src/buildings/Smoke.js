import * as THREE from 'three';
import { smokeTexture } from './textures.js';

// Chimney smoke for any number of chimneys as one point cloud: one draw call.
export class Smoke {
  constructor(emitters, { perEmitter = 18 } = {}) {
    this.emitters = emitters;
    const count = Math.max(1, emitters.length * perEmitter);
    this.count = count;
    const geometry = new THREE.BufferGeometry();
    this.attrs = {
      position: new THREE.BufferAttribute(new Float32Array(count * 3), 3),
      size: new THREE.BufferAttribute(new Float32Array(count), 1),
      opacity: new THREE.BufferAttribute(new Float32Array(count), 1),
      spin: new THREE.BufferAttribute(new Float32Array(count), 1),
    };
    for (const [name, attr] of Object.entries(this.attrs)) {
      attr.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attr);
    }
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: smokeTexture() },
        color: { value: new THREE.Color(0xbab3aa) },
        pixelScale: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float opacity;
        attribute float spin;
        uniform float pixelScale;
        varying float vOpacity;
        varying float vSpin;
        void main() {
          vOpacity = opacity;
          vSpin = spin;
          vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
          gl_PointSize = size * pixelScale / -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 color;
        varying float vOpacity;
        varying float vSpin;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos( vSpin );
          float s = sin( vSpin );
          uv = mat2( c, -s, s, c ) * uv + 0.5;
          gl_FragColor = vec4( color, texture2D( map, uv ).a * vOpacity );
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.puffs = Array.from({ length: count }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), age: Infinity, life: 1, spin: 0 }));
    this.timers = emitters.map(() => Math.random());
    this.next = 0;
  }

  setViewport(heightPx, fovDeg) {
    this.material.uniforms.pixelScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  update(dt, wind, lightLevel) {
    // Chimneys stand in the sheltered village: they feel the local wind.
    const strength = wind.strengthAt ? wind.strengthAt(0, 0) : wind.uniforms.uWindStrength.value;
    const dir = wind.direction;
    this.emitters.forEach((e, k) => {
      this.timers[k] -= dt;
      if (this.timers[k] > 0) return;
      this.timers[k] = 0.4 + Math.random() * 0.3;
      const p = this.puffs[this.next];
      this.next = (this.next + 1) % this.count;
      p.age = 0;
      p.life = 5 + Math.random() * 3;
      p.p.copy(e);
      p.v.set((Math.random() - 0.5) * 0.2, 0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2);
      p.spin = Math.random() * Math.PI * 2;
    });
    const { position, size, opacity, spin } = this.attrs;
    this.puffs.forEach((p, i) => {
      if (p.age < p.life) {
        p.age += dt;
        // Smoke leans downwind, more so in stronger wind.
        p.v.x += dir.x * strength * 1.4 * dt;
        p.v.z += dir.y * strength * 1.4 * dt;
        p.v.y *= 1 - dt * (0.12 + strength * 0.3);
        p.p.addScaledVector(p.v, dt);
      }
      const t = Math.min(1, p.age / p.life);
      position.setXYZ(i, p.p.x, p.p.y, p.p.z);
      size.setX(i, 0.7 + t * 4.5);
      opacity.setX(i, p.age < p.life ? Math.min(1, t * 6) * (1 - t) * 0.5 : 0);
      spin.setX(i, p.spin);
    });
    for (const attr of Object.values(this.attrs)) attr.needsUpdate = true;
    const tint = 0.25 + lightLevel * 0.75;
    this.material.uniforms.color.value.setRGB(0.73 * tint, 0.7 * tint, 0.67 * tint);
  }
}
