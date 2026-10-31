import * as THREE from 'three';

const lin = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3( ${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)} )`;
};

// Shared GLSL for natural rock: triplanar so nothing stretches, horizontal
// strata, branching cracks, lichen, moss on upward faces, and a height value
// for derivative bump mapping. Needs `uniform sampler2D uNoise;` declared.
export const ROCK_GLSL = /* glsl */ `
  // Close-range detail factor (0 far .. 1 near); set by the caller before rockAlbedo.
  float rockDetailF = 0.0;
  vec3 triWeights( vec3 n ) {
    vec3 w = pow( abs( n ), vec3( 4.0 ) );
    return w / ( w.x + w.y + w.z );
  }

  float tri( vec3 p, vec3 w, float s, int ch ) {
    vec4 a = texture( uNoise, p.zy * s );
    vec4 b = texture( uNoise, p.xz * s );
    vec4 c = texture( uNoise, p.xy * s );
    return ( ch == 0 ? a.r : ch == 1 ? a.g : ch == 2 ? a.b : a.a ) * w.x
         + ( ch == 0 ? b.r : ch == 1 ? b.g : ch == 2 ? b.b : b.a ) * w.y
         + ( ch == 0 ? c.r : ch == 1 ? c.g : ch == 2 ? c.b : c.a ) * w.z;
  }

  // Jointing: rock breaks into blocks a metre or three across. A cellular
  // pattern on each triplanar plane gives the block seams (F2 - F1 small) and
  // a per-block id for tilt and tone. Returns (seam 0..1, block random 0..1).
  vec2 cellOn( vec2 q ) {
    vec2 i = floor( q );
    vec2 f = fract( q );
    float d1 = 8.0;
    float d2 = 8.0;
    float id = 0.0;
    for ( int y = -1; y <= 1; y++ ) {
      for ( int x = -1; x <= 1; x++ ) {
        vec2 g = vec2( float( x ), float( y ) );
        vec2 hsh = fract( sin( vec2( dot( i + g, vec2( 127.1, 311.7 ) ), dot( i + g, vec2( 269.5, 183.3 ) ) ) ) * 43758.5453 );
        vec2 r = g + hsh - f;
        float d = dot( r, r );
        if ( d < d1 ) { d2 = d1; d1 = d; id = hsh.x; }
        else if ( d < d2 ) { d2 = d; }
      }
    }
    return vec2( 1.0 - smoothstep( 0.0, 0.18, sqrt( d2 ) - sqrt( d1 ) ), id );
  }
  vec2 rockJoints( vec3 p, vec3 w ) {
    // Blocks are longer along the bedding than across it.
    vec2 a = cellOn( p.zy * vec2( 0.45, 0.8 ) );
    vec2 b = cellOn( p.xz * 0.5 );
    vec2 c = cellOn( p.xy * vec2( 0.45, 0.8 ) );
    return a * w.x + b * w.y + c * w.z;
  }

  // Rock surface relief, 0..1. detail (0..1) fades fine features with
  // distance so far cliffs don't shimmer.
  float rockHeight( vec3 p, vec3 w, float detail ) {
    float warp = tri( p, w, 0.03, 1 );
    // Beds a few metres thick, warped so no two lines run parallel for long.
    float strata = sin( p.y * 1.1 + warp * 14.0 + tri( p, w, 0.05, 2 ) * 3.0 ) * 0.5 + 0.5;
    // Cracks: iso-lines of a noise field, but only inside broken zones so
    // they don't read as a contour map drawn over the whole face.
    float crackN = tri( p, w, 0.07, 2 );
    float zone = smoothstep( 0.5, 0.7, tri( p, w, 0.018, 3 ) );
    float cracks = ( 1.0 - smoothstep( 0.0, 0.015 + 0.03 * ( 1.0 - detail ), abs( crackN - 0.5 ) ) ) * detail * zone;
    float grain = mix( 0.5, tri( p, w, 0.45, 3 ), detail );
    // Close up: fine fracture grain, and ledges where one bed steps out over the next.
    float fine = mix( 0.5, tri( p, w, 1.5, 2 ) * 0.6 + tri( p, w, 4.2, 0 ) * 0.4, detail * detail );
    float lumps = tri( p, w, 0.16, 1 );
    float ledge = smoothstep( 0.3, 0.5, fract( p.y * 0.42 + warp * 2.4 + lumps * 0.8 ) ) * detail;
    // Macro relief: buttresses and gullies tens of metres across.
    float macro = tri( vec3( p.x, p.y * 0.35, p.z ), w, 0.022, 0 );
    // Block seams, sunk; each block sits at its own height.
    // Joints and block heights persist at distance (at reduced weight), so a
    // spire 50 m off still reads as jointed stone rather than a smooth cone.
    vec2 j = rockJoints( p + warp * 1.5, w );
    float seam = j.x * ( 0.4 + 0.6 * detail );
    float blockH = mix( 0.5, j.y, 0.5 + 0.5 * detail );
    // Strata read strongest on steep faces (canyon walls, cliffs), barely on level ground.
    float strataW = ( 0.07 + 0.09 * ( 1.0 - w.y ) ) * ( 0.45 + 0.55 * detail ); // far walls keep only a hint of banding
    return clamp( strata * strataW + lumps * 0.26 + grain * 0.2 + fine * 0.12 + ledge * 0.08 + macro * ( 0.36 - 0.1 * ( 1.0 - w.y ) ) + ( blockH - 0.5 ) * 0.18 - cracks * 0.24 - seam * 0.2 + 0.05, 0.0, 1.0 );
  }

  // Granular speckle for the last metre or two: a smoothed hash at ~3 cm.
  float rockSpeckle( vec3 p ) {
    vec3 q = p * 28.0;
    vec3 i = floor( q );
    vec3 f = q - i;
    f = f * f * ( 3.0 - 2.0 * f );
    #define RH( o ) fract( sin( dot( i + o, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 )
    float a = mix( mix( RH( vec3( 0, 0, 0 ) ), RH( vec3( 1, 0, 0 ) ), f.x ), mix( RH( vec3( 0, 1, 0 ) ), RH( vec3( 1, 1, 0 ) ), f.x ), f.y );
    float b = mix( mix( RH( vec3( 0, 0, 1 ) ), RH( vec3( 1, 0, 1 ) ), f.x ), mix( RH( vec3( 0, 1, 1 ) ), RH( vec3( 1, 1, 1 ) ), f.x ), f.y );
    #undef RH
    return mix( a, b, f.z );
  }

  float macroHeight( vec3 p, vec3 w );
  vec3 rockAlbedo( vec3 p, vec3 n, vec3 w, float h ) {
    float broad = tri( p, w, 0.015, 0 );
    float band = sin( p.y * 0.9 + broad * 7.0 ) * 0.5 + 0.5;
    vec3 c = mix( ${lin(0x75695d)}, ${lin(0xb9ab96)}, smoothstep( 0.2, 0.8, broad ) );
    c = mix( c, c * ${lin(0xd2b08f)} * 1.25, band * 0.5 );
    // Each outcrop its own cast: a very low-frequency tint across the map,
    // so a wall of spires is not one colour from end to end.
    float hue = texture( uNoise, p.xz * 0.02 + 0.13 ).r * 0.6 + texture( uNoise, p.xz * 0.0045 + 0.37 ).g * 0.4; // per outcrop, with a regional drift
    c *= mix( vec3( 0.86, 0.9, 0.96 ), vec3( 1.1, 1.0, 0.9 ), hue );
    // Bedding: light and dark beds alternate up the face.
    c *= 0.9 + 0.2 * band;
    // Cavities: hollows and cracks sit in shadow; ridges catch the light.
    c *= mix( 0.5 + 0.75 * h, 0.28 + 1.15 * h, rockDetailF );
    // Far structure, so a cliff 50 m off is not grey felt: tall buttresses
    // and the gullies between them (flutes 10–20 m across) and the macro
    // relief shade themselves, in light and in flat dusk alike.
    {
      float far = 1.0 - 0.55 * rockDetailF;
      float steep = 1.0 - w.y;
      float flute = tri( vec3( p.x, p.y * 0.12, p.z ), w, 0.07, 1 );
      c *= 1.0 + steep * far * 0.4 * ( smoothstep( 0.3, 0.7, flute ) - 0.5 );
      float mac = macroHeight( p, w );
      c *= mix( 1.0, 0.72 + 0.56 * mac, far * 0.8 );
    }
    // Close up the stone is granular, not smooth plaster.
    c *= 1.0 + ( rockSpeckle( p ) - 0.5 ) * 0.3 * rockDetailF * rockDetailF;
    // Mid-scale variation and gullies streaking down the slope, visible from afar.
    float meso = tri( p, w, 0.05, 2 );
    float gully = tri( vec3( p.x, p.y * 0.22, p.z ), w, 0.045, 3 );
    // Rain-wash: dark streaks run down steep faces; level rock keeps an even tone.
    float gullyK = mix( 0.16, 0.42, 1.0 - w.y );
    c *= ( 0.76 + 0.46 * meso ) * ( 1.0 - gullyK + gullyK * smoothstep( 0.35, 0.7, gully ) );
    // Bedding colour: alternating warm and cool beds on steep faces.
    c *= 1.0 + ( 1.0 - w.y ) * 0.1 * ( sin( p.y * 1.1 + broad * 11.0 + 1.3 ) );
    // Lichen in patches.
    float lichen = smoothstep( 0.64, 0.8, tri( p, w, 0.08, 0 ) ) * 0.45;
    c = mix( c, ${lin(0x8b8a52)}, lichen );
    // Moss and grass only on near-level ledges.
    float up = smoothstep( 0.82, 0.96, n.y + ( tri( p, w, 0.05, 3 ) - 0.5 ) * 0.2 );
    c = mix( c, ${lin(0x3d5424)} * ( 0.8 + 0.4 * tri( p, w, 0.3, 2 ) ), up * 0.6 );
    return c;
  }

  // Large-scale relief (buttresses and gullies tens of metres across) as a
  // world-space normal perturbation. Analytic value noise with a quintic
  // fade and its exact gradient: C2-smooth, no octave finer than ~8 m, so
  // the normal stays smooth at any distance (finite differences of the
  // texture noise aliased into grey felt on every far cliff).
  float hash3( vec3 p ) {
    return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 );
  }
  // xyz: gradient, w: value (0..1).
  vec4 noised3( vec3 x ) {
    vec3 i = floor( x );
    vec3 f = fract( x );
    vec3 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
    vec3 du = 30.0 * f * f * ( f * ( f - 2.0 ) + 1.0 );
    float a = hash3( i + vec3( 0.0, 0.0, 0.0 ) );
    float b = hash3( i + vec3( 1.0, 0.0, 0.0 ) );
    float c = hash3( i + vec3( 0.0, 1.0, 0.0 ) );
    float d = hash3( i + vec3( 1.0, 1.0, 0.0 ) );
    float e = hash3( i + vec3( 0.0, 0.0, 1.0 ) );
    float f1 = hash3( i + vec3( 1.0, 0.0, 1.0 ) );
    float g = hash3( i + vec3( 0.0, 1.0, 1.0 ) );
    float h = hash3( i + vec3( 1.0, 1.0, 1.0 ) );
    float k0 = a;
    float k1 = b - a;
    float k2 = c - a;
    float k3 = e - a;
    float k4 = a - b - c + d;
    float k5 = a - c - e + g;
    float k6 = a - b - e + f1;
    float k7 = -a + b + c - d + e - f1 - g + h;
    float v = k0 + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
    vec3 gr = du * vec3( k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
                         k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
                         k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y );
    return vec4( gr, v );
  }
  // Three octaves: tall buttresses (squashed in y), ribs, and 8 m lumps.
  vec4 macroField( vec3 p ) {
    vec3 s1 = vec3( 0.022, 0.0077, 0.022 );
    vec4 n1 = noised3( p * s1 );
    vec4 n2 = noised3( p * 0.055 + 11.3 );
    vec4 n3 = noised3( p * 0.13 + 5.7 );
    return vec4( n1.xyz * s1 * 0.6 + n2.xyz * 0.055 * 0.28 + n3.xyz * 0.13 * 0.12, n1.w * 0.6 + n2.w * 0.28 + n3.w * 0.12 );
  }
  float macroHeight( vec3 p, vec3 w ) {
    return macroField( p ).w;
  }
  vec3 macroNormal( vec3 p, vec3 n, float strength ) {
    vec3 grad = macroField( p ).xyz;
    // Remove the component along the normal; tilt within the surface.
    grad -= n * dot( grad, n );
    return normalize( n - grad * strength );
  }

  // Perturb a view-space normal by a height field (three.js' perturbNormalArb).
  vec3 bumpNormal( vec3 surfPos, vec3 surfNorm, float h, float strength ) {
    vec3 sx = dFdx( surfPos );
    vec3 sy = dFdy( surfPos );
    vec3 r1 = cross( sy, surfNorm );
    vec3 r2 = cross( surfNorm, sx );
    float det = dot( sx, r1 );
    vec2 dh = vec2( dFdx( h ), dFdy( h ) ) * strength;
    vec3 grad = sign( det ) * ( dh.x * r1 + dh.y * r2 );
    return normalize( abs( det ) * surfNorm - grad );
  }
`;
