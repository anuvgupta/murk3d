// The world plan: where the river, lake, roads, hill and village sit. Pure data
// plus geometric queries; Terrain, the ground mask, water, buildings and trees
// all read from here so they agree with one another.
//
// Axes: +x is east, -z is north. The village well sits at the origin.

import * as THREE from 'three';

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
  { design: 7, x: 29, z: 74, face: [60, 74], seed: 12 },
];

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

export const HILL = {
  // Plateau centre and radius; the cliff faces the village (south-east).
  x: -104,
  z: -100,
  radius: 30,
  height: 24,
  gentleWidth: 80, // slope width on the back side
  cliffWidth: 5, // slope width on the cliff side
  cliffDir: Math.atan2(100, 104), // angle (atan2(dz, dx)) pointing toward the village
  cliffSpread: 1.0, // radians either side of cliffDir that are cliff
};

export const OVERLOOK = { x: -86, z: -86 }; // a viewpoint near the cliff edge

export const ROADS = [
  { name: 'main', path: MAIN_ROAD, width: 4.6 },
  { name: 'overlook', path: OVERLOOK_ROAD, width: 3.4 },
];

// Short lanes from each house door to the nearest road or the plaza.
for (const h of HOUSES) {
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
