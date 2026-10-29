// Tree species: growth parameters for the generator, bark colours, and how
// to paint their leaf cards.
//
// Growth parameters (see TreeGen.js):
//   height      trunk length range (m)
//   radius      trunk base radius range (m)
//   lean        random trunk lean
//   gnarl       per-segment wander of branch direction
//   upward      how strongly branches curve up (+) or droop (-)
//   depth       branching levels below the trunk
//   children    branches spawned per branch, per level
//   angle       branch angle from the parent, per level (radians)
//   lenRatio    child length / parent length, per level
//   start       how far along the parent children begin (0..1)
//   taper       tip radius / base radius
//   whorl       conifer layout: branches in rings, shorter toward the top
//   leaves      { per: cards per terminal branch, size: [min, max], spread }
//   hanging     willow strands: { count, length }
//   flare       buttress roots at the base (giant trees)

export const SPECIES = {
  oak: {
    label: 'Common oak',
    height: [3.2, 4.6],
    radius: [0.32, 0.45],
    lean: 0.12,
    gnarl: 0.32,
    upward: 0.08,
    depth: 3,
    children: [5, 3, 3],
    angle: [0.95, 0.7, 0.6],
    lenRatio: [1.55, 0.6, 0.5],
    start: [0.55, 0.25, 0.2],
    taper: 0.35,
    leaves: { per: 13, size: [1.5, 2.3], spread: 1.2 },
    bark: { color: [0.3, 0.25, 0.19], fissures: 9 },
    leaf: { kind: 'broad', colors: ['#3f6b22', '#4f7d2a', '#5e8a30', '#35591c'] },
    wind: 0.7,
  },
  giant: {
    label: 'Elder giantwood',
    height: [30, 42],
    radius: [1.5, 2.2],
    lean: 0.03,
    gnarl: 0.05,
    upward: 0.02,
    depth: 2,
    children: [22, 4],
    angle: [1.35, 0.6],
    lenRatio: [0.22, 0.5],
    start: [0.45, 0.3],
    taper: 0.18,
    whorl: { droop: 0.15 },
    leaves: { per: 9, size: [3.0, 4.4], spread: 1.8 },
    flare: 0.7,
    bark: { color: [0.3, 0.15, 0.09], fissures: 6 },
    leaf: { kind: 'needle', colors: ['#2c4a22', '#36592a', '#2a4224', '#3e6230'] },
    wind: 0.25,
  },
  blossom: {
    label: 'Moonblossom cherry',
    height: [2.4, 3.4],
    radius: [0.22, 0.32],
    lean: 0.2,
    gnarl: 0.4,
    upward: 0.0,
    depth: 3,
    children: [4, 3, 3],
    angle: [1.05, 0.8, 0.6],
    lenRatio: [1.6, 0.6, 0.5],
    start: [0.6, 0.2, 0.2],
    taper: 0.3,
    leaves: { per: 13, size: [1.4, 2.0], spread: 1.0 },
    bark: { color: [0.25, 0.19, 0.2], fissures: 4, rings: true },
    leaf: { kind: 'blossom', colors: ['#f6c4d6', '#f0a8c4', '#fbdce8', '#e894b6'] },
    wind: 0.8,
  },
  pine: {
    label: 'Mountain pine',
    height: [11, 17],
    radius: [0.28, 0.4],
    lean: 0.04,
    gnarl: 0.08,
    upward: -0.03,
    depth: 1,
    children: [22],
    angle: [1.6],
    lenRatio: [0.32],
    start: [0.2],
    taper: 0.12,
    whorl: { droop: 0.35 },
    leaves: { per: 9, size: [1.6, 2.3], spread: 0.7 },
    bark: { color: [0.34, 0.21, 0.14], fissures: 8 },
    leaf: { kind: 'needle', colors: ['#24402a', '#2c4c30', '#335a36', '#203a26'] },
    wind: 0.45,
  },
  birch: {
    label: 'Silver birch',
    height: [8, 12],
    radius: [0.14, 0.2],
    lean: 0.1,
    gnarl: 0.18,
    upward: 0.12,
    depth: 2,
    children: [8, 3],
    angle: [0.6, 0.55],
    lenRatio: [0.45, 0.5],
    start: [0.4, 0.3],
    taper: 0.25,
    leaves: { per: 10, size: [1.1, 1.6], spread: 0.9 },
    bark: { color: [0.86, 0.84, 0.8], birch: true },
    leaf: { kind: 'small', colors: ['#7a9a34', '#8fae3e', '#a4b84a', '#6a8a2c'] },
    wind: 1.0,
  },
  willow: {
    label: 'Weeping willow',
    height: [2.6, 3.4],
    radius: [0.35, 0.48],
    lean: 0.15,
    gnarl: 0.25,
    upward: 0.12,
    depth: 2,
    children: [6, 3],
    angle: [0.75, 0.6],
    lenRatio: [1.5, 0.55],
    start: [0.7, 0.3],
    taper: 0.35,
    leaves: { per: 2, size: [1.0, 1.4], spread: 0.6 },
    hanging: { count: 7, length: [2.6, 4.4] },
    bark: { color: [0.33, 0.3, 0.26], fissures: 12 },
    leaf: { kind: 'willow', colors: ['#7f9c3a', '#93ab48', '#6c8a30', '#a6b85a'] },
    wind: 1.0,
  },
  maple: {
    label: 'Emberleaf maple',
    height: [3.0, 4.2],
    radius: [0.26, 0.36],
    lean: 0.1,
    gnarl: 0.25,
    upward: 0.15,
    depth: 3,
    children: [5, 3, 3],
    angle: [0.8, 0.65, 0.55],
    lenRatio: [1.4, 0.6, 0.5],
    start: [0.55, 0.25, 0.2],
    taper: 0.3,
    leaves: { per: 13, size: [1.4, 2.0], spread: 1.0 },
    bark: { color: [0.36, 0.33, 0.3], fissures: 10 },
    leaf: { kind: 'maple', colors: ['#d8512a', '#e8862e', '#f0b23c', '#b83a24'] },
    wind: 0.8,
  },
  silverleaf: {
    label: 'Elven silverleaf',
    height: [7, 10],
    radius: [0.22, 0.3],
    lean: 0.08,
    gnarl: 0.15,
    upward: 0.18,
    depth: 3,
    children: [6, 3, 2],
    angle: [0.55, 0.55, 0.5],
    lenRatio: [0.55, 0.6, 0.55],
    start: [0.35, 0.3, 0.25],
    taper: 0.2,
    spiral: 0.6,
    leaves: { per: 11, size: [1.2, 1.8], spread: 0.9 },
    bark: { color: [0.78, 0.8, 0.82], fissures: 3, smooth: true },
    leaf: { kind: 'silver', colors: ['#c8e4e6', '#a8d4dc', '#e4f2ee', '#94c4d0'] },
    glow: 0.35,
    wind: 0.9,
  },
  duskwood: {
    label: 'Violet duskwood',
    height: [3.4, 4.8],
    radius: [0.28, 0.38],
    lean: 0.15,
    gnarl: 0.35,
    upward: 0.05,
    depth: 3,
    children: [5, 3, 3],
    angle: [1.0, 0.75, 0.6],
    lenRatio: [1.5, 0.6, 0.5],
    start: [0.55, 0.25, 0.2],
    taper: 0.3,
    leaves: { per: 13, size: [1.5, 2.2], spread: 1.1 },
    bark: { color: [0.24, 0.2, 0.27], fissures: 7 },
    leaf: { kind: 'blossom', colors: ['#8a5ad0', '#a476e6', '#6c3fb4', '#c39af2'] },
    glow: 0.12,
    wind: 0.8,
  },
  dead: {
    label: 'Hollow deadwood',
    height: [3.5, 5.5],
    radius: [0.28, 0.4],
    lean: 0.18,
    gnarl: 0.5,
    upward: 0.05,
    depth: 3,
    children: [4, 3, 2],
    angle: [0.85, 0.75, 0.7],
    lenRatio: [1.1, 0.6, 0.5],
    start: [0.5, 0.3, 0.3],
    taper: 0.15,
    leaves: null,
    bark: { color: [0.5, 0.47, 0.43], fissures: 14 },
    wind: 0.15,
  },
  juniper: {
    label: 'Windswept juniper',
    height: [1.4, 2.4],
    radius: [0.2, 0.3],
    lean: 0.55,
    gnarl: 0.45,
    upward: -0.02,
    depth: 2,
    children: [5, 3],
    angle: [1.2, 0.8],
    lenRatio: [1.6, 0.5],
    start: [0.4, 0.3],
    taper: 0.3,
    leaves: { per: 11, size: [1.1, 1.6], spread: 0.7, flat: true },
    bark: { color: [0.45, 0.3, 0.22], fissures: 16 },
    leaf: { kind: 'scale', colors: ['#2f4a2e', '#3a5634', '#28402a', '#46613a'] },
    wind: 0.35,
  },
};

// ---------------------------------------------------------------------------
// Leaf card textures: a cluster of leaves on transparent ground, painted with
// the 2D canvas. Alpha is used with alphaTest.

function leafPath(ctx, kind, len, wid) {
  ctx.beginPath();
  if (kind === 'maple') {
    // Five pointed lobes.
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? len : len * 0.45;
      const x = Math.cos(a) * r * 0.9;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else if (kind === 'blossom') {
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.ellipse(Math.cos(a) * len * 0.45, Math.sin(a) * len * 0.45, len * 0.42, len * 0.3, a, 0, Math.PI * 2);
    }
  } else {
    // Pointed teardrop.
    ctx.moveTo(0, -len);
    ctx.quadraticCurveTo(wid, -len * 0.2, 0, len * 0.6);
    ctx.quadraticCurveTo(-wid, -len * 0.2, 0, -len);
  }
  ctx.closePath();
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

  const shade = (color, k) => {
    const n = parseInt(color.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 255) * k);
    const g = Math.min(255, ((n >> 8) & 255) * k);
    const b = Math.min(255, (n & 255) * k);
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  };

  if (kind === 'needle' || kind === 'scale') {
    // Sprays of needles from twigs.
    for (let t = 0; t < 9; t++) {
      const a0 = rnd() * Math.PI * 2;
      const r0 = rnd() * size * 0.18;
      const x0 = c + Math.cos(a0) * r0;
      const y0 = c + Math.sin(a0) * r0;
      const dir = rnd() * Math.PI * 2;
      const len = size * (0.2 + rnd() * 0.18);
      ctx.strokeStyle = shade(pick(), 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(dir) * len, y0 + Math.sin(dir) * len);
      ctx.stroke();
      const n = kind === 'needle' ? 26 : 14;
      for (let i = 0; i < n; i++) {
        const f = i / n;
        const px = x0 + Math.cos(dir) * len * f;
        const py = y0 + Math.sin(dir) * len * f;
        ctx.strokeStyle = shade(pick(), 0.8 + rnd() * 0.5);
        ctx.lineWidth = kind === 'needle' ? 1.6 : 4;
        for (const side of [-1, 1]) {
          const na = dir + side * (0.7 + rnd() * 0.3);
          const nl = size * (kind === 'needle' ? 0.07 : 0.035) * (1 - f * 0.4);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl);
          ctx.stroke();
        }
      }
      if (kind === 'scale' && rnd() < 0.6) {
        ctx.fillStyle = '#5a6e9a';
        for (let b = 0; b < 4; b++) {
          ctx.beginPath();
          ctx.arc(x0 + (rnd() - 0.5) * 30, y0 + (rnd() - 0.5) * 30, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  } else if (kind === 'willow') {
    // Hanging strands of slender leaves.
    for (let t = 0; t < 7; t++) {
      const x = size * (0.2 + rnd() * 0.6);
      ctx.strokeStyle = shade(pick(), 0.55);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + (rnd() - 0.5) * 20, size * 0.5, x + (rnd() - 0.5) * 30, size);
      ctx.stroke();
      for (let i = 0; i < 18; i++) {
        const y = (i / 18) * size;
        ctx.save();
        ctx.translate(x + (rnd() - 0.5) * 8, y);
        ctx.rotate(Math.PI + (rnd() - 0.5) * 0.9);
        ctx.fillStyle = shade(pick(), 0.85 + rnd() * 0.3);
        leafPath(ctx, 'teardrop', 13, 4);
        ctx.fill();
        ctx.restore();
      }
    }
  } else {
    // Clusters of broad leaves, blossoms, maple stars or silver leaves.
    const count = kind === 'small' ? 70 : kind === 'blossom' ? 55 : 42;
    const len = { broad: 17, small: 11, maple: 16, blossom: 11, silver: 18 }[kind] || 16;
    const wid = { broad: 11, small: 8, silver: 6 }[kind] || 10;
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * size * 0.38;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rnd() * Math.PI * 2);
      const k = 0.75 + rnd() * 0.5 - (r / size) * 0.2;
      const color = kind === 'blossom' && rnd() < 0.18 ? '#7aa04a' : pick();
      ctx.fillStyle = shade(color, k);
      const sc = 0.8 + rnd() * 0.5;
      leafPath(ctx, kind, len * sc, wid * sc);
      ctx.fill();
      if (kind === 'broad' || kind === 'silver' || kind === 'small') {
        ctx.strokeStyle = shade(color, k * 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -len * sc * 0.9);
        ctx.lineTo(0, len * sc * 0.5);
        ctx.stroke();
      }
      if (kind === 'blossom') {
        ctx.fillStyle = '#fff2a8';
        ctx.beginPath();
        ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  return canvas;
}
