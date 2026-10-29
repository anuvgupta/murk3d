import * as THREE from 'three';
import { createNoise2D, fbm, ridged, smoothstep, lerp } from '../util/noise.js';
import { WORLD_SIZE, WORLD_HALF, HOUSE, distanceToPath, PATH_WIDTH } from './layout.js';

const SEGMENTS = 400; // grid cells per side (4 m cells)

const COLORS = {
  grassA: new THREE.Color(0x34521a),
  grassB: new THREE.Color(0x4f6a24),
  grassDry: new THREE.Color(0x7d7238),
  dirt: new THREE.Color(0x5e4a33),
  rock: new THREE.Color(0x77736c),
  rockDark: new THREE.Color(0x504d49),
  snow: new THREE.Color(0xf2f4f7),
};

export class Terrain {
  constructor(seed = 7) {
    this.noiseHills = createNoise2D(seed);
    this.noiseRoll = createNoise2D(seed + 1);
    this.noiseMount = createNoise2D(seed + 2);
    this.noiseColor = createNoise2D(seed + 3);

    this.size = WORLD_SIZE;
    this.segments = SEGMENTS;
    this.cell = WORLD_SIZE / SEGMENTS;

    this.houseHeight = this.rawHeight(HOUSE.position.x, HOUSE.position.z);
    HOUSE.position.y = this.houseHeight;

    this.heights = new Float32Array((SEGMENTS + 1) * (SEGMENTS + 1));
    this.mesh = this.build();
  }

  // Height before any gameplay shaping (levelled plots, paths).
  rawHeight(x, z) {
    const r = Math.hypot(x, z * 0.85);

    // Gentle rolling hills, quieter in the middle of the vale.
    const hillMask = 0.35 + 0.65 * smoothstep(30, 170, r);
    const hills = fbm(this.noiseHills, x * 0.0035, z * 0.0035, 5) * 16 * hillMask;
    const rolling = fbm(this.noiseRoll, x * 0.013, z * 0.013, 3) * 2.2;

    // A ring of jagged peaks that encloses the vale: broad massifs carved by
    // sharp ridgelines, with a domain warp so crests don't line up on a grid.
    const mountainMask = smoothstep(200, 540, r);
    const wx = x + fbm(this.noiseRoll, x * 0.002 + 9, z * 0.002, 3) * 120;
    const wz = z + fbm(this.noiseRoll, x * 0.002, z * 0.002 + 9, 3) * 120;
    const massif = fbm(this.noiseMount, wx * 0.0012, wz * 0.0012, 3) * 0.5 + 0.5;
    const ridge = ridged(this.noiseMount, wx * 0.0021, wz * 0.0021, 6);
    const mountains = (massif * 140 + Math.pow(ridge, 1.15) * 260 * (0.4 + massif)) * mountainMask;

    return hills + rolling + mountains;
  }

  // Shaped height used to build the mesh.
  shapedHeight(x, z) {
    let h = this.rawHeight(x, z);

    // Level the cottage plot.
    const dh = Math.hypot(x - HOUSE.position.x, z - HOUSE.position.z);
    const t = smoothstep(HOUSE.flatRadius, HOUSE.flatRadius + HOUSE.blendRadius, dh);
    h = lerp(this.houseHeight, h, t);

    // Worn footpath sits a touch lower than the turf.
    const dp = distanceToPath(x, z);
    h -= 0.08 * (1 - smoothstep(PATH_WIDTH * 0.5, PATH_WIDTH * 1.2, dp));

    return h;
  }

  build() {
    const n = this.segments;
    const vertsPerSide = n + 1;
    const count = vertsPerSide * vertsPerSide;

    const positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);

    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const idx = j * vertsPerSide + i;
        const x = -WORLD_HALF + i * this.cell;
        const z = -WORLD_HALF + j * this.cell;
        const h = this.shapedHeight(x, z);
        this.heights[idx] = h;
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = h;
        positions[idx * 3 + 2] = z;
        uvs[idx * 2] = x / 4;
        uvs[idx * 2 + 1] = z / 4;
      }
    }

    // Two triangles per cell, split along the (i+1, j) – (i, j+1) diagonal.
    // heightAt() relies on this exact split.
    const indices = new Uint32Array(n * n * 6);
    let k = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * vertsPerSide + i;
        const b = a + 1;
        const c = a + vertsPerSide;
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
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    geometry.setAttribute('color', new THREE.BufferAttribute(this.computeColors(geometry), 3));
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: createDetailTexture(),
      roughness: 0.95,
      metalness: 0,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  computeColors(geometry) {
    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ny = nor.getY(i);
      const slope = 1 - ny;

      // Meadow: blend of greens with dry patches.
      const n1 = fbm(this.noiseColor, x * 0.02, z * 0.02, 3) * 0.5 + 0.5;
      const n2 = fbm(this.noiseColor, x * 0.004 + 50, z * 0.004 + 50, 3) * 0.5 + 0.5;
      c.copy(COLORS.grassA).lerp(COLORS.grassB, n1);
      c.lerp(COLORS.grassDry, smoothstep(0.55, 0.85, n2) * 0.6);

      // Footpath and the trampled yard around the cottage.
      const dp = distanceToPath(x, z) + this.noiseColor(x * 0.4, z * 0.4) * 0.35;
      const pathMix = 1 - smoothstep(PATH_WIDTH * 0.45, PATH_WIDTH * 1.1, dp);
      c.lerp(COLORS.dirt, pathMix);

      // Exposed rock on steep slopes and high ground.
      const rockMix = Math.max(smoothstep(0.22, 0.42, slope), smoothstep(110, 170, y) * 0.85);
      tmp.copy(COLORS.rock).lerp(COLORS.rockDark, n1);
      c.lerp(tmp, rockMix);

      // Snow caps on gentler faces of the peaks.
      const snowLine = 200 + this.noiseColor(x * 0.01, z * 0.01) * 25;
      const snowMix = smoothstep(snowLine, snowLine + 30, y) * (1 - smoothstep(0.45, 0.75, slope));
      c.lerp(COLORS.snow, snowMix);

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return colors;
  }

  // Exact height of the rendered surface at (x, z).
  heightAt(x, z) {
    const n = this.segments;
    const fx = (x + WORLD_HALF) / this.cell;
    const fz = (z + WORLD_HALF) / this.cell;
    const i = Math.min(n - 1, Math.max(0, Math.floor(fx)));
    const j = Math.min(n - 1, Math.max(0, Math.floor(fz)));
    const u = Math.min(1, Math.max(0, fx - i));
    const v = Math.min(1, Math.max(0, fz - j));

    const side = n + 1;
    const ha = this.heights[j * side + i];
    const hb = this.heights[j * side + i + 1];
    const hc = this.heights[(j + 1) * side + i];
    const hd = this.heights[(j + 1) * side + i + 1];

    if (u + v <= 1) {
      return ha + (hb - ha) * u + (hc - ha) * v;
    }
    return hd + (hc - hd) * (1 - u) + (hb - hd) * (1 - v);
  }

  normalAt(x, z, target = new THREE.Vector3()) {
    const e = 0.5;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    return target.set(hl - hr, 2 * e, hd - hu).normalize();
  }
}

// Fine grain multiplied over the vertex colours so the ground does not look
// flat-shaded up close. Values are linear multipliers around 0.8–1.0.
function createDetailTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const noise = createNoise2D(99);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Tileable noise: sample a torus.
      const a = (x / size) * Math.PI * 2;
      const b = (y / size) * Math.PI * 2;
      const nx = Math.cos(a) * 3;
      const ny = Math.sin(a) * 3;
      const nz = Math.cos(b) * 3;
      const nw = Math.sin(b) * 3;
      const v =
        noise(nx + nz * 0.7, ny + nw * 0.7) * 0.5 +
        noise(nx * 3 + nz * 2.1, ny * 3 + nw * 2.1) * 0.3 +
        noise(nx * 8 + nz * 6, ny * 8 + nw * 6) * 0.2;
      const g = Math.round(225 + v * 30);
      const o = (y * size + x) * 4;
      img.data[o] = g;
      img.data[o + 1] = g;
      img.data[o + 2] = g;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}
