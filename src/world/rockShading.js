import * as THREE from 'three';

const lin = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3( ${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)} )`;
};

// Shared GLSL for natural rock: triplanar so nothing stretches, horizontal
// strata, branching cracks, lichen, moss on upward faces, and a height value
// for derivative bump mapping. Needs `uniform sampler2D uNoise;` declared.
export const ROCK_GLSL = /* glsl */ `
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

  // Rock surface relief, 0..1. detail (0..1) fades fine features with
  // distance so far cliffs don't shimmer.
  float rockHeight( vec3 p, vec3 w, float detail ) {
    float warp = tri( p, w, 0.03, 1 );
    float strata = sin( p.y * 2.2 + warp * 9.0 ) * 0.5 + 0.5;
    float crackN = tri( p, w, 0.07, 2 );
    float cracks = ( 1.0 - smoothstep( 0.0, 0.03 + 0.04 * ( 1.0 - detail ), abs( crackN - 0.5 ) ) ) * detail;
    float grain = mix( 0.5, tri( p, w, 0.45, 3 ), detail );
    float lumps = tri( p, w, 0.16, 1 );
    return clamp( strata * 0.25 + lumps * 0.4 + grain * 0.25 - cracks * 0.5 + 0.1, 0.0, 1.0 );
  }

  vec3 rockAlbedo( vec3 p, vec3 n, vec3 w, float h ) {
    float broad = tri( p, w, 0.015, 0 );
    float band = sin( p.y * 0.9 + broad * 7.0 ) * 0.5 + 0.5;
    vec3 c = mix( ${lin(0x625c53)}, ${lin(0x9a907f)}, smoothstep( 0.2, 0.8, broad ) );
    c = mix( c, c * ${lin(0xc9a78a)} * 1.4, band * 0.3 );
    c *= 0.72 + 0.4 * h;
    // Lichen in patches.
    float lichen = smoothstep( 0.64, 0.8, tri( p, w, 0.08, 0 ) ) * 0.45;
    c = mix( c, ${lin(0x8b8a52)}, lichen );
    // Moss and grass only on near-level ledges.
    float up = smoothstep( 0.78, 0.95, n.y + ( tri( p, w, 0.05, 3 ) - 0.5 ) * 0.3 );
    c = mix( c, ${lin(0x4a6a22)} * ( 0.8 + 0.4 * tri( p, w, 0.3, 2 ) ), up * 0.8 );
    return c;
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
