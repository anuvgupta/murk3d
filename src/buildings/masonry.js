import { TERRAIN_HEIGHT_GLSL } from '../world/Terrain.js';

// Weathering for built stone, in world space, so a 20 m wall never reads as
// one tile repeated: large soft stains, rain streaks running down vertical
// faces, rising damp and moss at the foot (the wall knows where the ground
// is through the terrain height texture), lichen spots, patchwork tint
// across groups of blocks, and a gentle large-scale wobble in the normal so
// flat walls catch the light unevenly. Applied on top of the ashlar map.
export function weatherMasonry(material, { noise, heightMap, moss = 1, grime = 1, lichen = 0.1 }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uHeightMap = { value: heightMap };
    shader.uniforms.uMossAmt = { value: moss };
    shader.uniforms.uGrimeAmt = { value: grime };
    shader.uniforms.uLichenAmt = { value: lichen };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vWNormal = normalize( mat3( modelMatrix ) * objectNormal );`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uNoise;
        uniform sampler2D uHeightMap;
        uniform float uMossAmt;
        uniform float uGrimeAmt;
        uniform float uLichenAmt;
        varying vec3 vWPos;
        varying vec3 vWNormal;
        float masonryH;
        ${TERRAIN_HEIGHT_GLSL}
        // Macro relief: broad shallow undulation across a wall face.
        float masonryRelief( vec3 p, vec3 n ) {
          vec2 t = vec2( -n.z, n.x );
          float s = dot( p.xz, t );
          return texture( uNoise, vec2( s, p.y ) * 0.045 ).g * 0.7 + texture( uNoise, vec2( s, p.y ) * 0.16 + 0.37 ).a * 0.3;
        }
        vec3 masonryBump( vec3 surfPos, vec3 surfNorm, float h, float strength ) {
          vec3 sx = dFdx( surfPos );
          vec3 sy = dFdy( surfPos );
          vec3 r1 = cross( sy, surfNorm );
          vec3 r2 = cross( surfNorm, sx );
          float det = dot( sx, r1 );
          vec2 dh = vec2( dFdx( h ), dFdy( h ) ) * strength;
          vec3 grad = sign( det ) * ( dh.x * r1 + dh.y * r2 );
          return normalize( abs( det ) * surfNorm - grad );
        }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 wn = normalize( vWNormal );
          vec3 p = vWPos;
          float vert = 1.0 - abs( wn.y );
          // Wall-space coordinates: s runs along the face, p.y up it.
          vec2 t = vec2( -wn.z, wn.x );
          float s = dot( p.xz, t );
          masonryH = masonryRelief( p, wn );

          // Broad stains, tens of metres across, then patchwork across groups of blocks.
          float stain = texture( uNoise, vec2( s * 0.02, p.y * 0.012 ) + wn.xz * 0.1 ).r * 0.55 + texture( uNoise, vec2( s * 0.07 + 0.3, p.y * 0.05 ) ).a * 0.45;
          float quilt = texture( uNoise, vec2( floor( s / 2.2 ) * 0.173 + 0.5, floor( p.y / 0.8 ) * 0.291 + 0.5 ) ).b * 0.6
            + texture( uNoise, vec2( floor( s / 7.0 ) * 0.137 + 0.2, floor( p.y / 3.0 ) * 0.219 + 0.7 ) ).r * 0.4; // and whole courses of a different quarry
          float tone = ( 0.78 + 0.4 * stain * uGrimeAmt ) * ( 0.8 + 0.38 * quilt );

          // Rain streaks: dark runs down vertical faces, strongest just under ledges.
          float streakN = texture( uNoise, vec2( s * 0.5, p.y * 0.015 ) ).g * texture( uNoise, vec2( s * 1.7 + 0.3, p.y * 0.03 ) ).r;
          float streak = smoothstep( 0.32, 0.6, streakN ) * vert;
          tone *= 1.0 - 0.24 * streak * uGrimeAmt;

          // Rising damp and moss at the foot of the wall.
          float ground = terrainHeight( p.xz );
          float above = p.y - ground;
          float dampN = texture( uNoise, vec2( s * 0.11, p.y * 0.2 ) ).a;
          float damp = ( 1.0 - smoothstep( 0.1 + dampN * 0.8, 2.2 + dampN * 1.5, above ) ) * uGrimeAmt;
          float mossN = texture( uNoise, vec2( s * 0.23, p.y * 0.23 ) + 0.5 ).g;
          float mossF = ( 1.0 - smoothstep( 0.0, 1.1 + 0.9 * mossN, above ) ) * smoothstep( 0.42, 0.7, mossN ) * uMossAmt;
          // Sunken walls (a crypt, a cellar, the uphill side of a house) sit
          // below the ground around them and sweat: damp and moss all over.
          float around = max( max( terrainHeight( p.xz + vec2( 3.5, 0.0 ) ), terrainHeight( p.xz - vec2( 3.5, 0.0 ) ) ),
                              max( terrainHeight( p.xz + vec2( 0.0, 3.5 ) ), terrainHeight( p.xz - vec2( 0.0, 3.5 ) ) ) );
          float buried = smoothstep( -0.2, 1.6, around - p.y ) * vert;
          damp = max( damp, buried * 0.85 * uGrimeAmt );
          // In patches, block by block and in the joints, never a painted wall.
          float mossPatch = smoothstep( 0.5, 0.78, mossN * 0.7 + texture( uNoise, vec2( s, p.y ) * 1.9 + 0.3 ).g * 0.3 + 0.08 * dampN );
          mossF = max( mossF, buried * mossPatch * uMossAmt * 0.9 );
          // Moss also gathers on the tops of ledges and in the shade of north faces.
          float ledge = smoothstep( 0.6, 0.95, wn.y ) * smoothstep( 0.55, 0.75, texture( uNoise, p.xz * 0.6 ).b ) * uMossAmt * 0.6;
          mossF = max( mossF, ledge );

          // Lichen spots on the drier stone.
          float lich = smoothstep( 0.7, 0.84, texture( uNoise, vec2( s, p.y ) * 0.27 + 0.21 ).r ) * ( 1.0 - damp ) * uLichenAmt;

          vec3 c = diffuseColor.rgb * tone;
          c = mix( c, c * vec3( 0.66, 0.68, 0.62 ), damp * 0.7 );
          c = mix( c, vec3( 0.24, 0.3, 0.12 ) * ( 0.7 + 0.6 * mossN ) * ( 0.8 + 0.4 * texture( uNoise, vec2( s, p.y ) * 3.1 ).a ), mossF );
          c = mix( c, vec3( 0.62, 0.6, 0.4 ), lich );
          diffuseColor.rgb = c;
        }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = masonryBump( -vViewPosition, normal, masonryH, 0.12 );`
      );
  };
  return material;
}
