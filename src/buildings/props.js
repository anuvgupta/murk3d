// Generated props: three kinds of barrel, crates and the village well.
// All build into a Kit at its current frame, standing on y = 0.

import * as THREE from 'three';

// Lathe a barrel body from a bulge profile. Staves come from the plank texture
// wrapping around (u) and running up the barrel (v).
function barrelBody(kit, m, { radius, height, bulge, open = false, staves = 1 }) {
  const pts = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * height;
    const r = radius * (1 + bulge * Math.sin(t * Math.PI));
    pts.push(new THREE.Vector2(r, y));
  }
  const g = new THREE.LatheGeometry(pts, 20);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * staves, uv.getY(i));
  kit.add(m.barrel, g);
  // Lids (the tall barrel is open, with water inside).
  const lid = new THREE.CircleGeometry(radius * 0.97, 20);
  lid.rotateX(-Math.PI / 2);
  if (open) {
    kit.add(m.water, lid, { y: height * 0.86 });
    const inner = new THREE.CylinderGeometry(radius * 0.96, radius * 0.96, height * 0.14, 20, 1, true);
    inner.scale(-1, 1, 1); // inward-facing
    kit.add(m.barrel, inner, { y: height * 0.93 });
  } else {
    kit.add(m.barrel, lid, { y: height - 0.01 });
  }
  const bottom = new THREE.CircleGeometry(radius * 0.97, 20);
  bottom.rotateX(Math.PI / 2);
  kit.add(m.barrel, bottom, { y: 0.01 });
}

function hoop(kit, m, r, y, thickness = 0.018) {
  const g = new THREE.TorusGeometry(r, thickness, 5, 24);
  kit.add(m.iron, g, { y, rx: Math.PI / 2 });
}

// A: stout oak barrel with three hoops and a lid.
export function oakBarrel(kit, m) {
  const r = 0.36;
  const h = 0.95;
  const b = 0.13;
  barrelBody(kit, m, { radius: r, height: h, bulge: b });
  for (const t of [0.12, 0.5, 0.88]) hoop(kit, m, r * (1 + b * Math.sin(t * Math.PI)) + 0.008, t * h, 0.02);
  return 0.45;
}

// B: tall, narrow rain barrel, open and full of water.
export function waterBarrel(kit, m) {
  const r = 0.33;
  const h = 1.25;
  const b = 0.07;
  barrelBody(kit, m, { radius: r, height: h, bulge: b, open: true });
  for (const t of [0.1, 0.9]) hoop(kit, m, r * (1 + b * Math.sin(t * Math.PI)) + 0.008, t * h, 0.022);
  hoop(kit, m, r + 0.004, h - 0.01, 0.025);
  return 0.4;
}

// C: small cask lying on a wooden cradle, with a tap.
export function cask(kit, m) {
  const r = 0.24;
  const len = 0.62;
  kit.frame({ y: r + 0.18, z: -len / 2, rx: Math.PI / 2 }, () => {
    barrelBody(kit, m, { radius: r, height: len, bulge: 0.12 });
    for (const t of [0.15, 0.85]) hoop(kit, m, r * (1 + 0.12 * Math.sin(t * Math.PI)) + 0.007, t * len, 0.016);
  });
  for (const z of [-0.2, 0.2]) {
    kit.box(m.timber, 0.62, 0.08, 0.08, { y: 0.04, z }, { metres: 1.2, grain: true });
    for (const sx of [-1, 1]) kit.box(m.timber, 0.07, 0.24, 0.08, { x: sx * 0.22, y: 0.16, z, rz: sx * 0.35 });
  }
  kit.cylinder(m.iron, 0.025, 0.025, 0.12, { y: r * 0.6, z: len / 2 + 0.05, rx: Math.PI / 2 }, { segments: 6 });
  kit.box(m.iron, 0.03, 0.08, 0.03, { y: r * 0.6 - 0.04, z: len / 2 + 0.1 });
  return 0.4;
}

export const BARRELS = [oakBarrel, waterBarrel, cask];

export function crate(kit, m, size = 0.7) {
  kit.box(m.planks, size, size, size, { y: size / 2 }, { metres: 1.2 });
  for (const y of [0.05, size - 0.05]) {
    for (const [w, d] of [[size + 0.02, 0.08], [0.08, size + 0.02]]) {
      for (const s of [-1, 1]) {
        const off = (w > d ? size / 2 : 0) * 0;
        kit.box(m.timber, w, 0.08, d, { x: w > d ? 0 : s * (size / 2 - 0.03), y, z: w > d ? s * (size / 2 - 0.03) : off }, { metres: 1.2, grain: true });
      }
    }
  }
  kit.beamBetween(m.timber, -size / 2 + 0.05, 0.08, size / 2 - 0.05, size - 0.08, 0.08, 0.04, size / 2 + 0.01);
  return size * 0.72;
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
