// Shape helpers for hand-sized props. Nothing here is a perfect primitive:
// boxes have rounded edges, solids of revolution are dented, squashed oval
// and leaning, so bottles, bowls and legs read as made by hand.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise3D } from '../util/noise.js';

const noise = createNoise3D(71);

// Box-projected UVs in metres: each vertex takes the two axes across its
// dominant normal. With grain, v runs along the longest of those two axes,
// so wood grain follows a board.
export function boxProjectUVs(g, metres = 1, grain = false, dims = null) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    const across = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    const [a, b] = [0, 1, 2].filter((k) => k !== across);
    let u = p.getComponent(i, a);
    let v = p.getComponent(i, b);
    if (grain && dims && dims[a] > dims[b]) [u, v] = [v, u];
    uv[i * 2] = u / metres;
    uv[i * 2 + 1] = v / metres;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// A box with rounded edges and corners (bevel radius r).
export function bevelBox(w, h, d, r = 0.01, { segments = 2, metres = 1, grain = false } = {}) {
  const rr = Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const g = new RoundedBoxGeometry(w, h, d, segments, rr);
  return boxProjectUVs(g, metres, grain, [w, h, d]);
}

// Lathe a profile (points of [radius, height], bottom to top) and roughen it:
// slow dents and bulges, an oval squash and a slight lean, so nothing is a
// perfect solid of revolution. The roughening depends on direction and
// relative height only, so nested shells (glass and liquid) made with the
// same seed and range dent together.
export function organicLathe(points, { segments = 16, seed = 0, dent = 0.05, oval = 0.05, lean = 0, bumps = 2.5, flat = false, range = null, phiStart = 0, phiLength = Math.PI * 2 } = {}) {
  const pts = points.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  const g = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
  const p = g.attributes.position;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const v of pts) {
    y0 = Math.min(y0, v.y);
    y1 = Math.max(y1, v.y);
  }
  // Nested shells pass the outer shell's height range so they dent alike.
  if (range) [y0, y1] = range;
  const span = Math.max(1e-6, y1 - y0);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const y = p.getY(i);
    let z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 1e-7) {
      const cx = x / r;
      const cz = z / r;
      const t = (y - y0) / span;
      const k = 1 + dent * noise(cx * 1.1 + seed * 3.7, t * bumps + seed, cz * 1.1 - seed * 1.3);
      x *= k * (1 + oval);
      z *= k * (1 - oval);
    }
    p.setXYZ(i, x + lean * (y - y0), y, z);
  }
  if (flat) {
    const ng = g.toNonIndexed();
    ng.computeVertexNormals();
    return ng;
  }
  g.computeVertexNormals();
  // The lathe's first and last columns are the same seam: share their normals.
  if (phiLength < Math.PI * 2) return g;
  const n = g.attributes.normal;
  const rows = pts.length;
  for (let j = 0; j < rows; j++) {
    const a = j;
    const b = segments * rows + j;
    const nx = n.getX(a) + n.getX(b);
    const ny = n.getY(a) + n.getY(b);
    const nz = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(a, nx / l, ny / l, nz / l);
    n.setXYZ(b, nx / l, ny / l, nz / l);
  }
  return g;
}

// The radius organicLathe gives a profile radius r at relative height t and
// direction angle a (for fitting bands and straps onto a dented body).
export function latheRadiusAt(r, t, a, { seed = 0, dent = 0.05, oval = 0.05, bumps = 2.5 } = {}) {
  const cx = Math.cos(a);
  const cz = Math.sin(a);
  const k = 1 + dent * noise(cx * 1.1 + seed * 3.7, t * bumps + seed, cz * 1.1 - seed * 1.3);
  return [r * k * (1 + oval) * cx, r * k * (1 - oval) * cz];
}

// A tube through points ([x, y, z] arrays), optionally tapering to `tip`.
export function tube(points, radius, { radial = 5, tubular = 0, closed = false, tip = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(...q)), closed);
  const g = new THREE.TubeGeometry(curve, tubular || points.length * 4, radius, radial, closed);
  if (tip !== null) {
    // Taper: pull each ring toward its centre line by its position along the tube.
    const p = g.attributes.position;
    const segs = g.parameters.tubularSegments;
    const ring = radial + 1;
    const c = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let s = 0; s <= segs; s++) {
      curve.getPointAt(s / segs, c);
      const k = 1 + (tip / radius - 1) * (s / segs);
      for (let j = 0; j < ring; j++) {
        const i = s * ring + j;
        v.fromBufferAttribute(p, i).sub(c).multiplyScalar(k).add(c);
        p.setXYZ(i, v.x, v.y, v.z);
      }
    }
    g.computeVertexNormals();
  }
  return g;
}

// A closed loop (ring, band) of radius pairs around the y axis at height y.
export function ring(pointsXZ, y, radius, radial = 4) {
  return tube(pointsXZ.map(([x, z]) => [x, y, z]), radius, { radial, closed: true, tubular: pointsXZ.length * 2 });
}

// Lumpy blob: an oblong, dented ellipsoid (pebbles, bubbles, wax drops).
export function blob(rx, ry, rz, { seed = 0, dent = 0.25, detail = 1 } = {}) {
  const ico = new THREE.IcosahedronGeometry(1, detail);
  ico.deleteAttribute('uv');
  ico.deleteAttribute('normal');
  const g = mergeVertices(ico);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + dent * noise(x * 1.3 + seed, y * 1.3 - seed, z * 1.3 + seed * 0.7);
    p.setXYZ(i, x * rx * k, y * ry * k, z * rz * k);
  }
  g.computeVertexNormals();
  return g;
}
