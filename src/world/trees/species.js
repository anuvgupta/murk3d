// Tree species: growth parameters for TreeGen.js, bark and leaf painting.
//
// Growth schema (angles in degrees; positive curve lifts a stem, negative
// sags it; tropism > 0 lifts toward the light each segment, < 0 droops):
//   levels     stem levels including the trunk
//   trunk      { len, radius, lean, taper, curve, curveV, wander, segs,
//                start (where limbs begin, 0..1), splits (leaders forking
//                from the top), splitAngle, leaderLen, flare (buttress roots),
//                leafTop (conifer leader carries needles) }
//   levels_[i] parameters for level i+1: { n, downAngle, downAngleV,
//                lenRatio, lenV, taper, curve, curveBack, curveV, wander,
//                tropism, segs, start }
//   shape(t)   relative child length along the parent (crown silhouette)
//   leaves     { per, tipFill, size: [min, max], spread, flat, cross }
//   hanging    willow strands { count, length }

const round = (t) => 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.1));
const conical = (t) => 1 - 0.8 * t;
const vase = (t) => 0.5 + 0.5 * t;

export const SPECIES = {
  oak: {
    label: 'Common oak',
    levels: 3,
    trunk: { len: [2.6, 3.8], radius: [0.36, 0.5], lean: 0.1, taper: 0.75, curveV: 18, wander: 14, segs: 7, start: 0.45, splits: [2, 3], splitAngle: 32, leaderLen: 1.1 },
    levels_: [
      { n: [4, 6], downAngle: 58, downAngleV: 14, lenRatio: 1.35, lenV: 0.2, taper: 0.45, curve: 8, curveV: 40, wander: 25, tropism: 0.14, segs: 8 },
      { n: [6, 9], downAngle: 48, downAngleV: 18, lenRatio: 0.55, lenV: 0.25, taper: 0.3, curveV: 45, wander: 30, tropism: 0.1, segs: 5, start: 0.15 },
    ],
    shape: round,
    leaves: { per: 4, tipFill: 3, size: [1.5, 2.2], spread: 0.7, sprigs: 9 },
    bark: { color: [0.48, 0.39, 0.29], fissures: 7, depth: 1.1 },
    leaf: { kind: 'broad', colors: ['#4a6e2a', '#587d30', '#3d5e22', '#6a8a36'] },
    wind: 0.7,
  },
  giant: {
    label: 'Elder giantwood',
    levels: 3,
    trunk: { len: [28, 40], radius: [1.6, 2.3], lean: 0.05, taper: 0.22, curveV: 14, wander: 8, segs: 16, start: 0.4, flare: 0.8 },
    levels_: [
      { n: [26, 34], downAngle: 84, downAngleV: 12, lenRatio: 0.3, lenV: 0.25, taper: 0.35, curve: -32, curveBack: 48, curveV: 20, wander: 18, tropism: 0.12, segs: 9 },
      { n: [5, 7], downAngle: 50, downAngleV: 15, lenRatio: 0.5, lenV: 0.2, taper: 0.3, curveV: 30, wander: 20, tropism: 0.05, segs: 5, start: 0.2 },
    ],
    shape: (t) => 1 - 0.5 * t,
    leaves: { per: 6, tipFill: 3, size: [3.0, 4.4], spread: 1.9, sprigs: 7 },
    bark: { color: [0.56, 0.33, 0.2], fissures: 5, depth: 1.6 },
    leaf: { kind: 'broad', colors: ['#3d6a2c', '#4a7a33', '#35592a', '#5a8a3c'] },
    wind: 0.25,
  },
  blossom: {
    label: 'Moonblossom cherry',
    levels: 3,
    trunk: { len: [1.8, 2.6], radius: [0.22, 0.3], lean: 0.15, taper: 0.7, curveV: 25, wander: 20, segs: 6, start: 0.6, splits: [2, 3], splitAngle: 42, leaderLen: 1.15 },
    levels_: [
      { n: [3, 5], downAngle: 62, downAngleV: 15, lenRatio: 1.25, lenV: 0.2, taper: 0.45, curve: 18, curveV: 35, wander: 30, tropism: 0.06, segs: 7 },
      { n: [6, 9], downAngle: 52, downAngleV: 20, lenRatio: 0.55, lenV: 0.25, taper: 0.3, curveV: 40, wander: 30, tropism: -0.04, segs: 5, start: 0.15 },
    ],
    shape: round,
    leaves: { per: 7, tipFill: 4, size: [1.05, 1.6], spread: 0.75, sprigs: 7 },
    bark: { color: [0.27, 0.2, 0.2], fissures: 4, depth: 0.5, rings: true },
    leaf: { kind: 'blossom', colors: ['#f3bfd3', '#eca6c3', '#f9d9e6', '#e391b4'] },
    wind: 0.8,
  },
  pine: {
    label: 'Mountain pine',
    levels: 3,
    trunk: { len: [10, 16], radius: [0.28, 0.4], lean: 0.05, taper: 0.08, curveV: 12, wander: 7, segs: 14, start: 0.25, leafTop: true },
    levels_: [
      { n: [28, 40], downAngle: 94, downAngleV: 10, lenRatio: 0.3, lenV: 0.25, taper: 0.3, curve: -34, curveBack: 46, curveV: 14, wander: 14, tropism: 0.12, segs: 8 },
      { n: [4, 6], downAngle: 45, downAngleV: 15, lenRatio: 0.45, lenV: 0.2, taper: 0.3, curveV: 20, wander: 15, tropism: 0.05, segs: 4, start: 0.2 },
    ],
    shape: conical,
    leaves: { per: 4, tipFill: 3, size: [1.4, 2.1], spread: 0.65, sprigs: 6 },
    bark: { color: [0.5, 0.33, 0.21], fissures: 6, depth: 1.2, plates: true },
    leaf: { kind: 'needle', colors: ['#2f5433', '#3b653b', '#477247', '#2a4a2e'] },
    wind: 0.45,
  },
  birch: {
    label: 'Silver birch',
    levels: 3,
    trunk: { len: [7, 11], radius: [0.14, 0.2], lean: 0.08, taper: 0.2, curveV: 12, wander: 10, segs: 10, start: 0.35 },
    levels_: [
      { n: [8, 12], downAngle: 46, downAngleV: 15, lenRatio: 0.42, lenV: 0.25, taper: 0.35, curve: 15, curveBack: -35, curveV: 15, wander: 15, tropism: -0.05, segs: 7 },
      { n: [5, 7], downAngle: 42, downAngleV: 15, lenRatio: 0.5, lenV: 0.25, taper: 0.3, curve: -20, curveV: 25, wander: 20, tropism: -0.15, segs: 5, start: 0.2 },
    ],
    shape: round,
    leaves: { per: 6, tipFill: 4, size: [0.95, 1.4], spread: 0.75, sprigs: 7 },
    bark: { color: [0.86, 0.84, 0.8], birch: true },
    leaf: { kind: 'small', colors: ['#6f8f33', '#86a43f', '#9bb04a', '#5f7f2c'] },
    wind: 1.0,
  },
  willow: {
    label: 'Weeping willow',
    levels: 3,
    trunk: { len: [2.2, 3.0], radius: [0.4, 0.52], lean: 0.15, taper: 0.7, curveV: 30, wander: 25, segs: 6, start: 0.6, splits: [2, 3], splitAngle: 36, leaderLen: 1.1 },
    levels_: [
      { n: [4, 6], downAngle: 56, downAngleV: 15, lenRatio: 1.4, lenV: 0.2, taper: 0.45, curve: 30, curveBack: -20, curveV: 30, wander: 25, tropism: 0.05, segs: 8 },
      { n: [6, 8], downAngle: 50, downAngleV: 20, lenRatio: 0.5, lenV: 0.25, taper: 0.3, curve: -40, curveV: 30, wander: 20, tropism: -0.3, segs: 5, start: 0.15 },
    ],
    shape: round,
    leaves: { per: 2, tipFill: 1, size: [1.0, 1.4], spread: 0.6, sprigs: 4 },
    hanging: { count: 4, length: [2.2, 3.8] },
    bark: { color: [0.44, 0.4, 0.34], fissures: 12, depth: 1 },
    leaf: { kind: 'willow', colors: ['#7a983a', '#8ea648', '#688630', '#a1b45a'] },
    wind: 1.0,
  },
  maple: {
    label: 'Emberleaf maple',
    levels: 3,
    trunk: { len: [2.6, 3.6], radius: [0.28, 0.38], lean: 0.1, taper: 0.7, curveV: 20, wander: 15, segs: 7, start: 0.45, splits: [2, 3], splitAngle: 30, leaderLen: 1.1 },
    levels_: [
      { n: [4, 6], downAngle: 46, downAngleV: 14, lenRatio: 1.25, lenV: 0.2, taper: 0.45, curve: 12, curveV: 35, wander: 22, tropism: 0.16, segs: 8 },
      { n: [6, 9], downAngle: 44, downAngleV: 18, lenRatio: 0.55, lenV: 0.25, taper: 0.3, curveV: 40, wander: 25, tropism: 0.1, segs: 5, start: 0.15 },
    ],
    shape: round,
    leaves: { per: 6, tipFill: 4, size: [1.15, 1.7], spread: 0.8, sprigs: 7 },
    bark: { color: [0.34, 0.31, 0.28], fissures: 10, depth: 0.8 },
    leaf: { kind: 'maple', colors: ['#c8482a', '#d97a2c', '#e2a53a', '#a83522'] },
    wind: 0.8,
  },
  silverleaf: {
    label: 'Elven silverleaf',
    levels: 3,
    trunk: { len: [6, 9], radius: [0.22, 0.3], lean: 0.08, taper: 0.35, curveV: 10, wander: 8, segs: 10, start: 0.3 },
    levels_: [
      { n: [10, 14], downAngle: 40, downAngleV: 10, lenRatio: 0.45, lenV: 0.2, taper: 0.35, curve: 20, curveV: 15, wander: 12, tropism: 0.25, segs: 7 },
      { n: [5, 7], downAngle: 36, downAngleV: 15, lenRatio: 0.5, lenV: 0.2, taper: 0.3, curveV: 20, wander: 15, tropism: 0.15, segs: 5, start: 0.2 },
    ],
    shape: vase,
    leaves: { per: 6, tipFill: 3, size: [1.0, 1.5], spread: 0.7, sprigs: 7 },
    bark: { color: [0.74, 0.76, 0.78], fissures: 3, depth: 0.3, smooth: true },
    leaf: { kind: 'silver', colors: ['#bcdcdc', '#9fcbd3', '#d8ece6', '#8dbcc8'] },
    glow: 0.35,
    wind: 0.9,
  },
  duskwood: {
    label: 'Violet duskwood',
    levels: 3,
    trunk: { len: [2.8, 4.0], radius: [0.3, 0.4], lean: 0.15, taper: 0.7, curveV: 25, wander: 20, segs: 7, start: 0.5, splits: [2, 3], splitAngle: 36, leaderLen: 1.1 },
    levels_: [
      { n: [4, 6], downAngle: 58, downAngleV: 15, lenRatio: 1.3, lenV: 0.2, taper: 0.45, curve: 10, curveV: 40, wander: 28, tropism: 0.1, segs: 8 },
      { n: [6, 9], downAngle: 50, downAngleV: 20, lenRatio: 0.55, lenV: 0.25, taper: 0.3, curveV: 45, wander: 30, tropism: 0.0, segs: 5, start: 0.15 },
    ],
    shape: round,
    leaves: { per: 7, tipFill: 4, size: [1.3, 1.9], spread: 0.9, sprigs: 7 },
    bark: { color: [0.22, 0.18, 0.25], fissures: 7, depth: 0.9 },
    leaf: { kind: 'blossom', colors: ['#7e55c4', '#9a72dc', '#633aa8', '#b592ec'] },
    glow: 0.12,
    wind: 0.8,
  },
  dead: {
    label: 'Hollow deadwood',
    levels: 3,
    trunk: { len: [3, 5], radius: [0.3, 0.42], lean: 0.18, taper: 0.6, curveV: 35, wander: 40, segs: 7, start: 0.45, splits: [1, 2], splitAngle: 38, leaderLen: 0.9 },
    levels_: [
      { n: [3, 5], downAngle: 60, downAngleV: 20, lenRatio: 1.0, lenV: 0.3, taper: 0.35, curveV: 50, wander: 40, tropism: 0.05, segs: 7 },
      { n: [3, 5], downAngle: 50, downAngleV: 25, lenRatio: 0.55, lenV: 0.3, taper: 0.2, curveV: 60, wander: 50, tropism: -0.05, segs: 5, start: 0.2 },
    ],
    shape: round,
    leaves: null,
    bark: { color: [0.46, 0.43, 0.39], fissures: 14, depth: 1.2 },
    wind: 0.15,
  },
  juniper: {
    label: 'Windswept juniper',
    levels: 3,
    trunk: { len: [1.2, 2.0], radius: [0.2, 0.3], lean: 0.6, taper: 0.7, curve: 25, curveV: 40, wander: 40, segs: 6, start: 0.3, splits: [1, 2], splitAngle: 50, leaderLen: 1.0 },
    levels_: [
      { n: [4, 6], downAngle: 70, downAngleV: 20, lenRatio: 1.3, lenV: 0.3, taper: 0.4, curve: 20, curveV: 40, wander: 35, tropism: 0.1, segs: 7 },
      { n: [5, 7], downAngle: 55, downAngleV: 20, lenRatio: 0.5, lenV: 0.3, taper: 0.3, curveV: 40, wander: 30, tropism: 0.1, segs: 5, start: 0.2 },
    ],
    shape: round,
    leaves: { per: 7, tipFill: 4, size: [1.0, 1.45], spread: 0.55, flat: true, sprigs: 6 },
    bark: { color: [0.42, 0.29, 0.21], fissures: 16, depth: 1.1 },
    leaf: { kind: 'scale', colors: ['#2f4a2e', '#3a5634', '#28402a', '#46613a'] },
    wind: 0.35,
  },
};

// ---------------------------------------------------------------------------
// Leaf cluster cards: a dense mass of overlapping leaves fading out toward the
// card's edge, so clusters read as foliage rather than squares. Each leaf is
// shaded darker toward its stalk and lighter toward its tip.

function leafPath(ctx, kind, len, wid) {
  ctx.beginPath();
  if (kind === 'maple') {
    const lobes = [[0, -1], [0.35, -0.55], [0.95, -0.45], [0.5, -0.05], [0.7, 0.5], [0.15, 0.3], [0, 0.6], [-0.15, 0.3], [-0.7, 0.5], [-0.5, -0.05], [-0.95, -0.45], [-0.35, -0.55]];
    lobes.forEach(([x, y], i) => (i ? ctx.lineTo(x * len, y * len) : ctx.moveTo(x * len, y * len)));
  } else if (kind === 'blossom') {
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.moveTo(0, 0);
      ctx.ellipse(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5, len * 0.42, len * 0.3, a, 0, Math.PI * 2);
    }
  } else if (kind === 'silver' || kind === 'willow') {
    ctx.moveTo(0, -len);
    ctx.bezierCurveTo(wid, -len * 0.6, wid, len * 0.2, 0, len * 0.5);
    ctx.bezierCurveTo(-wid, len * 0.2, -wid, -len * 0.6, 0, -len);
  } else {
    ctx.moveTo(0, -len);
    ctx.bezierCurveTo(wid * 1.2, -len * 0.5, wid * 1.1, len * 0.3, 0, len * 0.55);
    ctx.bezierCurveTo(-wid * 1.1, len * 0.3, -wid * 1.2, -len * 0.5, 0, -len);
  }
  ctx.closePath();
}

function shadeHex(color, k) {
  const n = parseInt(color.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * k);
  const g = Math.min(255, ((n >> 8) & 255) * k);
  const b = Math.min(255, (n & 255) * k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function paintLeafTexture(spec, seed = 1) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const { kind, colors } = spec.leaf;
  const c = size / 2;
  const pick = () => colors[Math.floor(rnd() * colors.length)];
  // Leaves crowd the middle and thin toward the edge.
  const spot = () => {
    const a = rnd() * Math.PI * 2;
    const r = Math.pow(rnd(), 0.7) * size * 0.46;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r, r / (size * 0.46)];
  };

  if (kind === 'needle' || kind === 'scale') {
    for (let t = 0; t < 16; t++) {
      const [x0, y0] = spot();
      const dir = rnd() * Math.PI * 2;
      const len = size * (0.16 + rnd() * 0.16);
      ctx.strokeStyle = shadeHex(pick(), 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(dir) * len, y0 + Math.sin(dir) * len);
      ctx.stroke();
      const n = kind === 'needle' ? 30 : 16;
      for (let i = 0; i < n; i++) {
        const f = i / n;
        const px = x0 + Math.cos(dir) * len * f;
        const py = y0 + Math.sin(dir) * len * f;
        ctx.strokeStyle = shadeHex(pick(), 0.75 + rnd() * 0.5);
        ctx.lineWidth = kind === 'needle' ? 1.5 : 3.5;
        for (const side of [-1, 1]) {
          const na = dir + side * (0.6 + rnd() * 0.35);
          const nl = size * (kind === 'needle' ? 0.075 : 0.035) * (1 - f * 0.35);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl);
          ctx.stroke();
        }
      }
    }
  } else if (kind === 'willow') {
    for (let t = 0; t < 8; t++) {
      const x = size * (0.15 + rnd() * 0.7);
      ctx.strokeStyle = shadeHex(pick(), 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + (rnd() - 0.5) * 20, size * 0.5, x + (rnd() - 0.5) * 30, size);
      ctx.stroke();
      for (let i = 0; i < 22; i++) {
        const y = (i / 22) * size;
        ctx.save();
        ctx.translate(x + (rnd() - 0.5) * 10, y);
        ctx.rotate(Math.PI + (rnd() - 0.5) * 1.1);
        ctx.fillStyle = shadeHex(pick(), 0.8 + rnd() * 0.35);
        leafPath(ctx, 'willow', 14, 3.5);
        ctx.fill();
        ctx.restore();
      }
    }
  } else {
    const count = { small: 110, blossom: 90, broad: 70, maple: 60, silver: 80 }[kind] || 70;
    const len = { broad: 19, small: 12, maple: 15, blossom: 12, silver: 20 }[kind] || 17;
    const wid = { broad: 9, small: 7, silver: 5 }[kind] || 9;
    for (let i = 0; i < count; i++) {
      const [x, y, rf] = spot();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rnd() * Math.PI * 2);
      const sc = 0.75 + rnd() * 0.5;
      const color = kind === 'blossom' && rnd() < 0.2 ? '#6f9440' : pick();
      // Darker toward the heart of the cluster, lit toward its edge.
      const k = 0.65 + 0.5 * rf + (rnd() - 0.5) * 0.25;
      const grad = ctx.createLinearGradient(0, len * sc * 0.5, 0, -len * sc);
      grad.addColorStop(0, shadeHex(color, k * 0.7));
      grad.addColorStop(1, shadeHex(color, k * 1.1));
      ctx.fillStyle = grad;
      leafPath(ctx, kind, len * sc, wid * sc);
      ctx.fill();
      if (kind !== 'blossom') {
        ctx.strokeStyle = shadeHex(color, k * 0.6);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, len * sc * 0.5);
        ctx.lineTo(0, -len * sc * 0.9);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#fff0a0';
        ctx.beginPath();
        ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  // Soft circular mask so the card's square never shows.
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(c, c, size * 0.3, c, c, size * 0.5);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

// ---------------------------------------------------------------------------
// Sprig cards for near detail: a single leafy twig, stalk at the bottom of the
// card and tip at the top, leaves alternating up the stalk. Each leaf is shaded
// from its base to its tip so a clump of sprigs has light and shadow inside.

export function paintSprigTexture(spec, seed = 1) {
  const W = 128;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  let s = seed * 7919 + 17;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const { kind, colors } = spec.leaf;
  const pick = () => colors[Math.floor(rnd() * colors.length)];
  const cx = W / 2;

  const leaf = (x, y, angle, len, wid, color, k) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const grad = ctx.createLinearGradient(0, len * 0.5, 0, -len);
    grad.addColorStop(0, shadeHex(color, k * 0.7));
    grad.addColorStop(1, shadeHex(color, k * 1.15));
    ctx.fillStyle = grad;
    leafPath(ctx, kind === 'blossom' ? 'broad' : kind === 'scale' ? 'small' : kind, len, wid);
    ctx.fill();
    if (kind !== 'blossom') {
      ctx.strokeStyle = shadeHex(color, k * 0.55);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, len * 0.45);
      ctx.lineTo(0, -len * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  };

  // Stalk, slightly curved.
  const stalk = shadeHex(spec.bark ? '#5a4634' : '#5a4634', 1);
  ctx.strokeStyle = stalk;
  ctx.lineWidth = kind === 'needle' ? 3 : 2.2;
  ctx.lineCap = 'round';
  const bendX = (rnd() - 0.5) * 30;
  ctx.beginPath();
  ctx.moveTo(cx, H - 4);
  ctx.quadraticCurveTo(cx + bendX, H * 0.5, cx + bendX * 0.6, 18);
  ctx.stroke();
  const stalkAt = (t) => {
    // Point on the quadratic at parameter t (0 = base, 1 = tip).
    const x = (1 - t) * (1 - t) * cx + 2 * (1 - t) * t * (cx + bendX) + t * t * (cx + bendX * 0.6);
    const y = (1 - t) * (1 - t) * (H - 4) + 2 * (1 - t) * t * (H * 0.5) + t * t * 18;
    return [x, y];
  };

  if (kind === 'needle') {
    // A pine shoot: dense needles fanning from the stalk, longer near the tip.
    for (let i = 0; i < 70; i++) {
      const t = 0.08 + (i / 70) * 0.9;
      const [x, y] = stalkAt(t);
      for (const side of [-1, 1]) {
        const a = -Math.PI / 2 + side * (0.55 + rnd() * 0.5) + (t - 0.5) * 0.3;
        const l = 26 + rnd() * 16 + t * 10;
        ctx.strokeStyle = shadeHex(pick(), 0.8 + rnd() * 0.5);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5 - 4, x + Math.cos(a) * l, y + Math.sin(a) * l - 8);
        ctx.stroke();
      }
    }
  } else if (kind === 'scale') {
    // Juniper frond: short side twigs covered in overlapping scales.
    for (let i = 0; i < 9; i++) {
      const t = 0.1 + (i / 9) * 0.85;
      const [x, y] = stalkAt(t);
      for (const side of [-1, 1]) {
        const a = -Math.PI / 2 + side * (0.9 - t * 0.3);
        const l = 22 + rnd() * 14 - t * 8;
        for (let k = 0; k < 7; k++) {
          const f = k / 7;
          ctx.fillStyle = shadeHex(pick(), 0.75 + rnd() * 0.5 + f * 0.2);
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * l * f, y + Math.sin(a) * l * f, 4.5 - f * 1.5, 3, a, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.fillStyle = '#5a6e9a';
    for (let b = 0; b < 4; b++) {
      const [x, y] = stalkAt(0.3 + rnd() * 0.6);
      ctx.beginPath();
      ctx.arc(x + (rnd() - 0.5) * 20, y + (rnd() - 0.5) * 10, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'willow') {
    for (let i = 0; i < 16; i++) {
      const t = 0.05 + (i / 16) * 0.9;
      const [x, y] = stalkAt(t);
      const side = i % 2 ? 1 : -1;
      leaf(x, y, -Math.PI / 2 + side * (0.7 + rnd() * 0.3), 24 + rnd() * 8, 4, pick(), 0.75 + rnd() * 0.5);
    }
  } else {
    const n = kind === 'small' ? 14 : kind === 'silver' ? 11 : 9;
    const len = { broad: 30, small: 20, maple: 26, silver: 34, blossom: 22 }[kind] || 28;
    const wid = { broad: 14, small: 11, silver: 8, blossom: 10 }[kind] || 14;
    for (let i = 0; i < n; i++) {
      const t = 0.06 + (i / n) * 0.9;
      const [x, y] = stalkAt(t);
      const side = i % 2 ? 1 : -1;
      const sc = 1 - t * 0.35;
      const color = pick();
      leaf(x, y, -Math.PI / 2 + side * (0.75 + rnd() * 0.35) - (t - 0.5) * 0.2, len * sc * (0.85 + rnd() * 0.3), wid * sc, color, 0.72 + rnd() * 0.5 + t * 0.15);
    }
    // Terminal leaf.
    const [tx, ty] = stalkAt(1);
    leaf(tx, ty + 8, (rnd() - 0.5) * 0.3, len * 0.75, wid * 0.7, pick(), 1.05);
    if (kind === 'blossom') {
      // Flowers along the twig, most toward the tip.
      for (let i = 0; i < 7; i++) {
        const t = 0.25 + rnd() * 0.75;
        const [x, y] = stalkAt(t);
        const fx = x + (rnd() - 0.5) * 26;
        const fy = y + (rnd() - 0.5) * 16;
        const color = pick();
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2 + rnd() * 0.3;
          ctx.fillStyle = shadeHex(color, 0.85 + rnd() * 0.3);
          ctx.beginPath();
          ctx.ellipse(fx + Math.cos(a) * 7, fy + Math.sin(a) * 7, 6.5, 4.5, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#fff0a0';
        ctx.beginPath();
        ctx.arc(fx, fy, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return canvas;
}
