// Three cloud styles for the sky dome, swapped into the Sky shader in place of
// its stock cloud block. All are 2D noise on a cloud plane, lit by the sky's
// own radiance, so they cost nothing beyond the sky's one draw.
//
//   realistic  two layers of cumulus with cauliflower edges, sun-lit tops,
//              shaded undersides and silver linings
//   ghibli     tall flat-bottomed cumulus built from a few hard-edged lobes,
//              bright lit faces and a single soft shadow tone
//   painterly  brushed cirrus streaks and soft banks, like a painted backdrop

export const CLOUD_STYLES = ['realistic', 'ghibli', 'painterly'];

export function readCloudStyle() {
  const q = new URLSearchParams(location.search).get('clouds');
  if (CLOUD_STYLES.includes(q)) return q;
  try {
    const saved = localStorage.getItem('murk.clouds');
    if (CLOUD_STYLES.includes(saved)) return saved;
  } catch {
    // storage blocked
  }
  return 'realistic';
}

export function saveCloudStyle(style) {
  try {
    localStorage.setItem('murk.clouds', style);
  } catch {
    // storage blocked
  }
}

// Helpers shared by all styles. Needs the Sky shader's noise()/fbm().
const COMMON = /* glsl */ `
  // Worley-ish billow: distance to jittered cell centres gives cauliflower lobes.
  float billow( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    float d = 8.0;
    for ( int y = -1; y <= 1; y++ ) {
      for ( int x = -1; x <= 1; x++ ) {
        vec2 g = vec2( float( x ), float( y ) );
        vec2 o = fract( sin( vec2( dot( i + g, vec2( 127.1, 311.7 ) ), dot( i + g, vec2( 269.5, 183.3 ) ) ) ) * 43758.5453 );
        vec2 r = g + o - f;
        d = min( d, dot( r, r ) );
      }
    }
    return 1.0 - sqrt( d );
  }
`;

// Lighting shared by the styles: a cloud's colour from its density, the
// density toward the sun (self-shadowing), its edge and the viewing angle.
const LIGHTING = /* glsl */ `
  // Light a cloud sample. dens: 0..1 opacity here; shadow: 0..1 how much
  // denser cloud lies toward the sun; edge: 0..1 near the rim.
  vec3 cloudLight( float dens, float shadow, float edge, vec3 sunCol, vec3 skyAmb, float cosTheta, float dayFactor ) {
    float silver = clamp( 0.51 / pow( 1.49 - cosTheta * 1.4, 1.5 ), 0.0, 3.0 );
    // Lit tops are warm white; bellies take the sky's blue-grey.
    float lit = clamp( 1.0 - shadow * 1.6, 0.0, 1.0 );
    vec3 top = skyAmb * 0.9 + sunCol * 1.25;
    vec3 belly = skyAmb * 1.25 + sunCol * 0.28;
    vec3 c = mix( belly, top, lit );
    c += sunCol * silver * edge * 0.7;
    return c * max( dayFactor, 0.03 );
  }
`;

const STYLES = {
  realistic: /* glsl */ `
    if ( direction.y > 0.0 && cloudCoverage > 0.0 ) {
      float dayFactor = smoothstep( -0.08, 0.3, vSunDirection.y );
      vec3 sunCol = vSunE * Fex * 0.22 * 0.04;
      vec3 skyAmb = Lin * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
      float horizonFade = smoothstep( 0.0, 0.08, direction.y );
      vec2 toSun = vSunDirection.xz * 0.06;
      // Two decks: broken cumulus below, a thinner higher layer above.
      for ( int layer = 0; layer < 2; layer++ ) {
        float elev = layer == 0 ? 0.45 : 0.22;
        vec2 uv = direction.xz / ( direction.y * elev ) * cloudScale * 1000.0;
        uv += time * cloudSpeed * ( layer == 0 ? 900.0 : 1500.0 ) + float( layer ) * 37.0;
        float evolve = time * cloudSpeed * 300.0;
        float region = noise( uv * 0.12 + 5.0 ) * 0.5 + 0.5;
        float cov = clamp( cloudCoverage * ( layer == 0 ? 1.0 : 0.55 ) + ( region - 0.5 ) * 0.8, 0.0, 1.0 );
        float th = 1.0 - cov;
        // Base shape eroded by cauliflower billows.
        float base = fbm( uv * 0.5, evolve ) * 0.5 + 0.5;
        float lobes = billow( uv * 2.2 ) * 0.55 + billow( uv * 5.5 + 3.0 ) * 0.3 + billow( uv * 12.0 ) * 0.15;
        float field = base * 0.7 + lobes * 0.45;
        float depth = max( 0.0, field - th );
        float dens = 1.0 - exp( -depth * ( layer == 0 ? 16.0 : 9.0 ) * cloudDensity );
        // Self-shadow: how much denser the cloud is toward the sun.
        vec2 uvS = uv - toSun;
        float fieldS = ( fbm( uvS * 0.5, evolve ) * 0.5 + 0.5 ) * 0.7 + ( billow( uvS * 2.2 ) * 0.55 + billow( uvS * 5.5 + 3.0 ) * 0.3 + billow( uvS * 12.0 ) * 0.15 ) * 0.45;
        float shadow = clamp( ( fieldS - field ) * 3.0 + depth * 1.5, 0.0, 1.0 );
        // Low on the sky we see the bellies, high up the tops.
        shadow = mix( shadow + 0.35, shadow, smoothstep( 0.05, 0.5, direction.y ) );
        float edge = dens * ( 1.0 - dens ) * 4.0;
        vec3 cloudColor = cloudLight( dens, shadow, edge, sunCol, skyAmb, cosTheta, dayFactor );
        float alpha = dens * horizonFade;
        texColor -= L0 * 0.04 * alpha;
        vec3 aerial = mix( texColor, cloudColor, Fex );
        texColor = mix( texColor, aerial, alpha );
      }
    }
  `,
  ghibli: /* glsl */ `
    if ( direction.y > 0.0 && cloudCoverage > 0.0 ) {
      float dayFactor = smoothstep( -0.08, 0.3, vSunDirection.y );
      vec3 sunCol = vSunE * Fex * 0.22 * 0.04;
      vec3 skyAmb = Lin * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
      float horizonFade = smoothstep( 0.0, 0.06, direction.y );
      vec2 uv = direction.xz / ( direction.y * 0.5 ) * cloudScale * 700.0;
      uv += time * cloudSpeed * 500.0;
      float evolve = time * cloudSpeed * 120.0;
      // Towers: big round lobes stacked into masses.
      float region = noise( uv * 0.1 ) * 0.5 + 0.5;
      float cov = clamp( cloudCoverage * 1.15 + ( region - 0.5 ) * 0.8, 0.0, 1.0 );
      float th = 1.0 - cov;
      float body = fbm( uv * 0.35, evolve ) * 0.5 + 0.5;          // where clouds are
      float big = billow( uv * 0.9 + evolve * 0.3 );
      float mid = billow( uv * 2.2 - evolve * 0.2 + 7.0 );
      float shape = body * 0.5 + big * 0.38 + mid * 0.22;
      float field = shape;
      float dens = smoothstep( th, th + 0.05, field );
      // Cel shading: a lit face toward the sun, a mid tone, a shadow tone.
      vec2 toSun = vSunDirection.xz * 0.07;
      float fieldS = ( fbm( ( uv - toSun ) * 0.35, evolve ) * 0.5 + 0.5 ) * 0.5 + billow( ( uv - toSun ) * 0.9 + evolve * 0.3 ) * 0.38 + billow( ( uv - toSun ) * 2.2 - evolve * 0.2 + 7.0 ) * 0.22;
      float grad = ( fieldS - field ) * 10.0;
      float tone = grad < -0.15 ? 1.0 : ( grad < 0.25 ? 0.72 : 0.5 );
      // Undersides darker toward the horizon.
      tone *= mix( 0.8, 1.0, smoothstep( 0.05, 0.4, direction.y ) );
      vec3 lit = skyAmb * 0.8 + sunCol * 1.35;
      vec3 shade = skyAmb * 1.3 + sunCol * 0.3;
      vec3 cloudColor = mix( shade, lit, tone ) * max( dayFactor, 0.03 );
      // A thin bright rim toward the sun.
      float rim = dens * ( 1.0 - smoothstep( th, th + 0.12, field ) );
      cloudColor += sunCol * rim * 0.8 * max( dayFactor, 0.03 );
      float alpha = dens * horizonFade * clamp( cloudDensity * 2.4, 0.0, 1.0 );
      texColor -= L0 * 0.04 * alpha;
      vec3 aerial = mix( texColor, cloudColor, Fex );
      texColor = mix( texColor, aerial, alpha );
    }
  `,
  painterly: /* glsl */ `
    if ( direction.y > 0.0 && cloudCoverage > 0.0 ) {
      float dayFactor = smoothstep( -0.08, 0.3, vSunDirection.y );
      vec3 sunCol = vSunE * Fex * 0.22 * 0.04;
      vec3 skyAmb = Lin * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
      float horizonFade = smoothstep( 0.0, 0.06, direction.y );
      float evolve = time * cloudSpeed * 200.0;
      vec2 toSun = vSunDirection.xz * 0.06;
      // Soft banks, brushed: low-contrast masses with feathered edges.
      vec2 uvLo = direction.xz / ( direction.y * 0.5 ) * cloudScale * 1000.0;
      uvLo += time * cloudSpeed * 800.0;
      float region = noise( uvLo * 0.12 ) * 0.5 + 0.5;
      float cov = clamp( cloudCoverage + ( region - 0.5 ) * 0.6, 0.0, 1.0 );
      float th = 1.0 - cov;
      float bank = fbm( uvLo * 0.45, evolve ) * 0.5 + 0.5;
      float brush = fbm( vec2( uvLo.x * 1.4, uvLo.y * 0.6 ) * 1.6 + 9.0, evolve ) * 0.5 + 0.5;
      float field = bank * 0.7 + brush * 0.4;
      float depth = max( 0.0, field - th );
      float dens = smoothstep( 0.0, 0.22, depth );
      float fieldS = ( fbm( ( uvLo - toSun ) * 0.45, evolve ) * 0.5 + 0.5 ) * 0.7 + ( fbm( vec2( ( uvLo.x - toSun.x ) * 1.4, ( uvLo.y - toSun.y ) * 0.6 ) * 1.6 + 9.0, evolve ) * 0.5 + 0.5 ) * 0.4;
      float shadow = clamp( ( fieldS - field ) * 2.5 + depth * 0.8, 0.0, 1.0 ) * 0.7;
      float edge = dens * ( 1.0 - dens ) * 3.0;
      vec3 bankColor = cloudLight( dens, shadow, edge, sunCol, skyAmb, cosTheta, dayFactor );
      // Warm the whole bank slightly, like a glaze.
      bankColor *= vec3( 1.04, 1.0, 0.95 );
      float aBank = dens * horizonFade * clamp( cloudDensity * 2.2, 0.0, 0.95 );
      texColor -= L0 * 0.04 * aBank;
      texColor = mix( texColor, mix( texColor, bankColor, Fex ), aBank );
      // High cirrus: short brush strokes across the wind, sparse.
      vec2 uvHi = direction.xz / ( direction.y * 0.18 ) * cloudScale * 1000.0;
      uvHi += time * cloudSpeed * 2000.0;
      vec2 st = vec2( uvHi.x * 0.7, uvHi.y * 1.8 );
      float streak = fbm( st * 1.2, evolve ) * 0.5 + 0.5;
      float breakup = noise( uvHi * 0.5 + 4.0 ) * 0.5 + 0.5;
      float cirrus = smoothstep( 0.6, 0.8, streak ) * smoothstep( 0.45, 0.7, breakup ) * 0.4;
      vec3 cirrusColor = ( skyAmb * 1.2 + sunCol * 1.0 ) * max( dayFactor, 0.03 );
      texColor = mix( texColor, mix( texColor, cirrusColor, Fex ), cirrus * horizonFade );
    }
  `,
};

// Replace the stock cloud block in a Sky fragment shader with the given style.
export function applyCloudStyle(fragmentShader, style) {
  const start = fragmentShader.indexOf('// Clouds');
  const end = fragmentShader.indexOf('gl_FragColor = vec4( texColor, 1.0 );');
  if (start < 0 || end < 0) return fragmentShader;
  const body = STYLES[style] || STYLES.realistic;
  let out = fragmentShader.slice(0, start) + '// Clouds (' + style + ')\n' + body + '\n' + fragmentShader.slice(end);
  // Helpers go after the Sky's fbm().
  out = out.replace('const float pi = 3.141592653589793238462643383279502884197169;', COMMON + LIGHTING + '\n\t\tconst float pi = 3.141592653589793238462643383279502884197169;');
  return out;
}
