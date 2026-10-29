import * as THREE from 'three';
import { mulberry32 } from '../../util/noise.js';

// Grows one tree from a species definition (see species.js).
//
// Branches are tapered tubes along wandering polylines, grown recursively.
// Leaves are alpha-tested cards clustered along the outer branches; their
// normals point away from the crown centre so the canopy lights softly as one
// mass. Every vertex carries aSway = (bend weight, flutter) for the wind
// shader: the bend grows with height, flutter is for leaves only.
//
// Returns { bark, leaves, height, trunkRadius, crownRadius }.
export function generateTree(spec, seed) {
  const rng = mulberry32(seed * 2654435761);
  const R = (a) => a[0] + rng() * (a[1] - a[0]);
  const branches = [];
  const leafSpots = [];
  const hangs = [];

  const trunkLen = R(spec.height);
  const trunkR = R(spec.radius);
  const trunkDir = new THREE.Vector3((rng() - 0.5) * spec.lean, 1, (rng() - 0.5) * spec.lean).normalize();
  const tmp = new THREE.Vector3();

  const randomUnit = () => {
    const v = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    return v.lengthSq() > 1e-4 ? v.normalize() : v.set(1, 0, 0);
  };

  function grow(start, dir, len, r, level) {
    const segs = Math.max(3, Math.min(14, Math.round(len / (level === 0 ? 1.0 : 0.6 + level * 0.2))));
    const pts = [];
    const radii = [];
    const p = start.clone();
    const d = dir.clone();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push(p.clone());
      radii.push(Math.max(0.012, r * (1 + (spec.taper - 1) * t)));
      if (i === segs) break;
      d.addScaledVector(randomUnit(), spec.gnarl * (level === 0 ? 0.35 : 1) * 0.35);
      if (level > 0) {
        d.y += spec.upward * 0.4;
        if (spec.whorl) d.y -= spec.whorl.droop * 0.25 * t;
        if (spec.hanging && level >= spec.depth) d.y -= 0.15 * t;
      }
      if (spec.spiral && level === 0) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), spec.spiral * 0.15);
      d.normalize();
      p.addScaledVector(d, len / segs);
    }
    branches.push({ pts, radii, level });

    const sampleAt = (t) => {
      const f = t * segs;
      const i = Math.min(segs - 1, Math.floor(f));
      const k = f - i;
      return {
        p: pts[i].clone().lerp(pts[i + 1], k),
        dir: pts[i + 1].clone().sub(pts[i]).normalize(),
        r: radii[i] + (radii[i + 1] - radii[i]) * k,
      };
    };

    if (level < spec.depth) {
      const n = spec.children[level];
      const s0 = spec.start[level];
      for (let k = 0; k < n; k++) {
        const t = spec.whorl && level === 0 ? s0 + (1 - s0) * (k / n) * 0.95 : s0 + (1 - s0) * rng();
        const at = sampleAt(Math.min(0.98, t));
        const az = k * 2.39996 + rng() * 0.6; // golden-angle spiral around the parent
        let childDir;
        if (spec.whorl && level === 0) {
          const ang = spec.angle[level] + (rng() - 0.5) * 0.2;
          childDir = new THREE.Vector3(Math.cos(az) * Math.sin(ang), Math.cos(ang), Math.sin(az) * Math.sin(ang));
        } else {
          const perp = tmp.set(1, 0, 0);
          if (Math.abs(at.dir.x) > 0.9) perp.set(0, 0, 1);
          perp.crossVectors(at.dir, perp).normalize().applyAxisAngle(at.dir, az);
          const ang = spec.angle[level] * (0.8 + rng() * 0.4);
          childDir = at.dir.clone().multiplyScalar(Math.cos(ang)).addScaledVector(perp, Math.sin(ang)).normalize();
        }
        let childLen = len * spec.lenRatio[level] * (0.75 + rng() * 0.5);
        if (spec.whorl && level === 0) childLen *= 0.2 + 1.1 * (1 - t);
        else childLen *= 1 - 0.35 * t;
        grow(at.p, childDir, childLen, at.r * (level === 0 ? 0.55 : 0.62), level + 1);
      }
    }

    // Leaves on the outermost branches (and up a conifer's leader).
    const terminal = level >= spec.depth || (spec.whorl && level === 0);
    if (spec.leaves && terminal) {
      const per = spec.whorl && level === 0 ? 3 : spec.leaves.per;
      for (let i = 0; i < per; i++) {
        const t = spec.whorl && level === 0 ? 0.85 + rng() * 0.15 : 0.35 + rng() * 0.65;
        const at = sampleAt(Math.min(0.999, t));
        leafSpots.push(at.p.addScaledVector(randomUnit(), spec.leaves.spread * 0.5 * rng()));
      }
      if (spec.hanging) {
        for (let i = 0; i < spec.hanging.count; i++) {
          const at = sampleAt(0.3 + rng() * 0.7);
          hangs.push({ p: at.p, len: R(spec.hanging.length) });
        }
      }
    }
  }

  grow(new THREE.Vector3(0, -0.3, 0), trunkDir, trunkLen + 0.3, trunkR, 0);

  // Overall size, for wind weights and normals.
  let height = 0;
  for (const b of branches) for (const p of b.pts) height = Math.max(height, p.y);
  const crown = new THREE.Vector3();
  for (const p of leafSpots) crown.add(p);
  if (leafSpots.length) crown.divideScalar(leafSpots.length);
  else crown.set(0, height * 0.6, 0);
  let crownRadius = 0;
  for (const p of leafSpots) crownRadius = Math.max(crownRadius, Math.hypot(p.x - crown.x, p.z - crown.z));
  for (const h of hangs) height = Math.max(height, h.p.y);

  const bark = buildBark(spec, branches, height, mulberry32(seed + 1));
  const leaves = spec.leaves ? buildLeaves(spec, leafSpots, hangs, crown, crownRadius, height, mulberry32(seed + 2)) : null;
  // Far LOD: main limbs only, half the leaf cards at a larger size.
  const barkLod = buildBark(spec, branches.filter((b) => b.level <= 1), height, mulberry32(seed + 1), true);
  const leavesLod = spec.leaves
    ? buildLeaves(spec, leafSpots.filter((_, i) => i % 2 === 0), hangs.filter((_, i) => i % 2 === 0), crown, crownRadius, height, mulberry32(seed + 2), 1.4)
    : null;
  return { bark, leaves, barkLod, leavesLod, height, trunkRadius: trunkR, crownRadius: Math.max(crownRadius, trunkR * 3) };
}

const swayWeight = (y, height) => Math.pow(Math.max(0, y) / Math.max(1, height), 1.6);

function buildBark(spec, branches, height, rng, lod = false) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const sway = [];
  const indices = [];
  const flarePhase = rng() * 6;

  for (const b of branches) {
    let radial = b.level === 0 ? (spec.flare ? 14 : 8) : b.level === 1 ? 5 : 3;
    if (lod) radial = Math.max(3, Math.ceil(radial / 2));
    // Thin twigs are hidden in the foliage anyway.
    if (b.radii[0] < 0.02 && spec.leaves) continue;
    const base = positions.length / 3;
    const n = b.pts.length;
    let normal = new THREE.Vector3();
    let along = 0;
    const circ = Math.max(1, Math.round((2 * Math.PI * b.radii[0]) / 0.9));
    for (let i = 0; i < n; i++) {
      const p = b.pts[i];
      const t = (i < n - 1 ? b.pts[i + 1].clone().sub(p) : p.clone().sub(b.pts[i - 1])).normalize();
      if (i === 0) {
        normal.set(1, 0, 0);
        if (Math.abs(t.x) > 0.9) normal.set(0, 0, 1);
        normal.crossVectors(t, normal).normalize();
      } else {
        // Parallel transport keeps the rings from twisting.
        normal.sub(t.clone().multiplyScalar(normal.dot(t))).normalize();
        along += p.distanceTo(b.pts[i - 1]);
      }
      const binormal = new THREE.Vector3().crossVectors(t, normal);
      for (let k = 0; k <= radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        let r = b.radii[i];
        // Buttress roots flare out at the base of the giants.
        if (b.level === 0 && spec.flare && p.y < 4) {
          const f = Math.pow(1 - Math.max(0, p.y) / 4, 2.2);
          const lobes = 0.5 + 0.5 * Math.sin(a * 5 + flarePhase);
          r *= 1 + spec.flare * f * (0.35 + 0.65 * lobes * lobes);
        }
        const dir = normal.clone().multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a));
        positions.push(p.x + dir.x * r, p.y + dir.y * r, p.z + dir.z * r);
        normals.push(dir.x, dir.y, dir.z);
        uvs.push((k / radial) * circ, along / 1.4);
        sway.push(swayWeight(p.y, height) * (b.level === 0 ? 0.6 : 1), 0);
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
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 2));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

function buildLeaves(spec, spots, hangs, crown, crownRadius, height, rng, grow = 1) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const sway = [];
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);

  const card = (center, axisU, axisV, w, h, anchorTop = false) => {
    const base = positions.length / 3;
    const corners = anchorTop
      ? [[-0.5, 0], [0.5, 0], [0.5, -1], [-0.5, -1]]
      : [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    const uvc = anchorTop ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 1], [1, 1], [1, 0], [0, 0]];
    corners.forEach(([cu, cv], k) => {
      const p = center.clone().addScaledVector(axisU, cu * w).addScaledVector(axisV, cv * h);
      positions.push(p.x, p.y, p.z);
      // Crown-shaped normals, leaning up: the canopy shades as one soft mass.
      const nrm = p.clone().sub(crown);
      nrm.y *= 0.6;
      nrm.normalize().multiplyScalar(0.75).addScaledVector(up, 0.45).normalize();
      normals.push(nrm.x, nrm.y, nrm.z);
      uvs.push(uvc[k][0], uvc[k][1]);
      // Darker toward the crown's heart and underside.
      const dist = crownRadius > 0 ? Math.min(1, Math.hypot(p.x - crown.x, p.z - crown.z) / crownRadius) : 1;
      const lift = THREE.MathUtils.clamp((p.y - crown.y) / Math.max(1, height * 0.4) + 0.5, 0, 1);
      const ao = 0.45 + 0.35 * dist + 0.25 * lift;
      colors.push(ao, ao, ao);
      sway.push(swayWeight(p.y, height), anchorTop ? 1.6 * (-cv) : 1);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (const s of spots) {
    const size = (spec.leaves.size[0] + rng() * (spec.leaves.size[1] - spec.leaves.size[0])) * grow;
    // Face mostly outward from the crown, with plenty of random tilt.
    const out = s.clone().sub(crown).normalize();
    const n = out.multiplyScalar(0.6).add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5)).normalize();
    if (spec.leaves.flat) n.lerp(up, 0.7).normalize();
    const u = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    u.applyAxisAngle(n, rng() * Math.PI * 2);
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    card(s, u, v, size, size);
  }
  // Willow strands: long vertical cards hanging from the branches.
  for (const h of hangs) {
    const a = rng() * Math.PI * 2;
    const u = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    card(h.p, u, up, 0.55 + rng() * 0.3, h.len, true);
    card(h.p, new THREE.Vector3(-u.z, 0, u.x), up, 0.5, h.len * 0.9, true);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 2));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}
