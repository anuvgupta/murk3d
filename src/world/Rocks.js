import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise3D, fbm3, mulberry32 } from '../util/noise.js';
import { ROCK_GLSL } from './rockShading.js';
import { REALM_GLSL, regionUniforms } from './groundShading.js';
import { HILL, HOUSES, PLAZA, RIVER, LAKE, LAKES, CASTLES, PLATES, RUINS, GLADE, ROADS, nearestRoad } from './plan.js';
import { REGIONS, regionWeight } from './regions.js';

// Generated rock meshes: fractured, faceted and layered, so cliffs and
// boulders read as real stone rather than smooth blobs. A handful of variants
// are instanced many times (one draw call per variant).

// One rock shape. `kind` 'boulder' is rounded; 'slab' is angular and tall,
// for cliff faces.
export function rockGeometry(seed, kind = 'boulder', detail = 5) {
  const random = mulberry32(seed);
  const noise = createNoise3D(seed);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);

  const slab = kind === 'slab';
  // Fracture planes flatten parts of the surface into facets.
  const planes = [];
  const nPlanes = slab ? 5 + Math.floor(random() * 3) : 3 + Math.floor(random() * 4);
  for (let i = 0; i < nPlanes; i++) {
    const n = new THREE.Vector3(random() * 2 - 1, (random() * 2 - 1) * (slab ? 0.5 : 1), random() * 2 - 1).normalize();
    planes.push({ n, d: (slab ? 0.55 : 0.68) + random() * 0.25 });
  }
  planes.push({ n: new THREE.Vector3(0, -1, 0), d: 0.35 }); // flat base to sit in the ground
  const stretch = slab
    ? new THREE.Vector3(0.9 + random() * 0.5, 1.2 + random() * 0.8, 0.8 + random() * 0.4)
    : new THREE.Vector3(0.9 + random() * 0.4, 0.6 + random() * 0.35, 0.8 + random() * 0.4);
  const tilt = (random() - 0.5) * 0.6;

  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const big = fbm3(noise, v.x * 1.3, v.y * 1.3, v.z * 1.3, 3);
    const small = fbm3(noise, v.x * 4.5 + 7, v.y * 4.5, v.z * 4.5, 3);
    v.multiplyScalar(1 + big * 0.3 + small * 0.07);
    for (const p of planes) {
      const t = v.dot(p.n) - p.d;
      if (t > 0) v.addScaledVector(p.n, -t * (slab ? 0.72 : 0.9));
    }
    // Rumple the cut faces so no facet edge is dead straight.
    const rumple = fbm3(noise, v.x * 1.6 + 3, v.y * 1.6, v.z * 1.6 + 5, 2);
    v.multiplyScalar(1 + rumple * (slab ? 0.22 : 0.14));
    v.multiply(stretch);
    // Wobble the long edges sideways: a tall slab's silhouette must not be
    // a pair of ruled lines.
    const wx = fbm3(noise, v.y * 1.1 + 11, v.z * 0.9, v.x * 0.7 + 2, 2);
    const wz = fbm3(noise, v.y * 1.1 + 23, v.x * 0.9, v.z * 0.7 + 4, 2);
    v.x += wx * 0.11 * stretch.x;
    v.z += wz * 0.11 * stretch.z;
    // Bedding layers: small horizontal steps, tilted per rock.
    const layer = v.y + v.x * tilt;
    v.addScaledVector(v.clone().setY(0).normalize(), Math.sin(layer * 11 + big * 3) * 0.025);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // Normalise to a unit box: x, z in [-0.5, 0.5], y in [0, 1], so an
  // instance's scale is its size in metres.
  g.computeBoundingBox();
  const bb = g.boundingBox;
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  g.scale(1 / (bb.max.x - bb.min.x), 1 / (bb.max.y - bb.min.y), 1 / (bb.max.z - bb.min.z));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
  g.computeBoundingSphere();
  return g;
}

export function createRockMaterial(noise) {
  // Rock in shadow still takes a good deal of sky light; without it the shaded side of a hill is one black mass.
  const material = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, envMapIntensity: 1.6 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noise };
    Object.assign(shader.uniforms, regionUniforms());
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\nvarying float vLocalY;`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        mat4 wm = modelMatrix;
        #ifdef USE_INSTANCING
          wm = modelMatrix * instanceMatrix;
        #endif
        vWPos = ( wm * vec4( transformed, 1.0 ) ).xyz;
        vWNormal = normalize( mat3( wm ) * objectNormal );
        vLocalY = position.y;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uNoise;
        varying vec3 vWPos;
        varying vec3 vWNormal;
        varying float vLocalY;
        float rockH;
        ${ROCK_GLSL}
        ${REALM_GLSL}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 wn = normalize( vWNormal );
        vec3 tw = triWeights( wn );
        float detail = 1.0 - smoothstep( 12.0, 70.0, length( vViewPosition ) );
        rockDetailF = detail;
        rockH = rockHeight( vWPos, tw, detail );
        diffuseColor.rgb *= rockAlbedo( vWPos, wn, tw, rockH );
        // Grounding: the foot of every rock is darker and earthier where it
        // meets the soil, so it sits in the ground instead of on it.
        {
          float foot = 1.0 - smoothstep( 0.04, 0.3 + 0.1 * tri( vWPos, tw, 0.4, 2 ), vLocalY );
          diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.52, 0.47, 0.38 ), foot * 0.7 );
        }
        {
          // Realm tint, and snow settling on the upper faces.
          float snow;
          vec4 realm = realmAt( vWPos.xz, snow );
          float rimW;
          diffuseColor.rgb = tintRock( diffuseColor.rgb, realmRock( vWPos.xz, rimW ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.9, 0.92, 0.97 ), clamp( snow, 0.0, 1.0 ) * smoothstep( 0.25, 0.75, wn.y + rockH * 0.3 ) );
        }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = bumpNormal( -vViewPosition, normal, rockH, 3.2 * detail );
        {
          vec3 wn2 = macroNormal( vWPos, wn, 4.0 );
          vec3 vn2 = normalize( ( viewMatrix * vec4( wn2, 0.0 ) ).xyz );
          normal = normalize( mix( normal, vn2, 0.6 ) );
        }`
      );
  };
  return material;
}

// Decides where rocks go. Placement happens before the ground mask is built
// so grass can be kept off them.
export class RockField {
  constructor(terrain, seed = 41) {
    this.terrain = terrain;
    this.random = mulberry32(seed);
    this.instances = []; // { variant, x, y, z, ry, rx, rz, sx, sy, sz }
    this.placeCliff();
    this.placeBoulders();
    this.placeRiverStones();
    this.placeRoadsides();
    this.placeFoothills();
    this.extraFootprints = [];
    this.placePlates();
    this.placeRealms();
  }

  // Boulders and slabs strewn about the realms that ask for them.
  placeRealms() {
    const r = this.random;
    for (const R of REGIONS) {
      if (!R.rocks) continue;
      for (let i = 0; i < R.rocks; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * (R.r - 24);
        const x = R.x + Math.cos(a) * d;
        const z = R.z + Math.sin(a) * d;
        const s = 1 + Math.pow(r(), 2) * 5;
        if (!this.clear(x, z, s)) continue;
        if (this.terrain.normalAt(x, z).y < 0.5) continue;
        const slab = r() < 0.5;
        this.add(slab ? 5 + Math.floor(r() * 5) : Math.floor(r() * 5), x, z, new THREE.Vector3(s, s * (slab ? 1.3 : 0.75), s), { sink: 0.35 });
      }
    }
  }

  // Fallen blocks and scree at the foot of each plate's broken face, and a
  // bare floor (no grass) in the hollow under its lip.
  placePlates() {
    const r = this.random;
    const t = this.terrain;
    for (const p of PLATES) {
      const c = Math.cos(p.dir);
      const s = Math.sin(p.dir);
      const at = (u, v) => [p.x + u * c - v * s, p.z + u * s + v * c];
      for (let v = -p.width / 2 + 3; v <= p.width / 2 - 3; v += 4.5) {
        const [fx, fz] = at(p.length / 2 + p.lift * 0.55, v);
        this.extraFootprints.push({ x: fx, z: fz, r: 4.5 });
      }
      const n = 3 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const v = (r() - 0.5) * (p.width - 4);
        const u = p.length / 2 + p.lift + 1 + r() * 9;
        const [x, z] = at(u, v);
        const sz = 1.2 + r() * 3.2;
        const slab = r() < 0.6;
        this.add(slab ? 5 + Math.floor(r() * 5) : Math.floor(r() * 5), x, z, new THREE.Vector3(sz, sz * (slab ? 0.9 : 0.7), sz * 0.8), {
          sink: 0.3, tilt: 0.7, ry: -p.dir + Math.PI / 2 + (r() - 0.5) * 1.2,
        });
      }
    }
  }

  clear(x, z, r) {
    if (nearestRoad(x, z, r + 1)) return false;
    if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.radius + r + 4) return false;
    for (const h of HOUSES) if (Math.hypot(x - h.x, z - h.z) < Math.max(h.footprint.hx, h.footprint.hz) + r + 3) return false;
    const rq = RIVER.path.nearest(x, z, 20);
    if (rq && rq.d < RIVER.widthAt(rq.s) / 2 + r + 1) return false;
    for (const L of LAKES) if (Math.hypot(x - L.x, z - L.z) < L.radius * 1.3 + r && !(L.ring && Math.hypot(x - L.x, z - L.z) < L.ring - 3)) return false;
    for (const C of CASTLES) if (Math.hypot(x - C.plateau.x, z - C.plateau.z) < C.plateau.radius + 8 + r) return false;
    if (Math.hypot(x - GLADE.x, z - GLADE.z) < GLADE.r + 4 + r) return false;
    for (const R of REGIONS) {
      const g = R.gate || { dx: 50, dz: 50 };
      if (Math.hypot(x - R.x - g.dx, z - R.z - g.dz) < 8 + r) return false;
    }
    for (const s of RUINS) if (Math.hypot(x - s.x, z - s.z) < s.r + r) return false;
    return true;
  }

  add(variant, x, z, size, { sink = 0.3, ry = this.random() * Math.PI * 2, tilt = 0.25, base = null } = {}) {
    const r = this.random;
    const y = base !== null ? base : this.terrain.heightAt(x, z) - size.y * sink;
    this.instances.push({
      variant, x, y, z, ry,
      rx: (r() - 0.5) * tilt, rz: (r() - 0.5) * tilt,
      sx: size.x, sy: size.y, sz: size.z,
    });
  }

  // Big slabs line the overlook's cliff face so it reads as broken rock.
  placeCliff() {
    const r = this.random;
    const t = this.terrain;
    for (let a = HILL.cliffDir - HILL.cliffSpread * 1.0; a <= HILL.cliffDir + HILL.cliffSpread * 1.0; a += 0.15 + r() * 0.12) {
      const edge = t.hillEdge(a);
      const footR = edge + HILL.cliffWidth + 1;
      const foot = t.heightAt(HILL.x + Math.cos(a) * footR, HILL.z + Math.sin(a) * footR);
      const top = t.heightAt(HILL.x + Math.cos(a) * (edge - 2), HILL.z + Math.sin(a) * (edge - 2));
      const face = edge + HILL.cliffWidth * (0.5 + r() * 0.3);
      const x = HILL.x + Math.cos(a) * face;
      const z = HILL.z + Math.sin(a) * face;
      // Outcrops of varied height, leaning back into the slope.
      const tall = (top - foot) * (0.35 + r() * 0.5) + 1.0;
      const variant = r() < 0.6 ? 5 + Math.floor(r() * 5) : Math.floor(r() * 5);
      this.add(variant, x, z, new THREE.Vector3(3 + r() * 4, tall, 2.5 + r() * 2.5), {
        base: foot - 1.0, ry: -a + Math.PI / 2 + (r() - 0.5) * 0.9, tilt: 0.3,
      });
      // Scree and fallen blocks at the foot.
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const fr = edge + HILL.cliffWidth + 1 + r() * 7;
        const fa = a + (r() - 0.5) * 0.12;
        const sz = 0.6 + r() * 1.8;
        this.add(Math.floor(r() * 5), HILL.x + Math.cos(fa) * fr, HILL.z + Math.sin(fa) * fr, new THREE.Vector3(sz, sz * 0.8, sz));
      }
    }
  }

  placeBoulders() {
    const r = this.random;
    let placed = 0;
    for (let tries = 0; tries < 2000 && placed < 90; tries++) {
      const a = r() * Math.PI * 2;
      const d = 20 + Math.sqrt(r()) * 230;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const s = 0.4 + Math.pow(r(), 2.5) * 3.2;
      if (!this.clear(x, z, s)) continue;
      // Boulders gather in small groups.
      const group = 1 + Math.floor(r() * 3);
      for (let k = 0; k < group; k++) {
        const gx = x + (r() - 0.5) * s * 4;
        const gz = z + (r() - 0.5) * s * 4;
        const gs = s * (0.4 + r() * 0.7);
        if (!this.clear(gx, gz, gs)) continue;
        this.add(Math.floor(r() * 5), gx, gz, new THREE.Vector3(gs, gs, gs));
        placed++;
      }
    }
  }

  placeRiverStones() {
    const r = this.random;
    const p = RIVER.path;
    for (let i = 0; i < 40; i++) {
      const s = r() * p.length;
      const c = p.pointAt(s);
      const w = RIVER.widthAt(s) / 2;
      const q = p.nearest(c.x, c.y, 2);
      if (!q) continue;
      const side = r() < 0.5 ? -1 : 1;
      const off = w * (0.6 + r() * 0.6);
      const x = c.x - q.tz * off * side;
      const z = c.y + q.tx * off * side;
      if (nearestRoad(x, z, 6) || Math.hypot(x, z) < 15) continue;
      const size = 0.4 + r() * 1.1;
      this.add(Math.floor(r() * 5), x, z, new THREE.Vector3(size, size * 0.7, size), { sink: 0.35 });
    }
  }

  placeFoothills() {
    const r = this.random;
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const d = 230 + r() * 140;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d * 1.15;
      if (!this.clear(x, z, 4)) continue;
      if (REGIONS.some((R) => regionWeight(R, x, z) > 0.2)) continue;
      const s = 2 + r() * 5;
      const slab = r() < 0.5;
      this.add(slab ? 5 + Math.floor(r() * 5) : Math.floor(r() * 5), x, z, new THREE.Vector3(s, s * (slab ? 1.4 : 0.8), s), { sink: 0.35 });
    }
  }

  // Rock spots: `r` keeps trees clear of the whole rock; the ellipse
  // (ex, ez, rx, rz, rot) is where it actually meets the ground plus a short margin,
  // so the grass thins out around it instead of burying low rocks.
  get footprints() {
    if (this._footprints) return this._footprints;
    const out = [];
    for (const i of this.instances) {
      if (Math.max(i.sx, i.sz) <= 0.35) continue;
      const o = this.outline(i, -0.05, 0.3);
      const r = Math.max(i.sx, i.sz) * 0.85;
      out.push({ x: i.x, z: i.z, r, ex: o ? o.cx : i.x, ez: o ? o.cz : i.z, rx: o ? o.hx + 0.35 : 0.1, rz: o ? o.hz + 0.35 : 0.1, rot: i.ry });
    }
    return (this._footprints = [...out, ...this.extraFootprints]);
  }

  // Pebbles in groups along the verges, and the odd boulder in the road.
  placeRoadsides() {
    const r = this.random;
    for (const road of ROADS) {
      const p = road.path;
      for (let s = 6; s < p.length - 6; s += 1.8) {
        const c = p.pointAt(s);
        const q = p.nearest(c.x, c.y, 2);
        if (!q) continue;
        if (Math.hypot(c.x - PLAZA.x, c.y - PLAZA.z) < PLAZA.radius + 10) continue;
        const side = r() < 0.5 ? -1 : 1;
        const roll = r();
        if (roll < 0.3) {
          const n = 2 + Math.floor(r() * 5);
          const off = road.width / 2 + 0.05 + r() * 0.9;
          const cx = c.x - q.tz * off * side;
          const cz = c.y + q.tx * off * side;
          for (let k = 0; k < n; k++) {
            const size = 0.06 + Math.pow(r(), 1.6) * 0.3;
            const x = cx + (r() - 0.5) * 0.9;
            const z = cz + (r() - 0.5) * 0.9;
            this.add(Math.floor(r() * 5), x, z, new THREE.Vector3(size, size * (0.5 + r() * 0.4), size * (0.7 + r() * 0.5)), { sink: 0.4, tilt: 0.5 });
          }
        } else if (roll < 0.318) {
          const off = (r() - 0.5) * (road.width - 1.2);
          const size = 0.5 + r() * 0.7;
          this.add(Math.floor(r() * 5), c.x - q.tz * off, c.y + q.tx * off, new THREE.Vector3(size, size * 0.7, size * 0.85), { sink: 0.4 });
        }
      }
    }
  }

  // The outline of one rock where its surface lies between `lo` and `hi`
  // metres above the ground, as an ellipse in the rock's own frame, or null
  // if no part of it is at that height. Traced from the mesh itself, since
  // most boulders are sunk well into the ground.
  outline(i, lo, hi) {
    const pts = this.surfaceSamples(i.variant);
    const m = this._m ||= new THREE.Matrix4();
    const v = this._v ||= new THREE.Vector3();
    m.compose(new THREE.Vector3(i.x, i.y, i.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(i.rx, i.ry, i.rz, 'YXZ')), new THREE.Vector3(i.sx, i.sy, i.sz));
    const c = Math.cos(i.ry);
    const s = Math.sin(i.ry);
    // The ground under the rock from a coarse local height grid (cliff slabs
    // straddle a rim, so a single height or plane won't do).
    const t = this.terrain;
    const R = Math.max(i.sx, i.sy, i.sz) * 1.6 + 1;
    const step = Math.max(0.5, R / 24);
    const n = Math.ceil((2 * R) / step) + 1;
    const grid = new Float32Array(n * n);
    for (let gz = 0; gz < n; gz++) for (let gx = 0; gx < n; gx++) grid[gz * n + gx] = t.heightAt(i.x - R + gx * step, i.z - R + gz * step);
    const groundAt = (x, z) => {
      const fx = Math.min(n - 1.001, Math.max(0, (x - i.x + R) / step));
      const fz = Math.min(n - 1.001, Math.max(0, (z - i.z + R) / step));
      const x0 = fx | 0, z0 = fz | 0, ax = fx - x0, az = fz - z0;
      const a = grid[z0 * n + x0], b = grid[z0 * n + x0 + 1], c = grid[(z0 + 1) * n + x0], d = grid[(z0 + 1) * n + x0 + 1];
      return (a * (1 - ax) + b * ax) * (1 - az) + (c * (1 - ax) + d * ax) * az;
    };
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < pts.length; k += 3) {
      v.set(pts[k], pts[k + 1], pts[k + 2]).applyMatrix4(m);
      const dx = v.x - i.x;
      const dz = v.z - i.z;
      const h = v.y - groundAt(v.x, v.z);
      if (h < lo || h > hi) continue;
      const lx = c * dx - s * dz;
      const lz = s * dx + c * dz;
      if (lx < x0) x0 = lx;
      if (lx > x1) x1 = lx;
      if (lz < z0) z0 = lz;
      if (lz > z1) z1 = lz;
    }
    if (x0 > x1) return null;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    return { cx: i.x + c * mx + s * mz, cz: i.z - s * mx + c * mz, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, rot: i.ry };
  }

  // Colliders from each rock's outline at body height (knee to head), as
  // ellipses. Rocks with nothing at that height can be stepped past.
  get colliders() {
    if (this._colliders) return this._colliders;
    const out = [];
    for (const i of this.instances) {
      if (Math.max(i.sx, i.sz) < 0.5 || i.sy < 0.4) continue;
      const o = this.outline(i, 0.4, 1.7);
      if (o && Math.max(o.hx, o.hz) >= 0.25) out.push({ ...o, round: true });
    }
    return (this._colliders = out);
  }

  // Points spread over a variant's surface (a few per triangle), so the
  // body-height slice is found even on big rocks with sparse vertices.
  get variants() {
    if (!this._variants) {
      this._variants = [];
      for (let k = 0; k < 10; k++) this._variants.push(rockGeometry(101 + k * 13, k < 5 ? 'boulder' : 'slab', k < 5 ? 4 : 5));
    }
    return this._variants;
  }

  surfaceSamples(variant) {
    this._samples ||= [];
    if (this._samples[variant]) return this._samples[variant];
    const g = this.variants[variant];
    const pos = g.attributes.position;
    const idx = g.index;
    const tris = idx ? idx.count / 3 : pos.count / 3;
    const at = (t, j) => (idx ? idx.getX(t * 3 + j) : t * 3 + j);
    const N = 3;
    const out = [];
    for (let t = 0; t < tris; t++) {
      const a = at(t, 0), b = at(t, 1), c = at(t, 2);
      for (let u = 0; u <= N; u++) {
        for (let w = 0; w <= N - u; w++) {
          const ku = u / N, kw = w / N, kv = 1 - ku - kw;
          for (const get of ['getX', 'getY', 'getZ']) out.push(pos[get](a) * kv + pos[get](b) * ku + pos[get](c) * kw);
        }
      }
    }
    return (this._samples[variant] = new Float32Array(out));
  }

  build(noise) {
    const material = createRockMaterial(noise);
    const group = new THREE.Group();
    group.name = 'rocks';
    const variants = this.variants;
    const dummy = new THREE.Object3D();
    for (let k = 0; k < variants.length; k++) {
      const list = this.instances.filter((i) => i.variant === k);
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(variants[k], material, list.length);
      list.forEach((i, n) => {
        dummy.position.set(i.x, i.y, i.z);
        dummy.rotation.set(i.rx, i.ry, i.rz, 'YXZ');
        dummy.scale.set(i.sx, i.sy, i.sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}
