import * as THREE from 'three';
import { createNoise2D, fbm, ridged, smoothstep, lerp } from '../util/noise.js';
import {
  WORLD_HALF,
  RIVER,
  LAKE,
  PLAZA,
  HOUSES,
  ROADS,
  HILL,
  BRIDGE,
  nearestRoad,
} from './plan.js';

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

    // A ring of jagged peaks that encloses the vale: broad massifs carved by
    // sharp ridgelines, with a domain warp so crests don't line up on a grid.
    let mountains = 0;
    const mountainMask = smoothstep(220, 560, r);
    if (mountainMask > 0) {
      const wx = x + fbm(this.noiseRoll, x * 0.002 + 9, z * 0.002, 3) * 120;
      const wz = z + fbm(this.noiseRoll, x * 0.002, z * 0.002 + 9, 3) * 120;
      const massif = fbm(this.noiseMount, wx * 0.0012, wz * 0.0012, 3) * 0.5 + 0.5;
      const ridge = ridged(this.noiseMount, wx * 0.0021, wz * 0.0021, 6);
      mountains = (massif * 140 + Math.pow(ridge, 1.15) * 260 * (0.4 + massif)) * mountainMask;
    }

    return hills + rolling + mountains + this.hillHeight(x, z);
  }

  // The overlook: a plateau with a gentle back slope and a sheer cliff facing the village.
  hillHeight(x, z) {
    const dx = x - HILL.x;
    const dz = z - HILL.z;
    const d = Math.hypot(dx, dz);
    const reach = HILL.radius + HILL.gentleWidth + 10;
    if (d > reach) return 0;
    const a = Math.atan2(dz, dx);
    let diff = Math.abs(a - HILL.cliffDir);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    const cliff = 1 - smoothstep(HILL.cliffSpread * 0.55, HILL.cliffSpread, diff);
    const width = lerp(HILL.gentleWidth, HILL.cliffWidth, cliff);
    // Ragged edge so the cliff line isn't a perfect arc.
    const edge = HILL.radius + this.noiseDetail(Math.cos(a) * 2.3, Math.sin(a) * 2.3) * 5 * (0.4 + cliff);
    const t = 1 - smoothstep(edge, edge + width, d);
    // Steps in the cliff face read as rock strata.
    const strata = cliff * 0.06 * Math.sin(d * 2.1) * (t > 0.05 && t < 0.95 ? 1 : 0);
    const top = this.noiseDetail(x * 0.05, z * 0.05) * 0.8;
    return HILL.height * (t + strata) + top * t;
  }

  preparePlan() {
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

  // Natural ground with the plaza and house plots levelled.
  plottedHeight(x, z) {
    let h = this.baseHeight(x, z);

    const dp = Math.hypot(x - PLAZA.x, z - PLAZA.z) - PLAZA.radius;
    if (dp < 10) h = lerp(this.plazaHeight, h, smoothstep(0, 10, dp));

    for (const house of HOUSES) {
      const dx = x - house.x;
      const dz = z - house.z;
      if (dx * dx + dz * dz > 400) continue;
      // Distance from the footprint rectangle (in the house's frame).
      const c = Math.cos(house.rotationY);
      const s = Math.sin(house.rotationY);
      const lx = c * dx - s * dz;
      const lz = s * dx + c * dz;
      const ex = Math.max(0, Math.abs(lx) - house.footprint.hx - 1.2);
      const ez = Math.max(0, Math.abs(lz) - house.footprint.hz - 1.2);
      const d = Math.hypot(ex, ez);
      if (d < 7) h = lerp(house.y, h, smoothstep(0, 7, d));
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
        const bank = level - 0.35 + e * 0.5 + Math.max(0, e - 8) ** 2 * 0.05;
        if (!onRoad) h = Math.min(h, bank);
        // Keep low ground beside the river from flooding.
        if (rq.d < w + 4) h = Math.max(h, level + 0.15 * smoothstep(w, w + 1.5, rq.d));
      }
    }

    const ldx = x - LAKE.x;
    const ldz = z - LAKE.z;
    const ld = Math.hypot(ldx, ldz);
    if (ld < LAKE.radius * 3.5) {
      const R = LAKE.radiusAt(Math.atan2(ldz, ldx));
      if (ld < R) {
        const k = ld / R;
        h = Math.min(h, LAKE.level - 0.4 - LAKE.depth * smoothstep(1, 0.3, k));
      } else {
        const e = ld - R;
        h = Math.min(h, LAKE.level - 0.4 + e * 0.3 + Math.max(0, e - 15) ** 2 * 0.03);
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

  // Heights as a float texture so shaders (grass) can find the ground.
  buildHeightTexture() {
    const side = this.segments + 1;
    const tex = new THREE.DataTexture(this.heights, side, side, THREE.RedFormat, THREE.FloatType);
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
`;
