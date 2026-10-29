// The world plan: where the river, lake, roads, hill and village sit. Pure data
// plus geometric queries; Terrain, the ground mask, water, buildings and trees
// all read from here so they agree with one another.
//
// Axes: +x is east, -z is north. The village well sits at the origin.

import * as THREE from 'three';
import { REGIONS } from './regions.js';
import { mulberry32 } from '../util/noise.js';

export const WORLD_SIZE = 1600; // metres, edge length of the terrain square
export const WORLD_HALF = WORLD_SIZE / 2;

// ---------------------------------------------------------------------------
// Paths: smoothed polylines with a spatial index for nearest-point queries.

const CELL = 24; // spatial index cell size, metres

export class Path {
  constructor(points, { spacing = 2, tension = 0.5 } = {}) {
    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false,
      'centripetal',
      tension
    );
    const length = curve.getLength();
    const n = Math.max(2, Math.ceil(length / spacing));
    const pts = curve.getSpacedPoints(n);

    this.count = pts.length;
    this.x = new Float32Array(this.count);
    this.z = new Float32Array(this.count);
    this.s = new Float32Array(this.count); // arc length at each sample
    let acc = 0;
    for (let i = 0; i < this.count; i++) {
      this.x[i] = pts[i].x;
      this.z[i] = pts[i].z;
      if (i > 0) acc += Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
      this.s[i] = acc;
    }
    this.length = acc;

    // Index each segment into every grid cell its bounding box touches.
    this.cells = new Map();
    for (let i = 0; i < this.count - 1; i++) {
      const x0 = Math.floor(Math.min(this.x[i], this.x[i + 1]) / CELL);
      const x1 = Math.floor(Math.max(this.x[i], this.x[i + 1]) / CELL);
      const z0 = Math.floor(Math.min(this.z[i], this.z[i + 1]) / CELL);
      const z1 = Math.floor(Math.max(this.z[i], this.z[i + 1]) / CELL);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          const key = cx * 100003 + cz;
          let list = this.cells.get(key);
          if (!list) this.cells.set(key, (list = []));
          list.push(i);
        }
      }
    }
  }

  // Nearest point on the path within maxDist. Returns null if none.
  // out: { d, s, i, t, px, pz, tx, tz } (tx, tz: unit tangent).
  nearest(x, z, maxDist = 50, out = {}) {
    const r = Math.ceil(maxDist / CELL);
    const cx0 = Math.floor(x / CELL);
    const cz0 = Math.floor(z / CELL);
    let best = maxDist * maxDist;
    let found = false;
    for (let cz = cz0 - r; cz <= cz0 + r; cz++) {
      for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
        const list = this.cells.get(cx * 100003 + cz);
        if (!list) continue;
        for (const i of list) {
          const ax = this.x[i];
          const az = this.z[i];
          const bx = this.x[i + 1];
          const bz = this.z[i + 1];
          const abx = bx - ax;
          const abz = bz - az;
          const len2 = abx * abx + abz * abz || 1e-9;
          let t = ((x - ax) * abx + (z - az) * abz) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ax + abx * t;
          const pz = az + abz * t;
          const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
          if (d2 < best) {
            best = d2;
            found = true;
            const len = Math.sqrt(len2);
            out.i = i;
            out.t = t;
            out.px = px;
            out.pz = pz;
            out.tx = abx / len;
            out.tz = abz / len;
            out.s = this.s[i] + (this.s[i + 1] - this.s[i]) * t;
          }
        }
      }
    }
    if (!found) return null;
    out.d = Math.sqrt(best);
    return out;
  }

  // Linear interpolation of a per-sample array at arc length s.
  sampleAt(values, s) {
    if (s <= 0) return values[0];
    if (s >= this.length) return values[this.count - 1];
    let lo = 0;
    let hi = this.count - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.s[mid] <= s) lo = mid;
      else hi = mid;
    }
    const f = (s - this.s[lo]) / (this.s[hi] - this.s[lo] || 1);
    return values[lo] + (values[hi] - values[lo]) * f;
  }

  pointAt(s, out = new THREE.Vector2()) {
    const x = this.sampleAt(this.x, s);
    const z = this.sampleAt(this.z, s);
    return out.set(x, z);
  }
}

// ---------------------------------------------------------------------------
// Water.

export const RIVER = {
  path: new Path(
    [
      [96, -430],
      [72, -320],
      [58, -215],
      [50, -130],
      [38, -62],
      [30, -22],
      [29, 14],
      [37, 52],
      [56, 92],
      [82, 128],
      [104, 160],
      [118, 184],
    ],
    { spacing: 2 }
  ),
  // Width at arc length s: a stream in the hills, broadening toward the lake.
  widthAt(s) {
    const t = s / this.path.length;
    return 7 + 6 * t;
  },
  depth: 1.9,
};

export const LAKE = {
  x: 132,
  z: 212,
  radius: 50,
  depth: 6,
  // Irregular shoreline: radius varies with angle.
  radiusAt(angle) {
    return (
      this.radius *
      (1 + 0.16 * Math.sin(angle * 3 + 0.7) + 0.09 * Math.sin(angle * 5 + 2.1) + 0.05 * Math.sin(angle * 9 + 4))
    );
  },
};

// ---------------------------------------------------------------------------
// The village.

// Every lake: the Vale's (level found from the river) and the realms' (fixed).
export const LAKES = [LAKE];
for (const R of REGIONS) {
  if (!R.lake) continue;
  const L = R.lake;
  LAKES.push({
    x: R.x + (L.dx || 0), z: R.z + (L.dz || 0), radius: L.r, depth: L.depth, ring: L.ring || 0, steep: !!L.steep, tint: L.tint || null,
    level: R.floor + L.level, region: R.id,
    radiusAt(angle) {
      return this.radius * (1 + 0.1 * Math.sin(angle * 3 + 1.3) + 0.06 * Math.sin(angle * 5 + 0.4) + 0.04 * Math.sin(angle * 7 + 2.6));
    },
  });
}

export const PLAZA = { x: 0, z: 0, radius: 11 };
export const WELL = { x: 0, z: 0 };

// Footprint half-extents (x, z) for each house design, used to level plots and
// keep grass and trees off them. Must match buildings/houses.js.
export const HOUSE_FOOTPRINTS = [
  { hx: 4.7, hz: 3.6 }, // 0: stone-and-timber cottage
  { hx: 7.0, hz: 4.3 }, // 1: long timber-framed hall (tavern)
  { hx: 3.6, hz: 3.0 }, // 2: thatched stone hut
  { hx: 4.6, hz: 4.6 }, // 3: log house with porch
  { hx: 3.4, hz: 3.4 }, // 4: stone tower house
  { hx: 3.8, hz: 3.8 }, // 5: windmill (tower + gallery)
  { hx: 8.6, hz: 5.2 }, // 6: town hall
  { hx: 7.0, hz: 3.6 }, // 7: lumber mill (shed + stacks; wheel reaches the river)
];

// Each house faces `face` (its door side looks toward that point).
export const HOUSES = [
  { design: 0, x: -24, z: -17, face: [0, 0], seed: 1 },
  { design: 6, x: -2, z: -29, face: [0, 0], seed: 2 },
  { design: 2, x: -27, z: 21, face: [0, 0], seed: 3 },
  { design: 3, x: 5, z: 26, face: [0, 0], seed: 4 },
  { design: 4, x: -50, z: -9, face: [-50, 12], seed: 5 },
  { design: 0, x: -56, z: 27, face: [-56, 12], seed: 6 },
  { design: 1, x: 62, z: -21, face: [62, 0], seed: 7 },
  { design: 3, x: 64, z: 20, face: [64, 0], seed: 8 },
  { design: 2, x: 12, z: -50, face: [4, -30], seed: 9 },
  { design: 4, x: -78, z: 34, face: [-78, 16], seed: 10 },
  { design: 5, x: -44, z: -64, face: [-20, -40], seed: 11 },
  { design: 7, x: 27, z: 72, face: [27, 40], seed: 12 },
];

// The white river town: houses ringing the island inside the moat.
for (const R of REGIONS) {
  if (!R.town) continue;
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const x = R.x + Math.cos(a) * 14.5;
    const z = R.z + Math.sin(a) * 14.5;
    HOUSES.push({ design: [0, 2, 4, 1, 0, 6, 2][i], x, z, face: [R.x, R.z], seed: 40 + i, white: true, noLane: true });
  }
  HOUSES.push({ design: 4, x: R.x, z: R.z + 2, face: [R.x + 20, R.z + 20], seed: 48, white: true, noLane: true });
}
for (const h of HOUSES) {
  h.rotationY = Math.atan2(h.face[0] - h.x, h.face[1] - h.z);
  h.footprint = HOUSE_FOOTPRINTS[h.design];
  // Door point, just outside the front wall.
  const c = Math.cos(h.rotationY);
  const s = Math.sin(h.rotationY);
  const ahead = h.footprint.hz + 1.6;
  h.door = { x: h.x + s * ahead, z: h.z + c * ahead };
}

// ---------------------------------------------------------------------------
// Roads.

const MAIN_ROAD = new Path(
  [
    [-300, 62],
    [-230, 48],
    [-160, 30],
    [-100, 17],
    [-52, 10],
    [-14, 3],
    [0, 0],
    [16, 0],
    [30, 1],
    [46, 0],
    [90, -12],
    [160, -38],
    [250, -70],
  ],
  { spacing: 2 }
);

const OVERLOOK_ROAD = new Path(
  [
    [-88, 15],
    [-96, -10],
    [-122, -30],
    [-150, -52],
    [-156, -86],
    [-138, -112],
    [-112, -120],
    [-96, -112],
  ],
  { spacing: 2 }
);

// Mesas: flat-topped rises with a ragged edge. Each has a gentle slope on
// most sides and, within `cliffSpread` radians of `cliffDir`, a sheer cliff;
// cliffSpread >= PI makes the whole rim cliff, <= 0 none.
export const MESAS = [
  {
    // The overlook: a low plateau whose cliff faces the village (south-east).
    name: 'overlook',
    x: -104, z: -100, radius: 30, height: 24,
    gentleWidth: 80, cliffWidth: 5,
    cliffDir: Math.atan2(100, 104), cliffSpread: 1.0,
  },
  {
    // A tall knoll the castle road spirals up; the bridge leaves from its rim.
    // Sheer where it faces the plateau (the bridge leaves from that rim);
    // the road climbs the gentle far side.
    name: 'castle-knoll',
    x: 135, z: -135, radius: 28, height: 52,
    gentleWidth: 46, cliffWidth: 7,
    cliffDir: Math.atan2(-200 + 135, 185 - 135), cliffSpread: 0.75,
  },
  {
    // The castle plateau: sheer all round, a saddle on the south-west where the gate is.
    name: 'castle-plateau',
    x: 185, z: -200, radius: 36, height: 50,
    gentleWidth: 30, cliffWidth: 9,
    cliffDir: 0, cliffSpread: 4,
  },
];
// Region mesas: the citadel's rock, the overgrown cliff, the karst spires.
for (const R of REGIONS) {
  for (const m of R.mesas || []) MESAS.push({ ...m, name: R.id, x: R.x + m.dx, z: R.z + m.dz });
  if (R.spires) {
    const rnd = mulberry32(R.spires.seed);
    const S = R.spires;
    for (let i = 0; i < S.count; i++) {
      const a = rnd() * Math.PI * 2;
      const d = (R.lake ? R.lake.r + 8 : 10) + rnd() * (R.r - 30 - (R.lake ? R.lake.r + 8 : 10));
      const radius = S.rMin + rnd() * (S.rMax - S.rMin);
      const g = R.gate || { dx: 50, dz: 50 };
      if (Math.hypot(Math.cos(a) * d - g.dx, Math.sin(a) * d - g.dz) < radius + 18) continue;
      MESAS.push({
        name: `${R.id}-spire`, x: R.x + Math.cos(a) * d, z: R.z + Math.sin(a) * d,
        radius, height: S.hMin + rnd() * (S.hMax - S.hMin),
        gentleWidth: radius * 0.8, cliffWidth: radius * 0.45, cliffDir: 0, cliffSpread: 4, rag: 0.35,
      });
    }
  }
}
// The citadel's knoll (its plateau is the region's own mesa).
for (const R of REGIONS) {
  if (!R.castle) continue;
  const K = R.castle.knoll;
  MESAS.push({
    name: `${R.id}-knoll`, x: R.x + K.dx, z: R.z + K.dz, radius: 22, height: 62,
    gentleWidth: 40, cliffWidth: 7, cliffDir: Math.atan2(-K.dz, -K.dx), cliffSpread: 0.75,
  });
}
export const HILL = MESAS[0];
export const CASTLE = {
  knoll: MESAS[1],
  plateau: MESAS[2],
  // Bridge from the knoll's rim to the plateau's gate notch.
  bridgeFrom: { x: 152, z: -157 },
  bridgeTo: { x: 163, z: -171.5 },
  gateDir: Math.atan2(-135 + 200, 135 - 185), // angle (atan2(dz, dx)) from plateau centre toward the knoll
};

export const CASTLES = [CASTLE];
for (const R of REGIONS) {
  if (!R.castle) continue;
  const plateau = MESAS.find((m) => m.name === R.id);
  const knoll = MESAS.find((m) => m.name === `${R.id}-knoll`);
  const dx = plateau.x - knoll.x;
  const dz = plateau.z - knoll.z;
  const d = Math.hypot(dx, dz);
  const ux = dx / d;
  const uz = dz / d;
  CASTLES.push({
    knoll, plateau, dark: true,
    bridgeFrom: { x: knoll.x + ux * (knoll.radius - 1), z: knoll.z + uz * (knoll.radius - 1) },
    bridgeTo: { x: plateau.x - ux * 36, z: plateau.z - uz * 36 },
    gateDir: Math.atan2(-uz, -ux),
  });
}
export const OVERLOOK = { x: -86, z: -86 }; // a viewpoint near the cliff edge

// The portal glade east of the village: a dais ringed by the realm gates.
export const GLADE = { x: 92, z: 34, r: 15 };

// The Shelves: a region of tilted grassy rock plates. Each plate is a wedge
// of ground rising along `dir` (radians, atan2(dz, dx)) over `length` metres
// to `rise`, then breaking off in a sheer face; a lip of bare rock overhangs
// the face by `lift` metres with a hollow beneath it.
export const PLATES = [
  { x: -150, z: 265, dir: 0.4, length: 46, width: 30, rise: 21, lift: 12 },
  { x: -108, z: 300, dir: -0.5, length: 38, width: 24, rise: 16, lift: 9 },
  { x: -180, z: 232, dir: 1.1, length: 52, width: 34, rise: 26, lift: 13 },
  { x: -118, z: 243, dir: 2.3, length: 34, width: 22, rise: 14, lift: 8 },
  { x: -202, z: 262, dir: -1.2, length: 40, width: 26, rise: 18, lift: 10 },
  { x: -126, z: 205, dir: 2.9, length: 44, width: 28, rise: 20, lift: 12 },
  { x: -240, z: 226, dir: 0.2, length: 36, width: 24, rise: 15, lift: 9 },
];
export const SHELVES = { x: -165, z: 248 };

// A crevasse: a deep, narrow gash in the ground south-west of the village,
// grassy at the bottom, entered by a long ramp at its northern end.
export const CREVASSES = [];
export const CREVASSE = {
  path: new Path([[-18, 100], [-44, 138], [-64, 182], [-60, 228], [-42, 262]], { spacing: 2 }),
  width: 22,
  depth: 26,
  rampLength: 75, // the first stretch descends gently
  tailLength: 30,
};
CREVASSES.push(CREVASSE);
for (const R of REGIONS) {
  if (!R.canyon) continue;
  CREVASSES.push({
    path: new Path([[R.x - 150, R.z + 6], [R.x - 80, R.z + 18], [R.x - 10, R.z - 12], [R.x + 70, R.z + 10], [R.x + 150, R.z - 4]], { spacing: 2 }),
    width: R.canyon.width, depth: R.canyon.depth, rampLength: 70, tailLength: 60, region: R.id,
  });
}

// Islets in the lake that carry the drowned ruins' arches.
export const ISLETS = [
  { x: 118, z: 240, r: 7 },
  { x: 104, z: 226, r: 5.5 },
];

// Ruin sites. `face` is the direction (radians, atan2(dz, dx)) the site faces.
export const RUINS = [
  { kind: 'lakeside', x: 90, z: 252, face: Math.atan2(212 - 252, 132 - 90), r: 16 },
  { kind: 'crypt', x: 72, z: 292, face: Math.atan2(252 - 292, 90 - 72), r: 13 },
  { kind: 'forest', x: -188, z: 152, face: 0.6, r: 13 },
  { kind: 'hill', x: -120, z: -96, face: Math.atan2(-86 + 96, -86 + 120), r: 12 }, // on the overlook's top
  { kind: 'chapel', x: 250, z: -215, face: Math.atan2(-200 + 215, 185 - 250), r: 13 },
  { kind: 'crevasse', x: -62, z: 196, face: 1.2, r: 10 },
];
// Ruins in the realms, scattered about each region that asks for them.
{
  const rnd = mulberry32(404);
  const KIND = { stones: 'forest', arcade: 'crevasse', chapel: 'chapel', tower: 'hill' };
  for (const R of REGIONS) {
    (R.ruins || []).forEach((kind, i) => {
      const a = (i / R.ruins.length) * Math.PI * 2 + 2.3;
      const d = R.lake ? R.lake.r + 24 + rnd() * 20 : 30 + rnd() * 50;
      const mesa = (R.mesas || [])[0];
      // Cliff-top ruins stand on the mesa.
      const onTop = mesa && R.id === 'cliffruins';
      const x = onTop ? R.x + mesa.dx + Math.cos(a) * mesa.radius * 0.45 : R.x + Math.cos(a) * d;
      const z = onTop ? R.z + mesa.dz + Math.sin(a) * mesa.radius * 0.45 : R.z + Math.sin(a) * d;
      RUINS.push({ kind: KIND[kind], x, z, face: rnd() * Math.PI * 2, r: 13, region: R.id, flat: true });
    });
  }
}

// Flat pads levelled after every other cut (roads, rivers, canyons): the
// ground under each realm's home gate, and the portal glade.
export const PADS = [{ x: GLADE.x, z: GLADE.z, r: GLADE.r + 2, apron: 10 }];
for (const R of REGIONS) {
  const g = R.gate || { dx: 50, dz: 50 };
  if (g.y !== undefined) continue; // a gate on a floating island needs no pad
  PADS.push({ x: R.x + g.dx, z: R.z + g.dz, r: 11, apron: 12 });
}

// Levelled floors cut into (depth > 0) or built up from (depth < 0) the
// ground: the crypt's chamber and stair, and the temple's quay on the shore,
// which stands a little above the lake (`lake: true` levels from LAKE.level).
const CRYPT_FACE = Math.atan2(252 - 292, 90 - 72);
const CRYPT_ROT = -CRYPT_FACE + Math.PI / 2;
// The crypt's chamber sits 3.3 m behind the pit centre (see Ruins.crypt).
const CRYPT_CHAMBER = { x: 72 + Math.cos(CRYPT_FACE) * -3.3, z: 292 + Math.sin(CRYPT_FACE) * -3.3 };
export const PITS = [
  // The barrow: a grassy mound heaped over the crypt (applied first)...
  { x: CRYPT_CHAMBER.x, z: CRYPT_CHAMBER.z, rot: CRYPT_ROT, hx: 5.0, hz: 6.2, depth: -2.6, apron: 9 },
  // ...then the chamber and stair cut down into it.
  { x: 72, z: 292, rot: CRYPT_ROT, hx: 3.8, hz: 7.8, depth: 2.4 },
  { x: 90, z: 252, rot: -Math.atan2(212 - 252, 132 - 90) + Math.PI / 2, hx: 7.0, hz: 5.5, depth: -1.3, lake: true, apron: 7 },
];

const CASTLE_ROAD = new Path(
  [
    [250, -70],
    [228, -84],
    [205, -92],
    [182, -90],
    [160, -90],
    [138, -98],
    [116, -110],
    [102, -128],
    [100, -148],
    [110, -163],
    [128, -167],
    [144, -159],
    [152, -157],
  ],
  { spacing: 2 }
);

export const ROADS = [
  { name: 'main', path: MAIN_ROAD, width: 4.6 },
  { name: 'overlook', path: OVERLOOK_ROAD, width: 3.4 },
  { name: 'castle', path: CASTLE_ROAD, width: 4.0 },
];

// Short lanes from each house door to the nearest road or the plaza.
for (const h of HOUSES) {
  if (h.noLane) continue;
  const q = MAIN_ROAD.nearest(h.door.x, h.door.z, 200);
  let tx = q.px;
  let tz = q.pz;
  const dPlaza = Math.hypot(h.door.x - PLAZA.x, h.door.z - PLAZA.z) - PLAZA.radius * 0.6;
  if (dPlaza < q.d) {
    const a = Math.atan2(h.door.z - PLAZA.z, h.door.x - PLAZA.x);
    tx = PLAZA.x + Math.cos(a) * PLAZA.radius * 0.6;
    tz = PLAZA.z + Math.sin(a) * PLAZA.radius * 0.6;
  }
  const mx = (h.door.x + tx) / 2;
  const mz = (h.door.z + tz) / 2;
  const back = { x: h.x + (h.door.x - h.x) * 0.55, z: h.z + (h.door.z - h.z) * 0.55 };
  ROADS.push({
    name: `lane-${h.seed}`,
    path: new Path([[back.x, back.z], [h.door.x, h.door.z], [mx, mz], [tx, tz]], { spacing: 1.5 }),
    width: 2.6,
  });
}

// Spatial index of which roads pass near each cell, so per-vertex queries only
// test the few roads that could be close.
const ROAD_CELL = 24;
const roadCells = new Map();
ROADS.forEach((road, ri) => {
  const p = road.path;
  for (let i = 0; i < p.count; i++) {
    const cx = Math.floor(p.x[i] / ROAD_CELL);
    const cz = Math.floor(p.z[i] / ROAD_CELL);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = (cx + dx) * 100003 + (cz + dz);
        let set = roadCells.get(key);
        if (!set) roadCells.set(key, (set = new Set()));
        set.add(ri);
      }
    }
  }
});

// Nearest road edge-distance within maxDist (<= 24 m). Returns
// { road, q, edge } where edge = distance from the road's edge (negative inside).
const _q = {};
export function nearestRoad(x, z, maxDist = 20) {
  const set = roadCells.get(Math.floor(x / ROAD_CELL) * 100003 + Math.floor(z / ROAD_CELL));
  if (!set) return null;
  let best = null;
  let bestEdge = maxDist;
  for (const ri of set) {
    const road = ROADS[ri];
    const q = road.path.nearest(x, z, maxDist + road.width / 2, _q);
    if (q && q.d - road.width / 2 < bestEdge) {
      bestEdge = q.d - road.width / 2;
      best = { road, q: { ...q }, edge: bestEdge };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Bridge where the main road crosses the river.

function findCrossing() {
  let best = null;
  const q = {};
  for (let i = 0; i < MAIN_ROAD.count; i++) {
    const r = RIVER.path.nearest(MAIN_ROAD.x[i], MAIN_ROAD.z[i], 10, q);
    if (r && (!best || r.d < best.d)) best = { d: r.d, s: MAIN_ROAD.s[i], riverS: r.s };
  }
  return best;
}

const crossing = findCrossing();
const bridgeCentre = MAIN_ROAD.pointAt(crossing.s);
const before = MAIN_ROAD.pointAt(crossing.s - 1);
const after = MAIN_ROAD.pointAt(crossing.s + 1);

export const BRIDGE = {
  x: bridgeCentre.x,
  z: bridgeCentre.y,
  // Bridge axis follows the road.
  rotationY: Math.atan2(after.x - before.x, after.y - before.y),
  roadS: crossing.s,
  riverS: crossing.riverS,
  length: RIVER.widthAt(crossing.riverS) + 9,
  width: 5.2,
};

// ---------------------------------------------------------------------------
// Spawn: on the main road west of the village, looking east along it.

export const SPAWN = (() => {
  const s = 120;
  const p = MAIN_ROAD.pointAt(MAIN_ROAD.length * 0 + s);
  const ahead = MAIN_ROAD.pointAt(s + 10);
  // Camera yaw: forward is (-sin yaw, -cos yaw).
  const yaw = Math.atan2(-(ahead.x - p.x), -(ahead.y - p.y));
  return { x: p.x, z: p.y, yaw };
})();
