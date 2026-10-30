// Generated props: three kinds of barrel, crates and the village well.
// All build into a Kit at its current frame, standing on y = 0.

import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';
import { bevelBox, organicLathe, tube, blob } from './shapes.js';

const TAU = Math.PI * 2;
let barrelSeed = 0;

// Fittings these props need beyond the building set, made once.
let FIT = null;
function fittings() {
  if (FIT) return FIT;
  const mat = (o) => new THREE.MeshStandardMaterial(o);
  FIT = {
    brass: mat({ color: 0xa8843a, roughness: 0.42, metalness: 0.9 }),
    pewter: mat({ color: 0x8a8c8a, roughness: 0.45, metalness: 0.85 }),
    groove: mat({ color: 0x1c140c, roughness: 1 }),
    nail: mat({ color: 0x2a2622, roughness: 0.6, metalness: 0.7 }),
    chalk: mat({ color: 0xd8d4c8, roughness: 1, transparent: true, opacity: 0.75 }),
  };
  return FIT;
}

// A barrel body built from separate staves: each a slice of the bulging
// lathe with a narrow gap to the next, so dark grooves show between them,
// and each sampling its own board of the wood texture, so the staves vary
// in tone. Heads sit recessed inside the projecting stave ends (the chime)
// and are made of boards. Returns the radius at relative height t.
function barrelBody(kit, m, { radius, height, bulge, open = false }) {
  const rng = mulberry32(++barrelSeed * 97 + 13);
  const F = fittings();
  const rAt = (t) => radius * (1 + bulge * Math.sin(t * Math.PI));
  const steps = 12;
  const N = Math.max(14, Math.round(radius * 52));
  const gap = 0.006 / radius;
  for (let k = 0; k < N; k++) {
    const out = 1 + (rng() - 0.5) * 0.014;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push(new THREE.Vector2(rAt(t) * out, t * height));
    }
    const g = new THREE.LatheGeometry(pts, 3, (k / N) * TAU + gap / 2, TAU / N - gap);
    const uv = g.attributes.uv;
    const board = Math.floor(rng() * 8);
    const v0 = rng();
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (board + 0.1 + uv.getX(i) * 0.8) / 8, v0 + uv.getY(i) * height * 0.8);
    kit.add(m.barrel, g);
    // The stave's end grain at each chime.
    for (const t of [0, 1]) {
      const rr = rAt(t) * out;
      // Ring angles run the other way round from the lathe's, and mirror
      // when the ring is turned to face down.
      const p0 = (k / N) * TAU + gap / 2;
      const dp = TAU / N - gap;
      const ring = new THREE.RingGeometry(rr - 0.022, rr, 3, 1, t ? p0 - Math.PI / 2 : Math.PI / 2 - p0 - dp, dp);
      ring.rotateX(t ? -Math.PI / 2 : Math.PI / 2);
      kit.add(m.barrel, ring, { y: t * height });
    }
  }
  // A dark core just inside, seen through the gaps.
  const core = [];
  for (let i = 0; i <= steps; i++) core.push(new THREE.Vector2(rAt(i / steps) * 0.975, (i / steps) * height));
  const coreG = new THREE.LatheGeometry(core, 24);
  if (open) coreG.scale(-1, 1, 1);
  kit.add(open ? m.barrel : F.groove, coreG);
  // Heads: boards, recessed 2.5 cm inside the chime.
  const head = (y, up) => {
    const g = new THREE.CircleGeometry(rAt(y / height) * 0.975, 28);
    g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    const turn = rng() * 3;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) * Math.cos(turn) - p.getZ(i) * Math.sin(turn);
      const z = p.getX(i) * Math.sin(turn) + p.getZ(i) * Math.cos(turn);
      uv.setXY(i, (x + 1) * 0.5 * 1.6, z * 0.9);
    }
    kit.add(m.barrel, g, { y });
    // Joints between the head boards, slightly sunk lines across the disc.
    const rr = rAt(y / height) * 0.975;
    kit.frame({ y: y + (up ? 0.0012 : -0.0012), ry: -turn }, () => {
      for (const f of [-0.36, 0.33]) {
        const x = f * rr;
        kit.add(F.groove, bevelBox(0.004, 0.0015, 2 * Math.sqrt(rr * rr - x * x) - 0.01, 0.0006), { x });
      }
    });
    return { rr, turn };
  };
  head(0.025, false);
  let top = null;
  if (open) {
    const water = new THREE.CircleGeometry(rAt(0.86) * 0.97, 24);
    water.rotateX(-Math.PI / 2);
    kit.add(m.water, water, { y: height * 0.86 });
  } else {
    top = head(height - 0.025, true);
    // The cooper's chalk mark on the head: a rough double cross.
    if (rng() < 0.7) {
      kit.frame({ y: height - 0.0235, ry: rng() * 3 }, () => {
        for (const dx of [-0.035, 0.035]) {
          for (const a of [0.7, -0.7]) kit.add(F.chalk, bevelBox(0.09, 0.001, 0.008, 0.0004), { x: dx, ry: a + (rng() - 0.5) * 0.15 });
        }
      });
    }
  }
  return rAt;
}

// A flat iron hoop: a band following the barrel's swell, with rivets.
function hoop(kit, m, r, y, thickness = 0.018) {
  const w = thickness * 2.6;
  const pts = [[r - 0.004, y - w / 2], [r + 0.004, y - w / 2 + 0.002], [r + 0.005, y], [r + 0.004, y + w / 2 - 0.002], [r - 0.004, y + w / 2]];
  kit.add(m.iron, new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), 28));
  const F = fittings();
  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI + 0.4;
    kit.add(F.nail, blob(0.006, 0.006, 0.004, { seed: i, dent: 0.1, detail: 0 }), { x: Math.sin(a) * (r + 0.006), y, z: Math.cos(a) * (r + 0.006), ry: a });
  }
}

// A: stout oak barrel with three hoops and a lid.
export function oakBarrel(kit, m) {
  const r = 0.36;
  const h = 0.95;
  const b = 0.13;
  const rAt = barrelBody(kit, m, { radius: r, height: h, bulge: b });
  for (const t of [0.09, 0.3, 0.7, 0.91]) hoop(kit, m, rAt(t), t * h, 0.016);
  return 0.45;
}

// B: tall, narrow rain barrel, open and full of water.
export function waterBarrel(kit, m) {
  const r = 0.33;
  const h = 1.25;
  const b = 0.07;
  const rAt = barrelBody(kit, m, { radius: r, height: h, bulge: b, open: true });
  for (const t of [0.08, 0.35, 0.65, 0.93]) hoop(kit, m, rAt(t), t * h, 0.017);
  return 0.4;
}

// C: small cask lying on a cradle of two shaped chocks, with a brass tap
// in its head, a bung on top and a pewter tankard waiting under the tap.
export function cask(kit, m) {
  const r = 0.24;
  const len = 0.62;
  const b = 0.12;
  const F = fittings();
  const cy = r + 0.2;
  kit.frame({ y: cy, z: -len / 2, rx: Math.PI / 2 }, () => {
    const rAt = barrelBody(kit, m, { radius: r, height: len, bulge: b });
    for (const t of [0.1, 0.3, 0.7, 0.9]) hoop(kit, m, rAt(t), t * len, 0.013);
    // Bung on the belly, facing up (local -z after the roll).
    kit.add(F.groove, blob(0.022, 0.012, 0.022, { seed: 4, dent: 0.15 }), { y: len / 2, z: -rAt(0.5) - 0.002, rx: Math.PI / 2 });
  });
  // Chocks: the top cut to the cask's curve, bevelled.
  const rc = r * (1 + b * Math.sin(0.18 * Math.PI)) + 0.004;
  for (const z of [-0.2, 0.2]) {
    // Splayed feet, an arch cut between them, sides tapering up to horns
    // that cup the cask.
    const shape = new THREE.Shape();
    shape.moveTo(-0.31, 0);
    shape.lineTo(-0.19, 0);
    for (let i = 1; i < 10; i++) {
      const a = (i / 10) * Math.PI;
      shape.lineTo(-Math.cos(a) * 0.19, Math.sin(a) * 0.07);
    }
    shape.lineTo(0.19, 0);
    shape.lineTo(0.31, 0);
    shape.quadraticCurveTo(0.27, 0.16, 0.26, 0.31);
    for (let i = 0; i <= 14; i++) {
      const x = 0.245 - (i / 14) * 0.49;
      shape.lineTo(x, cy - Math.sqrt(Math.max(0, rc * rc - x * x)));
    }
    shape.lineTo(-0.26, 0.31);
    shape.quadraticCurveTo(-0.27, 0.16, -0.31, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -0.035);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.6, uv.getY(i) * 1.6);
    kit.add(m.timber, g, { z });
    // Wedges under the cask either side.
    for (const sx of [-1, 1]) kit.add(m.timber, bevelBox(0.05, 0.04, 0.09, 0.008), { x: sx * 0.2, y: 0.31, z, rz: sx * 0.5 });
  }
  for (const sx of [-1, 1]) kit.add(m.timber, bevelBox(0.07, 0.05, 0.62, 0.012, { metres: 1.2, grain: true }), { x: sx * 0.24, y: 0.025 });
  // Brass tap: flange, body, a spout bending down, a turn-key on top.
  const ty = cy - r * 0.45;
  const tz = len / 2 - 0.02;
  kit.add(F.brass, organicLathe([[0.026, 0], [0.028, 0.01], [0.016, 0.02], [0.013, 0.07], [0.016, 0.08], [0, 0.085]], { segments: 10, seed: 2, dent: 0.03 }), { y: ty, z: tz, rx: Math.PI / 2 });
  kit.add(F.brass, tube([[0, ty, tz + 0.07], [0, ty - 0.005, tz + 0.1], [0, ty - 0.045, tz + 0.11]], 0.009, { radial: 6, tip: 0.007 }));
  kit.add(F.brass, organicLathe([[0.008, 0], [0.006, 0.03], [0, 0.034]], { segments: 6 }), { y: ty + 0.01, z: tz + 0.05 });
  kit.add(F.brass, blob(0.03, 0.007, 0.008, { seed: 3, dent: 0.1 }), { y: ty + 0.045, z: tz + 0.05 });
  // A pewter tankard under the tap.
  kit.frame({ x: 0.02, z: tz + 0.12 }, () => {
    kit.add(F.pewter, organicLathe([[0, 0], [0.042, 0.001], [0.045, 0.008], [0.04, 0.02], [0.038, 0.1], [0.042, 0.115], [0.04, 0.118], [0.035, 0.11], [0.034, 0.02], [0, 0.015]], { segments: 16, seed: 5, dent: 0.03 }));
    kit.add(F.pewter, tube([[0.04, 0.095, 0], [0.07, 0.09, 0], [0.072, 0.06, 0], [0.066, 0.032, 0], [0.04, 0.028, 0]], 0.0055, { radial: 5 }));
  });
  return 0.4;
}

export const BARRELS = [oakBarrel, waterBarrel, cask];

export function crate(kit, m, size = 0.7) {
  const S = size;
  const rng = mulberry32(Math.round(size * 997));
  const F = fittings();
  // A dark core, seen in the gaps between boards.
  kit.box(F.groove, S - 0.05, S - 0.05, S - 0.05, { y: S / 2 });
  const n = 3;
  const bw = (S - 0.02) / n;
  const boardLen = S - 0.12;
  const board = (t) => kit.add(m.planks, bevelBox(boardLen, bw - 0.012, 0.022, 0.006, { metres: 1.2, grain: true }), t);
  // Four sides of horizontal boards, then the lid boards.
  for (let f = 0; f < 4; f++) {
    kit.frame({ ry: (f * Math.PI) / 2 }, () => {
      for (let i = 0; i < n; i++) board({ x: (rng() - 0.5) * 0.006, y: 0.01 + bw * (i + 0.5), z: S / 2 - 0.013 });
      // Rails top and bottom, a diagonal brace, nails at the ends.
      for (const y of [0.045, S - 0.045]) kit.add(m.timber, bevelBox(S - 0.12, 0.075, 0.028, 0.008, { metres: 1.2, grain: true }), { y, z: S / 2 + 0.012 });
      const diag = Math.hypot(S - 0.16, S - 0.2);
      kit.add(m.timber, bevelBox(diag, 0.07, 0.024, 0.008, { metres: 1.2, grain: true }), { y: S / 2, z: S / 2 + 0.01, rz: Math.atan2(S - 0.2, S - 0.16) * (f % 2 ? 1 : -1) });
      for (const sx of [-1, 1]) for (const y of [0.045, S - 0.045]) kit.add(F.nail, blob(0.007, 0.007, 0.004, { seed: f, dent: 0.1, detail: 0 }), { x: sx * (S / 2 - 0.09), y, z: S / 2 + 0.027 });
    });
  }
  for (let i = 0; i < n; i++) kit.add(m.planks, bevelBox(S - 0.06, 0.022, bw - 0.012, 0.006, { metres: 1.2, grain: true }), { y: S - 0.011, z: -S / 2 + 0.01 + bw * (i + 0.5) });
  // Corner posts.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add(m.timber, bevelBox(0.06, S - 0.008, 0.06, 0.01, { metres: 1, grain: true }), { x: sx * (S / 2 - 0.022), y: S / 2 - 0.004, z: sz * (S / 2 - 0.022) });
  return S * 0.72;
}

// The village well: a ring of cobbles, a little roof on posts, a crank and a bucket.
export function well(kit, m) {
  const outer = 1.05;
  const inner = 0.78;
  const h = 0.9;
  const ring = new THREE.Shape();
  ring.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(ring, { depth: h, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 28 });
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.6, uv.getY(i) / 1.6);
  kit.add(m.cobble, g, { rx: -Math.PI / 2 });
  // The shaft, dark water far below.
  const shaft = new THREE.CylinderGeometry(inner, inner, 2.2, 24, 1, true);
  shaft.scale(-1, 1, 1);
  kit.add(m.stone, shaft, { y: -1.1 + h });
  const water = new THREE.CircleGeometry(inner, 24);
  water.rotateX(-Math.PI / 2);
  kit.add(m.water, water, { y: -1.0 });
  // Stone step around the base.
  kit.cylinder(m.ashlar, outer + 0.35, outer + 0.45, 0.18, { y: 0.02 }, { segments: 28, metres: 2 });

  // Posts, beam, crank, roof.
  const postH = 2.3;
  for (const sx of [-1, 1]) kit.box(m.timber, 0.16, postH, 0.16, { x: sx * (outer - 0.05), y: postH / 2 + 0.2 }, { metres: 1.2, grain: true });
  kit.cylinder(m.timber, 0.07, 0.07, outer * 2 + 0.3, { y: 1.75, rz: Math.PI / 2 }, { segments: 8 });
  kit.box(m.iron, 0.04, 0.35, 0.04, { x: outer + 0.2, y: 1.6 });
  kit.box(m.iron, 0.04, 0.04, 0.2, { x: outer + 0.2, y: 1.45, z: 0.1 });
  kit.cylinder(m.rope, 0.015, 0.015, 0.9, { y: 1.3 }, { segments: 5 });
  kit.frame({ y: 0.62 }, () => {
    const r = 0.17;
    const pts = [];
    for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector2(r * (0.85 + 0.15 * (i / 6)), (i / 6) * 0.3));
    kit.add(m.barrel, new THREE.LatheGeometry(pts, 14));
    hoop(kit, m, r, 0.05, 0.012);
    hoop(kit, m, r, 0.27, 0.012);
  });
  kit.frame({ y: postH + 0.2 }, () => {
    const pitch = 0.6;
    const half = 1.0;
    for (const s of [-1, 1]) {
      kit.box(m.shingles, 2.7, 0.08, half / Math.cos(pitch) + 0.2, { y: Math.tan(pitch) * half * 0.5 + 0.05, z: s * half * 0.5, rx: s * pitch, ry: 0 }, { metres: 2 });
    }
    kit.box(m.timber, 2.6, 0.14, 0.14, { y: Math.tan(pitch) * half + 0.08 }, { metres: 1.2, grain: true });
  });
  return outer + 0.2;
}
