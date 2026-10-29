// The outer realms: ten reference worlds built as regions ringed around the
// Vale, out beyond the mountains, each reached through a portal gate. A
// region owns a bowl carved out of the mountain ring, its own landform
// (`height`), palette (ground/grass tint, haze, grade), flora and set pieces.
// Everything here is data and pure height functions; the systems (Terrain,
// Grass, Forest, Environment, Portals…) read it.

import { smoothstep, lerp } from '../util/noise.js';

const RING = 585; // distance of the realms from the Vale's centre
const TAU = Math.PI * 2;
const at = (k) => ({ x: Math.round(Math.cos((k / 10) * TAU) * RING), z: Math.round(Math.sin((k / 10) * TAU) * RING * 0.92) });

// Shared helpers for the height functions. (u, v) are metres from the region
// centre; `n` is the terrain's detail noise (2D, -1..1).
const bowl = (d, r) => 1 - smoothstep(r * 0.55, r, d);

export const REGIONS = [
  {
    id: 'karst',
    name: 'Karst Spire Lake',
    tagline: 'Limestone towers over still water',
    ...at(0), r: 150,
    floor: 6,
    palette: { ground: [0.92, 1.0, 0.86], grass: [0.95, 1.04, 0.86], fog: [0.72, 0.84, 0.84], fogDensity: 1.3, saturation: 1.12 },
    lake: { r: 54, depth: 7, level: 1.5, tint: [0.6, 1.9, 1.7] },
    spires: { count: 40, rMin: 5, rMax: 14, hMin: 34, hMax: 96, seed: 11 },
    arches: [{ dx: 75, dz: -39, r: 13, tube: 3.6, ry: 1.1 }],
    rocks: 24,
    flora: [{ species: 'willow', density: 2.2, spacing: 8 }, { species: 'pine', density: 1.4, spacing: 8 }],
    height(u, v, d, n) {
      // Gentle meadow floor with low hummocks.
      return 2.5 * n(u * 0.03, v * 0.03) + 0.8 * n(u * 0.1, v * 0.1);
    },
  },
  {
    id: 'sky',
    name: 'Floating Isles',
    tagline: 'Islands adrift above the cloud sea',
    ...at(1), r: 150,
    floor: -70,
    palette: { ground: [0.9, 0.95, 1.0], grass: [0.9, 1.0, 1.0], fog: [0.82, 0.88, 0.96], fogDensity: 0.6, saturation: 1.05 },
    mist: { top: -20 }, // the cloud sea fills the bowl
    gate: { dx: 0, dz: 0, y: 28, face: Math.PI / 2 }, // on the main island
    islands: [
      { x: 0, z: 0, r: 26, y: 8 },
      { x: 48, z: 22, r: 15, y: 16 },
      { x: -40, z: 34, r: 12, y: 13 },
      { x: 12, z: -52, r: 17, y: 22 },
      { x: -52, z: -28, r: 10, y: 27 },
    ],
    flora: [],
    height(u, v, d, n) {
      return -4 * n(u * 0.02, v * 0.02);
    },
  },
  {
    id: 'citadel',
    name: 'Mountain Citadel',
    tagline: 'A fortress on the roof of the world',
    ...at(2), r: 150,
    floor: 60,
    palette: { ground: [0.96, 0.96, 0.9], grass: [0.9, 0.96, 0.82], fog: [0.8, 0.84, 0.9], fogDensity: 0.9, saturation: 1.05 },
    mesas: [{ dx: 0, dz: 0, radius: 40, height: 44, gentleWidth: 24, cliffWidth: 10, cliffDir: 0, cliffSpread: 4 }],
    castle: { knoll: { dx: -64, dz: 46 } },
    gate: { dx: -64, dz: 46 }, // arrive on the knoll, the bridge ahead
    rocks: 36,
    flora: [{ species: 'pine', density: 2.0, spacing: 8 }, { species: 'juniper', density: 1.0, spacing: 8 }],
    height(u, v, d, n) {
      // Rising rocky shoulders toward the rim.
      return 14 * n(u * 0.02, v * 0.02) + 10 * smoothstep(60, 140, d) + 1.5 * n(u * 0.09, v * 0.09);
    },
  },
  {
    id: 'alpine',
    name: 'Granite Valley',
    tagline: 'A glacier-carved vale of pines',
    ...at(3), r: 160,
    floor: 20,
    palette: { ground: [0.95, 0.97, 0.9], grass: [0.9, 1.0, 0.8], fog: [0.8, 0.86, 0.92], fogDensity: 0.8, saturation: 1.06 },
    lake: { r: 24, depth: 4, level: 0.4, dx: 10, dz: 30 },
    falls: [{ from: { dx: 76, dz: 30 }, to: { dx: 35, dz: 30 }, w: 9 }],
    gate: { dx: 0, dz: -70 },
    rocks: 70,
    flora: [{ species: 'pine', density: 5.0, spacing: 7 }, { species: 'birch', density: 1.0, spacing: 6 }],
    height(u, v, d, n) {
      // U-shaped trough running north–south, granite walls climbing steeply.
      const across = Math.abs(u) / 55;
      const wall = Math.pow(Math.max(0, across - 0.35), 2.2) * 95;
      return wall + 3 * n(u * 0.03, v * 0.03) + 1.2 * n(u * 0.12, v * 0.12) - 6 * smoothstep(90, 150, Math.abs(v));
    },
  },
  {
    id: 'jungle',
    name: 'Ancient Jungle',
    tagline: 'Giants of the green and the temples they swallowed',
    ...at(4), r: 150,
    floor: 4,
    palette: { ground: [0.82, 0.95, 0.74], grass: [0.78, 1.0, 0.7], fog: [0.72, 0.84, 0.7], fogDensity: 1.8, saturation: 1.18 },
    flora: [{ species: 'giant', density: 6.0, spacing: 11 }, { species: 'oak', density: 2.5, spacing: 8 }, { species: 'willow', density: 1.0, spacing: 8 }],
    ruins: ['stones', 'arcade'],
    height(u, v, d, n) {
      return 7 * n(u * 0.025, v * 0.025) + 1.5 * n(u * 0.11, v * 0.11);
    },
  },
  {
    id: 'rivercity',
    name: 'White River Citadel',
    tagline: 'Pale towers on an island in the stream',
    ...at(5), r: 150,
    floor: 8,
    palette: { ground: [0.96, 0.98, 0.9], grass: [0.96, 1.02, 0.86], fog: [0.84, 0.88, 0.9], fogDensity: 0.9, saturation: 1.08 },
    lake: { r: 62, depth: 4, level: 0.6, ring: 30 }, // a moat: water between r=30 and r=62
    town: { white: true, r: 22 },
    gate: { dx: 55, dz: 55 },
    flora: [{ species: 'blossom', density: 1.6, spacing: 7 }, { species: 'oak', density: 0.8, spacing: 10 }],
    height(u, v, d, n) {
      return 3 * n(u * 0.03, v * 0.03) + 4 * (1 - smoothstep(20, 34, d));
    },
  },
  {
    id: 'moonlit',
    name: 'Moonlit Ruins',
    tagline: 'Teal night over a drowned sanctuary',
    ...at(6), r: 150,
    floor: 3,
    night: true,
    palette: { ground: [0.7, 0.9, 0.95], grass: [0.6, 0.9, 0.95], fog: [0.25, 0.5, 0.55], fogDensity: 1.6, saturation: 1.1 },
    lake: { r: 40, depth: 3, level: 0.5, dx: 20, dz: -10, tint: [0.7, 1.6, 1.8] },
    ruins: ['chapel', 'arcade', 'stones'],
    crystals: { colour: 0x58e0d8, count: 40 },
    flora: [{ species: 'duskwood', density: 2.5, spacing: 8 }, { species: 'dead', density: 1.0, spacing: 10 }],
    height(u, v, d, n) {
      return 4 * n(u * 0.03, v * 0.03) + n(u * 0.1, v * 0.1);
    },
  },
  {
    id: 'tundra',
    name: 'Crystal Tundra',
    tagline: 'Ice and starlight on the high waste',
    ...at(7), r: 150,
    floor: 30,
    palette: { ground: [1.3, 1.32, 1.4], grass: [1.1, 1.1, 1.2], fog: [0.86, 0.9, 0.98], fogDensity: 1.2, saturation: 0.85, grassDensity: 0.35 },
    snow: 1,
    rocks: 30,
    crystals: { colour: 0x9fd8ff, count: 70, big: true },
    flora: [{ species: 'dead', density: 0.8, spacing: 12 }, { species: 'pine', density: 0.5, spacing: 10 }],
    height(u, v, d, n) {
      return 6 * n(u * 0.025, v * 0.025) + 1.2 * n(u * 0.1, v * 0.1);
    },
  },
  {
    id: 'cliffruins',
    name: 'Overgrown Cliffs',
    tagline: 'A lost city on a green precipice',
    ...at(8), r: 150,
    floor: 10,
    palette: { ground: [0.9, 1.0, 0.84], grass: [0.9, 1.04, 0.8], fog: [0.78, 0.86, 0.84], fogDensity: 1.2, saturation: 1.12 },
    mesas: [{ dx: -20, dz: 0, radius: 56, height: 62, gentleWidth: 60, cliffWidth: 9, cliffDir: 0, cliffSpread: 1.4 }],
    lake: { r: 12, depth: 3, level: 0.6, dx: 64, dz: 2, steep: true }, // plunge pool under the cliff
    falls: [{ from: { dx: 34, dz: 2 }, to: { dx: 53, dz: 2 }, w: 9 }],
    arches: [{ dx: 30, dz: -70, r: 13, tube: 3, ry: 0.4 }],
    ruins: ['chapel', 'tower', 'stones'],
    rocks: 26,
    flora: [{ species: 'oak', density: 3.0, spacing: 8 }, { species: 'willow', density: 1.0, spacing: 8 }, { species: 'giant', density: 0.6, spacing: 14 }],
    height(u, v, d, n) {
      return 4 * n(u * 0.03, v * 0.03) + n(u * 0.1, v * 0.1);
    },
  },
  {
    id: 'canyon',
    name: 'Canyon Shrine',
    tagline: 'A ring of stone in red rock',
    ...at(9), r: 150,
    floor: 24,
    palette: { ground: [1.15, 0.9, 0.72], grass: [1.1, 0.95, 0.6], fog: [0.92, 0.82, 0.7], fogDensity: 0.7, saturation: 1.15, grassDensity: 0.45 },
    canyon: { width: 34, depth: 30 }, // a gorge running east–west through the bowl
    arches: [{ dx: -58, dz: 8.6, r: 24, tube: 4.5, ry: -1.17 }, { dx: 44, dz: 2.9, r: 24, tube: 4.2, ry: 1.3 }], // spanning the gorge
    gate: { dx: 0, dz: 0, face: 0 }, // the shrine ring on the canyon floor
    rocks: 40,
    flora: [{ species: 'juniper', density: 1.2, spacing: 9 }, { species: 'dead', density: 0.6, spacing: 12 }],
    height(u, v, d, n) {
      // Red mesa country: stepped benches.
      const bench = Math.floor((n(u * 0.02, v * 0.02) + 1) * 2.5) * 3.5;
      return bench + 2 * n(u * 0.08, v * 0.08);
    },
  },
];

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

// Influence of a region at (x, z): 1 inside, fading to 0 over the rim.
export function regionWeight(region, x, z) {
  const d = Math.hypot(x - region.x, z - region.z);
  if (d > region.r + 70) return 0;
  return 1 - smoothstep(region.r - 20, region.r + 70, d);
}

// The region whose bowl contains (x, z) most, with its weight.
export function regionAt(x, z) {
  let best = null;
  let bw = 0;
  for (const r of REGIONS) {
    const w = regionWeight(r, x, z);
    if (w > bw) {
      bw = w;
      best = r;
    }
  }
  return { region: best, weight: bw };
}

export { lerp };
