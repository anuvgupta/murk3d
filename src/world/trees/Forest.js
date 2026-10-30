import * as THREE from 'three';
import { SPECIES, paintClumpTexture, paintSprigTexture } from './species.js';
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
  { species: 'fern', x: -215, z: 128, r: 80, density: 5, spacing: 2.5 },
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
// A leaf texture from its canvas, with the transparent pixels given the
// colour of the leaves next to them. A canvas keeps them black, and
// mipmapping blends that black into the edges, so distant crowns (whose alpha
// is boosted) wore a dark outline. (Uploaded as data: a canvas can't hold
// colour in fully transparent pixels.)
function leafTexture(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const done = new Uint8Array(w * h);
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] > 24) {
      done[i] = 1;
      sr += d[i * 4]; sg += d[i * 4 + 1]; sb += d[i * 4 + 2]; n++;
    }
  }
  let edge = [];
  for (let i = 0; i < w * h; i++) if (!done[i]) edge.push(i);
  for (let pass = 0; pass < 12 && edge.length && n; pass++) {
    const filled = [];
    const rest = [];
    for (const i of edge) {
      const x = i % w, y = (i / w) | 0;
      let r = 0, g = 0, b = 0, k = 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && done[j]) { r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; k++; }
      }
      if (k) filled.push(i, r / k, g / k, b / k);
      else rest.push(i);
    }
    for (let f = 0; f < filled.length; f += 4) {
      const i = filled[f];
      d[i * 4] = filled[f + 1]; d[i * 4 + 1] = filled[f + 2]; d[i * 4 + 2] = filled[f + 3];
      done[i] = 1;
    }
    edge = rest;
  }
  for (const i of edge) if (n) { d[i * 4] = sr / n; d[i * 4 + 1] = sg / n; d[i * 4 + 2] = sb / n; }
  // Canvas rows run top-down; flip so the texture reads as the canvas did.
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(d.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// `fade` (a vec4 uniform: fade-in from x to y metres, fade-out from z to w)
// dissolves a detail level in and out over a band either side of the
// distance where trees change level, so the change isn't a pop.
function addWind(material, uniforms, scale, leaf = false, fade = null) {
  if (fade) material.defines = { ...material.defines, TREE_FADE: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uWindScale = { value: scale };
    if (fade) shader.uniforms.uFade = fade;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uNoise;
        uniform float uWindScale;
        attribute vec2 aSway;
        #ifdef BILLBOARD
          attribute vec2 aCorner;
        #endif
        #ifdef TREE_FADE
          varying float vFadeDist;
        #endif
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
        #ifdef TREE_FADE
          vFadeDist = distance( origin.xz, cameraPosition.xz );
        #endif
        {
          // Three motions, slow to fast:
          // 1. The whole tree leans downwind and sways, ~2-7 s a cycle. The
          //    lean follows the overall wind more than each passing gust
          //    front, so a tree doesn't heave in and out as gusts roll by.
          float w = windAt( origin.xz );
          float wl = mix( uWindStrength, w, 0.4 );
          float ph = dot( origin.xz, vec2( 0.13, 0.071 ) );
          float sway = sin( uTime * 0.45 + ph ) * 0.6 + sin( uTime * 0.87 + ph * 1.7 ) * 0.3;
          vec2 bend = uWindDir * ( wl * 0.75 + sway * ( 0.22 + 0.5 * wl ) ) * aSway.x * uWindScale;
          wpos.xz += bend;
          wpos.y -= length( bend ) * 0.2 * aSway.x;
          // 2. Limbs: waves rolling through the crown downwind and upward,
          //    each part lagging the next, so the canopy ripples rather than
          //    moving as one block.
          vec3 lp = wpos.xyz - origin;
          float roll = dot( lp.xz, uWindDir ) * 0.9 - lp.y * 0.35;
          float limb = sin( uTime * 1.3 - roll + ph ) * 0.6 + sin( uTime * 2.1 - roll * 1.6 + ph * 2.3 ) * 0.4;
          vec2 across = vec2( -uWindDir.y, uWindDir.x );
          wpos.xz += ( uWindDir * 0.6 + across * 0.4 ) * limb * ( 0.04 + 0.1 * wl ) * aSway.x * uWindScale;
          wpos.y += limb * ( 0.015 + 0.035 * wl ) * aSway.x * uWindScale;
          // 3. Leaves: each shivers on its own, in its own direction and at
          //    its own phase (they used to share one direction, so whole
          //    patches of crown swelled and shrank together).
          vec3 lq = wpos.xyz * 3.7;
          vec3 fdir = normalize( vec3( sin( lq.y + lq.z * 1.3 ), 0.6 * sin( lq.z * 0.9 + lq.x ), cos( lq.x * 1.1 + lq.y ) ) + 1e-4 );
          float fph = dot( lq, vec3( 1.7, 2.3, 1.9 ) );
          float fl = sin( uTime * ( 5.5 + 2.0 * w ) + fph ) * ( 0.012 + 0.035 * w ) * aSway.y;
          wpos.xyz += fdir * fl;
        }
        vec4 mvPosition = modelViewMatrix * wpos;
        #ifdef BILLBOARD
          // Clump impostors face the camera (or the sun, for their shadows:
          // smaller there, as the sprig clumps they stand for are full of gaps
          // that light gets through).
          vec2 corner = aCorner;
          #ifdef BILLBOARD_SHADOW
            corner *= 0.6;
          #endif
          #ifdef USE_INSTANCING
            corner *= length( instanceMatrix[ 0 ].xyz );
          #endif
          mvPosition.xy += corner;
        #endif
        gl_Position = projectionMatrix * mvPosition;`
      );
    if (fade) {
      // Within a band the tree is drawn at both levels; a screen-space dither
      // gives each pixel to one or the other in proportion, so one level
      // dissolves into the next.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform vec4 uFade;\nvarying float vFadeDist;`)
        .replace(
          '#include <clipping_planes_fragment>',
          `{
            float fadeIn = smoothstep( uFade.x, uFade.y, vFadeDist );
            float fadeOut = smoothstep( uFade.z, uFade.w, vFadeDist );
            float dither = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
            if ( 1.0 - dither > fadeIn || dither > 1.0 - fadeOut ) discard;
          }
          #include <clipping_planes_fragment>`
        );
    }
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
        .replace('#include <common>', `#include <common>\nuniform vec3 uSunColor;\nuniform float uLeafBoost;\nvarying float vLeafTrans;`)
        // Under a coarse pixel grid the far cards' mipped alpha falls below the
        // cut-off and whole crowns vanish; thicken their coverage with distance.
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          diffuseColor.a = min( 1.0, diffuseColor.a * ( 1.0 + uLeafBoost * smoothstep( 40.0, 220.0, length( vViewPosition ) ) ) );`
        )
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
    this.uniforms = { uNoise: { value: noise }, uSunDir: { value: sun.direction }, uSunColor: { value: sun.color }, uLeafBoost: { value: 0 }, ...wind.uniforms };

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
    if (r > 0.08) this.colliders.push({ cx: x, cz: z, hx: r, hz: r, rot: 0 });
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
    const t = { species, variant, x, z, spacing, y: 0, ry: this.random() * Math.PI * 2, s: 0.85 + this.random() * 0.3 };
    const model = this.models[species][variant];
    // Stand the trunk on the lowest ground under its (flared) foot: on a
    // slope, a base set at the centre's height left the downhill side of a
    // wide trunk in the air, its open end showing the trunk hollow inside.
    const foot = model.trunkRadius * t.s * (1 + (SPECIES[species].trunk.flare || 0)) * 1.05;
    let low = this.terrain.heightAt(x, z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      for (const f of [0.5, 1]) low = Math.min(low, this.terrain.heightAt(x + Math.cos(a) * foot * f, z + Math.sin(a) * foot * f));
    }
    t.y = low - 0.15;
    this.placed.push(t);
    const key = cx * 7919 + cz;
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key).push(t);
    const r = model.trunkRadius * t.s * (SPECIES[species].trunk.flare ? 1.6 : 1.1);
    if (r > 0.08) this.colliders.push({ cx: x, cz: z, hx: r, hz: r, rot: 0 });
    return true;
  }

  // Materials for one species: per detail level (each with its own fade
  // band uniform), sharing textures; shadow depth materials don't fade.
  materialsFor(name, spec, fades) {
    const b = spec.bark;
    const bt = b.birch ? birchBark() : barkTexture(b.color, b.fissures, b.depth || 1);
    const barkMats = fades.map((fade) => {
      const mat = new THREE.MeshStandardMaterial({ map: bt.map, bumpMap: bt.bump, bumpScale: b.smooth ? 1 : 4, roughness: 0.88 });
      addWind(mat, this.uniforms, spec.wind, false, fade);
      return mat;
    });
    const barkDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    addWind(barkDepth, this.uniforms, spec.wind);
    if (!spec.leaves) return { barkMats, barkDepth };

    const leafMaterials = (canvas, billboard = false) => {
      const tex = leafTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mats = fades.map((fade) => {
        const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, vertexColors: true });
        mat.userData.leaf = true;
        if (billboard) mat.defines = { BILLBOARD: '' };
        if (spec.glow) {
          mat.emissive = new THREE.Color(spec.leaf.colors[1]);
          mat.emissiveMap = tex;
          mat.emissiveIntensity = spec.glow;
        }
        addWind(mat, this.uniforms, spec.wind, true, fade);
        return mat;
      });
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.4 });
      if (billboard) depth.defines = { BILLBOARD: '', BILLBOARD_SHADOW: '' };
      addWind(depth, this.uniforms, spec.wind);
      return [mats, depth];
    };
    const sprig = paintSprigTexture(spec, name.length * 11);
    const [sprigMats, sprigDepth] = leafMaterials(sprig);
    const [clumpMats, clumpDepth] = leafMaterials(paintClumpTexture(spec, sprig, name.length * 13), true);
    return { barkMats, barkDepth, sprigMats, sprigDepth, clumpMats, clumpDepth };
  }

  build() {
    this.sets = [];
    const dummy = new THREE.Object3D();
    this.counts = {};
    for (const [name, spec] of Object.entries(SPECIES)) {
      const fades = [0, 1, 2].map(() => ({ value: new THREE.Vector4() }));
      const mats = this.materialsFor(name, spec, fades);
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
        // limbs, an impostor of every clump), far (trunk, fewer, bigger
        // impostors).
        const tiers = [
          [make(model.bark, mats.barkMats[0], mats.barkDepth, true)],
          [make(model.barkMid, mats.barkMats[1], mats.barkDepth, true)],
          [make(model.barkFar, mats.barkMats[2], mats.barkDepth, false)],
        ];
        if (model.leavesNear) {
          tiers[0].push(make(model.leavesNear, mats.sprigMats[0], mats.sprigDepth, true));
          tiers[1].push(make(model.leavesMid, mats.clumpMats[1], mats.clumpDepth, true));
          tiers[2].push(make(model.leavesFar, mats.clumpMats[2], mats.clumpDepth, false));
        }
        if (model.hangsMid) {
          tiers[1].push(make(model.hangsMid, mats.sprigMats[1], mats.sprigDepth, true));
          tiers[2].push(make(model.hangsFar, mats.sprigMats[2], mats.sprigDepth, false));
        }
        const big = name === 'giant';
        this.sets.push({ list, tiers, fades, dists: big ? [150, 420, 900] : [65, 230, 800], band: big ? 14 : 8 });
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
      // Each level is drawn out to its distance plus a band, and the next
      // from its distance less the band; the shader dissolves across it.
      const [d0, d1, d2] = set.dists;
      const b = set.band;
      set.fades[0].value.set(-2, -1, d0 - b, d0 + b);
      set.fades[1].value.set(d0 - b, d0 + b, d1 - b, d1 + b);
      set.fades[2].value.set(d1 - b, d1 + b, d2 - b, d2 + b);
      const counts = [0, 0, 0];
      for (const t of set.list) {
        const d = Math.hypot(t.x - cam.x, t.z - cam.z);
        for (let tier = 0; tier < 3; tier++) {
          if (d > set.dists[tier] + b || (tier > 0 && d < set.dists[tier - 1] - b)) continue;
          for (const m of set.tiers[tier]) m.setMatrixAt(counts[tier], t.matrix);
          counts[tier]++;
        }
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
