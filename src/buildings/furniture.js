import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';
import { oakBarrel, waterBarrel, crate } from './props.js';
import { coinPurse } from './items.js';

// The fantasy item and furniture library: everyday things of the Vale, each
// built into a Kit in its own local frame (ground or tabletop at y = 0,
// front facing +z) so stalls and yards can be composed from them. Every
// builder returns its footprint { hx, hz }.

const TAU = Math.PI * 2;

// Extra materials for these pieces, made once from the building set.
export function createFurnitureMaterials(m, im) {
  const mat = (o) => new THREE.MeshStandardMaterial(o);
  const glass = (color, emissive) => mat({ color, emissive, emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.86 });
  return {
    copper: mat({ color: 0xb8683a, roughness: 0.38, metalness: 0.95 }),
    ironDark: im.steelDark,
    coal: mat({ color: 0x151210, roughness: 0.95 }),
    embers: mat({ color: 0x3a1000, emissive: 0xff6a20, emissiveIntensity: 2.2, roughness: 0.8 }),
    potionRed: glass(0xc8243a, 0x7a0c18),
    potionGreen: glass(0x3ec04a, 0x0f5a16),
    potionBlue: glass(0x2f6fe0, 0x0c2a80),
    potionGold: glass(0xe0b040, 0x6a4a08),
    potionViolet: glass(0x8a3ad0, 0x3a0c6a),
    clearGlass: mat({ color: 0xc8dce0, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.4 }),
    cork: mat({ color: 0xb48a5a, roughness: 0.95 }),
    wax: mat({ color: 0xf0e2c0, roughness: 0.6 }),
    flame: mat({ color: 0xffd080, emissive: 0xffa030, emissiveIntensity: 2.5 }),
    bread: mat({ color: 0xc08a4a, roughness: 0.9 }),
    crust: mat({ color: 0x8a5a2a, roughness: 0.9 }),
    cheese: mat({ color: 0xe8c860, roughness: 0.7 }),
    cheeseRind: mat({ color: 0xb08a3a, roughness: 0.8 }),
    apple: mat({ color: 0xc83a2a, roughness: 0.35 }),
    appleGreen: mat({ color: 0x9ac83a, roughness: 0.35 }),
    ham: mat({ color: 0xa85a4a, roughness: 0.7 }),
    straw: mat({ color: 0xd8b860, roughness: 1 }),
    clothBlue: mat({ color: 0x2a4a8a, roughness: 1 }),
    clothGreen: mat({ color: 0x3a6a3a, roughness: 1 }),
    clothRed: im.velvet,
    paper: mat({ color: 0xe8dcc0, roughness: 0.95 }),
    bookRed: mat({ color: 0x7a2a2a, roughness: 0.8 }),
    bookBlue: mat({ color: 0x2a3a6a, roughness: 0.8 }),
    bookGreen: mat({ color: 0x2a5a3a, roughness: 0.8 }),
    bookBrown: mat({ color: 0x5a3a22, roughness: 0.85 }),
    herb: mat({ color: 0x4a7a2a, roughness: 1 }),
    water: mat({ color: 0x163a40, roughness: 0.05, metalness: 0.1 }),
    gemClear: mat({ color: 0xcfe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.8, emissive: 0x3a5a80, emissiveIntensity: 0.4 }),
    gemGreen: im.emerald,
    gemRed: im.gemRed,
    gemBlue: im.gemBlue,
    gemPurple: mat({ color: 0x8a3ad8, roughness: 0.1, metalness: 0.1, emissive: 0x3a0c70, emissiveIntensity: 0.6 }),
    rope: m.rope,
  };
}

// --- Small things ----------------------------------------------------------

// A wooden bucket: tapered staves, two iron hoops, rope handle, water inside.
export function bucket(kit, m, im, fm, { full = true } = {}) {
  const r = 0.17;
  kit.cylinder(m.barrel, r, r * 0.82, 0.3, { y: 0.15 }, { segments: 12, metres: 0.6, open: true });
  kit.cylinder(m.barrel, r * 0.84, r * 0.84, 0.02, { y: 0.02 }, { segments: 12 });
  kit.cylinder(im.ironBand, r + 0.008, r + 0.008, 0.025, { y: 0.27 }, { segments: 12, open: true });
  kit.cylinder(im.ironBand, r * 0.86 + 0.008, r * 0.86 + 0.008, 0.025, { y: 0.07 }, { segments: 12, open: true });
  if (full) kit.cylinder(fm.water, r * 0.96, r * 0.96, 0.01, { y: 0.26 }, { segments: 12 });
  // Rope handle: an arc of short segments.
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI;
    kit.box(fm.rope, 0.02, 0.05, 0.02, { x: Math.cos(a) * r, y: 0.3 + Math.sin(a) * 0.16, z: 0, rz: -a + Math.PI / 2 });
  }
  return { hx: r + 0.02, hz: r + 0.02 };
}

// Ingot: a tapered bar.
export function ingot(kit, material, t = {}) {
  const g = new THREE.BoxGeometry(0.22, 0.06, 0.09);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) pos.setX(i, pos.getX(i) * 0.9), pos.setZ(i, pos.getZ(i) * 0.85);
  g.computeVertexNormals();
  kit.add(material, g, { y: 0.03, ...t });
}

// A stack of ingots, pyramid fashion.
export function ingotStack(kit, material, rows = 3) {
  for (let r = 0; r < rows; r++) {
    const n = rows - r;
    for (let i = 0; i < n; i++) ingot(kit, material, { x: (i - (n - 1) / 2) * 0.1 + (r % 2) * 0.01, y: 0.03 + r * 0.062, z: 0, ry: r % 2 ? 0.04 : -0.03 });
  }
  return { hx: 0.2, hz: 0.1 };
}

// Loose cut gems: octahedra and a prism, lying on their sides.
export function gems(kit, fm, random = Math.random, count = 5) {
  const mats = [fm.gemRed, fm.gemBlue, fm.gemGreen, fm.gemPurple, fm.gemClear];
  for (let i = 0; i < count; i++) {
    const s = 0.025 + random() * 0.02;
    const g = i % 3 === 2 ? new THREE.CylinderGeometry(s * 0.6, s * 0.9, s * 2.2, 6) : new THREE.OctahedronGeometry(s, 0);
    kit.add(mats[i % mats.length], g, { x: (random() - 0.5) * 0.3, y: s * 0.9, z: (random() - 0.5) * 0.2, rx: random() * 1.2, ry: random() * TAU });
  }
  return { hx: 0.18, hz: 0.12 };
}

// A corked bottle: body shape by kind, neck, cork; potions glow.
export function bottle(kit, fm, kind = 'potionRed', shape = 0) {
  const mat = fm[kind] || fm.clearGlass;
  if (shape === 0) {
    kit.cylinder(mat, 0.04, 0.045, 0.14, { y: 0.07 }, { segments: 10 });
    kit.cylinder(mat, 0.014, 0.03, 0.05, { y: 0.165 }, { segments: 8 });
    kit.cylinder(fm.cork, 0.013, 0.013, 0.03, { y: 0.2 }, { segments: 6 });
  } else if (shape === 1) {
    // Round flask.
    kit.add(mat, new THREE.SphereGeometry(0.05, 10, 8), { y: 0.06 });
    kit.cylinder(mat, 0.014, 0.018, 0.07, { y: 0.13 }, { segments: 8 });
    kit.cylinder(fm.cork, 0.014, 0.014, 0.025, { y: 0.175 }, { segments: 6 });
  } else {
    // Tall slender vial.
    kit.cylinder(mat, 0.02, 0.025, 0.16, { y: 0.08 }, { segments: 8 });
    kit.cylinder(fm.cork, 0.012, 0.012, 0.025, { y: 0.17 }, { segments: 6 });
  }
  return { hx: 0.05, hz: 0.05 };
}

// A book, closed, lying flat or standing (ry/rz by the caller).
export function book(kit, fm, cover = 'bookRed', t = {}) {
  kit.frame(t, () => {
    kit.box(fm[cover], 0.16, 0.04, 0.22, { y: 0.02 });
    kit.box(fm.paper, 0.15, 0.03, 0.2, { x: 0.006, y: 0.02, z: 0.0 });
  });
}

// A candle on a dish, lit.
export function candle(kit, fm, im, t = {}) {
  kit.frame(t, () => {
    kit.cylinder(im.brass, 0.045, 0.05, 0.01, { y: 0.005 }, { segments: 10 });
    kit.cylinder(fm.wax, 0.014, 0.016, 0.1, { y: 0.06 }, { segments: 8 });
    kit.add(fm.flame, new THREE.ConeGeometry(0.008, 0.03, 6), { y: 0.125 });
  });
}

// Food: a loaf, a cheese wheel with a wedge out, a basket of apples, a ham.
export function loaf(kit, fm, t = {}) {
  kit.frame(t, () => {
    const g = new THREE.SphereGeometry(0.1, 10, 8);
    g.scale(1.4, 0.6, 0.8);
    kit.add(fm.bread, g, { y: 0.06 });
    kit.box(fm.crust, 0.2, 0.01, 0.02, { y: 0.115, rz: 0.1 });
  });
}
export function cheeseWheel(kit, fm, t = {}) {
  kit.frame(t, () => {
    kit.cylinder(fm.cheeseRind, 0.14, 0.14, 0.07, { y: 0.035 }, { segments: 16, open: true });
    const g = new THREE.CylinderGeometry(0.135, 0.135, 0.07, 16, 1, false, 0.5, TAU - 0.5);
    kit.add(fm.cheese, g, { y: 0.035 });
    kit.box(fm.cheese, 0.12, 0.068, 0.012, { x: 0.065, y: 0.035, z: 0.02, ry: 0.25 });
  });
}
export function appleBasket(kit, m, fm, random = Math.random, t = {}) {
  kit.frame(t, () => {
    kit.cylinder(m.barrel, 0.17, 0.12, 0.14, { y: 0.07 }, { segments: 12, metres: 0.4, open: true });
    kit.cylinder(m.barrel, 0.12, 0.12, 0.02, { y: 0.01 }, { segments: 12 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const rr = i < 6 ? 0.09 : 0.04;
      kit.add(i % 3 ? fm.apple : fm.appleGreen, new THREE.SphereGeometry(0.035, 8, 6), { x: Math.cos(a) * rr, y: 0.12 + (i >= 6 ? 0.04 : 0), z: Math.sin(a) * rr });
    }
  });
}
export function ham(kit, fm, t = {}) {
  kit.frame(t, () => {
    const g = new THREE.SphereGeometry(0.09, 10, 8);
    g.scale(1, 0.75, 0.7);
    kit.add(fm.ham, g, { y: 0.07 });
    kit.cylinder(fm.wax, 0.02, 0.025, 0.12, { x: 0.1, y: 0.07, rz: Math.PI / 2 - 0.3 }, { segments: 6 });
  });
}
export function mug(kit, m, t = {}) {
  kit.frame(t, () => {
    kit.cylinder(m.barrel, 0.04, 0.035, 0.11, { y: 0.055 }, { segments: 10, metres: 0.3, open: true });
    kit.cylinder(m.barrel, 0.035, 0.035, 0.01, { y: 0.005 }, { segments: 10 });
    kit.box(m.barrel, 0.012, 0.06, 0.012, { x: 0.05, y: 0.055 });
    kit.box(m.barrel, 0.025, 0.012, 0.012, { x: 0.043, y: 0.085 });
    kit.box(m.barrel, 0.025, 0.012, 0.012, { x: 0.043, y: 0.025 });
  });
}

export function meatSkewer(kit, im, fm, t = {}) {
  kit.frame(t, () => {
    kit.cylinder(im.woodLight, 0.006, 0.006, 0.42, { rz: Math.PI / 2 }, { segments: 5 });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.SphereGeometry(0.03, 7, 5);
      g.scale(1.3, 0.8, 0.8);
      kit.add(i % 2 ? fm.ham : fm.crust, g, { x: -0.12 + i * 0.075 });
    }
  });
}
export function pie(kit, fm, t = {}) {
  kit.frame(t, () => {
    kit.cylinder(fm.crust, 0.13, 0.11, 0.05, { y: 0.025 }, { segments: 14 });
    kit.cylinder(fm.bread, 0.12, 0.12, 0.03, { y: 0.06 }, { segments: 14 });
    for (let i = 0; i < 6; i++) kit.box(fm.crust, 0.26, 0.012, 0.02, { y: 0.077, ry: (i / 6) * Math.PI });
  });
}
export function fish(kit, im, fm, t = {}) {
  kit.frame(t, () => {
    const body = new THREE.SphereGeometry(0.05, 8, 6);
    body.scale(2.6, 0.9, 0.5);
    kit.add(im.steel, body, {});
    kit.add(fm.clothBlue, new THREE.ConeGeometry(0.035, 0.07, 4), { x: -0.15, rz: Math.PI / 2 });
    kit.add(fm.clothBlue, new THREE.ConeGeometry(0.02, 0.04, 4), { y: 0.05 });
  });
}
// A clump of mushrooms: stems and caps, red-capped or brown.
export function mushrooms(kit, fm, random = Math.random, t = {}) {
  kit.frame(t, () => {
    const n = 2 + Math.floor(random() * 4);
    const red = random() < 0.4;
    for (let i = 0; i < n; i++) {
      const s = 0.5 + random() * 0.9;
      const x = (random() - 0.5) * 0.3;
      const z = (random() - 0.5) * 0.3;
      kit.cylinder(fm.wax, 0.012 * s, 0.016 * s, 0.09 * s, { x, y: 0.045 * s, z }, { segments: 6 });
      kit.add(red ? fm.apple : fm.crust, new THREE.SphereGeometry(0.045 * s, 8, 5, 0, TAU, 0, Math.PI / 2), { x, y: 0.085 * s, z });
      if (red) for (let k = 0; k < 3; k++) kit.box(fm.wax, 0.012 * s, 0.006, 0.012 * s, { x: x + (random() - 0.5) * 0.05 * s, y: 0.11 * s + (random() - 0.5) * 0.02, z: z + (random() - 0.5) * 0.05 * s });
    }
  });
}

// --- Furniture --------------------------------------------------------------

export function bench(kit, m, len = 1.6) {
  kit.box(m.planks, len, 0.06, 0.34, { y: 0.45 }, { metres: 1.2, grain: true });
  for (const sx of [-1, 1]) kit.box(m.timber, 0.08, 0.42, 0.3, { x: sx * (len / 2 - 0.15), y: 0.21 }, { metres: 1 });
  kit.box(m.timber, len - 0.4, 0.05, 0.06, { y: 0.2 }, { metres: 1, grain: true });
  return { hx: len / 2, hz: 0.2 };
}

export function stool(kit, m) {
  kit.cylinder(m.planks, 0.17, 0.17, 0.04, { y: 0.44 }, { segments: 10, metres: 0.6 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    kit.box(m.timber, 0.04, 0.44, 0.04, { x: Math.cos(a) * 0.11, y: 0.22, z: Math.sin(a) * 0.11, rx: Math.sin(a) * 0.12, rz: -Math.cos(a) * 0.12 });
  }
  return { hx: 0.2, hz: 0.2 };
}

export function chair(kit, m) {
  kit.box(m.planks, 0.42, 0.04, 0.4, { y: 0.44 }, { metres: 0.8 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(m.timber, 0.04, sz < 0 ? 0.9 : 0.44, 0.04, { x: sx * 0.18, y: sz < 0 ? 0.45 : 0.22, z: sz * 0.17 });
  kit.box(m.planks, 0.36, 0.14, 0.03, { y: 0.78, z: -0.17 }, { metres: 0.8 });
  kit.box(m.planks, 0.36, 0.08, 0.03, { y: 0.6, z: -0.17 }, { metres: 0.8 });
  return { hx: 0.22, hz: 0.22 };
}

export function table(kit, m, w = 1.8, d = 0.9, h = 0.78) {
  kit.box(m.planks, w, 0.06, d, { y: h - 0.03 }, { metres: 1.2, grain: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(m.timber, 0.08, h - 0.06, 0.08, { x: sx * (w / 2 - 0.1), y: (h - 0.06) / 2, z: sz * (d / 2 - 0.1) });
  for (const sz of [-1, 1]) kit.box(m.timber, w - 0.3, 0.05, 0.06, { y: 0.22, z: sz * (d / 2 - 0.1) }, { metres: 1, grain: true });
  return { hx: w / 2, hz: d / 2, h };
}

// A bed: frame, straw mattress, folded blanket, pillow.
export function bed(kit, m, fm) {
  const w = 1.1;
  const d = 2.0;
  kit.box(m.timber, w, 0.12, d, { y: 0.3 }, { metres: 1.2, grain: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(m.timber, 0.09, sz < 0 ? 0.9 : 0.5, 0.09, { x: sx * (w / 2 - 0.05), y: sz < 0 ? 0.45 : 0.25, z: sz * (d / 2 - 0.05) });
  kit.box(m.planks, w - 0.1, 0.3, 0.06, { y: 0.7, z: -d / 2 + 0.02 }, { metres: 1 });
  kit.box(fm.straw, w - 0.14, 0.14, d - 0.14, { y: 0.43 });
  kit.box(fm.clothBlue, w - 0.1, 0.05, d * 0.55, { y: 0.52, z: d * 0.2 });
  const pillow = new THREE.SphereGeometry(0.18, 8, 6);
  pillow.scale(1.6, 0.5, 1);
  kit.add(fm.wax, pillow, { y: 0.54, z: -d / 2 + 0.3 });
  return { hx: w / 2, hz: d / 2 };
}

// A bookshelf with rows of books.
export function bookshelf(kit, m, fm, random = Math.random) {
  const w = 1.2;
  const h = 1.9;
  const d = 0.34;
  for (const sx of [-1, 1]) kit.box(m.planks, 0.04, h, d, { x: sx * (w / 2 - 0.02), y: h / 2 }, { metres: 1 });
  kit.box(m.planks, w, 0.04, 0.02, { y: h - 0.02, z: -d / 2 + 0.01 }, { metres: 1 });
  const covers = ['bookRed', 'bookBlue', 'bookGreen', 'bookBrown'];
  for (let s = 0; s < 4; s++) {
    const y = 0.12 + s * 0.45;
    kit.box(m.planks, w, 0.04, d, { y }, { metres: 1 });
    let x = -w / 2 + 0.08;
    while (x < w / 2 - 0.12) {
      const bw = 0.035 + random() * 0.03;
      const bh = 0.2 + random() * 0.1;
      if (random() < 0.85) kit.box(fm[covers[Math.floor(random() * 4)]], bw, bh, 0.2 + random() * 0.06, { x: x + bw / 2, y: y + 0.02 + bh / 2, z: 0.02, rz: random() < 0.1 ? 0.15 : 0 });
      x += bw + 0.006;
    }
  }
  return { hx: w / 2, hz: d / 2 };
}

// A cupboard with panelled doors and brass handles.
export function cupboard(kit, m, im) {
  const w = 1.0;
  const h = 1.5;
  const d = 0.5;
  kit.box(m.planks, w, h, d, { y: h / 2 }, { metres: 1 });
  for (const sx of [-1, 1]) {
    kit.box(m.timber, w / 2 - 0.06, h - 0.16, 0.02, { x: sx * w / 4, y: h / 2, z: d / 2 + 0.01 }, { metres: 0.8 });
    kit.box(im.brass, 0.03, 0.08, 0.03, { x: sx * 0.07, y: h / 2, z: d / 2 + 0.035 });
  }
  return { hx: w / 2, hz: d / 2 };
}

// --- Smithing ---------------------------------------------------------------

export function anvil(kit, im) {
  kit.box(im.steelDark, 0.5, 0.12, 0.26, { y: 0.56 });
  kit.box(im.steelDark, 0.3, 0.3, 0.2, { y: 0.35 });
  kit.box(im.steelDark, 0.42, 0.1, 0.3, { y: 0.14 });
  kit.add(im.steelDark, new THREE.ConeGeometry(0.1, 0.32, 8), { x: 0.4, y: 0.57, rz: -Math.PI / 2 });
  kit.box(im.steel, 0.48, 0.01, 0.24, { y: 0.625 });
  // On a stump.
  kit.cylinder(im.wood, 0.3, 0.34, 0.1, { y: 0.05 }, { segments: 12, metres: 0.6 });
  return { hx: 0.4, hz: 0.2 };
}

export function hammer(kit, im, t = {}) {
  kit.frame(t, () => {
    kit.cylinder(im.woodLight, 0.015, 0.018, 0.32, { y: 0.0, rz: Math.PI / 2 }, { segments: 6 });
    kit.box(im.steelDark, 0.09, 0.05, 0.05, { x: 0.14 });
  });
}
export function tongs(kit, im, t = {}) {
  kit.frame(t, () => {
    for (const s of [-1, 1]) kit.box(im.steelDark, 0.36, 0.012, 0.012, { x: 0, z: s * 0.012, ry: s * 0.08 });
    kit.cylinder(im.steelDark, 0.012, 0.012, 0.03, { x: 0.05, rx: Math.PI / 2 }, { segments: 6 });
  });
}

// Forge: a stone hearth with a brick hood, coals glowing, a bellows beside.
export function forge(kit, m, im, fm) {
  const w = 1.6;
  const d = 1.2;
  kit.box(m.stone, w, 0.9, d, { y: 0.45 }, { metres: 2 });
  kit.box(m.ashlar, w + 0.1, 0.1, d + 0.1, { y: 0.95 }, { metres: 1.5 });
  kit.box(fm.coal, 0.8, 0.1, 0.6, { y: 1.02, z: 0.05 });
  kit.box(fm.embers, 0.6, 0.06, 0.45, { y: 1.06, z: 0.05 });
  for (let i = 0; i < 9; i++) kit.add(fm.coal, new THREE.DodecahedronGeometry(0.05, 0), { x: (i % 3 - 1) * 0.22 + 0.04 * (i % 2), y: 1.1, z: 0.05 + (Math.floor(i / 3) - 1) * 0.16 });
  // Hood and chimney at the back.
  kit.box(m.stone, w - 0.2, 0.7, 0.5, { y: 1.65, z: -d / 2 + 0.25, rx: 0.35 }, { metres: 2 });
  kit.box(m.stone, 0.6, 2.2, 0.6, { y: 2.3, z: -d / 2 + 0.1 }, { metres: 2 });
  // Bellows: tapered wooden boards with leather between, nozzle into the hearth.
  kit.frame({ x: w / 2 + 0.5, y: 0.75, ry: 0.4 }, () => {
    kit.box(im.wood, 0.5, 0.03, 0.3, { y: 0.1, rz: 0.15 });
    kit.box(im.wood, 0.5, 0.03, 0.3, { y: -0.1, rz: -0.15 });
    kit.box(im.leather, 0.42, 0.18, 0.26, { x: -0.02 });
    kit.cylinder(im.steelDark, 0.02, 0.03, 0.3, { x: -0.38, rz: Math.PI / 2 }, { segments: 6 });
    kit.box(im.wood, 0.08, 0.08, 0.5, { x: 0.3, y: -0.3 });
  });
  return { hx: w / 2 + 0.6, hz: d / 2 };
}

// The smith's yard: forge, anvil with tools, quench trough, ingots and a
// grindstone under a lean-to roof.
export function smithy(kit, m, im, fm, random = mulberry32(5)) {
  const W = 5.6;
  const D = 4.2;
  // Posts and a plank roof sloping down to the front.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const h = sz < 0 ? 3.2 : 2.5;
      kit.box(m.timber, 0.2, h, 0.2, { x: sx * (W / 2 - 0.2), y: h / 2, z: sz * (D / 2 - 0.2) }, { metres: 1.2, grain: true });
    }
  }
  const rise = 0.7;
  const slope = Math.atan2(rise, D);
  kit.box(m.timber, W, 0.16, 0.16, { y: 3.2, z: -D / 2 + 0.1 }, { metres: 1.2, grain: true });
  kit.box(m.timber, W, 0.16, 0.16, { y: 2.5, z: D / 2 - 0.1 }, { metres: 1.2, grain: true });
  kit.box(m.shingles, W + 0.6, 0.1, D / Math.cos(slope) + 0.6, { y: 2.85 + 0.1, rx: slope }, { metres: 2 });
  kit.box(m.planks, W + 0.4, 0.04, D / Math.cos(slope) + 0.4, { y: 2.85 + 0.02, rx: slope }, { metres: 1.5, grain: true });
  for (let i = 0; i < 6; i++) kit.box(m.timber, 0.1, 0.12, D / Math.cos(slope), { x: -W / 2 + 0.3 + i * ((W - 0.6) / 5), y: 2.85 - 0.06, rx: slope }, { metres: 1.2, grain: true });
  // Back wall of stone, waist high.
  kit.box(m.stone, W, 1.1, 0.3, { y: 0.55, z: -D / 2 }, { metres: 2 });
  kit.frame({ x: -1.3, z: -D / 2 + 0.9 }, () => forge(kit, m, im, fm));
  kit.frame({ x: 1.2, z: 0.2, ry: 0.3 }, () => {
    anvil(kit, im);
    hammer(kit, im, { x: -0.05, y: 0.66, z: 0.05, ry: 0.4 });
  });
  tongs(kit, im, { x: 1.9, y: 0.02, z: 0.9, ry: 0.8 });
  // Quench trough.
  kit.frame({ x: 2.2, z: -0.9 }, () => waterBarrel(kit, m));
  // Ingots on a low bench, a crate of coal, a bucket.
  kit.frame({ x: -0.3, z: 1.2 }, () => {
    bench(kit, m, 1.4);
    kit.frame({ x: -0.4, y: 0.48 }, () => ingotStack(kit, im.steel, 3));
    kit.frame({ x: 0.1, y: 0.48, ry: 0.2 }, () => ingotStack(kit, fm.copper, 2));
    kit.frame({ x: 0.5, y: 0.48, ry: -0.3 }, () => ingotStack(kit, im.gold, 2));
  });
  kit.frame({ x: -2.3, z: 1.3, ry: 0.5 }, () => crate(kit, m, 0.6));
  kit.frame({ x: -2.3, y: 0.6, z: 1.3 }, () => kit.box(fm.coal, 0.5, 0.1, 0.5, { y: 0.05 }));
  kit.frame({ x: 2.1, z: 1.4 }, () => bucket(kit, m, im, fm));
  kit.frame({ x: W / 2 + 2.2, z: -1.2 }, () => smelter(kit, m, im, fm));
  // Grindstone: a wheel on a frame with a treadle.
  kit.frame({ x: -2.2, z: -0.4, ry: Math.PI / 2 }, () => {
    kit.cylinder(m.ashlar, 0.4, 0.4, 0.12, { y: 0.7, rx: Math.PI / 2 }, { segments: 18, metres: 1 });
    kit.cylinder(im.steelDark, 0.03, 0.03, 0.6, { y: 0.7, rz: Math.PI / 2 }, { segments: 6 });
    for (const sx of [-1, 1]) kit.box(m.timber, 0.08, 0.7, 0.08, { x: sx * 0.28, y: 0.35 });
    kit.box(m.timber, 0.7, 0.06, 0.4, { y: 0.03 });
  });
  return {
    hx: W / 2 + 0.3, hz: D / 2 + 0.3,
    colliders: [
      { cx: -1.3, cz: -D / 2 + 0.9, hx: 0.9, hz: 0.6 },
      { cx: 1.2, cz: 0.2, hx: 0.4, hz: 0.3 },
      { cx: 2.2, cz: -0.9, hx: 0.4, hz: 0.4 },
      { cx: -0.3, cz: 1.2, hx: 0.7, hz: 0.2 },
      { cx: 0, cz: -D / 2, hx: W / 2, hz: 0.15 },
      { cx: -2.2, cz: -0.4, hx: 0.3, hz: 0.45 },
      { cx: W / 2 + 2.2, cz: -1.2, hx: 1.0, hz: 1.0 },
    ],
  };
}

// A smelter: a squat stone furnace with a brick stack, a crucible and a
// pour spout, coals glowing in the mouth.
export function smelter(kit, m, im, fm) {
  kit.cylinder(m.stone, 0.8, 1.0, 1.4, { y: 0.7 }, { segments: 12, metres: 2 });
  kit.cylinder(m.ashlar, 0.5, 0.55, 1.6, { y: 2.2 }, { segments: 10, metres: 1.5 });
  kit.cylinder(fm.coal, 0.4, 0.4, 0.05, { y: 1.42 }, { segments: 10 });
  kit.box(fm.embers, 0.45, 0.3, 0.1, { y: 0.5, z: 0.82 });
  kit.box(m.stone, 0.7, 0.5, 0.12, { y: 0.95, z: 0.86 }, { metres: 1.5 });
  kit.cylinder(im.steelDark, 0.16, 0.14, 0.22, { y: 1.55, x: 0.3 }, { segments: 10, open: true });
  kit.box(im.steelDark, 0.3, 0.05, 0.08, { x: 0.55, y: 0.35, z: 0.6, ry: -0.5 });
  return { hx: 1.0, hz: 1.0 };
}

// --- Alchemy ----------------------------------------------------------------

// An iron cauldron on a tripod over a small fire, brew glowing green.
export function cauldron(kit, im, fm) {
  const g = new THREE.SphereGeometry(0.42, 14, 10, 0, TAU, 0.9, 1.9);
  kit.add(im.steelDark, g, { y: 0.62 });
  kit.cylinder(im.steelDark, 0.4, 0.4, 0.05, { y: 0.88 }, { segments: 14, open: true });
  kit.cylinder(fm.potionGreen, 0.36, 0.36, 0.02, { y: 0.86 }, { segments: 14 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    kit.box(im.steelDark, 0.04, 0.9, 0.04, { x: Math.cos(a) * 0.3, y: 0.45, z: Math.sin(a) * 0.3, rx: Math.sin(a) * 0.25, rz: -Math.cos(a) * 0.25 });
  }
  // Fire beneath: logs and flame.
  for (let i = 0; i < 4; i++) kit.cylinder(im.wood, 0.04, 0.04, 0.5, { y: 0.05, ry: (i / 4) * Math.PI, rz: Math.PI / 2 }, { segments: 6 });
  kit.add(fm.flame, new THREE.ConeGeometry(0.14, 0.3, 7), { y: 0.22 });
  kit.add(fm.embers, new THREE.ConeGeometry(0.2, 0.12, 7), { y: 0.1 });
  return { hx: 0.45, hz: 0.45 };
}

// Mortar and pestle.
export function mortar(kit, m, t = {}) {
  kit.frame(t, () => {
    kit.cylinder(m.ashlar, 0.08, 0.06, 0.09, { y: 0.045 }, { segments: 10, metres: 0.4, open: true });
    kit.cylinder(m.ashlar, 0.06, 0.06, 0.02, { y: 0.01 }, { segments: 10 });
    kit.cylinder(m.ashlar, 0.015, 0.022, 0.16, { x: 0.03, y: 0.1, rz: 0.6 }, { segments: 6 });
  });
}

// Balance scales.
export function scales(kit, im, t = {}) {
  kit.frame(t, () => {
    kit.cylinder(im.brass, 0.06, 0.07, 0.01, { y: 0.005 }, { segments: 10 });
    kit.cylinder(im.brass, 0.008, 0.01, 0.26, { y: 0.13 }, { segments: 6 });
    kit.box(im.brass, 0.3, 0.008, 0.008, { y: 0.26, rz: 0.08 });
    for (const s of [-1, 1]) {
      const y = 0.26 + s * 0.012;
      kit.cylinder(im.brass, 0.045, 0.03, 0.012, { x: s * 0.15, y: y - 0.1 }, { segments: 10 });
      for (let k = 0; k < 3; k++) kit.box(im.brass, 0.003, 0.1, 0.003, { x: s * 0.15 + Math.cos((k / 3) * TAU) * 0.035, y: y - 0.05, z: Math.sin((k / 3) * TAU) * 0.035 });
    }
  });
}

// A bundle of dried herbs hanging from a hook.
export function herbBundle(kit, fm, t = {}) {
  kit.frame(t, () => {
    for (let i = 0; i < 5; i++) kit.box(fm.herb, 0.02, 0.24, 0.02, { x: (i - 2) * 0.012, y: -0.12, rx: (i - 2) * 0.12, rz: (i % 2 ? 1 : -1) * 0.1 });
    kit.box(fm.rope, 0.05, 0.015, 0.05, { y: -0.02 });
  });
}

// The alchemist's stall: a table crowded with potions and apparatus, a
// shelf unit behind it, a cauldron bubbling beside.
export function alchemyStall(kit, m, im, fm, random = mulberry32(9)) {
  const t = table(kit, m, 2.2, 0.9, 0.8);
  const y = t.h;
  const kinds = ['potionRed', 'potionGreen', 'potionBlue', 'potionGold', 'potionViolet', 'clearGlass'];
  for (let i = 0; i < 9; i++) {
    const kind = kinds[i % kinds.length];
    kit.frame({ x: -0.95 + i * 0.17 + (random() - 0.5) * 0.04, y, z: -0.3 + (i % 2) * 0.12, ry: random() * TAU }, () => bottle(kit, fm, kind, i % 3));
  }
  mortar(kit, m, { x: 0.3, y, z: 0.2 });
  scales(kit, im, { x: -0.6, y, z: 0.22 });
  book(kit, fm, 'bookBrown', { x: 0.75, y, z: 0.15, ry: -0.3 });
  book(kit, fm, 'bookGreen', { x: 0.75, y: y + 0.04, z: 0.15, ry: -0.1 });
  candle(kit, fm, im, { x: 0.95, y, z: -0.3 });
  kit.frame({ x: -0.1, y, z: 0.22 }, () => gems(kit, fm, random, 6));
  // Shelf unit behind with more bottles and books.
  kit.frame({ z: -0.95 }, () => {
    const w = 2.2;
    for (const sx of [-1, 1]) kit.box(m.planks, 0.05, 1.9, 0.3, { x: sx * (w / 2 - 0.03), y: 0.95 }, { metres: 1 });
    for (let s = 0; s < 3; s++) {
      const sy = 1.0 + s * 0.4;
      kit.box(m.planks, w, 0.04, 0.3, { y: sy }, { metres: 1 });
      for (let i = 0; i < 10; i++) {
        if (random() < 0.25) continue;
        const kind = kinds[Math.floor(random() * kinds.length)];
        kit.frame({ x: -w / 2 + 0.15 + i * 0.2, y: sy + 0.02, ry: random() * TAU }, () => bottle(kit, fm, kind, Math.floor(random() * 3)));
      }
    }
    kit.box(m.planks, w, 0.04, 0.3, { y: 0.5 }, { metres: 1 });
    kit.frame({ x: -0.7, y: 0.52 }, () => crate(kit, m, 0.35));
    herbBundle(kit, fm, { x: 0.3, y: 1.9, z: 0.18 });
    herbBundle(kit, fm, { x: 0.6, y: 1.9, z: 0.18, ry: 0.5 });
  });
  kit.frame({ x: 1.7, z: -0.3 }, () => cauldron(kit, im, fm));
  return { hx: 1.3, hz: 0.7, colliders: [{ cx: 0, cz: 0, hx: 1.15, hz: 0.5 }, { cx: 0, cz: -0.95, hx: 1.15, hz: 0.2 }, { cx: 1.7, cz: -0.3, hx: 0.45, hz: 0.45 }] };
}

// --- Arms and staffs ----------------------------------------------------------

// A wizard's staff: gnarled shaft with a gem held in a forked head.
export function staff(kit, im, fm, kind = 0, t = {}) {
  const gem = [fm.gemBlue, fm.gemGreen, fm.gemPurple][kind % 3];
  kit.frame(t, () => {
    kit.cylinder(im.wood, 0.02, 0.028, 1.6, { y: 0.8, rz: 0.03 }, { segments: 7 });
    kit.cylinder(im.wood, 0.03, 0.02, 0.3, { y: 1.72, rz: -0.25 }, { segments: 6 });
    kit.cylinder(im.wood, 0.03, 0.02, 0.3, { y: 1.72, rz: 0.3 }, { segments: 6 });
    kit.cylinder(im.brass, 0.03, 0.03, 0.03, { y: 1.58 }, { segments: 8 });
    kit.add(gem, new THREE.OctahedronGeometry(0.06, 0), { y: 1.82 });
    kit.cylinder(im.steelDark, 0.022, 0.028, 0.08, { y: 0.04 }, { segments: 7 });
  });
}

// A round shield: planks, iron rim and boss.
export function roundShield(kit, m, im, t = {}) {
  kit.frame(t, () => {
    kit.cylinder(m.planks, 0.34, 0.34, 0.03, {}, { segments: 20, metres: 0.7 });
    kit.cylinder(im.ironBand, 0.35, 0.35, 0.035, {}, { segments: 20, open: true });
    kit.add(im.steelDark, new THREE.SphereGeometry(0.08, 10, 6, 0, TAU, 0, Math.PI / 2), { y: 0.015 });
    kit.box(im.ironBand, 0.5, 0.01, 0.04, { y: 0.02 });
  });
}

// A bow and a quiver of arrows.
export function bow(kit, im, fm, t = {}) {
  kit.frame(t, () => {
    for (let i = 0; i < 10; i++) {
      const a = -0.9 + (i / 9) * 1.8;
      kit.box(im.woodLight, 0.02, 0.18, 0.03, { x: Math.sin(a) * 0.5, y: Math.cos(a) * 0.65 - 0.65, rz: -a * 0.9 });
    }
    kit.box(fm.rope, 0.006, 1.24, 0.006, { x: -0.1, y: -0.65 });
  });
}
export function quiver(kit, im, fm, t = {}) {
  kit.frame(t, () => {
    kit.cylinder(im.leather, 0.06, 0.05, 0.5, { y: 0.25 }, { segments: 9, open: true });
    kit.cylinder(im.leather, 0.05, 0.05, 0.01, { y: 0.005 }, { segments: 9 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      kit.cylinder(im.woodLight, 0.005, 0.005, 0.7, { x: Math.cos(a) * 0.03, y: 0.4, z: Math.sin(a) * 0.03, rx: (Math.random() - 0.5) * 0.1 }, { segments: 4 });
      kit.box(fm.clothRed, 0.03, 0.06, 0.004, { x: Math.cos(a) * 0.03, y: 0.72, z: Math.sin(a) * 0.03, ry: a });
    }
  });
}

// Armoury stand: shields, bows and staffs against a timber frame.
export function armoury(kit, m, im, fm) {
  const w = 2.4;
  kit.box(m.timber, w, 0.08, 0.08, { y: 1.9 }, { metres: 1.2, grain: true });
  kit.box(m.timber, w, 0.08, 0.1, { y: 0.1 }, { metres: 1.2, grain: true });
  for (const sx of [-1, 1]) kit.box(m.timber, 0.09, 1.95, 0.09, { x: sx * (w / 2 - 0.05), y: 0.97 });
  kit.box(m.planks, w, 1.2, 0.04, { y: 1.1, z: -0.08 }, { metres: 1 });
  roundShield(kit, m, im, { x: -0.7, y: 1.3, z: 0.02, rx: Math.PI / 2 });
  roundShield(kit, m, im, { x: 0.0, y: 1.25, z: 0.02, rx: Math.PI / 2, ry: 0.3 });
  bow(kit, im, fm, { x: 0.7, y: 1.6, z: 0.06, rz: 0.1 });
  quiver(kit, im, fm, { x: 0.95, y: 0.16, z: 0.1, rz: -0.15 });
  for (let k = 0; k < 3; k++) staff(kit, im, fm, k, { x: -1.0 + k * 0.22, y: 0.15, z: 0.14, rz: 0.12 - k * 0.05 });
  return { hx: w / 2 + 0.1, hz: 0.25 };
}

// --- Tavern yard -------------------------------------------------------------

// Trestle table laid with food and drink, benches either side.
export function tavernTable(kit, m, im, fm, random = mulberry32(3)) {
  const t = table(kit, m, 2.4, 0.9, 0.76);
  const y = t.h;
  kit.frame({ z: 0.75 }, () => bench(kit, m, 2.2));
  kit.frame({ z: -0.75 }, () => bench(kit, m, 2.2));
  loaf(kit, fm, { x: -0.8, y, z: 0.1, ry: 0.4 });
  cheeseWheel(kit, fm, { x: -0.3, y, z: -0.15 });
  appleBasket(kit, m, fm, random, { x: 0.35, y, z: 0.05 });
  ham(kit, fm, { x: 0.9, y, z: -0.1, ry: 0.5 });
  for (let i = 0; i < 4; i++) mug(kit, m, { x: -0.9 + i * 0.55 + (random() - 0.5) * 0.1, y, z: 0.3 - (i % 2) * 0.5, ry: random() * TAU });
  pie(kit, fm, { x: -0.55, y, z: -0.2 });
  meatSkewer(kit, im, fm, { x: 0.15, y: y + 0.02, z: 0.32, ry: 0.3 });
  meatSkewer(kit, im, fm, { x: 0.2, y: y + 0.02, z: 0.38, ry: 0.15 });
  fish(kit, im, fm, { x: 1.05, y: y + 0.03, z: 0.25, ry: 1.1 });
  kit.frame({ x: 0.0, y, z: -0.32 }, () => bottle(kit, fm, 'clearGlass', 0));
  candle(kit, fm, im, { x: -0.55, y, z: 0.3 });
  kit.frame({ x: 0.6, y: y + 0.01, z: 0.3 }, () => coinPurse(kit, m, im, { fill: 0.6, seed: 7 }));
  return { hx: 1.3, hz: 1.0, colliders: [{ cx: 0, cz: 0, hx: 1.2, hz: 0.45 }, { cx: 0, cz: 0.75, hx: 1.1, hz: 0.17 }, { cx: 0, cz: -0.75, hx: 1.1, hz: 0.17 }] };
}

// A dugout canoe: a hollowed log, pointed both ends, a paddle inside.
export function canoe(kit, m, im) {
  const L = 3.2;
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const w = (t) => 0.3 * Math.sin(Math.PI * t) + 0.05;
    for (const side of [-1, 1]) {
      const x0 = side * w(t0);
      const x1 = side * w(t1);
      const z0 = -L / 2 + t0 * L;
      const z1 = -L / 2 + t1 * L;
      kit.box(m.logs, 0.06, 0.32, Math.hypot(x1 - x0, z1 - z0) + 0.02, { x: (x0 + x1) / 2, y: 0.2, z: (z0 + z1) / 2, ry: Math.atan2(x1 - x0, z1 - z0), rz: side * -0.3 }, { metres: 1.2 });
    }
  }
  kit.box(m.logs, 0.5, 0.06, L * 0.8, { y: 0.05 }, { metres: 1.2, grain: true });
  kit.box(im.woodLight, 0.04, 0.04, 1.6, { x: 0.1, y: 0.25, z: 0.2, ry: 0.1 });
  kit.box(im.woodLight, 0.15, 0.02, 0.4, { x: 0.12, y: 0.25, z: 1.1 });
  return { hx: 0.4, hz: L / 2 };
}

// --- A rowing boat ----------------------------------------------------------

// Clinker-built rowboat: curved strakes approximated by boxes along the hull,
// thwarts, and a pair of shipped oars. Local +z is the bow.
export function rowboat(kit, m, im, fm) {
  const L = 3.6;
  const segs = 10;
  const strakes = 4;
  for (let s = 0; s < strakes; s++) {
    const y = 0.12 + s * 0.14;
    const halfW = 0.36 + s * 0.11;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const z0 = -L / 2 + t0 * L;
      const z1 = -L / 2 + t1 * L;
      const taper = (t) => Math.sin(Math.PI * Math.min(1, Math.max(0, t * 0.92 + 0.04))) ** 0.5;
      for (const side of [-1, 1]) {
        const x0 = side * halfW * taper(t0);
        const x1 = side * halfW * taper(t1);
        const len = Math.hypot(x1 - x0, z1 - z0);
        kit.box(m.planks, 0.03, 0.15, len + 0.02, { x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, ry: Math.atan2(x1 - x0, z1 - z0), rz: side * -0.25 }, { metres: 1.2, grain: true });
      }
    }
  }
  // Bottom boards, keel, stem and stern posts.
  kit.box(m.planks, 0.7, 0.04, L * 0.8, { y: 0.06 }, { metres: 1.2, grain: true });
  kit.box(m.timber, 0.08, 0.1, L, { y: 0.02 }, { metres: 1.2, grain: true });
  kit.box(m.timber, 0.08, 0.75, 0.1, { y: 0.4, z: L / 2 - 0.02, rx: -0.2 }, { metres: 1 });
  kit.box(m.timber, 0.08, 0.6, 0.1, { y: 0.35, z: -L / 2 + 0.02, rx: 0.15 }, { metres: 1 });
  // Gunwale rail and thwarts (seats).
  for (const z of [-0.9, 0.2, 1.1]) kit.box(m.planks, 1.2 - Math.abs(z) * 0.2, 0.04, 0.22, { y: 0.5, z }, { metres: 1, grain: true });
  // Oars shipped inboard, a bucket and a coil of rope.
  for (const side of [-1, 1]) {
    kit.cylinder(im.woodLight, 0.02, 0.02, 2.4, { x: side * 0.35, y: 0.55, z: 0.1, rx: Math.PI / 2, rz: side * 0.08 }, { segments: 6 });
    kit.box(im.woodLight, 0.12, 0.02, 0.5, { x: side * 0.38, y: 0.56, z: -1.15 });
    kit.cylinder(im.ironBand, 0.02, 0.02, 0.12, { x: side * 0.72, y: 0.6, z: 0.3 }, { segments: 6 });
  }
  kit.frame({ x: -0.25, y: 0.08, z: 0.75 }, () => bucket(kit, m, im, fm, { full: false }));
  kit.add(fm.rope, new THREE.TorusGeometry(0.12, 0.035, 6, 14), { x: 0.3, y: 0.1, z: -1.4, rx: Math.PI / 2 });
  return { hx: 0.9, hz: L / 2 + 0.1 };
}
