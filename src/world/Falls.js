import * as THREE from 'three';
import { REGIONS } from './regions.js';

// Waterfalls: a ribbon of water hugging the ground from a top point to a
// pool, with its own shader of streaks racing downward, foam where it
// steepens, and a soft white plume at the foot.
export class Falls {
  constructor({ terrain, noise }) {
    this.group = new THREE.Group();
    this.group.name = 'falls';
    this.material = new THREE.ShaderMaterial({
      uniforms: { uNoise: { value: noise }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aSteep;
        varying vec2 vUv;
        varying float vSteep;
        void main() {
          vUv = uv;
          vSteep = aSteep;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uNoise;
        uniform float uTime;
        varying vec2 vUv;
        varying float vSteep;
        void main() {
          // Streaks: noise scrolled down the fall, stretched along it; the
          // flow splits into ropes of water with glassy gaps between them.
          float t = uTime * ( 0.9 + 0.8 * vSteep );
          float s1 = texture( uNoise, vec2( vUv.x * 2.0, vUv.y * 0.35 - t * 0.5 ) ).r;
          float s2 = texture( uNoise, vec2( vUv.x * 5.0 + 0.3, vUv.y * 0.9 - t * 0.9 ) ).g;
          float s3 = texture( uNoise, vec2( vUv.x * 11.0 + 0.7, vUv.y * 2.2 - t * 1.6 ) ).a;
          float streak = smoothstep( 0.3, 0.8, s1 * 0.5 + s2 * 0.4 + s3 * 0.3 );
          float rope = smoothstep( 0.35, 0.65, texture( uNoise, vec2( vUv.x * 3.0 + 0.2, vUv.y * 0.12 - t * 0.08 ) ).b );
          vec3 water = vec3( 0.5, 0.68, 0.76 );
          vec3 foam = vec3( 0.96, 0.98, 1.0 );
          vec3 col = mix( water, foam, streak * ( 0.2 + 0.8 * vSteep ) );
          // Ragged edges that waver, not a ruled strip; the bottom whitens into the plume.
          float wobble = ( texture( uNoise, vec2( vUv.y * 1.5 - t * 0.3, 0.3 ) ).r - 0.5 ) * 0.16;
          float edge = smoothstep( 0.0, 0.22, vUv.x + wobble ) * smoothstep( 1.0, 0.78, vUv.x - wobble );
          float plume = smoothstep( 0.72, 1.0, vUv.y );
          col = mix( col, foam, plume * 0.6 );
          // On gentle ground the water is a shallow glassy race, not a white sheet.
          float alpha = ( 0.3 + 0.7 * streak ) * ( 0.55 + 0.45 * rope ) * edge * mix( 0.3, 1.0, vSteep );
          alpha *= 1.0 - plume * 0.45;
          // Spray: the plume breaks into drifting flecks.
          float spray = smoothstep( 0.6, 0.9, texture( uNoise, vec2( vUv.x * 6.0 + t * 0.2, vUv.y * 3.0 - t * 0.6 ) ).g ) * plume;
          col = mix( col, foam, spray );
          alpha = max( alpha, spray * 0.7 * edge );
          gl_FragColor = vec4( col, alpha );
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const R of REGIONS) {
      for (const f of R.falls || []) this.build(terrain, R.x + f.from.dx, R.z + f.from.dz, R.x + f.to.dx, R.z + f.to.dz, f.w);
    }
  }

  build(terrain, x0, z0, x1, z1, w) {
    const rows = 24;
    const positions = [];
    const uvs = [];
    const steep = [];
    const indices = [];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;
    let prevY = terrain.heightAt(x0, z0);
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const x = x0 + dx * t;
      const z = z0 + dz * t;
      const y = terrain.heightAt(x, z) + 0.35;
      const drop = Math.max(0, prevY - y);
      const st = Math.min(1, Math.max(0, drop / (len / rows) - 0.15) * 0.9);
      prevY = y;
      // Widen toward the foot as the water spreads.
      const half = (w / 2) * (0.7 + 0.5 * t);
      for (const s of [-1, 1]) {
        positions.push(x + nx * half * s, y, z + nz * half * s);
        uvs.push(s * 0.5 + 0.5, t);
        steep.push(st);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('aSteep', new THREE.Float32BufferAttribute(steep, 1));
    g.setIndex(indices);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.material);
    mesh.renderOrder = 1;
    this.group.add(mesh);
  }

  update(dt) {
    this.material.uniforms.uTime.value += dt;
  }
}
