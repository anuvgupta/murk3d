import * as THREE from 'three';
import { RIVER, LAKES } from './plan.js';
import { WIND_GLSL } from './Wind.js';
import { createWaterNormalTexture } from '../util/noiseTexture.js';

// River and lake surfaces.
//
// The river is a ribbon mesh following the carved channel at the computed
// water level; the lake is a polar mesh at its level. Both share one shader:
// two layers of scrolling wavelet normals moving with the current (or
// drifting with the wind on the lake), a fast wind chop that strengthens under
// gust fronts, small vertex swells, colour and opacity from water depth, shore
// and rapids foam, and sky reflections from the environment map with a
// Fresnel falloff. No extra render passes.

const ACROSS = 14; // vertices across the river
const RIVER_OVERLAP = 1.2; // metres the ribbon extends into each bank

export class Water {
  constructor({ terrain, noise, wind }) {
    this.group = new THREE.Group();
    this.group.name = 'water';
    this.terrain = terrain;

    this.uniforms = {
      uNoise: { value: noise },
      uWaterNormals: { value: createWaterNormalTexture() },
      ...wind.uniforms,
    };
    this.material = this.createMaterial();

    const river = new THREE.Mesh(this.buildRiver(), this.material);
    river.name = 'river';
    river.receiveShadow = true;
    this.group.add(river);
    for (const L of LAKES) {
      const lake = new THREE.Mesh(this.buildLake(L), this.material);
      lake.name = 'lake';
      lake.receiveShadow = true;
      this.group.add(lake);
    }
  }

  buildRiver() {
    const p = RIVER.path;
    const positions = [];
    const uvs = [];
    const flow = [];
    const depth = [];
    const indices = [];
    let rows = 0;
    // Stop a little short of the lake so the two surfaces don't overlap.
    const end = p.length - 6;
    for (let i = 0; i < p.count; i++) {
      if (p.s[i] > end) break;
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(p.count - 1, i + 1);
      const tx = p.x[i1] - p.x[i0];
      const tz = p.z[i1] - p.z[i0];
      const len = Math.hypot(tx, tz) || 1;
      const dx = tx / len;
      const dz = tz / len;
      const nx = -dz;
      const nz = dx;
      const level = RIVER.levels[i];
      const slope = Math.max(0, RIVER.levels[i0] - RIVER.levels[i1]) / (p.s[i1] - p.s[i0] || 1);
      const speed = 0.7 + Math.min(3.5, slope * 140);
      const half = RIVER.widthAt(p.s[i]) / 2 + RIVER_OVERLAP;
      for (let k = 0; k < ACROSS; k++) {
        const a = (k / (ACROSS - 1)) * 2 - 1;
        const x = p.x[i] + nx * a * half;
        const z = p.z[i] + nz * a * half;
        positions.push(x, level, z);
        uvs.push(a * half, p.s[i]);
        flow.push(dx, dz, speed);
        depth.push(level - this.terrain.heightAt(x, z));
      }
      rows++;
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let k = 0; k < ACROSS - 1; k++) {
        const a = r * ACROSS + k;
        const b = a + 1;
        const c = a + ACROSS;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
    return this.finish(positions, uvs, flow, depth, indices);
  }

  buildLake(LAKE) {
    const positions = [];
    const uvs = [];
    const flow = [];
    const depth = [];
    const indices = [];
    const sectors = 120;
    const rings = 28;
    // Centre vertex, then rings that crowd toward the shore.
    positions.push(LAKE.x, LAKE.level, LAKE.z);
    uvs.push(LAKE.x, LAKE.z);
    flow.push(0, 0, 0);
    depth.push(LAKE.level - this.terrain.heightAt(LAKE.x, LAKE.z));
    for (let ring = 1; ring <= rings; ring++) {
      const t = Math.sqrt(ring / rings);
      for (let k = 0; k < sectors; k++) {
        const a = (k / sectors) * Math.PI * 2;
        const r = (LAKE.radiusAt(a) + 4) * t;
        const x = LAKE.x + Math.cos(a) * r;
        const z = LAKE.z + Math.sin(a) * r;
        positions.push(x, LAKE.level, z);
        uvs.push(x, z);
        flow.push(0, 0, 0);
        depth.push(LAKE.level - this.terrain.heightAt(x, z));
      }
    }
    for (let k = 0; k < sectors; k++) {
      indices.push(0, 1 + ((k + 1) % sectors), 1 + k);
    }
    for (let ring = 1; ring < rings; ring++) {
      const base = 1 + (ring - 1) * sectors;
      const next = base + sectors;
      for (let k = 0; k < sectors; k++) {
        const k1 = (k + 1) % sectors;
        indices.push(base + k, base + k1, next + k, base + k1, next + k1, next + k);
      }
    }
    return this.finish(positions, uvs, flow, depth, indices);
  }

  finish(positions, uvs, flow, depth, indices) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3));
    g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    g.setIndex(indices);
    g.computeBoundingSphere();
    return g;
  }

  createMaterial() {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.06,
      metalness: 0,
      transparent: true,
      envMapIntensity: 1.6,
    });
    const uniforms = this.uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uNoise;
          ${WIND_GLSL}
          attribute vec3 aFlow;
          attribute float aDepth;
          varying vec3 vWPos;
          varying vec3 vFlow;
          varying float vDepth;
          varying vec2 vWaterUv;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec3 wp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
          // Gentle swells, a little livelier in the wind.
          float swell = sin( dot( wp.xz, vec2( 0.31, 0.17 ) ) + uTime * 1.3 )
                      + 0.6 * sin( dot( wp.xz, vec2( -0.21, 0.37 ) ) + uTime * 1.9 );
          transformed.y += swell * ( 0.015 + 0.03 * uWindStrength ) * smoothstep( 0.0, 0.6, aDepth );
          vWPos = wp;
          vFlow = aFlow;
          vDepth = aDepth;
          vWaterUv = uv;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uNoise;
          uniform sampler2D uWaterNormals;
          ${WIND_GLSL}
          varying vec3 vWPos;
          varying vec3 vFlow;
          varying float vDepth;
          varying vec2 vWaterUv;
          float waterFoam;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float depth = max( vDepth, 0.0 );
          vec3 shallow = vec3( 0.12, 0.2, 0.15 );
          vec3 deep = vec3( 0.02, 0.05, 0.05 );
          vec3 waterCol = mix( shallow, deep, smoothstep( 0.1, 3.5, depth ) );

          // Foam: a broken band along the shore, and streaks in fast water.
          vec2 fdir = vFlow.z > 0.01 ? vFlow.xy : uWindDir;
          float fspeed = vFlow.z > 0.01 ? vFlow.z : 0.1;
          float fn = texture( uNoise, vWPos.xz * 0.35 - fdir * uTime * fspeed * 0.35 ).a;
          float fn2 = texture( uNoise, vWPos.xz * 0.9 - fdir * uTime * fspeed * 0.6 ).b;
          float shore = 1.0 - smoothstep( 0.0, 0.45, depth );
          float rapids = smoothstep( 1.6, 3.2, vFlow.z );
          waterFoam = clamp( smoothstep( 0.45, 0.75, fn * 0.6 + fn2 * 0.5 + shore * 0.45 ) * ( shore + rapids ), 0.0, 1.0 );

          diffuseColor.rgb = mix( waterCol, vec3( 0.82, 0.86, 0.85 ), waterFoam );
          // Clear in the shallows, opaque in the deep; fade out at the very edge.
          diffuseColor.a = mix( 0.45, 0.94, smoothstep( 0.0, 2.2, depth ) );
          diffuseColor.a = max( diffuseColor.a, waterFoam * 0.9 );
          diffuseColor.a *= smoothstep( -0.03, 0.12, vDepth );`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix( 0.05, 0.6, waterFoam );`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            // Axes: along the current for the river, along the wind for the lake.
            bool isRiver = vFlow.z > 0.01;
            vec2 along = isRiver ? vFlow.xy : uWindDir;
            vec2 across = vec2( -along.y, along.x );
            vec2 q = isRiver ? vec2( vWaterUv.x, vWaterUv.y ) : vec2( dot( vWaterUv, across ), dot( vWaterUv, along ) );
            float spd = isRiver ? vFlow.z : 0.12 + 0.45 * uWindStrength;
            float t = uTime;
            vec3 n1 = texture( uWaterNormals, q * vec2( 0.09, 0.06 ) - vec2( 0.0, t * spd * 0.06 ) ).xyz * 2.0 - 1.0;
            vec3 n2 = texture( uWaterNormals, q * vec2( 0.21, 0.17 ) + vec2( 0.37, -t * spd * 0.19 ) ).xyz * 2.0 - 1.0;
            // Fast wind chop, strongest under gust fronts.
            float gust = windAt( vWPos.xz );
            vec3 n3 = texture( uWaterNormals, vWPos.xz * 0.55 - uWindDir * t * 0.8 ).xyz * 2.0 - 1.0;
            vec2 slope = n1.xy * 0.55 + n2.xy * 0.35 + n3.xy * ( 0.08 + 0.45 * gust );
            // Lakes lie flatter than running water.
            slope *= isRiver ? 1.0 : 0.3 + 0.25 * uWindStrength;
            slope *= mix( 1.0, 0.25, waterFoam );
            vec3 worldN = normalize( vec3( 0.0, 1.0, 0.0 )
              + vec3( across.x, 0.0, across.y ) * slope.x
              + vec3( along.x, 0.0, along.y ) * slope.y );
            normal = normalize( ( viewMatrix * vec4( worldN, 0.0 ) ).xyz );
          }`
        )
        .replace(
          '#include <opaque_fragment>',
          `// Glancing views reflect more and see less of the bed.
          float fres = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) * -1.0 ) ), 5.0 );
          diffuseColor.a = mix( diffuseColor.a, 1.0, fres * 0.7 * smoothstep( -0.03, 0.12, vDepth ) );
          #include <opaque_fragment>`
        );
    };
    return material;
  }
}
