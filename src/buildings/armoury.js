// The armourer's wall stall: a planked back under a little shingled
// canopy, hung with painted shields, helms, an axe and a mace on turned
// pegs; a bow and a quiver of fletched arrows; gnarled staffs leaning
// at one side; a breastplate on a wooden stand at the other.

import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';
import { bevelBox, organicLathe, tube, blob } from './shapes.js';

const TAU = Math.PI * 2;

// --- Painted shield faces -----------------------------------------------------

// Heraldry painted on wood, worn: chips through to the grain, scratches,
// a darker rim of grime. Each design is its own small texture.
function shieldPaint(design, seed) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const rng = mulberry32(seed);
  const [a, b] = [['#26407a', '#c9a13a'], ['#7a1c1c', '#e4dccb'], ['#24502e', '#c9a13a']][design];
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = b;
  if (design === 0) {
    // Quartered.
    ctx.fillRect(S / 2, 0, S / 2, S / 2);
    ctx.fillRect(0, S / 2, S / 2, S / 2);
  } else if (design === 1) {
    // A chevron.
    ctx.beginPath();
    ctx.moveTo(0, S * 0.78);
    ctx.lineTo(S / 2, S * 0.3);
    ctx.lineTo(S, S * 0.78);
    ctx.lineTo(S, S * 0.98);
    ctx.lineTo(S / 2, S * 0.5);
    ctx.lineTo(0, S * 0.98);
    ctx.closePath();
    ctx.fill();
  } else {
    // A gold ring and a sun at its heart.
    ctx.lineWidth = 18;
    ctx.strokeStyle = b;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.3, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * TAU;
      ctx.beginPath();
      ctx.moveTo(S / 2 + Math.cos(t) * 18, S / 2 + Math.sin(t) * 18);
      ctx.lineTo(S / 2 + Math.cos(t + 0.15) * 46, S / 2 + Math.sin(t + 0.15) * 46);
      ctx.lineTo(S / 2 + Math.cos(t - 0.15) * 46, S / 2 + Math.sin(t - 0.15) * 46);
      ctx.fill();
    }
  }
  // Wear: chips to bare wood, scratches, grime toward the edge.
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(${110 + rng() * 40},${78 + rng() * 30},${46 + rng() * 20},${0.6 + rng() * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(rng() * S, rng() * S, 1 + rng() * 5, 1 + rng() * 3, rng() * 3, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(200,180,150,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const l = 10 + rng() * 40;
    const t = rng() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(t) * l, y + Math.sin(t) * l);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72);
  g.addColorStop(0, 'rgba(20,14,8,0)');
  g.addColorStop(1, 'rgba(20,14,8,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.7, metalness: 0 });
}

let PAINT = null;
let ARMOUR = null;
// Worked steel: duller than a fresh blade, so helms and plates don't glare
// white with the sky.
const armour = () => (ARMOUR ||= {
  plate: new THREE.MeshStandardMaterial({ color: 0x7c8086, roughness: 0.46, metalness: 0.85 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.55, metalness: 0.8 }),
  boss: new THREE.MeshStandardMaterial({ color: 0x9a9ea4, roughness: 0.32, metalness: 0.9 }),
});
const paints = () => (PAINT ||= [0, 1, 2].map((d) => shieldPaint(d, 40 + d)));

// --- Pieces -----------------------------------------------------------------------

// Round shield, face toward +z: a shallow dome of painted planks, an iron
// rim, a domed boss with a flange, rivets round the boss and the rim.
function roundShield(kit, im, design, R = 0.36) {
  const face = organicLathe([[0, -0.02], [R * 0.97, -0.02], [R, -0.005], [R * 0.97, 0.012], [R * 0.6, 0.035], [0, 0.048]], { segments: 32, seed: design, dent: 0.01, oval: 0.01 });
  const p = face.attributes.position;
  const uv = face.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * R) + 0.5, 0.5 - p.getZ(i) / (2 * R));
  kit.frame({ rx: Math.PI / 2 }, () => {
    kit.add(paints()[design], face);
    const rim = [];
    for (let k = 0; k < 32; k++) rim.push([Math.cos((k / 32) * TAU) * R, 0.003, Math.sin((k / 32) * TAU) * R]);
    kit.add(im.steelDark, tube(rim, 0.012, { radial: 5, closed: true, tubular: 64 }));
    kit.add(armour().boss, organicLathe([[0.1, 0.03], [0.1, 0.04], [0.075, 0.05], [0.07, 0.075], [0.05, 0.105], [0.025, 0.118], [0, 0.122]], { segments: 20, seed: design + 3, dent: 0.03 }));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      kit.add(im.brass, blob(0.009, 0.006, 0.009, { seed: k, dent: 0.1, detail: 0 }), { x: Math.cos(a) * 0.085, y: 0.05, z: Math.sin(a) * 0.085 });
      kit.add(im.steelDark, blob(0.008, 0.006, 0.008, { seed: k, dent: 0.1, detail: 0 }), { x: Math.cos(a + 0.2) * (R - 0.03), y: 0.016, z: Math.sin(a + 0.2) * (R - 0.03) });
    }
  });
}

// Kite (heater) shield, face toward +z, curved across: painted, a steel
// rim, studs down the middle.
function kiteShield(kit, im, design, W = 0.5, H = 0.68) {
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, H * 0.62);
  shape.quadraticCurveTo(-W / 2, H, 0, H);
  shape.quadraticCurveTo(W / 2, H, W / 2, H * 0.62);
  shape.quadraticCurveTo(W / 2, H * 0.25, 0, 0);
  shape.quadraticCurveTo(-W / 2, H * 0.25, -W / 2, H * 0.62);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 16 });
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    uv.setXY(i, x / W + 0.5, p.getY(i) / H);
    // Curve across the width.
    p.setZ(i, p.getZ(i) - 0.5 * x * x);
  }
  g.computeVertexNormals();
  kit.add(paints()[design], g, { y: -H / 2 });
  // Rim following the outline, and studs.
  const pts = shape.getSpacedPoints(48).map((v) => [v.x, v.y - H / 2, 0.032 - 0.5 * v.x * v.x]);
  kit.add(im.steelDark, tube(pts, 0.009, { radial: 5, closed: true, tubular: 96 }));
  for (let k = 0; k < 5; k++) {
    const y = H * (0.25 + k * 0.15) - H / 2;
    kit.add(im.brass, blob(0.012, 0.012, 0.008, { seed: k, dent: 0.1, detail: 1 }), { y, z: 0.034 });
  }
}

// Nasal helm: a pointed dome on a brow band, brass bands up the
// segments, a nasal bar, rivets; hollow.
function nasalHelm(kit, im) {
  const dome = [[0.108, 0], [0.112, 0.04], [0.11, 0.09], [0.098, 0.14], [0.07, 0.19], [0.03, 0.225], [0, 0.24]];
  kit.add(armour().plate, organicLathe(dome, { segments: 24, seed: 1, dent: 0.02, oval: 0.1 }));
  const inner = organicLathe(dome.map(([r, y]) => [r * 0.94, y * 0.96]), { segments: 24, seed: 1, dent: 0.02, oval: 0.1 });
  inner.scale(-1, 1, 1);
  kit.add(armour().dark, inner);
  const band = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU;
    band.push([Math.sin(a) * 0.118 * 1.1, 0.025, Math.cos(a) * 0.118 * 0.9]);
  }
  kit.add(im.brass, tube(band, 0.012, { radial: 4, closed: true, tubular: 48 }));
  for (let s = 0; s < 4; s++) {
    const a = (s / 4) * TAU + Math.PI / 4;
    const pts = dome.slice(1, 6).map(([r, y]) => [Math.sin(a) * (r + 0.004) * 1.1, y, Math.cos(a) * (r + 0.004) * 0.9]);
    kit.add(im.brass, tube(pts, 0.006, { radial: 4 }));
  }
  kit.add(armour().plate, bevelBox(0.026, 0.13, 0.012, 0.004), { y: -0.04, z: 0.1 });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU;
    kit.add(im.steelDark, blob(0.005, 0.005, 0.005, { seed: k, dent: 0.1, detail: 0 }), { x: Math.sin(a) * 0.131, y: 0.025, z: Math.cos(a) * 0.107 });
  }
}

// Kettle hat: a rounded crown with a broad, slightly down-turned brim.
function kettleHat(kit, im) {
  const pts = [[0.24, -0.03], [0.245, -0.022], [0.2, 0.0], [0.12, 0.01], [0.115, 0.07], [0.1, 0.12], [0.06, 0.16], [0, 0.17]];
  kit.add(armour().plate, organicLathe(pts, { segments: 28, seed: 4, dent: 0.025, oval: 0.06 }));
  const under = organicLathe(pts.map(([r, y]) => [r * 0.97, y - 0.006]), { segments: 28, seed: 4, dent: 0.025, oval: 0.06 });
  under.scale(-1, 1, 1);
  kit.add(armour().dark, under);
  const ring = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU;
    ring.push([Math.sin(a) * 0.122 * 1.06, 0.015, Math.cos(a) * 0.122 * 0.94]);
  }
  kit.add(im.leatherDark, tube(ring, 0.01, { radial: 4, closed: true, tubular: 48 }));
}

// Bearded axe on a gently curved haft (haft along -y from the head).
function beardedAxe(kit, im, m) {
  kit.add(im.wood, tube([[0, 0.05, 0], [0.01, -0.3, 0], [0.004, -0.62, 0]], 0.017, { radial: 7, tip: 0.015 }));
  kit.add(im.leather, organicLathe([[0.02, 0], [0.022, 0.12], [0.02, 0.13]], { segments: 8, seed: 3 }), { y: -0.6 });
  const s = new THREE.Shape();
  s.moveTo(0, 0.04);
  s.lineTo(0.06, 0.035);
  s.quadraticCurveTo(0.14, 0.07, 0.2, 0.09);
  s.quadraticCurveTo(0.23, 0.0, 0.2, -0.13);
  s.quadraticCurveTo(0.12, -0.11, 0.07, -0.05);
  s.lineTo(0, -0.045);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.004, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -0.006);
  kit.add(armour().plate, g, { x: 0.01 });
  kit.add(im.steelDark, bevelBox(0.05, 0.1, 0.045, 0.01), {});
}

// Flanged mace: a turned haft and grip, a head of seven flanges round a core.
function flangedMace(kit, im) {
  kit.add(im.steelDark, tube([[0, 0, 0], [0, -0.55, 0]], 0.014, { radial: 7, tubular: 4 }));
  kit.add(im.leather, organicLathe([[0.018, 0], [0.02, 0.06], [0.02, 0.13], [0.018, 0.15]], { segments: 8, seed: 2 }), { y: -0.55 });
  kit.add(im.steelDark, blob(0.022, 0.03, 0.022, { seed: 2, dent: 0.05 }), { y: -0.56 });
  kit.add(armour().plate, organicLathe([[0, -0.05], [0.03, -0.04], [0.035, 0.06], [0.02, 0.1], [0, 0.11]], { segments: 10, seed: 6 }));
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU;
    const s = new THREE.Shape();
    s.moveTo(0, -0.04);
    s.quadraticCurveTo(0.065, -0.01, 0.06, 0.04);
    s.quadraticCurveTo(0.05, 0.08, 0, 0.1);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 6 });
    g.translate(0, 0, -0.004);
    kit.add(armour().plate, g, { ry: a });
  }
}

// A recurve bow, unstrung tips curling forward, string, leather grip.
function recurveBow(kit, im, m) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16 - 0.5;
    const y = t * 1.3;
    const bend = 0.16 * (1 - Math.pow(2 * t, 2));
    const curl = Math.pow(Math.abs(2 * t), 6) * 0.07;
    pts.push([bend - curl, y, 0]);
  }
  kit.add(im.woodLight, tube(pts, 0.014, { radial: 6, tubular: 48 }));
  kit.add(m.rope, tube([[pts[1][0], pts[1][1], 0], [pts[15][0], pts[15][1], 0]], 0.0025, { radial: 3, tubular: 2 }));
  kit.add(im.leather, organicLathe([[0.019, 0], [0.021, 0.06], [0.019, 0.12]], { segments: 8, seed: 5 }), { x: 0.16, y: -0.06 });
}

// A stitched leather quiver of fletched arrows, on a strap.
function quiver(kit, im, fm, rng) {
  kit.add(im.leather, organicLathe([[0, 0], [0.05, 0.005], [0.062, 0.1], [0.066, 0.45], [0.07, 0.5], [0.06, 0.5]], { segments: 14, seed: 7, dent: 0.05, oval: 0.25 }));
  for (const y of [0.08, 0.42]) {
    const pts = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      pts.push([Math.sin(a) * 0.068 * 1.25, y, Math.cos(a) * 0.068 * 0.75]);
    }
    kit.add(im.leatherDark, tube(pts, 0.007, { radial: 4, closed: true, tubular: 32 }));
  }
  for (let i = 0; i < 9; i++) {
    const a = rng() * TAU;
    const r = rng() * 0.035;
    const x = Math.sin(a) * r * 1.2;
    const z = Math.cos(a) * r * 0.7;
    const lean = (rng() - 0.5) * 0.08;
    kit.frame({ x, z, rz: lean, rx: (rng() - 0.5) * 0.08 }, () => {
      kit.add(im.woodLight, tube([[0, 0.1, 0], [0, 0.72, 0]], 0.004, { radial: 4, tubular: 2 }));
      for (let f = 0; f < 3; f++) kit.add(fm.clothRed, blob(0.004, 0.045, 0.014, { seed: i * 3 + f, dent: 0.15, detail: 0 }), { y: 0.66, ry: (f / 3) * TAU, z: 0.008 });
    });
  }
  kit.add(im.leatherDark, tube([[0, 0.5, -0.06], [0.05, 0.75, -0.12], [0, 0.95, -0.1]], 0.008, { radial: 3 }));
}

// A gnarled staff: a twisting shaft thickening into roots that cradle a
// crystal at the head, a brass ferrule at the foot.
function gnarledStaff(kit, im, gem, seed) {
  const rng = mulberry32(seed);
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const y = i * 0.16;
    pts.push([Math.sin(i * 1.3 + seed) * 0.012, y, Math.cos(i * 1.1 + seed) * 0.012]);
  }
  kit.add(im.wood, tube(pts, 0.02, { radial: 7, tubular: 40, tip: 0.026 }));
  const top = pts[pts.length - 1];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + rng();
    const curl = [];
    for (let j = 0; j <= 6; j++) {
      const f = j / 6;
      const r = 0.03 + Math.sin(f * Math.PI) * 0.05;
      curl.push([top[0] + Math.cos(a + f * 1.2) * r, top[1] + f * 0.2, top[2] + Math.sin(a + f * 1.2) * r]);
    }
    kit.add(im.wood, tube(curl, 0.014, { radial: 5, tubular: 18, tip: 0.005 }));
  }
  kit.add(gem, organicLathe([[0, 0], [0.032, 0.05], [0.03, 0.1], [0, 0.15]], { segments: 6, seed, dent: 0.1, oval: 0.15, flat: true }), { x: top[0], y: top[1] + 0.05, z: top[2], ry: rng() * 3 });
  kit.add(im.brass, organicLathe([[0, 0], [0.018, 0.002], [0.024, 0.02], [0.023, 0.07], [0.026, 0.08], [0.02, 0.085]], { segments: 8, seed }));
}

// A steel breastplate on a wooden stand: a torso shell with a raised
// centre ridge, a rolled neck edge, leather shoulder straps.
function breastplateStand(kit, m, im) {
  kit.add(m.timber, bevelBox(0.45, 0.05, 0.45, 0.012, { metres: 1, grain: true }), { y: 0.025 });
  kit.add(m.timber, bevelBox(0.06, 1.15, 0.06, 0.012, { metres: 1, grain: true }), { y: 0.6 });
  kit.add(m.timber, bevelBox(0.48, 0.05, 0.06, 0.015, { metres: 1, grain: true }), { y: 1.38 });
  // Front plate: a torso shell open at the sides, waisted, swelling over
  // the chest, scooped at the armholes, a ridge down the middle.
  const A = armour();
  const prof = [[0.135, 0], [0.13, 0.08], [0.15, 0.18], [0.175, 0.29], [0.18, 0.36], [0.16, 0.42], [0.11, 0.46]];
  const plate = (front) => {
    const g = organicLathe(prof, { segments: 22, seed: front ? 9 : 10, dent: 0.012, oval: 0.12, phiStart: front ? -1.25 : Math.PI - 1.25, phiLength: 2.5 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      // Armholes: the upper outer corners cut away in a curve.
      const ax = Math.max(0, Math.abs(x) - 0.08) / 0.12;
      if (y > 0.3) y = 0.3 + (y - 0.3) * (1 - Math.min(0.85, ax * ax * 1.2));
      if (front) z += 0.02 * Math.exp(-(x * x) / 0.0018) * Math.min(1, y / 0.1);
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  };
  kit.add(A.plate, plate(true), { y: 0.92 });
  kit.add(A.dark, plate(false), { y: 0.92 });
  // Rolled edges round the neck and down the armholes, and a waist lame.
  const neck = [];
  for (let k = 0; k <= 12; k++) {
    const a = -0.75 + (k / 12) * 1.5;
    neck.push([Math.sin(a) * 0.11 * 1.12, 1.38 - Math.cos(a * 2) * 0.012, Math.cos(a) * 0.11 * 0.88 + 0.006]);
  }
  kit.add(A.plate, tube(neck, 0.008, { radial: 4 }));
  const waist = [];
  for (let k = 0; k <= 16; k++) {
    const a = -1.25 + (k / 16) * 2.5;
    waist.push([Math.sin(a) * 0.137 * 1.12, 0.94, Math.cos(a) * 0.137 * 0.88 + 0.004]);
  }
  kit.add(A.dark, tube(waist, 0.012, { radial: 4 }));
  for (const s of [-1, 1]) kit.add(im.leatherDark, tube([[s * 0.1, 1.36, 0.06], [s * 0.14, 1.43, 0], [s * 0.12, 1.36, -0.08]], 0.012, { radial: 4 }));
  // Pauldrons: overlapping domed shoulder plates hung from the crossbar.
  for (const s of [-1, 1]) {
    kit.frame({ x: s * 0.2, y: 1.36, rz: -s * 0.95 }, () => {
      kit.add(A.plate, organicLathe([[0.12, 0], [0.115, 0.03], [0.09, 0.07], [0.05, 0.095], [0, 0.105]], { segments: 18, seed: s + 20, dent: 0.02, oval: 0.15 }));
      kit.add(A.dark, organicLathe([[0.13, -0.05], [0.125, -0.02], [0.11, 0.0]], { segments: 18, seed: s + 21, dent: 0.02, oval: 0.15 }));
    });
  }
  // A helm on top of the post makes the stand read as a suit.
  kit.frame({ y: 1.43, ry: 0.2 }, () => nasalHelm(kit, im));
  for (let k = 0; k < 6; k++) kit.add(im.brass, blob(0.007, 0.007, 0.005, { seed: k, dent: 0.1, detail: 0 }), { x: (k % 2 ? 1 : -1) * 0.12, y: 0.97 + Math.floor(k / 2) * 0.1, z: 0.113 });
}

// --- The stall -------------------------------------------------------------------

export function armoury(kit, m, im, fm) {
  const w = 2.6;
  const H = 2.25;
  const rng = mulberry32(23);
  const wood = (mat, g, t) => kit.add(mat, g, t);
  for (const sx of [-1, 1]) wood(m.timber, bevelBox(0.11, H, 0.11, 0.018, { metres: 1, grain: true }), { x: sx * (w / 2), y: H / 2, z: -0.12 });
  // Backboard: separate vertical planks over a dark backing.
  wood(m.timber, bevelBox(w - 0.1, 1.7, 0.02, 0.005), { y: 1.2, z: -0.17 });
  const n = 11;
  for (let i = 0; i < n; i++) {
    const pw = (w - 0.12) / n;
    wood(m.planks, bevelBox(pw - 0.008, 1.66 + (rng() - 0.5) * 0.04, 0.028, 0.006, { metres: 1, grain: true }), { x: -w / 2 + 0.06 + pw * (i + 0.5), y: 1.2, z: -0.145 });
  }
  for (const y of [0.42, 1.98]) wood(m.timber, bevelBox(w - 0.1, 0.09, 0.05, 0.014, { metres: 1.2, grain: true }), { y, z: -0.12 });
  // A little shingled canopy on brackets, pitched forward.
  kit.frame({ y: H + 0.02, z: 0.05, rx: 0.42 }, () => {
    wood(m.shingles, bevelBox(w + 0.4, 0.05, 0.6, 0.012, { metres: 1.5 }), {});
    wood(m.timber, bevelBox(w + 0.42, 0.08, 0.05, 0.012, { metres: 1.2, grain: true }), { y: -0.03, z: 0.3 });
  });
  for (const sx of [-1, 1]) wood(m.timber, bevelBox(0.06, 0.45, 0.06, 0.012, { metres: 1, grain: true }), { x: sx * (w / 2), y: H - 0.12, z: 0.1, rx: -0.75 });
  const peg = (x, y) => wood(m.timber, organicLathe([[0.02, 0], [0.016, 0.07], [0.024, 0.09], [0, 0.1]], { segments: 8, seed: x * 10 + y }), { x, y, z: -0.13, rx: Math.PI / 2 - 0.15 });
  // Shields high.
  const shields = [[-0.78, 1.55, 0, 'round'], [0.02, 1.48, 1, 'kite'], [0.82, 1.55, 2, 'round']];
  for (const [x, y, d, kind] of shields) {
    peg(x, y + 0.2);
    kit.frame({ x, y, z: -0.06, rz: (rng() - 0.5) * 0.06, rx: -0.06 }, () => (kind === 'round' ? roundShield(kit, im, d) : kiteShield(kit, im, d)));
  }
  // Helms, an axe and a mace below.
  peg(-0.88, 1.0);
  kit.frame({ x: -0.88, y: 0.86, z: -0.03, rx: 0.15 }, () => nasalHelm(kit, im));
  peg(-0.42, 1.02);
  kit.frame({ x: -0.42, y: 0.86, z: -0.02, rx: -0.45 }, () => kettleHat(kit, im));
  peg(0.12, 1.12);
  kit.frame({ x: 0.1, y: 1.12, z: -0.07, rz: 0.35, s: 1.25 }, () => beardedAxe(kit, im, m));
  peg(0.42, 1.12);
  kit.frame({ x: 0.44, y: 1.12, z: -0.07, rz: -0.3, s: 1.25 }, () => flangedMace(kit, im));
  peg(0.95, 1.22);
  kit.frame({ x: 0.82, y: 0.95, z: -0.07 }, () => recurveBow(kit, im, m));
  kit.frame({ x: 1.12, y: 0.0, z: 0.05, rz: -0.12 }, () => quiver(kit, im, fm, rng));
  // Staffs leaning at the left post; the breastplate stand at the right.
  const gems = [fm.gemBlue, fm.gemGreen, fm.gemPurple];
  for (let k = 0; k < 3; k++) kit.frame({ x: -w / 2 - 0.12 - k * 0.08, y: 0.0, z: 0.0 + k * 0.1, rz: -0.1 + k * 0.04 }, () => gnarledStaff(kit, im, gems[k], k + 5));
  kit.frame({ x: w / 2 + 0.5, z: 0.15, ry: -0.3 }, () => breastplateStand(kit, m, im));
  return { hx: w / 2 + 0.75, hz: 0.35, colliders: [{ cx: 0, cz: -0.1, hx: w / 2 + 0.2, hz: 0.2 }, { cx: w / 2 + 0.5, cz: 0.15, hx: 0.25, hz: 0.25 }] };
}
