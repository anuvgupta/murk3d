import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise3D, fbm3, mulberry32 } from '../util/noise.js';
import { createRockMaterial } from './Rocks.js';
import { PLATES } from './plan.js';

// The Shelves' overhanging lips: a slab of bare rock continuing each plate's
// tilted top past its broken face, leaving a hollow beneath. The terrain
// itself (Terrain.plateHeight) makes the grassy wedge; this adds the part a
// height field can't: the overhang.
export class Plates {
  constructor({ terrain, noise }) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'plates';
    this.lips = [];
    const material = createRockMaterial(noise);
    const noise3 = createNoise3D(77);
    const random = mulberry32(77);
    for (const p of PLATES) {
      const back = 6; // how far the slab reaches back under the grass
      const lenU = back + p.lift;
      const thick = 3.2 + p.lift * 0.25;
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

      const g = this.slabGeometry(lenU, thick, w, p.lift, noise3, random);
      const mesh = new THREE.Mesh(g, material);
      // Local +x runs along the plate's rise direction; the slab is centred on
      // its own length, so offset its centre from the face line.
      const cu = (p.lift - back) / 2;
      mesh.position.set(p.x + (p.length / 2 + cu) * c, yEdge + cu * slope - thick / 2 + 0.05, p.z + (p.length / 2 + cu) * s);
      mesh.rotation.set(0, -p.dir, tilt, 'YZX');
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.lips.push({ p, c, s, yEdge, slope, uMin: p.length / 2 - back, uMax: p.length / 2 + p.lift - 1.5, hw: w / 2 - 0.5 });
    }
  }

  // A box roughened by noise everywhere but its (walkable) top, with a
  // ragged front edge and an underside that sags into the hollow.
  slabGeometry(lenU, thick, w, lift, noise3, random) {
    let g = new THREE.BoxGeometry(lenU, thick, w, Math.max(4, Math.round(lenU / 1.2)), 3, Math.max(6, Math.round(w / 1.4)));
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    const seed = random() * 100;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const onTop = v.y > thick / 2 - 1e-3;
      const n = fbm3(noise3, v.x * 0.35 + seed, v.y * 0.35, v.z * 0.35, 3);
      const n2 = fbm3(noise3, v.x * 1.4 + seed, v.y * 1.4 + 9, v.z * 1.4, 2);
      if (!onTop) {
        // Sides and underside: jagged, with bedding steps.
        const out = new THREE.Vector3(v.x / lenU, v.y / thick, v.z / w).normalize();
        const amp = 0.5 + 0.25 * (1 - v.y / thick);
        v.addScaledVector(out, (n * 1.4 + n2 * 0.4) * amp);
        v.y += Math.sin((v.x + v.y * 0.3) * 1.7 + seed) * 0.12 * (1 - Math.abs(out.y));
      } else {
        // Top stays flat but the edges are nibbled.
        const edgeX = v.x > lenU / 2 - 1e-3;
        const edgeZ = Math.abs(v.z) > w / 2 - 1e-3;
        if (edgeX) v.x += (n * 1.8 + n2 * 0.6) - 0.6;
        if (edgeZ) v.z += Math.sign(v.z) * ((n * 1.2 + n2 * 0.4) - 0.4);
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
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
      return l.yEdge + (u - l.p.length / 2) * l.slope + 0.05;
    }
    return null;
  }
}
