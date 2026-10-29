import * as THREE from 'three';
import { GROUND_GLSL } from './groundShading.js';

// MeshStandardMaterial whose albedo is computed per pixel from world position:
// meadow, dirt roads, cobbles, river beds, rock and snow. No tiled textures, so
// nothing looks blocky up close or repeats at a distance.
export function createTerrainMaterial({ noise, mask }) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uMask = { value: mask };

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
        ${GROUND_GLSL}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wet;
        diffuseColor.rgb *= groundColor( vWPos, normalize( vWNormal ), wet );`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, 0.55, wet );`
      );
  };
  return material;
}
