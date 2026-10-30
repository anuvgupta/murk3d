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
      float sky = step( 0.9999995, d );
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
    uMoon: { value: 0 },
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
    uUnderwater: { value: 0 },
    uContrast: { value: 1.0 },
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
    uniform float uMoon;
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
    uniform float uUnderwater;
    uniform float uContrast;
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
      bool isSky = depth >= 0.9999995;

      // ---- Aerial perspective.
      vec3 wp = worldPosition( vUv, min( depth, 0.9999995 ) );
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
            vec2 q = sp.xz - uWindDir * uWindTravel * 0.35; // banks creep, they don't race
            float bank = texture2D( uNoise, q * 0.004 + vec2( 0.0, uTime * 0.002 ) ).r;
            float wisp = texture2D( uNoise, q * 0.02 + vec2( uTime * 0.01, 0.0 ) ).g;
            float dens = max( smoothstep( 0.35, 0.75, bank * 0.7 + wisp * 0.45 ), uMistFill * ( 0.7 + 0.3 * bank ) ) * hgt;
            mist += dens * ( 1.0 - exp( -dist * 0.5 * t * 0.02 ) );
          }
          mist = uGroundMist * clamp( mist / 3.0, 0.0, 1.0 );
        }
        fog = clamp( fog + mist, 0.0, 0.97 );
        // The cloud sea (the Floating Isles): everything below its rolling top
        // is fog by path length, so from an island it is a white floor and
        // from below a ceiling, however the sampling above happened to fall.
        if ( uMistFill > 0.001 ) {
          vec2 seaUv = ( uCameraPos.xz + dir.xz * min( dist, 120.0 ) ) * 0.004;
          float top = uFogHeight + 9.0 + ( texture2D( uNoise, seaUv + vec2( uTime * 0.0015, 0.0 ) ).r - 0.5 ) * 10.0;
          float y0 = uCameraPos.y;
          float y1 = wp.y;
          float below;
          if ( y0 <= top && y1 <= top ) below = dist;
          else if ( y0 > top && y1 > top ) below = 0.0;
          else below = dist * ( y0 > top ? ( 1.0 - ( y0 - top ) / ( y0 - y1 ) ) : ( ( top - y0 ) / ( y1 - y0 ) ) );
          float sea = 1.0 - exp( -below * 0.07 );
          fog = max( fog, uMistFill * sea * 0.98 );
        }
        // Haze takes the sun's colour when looking toward it.
        float toward = pow( max( dot( dir, uSunDir ), 0.0 ), 6.0 );
        vec3 fogCol = mix( uFogColor, uFogSunColor, toward * 0.85 );
        color = mix( color, fogCol, fog );
      }

      // ---- The sun: disc, corona and light shafts.
      if ( uSunVisible > 0.0 ) {
        vec2 delta = ( uSunScreen - vUv );
        vec2 stp = delta / 40.0;
        vec2 p = vUv;
        float illum = 1.0;
        float shaft = 0.0;
        for ( int i = 0; i < 40; i++ ) {
          p += stp;
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
        if ( uMoon > 0.5 ) {
          // The moon: a crisp, slightly irregular limb, dark maria, a few
          // craters with bright rims, and a soft terminator a little short
          // of full so it is never a perfect disc.
          vec2 m = off / uSunRadius;
          float wob = ( texture2D( uNoise, m * 0.9 + 0.37 ).g - 0.5 ) * 0.05;
          float limb = 1.0 - smoothstep( 0.93 + wob, 1.0 + wob, length( m ) );
          float maria = smoothstep( 0.35, 0.75, texture2D( uNoise, m * 0.42 + vec2( 0.21, 0.63 ) ).r );
          vec2 cm = m * 3.3;
          vec2 ci = floor( cm );
          vec2 cf = fract( cm ) - 0.5;
          float ch = fract( sin( dot( ci, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
          vec2 cc = cf - ( vec2( fract( ch * 7.0 ), fract( ch * 13.0 ) ) - 0.5 ) * 0.5;
          float cr = 0.12 + 0.2 * fract( ch * 3.3 );
          float crater = step( 0.45, ch ) * ( 1.0 - smoothstep( cr * 0.8, cr, length( cc ) ) );
          float rim = step( 0.45, ch ) * smoothstep( cr * 0.7, cr * 0.95, length( cc ) ) * ( 1.0 - smoothstep( cr, cr * 1.25, length( cc ) ) );
          float terminator = smoothstep( -0.25, 0.2, dot( m, vec2( 0.86, 0.5 ) ) + 0.72 );
          float shade = ( 1.0 - 0.38 * maria ) * ( 1.0 - 0.35 * crater ) * ( 1.0 + 0.25 * rim );
          shade *= mix( 0.08, 1.0, terminator ) * ( 0.85 + 0.15 * ( 1.0 - length( m ) ) );
          disc = limb * shade * float( isSky );
        }
        // Corona: a bright inner halo and a wide soft skirt.
        float corona = exp( -r * r / ( uSunRadius * uSunRadius * 12.0 ) ) * 0.55 + exp( -r / ( uSunRadius * 14.0 ) ) * 0.45;
        float headroom = 1.0 - smoothstep( 0.6, 1.6, dot( color, vec3( 0.33 ) ) );
        color += uSunColor * disc * uDiscStrength;
        color += uSunColor * corona * uGlowStrength * ( 0.35 + 0.65 * open ) * ( 0.5 + 0.5 * headroom );
        color += uSunColor * shaft * uShaftStrength * ( 0.4 + 0.6 * headroom );
        // Lens glare: looking near the sun, a few faint ghosts along the line
        // through the frame's centre and a thin horizontal streak. Subtle.
        if ( uMoon < 0.5 ) {
          vec2 c = ( uSunScreen - 0.5 ) * vec2( uAspect, 1.0 );
          vec2 pv = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
          float facing = 1.0 - smoothstep( 0.1, 0.55, length( c ) );
          float ghosts = 0.0;
          for ( int i = 0; i < 4; i++ ) {
            float k = float( i ) * 0.55 - 0.75; // positions along the sun->centre axis
            float gr = 0.03 + 0.025 * float( i );
            float gd = length( pv - c * k ) / gr;
            ghosts += ( 1.0 - smoothstep( 0.6, 1.0, gd ) ) * ( 0.5 + 0.5 * smoothstep( 0.0, 0.8, gd ) ) * 0.06;
          }
          float streak = exp( -abs( pv.y - c.y ) * 140.0 ) * exp( -abs( pv.x - c.x ) * 2.2 ) * 0.12;
          color += uSunColor * ( ghosts + streak ) * facing * open * uSunVisible * ( 0.3 + 0.7 * headroom );
        }
      }

      // ---- Grade.
      // Contrast about mid grey (scene-linear), then saturation.
      color = max( ( color - 0.18 ) * uContrast + 0.18, 0.0 );
      float lum = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
      color = mix( vec3( lum ), color, uSaturation );
      color += uLift * ( 1.0 - smoothstep( 0.0, 0.5, lum ) );
      vec2 v = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
      color *= 1.0 - uVignette * smoothstep( 0.45, 1.1, length( v ) );
      // Under the surface: murky green-blue, nothing far visible.
      if ( uUnderwater > 0.0 ) {
        float uw = 1.0 - exp( -dist * 0.09 );
        color = mix( color * vec3( 0.55, 0.8, 0.8 ), vec3( 0.06, 0.2, 0.2 ), uUnderwater * max( uw, 0.35 ) );
      }

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
  update({ sunDir, sunColor, sunVisible, fogColor, fogSunColor, fogDensity, fogHeight, fogFalloff, groundMist, mistFill, shaft, glow, disc, moon, saturation, lift, vignette, underwater, contrast }, wind, noise, time) {
    const u = this.material.uniforms;
    if (wind) {
      u.uWindDir.value.copy(wind.direction);
      u.uWindTravel.value = wind.travel;
      u.uTime.value = time;
    }
    if (noise) u.uNoise.value = noise;
    u.uDiscStrength.value = disc;
    u.uMoon.value = moon || 0;
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
    u.uUnderwater.value = underwater || 0;
    u.uContrast.value = contrast || 1;

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
