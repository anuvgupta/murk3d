import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise3D, fbm3, mulberry32, smoothstep } from '../util/noise.js';
import { createRockMaterial } from './Rocks.js';
import { Kit } from '../buildings/Kit.js';
import { REGIONS } from './regions.js';

// The Floating Isles: islands of rock hanging over a cloud sea, each a
// turf-topped disc on an inverted, noise-roughened cone of stone, with
// plank bridges swung between the nearer pairs. Tops are walkable.
export const ISLAND_BASE = 20; // the lowest island top, in metres

export class SkyIslands {
  constructor({ noise, materials }) {
    this.group = new THREE.Group();
    this.group.name = 'islands';
    this.tops = []; // { x, z, r, y }
    this.bridges = []; // walkable: { ax, az, bx, bz, y, hw }
    this.colliders = [];
    const region = REGIONS.find((r) => r.islands);
    if (!region) return;
    const rock = createRockMaterial(noise);
    const noise3 = createNoise3D(31);
    const rng = mulberry32(31);
    const kit = new Kit();
    const m = materials;
    for (const isl of region.islands) {
      const x = region.x + isl.x;
      const z = region.z + isl.z;
      const y = ISLAND_BASE + isl.y;
      this.tops.push({ x, z, r: isl.r, y });
      const mesh = new THREE.Mesh(this.coneGeometry(isl.r, noise3, rng), rock);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      // Turf cap and a rim of soil.
      kit.frame({ x, y, z }, () => {
        kit.cylinder(m.turf, isl.r * 0.98, isl.r * 1.02, 0.5, { y: -0.25 }, { segments: 32 });
        kit.cylinder(m.ruinDark, isl.r * 1.02, isl.r * 0.9, 1.4, { y: -1.2 }, { segments: 32, metres: 2.4 });
      });
    }
    // Plank bridges between islands less than 70 m apart.
    const T = this.tops;
    for (let i = 0; i < T.length; i++) {
      for (let j = i + 1; j < T.length; j++) {
        const a = T[i];
        const b = T[j];
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d > 70) continue;
        const dirx = (b.x - a.x) / d;
        const dirz = (b.z - a.z) / d;
        const ax = a.x + dirx * (a.r - 0.5);
        const az = a.z + dirz * (a.r - 0.5);
        const bx = b.x - dirx * (b.r - 0.5);
        const bz = b.z - dirz * (b.r - 0.5);
        const len = Math.hypot(bx - ax, bz - az);
        const ry = Math.atan2(bx - ax, bz - az);
        const rise = b.y - a.y;
        const tilt = -Math.atan2(rise, len);
        kit.frame({ x: (ax + bx) / 2, y: (a.y + b.y) / 2 + 0.05, z: (az + bz) / 2, ry, rx: tilt }, () => {
          const n = Math.round(len / 0.5);
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n;
            const sag = -Math.sin(t * Math.PI) * len * 0.035;
            kit.box(m.planks, 1.6, 0.06, 0.4, { y: sag, z: -len / 2 + t * len, ry: (rng() - 0.5) * 0.04 }, { metres: 1.5, grain: true });
          }
          for (const s of [-1, 1]) {
            kit.box(m.rope, 0.05, 0.05, len, { x: s * 0.85, y: 1.0 });
            for (let k = 0; k <= 6; k++) kit.box(m.rope, 0.03, 1.0, 0.03, { x: s * 0.85, y: 0.5, z: -len / 2 + (k / 6) * len });
          }
        });
        this.bridges.push({ ax, az, bx, bz, ay: a.y, by: b.y, hw: 0.9 });
      }
    }
    for (const mesh of kit.build()) this.group.add(mesh);
  }

  // Inverted cone of rock under a disc: wider at the top, ragged all over.
  coneGeometry(r, noise3, rng) {
    let g = new THREE.CylinderGeometry(r, r * 0.08, r * 1.8, 28, 8, false);
    g.translate(0, -r * 0.9 - 0.4, 0);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    const seed = rng() * 50;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const depth = -(v.y + 0.4) / (r * 1.8); // 0 at the top rim, 1 at the tip
      const n = fbm3(noise3, v.x * 0.18 + seed, v.y * 0.18, v.z * 0.18, 3);
      const n2 = fbm3(noise3, v.x * 0.6 + seed, v.y * 0.6 + 3, v.z * 0.6, 2);
      const radial = Math.hypot(v.x, v.z) || 1;
      // Deep ribs and fissures run down the cone; the rim overhangs a little.
      const ang = Math.atan2(v.z, v.x);
      const rib = Math.pow(Math.sin(ang * 6.0 + n * 2.5) * 0.5 + 0.5, 1.6) - 0.5;
      const amp = r * (0.26 + 0.16 * depth);
      const dr = (n * 1.3 + n2 * 0.5 + rib * 0.9 * depth) * amp + r * 0.08 * (1 - smoothstep(0, 0.12, depth));
      v.x += (v.x / radial) * dr;
      v.z += (v.z / radial) * dr;
      // Bedding steps.
      v.y += Math.sin((v.y + n * 2) * 1.3) * 0.15;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
    g.computeBoundingSphere();
    return g;
  }

  // Walkable: island tops and the bridges between them.
  surfaceAt(x, z) {
    let best = null;
    for (const t of this.tops) {
      if (Math.hypot(x - t.x, z - t.z) <= t.r && (best === null || t.y > best)) best = t.y;
    }
    for (const b of this.bridges) {
      const dx = b.bx - b.ax;
      const dz = b.bz - b.az;
      const len = Math.hypot(dx, dz);
      const t = ((x - b.ax) * dx + (z - b.az) * dz) / (len * len);
      if (t < 0 || t > 1) continue;
      const px = b.ax + dx * t;
      const pz = b.az + dz * t;
      if (Math.hypot(x - px, z - pz) > b.hw) continue;
      const y = b.ay + (b.by - b.ay) * t - Math.sin(t * Math.PI) * len * 0.035 + 0.08;
      if (best === null || y > best) best = y;
    }
    return best;
  }
}
