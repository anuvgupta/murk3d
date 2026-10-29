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
          // Streaks: noise scrolled down the fall, stretched along it.
          float t = uTime * ( 0.9 + 0.8 * vSteep );
          float s1 = texture( uNoise, vec2( vUv.x * 2.0, vUv.y * 0.35 - t * 0.5 ) ).r;
          float s2 = texture( uNoise, vec2( vUv.x * 5.0 + 0.3, vUv.y * 0.9 - t * 0.9 ) ).g;
          float streak = smoothstep( 0.35, 0.8, s1 * 0.6 + s2 * 0.5 );
          vec3 water = vec3( 0.55, 0.72, 0.78 );
          vec3 foam = vec3( 0.96, 0.98, 1.0 );
          vec3 col = mix( water, foam, streak * ( 0.5 + 0.5 * vSteep ) );
          // Edges thin out; the bottom whitens into the plume.
          float edge = smoothstep( 0.0, 0.18, vUv.x ) * smoothstep( 1.0, 0.82, vUv.x );
          float plume = smoothstep( 0.7, 1.0, vUv.y );
          col = mix( col, foam, plume * 0.6 );
          float alpha = ( 0.55 + 0.45 * streak ) * edge * ( 0.75 + 0.25 * vSteep );
          alpha *= 1.0 - plume * 0.5;
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
      const st = Math.min(1, drop / (len / rows) * 0.6);
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
