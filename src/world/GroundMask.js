// Rasterises the world plan into a texture covering the whole terrain:
//   R: grass density (0 on roads, water, plots and the plaza)
//   G: dirt road
//   B: water bed (river and lake)
//   A: cobbled plaza
// Shaders sample it to shade the ground and to keep grass off roads; the CPU
// copy answers the same questions for placing trees and rocks.

import * as THREE from 'three';
import { WORLD_SIZE, WORLD_HALF, RIVER, LAKES, PLAZA, HOUSES, ROADS, BRIDGE, CASTLES } from './plan.js';
import { REGIONS } from './regions.js';

const SIZE = 2048;
const PX = SIZE / WORLD_SIZE; // pixels per metre

const toPx = (v) => (v + WORLD_HALF) * PX;

function layer() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return ctx;
}

function strokePath(ctx, path, widthFn) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Constant width: one polyline. Varying width: short overlapping strokes.
  if (typeof widthFn === 'number') {
    ctx.lineWidth = widthFn * PX;
    ctx.beginPath();
    ctx.moveTo(toPx(path.x[0]), toPx(path.z[0]));
    for (let i = 1; i < path.count; i++) ctx.lineTo(toPx(path.x[i]), toPx(path.z[i]));
    ctx.stroke();
    return;
  }
  for (let i = 0; i < path.count - 1; i += 2) {
    const j = Math.min(path.count - 1, i + 3);
    ctx.lineWidth = widthFn(path.s[i]) * PX;
    ctx.beginPath();
    ctx.moveTo(toPx(path.x[i]), toPx(path.z[i]));
    ctx.lineTo(toPx(path.x[j]), toPx(path.z[j]));
    ctx.stroke();
  }
}

// A road's width wanders along its length, so its edge is never a ruled line.
function roadWobble(s) {
  return 1 + 0.1 * Math.sin(s * 0.21) + 0.1 * Math.sin(s * 0.067 + 1.3) + 0.05 * Math.sin(s * 0.53 + 0.4);
}

function fillLake(ctx, grow) {
  for (const LAKE of LAKES) {
    ctx.beginPath();
    for (let k = 0; k <= 96; k++) {
      const a = (k / 96) * Math.PI * 2;
      const r = LAKE.radiusAt(a) + grow;
      const x = toPx(LAKE.x + Math.cos(a) * r);
      const y = toPx(LAKE.z + Math.sin(a) * r);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (LAKE.ring) {
      // A moat: leave the island in the middle.
      for (let k = 0; k <= 96; k++) {
        const a = -(k / 96) * Math.PI * 2;
        const r = LAKE.ring - grow;
        const x = toPx(LAKE.x + Math.cos(a) * r);
        const y = toPx(LAKE.z + Math.sin(a) * r);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.fill('evenodd');
  }
}

function fillRotRect(ctx, x, z, hx, hz, rot) {
  ctx.save();
  ctx.translate(toPx(x), toPx(z));
  // Canvas y is world z; a yaw of rot maps local +z to (sin, cos).
  ctx.rotate(-rot);
  ctx.fillRect(-hx * PX, -hz * PX, hx * 2 * PX, hz * 2 * PX);
  ctx.restore();
}

// Separable 3-tap box blur over all four channels, softening edges.
function blur(data) {
  const tmp = new Uint8Array(data.length);
  const row = SIZE * 4;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const o = y * row + x * 4;
      const l = x > 0 ? o - 4 : o;
      const r = x < SIZE - 1 ? o + 4 : o;
      for (let c = 0; c < 4; c++) tmp[o + c] = (data[l + c] + data[o + c] * 2 + data[r + c] + 2) >> 2;
    }
  }
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const o = y * row + x * 4;
      const u = y > 0 ? o - row : o;
      const d = y < SIZE - 1 ? o + row : o;
      for (let c = 0; c < 4; c++) data[o + c] = (tmp[u + c] + tmp[o + c] * 2 + tmp[d + c] + 2) >> 2;
    }
  }
}

export class GroundMask {
  constructor(terrain, { cutouts = [] } = {}) {
    const grass = layer();
    const road = layer();
    const water = layer();
    const cobble = layer();
    cobble.fillStyle = '#000';
    cobble.fillRect(0, 0, SIZE, SIZE);

    // Grass everywhere, then cut out everything that isn't meadow.
    grass.fillStyle = '#fff';
    grass.fillRect(0, 0, SIZE, SIZE);
    grass.fillStyle = grass.strokeStyle = '#000';
    for (const r of ROADS) strokePath(grass, r.path, (s) => r.width * roadWobble(s) + 0.2);
    strokePath(grass, RIVER.path, (s) => RIVER.widthAt(s) + 0.3);
    fillLake(grass, 2);
    grass.beginPath();
    grass.arc(toPx(PLAZA.x), toPx(PLAZA.z), (PLAZA.radius + 0.5) * PX, 0, Math.PI * 2);
    grass.fill();
    for (const h of HOUSES) fillRotRect(grass, h.x, h.z, h.footprint.hx + 0.6, h.footprint.hz + 0.6, h.rotationY);
    fillRotRect(grass, BRIDGE.x, BRIDGE.z, BRIDGE.width / 2 + 0.5, BRIDGE.length / 2 + 0.5, BRIDGE.rotationY);
    // The castle wards are paved.
    for (const R of REGIONS) {
      if (!R.town) continue;
      grass.beginPath();
      grass.arc(toPx(R.x), toPx(R.z), (R.town.r + 2) * PX, 0, Math.PI * 2);
      grass.fill();
      cobble.fillStyle = '#fff';
      cobble.beginPath();
      cobble.arc(toPx(R.x), toPx(R.z), R.town.r * PX, 0, Math.PI * 2);
      cobble.fill();
    }
    for (const C of CASTLES) {
      grass.beginPath();
      grass.arc(toPx(C.plateau.x), toPx(C.plateau.z), (C.plateau.radius + 1) * PX, 0, Math.PI * 2);
      grass.fill();
      cobble.fillStyle = '#fff';
      cobble.beginPath();
      cobble.arc(toPx(C.plateau.x), toPx(C.plateau.z), (C.plateau.radius - 1) * PX, 0, Math.PI * 2);
      cobble.fill();
    }
    // Rocks and other objects sitting on the ground.
    for (const c of cutouts) {
      grass.beginPath();
      if (c.rx) grass.ellipse(toPx(c.ex), toPx(c.ez), Math.max(0.6, c.rx * PX), Math.max(0.6, c.rz * PX), -c.rot, 0, Math.PI * 2);
      else grass.arc(toPx(c.x), toPx(c.z), Math.max(0.6, c.r * PX), 0, Math.PI * 2);
      grass.fill();
    }

    // Roads, with soft verges.
    road.fillStyle = '#000';
    road.fillRect(0, 0, SIZE, SIZE);
    road.strokeStyle = road.fillStyle = '#fff';
    for (const r of ROADS) strokePath(road, r.path, (s) => r.width * roadWobble(s));
    for (const h of HOUSES) fillRotRect(road, h.x, h.z, h.footprint.hx + 0.6, h.footprint.hz + 0.6, h.rotationY);

    // Water beds.
    water.fillStyle = '#000';
    water.fillRect(0, 0, SIZE, SIZE);
    water.strokeStyle = water.fillStyle = '#fff';
    strokePath(water, RIVER.path, (s) => RIVER.widthAt(s) + 0.6);
    fillLake(water, 0.5);

    // The cobbled plaza. (The realm towns and castle wards were painted
    // above; the black ground must not be laid over them.)
    cobble.fillStyle = '#fff';
    cobble.beginPath();
    cobble.arc(toPx(PLAZA.x), toPx(PLAZA.z), PLAZA.radius * PX, 0, Math.PI * 2);
    cobble.fill();
    // Where a road leaves the plaza the paving thins out over a few metres:
    // loose setts sunk in the dirt, then bare road. Kept to the road below.
    const fringe = layer();
    const halo = fringe.createRadialGradient(toPx(PLAZA.x), toPx(PLAZA.z), (PLAZA.radius - 0.5) * PX, toPx(PLAZA.x), toPx(PLAZA.z), (PLAZA.radius + 4) * PX);
    halo.addColorStop(0, '#fff');
    halo.addColorStop(1, '#000');
    fringe.fillStyle = halo;
    fringe.fillRect(0, 0, SIZE, SIZE);

    const g = grass.getImageData(0, 0, SIZE, SIZE).data;
    const r = road.getImageData(0, 0, SIZE, SIZE).data;
    const w = water.getImageData(0, 0, SIZE, SIZE).data;
    const c = cobble.getImageData(0, 0, SIZE, SIZE).data;
    const f = fringe.getImageData(0, 0, SIZE, SIZE).data;
    this.data = new Uint8Array(SIZE * SIZE * 4);
    for (let i = 0; i < SIZE * SIZE; i++) {
      const o = i * 4;
      this.data[o] = g[o];
      this.data[o + 1] = r[o];
      this.data[o + 2] = w[o];
      this.data[o + 3] = Math.max(c[o], Math.round((f[o] * r[o]) / 255));
    }
    this.bakeTerrain(terrain);
    blur(this.data);

    // Canvas rows run north to south, which matches texture v = (z + half) / size
    // once flipY is off.
    this.texture = new THREE.DataTexture(this.data, SIZE, SIZE, THREE.RGBAFormat);
    this.texture.flipY = false;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.anisotropy = 8;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.needsUpdate = true;
  }

  // No grass on cliffs, scree or high ground: thin it by slope and altitude.
  bakeTerrain(terrain) {
    const side = terrain.segments + 1;
    const ny = terrain.geometry.attributes.normal.array;
    const heights = terrain.heights;
    const smooth = (a, b, x) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    // Grid index for every texel column/row (the terrain grid is warped).
    const toGrid = new Int32Array(SIZE);
    for (let p = 0; p < SIZE; p++) {
      const world = (p + 0.5) / PX - WORLD_HALF;
      toGrid[p] = Math.min(side - 1, Math.max(0, Math.round(terrain.worldToGrid(world))));
    }
    for (let y = 0; y < SIZE; y++) {
      const j = toGrid[y];
      for (let x = 0; x < SIZE; x++) {
        const v = j * side + toGrid[x];
        const slope = 1 - ny[v * 3 + 1];
        const rock = Math.max(smooth(0.4, 0.56, slope), smooth(105, 150, heights[v]));
        const o = (y * SIZE + x) * 4;
        this.data[o] = Math.round(this.data[o] * (1 - rock));
      }
    }
  }

  // Channel value 0..1 at world (x, z), bilinear.
  sample(x, z, channel = 0) {
    const fx = toPx(x) - 0.5;
    const fz = toPx(z) - 0.5;
    const x0 = Math.max(0, Math.min(SIZE - 2, Math.floor(fx)));
    const z0 = Math.max(0, Math.min(SIZE - 2, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - x0));
    const tz = Math.min(1, Math.max(0, fz - z0));
    const d = this.data;
    const at = (xx, zz) => d[(zz * SIZE + xx) * 4 + channel];
    const a = at(x0, z0) + (at(x0 + 1, z0) - at(x0, z0)) * tx;
    const b = at(x0, z0 + 1) + (at(x0 + 1, z0 + 1) - at(x0, z0 + 1)) * tx;
    return (a + (b - a) * tz) / 255;
  }

  grassAt(x, z) {
    return this.sample(x, z, 0);
  }

  // Clear the grass along segments laid after the mask was made (fallen
  // logs): { x0, z0, x1, z1, r }, thinning over a short margin either side.
  cutSegments(list) {
    const d = this.data;
    for (const s of list) {
      const pad = s.r + 0.8;
      const px0 = Math.max(0, Math.floor(toPx(Math.min(s.x0, s.x1) - pad)));
      const px1 = Math.min(SIZE - 1, Math.ceil(toPx(Math.max(s.x0, s.x1) + pad)));
      const pz0 = Math.max(0, Math.floor(toPx(Math.min(s.z0, s.z1) - pad)));
      const pz1 = Math.min(SIZE - 1, Math.ceil(toPx(Math.max(s.z0, s.z1) + pad)));
      const ex = s.x1 - s.x0;
      const ez = s.z1 - s.z0;
      const len2 = ex * ex + ez * ez || 1;
      for (let pz = pz0; pz <= pz1; pz++) {
        for (let px = px0; px <= px1; px++) {
          const x = (px + 0.5) / PX - WORLD_HALF;
          const z = (pz + 0.5) / PX - WORLD_HALF;
          const t = Math.max(0, Math.min(1, ((x - s.x0) * ex + (z - s.z0) * ez) / len2));
          const dist = Math.hypot(x - s.x0 - ex * t, z - s.z0 - ez * t);
          const keep = Math.min(1, Math.max(0, (dist - s.r * 0.5) / 0.9));
          const o = (pz * SIZE + px) * 4;
          d[o] = Math.round(d[o] * keep);
        }
      }
    }
    this.texture.needsUpdate = true;
  }
}

// Shader-side mapping from world xz to mask uv.
export const MASK_UV_GLSL = `( ( p.xz + ${WORLD_HALF.toFixed(1)} ) / ${WORLD_SIZE.toFixed(1)} )`;
