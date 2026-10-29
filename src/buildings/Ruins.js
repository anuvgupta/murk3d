import * as THREE from 'three';
import { Kit } from './Kit.js';
import { CHESTS } from './items.js';
import { createFurnitureMaterials, rowboat, canoe } from './furniture.js';
import { RUINS, ISLETS, PITS, LAKE, CREVASSE } from '../world/plan.js';
import { mulberry32 } from '../util/noise.js';
import { createRockMaterial } from '../world/Rocks.js';

// Ruins: a small vocabulary of broken stonework (pointed arches, columns,
// ragged walls, fallen mossy blocks, a plank jetty) and the sites built from
// it: the drowned temple on the lake shore with its islet arches, the
// half-buried crypt behind it, a stone circle in the Elder Wood, a tower
// stump on a hill, a roofless chapel below the castle, and an old arcade on
// the crevasse floor. Everything merges into a few meshes.

const TAU = Math.PI * 2;

// --- Vocabulary -------------------------------------------------------------

// A weathered block: a box whose faces are pushed about by noise so no
// edge is dead straight and no face dead flat. For monoliths and lintels.
function roughBlock(kit, mat, w, h, d, t, random, rough = 0.12) {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(2, Math.round(w / 0.3)), Math.max(2, Math.round(h / 0.3)), Math.max(2, Math.round(d / 0.3)));
  const pos = g.attributes.position;
  const seed = random() * 100;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 7.1 + seed) * Math.cos(v.y * 5.3 - seed) + Math.sin(v.z * 6.7 + v.y * 3.1 + seed * 0.5) * 0.7;
    const k = 1 + n * rough * 0.5;
    // Shrink toward the top a little so blocks taper like worn stone.
    const taper = 1 - 0.08 * Math.max(0, v.y / h + 0.5);
    pos.setXYZ(i, v.x * k * taper, v.y * (1 + n * rough * 0.2), v.z * k * taper);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) / 1.6, uv.getY(i) * h / 1.6);
  kit.add(mat, g, t);
}

// A pointed (equilateral) arch ring of inner span w, ring thickness t and
// depth d, standing on two piers of height pierH. Local origin is on the
// ground midway between the piers; the arch spans local x.
function gothicArch(kit, mat, { w = 2.2, t = 0.45, d = 0.8, pierH = 2.4, pierW = 0.6, broken = 0 } = {}) {
  for (const s of [-1, 1]) {
    kit.box(mat, pierW, pierH, d, { x: s * (w / 2 + pierW / 2), y: pierH / 2 }, { metres: 2 });
    kit.box(mat, pierW + 0.16, 0.22, d + 0.16, { x: s * (w / 2 + pierW / 2), y: pierH - 0.11 }, { metres: 2 });
  }
  const R = w + t;
  const shape = new THREE.Shape();
  const pts = [];
  const steps = 10;
  // Outer left arc (centre w/2), outer right arc (centre -w/2), then the inner
  // arcs back, so the ring closes on itself.
  const thetaO = Math.acos(-(w / 2) / R);
  for (let i = 0; i <= steps; i++) {
    const th = Math.PI - (Math.PI - thetaO) * (i / steps);
    pts.push([w / 2 + R * Math.cos(th), R * Math.sin(th)]);
  }
  for (let i = 0; i <= steps; i++) {
    const th = (Math.PI - thetaO) * (1 - i / steps);
    pts.push([-w / 2 + R * Math.cos(th), R * Math.sin(th)]);
  }
  const thetaI = (2 * Math.PI) / 3;
  for (let i = 0; i <= steps; i++) {
    const th = (Math.PI - thetaI) * (i / steps);
    pts.push([-w / 2 + w * Math.cos(th), w * Math.sin(th)]);
  }
  for (let i = 0; i <= steps; i++) {
    const th = thetaI + (Math.PI - thetaI) * (i / steps);
    pts.push([w / 2 + w * Math.cos(th), w * Math.sin(th)]);
  }
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
  if (broken > 0) {
    // Lop the apex off: keep only the part of the ring below a cut height.
    const cut = R * 0.86 - broken * R * 0.5;
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > cut) pos.setY(i, cut + (Math.sin(pos.getX(i) * 7.3) * 0.08));
    g.computeVertexNormals();
  }
  kit.add(mat, g, { y: pierH });
  return { apex: pierH + Math.sqrt(R * R - (w * w) / 4), halfSpan: w / 2 + pierW };
}

// A round column: plinth, drum shaft with slight entasis, capital. Broken
// columns stop short with a tilted, chipped top.
function column(kit, mat, { h = 3.2, r = 0.32, broken = false, random = Math.random } = {}) {
  kit.box(mat, r * 2.6, 0.22, r * 2.6, { y: 0.11 }, { metres: 1.5 });
  kit.cylinder(mat, r * 1.25, r * 1.25, 0.14, { y: 0.29 }, { segments: 12, metres: 1.5 });
  const shaft = broken ? h * (0.3 + random() * 0.45) : h - 0.5;
  kit.cylinder(mat, r * 0.92, r, shaft, { y: 0.36 + shaft / 2 }, { segments: 14, metres: 1.6 });
  if (broken) {
    // A chipped top: a short tilted drum.
    kit.cylinder(mat, r * 0.6, r * 0.9, 0.3, { y: 0.36 + shaft + 0.1, rx: (random() - 0.5) * 0.5, rz: (random() - 0.5) * 0.5 }, { segments: 10, metres: 1.6 });
  } else {
    kit.cylinder(mat, r * 1.2, r * 0.95, 0.18, { y: h - 0.23 }, { segments: 12, metres: 1.5 });
    kit.box(mat, r * 2.8, 0.2, r * 2.8, { y: h - 0.1 }, { metres: 1.5 });
  }
  return broken ? 0.36 + shaft : h;
}

// A wall stub with a ragged top: slices along its length of varying height,
// with moss growing in the joints. Local x along the wall, centred.
function raggedWall(kit, mat, moss, len, h, thick, random, { low = 0.35 } = {}) {
  const slices = Math.max(2, Math.round(len / 0.9));
  const sw = len / slices;
  let last = h * (low + random() * (1 - low));
  for (let i = 0; i < slices; i++) {
    const target = h * (low + random() * (1 - low));
    const sh = (last + target) / 2;
    last = target;
    const x = -len / 2 + sw * (i + 0.5);
    kit.box(mat, sw + 0.02, sh, thick, { x, y: sh / 2, rz: (random() - 0.5) * 0.02 }, { metres: 2 });
    if (random() < 0.5) kit.box(moss, sw * 0.7, 0.05, thick * 0.6, { x, y: sh + 0.02, z: (random() - 0.5) * thick * 0.3 });
  }
  // Moss at the foot.
  kit.box(moss, len * 0.8, 0.12, thick + 0.3, { y: 0.06 });
}

// Tumbled blocks around a point: half sunk, tilted, moss on their upper faces.
function fallenBlocks(kit, mat, moss, count, spread, random, { size = 0.8 } = {}) {
  for (let i = 0; i < count; i++) {
    const a = random() * TAU;
    const d = Math.sqrt(random()) * spread;
    const w = size * (0.6 + random() * 0.9);
    const hgt = size * (0.4 + random() * 0.6);
    const dd = size * (0.5 + random() * 0.8);
    const rx = (random() - 0.5) * 0.6;
    const rz = (random() - 0.5) * 0.6;
    kit.frame({ x: Math.cos(a) * d, y: hgt * 0.25, z: Math.sin(a) * d, ry: random() * TAU, rx, rz }, () => {
      kit.box(mat, w, hgt, dd, {}, { metres: 1.6 });
      if (random() < 0.7) kit.box(moss, w * 0.8, 0.04, dd * 0.7, { y: hgt / 2 + 0.01 });
    });
  }
}

// A flagstone platform (slightly uneven slabs).
function flagstones(kit, mat, moss, w, d, random, { y = 0, slab = 1.2 } = {}) {
  const nx = Math.max(1, Math.round(w / slab));
  const nz = Math.max(1, Math.round(d / slab));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (random() < 0.08) continue; // a missing slab here and there
      const x = -w / 2 + (i + 0.5) * (w / nx);
      const z = -d / 2 + (j + 0.5) * (d / nz);
      const dy = (random() - 0.5) * 0.06;
      kit.box(mat, (w / nx) * 0.94, 0.16, (d / nz) * 0.94, { x, y: y + dy + 0.08, z, ry: (random() - 0.5) * 0.03 }, { metres: 1.2 });
      if (random() < 0.3) kit.box(moss, (w / nx) * 0.5, 0.02, (d / nz) * 0.4, { x: x + (random() - 0.5) * 0.3, y: y + dy + 0.17, z: z + (random() - 0.5) * 0.3 });
    }
  }
}

// A plank jetty from the local origin along +z: piles into the water, a
// plank deck, a rail post or two. Returns the deck height.
function jetty(kit, m, len, width, deckY, waterY, random) {
  const bays = Math.round(len / 2.2);
  for (let i = 0; i <= bays; i++) {
    const z = (i / bays) * len;
    for (const s of [-1, 1]) {
      const h = deckY - waterY + 1.6;
      kit.cylinder(m.logs, 0.11, 0.13, h, { x: s * (width / 2 - 0.12), y: deckY - h / 2 + 0.1, z, rx: (random() - 0.5) * 0.06 }, { segments: 8, metres: 1 });
    }
    kit.box(m.timber, width + 0.1, 0.12, 0.14, { y: deckY - 0.12, z }, { metres: 1.2, grain: true });
  }
  const planks = Math.round(len / 0.26);
  for (let i = 0; i < planks; i++) {
    if (random() < 0.06) continue; // a missing plank
    const z = (i + 0.5) * (len / planks);
    kit.box(m.planks, width * (0.96 + random() * 0.04), 0.05, 0.22, { y: deckY + (random() - 0.5) * 0.02, z, ry: (random() - 0.5) * 0.02 }, { metres: 1.5, grain: true });
  }
  // Mooring posts with coiled rope, a lantern post, a broken crate.
  for (const z of [len - 0.3, len * 0.45]) {
    for (const s of [-1, 1]) {
      kit.cylinder(m.logs, 0.07, 0.08, 1.0, { x: s * (width / 2 - 0.12), y: deckY + 0.5, z }, { segments: 7 });
      kit.add(m.rope, new THREE.TorusGeometry(0.1, 0.03, 6, 12), { x: s * (width / 2 - 0.12), y: deckY + 0.7 + (s > 0 ? 0.12 : 0), z, rx: Math.PI / 2 });
    }
  }
  kit.cylinder(m.timber, 0.05, 0.06, 2.3, { x: -(width / 2 - 0.3), y: deckY + 1.15, z: len - 1.2 }, { segments: 7 });
  kit.box(m.timber, 0.5, 0.06, 0.06, { x: -(width / 2 - 0.3) + 0.2, y: deckY + 2.25, z: len - 1.2 });
  kit.frame({ x: -(width / 2 - 0.3) + 0.4, y: deckY + 2.0, z: len - 1.2 }, () => {
    kit.box(m.iron, 0.2, 0.03, 0.2, { y: -0.15 });
    kit.add(m.iron, new THREE.ConeGeometry(0.16, 0.14, 4), { y: 0.2, ry: Math.PI / 4 });
    kit.box(m.lamp, 0.15, 0.24, 0.15);
  });
  kit.frame({ x: width / 2 - 0.45, y: deckY, z: len * 0.3, ry: 0.4 }, () => {
    kit.box(m.planks, 0.5, 0.35, 0.5, { y: 0.175, rz: 0.08 }, { metres: 0.6 });
    kit.box(m.planks, 0.5, 0.04, 0.5, { y: 0.4, x: 0.15, rz: 0.5 }, { metres: 0.6 });
  });
  return deckY;
}

// --- Sites -----------------------------------------------------------------

export class Ruins {
  constructor({ terrain, materials, items, noise }) {
    const m = materials;
    // Monoliths are raw rock, not masonry.
    this.rockMat = noise ? createRockMaterial(noise) : m.ruin;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'ruins';
    this.colliders = [];
    this.ramps = []; // { cx, cz, rot, hx, hz, y0, y1 } local z from -hz (y0) to +hz (y1)
    this.decks = [];
    this.landmarks = [];
    this.lights = [];
    const kit = new Kit();
    const random = mulberry32(2024);
    const hAt = (x, z) => terrain.heightAt(x, z);

    for (const site of RUINS) {
      const ry = -site.face + Math.PI / 2; // local +z faces `face`
      const y = hAt(site.x, site.z);
      switch (site.kind) {
        case 'lakeside': this.lakeside(kit, m, items, site, y, ry, random); break;
        case 'crypt': this.crypt(kit, m, items, site, ry, random); break;
        case 'forest': this.stoneCircle(kit, m, site, y, ry, random); break;
        case 'hill': this.towerStump(kit, m, site, y, ry, random); break;
        case 'chapel': this.chapel(kit, m, site, y, ry, random); break;
        case 'crevasse': this.arcade(kit, m, items, site, random); break;
      }
    }
    this.islets(kit, m, random);

    for (const mesh of kit.build()) this.group.add(mesh);
  }

  // World-space oriented box collider from a site-local one.
  collide(site, ry, lx, lz, hx, hz) {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    this.colliders.push({ cx: site.x + lx * c + lz * s, cz: site.z - lx * s + lz * c, hx, hz, rot: ry });
  }

  // The drowned temple: a flagged platform on the shore with a broken
  // colonnade and two standing arches, a jetty out over the water.
  lakeside(kit, m, items, site, y, ry, random) {
    const W = 12;
    const D = 9;
    kit.frame({ x: site.x, y, z: site.z, ry }, () => {
      kit.box(m.ruinDark, W + 0.8, 0.5, D + 0.8, { y: 0.25 }, { metres: 2.4 });
      flagstones(kit, m.ruin, m.moss, W, D, random, { y: 0.5 });
      // Colonnade down both long sides, several columns broken.
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const z = -D / 2 + 1.2 + i * ((D - 2.4) / 3);
          column(kit, m.ruin, { h: 4.2, r: 0.34, broken: random() < 0.5, random });
          kit.frame({ x: sx * (W / 2 - 1.0), y: 0.66, z }, () => column(kit, m.ruin, { h: 4.2, r: 0.34, broken: random() < 0.5, random }));
        }
      }
      // Two arches at the back corner, meeting at a right angle.
      kit.frame({ x: -W / 2 + 2.6, y: 0.66, z: -D / 2 + 0.6 }, () => gothicArch(kit, m.ruin, { w: 2.4, t: 0.5, d: 0.8, pierH: 3.0, broken: 0.0 }));
      kit.frame({ x: -W / 2 + 0.4, y: 0.66, z: -D / 2 + 2.8, ry: Math.PI / 2 }, () => gothicArch(kit, m.ruin, { w: 2.4, t: 0.5, d: 0.8, pierH: 3.0, broken: 0.35 }));
      // A stretch of back wall and tumbled stone around the platform.
      kit.frame({ x: W / 2 - 3.0, y: 0.66, z: -D / 2 + 0.3 }, () => raggedWall(kit, m.ruin, m.moss, 5.5, 3.2, 0.7, random));
      fallenBlocks(kit, m.ruin, m.moss, 10, 9, random, { size: 0.9 });
      // Jetty from the front edge out over the lake.
      const deckY = Math.max(0.6, LAKE.level - y + 0.55);
      kit.frame({ x: 1.5, z: D / 2 }, () => jetty(kit, m, 16, 2.0, deckY, LAKE.level - y, random));
      // A rowing boat moored beside the jetty.
      const fm = createFurnitureMaterials(m, items);
      kit.frame({ x: -1.4, y: LAKE.level - y + 0.02, z: D / 2 + 11, ry: 0.25, rz: 0.03 }, () => rowboat(kit, m, items, fm));
      // A canoe drawn up on the shore beside the quay.
      kit.frame({ x: -5.5, y: 0.55, z: D / 2 + 2.5, ry: 0.9, rx: -0.12 }, () => canoe(kit, m, items));
      this.decks.push(this.worldRect(site, ry, 1.5, D / 2 + 8, 1.0, 8.2, y + deckY + 0.03));
      this.decks.push(this.worldRect(site, ry, 0, 0, W / 2 + 0.4, D / 2 + 0.4, y + 0.66));
    });
    this.collide(site, ry, -W / 2 + 2.6 - 1.5, -D / 2 + 0.6, 0.3, 0.4);
    this.collide(site, ry, -W / 2 + 2.6 + 1.5, -D / 2 + 0.6, 0.3, 0.4);
    this.collide(site, ry, W / 2 - 3.0, -D / 2 + 0.3, 2.75, 0.35);
    this.landmarks.push({ name: 'drowned temple', x: site.x, z: site.z, r: 10 });
  }

  worldRect(site, ry, lx, lz, hx, hz, y) {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    return { cx: site.x + lx * c + lz * s, cz: site.z - lx * s + lz * c, hx, hz, rot: ry, y };
  }

  // Arches and stumps on the islets.
  islets(kit, m, random) {
    ISLETS.forEach((isl, i) => {
      const y = this.terrain.heightAt(isl.x, isl.z);
      const ry = random() * TAU;
      kit.frame({ x: isl.x, y, z: isl.z, ry }, () => {
        flagstones(kit, m.ruin, m.moss, isl.r * 1.1, isl.r * 1.1, random, { y: -0.1, slab: 1.4 });
        gothicArch(kit, m.ruin, { w: 2.0 + i * 0.4, t: 0.45, d: 0.7, pierH: 2.6, broken: i === 1 ? 0.5 : 0 });
        kit.frame({ x: -isl.r * 0.45, z: isl.r * 0.35 }, () => column(kit, m.ruin, { h: 3.4, r: 0.3, broken: true, random }));
        kit.frame({ x: isl.r * 0.4, z: -isl.r * 0.3 }, () => column(kit, m.ruin, { h: 3.4, r: 0.3, broken: i === 0, random }));
        fallenBlocks(kit, m.ruin, m.moss, 5, isl.r * 0.8, random, { size: 0.7 });
      });
    });
  }

  // Half-buried crypt: a sunken vaulted chamber under a turf barrow, entered
  // by a stair down through a pointed doorway. A reliquary waits inside.
  crypt(kit, m, items, site, ry, random) {
    const pit = PITS.find((p) => p.depth > 0 && Math.hypot(p.x - site.x, p.z - site.z) < 1);
    const level = pit.level ?? this.terrain.baseHeight(pit.x, pit.z);
    const floor = level - pit.depth;
    const cw = 5.6; // chamber inner width
    const cl = 8.2; // chamber inner length
    const wall = 0.7;
    const wallTop = level + 0.8; // walls rise a little above the ground
    const wh = wallTop - floor;
    const zBack = -pit.hz + 0.4; // chamber from the back of the pit...
    const zFront = zBack + cl; // ...to the doorway wall
    const zc = (zBack + zFront) / 2;
    kit.frame({ x: site.x, y: floor, z: site.z, ry }, () => {
      flagstones(kit, m.ruinDark, m.moss, cw + 0.4, cl + 0.4, random, { y: -0.05, slab: 1.1 });
      // Side and back walls.
      for (const s of [-1, 1]) kit.box(m.ruin, wall, wh, cl + wall * 2, { x: s * (cw / 2 + wall / 2), y: wh / 2, z: zc }, { metres: 2 });
      kit.box(m.ruin, cw + wall * 2, wh, wall, { y: wh / 2, z: zBack - wall / 2 }, { metres: 2 });
      // Front wall with the pointed doorway, and a gable above it.
      const doorW = 1.5;
      for (const s of [-1, 1]) {
        const segW = (cw + wall * 2 - doorW) / 2;
        kit.box(m.ruin, segW, wh, wall, { x: s * (doorW / 2 + segW / 2), y: wh / 2, z: zFront + wall / 2 }, { metres: 2 });
      }
      kit.frame({ z: zFront + wall / 2 }, () => gothicArch(kit, m.ruin, { w: doorW, t: 0.4, d: wall + 0.1, pierH: 2.1, pierW: 0.3 }));
      kit.box(m.ruin, cw + wall * 2, 0.9, wall, { y: wh + 0.45, z: zFront + wall / 2 }, { metres: 2 });
      // Barrel vault over the rear two thirds; the front third has fallen in,
      // leaving three ribs. Turf and moss blanket the intact part.
      const R = cw / 2 + wall;
      const vaultLen = cl * 0.64;
      const vz = zBack + vaultLen / 2;
      const vault = new THREE.CylinderGeometry(R, R, vaultLen, 20, 1, true, 0, Math.PI);
      vault.rotateZ(Math.PI / 2);
      vault.rotateY(Math.PI / 2);
      const uv = vault.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2);
      kit.add(m.ruin, vault, { y: wh, z: vz });
      const inner = new THREE.CylinderGeometry(R - 0.35, R - 0.35, vaultLen, 20, 1, true, 0, Math.PI);
      inner.rotateZ(Math.PI / 2);
      inner.rotateY(Math.PI / 2);
      const uv2 = inner.attributes.uv;
      for (let i = 0; i < uv2.count; i++) uv2.setXY(i, uv2.getX(i) * 4, uv2.getY(i) * 2);
      kit.add(m.ruinDark, inner, { y: wh, z: vz });
      const turf = new THREE.CylinderGeometry(R + 0.3, R + 0.3, vaultLen + 0.6, 20, 1, true, 0.15, Math.PI - 0.3);
      turf.rotateZ(Math.PI / 2);
      turf.rotateY(Math.PI / 2);
      kit.add(m.turf, turf, { y: wh - 0.1, z: vz });
      for (let i = 0; i < 3; i++) {
        const z = zBack + vaultLen + 0.5 + i * ((cl - vaultLen - 1.0) / 2);
        const rib = new THREE.TorusGeometry(R - 0.15, 0.2, 6, 20, Math.PI);
        kit.add(m.ruin, rib, { y: wh, z });
      }
      // Stair down from the ground at the pit's front end to the doorway.
      const zStairTop = pit.hz - 0.4;
      const zStairBot = zFront + wall + 0.3;
      const run = zStairTop - zStairBot;
      const steps = Math.max(5, Math.round(pit.depth / 0.3));
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const yStep = (pit.depth * (i + 1)) / steps;
        kit.box(m.ruin, doorW + 1.0, yStep, run / steps + 0.02, { y: yStep / 2, z: zStairBot + t * run }, { metres: 1.5 });
      }
      // Retaining walls either side of the stair.
      for (const s of [-1, 1]) kit.box(m.ruinDark, 0.5, pit.depth + 0.4, run + 0.6, { x: s * (doorW / 2 + 0.5 + 0.25), y: (pit.depth + 0.4) / 2, z: (zStairTop + zStairBot) / 2 }, { metres: 2 });
      // Inside: a plinth with the reliquary, rubble, torches on the walls.
      kit.frame({ z: zBack + 1.4 }, () => {
        kit.box(m.ruin, 1.6, 0.4, 1.0, { y: 0.2 }, { metres: 1.5 });
        kit.frame({ y: 0.4 }, () => CHESTS[2](kit, m, items));
      });
      fallenBlocks(kit, m.ruinDark, m.moss, 6, 2.2, random, { size: 0.6 });
      for (const s of [-1, 1]) {
        kit.frame({ x: s * (cw / 2 - 0.15), y: 1.7, z: zc }, () => {
          kit.box(m.iron, 0.06, 0.5, 0.06, { rx: s * 0.25 });
          kit.box(m.lamp, 0.16, 0.22, 0.16, { y: 0.32 });
        });
      }
    });
    // Colliders: the walls (site-local), and the stair as a walkable ramp.
    this.collide(site, ry, -(cw / 2 + wall / 2), zc, wall / 2, cl / 2 + wall);
    this.collide(site, ry, cw / 2 + wall / 2, zc, wall / 2, cl / 2 + wall);
    this.collide(site, ry, 0, zBack - wall / 2, cw / 2 + wall, wall / 2);
    const doorW = 1.5;
    const segW = (cw + wall * 2 - doorW) / 2;
    for (const s of [-1, 1]) this.collide(site, ry, s * (doorW / 2 + segW / 2), zFront + wall / 2, segW / 2, wall / 2);
    this.collide(site, ry, 0, zBack + 1.4, 0.8, 0.5);
    const zStairTop = pit.hz - 0.4;
    const zStairBot = zFront + wall + 0.3;
    for (const s of [-1, 1]) this.collide(site, ry, s * (doorW / 2 + 0.75), (zStairTop + zStairBot) / 2, 0.25, (zStairTop - zStairBot) / 2 + 0.3);
    this.ramps.push({ ...this.worldRect(site, ry, 0, (zStairTop + zStairBot) / 2, doorW / 2 + 0.5, (zStairTop - zStairBot) / 2, 0), y0: floor, y1: level });
    this.lights.push({ x: site.x, y: floor + 2.2, z: site.z, color: 0xffa050, intensity: 6, distance: 9 });
    this.landmarks.push({ name: 'barrow crypt', x: site.x, z: site.z, r: 8 });
  }

  // A ring of standing stones with fallen lintels, deep in the wood.
  stoneCircle(kit, m, site, y, ry, random) {
    const n = 7;
    const R = 6.5;
    kit.frame({ x: site.x, z: site.z, ry }, () => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const x = Math.cos(a) * R;
        const z = Math.sin(a) * R;
        const gy = this.terrain.heightAt(site.x + x * Math.cos(ry) + z * Math.sin(ry), site.z - x * Math.sin(ry) + z * Math.cos(ry)) - y;
        const h = 2.4 + random() * 1.4;
        const fallen = i === 2;
        kit.frame({ x, y: gy, z, ry: -a + (random() - 0.5) * 0.3 }, () => {
          if (fallen) {
            roughBlock(kit, this.rockMat, 1.1, 0.7, h, { y: 0.25, z: 1.2, rz: 0.1 }, random, 0.2);
            kit.box(m.moss, 0.9, 0.05, h * 0.8, { y: 0.62, z: 1.2 });
          } else {
            roughBlock(kit, this.rockMat, 1.1, h, 0.7, { y: h / 2 - 0.3, rx: (random() - 0.5) * 0.12, rz: (random() - 0.5) * 0.1 }, random, 0.2);
            kit.box(m.moss, 0.9, 0.06, 0.5, { y: h - 0.3 });
          }
        });
        if (!fallen) this.collide(site, ry, x, z, 0.6, 0.4);
      }
      // Lintels still spanning two pairs.
      for (const i of [0, 4]) {
        const a0 = (i / n) * TAU;
        const a1 = ((i + 1) / n) * TAU;
        const x = (Math.cos(a0) + Math.cos(a1)) * 0.5 * R;
        const z = (Math.sin(a0) + Math.sin(a1)) * 0.5 * R;
        const len = 2 * R * Math.sin(Math.PI / n) + 0.6;
        roughBlock(kit, this.rockMat, len, 0.55, 0.85, { x, y: 2.55, z, ry: -(a0 + a1) / 2 + Math.PI / 2 }, random, 0.12);
      }
      // Altar stone in the middle, moss and tumbled blocks.
      roughBlock(kit, this.rockMat, 2.0, 0.8, 1.1, { y: 0.4, ry: 0.3 }, random, 0.12);
      kit.box(m.moss, 1.6, 0.05, 0.8, { y: 0.82, ry: 0.3 });
      fallenBlocks(kit, m.ruinDark, m.moss, 6, 9, random, { size: 0.6 });
    });
    this.collide(site, ry, 0, 0, 1.0, 0.55);
    this.landmarks.push({ name: 'standing stones', x: site.x, z: site.z, r: 9 });
  }

  // A broken round tower on a hilltop, with the stump of a wall beside it.
  towerStump(kit, m, site, y, ry, random) {
    const R = 3.4;
    kit.frame({ x: site.x, y, z: site.z, ry }, () => {
      // Tower wall as a ring of ragged slices, higher at the back.
      const slices = 22;
      for (let i = 0; i < slices; i++) {
        const a = (i / slices) * TAU;
        const open = Math.abs(a - Math.PI / 2) < 0.5; // doorway gap facing +z
        if (open) continue;
        const h = 2.5 + 5.5 * (0.5 + 0.5 * Math.cos(a - Math.PI * 1.5)) * (0.6 + random() * 0.4);
        kit.box(m.ruinDark, 1.05, h, 0.9, { x: Math.cos(a) * R, y: h / 2 - 0.4, z: Math.sin(a) * R, ry: -a }, { metres: 2.2 });
        if (random() < 0.5) kit.box(m.moss, 0.8, 0.05, 0.6, { x: Math.cos(a) * R, y: h - 0.4, z: Math.sin(a) * R, ry: -a });
      }
      // Lancet window in the tallest part.
      kit.frame({ x: 0, y: 3.4, z: -R, ry: Math.PI }, () => gothicArch(kit, m.ruin, { w: 0.5, t: 0.2, d: 1.0, pierH: 1.0, pierW: 0.2 }));
      flagstones(kit, m.ruinDark, m.moss, R * 1.7, R * 1.7, random, { y: -0.1, slab: 1.1 });
      kit.frame({ x: R + 3.8, z: 0.6, ry: 0.2 }, () => raggedWall(kit, m.ruinDark, m.moss, 6, 2.6, 0.8, random));
      fallenBlocks(kit, m.ruinDark, m.moss, 9, 8, random, { size: 0.8 });
    });
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU;
      if (Math.abs(a - Math.PI / 2) < 0.5) continue;
      this.collide(site, ry, Math.cos(a) * R, Math.sin(a) * R, 0.55, 0.45);
    }
    this.collide(site, ry, R + 3.8, 0.6, 3, 0.4);
    this.landmarks.push({ name: 'old watchtower', x: site.x, z: site.z, r: 9 });
  }

  // A roofless chapel below the castle: two long walls pierced by lancet
  // windows, a gable with the great window, the roof fallen inside.
  chapel(kit, m, site, y, ry, random) {
    const L = 11;
    const W = 6;
    kit.frame({ x: site.x, y, z: site.z, ry }, () => {
      flagstones(kit, m.ruin, m.moss, W, L, random, { y: 0, slab: 1.3 });
      for (const s of [-1, 1]) {
        // Wall in bays, a lancet window in each standing bay.
        for (let b = 0; b < 4; b++) {
          const z = -L / 2 + (b + 0.5) * (L / 4);
          const h = 4.2 * (b === 1 && s === 1 ? 0.35 : 0.7 + random() * 0.3);
          kit.frame({ x: s * (W / 2 + 0.35), z }, () => {
            raggedWall(kit, m.ruin, m.moss, L / 4, h, 0.7, random, { low: 0.75 });
            if (h > 3.2) {
              kit.frame({ y: 1.1, ry: Math.PI / 2 }, () => gothicArch(kit, m.ruinDark, { w: 0.55, t: 0.16, d: 0.8, pierH: 1.3, pierW: 0.16 }));
            }
          });
        }
      }
      // Gable end with the great east window.
      kit.frame({ z: -L / 2 - 0.35 }, () => {
        raggedWall(kit, m.ruin, m.moss, W + 1.4, 5.6, 0.7, random, { low: 0.8 });
        kit.frame({ y: 0.5 }, () => gothicArch(kit, m.ruinDark, { w: 1.4, t: 0.3, d: 0.8, pierH: 2.4, pierW: 0.3 }));
      });
      // Doorway arch at the west end.
      kit.frame({ z: L / 2 + 0.35 }, () => gothicArch(kit, m.ruin, { w: 1.6, t: 0.4, d: 0.9, pierH: 2.4, pierW: 0.5 }));
      fallenBlocks(kit, m.ruin, m.moss, 12, 5, random, { size: 0.8 });
      // An altar slab.
      kit.box(m.ruin, 2.0, 0.9, 0.9, { y: 0.45, z: -L / 2 + 1.4 }, { metres: 1.5 });
    });
    for (const s of [-1, 1]) this.collide(site, ry, s * (W / 2 + 0.35), 0, 0.35, L / 2);
    this.collide(site, ry, 0, -L / 2 - 0.35, W / 2 + 0.7, 0.35);
    this.collide(site, ry, 0, -L / 2 + 1.4, 1.0, 0.45);
    this.landmarks.push({ name: 'ruined chapel', x: site.x, z: site.z, r: 9 });
  }

  // An old arcade along the crevasse floor: a row of arches, most broken, with
  // columns and a reliquary among the rubble.
  arcade(kit, m, items, site, random) {
    const q = CREVASSE.path.nearest(site.x, site.z, 30);
    const along = q ? Math.atan2(q.tx, q.tz) : 0; // direction of the path at the site
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = (i - (n - 1) / 2) * 4.2;
      const x = site.x + Math.sin(along) * t;
      const z = site.z + Math.cos(along) * t;
      const y = this.terrain.heightAt(x, z);
      const broken = i === 1 ? 0.6 : i === 3 ? 0.3 : 0;
      kit.frame({ x, y, z, ry: along }, () => {
        gothicArch(kit, m.ruinDark, { w: 2.6, t: 0.5, d: 1.0, pierH: 3.4 + random() * 0.6, pierW: 0.7, broken });
      });
      const c = Math.cos(along);
      const s = Math.sin(along);
      for (const sx of [-1, 1]) {
        const lx = sx * (1.3 + 0.35);
        this.colliders.push({ cx: x + lx * c, cz: z - lx * s, hx: 0.35, hz: 0.5, rot: along });
      }
    }
    const y0 = this.terrain.heightAt(site.x, site.z);
    kit.frame({ x: site.x, y: y0, z: site.z, ry: along }, () => {
      kit.frame({ x: 3.2, z: 1.0 }, () => column(kit, m.ruinDark, { h: 3.8, r: 0.36, broken: true, random }));
      kit.frame({ x: -3.0, z: -1.6 }, () => column(kit, m.ruinDark, { h: 3.8, r: 0.36, broken: false, random }));
      fallenBlocks(kit, m.ruinDark, m.moss, 14, 7, random, { size: 0.9 });
      kit.frame({ x: 2.4, z: -2.6, ry: 0.7 }, () => {
        kit.box(m.ruin, 1.4, 0.3, 0.9, { y: 0.15 }, { metres: 1.5 });
        kit.frame({ y: 0.3 }, () => CHESTS[2](kit, m, items));
      });
    });
    this.landmarks.push({ name: 'sunken arcade', x: site.x, z: site.z, r: 10 });
  }

  // Walkable surfaces: decks (flat) and ramps (linear along local z).
  surfaceAt(x, z) {
    let best = null;
    for (const d of this.decks) {
      const c = Math.cos(d.rot);
      const s = Math.sin(d.rot);
      const dx = x - d.cx;
      const dz = z - d.cz;
      const lx = c * dx - s * dz;
      const lz = s * dx + c * dz;
      if (Math.abs(lx) <= d.hx && Math.abs(lz) <= d.hz && (best === null || d.y > best)) best = d.y;
    }
    for (const r of this.ramps) {
      const c = Math.cos(r.rot);
      const s = Math.sin(r.rot);
      const dx = x - r.cx;
      const dz = z - r.cz;
      const lx = c * dx - s * dz;
      const lz = s * dx + c * dz;
      if (Math.abs(lx) <= r.hx && Math.abs(lz) <= r.hz) {
        const t = (lz + r.hz) / (2 * r.hz);
        const y = r.y0 + (r.y1 - r.y0) * t + 0.05;
        if (best === null || y > best) best = y;
      }
    }
    return best;
  }
}
