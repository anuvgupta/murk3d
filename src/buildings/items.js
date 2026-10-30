// Generated items: treasure chests, coin purses and weapons. Each builds into
// a Kit at its current frame, resting on y = 0, and returns a footprint
// radius. Weapons lie flat along local +x with the grip at the origin, so a
// display stand can lay them on a table or rack.
//
// Materials for weapons come in four kinds: wooden (training), steel,
// obsidian (dark volcanic glass with a faint inner glow) and emerald (deep
// green crystal, translucent, catching the light).

import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';
import { bevelBox, organicLathe, tube, blob } from './shapes.js';

// --- Weapon materials --------------------------------------------------------

export function createItemMaterials(m) {
  const mat = (o) => new THREE.MeshStandardMaterial(o);
  const items = {
    wood: m.timber,
    woodLight: m.timberLight,
    leather: mat({ color: 0x4a2f1c, roughness: 0.85, metalness: 0 }),
    leatherDark: mat({ color: 0x2b1a10, roughness: 0.9, metalness: 0 }),
    steel: mat({ color: 0xb8bcc2, roughness: 0.32, metalness: 0.95 }),
    steelDark: mat({ color: 0x5b6068, roughness: 0.5, metalness: 0.9 }),
    brass: mat({ color: 0xc69b3a, roughness: 0.4, metalness: 0.9 }),
    gold: mat({ color: 0xe0b44a, roughness: 0.3, metalness: 1.0 }),
    obsidian: mat({ color: 0x0d0b10, roughness: 0.12, metalness: 0.2, emissive: 0x3a1050, emissiveIntensity: 0.25 }),
    obsidianEdge: mat({ color: 0x1a1522, roughness: 0.06, metalness: 0.3, emissive: 0x6a2a90, emissiveIntensity: 0.5 }),
    emerald: mat({ color: 0x1e8a4a, roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.88, emissive: 0x0d4a26, emissiveIntensity: 0.45 }),
    emeraldEdge: mat({ color: 0x5ad28a, roughness: 0.05, metalness: 0.2, emissive: 0x2a9a55, emissiveIntensity: 0.8 }),
    ironBand: m.iron,
    velvet: mat({ color: 0x6a1a2a, roughness: 1.0, metalness: 0 }),
    awning: awningMaterial(),
    purseLeather: mat({ color: 0x8a5a34, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }),
    velvetDrape: mat({ color: 0x5a1424, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }),
    coin: mat({ color: 0xe6c05a, roughness: 0.35, metalness: 1.0 }),
    gemRed: mat({ color: 0xb8203a, roughness: 0.1, metalness: 0.1, emissive: 0x5a0a18, emissiveIntensity: 0.5 }),
    gemBlue: mat({ color: 0x2a5ad8, roughness: 0.1, metalness: 0.1, emissive: 0x0a1a60, emissiveIntensity: 0.5 }),
    bone: mat({ color: 0xe8e0cc, roughness: 0.6, metalness: 0 }),
  };
  for (const k of ['obsidianEdge', 'emeraldEdge', 'emerald', 'obsidian', 'gemRed', 'gemBlue']) items[k].userData.noShadow = false;
  return items;
}

// Striped market canvas: cream and madder red, a little weathered.
function awningMaterial() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e6d8b8';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#8a2a22';
  ctx.fillRect(0, 0, 64, 64);
  const rng = mulberry32(5);
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(60,40,20,${rng() * 0.08})`;
    ctx.fillRect(rng() * 128, rng() * 64, 1 + rng() * 6, 1 + rng() * 3);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95, side: THREE.DoubleSide });
}

// Per-kind material sets for a weapon: blade, edge highlight, guard, grip, pommel.
function weaponKind(im, kind) {
  switch (kind) {
    case 'wooden':
      return { blade: im.woodLight, edge: im.woodLight, guard: im.wood, grip: im.leather, pommel: im.wood };
    case 'steel':
      return { blade: im.steel, edge: im.steel, guard: im.steelDark, grip: im.leather, pommel: im.brass };
    case 'obsidian':
      return { blade: im.obsidian, edge: im.obsidianEdge, guard: im.steelDark, grip: im.leatherDark, pommel: im.obsidianEdge };
    case 'emerald':
      return { blade: im.emerald, edge: im.emeraldEdge, guard: im.gold, grip: im.leatherDark, pommel: im.gold };
  }
}

// --- Blade geometry ---------------------------------------------------------

// A double-edged blade as a flattened diamond cross-section along +x:
// fuller (groove) down the middle, tapering to a point. Edges are a thin
// second strip so a glowing kind can light up along the cutting edge.
function bladeGeometry(len, width, thick, { taperStart = 0.6, fuller = true } = {}) {
  const positions = [];
  const indices = [];
  const segs = 10;
  const ring = (x, w, t) => {
    const base = positions.length / 3;
    // Six points round the diamond: top edge, upper faces (x2), bottom edge, lower faces (x2).
    const pts = [
      [0, w / 2, 0],
      [0, w * 0.2, t / 2],
      [0, -w * 0.2, t / 2],
      [0, -w / 2, 0],
      [0, -w * 0.2, -t / 2],
      [0, w * 0.2, -t / 2],
    ];
    for (const p of pts) positions.push(x + p[0], p[1], p[2]);
    return base;
  };
  let prev = null;
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const taper = f < taperStart ? 1 : 1 - Math.pow((f - taperStart) / (1 - taperStart), 1.6);
    const w = Math.max(0.004, width * (0.92 + 0.08 * (1 - f)) * taper);
    const t = Math.max(0.003, thick * (0.9 + 0.1 * (1 - f)) * (0.3 + 0.7 * taper));
    const b = ring(f * len, w, t);
    if (prev !== null) {
      for (let k = 0; k < 6; k++) {
        const k2 = (k + 1) % 6;
        indices.push(prev + k, b + k, b + k2, prev + k, b + k2, prev + k2);
      }
    }
    prev = b;
  }
  // Cap the tang end.
  const c = positions.length / 3;
  positions.push(0, 0, 0);
  for (let k = 0; k < 6; k++) indices.push(c, (k + 1) % 6, k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  if (fuller) {
    // Shallow groove: pull the face centres in a little.
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const x = pos.getX(i);
      if (Math.abs(y) < width * 0.25 && Math.abs(z) > 0 && x > len * 0.08 && x < len * 0.7) pos.setZ(i, z * 0.75);
    }
    g.computeVertexNormals();
  }
  return g;
}

// Thin strips along both edges for the highlight material.
function edgeStrips(kit, material, len, width, thick) {
  for (const s of [-1, 1]) {
    const g = bladeGeometry(len, width * 0.12, thick * 0.9, { fuller: false });
    g.translate(0, s * (width / 2 - width * 0.06), 0);
    kit.add(material, g);
  }
}

// --- Hilts ---------------------------------------------------------------------

// A hilt laid along -x from the guard at x = 0: a turned grip swelling in
// the middle with a leather wrap spiralling round it, a guard curving
// toward the blade with knobbed ends, a collar and an oblong wheel pommel.
function hilt(kit, k, { gripLen, gripR, guardSpan, guardR, pommel, seed = 1, wrap = true, quillons = 0.35 }) {
  const grip = [[gripR * 0.92, 0], [gripR * 1.05, gripLen * 0.35], [gripR * 1.08, gripLen * 0.6], [gripR * 0.95, gripLen]];
  kit.add(k.grip, organicLathe(grip, { segments: 10, seed, dent: 0.04, oval: 0.12 }), { rz: Math.PI / 2 });
  if (wrap) {
    const turns = Math.max(4, Math.round(gripLen / 0.02));
    const pts = [];
    for (let i = 0; i <= turns * 8; i++) {
      const f = i / (turns * 8);
      const a = f * turns * Math.PI * 2;
      const r = gripR * (1.02 + 0.08 * Math.sin(f * Math.PI)) + 0.0012;
      pts.push([-f * gripLen, Math.cos(a) * r, Math.sin(a) * r * 0.88]);
    }
    kit.add(k.grip, tube(pts, gripR * 0.16, { radial: 3, tubular: turns * 8 }));
  }
  // Guard: a block at the root, quillons curving toward the blade.
  kit.add(k.guard, bevelBox(guardR * 3.2, guardR * 3.6, guardR * 2.4, guardR * 0.6), { x: guardR * 1.2 });
  for (const sy of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const f = i / 6;
      pts.push([guardR + Math.pow(f, 2) * guardSpan * quillons, sy * (guardR * 1.5 + f * (guardSpan - guardR * 1.5)), 0]);
    }
    kit.add(k.guard, tube(pts, guardR, { radial: 6, tip: guardR * 0.7 }));
    const end = pts[pts.length - 1];
    kit.add(k.guard, blob(guardR * 1.5, guardR * 1.7, guardR * 1.5, { seed: seed + sy, dent: 0.1 }), { x: end[0], y: end[1], z: 0 });
  }
  // Collar and pommel.
  kit.add(k.pommel, organicLathe([[0, 0], [gripR * 1.25, 0.002], [gripR * 1.35, pommel * 0.25], [gripR * 1.1, pommel * 0.45], [0, pommel * 0.5]], { segments: 10, seed: seed + 3, dent: 0.03, oval: 0.1 }), { x: -gripLen + 0.002, rz: Math.PI / 2 });
  kit.add(k.pommel, blob(pommel * 0.55, pommel, pommel * 0.62, { seed: seed + 5, dent: 0.06, detail: 2 }), { x: -gripLen - pommel * 0.75 });
}

// --- Weapons ------------------------------------------------------------------

export function sword(kit, im, kind, seed = 1) {
  const k = weaponKind(im, kind);
  const rng = mulberry32(seed);
  const bladeLen = 0.78 + rng() * 0.08;
  const bladeW = 0.052;
  const bladeT = 0.009;
  const gripLen = 0.11;
  // Grip, guard, blade, pommel laid along +x; grip from -gripLen..0.
  hilt(kit, k, { gripLen, gripR: 0.0145, guardSpan: 0.095, guardR: 0.0075, pommel: 0.024, seed, wrap: kind !== 'wooden' });
  // Blade.
  kit.frame({ x: 0.027 }, () => {
    kit.add(k.blade, bladeGeometry(bladeLen, bladeW, bladeT));
    if (kind !== 'wooden') edgeStrips(kit, k.edge, bladeLen, bladeW, bladeT);
  });
  return { length: gripLen + 0.03 + bladeLen, name: `${kind} sword` };
}

export function dagger(kit, im, kind, seed = 1) {
  const k = weaponKind(im, kind);
  const rng = mulberry32(seed + 7);
  const bladeLen = 0.26 + rng() * 0.04;
  const bladeW = 0.036;
  const bladeT = 0.007;
  const gripLen = 0.095;
  // Short guard swept hard toward the blade.
  hilt(kit, k, { gripLen, gripR: 0.0115, guardSpan: 0.05, guardR: 0.006, pommel: 0.018, seed: seed + 7, wrap: kind !== 'wooden', quillons: 0.6 });
  kit.frame({ x: 0.018 }, () => {
    kit.add(k.blade, bladeGeometry(bladeLen, bladeW, bladeT, { taperStart: 0.45 }));
    if (kind !== 'wooden') edgeStrips(kit, k.edge, bladeLen, bladeW, bladeT);
  });
  return { length: gripLen + 0.02 + bladeLen, name: `${kind} dagger` };
}

export function greatsword(kit, im, kind, seed = 1) {
  const k = weaponKind(im, kind);
  const rng = mulberry32(seed + 13);
  const bladeLen = 1.25 + rng() * 0.1;
  const bladeW = 0.075;
  const bladeT = 0.012;
  const gripLen = 0.3;
  // Long two-hand grip, wrapped, with a wide guard swept toward the blade.
  hilt(kit, k, { gripLen, gripR: 0.0175, guardSpan: 0.16, guardR: 0.01, pommel: 0.032, seed: seed + 13, wrap: kind !== 'wooden', quillons: 0.3 });
  // A collar dividing the two hands.
  kit.add(k.guard, organicLathe([[0.019, 0], [0.022, 0.008], [0.022, 0.016], [0.019, 0.024]], { segments: 10, seed, dent: 0.03 }), { x: -gripLen / 2 + 0.012, rz: Math.PI / 2 });
  kit.frame({ x: 0.036 }, () => {
    // Ricasso: a blunt rectangular root before the edge begins.
    kit.box(k.blade, 0.16, bladeW * 0.8, bladeT * 1.3, { x: 0.08 });
    // Parrying hooks at the end of the ricasso.
    for (const s of [-1, 1]) kit.box(k.guard, 0.025, 0.05, 0.02, { x: 0.165, y: s * (bladeW * 0.55), rz: -s * 0.3 });
    kit.frame({ x: 0.16 }, () => {
      kit.add(k.blade, bladeGeometry(bladeLen - 0.16, bladeW, bladeT, { taperStart: 0.7 }));
      if (kind !== 'wooden') edgeStrips(kit, k.edge, bladeLen - 0.16, bladeW, bladeT);
    });
  });
  return { length: gripLen + 0.04 + bladeLen, name: `${kind} greatsword` };
}

export const WEAPON_KINDS = ['wooden', 'steel', 'obsidian', 'emerald'];
export const WEAPON_TYPES = { sword, dagger, greatsword };

// --- Chests -------------------------------------------------------------------

// Shared lid shape: a barrel-vaulted lid of the given width/depth.
function vaultLid(kit, material, w, d, rise, t = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.quadraticCurveTo(w / 2, rise, w / 2 - w * 0.18, rise);
  shape.lineTo(-w / 2 + w * 0.18, rise);
  shape.quadraticCurveTo(-w / 2, rise, -w / 2, 0);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -d / 2);
  // Bands along the lid get their own UVs; the lid texture repeats per metre.
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.2, uv.getY(i) * 1.2);
  kit.add(material, g, t);
}

// A: plain oak travelling chest with iron bands and a hasp.
export function chestOak(kit, m, im) {
  const w = 0.9;
  const d = 0.52;
  const h = 0.46;
  kit.box(m.planks, w, h, d, { y: h / 2 }, { metres: 0.9 });
  // Iron bands round the body.
  for (const x of [-w * 0.32, w * 0.32]) {
    kit.box(im.ironBand, 0.05, h + 0.01, d + 0.012, { x, y: h / 2 });
  }
  // Corner brackets.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(im.ironBand, 0.04, 0.12, 0.04, { x: sx * (w / 2 - 0.015), y: 0.06, z: sz * (d / 2 - 0.015) });
  // Vaulted lid with bands.
  kit.frame({ y: h, rx: 0 }, () => {
    vaultLid(kit, m.planks, d + 0.02, w + 0.02, 0.16, { ry: Math.PI / 2 });
    for (const x of [-w * 0.32, w * 0.32]) vaultLid(kit, im.ironBand, d + 0.05, 0.06, 0.175, { x, ry: Math.PI / 2 });
    // Hinge strap across the back of the lid.
    kit.box(im.ironBand, w * 0.9, 0.03, 0.08, { y: 0.02, z: -d / 2 + 0.02 });
  });
  // Hasp and lock plate.
  kit.box(im.ironBand, 0.07, 0.11, 0.015, { y: h - 0.03, z: d / 2 + 0.008 });
  kit.box(im.brass, 0.045, 0.045, 0.012, { y: h - 0.07, z: d / 2 + 0.014 });
  // Feet.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(m.timber, 0.07, 0.05, 0.07, { x: sx * (w / 2 - 0.05), y: -0.02, z: sz * (d / 2 - 0.05) });
  return { r: 0.55, name: 'oak chest' };
}

// B: ornate treasure chest, dark wood with gilt fittings and a gem on the lock,
// lid ajar with coins spilling.
export function chestGilt(kit, m, im) {
  const w = 0.82;
  const d = 0.5;
  const h = 0.42;
  const dark = m.timber;
  kit.box(dark, w, h, d, { y: h / 2 }, { metres: 0.9 });
  // Gilt edging on every edge of the body.
  const e = 0.022;
  for (const sy of [0, h]) {
    kit.box(im.gold, w + e, e, e, { y: sy, z: d / 2 });
    kit.box(im.gold, w + e, e, e, { y: sy, z: -d / 2 });
    kit.box(im.gold, e, e, d + e, { x: w / 2, y: sy });
    kit.box(im.gold, e, e, d + e, { x: -w / 2, y: sy });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(im.gold, e, h, e, { x: sx * (w / 2), y: h / 2, z: sz * (d / 2) });
  // Gilt filigree bands.
  for (const x of [-w * 0.3, 0, w * 0.3]) kit.box(im.gold, 0.035, h, d + 0.01, { x, y: h / 2 });
  // Lid ajar: hinged at the back, open ~35°.
  const open = 0.6;
  kit.frame({ y: h, z: -d / 2, rx: -open }, () => {
    kit.frame({ z: d / 2 }, () => {
      vaultLid(kit, dark, d + 0.02, w + 0.02, 0.15, { ry: Math.PI / 2 });
      for (const x of [-w * 0.3, 0, w * 0.3]) vaultLid(kit, im.gold, d + 0.05, 0.04, 0.165, { x, ry: Math.PI / 2 });
      // Velvet lining visible on the underside of the lid.
      kit.box(im.velvet, w - 0.06, 0.01, d - 0.06, { y: 0.006 });
    });
  });
  // Lock plate with a ruby.
  kit.box(im.gold, 0.1, 0.12, 0.014, { y: h - 0.04, z: d / 2 + 0.008 });
  kit.add(im.gemRed, new THREE.OctahedronGeometry(0.028, 0), { y: h - 0.04, z: d / 2 + 0.03, rx: Math.PI / 4 });
  // Coins heaped inside and spilling over the front lip.
  const rng = mulberry32(31);
  kit.box(im.coin, w - 0.08, 0.06, d - 0.08, { y: h - 0.06 });
  for (let i = 0; i < 40; i++) {
    const x = (rng() - 0.5) * (w - 0.12);
    const z = (rng() - 0.5) * (d - 0.12);
    kit.cylinder(im.coin, 0.022, 0.022, 0.004, { x, y: h - 0.03 + rng() * 0.04, z, rx: (rng() - 0.5) * 0.8, rz: (rng() - 0.5) * 0.8 }, { segments: 12 });
  }
  for (let i = 0; i < 12; i++) {
    kit.cylinder(im.coin, 0.022, 0.022, 0.004, { x: (rng() - 0.5) * w * 0.8, y: 0.003 + rng() * 0.01, z: d / 2 + 0.06 + rng() * 0.22, ry: rng() * 3, rx: (rng() - 0.5) * 0.2 }, { segments: 12 });
  }
  // Gems among the coins.
  kit.add(im.gemBlue, new THREE.OctahedronGeometry(0.03, 0), { x: 0.2, y: h + 0.01, z: 0.05 });
  kit.add(im.gemRed, new THREE.OctahedronGeometry(0.026, 0), { x: -0.15, y: h, z: -0.08 });
  return { r: 0.55, name: 'gilt treasure chest' };
}

// C: ancient stone-and-bronze reliquary: a low heavy casket of carved stone
// with a bronze lid and rune bands, moss in the joints.
export function chestRelic(kit, m, im) {
  const w = 0.95;
  const d = 0.58;
  const h = 0.5;
  kit.box(m.ashlar, w, h, d, { y: h / 2 }, { metres: 1.2 });
  // Plinth and cornice.
  kit.box(m.ashlar, w + 0.1, 0.06, d + 0.1, { y: 0.03 }, { metres: 1.2 });
  kit.box(m.ashlar, w + 0.08, 0.05, d + 0.08, { y: h - 0.025 }, { metres: 1.2 });
  // Bronze rune band round the middle.
  kit.box(im.brass, w + 0.02, 0.07, d + 0.02, { y: h * 0.55 });
  // Carved recess panels on the long faces.
  for (const sz of [-1, 1]) {
    for (const x of [-w * 0.28, w * 0.28]) kit.box(m.stone, 0.26, 0.2, 0.02, { x, y: h * 0.3, z: sz * (d / 2 + 0.005) }, { metres: 0.8 });
  }
  // Bronze lid: flat with a raised central ridge and a sun-disc boss.
  kit.box(im.brass, w + 0.04, 0.05, d + 0.04, { y: h + 0.025 });
  kit.box(im.brass, w * 0.6, 0.05, 0.08, { y: h + 0.07 });
  kit.cylinder(im.gold, 0.1, 0.1, 0.03, { y: h + 0.08 }, { segments: 18 });
  kit.add(im.gemBlue, new THREE.OctahedronGeometry(0.035, 0), { y: h + 0.12, rx: Math.PI / 4 });
  // Bronze corner caps.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(im.brass, 0.07, h + 0.02, 0.07, { x: sx * (w / 2 - 0.01), y: h / 2, z: sz * (d / 2 - 0.01) });
  return { r: 0.6, name: 'ancient reliquary' };
}

export const CHESTS = [chestOak, chestGilt, chestRelic];

// --- Coin purses --------------------------------------------------------------

// A drawstring pouch: a lathed sack cinched near the top, with a cord and a
// few coins at its mouth. `fill` 0..1 sets how plump it is.
export function coinPurse(kit, m, im, { fill = 0.8, seed = 1, colour = 'leather' } = {}) {
  const rng = mulberry32(seed);
  const h = 0.16 + fill * 0.05;
  const R = 0.06 + 0.035 * fill;
  // A sack: rounded bottom, full belly, pinched neck, a gathered mouth
  // flaring open above the drawstring.
  const ctrl = [[0, 0], [R * 0.7, 0.004], [R, 0.05], [R * 1.02, 0.09], [R * 0.78, 0.13], [0.028, 0.152], [0.024, 0.163], [0.034, 0.18], [0.046, 0.197], [0.042, 0.202]];
  const pts = new THREE.SplineCurve(ctrl.map(([r, y]) => new THREE.Vector2(r, (y / 0.2) * h))).getPoints(24).map((v) => new THREE.Vector2(Math.max(0.001, v.x), v.y));
  const g = new THREE.LatheGeometry(pts, 28);
  // Soft leather: slumped wide at the bottom under its weight, lumpy where
  // coins press out, and gathered into deep pleats above the neck.
  const pos = g.attributes.position;
  const lean = (rng() - 0.5) * 0.25;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = y / h;
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const slump = 1 + 0.2 * Math.pow(Math.max(0, 1 - t / 0.6), 2) * Math.min(1, t / 0.08);
    const lumps = 1 + 0.06 * Math.sin(a * 3 + seed) * Math.sin(t * 9 + seed) + 0.04 * Math.sin(a * 5 + t * 7 + seed);
    const pleat = t > 0.74 ? 1 + 0.32 * Math.pow(Math.abs(Math.sin(a * 5.5 + seed)), 0.6) * Math.min(1, (t - 0.74) / 0.12) : 1 + 0.05 * Math.sin(a * 11) * Math.max(0, t - 0.55);
    const k = slump * lumps * pleat;
    pos.setXYZ(i, pos.getX(i) * k + lean * y, y * (1 - 0.12 * (1 - t) * (1 - t)), pos.getZ(i) * k * 0.92);
  }
  g.computeVertexNormals();
  kit.add(colour === 'velvet' ? im.velvet : im.purseLeather, g);
  // Drawstring: a cord wound twice round the neck, knotted, two ends
  // hanging with knots in them.
  const neckY = h * 0.78;
  for (let k = 0; k < 2; k++) {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pts.push([Math.cos(a) * 0.032, neckY + k * 0.006 + Math.sin(a * 2) * 0.002, Math.sin(a) * 0.032]);
    }
    kit.add(m.rope, tube(pts, 0.0035, { radial: 4, closed: true, tubular: 32 }));
  }
  kit.add(m.rope, blob(0.008, 0.007, 0.007, { seed, dent: 0.2, detail: 0 }), { y: neckY + 0.003, z: 0.034 });
  for (const s of [-1, 1]) {
    const pts = [[s * 0.004, neckY, 0.036], [s * 0.016, neckY - 0.03, 0.045], [s * 0.022, neckY - 0.07, 0.05]];
    kit.add(m.rope, tube(pts, 0.0028, { radial: 4 }));
    kit.add(m.rope, blob(0.006, 0.007, 0.006, { seed: seed + s, dent: 0.2, detail: 0 }), { x: s * 0.022, y: neckY - 0.072, z: 0.05 });
  }
  // Coins at the mouth and spilled beside it.
  for (let i = 0; i < 5; i++) {
    coin(kit, im, { x: (rng() - 0.5) * 0.04, y: h - 0.005 + rng() * 0.01, z: (rng() - 0.5) * 0.04, rx: (rng() - 0.5) * 0.9, rz: (rng() - 0.5) * 0.9 });
  }
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    const r = 0.1 + rng() * 0.06;
    coin(kit, im, { x: Math.cos(a) * r, y: 0.0006, z: Math.sin(a) * r, ry: rng() * 3 });
  }
  return { r: 0.12, name: 'coin purse' };
}

// --- Display: a trestle table laid with items, and a weapon rack ------------

export function displayTable(kit, m, im) {
  const w = 2.6;
  const d = 0.9;
  const h = 0.82;
  const rng = mulberry32(17);
  const wood = (mat, g, t) => kit.add(mat, g, t);
  // Top: five bevelled boards, each a little uneven.
  const boards = 5;
  const bw = d / boards;
  for (let i = 0; i < boards; i++) {
    wood(m.planks, bevelBox(w - rng() * 0.012, 0.05, bw - 0.005, 0.009, { metres: 1.2, grain: true }), { x: (rng() - 0.5) * 0.01, y: h - 0.025 + (rng() - 0.5) * 0.003, z: -d / 2 + bw * (i + 0.5), rx: (rng() - 0.5) * 0.01 });
  }
  // Two splayed trestles: legs, a bearer under the top, a foot; a wedged stretcher.
  for (const sx of [-1, 1]) {
    kit.frame({ x: sx * (w / 2 - 0.32) }, () => {
      for (const sz of [-1, 1]) wood(m.timber, bevelBox(0.075, 0.86, 0.085, 0.014, { metres: 1, grain: true }), { y: 0.42, z: sz * 0.15, rx: -sz * 0.33 });
      wood(m.timber, bevelBox(0.08, 0.07, d - 0.06, 0.015, { metres: 1, grain: true }), { y: h - 0.085 });
      wood(m.timber, bevelBox(0.09, 0.06, d - 0.12, 0.015, { metres: 1, grain: true }), { y: 0.03 });
      wood(m.timber, bevelBox(0.03, 0.12, 0.05, 0.008), { x: sx * 0.07, y: 0.32 });
    });
  }
  wood(m.timber, bevelBox(w - 0.5, 0.07, 0.07, 0.015, { metres: 1.2, grain: true }), { y: 0.32 });
  // Velvet drape hanging over the front and back, folded, gold-hemmed.
  drape(kit, im, w - 0.42, d, h, 0.34, rng);
  const top = h + 0.006;
  // A sloped display board along the back, velvet-covered, tilted toward
  // the customer: the daggers lie on it with their sheaths.
  kit.frame({ y: top + 0.13, z: -0.24, rx: 0.75 }, () => {
    kit.add(m.planks, bevelBox(w - 0.7, 0.025, 0.34, 0.008, { metres: 1.2, grain: true }));
    kit.add(im.velvet, bevelBox(w - 0.74, 0.012, 0.3, 0.005), { y: 0.016 });
    kit.add(m.timber, bevelBox(w - 0.7, 0.03, 0.025, 0.008), { y: 0.03, z: 0.165 });
    WEAPON_KINDS.forEach((kind, i) => {
      const x = -(w - 0.7) / 2 + 0.2 + i * 0.42;
      kit.frame({ x, y: 0.034, z: 0.05, ry: 0.12 + (rng() - 0.5) * 0.1, rx: Math.PI / 2 }, () => dagger(kit, im, kind, i));
      kit.frame({ x: x + 0.02, y: 0.03, z: -0.08, ry: 0.06 }, () => sheath(kit, im, 0.29, i));
    });
  });
  // Feet of the board on the table.
  for (const sx of [-1, 1]) kit.add(m.timber, bevelBox(0.04, 0.22, 0.04, 0.008), { x: sx * (w / 2 - 0.4), y: top + 0.08, z: -0.36 });
  const poles = awning(kit, m, im, w + 0.3, d, rng);
  kit.frame({ x: -0.95, y: top, z: 0.22 }, () => coinPurse(kit, m, im, { fill: 0.9, seed: 1 }));
  kit.frame({ x: -0.55, y: top, z: 0.28, ry: 1 }, () => coinPurse(kit, m, im, { fill: 0.5, seed: 2, colour: 'velvet' }));
  kit.frame({ x: -0.2, y: top, z: 0.18 }, () => coinStacks(kit, im, rng));
  kit.frame({ x: 0.2, y: top, z: 0.22, ry: -0.4 }, () => ringCushion(kit, im, rng));
  kit.frame({ x: 0.55, y: top, z: 0.2, ry: 0.5 }, () => casket(kit, m, im, rng));
  kit.frame({ x: 0.92, y: top, z: 0.18 }, () => goblet(kit, im));
  kit.frame({ x: 1.08, y: top, z: 0.3 }, () => coinPurse(kit, m, im, { fill: 1.0, seed: 3 }));
  return { hx: w / 2 + 0.1, hz: d / 2 + 0.1, colliders: [{ cx: 0, cz: 0, hx: w / 2 + 0.1, hz: d / 2 + 0.1 }, ...poles] };
}

// A striped canvas awning over the stall: two posts at the back, two
// poles at the front, the canvas sagging between them and a scalloped
// valance along the front edge.
function awning(kit, m, im, w, d, rng) {
  const zb = -d / 2 - 0.12;
  const zf = d / 2 + 0.55;
  const yb = 2.35;
  const yf = 2.0;
  for (const sx of [-1, 1]) {
    kit.add(m.timber, bevelBox(0.09, yb + 0.05, 0.09, 0.015, { metres: 1, grain: true }), { x: sx * (w / 2), y: (yb + 0.05) / 2, z: zb });
    kit.add(m.timber, organicLathe([[0.03, 0], [0.026, yf * 0.5], [0.024, yf], [0.032, yf + 0.04], [0, yf + 0.07]], { segments: 8, seed: sx + 2, dent: 0.04 }), { x: sx * (w / 2), z: zf });
  }
  kit.add(m.timber, bevelBox(w + 0.1, 0.07, 0.07, 0.014, { metres: 1.2, grain: true }), { y: yb, z: zb });
  const nx = 40;
  const nz = 14;
  const pos = [];
  const uv = [];
  const point = (u, v) => {
    const x = -w / 2 - 0.05 + u * (w + 0.1);
    const z = zb + v * (zf - zb);
    // Sag between the supports and a little billow.
    const y = yb + (yf - yb) * v - 0.09 * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.05)) - 0.015 * Math.sin(u * 23 + v * 4);
    return [x, y, z];
  };
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      pos.push(...point(i / nx, j / nz));
      uv.push((i / nx) * (w + 0.1) / 0.32, j / nz);
    }
  }
  // Valance: hangs from the front edge, scalloped hem.
  const vrows = 4;
  const base = pos.length / 3;
  for (let j = 1; j <= vrows; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const [x, y0, z] = point(u, 1);
      const scallop = 0.07 * Math.abs(Math.sin((u * (w + 0.1) * Math.PI) / 0.32));
      const depth = (0.12 + scallop) * (j / vrows);
      pos.push(x, y0 - depth, z + 0.004 * j);
      uv.push((u * (w + 0.1)) / 0.32, 1 + depth);
    }
  }
  const idx = [];
  const row = nx + 1;
  const quad = (a, b) => {
    for (let i = 0; i < nx; i++) idx.push(a + i, b + i, a + i + 1, a + i + 1, b + i, b + i + 1);
  };
  for (let j = 0; j < nz; j++) quad(j * row, (j + 1) * row);
  quad(nz * row, base);
  for (let j = 0; j < vrows - 1; j++) quad(base + j * row, base + (j + 1) * row);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  kit.add(im.awning, g);
  // The front poles, for collision.
  return [-1, 1].map((sx) => ({ cx: sx * (w / 2), cz: zf, hx: 0.06, hz: 0.06 }));
}

// Velvet cloth laid over a table top (width w, depth d, top at h) and
// hanging `hang` metres over the front and back, in folds that deepen
// toward the hem; a gold cord trims both hems and tassels hang at the
// corners.
function drape(kit, im, w, d, h, hang, rng) {
  const nx = 64;
  const ns = 36;
  const L = hang * 2 + d;
  const phase = rng() * 6;
  // Where along the unrolled cloth (s) and across (x) a point lies.
  const at = (x, s) => {
    let y;
    let z;
    let fold = 0;
    const edgeR = 0.025;
    if (s < hang) {
      const down = hang - s;
      y = h - down;
      z = d / 2 + edgeR;
      fold = down / hang;
    } else if (s > hang + d) {
      const down = s - hang - d;
      y = h - down;
      z = -d / 2 - edgeR;
      fold = down / hang;
    } else {
      y = h + 0.004;
      z = d / 2 - (s - hang);
    }
    // Folds: broad soft pleats plus finer creases, growing toward the hem.
    const f = Math.pow(fold, 0.8);
    const out = f * (0.022 * Math.sin(x * 13 + phase) + 0.008 * Math.sin(x * 37 + phase * 2) + 0.004 * Math.sin(x * 71));
    z += Math.sign(z) * out;
    // The hem dips where the pleats bunch.
    if (fold > 0) y -= f * 0.012 * (1 + Math.sin(x * 13 + phase + 1.2));
    return [x, y, z];
  };
  const pos = [];
  for (let j = 0; j <= ns; j++) {
    // Denser rows near the table edges.
    const s = (j / ns) * L;
    for (let i = 0; i <= nx; i++) pos.push(...at(-w / 2 + (i / nx) * w, s));
  }
  const idx = [];
  const row = nx + 1;
  for (let j = 0; j < ns; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Make sure the outside faces out (the top must face up).
  const mid = Math.round(ns / 2) * row + Math.round(nx / 2);
  if (g.attributes.normal.getY(mid) < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  kit.add(im.velvetDrape, g);
  // Hem cords and corner tassels.
  for (const s of [0, L]) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const p = at(-w / 2 + (i / 40) * w, s);
      pts.push([p[0], p[1] + 0.004, p[2] + Math.sign(p[2]) * 0.004]);
    }
    kit.add(im.gold, tube(pts, 0.006, { radial: 5, tubular: 120 }));
    for (const end of [pts[0], pts[pts.length - 1]]) {
      kit.add(im.gold, blob(0.012, 0.016, 0.012, { seed: s, dent: 0.1 }), { x: end[0], y: end[1] - 0.02, z: end[2] });
      kit.add(im.gold, organicLathe([[0, 0], [0.012, 0.004], [0.016, 0.05], [0.006, 0.06], [0, 0.062]], { segments: 8, seed: 1, dent: 0.15 }), { x: end[0], y: end[1] - 0.095, z: end[2] });
    }
  }
}

// One coin: a thin disc with a raised rim, so it catches the light at its edge.
function coin(kit, im, t = {}, r = 0.015) {
  const pts = [[0, 0], [r, 0.0002], [r * 1.02, 0.0012], [r, 0.0026], [r * 0.86, 0.0026], [r * 0.82, 0.0019], [0, 0.0021]];
  kit.add(im.coin, organicLathe(pts, { segments: 14, seed: (t.x || 0) * 50, dent: 0.03, oval: 0.03 }), t);
}

// Stacks of coins, a little out of true, and a few spilled.
function coinStacks(kit, im, rng) {
  for (let s = 0; s < 3; s++) {
    const n = 4 + Math.floor(rng() * 7);
    const cx = (s - 1) * 0.05 + (rng() - 0.5) * 0.01;
    const cz = (rng() - 0.5) * 0.04;
    for (let i = 0; i < n; i++) coin(kit, im, { x: cx + (rng() - 0.5) * 0.004, y: i * 0.0027, z: cz + (rng() - 0.5) * 0.004, ry: rng() * 6, rx: (rng() - 0.5) * 0.04 });
  }
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2;
    const r = 0.06 + rng() * 0.07;
    coin(kit, im, { x: Math.cos(a) * r, y: 0.0006, z: Math.sin(a) * r, rx: (rng() - 0.5) * 0.15, rz: (rng() - 0.5) * 0.15 });
  }
}

// A velvet cushion with gold rings set into it, each with a stone.
function ringCushion(kit, im, rng) {
  kit.add(im.velvet, blob(0.075, 0.025, 0.06, { seed: 3, dent: 0.12, detail: 2 }), { y: 0.022 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add(im.gold, blob(0.006, 0.006, 0.006, { seed: sx + sz, dent: 0.1, detail: 0 }), { x: sx * 0.066, y: 0.018, z: sz * 0.05 });
  const stones = [im.gemRed, im.gemBlue, im.emerald];
  for (let i = 0; i < 3; i++) {
    kit.frame({ x: (i - 1) * 0.04, y: 0.05, z: (rng() - 0.5) * 0.02, rz: (rng() - 0.5) * 0.3 }, () => {
      const pts = [];
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        pts.push([Math.cos(a) * 0.011, Math.sin(a) * 0.011, 0]);
      }
      kit.add(im.gold, tube(pts, 0.0024, { radial: 5, closed: true, tubular: 32 }));
      kit.add(im.gold, organicLathe([[0, 0], [0.005, 0.001], [0.006, 0.004], [0, 0.005]], { segments: 6, seed: i }), { y: 0.011 });
      kit.add(stones[i], organicLathe([[0, 0], [0.0045, 0.002], [0.003, 0.0055], [0, 0.006]], { segments: 8, seed: i, flat: true }), { y: 0.014 });
    });
  }
}

// A small iron-bound casket, lid thrown back, lined with velvet and full of gems.
function casket(kit, m, im, rng) {
  const w = 0.22;
  const d = 0.14;
  const h = 0.09;
  kit.add(m.planks, bevelBox(w, h, d, 0.008, { metres: 0.6, grain: true }), { y: h / 2 });
  kit.add(im.velvet, bevelBox(w - 0.02, 0.01, d - 0.02, 0.003), { y: h - 0.012 });
  for (const sx of [-1, 1]) kit.add(im.gold, bevelBox(0.014, h + 0.004, d + 0.004, 0.003), { x: sx * w * 0.32, y: h / 2 });
  kit.add(im.gold, bevelBox(0.03, 0.035, 0.008, 0.003), { y: h - 0.025, z: d / 2 + 0.003 });
  // The lid, hinged at the back and thrown open.
  kit.frame({ y: h, z: -d / 2, rx: -1.9 }, () => {
    kit.frame({ z: d / 2 }, () => vaultLid(kit, m.planks, d, w, 0.045, { ry: Math.PI / 2 }));
  });
  const stones = [im.gemRed, im.gemBlue, im.emerald, im.gemRed];
  for (let i = 0; i < 9; i++) {
    const s = 0.008 + rng() * 0.006;
    kit.add(stones[i % 4], organicLathe([[0, 0], [s, s * 0.9], [s * 0.98, s * 1.05], [s * 0.6, s * 1.4], [0, s * 1.4]], { segments: 8, seed: i, flat: true }), { x: (rng() - 0.5) * (w - 0.05), y: h - 0.01, z: (rng() - 0.5) * (d - 0.05), rx: rng() * 1.4, ry: rng() * 6 });
  }
  for (let i = 0; i < 4; i++) coin(kit, im, { x: (rng() - 0.5) * (w - 0.06), y: h - 0.006, z: (rng() - 0.5) * (d - 0.06), rx: (rng() - 0.5) * 0.6 });
}

// A silver goblet: footed, knopped stem, a cup with a lip.
function goblet(kit, im) {
  const pts = [[0, 0], [0.034, 0.001], [0.036, 0.006], [0.02, 0.012], [0.008, 0.025], [0.007, 0.05], [0.013, 0.058], [0.007, 0.066], [0.009, 0.08], [0.03, 0.1], [0.038, 0.135], [0.04, 0.155], [0.037, 0.156], [0.034, 0.135], [0.026, 0.104], [0, 0.092]];
  kit.add(im.steel, organicLathe(pts, { segments: 18, seed: 4, dent: 0.02, oval: 0.02 }));
  kit.add(im.velvet, organicLathe([[0.032, 0], [0.02, 0.003], [0, 0.004]], { segments: 14, seed: 2 }), { y: 0.13 });
}

// A leather sheath lying along +x: tapered and flattened, a steel chape
// at the tip and a locket at the mouth.
function sheath(kit, im, len, seed) {
  const pts = [[0, 0], [0.008, 0.01], [0.016, len * 0.4], [0.02, len * 0.95], [0.021, len], [0, len]];
  kit.add(im.leatherDark, organicLathe(pts, { segments: 10, seed, dent: 0.04, oval: -0.6 }), { rz: Math.PI / 2, x: len, y: 0.012 });
  kit.add(im.steelDark, organicLathe([[0, 0], [0.01, 0.012], [0.012, 0.035], [0, 0.036]], { segments: 10, seed: seed + 1, oval: -0.55 }), { rz: Math.PI / 2, x: len, y: 0.012 });
  kit.add(im.steelDark, organicLathe([[0.022, 0], [0.023, 0.01], [0.023, 0.025], [0.021, 0.03]], { segments: 10, seed: seed + 2, oval: -0.55 }), { rz: Math.PI / 2, x: 0.032, y: 0.012 });
}

// Sword stand: swords hang tip-down in a slotted trough, guards resting on
// a pegged rail; greatsword hilts stand above a back rail. A round shield
// hangs on one end post, two spears lean on the other.
export function weaponRack(kit, m, im) {
  const w = 2.4;
  const rng = mulberry32(31);
  const wood = (g, t) => kit.add(m.timber, g, t);
  for (const sx of [-1, 1]) {
    kit.frame({ x: sx * (w / 2) }, () => {
      wood(bevelBox(0.11, 0.09, 0.78, 0.02, { metres: 1, grain: true }), { y: 0.045 });
      wood(bevelBox(0.09, 2.0, 0.09, 0.015, { metres: 1, grain: true }), { y: 1.09 });
      // Braces from the post to the foot.
      for (const sz of [-1, 1]) wood(bevelBox(0.06, 0.5, 0.06, 0.012, { metres: 1, grain: true }), { y: 0.25, z: sz * 0.17, rx: sz * 0.75 });
    });
  }
  // Cap rail with rounded ends, rails, slotted bases.
  wood(bevelBox(w + 0.24, 0.07, 0.2, 0.025, { metres: 1.2, grain: true }), { y: 2.12 });
  const front = 0.13;
  const back = -0.13;
  const frontRail = 1.075;
  const backRail = 1.65;
  // Each rail is a pair of bars with a slot between for the blades.
  for (const [y, z] of [[frontRail, front], [backRail, back]]) {
    for (const sz of [-1, 1]) wood(bevelBox(w, 0.06, 0.035, 0.012, { metres: 1.2, grain: true }), { y, z: z + sz * 0.03 });
  }
  // A slotted base box under each row: the blades' points stand in its
  // slot, held off the ground (the back row's base stands taller, stepped
  // like a display).
  for (const [z, top] of [[front, 0.32], [back, 0.42]]) {
    wood(bevelBox(w, top - 0.03, 0.2, 0.015, { metres: 1.2, grain: true }), { y: (top - 0.03) / 2, z });
    for (const sz of [-1, 1]) wood(bevelBox(w, 0.04, 0.06, 0.01, { metres: 1.2, grain: true }), { y: top - 0.01, z: z + sz * 0.07 });
  }
  // Turned pegs between the hanging swords.
  for (let i = 0; i <= 7; i++) {
    const x = -w / 2 + 0.15 + i * 0.3;
    wood(organicLathe([[0, 0], [0.016, 0.002], [0.013, 0.05], [0.02, 0.07], [0.011, 0.085], [0, 0.088]], { segments: 8, seed: i, dent: 0.05 }), { x, y: frontRail + 0.03, z: front + 0.03 });
  }
  // Tip-down through the rail's slot into the base's, flat of the blade to
  // the front, the guard resting across the rail; one slot left empty, as
  // if just sold.
  for (let i = 0; i < 7; i++) {
    if (i === 4) continue;
    const kind = WEAPON_KINDS[(i * 3) % WEAPON_KINDS.length];
    kit.frame({ x: -w / 2 + 0.3 + i * 0.3 + (rng() - 0.5) * 0.03, y: frontRail + 0.045, z: front, rz: -Math.PI / 2 + (rng() - 0.5) * 0.03, ry: (rng() - 0.5) * 0.2 }, () => sword(kit, im, kind, i));
  }
  for (let i = 0; i < 5; i++) {
    const kind = WEAPON_KINDS[(i + 1) % WEAPON_KINDS.length];
    kit.frame({ x: -w / 2 + 0.3 + i * 0.45, y: backRail + 0.05, z: back, rz: -Math.PI / 2 + (rng() - 0.5) * 0.03, ry: (rng() - 0.5) * 0.2 }, () => greatsword(kit, im, kind, i + 4));
  }
  // Round shield on the left post, facing out: planked, iron rim and boss.
  kit.frame({ x: -w / 2 - 0.07, y: 1.15, rz: Math.PI / 2, ry: 0 }, () => {
    const disc = organicLathe([[0, 0.045], [0.12, 0.04], [0.26, 0.022], [0.32, 0], [0.32, -0.012], [0, -0.012]].reverse(), { segments: 24, seed: 2, dent: 0.02, oval: 0.02 });
    kit.add(m.planks, disc, { ry: 0.3 });
    const rim = [];
    for (let k = 0; k < 24; k++) rim.push([Math.cos((k / 24) * Math.PI * 2) * 0.322, Math.sin((k / 24) * Math.PI * 2) * 0.322]);
    kit.add(im.steelDark, ringXZ(rim, -0.004, 0.012));
    kit.add(im.steelDark, organicLathe([[0, 0.11], [0.045, 0.09], [0.075, 0.05], [0.085, 0.04], [0.085, 0.03], [0, 0.03]].reverse(), { segments: 16, seed: 4, dent: 0.03 }));
  });
  // Two spears leaning on the right post.
  for (let i = 0; i < 2; i++) {
    kit.frame({ x: w / 2 + 0.12 + i * 0.05, y: 0.02, z: -0.08 + i * 0.16, rz: 0.12 - i * 0.05, rx: (i - 0.5) * 0.1 }, () => {
      kit.add(im.wood, tube([[0, 0, 0], [0.005, 0.9, 0], [0, 1.85, 0]], 0.016, { radial: 7, tubular: 10 }));
      kit.add(im.steelDark, organicLathe([[0.019, 0], [0.021, 0.08], [0, 0.09]], { segments: 8, seed: i }), { y: 1.84 });
      kit.add(im.steel, organicLathe([[0.012, 0], [0.045, 0.09], [0.035, 0.18], [0, 0.3]], { segments: 4, seed: i + 2, dent: 0.02, oval: -0.75, flat: true }), { y: 1.92 });
    });
  }
  return { hx: w / 2 + 0.25, hz: 0.42 };
}

// A closed ring in a horizontal plane (local y) through xz points.
function ringXZ(pts, y, r) {
  return tube(pts.map(([x, z]) => [x, y, z]), r, { radial: 5, closed: true, tubular: pts.length * 2 });
}
