import * as THREE from 'three';
import { SPECIES, paintLeafTexture, paintSprigTexture } from './species.js';
import { generateTree } from './TreeGen.js';
import { bark as barkTexture, birchBark } from '../../buildings/textures.js';
import { WIND_GLSL } from '../Wind.js';
import { mulberry32, createNoise2D } from '../../util/noise.js';
import { HOUSES, PLAZA, RIVER, LAKE, LAKES, HILL, WELL, BRIDGE, CASTLES, RUINS, PITS, GLADE, OVERLOOK, SPAWN, nearestRoad } from '../plan.js';
import { REGIONS, regionWeight } from '../regions.js';

const VARIANTS = 5;

// Where each species grows. Areas are circles (x, z, r) or rings around the
// vale; density is trees per 1000 m².
const ZONES = [
  { species: 'giant', x: -215, z: 128, r: 88, density: 5.5, spacing: 13 },
  { species: 'pine', ring: [230, 420], density: 4.5, spacing: 8, maxHeight: 165 },
  { species: 'oak', ring: [190, 290], density: 1.2, spacing: 12, maxHeight: 80 },
  { species: 'birch', ring: [200, 320], density: 1.5, spacing: 7, maxHeight: 110 },
  { species: 'pine', x: 170, z: -170, r: 60, density: 4, spacing: 8 },
  { species: 'birch', x: -62, z: 112, r: 40, density: 9, spacing: 5 },
  { species: 'birch', x: 150, z: 40, r: 30, density: 7, spacing: 5 },
  { species: 'oak', x: 0, z: 0, r: 230, density: 0.25, spacing: 18 },
  { species: 'maple', x: 96, z: -78, r: 42, density: 7, spacing: 7 },
  { species: 'silverleaf', x: -22, z: -142, r: 34, density: 8, spacing: 6 },
  { species: 'duskwood', x: 118, z: 92, r: 36, density: 7, spacing: 7 },
  { species: 'duskwood', x: -150, z: -150, r: 30, density: 6, spacing: 7 },
  { species: 'dead', x: 0, z: 0, r: 260, density: 0.05, spacing: 25 },
  { species: 'dead', x: -215, z: 128, r: 95, density: 0.5, spacing: 15 },
  { species: 'juniper', x: HILL.x, z: HILL.z, r: HILL.radius - 4, density: 6, spacing: 6 },
  { species: 'juniper', ring: [215, 290], density: 0.4, spacing: 10, maxHeight: 120 },
];

// Hand-placed trees in and around the village.
const VILLAGE_TREES = [
  { species: 'oak', x: -12, z: -12 },
  { species: 'blossom', x: 9, z: -10 },
  { species: 'blossom', x: -10, z: 11 },
  { species: 'oak', x: 18, z: 13 },
  { species: 'blossom', x: -38, z: -24 },
  { species: 'oak', x: -40, z: 34 },
  { species: 'blossom', x: 46, z: 14 },
  { species: 'oak', x: 76, z: -4 },
  { species: 'blossom', x: -92, z: -84 },
  { species: 'blossom', x: -78, z: -96 },
  { species: 'oak', x: 28, z: -38 },
  { species: 'blossom', x: -66, z: 4 },
  { species: 'duskwood', x: 40, z: 38 },
  { species: 'duskwood', x: -30, z: -40 },
];

// Willows along the river through and below the village.
function riverWillows(random) {
  const out = [];
  const p = RIVER.path;
  for (let s = 200; s < p.length - 10; s += 14 + random() * 18) {
    const c = p.pointAt(s);
    const q = p.nearest(c.x, c.y, 2);
    if (!q) continue;
    const side = random() < 0.5 ? -1 : 1;
    const off = RIVER.widthAt(s) / 2 + 2.5 + random() * 3;
    out.push({ species: 'willow', x: c.x - q.tz * off * side, z: c.y + q.tx * off * side });
  }
  for (let k = 0; k < 8; k++) {
    const a = random() * Math.PI * 2;
    const r = LAKE.radiusAt(a) + 4 + random() * 6;
    out.push({ species: 'willow', x: LAKE.x + Math.cos(a) * r, z: LAKE.z + Math.sin(a) * r });
  }
  return out;
}

// Material plumbing: sway the whole tree with the wind (more toward the top)
// and flutter the leaves. Applied to both the visible and shadow materials.
function addWind(material, uniforms, scale, leaf = false) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uWindScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uNoise;
        uniform float uWindScale;
        attribute vec2 aSway;
        ${WIND_GLSL}`
      )
      .replace(
        '#include <project_vertex>',
        `vec4 wpos = vec4( transformed, 1.0 );
        vec3 origin = vec3( 0.0 );
        #ifdef USE_INSTANCING
          wpos = instanceMatrix * wpos;
          origin = instanceMatrix[ 3 ].xyz;
        #endif
        {
          float w = windAt( origin.xz );
          float ph = dot( origin.xz, vec2( 0.13, 0.071 ) );
          float sway = sin( uTime * 0.9 + ph ) * 0.6 + sin( uTime * 1.73 + ph * 1.7 ) * 0.3;
          vec2 bend = uWindDir * ( w * 0.9 + sway * ( 0.25 + 0.6 * w ) ) * aSway.x * uWindScale;
          wpos.xz += bend;
          wpos.y -= length( bend ) * 0.2 * aSway.x;
          float fl = sin( uTime * 5.3 + dot( wpos.xyz, vec3( 2.1, 1.3, 1.7 ) ) ) * ( 0.03 + 0.08 * w ) * aSway.y;
          wpos.xyz += vec3( fl, fl * 0.5, -fl * 0.8 );
        }
        vec4 mvPosition = modelViewMatrix * wpos;
        gl_Position = projectionMatrix * mvPosition;`
      );
    if (leaf) {
      // Leaves: light both faces alike, and let the sun through them. A
      // canopy takes most of its light from the sky, so leaf normals lean
      // upward instead of following each flat card's random facing.
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform vec3 uSunDir;\nvarying float vLeafTrans;`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\nobjectNormal = normalize( mix( objectNormal, vec3( 0.0, 1.0, 0.0 ), 0.55 ) );`)
        .replace(
          'vec4 mvPosition = modelViewMatrix * wpos;',
          `vec4 mvPosition = modelViewMatrix * wpos;
          vec3 toCam = normalize( ( modelMatrix * wpos ).xyz - cameraPosition );
          vLeafTrans = pow( max( dot( toCam, uSunDir ), 0.0 ), 4.0 );`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform vec3 uSunColor;\nvarying float vLeafTrans;`)
        .replace(
          '#include <normal_fragment_begin>',
          THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')
        )
        .replace(
          '#include <opaque_fragment>',
          // Sky light reaches the shaded underside of a canopy; keep it from going black.
          `outgoingLight += diffuseColor.rgb * uSunColor * vLeafTrans * 0.45 + diffuseColor.rgb * vec3( 0.05, 0.06, 0.07 );
          #include <opaque_fragment>`
        );
    }
  };
}

export class Forest {
  constructor({ terrain, mask, noise, wind, rocks, sun }) {
    this.terrain = terrain;
    this.mask = mask;
    this.group = new THREE.Group();
    this.group.name = 'trees';
    this.colliders = [];
    this.random = mulberry32(991);
    this.noise = createNoise2D(57);
    this.rockSpots = rocks ? rocks.footprints : [];
    this.uniforms = { uNoise: { value: noise }, uSunDir: { value: sun.direction }, uSunColor: { value: sun.color }, ...wind.uniforms };

    // Grow every variant of every species.
    this.models = {};
    for (const [name, spec] of Object.entries(SPECIES)) {
      this.models[name] = [];
      for (let v = 0; v < VARIANTS; v++) this.models[name].push(generateTree(spec, 1000 + v * 37 + name.length * 7));
    }

    // Place trees.
    this.placed = [];
    this.grid = new Map();
    for (const t of VILLAGE_TREES) this.tryPlace(t.species, t.x, t.z, 3, true);
    for (const t of riverWillows(this.random)) this.tryPlace(t.species, t.x, t.z, 6);
    for (const zone of ZONES) this.fillZone(zone);
    // The realms' own woods.
    for (const R of REGIONS) {
      for (const f of R.flora) this.fillZone({ species: f.species, x: R.x, z: R.z, r: R.r - 12, density: f.density, spacing: f.spacing, region: R });
      // A few trees on each floating island, at the island's height.
      for (const isl of R.islands || []) {
        const n = 2 + Math.floor(this.random() * 3);
        for (let k = 0; k < n; k++) {
          const a = this.random() * Math.PI * 2;
          const d = Math.sqrt(this.random()) * isl.r * 0.6;
          this.placeFixed(this.random() < 0.5 ? 'birch' : 'oak', R.x + isl.x + Math.cos(a) * d, R.z + isl.z + Math.sin(a) * d, 20 + isl.y);
        }
      }
    }

    this.build();
  }

  fillZone(zone) {
    const random = this.random;
    let area;
    let sample;
    if (zone.ring) {
      const [r0, r1] = zone.ring;
      area = Math.PI * (r1 * r1 - r0 * r0);
      sample = () => {
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(r0 * r0 + random() * (r1 * r1 - r0 * r0));
        return [Math.cos(a) * r, Math.sin(a) * r * 1.15];
      };
    } else {
      area = Math.PI * zone.r * zone.r;
      sample = () => {
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(random()) * zone.r;
        return [zone.x + Math.cos(a) * r, zone.z + Math.sin(a) * r];
      };
    }
    const target = Math.round((area / 1000) * zone.density);
    let placed = 0;
    for (let tries = 0; tries < target * 6 && placed < target; tries++) {
      const [x, z] = sample();
      // Patchy: forests have clearings.
      if (this.noise(x * 0.012, z * 0.012) < -0.35) continue;
      if (zone.maxHeight && this.terrain.heightAt(x, z) > zone.maxHeight) continue;
      // The Vale's forests stop at the realms' rims; a realm's wood stays in its bowl.
      const inRealm = REGIONS.some((R) => regionWeight(R, x, z) > 0.25);
      if (zone.region ? regionWeight(zone.region, x, z) < 0.6 : inRealm) continue;
      if (this.tryPlace(zone.species, x, z, zone.spacing)) placed++;
    }
  }

  isClear(x, z, r) {
    if (Math.abs(x) > 760 || Math.abs(z) > 760) return false;
    if (nearestRoad(x, z, r + 1.5)) return false;
    if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.radius + r + 1) return false;
    if (Math.hypot(x - WELL.x, z - WELL.z) < 4) return false;
    // Viewpoints stay clear.
    if (Math.hypot(x - OVERLOOK.x, z - OVERLOOK.z) < 8 + r) return false;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6 + r) return false;
    if (Math.hypot(x - BRIDGE.x, z - BRIDGE.z) < BRIDGE.length / 2 + 4) return false;
    for (const C of CASTLES) {
      if (Math.hypot(x - C.plateau.x, z - C.plateau.z) < C.plateau.radius + 12) return false;
      if (Math.hypot(x - C.bridgeFrom.x, z - C.bridgeFrom.z) < 10) return false;
    }
    if (Math.hypot(x - GLADE.x, z - GLADE.z) < GLADE.r + 6 + r) return false;
    for (const R of REGIONS) {
      const g = R.gate || { dx: 50, dz: 50 };
      if (Math.hypot(x - R.x - g.dx, z - R.z - g.dz) < 9 + r) return false;
    }
    for (const h of HOUSES) if (Math.hypot(x - h.x, z - h.z) < Math.max(h.footprint.hx, h.footprint.hz) + r + 1.5) return false;
    const rq = RIVER.path.nearest(x, z, 30);
    if (rq && rq.d < RIVER.widthAt(rq.s) / 2 + 1.5) return false;
    for (const L of LAKES) {
      const ld = Math.hypot(x - L.x, z - L.z);
      if (ld < L.radiusAt(Math.atan2(z - L.z, x - L.x)) + 2 && !(L.ring && ld < L.ring - 2)) return false;
    }
    for (const s of this.rockSpots) if (Math.hypot(x - s.x, z - s.z) < s.r + 0.5) return false;
    for (const s of RUINS) if (Math.hypot(x - s.x, z - s.z) < s.r + r) return false;
    // The Shelves stay open grassland: only the odd tree on a plate.
    if (this.terrain.plateHeight(x, z) > 0.5) return false;
    for (const s of PITS) if (Math.hypot(x - s.x, z - s.z) < s.hz + 3 + r) return false;
    const n = this.terrain.normalAt(x, z);
    if (n.y < 0.82) return false;
    return true;
  }

  // A tree at a given height (on a floating island), no checks.
  placeFixed(species, x, z, y) {
    const variant = Math.floor(this.random() * VARIANTS);
    const t = { species, variant, x, z, spacing: 4, y: y - 0.15, ry: this.random() * Math.PI * 2, s: 0.8 + this.random() * 0.25 };
    this.placed.push(t);
    const model = this.models[species][variant];
    const r = model.trunkRadius * t.s * 1.1;
    this.colliders.push({ cx: x, cz: z, hx: r, hz: r, rot: 0 });
  }

  tryPlace(species, x, z, spacing, force = false) {
    const cell = 6;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    const reach = Math.ceil(spacing / cell);
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const list = this.grid.get((cx + dx) * 7919 + (cz + dz));
        if (!list) continue;
        for (const o of list) {
          const min = Math.max(spacing, o.spacing) * (force ? 0.5 : 1);
          if (Math.hypot(o.x - x, o.z - z) < min) return false;
        }
      }
    }
    if (!this.isClear(x, z, force ? 1 : 2)) return false;
    const variant = Math.floor(this.random() * VARIANTS);
    const t = { species, variant, x, z, spacing, y: this.terrain.heightAt(x, z) - 0.15, ry: this.random() * Math.PI * 2, s: 0.85 + this.random() * 0.3 };
    this.placed.push(t);
    const key = cx * 7919 + cz;
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key).push(t);
    const model = this.models[species][variant];
    const r = model.trunkRadius * t.s * (SPECIES[species].trunk.flare ? 1.6 : 1.1);
    this.colliders.push({ cx: x, cz: z, hx: r, hz: r, rot: 0 });
    return true;
  }

  materialsFor(name, spec) {
    const b = spec.bark;
    const bt = b.birch ? birchBark() : barkTexture(b.color, b.fissures, b.depth || 1);
    const barkMat = new THREE.MeshStandardMaterial({ map: bt.map, bumpMap: bt.bump, bumpScale: b.smooth ? 1 : 4, roughness: 0.88 });
    addWind(barkMat, this.uniforms, spec.wind);
    const barkDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    addWind(barkDepth, this.uniforms, spec.wind);
    if (!spec.leaves) return { barkMat, barkDepth };

    const leafMaterial = (canvas) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, vertexColors: true });
      mat.userData.leaf = true;
      if (spec.glow) {
        mat.emissive = new THREE.Color(spec.leaf.colors[1]);
        mat.emissiveMap = tex;
        mat.emissiveIntensity = spec.glow;
      }
      addWind(mat, this.uniforms, spec.wind, true);
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.4 });
      addWind(depth, this.uniforms, spec.wind);
      return [mat, depth];
    };
    const [sprigMat, sprigDepth] = leafMaterial(paintSprigTexture(spec, name.length * 11));
    const [cardMat, cardDepth] = leafMaterial(paintLeafTexture(spec, name.length * 13));
    return { barkMat, barkDepth, sprigMat, sprigDepth, cardMat, cardDepth };
  }

  build() {
    this.sets = [];
    const dummy = new THREE.Object3D();
    this.counts = {};
    for (const [name, spec] of Object.entries(SPECIES)) {
      const mats = this.materialsFor(name, spec);
      for (let v = 0; v < VARIANTS; v++) {
        const list = this.placed.filter((t) => t.species === name && t.variant === v);
        this.counts[name] = (this.counts[name] || 0) + list.length;
        if (!list.length) continue;
        for (const t of list) {
          dummy.position.set(t.x, t.y, t.z);
          dummy.rotation.set(0, t.ry, 0);
          dummy.scale.setScalar(t.s);
          dummy.updateMatrix();
          t.matrix = dummy.matrix.clone();
        }
        const model = this.models[name][v];
        const make = (geometry, material, depth, shadow) => {
          const mesh = new THREE.InstancedMesh(geometry, material, list.length);
          mesh.customDepthMaterial = depth;
          mesh.castShadow = shadow;
          mesh.receiveShadow = true;
          mesh.count = 0;
          mesh.name = `${name}-${v}`;
          this.group.add(mesh);
          return mesh;
        };
        // Three levels of detail: near (full stems, sprig clumps), mid (main
        // limbs, cluster cards), far (trunk, a few big cards).
        const tiers = [
          [make(model.bark, mats.barkMat, mats.barkDepth, true)],
          [make(model.barkMid, mats.barkMat, mats.barkDepth, true)],
          [make(model.barkFar, mats.barkMat, mats.barkDepth, false)],
        ];
        if (model.leavesNear) {
          tiers[0].push(make(model.leavesNear, mats.sprigMat, mats.sprigDepth, true));
          tiers[1].push(make(model.leavesMid, mats.cardMat, mats.cardDepth, true));
          tiers[2].push(make(model.leavesFar, mats.cardMat, mats.cardDepth, false));
        }
        const big = name === 'giant';
        this.sets.push({ list, tiers, dists: big ? [150, 420, 900] : [65, 230, 800] });
      }
    }
    this.lastUpdate = -Infinity;
    this.lastPos = new THREE.Vector3(1e9, 0, 0);
  }

  // Re-sort trees into detail tiers as the camera moves.
  update(camera, time) {
    const cam = camera.position;
    if (time - this.lastUpdate < 0.4 && cam.distanceToSquared(this.lastPos) < 16) return;
    this.lastUpdate = time;
    this.lastPos.copy(cam);
    for (const set of this.sets) {
      const counts = [0, 0, 0];
      for (const t of set.list) {
        const d = Math.hypot(t.x - cam.x, t.z - cam.z);
        const tier = d < set.dists[0] ? 0 : d < set.dists[1] ? 1 : d < set.dists[2] ? 2 : -1;
        if (tier < 0) continue;
        for (const m of set.tiers[tier]) m.setMatrixAt(counts[tier], t.matrix);
        counts[tier]++;
      }
      set.tiers.forEach((meshes, i) => {
        for (const m of meshes) {
          m.count = counts[i];
          m.instanceMatrix.needsUpdate = true;
          if (counts[i]) {
            m.computeBoundingSphere();
            m.boundingSphere.radius += 3; // room for wind sway
          }
        }
      });
    }
  }
}
