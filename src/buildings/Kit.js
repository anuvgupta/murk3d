import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Scale a BoxGeometry's per-face UVs so textures keep a constant size in
// metres. With `grain`, the texture's v axis follows each face's long edge
// (so wood grain runs along a beam).
export function scaleBoxUVs(geometry, w, h, d, metres, grain = false) {
  const uv = geometry.attributes.uv;
  // Face order in BoxGeometry: +x, -x, +y, -y, +z, -z (4 verts each).
  const faceDims = [
    [d, h], [d, h],
    [w, d], [w, d],
    [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [fu, fv] = faceDims[f];
    const swap = grain && fu > fv;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (swap) uv.setXY(i, (v * fv) / metres, (u * fu) / metres);
      else uv.setXY(i, (u * fu) / metres, (v * fv) / metres);
    }
  }
  uv.needsUpdate = true;
}

// Builds static structures from primitives. Parts are added in a local frame
// (a transform stack), collected per material, and finally merged into one
// mesh per material, so a whole village costs a handful of draw calls.
export class Kit {
  constructor() {
    this.parts = new Map();
    this.stack = [new THREE.Matrix4()];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  get current() {
    return this.stack[this.stack.length - 1];
  }

  // Enter a child frame: translate, then rotate (Y, then X, then Z), then scale.
  push({ x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1 } = {}) {
    const local = this.compose(x, y, z, rx, ry, rz, s, s, s);
    this.stack.push(this.current.clone().multiply(local));
    return this;
  }

  pop() {
    this.stack.pop();
    return this;
  }

  // Run fn inside a child frame.
  frame(t, fn) {
    this.push(t);
    fn();
    this.pop();
  }

  compose(x, y, z, rx, ry, rz, sx, sy, sz) {
    this._e.set(rx, ry, rz, 'YXZ');
    this._q.setFromEuler(this._e);
    return new THREE.Matrix4().compose(this._p.set(x, y, z), this._q, this._s.set(sx, sy, sz));
  }

  // Add a geometry (consumed) at an optional local transform.
  add(material, geometry, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
    const m = this.current.clone().multiply(this.compose(x, y, z, rx, ry, rz, sx, sy, sz));
    geometry.applyMatrix4(m);
    // 'aux' (xyz: a reference point such as the part's centre, w: a radius)
    // rides along into the merged mesh, transformed like the positions.
    if (geometry.attributes.aux) {
      const aux = geometry.attributes.aux;
      const k = m.getMaxScaleOnAxis();
      const v = new THREE.Vector3();
      for (let i = 0; i < aux.count; i++) {
        v.set(aux.getX(i), aux.getY(i), aux.getZ(i)).applyMatrix4(m);
        aux.setXYZW(i, v.x, v.y, v.z, aux.getW(i) * k);
      }
    }
    // Mirrored transforms flip winding; keep everything consistent.
    if (m.determinant() < 0) flipWinding(geometry);
    if (!geometry.attributes.uv) {
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    }
    const g = geometry.index ? geometry : indexed(geometry);
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'aux'].includes(name)) g.deleteAttribute(name);
    }
    let list = this.parts.get(material);
    if (!list) this.parts.set(material, (list = []));
    list.push(g);
    return g;
  }

  box(material, w, h, d, t = {}, { metres = 1, grain = false } = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    scaleBoxUVs(g, w, h, d, metres, grain);
    return this.add(material, g, t);
  }

  // A box spanning two points in the local x–y plane (braces, rafters).
  beamBetween(material, ax, ay, bx, by, thickness, depth, z = 0, opts = {}) {
    const len = Math.hypot(bx - ax, by - ay);
    return this.box(material, thickness, len, depth, { x: (ax + bx) / 2, y: (ay + by) / 2, z, rz: -Math.atan2(bx - ax, by - ay) }, { metres: 1.2, grain: true, ...opts });
  }

  cylinder(material, rTop, rBottom, h, t = {}, { segments = 10, metres = 1, open = false } = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, open);
    const uv = g.attributes.uv;
    const circ = Math.PI * (rTop + rBottom);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / metres, (uv.getY(i) * h) / metres);
    return this.add(material, g, t);
  }

  // Merge everything into meshes, one per material.
  build({ castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [material, list] of this.parts) {
      // Optional attributes must agree across a material's parts to merge.
      if (!list.every((g) => g.attributes.aux)) for (const g of list) if (g.attributes.aux) g.deleteAttribute('aux');
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = castShadow && !material.userData.noShadow;
      mesh.receiveShadow = receiveShadow;
      meshes.push(mesh);
    }
    this.parts.clear();
    return meshes;
  }
}

function indexed(geometry) {
  const count = geometry.attributes.position.count;
  const index = new Array(count);
  for (let i = 0; i < count; i++) index[i] = i;
  geometry.setIndex(index);
  return geometry;
}

function flipWinding(geometry) {
  const index = geometry.index;
  if (!index) return;
  const a = index.array;
  for (let i = 0; i < a.length; i += 3) {
    const t = a[i + 1];
    a[i + 1] = a[i + 2];
    a[i + 2] = t;
  }
  index.needsUpdate = true;
}
