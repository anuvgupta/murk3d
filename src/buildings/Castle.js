import * as THREE from 'three';
import { Kit } from './Kit.js';
import { CASTLE, ROADS } from '../world/plan.js';
import { mulberry32 } from '../util/noise.js';

// A window pane whose centre rides along in `aux`, so the glass shader can
// light each window on its own at night.
function pane(geometry) {
  const n = geometry.attributes.position.count;
  const aux = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) aux[i * 4 + 3] = 1;
  geometry.setAttribute('aux', new THREE.Float32BufferAttribute(aux, 4));
  return geometry;
}

// A hanging iron lantern, lit at night (shares the village lamp glass).
function lantern(kit, m, p) {
  kit.frame({ x: p.x, y: p.y, z: p.z }, () => {
    kit.box(m.iron, 0.04, 0.04, 0.32, { y: 0.25, z: -0.15 });
    kit.box(m.iron, 0.22, 0.03, 0.22, { y: -0.15 });
    kit.add(m.iron, new THREE.ConeGeometry(0.17, 0.14, 4), { y: 0.2, ry: Math.PI / 4 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(m.iron, 0.02, 0.28, 0.02, { x: sx * 0.1, z: sz * 0.1 });
    kit.box(m.lamp, 0.17, 0.25, 0.17);
  });
}

// The white castle on its plateau.
//
// Layout, from the bridge inward: the bridge lands at a gatehouse in the
// outer curtain wall; a cobbled way climbs through three terraced wards,
// each ring wall higher than the last and offset so the way switches back
// through a gate in each, with stairs between terraces; the inner ward
// carries the keep, a tall hall with a great tower and a ring of lesser
// spires. Everything is pale ashlar with slate-blue conical roofs and gilt
// finials, the way Minas Tirith reads from across the Pelennor.
//
// The plateau top is reshaped by Terrain.castleHeight() into the terraces,
// so the walls stand on level ground and the stairs land where they should.

const deg = THREE.MathUtils.degToRad;

// Terrace rings: radius at which each ward's floor begins (from the plateau
// centre) and its floor height above the plateau base. Gates alternate side.
export const TERRACES = [
  { r: 36, h: 0.0, wall: 9, gateAngle: 0 }, // outer ward floor (whole plateau top)
  { r: 26, h: 7.0, wall: 8, gateAngle: 1.9 },
  { r: 17, h: 14.0, wall: 7, gateAngle: -1.6 },
  { r: 9, h: 21.0, wall: 0, gateAngle: 0.9 }, // keep platform
];

export class Castle {
  constructor({ terrain, materials, castle }) {
    this.terrain = terrain;
    this.cfg = castle;
    this.plateau = castle.plateau;
    // The citadel is built of dark mountain stone instead of white limestone.
    this.m = castle.dark
      ? { ...materials, white: materials.ashlar, whiteDark: materials.stone, cobbleWhite: materials.cobble, slateBlue: materials.slate, gilt: materials.iron }
      : materials;
    this.group = new THREE.Group();
    this.group.name = 'castle';
    this.colliders = [];
    this.decks = [];
    this.lamps = [];
    this.rng = mulberry32(2024);

    const kit = new Kit();
    this.baseY = castle.plateauTop;
    kit.frame({ x: this.plateau.x, y: this.baseY, z: this.plateau.z }, () => {
      this.buildWards(kit);
      this.buildKeep(kit);
      this.buildBridge(kit);
    });
    for (const mesh of kit.build()) this.group.add(mesh);
  }

  // -- Pieces ---------------------------------------------------------------

  // A straight run of curtain wall between two local points, with a
  // crenellated parapet and a walkway. Runs overlap at the joints, so
  // neighbours are given different `lift`s to keep their tops out of one plane.
  wallRun(kit, m, ax, az, bx, bz, baseY, height, thick = 1.6, lift = 0) {
    const len = Math.hypot(bx - ax, bz - az);
    const ry = Math.atan2(bx - ax, bz - az);
    kit.frame({ x: (ax + bx) / 2, y: baseY + lift, z: (az + bz) / 2, ry }, () => {
      kit.box(m.white, thick, height, len + 0.2, { y: height / 2 }, { metres: 3.6 });
      // Foundation grows out of the rock below the ward floor.
      kit.box(m.whiteDark, thick + 0.6, 9, len + 0.3, { y: -4.5 }, { metres: 3.6 });
      // Plinth batter and a string course.
      kit.box(m.whiteDark, thick + 0.5, 1.2, len + 0.3, { y: 0.6 }, { metres: 3.6 });
      kit.box(m.whiteDark, thick + 0.2, 0.25, len + 0.25, { y: height - 1.6 }, { metres: 3 });
      // Parapet with merlons.
      kit.box(m.white, 0.4, 1.3, len + 0.2, { x: thick / 2 - 0.2, y: height + 0.65 }, { metres: 3 });
      kit.box(m.white, 0.4, 1.3, len + 0.2, { x: -thick / 2 + 0.2, y: height + 0.65 }, { metres: 3 });
      const n = Math.max(1, Math.floor(len / 2.2));
      for (let i = 0; i < n; i++) {
        const z = -len / 2 + (i + 0.5) * (len / n);
        kit.box(m.white, 0.42, 0.7, 1.0, { x: thick / 2 - 0.2, y: height + 1.65, z }, { metres: 3 });
      }
      // The ward side of the wall is lived in: lanterns on brackets every few
      // metres and the lord's banners between them, so the corridors between
      // the rings are not blank stone.
      const bays = Math.max(1, Math.floor(len / 7));
      for (let i = 0; i < bays; i++) {
        const z = -len / 2 + (i + 0.5) * (len / bays);
        kit.box(m.iron, 0.5, 0.05, 0.05, { x: -thick / 2 - 0.25, y: 3.3, z });
        lantern(kit, m, { x: -thick / 2 - 0.45, y: 3.0, z });
        if (i + 1 < bays && height > 6) {
          const zb = z + len / bays / 2;
          kit.box(m.iron, 0.05, 0.05, 1.1, { x: -thick / 2 - 0.3, y: Math.min(height - 1.0, 7.0), z: zb });
          kit.box(m.banner, 0.03, 2.2, 0.9, { x: -thick / 2 - 0.32, y: Math.min(height - 1.0, 7.0) - 1.15, z: zb });
        }
      }
    });
    this.colliders.push({ cx: (ax + bx) / 2, cz: (az + bz) / 2, hx: thick / 2, hz: len / 2, rot: ry, local: true });
  }

  // A round tower with a conical slate roof and a gilt finial.
  tower(kit, m, x, z, baseY, height, radius, { spire = true, windows = true } = {}) {
    kit.frame({ x, y: baseY, z }, () => {
      kit.cylinder(m.white, radius, radius * 1.08, height, { y: height / 2 }, { segments: 16, metres: 3.6 });
      kit.cylinder(m.whiteDark, radius * 1.1, radius * 1.25, 9, { y: -4.5 }, { segments: 16, metres: 3.6 });
      kit.cylinder(m.whiteDark, radius + 0.25, radius + 0.25, 0.3, { y: height - 1.2 }, { segments: 16, metres: 3 });
      // Corbelled parapet.
      kit.cylinder(m.white, radius + 0.45, radius + 0.1, 0.9, { y: height + 0.45 }, { segments: 16, metres: 3 });
      kit.cylinder(m.white, radius + 0.45, radius + 0.45, 1.2, { y: height + 1.5 }, { segments: 16, metres: 2, open: true });
      const merlons = Math.max(6, Math.round(radius * 3));
      for (let i = 0; i < merlons; i++) {
        const a = (i / merlons) * Math.PI * 2;
        kit.box(m.white, 0.7, 0.6, 0.4, { x: Math.cos(a) * (radius + 0.25), y: height + 2.4, z: Math.sin(a) * (radius + 0.25), ry: -a }, { metres: 3 });
      }
      if (windows) {
        for (let k = 1; k < Math.floor(height / 5); k++) {
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.4;
            kit.frame({ x: Math.cos(a) * radius, y: k * 5, z: Math.sin(a) * radius, ry: -a + Math.PI / 2 }, () => {
              kit.add(m.glassBlue, pane(new THREE.BoxGeometry(0.5, 1.4, 0.1)), { z: 0.02 });
              kit.box(m.whiteDark, 0.9, 0.2, 0.3, { y: 0.85, z: 0.1 }, { metres: 3 });
              kit.box(m.whiteDark, 0.9, 0.15, 0.3, { y: -0.8, z: 0.1 }, { metres: 3 });
            });
          }
        }
      }
      if (spire) {
        const spireH = radius * 3.2;
        const cone = new THREE.ConeGeometry(radius + 0.6, spireH, 16, 1);
        const uv = cone.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 3);
        kit.add(m.slateBlue, cone, { y: height + 2.1 + spireH / 2 });
        kit.add(m.gilt, new THREE.SphereGeometry(0.28, 10, 8), { y: height + 2.1 + spireH + 0.2 });
        kit.box(m.gilt, 0.05, 1.3, 0.05, { y: height + 2.1 + spireH + 0.9 });
      }
    });
    this.colliders.push({ cx: x, cz: z, hx: radius + 0.3, hz: radius + 0.3, rot: 0, local: true });
  }

  // An arched gateway through a wall: two flanking towers and a gate arch.
  gatehouse(kit, m, x, z, angle, baseY, height) {
    const ry = -angle + Math.PI / 2; // local +z points outward along `angle`
    const half = 4.2;
    for (const s of [-1, 1]) {
      const tx = x + Math.cos(angle + Math.PI / 2) * s * half;
      const tz = z + Math.sin(angle + Math.PI / 2) * s * half;
      this.tower(kit, m, tx, tz, baseY, height + 3, 2.4, { spire: true, windows: false });
    }
    kit.frame({ x, y: baseY, z, ry }, () => {
      // Arch head over the opening.
      kit.box(m.white, half * 2 - 4.4, height - 4.5, 3.2, { y: 4.5 + (height - 4.5) / 2 }, { metres: 3.6 });
      const arch = new THREE.Shape();
      arch.absarc(0, 0, 2.6, Math.PI, 0, true);
      arch.lineTo(2.2, 0);
      arch.absarc(0, 0, 2.2, 0, Math.PI, false);
      arch.closePath();
      const ag = new THREE.ExtrudeGeometry(arch, { depth: 3.4, bevelEnabled: false, curveSegments: 12 });
      ag.translate(0, 0, -1.7);
      kit.add(m.whiteDark, ag, { y: 2.3 });
      // Portcullis, raised.
      for (let i = -3; i <= 3; i++) kit.box(m.iron, 0.08, 3.2, 0.08, { x: i * 0.55, y: 4.0, z: 0.6 });
      for (let i = 0; i < 4; i++) kit.box(m.iron, 3.6, 0.08, 0.07, { y: 2.6 + i * 0.9, z: 0.6 });
      // Machicolations and parapet over the gate.
      kit.box(m.white, half * 2 - 4.0, 1.3, 3.6, { y: height + 0.65 }, { metres: 3 });
      for (let i = -2; i <= 2; i++) kit.box(m.white, 0.9, 0.6, 0.4, { x: i * 1.3, y: height + 1.6, z: 1.6 }, { metres: 3 });
      // Banners either side of the arch, lanterns below them and in the passage.
      for (const s of [-1, 1]) {
        kit.box(m.iron, 0.05, 2.6, 0.05, { x: s * 3.0, y: 7.2, z: 1.7 });
        kit.box(m.banner, 0.9, 2.2, 0.03, { x: s * 3.0, y: 6.2, z: 1.75 });
        kit.box(m.iron, 0.05, 0.05, 0.5, { x: s * 3.0, y: 4.1, z: 1.85 });
        lantern(kit, m, { x: s * 3.0, y: 3.8, z: 2.05 });
        kit.box(m.iron, 0.4, 0.05, 0.05, { x: s * 2.0, y: 3.3, z: 0 });
        lantern(kit, m, { x: s * 1.85, y: 3.0, z: 0 });
      }
    });
    // The lanterns on the outer face light the approach (plateau-local positions).
    for (const s of [-1, 1]) {
      const lx = s * 3.0;
      const lz = 2.3;
      this.lamps.push(new THREE.Vector3(x + lx * Math.cos(ry) + lz * Math.sin(ry), baseY + 3.9, z - lx * Math.sin(ry) + lz * Math.cos(ry)));
    }
    // The opening is walkable: no collider across it, but the piers either side.
    for (const s of [-1, 1]) {
      const px = x + Math.cos(angle + Math.PI / 2) * s * 2.9;
      const pz = z + Math.sin(angle + Math.PI / 2) * s * 2.9;
      this.colliders.push({ cx: px, cz: pz, hx: 0.7, hz: 1.7, rot: ry, local: true });
    }
  }

  // A flight of stairs climbing `rise` over `run`, `width` wide, in a local
  // frame whose +z is uphill. Returns nothing; registers a sloped deck.
  stairs(kit, m, x, z, angle, baseY, rise, run, width) {
    const steps = Math.max(2, Math.round(rise / 0.28));
    const ry = -angle + Math.PI / 2;
    kit.frame({ x, y: baseY, z, ry }, () => {
      for (let i = 0; i < steps; i++) {
        const t = (i + 1) / steps;
        kit.box(m.whiteDark, width, rise * t, run / steps + 0.05, { y: (rise * t) / 2, z: (i + 0.5) * (run / steps) }, { metres: 3 });
      }
      // Low parapets either side.
      for (const s of [-1, 1]) {
        kit.box(m.white, 0.4, 1.0, run, { x: s * (width / 2 + 0.2), y: rise / 2 + 0.5, z: run / 2, rx: -Math.atan2(rise, run) }, { metres: 3 });
      }
    });
    this.decks.push({ kind: 'ramp', x, z, angle, baseY, rise, run, width, local: true });
  }

  buildWards(kit) {
    const m = this.m;
    const p = this.plateau;
    // Outer curtain follows the plateau rim as a polygon.
    const sides = 14;
    const outerR = TERRACES[0].r - 2.5;
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      // Leave the gate side open for the gatehouse.
      let dGate = Math.abs(mid - this.cfg.gateDir);
      if (dGate > Math.PI) dGate = Math.PI * 2 - dGate;
      if (dGate < 0.25) continue;
      this.wallRun(kit, m, Math.cos(a0) * outerR, Math.sin(a0) * outerR, Math.cos(a1) * outerR, Math.sin(a1) * outerR, 0, TERRACES[0].wall, 1.6, (i % 2) * 0.012);
      if (i % 2 === 0) this.tower(kit, m, Math.cos(a0) * outerR, Math.sin(a0) * outerR, 0, TERRACES[0].wall + 4, 2.6);
    }
    this.gatehouse(kit, m, Math.cos(this.cfg.gateDir) * outerR, Math.sin(this.cfg.gateDir) * outerR, this.cfg.gateDir, 0, TERRACES[0].wall + 2);

    // Inner rings: each a polygonal wall at its terrace edge, with a gate
    // and a stair up to it from the ward below.
    for (let k = 1; k < TERRACES.length - 1; k++) {
      const T = TERRACES[k];
      const prev = TERRACES[k - 1];
      const ringR = T.r + 1.2;
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2 + 0.3 * k;
        const a1 = ((i + 1) / n) * Math.PI * 2 + 0.3 * k;
        const mid = (a0 + a1) / 2;
        let dGate = Math.abs(((mid - T.gateAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (dGate < 0.33) continue;
        // Walls rise from the lower ward's floor so the terrace face is clad.
        this.wallRun(kit, m, Math.cos(a0) * ringR, Math.sin(a0) * ringR, Math.cos(a1) * ringR, Math.sin(a1) * ringR, prev.h, T.h - prev.h + T.wall, 1.4, (i % 2) * 0.012);
        if (i % 3 === 0) this.tower(kit, m, Math.cos(a0) * ringR, Math.sin(a0) * ringR, prev.h, T.h - prev.h + T.wall + 3.5, 2.0);
      }
      // Gate in this ring, at the terrace floor level, and stairs up to it.
      const gx = Math.cos(T.gateAngle) * ringR;
      const gz = Math.sin(T.gateAngle) * ringR;
      this.gatehouse(kit, m, gx, gz, T.gateAngle, T.h - 2.0, T.wall + 2);
      const rise = T.h - prev.h - 2.0;
      const run = rise * 1.9;
      const sx = Math.cos(T.gateAngle) * (ringR + 2.2 + run / 2);
      const sz = Math.sin(T.gateAngle) * (ringR + 2.2 + run / 2);
      // Stairs face inward (uphill toward the gate).
      this.stairs(kit, m, Math.cos(T.gateAngle) * (ringR + 2.2 + run), Math.sin(T.gateAngle) * (ringR + 2.2 + run), T.gateAngle + Math.PI, prev.h, rise, run, 5.0);

    }
    // Buildings in the wards: a row of lean-to houses against the walls.
    this.wardBuildings(kit, m);
  }

  wardBuildings(kit, m) {
    const rng = this.rng;
    for (let k = 0; k < TERRACES.length - 1; k++) {
      const T = TERRACES[k];
      const next = TERRACES[k + 1];
      const r = (T.r + next.r) / 2 + 1.0;
      const n = k === 0 ? 9 : 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.5 + k;
        // Keep the gate approaches and the stair clear.
        let dGate = Math.abs(((a - next.gateAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        let dGate0 = Math.abs(((a - (k === 0 ? this.cfg.gateDir : T.gateAngle) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (dGate < 0.7 || dGate0 < 0.5) continue;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const w = 4 + rng() * 2.5;
        const d = 3.2 + rng() * 1.2;
        const h = 3.2 + rng() * 1.5;
        kit.frame({ x, y: T.h, z, ry: -a + Math.PI / 2 }, () => {
          kit.box(m.white, w, h, d, { y: h / 2 }, { metres: 3.6 });
          // Door and a window or two facing the way.
          kit.box(m.planks, 1.0, 2.0, 0.1, { y: 1.0, z: -d / 2 - 0.04 }, { metres: 1 });
          kit.add(m.glassBlue, pane(new THREE.BoxGeometry(0.7, 0.9, 0.08)), { x: w * 0.28, y: 1.9, z: -d / 2 - 0.04 });
          // Gable roof in slate.
          for (const s of [-1, 1]) kit.box(m.slateBlue, w + 0.6, 0.16, d * 0.62, { y: h + d * 0.26, z: s * d * 0.25, rx: -s * deg(42) }, { metres: 3 });
          kit.box(m.whiteDark, 0.6, h + 1.2, 0.6, { x: w / 2 - 0.5, y: (h + 1.2) / 2, z: d / 2 - 0.5 }, { metres: 3 });
        });
        this.colliders.push({ cx: x, cz: z, hx: w / 2, hz: d / 2, rot: -a + Math.PI / 2, local: true });
      }
    }
  }

  buildKeep(kit) {
    const m = this.m;
    const T = TERRACES[TERRACES.length - 1];
    const y = T.h;
    // Great hall: a tall rectangular block with a steep roof and a rose window.
    kit.frame({ y }, () => {
      kit.box(m.white, 14, 12, 9, { y: 6 }, { metres: 3.6 });
      kit.box(m.whiteDark, 14.6, 1.0, 9.6, { y: 0.5 }, { metres: 3.6 });
      kit.box(m.whiteDark, 14.3, 0.3, 9.3, { y: 7.6 }, { metres: 3 });
      // Buttresses.
      for (const sx of [-5.5, -2.75, 0, 2.75, 5.5]) for (const sz of [-1, 1]) kit.box(m.whiteDark, 0.8, 9, 0.9, { x: sx, y: 4.5, z: sz * 4.9 }, { metres: 3 });
      // Tall lancet windows along the sides.
      for (const sx of [-4.1, -1.4, 1.4, 4.1]) for (const sz of [-1, 1]) {
        kit.add(m.glassBlue, pane(new THREE.BoxGeometry(0.9, 4.0, 0.1)), { x: sx, y: 6.5, z: sz * 4.52 });
        kit.box(m.whiteDark, 1.3, 0.3, 0.3, { x: sx, y: 8.7, z: sz * 4.6 }, { metres: 3 });
      }
      // Rose window on the gable facing the gate.
      const gateFace = this.cfg.gateDir;
      kit.frame({ ry: -gateFace + Math.PI / 2 }, () => {
        kit.cylinder(m.whiteDark, 2.2, 2.2, 0.5, { y: 9.6, z: 0, rx: Math.PI / 2 }, { segments: 24 });
        kit.add(m.glassBlue, pane(new THREE.CylinderGeometry(1.8, 1.8, 0.56, 24)), { y: 9.6, rx: Math.PI / 2 });
        for (let i = 0; i < 8; i++) kit.box(m.whiteDark, 0.14, 3.5, 0.6, { y: 9.6, rz: (i / 8) * Math.PI });
      });
      // Roof.
      for (const s of [-1, 1]) kit.box(m.slateBlue, 15, 0.2, 6.2, { y: 12 + 2.6, z: s * 2.3, rx: -s * deg(50) }, { metres: 3 });
      kit.box(m.gilt, 15.2, 0.3, 0.3, { y: 16.9, rx: Math.PI / 4 });
    });
    // The great tower rises from the hall's inner end.
    this.tower(kit, m, -4.0, 0, y, 30, 3.6);
    // Lesser spires at the corners of the keep platform.
    for (const [sx, sz] of [[6.5, 3.8], [6.5, -3.8], [-6.5, 3.8], [-6.5, -3.8]]) this.tower(kit, m, sx, sz, y, 16 + Math.abs(sx) * 0.3, 1.7);
    this.colliders.push({ cx: 0, cz: 0, hx: 7.2, hz: 4.7, rot: 0, local: true });
    for (const s of [-1, 1]) {
      const a = this.cfg.gateDir + Math.PI / 2;
      const lp = new THREE.Vector3(Math.cos(this.cfg.gateDir) * 8.5 + Math.cos(a) * s * 2.4, y + 2.6, Math.sin(this.cfg.gateDir) * 8.5 + Math.sin(a) * s * 2.4);
      this.lamps.push(lp);
      lantern(kit, m, lp);
    }
  }

  // The bridge from the knoll to the gate: a long arched span of pale stone
  // with a parapet, rising slightly toward the gate.
  buildBridge(kit) {
    const m = this.m;
    const p = this.plateau;
    const from = { x: this.cfg.bridgeFrom.x - p.x, z: this.cfg.bridgeFrom.z - p.z };
    const to = { x: this.cfg.bridgeTo.x - p.x, z: this.cfg.bridgeTo.z - p.z };
    const yFrom = this.cfg.landing - this.baseY + 0.1;
    const yTo = 0.1;
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    const ry = Math.atan2(to.x - from.x, to.z - from.z);
    const width = 5.2;
    this.bridge = { from, to, yFrom, yTo, len, width, ry };
    kit.frame({ x: (from.x + to.x) / 2, y: (yFrom + yTo) / 2, z: (from.z + to.z) / 2, ry, rx: -Math.atan2(yTo - yFrom, len) }, () => {
      kit.box(m.cobbleWhite, width, 0.5, len + 1.0, { y: -0.25 }, { metres: 1.6 });
      for (const s of [-1, 1]) {
        kit.box(m.white, 0.4, 1.1, len + 1.0, { x: s * (width / 2 - 0.2), y: 0.55 }, { metres: 3 });
        kit.box(m.whiteDark, 0.5, 0.15, len + 1.0, { x: s * (width / 2 - 0.2), y: 1.15 }, { metres: 3 });
      }
      // Arches beneath: piers every ~12 m down to the gorge floor, with arch rings between.
      const piers = Math.max(2, Math.round(len / 12));
      for (let i = 0; i <= piers; i++) {
        const z = -len / 2 + (i / piers) * len;
        const drop = 26 + Math.sin(i * 1.7) * 4;
        kit.box(m.white, width * 0.8, drop, 2.4, { y: -drop / 2 - 0.4, z }, { metres: 3.6 });
        kit.box(m.whiteDark, width * 0.95, 1.5, 3.2, { y: -1.2, z }, { metres: 3 });
      }
      for (let i = 0; i < piers; i++) {
        const z = -len / 2 + ((i + 0.5) / piers) * len;
        const span = len / piers - 2.4;
        const arch = new THREE.Shape();
        arch.moveTo(-span / 2, -8);
        arch.lineTo(-span / 2, -5);
        arch.absarc(0, -5, span / 2, Math.PI, 0, true);
        arch.lineTo(span / 2, -8);
        arch.lineTo(span / 2 - 0.6, -8);
        arch.lineTo(span / 2 - 0.6, -5);
        arch.absarc(0, -5, span / 2 - 0.6, 0, Math.PI, false);
        arch.lineTo(-span / 2 + 0.6, -8);
        arch.closePath();
        const g = new THREE.ExtrudeGeometry(arch, { depth: width * 0.82, bevelEnabled: false, curveSegments: 10 });
        g.translate(0, 0, -width * 0.41);
        // Shape x runs along the bridge (local z); extrude across the width.
        // Ring crown sits just under the deck (arc top is at shape y = span/2 - 5).
        kit.add(m.whiteDark, g, { y: -0.6 - (span / 2 - 5), z, ry: -Math.PI / 2 });
        // Thin spandrel wall between arch crown and deck.
        kit.box(m.white, width * 0.78, 0.9, span, { y: -0.85, z }, { metres: 3.6 });
      }
    });
    for (const s of [-1, 1]) {
      const lx = s * (width / 2 - 0.2);
      this.colliders.push({ cx: (from.x + to.x) / 2 + lx * Math.cos(ry), cz: (from.z + to.z) / 2 - lx * Math.sin(ry), hx: 0.2, hz: len / 2 + 0.5, rot: ry, local: true });
    }
  }

  // -- Queries (world space) ------------------------------------------------

  toLocal(x, z) {
    return [x - this.plateau.x, z - this.plateau.z];
  }

  // Walkable surface height at (x, z): terraces (from the terrain), stairs, bridge deck.
  surfaceAt(x, z) {
    const [lx, lz] = this.toLocal(x, z);
    let best = null;
    // Bridge.
    const b = this.bridge;
    if (b) {
      const c = Math.cos(b.ry);
      const s = Math.sin(b.ry);
      const dx = lx - (b.from.x + b.to.x) / 2;
      const dz = lz - (b.from.z + b.to.z) / 2;
      const ax = c * dx - s * dz;
      const az = s * dx + c * dz;
      if (Math.abs(ax) <= b.width / 2 - 0.3 && Math.abs(az) <= b.len / 2 + 0.4) {
        const t = THREE.MathUtils.clamp(az / b.len + 0.5, 0, 1);
        best = this.baseY + b.yFrom + (b.yTo - b.yFrom) * t;
      }
    }
    // Stairs.
    for (const d of this.decks) {
      const ry = -d.angle + Math.PI / 2;
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      const dx = lx - d.x;
      const dz = lz - d.z;
      const ax = c * dx - s * dz;
      const az = s * dx + c * dz;
      if (Math.abs(ax) <= d.width / 2 && az >= -0.3 && az <= d.run + 0.3) {
        const t = THREE.MathUtils.clamp(az / d.run, 0, 1);
        const y = this.baseY + d.baseY + d.rise * t;
        if (best === null || y > best) best = y;
      }
    }
    return best;
  }

  worldColliders() {
    return this.colliders.map((c) => ({ cx: c.cx + this.plateau.x, cz: c.cz + this.plateau.z, hx: c.hx, hz: c.hz, rot: c.rot }));
  }

  worldLamps() {
    return this.lamps.map((l) => l.clone().add(new THREE.Vector3(this.plateau.x, this.baseY, this.plateau.z)));
  }
}
