import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise3D, fbm3, mulberry32, smoothstep } from '../util/noise.js';
import { createRockMaterial } from './Rocks.js';
import { PLATES } from './plan.js';

// The Shelves' overhanging lips: a slab of bare rock continuing each plate's
// tilted top past its broken face, leaving a hollow beneath. The terrain
// itself (Terrain.plateHeight) makes the grassy wedge; this adds the part a
// height field can't: the overhang.
export class Plates {
  constructor({ terrain, noise, turf }) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'plates';
    this.lips = [];
    const material = createRockMaterial(noise);
    const noise3 = (this.noise3 = createNoise3D(77));
    const random = mulberry32(77);
    for (const p of PLATES) {
      const back = 6; // how far the slab reaches back under the grass
      const lift = p.lift + 4; // the lips reach well past the broken face
      const lenU = back + lift;
      const thick = 4.0 + lift * 0.3;
      const w = p.width - 2;
      const slope = p.rise / p.length;
      const tilt = Math.atan(slope);
      const c = Math.cos(p.dir);
      const s = Math.sin(p.dir);
      // Top of the terrain just inside the face, averaged across the plate.
      let yEdge = 0;
      const samples = 5;
      for (let i = 0; i < samples; i++) {
        const v = (i / (samples - 1) - 0.5) * w * 0.7;
        const u = p.length / 2 - 2.5;
        yEdge += terrain.heightAt(p.x + u * c - v * s, p.z + u * s + v * c);
      }
      yEdge /= samples;
      yEdge += 2.5 * slope; // bring the sample back to the face line

      const seed = random() * 100;
      const g = this.slabGeometry(lenU, thick, w, lift, noise3, seed);
      const mesh = new THREE.Mesh(g, [material, turf || material]);
      // Local +x runs along the plate's rise direction; the slab is centred on
      // its own length, so offset its centre from the face line.
      const cu = (lift - back) / 2;
      mesh.position.set(p.x + (p.length / 2 + cu) * c, yEdge + cu * slope - thick / 2 + 0.05, p.z + (p.length / 2 + cu) * s);
      mesh.rotation.set(0, -p.dir, tilt, 'YZX');
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.lips.push({ p, c, s, yEdge, slope, cu, seed, uMin: p.length / 2 - back, uMax: p.length / 2 + lift - 1.5, hw: w / 2 - 0.5 });
    }
  }

  // A slab of rock with a turf top: a box whose side and under faces are
  // pushed about by noise (more toward the broken tip) and whose top gently
  // undulates (surfaceAt mirrors it). Every displacement is a pure function
  // of the undisplaced position so the box's duplicated edge vertices stay
  // joined.
  slabGeometry(lenU, thick, w, lift, noise3, seed) {
    const g = new THREE.BoxGeometry(lenU, thick, w, Math.max(8, Math.round(lenU / 0.7)), 4, Math.max(10, Math.round(w / 0.8)));
    const pos = g.attributes.position;
    const out = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const ox = pos.getX(i);
      const oy = pos.getY(i);
      const oz = pos.getZ(i);
      const n = fbm3(noise3, ox * 0.22 + seed, oy * 0.22, oz * 0.22, 3);
      const n2 = fbm3(noise3, ox * 0.9 + seed, oy * 0.9 + 9, oz * 0.9, 2);
      const tip = smoothstep(-lenU / 2, lenU / 2, ox);
      const top = smoothstep(thick / 2 - 0.6, thick / 2, oy);
      out.set(ox / lenU, oy / thick, oz / w).normalize();
      const d = (n * 2.0 + n2 * 0.6) * (0.8 + 2.6 * tip);
      let x = ox + out.x * d;
      let z = oz + out.z * d;
      let y = oy + out.y * d * (1 - top);
      // Bedding steps on the faces; a slow swell on the top.
      y += Math.sin((ox * 0.9 + oy * 0.3) * 1.7 + seed) * 0.3 * (1 - top) * (1 - Math.abs(out.y));
      y += fbm3(noise3, ox * 0.1 + seed + 50, 0, oz * 0.1, 2) * 0.45 * top;
      pos.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    // Box faces: +x, -x, +y, -y, +z, -z. The top is turf, the rest rock.
    for (const grp of g.groups) grp.materialIndex = grp.materialIndex === 2 ? 1 : 0;
    g.computeBoundingSphere();
    return g;
  }

  // Walkable top of a lip at (x, z), or null.
  surfaceAt(x, z) {
    for (const l of this.lips) {
      const dx = x - l.p.x;
      const dz = z - l.p.z;
      const u = dx * l.c + dz * l.s;
      const v = -dx * l.s + dz * l.c;
      if (u < l.uMin || u > l.uMax || Math.abs(v) > l.hw) continue;
      const lx = u - (l.p.length / 2 + l.cu);
      return l.yEdge + (u - l.p.length / 2) * l.slope + 0.05 + fbm3(this.noise3, lx * 0.1 + l.seed + 50, 0, v * 0.1, 2) * 0.45;
    }
    return null;
  }
}
