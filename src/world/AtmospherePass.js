import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Atmosphere and grade, in one screen pass after the scene renders:
//
//   1. Aerial perspective: distance and height fog from the depth buffer,
//      coloured by the sky (bluish away from the sun, warm toward it), so far
//      hills soften into haze the way the references do.
//   2. Sun glow and light shafts: a radial blur of an occlusion mask (sky
//      pixels that are near the sun) toward the sun's screen position, which
//      gives crepuscular rays through trees and a soft halo round the sun.
//   3. Grade: slight warm lift of the shadows, a little saturation, a soft
//      vignette, so the image reads as film rather than raw render.
//
// Everything here is cheap: one full-screen fragment with a 40-tap radial
// loop at half resolution for the shafts.

const occlusionShader = {
  uniforms: {
    tDepth: { value: null },
    uSunScreen: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVisible: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4( position.xy, 0.0, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDepth;
    uniform vec2 uSunScreen;
    uniform float uSunVisible;
    uniform float uAspect;
    varying vec2 vUv;
    void main() {
      float d = texture2D( tDepth, vUv ).r;
      float sky = step( 0.9999, d );
      vec2 off = ( vUv - uSunScreen ) * vec2( uAspect, 1.0 );
      float r = length( off );
      // A soft disc round the sun; only sky counts, so trees and hills cut shafts.
      float disc = smoothstep( 0.22, 0.0, r );
      gl_FragColor = vec4( vec3( disc * sky * uSunVisible ), 1.0 );
    }
  `,
};

const compositeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tOcclusion: { value: null },
    uSunScreen: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVisible: { value: 0 },
    uSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
    uShaftStrength: { value: 0 },
    uGlowStrength: { value: 0 },
    uDiscStrength: { value: 0 },
    uSunRadius: { value: 0.016 },
    uAspect: { value: 1 },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 1000 },
    uInvProjection: { value: new THREE.Matrix4() },
    uCameraWorld: { value: new THREE.Matrix4() },
    uCameraPos: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uFogColor: { value: new THREE.Color(0.7, 0.75, 0.8) },
    uFogSunColor: { value: new THREE.Color(1, 0.85, 0.65) },
    uFogDensity: { value: 0.0012 },
    uFogHeight: { value: 0.0 },
    uFogFalloff: { value: 0.02 },
    uGroundMist: { value: 0 },
    uMistFill: { value: 0 },
    uNoise: { value: null },
    uWindDir: { value: new THREE.Vector2(1, 0) },
    uWindTravel: { value: 0 },
    uTime: { value: 0 },
    uSaturation: { value: 1.08 },
    uLift: { value: new THREE.Color(0.02, 0.015, 0.01) },
    uVignette: { value: 0.25 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4( position.xy, 0.0, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tOcclusion;
    uniform vec2 uSunScreen;
    uniform float uSunVisible;
    uniform vec3 uSunColor;
    uniform float uShaftStrength;
    uniform float uGlowStrength;
    uniform float uDiscStrength;
    uniform float uSunRadius;
    uniform float uAspect;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform mat4 uInvProjection;
    uniform mat4 uCameraWorld;
    uniform vec3 uCameraPos;
    uniform vec3 uSunDir;
    uniform vec3 uFogColor;
    uniform vec3 uFogSunColor;
    uniform float uFogDensity;
    uniform float uFogHeight;
    uniform float uFogFalloff;
    uniform float uGroundMist;
    uniform float uMistFill;
    uniform sampler2D uNoise;
    uniform vec2 uWindDir;
    uniform float uWindTravel;
    uniform float uTime;
    uniform float uSaturation;
    uniform vec3 uLift;
    uniform float uVignette;
    varying vec2 vUv;

    vec3 worldPosition( vec2 uv, float depth ) {
      vec4 clip = vec4( uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0 );
      vec4 view = uInvProjection * clip;
      view /= view.w;
      return ( uCameraWorld * view ).xyz;
    }

    void main() {
      vec4 src = texture2D( tDiffuse, vUv );
      vec3 color = src.rgb;
      float depth = texture2D( tDepth, vUv ).r;
      bool isSky = depth > 0.9999;

      // ---- Aerial perspective.
      vec3 wp = worldPosition( vUv, min( depth, 0.9999 ) );
      vec3 ray = wp - uCameraPos;
      float dist = length( ray );
      vec3 dir = ray / max( dist, 1e-4 );
      if ( !isSky ) {
        // Height fog: denser below uFogHeight, integrated along the ray.
        float f = uFogFalloff;
        float h0 = uCameraPos.y - uFogHeight;
        float h1 = wp.y - uFogHeight;
        float dy = h1 - h0;
        float integral = abs( dy ) > 0.01
          ? ( exp( -f * h0 ) - exp( -f * h1 ) ) / ( f * dy )
          : exp( -f * h0 );
        // Mostly distance haze, a little thicker in the low ground: high
        // peaks must not come out crisp while the slopes beneath them vanish.
        float density = uFogDensity * ( 0.7 + 0.3 * clamp( integral, 0.0, 3.0 ) );
        float fog = 1.0 - exp( -density * dist );
        fog = min( fog, 0.82 );
        // Low-lying mist pools in hollows and drifts downwind as banks and
        // wisps: sampled at a few points along the ray so it has shape.
        float mist = 0.0;
        if ( uGroundMist > 0.001 ) {
          float mistTop = uFogHeight + 9.0;
          for ( int i = 1; i <= 6; i++ ) {
            float t = float( i ) / 6.0;
            vec3 sp = uCameraPos + ray * ( t * t );
            float hgt = 1.0 - smoothstep( uFogHeight - 4.0, mistTop, sp.y );
            vec2 q = sp.xz - uWindDir * uWindTravel * 2.2;
            float bank = texture2D( uNoise, q * 0.004 + vec2( 0.0, uTime * 0.002 ) ).r;
            float wisp = texture2D( uNoise, q * 0.02 + vec2( uTime * 0.01, 0.0 ) ).g;
            float dens = max( smoothstep( 0.35, 0.75, bank * 0.7 + wisp * 0.45 ), uMistFill * ( 0.7 + 0.3 * bank ) ) * hgt;
            mist += dens * ( 1.0 - exp( -dist * 0.5 * t * 0.02 ) );
          }
          mist = uGroundMist * clamp( mist / 3.0, 0.0, 1.0 );
        }
        fog = clamp( fog + mist, 0.0, 0.97 );
        // Haze takes the sun's colour when looking toward it.
        float toward = pow( max( dot( dir, uSunDir ), 0.0 ), 6.0 );
        vec3 fogCol = mix( uFogColor, uFogSunColor, toward * 0.85 );
        color = mix( color, fogCol, fog );
      }

      // ---- The sun: disc, corona and light shafts.
      if ( uSunVisible > 0.0 ) {
        vec2 delta = ( uSunScreen - vUv );
        vec2 step = delta / 40.0;
        vec2 p = vUv;
        float illum = 1.0;
        float shaft = 0.0;
        for ( int i = 0; i < 40; i++ ) {
          p += step;
          shaft += texture2D( tOcclusion, p ).r * illum;
          illum *= 0.96;
        }
        shaft /= 40.0;
        vec2 off = ( vUv - uSunScreen ) * vec2( uAspect, 1.0 );
        float r = length( off );
        // How much of the sun's neighbourhood is open sky (a mountain in front dims the halo).
        float open = 0.0;
        for ( int i = 0; i < 8; i++ ) {
          float a = float( i ) * 0.7854;
          open += texture2D( tOcclusion, uSunScreen + vec2( cos( a ) / uAspect, sin( a ) ) * uSunRadius * 1.5 ).r;
        }
        open = max( open / 8.0, texture2D( tOcclusion, uSunScreen ).r );
        // Disc: white-hot core with a soft limb, only where the sky shows.
        float disc = smoothstep( uSunRadius * 1.15, uSunRadius * 0.75, r ) * float( isSky );
        // Corona: a bright inner halo and a wide soft skirt.
        float corona = exp( -r * r / ( uSunRadius * uSunRadius * 12.0 ) ) * 0.55 + exp( -r / ( uSunRadius * 14.0 ) ) * 0.45;
        float headroom = 1.0 - smoothstep( 0.6, 1.6, dot( color, vec3( 0.33 ) ) );
        color += uSunColor * disc * uDiscStrength;
        color += uSunColor * corona * uGlowStrength * ( 0.35 + 0.65 * open ) * ( 0.5 + 0.5 * headroom );
        color += uSunColor * shaft * uShaftStrength * ( 0.4 + 0.6 * headroom );
      }

      // ---- Grade.
      float lum = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
      color = mix( vec3( lum ), color, uSaturation );
      color += uLift * ( 1.0 - smoothstep( 0.0, 0.5, lum ) );
      vec2 v = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
      color *= 1.0 - uVignette * smoothstep( 0.45, 1.1, length( v ) );

      if ( any( isnan( color ) ) || any( isinf( color ) ) ) color = vec3( 0.0 );
      gl_FragColor = vec4( max( color, vec3( 0.0 ) ), src.a );
    }
  `,
};

export class AtmospherePass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.occlusionMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(occlusionShader.uniforms),
      vertexShader: occlusionShader.vertexShader,
      fragmentShader: occlusionShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(compositeShader.uniforms),
      vertexShader: compositeShader.vertexShader,
      fragmentShader: compositeShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
    this.occlusionQuad = new FullScreenQuad(this.occlusionMaterial);
    this.occlusionTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.occlusionTarget.texture.minFilter = THREE.LinearFilter;
    this.sunScreen = new THREE.Vector2();
    this._v = new THREE.Vector3();
    this.depthTexture = null;
  }

  setSize(width, height) {
    this.occlusionTarget.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
    this.material.uniforms.uAspect.value = width / height;
    this.occlusionMaterial.uniforms.uAspect.value = width / height;
  }

  // Called by the game each frame with the current lighting state.
  update({ sunDir, sunColor, sunVisible, fogColor, fogSunColor, fogDensity, fogHeight, fogFalloff, groundMist, mistFill, shaft, glow, disc, saturation, lift, vignette }, wind, noise, time) {
    const u = this.material.uniforms;
    if (wind) {
      u.uWindDir.value.copy(wind.direction);
      u.uWindTravel.value = wind.travel;
      u.uTime.value = time;
    }
    if (noise) u.uNoise.value = noise;
    u.uDiscStrength.value = disc;
    // Angular radius of the drawn sun, in screen height units.
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    u.uSunRadius.value = Math.tan(THREE.MathUtils.degToRad(1.3)) / Math.tan(halfFov) * 0.5;
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(sunColor);
    u.uFogColor.value.copy(fogColor);
    u.uFogSunColor.value.copy(fogSunColor);
    u.uFogDensity.value = fogDensity;
    u.uFogHeight.value = fogHeight;
    u.uFogFalloff.value = fogFalloff;
    u.uGroundMist.value = groundMist;
    u.uMistFill.value = mistFill || 0;
    u.uShaftStrength.value = shaft;
    u.uGlowStrength.value = glow;
    u.uSaturation.value = saturation;
    u.uLift.value.copy(lift);
    u.uVignette.value = vignette;

    // Sun's screen position; shafts only when it's in front of the camera.
    // The camera has usually moved since the last render, so refresh its matrices.
    const cam = this.camera;
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const p = this._v.copy(sunDir).multiplyScalar(1000).add(cam.position).project(cam);
    const inFront = this._v.z < 1;
    this.sunScreen.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    const onScreen = inFront && this.sunScreen.x > -0.5 && this.sunScreen.x < 1.5 && this.sunScreen.y > -0.5 && this.sunScreen.y < 1.5;
    // Fade the sun terms out as the disc leaves the frame.
    const margin = Math.max(0, Math.max(-this.sunScreen.x, this.sunScreen.x - 1, -this.sunScreen.y, this.sunScreen.y - 1));
    const vis = onScreen ? sunVisible * Math.max(0, 1 - margin / 0.35) : 0;
    u.uSunScreen.value.copy(this.sunScreen);
    u.uSunVisible.value = vis;
    this.occlusionMaterial.uniforms.uSunScreen.value.copy(this.sunScreen);
    this.occlusionMaterial.uniforms.uSunVisible.value = vis;
  }

  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera;
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.uCameraNear.value = cam.near;
    u.uCameraFar.value = cam.far;
    u.uInvProjection.value.copy(cam.projectionMatrixInverse);
    u.uCameraWorld.value.copy(cam.matrixWorld);
    u.uCameraPos.value.copy(cam.position);

    if (u.uSunVisible.value > 0) {
      this.occlusionMaterial.uniforms.tDepth.value = readBuffer.depthTexture;
      renderer.setRenderTarget(this.occlusionTarget);
      this.occlusionQuad.render(renderer);
    }
    u.tOcclusion.value = this.occlusionTarget.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.occlusionMaterial.dispose();
    this.fsQuad.dispose();
    this.occlusionQuad.dispose();
    this.occlusionTarget.dispose();
  }
}
