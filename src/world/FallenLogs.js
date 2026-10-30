import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { blob, tube } from '../buildings/shapes.js';
import { bark as barkTexture } from '../buildings/textures.js';
import { mulberry32 } from '../util/noise.js';

// Fallen trees on the forest floors: a bark-covered bole lying along the
// ground, slightly bent, with moss over its upper side, broken branch stubs,
// splintered ends showing pale heartwood rings, and on the big ones the root
// plate torn up with them. Each rests on the terrain under it. You can walk
// round them, or jump up and walk along them.

// Where they lie: [x, z, radius, count, size] per wood; size 'giant' for the
// Elder Wood's fallen columns, mixed with ordinary trunks.
const WOODS = [
  { x: -215, z: 128, r: 84, n: 26, giant: 0.4 },
  { x: -62, z: 112, r: 36, n: 5, giant: 0 },
  { x: 96, z: -78, r: 38, n: 4, giant: 0 },
  { x: -22, z: -142, r: 30, n: 3, giant: 0 },
  { x: 118, z: 92, r: 32, n: 4, giant: 0 },
  { x: -150, z: -150, r: 26, n: 3, giant: 0 },
  { x: 170, z: -170, r: 52, n: 6, giant: 0 },
];

function endgrainTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  // Pale heartwood, darkening toward the sapwood and bark, with growth rings
  // and radial checks.
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#b89a6e');
  g.addColorStop(0.7, '#9c7c55');
  g.addColorStop(0.92, '#6e5236');
  g.addColorStop(1, '#3a2a1c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  let s = 5;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let r = 6; r < S / 2; r += 3 + rnd() * 5) {
    ctx.strokeStyle = `rgba(70,48,28,${0.18 + rnd() * 0.2})`;
    ctx.lineWidth = 1 + rnd();
    ctx.beginPath();
    ctx.ellipse(S / 2 + (rnd() - 0.5) * 3, S / 2 + (rnd() - 0.5) * 3, r, r * (0.96 + rnd() * 0.06), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    ctx.strokeStyle = 'rgba(40,26,14,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(S / 2 + Math.cos(a) * S * 0.08, S / 2 + Math.sin(a) * S * 0.08);
    ctx.lineTo(S / 2 + Math.cos(a) * S * (0.3 + rnd() * 0.2), S / 2 + Math.sin(a) * S * (0.3 + rnd() * 0.2));
    ctx.stroke();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

export class FallenLogs {
  // forest: for placed trees and isClear(); noise: the shared noise texture.
  constructor({ terrain, forest, noise }) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'fallen-logs';
    this.logs = [];
    this.colliders = [];
    const rng = mulberry32(6151);

    for (const W of WOODS) {
      let made = 0;
      for (let tries = 0; tries < W.n * 12 && made < W.n; tries++) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * W.r;
        const giant = rng() < W.giant;
        const len = giant ? 14 + rng() * 10 : 5 + rng() * 7;
        const r = giant ? 0.85 + rng() * 0.5 : 0.28 + rng() * 0.3;
        const log = this.fit(W.x + Math.cos(a) * d, W.z + Math.sin(a) * d, rng() * Math.PI, len, r, forest);
        if (!log) continue;
        log.giant = giant;
        log.rootPlate = giant ? rng() < 0.7 : rng() < 0.25;
        this.logs.push(log);
        made++;
      }
    }

    const barkParts = [];
    const grainParts = [];
    const soilParts = [];
    for (const log of this.logs) this.build(log, rng, barkParts, grainParts, soilParts);

    const bt = barkTexture([0.38, 0.3, 0.23], 6, 1.4);
    const barkMat = new THREE.MeshStandardMaterial({ map: bt.map, bumpMap: bt.bump, bumpScale: 4, roughness: 0.92 });
    // Moss gathers on the upper side (by world normal), in patches.
    barkMat.onBeforeCompile = (shader) => {
      shader.uniforms.uNoise = { value: noise };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWN;\nvarying vec3 vWP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWN = normalize( mat3( modelMatrix ) * objectNormal );\nvWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uNoise;\nvarying vec3 vWN;\nvarying vec3 vWP;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            float n = texture( uNoise, vWP.xz * 0.35 + vWP.y * 0.1 ).g * 0.6 + texture( uNoise, vWP.xz * 1.7 ).b * 0.4;
            float moss = smoothstep( 0.35, 0.75, vWN.y + ( n - 0.5 ) * 1.1 );
            vec3 mc = mix( vec3( 0.16, 0.22, 0.08 ), vec3( 0.32, 0.38, 0.14 ), n );
            diffuseColor.rgb = mix( diffuseColor.rgb, mc, moss * 0.85 );
          }`
        );
    };
    const grainMat = new THREE.MeshStandardMaterial({ map: endgrainTexture(), roughness: 0.95 });
    const soilMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    for (const [parts, mat] of [[barkParts, barkMat], [grainParts, grainMat], [soilParts, soilMat]]) {
      if (!parts.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    // Logs too tall to step over block the way, until you're up on them.
    for (const L of this.logs) {
      const top = Math.min(L.y0, L.y1) + L.r;
      const ground = Math.min(this.terrain.heightAt(L.x0, L.z0), this.terrain.heightAt(L.x1, L.z1));
      if (top - ground < 0.5) continue;
      this.colliders.push({ cx: (L.x0 + L.x1) / 2, cz: (L.z0 + L.z1) / 2, hx: L.r * 0.9, hz: L.len / 2, rot: L.yaw, top });
    }
  }

  // Lay a log of length len and radius r centred at (x, z), heading yaw,
  // resting on the ground beneath it; null if it would cross a trunk, a road
  // or a building, or the ground is too steep or broken.
  fit(x, z, yaw, len, r, forest) {
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    const x0 = x - (dx * len) / 2;
    const z0 = z - (dz * len) / 2;
    const x1 = x + (dx * len) / 2;
    const z1 = z + (dz * len) / 2;
    const K = Math.ceil(len / 1.5);
    const t = this.terrain;
    const h0 = t.heightAt(x0, z0);
    const h1 = t.heightAt(x1, z1);
    if (Math.abs(h1 - h0) / len > 0.3) return null;
    let raise = -Infinity;
    let sag = 0;
    for (let k = 0; k <= K; k++) {
      const f = k / K;
      const px = x0 + (x1 - x0) * f;
      const pz = z0 + (z1 - z0) * f;
      if (!forest.isClear(px, pz, r + 0.5)) return null;
      const h = t.heightAt(px, pz);
      const line = h0 + (h1 - h0) * f;
      raise = Math.max(raise, h - line);
      sag = Math.min(sag, h - line);
    }
    // Bridging a ditch by more than its own thickness looks wrong.
    if (raise - sag > r * 1.4) return null;
    for (const tr of forest.placed) {
      if (Math.abs(tr.x - x) > len && Math.abs(tr.z - z) > len) continue;
      // Distance from the trunk to the log's axis.
      const ax = tr.x - x0;
      const az = tr.z - z0;
      const along = Math.max(0, Math.min(len, ax * dx + az * dz));
      const d = Math.hypot(ax - dx * along, az - dz * along);
      if (d < r + 0.6 + (tr.species === 'giant' ? 2.6 : tr.species === 'fern' ? 0 : 0.7)) return null;
    }
    // The bole rests on its highest point of contact, sunk a little.
    const lift = raise + r * 0.75;
    return { x0, z0, x1, z1, y0: h0 + lift, y1: h1 + lift, len, r, yaw, dx, dz };
  }

  build(L, rng, barkParts, grainParts, soilParts) {
    const radial = L.giant ? 18 : 12;
    const rings = Math.max(6, Math.round(L.len / (L.giant ? 0.9 : 0.6)));
    const bend = (rng() - 0.5) * L.len * 0.06;
    const side = new THREE.Vector3(L.dz, 0, -L.dx);
    const axis = new THREE.Vector3(L.dx, (L.y1 - L.y0) / L.len, L.dz).normalize();
    const up = new THREE.Vector3().crossVectors(side, axis).normalize();
    const centre = (f) => new THREE.Vector3(L.x0 + (L.x1 - L.x0) * f, L.y0 + (L.y1 - L.y0) * f, L.z0 + (L.z1 - L.z0) * f).addScaledVector(side, Math.sin(Math.PI * f) * bend);
    const radiusAt = (f) => L.r * (1.08 - 0.22 * f) * (f < 0.06 && L.rootPlate ? 1 + (0.06 - f) * 6 : 1);

    // The bole: rings along the axis, bark uv in metres.
    const pos = [];
    const nrm = [];
    const uv = [];
    const idx = [];
    const circ = Math.max(1, Math.round((2 * Math.PI * L.r) / 1.6));
    const jag = [];
    for (let k = 0; k <= radial; k++) jag.push([(rng() - 0.5) * L.r * 0.9, (rng() - 0.5) * L.r * 0.9]);
    for (let i = 0; i <= rings; i++) {
      const f = i / rings;
      const c = centre(f);
      const r = radiusAt(f);
      for (let k = 0; k <= radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        const lump = 1 + 0.05 * Math.sin(a * 3 + f * 9) + 0.03 * Math.sin(a * 7 - f * 23);
        const dir = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
        const p = c.clone().addScaledVector(dir, r * lump);
        // Splintered ends: the last ring at each end is torn unevenly.
        if (i === 0) p.addScaledVector(axis, jag[k % radial][0]);
        if (i === rings) p.addScaledVector(axis, jag[k % radial][1]);
        pos.push(p.x, p.y, p.z);
        nrm.push(dir.x, dir.y, dir.z);
        uv.push((k / radial) * circ, (f * L.len) / 1.4);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let k = 0; k < radial; k++) {
        const a = i * (radial + 1) + k;
        const b = a + radial + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const bole = new THREE.BufferGeometry();
    bole.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bole.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    bole.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    bole.setIndex(idx);
    barkParts.push(bole);

    // End faces: heartwood, recessed a little inside the torn rim.
    for (const end of [0, 1]) {
      if (end === 0 && L.rootPlate) continue;
      const f = end;
      const c = centre(f);
      const r = radiusAt(f) * 0.94;
      const out = axis.clone().multiplyScalar(end ? 1 : -1);
      const cap = new THREE.CircleGeometry(r, radial);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
      cap.applyQuaternion(q);
      cap.translate(c.x - out.x * L.r * 0.15, c.y - out.y * L.r * 0.15, c.z - out.z * L.r * 0.15);
      grainParts.push(cap);
    }

    // Broken branch stubs, mostly on the sides and top.
    const stubs = L.giant ? 4 + Math.floor(rng() * 4) : 1 + Math.floor(rng() * 3);
    for (let s = 0; s < stubs; s++) {
      const f = 0.25 + rng() * 0.65;
      const a = (rng() - 0.5) * Math.PI * 1.4;
      const dir = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).addScaledVector(axis, 0.4 + rng() * 0.4).normalize();
      const sr = L.r * (0.18 + rng() * 0.2);
      const sl = L.r * (0.6 + rng() * 1.4);
      const g = new THREE.CylinderGeometry(sr * 0.55, sr, sl, 8, 1, false);
      g.translate(0, sl / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      const c = centre(f).addScaledVector(dir, radiusAt(f) * 0.7);
      g.translate(c.x, c.y, c.z);
      barkParts.push(g);
    }

    // The root plate: a disc of earth torn up with the trunk, standing on
    // edge at its foot, with thick roots curling out of it.
    if (L.rootPlate) {
      const c = centre(0).addScaledVector(axis, -L.r * 0.25);
      const R = L.r * (1.6 + rng() * 0.4);
      const plate = blob(R, R * 0.88, L.r * 0.5, { seed: Math.floor(rng() * 1000), dent: 0.3, detail: 3 });
      // Earth: brown with paler crumbs, darker toward the rim and underside.
      const pp = plate.attributes.position;
      const col = new Float32Array(pp.count * 3);
      for (let i = 0; i < pp.count; i++) {
        const rim = Math.hypot(pp.getX(i), pp.getY(i)) / R;
        const crumb = Math.sin(pp.getX(i) * 13.1 + pp.getY(i) * 7.7) * Math.sin(pp.getY(i) * 11.3 - pp.getZ(i) * 5.3);
        const k = (1.05 - 0.35 * rim - 0.15 * Math.max(0, -pp.getY(i) / R)) * (crumb > 0.6 ? 1.25 : 1);
        col[i * 3] = 0.36 * k;
        col[i * 3 + 1] = 0.27 * k;
        col[i * 3 + 2] = 0.18 * k;
      }
      plate.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
      plate.applyQuaternion(q);
      plate.translate(c.x, c.y + R * 0.2, c.z);
      soilParts.push(plate);
      // Roots: thick at the plate, tapering, curling back and down.
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + rng() * 0.5;
        const radialDir = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
        const o = c.clone().addScaledVector(radialDir, R * (0.35 + rng() * 0.3));
        o.y += R * 0.2;
        const len = R * (0.5 + rng() * 0.6);
        const pts = [];
        for (let j = 0; j <= 4; j++) {
          const f = j / 4;
          const p = o.clone().addScaledVector(axis, -len * f * 0.8).addScaledVector(radialDir, len * f * 0.5);
          p.y -= len * f * f * 0.5;
          pts.push([p.x, p.y, p.z]);
        }
        const g = tube(pts, L.r * (0.12 + rng() * 0.08), { radial: 6, tubular: 8, tip: L.r * 0.02 });
        barkParts.push(g);
      }
    }
  }

  // Standing on a log: the height of its upper surface at (x, z), or null.
  surfaceAt(x, z) {
    let best = null;
    for (const L of this.logs) {
      const ax = x - L.x0;
      const az = z - L.z0;
      const along = ax * L.dx + az * L.dz;
      if (along < 0 || along > L.len) continue;
      const across = Math.abs(ax * L.dz - az * L.dx);
      const r = L.r * (1.08 - 0.22 * (along / L.len));
      if (across > r * 0.85) continue;
      const top = L.y0 + (L.y1 - L.y0) * (along / L.len) + Math.sqrt(r * r - across * across);
      if (best === null || top > best) best = top;
    }
    return best;
  }
}
