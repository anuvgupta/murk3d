import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';
import { TERRAIN_HEIGHT_GLSL } from './Terrain.js';
import { GROUND_GLSL } from './groundShading.js';
import { WIND_GLSL } from './Wind.js';
import { settings } from '../core/settings.js';

// GPU grass that covers the whole landscape around the player.
//
// The ground around the camera is divided into square tiles. Every tile draws
// the same instanced blade layout, offset to its world position, so blades
// are stable in the world as you move. Everything else is done in the vertex
// shader: ground height (from the terrain height texture), where grass may
// grow (ground mask), colour (shared meadow colours), height patches, wind and
// the player pushing blades aside.
//
// Distance LOD: blades carry a random rank sorted ascending. A tile at
// distance d draws only the first N·f(d) instances, and the shader fades out
// blades whose rank exceeds f at their own distance while widening the rest,
// so density falls off smoothly with no popping. Distant tiles use a cheaper
// single-triangle blade.

const TILE = 16;

function bladeGeometry(segments) {
  // x in [-0.5, 0.5] across the blade, y in [0, 1] along it; tip is a point.
  const positions = [];
  const indices = [];
  for (let i = 0; i < segments; i++) {
    const y = i / segments;
    positions.push(-0.5, y, 0, 0.5, y, 0);
  }
  positions.push(0, 1, 0);
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const top = (segments - 1) * 2;
  indices.push(top, top + 1, top + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(positions.map(() => 1), 3));
  g.setIndex(indices);
  return g;
}

export class Grass {
  constructor({ terrain, mask, noise, wind, sun }) {
    this.group = new THREE.Group();
    this.group.name = 'grass';

    const density = settings.grassDensity; // blades per m² at full density
    this.radius = settings.grassDrawDistance;
    this.fullRadius = settings.grassFullDetail;
    this.perTile = Math.round(TILE * TILE * density);

    // Per-blade data: offset in the tile, rank (sorted ascending) and a random.
    const random = mulberry32(17);
    const side = Math.ceil(Math.sqrt(this.perTile));
    const blades = [];
    for (let i = 0; i < this.perTile; i++) {
      // Stratified jitter keeps coverage even.
      const cx = i % side;
      const cz = Math.floor(i / side);
      blades.push([((cx + random()) / side) * TILE, ((cz + random()) / side) * TILE, random(), random()]);
    }
    blades.sort((a, b) => a[2] - b[2]);
    const bladeData = new Float32Array(this.perTile * 4);
    blades.forEach((b, i) => bladeData.set(b, i * 4));
    this.ranks = blades.map((b) => b[2]);
    const bladeAttr = new THREE.InstancedBufferAttribute(bladeData, 4);

    this.geometries = [bladeGeometry(4), bladeGeometry(1)];
    for (const g of this.geometries) g.setAttribute('aBlade', bladeAttr);

    // InstancedMesh needs an instance matrix; one identity buffer is shared by every tile.
    const identity = new Float32Array(this.perTile * 16);
    for (let i = 0; i < this.perTile; i++) {
      identity[i * 16] = identity[i * 16 + 5] = identity[i * 16 + 10] = identity[i * 16 + 15] = 1;
    }
    this.instanceMatrix = new THREE.InstancedBufferAttribute(identity, 16);

    this.uniforms = {
      uHeightMap: { value: terrain.heightTexture },
      uMask: { value: mask },
      uNoise: { value: noise },
      uPlayer: { value: new THREE.Vector3(1e5, 0, 1e5) },
      uFullRadius: { value: this.fullRadius },
      uRadius: { value: this.radius },
      uSunDir: { value: sun.direction },
      uSunColor: { value: sun.color },
      ...wind.uniforms,
    };
    this.material = this.createMaterial();

    // A fixed set of tile slots around the camera, nearest first.
    this.slots = [];
    const reach = Math.ceil(this.radius / TILE) + 1;
    for (let tz = -reach; tz <= reach; tz++) {
      for (let tx = -reach; tx <= reach; tx++) {
        const nearest = Math.max(0, Math.hypot(tx, tz) - 1) * TILE;
        if (nearest > this.radius) continue;
        // Constructed with count 1 so it doesn't allocate its own matrix buffer.
        const mesh = new THREE.InstancedMesh(this.geometries[0], this.material, 1);
        mesh.instanceMatrix = this.instanceMatrix;
        mesh.count = this.perTile;
        mesh.frustumCulled = true;
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(TILE / 2, 0, TILE / 2), TILE * 0.72 + 10);
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
        this.slots.push({ mesh, dx: tx, dz: tz });
      }
    }
    this.terrain = terrain;
    this.centerTile = { x: NaN, z: NaN };
  }

  // Fraction of blades kept at distance d (mirrors the shader).
  keep(d) {
    if (d <= this.fullRadius) return 1;
    return Math.max(0.03, (this.fullRadius * this.fullRadius) / (d * d));
  }

  countFor(f) {
    // Ranks are sorted, so binary-search the first rank above f.
    let lo = 0;
    let hi = this.ranks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.ranks[mid] < f) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  update(camera, playerPos) {
    this.uniforms.uPlayer.value.copy(playerPos);
    const cam = camera.position;
    const ctx = Math.floor(cam.x / TILE);
    const ctz = Math.floor(cam.z / TILE);
    const moved = ctx !== this.centerTile.x || ctz !== this.centerTile.z;
    this.centerTile.x = ctx;
    this.centerTile.z = ctz;

    for (const slot of this.slots) {
      const mesh = slot.mesh;
      const tx = ctx + slot.dx;
      const tz = ctz + slot.dz;
      const x0 = tx * TILE;
      const z0 = tz * TILE;
      if (moved) {
        const y = this.terrain.heightAt(x0 + TILE / 2, z0 + TILE / 2);
        mesh.position.set(x0, y, z0);
        mesh.updateMatrix();
        mesh.matrixWorld.copy(mesh.matrix);
      }
      // Distance from the camera to the nearest point of the tile.
      const nx = Math.max(x0 - cam.x, 0, cam.x - (x0 + TILE));
      const nz = Math.max(z0 - cam.z, 0, cam.z - (z0 + TILE));
      const d = Math.hypot(nx, nz);
      if (d > this.radius) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.count = Math.max(1, this.countFor(this.keep(d) * 1.02));
      mesh.geometry = d < this.fullRadius * 1.6 ? this.geometries[0] : this.geometries[1];
    }
  }

  createMaterial() {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const uniforms = this.uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uHeightMap;
          uniform vec3 uPlayer;
          uniform float uFullRadius;
          uniform float uRadius;
          uniform vec3 uSunDir;
          attribute vec4 aBlade;
          varying float vTrans;
          ${GROUND_GLSL}
          ${TERRAIN_HEIGHT_GLSL}
          ${WIND_GLSL}`
        )
        .replace(
          '#include <beginnormal_vertex>',
          `
          // ---- Per-blade setup (shared by the normal and position code below).
          vec3 tileOrigin = modelMatrix[ 3 ].xyz;
          vec2 root = tileOrigin.xz + aBlade.xy;
          // Tiles repeat the same layout, so derive per-blade randoms from world position too.
          float wr = fract( sin( dot( root, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
          float wr2 = fract( wr * 31.17 + aBlade.w );
          float ground = terrainHeight( root );
          vec4 gmask = texture( uMask, maskUv( root ) );
          vec4 gn = groundNoise( root );

          float dist = length( root - cameraPosition.xz );
          float keep = dist <= uFullRadius ? 1.0 : max( 0.03, uFullRadius * uFullRadius / ( dist * dist ) );
          float thin = clamp( ( keep - aBlade.z ) / ( 0.25 * keep ), 0.0, 1.0 );
          float fade = 1.0 - smoothstep( uRadius * 0.75, uRadius, dist );
          float widen = clamp( inversesqrt( keep ), 1.0, 4.0 );

          // Tall lush patches, shorter dry patches, short at the verges.
          float density = smoothstep( 0.15, 0.9, gmask.r );
          float tall = 0.55 + 0.75 * smoothstep( 0.3, 0.8, gn.y ) - 0.25 * smoothstep( 0.6, 0.9, 1.0 - gn.x );
          float bladeH = ( 0.34 + 0.46 * wr ) * tall * density * thin * fade;
          float bladeW = ( 0.05 + 0.04 * wr2 ) * widen * step( 0.02, bladeH );

          float yaw = wr2 * 6.2832;
          vec2 facing = vec2( cos( yaw ), sin( yaw ) );
          vec2 across = vec2( -facing.y, facing.x );

          // Wind: lean downwind with gust fronts, plus a sway.
          float w = windAt( root );
          float sway = sin( uTime * ( 1.6 + wr * 0.8 ) + dot( root, uWindDir ) * 0.35 - uWindTravel * 0.4 + wr * 6.0 );
          vec2 bend = uWindDir * ( w * 0.65 + sway * ( 0.08 + 0.18 * w ) );
          bend += facing * ( 0.12 + 0.25 * wr2 ); // natural curve
          // Part around the player's feet.
          vec2 away = root - uPlayer.xz;
          float pd = length( away );
          float push = ( 1.0 - smoothstep( 0.25, 1.4, pd ) ) * step( abs( ground - uPlayer.y ), 1.5 );
          bend += ( away / max( pd, 0.001 ) ) * push * 1.4;

          vec3 objectNormal = normalize( vec3( facing.x * 0.3 + bend.x * 0.2, 1.0, facing.y * 0.3 + bend.y * 0.2 ) );
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3( tangent.xyz );
          #endif`
        )
        .replace(
          '#include <begin_vertex>',
          `float hy = position.y;
          float h2 = hy * hy;
          vec3 world = vec3( root.x, ground - 0.03, root.y );
          world.xz += across * position.x * bladeW * ( 1.0 - hy * 0.9 );
          float blen = min( length( bend ), 1.5 );
          world.xz += bend * h2 * bladeH;
          world.y += hy * bladeH * ( 1.0 - 0.45 * blen * h2 );
          vec3 transformed = world - tileOrigin;
          // Light through the blade when looking toward the sun.
          vec3 viewDir = normalize( world - cameraPosition );
          vTrans = pow( max( dot( viewDir, uSunDir ), 0.0 ), 5.0 ) * hy * 0.6;
          // Colour (color_vertex runs earlier in this shader, so set vColor here).
          vec3 base = meadowColor( root, gn );
          vec3 tipTint = mix( base * vec3( 1.25, 1.3, 0.95 ), vec3( 0.42, 0.45, 0.16 ), 0.15 + 0.2 * wr );
          vColor.rgb = mix( base * 0.45, tipTint, smoothstep( 0.0, 1.0, hy ) ) * ( 0.9 + 0.2 * wr2 );`
        )
        ;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 uSunColor;
          varying float vTrans;`
        )
        // Light both faces the same way; a flipped normal would turn back faces black.
        .replace(
          '#include <normal_fragment_begin>',
          THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')
        )
        .replace(
          '#include <opaque_fragment>',
          `outgoingLight += diffuseColor.rgb * uSunColor * vTrans;
          #include <opaque_fragment>`
        );
    };
    return material;
  }
}
