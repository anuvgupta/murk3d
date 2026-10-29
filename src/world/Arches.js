import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise3D, fbm3, mulberry32 } from '../util/noise.js';
import { createRockMaterial } from './Rocks.js';
import { REGIONS } from './regions.js';

// Natural rock arches: a half torus of stone, roughened and thickened at
// the feet, standing with both feet in the ground.
export const VALE_ARCHES = [{ x: -122, z: 206, r: 11, tube: 3.2, ry: 0.6 }];

export class Arches {
  constructor({ terrain, noise }) {
    this.group = new THREE.Group();
    this.group.name = 'arches';
    this.colliders = [];
    const material = createRockMaterial(noise);
    const noise3 = createNoise3D(19);
    const rng = mulberry32(19);
    const defs = [...VALE_ARCHES];
    for (const R of REGIONS) for (const a of R.arches || []) defs.push({ ...a, x: R.x + a.dx, z: R.z + a.dz });
    for (const a of defs) {
      const g = this.geometry(a.r, a.tube, noise3, rng);
      const mesh = new THREE.Mesh(g, material);
      const c = Math.cos(a.ry);
      const s = Math.sin(a.ry);
      const feet = [
        [a.x + c * a.r, a.z - s * a.r],
        [a.x - c * a.r, a.z + s * a.r],
      ];
      const y = Math.min(...feet.map(([fx, fz]) => terrain.heightAt(fx, fz))) - a.tube * 0.6;
      mesh.position.set(a.x, y, a.z);
      mesh.rotation.y = a.ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      for (const [fx, fz] of feet) this.colliders.push({ cx: fx, cz: fz, hx: a.tube * 1.1, hz: a.tube * 1.1, rot: a.ry });
    }
  }

  geometry(r, tube, noise3, rng) {
    let g = new THREE.TorusGeometry(r, tube, 12, 30, Math.PI);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    const seed = rng() * 40;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const ang = Math.atan2(v.y, v.x); // 0..PI along the arch
      // Local ring centre for this vertex, to displace radially from it.
      const cx = Math.cos(ang) * r;
      const cy = Math.sin(ang) * r;
      const rx = v.x - cx;
      const ry = v.y - cy;
      const rz = v.z;
      const rl = Math.hypot(rx, ry, rz) || 1;
      const n = fbm3(noise3, v.x * 0.14 + seed, v.y * 0.14, v.z * 0.14, 3);
      const n2 = fbm3(noise3, v.x * 0.5 + seed, v.y * 0.5 + 5, v.z * 0.5, 2);
      // Feet swell; the span thins a little.
      const foot = 1 + 0.9 * Math.pow(1 - Math.sin(ang), 2);
      const k = foot * (1 + n * 0.35 + n2 * 0.12);
      v.set(cx + (rx / rl) * tube * k, cy + (ry / rl) * tube * k, (rz / rl) * tube * k * 1.15);
      // Bedding steps.
      v.y += Math.sin(v.y * 1.1 + n * 2) * 0.12;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
    g.computeBoundingSphere();
    return g;
  }
}
