import * as THREE from 'three';
import { regionUniforms, GROUND_GLSL } from './groundShading.js';
import { ROCK_GLSL } from './rockShading.js';

// MeshStandardMaterial whose albedo is computed per pixel from world position:
// meadow, dirt roads, cobbles, river beds, rock and snow. No tiled textures, so
// nothing looks blocky up close or repeats at a distance.
export function createTerrainMaterial({ noise, mask }) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uMask = { value: mask };
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
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNormal;
        float rockAmtOut;
        float rockHOut;
        float rockDetail;
        ${GROUND_GLSL}
        ${ROCK_GLSL}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wet;
        vec3 wn = normalize( vWNormal );
        vec3 ground = groundColor( vWPos, wn, wet );
        // Cliffs and steep ground get the detailed rock shading.
        vec3 tw = triWeights( wn );
        float detail = 1.0 - smoothstep( 12.0, 70.0, length( vViewPosition ) );
        rockDetail = detail;
        rockHOut = rockHeight( vWPos, tw, detail );
        rockAmtOut = smoothstep( 0.42, 0.58, 1.0 - wn.y + ( texture( uNoise, vWPos.xz * 0.05 ).b - 0.5 ) * 0.1 );
        ground = mix( ground, rockAlbedo( vWPos, wn, tw, rockHOut ), rockAmtOut );
        diffuseColor.rgb *= ground;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, 0.55, wet );`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = bumpNormal( -vViewPosition, normal, rockHOut, 1.4 * rockAmtOut * ( 0.4 + 0.6 * rockDetail ) );
        if ( rockAmtOut > 0.01 ) {
          vec3 wn2 = macroNormal( vWPos, normalize( vWNormal ), 9.0 * rockAmtOut );
          vec3 vn2 = normalize( ( viewMatrix * vec4( wn2, 0.0 ) ).xyz );
          normal = normalize( mix( normal, vn2, 0.75 ) );
        }`
      );
  };
  return material;
}
