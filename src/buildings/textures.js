// Procedural building textures, painted per pixel at startup.
//
// Each generator returns { map, bump }: a colour texture and a matching
// greyscale height texture for bump mapping. Every texture tiles seamlessly.
// Noise comes from a shared tileable noise grid sampled at integer
// frequencies, which keeps generation fast (no per-pixel fractal noise).

import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';

// --- Noise sampling --------------------------------------------------------

let NOISE = null;
let NOISE_SIZE = 0;

// Call once with the shared noise DataTexture's data before generating.
export function setTextureNoise(texture) {
  NOISE = texture.image.data;
  NOISE_SIZE = texture.image.width;
}

// Tileable noise in [0, 1]; u, v in texture units (wrap at 1). Use integer
// frequencies for seamless tiling.
function nz(ch, u, v) {
  const s = NOISE_SIZE;
  const x = (((u % 1) + 1) % 1) * s;
  const y = (((v % 1) + 1) % 1) * s;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = (x0 + 1) % s;
  const y1 = (y0 + 1) % s;
  const fx = x - x0;
  const fy = y - y0;
  const d = NOISE;
  const a = d[(y0 * s + x0) * 4 + ch];
  const b = d[(y0 * s + x1) * 4 + ch];
  const c = d[(y1 * s + x0) * 4 + ch];
  const e = d[(y1 * s + x1) * 4 + ch];
  return ((a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy) / 255;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

// --- Output ----------------------------------------------------------------

function paint(size, fn) {
  const color = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  const out = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn(x / size, y / size, out);
      const o = (y * size + x) * 4;
      color[o] = out[0] * 255;
      color[o + 1] = out[1] * 255;
      color[o + 2] = out[2] * 255;
      color[o + 3] = 255;
      const h = out[3] * 255;
      height[o] = height[o + 1] = height[o + 2] = h;
      height[o + 3] = 255;
    }
  }
  return { map: toTexture(color, size, true), bump: toTexture(height, size, false) };
}

function toTexture(data, size, srgb) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

// --- Stone -----------------------------------------------------------------

// Coursed rubble: rows of rounded-rectangular stones of varying width and
// course height, laid in a broken bond. Each stone's outline wavers a little
// and is finely jagged, its face is rounded toward the joint and granular,
// and the mortar sits back in shadow. `courses` per tile, `aspect` is the
// typical stone width relative to its height.
function stoneWall({ size = 1024, courses = 9, aspect = 2.2, seed, palette, mortar, joint = 0.028, bevel = 0.08, moss = 0.25 }) {
  const random = mulberry32(seed);
  const rows = [];
  // Course heights, scaled to tile vertically.
  const hs = Array.from({ length: courses }, () => 0.8 + random() * 0.5);
  const total = hs.reduce((a, b) => a + b, 0);
  let y = 0;
  for (let r = 0; r < courses; r++) {
    const h = hs[r] / total;
    const stones = [];
    let x = -random() * 0.5 * h * aspect;
    while (x < 1) {
      const w = h * aspect * (0.6 + random() * 0.9);
      stones.push({ x, w, tint: palette[Math.floor(random() * palette.length)], l: 0.85 + random() * 0.3, k: random(), lichen: random() < 0.15 ? random() : 0 });
      x += w;
    }
    rows.push({ y, h, stones });
    y += h;
  }
  const findRow = (v) => {
    for (let r = rows.length - 1; r >= 0; r--) if (v >= rows[r].y) return rows[r];
    return rows[0];
  };
  return paint(size, (u, v, out) => {
    const row = findRow(v);
    // Wrap horizontally: the last stone runs past 1 and continues at 0.
    let st = null;
    for (const s of row.stones) if (u >= s.x && u < s.x + s.w) st = s;
    if (!st) {
      const last = row.stones[row.stones.length - 1];
      st = u < last.x ? last : row.stones[0];
    }
    const uu = u >= st.x ? u : u + 1;
    const lx = (uu - st.x) / st.w;
    const ly = (v - row.y) / row.h;
    // Edge distance in texture units, with gentle waviness and fine jaggedness.
    const wave = (nz(1, u * 10 + st.k, v * 10) - 0.5) * 0.02;
    const jag = (nz(3, u * 64 + st.k * 3, v * 64) - 0.5) * 0.012;
    const ex = Math.min(lx, 1 - lx) * st.w;
    const ey = Math.min(ly, 1 - ly) * row.h;
    const edge = Math.min(ex, ey) + wave + jag;
    const grain = nz(3, u * 24 + st.k, v * 24);
    const fine = nz(2, u * 48, v * 48);
    const half = joint * 0.5;
    if (edge < half) {
      const m = 0.8 + 0.4 * fine;
      out[0] = mortar[0] * m;
      out[1] = mortar[1] * m;
      out[2] = mortar[2] * m;
      out[3] = 0.05 + 0.1 * fine;
      return;
    }
    // Rounded face: shaded toward the joint, lit a little from above.
    const round = smooth(half, half + bevel, edge);
    const topLight = 0.94 + 0.12 * (1 - ly);
    const face = (0.62 + 0.38 * round) * (0.86 + 0.28 * grain) * (0.94 + 0.12 * fine) * topLight * st.l;
    let r = st.tint[0] * face;
    let g = st.tint[1] * face;
    let b = st.tint[2] * face;
    // Lichen and moss creep in from the joints.
    const damp = (1 - round) * moss * smooth(0.5, 0.75, nz(1, u * 6, v * 6));
    const lich = st.lichen ? smooth(0.6, 0.8, nz(0, u * 9 + st.lichen, v * 9)) * 0.45 : 0;
    r = mix(mix(r, 0.3, damp), 0.6, lich);
    g = mix(mix(g, 0.36, damp), 0.6, lich);
    b = mix(mix(b, 0.16, damp), 0.4, lich);
    out[0] = clamp01(r);
    out[1] = clamp01(g);
    out[2] = clamp01(b);
    out[3] = clamp01(0.3 + 0.55 * round + 0.15 * grain);
  });
}

const GREY_STONE = [
  [0.56, 0.53, 0.47],
  [0.6, 0.57, 0.51],
  [0.5, 0.48, 0.44],
  [0.62, 0.56, 0.46],
  [0.53, 0.53, 0.5],
  [0.66, 0.61, 0.53],
  [0.47, 0.44, 0.4],
];
const WARM_STONE = [
  [0.64, 0.55, 0.43],
  [0.68, 0.6, 0.48],
  [0.58, 0.5, 0.4],
  [0.7, 0.64, 0.54],
  [0.55, 0.5, 0.44],
];

export const rubbleStone = (seed = 1, warm = false) =>
  stoneWall({ courses: 9, aspect: 2.1, seed, palette: warm ? WARM_STONE : GREY_STONE, mortar: [0.38, 0.36, 0.32] });

// Small near-square setts for paving: tighter joints, flatter faces.
export const cobbleStone = (seed = 2) =>
  stoneWall({ size: 512, courses: 8, aspect: 1.15, seed, palette: GREY_STONE, mortar: [0.26, 0.24, 0.21], joint: 0.04, bevel: 0.1, moss: 0.4 });

// Dressed blocks for corners, door frames and the bridge: courses of
// rectangular stones with chamfered edges.
// `pale` gives the limestone of the white castle: light blocks, soft joints.
export function ashlarStone(seed = 3, pale = false) {
  const random = mulberry32(seed);
  const rows = 6;
  const rowData = [];
  for (let r = 0; r < rows; r++) {
    const breaks = [];
    let x = random() * 0.2;
    while (x < 1) {
      breaks.push(x);
      x += 0.2 + random() * 0.18;
    }
    rowData.push({ breaks, tints: breaks.map(() => 0.8 + random() * 0.35) });
  }
  return paint(512, (u, v, out) => {
    const r = Math.floor(v * rows);
    const fy = v * rows - r;
    const row = rowData[r];
    let k = row.breaks.length - 1;
    for (let i = 0; i < row.breaks.length; i++) if (u >= row.breaks[i]) k = i;
    if (u < row.breaks[0]) k = row.breaks.length - 1;
    const start = row.breaks[k];
    const end = k + 1 < row.breaks.length ? row.breaks[k + 1] : row.breaks[0] + 1;
    const uu = u < start ? u + 1 : u;
    const ex = Math.min(uu - start, end - uu) * 6;
    const ey = Math.min(fy, 1 - fy);
    const edge = Math.min(ex, ey);
    const joint = edge < 0.026;
    const fine = nz(3, u * 8, v * 8);
    // Weathering: rain streaks run down from the joint above each block,
    // dirt gathers in blotches, and every block has its own tint.
    const streak = (1 - smooth(0.0, 0.3, fy)) * (0.5 + 0.5 * nz(1, u * 40, v * 3));
    const blot = smooth(0.6, 0.82, nz(2, u * 5 + 3, v * 5)) * (0.6 + 0.4 * fine);
    const wear = (1 - 0.2 * streak) * (1 - 0.14 * blot);
    const t = row.tints[k] * (0.85 + 0.25 * nz(2, u * 8, v * 4)) * (0.6 + 0.4 * smooth(0.03, 0.12, edge));
    if (joint) {
      // Mortar: a little darker than the stone, never a drawn black line.
      const j = pale ? 0.62 : 1.0;
      out[0] = 0.45 * j * (0.8 + 0.3 * fine) + (pale ? 0.26 : 0);
      out[1] = 0.42 * j * (0.8 + 0.3 * fine) + (pale ? 0.26 : 0);
      out[2] = 0.38 * j * (0.8 + 0.3 * fine) + (pale ? 0.25 : 0);
      out[3] = 0.1;
    } else {
      const base = pale ? [0.84, 0.82, 0.78] : [0.62, 0.58, 0.52];
      const tt = (pale ? 0.76 + 0.26 * t : t) * wear;
      out[0] = clamp01(base[0] * tt);
      out[1] = clamp01(base[1] * tt);
      out[2] = clamp01(base[2] * tt * (pale ? 0.985 : 1));
      out[3] = 0.4 + 0.5 * smooth(0.03, 0.15, edge) + 0.1 * fine - 0.08 * blot;
    }
  });
}

// --- Plaster, wood ---------------------------------------------------------

export function plaster(tint = [0.86, 0.8, 0.68]) {
  return paint(512, (u, v, out) => {
    const broad = nz(0, u * 2, v * 2);
    const mid = nz(1, u * 4, v * 4);
    const fine = nz(3, u * 16, v * 16);
    const stucco = nz(2, u * 32, v * 32);
    const l = 0.9 + 0.08 * (broad - 0.5) + 0.06 * (mid - 0.5) + 0.05 * (fine - 0.5);
    const stain = smooth(0.62, 0.85, mid) * 0.12;
    out[0] = clamp01(tint[0] * l - stain * 0.6);
    out[1] = clamp01(tint[1] * l - stain * 0.55);
    out[2] = clamp01(tint[2] * l - stain * 0.5);
    out[3] = 0.5 + 0.3 * stucco + 0.2 * fine;
  });
}

// Long-grain timber; the grain runs along v.
export function timber(base = [0.3, 0.21, 0.13]) {
  return paint(512, (u, v, out) => {
    const warp = nz(1, u * 2, v * 1) * 0.4;
    const ring = Math.sin((u * 18 + warp * 6 + nz(2, u * 4, v * 2) * 1.5) * Math.PI * 2) * 0.5 + 0.5;
    const streak = nz(3, u * 32, v * 2);
    const knot = smooth(0.82, 0.92, nz(0, u * 4, v * 2));
    const l = 0.78 + 0.18 * ring + 0.14 * (streak - 0.5) - 0.25 * knot;
    out[0] = clamp01(base[0] * l * 1.1);
    out[1] = clamp01(base[1] * l * 1.1);
    out[2] = clamp01(base[2] * l * 1.1);
    out[3] = 0.4 + 0.35 * ring * streak + 0.25 * (1 - knot);
  });
}

// Vertical boards with dark gaps, for doors, shutters and barrels.
export function planks(base = [0.42, 0.3, 0.19], boards = 5) {
  const random = mulberry32(9);
  const tints = Array.from({ length: boards }, () => 0.82 + random() * 0.3);
  return paint(512, (u, v, out) => {
    const k = Math.floor(u * boards);
    const fu = u * boards - k;
    const gap = Math.min(fu, 1 - fu);
    const streak = nz(3, u * 32 + k * 0.13, v * 2);
    const ring = Math.sin((fu * 3 + nz(1, u * 4, v * 2)) * Math.PI * 4) * 0.5 + 0.5;
    const l = tints[k] * (0.82 + 0.16 * ring + 0.12 * (streak - 0.5)) * (0.55 + 0.45 * smooth(0.0, 0.06, gap));
    out[0] = clamp01(base[0] * l);
    out[1] = clamp01(base[1] * l);
    out[2] = clamp01(base[2] * l);
    out[3] = gap < 0.025 ? 0.05 : 0.55 + 0.3 * ring * streak;
  });
}

// Bark: wandering vertical furrows between broad rounded ridges, broken into
// plates, with fine grain. v runs along the trunk. `depth` widens the furrows.
// Furrows are the lines where a stretched noise crosses its midpoint, so they
// branch and join like real fissures and cover roughly a fifth of the surface.
export function bark(base = [0.32, 0.26, 0.2], fissures = 10, depth = 1) {
  return paint(512, (u, v, out) => {
    const warp = (nz(1, u * 2, v * 1) - 0.5) * 0.5 + (nz(2, u * 4, v * 3) - 0.5) * 0.2;
    const f1 = 1 - Math.abs(2 * nz(2, u * fissures * 0.5 + warp, v * 2) - 1);
    const f2 = 1 - Math.abs(2 * nz(3, u * fissures + warp * 1.5, v * 5) - 1);
    const w = 0.06 * depth;
    const furrow = Math.max(smooth(0.93 - w, 0.99, f1), smooth(0.95 - w * 0.6, 0.995, f2) * 0.7);
    const plate = smooth(0.84, 0.92, nz(0, u * 3 + warp, v * 10 + nz(1, u * 8, v * 2) * 0.5)) * 0.6;
    const grain = nz(3, u * 48, v * 6);
    const crack = Math.max(furrow, plate);
    // Ridge faces 0.9–1.25× base, furrow bottoms 0.3×.
    const l = mix(0.9 + 0.35 * (grain - 0.3), 0.3, crack);
    const tint = 0.9 + 0.2 * nz(0, u * 1 + 7, v * 4);
    // Pale weathered ridge tops where exposed.
    const weather = (1 - crack) * smooth(0.6, 0.85, nz(1, u * 6, v * 3)) * 0.3;
    out[0] = clamp01(mix(base[0] * l * tint, 0.6, weather));
    out[1] = clamp01(mix(base[1] * l * tint, 0.58, weather));
    out[2] = clamp01(mix(base[2] * l * tint, 0.5, weather));
    out[3] = clamp01(mix(0.75 + 0.25 * grain, 0.05, crack));
  });
}

// White birch bark with dark horizontal lenticels and peeling marks.
export function birchBark() {
  return paint(512, (u, v, out) => {
    const marks = smooth(0.72, 0.8, nz(2, u * 4, v * 16)) * smooth(0.3, 0.6, nz(1, u * 8, v * 2));
    const streak = nz(3, u * 32, v * 4);
    const l = 0.86 + 0.1 * streak;
    const dark = Math.max(marks, smooth(0.82, 0.9, nz(0, u * 2, v * 8)) * 0.8);
    out[0] = clamp01(mix(0.88 * l, 0.16, dark));
    out[1] = clamp01(mix(0.86 * l, 0.14, dark));
    out[2] = clamp01(mix(0.8 * l, 0.13, dark));
    out[3] = 0.6 - dark * 0.4 + 0.1 * streak;
  });
}

// --- Roofs -----------------------------------------------------------------
// Roof textures: courses run along u; each course's lower edge is at higher v.

function courses({ rows, seed, unit, palette, grain = 0.15, moss = 0.04, curve = 0 }) {
  const random = mulberry32(seed);
  const rowData = [];
  for (let r = 0; r < rows; r++) {
    const breaks = [];
    let x = r % 2 ? random() * 0.5 * unit : 0;
    while (x < 1) {
      breaks.push(x);
      x += unit * (0.7 + random() * 0.6);
    }
    rowData.push({
      breaks,
      tints: breaks.map(() => palette[Math.floor(random() * palette.length)].map((c) => c * (0.85 + random() * 0.3))),
      moss: breaks.map(() => (random() < moss ? 0.5 + random() * 0.5 : 0)),
    });
  }
  return paint(512, (u, v, out) => {
    const r = Math.floor(v * rows);
    const fy = v * rows - r;
    const row = rowData[r];
    let k = 0;
    for (let i = 0; i < row.breaks.length; i++) if (u >= row.breaks[i]) k = i;
    const start = row.breaks[k];
    const end = k + 1 < row.breaks.length ? row.breaks[k + 1] : 1;
    const span = end - start;
    const fx = (u - start) / span;
    const side = Math.min(fx, 1 - fx) * span;
    const tint = row.tints[k];
    const streak = nz(3, u * 32, v * 4);
    // Lower edge in shadow, a gap between neighbours, optional barrel curve.
    let l = 0.7 + 0.35 * fy;
    l *= 1 - grain + grain * 2 * streak;
    l *= 0.5 + 0.5 * smooth(0.0, 0.006, side);
    if (curve) l *= 0.65 + 0.45 * Math.sin(fx * Math.PI);
    if (fy > 0.92) l *= 0.45;
    let cr = tint[0] * l;
    let cg = tint[1] * l;
    let cb = tint[2] * l;
    const m = row.moss[k] * smooth(0.4, 0.7, nz(1, u * 8, v * 8));
    cr = mix(cr, 0.3, m);
    cg = mix(cg, 0.36, m);
    cb = mix(cb, 0.16, m);
    out[0] = clamp01(cr);
    out[1] = clamp01(cg);
    out[2] = clamp01(cb);
    out[3] = clamp01(0.25 + 0.6 * fy + 0.15 * streak) * (side < 0.003 ? 0.3 : 1);
  });
}

export const woodShingles = (seed = 5) =>
  courses({
    rows: 12,
    seed,
    unit: 0.07,
    palette: [
      [0.36, 0.27, 0.2],
      [0.32, 0.25, 0.2],
      [0.42, 0.32, 0.23],
      [0.29, 0.24, 0.21],
    ],
    grain: 0.2,
    moss: 0.05,
  });

export const slate = (seed = 6) =>
  courses({
    rows: 14,
    seed,
    unit: 0.09,
    palette: [
      [0.27, 0.29, 0.32],
      [0.31, 0.32, 0.35],
      [0.23, 0.25, 0.28],
      [0.34, 0.34, 0.36],
    ],
    grain: 0.08,
    moss: 0.03,
  });

export const clayTiles = (seed = 7) =>
  courses({
    rows: 10,
    seed,
    unit: 0.08,
    palette: [
      [0.62, 0.3, 0.18],
      [0.55, 0.27, 0.17],
      [0.68, 0.36, 0.22],
      [0.5, 0.26, 0.18],
    ],
    grain: 0.06,
    moss: 0.04,
    curve: 1,
  });

// Straw thatch: dense fine strands running down the roof, bundled into soft
// overlapping courses, weathered grey-brown in patches.
export function thatch(seed = 8) {
  const random = mulberry32(seed);
  const rows = 9;
  const offsets = Array.from({ length: rows }, () => random());
  return paint(512, (u, v, out) => {
    const r = Math.floor(v * rows);
    const fy = v * rows - r;
    const o = offsets[r];
    // Strands: high frequency across, stretched down the roof.
    const s1 = nz(3, u * 64 + o * 7, v * 4);
    const s2 = nz(2, u * 32 + o * 3, v * 2);
    const s3 = nz(3, u * 128 + o * 5, v * 8);
    const strand = Math.pow(s1 * 0.5 + s2 * 0.3 + s3 * 0.2, 1.4);
    const bundle = nz(1, u * 16 + o, v * 2);
    const weather = smooth(0.45, 0.8, nz(0, u * 4, v * 4));
    // Soft course edge: the butt ends of the course above shade the top.
    const course = 0.72 + 0.28 * smooth(0.0, 0.35, fy);
    const l = (0.45 + 0.75 * strand) * course * (0.85 + 0.3 * bundle);
    const gold = [0.72, 0.58, 0.32];
    const grey = [0.5, 0.45, 0.36];
    out[0] = clamp01(mix(gold[0], grey[0], weather * 0.7) * l);
    out[1] = clamp01(mix(gold[1], grey[1], weather * 0.7) * l);
    out[2] = clamp01(mix(gold[2], grey[2], weather * 0.7) * l);
    out[3] = clamp01(0.2 + 0.7 * strand * course);
  });
}

// Small soft puff for chimney smoke.
export function smokeTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
