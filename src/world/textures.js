// Procedurally painted canvas textures for buildings. Each returns a colour
// map plus a matching greyscale bump map.

import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas, srgb = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function speckle(ctx, size, random, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const v = Math.floor(random() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * random()})`;
    const s = 1 + random() * 3;
    ctx.fillRect(random() * size, random() * size, s, s);
  }
}

function hsl(h, s, l) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Irregular coursed fieldstone with deep mortar joints.
export function stoneTextures(seed = 1) {
  const size = 512;
  const random = mulberry32(seed);
  const [c, ctx] = makeCanvas(size);
  const [b, bctx] = makeCanvas(size);

  ctx.fillStyle = '#5b544a';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#000';
  bctx.fillRect(0, 0, size, size);

  // Course heights are scaled to fill the canvas exactly so it tiles vertically.
  const heights = [];
  for (let i = 0; i < 10; i++) heights.push(38 + random() * 30);
  const scale = size / heights.reduce((a, v) => a + v, 0);

  let y = 0;
  for (const h of heights) {
    const rowH = h * scale;
    let x = -random() * 60;
    const start = x;
    while (x < size + start) {
      const gap = 4;
      let w = 55 + random() * 70;
      // Stretch the last stone of a course rather than leave a sliver.
      if (size + start - x - w < 30) w = size + start - x;
      const l = 26 + random() * 18;
      const hue = 28 + random() * 16;
      const sat = 12 + random() * 12;
      const g = 150 + random() * 105;
      // Draw wrapped copies so the texture tiles horizontally.
      for (const off of [0, size]) {
        const sx = x + off;
        ctx.fillStyle = hsl(hue, sat, l);
        roundRect(ctx, sx + gap / 2, y + gap / 2, w - gap, rowH - gap, 9);
        ctx.fill();
        // Soft top-light on each stone.
        const grad = ctx.createLinearGradient(0, y, 0, y + rowH);
        grad.addColorStop(0, 'rgba(255,255,255,0.12)');
        grad.addColorStop(1, 'rgba(0,0,0,0.18)');
        ctx.fillStyle = grad;
        roundRect(ctx, sx + gap / 2, y + gap / 2, w - gap, rowH - gap, 9);
        ctx.fill();

        bctx.fillStyle = `rgb(${g},${g},${g})`;
        roundRect(bctx, sx + gap / 2, y + gap / 2, w - gap, rowH - gap, 11);
        bctx.fill();
      }
      x += w;
    }
    y += rowH;
  }

  speckle(ctx, size, random, 6000, 0.25);
  speckle(bctx, size, random, 4000, 0.3);
  return { map: toTexture(c), bump: toTexture(b, false) };
}

// Lime plaster with mottling and a little grime toward the bottom.
export function plasterTextures(seed = 2) {
  const size = 512;
  const random = mulberry32(seed);
  const [c, ctx] = makeCanvas(size);
  const [b, bctx] = makeCanvas(size);

  ctx.fillStyle = '#b9a98a';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 260; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 10 + random() * 60;
    const l = 78 + random() * 14;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `hsla(36, 28%, ${l - 8}%, 0.35)`);
    grad.addColorStop(1, 'hsla(38, 30%, 80%, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    const g = 100 + random() * 60;
    const bg = bctx.createRadialGradient(x, y, 0, x, y, r * 0.6);
    bg.addColorStop(0, `rgba(${g},${g},${g},0.5)`);
    bg.addColorStop(1, `rgba(${g},${g},${g},0)`);
    bctx.fillStyle = bg;
    bctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  speckle(ctx, size, random, 9000, 0.12);
  speckle(bctx, size, random, 9000, 0.35);
  return { map: toTexture(c), bump: toTexture(b, false) };
}

// Weathered dark timber with long grain.
export function woodTextures(seed = 3, base = [28, 32, 22]) {
  const size = 256;
  const random = mulberry32(seed);
  const [c, ctx] = makeCanvas(size);
  const [b, bctx] = makeCanvas(size);
  const [h, s, l] = base;

  ctx.fillStyle = hsl(h, s, l);
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#909090';
  bctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 140; i++) {
    const x = random() * size;
    const w = 0.6 + random() * 2.2;
    const ll = l + (random() - 0.5) * 14;
    ctx.strokeStyle = hsl(h + (random() - 0.5) * 6, s, ll);
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= size; y += 16) {
      ctx.lineTo(x + Math.sin(y * 0.03 + i) * 2.5, y);
    }
    ctx.stroke();

    const g = 60 + random() * 120;
    bctx.strokeStyle = `rgb(${g},${g},${g})`;
    bctx.lineWidth = w;
    bctx.beginPath();
    bctx.moveTo(x, 0);
    bctx.lineTo(x, size);
    bctx.stroke();
  }
  speckle(ctx, size, random, 1500, 0.2);
  return { map: toTexture(c), bump: toTexture(b, false) };
}

// Vertical door planks with dark seams.
export function plankTextures(seed = 4) {
  const size = 256;
  const random = mulberry32(seed);
  const [c, ctx] = makeCanvas(size);
  const [b, bctx] = makeCanvas(size);
  const planks = 5;
  const pw = size / planks;
  for (let i = 0; i < planks; i++) {
    const l = 24 + random() * 8;
    ctx.fillStyle = hsl(26, 38, l);
    ctx.fillRect(i * pw, 0, pw, size);
    for (let k = 0; k < 18; k++) {
      ctx.strokeStyle = hsl(26, 38, l + (random() - 0.5) * 10);
      ctx.lineWidth = 0.5 + random() * 1.5;
      const x = i * pw + random() * pw;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (random() - 0.5) * 4, size);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(i * pw, 0, 2, size);
    bctx.fillStyle = '#b0b0b0';
    bctx.fillRect(i * pw + 2, 0, pw - 2, size);
    bctx.fillStyle = '#202020';
    bctx.fillRect(i * pw, 0, 2, size);
  }
  speckle(ctx, size, random, 1200, 0.2);
  return { map: toTexture(c), bump: toTexture(b, false) };
}

// Overlapping split-wood shingles, mossy toward the eaves.
export function shingleTextures(seed = 5) {
  const size = 512;
  const random = mulberry32(seed);
  const [c, ctx] = makeCanvas(size);
  const [b, bctx] = makeCanvas(size);
  const rows = 12;
  const rh = size / rows;

  ctx.fillStyle = '#2a2420';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#000';
  bctx.fillRect(0, 0, size, size);

  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    let x = r % 2 === 0 ? 0 : -random() * 30 - 10;
    while (x < size) {
      const w = 24 + random() * 22;
      const hue = 20 + random() * 15;
      const sat = 18 + random() * 14;
      const l = 22 + random() * 14;
      const moss = random() < 0.05;
      for (const off of [0, size]) {
        const sx = x - off;
        const grad = ctx.createLinearGradient(0, y, 0, y + rh);
        grad.addColorStop(0, moss ? hsl(75, 18, l * 0.8) : hsl(hue, sat, l * 0.7));
        grad.addColorStop(0.85, moss ? hsl(72, 20, l) : hsl(hue, sat, l));
        grad.addColorStop(1, 'rgba(0,0,0,0.9)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx + 1, y, w - 2, rh);

        const bg = bctx.createLinearGradient(0, y, 0, y + rh);
        bg.addColorStop(0, '#303030');
        bg.addColorStop(0.9, '#e0e0e0');
        bg.addColorStop(1, '#000');
        bctx.fillStyle = bg;
        bctx.fillRect(sx + 1, y, w - 2, rh);
      }
      x += w;
    }
  }
  speckle(ctx, size, random, 5000, 0.18);
  return { map: toTexture(c), bump: toTexture(b, false) };
}

// Soft round puff used for chimney smoke.
export function smokeTexture() {
  const size = 128;
  const [c, ctx] = makeCanvas(size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
