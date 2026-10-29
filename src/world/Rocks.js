import * as THREE from 'three';
import { createNoise2D, mulberry32 } from '../util/noise.js';
import { HOUSE, distanceToPath } from './layout.js';

// Scattered boulders and stones across the vale. Provides an `occupies(x, z)`
// test so grass is not planted through them.
export class Rocks {
  constructor(terrain, { seed = 21, count = 70, radius = 160 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'rocks';
    this.colliders = [];
    this.footprints = [];

    const random = mulberry32(seed);
    const noise = createNoise2D(seed);
    const material = new THREE.MeshStandardMaterial({
      color: 0x8a857c,
      roughness: 0.95,
      flatShading: true,
    });

    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 20) {
      attempts++;
      const a = random() * Math.PI * 2;
      const r = 15 + Math.sqrt(random()) * radius;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (distanceToPath(x, z) < 3) continue;
      if (Math.hypot(x - HOUSE.position.x, z - HOUSE.position.z) < HOUSE.flatRadius + 4) continue;

      const big = random() < 0.25;
      const size = big ? 1.6 + random() * 2.6 : 0.3 + random() * 0.7;
      const geo = new THREE.IcosahedronGeometry(1, big ? 2 : 1);
      const pos = geo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const n = noise(v.x * 1.3 + placed * 7, v.y * 1.3 + v.z * 0.9) * 0.28;
        v.multiplyScalar(1 + n);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();

      const mesh = new THREE.Mesh(geo, material);
      const sx = size * (0.9 + random() * 0.5);
      const sy = size * (0.55 + random() * 0.35);
      const sz = size * (0.8 + random() * 0.5);
      mesh.scale.set(sx, sy, sz);
      mesh.rotation.set((random() - 0.5) * 0.3, random() * Math.PI * 2, (random() - 0.5) * 0.3);
      const y = terrain.heightAt(x, z);
      mesh.position.set(x, y + sy * 0.25, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);

      const footprint = Math.max(sx, sz);
      this.footprints.push({ x, z, r: footprint * 0.95 });
      if (big) {
        this.colliders.push({ cx: x, cz: z, hx: sx * 0.7, hz: sz * 0.7, rot: mesh.rotation.y });
      }
      placed++;
    }
  }

  occupies(x, z) {
    for (const f of this.footprints) {
      const dx = x - f.x;
      const dz = z - f.z;
      if (dx * dx + dz * dz < f.r * f.r) return true;
    }
    return false;
  }
}
