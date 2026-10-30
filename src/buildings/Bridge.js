import * as THREE from 'three';
import { BRIDGE, RIVER } from '../world/plan.js';
import { mulberry32 } from '../util/noise.js';
import { bevelBox } from './shapes.js';

// Stone arch bridge carrying the main road over the river, built the way a
// mason would: nothing is ruler-straight. In plan it bends in a gentle S
// (meeting the road square at both ends); its hump peaks off-centre so one
// approach is longer than the other; a ring of individual voussoirs fans
// round the arch on each face; the parapets are rounded walls with an
// uneven top, splaying out into wing walls at the ends, capped with
// separate bevelled coping stones each set a little askew, and finished
// with rounded end piers.
//
// Built in a frame whose local z axis runs along the road. Exposes the
// deck height for walking and colliders for the parapets.
export class Bridge {
  constructor() {
    this.L = BRIDGE.length;
    this.W = BRIDGE.width;
    this.hump = 1.3;
    this.yA = BRIDGE.startHeight - 0.08;
    this.yB = BRIDGE.endHeight - 0.08;
    this.water = BRIDGE.waterLevel;
    const riverW = RIVER.widthAt(BRIDGE.riverS);
    this.archHalf = riverW / 2 + 0.6;
    this.spring = this.water - 0.4;
    // The S-bend's sideways swing (m) and the hump's lean toward one end.
    this.swing = 0.55;
    this.peakAt = 0.42;
    this.crown = Math.min(this.water + 2.5, this.deckY(0) - 0.9);
    this.cos = Math.cos(BRIDGE.rotationY);
    this.sin = Math.sin(BRIDGE.rotationY);
  }

  // Deck surface height at local z along the bridge: a ramp between the two
  // banks plus a hump that peaks at peakAt of the way across.
  deckY(z) {
    const t = THREE.MathUtils.clamp(z / this.L + 0.5, 0, 1);
    const p = Math.log(0.5) / Math.log(this.peakAt);
    return this.yA + (this.yB - this.yA) * t + this.hump * Math.sin(Math.PI * Math.pow(t, p));
  }

  // Sideways offset of the bridge's centre line at local z (the S-bend),
  // zero at both ends and in the middle, and its slope dx/dz.
  bend(z) {
    const t = THREE.MathUtils.clamp(z / this.L + 0.5, 0, 1);
    return this.swing * Math.sin(2 * Math.PI * t);
  }

  bendSlope(z) {
    const t = THREE.MathUtils.clamp(z / this.L + 0.5, 0, 1);
    return ((this.swing * 2 * Math.PI) / this.L) * Math.cos(2 * Math.PI * t);
  }

  archY(z) {
    const k = Math.min(1, Math.abs(z) / this.archHalf);
    return this.spring + (this.crown - this.spring) * Math.sqrt(1 - k * k);
  }

  // Point on the arch's intrados at angle t (0 at +z springing, PI at -z),
  // optionally inset by roughly `inset` metres.
  archPoint(t, inset = 0) {
    return [(this.archHalf - inset) * Math.cos(t), this.spring + (this.crown - this.spring - inset) * Math.sin(t)];
  }

  build(kit, m) {
    const L = this.L;
    const W = this.W;
    const half = W / 2 - 0.1;
    const bottom = this.water - 3;
    const a = this.archHalf;
    const rng = mulberry32(73);

    kit.frame({ x: BRIDGE.x, z: BRIDGE.z, ry: BRIDGE.rotationY }, () => {
      // --- Body: a loft along the bend, the arch cut out of its underside.
      const zs = [];
      const N = 56;
      for (let i = 0; i <= N; i++) zs.push(-L / 2 + (i / N) * L);
      // Samples on either side of the springings so the abutment faces are crisp.
      for (const z of [-a, a]) zs.push(z - 1e-3, z + 1e-3);
      for (let i = 1; i < 24; i++) zs.push(-a + (i / 24) * 2 * a);
      zs.sort((p, q) => p - q);
      const bot = (z) => (Math.abs(z) < a ? this.archY(z) : bottom);
      const sec = (z, side, top) => [this.bend(z) + side * half, top ? this.deckY(z) : bot(z), z];
      const sides = [];
      for (const side of [-1, 1]) {
        sides.push(this.strip(zs.map((z) => sec(z, side, false)), zs.map((z) => sec(z, side, true)), side > 0, (p, row) => [p[2] / 2.2, p[1] / 2.2]));
      }
      // Spandrels of rubble stone; dressed stone is kept for the arch ring
      // and the copings, as a mason would.
      for (const g of sides) kit.add(m.stone, g);
      // Soffit (the arch's underside, and the footings below water).
      kit.add(m.ashlar, this.strip(zs.map((z) => sec(z, 1, false)), zs.map((z) => sec(z, -1, false)), false, (p) => [p[2] / 2.2, p[0] / 2.2]));
      // Top under the deck and parapets.
      kit.add(m.ashlar, this.strip(zs.map((z) => sec(z, -1, true)), zs.map((z) => sec(z, 1, true)), false, (p) => [p[2] / 2.2, p[0] / 2.2]));

      // --- Voussoirs: individual dressed stones fanning round the arch on
      // each face, a little uneven in depth and projection, a taller keystone.
      const K = 19;
      for (const side of [-1, 1]) {
        for (let k = 0; k < K; k++) {
          const t0 = (k / K) * Math.PI;
          const t1 = ((k + 1) / K) * Math.PI;
          const [z0, y0] = this.archPoint(t0, 0.03);
          const [z1, y1] = this.archPoint(t1, 0.03);
          const zc = (z0 + z1) / 2;
          const yc = (y0 + y1) / 2;
          // Outward normal of the ellipse at the stone.
          let nz = zc / (a * a);
          let ny = (yc - this.spring) / ((this.crown - this.spring) ** 2);
          const nl = Math.hypot(nz, ny) || 1;
          nz /= nl;
          ny /= nl;
          const key = k === Math.floor(K / 2);
          const depth = (key ? 0.78 : 0.52) + rng() * 0.08;
          const width = Math.hypot(z1 - z0, y1 - y0) - 0.025;
          const proud = 0.04 + rng() * 0.03;
          const x = this.bend(zc) + side * (half + proud / 2 - 0.12);
          const yaw = Math.atan(this.bendSlope(zc));
          kit.add(m.ashlar, bevelBox(0.26 + proud, depth, width, 0.035, { metres: 1.4 }), {
            x,
            y: yc + ny * (depth / 2 - 0.02),
            z: zc + nz * (depth / 2 - 0.02),
            ry: yaw,
            rx: Math.atan2(nz, ny),
          });
        }
      }

      // --- A string course: a rounded band standing out along each face
      // where the spandrel meets the parapet.
      for (const side of [-1, 1]) {
        const band = [];
        for (let i = 0; i <= 48; i++) {
          const z = -L / 2 + 0.6 + (i / 48) * (L - 1.2);
          band.push({ z, cx: this.bend(z) + side * (half + 0.02), base: this.deckY(z) - 0.42, top: this.deckY(z) - 0.24 });
        }
        kit.add(m.ashlar, this.roundedWall(band, 0.2, 0.05));
      }

      // --- Parapets: rounded walls along the bend with an uneven top,
      // splaying outward into wing walls over the last stretch of each end.
      const PN = 48;
      const splay = (z) => {
        const e = Math.max(0, Math.abs(z) - (L / 2 - 1.8)) / 1.8;
        return e * e * 0.55;
      };
      const wobble = (z, side) => 0.035 * Math.sin(z * 1.7 + side) + 0.02 * Math.sin(z * 4.3 + side * 2.1);
      this.parapetPath = { [-1]: [], [1]: [] };
      for (const side of [-1, 1]) {
        const rings = [];
        for (let i = 0; i <= PN; i++) {
          const z = -L / 2 + (i / PN) * L;
          const cx = this.bend(z) + side * (W / 2 - 0.19 + splay(z));
          const base = this.deckY(z) - 0.25;
          const top = this.deckY(z) + 0.76 + wobble(z, side);
          rings.push({ z, cx, base, top });
          this.parapetPath[side].push([cx, z]);
        }
        kit.add(m.stone, this.roundedWall(rings, 0.34, 0.06));
        // Coping: separate stones of varied length, each set a little askew.
        let z = -L / 2 + 0.05;
        while (z < L / 2 - 0.3) {
          const len = Math.min(0.65 + rng() * 0.35, L / 2 - 0.05 - z);
          const zc = z + len / 2;
          const cx = this.bend(zc) + side * (W / 2 - 0.19 + splay(zc));
          const top = this.deckY(zc) + 0.76 + wobble(zc, side);
          const slope = (this.deckY(zc + 0.2) - this.deckY(zc - 0.2)) / 0.4;
          const yaw = Math.atan(this.bendSlope(zc) + side * (splay(zc + 0.2) - splay(zc - 0.2)) / 0.4);
          kit.add(m.ashlar, bevelBox(0.44 + rng() * 0.04, 0.13 + rng() * 0.03, len - 0.018, 0.035, { metres: 1.2 }), {
            x: cx + (rng() - 0.5) * 0.025,
            y: top + 0.05,
            z: zc,
            ry: yaw + (rng() - 0.5) * 0.03,
            rx: -Math.atan(slope) + (rng() - 0.5) * 0.02,
            rz: (rng() - 0.5) * 0.03,
          });
          z += len;
        }
        // Rounded end piers.
        for (const end of [-1, 1]) {
          const ze = end * (L / 2 - 0.25);
          const cx = this.bend(ze) + side * (W / 2 - 0.19 + splay(ze));
          const y = this.deckY(ze);
          const turn = (rng() - 0.5) * 0.12;
          kit.add(m.stone, bevelBox(0.56, 1.2, 0.56, 0.07, { metres: 1.6 }), { x: cx, y: y + 0.35, z: ze, ry: turn });
          // A two-tier capstone: a broad bevelled slab and a smaller one on it.
          kit.add(m.ashlar, bevelBox(0.68, 0.13, 0.68, 0.04, { metres: 1.2 }), { x: cx, y: y + 1.0, z: ze, ry: turn + (rng() - 0.5) * 0.05 });
          kit.add(m.ashlar, bevelBox(0.44, 0.12, 0.44, 0.05, { metres: 1.2 }), { x: cx, y: y + 1.12, z: ze, ry: turn + (rng() - 0.5) * 0.08 });
        }
      }

      // --- Cobbled deck following the bend.
      const positions = [];
      const uvs = [];
      const indices = [];
      const dh = W / 2 - 0.3;
      const steps = 56;
      for (let i = 0; i <= steps; i++) {
        const z = -L / 2 + (i / steps) * L;
        const y = this.deckY(z) + 0.03;
        const c = this.bend(z);
        positions.push(c - dh, y, z, c + dh, y, z);
        uvs.push(0, z / 1.6, (dh * 2) / 1.6, z / 1.6);
        if (i < steps) {
          const b = i * 2;
          indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        }
      }
      const deck = new THREE.BufferGeometry();
      deck.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      deck.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      deck.setIndex(indices);
      deck.computeVertexNormals();
      kit.add(m.cobble, deck);
    });
  }

  // A surface between two rows of points (a and b, same length), facing
  // +normal when `flip` is false by the right-hand rule of (along, a→b).
  strip(rowA, rowB, flip, uvOf) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const n = rowA.length;
    for (const row of [rowA, rowB]) {
      for (const p of row) {
        positions.push(p[0], p[1], p[2]);
        uvs.push(...uvOf(p));
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a0 = i;
      const a1 = i + 1;
      const b0 = n + i;
      const b1 = n + i + 1;
      if (flip) indices.push(a0, b0, a1, a1, b0, b1);
      else indices.push(a0, a1, b0, a1, b1, b0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  // A wall swept along rings { z, cx, base, top }: a rounded-rectangle
  // section (thickness th, corner radius r), closed at both ends.
  roundedWall(rings, th, r) {
    const hw = th / 2;
    // Corners in order round the section: bottom-right, top-right, top-left,
    // bottom-left; each point's height is a fraction of the wall (0 base, 1
    // top) plus an offset that rounds the corner.
    const pts = [];
    const add = (sx, sy, a0) => {
      for (let k = 0; k <= 3; k++) {
        const a = a0 + (k / 3) * (Math.PI / 2);
        pts.push({ x: sx * (hw - r) + Math.cos(a) * r, fy: sy, oy: (sy ? -r : r) + Math.sin(a) * r });
      }
    };
    add(1, 0, -Math.PI / 2);
    add(1, 1, 0);
    add(-1, 1, Math.PI / 2);
    add(-1, 0, Math.PI);
    const M = pts.length;
    const positions = [];
    const uvs = [];
    const indices = [];
    let along = 0;
    rings.forEach((ring, i) => {
      if (i) along += Math.hypot(ring.z - rings[i - 1].z, ring.cx - rings[i - 1].cx);
      for (let k = 0; k <= M; k++) {
        const q = pts[k % M];
        const y = ring.base + q.fy * (ring.top - ring.base) + q.oy;
        positions.push(ring.cx + q.x, y, ring.z);
        uvs.push(along / 2.4, (k / M) * 1.6 + y / 2.4);
      }
    });
    const row = M + 1;
    for (let i = 0; i < rings.length - 1; i++) {
      for (let k = 0; k < M; k++) {
        const a0 = i * row + k;
        const b0 = a0 + row;
        indices.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
      }
    }
    // End caps (fans round the section's centre).
    for (const [i, dir] of [[0, -1], [rings.length - 1, 1]]) {
      const ring = rings[i];
      const c = positions.length / 3;
      positions.push(ring.cx, (ring.base + ring.top) / 2, ring.z);
      uvs.push(0.5, 0.5);
      for (let k = 0; k < M; k++) {
        const v0 = i * row + k;
        const v1 = i * row + k + 1;
        if (dir > 0) indices.push(c, v0, v1);
        else indices.push(c, v1, v0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  toLocal(x, z) {
    const dx = x - BRIDGE.x;
    const dz = z - BRIDGE.z;
    return [this.cos * dx - this.sin * dz, this.sin * dx + this.cos * dz];
  }

  // Walkable deck height at world (x, z), or null off the deck.
  surfaceAt(x, z) {
    const [lx, lz] = this.toLocal(x, z);
    if (Math.abs(lx - this.bend(lz)) > this.W / 2 - 0.25 || Math.abs(lz) > this.L / 2) return null;
    return this.deckY(lz) + 0.03;
  }

  // Parapet colliders: short boxes following each wall's bend and splay.
  colliders() {
    const out = [];
    for (const side of [-1, 1]) {
      const path = this.parapetPath ? this.parapetPath[side] : null;
      if (!path) continue;
      for (let i = 0; i < path.length - 1; i += 2) {
        const [x0, z0] = path[i];
        const [x1, z1] = path[Math.min(path.length - 1, i + 2)];
        const lx = (x0 + x1) / 2;
        const lz = (z0 + z1) / 2;
        const yaw = Math.atan2(x1 - x0, z1 - z0);
        out.push({
          cx: BRIDGE.x + lx * this.cos + lz * this.sin,
          cz: BRIDGE.z - lx * this.sin + lz * this.cos,
          hx: 0.18,
          hz: Math.hypot(x1 - x0, z1 - z0) / 2 + 0.05,
          rot: BRIDGE.rotationY + yaw,
        });
      }
    }
    return out;
  }
}
