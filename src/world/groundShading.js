// Shared GLSL for ground colours. The terrain shader and the grass shader both
// use meadowColor(), so blades match the ground they grow from and distant
// meadow (beyond the grass draw distance) reads as the same field.

import * as THREE from 'three';
import { WORLD_HALF, WORLD_SIZE } from './plan.js';
import { REGIONS } from './regions.js';

// Uniform values for the realm tints (same for every ground material).
export function regionUniforms() {
  const pos = [];
  const tint = [];
  const grass = [];
  for (let i = 0; i < 10; i++) {
    const R = REGIONS[i];
    if (R) {
      pos.push(new THREE.Vector4(R.x, R.z, R.r, R.snow || 0));
      const g = R.palette.ground;
      tint.push(new THREE.Vector4(g[0], g[1], g[2], R.palette.grassDensity ?? 1));
      const gt = R.palette.grassTint || [1, 1, 1];
      grass.push(new THREE.Vector3(gt[0], gt[1], gt[2]));
    } else {
      pos.push(new THREE.Vector4(1e6, 1e6, 1, 0));
      tint.push(new THREE.Vector4(1, 1, 1, 1));
      grass.push(new THREE.Vector3(1, 1, 1));
    }
  }
  return { uRegions: { value: pos }, uRegionTint: { value: tint }, uRegionGrass: { value: grass } };
}

const lin = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3( ${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)} )`;
};

// The realms' tint/snow lookup, shared by the ground, grass and rock shaders.
export const REALM_GLSL = /* glsl */ `
  // The realms: (x, z, radius, snow) and (tint rgb, grass density).
  uniform vec4 uRegions[ 10 ];
  uniform vec4 uRegionTint[ 10 ];
  uniform vec3 uRegionGrass[ 10 ];
  // Blade tint of whichever realm holds p (straw on the tundra).
  vec3 realmGrassTint( vec2 p ) {
    vec3 t = vec3( 1.0 );
    for ( int i = 0; i < 10; i++ ) {
      float d = distance( p, uRegions[ i ].xy );
      float w = 1.0 - smoothstep( uRegions[ i ].z - 20.0, uRegions[ i ].z + 70.0, d );
      t = mix( t, uRegionGrass[ i ], w );
    }
    return t;
  }

  // Tint, snow and grass density from whichever realm holds p.
  vec4 realmAt( vec2 p, out float snow ) {
    vec4 best = vec4( 1.0, 1.0, 1.0, 1.0 );
    snow = 0.0;
    for ( int i = 0; i < 10; i++ ) {
      float d = distance( p, uRegions[ i ].xy );
      float w = 1.0 - smoothstep( uRegions[ i ].z - 20.0, uRegions[ i ].z + 70.0, d );
      if ( w > 0.0 ) {
        best = mix( best, uRegionTint[ i ], w );
        snow += w * uRegions[ i ].w;
      }
    }
    return best;
  }
`;

export const GROUND_GLSL = /* glsl */ `
  uniform sampler2D uNoise;
  uniform sampler2D uMask;
  ${REALM_GLSL}

  vec2 maskUv( vec2 p ) {
    return ( p + ${WORLD_HALF.toFixed(1)} ) / ${WORLD_SIZE.toFixed(1)};
  }

  // Four uncorrelated noise layers at different world scales. Each layer is
  // sampled on rotated axes so the noise lattice never lines up with the world.
  vec4 groundNoise( vec2 p ) {
    vec2 a = mat2( 0.866, 0.5, -0.5, 0.866 ) * p;
    vec2 b = mat2( 0.6, -0.8, 0.8, 0.6 ) * p;
    return vec4(
      texture( uNoise, a * 0.0021 ).r,
      texture( uNoise, b * 0.013 ).g,
      texture( uNoise, a * 0.09 ).b,
      texture( uNoise, b * 0.55 ).a
    );
  }

  vec3 meadowColor( vec2 p, vec4 n ) {
    // Warm yellow-greens: fresh spring green in the sun, deeper green in the lee.
    vec3 c = mix( ${lin(0x5c7f2e)}, ${lin(0x7fa23a)}, smoothstep( 0.2, 0.8, n.y ) );
    c = mix( c, ${lin(0x47682a)}, smoothstep( 0.55, 0.85, n.x ) * 0.45 );
    c = mix( c, ${lin(0xa3a052)}, smoothstep( 0.62, 0.9, 1.0 - n.x ) * 0.35 );
    c *= 0.92 + 0.16 * n.z;
    // Broad patchiness (tens of metres): drier straw-green sweeps and
    // richer hollows, so a distant hillside isn't one flat tone.
    float sweep = texture( uNoise, p * 0.012 + 0.37 ).r * 0.6 + texture( uNoise, p * 0.035 + 0.11 ).g * 0.4;
    c = mix( c, c * vec3( 1.12, 1.06, 0.78 ), smoothstep( 0.55, 0.8, sweep ) * 0.55 );
    c = mix( c, c * vec3( 0.86, 0.94, 0.9 ), smoothstep( 0.45, 0.2, sweep ) * 0.4 );
    float snow;
    vec4 realm = realmAt( p, snow );
    c *= realm.rgb;
    if ( snow > 0.001 ) {
      // Snowfield: soft drifts, wind ripples across them, and windswept
      // patches where the straw and stones show through.
      float drift = texture( uNoise, p * 0.03 + 0.7 ).b;
      float ripple = texture( uNoise, vec2( p.x * 0.8 + p.y * 0.3, p.y * 0.12 ) ).a;
      float swept = smoothstep( 0.3, 0.55, texture( uNoise, p * 0.014 + 0.2 ).g * 0.7 + n.x * 0.3 );
      vec3 snowC = vec3( 0.84, 0.88, 0.96 ) * ( 0.86 + 0.1 * n.z + 0.08 * drift + 0.05 * ripple );
      float cover = clamp( snow, 0.0, 1.0 ) * mix( 0.45, 0.95, swept );
      c = mix( c * vec3( 0.9, 0.86, 0.72 ), snowC, cover );
    }
    return c;
  }

  vec3 dirtColor( vec4 n ) {
    vec3 c = mix( ${lin(0x6a5238)}, ${lin(0x8a7350)}, n.z );
    c *= 0.8 + 0.35 * n.w;
    return c;
  }

  // Detail factor for the ground (0 far .. 1 near); set by the caller.
  float groundDetail = 0.0;

  // Dirt roads: the mask's soft band made crooked and jagged at the metre and
  // hand scale, with a short fade to the turf.
  float roadAmount( vec2 p, float g ) {
    float wob = ( texture( uNoise, p * 0.09 + 0.23 ).r - 0.5 ) * 0.34 + ( texture( uNoise, p * 0.7 + 0.61 ).a - 0.5 ) * 0.16;
    return smoothstep( 0.4, 0.6, g + wob );
  }

  vec3 roadColor( vec2 p, vec4 n, float g, float detail ) {
    vec3 c = dirtColor( n );
    // Broad patches of paler packed earth and darker damp ground.
    float packed = texture( uNoise, p * 0.05 + 0.4 ).g;
    c *= 0.82 + 0.36 * packed;
    // Streaks and ruts of darker dirt.
    float streak = texture( uNoise, p * vec2( 0.9, 0.12 ) + 0.7 ).r * texture( uNoise, p * vec2( 0.12, 0.9 ) + 0.2 ).b;
    c *= 1.0 - 0.22 * smoothstep( 0.2, 0.42, streak );
    // Cracks in the dried crust, close up.
    float cn = texture( uNoise, p * 0.45 + 0.9 ).a;
    float crack = ( 1.0 - smoothstep( 0.0, 0.03, abs( cn - 0.5 ) ) ) * smoothstep( 0.5, 0.7, packed ) * detail;
    c *= 1.0 - 0.3 * crack;
    // Gravel and the odd pebble pressed into the surface.
    vec2 cell = floor( p * 16.0 );
    float h = fract( sin( dot( cell, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
    vec2 f = fract( p * 16.0 ) - 0.5;
    float peb = step( 0.955, h ) * ( 1.0 - smoothstep( 0.16, 0.3, length( f + ( vec2( fract( h * 7.0 ), fract( h * 13.0 ) ) - 0.5 ) * 0.4 ) ) );
    c = mix( c, mix( vec3( 0.5, 0.46, 0.4 ), vec3( 0.36, 0.32, 0.28 ), fract( h * 3.1 ) ) * ( 0.9 + 0.3 * f.y ), peb * detail * detail * 0.8 );
    // Packed earth pales toward the edge where feet and wheels don't go.
    c *= 1.0 + 0.18 * ( 1.0 - smoothstep( 0.6, 0.95, g ) );
    return c;
  }

  vec3 bedColor( vec4 n ) {
    return mix( ${lin(0x7d745f)}, ${lin(0xa89c7e)}, n.z ) * ( 0.85 + 0.3 * n.w );
  }

  vec3 rockColor( vec3 p, vec3 nrm ) {
    // Triplanar so cliffs don't stretch a top-down pattern.
    vec3 w = abs( nrm );
    w = pow( w, vec3( 4.0 ) );
    w /= ( w.x + w.y + w.z );
    float a = texture( uNoise, p.zy * vec2( 0.06, 0.22 ) ).b * w.x
            + texture( uNoise, p.xz * 0.08 ).b * w.y
            + texture( uNoise, p.xy * vec2( 0.06, 0.22 ) ).b * w.z;
    float b = texture( uNoise, p.zy * 0.4 ).a * w.x
            + texture( uNoise, p.xz * 0.4 ).a * w.y
            + texture( uNoise, p.xy * 0.4 ).a * w.z;
    vec3 c = mix( ${lin(0x55514b)}, ${lin(0x8d877c)}, a );
    return c * ( 0.8 + 0.4 * b );
  }

  // Paving setts: staggered courses of rounded-rectangular stones with wavy,
  // finely jagged edges, recessed joints and moss in the cracks. cover is the
  // mask's paving amount: below full, whole stones drop out one by one (each
  // has its own threshold) so the paving frays into loose setts on dirt
  // instead of fading. Returns the colour and how much of it covers the ground.
  vec4 cobbleColor( vec2 p, vec4 n, float cover ) {
    vec2 q = p * 3.0;
    float row = floor( q.y );
    float rh = fract( sin( row * 12.99 ) * 43758.5 );
    q.x += rh * 0.7 + 0.5 * mod( row, 2.0 );
    float col = floor( q.x );
    vec2 id = vec2( col, row );
    float h = fract( sin( dot( id, vec2( 127.1, 311.7 ) ) ) * 43758.5 );
    vec2 f = fract( q );
    vec2 e2 = min( f, 1.0 - f );
    float wave = ( texture( uNoise, p * 0.9 + h ).g - 0.5 ) * 0.07;
    float jag = ( texture( uNoise, p * 6.0 ).a - 0.5 ) * 0.035;
    float edge = min( e2.x * 0.85, e2.y ) + wave + jag;
    float joint = smoothstep( 0.035, 0.075, edge );
    float round = smoothstep( 0.075, 0.26, edge );
    vec3 c = mix( ${lin(0x7a7268)}, ${lin(0xa59b8a)}, h ) * ( 0.82 + 0.3 * n.w ) * ( 0.7 + 0.3 * round );
    c = mix( c, c * ${lin(0xd4b58a)} * 1.2, smoothstep( 0.6, 0.9, fract( h * 7.3 ) ) * 0.4 );
    // Dark packed earth in the joints; moss only where it stays damp, and never lime.
    vec3 mortar = mix( ${lin(0x3a342c)}, ${lin(0x3b4f24)}, smoothstep( 0.6, 0.85, n.y ) * smoothstep( 0.45, 0.7, n.w ) * 0.6 );
    // Loose setts sit lower and dirtier than the laid paving.
    float laid = smoothstep( 0.82, 0.96, cover );
    c *= mix( 0.78, 1.0, laid );
    float keep = step( 0.08 + 0.84 * fract( h * 53.7 + 0.31 ), cover );
    // Loose setts are worn smaller and rounder, half buried, the corners lost
    // under the dirt; the sparser the paving, the smaller what's left.
    vec2 cq = max( vec2( 0.2 ) - vec2( e2.x * 0.85, e2.y ), 0.0 );
    float roundEdge = 0.2 - length( cq ) + wave + jag;
    float inset = mix( 0.15, 0.05, smoothstep( 0.1, 0.9, cover ) ) + 0.04 * fract( h * 17.1 );
    float loose = keep * smoothstep( inset, inset + 0.03, roundEdge );
    // Fully paved: mortar fills the joints. Frayed: the dirt shows between stones.
    return vec4( mix( mortar, c, joint ), max( laid, loose ) );
  }

  // carpet: how much of the grass carpet actually stands here (the blade
  // shader's own slope cull), so the lit under-grass colour never shows bare.
  vec3 groundColor( vec3 p, vec3 nrm, float carpet, out float wet ) {
    vec4 m = texture( uMask, maskUv( p.xz ) );
    vec4 n = groundNoise( p.xz );
    // Under grass the ground is the turf's shaded base.
    // Under grass the ground stands in for the carpet beyond the blade draw
    // distance, so it matches the lit blades' average, not their shaded roots.
    // Where no grass grows (rock feet, under ruins, trodden ground) the soil
    // shows: earth with a thin scatter of green, not bare meadow colour.
    vec3 bare = mix( dirtColor( n ) * 0.95, meadowColor( p.xz, n ) * 0.8, 0.35 + 0.3 * n.w );
    // The ground seen between and beyond the blades: as bright as the lit
    // carpet but pulled toward a warm olive, never a pure acid green.
    vec3 under = meadowColor( p.xz, n ) * vec3( 1.22, 1.2, 1.0 );
    float ul = dot( under, vec3( 0.3, 0.59, 0.11 ) );
    under = mix( under, vec3( ul ) * vec3( 1.06, 1.0, 0.8 ), 0.4 );
    vec3 c = mix( bare, under, smoothstep( 0.0, 0.55, m.r ) * carpet );
    c = mix( c, roadColor( p.xz, n, m.g, groundDetail ), roadAmount( p.xz, m.g ) );
    c = mix( c, bedColor( n ), m.b );
    if ( m.a > 0.01 ) {
      vec4 sett = cobbleColor( p.xz, n, m.a );
      c = mix( c, sett.rgb, sett.a );
    }

    float slope = 1.0 - nrm.y;
    // Banks: worn earth on moderate slopes, bare rock where it steepens or climbs.
    float bank = smoothstep( 0.3, 0.46, slope + ( n.z - 0.5 ) * 0.1 );
    c = mix( c, dirtColor( n ) * 0.9, bank * 0.6 );
    // Steep ground is bare rock; on a cliff the odd flatter ledge stays rock
    // too (no grass blotches), so the rock band starts earlier where the
    // ground is already mostly steep.
    float rockAmt = max(
      smoothstep( 0.36, 0.52, slope + ( n.z - 0.5 ) * 0.06 ),
      smoothstep( 95.0, 150.0, p.y + n.x * 40.0 ) * 0.9
    );
    c = mix( c, rockColor( p, nrm ), rockAmt );

    float snowLine = 150.0 + ( n.x - 0.5 ) * 50.0;
    // Steep faces keep a dusting, so a far peak reads as one snowy mass
    // rather than bare brown streaks hanging in the haze.
    float snow = smoothstep( snowLine, snowLine + 35.0, p.y ) * ( 1.0 - 0.65 * smoothstep( 0.45, 0.9, slope ) );
    snow *= 0.6 + 0.4 * smoothstep( 0.3, 0.6, n.z + ( 1.0 - slope ) * 0.2 );
    c = mix( c, ${lin(0xe4eaf1)}, snow );

    wet = m.b;
    return c;
  }
`;
