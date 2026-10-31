import * as THREE from 'three';
import { regionUniforms, GROUND_GLSL } from './groundShading.js';
import { TERRAIN_GRID } from './Terrain.js';
const SINH_K = Math.sinh(TERRAIN_GRID.warp);
const WORLD_HALF = TERRAIN_GRID.half;
import { ROCK_GLSL } from './rockShading.js';
import { TERRAIN_HEIGHT_GLSL } from './Terrain.js';

// MeshStandardMaterial whose albedo is computed per pixel from world position:
// meadow, dirt roads, cobbles, river beds, rock and snow. No tiled textures, so
// nothing looks blocky up close or repeats at a distance.
export const TERRAIN_DEBUG = { value: 0 }; // 0 off, 1 world normal, 2 carpet/rock amounts, 3 unlit colour, 4 shading normal

export function createTerrainMaterial({ noise, mask, heightMap }) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, envMapIntensity: 1.35 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uMask = { value: mask };
    shader.uniforms.uHeightMap = { value: heightMap };
    shader.uniforms.uDebug = TERRAIN_DEBUG;
    Object.assign(shader.uniforms, regionUniforms());

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNormal;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vWNormal = normalize( mat3( modelMatrix ) * objectNormal );`
      )
      .replace(
        '#include <shadowmap_vertex>',
        `#ifdef USE_SHADOWMAP
        {
          // Shadow terminator: the grid's cells grow toward the edge of the
          // world (1.5 m in the Vale, 5 m in the realms), and a smooth-shaded
          // face on a coarse mesh shadows itself in triangle-shaped patches.
          // Push the shadow lookup off the surface in proportion to the cell.
          float m = max( abs( vWPos.x ), abs( vWPos.z ) ) * ${SINH_K.toFixed(5)} / ${WORLD_HALF.toFixed(1)};
          float cell = 1.149 * sqrt( 1.0 + m * m );
          worldPosition.xyz += vWNormal * cell * 0.1;
        }
        #endif
        #include <shadowmap_vertex>`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNormal;
        float rockAmtOut;
        float rockHOut;
        uniform int uDebug;
        const float CELL0 = 1.1488; // grid cell at the world's centre, metres
        vec3 dbgGround; float dbgCarpet; vec3 dbgBump = vec3( 0.0 ); vec3 dbgMacro = vec3( 0.0 );
        float rockDetail;
        uniform sampler2D uHeightMap;
        ${TERRAIN_HEIGHT_GLSL}
        ${GROUND_GLSL}
        ${ROCK_GLSL}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wet;
        vec3 wn = normalize( vWNormal );
        // Smoothed vertex normals blur a two-cell-wide cliff toward the flat
        // ground above and below it, so steep faces would read as meadow.
        // Classify ground by the true face normal (screen-space derivatives)
        // while lighting keeps the smooth one.
        // A gradient normal from the height texture, spanning about one grid
        // cell: it still sees a one-cell cliff, but averages neighbouring faces
        // instead of stepping per triangle the way a screen-space derivative does.
        vec3 faceN;
        {
          float mm = max( abs( vWPos.x ), abs( vWPos.z ) ) * T_SINHK / T_HALF;
          float sp = CELL0 * sqrt( 1.0 + mm * mm ) * 0.8;
          float hL = terrainHeight( vWPos.xz - vec2( sp, 0.0 ) );
          float hR = terrainHeight( vWPos.xz + vec2( sp, 0.0 ) );
          float hD = terrainHeight( vWPos.xz - vec2( 0.0, sp ) );
          float hU = terrainHeight( vWPos.xz + vec2( 0.0, sp ) );
          faceN = normalize( vec3( hL - hR, 2.0 * sp, hD - hU ) );
        }
        // The flat face normal only matters where the smooth one lies about
        // steepness (a one-cell cliff); on rolling ground it just paints the
        // mesh's triangles, so it fades out there.
        float steepK = smoothstep( 0.9, 0.62, min( wn.y, faceN.y ) );
        vec3 wnClass = normalize( mix( wn, faceN, 0.7 * steepK ) );
        // The same baked slope the blade shader culls by, so the carpet colour
        // stops exactly where the blades do.
        // On a steep sunlit bank the blades spread thin, so the lit carpet
        // colour would glow through: show earth under them there instead.
        // Whichever of the smooth or gradient normal says steeper wins: a thin
        // spire's gradient can read flat where its smooth normal is sideways.
        float carpet = smoothstep( 0.5, 0.68, min( terrainSlope( vWPos.xz ), min( wn.y, faceN.y ) ) );
        groundDetail = 1.0 - smoothstep( 8.0, 40.0, length( vViewPosition ) );
        vec3 ground = groundColor( vWPos, wnClass, carpet, wet );
        // Cliffs and steep ground get the detailed rock shading.
        vec3 tw = triWeights( wn );
        // Fine relief lives in the first few tens of metres: beyond that its
        // features are under a pixel and the derivative bump turns to noise.
        float detail = 1.0 - smoothstep( 6.0, 42.0, length( vViewPosition ) );
        rockDetail = detail;
        rockDetailF = detail;
        rockHOut = rockHeight( vWPos, tw, detail );
        // Rock amount from the smooth normal (the face normal would step per triangle and show the mesh).
        // The realms' steep rims turn to rock a little sooner than the Vale's hills.
        float rimW;
        vec4 rr = realmRock( vWPos.xz, rimW );
        rockAmtOut = smoothstep( 0.42 - 0.1 * rimW, 0.58 - 0.1 * rimW, 1.0 - min( wn.y, mix( 1.0, faceN.y, steepK ) ) + ( texture( uNoise, vWPos.xz * 0.05 ).b - 0.5 ) * 0.14 + ( texture( uNoise, vWPos.xz * 0.31 + 0.5 ).a - 0.5 ) * 0.1 );
        // Too steep for the blades means stone, not bare mud (see groundColor).
        rockAmtOut = max( rockAmtOut, ( 1.0 - carpet ) * 0.75 * smoothstep( 0.22, 0.38, 1.0 - wn.y ) );
        {
          // Realm-coloured rock (red canyon, pale karst), snowed over on the tundra.
          float sn;
          vec4 rl = realmAt( vWPos.xz, sn );
          vec3 rockC = tintRock( rockAlbedo( vWPos, wnClass, tw, rockHOut ), rr );
          // Snow on rock keeps the rock's relief: brighter on the ridges, grey in the hollows.
          // A veil of turf and moss over rock on moderate slopes (45–60°) where
          // the meadow grows around it: the hillsides read green with stone
          // showing through, not as bare brown rock from foot to crest.
          {
            float veil = smoothstep( 0.5, 0.78, wn.y + ( rockHOut - 0.5 ) * 0.25 ) * smoothstep( 0.3, 0.8, texture( uMask, maskUv( vWPos.xz ) ).r )
                       * ( 0.45 + 0.55 * texture( uNoise, vWPos.xz * 0.09 + 0.4 ).g );
            vec3 veilC = meadowColor( vWPos.xz, groundNoise( vWPos.xz ) ) * vec3( 0.9, 1.0, 0.8 ) * ( 0.75 + 0.3 * rockHOut );
            rockC = mix( rockC, veilC, veil * 0.85 );
          }
          rockC = mix( rockC, vec3( 0.88, 0.91, 0.97 ) * ( 0.78 + 0.36 * rockHOut ), clamp( sn, 0.0, 1.0 ) * 0.9 * smoothstep( 0.25, 0.7, wn.y + rockHOut * 0.3 ) );
          ground = mix( ground, rockC, rockAmtOut );
        }
        diffuseColor.rgb *= ground;
        dbgGround = ground; dbgCarpet = carpet;`
      )
      .replace(
        '#include <opaque_fragment>',
        `if ( uDebug == 1 ) { gl_FragColor = vec4( normalize( vWNormal ) * 0.5 + 0.5, 1.0 ); return; }
        if ( uDebug == 2 ) { gl_FragColor = vec4( dbgCarpet, rockAmtOut, 0.0, 1.0 ); return; }
        if ( uDebug == 3 ) { gl_FragColor = vec4( dbgGround, 1.0 ); return; }
        if ( uDebug == 4 ) { gl_FragColor = vec4( normal * 0.5 + 0.5, 1.0 ); return; }
        if ( uDebug == 5 ) { gl_FragColor = vec4( 0.5, 0.5, 0.5, 1.0 ); return; }
        if ( uDebug == 6 ) { gl_FragColor = vec4( vec3( terrainSlope( vWPos.xz ) ), 1.0 ); return; }
        if ( uDebug == 7 ) { gl_FragColor = vec4( vec3( wnClass.y ), 1.0 ); return; }
        if ( uDebug == 8 ) { gl_FragColor = vec4( dbgBump * 0.5 + 0.5, 1.0 ); return; }
        if ( uDebug == 9 ) { gl_FragColor = vec4( dbgMacro * 0.5 + 0.5, 1.0 ); return; }
        if ( uDebug == 10 ) { gl_FragColor = vec4( vec3( macroHeight( vWPos, triWeights( normalize( vWNormal ) ) ) ), 1.0 ); return; }
        if ( uDebug == 11 ) { gl_FragColor = vec4( macroNormal( vWPos, normalize( vWNormal ), 2.0 ) * 0.5 + 0.5, 1.0 ); return; }
        #if NUM_HEMI_LIGHTS > 0
        {
          // Snow in shadow is lit by the whole sky: bright blue-white, never grey.
          float sn;
          realmAt( vWPos.xz, sn );
          outgoingLight += diffuseColor.rgb * hemisphereLights[ 0 ].skyColor * clamp( sn, 0.0, 1.0 ) * 0.55;
        }
        #endif
        #include <opaque_fragment>`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, 0.55, wet );`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // Relief on rock, and a gentler relief on the bare earth of steep banks
        // (which otherwise read as smooth plaster up close).
        float bankAmt = smoothstep( 0.28, 0.5, 1.0 - wnClass.y ) * ( 1.0 - rockAmtOut );
        // Derivative bump only up close: at 50 m its features are smaller than
        // a pixel and it turns a cliff into grey felt. Distant relief comes
        // from the analytic macro normal instead, which stays smooth.
        normal = bumpNormal( -vViewPosition, normal, rockHOut, ( 3.4 * rockAmtOut + 0.6 * bankAmt ) * rockDetail * rockDetail * rockDetail );
        dbgBump = normal;
        if ( rockAmtOut > 0.01 ) {
          vec3 wn2 = macroNormal( vWPos, normalize( vWNormal ), ( 9.0 + 8.0 * ( 1.0 - rockDetail ) ) * rockAmtOut );
          dbgMacro = wn2;
          vec3 vn2 = normalize( ( viewMatrix * vec4( wn2, 0.0 ) ).xyz );
          normal = normalize( mix( normal, vn2, 0.75 ) );
        }`
      );
  };
  return material;
}

// Turf for built things (island tops, the barrow): the same meadow colouring
// as the ground, so they match the grass around them.
export function createTurfMaterial({ noise, mask }) {
  const material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uMask = { value: mask };
    Object.assign(shader.uniforms, regionUniforms());
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${GROUND_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec4 gn = groundNoise( vWPos.xz );
          // Fine tuft noise stands in for blades on built turf.
          float tuft = texture( uNoise, vWPos.xz * 1.7 ).g * 0.6 + texture( uNoise, vWPos.xz * 6.0 + 3.0 ).a * 0.4;
          diffuseColor.rgb = meadowColor( vWPos.xz, gn ) * ( 0.95 + 0.5 * ( tuft - 0.5 ) );
        }`
      );
  };
  return material;
}
