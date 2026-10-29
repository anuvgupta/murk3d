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

// Irregular rubble or cobble stones: a weighted Voronoi (power) diagram over
// jittered cells, so every stone has its own size and outline. Cells are
// stretched horizontally for coursed rubble.
function stoneWall({ size = 1024, cellsX, cellsY, seed, palette, mortar, mortarWidth = 0.07, roundness = 0.22 }) {
  const random = mulberry32(seed);
  const cells = [];
  for (let j = 0; j < cellsY; j++) {
    for (let i = 0; i < cellsX; i++) {
      const tint = palette[Math.floor(random() * palette.length)];
      const l = 0.78 + random() * 0.4;
      cells.push({
        px: i + 0.15 + random() * 0.7,
        py: j + 0.15 + random() * 0.7,
        w: Math.pow(random(), 1.5) * 0.5, // power-diagram weight: some stones much bigger
        c: [tint[0] * l, tint[1] * l, tint[2] * l],
        lichen: random() < 0.12 ? random() : 0,
        k: random(),
      });
    }
  }
  const cell = (i, j) => cells[(((j % cellsY) + cellsY) % cellsY) * cellsX + (((i % cellsX) + cellsX) % cellsX)];

  return paint(size, (u, v, out) => {
    const gx = u * cellsX;
    const gy = v * cellsY;
    const ci = Math.floor(gx);
    const cj = Math.floor(gy);
    let d1 = Infinity;
    let d2 = Infinity;
    let b1 = null;
    let p1x = 0;
    let p1y = 0;
    let p2x = 0;
    let p2y = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const c = cell(ci + di, cj + dj);
        const px = Math.floor(gx) + di + (c.px - Math.floor(c.px));
        const py = Math.floor(gy) + dj + (c.py - Math.floor(c.py));
        const dx = gx - px;
        const dy = gy - py;
        const d = dx * dx + dy * dy - c.w;
        if (d < d1) {
          d2 = d1;
          p2x = p1x;
          p2y = p1y;
          d1 = d;
          b1 = c;
          p1x = px;
          p1y = py;
        } else if (d < d2) {
          d2 = d;
          p2x = px;
          p2y = py;
        }
      }
    }
    // Distance to the boundary between the two nearest cells.
    const sep = Math.hypot(p2x - p1x, p2y - p1y) || 1;
    const edge = (d2 - d1) / (2 * sep);
    const wobble = (nz(2, u * 4, v * 4) - 0.5) * 0.05;
    const mw = mortarWidth + wobble;
    const fine = nz(3, u * 8, v * 8);
    const grain = nz(2, u * 16 + b1.k, v * 16);

    if (edge < mw) {
      const m = 0.85 + 0.3 * fine;
      out[0] = mortar[0] * m;
      out[1] = mortar[1] * m;
      out[2] = mortar[2] * m;
      out[3] = 0.08 + 0.1 * fine;
      return;
    }
    // Rounded stone faces: darker toward the joints, lit a little from above.
    const round = smooth(mw, mw + roundness, edge);
    const shade = (0.62 + 0.38 * round) * (0.82 + 0.28 * grain) * (0.92 + 0.12 * (b1.py - gy + 0.5));
    let r = b1.c[0] * shade;
    let g = b1.c[1] * shade;
    let b = b1.c[2] * shade;
    if (b1.lichen) {
      const lich = smooth(0.55, 0.75, nz(1, u * 8 + b1.lichen, v * 8)) * 0.6;
      r = mix(r, 0.52, lich);
      g = mix(g, 0.55, lich);
      b = mix(b, 0.32, lich);
    }
    out[0] = clamp01(r);
    out[1] = clamp01(g);
    out[2] = clamp01(b);
    out[3] = 0.35 + 0.5 * round + 0.15 * grain;
  });
}

const GREY_STONE = [
  [0.47, 0.44, 0.39],
  [0.53, 0.5, 0.44],
  [0.41, 0.39, 0.35],
  [0.52, 0.46, 0.37],
  [0.44, 0.43, 0.41],
  [0.58, 0.53, 0.45],
  [0.38, 0.35, 0.31],
];
const WARM_STONE = [
  [0.55, 0.47, 0.37],
  [0.6, 0.53, 0.42],
  [0.5, 0.43, 0.35],
  [0.62, 0.57, 0.49],
  [0.47, 0.43, 0.39],
];

export const rubbleStone = (seed = 1, warm = false) =>
  stoneWall({
    cellsX: 6,
    cellsY: 10,
    seed,
    palette: warm ? WARM_STONE : GREY_STONE,
    mortar: [0.34, 0.32, 0.28],
    mortarWidth: 0.045,
    roundness: 0.3,
  });

export const cobbleStone = (seed = 2) =>
  stoneWall({
    size: 512,
    cellsX: 9,
    cellsY: 9,
    seed,
    palette: GREY_STONE,
    mortar: [0.3, 0.28, 0.25],
    mortarWidth: 0.06,
    roundness: 0.3,
  });

// Dressed blocks for corners, door frames and the bridge: courses of
// rectangular stones with chamfered edges.
export function ashlarStone(seed = 3) {
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
    const joint = edge < 0.035;
    const fine = nz(3, u * 8, v * 8);
    const t = row.tints[k] * (0.85 + 0.25 * nz(2, u * 8, v * 4)) * (0.6 + 0.4 * smooth(0.03, 0.12, edge));
    if (joint) {
      out[0] = 0.45 * (0.8 + 0.3 * fine);
      out[1] = 0.42 * (0.8 + 0.3 * fine);
      out[2] = 0.38 * (0.8 + 0.3 * fine);
      out[3] = 0.1;
    } else {
      out[0] = clamp01(0.62 * t);
      out[1] = clamp01(0.58 * t);
      out[2] = clamp01(0.52 * t);
      out[3] = 0.4 + 0.5 * smooth(0.03, 0.15, edge) + 0.1 * fine;
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

// Bark with vertical fissures; v runs along the trunk.
export function bark(base = [0.32, 0.26, 0.2], fissures = 10) {
  return paint(512, (u, v, out) => {
    const w = nz(1, u * 4, v * 2) * 0.35;
    const ridge = Math.abs(Math.sin((u * fissures + w * 3) * Math.PI));
    const plates = smooth(0.15, 0.6, ridge) * (0.7 + 0.3 * nz(2, u * 8, v * 2));
    const fine = nz(3, u * 32, v * 8);
    const l = 0.45 + 0.55 * plates + 0.1 * (fine - 0.5);
    out[0] = clamp01(base[0] * l * 1.2);
    out[1] = clamp01(base[1] * l * 1.2);
    out[2] = clamp01(base[2] * l * 1.2);
    out[3] = 0.15 + 0.75 * plates + 0.1 * fine;
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
