import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';
import { TERRAIN_HEIGHT_GLSL } from './Terrain.js';
import { regionUniforms, GROUND_GLSL } from './groundShading.js';
import { WIND_GLSL } from './Wind.js';
import { settings } from '../core/settings.js';

// GPU grass that covers the whole landscape around the player.
//
// The ground around the camera is divided into square tiles. Every tile draws
// the same instanced blade layout, offset to its world position, so blades
// are stable in the world as you move. Everything else happens in the vertex
// shader: ground height (terrain height texture), where grass may grow
// (ground mask), colour, tuft shape, wind and the player pushing blades aside.
//
// Blades grow in tufts: a few blades round a shared centre, sharing a lean
// direction and height, which gives the field structure instead of an even
// stubble. Each blade is a thin tapered strip bent along a curve, dark at the
// occluded base and pale at the tip, with a specular sheen and translucency
// when backlit, so a field reads as soft and grassy rather than spiky.
//
// Distance LOD: blades carry a random rank sorted ascending. A tile at
// distance d draws only the first N·keep(d) instances, and the shader fades
// blades whose rank exceeds keep at their own distance while widening the
// rest, so density falls off smoothly with no popping. Far tiles use a
// two-segment blade.

const TILE = 16;
const BLADES_PER_TUFT = 5;
const TUFT_RADIUS = 0.14;

function bladeGeometry(segments) {
  // x in [-0.5, 0.5] across the blade, y in [0, 1] along it, ending in a tip.
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
    this.radiusScale = 1; // the adaptive stepper shrinks this on slow machines
    const tufts = Math.round((TILE * TILE * density) / BLADES_PER_TUFT);
    this.perTile = tufts * BLADES_PER_TUFT;

    // Per-blade data: offset in the tile, rank (sorted ascending), tuft random.
    const random = mulberry32(17);
    const side = Math.ceil(Math.sqrt(tufts));
    const blades = [];
    for (let i = 0; i < tufts; i++) {
      const cx = ((i % side) + random()) / side;
      const cz = (Math.floor(i / side) + random()) / side;
      const tuftRand = random();
      for (let b = 0; b < BLADES_PER_TUFT; b++) {
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(random()) * TUFT_RADIUS;
        blades.push([cx * TILE + Math.cos(a) * r, cz * TILE + Math.sin(a) * r, random(), tuftRand]);
      }
    }
    blades.sort((a, b) => a[2] - b[2]);
    const bladeData = new Float32Array(this.perTile * 4);
    blades.forEach((b, i) => bladeData.set(b, i * 4));
    this.ranks = blades.map((b) => b[2]);
    const bladeAttr = new THREE.InstancedBufferAttribute(bladeData, 4);

    this.geometries = [bladeGeometry(3), bladeGeometry(2), bladeGeometry(1)];
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
      ...regionUniforms(),
      uNoise: { value: noise },
      uPlayer: { value: new THREE.Vector3(1e5, 0, 1e5) },
      uFullRadius: { value: this.fullRadius },
      uRadius: { value: this.radius },
      uSunDir: { value: sun.direction },
      uSunColor: { value: sun.color },
      // Raised turf discs (the floating islands): x, z, radius, top height.
      uDiscs: { value: Array.from({ length: 6 }, () => new THREE.Vector4(1e6, 1e6, 0, 0)) },
      ...wind.uniforms,
    };
    this.material = this.createMaterial();

    // A fixed set of tile slots around the camera.
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
    const k = this.fullRadius / d;
    return Math.max(0.02, k * k * k);
  }

  countFor(f) {
    let lo = 0;
    let hi = this.ranks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.ranks[mid] < f) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // Tell the grass about raised turf discs it should grow on.
  setDiscs(discs) {
    this.discs = discs.slice(0, 6);
    const u = this.uniforms.uDiscs.value;
    for (let i = 0; i < u.length; i++) {
      const d = discs[i];
      if (d) u[i].set(d.x, d.z, d.r, d.y);
      else u[i].set(1e6, 1e6, 0, 0);
    }
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
      const x0 = (ctx + slot.dx) * TILE;
      const z0 = (ctz + slot.dz) * TILE;
      if (moved) {
        const y = this.terrain.heightAt(x0 + TILE / 2, z0 + TILE / 2);
        mesh.position.set(x0, y, z0);
        // A tile under a floating island also holds the blades on its top,
        // far above the ground: grow the culling sphere to take them in.
        let top = y;
        if (this.discs) {
          for (const d of this.discs) {
            const cx = Math.max(x0, Math.min(d.x, x0 + TILE));
            const cz = Math.max(z0, Math.min(d.z, z0 + TILE));
            if (Math.hypot(d.x - cx, d.z - cz) < d.r && d.y > top) top = d.y;
          }
        }
        mesh.boundingSphere.center.y = (top - y) / 2;
        mesh.boundingSphere.radius = TILE * 0.72 + 10 + (top - y) / 2;
        mesh.updateMatrix();
        mesh.matrixWorld.copy(mesh.matrix);
      }
      const nx = Math.max(x0 - cam.x, 0, cam.x - (x0 + TILE));
      const nz = Math.max(z0 - cam.z, 0, cam.z - (z0 + TILE));
      const d = Math.hypot(nx, nz);
      if (d > this.radius * this.radiusScale) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      // Draw enough blades for the nearest point of the tile; the shader thins
      // each blade by its own distance, so density is continuous across tiles.
      mesh.count = Math.max(1, this.countFor(this.keep(Math.max(0, d - 2)) * 1.05));
      mesh.geometry = d < this.fullRadius * 1.3 ? this.geometries[0] : d < this.fullRadius * 4 ? this.geometries[1] : this.geometries[2];
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
          uniform vec4 uDiscs[ 6 ];
          attribute vec4 aBlade;
          varying float vTrans;
          varying float vSheen;
          varying float vHeight;
          ${GROUND_GLSL}
          ${TERRAIN_HEIGHT_GLSL}
          ${WIND_GLSL}

          float hash1( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }`
        )
        .replace(
          '#include <beginnormal_vertex>',
          `
          // ---- Per-blade setup (shared by the normal and position code below).
          vec3 tileOrigin = modelMatrix[ 3 ].xyz;
          vec2 root = tileOrigin.xz + aBlade.xy;
          float tr = aBlade.w;                       // tuft random (shared by the tuft)
          float br = hash1( root );                  // per-blade random
          float br2 = fract( br * 31.17 + tr );
          float ground = terrainHeight( root );
          // On a floating island the turf cap is the ground.
          float onDisc = 0.0;
          for ( int i = 0; i < 6; i++ ) {
            if ( distance( root, uDiscs[ i ].xy ) < uDiscs[ i ].z - 0.4 ) { ground = uDiscs[ i ].w + 0.01; onDisc = 1.0; }
          }
          vec4 gmask = texture( uMask, maskUv( root ) );
          vec4 gn = groundNoise( root );

          // Local ground normal (0.6 m span): shades the carpet and culls blades
          // on faces too steep for turf; the baked texel is too coarse for that
          // at a one-cell cliff.
          float hL = terrainHeight( root - vec2( 0.6, 0.0 ) );
          float hR = terrainHeight( root + vec2( 0.6, 0.0 ) );
          float hD = terrainHeight( root - vec2( 0.0, 0.6 ) );
          float hU = terrainHeight( root + vec2( 0.0, 0.6 ) );
          vec3 groundN = onDisc > 0.5 ? vec3( 0.0, 1.0, 0.0 ) : normalize( vec3( hL - hR, 1.2, hD - hU ) );
          float dist = distance( vec3( root.x, ground, root.y ), cameraPosition );
          float kk = uFullRadius / max( dist, uFullRadius );
          float keep = max( 0.02, kk * kk * kk );
          float thin = clamp( ( keep - aBlade.z ) / ( 0.3 * keep ), 0.0, 1.0 );
          float fade = 1.0 - smoothstep( uRadius * 0.7, uRadius, dist );
          float widen = clamp( inversesqrt( keep ), 1.0, 5.0 );

          // Tall lush patches, shorter dry patches, short at the verges.
          float density = onDisc > 0.5 ? 0.9 : smoothstep( 0.12, 0.85, gmask.r );
          // Nothing grows on cliff faces: thin out as the ground steepens.
          // Blades hold on until the ground is steep enough to be bare rock.
          density *= onDisc > 0.5 ? 1.0 : smoothstep( 0.5, 0.68, min( terrainSlope( root ), groundN.y ) );
          float lush = smoothstep( 0.3, 0.8, gn.y );
          {
            // Realm cover: below full cover the sward breaks into patches that
            // follow the lush noise, bare ground showing between them.
            float snowAmt;
            vec4 realm = realmAt( root, snowAmt );
            float cover = smoothstep( 0.88 - realm.a, 1.08 - realm.a, gn.z * 0.55 + gn.y * 0.25 + br * 0.2 );
            density *= mix( cover, 1.0, smoothstep( 0.9, 1.0, realm.a ) );
          }
          float dryPatch = smoothstep( 0.62, 0.9, 1.0 - gn.x );
          float tall = 0.6 + 0.6 * lush - 0.3 * dryPatch;
          float bladeH = ( 0.42 + 0.22 * tr + 0.14 * br ) * tall * density * thin * fade;
          float bladeW = ( 0.016 + 0.008 * br2 ) * widen * step( 0.02, bladeH );

          // Tuft lean: shared direction, per-blade spread; some blades stand, some lie over.
          float tuftYaw = tr * 6.2832 + ( br - 0.5 ) * 2.4;
          vec2 facing = vec2( cos( tuftYaw ), sin( tuftYaw ) );
          vec2 across = vec2( -facing.y, facing.x );
          float leanAmt = 0.12 + 0.22 * br2 * br2;

          // Wind: lean downwind under gust fronts, plus waves rolling across the field.
          float w = windAt( root );
          float wave = sin( dot( root, uWindDir ) * 0.22 - uWindTravel * 0.9 + tr * 2.0 ) * 0.5 + 0.5;
          float flutter = sin( uTime * ( 2.2 + br * 1.5 ) + br * 6.28 + dot( root, uWindDir ) * 0.6 ) * 0.5;
          vec2 bend = facing * leanAmt;
          bend += uWindDir * ( w * ( 0.25 + 0.55 * wave ) + flutter * ( 0.03 + 0.1 * w ) );
          // Part around the player's feet.
          vec2 away = root - uPlayer.xz;
          float pd = length( away );
          float push = ( 1.0 - smoothstep( 0.2, 1.3, pd ) ) * step( abs( ground - uPlayer.y ), 1.6 );
          bend += ( away / max( pd, 0.001 ) ) * push * 1.6;
          float blen = min( length( bend ), 1.6 );

          // Blade curve: p(t) = root + up * t * H * (1 - c t^2) + bend * t^2 * H
          float hy0 = position.y;
          float curl = 0.12 + 0.3 * blen;
          vec3 up = vec3( 0.0, 1.0, 0.0 );
          vec3 bend3 = vec3( bend.x, 0.0, bend.y );
          vec3 tangent = up * ( 1.0 - 3.0 * curl * hy0 * hy0 ) + bend3 * ( 2.0 * hy0 );
          vec3 side3 = vec3( across.x, 0.0, across.y );
          vec3 bladeN = normalize( cross( side3, tangent ) );
          if ( dot( bladeN, up ) < 0.0 ) bladeN = -bladeN;
          // The field shades like a soft carpet: mostly the ground's own normal,
          // a little blade shape, and a curl across the blade so it isn't a flat strip.
          vec3 objectNormal = normalize( mix( bladeN, groundN, 0.62 ) + side3 * ( position.x * 0.35 ) );
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3( tangent.xyz );
          #endif`
        )
        .replace(
          '#include <begin_vertex>',
          `float hy = position.y;
          // Width tapers to a rounded tip.
          // Width: nearly constant, tapering only near the tip.
          float wprof = 1.0 - smoothstep( 0.55, 1.0, hy ) * 0.9;
          // Wildflowers: in the lusher sweeps a few blades carry a coloured
          // head, a little taller than the sward around them.
          float flowerPatch = smoothstep( 0.56, 0.74, texture( uNoise, root * 0.045 + 0.61 ).r );
          float isFlower = step( br2, 0.045 * flowerPatch ) * step( 0.45, density );
          wprof = mix( wprof, 0.35 + 3.4 * smoothstep( 0.74, 0.87, hy ) * ( 1.0 - 0.55 * smoothstep( 0.94, 1.0, hy ) ), isFlower );
          bladeH *= 1.0 + 0.3 * isFlower;
          vec3 world = vec3( root.x, ground - 0.02, root.y );
          world += up * ( hy * bladeH * ( 1.0 - curl * hy * hy ) );
          world += bend3 * ( hy * hy * bladeH );
          world.xz += across * ( position.x * bladeW * wprof );
          vec3 transformed = world - tileOrigin;
          vHeight = hy;

          // Sun through the blade when looking toward the sun; sheen on the tips.
          vec3 viewDir = normalize( world - cameraPosition );
          vTrans = pow( max( dot( viewDir, uSunDir ), 0.0 ), 6.0 ) * hy * hy;
          vec3 halfV = normalize( uSunDir - viewDir );
          vec3 wn = normalize( mix( bladeN, groundN, 0.5 ) );
          vSheen = pow( max( dot( wn, halfV ), 0.0 ), 30.0 ) * hy * hy;

          // Colour: dark occluded base to a pale, slightly yellow tip; some straw.
          vec3 base = meadowColor( root, gn );
          float dry = step( 0.985 - dryPatch * 0.25, br ) * density;
          vec3 tip = mix( base * vec3( 1.08, 1.1, 0.92 ), vec3( 0.62, 0.72, 0.4 ), 0.18 + 0.16 * br2 );
          // Each tuft a little lighter or darker; roots in shadow.
          float tuftTone = 0.78 + 0.3 * tr;
          vec3 rootCol = base * 0.38;
          vec3 col = mix( rootCol, tip * tuftTone, smoothstep( 0.0, 0.9, hy ) );
          col = mix( col, mix( vec3( 0.25, 0.2, 0.08 ), vec3( 0.62, 0.52, 0.28 ), hy ), dry );
          {
            float fh = fract( br * 7.31 + tr * 3.7 );
            vec3 fcol = fh < 0.3 ? vec3( 0.95, 0.93, 0.86 ) : fh < 0.55 ? vec3( 0.98, 0.82, 0.22 ) : fh < 0.8 ? vec3( 0.62, 0.42, 0.9 ) : vec3( 0.95, 0.5, 0.62 );
            col = mix( col, fcol, isFlower * smoothstep( 0.8, 0.88, hy ) );
          }
          vColor.rgb = col * ( 0.96 + 0.08 * br ) * realmGrassTint( root );
          // Olive rather than lime: ease the saturation toward a warm grey.
          { float gl = dot( vColor.rgb, vec3( 0.3, 0.59, 0.11 ) ); vColor.rgb = mix( vColor.rgb, vec3( gl ) * vec3( 1.06, 1.0, 0.8 ), 0.15 ); }`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 uSunColor;
          varying float vTrans;
          varying float vSheen;
          varying float vHeight;`
        )
        // Light both faces the same way; a flipped normal would turn back faces black.
        .replace(
          '#include <normal_fragment_begin>',
          THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')
        )
        .replace(
          '#include <opaque_fragment>',
          `outgoingLight += uSunColor * ( diffuseColor.rgb * vTrans * 0.7 + vec3( 0.9, 0.92, 0.7 ) * vSheen * 0.05 );
          #include <opaque_fragment>`
        );
    };
    return material;
  }
}
