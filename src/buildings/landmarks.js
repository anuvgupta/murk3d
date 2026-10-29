// Larger generated buildings: a windmill with turning sails, a two-storey
// town hall, and a lumber mill with a water wheel. Each builds into a Kit in
// its own local frame (ground at y = 0, front facing +z) and returns
// { colliders, chimneys, lamps, decks, animated } like the houses do.
// `animated` names parts the Village keeps as separate meshes so they can
// turn each frame: the mill sails and the water wheel.

import * as THREE from 'three';
import { Kit } from './Kit.js';

const deg = THREE.MathUtils.degToRad;

// --- Windmill -------------------------------------------------------------
// A tapered stone tower with a timber cap that carries the sail axle, a
// gallery round the first floor, and four lattice sails.

export function windmill(kit, m) {
  const baseR = 3.4;
  const topR = 2.3;
  const towerH = 9.5;
  // Tower: tapered cylinder of rubble stone, with a string course.
  kit.cylinder(m.stoneWarm, topR, baseR, towerH, { y: towerH / 2 }, { segments: 18, metres: 2.6 });
  kit.cylinder(m.ashlar, topR + 0.12, topR + 0.12, 0.25, { y: towerH }, { segments: 18, metres: 2 });
  kit.cylinder(m.ashlar, baseR + 0.3, baseR + 0.4, 0.4, { y: 0.2 }, { segments: 18, metres: 2 });
  // Door and windows.
  kit.frame({ z: baseR - 0.05 }, () => {
    kit.box(m.planks, 1.2, 2.2, 0.12, { y: 1.4 }, { metres: 1.2 });
    kit.box(m.ashlar, 1.7, 0.3, 0.3, { y: 2.65 }, { metres: 2 });
    for (const s of [-1, 1]) kit.box(m.ashlar, 0.26, 2.3, 0.26, { x: s * 0.73, y: 1.45 }, { metres: 2 });
  });
  for (const [ry, y] of [[Math.PI / 2, 4.2], [-Math.PI / 2, 4.2], [Math.PI, 6.4], [0, 7.2]]) {
    const r = baseR - ((baseR - topR) * y) / towerH;
    kit.frame({ ry }, () => {
      kit.frame({ z: r - 0.02 }, () => {
        kit.box(m.glass, 0.6, 0.8, 0.04, { y });
        kit.box(m.timber, 0.72, 0.09, 0.14, { y: y + 0.44 }, { metres: 1.2, grain: true });
        kit.box(m.timber, 0.8, 0.1, 0.2, { y: y - 0.45 }, { metres: 1.2, grain: true });
        for (const s of [-1, 1]) kit.box(m.timber, 0.09, 0.9, 0.14, { x: s * 0.34, y }, { metres: 1.2, grain: true });
      });
    });
  }
  // Gallery: a timber deck round the tower at first-floor height, on braces.
  const galY = 3.3;
  const galR = baseR - ((baseR - topR) * galY) / towerH;
  const deckOuter = galR + 1.3;
  const ring = new THREE.RingGeometry(galR - 0.1, deckOuter, 24);
  ring.rotateX(-Math.PI / 2);
  const uv = ring.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 6);
  kit.add(m.planks, ring, { y: galY });
  const ring2 = ring.clone();
  ring2.rotateX(Math.PI);
  kit.add(m.planks, ring2, { y: galY - 0.06 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    kit.frame({ ry: a }, () => {
      kit.box(m.timber, 0.1, 0.1, deckOuter - galR + 0.3, { y: galY - 0.1, z: (galR + deckOuter) / 2 - 0.1 }, { metres: 1.2, grain: true });
      kit.beamBetween(m.timber, 0, galY - 1.4, 0, galY - 0.15, 0.1, 0.1, 0);
      kit.frame({ z: deckOuter - 0.08 }, () => {
        kit.box(m.timber, 0.08, 1.0, 0.08, { y: galY + 0.5 });
      });
      kit.frame({ rx: 0 }, () => {
        const b = kit.box(m.timber, 0.1, 0.1, 1.0, { y: galY - 0.7, z: galR + 0.5, rx: -0.95 }, { metres: 1.2, grain: true });
      });
    });
  }
  // Rail round the gallery.
  const rail = new THREE.TorusGeometry(deckOuter - 0.08, 0.04, 6, 36);
  rail.rotateX(Math.PI / 2);
  kit.add(m.timber, rail, { y: galY + 1.0 });
  // Cap: a timber boat-shaped cap with a conical shingle roof, turned to face the wind.
  const capY = towerH + 0.25;
  kit.frame({ y: capY }, () => {
    kit.cylinder(m.planks, topR + 0.35, topR + 0.35, 1.6, { y: 0.8 }, { segments: 18, metres: 1.2 });
    kit.frame({ y: 1.6 }, () => {
      const cone = new THREE.ConeGeometry(topR + 0.6, 2.4, 18, 1);
      const cuv = cone.attributes.uv;
      for (let i = 0; i < cuv.count; i++) cuv.setXY(i, cuv.getX(i) * 8, cuv.getY(i) * 2);
      kit.add(m.shingles, cone, { y: 1.2 });
      kit.add(m.iron, new THREE.SphereGeometry(0.14, 10, 8), { y: 2.5 });
    });
    // Axle housing poking out the front, and a tail pole behind.
    kit.cylinder(m.timber, 0.28, 0.32, 1.4, { y: 0.9, z: topR + 0.6, rx: Math.PI / 2 }, { segments: 10 });
    kit.box(m.timber, 0.16, 0.16, 6.5, { y: 0.4, z: -topR - 2.2, rx: 0.42 }, { metres: 1.2, grain: true });
  });
  const colliders = [{ cx: 0, cz: 0, hx: baseR + 0.2, hz: baseR + 0.2 }];
  return {
    colliders,
    chimneys: [],
    lamps: [new THREE.Vector3(0.95, 2.4, baseR + 0.15)],
    decks: [],
    // The sails are built separately so they can turn.
    animated: [{ kind: 'sails', position: new THREE.Vector3(0, capY + 0.9, topR + 1.35), axis: 'z' }],
    name: 'windmill',
  };
}

// Four lattice sails on a hub, in their own kit so the Village can spin them.
export function windmillSails(m) {
  const kit = new Kit();
  const len = 6.2;
  kit.cylinder(m.iron, 0.22, 0.22, 0.5, { rx: Math.PI / 2 }, { segments: 12 });
  for (let i = 0; i < 4; i++) {
    kit.frame({ rz: (i / 4) * Math.PI * 2 }, () => {
      // Stock (main spar).
      kit.box(m.timber, 0.16, len, 0.14, { y: len / 2 }, { metres: 1.2, grain: true });
      // Lattice frame on one side of the stock: a leading board and cross bars with canvas.
      kit.box(m.timber, 0.08, len - 1.2, 0.06, { x: 0.95, y: len / 2 + 0.6 }, { metres: 1.2, grain: true });
      for (let k = 0; k < 9; k++) {
        const y = 1.3 + k * ((len - 1.6) / 8);
        kit.box(m.timber, 1.0, 0.05, 0.05, { x: 0.5, y }, { metres: 1.2, grain: true });
      }
      kit.box(m.cloth, 0.85, len - 1.8, 0.02, { x: 0.52, y: len / 2 + 0.6, z: -0.04 });
    });
  }
  const meshes = kit.build();
  const group = new THREE.Group();
  for (const mesh of meshes) group.add(mesh);
  return group;
}

// --- Town hall ------------------------------------------------------------
// A broad two-storey hall: stone ground floor with an arcade of arches along
// the front, a jettied timber-framed upper floor, a steep slate roof with a
// central bell turret, and twin chimneys.

export function townHall(kit, m) {
  const W = 16;
  const D = 9;
  const g0 = 0.5;
  const g1 = g0 + 3.6;
  const u0 = g1 + 0.3;
  const u1 = u0 + 3.0;
  const UW = W + 0.7;
  const UD = D + 0.7;
  // Plinth and ground floor.
  kit.box(m.ashlar, W + 0.4, g0 + 1.2, D + 0.4, { y: g0 / 2 - 0.6 }, { metres: 2 });
  kit.box(m.stone, W, g1 - g0, D, { y: (g0 + g1) / 2 }, { metres: 2.6 });
  // Arcade: five arched openings along the front, recessed, with a walkway behind.
  const arcDepth = 2.2;
  kit.box(m.cobble, W - 1.0, 0.1, arcDepth, { y: g0 + 0.05, z: D / 2 - arcDepth / 2 }, { metres: 1.6 });
  for (let i = 0; i < 5; i++) {
    const x = -W / 2 + 1.6 + i * (W - 3.2) / 4;
    // Pillar between arches.
    if (i < 5) kit.box(m.ashlar, 0.6, g1 - g0, 0.6, { x: x - (W - 3.2) / 8, y: (g0 + g1) / 2, z: D / 2 - 0.3 }, { metres: 2 });
  }
  kit.box(m.ashlar, 0.6, g1 - g0, 0.6, { x: W / 2 - 0.4, y: (g0 + g1) / 2, z: D / 2 - 0.3 }, { metres: 2 });
  // The stone wall above and between the arches is cut back to leave arch heads.
  for (let i = 0; i < 5; i++) {
    const x = -W / 2 + 1.6 + i * (W - 3.2) / 4;
    const arch = new THREE.Shape();
    const w = (W - 3.2) / 4 - 0.6;
    arch.moveTo(-w / 2, 0);
    arch.lineTo(-w / 2, 2.0);
    arch.absarc(0, 2.0, w / 2, Math.PI, 0, true);
    arch.lineTo(w / 2, 0);
    arch.closePath();
    // The opening is "cut" by leaving it out: we add the dark interior wall behind instead.
    kit.box(m.plasterCream, w, g1 - g0 - 0.2, 0.2, { x, y: (g0 + g1) / 2, z: D / 2 - arcDepth - 0.1 }, { metres: 3 });
    // Arch ring stones.
    const ring = new THREE.Shape();
    ring.absarc(0, 2.0, w / 2 + 0.25, Math.PI, 0, true);
    ring.lineTo(w / 2, 2.0);
    ring.absarc(0, 2.0, w / 2, 0, Math.PI, false);
    ring.closePath();
    const rg = new THREE.ExtrudeGeometry(ring, { depth: 0.5, bevelEnabled: false, curveSegments: 12 });
    rg.translate(0, 0, -0.25);
    kit.add(m.ashlar, rg, { x, y: g0, z: D / 2 - 0.25 });
  }
  // Door at the back of the central arch.
  kit.frame({ z: D / 2 - arcDepth }, () => {
    kit.box(m.planks, 2.0, 2.6, 0.12, { y: g0 + 1.3, z: 0.06 }, { metres: 1.0 });
    kit.box(m.timber, 0.06, 2.6, 0.14, { y: g0 + 1.3, z: 0.07 });
    for (const y of [g0 + 0.5, g0 + 2.1]) kit.box(m.iron, 1.8, 0.06, 0.03, { y, z: 0.13 });
  });
  // Jetty beam and upper floor.
  kit.box(m.timber, W + 0.9, 0.3, D + 0.9, { y: g1 + 0.15 }, { metres: 1.2, grain: true });
  kit.box(m.plasterWhite, UW, u1 - u0, UD, { y: (u0 + u1) / 2 }, { metres: 3 });
  // Timber frame on all four upper faces.
  const faces = [
    { ry: 0, z: UD / 2, width: UW, bays: 10 },
    { ry: Math.PI, z: UD / 2, width: UW, bays: 10 },
    { ry: Math.PI / 2, z: UW / 2, width: UD, bays: 5 },
    { ry: -Math.PI / 2, z: UW / 2, width: UD, bays: 5 },
  ];
  for (const f of faces) {
    kit.frame({ ry: f.ry }, () => {
      kit.frame({ z: f.z + 0.01 }, () => {
        const t = 0.1;
        const z = t / 2;
        const h = u1 - u0;
        const bw = f.width / f.bays;
        kit.box(m.timber, f.width + 0.02, 0.2, t, { y: u0 + 0.1, z }, { metres: 1.2, grain: true });
        kit.box(m.timber, f.width + 0.02, 0.2, t, { y: u1 - 0.1, z }, { metres: 1.2, grain: true });
        for (let i = 0; i <= f.bays; i++) kit.box(m.timber, 0.16, h, t, { x: -f.width / 2 + i * bw, y: u0 + h / 2, z }, { metres: 1.2, grain: true });
        kit.box(m.timber, f.width, 0.14, t, { y: u0 + h * 0.5, z }, { metres: 1.2, grain: true });
        for (let i = 0; i < f.bays; i++) {
          const x = -f.width / 2 + (i + 0.5) * bw;
          if (i % 2 === 0) {
            // Window bay.
            kit.box(m.glass, bw * 0.55, 1.1, 0.04, { x, y: u0 + h * 0.52, z: 0.01 });
            kit.box(m.timber, bw * 0.55 + 0.16, 0.1, 0.14, { x, y: u0 + h * 0.52 + 0.6, z: 0.04 }, { metres: 1.2, grain: true });
            kit.box(m.timber, bw * 0.55 + 0.2, 0.12, 0.2, { x, y: u0 + h * 0.52 - 0.6, z: 0.06 }, { metres: 1.2, grain: true });
          } else {
            // Brace bay: a St Andrew's cross.
            kit.beamBetween(m.timber, x - bw / 2, u0 + 0.2, x + bw / 2, u1 - 0.2, 0.12, t, z);
            kit.beamBetween(m.timber, x + bw / 2, u0 + 0.2, x - bw / 2, u1 - 0.2, 0.12, t, z);
          }
        }
      });
    });
  }
  // Roof: steep slate gable with a bell turret on the ridge.
  const pitch = deg(52);
  const rise = (UD / 2 + 0.7) * Math.tan(pitch);
  const apex = u1 + rise;
  for (const ry of [0, Math.PI]) {
    kit.frame({ ry }, () => {
      const run = UD / 2 + 0.7;
      const slopeLen = run / Math.cos(pitch);
      const dir = new THREE.Vector3(0, -Math.sin(pitch), Math.cos(pitch));
      const nrm = new THREE.Vector3(0, Math.cos(pitch), Math.sin(pitch));
      const c = new THREE.Vector3(0, apex, 0).addScaledVector(dir, slopeLen / 2).addScaledVector(nrm, 0.12);
      kit.box(m.slate, UW + 1.2, 0.2, slopeLen, { y: c.y, z: c.z, rx: pitch }, { metres: 2 });
      // Dormers: three along each slope.
      for (const dx of [-5, 0, 5]) {
        const zf = UD / 2 - 1.6;
        const yf = apex - (zf + 0.7) * Math.tan(pitch) + 0.3;
        kit.frame({ x: dx, y: yf, z: zf }, () => {
          kit.box(m.plasterWhite, 1.6, 1.4, 2.0, { y: 0.7, z: -0.9 }, { metres: 3 });
          kit.box(m.glass, 0.7, 0.8, 0.04, { y: 0.75, z: 0.12 });
          kit.box(m.timber, 0.86, 0.1, 0.1, { y: 1.2, z: 0.14 }, { metres: 1.2, grain: true });
          kit.box(m.timber, 0.9, 0.1, 0.16, { y: 0.3, z: 0.16 }, { metres: 1.2, grain: true });
          for (const s of [-1, 1]) kit.box(m.timber, 0.1, 0.9, 0.1, { x: s * 0.42, y: 0.75, z: 0.14 }, { metres: 1.2, grain: true });
          // Little gable roof over the dormer.
          for (const s of [-1, 1]) kit.box(m.slate, 0.12, 1.3, 2.2, { x: s * 0.55, y: 1.65, z: -0.8, rz: s * deg(45) }, { metres: 2 });
        });
      }
    });
  }
  // Gable ends.
  for (const sx of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-UD / 2, 0);
    shape.lineTo(UD / 2, 0);
    shape.lineTo(0, rise - 0.7 * Math.tan(pitch));
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
    g.translate(0, 0, -0.08);
    kit.add(m.plasterWhite, g, { x: sx * (UW / 2 - 0.07), y: u1, ry: Math.PI / 2 });
    kit.frame({ x: sx * (UW / 2 + 0.03), y: u1, ry: Math.PI / 2 }, () => {
      const gh = rise - 0.7 * Math.tan(pitch);
      kit.box(m.timber, 0.16, gh - 0.3, 0.1, { y: (gh - 0.3) / 2 }, { metres: 1.2, grain: true });
      kit.box(m.timber, UD * 0.6, 0.16, 0.1, { y: gh * 0.4 }, { metres: 1.2, grain: true });
      kit.box(m.glass, 0.7, 0.9, 0.04, { y: gh * 0.4 + 0.65, z: -0.03 });
    });
  }
  // Ridge and bell turret.
  kit.box(m.slate, UW + 1.3, 0.3, 0.3, { y: apex + 0.1, rx: Math.PI / 4 }, { metres: 1 });
  kit.frame({ y: apex - 0.2 }, () => {
    kit.box(m.timber, 1.6, 0.3, 1.6, { y: 0.15 }, { metres: 1.2 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(m.timber, 0.14, 1.6, 0.14, { x: sx * 0.6, y: 1.1, z: sz * 0.6 }, { metres: 1.2, grain: true });
    kit.box(m.timber, 1.7, 0.2, 1.7, { y: 2.0 }, { metres: 1.2 });
    // Bell.
    const bell = new THREE.LatheGeometry([new THREE.Vector2(0.02, 0.5), new THREE.Vector2(0.2, 0.45), new THREE.Vector2(0.26, 0.2), new THREE.Vector2(0.34, 0.0), new THREE.Vector2(0.3, -0.03)], 14);
    kit.add(m.brass || m.iron, bell, { y: 1.2 });
    const cone = new THREE.ConeGeometry(1.3, 1.8, 8);
    kit.add(m.slate, cone, { y: 3.0, ry: Math.PI / 8 });
    kit.add(m.iron, new THREE.SphereGeometry(0.1, 8, 6), { y: 3.95 });
    kit.box(m.iron, 0.03, 0.6, 0.03, { y: 4.3 });
    kit.box(m.iron, 0.4, 0.03, 0.03, { y: 4.45 });
  });
  // Chimneys at each gable end.
  const chimneys = [];
  for (const sx of [-1, 1]) {
    const top = apex + 0.6;
    kit.box(m.stone, 0.9, top - u1 + 1.0, 1.1, { x: sx * (UW / 2 - 1.5), y: (top + u1 - 1.0) / 2, z: -1.0 }, { metres: 2.5 });
    kit.box(m.ashlar, 1.1, 0.22, 1.3, { x: sx * (UW / 2 - 1.5), y: top + 0.11, z: -1.0 }, { metres: 2 });
    chimneys.push(new THREE.Vector3(sx * (UW / 2 - 1.5), top + 0.4, -1.0));
  }
  // Steps up to the arcade.
  for (let i = 0; i < 3; i++) kit.box(m.ashlar, W - 2, 0.17, 0.5, { y: 0.085 + i * 0.165, z: D / 2 + 1.0 - i * 0.45 }, { metres: 2 });
  return {
    colliders: [{ cx: 0, cz: -arcDepth / 2, hx: W / 2 + 0.2, hz: (D - arcDepth) / 2 + 0.2 }],
    chimneys,
    lamps: [new THREE.Vector3(-3.2, g0 + 2.6, D / 2 + 0.2), new THREE.Vector3(3.2, g0 + 2.6, D / 2 + 0.2)],
    decks: [{ cx: 0, cz: D / 2 - arcDepth / 2, hx: W / 2 - 0.5, hz: arcDepth / 2, y: g0 + 0.1 }],
    animated: [],
    name: 'town hall',
  };
}

// --- Lumber mill ------------------------------------------------------------
// An open-sided timber shed over a saw bench, a log store, a stack of
// planks and a water wheel on one side (the wheel turns; it's placed
// beside the river by the village).

export function lumberMill(kit, m) {
  const W = 9;
  const D = 6;
  const postH = 3.4;
  // Stone undercroft (the mill stands on a pier above the riverbank) and plank floor.
  kit.box(m.stone, W + 0.4, 7.0, D + 0.4, { y: 0.4 - 3.5 }, { metres: 2.6 });
  kit.box(m.ashlar, W + 0.8, 0.3, D + 0.8, { y: 0.25 }, { metres: 2 });
  kit.box(m.planks, W, 0.08, D, { y: 0.39 }, { metres: 1.2 });
  // Posts and beams.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(m.timber, 0.26, postH, 0.26, { x: sx * (W / 2 - 0.2), y: 0.4 + postH / 2, z: sz * (D / 2 - 0.2) }, { metres: 1.2, grain: true });
  for (const sz of [-1, 1]) kit.box(m.timber, 0.26, postH, 0.26, { x: 0, y: 0.4 + postH / 2, z: sz * (D / 2 - 0.2) }, { metres: 1.2, grain: true });
  for (const sz of [-1, 1]) kit.box(m.timber, W, 0.24, 0.24, { y: 0.4 + postH, z: sz * (D / 2 - 0.2) }, { metres: 1.2, grain: true });
  for (const sx of [-1, 0, 1]) kit.box(m.timber, 0.22, 0.22, D, { x: sx * (W / 2 - 0.2), y: 0.4 + postH + 0.1 }, { metres: 1.2, grain: true });
  // Knee braces.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kit.frame({ x: sx * (W / 2 - 0.2), z: sz * (D / 2 - 0.2) }, () => {
      kit.beamBetween(m.timber, 0, 0.4 + postH - 1.1, -sx * 1.0, 0.4 + postH - 0.12, 0.12, 0.12, 0);
    });
  }
  // Back wall boarded, sides half-boarded.
  kit.box(m.planks, W - 0.4, postH - 0.1, 0.08, { y: 0.4 + postH / 2, z: -D / 2 + 0.2 }, { metres: 1.0 });
  for (const sx of [-1, 1]) kit.box(m.planks, 0.08, 1.3, D - 0.4, { x: sx * (W / 2 - 0.2), y: 0.4 + 0.65 }, { metres: 1.0 });
  // Shingle roof, low pitch, big overhang.
  const pitch = deg(28);
  const run = D / 2 + 0.9;
  const slopeLen = run / Math.cos(pitch);
  const apex = 0.4 + postH + 0.2 + run * Math.tan(pitch);
  for (const ry of [0, Math.PI]) {
    kit.frame({ ry }, () => {
      const dir = new THREE.Vector3(0, -Math.sin(pitch), Math.cos(pitch));
      const nrm = new THREE.Vector3(0, Math.cos(pitch), Math.sin(pitch));
      const c = new THREE.Vector3(0, apex, 0).addScaledVector(dir, slopeLen / 2).addScaledVector(nrm, 0.1);
      kit.box(m.shingles, W + 1.2, 0.16, slopeLen, { y: c.y, z: c.z, rx: pitch }, { metres: 2.2 });
      // Rafters visible under the eave.
      for (let i = 0; i <= 8; i++) {
        const x = -W / 2 - 0.4 + i * ((W + 0.8) / 8);
        const r = new THREE.Vector3(0, apex, 0).addScaledVector(dir, slopeLen / 2).addScaledVector(nrm, -0.1);
        kit.box(m.timber, 0.1, 0.16, slopeLen, { x, y: r.y, z: r.z, rx: pitch }, { metres: 1.2, grain: true });
      }
    });
  }
  kit.box(m.timber, W + 1.3, 0.24, 0.24, { y: apex + 0.1, rx: Math.PI / 4 }, { metres: 1.2, grain: true });
  // Saw bench with a log on it and a frame saw.
  kit.frame({ x: -1.2, y: 0.43 }, () => {
    kit.box(m.timber, 3.2, 0.14, 0.9, { y: 0.82 }, { metres: 1.2, grain: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(m.timber, 0.12, 0.8, 0.12, { x: sx * 1.4, y: 0.4, z: sz * 0.35 }, { metres: 1.2, grain: true });
    kit.cylinder(m.logs, 0.3, 0.32, 3.0, { y: 1.2, rz: Math.PI / 2 }, { segments: 10, metres: 1.4 });
    // Blade standing in a half-cut.
    kit.box(m.iron, 0.02, 1.1, 0.12, { x: 0.3, y: 1.6 });
    kit.box(m.timber, 0.08, 0.08, 0.7, { x: 0.3, y: 2.15 }, { metres: 1.2, grain: true });
  });
  // Axle beam and its trestle out to the wheel.
  kit.box(m.timber, 9.0, 0.3, 0.3, { x: -W / 2 - 4.3, y: -1.2, z: -0.5 }, { metres: 1.2, grain: true });
  kit.box(m.stone, 1.2, 6.5, 1.6, { x: -W / 2 - 7.2, y: -3.9, z: -0.5 }, { metres: 2.6 });
  // Plank stack and log pile outside.
  kit.frame({ x: W / 2 + 1.4, z: 1.0 }, () => {
    for (let r = 0; r < 6; r++) {
      for (let i = 0; i < 4; i++) kit.box(m.planks, 0.3, 0.06, 3.2, { x: -0.5 + i * 0.33, y: 0.1 + r * 0.14, z: (r % 2) * 0.1 }, { metres: 1.2, grain: true });
      kit.box(m.timber, 1.4, 0.08, 0.1, { y: 0.17 + r * 0.14, z: -1.2 }, { metres: 1.2, grain: true });
      kit.box(m.timber, 1.4, 0.08, 0.1, { y: 0.17 + r * 0.14, z: 1.2 }, { metres: 1.2, grain: true });
    }
  });
  kit.frame({ x: -W / 2 - 1.6, z: -0.5 }, () => {
    const rows = [5, 4, 3, 2];
    rows.forEach((n, r) => {
      for (let i = 0; i < n; i++) kit.cylinder(m.logs, 0.27, 0.29, 3.4, { x: 0, y: 0.28 + r * 0.48, z: -1.2 + (i + r * 0.5) * 0.6, rz: Math.PI / 2 }, { segments: 10, metres: 1.4 });
    });
  });
  return {
    colliders: [
      { cx: 0, cz: -D / 2 + 0.2, hx: W / 2, hz: 0.2 },
      { cx: -1.2, cz: 0, hx: 1.7, hz: 0.6 },
      { cx: W / 2 + 1.4, cz: 1.0, hx: 0.9, hz: 1.8 },
      { cx: -W / 2 - 1.6, cz: -0.5, hx: 1.9, hz: 1.9 },
    ],
    chimneys: [],
    lamps: [new THREE.Vector3(0, 0.4 + postH - 0.3, D / 2 - 0.1)],
    decks: [{ cx: 0, cz: 0, hx: W / 2, hz: D / 2, y: 0.43 }],
    // Water wheel on the west side, axle along z.
    // Wheel hangs off the river side on a long axle beam, rim dipping into the water.
    animated: [{ kind: 'wheel', position: new THREE.Vector3(-W / 2 - 8.6, -1.2, -0.5), axis: 'z' }],
    name: 'lumber mill',
  };
}

// An undershot water wheel: two rims, spokes and paddles.
export function waterWheel(m) {
  const kit = new Kit();
  const R = 2.0;
  for (const z of [-0.5, 0.5]) {
    const rim = new THREE.TorusGeometry(R, 0.09, 8, 28);
    kit.add(m.timber, rim, { z });
    for (let i = 0; i < 8; i++) kit.box(m.timber, 0.1, R * 2 - 0.2, 0.08, { z, rz: (i / 8) * Math.PI }, { metres: 1.2, grain: true });
  }
  kit.cylinder(m.iron, 0.14, 0.14, 1.6, { rx: Math.PI / 2 }, { segments: 10 });
  for (let i = 0; i < 16; i++) {
    kit.frame({ rz: (i / 16) * Math.PI * 2 }, () => {
      kit.box(m.planks, 0.06, 0.5, 1.1, { y: R - 0.05 }, { metres: 1.0 });
    });
  }
  const group = new THREE.Group();
  for (const mesh of kit.build()) group.add(mesh);
  return group;
}
