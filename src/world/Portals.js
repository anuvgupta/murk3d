import * as THREE from 'three';
import { Kit } from '../buildings/Kit.js';
import { GLADE } from './plan.js';
import { REGIONS } from './regions.js';
import { mulberry32 } from '../util/noise.js';

// Portal gates. In the Vale a glade east of the village holds a ring of ten
// gates, one to each realm; every realm has a gate home. Most gates are
// Oblivion-style: a jagged pointed arch of black stone, ember cracks and a
// swirling fire within. The canyon shrine's gate is a great stone ring.
// Stepping through a gate teleports the player to its twin.

const TAU = Math.PI * 2;

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
    // Oblivion gate: a pointed oval of jagged black blocks with ember seams,
    // spikes leaning outward, a cracked dais beneath.
    const W = 2.1; // half width at the widest
    const H = 5.6; // apex height
    kit.frame({ x: g.x, y: g.y, z: g.z, ry }, () => {
      kit.cylinder(m.obsidian, 3.6, 3.9, 0.4, { y: 0.2 }, { segments: 14, metres: 2 });
      kit.cylinder(m.ember, 3.0, 3.0, 0.42, { y: 0.2 }, { segments: 14 });
      const N = 26;
      for (let i = 0; i <= N; i++) {
        const t = i / N; // 0 at the left foot, 1 at the right foot
        const ang = Math.PI * t; // around the pointed oval
        const px = -Math.cos(ang) * W * (0.75 + 0.25 * Math.sin(ang));
        const py = Math.sin(ang) * H * (i === 0 || i === N ? 0.0 : 1.0) + (i === 0 || i === N ? 0.3 : 0);
        const yy = Math.max(0.3, Math.sin(ang) * H);
        const tang = Math.atan2(Math.cos(ang) * H, Math.sin(ang) * W);
        const w = 0.5 + rng() * 0.35;
        kit.box(m.obsidian, w, 0.9 + rng() * 0.5, 0.7 + rng() * 0.3, { x: px, y: yy, z: (rng() - 0.5) * 0.2, rz: tang + (rng() - 0.5) * 0.4, rx: (rng() - 0.5) * 0.3 }, { metres: 1.2 });
        if (rng() < 0.6) kit.box(m.ember, w * 0.5, 0.08, 0.75, { x: px, y: yy + (rng() - 0.5) * 0.4, rz: tang });
        // Spikes.
        if (i % 3 === 1) {
          const out = Math.atan2(-Math.cos(ang), Math.sin(ang) * 0.6);
          const spike = new THREE.ConeGeometry(0.22, 1.3 + rng() * 1.0, 5);
          kit.add(m.obsidian, spike, { x: px * 1.12, y: yy + 0.3, z: 0, rz: -out + Math.PI / 2 + (rng() - 0.5) * 0.3 });
        }
        void py;
      }
      // Lintel keystone at the apex.
      kit.box(m.obsidian, 1.2, 1.1, 0.9, { y: H + 0.3, rz: 0.1 }, { metres: 1.2 });
      kit.add(m.obsidian, new THREE.ConeGeometry(0.3, 1.8, 5), { y: H + 1.6 });
    });
    this.portalDisc(g, ry, W * 0.78, H * 0.5, false, H * 0.46);
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
