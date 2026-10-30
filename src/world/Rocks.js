import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise3D, fbm3, mulberry32 } from '../util/noise.js';
import { ROCK_GLSL } from './rockShading.js';
import { REALM_GLSL, regionUniforms } from './groundShading.js';
import { HILL, HOUSES, PLAZA, RIVER, LAKE, LAKES, CASTLES, PLATES, RUINS, GLADE, nearestRoad } from './plan.js';
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
  const material = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
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
          diffuseColor.rgb *= mix( vec3( 1.0 ), realm.rgb, 0.75 );
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

  // Footprints for keeping grass off rocks: { x, z, r }.
  get footprints() {
    return [...this.instances.map((i) => ({ x: i.x, z: i.z, r: Math.max(i.sx, i.sz) * 0.85 })), ...this.extraFootprints];
  }

  // Colliders for rocks big enough to block the player.
  get colliders() {
    return this.instances
      .filter((i) => Math.max(i.sx, i.sz) > 0.7 && i.sy > 0.5)
      .map((i) => ({ cx: i.x, cz: i.z, hx: i.sx * 0.75, hz: i.sz * 0.75, rot: i.ry }));
  }

  build(noise) {
    const material = createRockMaterial(noise);
    const group = new THREE.Group();
    group.name = 'rocks';
    const variants = [];
    for (let k = 0; k < 10; k++) variants.push(rockGeometry(101 + k * 13, k < 5 ? 'boulder' : 'slab', k < 5 ? 4 : 5));
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
