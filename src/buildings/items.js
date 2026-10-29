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
    coin: mat({ color: 0xe6c05a, roughness: 0.35, metalness: 1.0 }),
    gemRed: mat({ color: 0xb8203a, roughness: 0.1, metalness: 0.1, emissive: 0x5a0a18, emissiveIntensity: 0.5 }),
    gemBlue: mat({ color: 0x2a5ad8, roughness: 0.1, metalness: 0.1, emissive: 0x0a1a60, emissiveIntensity: 0.5 }),
    bone: mat({ color: 0xe8e0cc, roughness: 0.6, metalness: 0 }),
  };
  for (const k of ['obsidianEdge', 'emeraldEdge', 'emerald', 'obsidian', 'gemRed', 'gemBlue']) items[k].userData.noShadow = false;
  return items;
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

// --- Weapons ------------------------------------------------------------------

export function sword(kit, im, kind, seed = 1) {
  const k = weaponKind(im, kind);
  const rng = mulberry32(seed);
  const bladeLen = 0.78 + rng() * 0.08;
  const bladeW = 0.052;
  const bladeT = 0.009;
  const gripLen = 0.11;
  // Grip, guard, blade, pommel laid along +x; grip from -gripLen..0.
  kit.cylinder(k.grip, 0.014, 0.016, gripLen, { x: -gripLen / 2, rz: Math.PI / 2 }, { segments: 10 });
  // Leather wrap ridges.
  for (let i = 0; i < 5; i++) kit.cylinder(k.grip, 0.0165, 0.0165, 0.008, { x: -gripLen * 0.1 - i * gripLen * 0.19, rz: Math.PI / 2 }, { segments: 10 });
  // Cross guard, slightly curved toward the blade.
  kit.box(k.guard, 0.03, 0.17, 0.016, { x: 0.012 });
  for (const s of [-1, 1]) kit.box(k.guard, 0.02, 0.03, 0.02, { x: 0.02, y: s * 0.09 });
  // Blade.
  kit.frame({ x: 0.027 }, () => {
    kit.add(k.blade, bladeGeometry(bladeLen, bladeW, bladeT));
    if (kind !== 'wooden') edgeStrips(kit, k.edge, bladeLen, bladeW, bladeT);
  });
  // Pommel.
  if (kind === 'wooden') kit.add(k.pommel, new THREE.SphereGeometry(0.022, 10, 8), { x: -gripLen - 0.016 });
  else {
    kit.add(k.pommel, new THREE.SphereGeometry(0.02, 12, 10), { x: -gripLen - 0.016 });
    kit.cylinder(k.pommel, 0.012, 0.016, 0.012, { x: -gripLen - 0.003, rz: Math.PI / 2 }, { segments: 10 });
  }
  return { length: gripLen + 0.03 + bladeLen, name: `${kind} sword` };
}

export function dagger(kit, im, kind, seed = 1) {
  const k = weaponKind(im, kind);
  const rng = mulberry32(seed + 7);
  const bladeLen = 0.26 + rng() * 0.04;
  const bladeW = 0.036;
  const bladeT = 0.007;
  const gripLen = 0.095;
  kit.cylinder(k.grip, 0.011, 0.013, gripLen, { x: -gripLen / 2, rz: Math.PI / 2 }, { segments: 10 });
  for (let i = 0; i < 4; i++) kit.cylinder(k.grip, 0.0135, 0.0135, 0.006, { x: -gripLen * 0.12 - i * gripLen * 0.22, rz: Math.PI / 2 }, { segments: 10 });
  // Short swept guard.
  kit.box(k.guard, 0.018, 0.085, 0.012, { x: 0.008, rz: 0 });
  for (const s of [-1, 1]) kit.box(k.guard, 0.025, 0.014, 0.012, { x: 0.017, y: s * 0.045, rz: s * 0.5 });
  kit.frame({ x: 0.018 }, () => {
    kit.add(k.blade, bladeGeometry(bladeLen, bladeW, bladeT, { taperStart: 0.45 }));
    if (kind !== 'wooden') edgeStrips(kit, k.edge, bladeLen, bladeW, bladeT);
  });
  kit.add(k.pommel, new THREE.SphereGeometry(0.014, 10, 8), { x: -gripLen - 0.01 });
  return { length: gripLen + 0.02 + bladeLen, name: `${kind} dagger` };
}

export function greatsword(kit, im, kind, seed = 1) {
  const k = weaponKind(im, kind);
  const rng = mulberry32(seed + 13);
  const bladeLen = 1.25 + rng() * 0.1;
  const bladeW = 0.075;
  const bladeT = 0.012;
  const gripLen = 0.3;
  // Long two-hand grip with a leather wrap and a steel collar in the middle.
  kit.cylinder(k.grip, 0.017, 0.019, gripLen, { x: -gripLen / 2, rz: Math.PI / 2 }, { segments: 10 });
  kit.cylinder(k.guard, 0.02, 0.02, 0.025, { x: -gripLen / 2, rz: Math.PI / 2 }, { segments: 10 });
  for (let i = 0; i < 9; i++) kit.cylinder(k.grip, 0.0195, 0.0195, 0.007, { x: -gripLen * 0.06 - i * gripLen * 0.105, rz: Math.PI / 2 }, { segments: 10 });
  // Wide guard with down-turned tips and a ricasso (unsharpened blade root).
  kit.box(k.guard, 0.035, 0.3, 0.022, { x: 0.018 });
  for (const s of [-1, 1]) kit.box(k.guard, 0.05, 0.03, 0.024, { x: 0.035, y: s * 0.16, rz: -s * 0.35 });
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
  // Heavy pommel.
  kit.add(k.pommel, new THREE.SphereGeometry(0.028, 12, 10), { x: -gripLen - 0.022 });
  kit.cylinder(k.pommel, 0.016, 0.022, 0.016, { x: -gripLen - 0.004, rz: Math.PI / 2 }, { segments: 10 });
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
    for (const x of [-w * 0.32, w * 0.32]) vaultLid(kit, im.ironBand, d + 0.04, 0.05, 0.17, { x, ry: Math.PI / 2 });
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
      for (const x of [-w * 0.3, 0, w * 0.3]) vaultLid(kit, im.gold, d + 0.04, 0.035, 0.16, { x, ry: Math.PI / 2 });
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
  const pts = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Round belly, pinched neck at ~75%, flaring mouth.
    let r = Math.sin(t * Math.PI * 0.95) * (0.06 + 0.04 * fill);
    if (t > 0.72) r = 0.028 + (t - 0.72) * 0.15 + Math.sin((t - 0.72) * 30) * 0.004;
    pts.push(new THREE.Vector2(Math.max(0.001, r), t * h));
  }
  const g = new THREE.LatheGeometry(pts, 16);
  // Wrinkle the surface a little.
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const k = 1 + 0.04 * Math.sin(a * 7 + y * 40) * (1 - y / h);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  kit.add(colour === 'velvet' ? im.velvet : im.leather, g);
  // Drawstring: a torus round the neck and two dangling cords.
  const neckY = h * 0.78;
  kit.add(m.rope, new THREE.TorusGeometry(0.031, 0.004, 6, 16), { y: neckY, rx: Math.PI / 2 });
  for (const s of [-1, 1]) {
    kit.cylinder(m.rope, 0.003, 0.003, 0.07, { x: s * 0.025, y: neckY - 0.03, z: 0.02, rz: s * 0.4 }, { segments: 5 });
    kit.add(m.rope, new THREE.SphereGeometry(0.006, 6, 5), { x: s * 0.04, y: neckY - 0.065, z: 0.025 });
  }
  // Coins at the mouth and beside it.
  for (let i = 0; i < 5; i++) {
    kit.cylinder(im.coin, 0.016, 0.016, 0.003, { x: (rng() - 0.5) * 0.04, y: h - 0.005 + rng() * 0.01, z: (rng() - 0.5) * 0.04, rx: (rng() - 0.5) * 0.9, rz: (rng() - 0.5) * 0.9 }, { segments: 12 });
  }
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    const r = 0.1 + rng() * 0.06;
    kit.cylinder(im.coin, 0.016, 0.016, 0.003, { x: Math.cos(a) * r, y: 0.0015, z: Math.sin(a) * r, ry: rng() * 3 }, { segments: 12 });
  }
  return { r: 0.12, name: 'coin purse' };
}

// --- Display: a trestle table laid with items, and a weapon rack ------------

export function displayTable(kit, m, im) {
  const w = 2.6;
  const d = 0.9;
  const h = 0.82;
  kit.box(m.planks, w, 0.05, d, { y: h }, { metres: 1.2 });
  for (const sx of [-1, 1]) {
    kit.frame({ x: sx * (w / 2 - 0.3) }, () => {
      kit.beamBetween(m.timber, -0.3, 0.02, 0.0, h - 0.03, 0.06, 0.08, 0.25);
      kit.beamBetween(m.timber, 0.3, 0.02, 0.0, h - 0.03, 0.06, 0.08, 0.25);
      kit.beamBetween(m.timber, -0.3, 0.02, 0.0, h - 0.03, 0.06, 0.08, -0.25);
      kit.beamBetween(m.timber, 0.3, 0.02, 0.0, h - 0.03, 0.06, 0.08, -0.25);
    });
  }
  kit.box(m.timber, w - 0.5, 0.06, 0.08, { y: 0.3 }, { metres: 1.2, grain: true });
  // Cloth runner.
  kit.box(im.velvet, w - 0.3, 0.006, d - 0.2, { y: h + 0.028 });
  // Items on the table: daggers and purses.
  const kinds = WEAPON_KINDS;
  kinds.forEach((kind, i) => {
    kit.frame({ x: -w / 2 + 0.35 + i * 0.62, y: h + 0.04, z: -0.2, ry: 0.15 }, () => dagger(kit, im, kind, i));
  });
  kit.frame({ x: -0.9, y: h + 0.03, z: 0.22 }, () => coinPurse(kit, m, im, { fill: 0.9, seed: 1 }));
  kit.frame({ x: -0.3, y: h + 0.03, z: 0.25 }, () => coinPurse(kit, m, im, { fill: 0.5, seed: 2, colour: 'velvet' }));
  kit.frame({ x: 0.35, y: h + 0.03, z: 0.2 }, () => coinPurse(kit, m, im, { fill: 1.0, seed: 3 }));
  return { hx: w / 2 + 0.1, hz: d / 2 + 0.1 };
}

// A-frame rack: swords stand in the front row, greatswords lean behind.
export function weaponRack(kit, m, im) {
  const w = 2.4;
  const h = 1.75;
  for (const sx of [-1, 1]) {
    kit.frame({ x: sx * (w / 2) }, () => {
      kit.beamBetween(m.timber, -0.28, 0, 0, h, 0.07, 0.07, 0);
      kit.beamBetween(m.timber, 0.28, 0, 0, h, 0.07, 0.07, 0);
    });
  }
  kit.box(m.timber, w + 0.1, 0.07, 0.07, { y: h }, { metres: 1.2, grain: true });
  kit.box(m.timber, w + 0.1, 0.06, 0.09, { y: 0.12 }, { metres: 1.2, grain: true });
  // Notched rail the blades rest against.
  kit.box(m.timber, w, 0.05, 0.06, { y: 1.0, z: 0.12 }, { metres: 1.2, grain: true });
  WEAPON_KINDS.forEach((kind, i) => {
    const x = -w / 2 + 0.3 + i * 0.6;
    // Sword standing hilt-up, flat face to the viewer, leaning on the rail.
    kit.frame({ x, y: 0.15, z: 0.14, rz: Math.PI / 2 - 0.1 }, () => sword(kit, im, kind, i));
    // Greatsword behind, hilt up, leaning back.
    kit.frame({ x: x + 0.2, y: 0.15, z: -0.12, rz: Math.PI / 2 + 0.12 }, () => greatsword(kit, im, kind, i + 4));
  });
  return { hx: w / 2 + 0.2, hz: 0.35 };
}
