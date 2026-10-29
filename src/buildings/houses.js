// Five generated house designs. Each builds into a Kit in its own local frame:
// origin at ground level in the middle of the footprint, front door facing +z.
// Footprints must stay within HOUSE_FOOTPRINTS in world/plan.js.
//
//   0  Stone-and-timber cottage: rubble ground floor, jettied timber upper.
//   1  Long hall (the tavern): two timber-framed storeys, tiled roof,
//      dormers, two chimneys, an awning and a hanging sign.
//   2  Thatched stone hut: low rubble walls under a deep straw roof, with a
//      wood store lean-to.
//   3  Log house: stacked logs with notched corners and a covered porch.
//   4  Tower house: three storeys of warm stone under a steep slate pyramid,
//      with a timber gallery and an outside stair.

import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';
import { windmill, townHall, lumberMill } from './landmarks.js';

const deg = THREE.MathUtils.degToRad;

// --- Helpers ---------------------------------------------------------------

// Run fn once per wall: front (+z), back, left (-x), right (+x). Inside, local
// +z points out of the wall and x runs along it.
function walls(kit, w, d, fn) {
  kit.frame({ z: d / 2 }, () => fn('front', w));
  kit.frame({ z: -d / 2, ry: Math.PI }, () => fn('back', w));
  kit.frame({ x: -w / 2, ry: -Math.PI / 2 }, () => fn('left', d));
  kit.frame({ x: w / 2, ry: Math.PI / 2 }, () => fn('right', d));
}

function scaleUV(geometry, metres) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / metres, uv.getY(i) / metres);
  return geometry;
}

// Solid triangular gable end in the y–z plane, centred on x = 0.
function gableEnd(kit, mat, span, rise, thick, t = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(-span / 2, 0);
  shape.lineTo(span / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  scaleUV(g, 3);
  kit.add(mat, g, { ...t, ry: (t.ry || 0) + Math.PI / 2 });
}

// Pitched roof with its ridge along local x.
function gableRoof(kit, m, { mat, length, span, baseY, pitch, eave = 0.6, overhang = 0.5, thick = 0.18, trim = m.timber, metres = 2.2 }) {
  const run = span / 2 + eave;
  const slopeLen = run / Math.cos(pitch);
  const rise = (span / 2) * Math.tan(pitch);
  const apex = baseY + rise;
  const len = length + overhang * 2;
  const dir = new THREE.Vector3(0, -Math.sin(pitch), Math.cos(pitch));
  const nrm = new THREE.Vector3(0, Math.cos(pitch), Math.sin(pitch));
  for (const ry of [0, Math.PI]) {
    kit.frame({ ry }, () => {
      const c = new THREE.Vector3(0, apex, 0).addScaledVector(dir, slopeLen / 2).addScaledVector(nrm, thick / 2 + 0.02);
      kit.box(mat, len, thick, slopeLen, { x: 0, y: c.y, z: c.z, rx: pitch }, { metres });
      if (trim) {
        for (const sx of [-1, 1]) {
          const b = c.clone().addScaledVector(nrm, -0.05);
          kit.box(trim, 0.12, 0.3, slopeLen, { x: sx * (len / 2 - 0.04), y: b.y, z: b.z, rx: pitch }, { metres: 1.2, grain: true });
        }
        const f = new THREE.Vector3(0, apex, 0).addScaledVector(dir, slopeLen).addScaledVector(nrm, -0.02);
        kit.box(trim, len, 0.26, 0.1, { y: f.y, z: f.z, rx: pitch }, { metres: 1.2, grain: true });
      }
    });
  }
  return { apex, rise, len, slopeLen };
}

// Four-sided pyramid roof (square or rectangular base, ridge if not square).
function hipRoof(kit, mat, { w, d, baseY, height, overhang = 0.6, metres = 2 }) {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const ridge = Math.max(0, hw - hd);
  const top = baseY + height;
  // Eave corners and ridge ends.
  const A = [-hw, baseY, hd];
  const B = [hw, baseY, hd];
  const C = [hw, baseY, -hd];
  const D = [-hw, baseY, -hd];
  const R1 = [-ridge, top, 0];
  const R2 = [ridge, top, 0];
  const positions = [];
  const uvs = [];
  const face = (p, q, apexes) => {
    // A face from eave edge p→q up to one or two ridge points.
    const ex = q[0] - p[0];
    const ez = q[2] - p[2];
    const elen = Math.hypot(ex, ez);
    const ux = ex / elen;
    const uz = ez / elen;
    const toUV = (v) => {
      const along = (v[0] - p[0]) * ux + (v[2] - p[2]) * uz;
      // Distance up the slope from the eave.
      const mid = [p[0] + ux * along, baseY, p[2] + uz * along];
      const up = Math.hypot(v[0] - mid[0], v[1] - mid[1], v[2] - mid[2]);
      const slope = Math.hypot(height, Math.min(hw, hd));
      return [along / metres, (slope - up) / metres];
    };
    const tri = (a, b, c) => {
      for (const v of [a, b, c]) {
        positions.push(...v);
        uvs.push(...toUV(v));
      }
    };
    if (apexes.length === 1) tri(p, q, apexes[0]);
    else {
      tri(p, q, apexes[1]);
      tri(p, apexes[1], apexes[0]);
    }
  };
  face(A, B, [R1, R2]);
  face(C, D, [R2, R1]);
  face(B, C, [R2]);
  face(D, A, [R1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  kit.add(mat, g);
  return top;
}

// Window in a wall frame (local z out of the wall, wall surface at z = 0).
function windowAt(kit, m, x, y, w, h, { shutters = false, frame = m.timber, depth = 0.14, arch = false } = {}) {
  kit.frame({ x, y }, () => {
    kit.box(m.glass, w, h, 0.04, { z: 0.01 });
    const f = 0.1;
    kit.box(frame, w + f * 2, f, depth, { y: h / 2 + f / 2, z: 0.04 }, { metres: 1.2, grain: true });
    kit.box(frame, w + f * 2 + 0.12, f * 1.1, depth + 0.08, { y: -h / 2 - f / 2, z: 0.07 }, { metres: 1.2, grain: true });
    for (const s of [-1, 1]) kit.box(frame, f, h, depth, { x: s * (w / 2 + f / 2), z: 0.04 }, { metres: 1.2, grain: true });
    kit.box(frame, 0.05, h, 0.05, { z: 0.05 });
    kit.box(frame, w, 0.05, 0.05, { y: h * 0.12, z: 0.05 });
    if (arch) kit.box(m.ashlar, w + f * 2 + 0.2, 0.28, 0.2, { y: h / 2 + f + 0.14, z: 0.06 }, { metres: 2 });
    if (shutters) {
      for (const s of [-1, 1]) {
        kit.box(m.planks, w / 2 + 0.04, h + 0.08, 0.05, { x: s * (w / 2 + f + w / 4 + 0.04), z: 0.12, ry: s * 0.25 }, { metres: 1.2 });
      }
    }
  });
}

function doorAt(kit, m, x, w, h, { bottom = 0.3, surround = m.ashlar, double = false } = {}) {
  kit.frame({ x, y: bottom }, () => {
    kit.box(m.planks, w, h, 0.1, { y: h / 2, z: 0.0 }, { metres: double ? w / 2 : w });
    if (double) kit.box(m.timber, 0.05, h, 0.12, { y: h / 2, z: 0.01 });
    for (const y of [0.4, h - 0.4]) kit.box(m.iron, w * 0.85, 0.06, 0.02, { y, z: 0.06 });
    const ring = new THREE.TorusGeometry(0.07, 0.015, 6, 16);
    kit.add(m.iron, ring, { x: w * 0.3, y: 1.05, z: 0.07 });
    const j = 0.26;
    for (const s of [-1, 1]) kit.box(surround, j, h + 0.05, 0.26, { x: s * (w / 2 + j / 2), y: h / 2, z: 0.04 }, { metres: 2 });
    kit.box(surround, w + j * 2 + 0.16, 0.34, 0.3, { y: h + 0.17, z: 0.05 }, { metres: 2 });
  });
}

// Posts, rails and braces over a plaster wall, in a wall frame.
function timberFrame(kit, m, width, y0, y1, bays, { open = [], t = 0.1 } = {}) {
  const bw = width / bays;
  const h = y1 - y0;
  const z = t / 2 - 0.02;
  kit.box(m.timber, width + 0.02, 0.2, t, { y: y0 + 0.1, z }, { metres: 1.2, grain: true });
  kit.box(m.timber, width + 0.02, 0.2, t, { y: y1 - 0.1, z }, { metres: 1.2, grain: true });
  for (let i = 0; i <= bays; i++) kit.box(m.timber, 0.17, h, t, { x: -width / 2 + i * bw, y: y0 + h / 2, z }, { metres: 1.2, grain: true });
  const a = y0 + 0.2;
  const b = y1 - 0.2;
  kit.beamBetween(m.timber, -width / 2, a, -width / 2 + bw, b, 0.15, t, z);
  kit.beamBetween(m.timber, width / 2, a, width / 2 - bw, b, 0.15, t, z);
  for (let i = 1; i < bays - 1; i++) {
    if (open.includes(i)) continue;
    const x = -width / 2 + (i + 0.5) * bw;
    kit.box(m.timber, bw, 0.15, t, { x, y: y0 + h / 2, z }, { metres: 1.2, grain: true });
    if (i % 2) {
      kit.beamBetween(m.timber, x - bw / 2, a, x + bw / 2, y0 + h / 2, 0.14, t, z);
      kit.beamBetween(m.timber, x - bw / 2, b, x + bw / 2, y0 + h / 2, 0.14, t, z);
    }
  }
  return bw;
}

function chimney(kit, m, x, z, top, { mat = m.stone, w = 0.9, d = 1.0, base = 0 } = {}) {
  kit.box(mat, w, top - base, d, { x, y: (top + base) / 2, z }, { metres: 2.5 });
  kit.box(m.ashlar, w + 0.2, 0.22, d + 0.2, { x, y: top + 0.11, z }, { metres: 2 });
  kit.box(m.iron, 0.4, 0.25, 0.4, { x, y: top + 0.34, z });
  return new THREE.Vector3(x, top + 0.5, z);
}

// Solid wall block between two heights, with corner quoins.
function stoneBlock(kit, m, mat, w, d, y0, y1, quoins = true) {
  kit.box(mat, w, y1 - y0, d, { y: (y0 + y1) / 2 }, { metres: 2.6 });
  if (!quoins) return;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let y = y0 + 0.25, i = 0; y < y1 - 0.2; y += 0.5, i++) {
        const long = i % 2 === 0;
        kit.box(m.ashlar, long ? 0.66 : 0.42, 0.42, long ? 0.42 : 0.66, {
          x: sx * (w / 2 - (long ? 0.29 : 0.17)),
          y,
          z: sz * (d / 2 - (long ? 0.17 : 0.29)),
        }, { metres: 2 });
      }
    }
  }
}

// --- Designs ---------------------------------------------------------------

function cottage(kit, m, rng) {
  const W = 8;
  const D = 6;
  const stoneTop = 3.0;
  const UW = W + 0.6;
  const UD = D + 0.6;
  const upperBottom = stoneTop + 0.25;
  const upperTop = upperBottom + 2.3;
  const pitch = deg(50 + rng() * 6);
  const plaster = [m.plasterCream, m.plasterWhite, m.plasterOchre][Math.floor(rng() * 3)];
  const roofMat = rng() < 0.5 ? m.shingles : m.slate;
  const side = rng() < 0.5 ? 1 : -1;

  kit.box(m.stone, W + 0.4, 1.6, D + 0.4, { y: -0.5 }, { metres: 2.6 });
  stoneBlock(kit, m, m.stone, W, D, 0.3, stoneTop);
  kit.box(m.timber, W + 0.7, 0.25, D + 0.7, { y: stoneTop + 0.125 }, { metres: 1.2, grain: true });
  kit.box(plaster, UW, upperTop - upperBottom, UD, { y: (upperBottom + upperTop) / 2 }, { metres: 3 });
  walls(kit, UW, UD, (name, width) => {
    kit.frame({ z: 0.01 }, () => {
      const bays = name === 'front' || name === 'back' ? 6 : 4;
      const bw = timberFrame(kit, m, width, upperBottom, upperTop, bays, { open: [1, 4] });
      if (bays === 6) for (const i of [1, 4]) windowAt(kit, m, -width / 2 + (i + 0.5) * bw, upperBottom + 1.15, 0.8, 0.95);
      else if (name === (side > 0 ? 'left' : 'right')) windowAt(kit, m, 0, upperBottom + 1.15, 0.8, 0.95);
    });
  });
  walls(kit, W, D, (name) => {
    if (name === 'front') {
      doorAt(kit, m, -1.2, 1.2, 2.2);
      windowAt(kit, m, 1.9, 1.7, 0.95, 1.0, { shutters: true });
    } else if (name === 'back') {
      windowAt(kit, m, -1.8, 1.7, 0.95, 1.0, { shutters: true });
      windowAt(kit, m, 1.6, 1.7, 0.95, 1.0, { shutters: true });
    } else if (name === (side > 0 ? 'left' : 'right')) {
      windowAt(kit, m, 0.6, 1.7, 0.9, 1.0, { shutters: true });
    }
  });
  const roof = gableRoof(kit, m, { mat: roofMat, length: UW, span: UD, baseY: upperTop, pitch, eave: 0.7, overhang: 0.55 });
  for (const sx of [-1, 1]) {
    gableEnd(kit, plaster, UD, roof.rise, 0.12, { x: sx * (UW / 2 - 0.05), y: upperTop });
    kit.frame({ x: sx * (UW / 2 + 0.03), y: upperTop, ry: Math.PI / 2 }, () => {
      kit.box(m.timber, 0.16, roof.rise - 0.3, 0.1, { y: (roof.rise - 0.3) / 2 }, { metres: 1.2, grain: true });
      const cy = roof.rise * 0.38;
      kit.box(m.timber, UD * 0.62 - 0.1, 0.16, 0.1, { y: cy }, { metres: 1.2, grain: true });
    });
  }
  kit.box(m.timber, roof.len + 0.1, 0.3, 0.3, { y: roof.apex + 0.18, rx: Math.PI / 4 }, { metres: 1.2, grain: true });
  const chimneyTop = chimney(kit, m, side * (W / 2 + 0.55), 0.9, roof.apex + 1.3, { w: 1.1, d: 1.5 });
  // Doorstep and lantern.
  kit.box(m.ashlar, 2.0, 0.36, 0.8, { x: -1.2, y: 0.08, z: D / 2 + 0.42 }, { metres: 2 });
  return {
    chimneys: [chimneyTop],
    colliders: [
      { cx: 0, cz: 0, hx: W / 2 + 0.25, hz: D / 2 + 0.25 },
      { cx: side * (W / 2 + 0.55), cz: 0.9, hx: 0.7, hz: 0.9 },
    ],
    lamps: [new THREE.Vector3(-2.3, 2.6, D / 2 + 0.25)],
  };
}

function hall(kit, m, rng) {
  const W = 13;
  const D = 7.4;
  const plinth = 0.8;
  const g0 = plinth;
  const g1 = g0 + 2.9;
  const u0 = g1 + 0.25;
  const u1 = u0 + 2.6;
  const UW = W + 0.6;
  const UD = D + 0.6;
  const plaster = rng() < 0.5 ? m.plasterWhite : m.plasterRose;

  kit.box(m.stone, W + 0.3, plinth + 1.2, D + 0.3, { y: plinth / 2 - 0.6 }, { metres: 2.6 });
  kit.box(plaster, W, g1 - g0, D, { y: (g0 + g1) / 2 }, { metres: 3 });
  kit.box(m.timber, W + 0.7, 0.25, D + 0.7, { y: g1 + 0.125 }, { metres: 1.2, grain: true });
  kit.box(plaster, UW, u1 - u0, UD, { y: (u0 + u1) / 2 }, { metres: 3 });

  walls(kit, W, D, (name, width) => {
    kit.frame({ z: 0.01 }, () => {
      const long = name === 'front' || name === 'back';
      const bays = long ? 8 : 4;
      const bw = timberFrame(kit, m, width, g0, g1, bays, { open: long ? [1, 2, 3, 4, 5, 6] : [1, 2] });
      if (long) {
        for (const i of [1, 2, 5, 6]) windowAt(kit, m, -width / 2 + (i + 0.5) * bw, g0 + 1.5, 0.85, 1.15);
        if (name === 'front') doorAt(kit, m, 0, 1.9, 2.3, { bottom: g0, surround: m.timber, double: true });
        else windowAt(kit, m, 0, g0 + 1.5, 0.85, 1.15);
      } else windowAt(kit, m, 0, g0 + 1.5, 0.85, 1.1);
    });
  });
  walls(kit, UW, UD, (name, width) => {
    kit.frame({ z: 0.01 }, () => {
      const long = name === 'front' || name === 'back';
      const bays = long ? 8 : 4;
      const bw = timberFrame(kit, m, width, u0, u1, bays, { open: long ? [1, 2, 3, 4, 5, 6] : [1, 2] });
      if (long) for (const i of [1, 2, 3, 4, 5, 6]) if (i !== 3 && i !== 4) windowAt(kit, m, -width / 2 + (i + 0.5) * bw, u0 + 1.2, 0.8, 0.95);
      if (long) windowAt(kit, m, 0, u0 + 1.2, 1.0, 0.95);
    });
  });

  // Front steps up to the plinth.
  for (let i = 0; i < 3; i++) kit.box(m.ashlar, 3.0 - i * 0.3, 0.27, 0.45, { y: 0.13 + i * 0.27, z: D / 2 + 1.1 - i * 0.4 }, { metres: 2 });

  const pitch = deg(46);
  const roof = gableRoof(kit, m, { mat: m.clay, length: UW, span: UD, baseY: u1, pitch, eave: 0.7, overhang: 0.6, metres: 2 });
  for (const sx of [-1, 1]) gableEnd(kit, plaster, UD, roof.rise, 0.12, { x: sx * (UW / 2 - 0.05), y: u1 });
  kit.box(m.clay, roof.len + 0.1, 0.32, 0.32, { y: roof.apex + 0.18, rx: Math.PI / 4 }, { metres: 1 });

  // Dormers on the front slope.
  for (const dx of [-3.6, 3.6]) {
    const zFace = UD / 2 - 1.1;
    const y0 = u1 + (UD / 2 - zFace) * Math.tan(pitch) * 0 + 0.2;
    kit.frame({ x: dx, z: zFace, y: y0 }, () => {
      kit.box(plaster, 1.6, 1.5, 2.2, { y: 0.75, z: -1.0 }, { metres: 3 });
      windowAt(kit, m, 0, 0.8, 0.7, 0.8, {});
      // Dormer ridge runs out from the main roof, toward the front.
      let r;
      kit.frame({ z: -1.0, ry: Math.PI / 2 }, () => {
        r = gableRoof(kit, m, { mat: m.clay, length: 2.2, span: 1.6, baseY: 1.5, pitch: deg(48), eave: 0.25, overhang: 0.15, trim: m.timber, metres: 2 });
      });
      gableEnd(kit, plaster, 1.6, r.rise, 0.1, { y: 1.5, z: 0.05, ry: -Math.PI / 2 });
    });
  }

  const chimneys = [
    chimney(kit, m, -W / 2 + 1.6, -0.6, roof.apex + 1.0, { w: 0.9, d: 0.9, base: u1 - 0.5 }),
    chimney(kit, m, W / 2 - 1.6, -0.6, roof.apex + 1.0, { w: 0.9, d: 0.9, base: u1 - 0.5 }),
  ];

  // Awning over the door on carved brackets.
  kit.frame({ y: g1 - 0.15, z: D / 2 }, () => {
    kit.box(m.clay, 3.2, 0.1, 1.3, { y: 0.2, z: 0.6, rx: deg(18) }, { metres: 2 });
    for (const sx of [-1.4, 1.4]) {
      kit.frame({ x: sx, ry: Math.PI / 2 }, () => kit.beamBetween(m.timber, 0, -0.9, -1.1, 0.15, 0.12, 0.12, 0));
    }
  });
  // Hanging sign.
  kit.frame({ x: 2.8, y: g1 - 0.5, z: D / 2 }, () => {
    kit.box(m.iron, 0.05, 0.05, 1.1, { y: 0.4, z: 0.55 });
    kit.box(m.iron, 0.02, 0.3, 0.02, { y: 0.25, z: 0.9 });
    kit.box(m.iron, 0.02, 0.3, 0.02, { y: 0.25, z: 0.3 });
    kit.box(m.planks, 0.06, 0.62, 0.8, { y: -0.15, z: 0.6 }, { metres: 0.8 });
    kit.box(m.cloth, 0.07, 0.3, 0.45, { y: -0.12, z: 0.6 });
  });

  return {
    chimneys,
    colliders: [{ cx: 0, cz: 0, hx: W / 2 + 0.2, hz: D / 2 + 0.2 }],
    lamps: [new THREE.Vector3(-1.4, g0 + 2.2, D / 2 + 0.3), new THREE.Vector3(1.4, g0 + 2.2, D / 2 + 0.3)],
  };
}

function hut(kit, m, rng) {
  const W = 6.2;
  const D = 5.0;
  const wallTop = 2.5;
  const warm = rng() < 0.5;
  const stone = warm ? m.stoneWarm : m.stone;

  kit.box(stone, W + 0.3, 1.4, D + 0.3, { y: -0.5 }, { metres: 2.6 });
  stoneBlock(kit, m, stone, W, D, 0.2, wallTop, false);
  walls(kit, W, D, (name) => {
    if (name === 'front') {
      doorAt(kit, m, 0.4, 1.1, 2.0, { bottom: 0.2, surround: m.timber });
      windowAt(kit, m, -1.7, 1.45, 0.7, 0.75, { shutters: true });
    } else if (name === 'back') windowAt(kit, m, 0.8, 1.45, 0.7, 0.75, { shutters: true });
    else if (name === 'right') windowAt(kit, m, 0, 1.45, 0.6, 0.7, {});
  });
  // Stone gables carry the roof.
  const pitch = deg(52);
  const rise = (D / 2) * Math.tan(pitch);
  for (const sx of [-1, 1]) gableEnd(kit, stone, D, rise, 0.5, { x: sx * (W / 2 - 0.25), y: wallTop });
  // Thick, deep thatch with a rolled ridge.
  const roof = gableRoof(kit, m, { mat: m.thatch, length: W, span: D, baseY: wallTop, pitch, eave: 0.9, overhang: 0.45, thick: 0.45, trim: null, metres: 2.4 });
  kit.cylinder(m.thatch, 0.38, 0.38, roof.len + 0.1, { y: roof.apex + 0.32, rz: Math.PI / 2 }, { segments: 10, metres: 2 });
  const top = chimney(kit, m, -W / 2 + 0.25, 0, roof.apex + 0.9, { mat: stone, w: 0.7, d: 0.8, base: wallTop });

  // Wood-store lean-to on the right side.
  kit.frame({ x: W / 2, z: 0 }, () => {
    for (const z of [-1.8, 1.8]) kit.cylinder(m.logs, 0.08, 0.09, 2.0, { x: 1.4, y: 1.0, z }, { segments: 7 });
    kit.box(m.planks, 1.9, 0.07, 4.2, { x: 0.8, y: 2.05, rz: deg(-14) }, { metres: 1.2 });
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 9 - r; i++) {
        kit.cylinder(m.logs, 0.11, 0.11, 0.9, { x: 0.7, y: 0.11 + r * 0.2, z: -1.5 + i * 0.24 + r * 0.12, rz: Math.PI / 2, rx: (rng() - 0.5) * 0.1 }, { segments: 7 });
      }
    }
  });

  return {
    chimneys: [top],
    colliders: [
      { cx: 0, cz: 0, hx: W / 2 + 0.2, hz: D / 2 + 0.2 },
      { cx: W / 2 + 0.9, cz: 0, hx: 0.9, hz: 2.1 },
    ],
    lamps: [],
  };
}

function logHouse(kit, m, rng) {
  const W = 8.0;
  const D = 6.0;
  const porch = 2.4;
  const z0 = -porch / 2; // main block shifted back so the porch fits the footprint
  const r = 0.17;
  const courses = 9;
  const wallTop = 0.35 + courses * r * 1.85;

  kit.frame({ z: z0 }, () => {
    kit.box(m.stone, W + 0.4, 1.2, D + 0.4, { y: -0.3 }, { metres: 2.6 });
    // Logs alternate between the long and short walls, overhanging at the corners.
    for (let i = 0; i < courses * 2; i++) {
      const y = 0.4 + i * r * 0.925;
      if (i % 2 === 0) {
        for (const sz of [-1, 1]) kit.cylinder(m.logs, r, r, W + 0.7, { y, z: sz * (D / 2 - r), rz: Math.PI / 2 }, { segments: 8, metres: 1.4 });
      } else {
        for (const sx of [-1, 1]) kit.cylinder(m.logs, r, r, D + 0.7, { x: sx * (W / 2 - r), y, rx: Math.PI / 2 }, { segments: 8, metres: 1.4 });
      }
    }
    // Infill behind the logs so there are no gaps.
    kit.box(m.timber, W - 0.4, wallTop - 0.4, D - 0.4, { y: (wallTop + 0.4) / 2 }, { metres: 1.2 });
    walls(kit, W, D, (name) => {
      kit.frame({ z: 0.06 }, () => {
        if (name === 'front') {
          doorAt(kit, m, 0, 1.2, 2.15, { bottom: 0.4, surround: m.timber });
          for (const x of [-2.4, 2.4]) windowAt(kit, m, x, 1.75, 0.9, 1.0, { shutters: true, frame: m.timberLight });
        } else if (name === 'back') windowAt(kit, m, 0, 1.75, 0.9, 1.0, { frame: m.timberLight });
        else if (name === 'left') windowAt(kit, m, 0.6, 1.75, 0.9, 1.0, { shutters: true, frame: m.timberLight });
      });
    });
    const pitch = deg(38);
    const roof = gableRoof(kit, m, { mat: m.shingles, length: W, span: D, baseY: wallTop, pitch, eave: 0.6, overhang: 0.6 });
    for (const sx of [-1, 1]) gableEnd(kit, m.planks, D, roof.rise, 0.14, { x: sx * (W / 2 - 0.2), y: wallTop });
    kit.box(m.timber, roof.len + 0.1, 0.28, 0.28, { y: roof.apex + 0.16, rx: Math.PI / 4 }, { metres: 1.2, grain: true });
    this.top = chimney(kit, m, W / 2 + 0.45, -0.6, roof.apex + 1.1, { mat: m.cobble, w: 0.9, d: 1.1 });
    this.apex = roof.apex;
  });

  // Covered porch across the front.
  const pz = z0 + D / 2;
  kit.frame({ z: pz }, () => {
    kit.box(m.planks, W + 0.4, 0.3, porch, { y: 0.25, z: porch / 2 }, { metres: 1.2 });
    for (let i = 0; i < 2; i++) kit.box(m.planks, 1.6, 0.2, 0.4, { y: 0.1 - i * 0.12, z: porch + 0.2 + i * 0.35 }, { metres: 1.2 });
    const postH = wallTop - 0.65;
    for (const x of [-W / 2, -1.2, 1.2, W / 2]) kit.cylinder(m.logs, 0.11, 0.12, postH, { x, y: 0.4 + postH / 2, z: porch - 0.2 }, { segments: 8 });
    kit.box(m.timber, W + 0.3, 0.22, 0.22, { y: 0.4 + postH, z: porch - 0.2 }, { metres: 1.2, grain: true });
    // Lean-to porch roof from the wall to the posts.
    const drop = 0.45;
    const run = porch + 0.4;
    kit.box(m.shingles, W + 0.9, 0.12, Math.hypot(run, drop), { y: wallTop - 0.05 - drop / 2 + 0.1, z: run / 2, rx: Math.atan2(drop, run) }, { metres: 2.2 });
    // Railing either side of the steps.
    for (const sx of [-1, 1]) {
      kit.box(m.timberLight, 2.4, 0.1, 0.1, { x: sx * 2.6, y: 1.25, z: porch - 0.2 }, { metres: 1.2, grain: true });
      for (let i = 0; i < 6; i++) kit.box(m.timberLight, 0.06, 0.8, 0.06, { x: sx * (1.6 + i * 0.4), y: 0.85, z: porch - 0.2 });
    }
  });

  return {
    chimneys: [this.top.clone().add(new THREE.Vector3(0, 0, z0))],
    colliders: [
      { cx: 0, cz: z0, hx: W / 2 + 0.4, hz: D / 2 + 0.3 },
      { cx: W / 2 + 0.45, cz: z0 - 0.6, hx: 0.6, hz: 0.7 },
    ],
    lamps: [new THREE.Vector3(-0.9, 2.45, pz + 0.15)],
    // The porch deck is walkable.
    decks: [{ cx: 0, cz: pz + porch / 2, hx: W / 2 + 0.2, hz: porch / 2, y: 0.4 }],
  };
}

function tower(kit, m, rng) {
  const W = 6.0;
  const top = 8.6;
  const stone = m.stoneWarm;

  kit.box(stone, W + 0.4, 1.4, W + 0.4, { y: -0.5 }, { metres: 2.6 });
  stoneBlock(kit, m, stone, W, W, 0.2, top);
  // String courses between storeys.
  for (const y of [3.0, 5.9]) kit.box(m.ashlar, W + 0.16, 0.22, W + 0.16, { y }, { metres: 2 });
  kit.box(m.ashlar, W + 0.3, 0.3, W + 0.3, { y: top }, { metres: 2 });

  walls(kit, W, W, (name) => {
    if (name === 'front') {
      doorAt(kit, m, 0, 1.1, 2.1, { bottom: 0.95 });
      windowAt(kit, m, -1.6, 4.4, 0.55, 0.95, { arch: true, frame: m.ashlar });
      windowAt(kit, m, 0, 7.2, 0.7, 1.0, { arch: true, frame: m.ashlar });
    } else {
      windowAt(kit, m, 0, 1.9, 0.5, 0.8, { arch: true, frame: m.ashlar });
      windowAt(kit, m, name === 'back' ? 1.2 : -1.2, 4.4, 0.55, 0.95, { arch: true, frame: m.ashlar });
      windowAt(kit, m, 0, 7.2, 0.7, 1.0, { arch: true, frame: m.ashlar });
    }
  });
  // Steps up to the raised door.
  for (let i = 0; i < 4; i++) kit.box(m.ashlar, 1.8, 0.25, 0.4, { y: 0.12 + i * 0.22, z: W / 2 + 1.35 - i * 0.35 }, { metres: 2 });

  // Timber gallery on the top storey's front, on brackets.
  kit.frame({ y: 6.2, z: W / 2 }, () => {
    kit.box(m.planks, 3.4, 0.12, 1.0, { y: 0, z: 0.5 }, { metres: 1.2 });
    for (const x of [-1.5, -0.5, 0.5, 1.5]) kit.frame({ x, ry: Math.PI / 2 }, () => kit.beamBetween(m.timber, 0, -0.8, -0.9, -0.05, 0.12, 0.12, 0));
    kit.box(m.timber, 3.4, 0.08, 0.08, { y: 1.0, z: 0.95 }, { metres: 1.2, grain: true });
    for (let i = 0; i < 9; i++) kit.box(m.timber, 0.05, 0.9, 0.05, { x: -1.6 + i * 0.4, y: 0.5, z: 0.95 });
    for (const x of [-1.6, 1.6]) kit.box(m.timber, 0.08, 1.0, 1.0, { x, y: 0.5, z: 0.5 });
  });

  const roofTop = hipRoof(kit, m.slate, { w: W, d: W, baseY: top + 0.1, height: 5.2, overhang: 0.6 });
  kit.cylinder(m.iron, 0.02, 0.05, 1.2, { y: roofTop + 0.5 }, { segments: 6 });
  const chim = chimney(kit, m, 1.4, -1.4, roofTop - 1.2, { mat: stone, w: 0.8, d: 0.8, base: top });

  return {
    chimneys: [chim],
    colliders: [
      { cx: 0, cz: 0, hx: W / 2 + 0.25, hz: W / 2 + 0.25 },
      { cx: 0, cz: W / 2 + 0.9, hx: 0.95, hz: 0.75 },
    ],
    lamps: [new THREE.Vector3(-0.95, 2.6, W / 2 + 0.25)],
  };
}

const DESIGNS = [cottage, hall, hut, logHouse, tower, windmill, townHall, lumberMill];

export const HOUSE_NAMES = ['cottage', 'hall', 'thatched hut', 'log house', 'tower house', 'windmill', 'town hall', 'lumber mill'];

// Build one house into the kit at the kit's current frame.
export function buildHouse(kit, m, design, seed) {
  const rng = mulberry32(seed * 7919 + design * 104729);
  return DESIGNS[design].call({}, kit, m, rng);
}
