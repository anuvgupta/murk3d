import * as THREE from 'three';
import { LAKES, RUINS } from './plan.js';
import { REGIONS } from './regions.js';
import { mulberry32 } from '../util/noise.js';

// Glowing crystal clusters in the realms that ask for them (the moonlit
// ruins' teal shards, the tundra's great ice crystals): one instanced mesh
// per colour, each cluster a few leaning shards.
export class Crystals {
  constructor({ terrain }) {
    this.group = new THREE.Group();
    this.group.name = 'crystals';
    this.colliders = [];
    const rng = mulberry32(606);
    const shard = new THREE.OctahedronGeometry(1, 0);
    shard.scale(0.35, 1, 0.35);
    shard.translate(0, 0.8, 0);
    const dummy = new THREE.Object3D();
    for (const R of REGIONS) {
      if (!R.crystals) continue;
      const C = R.crystals;
      const material = new THREE.MeshStandardMaterial({
        color: C.colour,
        emissive: C.colour,
        emissiveIntensity: C.big ? 0.9 : 1.4,
        roughness: 0.25,
        metalness: 0.1,
      });
      const transforms = [];
      for (let i = 0; i < C.count; i++) {
        const a = rng() * Math.PI * 2;
        const d = 12 + Math.sqrt(rng()) * (R.r - 32);
        const x = R.x + Math.cos(a) * d;
        const z = R.z + Math.sin(a) * d;
        if (!this.clear(x, z)) continue;
        const y = terrain.heightAt(x, z);
        const n = 3 + Math.floor(rng() * 4);
        const size = C.big ? 2.2 + rng() * 3.5 : 0.7 + rng() * 1.2;
        for (let k = 0; k < n; k++) {
          const s = size * (0.45 + rng() * 0.75);
          dummy.position.set(x + (rng() - 0.5) * size * 0.9, y - 0.2, z + (rng() - 0.5) * size * 0.9);
          dummy.rotation.set((rng() - 0.5) * 0.7, rng() * Math.PI * 2, (rng() - 0.5) * 0.7);
          dummy.scale.set(s, s * (1.2 + rng() * 0.8), s);
          dummy.updateMatrix();
          transforms.push(dummy.matrix.clone());
        }
        if (size > 1.2) this.colliders.push({ cx: x, cz: z, hx: size * 0.5, hz: size * 0.5, rot: 0 });
      }
      const mesh = new THREE.InstancedMesh(shard, material, transforms.length);
      transforms.forEach((t, i) => mesh.setMatrixAt(i, t));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  clear(x, z) {
    for (const L of LAKES) {
      const ld = Math.hypot(x - L.x, z - L.z);
      if (ld < L.radius * 1.15 && !(L.ring && ld < L.ring - 3)) return false;
    }
    for (const s of RUINS) if (Math.hypot(x - s.x, z - s.z) < s.r + 2) return false;
    return true;
  }
}
