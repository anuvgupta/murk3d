import * as THREE from 'three';
import { Kit } from '../buildings/Kit.js';
import { GLADE } from './plan.js';
import { REGIONS } from './regions.js';
import { mulberry32, createNoise3D } from '../util/noise.js';
import { organicLathe } from '../buildings/shapes.js';

// Portal gates. In the Vale a glade east of the village holds a ring of ten
// gates, one to each realm; every realm has a gate home. Most gates are
// Oblivion-style: a pointed arch of one twisted mass of black volcanic rock,
// claws of the same rock leaning out of it, veins of ember along it and a
// swirling fire within. The canyon shrine's gate is a great stone ring.
// Stepping through a gate teleports the player to its twin.

const TAU = Math.PI * 2;
const noise3 = createNoise3D(1313);

// The gates' stone: the obsidian, duller and rougher than the glassy items,
// with molten cracks glowing through it. The cracks are a web of thin lines
// from world-space noise, so they run across fins, claws and dais alike and
// never line up with the geometry; brightest low down, near the lava.
function gateRockMaterial(obsidian, noise) {
  const mat = obsidian.clone();
  mat.roughness = 0.74;
  mat.metalness = 0.06;
  mat.color.setHex(0x2a2422);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noise };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uNoise;\nvarying vec3 vRockPos;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // Two webs of cracks at different scales: ridged noise (a line where
          // the noise crosses its middle) thresholded to thin seams.
          vec3 q = vRockPos;
          float n1 = texture( uNoise, q.xz * 0.45 + q.y * 0.21 ).r;
          float n2 = texture( uNoise, q.xy * 0.9 + q.z * 0.37 + 0.3 ).g;
          float c1 = 1.0 - abs( 2.0 * n1 - 1.0 );
          float c2 = 1.0 - abs( 2.0 * n2 - 1.0 );
          float seam = smoothstep( 0.94, 0.99, c1 ) * 0.9 + smoothstep( 0.96, 0.995, c2 ) * 0.5;
          // Only some of the web is molten: a slow mask leaves most of the
          // rock dark, with the glow gathered in patches.
          float live = smoothstep( 0.5, 0.85, texture( uNoise, q.xz * 0.12 + q.y * 0.05 + 0.6 ).b );
          totalEmissiveRadiance += vec3( 1.0, 0.3, 0.05 ) * seam * live * 1.6;
        }`
      );
  };
  mat.customProgramCacheKey = () => 'gateRock';
  return mat;
}

// A sweep of rock along `path`: rings of `radial` points carried along the
// curve on a parallel-transported frame, radius from `radiusAt(0..1)`, the
// surface pushed about by noise and raised into a few fins that twist round
// the sweep, so it reads as one piece of rough, ridged volcanic rock rather
// than a pipe or a stack of blocks. Tapers to a point when `tip` is set.
// UVs run in metres along and around it.
function rockSweep(path, radiusAt, { radial = 12, seed = 0, fins = 3, finDepth = 0.35, grit = 0.2, twist = 1.5, metres = 2.4, tip = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(path);
  const N = Math.max(8, Math.round(curve.getLength() * 6));
  const pos = [];
  const uv = [];
  const idx = [];
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  const n = new THREE.Vector3();
  const b = new THREE.Vector3();
  const prevN = new THREE.Vector3();
  let along = 0;
  const prevP = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    curve.getPointAt(s, p);
    curve.getTangentAt(s, t).normalize();
    if (i === 0) {
      n.set(0, 0, 1).cross(t);
      if (n.lengthSq() < 1e-4) n.set(1, 0, 0).cross(t);
      n.normalize();
    } else {
      // Carry the last frame's normal along, kept perpendicular to the tangent.
      n.copy(prevN).addScaledVector(t, -prevN.dot(t)).normalize();
      along += p.distanceTo(prevP);
    }
    prevN.copy(n);
    prevP.copy(p);
    b.crossVectors(t, n).normalize();
    let r0 = radiusAt(s);
    if (tip) r0 *= 1 - Math.pow(s, 3) * 0.999;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      // Fins: narrow ridges that wind round the sweep as it goes along.
      const fin = Math.pow(Math.abs(Math.sin((a * fins) / 2 + along * twist + seed)), 8) * finDepth;
      const g = noise3(p.x * 0.9 + Math.cos(a) * 1.3 + seed, p.y * 0.9 + Math.sin(a) * 1.3, p.z * 0.9 + seed * 0.7) * grit;
      const r = r0 * (1 + fin + g);
      pos.push(p.x + (n.x * Math.cos(a) + b.x * Math.sin(a)) * r, p.y + (n.y * Math.cos(a) + b.y * Math.sin(a)) * r, p.z + (n.z * Math.cos(a) + b.z * Math.sin(a)) * r);
      uv.push(along / metres, ((j / radial) * TAU * r0) / metres);
    }
  }
  const ring = radial + 1;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j;
      idx.push(a, a + ring, a + 1, a + 1, a + ring, a + ring + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // The ring's first and last columns are one seam: share their normals.
  const nr = g.attributes.normal;
  for (let i = 0; i <= N; i++) {
    const a = i * ring;
    const c = a + radial;
    const v = new THREE.Vector3(nr.getX(a) + nr.getX(c), nr.getY(a) + nr.getY(c), nr.getZ(a) + nr.getZ(c)).normalize();
    nr.setXYZ(a, v.x, v.y, v.z);
    nr.setXYZ(c, v.x, v.y, v.z);
  }
  return g;
}

// Swirling portal surface: domain-warped noise, bright core, dark rim.
function portalMaterial(noise, colourA, colourB) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uNoise: { value: noise },
      uTime: { value: 0 },
      uColA: { value: new THREE.Color(colourA) },
      uColB: { value: new THREE.Color(colourB) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoise;
      uniform float uTime;
      uniform vec3 uColA;
      uniform vec3 uColB;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length( p ) * 2.0;
        float a = atan( p.y, p.x );
        // Swirl: angle advances with radius and time.
        float sw = a + r * 3.0 - uTime * 1.2;
        vec2 q = vec2( cos( sw ), sin( sw ) ) * r * 0.5 + 0.5;
        float n = texture( uNoise, q * 1.5 + vec2( uTime * 0.05, -uTime * 0.03 ) ).r;
        float n2 = texture( uNoise, q * 3.0 - vec2( uTime * 0.08, uTime * 0.02 ) ).g;
        float flame = smoothstep( 0.25, 0.9, n * 0.7 + n2 * 0.5 + ( 1.0 - r ) * 0.4 );
        vec3 col = mix( uColA, uColB, flame );
        float core = pow( 1.0 - clamp( r, 0.0, 1.0 ), 1.6 );
        col += uColB * core * 1.4;
        col *= 1.6 + 1.2 * flame;
        float alpha = smoothstep( 1.0, 0.86, r );
        gl_FragColor = vec4( col, alpha );
      }`,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
  });
}

export class Portals {
  constructor({ terrain, materials, noise, yAt }) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'portals';
    this.gates = []; // { id (destination), x, y, z, face, kind }
    this.colliders = [];
    this.cooldown = 0;
    this.materials = [];
    this.landmarks = [];
    const m = materials;
    const rng = mulberry32(77);
    const height = (x, z) => (yAt && yAt(x, z)) ?? terrain.heightAt(x, z);

    const kit = new Kit();
    this.rock = gateRockMaterial(m.obsidian, noise);
    const fire = portalMaterial(noise, 0x3a0a04, 0xff8a2a);
    const teal = portalMaterial(noise, 0x062a2c, 0x5af0e0);
    this.materials.push(fire, teal);

    // The glade: a stone dais ringed by the ten gates.
    kit.frame({ x: GLADE.x, y: height(GLADE.x, GLADE.z), z: GLADE.z }, () => {
      kit.cylinder(m.ruinDark, GLADE.r - 8, GLADE.r - 7.5, 0.5, { y: 0.25 }, { segments: 24, metres: 2.4 });
      kit.cylinder(m.ruin, 3.2, 3.6, 0.6, { y: 0.8 }, { segments: 16, metres: 2 });
      kit.cylinder(m.ruin, 2.6, 2.6, 1.0, { y: 1.3 }, { segments: 16, metres: 2 });
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        kit.box(m.ruin, 1.1, 0.5 + rng() * 0.5, 0.8, { x: Math.cos(a) * (GLADE.r - 7.6), y: 0.65, z: Math.sin(a) * (GLADE.r - 7.6), ry: -a }, { metres: 1.6 });
      }
    });
    this.landmarks.push({ name: 'portal glade', x: GLADE.x, z: GLADE.z, r: GLADE.r });

    REGIONS.forEach((R, i) => {
      // Gate in the glade, facing the dais.
      const a = (i / REGIONS.length) * TAU;
      const gx = GLADE.x + Math.cos(a) * GLADE.r;
      const gz = GLADE.z + Math.sin(a) * GLADE.r;
      const face = Math.atan2(GLADE.z - gz, GLADE.x - gx);
      this.gate(kit, m, { id: R.id, x: gx, z: gz, y: height(gx, gz), face, kind: 'oblivion', mat: fire, label: R.name });
      // Gate home, in the realm.
      const off = R.gate || { dx: 50, dz: 50 };
      const hx = R.x + off.dx;
      const hz = R.z + off.dz;
      const hy = off.y !== undefined ? off.y : height(hx, hz);
      const hface = off.face !== undefined ? off.face : Math.atan2(R.z - hz, R.x - hx);
      const ring = R.id === 'canyon' || R.id === 'moonlit';
      this.gate(kit, m, { id: 'vale', x: hx, z: hz, y: hy, face: hface, kind: ring ? 'ring' : 'oblivion', mat: ring ? teal : fire, label: 'the Vale' });
      this.landmarks.push({ name: `${R.name} gate`, x: hx, z: hz, r: 8 });
    });

    for (const mesh of kit.build()) this.group.add(mesh);
  }

  // One gate: its stonework into the kit, its portal surface as its own mesh.
  gate(kit, m, g) {
    const ry = -g.face + Math.PI / 2; // local +z faces `face`
    this.gates.push(g);
    const rng = mulberry32(Math.round(g.x * 7 + g.z * 13));
    if (g.kind === 'ring') {
      // A monumental stone ring on a flagged dais with three steps.
      const R = 5.2;
      kit.frame({ x: g.x, y: g.y, z: g.z, ry }, () => {
        for (let s = 0; s < 3; s++) kit.cylinder(m.ruin, 9.5 - s * 1.5, 9.5 - s * 1.5, 0.35, { y: 0.175 + s * 0.35 }, { segments: 24, metres: 2 });
        const torus = new THREE.TorusGeometry(R, 0.75, 10, 36);
        kit.add(m.ruinDark, torus, { y: 1.05 + R + 0.2 });
        // Rune blocks round the ring, and two squat pylons at its feet.
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU;
          kit.box(m.ruin, 0.6, 0.6, 0.5, { x: Math.cos(a) * R, y: 1.25 + R + Math.sin(a) * R, z: 0.6, rz: a }, { metres: 1 });
        }
        for (const s of [-1, 1]) kit.box(m.ruinDark, 1.6, 1.6, 1.6, { x: s * (R - 0.4), y: 1.05 + 0.8 }, { metres: 2 });
      });
      this.portalDisc(g, ry, R - 0.6, 1.05 + R + 0.2, true);
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      for (const sx of [-1, 1]) this.colliders.push({ cx: g.x + sx * (R - 0.4) * c, cz: g.z - sx * (R - 0.4) * s, hx: 0.8, hz: 0.8, rot: ry });
      return;
    }
    // Oblivion gate: a pointed arch that is one twisted mass of black rock,
    // thick at the feet and drawn up to a spire, claws of rock leaning out of
    // it, ember veins along it, on a cracked dais of the same rock.
    const W = 2.1; // half width at the widest
    const H = 5.6; // apex height
    const seed = rng() * 100;
    // The arch's spine: a pointed oval from the left foot, over the apex,
    // to the right foot, sunk a little into the dais at each end.
    const spine = [];
    const K = 18;
    for (let i = 0; i <= K; i++) {
      const ang = Math.PI * (i / K);
      spine.push(new THREE.Vector3(-Math.cos(ang) * W * (0.75 + 0.25 * Math.sin(ang)), Math.sin(ang) * H - 0.3 + 0.3 * Math.sin(ang), 0));
    }
    kit.frame({ x: g.x, y: g.y, z: g.z, ry }, () => {
      // Dais: a low slab of the rock, its edge broken, not a turned disc.
      kit.add(this.rock, organicLathe([[0, 0], [3.3, 0], [3.9, 0.12], [3.7, 0.4], [3.1, 0.45], [0, 0.45]], { segments: 28, seed: seed + 5, dent: 0.12, oval: 0.08, bumps: 4 }));
      // Lava cracking out from the gate's foot across the dais.
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + 0.2 + (rng() - 0.5) * 0.3;
        const len = 1.4 + rng() * 1.8;
        const pts = [];
        for (let k = 0; k <= 4; k++) {
          const d = 0.5 + (len * k) / 4;
          const wob = (rng() - 0.5) * 0.35 * (k > 0 && k < 4 ? 1 : 0);
          pts.push(new THREE.Vector3(Math.cos(a) * d - Math.sin(a) * wob, 0.44, Math.sin(a) * d + Math.cos(a) * wob));
        }
        kit.add(m.ember, rockSweep(pts, (s) => 0.07 * (1 - 0.6 * s), { radial: 5, seed: seed + i, fins: 0, grit: 0.3, tip: true }));
      }
      // The arch: thick roots, slimmer at the crown, fins winding round it.
      kit.add(this.rock, rockSweep(spine, (s) => 0.9 - 0.45 * Math.sin(Math.PI * s), { radial: 14, seed, fins: 3, finDepth: 0.4, grit: 0.22, twist: 1.1 }));
      // Claws: curved spikes of rock growing out of the arch, leaning away
      // from the opening and a little forward, longest round the shoulders.
      for (let i = 1; i < K; i += 2) {
        const ang = Math.PI * (i / K);
        const base = spine[i];
        const out = new THREE.Vector3(-Math.cos(ang) * 1.0, Math.sin(ang) * 0.6 + 0.25, 0).normalize();
        const len = 1.4 + 1.3 * Math.sin(ang) * (0.6 + rng() * 0.4);
        const fwd = (rng() - 0.5) * 0.9;
        const pts = [];
        for (let k = 0; k <= 3; k++) {
          const u = k / 3;
          // Curve: the claw hooks upward as it goes.
          pts.push(base.clone().addScaledVector(out, u * len).add(new THREE.Vector3(0, 0.35 * u * u * len, fwd * u)));
        }
        kit.add(this.rock, rockSweep(pts, (s) => 0.32 * (1 - 0.7 * s), { radial: 8, seed: seed + 10 + i, fins: 2, finDepth: 0.3, grit: 0.25, twist: 2.5, tip: true }));
      }
      // Spire at the apex.
      const apex = spine[K / 2];
      kit.add(this.rock, rockSweep([apex.clone(), apex.clone().add(new THREE.Vector3(0.1, 1.2, 0)), apex.clone().add(new THREE.Vector3(-0.05, 2.6, 0))], (s) => 0.42 * (1 - 0.75 * s), { radial: 8, seed: seed + 50, fins: 3, finDepth: 0.35, grit: 0.2, twist: 2.0, tip: true }));
    });
    this.portalDisc(g, ry, W * 0.62, H * 0.5, false, H * 0.4);
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    for (const sx of [-1, 1]) this.colliders.push({ cx: g.x + sx * W * c, cz: g.z - sx * W * s, hx: 0.45, hz: 0.45, rot: ry });
  }

  // The swirling surface filling a gate.
  portalDisc(g, ry, radius, y, round, ySquash = radius) {
    const geo = round ? new THREE.CircleGeometry(radius, 36) : new THREE.CircleGeometry(1, 36);
    const mesh = new THREE.Mesh(geo, g.mat);
    if (!round) mesh.scale.set(radius, ySquash, 1);
    mesh.position.set(g.x, g.y + y, g.z);
    mesh.rotation.y = ry;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    g.disc = mesh;
  }

  // Where to put the player on arriving through a gate to `id`.
  arrivalFor(id) {
    const g = this.gates.find((gate) => gate.id === id) || null;
    // The gate home to the Vale that belongs to realm `id` is the one whose
    // position lies in that realm; the glade gate to `id` points the other way.
    let target;
    if (id === 'vale') {
      target = { x: GLADE.x, z: GLADE.z - 4, yaw: Math.PI, y: undefined };
    } else {
      const R = REGIONS.find((r) => r.id === id);
      const home = this.gates.find((gate) => gate.id === 'vale' && Math.hypot(gate.x - R.x, gate.z - R.z) < R.r + 40);
      // Step out 3 m in front of the home gate, facing away from it.
      const dx = Math.cos(home.face);
      const dz = Math.sin(home.face);
      target = { x: home.x + dx * 3.2, z: home.z + dz * 3.2, yaw: Math.atan2(-dx, -dz), y: home.y };
    }
    void g;
    return target;
  }

  // Animate; return the destination id when the player walks into a gate.
  update(dt, player) {
    for (const mat of this.materials) mat.uniforms.uTime.value += dt;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return null;
    }
    for (const g of this.gates) {
      const dx = player.x - g.x;
      const dz = player.z - g.z;
      if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(player.y - g.y) < 4) {
        this.cooldown = 2.5;
        return g.id;
      }
    }
    return null;
  }
}
