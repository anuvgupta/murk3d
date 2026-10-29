// Shared GLSL for ground colours. The terrain shader and the grass shader both
// use meadowColor(), so blades match the ground they grow from and distant
// meadow (beyond the grass draw distance) reads as the same field.

import * as THREE from 'three';
import { WORLD_HALF, WORLD_SIZE } from './plan.js';

const lin = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3( ${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)} )`;
};

export const GROUND_GLSL = /* glsl */ `
  uniform sampler2D uNoise;
  uniform sampler2D uMask;

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
    vec3 c = mix( ${lin(0x46651f)}, ${lin(0x587a25)}, smoothstep( 0.2, 0.8, n.y ) );
    // Broad lush and sun-dried areas.
    c = mix( c, ${lin(0x34531a)}, smoothstep( 0.55, 0.85, n.x ) * 0.45 );
    c = mix( c, ${lin(0x8a8340)}, smoothstep( 0.62, 0.88, 1.0 - n.x ) * 0.35 );
    c *= 0.92 + 0.16 * n.z;
    return c;
  }

  vec3 dirtColor( vec4 n ) {
    vec3 c = mix( ${lin(0x6a5238)}, ${lin(0x8a7350)}, n.z );
    c *= 0.8 + 0.35 * n.w;
    return c;
  }

  vec3 bedColor( vec4 n ) {
    return mix( ${lin(0x5b5444)}, ${lin(0x8d8162)}, n.z ) * ( 0.85 + 0.3 * n.w );
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

  // Irregular cobbles: distance to the nearest two jittered cell centres.
  vec3 cobbleColor( vec2 p, vec4 n ) {
    vec2 q = p * 2.4;
    vec2 cell = floor( q );
    vec2 f = fract( q );
    float d1 = 8.0;
    float d2 = 8.0;
    float id = 0.0;
    for ( int y = -1; y <= 1; y++ ) {
      for ( int x = -1; x <= 1; x++ ) {
        vec2 g = vec2( float( x ), float( y ) );
        vec2 h = fract( sin( vec2( dot( cell + g, vec2( 127.1, 311.7 ) ), dot( cell + g, vec2( 269.5, 183.3 ) ) ) ) * 43758.5453 );
        vec2 r = g + 0.15 + 0.7 * h - f;
        float d = dot( r, r );
        if ( d < d1 ) { d2 = d1; d1 = d; id = h.x; }
        else if ( d < d2 ) { d2 = d; }
      }
    }
    float edge = sqrt( d2 ) - sqrt( d1 );
    float stone = smoothstep( 0.04, 0.16, edge );
    vec3 c = mix( ${lin(0x6f6a62)}, ${lin(0x9a9284)}, id ) * ( 0.85 + 0.25 * n.w );
    return mix( ${lin(0x3b352c)}, c, stone );
  }

  vec3 groundColor( vec3 p, vec3 nrm, out float wet ) {
    vec4 m = texture( uMask, maskUv( p.xz ) );
    vec4 n = groundNoise( p.xz );
    // Under grass the ground is the turf's shaded base.
    vec3 c = meadowColor( p.xz, n ) * mix( 1.0, 0.72, m.r );
    c = mix( c, dirtColor( n ), smoothstep( 0.15, 0.85, m.g ) );
    c = mix( c, bedColor( n ), m.b );
    if ( m.a > 0.01 ) c = mix( c, cobbleColor( p.xz, n ), m.a );

    float slope = 1.0 - nrm.y;
    float rockAmt = max(
      smoothstep( 0.3, 0.48, slope + ( n.z - 0.5 ) * 0.12 ),
      smoothstep( 110.0, 170.0, p.y + n.x * 40.0 ) * 0.9
    );
    c = mix( c, rockColor( p, nrm ), rockAmt );

    float snowLine = 205.0 + ( n.x - 0.5 ) * 60.0;
    float snow = smoothstep( snowLine, snowLine + 30.0, p.y ) * ( 1.0 - smoothstep( 0.45, 0.75, slope ) );
    c = mix( c, ${lin(0xeef1f5)}, snow );

    wet = m.b;
    return c;
  }
`;
