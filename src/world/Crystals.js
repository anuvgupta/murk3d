import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
    // A quartz point: hexagonal prism, slightly wider at the foot, capped by a
    // six-sided pyramid. Non-indexed so every facet is flat.
    const prism = new THREE.CylinderGeometry(0.3, 0.36, 1.3, 6, 1, true);
    prism.translate(0, 0.45, 0);
    const cap = new THREE.ConeGeometry(0.3, 0.55, 6, 1, false);
    cap.translate(0, 1.1 + 0.275, 0);
    const shard = mergeGeometries([prism.toNonIndexed(), cap.toNonIndexed()]);
    shard.computeVertexNormals();
    const dummy = new THREE.Object3D();
    for (const R of REGIONS) {
      if (!R.crystals) continue;
      const C = R.crystals;
      const material = new THREE.MeshStandardMaterial({
        color: C.colour,
        emissive: C.colour,
        emissiveIntensity: C.big ? 0.5 : 0.9,
        roughness: 0.18,
        metalness: 0.05,
      });
      // Light seems to come from inside: a bright rim where the facets turn
      // away, and a glow that gathers toward the point.
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vTipY;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTipY = position.y;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vTipY;')
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            {
              vec3 nv = normalize( vNormal );
              vec3 vv = normalize( vViewPosition );
              float rim = pow( 1.0 - abs( dot( nv, vv ) ), 2.5 );
              float tip = smoothstep( 0.2, 1.6, vTipY );
              totalEmissiveRadiance *= 0.55 + 0.9 * tip + 1.6 * rim;
            }`
          );
      };
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
