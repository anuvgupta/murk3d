import * as THREE from 'three';
import { createNoise2D, fbm, ridged, smoothstep, lerp } from '../util/noise.js';
import { TERRACES } from '../buildings/Castle.js';
import {
  WORLD_HALF,
  RIVER,
  LAKE,
  PLAZA,
  HOUSES,
  ROADS,
  HILL,
  MESAS,
  CASTLES,
  BRIDGE,
  nearestRoad,
  PLATES,
  CREVASSES,
  LAKES,
  ISLETS,
  PITS,
} from './plan.js';
import { REGIONS, regionWeight } from './regions.js';

// The terrain grid is warped so cells are ~1.5 m wide around the village and
// widen to ~7 m out at the mountains: x = H * sinh(k u) / sinh(k), u in [-1, 1].
const SEGMENTS = 512;
const WARP = 2.2;
const SINH_K = Math.sinh(WARP);

const gridToWorld = (i) => (WORLD_HALF * Math.sinh(WARP * ((2 * i) / SEGMENTS - 1))) / SINH_K;
const worldToGrid = (x) => ((Math.asinh((x * SINH_K) / WORLD_HALF) / WARP + 1) * SEGMENTS) / 2;

export const TERRAIN_GRID = { segments: SEGMENTS, warp: WARP, half: WORLD_HALF };

export class Terrain {
  constructor(seed = 7) {
    this.noiseHills = createNoise2D(seed);
    this.noiseRoll = createNoise2D(seed + 1);
    this.noiseMount = createNoise2D(seed + 2);
    this.noiseDetail = createNoise2D(seed + 3);

    this.segments = SEGMENTS;
    this.coords = new Float32Array(SEGMENTS + 1);
    for (let i = 0; i <= SEGMENTS; i++) this.coords[i] = gridToWorld(i);

    this.preparePlan();

    this.heights = new Float32Array((SEGMENTS + 1) * (SEGMENTS + 1));
    this.geometry = this.buildGeometry();
    this.heightTexture = this.buildHeightTexture();
  }

  // -------------------------------------------------------------------------
  // Height functions.

  // Natural landform: hills in the vale, a ring of peaks, the overlook hill.
  baseHeight(x, z) {
    const r = Math.hypot(x, z * 0.85);

    const hillMask = 0.3 + 0.7 * smoothstep(40, 190, r);
    const hills = fbm(this.noiseHills, x * 0.0035, z * 0.0035, 5) * 16 * hillMask;
    const rolling = fbm(this.noiseRoll, x * 0.013, z * 0.013, 3) * 1.8;

    // A ring of mountains encloses the vale: broad massifs carrying long
    // ridgelines, domain-warped so crests bend, with fine erosion detail.
    let mountains = 0;
    const mountainMask = smoothstep(220, 560, r);
    if (mountainMask > 0) {
      const wx = x + fbm(this.noiseRoll, x * 0.0015 + 9, z * 0.0015, 3) * 160;
      const wz = z + fbm(this.noiseRoll, x * 0.0015, z * 0.0015 + 9, 3) * 160;
      const massif = fbm(this.noiseMount, wx * 0.0009, wz * 0.0009, 3) * 0.5 + 0.5;
      const ridge = ridged(this.noiseMount, wx * 0.0013, wz * 0.0013, 5);
      const detail = fbm(this.noiseHills, wx * 0.006, wz * 0.006, 3);
      const m = massif * 130 + ridge * 240 * (0.45 + massif) + detail * 16 * (0.5 + ridge);
      mountains = m * mountainMask;
    }

    // The realms: each carves a bowl out of the mountains and lays its own land.
    let vale = hills + rolling + mountains;
    let realm = 0;
    let rw = 0;
    for (const R of REGIONS) {
      const w = regionWeight(R, x, z);
      if (w <= 0) continue;
      const u = x - R.x;
      const v = z - R.z;
      const d = Math.hypot(u, v);
      realm += w * (R.floor + R.height(u, v, d, this.noiseDetail));
      rw = Math.min(1, rw + w);
    }
    const natural = vale * (1 - rw) + realm + this.hillHeight(x, z) + this.plateHeight(x, z);
    return natural + this.castleHeight(x, z, natural);
  }

  // Natural ground with mesas but before the castle's own shaping.
  naturalHeight(x, z) {
    const saved = this._skipCastle;
    this._skipCastle = true;
    const h = this.baseHeight(x, z);
    this._skipCastle = saved;
    return h;
  }

  // Terraces on the castle plateau: concentric flat wards stepping up to the
  // keep, each with a short steep riser. Also a level landing on the knoll's
  // rim where the bridge begins.
  castleHeight(x, z, natural) {
    if (this._skipCastle || this.plateauTop === undefined) return 0;
    let h = 0;
    for (const C of CASTLES) {
      const P = C.plateau;
      const dx = x - P.x;
      const dz = z - P.z;
      const d = Math.hypot(dx, dz);
      if (d < TERRACES[0].r + 5) {
        // The wards sit on one absolute level, whatever the hills do beneath.
        const inner = 1 - smoothstep(TERRACES[0].r - 1, TERRACES[0].r + 5, d);
        h += (C.plateauTop - natural) * inner;
        for (let k = 1; k < TERRACES.length; k++) {
          const T = TERRACES[k];
          const prev = TERRACES[k - 1];
          h += (T.h - prev.h) * (1 - smoothstep(T.r + 0.5, T.r + 3.0, d));
        }
      }
      // Level landing on the knoll's rim at the bridge foot, at the outer ward's height.
      const bf = C.bridgeFrom;
      const dl = Math.hypot(x - bf.x, z - bf.z);
      if (dl < 16) h += (C.landing - natural) * (1 - smoothstep(6, 16, dl));
    }
    return h;
  }

  // All mesas (the overlook, the castle knoll and plateau) summed.
  hillHeight(x, z) {
    let h = 0;
    for (const mesa of MESAS) h += this.mesaHeight(mesa, x, z);
    return h;
  }

  // The Shelves: tilted plates. Each is a wedge rising along its direction,
  // broken off sheer at the high end, with ragged sides. Plates overlap as
  // stacked shelves (max), not piled up (sum).
  plateHeight(x, z) {
    let h = 0;
    for (const p of PLATES) {
      const dx = x - p.x;
      const dz = z - p.z;
      const reach = p.length * 0.5 + p.width * 0.5 + 14;
      if (dx * dx + dz * dz > reach * reach) continue;
      const c = Math.cos(p.dir);
      const s = Math.sin(p.dir);
      const u = dx * c + dz * s;
      const v = -dx * s + dz * c;
      const n = this.noiseDetail(x * 0.06 + p.x, z * 0.06 + p.z);
      const n2 = this.noiseDetail(x * 0.21 + p.z, z * 0.21);
      const uHi = p.length / 2 + n * 2.5 + n2 * 0.8;
      const vEdge = p.width / 2 + n * 3.5 + n2 * 0.6;
      // Rising from ground level a little before the low edge.
      const ramp = Math.min(1, Math.max(0, (u + p.length / 2 + 8) / (p.length + 8)));
      const face = 1 - smoothstep(uHi, uHi + 3.2, u);
      const side = 1 - smoothstep(vEdge - 2, vEdge + 5 + 6 * (1 - ramp), Math.abs(v));
      const strata = face > 0.05 && face < 0.95 ? 0.05 * Math.sin(u * 2.3 + n * 4) : 0;
      const ph = p.rise * (Math.pow(ramp, 1.15) * face * side + strata * side);
      if (ph > h) h = ph;
    }
    return h;
  }

  // One mesa: a plateau with a gentle slope on most sides and a sheer cliff
  // within its cliff arc, with a ragged edge and rock strata on the cliff.
  mesaHeight(mesa, x, z) {
    const dx = x - mesa.x;
    const dz = z - mesa.z;
    const d = Math.hypot(dx, dz);
    const reach = mesa.radius + mesa.gentleWidth + 10;
    if (d > reach) return 0;
    const a = Math.atan2(dz, dx);
    const cliff = this.mesaCliffness(mesa, a);
    const width = lerp(mesa.gentleWidth, mesa.cliffWidth, cliff);
    let edge = this.mesaEdge(mesa, a);
    // A built-on mesa keeps a level top out to its flat radius.
    if (mesa.flatRadius) edge = Math.max(edge, mesa.flatRadius);
    const t = 1 - smoothstep(edge, edge + width, d);
    const strata = cliff * 0.06 * Math.sin(d * 2.1) * (t > 0.05 && t < 0.95 ? 1 : 0);
    const top = this.noiseDetail(x * 0.05 + mesa.x, z * 0.05) * 0.8;
    return mesa.height * (t + strata) + top * t;
  }

  // 0..1: how much of this mesa's rim at angle a is sheer cliff.
  mesaCliffness(mesa, a) {
    if (mesa.cliffSpread <= 0) return 0;
    if (mesa.cliffSpread >= Math.PI) return 1;
    let diff = Math.abs(a - mesa.cliffDir);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    return 1 - smoothstep(mesa.cliffSpread * 0.55, mesa.cliffSpread, diff);
  }

  // Radius of the mesa's edge at angle a: ragged, with buttresses and gullies
  // on the cliff side so the line is never a clean arc.
  mesaEdge(mesa, a) {
    const cliff = this.mesaCliffness(mesa, a);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const k = mesa.x * 0.01;
    const rag = mesa.rag ?? 1;
    return (
      mesa.radius +
      rag * this.noiseDetail(c * 2.3 + k, s * 2.3) * 5 * (0.4 + cliff) +
      rag * this.noiseDetail(c * 7 + 40 + k, s * 7) * 2.2 * cliff +
      rag * this.noiseDetail(c * 15 + 80 + k, s * 15) * 0.9 * cliff
    );
  }

  // Kept for the overlook's cliff rocks.
  hillCliffness(a) {
    return this.mesaCliffness(HILL, a);
  }
  hillEdge(a) {
    return this.mesaEdge(HILL, a);
  }

  preparePlan() {
    // Each castle's outer ward floor: the plateau's natural top, averaged
    // round the ward (sampled before terraces and landing exist).
    for (const C of CASTLES) {
      C.plateau.flatRadius = TERRACES[0].r + 1.5;
      let sum = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        sum += this.naturalHeight(C.plateau.x + Math.cos(a) * 24, C.plateau.z + Math.sin(a) * 24);
      }
      C.plateauTop = sum / 8;
      C.landing = C.plateauTop - 0.4;
    }
    this.plateauTop = CASTLES[0].plateauTop;
    this.castleLanding = CASTLES[0].landing;
    // Level plots for the plaza and each house.
    this.plazaHeight = this.baseHeight(PLAZA.x, PLAZA.z);
    for (const h of HOUSES) {
      let sum = 0;
      for (const [ox, oz] of [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        sum += this.baseHeight(h.x + ox * h.footprint.hx, h.z + oz * h.footprint.hz);
      }
      h.y = sum / 5;
    }

    // Road surface profiles: the levelled ground along each road, smoothed so
    // roads climb steadily instead of following every bump.
    for (const road of ROADS) {
      const p = road.path;
      const raw = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) raw[i] = this.plottedHeight(p.x[i], p.z[i]);
      const window = road.name === 'main' || road.name === 'overlook' ? 7 : 2;
      road.heights = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) {
        let sum = 0;
        let n = 0;
        for (let k = -window; k <= window; k++) {
          const j = Math.min(p.count - 1, Math.max(0, i + k));
          sum += raw[j];
          n++;
        }
        road.heights[i] = sum / n;
      }
    }

    // Water level along the river: never above the lower bank, and always
    // falling downstream.
    const rp = RIVER.path;
    RIVER.levels = new Float32Array(rp.count);
    let level = Infinity;
    for (let i = 0; i < rp.count; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(rp.count - 1, i + 1);
      const tx = rp.x[i1] - rp.x[i0];
      const tz = rp.z[i1] - rp.z[i0];
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len;
      const nz = tx / len;
      const w = RIVER.widthAt(rp.s[i]) / 2 + 1.5;
      const bank = Math.min(
        this.plottedHeight(rp.x[i], rp.z[i]),
        this.plottedHeight(rp.x[i] + nx * w, rp.z[i] + nz * w),
        this.plottedHeight(rp.x[i] - nx * w, rp.z[i] - nz * w)
      );
      const ds = i > 0 ? rp.s[i] - rp.s[i - 1] : 0;
      level = Math.min(level - ds * 0.004, bank - 1.0);
      RIVER.levels[i] = level;
    }

    // Lake level: the river's last level, or lower if the rim dips.
    let rim = Infinity;
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const r = LAKE.radiusAt(a) + 3;
      rim = Math.min(rim, this.plottedHeight(LAKE.x + Math.cos(a) * r, LAKE.z + Math.sin(a) * r));
    }
    LAKE.level = Math.min(level, rim - 0.8);
    RIVER.levels[rp.count - 1] = Math.max(LAKE.level, RIVER.levels[rp.count - 1]);

    // Bridge deck ends sit on the road at either bank.
    const main = ROADS[0];
    const half = BRIDGE.length / 2;
    BRIDGE.startHeight = main.path.sampleAt(main.heights, BRIDGE.roadS - half);
    BRIDGE.endHeight = main.path.sampleAt(main.heights, BRIDGE.roadS + half);
    BRIDGE.waterLevel = RIVER.path.sampleAt(RIVER.levels, BRIDGE.riverS);
  }

  // 0..1: how much a levelled plot claims this point (1 on the plot, fading over its apron).
  plotWeight(x, z) {
    let best = 0;
    for (const house of HOUSES) {
      const dx = x - house.x;
      const dz = z - house.z;
      if (dx * dx + dz * dz > 2500) continue;
      const c = Math.cos(house.rotationY);
      const s = Math.sin(house.rotationY);
      const lx = c * dx - s * dz;
      const lz = s * dx + c * dz;
      const ex = Math.max(0, Math.abs(lx) - house.footprint.hx - 1.2);
      const ez = Math.max(0, Math.abs(lz) - house.footprint.hz - 1.2);
      const d = Math.hypot(ex, ez);
      const apron = Math.min(34, Math.max(9, Math.abs(house.y - this.baseHeight(x, z)) * 3.1));
      best = Math.max(best, 1 - smoothstep(0, apron, d));
    }
    return best;
  }

  // 0..1: how much a levelled pit/plot claims this point.
  pitWeight(x, z, lakeOnly = false) {
    let best = 0;
    for (const pit of PITS) {
      if (lakeOnly && !pit.lake) continue;
      if (pit.lake && !Number.isFinite(LAKE.level)) continue;
      const dx = x - pit.x;
      const dz = z - pit.z;
      if (dx * dx + dz * dz > 900) continue;
      const c = Math.cos(pit.rot);
      const sn = Math.sin(pit.rot);
      const lx = c * dx - sn * dz;
      const lz = sn * dx + c * dz;
      const d = Math.hypot(Math.max(0, Math.abs(lx) - pit.hx), Math.max(0, Math.abs(lz) - pit.hz));
      best = Math.max(best, 1 - smoothstep(0.6, pit.apron || 3, d));
    }
    return best;
  }

  // Natural ground with the plaza and house plots levelled.
  plottedHeight(x, z) {
    let h = this.baseHeight(x, z);

    const dp = Math.hypot(x - PLAZA.x, z - PLAZA.z) - PLAZA.radius;
    if (dp < 10) h = lerp(this.plazaHeight, h, smoothstep(0, 10, dp));

    for (const house of HOUSES) {
      const dx = x - house.x;
      const dz = z - house.z;
      if (dx * dx + dz * dz > 2500) continue;
      // Distance from the footprint rectangle (in the house's frame).
      const c = Math.cos(house.rotationY);
      const s = Math.sin(house.rotationY);
      const lx = c * dx - s * dz;
      const lz = s * dx + c * dz;
      const ex = Math.max(0, Math.abs(lx) - house.footprint.hx - 1.2);
      const ez = Math.max(0, Math.abs(lz) - house.footprint.hz - 1.2);
      const d = Math.hypot(ex, ez);
      // The apron is wide enough that its slope stays under ~18 degrees.
      const apron = Math.min(34, Math.max(9, Math.abs(house.y - h) * 3.1));
      if (d < apron) h = lerp(house.y, h, smoothstep(0, apron, d));
    }
    // Sunken floors (the crypt): the ground drops to the pit floor inside the
    // rectangle, over a short apron outside it.
    for (const pit of PITS) {
      const dx = x - pit.x;
      const dz = z - pit.z;
      if (dx * dx + dz * dz > 900) continue;
      const c = Math.cos(pit.rot);
      const sn = Math.sin(pit.rot);
      const lx = c * dx - sn * dz;
      const lz = sn * dx + c * dz;
      const ex = Math.max(0, Math.abs(lx) - pit.hx);
      const ez = Math.max(0, Math.abs(lz) - pit.hz);
      const d = Math.hypot(ex, ez);
      // A lake-levelled plot waits until the lake level is known.
      if (pit.lake && !Number.isFinite(LAKE.level)) continue;
      if (pit.level === undefined) pit.level = pit.lake ? LAKE.level : this.baseHeight(pit.x, pit.z);
      const apron = pit.apron || 3;
      const target = pit.level - pit.depth;
      if (d < apron) h = lerp(target, h, smoothstep(0.6, apron, d));
    }
    return h;
  }

  // Final height: plots, then roads, then the river and lake carved in.
  shapedHeight(x, z) {
    let h = this.plottedHeight(x, z);

    const rq = RIVER.path.nearest(x, z, 64, this._rq || (this._rq = {}));
    const riverHalf = rq ? RIVER.widthAt(rq.s) / 2 : 0;
    const inRiverBand = rq && rq.d < riverHalf + 3;

    const road = nearestRoad(x, z, 6);
    const onRoad = road && !inRiverBand && road.edge < 4;
    if (road && !inRiverBand) {
      const rh = road.road.path.sampleAt(road.road.heights, road.q.s);
      const f = smoothstep(0, 5, road.edge);
      h = lerp(rh - 0.12, h, f);
    }

    if (rq) {
      const level = RIVER.path.sampleAt(RIVER.levels, rq.s);
      const w = riverHalf;
      if (rq.d < w) {
        const k = rq.d / w;
        h = level - 0.35 - RIVER.depth * (1 - k * k);
      } else {
        // Cut sloping banks, except where a road runs up to the bridge.
        // Steepening with distance, so the cut always meets the natural ground.
        const e = rq.d - w;
        const bank = level - 0.35 + e * 0.32 + Math.max(0, e - 10) ** 2 * 0.04;
        if (!onRoad) h = Math.min(h, bank);
        // Keep low ground beside the river from flooding.
        if (rq.d < w + 4) h = Math.max(h, level + 0.15 * smoothstep(w, w + 1.5, rq.d));
      }
    }

    for (const L of LAKES) {
      const ldx = x - L.x;
      const ldz = z - L.z;
      const ld = Math.hypot(ldx, ldz);
      if (ld >= L.radius * 3.5) continue;
      const R = L.radiusAt(Math.atan2(ldz, ldx));
      // A quay built out over the shore keeps its level through the cut.
      const quay = L === LAKE ? this.pitWeight(x, z, true) : 0;
      if (L.ring) {
        // A moat: water in the band between the island and the outer shore.
        const mid = (L.ring + R) / 2;
        const half = (R - L.ring) / 2;
        const k = Math.abs(ld - mid) / half;
        if (k < 1) h = Math.min(h, L.level - 0.4 - L.depth * (1 - k * k));
        else {
          const e = (k - 1) * half;
          h = Math.min(h, L.level - 0.4 + e * 0.35 + Math.max(0, e - 8) ** 2 * 0.04);
        }
      } else if (ld < R) {
        const k = ld / R;
        h = lerp(Math.min(h, L.level - 0.4 - L.depth * smoothstep(1, 0.3, k)), h, quay);
      } else {
        const e = ld - R;
        // A plunge pool's banks climb fast so the cliff above it survives the cut.
        const bank = L.steep ? L.level - 0.4 + e * 1.2 + Math.max(0, e - 6) ** 2 * 0.3 : L.level - 0.4 + e * 0.3 + Math.max(0, e - 15) ** 2 * 0.03;
        h = lerp(Math.min(h, bank), h, quay);
      }
      if (L !== LAKE) continue;
      // Islets rise out of the lake bed.
      for (const isl of ISLETS) {
        const di = Math.hypot(x - isl.x, z - isl.z);
        if (di < isl.r + 7) {
          const top = L.level + 1.1 + this.noiseDetail(x * 0.3, z * 0.3) * 0.25;
          const bed = L.level - 0.4 - L.depth;
          h = Math.max(h, lerp(top, bed, smoothstep(isl.r - 1.5, isl.r + 7, di)));
        }
      }
    }

    // The crevasse: a steep-walled gash whose floor descends by a long ramp
    // at the start and climbs out again at the far end.
    for (const C of CREVASSES) {
      const cq = C.path.nearest(x, z, 40, this._cq || (this._cq = {}));
      if (!cq) continue;
      const wob = this.noiseDetail(x * 0.04 + 31, z * 0.04) * 0.35 + this.noiseDetail(x * 0.15, z * 0.15 + 17) * 0.12;
      const half = (C.width / 2) * (1 + wob);
      if (cq.d < half + 2) {
        const L = C.path.length;
        const along = smoothstep(0, C.rampLength, cq.s) * (1 - smoothstep(L - C.tailLength, L, cq.s));
        const k = cq.d / half;
        const wall = 1 - smoothstep(0.74, 1.0, k);
        const floorBumps = this.noiseDetail(x * 0.12, z * 0.12 + 5) * 0.8;
        h -= C.depth * along * wall - floorBumps * wall;
      }
    }

    return h;
  }

  // -------------------------------------------------------------------------
  // Mesh.

  buildGeometry() {
    const n = this.segments;
    const side = n + 1;
    const positions = new Float32Array(side * side * 3);

    for (let j = 0; j <= n; j++) {
      const z = this.coords[j];
      for (let i = 0; i <= n; i++) {
        const x = this.coords[i];
        const idx = j * side + i;
        const h = this.shapedHeight(x, z);
        this.heights[idx] = h;
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = h;
        positions[idx * 3 + 2] = z;
      }
    }

    // Two triangles per cell, split along the (i+1, j) – (i, j+1) diagonal.
    // heightAt() and the grass shader rely on this exact split.
    const indices = new Uint32Array(n * n * 6);
    let k = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * side + i;
        const b = a + 1;
        const c = a + side;
        const d = c + 1;
        indices[k++] = a;
        indices[k++] = c;
        indices[k++] = b;
        indices[k++] = b;
        indices[k++] = c;
        indices[k++] = d;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  // Split the terrain into blocks so the camera and the sun's shadow pass
  // each draw only the blocks they can see.
  buildChunks(material, blocks = 8) {
    const n = this.segments;
    const side = n + 1;
    const step = n / blocks;
    const pos = this.geometry.attributes.position.array;
    const nrm = this.geometry.attributes.normal.array;
    const meshes = [];
    for (let bj = 0; bj < blocks; bj++) {
      for (let bi = 0; bi < blocks; bi++) {
        const i0 = bi * step;
        const j0 = bj * step;
        const w = step + 1;
        const positions = new Float32Array(w * w * 3);
        const normals = new Float32Array(w * w * 3);
        for (let j = 0; j < w; j++) {
          for (let i = 0; i < w; i++) {
            const src = ((j0 + j) * side + (i0 + i)) * 3;
            const dst = (j * w + i) * 3;
            positions[dst] = pos[src];
            positions[dst + 1] = pos[src + 1];
            positions[dst + 2] = pos[src + 2];
            normals[dst] = nrm[src];
            normals[dst + 1] = nrm[src + 1];
            normals[dst + 2] = nrm[src + 2];
          }
        }
        const indices = new Uint32Array(step * step * 6);
        let k = 0;
        for (let j = 0; j < step; j++) {
          for (let i = 0; i < step; i++) {
            const a = j * w + i;
            const b = a + 1;
            const c = a + w;
            const d = c + 1;
            indices.set([a, c, b, b, c, d], k);
            k += 6;
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        g.setIndex(new THREE.BufferAttribute(indices, 1));
        g.computeBoundingSphere();
        const mesh = new THREE.Mesh(g, material);
        mesh.name = 'terrain';
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        meshes.push(mesh);
      }
    }
    return meshes;
  }

  // Heights (R) and the surface normal's y (G, 1 = flat) as a float texture
  // so shaders (grass) can find the ground and its steepness in one fetch.
  buildHeightTexture() {
    const side = this.segments + 1;
    const data = new Float32Array(side * side * 2);
    const hts = this.heights;
    const c = this.coords;
    for (let j = 0; j < side; j++) {
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(side - 1, j + 1);
      for (let i = 0; i < side; i++) {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(side - 1, i + 1);
        const idx = j * side + i;
        const dhx = hts[j * side + i0] - hts[j * side + i1];
        const dhz = hts[j0 * side + i] - hts[j1 * side + i];
        const span = c[i1] - c[i0];
        data[idx * 2] = hts[idx];
        data[idx * 2 + 1] = span / Math.sqrt(dhx * dhx + span * span + dhz * dhz * ((span * span) / Math.max(1e-6, (c[j1] - c[j0]) ** 2)));
      }
    }
    const tex = new THREE.DataTexture(data, side, side, THREE.RGFormat, THREE.FloatType);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  // Exact height of the rendered surface at (x, z).
  heightAt(x, z) {
    const n = this.segments;
    const gi = Math.min(n - 1e-4, Math.max(0, worldToGrid(x)));
    const gj = Math.min(n - 1e-4, Math.max(0, worldToGrid(z)));
    const i = Math.floor(gi);
    const j = Math.floor(gj);
    const x0 = this.coords[i];
    const z0 = this.coords[j];
    const u = Math.min(1, Math.max(0, (x - x0) / (this.coords[i + 1] - x0)));
    const v = Math.min(1, Math.max(0, (z - z0) / (this.coords[j + 1] - z0)));

    const side = n + 1;
    const ha = this.heights[j * side + i];
    const hb = this.heights[j * side + i + 1];
    const hc = this.heights[(j + 1) * side + i];
    const hd = this.heights[(j + 1) * side + i + 1];

    if (u + v <= 1) return ha + (hb - ha) * u + (hc - ha) * v;
    return hd + (hc - hd) * (1 - u) + (hb - hd) * (1 - v);
  }

  worldToGrid(x) {
    return worldToGrid(x);
  }

  normalAt(x, z, target = new THREE.Vector3()) {
    const e = 0.75;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    return target.set(hl - hr, 2 * e, hd - hu).normalize();
  }
}

// GLSL that mirrors Terrain.heightAt(), for vertex shaders. Needs
// `uniform sampler2D uHeightMap;` declared by the including shader.
export const TERRAIN_HEIGHT_GLSL = /* glsl */ `
  const float T_SEG = ${SEGMENTS.toFixed(1)};
  const float T_WARP = ${WARP.toFixed(6)};
  const float T_HALF = ${WORLD_HALF.toFixed(1)};
  const float T_SINHK = ${SINH_K.toFixed(6)};

  float terrainCoord( float i ) {
    return T_HALF * sinh( T_WARP * ( 2.0 * i / T_SEG - 1.0 ) ) / T_SINHK;
  }

  float terrainHeight( vec2 p ) {
    vec2 g = ( asinh( p * T_SINHK / T_HALF ) / T_WARP + 1.0 ) * T_SEG * 0.5;
    g = clamp( g, vec2( 0.0 ), vec2( T_SEG - 0.0001 ) );
    vec2 cell = floor( g );
    vec2 c0 = vec2( terrainCoord( cell.x ), terrainCoord( cell.y ) );
    vec2 c1 = vec2( terrainCoord( cell.x + 1.0 ), terrainCoord( cell.y + 1.0 ) );
    vec2 f = clamp( ( p - c0 ) / ( c1 - c0 ), 0.0, 1.0 );
    ivec2 ic = ivec2( cell );
    float ha = texelFetch( uHeightMap, ic, 0 ).r;
    float hb = texelFetch( uHeightMap, ic + ivec2( 1, 0 ), 0 ).r;
    float hc = texelFetch( uHeightMap, ic + ivec2( 0, 1 ), 0 ).r;
    float hd = texelFetch( uHeightMap, ic + ivec2( 1, 1 ), 0 ).r;
    if ( f.x + f.y <= 1.0 ) return ha + ( hb - ha ) * f.x + ( hc - ha ) * f.y;
    return hd + ( hc - hd ) * ( 1.0 - f.x ) + ( hb - hd ) * ( 1.0 - f.y );
  }

  // Surface normal y (1 = flat, 0 = vertical) at the nearest grid vertex.
  float terrainSlope( vec2 p ) {
    vec2 g = ( asinh( p * T_SINHK / T_HALF ) / T_WARP + 1.0 ) * T_SEG * 0.5;
    ivec2 ic = ivec2( clamp( g + 0.5, vec2( 0.0 ), vec2( T_SEG ) ) );
    return texelFetch( uHeightMap, ic, 0 ).g;
  }
`;
