// The alchemist's things, made to be looked at from arm's length: potions in
// dented hand-blown glass with dark liquid where brighter plumes swirl and
// pulse, metal bands, crusted bases and pitted, stained corks; tooled
// leather books; a stone mortar, brass scales, cut and raw gems, a hammered
// cauldron. Everything is bevelled or turned; nothing is a bare primitive.

import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';
import { bevelBox, organicLathe, latheRadiusAt, tube, ring, blob } from './shapes.js';

const TAU = Math.PI * 2;

// Liquid colours per potion kind: the dark body and the bright plumes in it.
export const POTION_KINDS = ['potionRed', 'potionGreen', 'potionBlue', 'potionGold', 'potionViolet', 'potionTeal'];
const DEEP = [
  [0.11, 0.0, 0.015],
  [0.0, 0.07, 0.02],
  [0.0, 0.02, 0.11],
  [0.09, 0.045, 0.0],
  [0.05, 0.0, 0.1],
  [0.0, 0.06, 0.06],
  [0.01, 0.06, 0.015], // the cauldron's brew
];
const GLOW = [
  [1.0, 0.16, 0.08],
  [0.35, 1.0, 0.2],
  [0.2, 0.5, 1.0],
  [1.0, 0.68, 0.14],
  [0.75, 0.25, 1.0],
  [0.25, 0.95, 0.8],
  [0.45, 1.0, 0.3],
];

// Per-vertex reference frame for a body of liquid: its centre and radius, so
// the shader can work in bottle-relative coordinates whatever the bottle's
// size or where it stands. Carried through the kit as the 'aux' attribute.
function setLiquidFrame(g, cx, cy, cz, r) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    a[i * 4] = cx;
    a[i * 4 + 1] = cy;
    a[i * 4 + 2] = cz;
    a[i * 4 + 3] = r;
  }
  g.setAttribute('aux', new THREE.BufferAttribute(a, 4));
  return g;
}
const vec3s = (list) => list.map((c) => `vec3( ${c.map((v) => v.toFixed(3)).join(', ')} )`).join(', ');

const NOISE_GLSL = /* glsl */ `
  float potHash( vec3 p ) {
    p = fract( p * 0.3183099 + 0.1 );
    p *= 17.0;
    return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
  }
  float potNoise( vec3 x ) {
    vec3 i = floor( x );
    vec3 f = fract( x );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix(
      mix( mix( potHash( i ), potHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( potHash( i + vec3( 0, 1, 0 ) ), potHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
      mix( mix( potHash( i + vec3( 0, 0, 1 ) ), potHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( potHash( i + vec3( 0, 1, 1 ) ), potHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
      f.z );
  }
`;

// --- Painted textures --------------------------------------------------------

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function canvasTexture(c, { srgb = true, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function blotches(ctx, w, h, random, count, colour, rMin, rMax, alpha) {
  for (let i = 0; i < count; i++) {
    const x = random() * w;
    const y = random() * h;
    const r = rMin + random() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${colour},${alpha * (0.5 + random() * 0.5)})`);
    g.addColorStop(1, `rgba(${colour},0)`);
    ctx.fillStyle = g;
    // Draw wrapped copies so the texture tiles.
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
  }
}

// Cork: tan, mottled, stained by what it stoppered, full of dark pores.
function corkTextures(random) {
  const S = 128;
  const [c, ctx] = canvas(S);
  const [b, bctx] = canvas(S);
  ctx.fillStyle = '#b48c5c';
  ctx.fillRect(0, 0, S, S);
  bctx.fillStyle = '#c0c0c0';
  bctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, random, 60, '120,84,48', 4, 14, 0.35);
  blotches(ctx, S, S, random, 40, '214,178,128', 3, 10, 0.3);
  // Stains soaked up from the potions: wine-dark and greenish.
  blotches(ctx, S, S, random, 5, '70,24,40', 14, 30, 0.45);
  blotches(ctx, S, S, random, 3, '40,58,30', 10, 24, 0.35);
  for (let i = 0; i < 260; i++) {
    const x = random() * S;
    const y = random() * S;
    const rx = 0.6 + random() * 1.8;
    const ry = rx * (0.5 + random() * 0.6);
    const a = random() * Math.PI;
    for (const [cx2, col, al] of [[ctx, '58,38,20', 0.9], [bctx, '20,20,20', 1]]) {
      cx2.fillStyle = `rgba(${col},${al})`;
      cx2.beginPath();
      cx2.ellipse(x, y, rx, ry, a, 0, TAU);
      cx2.fill();
    }
  }
  return { map: canvasTexture(c, { repeat: true }), bump: canvasTexture(b, { srgb: false, repeat: true }) };
}

// Leather book cover with gilt tooling: a double border, corner fleurons and
// a centre lozenge. Returns colour and an ORM map (roughness G, metal B) so
// only the gilt is metallic.
function coverTextures(base, random) {
  const S = 256;
  const [c, ctx] = canvas(S);
  const [o, octx] = canvas(S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, random, 70, '0,0,0', 6, 26, 0.18);
  blotches(ctx, S, S, random, 40, '255,240,210', 4, 16, 0.08);
  // Worn, paler edges where hands hold it.
  const edge = ctx.createLinearGradient(0, 0, S, 0);
  edge.addColorStop(0, 'rgba(255,235,200,0.0)');
  edge.addColorStop(0.9, 'rgba(255,235,200,0.0)');
  edge.addColorStop(1, 'rgba(255,235,200,0.22)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, S, S);
  octx.fillStyle = 'rgb(0,200,0)';
  octx.fillRect(0, 0, S, S);
  const gilt = (draw) => {
    for (const [cx2, style] of [[ctx, '#c9a04a'], [octx, 'rgb(0,80,255)']]) {
      cx2.strokeStyle = cx2.fillStyle = style;
      draw(cx2);
    }
  };
  gilt((g) => {
    g.lineWidth = 3;
    g.strokeRect(16, 16, S - 32, S - 32);
    g.lineWidth = 1.5;
    g.strokeRect(25, 25, S - 50, S - 50);
    for (const [x, y] of [[25, 25], [S - 25, 25], [25, S - 25], [S - 25, S - 25]]) {
      g.beginPath();
      g.moveTo(x, y - 9);
      g.lineTo(x + 6, y);
      g.lineTo(x, y + 9);
      g.lineTo(x - 6, y);
      g.closePath();
      g.fill();
    }
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(S / 2, S / 2 - 46);
    g.lineTo(S / 2 + 30, S / 2);
    g.lineTo(S / 2, S / 2 + 46);
    g.lineTo(S / 2 - 30, S / 2);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.arc(S / 2, S / 2, 13, 0, TAU);
    g.stroke();
    g.beginPath();
    g.arc(S / 2, S / 2, 4, 0, TAU);
    g.fill();
  });
  // Rub the gilt: patches of it worn away.
  blotches(ctx, S, S, random, 30, '40,26,16', 3, 9, 0.35);
  return { map: canvasTexture(c), orm: canvasTexture(o, { srgb: false }) };
}

// Page edges: fine cream lines, grubby toward the outside.
function pageTexture(random) {
  const [c, ctx] = canvas(64, 256);
  ctx.fillStyle = '#e4d6b4';
  ctx.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 2) {
    ctx.fillStyle = `rgba(90,70,40,${0.12 + random() * 0.22})`;
    ctx.fillRect(0, y, 64, 1);
  }
  blotches(ctx, 64, 256, random, 14, '120,90,50', 6, 18, 0.25);
  return canvasTexture(c, { repeat: true });
}

// Speckled grey stone (granite) for the mortar.
function graniteTexture(random) {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#8a8580';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, random, 40, '60,56,52', 4, 12, 0.3);
  for (let i = 0; i < 900; i++) {
    const v = random();
    ctx.fillStyle = v < 0.45 ? 'rgba(40,38,36,0.8)' : v < 0.8 ? 'rgba(200,196,188,0.7)' : 'rgba(150,110,90,0.6)';
    ctx.fillRect(random() * S, random() * S, 1 + random() * 1.5, 1 + random() * 1.5);
  }
  return canvasTexture(c, { repeat: true });
}

// --- Materials ----------------------------------------------------------------

export function createAlchemyMaterials(im) {
  const random = mulberry32(404);
  const time = { value: 0 };
  const mat = (o) => new THREE.MeshStandardMaterial(o);

  // Potion liquid. Two layers: a slow dark murmur (the body's own colour
  // moving against a deeper shade of itself), and now and then an eel of
  // light that swims a curving stroke through the bottle and fades, leaving a
  // brushed trail behind it. The cauldron's brew is the same liquid, kind 6,
  // with bubbles that swell and burst and splashes that leap.
  // uv carries (kind, per-bottle phase); 'aux' the bottle's centre and radius.
  const liquid = mat({ color: 0xffffff, roughness: 0.4, metalness: 0, envMapIntensity: 0.3 });
  liquid.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec4 aux;\nvarying vec3 vPotLocal;\nvarying vec2 vPot;\nvarying vec4 vAux;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPot = uv;
        vAux = aux;
        if ( uv.x > 5.5 && uv.y > 0.4 ) {
          // Cauldron bubbles (phase 0.4-0.8) swell from nothing and burst;
          // splashes (phase > 0.8) leap up and fall back.
          float ph = uv.y * 23.0;
          float cyc = fract( uTime * ( uv.y > 0.8 ? 0.22 : 0.4 ) + ph );
          float grow = uv.y > 0.8
            ? smoothstep( 0.0, 0.08, cyc ) * ( 1.0 - smoothstep( 0.42, 0.5, cyc ) )
            : smoothstep( 0.0, 0.55, cyc ) * ( 1.0 - smoothstep( 0.62, 0.68, cyc ) );
          float lift = uv.y > 0.8 ? sin( clamp( cyc / 0.5, 0.0, 1.0 ) * 3.14159 ) * 0.14 : cyc * 0.012;
          transformed = aux.xyz + ( position - aux.xyz ) * ( 0.1 + 1.5 * grow ) + vec3( 0.0, lift, 0.0 );
        }
        vPotLocal = transformed;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        varying vec3 vPotLocal;
        varying vec2 vPot;
        varying vec4 vAux;
        const vec3 POT_DEEP[ 7 ] = vec3[ 7 ]( ${vec3s(DEEP)} );
        const vec3 POT_GLOW[ 7 ] = vec3[ 7 ]( ${vec3s(GLOW)} );
        ${NOISE_GLSL}
        // Where the eel is at time t: a wandering closed curve inside the bottle.
        vec3 eelAt( float t, float ph ) {
          return vec3( 0.62 * sin( t * 1.0 + ph ) * cos( t * 0.37 ), 0.55 * sin( t * 0.71 + ph * 1.7 ), 0.62 * cos( t * 0.83 + ph * 0.6 ) );
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          int pk = int( clamp( vPot.x + 0.5, 0.0, 6.0 ) );
          vec3 deep = POT_DEEP[ pk ];
          vec3 glow = POT_GLOW[ pk ];
          float ph = vPot.y * 17.0;
          bool brew = vPot.x > 5.5;
          // Bottle-relative coordinates, roughly -1..1.
          vec3 rel = ( vPotLocal - vAux.xyz ) / max( vAux.w, 1e-4 );

          // The murmur: slow domain-warped wisps, the body colour against a
          // deeper shade of itself. Barely there; it gives the liquid depth.
          float t = uTime * 0.07 + ph;
          vec3 q = rel * vec3( 3.2, 2.0, 3.2 );
          vec3 warp = vec3(
            potNoise( q + vec3( 0.0, -t, ph ) ),
            potNoise( q * 1.3 + vec3( 3.1, -t * 0.8, 1.7 ) ),
            potNoise( q * 0.9 + vec3( 7.2, t * 0.5, 4.4 ) ) );
          float n = potNoise( q * 1.2 + warp * 2.2 + vec3( 0.0, -t * 1.2, 0.0 ) );
          float wisp = pow( 1.0 - abs( n * 2.0 - 1.0 ), 5.0 );
          vec3 darker = deep * 0.35;
          vec3 body = mix( darker, deep, 0.25 + 0.75 * wisp );

          // The eel: a bright head sweeping along the curve with a brushed
          // trail of older positions fading behind it; it shows for a few
          // seconds, swims across, and is gone again.
          float et = uTime * 0.45 + ph * 3.0;
          float vis = smoothstep( 0.15, 0.45, sin( uTime * 0.21 + ph * 2.3 ) );
          float eel = 0.0;
          for ( int k = 0; k < 8; k++ ) {
            float back = float( k ) * 0.11;
            vec3 e = eelAt( et - back, ph );
            float d = length( ( rel - e ) * vec3( 1.0, 1.4, 1.0 ) );
            float w = exp( -d * d * ( 90.0 + 30.0 * float( k ) ) ) * ( 1.0 - float( k ) / 8.0 );
            eel += w;
          }
          eel = clamp( eel, 0.0, 1.0 ) * vis;
          if ( brew ) {
            // The brew churns on its surface and lights from beneath.
            body = mix( darker, deep, 0.4 + 0.6 * wisp );
            eel *= 0.8;
          }
          diffuseColor.rgb = body * 0.6;
          totalEmissiveRadiance = body * 1.0 + glow * ( eel * 2.6 + 0.02 );
        }`
      );
  };

  // Hand-blown glass: nearly clear face-on, brighter and more opaque at the
  // rim, frosted and crusted with dried residue toward the base.
  const glass = mat({ color: 0xdfe9e2, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 1.4 });
  glass.userData.noShadow = true;
  glass.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlassLocal;\nvarying float vGlassH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlassLocal = position;\nvGlassH = uv.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGlassLocal;\nvarying float vGlassH;\n${NOISE_GLSL}`)
      .replace(
        '#include <opaque_fragment>',
        `{
          float rim = 1.0 - clamp( abs( dot( normalize( vViewPosition ), normal ) ), 0.0, 1.0 );
          rim = rim * rim * rim;
          float n = potNoise( vGlassLocal * 140.0 ) * 0.6 + potNoise( vGlassLocal * 40.0 ) * 0.4;
          float grime = smoothstep( 0.26, 0.0, vGlassH + ( n - 0.5 ) * 0.12 );
          outgoingLight = mix( outgoingLight, vec3( 0.05, 0.04, 0.028 ) * ( 0.6 + 0.8 * n ), grime * 0.9 );
          outgoingLight += vec3( 0.03, 0.035, 0.032 ) * rim;
          diffuseColor.a = clamp( max( mix( diffuseColor.a, 0.6, rim ), grime * ( 0.75 + 0.25 * n ) ), 0.0, 1.0 );
        }
        #include <opaque_fragment>`
      );
  };

  const cork = corkTextures(random);
  const cover = (base) => {
    const t = coverTextures(base, random);
    return mat({ map: t.map, roughnessMap: t.orm, metalnessMap: t.orm, roughness: 1, metalness: 1, bumpMap: t.orm, bumpScale: -0.6 });
  };
  const granite = graniteTexture(random);

  return {
    time,
    liquid,
    potionGlass: glass,
    corkPitted: mat({ map: cork.map, bumpMap: cork.bump, bumpScale: 1.2, roughness: 0.95 }),
    crust: mat({ color: 0x2a2018, roughness: 1 }),
    sealWax: mat({ color: 0x6a1018, roughness: 0.45 }),
    twine: mat({ color: 0x9a8058, roughness: 1 }),
    silver: mat({ color: 0xc8ccd2, roughness: 0.28, metalness: 1 }),
    gold: im.gold,
    brass: im.brass,
    tomeRed: cover('#6a2222'),
    tomeBlue: cover('#24305a'),
    tomeGreen: cover('#23482e'),
    tomeBrown: cover('#4a3020'),
    pages: mat({ map: pageTexture(random), roughness: 0.95 }),
    granite: mat({ map: granite, bumpMap: granite, bumpScale: 0.8, roughness: 0.85 }),
    powder: mat({ color: 0x9a8a4a, roughness: 1 }),
    castIron: mat({ color: 0x24221f, roughness: 0.62, metalness: 0.7 }),
  };
}

// --- Potions -------------------------------------------------------------------

// Body profiles, [radius, height] from the base centre up to the rolled lip.
// neck: where the shoulder ends (fill and bands are measured below it).
const BOTTLES = [
  // Egg-bellied flask with a long neck.
  { neck: 0.1, pts: [[0, 0], [0.03, 0.001], [0.044, 0.008], [0.051, 0.03], [0.05, 0.058], [0.04, 0.083], [0.022, 0.1], [0.014, 0.115], [0.0125, 0.145], [0.0145, 0.158], [0.0165, 0.163], [0.0125, 0.165]] },
  // Gourd: two swellings, the lower one heavier.
  { neck: 0.11, pts: [[0, 0], [0.034, 0.001], [0.05, 0.012], [0.055, 0.032], [0.045, 0.055], [0.034, 0.066], [0.04, 0.08], [0.037, 0.097], [0.021, 0.11], [0.0125, 0.124], [0.012, 0.14], [0.0155, 0.146], [0.012, 0.148]] },
  // Tall teardrop vial.
  { neck: 0.15, pts: [[0, 0], [0.012, 0.001], [0.022, 0.012], [0.027, 0.045], [0.026, 0.09], [0.019, 0.13], [0.011, 0.152], [0.0095, 0.172], [0.0125, 0.178], [0.009, 0.179]] },
  // Squat onion with a tall thin neck.
  { neck: 0.07, pts: [[0, 0], [0.04, 0.001], [0.058, 0.014], [0.062, 0.03], [0.052, 0.05], [0.028, 0.066], [0.0115, 0.08], [0.0095, 0.13], [0.0135, 0.136], [0.009, 0.137]] },
];

function sampleProfile(pts, n = 26) {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y)));
  return curve.getPoints(n).map((v) => [Math.max(0, v.x), v.y]);
}

// Radius of a sampled profile at height y (on the rising part, below the lip roll).
function radiusAt(prof, y) {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1];
    const [r1, y1] = prof[i];
    if (y1 >= y && y0 <= y && y1 > y0) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return prof[prof.length - 1][0];
}

const PROFILES = BOTTLES.map((b) => ({ ...b, prof: sampleProfile(b.pts) }));
let bottleCount = 0;

// A potion: dented glass, glowing liquid, metal bands and straps, crusted
// base, a dried drip, a pitted cork, sometimes twine or a wax seal.
// kind: one of POTION_KINDS, or 'clearGlass' for an empty, dreg-stained bottle.
export function potion(kit, fm, kind = 'potionRed', shape = 0) {
  const random = mulberry32(1000 + bottleCount++ * 7);
  const P = PROFILES[shape % PROFILES.length];
  const scale = 1.1 + random() * 0.25;
  const lipY = P.prof[P.prof.length - 1][1];
  const look = { seed: random() * 50, dent: 0.035 + random() * 0.04, oval: random() * 0.12, bumps: 2 + random() * 2, segments: 18, range: [0, lipY] };
  const radial = (r, y, a, out = 0) => {
    const [x, z] = latheRadiusAt(r + out, y / lipY, a, look);
    return [x, y, z];
  };
  kit.frame({ s: scale, rz: (random() - 0.5) * 0.03 }, () => {
    const glass = organicLathe(P.prof, look);
    kit.add(fm.potionGlass, glass);

    // The liquid: the body's own shape a little inside the glass, filled to a level.
    const k = POTION_KINDS.indexOf(kind);
    const fillY = k >= 0 ? P.neck * (0.45 + random() * 0.45) : 0.01;
    const inner = [[0, 0.004]];
    for (let i = 0; i <= 10; i++) {
      const y = 0.004 + ((fillY - 0.004) * i) / 10;
      inner.push([radiusAt(P.prof, y) * 0.9 - 0.0012, y]);
    }
    inner.push([0, fillY]);
    const lq = organicLathe(inner, look);
    const uv = lq.attributes.uv;
    const phase = random() * 0.38; // bottles keep the phase range below the cauldron's bubbles
    for (let i = 0; i < uv.count; i++) uv.setXY(i, k >= 0 ? k : 0, phase);
    setLiquidFrame(lq, 0, fillY * 0.5, 0, Math.max(fillY * 0.55, radiusAt(P.prof, fillY * 0.5) * 0.95));
    if (k >= 0) kit.add(fm.liquid, lq);
    else kit.add(fm.crust, lq); // dregs

    // Bands: two latitudes on the belly, one on the neck; two longitude
    // straps crossing over (four half-straps meeting under the shoulder).
    const metal = random() < 0.55 ? fm.gold : fm.silver;
    const around = (y, out) => {
      const pts = [];
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU;
        const p = radial(radiusAt(P.prof, y), y, a, out);
        pts.push([p[0], p[2]]);
      }
      return pts;
    };
    const bandYs = [P.neck * (0.22 + random() * 0.08), P.neck * (0.62 + random() * 0.1)];
    for (const y of bandYs) kit.add(metal, ring(around(y, 0.0016), y, 0.0021, 4));
    const neckY = (P.neck + lipY) / 2;
    kit.add(metal, ring(around(neckY, 0.0012), neckY, 0.0016, 4));
    const a0 = random() * TAU;
    for (let s = 0; s < 4; s++) {
      const a = a0 + (s * TAU) / 4;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const y = 0.005 + ((bandYs[1] - 0.005) * i) / 8;
        pts.push(radial(radiusAt(P.prof, y), y, a, 0.0014));
      }
      kit.add(metal, tube(pts, 0.0013, { radial: 4 }));
      // A rivet where each strap crosses a band.
      for (const y of bandYs) kit.add(metal, blob(0.0028, 0.0028, 0.0028, { dent: 0.1, detail: 0, seed: s }), { ...pointObj(radial(radiusAt(P.prof, y), y, a, 0.0026)) });
    }

    // Residue crusted round the base, in lumps.
    const crustPts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const p = radial(radiusAt(P.prof, 0.005), 0.004, a, 0.0006 + random() * 0.0018);
      crustPts.push([p[0], p[2]]);
    }
    kit.add(fm.crust, ring(crustPts, 0.004, 0.0034 + random() * 0.0012, 4));
    for (let i = 0; i < 3; i++) {
      const p = radial(radiusAt(P.prof, 0.006), 0.006 + random() * 0.006, random() * TAU, 0.002);
      kit.add(fm.crust, blob(0.005, 0.004, 0.005, { seed: random() * 9, dent: 0.4, detail: 0 }), pointObj(p));
    }
    // A dried drip running down from the lip.
    const da = random() * TAU;
    const dripPts = [];
    const dripEnd = P.neck * (0.4 + random() * 0.4);
    for (let i = 0; i <= 8; i++) {
      const y = lipY - 0.002 - ((lipY - dripEnd) * i) / 8;
      dripPts.push(radial(radiusAt(P.prof, y), y, da + Math.sin(i * 0.7) * 0.06, 0.0012));
    }
    kit.add(fm.crust, tube(dripPts, 0.0024, { radial: 4, tip: 0.0012 }));

    // The cork: tapered into the neck, mushrooming out over the lip.
    const rn = radiusAt(P.prof, lipY - 0.006);
    const corkPts = [[0, lipY - 0.014], [rn * 0.82, lipY - 0.014], [rn * 0.95, lipY - 0.002], [rn * 1.08, lipY + 0.01], [rn * 1.2, lipY + 0.017], [rn * 1.0, lipY + 0.022], [0, lipY + 0.0235]];
    const corkG = organicLathe(corkPts, { segments: 12, seed: random() * 40, dent: 0.12, oval: 0.06, bumps: 3, lean: (random() - 0.5) * 0.15 });
    const cuv = corkG.attributes.uv;
    const off = random();
    for (let i = 0; i < cuv.count; i++) cuv.setXY(i, cuv.getX(i) * 0.7 + off, cuv.getY(i) * 0.4 + off);
    kit.add(fm.corkPitted, corkG);
    const extra = random();
    if (extra < 0.3) {
      // Sealing wax poured over the cork, running down the neck.
      kit.add(fm.sealWax, blob(rn * 1.35, 0.008, rn * 1.35, { seed: random() * 9, dent: 0.25 }), { y: lipY + 0.02 });
      for (let i = 0; i < 3; i++) {
        const a = random() * TAU;
        const pts = [];
        for (let j = 0; j <= 5; j++) {
          const y = lipY + 0.016 - j * (0.006 + random() * 0.002);
          pts.push(radial(Math.max(rn * 1.15, radiusAt(P.prof, Math.min(y, lipY - 0.001))), y, a, 0.0015));
        }
        kit.add(fm.sealWax, tube(pts, 0.0022, { radial: 4, tip: 0.0012 }));
      }
    } else if (extra < 0.6) {
      // Twine wound round the neck.
      for (let w = 0; w < 3; w++) {
        const y = P.neck + (lipY - P.neck) * (0.2 + w * 0.12);
        kit.add(fm.twine, ring(around(y, 0.0016), y, 0.0018, 4));
      }
    }
  });
  return { hx: 0.06, hz: 0.06 };
}

const pointObj = ([x, y, z]) => ({ x, y, z });

// --- Books -----------------------------------------------------------------------

// A closed book lying flat: two boards with gilt tooling, a rounded spine
// with raised bands, a page block with visible leaves, brass corners, and
// sometimes a strap and clasp. Spine along -x, foredge along +x.
export function tome(kit, fm, cover = 'tomeRed', t = {}, { w = 0.16, d = 0.22, th = 0.045, clasp = false } = {}) {
  const mat = fm[cover] || fm.tomeRed;
  kit.frame(t, () => {
    const board = 0.006;
    const coverUV = (g) => {
      const p = g.attributes.position;
      const uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getZ(i) + d / 2) / d);
      return g;
    };
    kit.add(mat, coverUV(bevelBox(w, board, d, 0.0025)), { y: board / 2 });
    kit.add(mat, coverUV(bevelBox(w, board, d, 0.0025)), { y: th - board / 2 });
    // Rounded spine.
    const spine = new THREE.CylinderGeometry(th / 2, th / 2, d, 12, 1, true, Math.PI, Math.PI);
    spine.rotateX(Math.PI / 2);
    const suv = spine.attributes.uv;
    for (let i = 0; i < suv.count; i++) suv.setXY(i, 0.03, suv.getY(i));
    kit.add(mat, spine, { x: -w / 2 + 0.004, y: th / 2 });
    // Raised bands across the spine.
    for (let b = 0; b < 4; b++) {
      const z = -d * 0.36 + (b * d * 0.72) / 3;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI / 2 + (i / 8) * Math.PI;
        pts.push([-w / 2 + 0.004 + Math.cos(a) * (th / 2 + 0.0008), th / 2 + Math.sin(a) * (th / 2 + 0.0008), z]);
      }
      kit.add(mat, tube(pts, 0.0022, { radial: 4 }));
    }
    // The page block, set in from the boards' edges.
    const pages = bevelBox(w - 0.012, th - board * 2, d - 0.01, 0.0015);
    const pp = pages.attributes.position;
    const puv = pages.attributes.uv;
    for (let i = 0; i < pp.count; i++) puv.setXY(i, (pp.getX(i) + pp.getZ(i)) * 3, (pp.getY(i) + th / 2) / (th - board * 2));
    kit.add(fm.pages, pages, { x: 0.002, y: th / 2 });
    // Brass corner pieces on the foredge corners of the top board.
    for (const sz of [-1, 1]) {
      kit.add(fm.brass, bevelBox(0.026, board + 0.002, 0.026, 0.002), { x: w / 2 - 0.009, y: th - board / 2, z: sz * (d / 2 - 0.009), ry: Math.PI / 4 });
      kit.add(fm.brass, bevelBox(0.026, board + 0.002, 0.026, 0.002), { x: w / 2 - 0.009, y: board / 2, z: sz * (d / 2 - 0.009), ry: Math.PI / 4 });
    }
    if (clasp) {
      // A leather strap over the foredge to a brass clasp on the top board.
      kit.add(mat, bevelBox(0.05, 0.003, 0.022, 0.001), { x: w / 2 - 0.02, y: th + 0.0015 });
      kit.add(mat, bevelBox(0.003, th + 0.004, 0.022, 0.001), { x: w / 2 + 0.0035, y: th / 2 });
      kit.add(fm.brass, bevelBox(0.018, 0.005, 0.03, 0.0015), { x: w / 2 - 0.045, y: th + 0.0025 });
    }
  });
}

// --- Apparatus ---------------------------------------------------------------------

// Stone mortar with a rolled lip, a pestle leaning in it and ground herbs.
export function stoneMortar(kit, fm, t = {}) {
  kit.frame(t, () => {
    const pts = [[0, 0], [0.05, 0.0], [0.06, 0.006], [0.066, 0.03], [0.074, 0.062], [0.08, 0.078], [0.078, 0.088], [0.068, 0.088], [0.06, 0.07], [0.046, 0.046], [0.024, 0.034], [0, 0.031]];
    const g = organicLathe(sampleProfile(pts, 30), { segments: 20, seed: 3, dent: 0.05, oval: 0.05, bumps: 3 });
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 0.8);
    kit.add(fm.granite, g);
    kit.add(fm.powder, blob(0.04, 0.008, 0.038, { seed: 2, dent: 0.3 }), { y: 0.036 });
    const pestle = [[0, 0], [0.018, 0.003], [0.025, 0.018], [0.021, 0.038], [0.013, 0.065], [0.011, 0.13], [0.013, 0.152], [0.009, 0.166], [0, 0.17]];
    const pg = organicLathe(sampleProfile(pestle, 24), { segments: 14, seed: 8, dent: 0.05, oval: 0.08 });
    kit.add(fm.granite, pg, { x: -0.02, y: 0.04, z: 0.005, rz: -0.7, ry: 0.3 });
  });
}

// Brass balance: stepped foot, turned column, an arched beam with curled
// ends, a pointer, chains and dished pans, little bell weights on one.
export function brassScales(kit, fm, t = {}) {
  const m = fm.brass;
  kit.frame(t, () => {
    const foot = [[0, 0], [0.068, 0], [0.072, 0.006], [0.064, 0.012], [0.048, 0.018], [0.036, 0.026], [0.024, 0.04], [0.014, 0.06], [0, 0.062]];
    kit.add(m, organicLathe(sampleProfile(foot, 20), { segments: 18, seed: 1, dent: 0.02, oval: 0 }));
    const col = [[0.013, 0.058], [0.011, 0.1], [0.018, 0.11], [0.011, 0.12], [0.009, 0.21], [0.015, 0.218], [0.008, 0.226], [0.011, 0.236], [0, 0.248]];
    kit.add(m, organicLathe(sampleProfile(col, 24), { segments: 12, seed: 2, dent: 0.02, oval: 0 }));
    const top = 0.232;
    const beam = [];
    for (let i = 0; i <= 10; i++) {
      const x = -0.16 + i * 0.032;
      beam.push([x, top + 0.012 * Math.cos((x / 0.16) * Math.PI * 0.5), 0]);
    }
    kit.add(m, tube(beam, 0.0035, { radial: 6 }));
    for (const s of [-1, 1]) {
      // Curled finial.
      const curl = [];
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 1.5;
        curl.push([s * (0.16 + Math.sin(a) * 0.012), top + 0.012 - (1 - Math.cos(a)) * 0.012, 0]);
      }
      kit.add(m, tube(curl, 0.0022, { radial: 5, tip: 0.0012 }));
      // Chains to a dished pan.
      const panY = top - 0.13;
      const pan = [[0, 0], [0.03, 0.002], [0.045, 0.01], [0.05, 0.018], [0.047, 0.02], [0.04, 0.013], [0.026, 0.007], [0, 0.005]];
      kit.add(m, organicLathe(sampleProfile(pan, 12), { segments: 18, seed: 4 + s, dent: 0.03, oval: 0 }), { x: s * 0.15, y: panY });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU + 0.5;
        kit.add(m, tube([[s * 0.15, top + 0.004, 0], [s * 0.15 + Math.cos(a) * 0.046, panY + 0.018, Math.sin(a) * 0.046]], 0.0009, { radial: 3, tubular: 2 }));
      }
      if (s > 0) {
        for (let k = 0; k < 3; k++) {
          const bell = [[0, 0], [0.008 - k * 0.0015, 0.001], [0.007 - k * 0.0015, 0.008], [0.003, 0.013], [0.004, 0.016], [0, 0.018]];
          kit.add(m, organicLathe(sampleProfile(bell, 10), { segments: 10, seed: k, dent: 0.03, oval: 0 }), { x: s * 0.15 + (k - 1) * 0.016, y: panY + 0.004, z: (k % 2) * 0.01 });
        }
      } else {
        kit.add(fm.powder, blob(0.024, 0.006, 0.022, { seed: 5, dent: 0.3 }), { x: s * 0.15, y: panY + 0.007 });
      }
    }
    // Pointer hanging from the pivot.
    kit.add(m, tube([[0, top, 0.006], [0, top - 0.07, 0.006]], 0.0016, { radial: 4, tubular: 2, tip: 0.0006 }));
  });
}

// Cut gems (brilliants) and raw crystal points, scattered.
export function cutGems(kit, fm, random = Math.random, count = 6) {
  const mats = [fm.gemRed, fm.gemBlue, fm.gemGreen, fm.gemPurple, fm.gemClear];
  for (let i = 0; i < count; i++) {
    const s = 0.012 + random() * 0.01;
    const m = mats[i % mats.length];
    if (i % 3 === 2) {
      // A raw crystal point lying on its side.
      const pts = [[0, 0], [s * 0.7, 0], [s * 0.75, s * 2.2], [0, s * 3.2]];
      kit.add(m, organicLathe(pts, { segments: 6, seed: i, dent: 0.12, oval: 0.2, flat: true }), { x: (random() - 0.5) * 0.3, y: s * 0.65, z: (random() - 0.5) * 0.2, rz: Math.PI / 2 - 0.15, ry: random() * TAU });
    } else {
      // Brilliant cut: pavilion point, girdle, table on top; lying tilted.
      const pts = [[0, 0], [s, s * 0.9], [s * 0.98, s * 1.05], [s * 0.6, s * 1.4], [0, s * 1.4]];
      kit.add(m, organicLathe(pts, { segments: 8, seed: i, dent: 0.02, oval: 0.08, flat: true }), { x: (random() - 0.5) * 0.3, y: s * 0.55, z: (random() - 0.5) * 0.2, rx: 1.2 + random() * 0.4, ry: random() * TAU });
    }
  }
  return { hx: 0.18, hz: 0.12 };
}

// A drippy candle on a brass dish with a finger ring.
export function dripCandle(kit, fm, t = {}, random = Math.random) {
  kit.frame(t, () => {
    const dish = [[0, 0], [0.045, 0.001], [0.052, 0.008], [0.05, 0.011], [0.016, 0.012], [0.016, 0.022], [0, 0.022]];
    kit.add(fm.brass, organicLathe(sampleProfile(dish, 14), { segments: 16, seed: 2, dent: 0.03, oval: 0.04 }));
    kit.add(fm.brass, tube([[0.05, 0.008, 0], [0.068, 0.012, 0.004], [0.072, 0.024, 0], [0.062, 0.03, -0.004], [0.052, 0.018, 0]], 0.0026, { radial: 4 }));
    const h = 0.07 + random() * 0.05;
    const wax = [[0, 0.012], [0.015, 0.012], [0.0145, h * 0.5], [0.0155, h * 0.9], [0.0135, h], [0.006, h - 0.004], [0, h - 0.006]];
    kit.add(fm.wax, organicLathe(wax, { segments: 10, seed: random() * 9, dent: 0.1, oval: 0.05, bumps: 4 }));
    for (let i = 0; i < 3; i++) {
      const a = random() * TAU;
      const len = 0.02 + random() * 0.04;
      kit.add(fm.wax, tube([[Math.cos(a) * 0.015, h - 0.002, Math.sin(a) * 0.015], [Math.cos(a) * 0.0162, h - len * 0.5, Math.sin(a) * 0.0162], [Math.cos(a) * 0.016, h - len, Math.sin(a) * 0.016]], 0.003, { radial: 4, tip: 0.0045 }));
    }
    kit.add(fm.crust, tube([[0, h - 0.008, 0], [0.001, h + 0.006, 0]], 0.0008, { radial: 3, tubular: 2 }));
    const flame = [[0, 0], [0.004, 0.004], [0.0045, 0.01], [0.0025, 0.02], [0, 0.028]];
    kit.add(fm.flame, organicLathe(sampleProfile(flame, 10), { segments: 8, seed: 1, dent: 0.05, oval: 0 }), { y: h + 0.003 });
  });
}

// A bundle of dried herbs hanging from a hook: drooping stems with leaves.
export function herbSheaf(kit, fm, t = {}, random = Math.random) {
  kit.frame(t, () => {
    for (let i = 0; i < 9; i++) {
      const a = random() * TAU;
      const spread = 0.01 + random() * 0.03;
      const len = 0.16 + random() * 0.1;
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const f = k / 4;
        pts.push([Math.cos(a) * spread * f, -0.03 - len * f, Math.sin(a) * spread * f]);
      }
      kit.add(fm.herb, tube(pts, 0.0018, { radial: 3, tip: 0.0008 }));
      for (let k = 1; k <= 4; k++) {
        const f = k / 4.5;
        kit.add(fm.herb, blob(0.012, 0.004, 0.006, { seed: i * 5 + k, dent: 0.3, detail: 0 }), { x: Math.cos(a) * spread * f, y: -0.03 - len * f, z: Math.sin(a) * spread * f, ry: random() * TAU, rz: 0.8 + random() * 0.5 });
      }
    }
    kit.add(fm.twine, ring([[0.012, 0], [0, 0.012], [-0.012, 0], [0, -0.012]].map(([x, z]) => [x, z]), -0.03, 0.004, 4));
    kit.add(fm.twine, tube([[0, -0.03, 0], [0, 0.0, 0]], 0.0015, { radial: 3, tubular: 2 }));
  });
}

// A hammered cast-iron cauldron on three stubby feet over a small fire,
// brew churning and glowing, a few bubbles breaking the surface.
export function brewCauldron(kit, fm, random = Math.random) {
  const base = 0.2;
  const body = [[0, 0], [0.14, 0.01], [0.3, 0.08], [0.39, 0.22], [0.41, 0.38], [0.38, 0.54], [0.35, 0.6], [0.37, 0.63], [0.395, 0.65], [0.385, 0.67], [0.355, 0.66], [0.34, 0.62], [0.35, 0.5], [0.33, 0.3], [0.24, 0.12], [0, 0.07]];
  kit.add(fm.castIron, organicLathe(sampleProfile(body, 34), { segments: 28, seed: 6, dent: 0.025, oval: 0.03, bumps: 6 }), { y: base });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.3;
    const leg = [[0, 0], [0.035, 0.005], [0.04, 0.04], [0.03, 0.12], [0.045, 0.2], [0, 0.22]];
    kit.add(fm.castIron, organicLathe(sampleProfile(leg, 12), { segments: 10, seed: i, dent: 0.08, oval: 0.1 }), { x: Math.cos(a) * 0.25, z: Math.sin(a) * 0.25, rx: Math.sin(a) * 0.12, rz: -Math.cos(a) * 0.12 });
  }
  // Ring handles on two sides.
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI;
      pts.push([s * (0.375 + Math.sin(a) * 0.06), base + 0.6 - (1 - Math.cos(a)) * 0.0 - Math.sin(a) * 0.02, Math.cos(a) * 0.07]);
    }
    kit.add(fm.castIron, tube(pts, 0.011, { radial: 6 }));
  }
  // The brew: a slightly domed surface of liquid (kind 6), bubbles that swell
  // and burst, and splashes that leap now and then. Outer edge first, so the
  // lathe's faces look up.
  const surf = [[0.355, 0], [0.3, 0.004], [0.15, 0.01], [0, 0.012]];
  const g = organicLathe(surf, { segments: 24, seed: 2, dent: 0.02, oval: 0.03 });
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 6, 0.2);
  setLiquidFrame(g, 0, -0.08, 0, 0.4);
  kit.add(fm.liquid, g, { y: base + 0.58 });
  for (let i = 0; i < 9; i++) {
    const a = random() * TAU;
    const d = Math.sqrt(random()) * 0.28;
    const r = 0.014 + random() * 0.026;
    const bg = blob(r, r * 0.7, r * 0.9, { seed: i, dent: 0.15 });
    const buv = new Float32Array(bg.attributes.position.count * 2);
    for (let k = 0; k < buv.length; k += 2) [buv[k], buv[k + 1]] = [6, 0.42 + i * 0.04];
    bg.setAttribute('uv', new THREE.BufferAttribute(buv, 2));
    setLiquidFrame(bg, 0, 0, 0, r);
    kit.add(fm.liquid, bg, { x: Math.cos(a) * d, y: base + 0.585, z: Math.sin(a) * d });
  }
  for (let i = 0; i < 4; i++) {
    const a = random() * TAU;
    const d = Math.sqrt(random()) * 0.22;
    const r = 0.008 + random() * 0.01;
    const sg = blob(r, r * 1.6, r, { seed: 20 + i, dent: 0.2 });
    const suv = new Float32Array(sg.attributes.position.count * 2);
    for (let k = 0; k < suv.length; k += 2) [suv[k], suv[k + 1]] = [6, 0.82 + i * 0.04];
    sg.setAttribute('uv', new THREE.BufferAttribute(suv, 2));
    setLiquidFrame(sg, 0, 0, 0, r);
    kit.add(fm.liquid, sg, { x: Math.cos(a) * d, y: base + 0.59, z: Math.sin(a) * d });
  }
  // A wooden ladle, its bowl in the brew and the handle resting on the rim.
  {
    const bowl = [[0, 0], [0.03, 0.004], [0.045, 0.018], [0.048, 0.035], [0.04, 0.04], [0.034, 0.03], [0.022, 0.012], [0, 0.006]];
    kit.add(fm.logWood, organicLathe(sampleProfile(bowl, 12), { segments: 12, seed: 9, dent: 0.05, oval: 0.08 }), { x: 0.12, y: base + 0.56, z: -0.1, rx: 0.3, rz: -0.5 });
    kit.add(fm.logWood, tube([[0.15, base + 0.59, -0.12], [0.26, base + 0.63, -0.2], [0.4, base + 0.7, -0.3], [0.52, base + 0.78, -0.38]], 0.011, { radial: 6, tip: 0.013 }));
  }
  // Fire beneath: a bed of split logs and flames licking up the lower sides.
  for (let i = 0; i < 6; i++) {
    const log = [[0, 0], [0.04, 0.01], [0.045, 0.22], [0.038, 0.46], [0, 0.48]];
    const a = (i / 6) * Math.PI + (random() - 0.5) * 0.3;
    kit.add(fm.logWood, organicLathe(log, { segments: 7, seed: i * 3, dent: 0.15, oval: 0.15, flat: true }), { x: Math.cos(a) * 0.3, y: 0.04 + (i % 2) * 0.05, z: Math.sin(a) * 0.3, ry: a, rz: Math.PI / 2 });
  }
  const flame = [[0, 0], [0.07, 0.03], [0.08, 0.08], [0.045, 0.16], [0, 0.24]];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + random() * 0.3;
    const r = 0.29 + random() * 0.05;
    const h = 1.5 + random() * 0.7;
    // Tongues rising from under the pot and curling out round its lower belly.
    kit.add(fm.flame, organicLathe(sampleProfile(flame, 10), { segments: 9, seed: i, dent: 0.2, oval: 0.25, lean: 0.1 }), { x: Math.cos(a) * r, y: 0.03, z: Math.sin(a) * r, rx: -Math.sin(a) * 0.3, rz: Math.cos(a) * 0.3, s: h });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    kit.add(fm.flame, organicLathe(sampleProfile(flame, 10), { segments: 9, seed: 10 + i, dent: 0.2, oval: 0.2, lean: 0.15 }), { x: Math.cos(a) * 0.06, y: 0.05, z: Math.sin(a) * 0.06, s: 1.1 + i * 0.15 });
  }
  kit.add(fm.embers, blob(0.34, 0.04, 0.34, { seed: 3, dent: 0.3 }), { y: 0.025 });
  return { hx: 0.45, hz: 0.45 };
}

// A work table: top of separate bevelled boards (slightly uneven), turned
// legs, aprons and low stretchers.
export function workTable(kit, m, w = 1.8, d = 0.9, h = 0.78, random = mulberry32(5)) {
  const boards = Math.max(3, Math.round(d / 0.18));
  const bw = d / boards;
  for (let i = 0; i < boards; i++) {
    const z = -d / 2 + bw * (i + 0.5);
    kit.add(m.planks, bevelBox(w - random() * 0.012, 0.05, bw - 0.005, 0.009, { metres: 1.2, grain: true }), { x: (random() - 0.5) * 0.01, y: h - 0.025 + (random() - 0.5) * 0.003, z, rx: (random() - 0.5) * 0.01 });
  }
  const leg = [[0, 0], [0.032, 0], [0.036, 0.02], [0.03, 0.05], [0.026, 0.18], [0.034, 0.21], [0.026, 0.24], [0.022, h - 0.24], [0.03, h - 0.2], [0.036, h - 0.17], [0.036, h - 0.05], [0, h - 0.05]];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.add(m.timber, organicLathe(sampleProfile(leg, 30), { segments: 10, seed: sx * 2 + sz, dent: 0.03, oval: 0.02 }), { x: sx * (w / 2 - 0.1), z: sz * (d / 2 - 0.1) });
    }
  }
  for (const sz of [-1, 1]) {
    kit.add(m.timber, bevelBox(w - 0.2, 0.08, 0.035, 0.008, { metres: 1, grain: true }), { y: h - 0.09, z: sz * (d / 2 - 0.1) });
    kit.add(m.timber, bevelBox(w - 0.25, 0.04, 0.03, 0.008, { metres: 1, grain: true }), { y: 0.2, z: sz * (d / 2 - 0.1) });
  }
  for (const sx of [-1, 1]) kit.add(m.timber, bevelBox(0.035, 0.08, d - 0.2, 0.008, { metres: 1, grain: true }), { x: sx * (w / 2 - 0.1), y: h - 0.09 });
  return { hx: w / 2, hz: d / 2, h };
}
