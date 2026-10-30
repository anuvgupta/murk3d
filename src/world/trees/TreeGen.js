import * as THREE from 'three';
import { mulberry32 } from '../../util/noise.js';

// Grows one tree from a species definition (see species.js).
//
// Stems follow Weber & Penn's "Creation and Rendering of Realistic Trees":
// each is a chain of segments whose direction turns a little every step
// (curve, with an optional curve-back over the second half, plus variation),
// sags under gravity or lifts toward the light (tropism), and wanders, so
// limbs arc like wood. Children sprout along the parent from `start` to the
// tip, rotating round it by the golden angle, with angle and length shaped by
// where on the parent they grow. Broadleaf trunks fork into leaders.
//
// Junctions: a child begins on the parent's axis with a swollen collar that
// tapers to its own radius over its first stretch, and its first segments
// turn gradually from the parent's direction into its own, so branches look
// grown from the trunk rather than stuck into it. Every stem ends in a
// closed, rounded tip.
//
// Leaves come in three levels of detail:
//   near  clumps of individually curved sprig quads round each leaf spot
//         (real volume: leaves at every angle, light and shadow inside)
//   mid   one camera-facing impostor of each clump
//   far   fewer, larger clump impostors
// Normals come from the crown's centre so the canopy shades as one soft mass;
// vertex colour darkens toward its heart. Every vertex carries
// aSway = (bend weight, flutter) for the wind shader.

const UP = new THREE.Vector3(0, 1, 0);
const GOLDEN = 2.39996;
const deg = (d) => (d * Math.PI) / 180;

export function generateTree(spec, seed) {
  const rng = mulberry32(seed * 2654435761);
  const R = (a) => (Array.isArray(a) ? a[0] + rng() * (a[1] - a[0]) : a);
  const V = (base, v) => base + (rng() * 2 - 1) * (v || 0);
  const stems = []; // { pts, radii, level }
  const spots = []; // { p, dir } leaf spots
  const hangs = [];
  // Its own stream, so adding inner leaves left every tree's shape as it was.
  const fillRng = mulberry32(seed * 2654435761 + 977);

  const trunkLen = R(spec.trunk.len);
  const trunkR = R(spec.trunk.radius);
  const levels = spec.levels;
  const shape = spec.shape || ((t) => 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.1)));
  const rot = (v, axis, angle) => v.applyAxisAngle(axis, angle);
  const randomAxis = () => new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();

  function grow({ start, dir, len, r0, r1, level, parentDir = null, collar = 0 }) {
    const P = level === 0 ? spec.trunk : spec.levels_[level - 1];
    const segs = Math.max(4, P.segs || 8);
    const pts = [start.clone()];
    const radii = [collar > r0 ? collar : r0];
    const target = dir.clone().normalize();
    // Leave the parent gradually: begin partway between its direction and ours.
    const d = parentDir ? parentDir.clone().lerp(target, 0.3).normalize() : target.clone();
    let side = new THREE.Vector3().crossVectors(UP, d);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const curveTotal = deg(V(P.curve || 0, P.curveV || 0));
    const curveBack = deg(P.curveBack || 0);
    const wobbleAxis = randomAxis();
    const tropism = P.tropism || 0;
    // Sinuous growth: a smooth S-wave about an axis across the stem, so a
    // gnarled limb snakes rather than running straight.
    const sinuous = deg(P.sinuous || 0);
    const waveAxis = new THREE.Vector3().crossVectors(d, randomAxis()).normalize();
    const wavePhase = rng() * Math.PI * 2;
    const waves = P.waves || 1.3;
    const p = start.clone();
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      if (parentDir && i <= 3) d.lerp(target, 0.45).normalize();
      let step;
      if (curveBack !== 0) step = i <= segs / 2 ? curveTotal / (segs / 2) : curveBack / (segs / 2);
      else step = curveTotal / segs;
      rot(d, side, -step);
      rot(d, wobbleAxis, deg(V(0, P.curveV || 0)) / segs);
      rot(d, randomAxis(), (deg(P.wander || 0) * (rng() - 0.5)) / Math.sqrt(segs));
      if (sinuous) rot(d, waveAxis, (sinuous * Math.cos(t * Math.PI * 2 * waves + wavePhase) * 2.5) / segs);
      d.y += (tropism / segs) * (0.5 + 0.5 * t);
      d.normalize();
      side.crossVectors(UP, d);
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize();
      p.addScaledVector(d, len / segs);
      pts.push(p.clone());
      // Collar swells the base, then the stem tapers to its tip.
      const base = r0 + (r1 - r0) * t;
      const swell = collar > r0 ? (collar - r0) * Math.pow(Math.max(0, 1 - t / 0.22), 2) : 0;
      radii.push(Math.max(0.006, base + swell));
    }
    // Rounded, closed tip.
    pts.push(p.clone().addScaledVector(d, Math.max(0.02, r1 * 1.2)));
    radii.push(0.001);
    stems.push({ pts, radii, level });

    const sampleAt = (t) => {
      const f = Math.min(0.9999, Math.max(0, t)) * segs;
      const i = Math.floor(f);
      const k = f - i;
      return {
        p: pts[i].clone().lerp(pts[i + 1], k),
        dir: pts[i + 1].clone().sub(pts[i]).normalize(),
        r: radii[i] + (radii[i + 1] - radii[i]) * k,
      };
    };

    const isLast = level >= levels - 1;
    if (!isLast) {
      const C = spec.levels_[level];
      const n = Math.round(R(C.n));
      const startFrac = level === 0 ? spec.trunk.start : C.start ?? 0.1;
      const splits = level === 0 && spec.trunk.splits ? Math.round(R(spec.trunk.splits)) : 0;
      let az = rng() * Math.PI * 2;
      for (let k = 0; k < n + splits; k++) {
        const isLeader = k >= n;
        const t = isLeader ? 0.96 + rng() * 0.03 : startFrac + (1 - startFrac) * (level === 0 ? (k + rng() * 0.7) / n : rng());
        const at = sampleAt(t);
        az += GOLDEN + (rng() - 0.5) * 0.8;
        const relT = (t - startFrac) / Math.max(0.01, 1 - startFrac);
        let down = deg(V(C.downAngle, C.downAngleV));
        if (isLeader) down = deg(V(spec.trunk.splitAngle || 28, 10));
        else down *= 1 - 0.35 * relT;
        const perp = new THREE.Vector3().crossVectors(at.dir, Math.abs(at.dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
        rot(perp, at.dir, az);
        const cdir = at.dir.clone().multiplyScalar(Math.cos(down)).addScaledVector(perp, Math.sin(down)).normalize();
        let clen = len * C.lenRatio * (isLeader ? spec.trunk.leaderLen || 0.9 : shape(relT)) * V(1, C.lenV || 0.15);
        const pr = Math.min(at.r, r0 * (isLeader ? 0.72 : C.thick ?? 0.6));
        const cr0 = Math.max(0.006, pr * Math.pow(Math.min(1, clen / len), 0.6));
        grow({
          start: at.p,
          dir: cdir,
          len: clen,
          r0: cr0,
          r1: cr0 * (C.taper ?? 0.2),
          level: level + 1,
          parentDir: at.dir,
          collar: isLeader ? cr0 * 1.15 : Math.min(at.r * 0.95, cr0 * 1.7),
        });
      }
    }

    // Inner canopy: a few clumps along the limbs that carry the leafy twigs,
    // set a little low, so from beneath the crown has leaves at every depth
    // instead of reading as a hollow shell over bare wood.
    if (spec.leaves && level >= 1 && level === levels - 2) {
      const L = spec.leaves;
      const fill = L.fill ?? (['needle', 'scale', 'willow'].includes(spec.leaf.kind) ? 0 : 3);
      for (let i = 0; i < fill; i++) {
        const at = sampleAt(0.35 + fillRng() * 0.5);
        const off = new THREE.Vector3(fillRng() - 0.5, -0.2 - fillRng() * 0.4, fillRng() - 0.5).multiplyScalar(L.spread);
        spots.push({ p: at.p.clone().add(off), dir: at.dir });
      }
    }

    const leafy = spec.leaves && (isLast || (level === 0 && spec.trunk.leafTop));
    if (leafy) {
      const L = spec.leaves;
      const per = level === 0 ? 3 : L.per;
      for (let i = 0; i < per; i++) {
        // Leaves on the outer part of each twig; an oak's 'outer' leaves its
        // inner limbs bare, so the crown parts into masses with wood between.
        const inner = L.outer ?? 0.3;
        const t = level === 0 ? 0.88 + rng() * 0.12 : inner + rng() * (1 - inner);
        const at = sampleAt(t);
        const off = new THREE.Vector3(rng() - 0.5, rng() - 0.3, rng() - 0.5).multiplyScalar(L.spread);
        spots.push({ p: at.p.clone().add(off), dir: at.dir });
      }
      for (let i = 0; i < (L.tipFill ?? 3); i++) {
        const off = new THREE.Vector3(rng() - 0.5, rng() - 0.35, rng() - 0.5).multiplyScalar(L.spread * 1.2);
        spots.push({ p: pts[segs].clone().addScaledVector(d, L.spread * 0.4).add(off), dir: d.clone() });
      }
      if (spec.hanging) {
        for (let i = 0; i < spec.hanging.count; i++) {
          const at = sampleAt(0.3 + rng() * 0.7);
          hangs.push({ p: at.p, len: R(spec.hanging.length) });
        }
      }
    }
  }

  grow({
    start: new THREE.Vector3(0, -0.4, 0),
    dir: new THREE.Vector3((rng() - 0.5) * spec.trunk.lean, 1, (rng() - 0.5) * spec.trunk.lean).normalize(),
    len: trunkLen + 0.4,
    r0: trunkR,
    r1: trunkR * (spec.trunk.taper ?? 0.3),
    level: 0,
  });

  let height = 0;
  for (const s of stems) for (const p of s.pts) height = Math.max(height, p.y);
  const crown = new THREE.Vector3();
  for (const s of spots) crown.add(s.p);
  if (spots.length) crown.divideScalar(spots.length);
  else crown.set(0, height * 0.6, 0);
  let crownRadius = 0.5;
  let crownHeight = 0.5;
  for (const s of spots) {
    crownRadius = Math.max(crownRadius, Math.hypot(s.p.x - crown.x, s.p.z - crown.z));
    crownHeight = Math.max(crownHeight, Math.abs(s.p.y - crown.y));
  }
  for (const h of hangs) height = Math.max(height, h.p.y);
  const ctx = { spec, crown, crownRadius, crownHeight, height };

  const every = (arr, n) => arr.filter((_, i) => i % n === 0);
  return {
    bark: buildBark(spec, stems, height, mulberry32(seed + 1), 0),
    barkMid: buildBark(spec, stems.filter((s) => s.level <= 1), height, mulberry32(seed + 1), 1),
    barkFar: buildBark(spec, stems.filter((s) => s.level === 0), height, mulberry32(seed + 1), 2),
    leavesNear: spec.leaves ? buildSprigs(ctx, spots, hangs, mulberry32(seed + 2)) : null,
    // Mid and far: camera-facing impostors of the same clumps (all of them
    // at mid, so the crown keeps its shape; fewer, larger ones far off),
    // and the willows' strands as plain sprig strips.
    leavesMid: spec.leaves ? buildClumps(ctx, spots, mulberry32(seed + 2), 1) : null,
    leavesFar: spec.leaves ? buildClumps(ctx, every(spots, 6), mulberry32(seed + 2), 2.1) : null,
    hangsMid: hangs.length ? buildSprigs(ctx, [], every(hangs, 2), mulberry32(seed + 3)) : null,
    hangsFar: hangs.length ? buildSprigs(ctx, [], every(hangs, 4), mulberry32(seed + 3)) : null,
    height,
    trunkRadius: trunkR,
    crownRadius: Math.max(crownRadius, trunkR * 3),
  };
}

const swayWeight = (y, height) => Math.pow(Math.max(0, y) / Math.max(1, height), 1.7);

function buildBark(spec, stems, height, rng, lod) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const sway = [];
  const indices = [];
  const flarePhase = rng() * 6;
  const flare = spec.trunk.flare || 0;
  // Gnarl: burls (lumps swelling out of one side of a stem) and ridges
  // that spiral up it, so old wood looks grown and twisted, not turned.
  const gnarl = spec.gnarl || 0;

  for (const stem of stems) {
    let radial = stem.level === 0 ? (flare ? 30 : 12) : stem.level === 1 ? 8 : 6;
    radial = Math.max(4, Math.round(radial / (1 + lod)));
    if (stem.radii[0] < 0.015 && spec.leaves) continue;
    // A flared trunk's foot gets rings every ~0.45 m, so its buttresses swell
    // smoothly out of the ground (with the trunk's own spacing the whole flare
    // fell between two rings: a thin skirt with knife edges, like a shell).
    let b = stem;
    if (stem.level === 0 && flare && lod < 2) {
      const pts = [];
      const radii = [];
      for (let i = 0; i < stem.pts.length - 1; i++) {
        const p0 = stem.pts[i];
        const p1 = stem.pts[i + 1];
        const steps = p0.y < 3.5 ? Math.max(1, Math.ceil(p0.distanceTo(p1) / (0.45 * (1 + lod)))) : 1;
        for (let k = 0; k < steps; k++) {
          pts.push(p0.clone().lerp(p1, k / steps));
          radii.push(stem.radii[i] + (stem.radii[i + 1] - stem.radii[i]) * (k / steps));
        }
      }
      pts.push(stem.pts[stem.pts.length - 1]);
      radii.push(stem.radii[stem.radii.length - 1]);
      b = { ...stem, pts, radii };
    }
    const base = positions.length / 3;
    const n = b.pts.length;
    const normal = new THREE.Vector3();
    let along = 0;
    const barkScale = Math.max(1, Math.pow(spec.trunk.radius[1] / 0.45, 0.8));
    const circ = Math.max(1, Math.round((2 * Math.PI * b.radii[0]) / (1.4 * barkScale)));
    let total = 0;
    for (let i = 1; i < n; i++) total += b.pts[i].distanceTo(b.pts[i - 1]);
    // Made once per stem and kept on it, so every level of detail has the
    // same lumps (no visible change when the detail level switches).
    if (!stem.gnarl) {
      const burls = [];
      if (gnarl && b.radii[0] > 0.03) {
        const count = b.level === 0 ? 5 : b.level === 1 ? 3 : 1;
        for (let k = 0; k < count; k++) {
          burls.push({ s: (0.08 + rng() * 0.8) * total, a: rng() * Math.PI * 2, size: gnarl * (0.25 + rng() * 0.45), len: 0.6 + rng() * 1.2 });
        }
      }
      stem.gnarl = { burls, twist: (1.2 + rng()) * (rng() < 0.5 ? -1 : 1) };
    }
    const { burls, twist } = stem.gnarl;
    for (let i = 0; i < n; i++) {
      const p = b.pts[i];
      const t = (i < n - 1 ? b.pts[i + 1].clone().sub(p) : p.clone().sub(b.pts[i - 1])).normalize();
      if (i === 0) {
        normal.set(1, 0, 0);
        if (Math.abs(t.x) > 0.9) normal.set(0, 0, 1);
        normal.crossVectors(t, normal).normalize();
      } else {
        normal.sub(t.clone().multiplyScalar(normal.dot(t))).normalize();
        along += p.distanceTo(b.pts[i - 1]);
      }
      const binormal = new THREE.Vector3().crossVectors(t, normal);
      const tip = i === n - 1;
      for (let k = 0; k <= radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        let r = b.radii[i];
        if (b.level === 0 && flare && p.y < 3.5) {
          const f = Math.pow(1 - Math.max(0, p.y) / 3.5, 2.4);
          const lobes = 0.5 + 0.5 * Math.sin(a * 5 + flarePhase);
          r *= 1 + flare * f * (0.3 + 0.7 * Math.pow(lobes, 1.3));
        }
        r *= 1 + 0.06 * Math.sin(a * 3 + flarePhase + p.y * 0.7);
        if (gnarl && !tip) {
          const r0 = b.radii[i];
          r *= 1 + gnarl * 0.12 * Math.sin(a * 5 + (along / Math.max(0.2, r0 * 6)) * twist);
          for (const k of burls) {
            const ds = (along - k.s) / (k.len * Math.max(r0, 0.08) * 3);
            const facing = Math.max(0, Math.cos(a - k.a));
            r += r0 * k.size * Math.exp(-ds * ds) * facing * facing;
          }
        }
        const dir = normal.clone().multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a));
        positions.push(p.x + dir.x * r, p.y + dir.y * r, p.z + dir.z * r);
        // The closed tip's normal points along the stem.
        const nn = tip ? dir.clone().lerp(t, 0.8).normalize() : dir;
        normals.push(nn.x, nn.y, nn.z);
        uvs.push((k / radial) * circ, along / (2.4 * barkScale));
        sway.push(swayWeight(p.y, height) * (b.level === 0 ? 0.5 : 1), 0);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < radial; k++) {
        const a = base + i * (radial + 1) + k;
        const c = a + radial + 1;
        indices.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
  }
  return finish({ positions, normals, uvs, sway, indices });
}

// Crown-shaded normal and ambient-occlusion colour for a leaf vertex.
function leafShade(ctx, p, extraNormal, out) {
  const { crown, crownRadius, crownHeight } = ctx;
  const nrm = p.clone().sub(crown);
  nrm.y *= 0.7;
  nrm.normalize().multiplyScalar(0.6).addScaledVector(UP, 0.45);
  if (extraNormal) nrm.addScaledVector(extraNormal, 0.5);
  nrm.normalize();
  const dx = (p.x - crown.x) / crownRadius;
  const dz = (p.z - crown.z) / crownRadius;
  const dy = (p.y - crown.y) / crownHeight;
  const depth = Math.min(1, Math.sqrt(dx * dx + dz * dz + dy * dy * 0.6));
  const under = THREE.MathUtils.clamp(0.5 + dy * 0.7, 0, 1);
  out.normal = nrm;
  out.ao = 0.55 + 0.35 * depth + 0.25 * under;
}

// Near detail: each spot becomes a clump of sprig quads on a small sphere,
// each sprig bent along its length so the clump has body from any angle.
function buildSprigs(ctx, spots, hangs, rng) {
  const { spec, height } = ctx;
  const L = spec.leaves;
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const sway = [];
  const indices = [];
  const shade = {};
  const clumpR = L.spread * 0.45;
  const count = L.sprigs ?? 7;

  const sprig = (basePoint, outDir, len, wid, tint) => {
    // Width axis perpendicular to the sprig, random roll.
    const w = new THREE.Vector3().crossVectors(outDir, Math.abs(outDir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
    w.applyAxisAngle(outDir, rng() * Math.PI * 2);
    const faceN = new THREE.Vector3().crossVectors(w, outDir).normalize();
    // Three rows (base, middle, tip); the middle and tip curl toward faceN.
    const base = positions.length / 3;
    const curl = (0.1 + rng() * 0.2) * len;
    for (let row = 0; row < 3; row++) {
      const v = row / 2;
      const along = basePoint.clone().addScaledVector(outDir, v * len).addScaledVector(faceN, -curl * v * v);
      const halfW = wid * 0.5 * (row === 2 ? 0.75 : 1);
      for (const s of [-1, 1]) {
        const p = along.clone().addScaledVector(w, s * halfW);
        positions.push(p.x, p.y, p.z);
        leafShade(ctx, p, faceN, shade);
        normals.push(shade.normal.x, shade.normal.y, shade.normal.z);
        uvs.push(s < 0 ? 0 : 1, v);
        colors.push(shade.ao * tint[0], shade.ao * tint[1], shade.ao * tint[2]);
        sway.push(swayWeight(p.y, height), 0.6 + v);
      }
    }
    for (let row = 0; row < 2; row++) {
      const a = base + row * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };

  for (const s of spots) {
    const size = L.size[0] + rng() * (L.size[1] - L.size[0]);
    const sprigLen = size * 0.55;
    const sprigWid = size * 0.4;
    // Slight colour shift per clump breaks up the canopy.
    const h = 0.92 + rng() * 0.16;
    const tint = [h, 0.96 + rng() * 0.08, h];
    for (let i = 0; i < count; i++) {
      // Outward from the clump centre, biased up and away from the crown's heart.
      const out = new THREE.Vector3(rng() - 0.5, rng() - 0.3, rng() - 0.5).normalize();
      const away = s.p.clone().sub(ctx.crown).normalize();
      out.addScaledVector(away, 0.5).addScaledVector(UP, 0.15).normalize();
      if (L.flat) out.lerp(UP, 0.6).normalize();
      let basePoint = s.p.clone().addScaledVector(out, clumpR * (0.3 + rng() * 0.4));
      if (L.round) {
        // Round clumps: the sprig lies along the clump's surface instead of
        // pointing out of it, so the clump reads as a soft ball of leaves
        // and the crown's edge as billows rather than spikes.
        const radial = out.clone();
        basePoint = s.p.clone().addScaledVector(radial, clumpR * (0.55 + rng() * 0.45));
        const tangent = randomTangent(radial, rng);
        out.copy(tangent.addScaledVector(radial, 0.1 + 0.4 * (1 - L.round))).normalize();
      }
      sprig(basePoint, out, sprigLen * (0.8 + rng() * 0.4), sprigWid * (0.8 + rng() * 0.4), tint);
    }
  }
  for (const hg of hangs) {
    const a = rng() * Math.PI * 2;
    const dirDown = new THREE.Vector3(0, -1, 0);
    for (const roll of [0]) {
      const w = new THREE.Vector3(Math.cos(a + roll), 0, Math.sin(a + roll));
      const base = positions.length / 3;
      for (let row = 0; row < 3; row++) {
        const v = row / 2;
        const along = hg.p.clone().addScaledVector(dirDown, v * hg.len).addScaledVector(new THREE.Vector3(-w.z, 0, w.x), Math.sin(v * 3) * 0.15);
        for (const sgn of [-1, 1]) {
          const p = along.clone().addScaledVector(w, sgn * 0.22);
          positions.push(p.x, p.y, p.z);
          leafShade(ctx, p, null, shade);
          normals.push(shade.normal.x, shade.normal.y, shade.normal.z);
          uvs.push(sgn < 0 ? 0 : 1, 1 - v);
          colors.push(shade.ao, shade.ao, shade.ao);
          sway.push(swayWeight(p.y, height), 0.5 + 1.5 * v);
        }
      }
      for (let row = 0; row < 2; row++) {
        const q = base + row * 2;
        indices.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
    }
  }
  return finish({ positions, normals, uvs, colors, sway, indices });
}

function randomTangent(n, rng) {
  const r = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5);
  r.addScaledVector(n, -r.dot(n));
  if (r.lengthSq() < 1e-6) r.set(n.y, -n.x, 0);
  return r.normalize();
}

// Mid/far detail: one camera-facing card per clump, painted as a ball of the
// near sprigs and sized to the clump (see paintClumpTexture). Every corner
// sits at the clump's centre; aCorner spreads it out in view space.
function buildClumps(ctx, spots, rng, grow) {
  const { spec, height } = ctx;
  const L = spec.leaves;
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const sway = [];
  const corner = [];
  const indices = [];
  const shade = {};
  const clumpR = L.spread * 0.45;
  for (const s of spots) {
    const leaf = L.size[0] + rng() * (L.size[1] - L.size[0]);
    const reach = L.round ? clumpR + leaf * 0.3 : clumpR * 0.5 + leaf * 0.55;
    const size = (2 * reach * grow) / 0.92;
    const h = 0.92 + rng() * 0.16;
    const tint = [h, 0.96 + rng() * 0.08, h];
    leafShade(ctx, s.p, null, shade);
    const base = positions.length / 3;
    for (const [cu, cv] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      positions.push(s.p.x, s.p.y, s.p.z);
      normals.push(shade.normal.x, shade.normal.y, shade.normal.z);
      uvs.push(cu + 0.5, cv + 0.5);
      colors.push(shade.ao * tint[0], shade.ao * tint[1], shade.ao * tint[2]);
      sway.push(swayWeight(s.p.y, height), 1);
      corner.push(cu * size, cv * size);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = finish({ positions, normals, uvs, colors, sway, indices });
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  // The corners spread past the stored points; pad the bounds to match.
  g.boundingSphere.radius += 2;
  return g;
}

function finish({ positions, normals, uvs, colors, sway, indices }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 2));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}
