import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { organicLathe, blob } from '../buildings/shapes.js';
import { ROADS, PLAZA, BRIDGE, RUINS, LAKES } from './plan.js';
import { REGIONS } from './regions.js';
import { mulberry32 } from '../util/noise.js';

// Mushrooms: fly agarics the size of a person (and bigger) that glow at night
// and bounce you when you land on their caps, and clumps of small white,
// violet and brown ones along the road verges and the forest floor. Every
// kind is one merged geometry (stem, cap, warts) with baked vertex colours
// and a per-vertex glow weight, instanced once per kind.

const KINDS = {
  agaric: { cap: [0.78, 0.15, 0.1], capRim: [0.95, 0.42, 0.22], stem: [0.9, 0.87, 0.78], warts: true, glow: [1.0, 0.25], squat: 0 },
  white: { cap: [0.9, 0.88, 0.8], capRim: [0.82, 0.78, 0.68], stem: [0.86, 0.83, 0.74], warts: false, glow: [0.6, 0.25], squat: 0.2 },
  violet: { cap: [0.46, 0.3, 0.62], capRim: [0.62, 0.45, 0.78], stem: [0.78, 0.74, 0.8], warts: false, glow: [1.2, 0.4], squat: 0.1 },
  brown: { cap: [0.48, 0.36, 0.24], capRim: [0.62, 0.5, 0.34], stem: [0.76, 0.7, 0.58], warts: false, glow: [0.0, 0.0], squat: 0.45 },
};

// Cap profile for a 1 m mushroom: apex at y = 1.5, rim at y ≈ 1.02, r = 0.6.
function capPoint(t, squat) {
  const top = 1.5 - 0.3 * squat;
  const drop = 0.48 - 0.12 * squat;
  return { r: 0.6 * Math.sqrt(t) * (1 - 0.05 * t), y: top - drop * Math.pow(t, 1.6) };
}

function paint(g, rgb, glow) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    c[i * 3] = rgb[0];
    c[i * 3 + 1] = rgb[1];
    c[i * 3 + 2] = rgb[2];
    w[i] = glow;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('glow', new THREE.BufferAttribute(w, 1));
  g.deleteAttribute('uv');
  return g;
}

function mushroomGeometry(kind, seed) {
  const K = KINDS[kind];
  const rng = mulberry32(seed);
  const parts = [];
  // Stem: a bulbous foot, a slight waist, a ring (the skirt) under the cap.
  const stem = organicLathe(
    [[0, 0], [0.24, 0.0], [0.26, 0.06], [0.2, 0.2], [0.17, 0.5], [0.16, 0.74], [0.21, 0.8], [0.23, 0.83], [0.17, 0.87], [0.16, 1.02], [0, 1.02]],
    { segments: 14, seed, dent: 0.06, oval: 0.08, lean: 0.04, bumps: 2.0 }
  );
  parts.push(paint(stem, K.stem, K.glow[1]));
  // Cap: a dome, a rolled rim and a dished underside with the gills' hint.
  const prof = [];
  for (let i = 0; i <= 10; i++) {
    const p = capPoint(i / 10, K.squat);
    prof.push([p.r, p.y]);
  }
  const rim = capPoint(1, K.squat);
  prof.push([rim.r + 0.01, rim.y - 0.03], [rim.r * 0.9, rim.y - 0.06], [0.4, rim.y - 0.055], [0.17, rim.y - 0.04], [0, rim.y - 0.04]);
  const cap = organicLathe(prof.reverse(), { segments: 18, seed: seed + 3, dent: 0.05, oval: 0.07, bumps: 2.2 });
  // Darker toward the rim, lit at the crown.
  {
    const pos = cap.attributes.position;
    const n = pos.count;
    const c = new Float32Array(n * 3);
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i);
      const t = THREE.MathUtils.clamp((1.5 - 0.3 * K.squat - y) / (0.5 - 0.12 * K.squat), 0, 1);
      const under = y < rim.y - 0.01 ? 1 : 0;
      const col = under ? K.stem.map((v) => v * 0.9) : K.cap.map((v, k) => v + (K.capRim[k] - v) * t * 0.8);
      c[i * 3] = col[0];
      c[i * 3 + 1] = col[1];
      c[i * 3 + 2] = col[2];
      w[i] = under ? K.glow[1] * 0.6 : K.glow[0] * (1 - 0.5 * t);
    }
    cap.setAttribute('color', new THREE.BufferAttribute(c, 3));
    cap.setAttribute('glow', new THREE.BufferAttribute(w, 1));
    cap.deleteAttribute('uv');
  }
  parts.push(cap);
  // Warts: flattened flakes of veil scattered over the dome.
  if (K.warts) {
    const n = 11 + Math.floor(rng() * 7);
    for (let i = 0; i < n; i++) {
      const t = 0.08 + rng() * 0.78;
      const a = rng() * Math.PI * 2;
      const p = capPoint(t, K.squat);
      const s = 0.05 + rng() * 0.05;
      const g = blob(s, s * 0.45, s * (0.8 + rng() * 0.4), { seed: i * 3 + seed, dent: 0.3, detail: 1 });
      // Lie on the dome: tilt outward with the surface slope.
      const slope = Math.atan2(0.48 * 1.6 * Math.pow(Math.max(t, 0.01), 0.6), 0.3 / Math.sqrt(Math.max(t, 0.01)));
      const m = new THREE.Matrix4().makeRotationY(-a).multiply(new THREE.Matrix4().makeRotationZ(-slope * 0.9));
      g.applyMatrix4(m);
      g.translate(Math.cos(a) * p.r, p.y + 0.01, Math.sin(a) * p.r);
      parts.push(paint(g, [0.96, 0.94, 0.86], 0.5));
    }
  }
  const merged = mergeGeometries(parts);
  merged.computeBoundingSphere();
  return merged;
}

export class Mushrooms {
  constructor({ terrain, noise }) {
    this.group = new THREE.Group();
    this.group.name = 'mushrooms';
    this.terrain = terrain;
    this.colliders = [];
    this.giants = []; // { x, z, y, s }
    const rng = mulberry32(4242);
    this.rng = rng;
    this.instances = { agaric: [], white: [], violet: [], brown: [] };

    this.placeRoadsides();
    this.placeWoods();

    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0 });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uGlow = { value: 0.15 };
      shader.uniforms.uNoise = { value: noise };
      this.shader = shader;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;\nvarying vec3 vLocal;\nvarying vec3 vMNormal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;\nvLocal = position;\nvMNormal = objectNormal;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGlow;\nuniform sampler2D uNoise;\nvarying float vGlow;\nvarying vec3 vLocal;\nvarying vec3 vMNormal;\nfloat mushH;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // Stem: fibrous, with fine vertical streaks and a little dirt at the
            // foot. Cap: mottled, darker and glossier at the crown, faint radial
            // streaks toward the rim. Underside: gill lines radiating from the stem.
            float ang = atan( vLocal.z, vLocal.x );
            float rad = length( vLocal.xz );
            bool cap = vLocal.y > 0.9 && rad > 0.2;
            bool under = cap && vMNormal.y < -0.2;
            if ( under ) {
              float gills = 0.5 + 0.5 * sin( ang * 60.0 + rad * 6.0 );
              diffuseColor.rgb *= 0.82 + 0.3 * smoothstep( 0.3, 0.7, gills );
              mushH = gills;
            } else if ( cap ) {
              float mottle = texture( uNoise, vec2( ang * 0.5, rad * 1.6 ) + vColor.rg ).g;
              float streak = texture( uNoise, vec2( ang * 2.2, rad * 0.4 ) ).a;
              diffuseColor.rgb *= ( 0.86 + 0.28 * mottle ) * ( 0.94 + 0.12 * streak );
              diffuseColor.rgb *= 1.0 - 0.18 * smoothstep( 0.0, 0.45, rad ); // the crown glows a touch richer
              mushH = mottle;
            } else {
              float fibre = texture( uNoise, vec2( ang * 1.4, vLocal.y * 0.5 ) ).r * 0.6 + texture( uNoise, vec2( ang * 5.0, vLocal.y * 2.5 ) ).b * 0.4;
              diffuseColor.rgb *= 0.86 + 0.26 * fibre;
              diffuseColor.rgb *= mix( vec3( 0.72, 0.66, 0.5 ), vec3( 1.0 ), smoothstep( 0.0, 0.3, vLocal.y ) ); // soil at the foot
              mushH = fibre;
            }
          }`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec3 sx = dFdx( -vViewPosition );
            vec3 sy = dFdy( -vViewPosition );
            vec3 r1 = cross( sy, normal );
            vec3 r2 = cross( normal, sx );
            float det = dot( sx, r1 );
            vec2 dh = vec2( dFdx( mushH ), dFdy( mushH ) ) * 0.6;
            normal = normalize( abs( det ) * normal - sign( det ) * ( dh.x * r1 + dh.y * r2 ) );
          }`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += vColor.rgb * vGlow * uGlow;`
        );
    };
    const dummy = new THREE.Object3D();
    for (const kind of Object.keys(this.instances)) {
      const list = this.instances[kind];
      if (!list.length) continue;
      const geo = mushroomGeometry(kind, kind.length * 17);
      const mesh = new THREE.InstancedMesh(geo, this.material, list.length);
      list.forEach((m, i) => {
        dummy.position.set(m.x, m.y, m.z);
        dummy.rotation.set(m.rx, m.ry, m.rz);
        dummy.scale.setScalar(m.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = kind === 'agaric';
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  add(kind, x, z, s, { lean = 0.12 } = {}) {
    const rng = this.rng;
    const y = this.terrain.heightAt(x, z) - 0.02 * s;
    this.instances[kind].push({ x, y, z, s, ry: rng() * Math.PI * 2, rx: (rng() - 0.5) * lean, rz: (rng() - 0.5) * lean });
    if (kind === 'agaric' && s >= 0.6) {
      this.giants.push({ x, z, y, s });
      this.colliders.push({ cx: x, cz: z, hx: 0.22 * s, hz: 0.22 * s, rot: 0 });
    }
  }

  clear(x, z) {
    if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.radius + 14) return false;
    if (Math.hypot(x - BRIDGE.x, z - BRIDGE.z) < 9) return false;
    for (const L of LAKES) {
      const d = Math.hypot(x - L.x, z - L.z);
      if (d < L.radius * 1.1 && !(L.ring && d < L.ring - 3)) return false;
    }
    for (const s of RUINS) if (Math.hypot(x - s.x, z - s.z) < s.r * 0.8) return false;
    return this.terrain.normalAt(x, z).y > 0.6;
  }

  // A clump of small mushrooms round a point.
  clump(kind, x, z, rng, { n = 3 + Math.floor(rng() * 5), size = [0.08, 0.22], spread = 0.45 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * spread;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      if (!this.clear(px, pz)) continue;
      this.add(kind, px, pz, size[0] + rng() * (size[1] - size[0]), { lean: 0.3 });
    }
  }

  // Along the verges: clumps of small ones, and now and then a big red one.
  placeRoadsides() {
    const rng = this.rng;
    for (const road of ROADS) {
      const p = road.path;
      for (let s = 8; s < p.length - 8; s += 2.2) {
        const c = p.pointAt(s);
        const q = p.nearest(c.x, c.y, 2);
        if (!q) continue;
        const side = rng() < 0.5 ? -1 : 1;
        const r = rng();
        if (r < 0.2) {
          const off = road.width / 2 + 0.25 + rng() * 1.0;
          const kinds = ['white', 'white', 'violet', 'brown'];
          this.clump(kinds[Math.floor(rng() * kinds.length)], c.x - q.tz * off * side, c.y + q.tx * off * side, rng);
        } else if (r < 0.245) {
          const off = road.width / 2 + 0.9 + rng() * 1.3;
          const x = c.x - q.tz * off * side;
          const z = c.y + q.tx * off * side;
          if (this.clear(x, z)) this.add('agaric', x, z, 0.8 + rng() * 1.3);
        }
      }
    }
  }

  // The forest floors: the Elder Wood, the jungle, the overgrown cliffs, and
  // violet clumps glowing in the moonlit ruins.
  placeWoods() {
    const rng = this.rng;
    const scatter = (cx, cz, R, clumps, giants, kinds, giantSize) => {
      for (let i = 0; i < clumps; i++) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * R;
        this.clump(kinds[Math.floor(rng() * kinds.length)], cx + Math.cos(a) * d, cz + Math.sin(a) * d, rng);
      }
      for (let i = 0; i < giants; i++) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * R;
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        if (this.clear(x, z)) this.add('agaric', x, z, giantSize[0] + rng() * (giantSize[1] - giantSize[0]));
      }
    };
    scatter(-215, 128, 80, 70, 16, ['brown', 'white', 'brown', 'violet'], [1.2, 3.0]);
    for (const R of REGIONS) {
      if (R.id === 'jungle') scatter(R.x, R.z, R.r - 30, 40, 12, ['brown', 'white'], [1.4, 3.4]);
      if (R.id === 'cliffruins') scatter(R.x, R.z, R.r - 30, 24, 7, ['brown', 'white', 'violet'], [1.0, 2.4]);
      if (R.id === 'moonlit') scatter(R.x, R.z, R.r - 30, 36, 5, ['violet', 'violet', 'white'], [1.0, 2.0]);
    }
  }

  // Walkable: the domes of the big caps.
  surfaceAt(x, z) {
    let best = null;
    for (const g of this.giants) {
      const d = Math.hypot(x - g.x, z - g.z);
      const R = 0.6 * g.s;
      if (d > R) continue;
      const top = g.y + (1.5 - 0.48 * Math.pow(d / R, 1.6)) * g.s;
      if (best === null || top > best) best = top;
    }
    return best;
  }

  // Landing on a big cap throws you back up.
  bounceAt(x, z) {
    for (const g of this.giants) if (Math.hypot(x - g.x, z - g.z) < 0.6 * g.s) return true;
    return false;
  }

  // Glow: faint by day, bright by night.
  update(nightFactor) {
    if (this.shader) this.shader.uniforms.uGlow.value = 0.15 + 1.8 * nightFactor;
  }
}
