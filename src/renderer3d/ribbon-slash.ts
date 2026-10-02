//물금 실시간 VFX 물결 베기 (SPEC-005 §15.1·§15.2). 곡선 띠 메시 + 셰이더 + 물방울 점으로 원본 S1 물결 베기를 그리고, 꼬리부터 지운다
//질감 방식(§15.2): 받은 효과 레이어 띠 텍스처를 그대로 입히고, 흐름·머리 섬광·빛 번짐·반짝임·흩어짐을 옵션으로 얹는다
//절차 방식(§15.1): 텍스처가 없을 때 셰이더로 그린다
//계산은 src/render/ribbon-slash.ts 가 하고, 여기는 three.js 메시와 uniform 만 맡는다 (렌더링 어댑터)
//몸통은 일반 알파 혼합, 흰 심·거품 빛만 가산 혼합. 블룸·흔들림은 없다

import * as THREE from 'three';
import {
  arcLengthPoints,
  dropletLayout,
  pickSprayTexels,
  innerWidthAt,
  outerWidthAt,
  slashDuration,
  slashSample,
  type RibbonOptions,
  type RibbonSlashConfig,
} from '../render/ribbon-slash.js';

//한 번에 살아 있을 수 있는 수. 넘으면 가장 오래된 것을 취소한다 (준비물 성능 예산)
const MAX_ACTIVE = 4;

//띠 정점 셰이더. u·호에서 거리(H, + 바깥 · − 안쪽)·그 자리 안쪽/바깥 두께를 넘긴다
const RIBBON_VERTEX = /* glsl */ `
attribute float aDist;
attribute float aInner;
attribute float aOuter;
varying float vU;
varying float vDist;
varying float vInner;
varying float vOuter;
void main() {
  vU = uv.x;
  vDist = aDist;
  vInner = aInner;
  vOuter = aOuter;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

//띠 조각 셰이더. uGlowPass 0 = 몸통(일반 혼합), 1 = 빛(가산). 노이즈·가닥 지연은 시간 항이 없다 (TS staticNoise·strandLag 와 같은 식)
const RIBBON_FRAGMENT = /* glsl */ `
uniform float uHead;
uniform float uTail;
uniform float uFeather;
uniform float uNoiseAmp;
uniform float uStrandLag;
uniform float uThin;
uniform float uSeed;
uniform float uWaveCount;
uniform float uWaveBase;
uniform float uWaveLean;
uniform float uWaveFoam;
uniform float uCoreW;
uniform float uGlowPass;
uniform float uGlowOpacity;
uniform vec3 uDeep;
uniform vec3 uBody;
uniform vec3 uBright;
uniform vec3 uLight;
uniform vec3 uFoam;
uniform vec3 uCore;
varying float vU;
varying float vDist;
varying float vInner;
varying float vOuter;

float cellNoise(float x, float y) {
  float s = sin(x * 12.9898 + y * 78.233 + uSeed * 0.618) * 43758.5453;
  return fract(s) * 2.0 - 1.0;
}

float staticNoise(float u, float v) {
  float x = u * 48.0;
  float y = floor(v * 6.0);
  float i = floor(x);
  float f = x - i;
  return mix(cellNoise(i, y), cellNoise(i + 1.0, y), f);
}

float strandLag(float depth) {
  float band = floor(clamp(depth, 0.0, 1.0) * 11.0);
  return fract(sin(band * 91.7 + uSeed * 1.3) * 43758.5453) * uStrandLag;
}

//겹 물결 하나의 마루 높이 (안쪽 깊이 0~1 기준). 톱니 마루가 꼬리 쪽으로 기울고, 칸마다 높이가 다르다
float crestHeight(float u, float depth, float count, float scale, float phase) {
  //깊이의 제곱으로 기울여 마루 끝이 갈고리처럼 휜다
  float cell = u * count + depth * depth * uWaveLean * 1.6 + phase + staticNoise(u * 0.3, phase) * 0.12;
  float f = fract(cell);
  float h = fract(sin(floor(cell) * 37.719 + phase * 11.3 + uSeed) * 43758.5453);
  return scale * mix(uWaveBase, 1.0, pow(1.0 - f, 2.2)) * (0.75 + 0.25 * h) + staticNoise(u * 0.9, phase + 0.5) * 0.02;
}

void main() {
  bool inner = vDist < 0.0;
  float depth = inner ? clamp(-vDist / max(vInner, 1e-4), 0.0, 1.0) : 0.0;
  float outerT = inner ? 0.0 : clamp(vDist / max(vOuter, 1e-4), 0.0, 1.0);

  //물줄기 결: 호를 따라 흐르는 가는 줄 (TS streakAt 과 같은 식)
  float streak = 0.5 + 0.5 * sin(depth * 46.0 + vU * 18.0 + staticNoise(vU * 0.5, depth) * 6.0);
  //소멸: 노이즈·가닥 지연으로 흔든 u 가 tail 을 넘은 곳만 남는다. 줄결이 아닌 곳은 먼저 지워져 가닥이 남는다
  float shaken = vU + staticNoise(vU, depth) * uNoiseAmp + strandLag(depth) - uThin * (1.0 - streak * streak);
  float keep = uTail <= 0.0 ? 1.0 : smoothstep(uTail, uTail + uFeather, shaken);
  //전개: head 까지만
  float reveal = uHead >= 1.0 ? 1.0 : 1.0 - smoothstep(uHead - uFeather, uHead, vU);
  float flow = 0.5 + 0.5 * sin(vU * 140.0 + staticNoise(vU * 2.0, depth * 2.0) * 9.0);

  //겹 물결 셋: 뒤(크고 성김) → 앞(작고 촘촘). 앞 겹이 덮는다. 마루 끝은 거품, 마루 아래는 짙은 남, 그 아래 몸통
  float silhouette = 1.0;
  vec3 col = uBright;
  float foamAmt = 0.0;
  if (inner) {
    float h0 = crestHeight(vU, depth, uWaveCount * 0.35, 1.0, 0.0);
    silhouette = 1.0 - smoothstep(h0 - 0.03, h0, depth);
    col = mix(uBright, uBody, smoothstep(0.05, 0.5, depth));
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      //뒤 겹은 크고 성긴 마루, 앞 겹일수록 작고 촘촘하다
      float scale = k == 0 ? 1.0 : (k == 1 ? 0.68 : 0.4);
      float count = k == 0 ? 0.35 : (k == 1 ? 0.8 : 1.6);
      float h = k == 0 ? h0 : crestHeight(vU, depth, uWaveCount * count, scale, fk * 0.37);
      float d = h - depth;
      if (d > 0.0) {
        float foamW = uWaveFoam * scale;
        //마루 바로 아래만 짙은 남, 그 아래는 몸통 파랑 → 호 쪽으로 밝은 파랑
        float under = smoothstep(foamW, foamW + 0.09 * scale, d);
        vec3 layer = mix(uDeep, mix(uBody, uBright, smoothstep(0.15, 0.7, d / scale) * 0.75), under);
        float foamLine = 1.0 - smoothstep(foamW * 0.4, foamW, d);
        layer = mix(layer, uFoam, foamLine * 0.9);
        col = layer;
        foamAmt = max(foamAmt, foamLine);
      }
    }
    col = mix(col, uLight, streak * streak * 0.3 * (1.0 - depth * 0.6));
  } else {
    //바깥 띠: 흰 심에서 밝은 파랑으로 빠르게 옅어진다
    col = mix(uFoam, uBright, smoothstep(0.0, 0.7, outerT));
    silhouette = 1.0 - smoothstep(0.35, 1.0, outerT);
  }
  //흰 심: 호 둘레 얇은 띠, 줄결로 밝기가 흔들린다
  float core = (1.0 - smoothstep(uCoreW * 0.3, uCoreW * 1.3, abs(vDist))) * (0.45 + 0.55 * flow);
  float mask = keep * reveal * silhouette;

  if (uGlowPass < 0.5) {
    col = mix(col, uCore, core);
    gl_FragColor = vec4(col, (inner ? 0.97 : 0.9) * mask);
  } else {
    //빛: 흰 심 번짐 + 마루 거품 + 바깥 하늘색 번짐
    float halo = 1.0 - smoothstep(0.0, uCoreW * 2.5, abs(vDist));
    float light = halo * 0.75 * (0.7 + 0.3 * flow) + foamAmt * 0.5 + (inner ? 0.0 : (1.0 - outerT) * 0.2);
    vec3 glow = mix(uLight, uFoam, halo);
    gl_FragColor = vec4(glow * light * mask * uGlowOpacity, 1.0);
  }
  #include <colorspace_fragment>
}
`;

//물방울 정점 셰이더. 바깥으로 조금 흩어지고, 원근에 맞춰 화면 크기를 정한다
const DROP_VERTEX = /* glsl */ `
attribute vec3 aNormal;
attribute float aU;
attribute float aSize;
attribute float aLag;
attribute float aDrift;
attribute float aAngle;
uniform float uFacing;
uniform float uHead;
uniform float uTail;
uniform float uAgeSec;
uniform float uViewportHalfH;
varying float vAlpha;
varying float vAngle;
void main() {
  //좌우 반전이면 흐름 방향도 거울로
  vAngle = uFacing > 0.0 ? aAngle : 3.14159265 - aAngle;
  vec3 p = position + aNormal * aDrift * uAgeSec;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * projectionMatrix[1][1] * uViewportHalfH / max(0.001, -mv.z);
  float shown = step(aU, uHead);
  //자기 u + lag 를 꼬리가 넘으면 꺼진다. 끝 무렵 짧게 흐려진다
  float left = aU + aLag - uTail;
  vAlpha = shown * clamp(left / 0.025, 0.0, 1.0);
}
`;

//물방울 조각 셰이더. 흰 심 + 파란 테
const DROP_FRAGMENT = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uFoam;
uniform vec3 uBright;
uniform vec3 uDeep;
varying float vAlpha;
varying float vAngle;
void main() {
  if (vAlpha <= 0.0) discard;
  //흐름 방향으로 길쭉한 물방울 (2:1). 화면 y 는 아래가 + 라 각도를 뒤집는다
  vec2 c = gl_PointCoord - 0.5;
  c.y = -c.y;
  float ca = cos(vAngle);
  float sa = sin(vAngle);
  vec2 q = vec2(ca * c.x + sa * c.y, -sa * c.x + ca * c.y);
  q.y *= 2.0;
  float d = length(q) * 2.0;
  if (d > 1.0) discard;
  float spec = 1.0 - smoothstep(0.0, 0.22, length(q - vec2(-0.14, -0.14)));
  vec3 col = mix(uBright, uDeep, smoothstep(0.2, 0.75, d) * 0.6);
  col = mix(col, uFoam, smoothstep(0.75, 0.98, d));
  col = mix(col, uCore, spec);
  gl_FragColor = vec4(col, vAlpha * (1.0 - smoothstep(0.8, 1.0, d)));
  #include <colorspace_fragment>
}
`;

//질감 띠 정점 셰이더. 텍스처 좌표·호 비율 u·호에서 거리(H)
const STRIP_VERTEX = /* glsl */ `
attribute float aU;
attribute float aD;
varying vec2 vUv;
varying float vU;
varying float vD;
void main() {
  vUv = uv;
  vU = aU;
  vD = aD;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

//질감 띠 조각 셰이더 (§15.2). R 밝기 · G 소멸 시각 · B 번짐. uGlowPass 0 = 몸통(일반 혼합), 1 = 빛(가산)
//소멸: E = mix(u, T, w) > tail 인 칸만. 옵션은 색·빛만 더하고 덮임·소멸은 바꾸지 않는다
const STRIP_FRAGMENT = /* glsl */ `
uniform sampler2D uStrip;
uniform float uHead;
uniform float uTail;
uniform float uFeather;
uniform float uErosionW;
uniform float uCovLo;
uniform float uCovSpan;
uniform float uAgeMs;
uniform float uRevealMs;
uniform float uSeed;
uniform float uGlowPass;
uniform float uFlow;
uniform float uFlowSpeed;
uniform float uFlare;
uniform float uFlareMs;
uniform float uGlowOn;
uniform float uGlowOpacity;
uniform float uSparkle;
uniform float uSparkleDensity;
uniform vec3 uGradC[6];
uniform float uGradP[6];
varying vec2 vUv;
varying float vU;
varying float vD;

//밝기 → 원본 팔레트
vec3 gradient(float l) {
  for (int i = 0; i < 5; i++) {
    if (l <= uGradP[i + 1]) return mix(uGradC[i], uGradC[i + 1], clamp((l - uGradP[i]) / max(1e-4, uGradP[i + 1] - uGradP[i]), 0.0, 1.0));
  }
  return uGradC[5];
}

void main() {
  vec3 s = texture2D(uStrip, vUv).rgb;
  float lum = s.r;
  float cov = clamp((lum - uCovLo) / uCovSpan, 0.0, 1.0);
  float e = min(mix(vU, s.g, uErosionW), 0.999);
  float keep = uTail <= 0.0 ? 1.0 : smoothstep(uTail, uTail + uFeather, e);
  float reveal = uHead >= 1.0 ? 1.0 : 1.0 - smoothstep(uHead - uFeather, uHead, vU);
  vec3 light = uGradC[3];
  vec3 foam = uGradC[4];
  vec3 core = uGradC[5];
  if (uGlowPass < 0.5) {
    vec3 col = gradient(lum);
    //흐름: 같은 띠를 u 쪽으로 흘린 밝기를 밝은 쪽에만 더한다
    if (uFlow > 0.5) {
      vec2 fuv = vec2(vUv.x - uAgeMs * uFlowSpeed, vUv.y + sin(vUv.x * 40.0 + uAgeMs * 0.012) * 0.004);
      float l2 = texture2D(uStrip, fuv).r;
      col += light * max(0.0, l2 - 0.35) * 0.55 * cov;
    }
    gl_FragColor = vec4(col, cov * keep * reveal);
  } else {
    vec3 add = vec3(0.0);
    //빛 번짐: B 통로
    if (uGlowOn > 0.5) add += mix(light, foam, s.b) * s.b * uGlowOpacity;
    //반짝임: 밝은 칸 중 고정 자리만 깜빡인다
    if (uSparkle > 0.5 && lum > 0.72) {
      vec2 cell = floor(vUv * vec2(520.0, 170.0));
      float h = fract(sin(dot(cell, vec2(12.9898, 78.233)) + uSeed) * 43758.5453);
      if (h < uSparkleDensity) add += core * pow(0.5 + 0.5 * sin(uAgeMs * 0.03 + h * 97.0), 10.0) * 1.4 * cov;
    }
    add *= keep * reveal;
    //머리 섬광: 진행 끝 자리 호 근처. 전개 뒤 uFlareMs 동안 줄어든다
    if (uFlare > 0.5) {
      float fade = 1.0 - smoothstep(uRevealMs, uRevealMs + uFlareMs, uAgeMs);
      float along = exp(-pow((vU - uHead) / 0.035, 2.0));
      float across = 1.0 - smoothstep(0.0, 0.16, abs(vD));
      add += mix(foam, core, along) * along * across * fade * 1.6 * reveal;
    }
    gl_FragColor = vec4(add, 1.0);
  }
  #include <colorspace_fragment>
}
`;

//흩어짐 물방울 정점 셰이더. 자기 칸이 지워지는 순간부터 uSprayMs 동안 바깥으로 튄다 (TS sprayProgress 와 같은 식)
const SPRAY_VERTEX = /* glsl */ `
attribute vec3 aDir;
attribute float aE;
attribute float aSize;
uniform float uAgeMs;
uniform float uRevealMs;
uniform float uHoldMs;
uniform float uEraseMs;
uniform float uExp;
uniform float uSprayMs;
uniform float uDist;
uniform float uViewportHalfH;
varying float vAlpha;
void main() {
  float start = uRevealMs + uHoldMs + uEraseMs * pow(aE, 1.0 / uExp);
  float p = (uAgeMs - start) / uSprayMs;
  bool on = p >= 0.0 && p < 1.0;
  float q = clamp(p, 0.0, 1.0);
  vAlpha = on ? (1.0 - q) : 0.0;
  vec3 pos = position + aDir * uDist * (1.0 - (1.0 - q) * (1.0 - q));
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = on ? aSize * (1.0 - 0.5 * q) * projectionMatrix[1][1] * uViewportHalfH / max(0.001, -mv.z) : 0.0;
}
`;

//흩어짐 물방울 조각 셰이더. 흰 심 + 하늘색 테
const SPRAY_FRAGMENT = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uLight;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.0) discard;
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  vec3 col = mix(uCore, uLight, smoothstep(0.0, 0.8, d));
  gl_FragColor = vec4(col, vAlpha * (1.0 - smoothstep(0.6, 1.0, d)));
  #include <colorspace_fragment>
}
`;

//질감 방식 재료. image 는 띠 텍스처(그림·캔버스), pixels 는 같은 그림의 RGBA 바이트 (흩어짐 칸 고르기용)
//도메인 테스트가 DOM 없이 이 파일을 읽으므로 그림 형은 three 의 Texture.image 로 둔다
export interface StripSource {
  image: THREE.Texture['image'];
  pixels: ArrayLike<number>;
  width: number;
  height: number;
}

//한 효과를 이루는 조각 하나. role 로 옵션 켜짐을 가른다
interface Part {
  role: 'body' | 'glow' | 'drops' | 'spray';
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  points: boolean;
}

//살아 있는 효과 하나
interface Instance {
  id: number;
  epoch: number;
  group: THREE.Group;
  materials: THREE.ShaderMaterial[];
  age: number;
  resolve: () => void;
}

//생성 결과. done 은 정상 소멸·취소 둘 다에서 끝난다
export interface RibbonHandle {
  id: number;
  done: Promise<void>;
}

export class RibbonSlashEffect {
  //무대(또는 실험 화면)가 장면에 붙인다
  readonly root = new THREE.Group();
  //조각들 (몸통 · 빛 · 물방울 · 흩어짐). 지오메트리·재질 원본은 효과 하나가 같이 쓴다
  private readonly parts: Part[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly instances: Instance[] = [];
  private nextId = 1;
  //clear 할 때마다 오른다. 앞 epoch 의 생성은 무시된다
  private epoch = 0;
  //화면 높이의 절반(장치 px). 물방울 크기 계산에 쓴다
  private viewportHalfH = 400;
  //절차 방식: 빛(가산)·물방울을 켜고 끈다 (실험 화면 토글)
  glowEnabled = true;
  dropletsEnabled = true;
  //질감 방식 화려함 옵션 (§15.2). 실험 화면이 바꾼다
  readonly options: RibbonOptions;
  //질감 방식인지
  readonly textured: boolean;

  //설정과 캐릭터 키(월드)를 받아 공유 지오메트리·재질을 한 번만 만든다. strip 이 있으면 질감 방식
  constructor(
    private readonly config: RibbonSlashConfig,
    characterHeight: number,
    strip: StripSource | null = null,
  ) {
    const o = config.options;
    this.options = {
      flow: o?.flow ?? false,
      flare: o?.flare ?? false,
      glow: o?.glow ?? false,
      sparkle: o?.sparkle ?? false,
      spray: o?.spray ?? false,
      extraDroplets: o?.extraDroplets ?? false,
    };
    this.textured = !!strip && !!config.texture;
    const palette = config.paletteSRGB;
    const color = (hex: string): THREE.Color => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
    const colors = {
      uDeep: { value: color(palette.deep) },
      uBody: { value: color(palette.body) },
      uBright: { value: color(palette.bright) },
      uLight: { value: color(palette.light) },
      uFoam: { value: color(palette.foam) },
      uCore: { value: color(palette.core) },
    };
    const ribbonUniforms = (glow: number) => ({
      uHead: { value: 0 },
      uTail: { value: 0 },
      uFeather: { value: config.erase.edgeFeatherU },
      uNoiseAmp: { value: config.erase.staticNoiseAmplitudeU },
      uStrandLag: { value: config.erase.strandLagU },
      uThin: { value: config.erase.thinU },
      uSeed: { value: config.render.seed },
      uWaveCount: { value: config.waves.count },
      uWaveBase: { value: config.waves.base },
      uWaveLean: { value: config.waves.lean },
      uWaveFoam: { value: config.waves.foam },
      uCoreW: { value: config.path.coreWidthH },
      uGlowPass: { value: glow },
      uGlowOpacity: { value: config.render.glowOpacity },
      ...THREE.UniformsUtils.clone(colors),
    });
    const ribbon = (glow: number, blending: THREE.Blending) =>
      new THREE.ShaderMaterial({
        uniforms: ribbonUniforms(glow),
        vertexShader: RIBBON_VERTEX,
        fragmentShader: RIBBON_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending,
      });
    const dropBase = new THREE.ShaderMaterial({
      uniforms: {
        uHead: { value: 0 },
        uTail: { value: 0 },
        uAgeSec: { value: 0 },
        uViewportHalfH: { value: this.viewportHalfH },
        uFacing: { value: 1 },
        uCore: colors.uCore,
        uFoam: colors.uFoam,
        uBright: colors.uBright,
        uDeep: colors.uDeep,
      },
      vertexShader: DROP_VERTEX,
      fragmentShader: DROP_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const dropGeometry = RibbonSlashEffect.buildDroplets(config, characterHeight);
    if (this.textured && strip && config.texture) {
      this.buildStripParts(strip, characterHeight, colors);
      this.parts.push({ role: 'drops', geometry: dropGeometry, material: dropBase, points: true });
    } else {
      const geometry = RibbonSlashEffect.buildGeometry(config, characterHeight);
      this.parts.push(
        { role: 'body', geometry, material: ribbon(0, THREE.NormalBlending), points: false },
        { role: 'glow', geometry, material: ribbon(1, THREE.AdditiveBlending), points: false },
        { role: 'drops', geometry: dropGeometry, material: dropBase, points: true },
      );
    }
  }

  //질감 방식 조각: 몸통·빛 띠(같은 텍스처) + 흩어짐 물방울
  private buildStripParts(strip: StripSource, H: number, colors: Record<string, { value: THREE.Color }>): void {
    const config = this.config;
    const tex = config.texture as NonNullable<RibbonSlashConfig['texture']>;
    const o = config.options;
    const texture = new THREE.Texture(strip.image);
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    this.textures.push(texture);
    const geometry = RibbonSlashEffect.buildStripGeometry(config, H);
    const palette = config.paletteSRGB;
    const grad = tex.gradient.map(([, name]) => new THREE.Color().setStyle(palette[name], THREE.SRGBColorSpace));
    const gradP = tex.gradient.map(([pos]) => pos);
    const [u0, u1] = tex.uRange;
    const stripUniforms = (glow: number) => ({
      uStrip: { value: texture },
      uHead: { value: 0 },
      uTail: { value: 0 },
      uFeather: { value: config.erase.edgeFeatherU },
      uErosionW: { value: tex.erosionWeight },
      uCovLo: { value: tex.coverage[0] },
      uCovSpan: { value: tex.coverage[1] },
      uAgeMs: { value: 0 },
      uRevealMs: { value: config.timingMs.reveal },
      uSeed: { value: config.render.seed },
      uGlowPass: { value: glow },
      uFlow: { value: 0 },
      //u 단위 속도를 텍스처 가로(ms 당)로
      uFlowSpeed: { value: (o?.flowSpeedU ?? 0) / (u1 - u0) / 1000 },
      uFlare: { value: 0 },
      uFlareMs: { value: o?.flareMs ?? 200 },
      uGlowOn: { value: 0 },
      uGlowOpacity: { value: config.render.glowOpacity },
      uSparkle: { value: 0 },
      uSparkleDensity: { value: o?.sparkleDensity ?? 0 },
      uGradC: { value: grad },
      uGradP: { value: gradP },
    });
    const material = (glow: number, blending: THREE.Blending) =>
      new THREE.ShaderMaterial({
        uniforms: stripUniforms(glow),
        vertexShader: STRIP_VERTEX,
        fragmentShader: STRIP_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending,
      });
    this.parts.push(
      { role: 'body', geometry, material: material(0, THREE.NormalBlending), points: false },
      { role: 'glow', geometry, material: material(1, THREE.AdditiveBlending), points: false },
    );
    //흩어짐: 띠의 밝은 칸 자리에서 바깥 법선 쪽으로
    const texels = pickSprayTexels(config, strip.pixels, strip.width, strip.height);
    const dense = arcLengthPoints(config.path.points, 512);
    const positions: number[] = [];
    const dirs: number[] = [];
    const es: number[] = [];
    const sizes: number[] = [];
    texels.forEach((t, i) => {
      const pt = dense[Math.round(t.u * (dense.length - 1))] as (typeof dense)[number];
      const nx = -pt.tangent[1];
      const ny = pt.tangent[0];
      positions.push((pt.p[0] + nx * t.dH) * H, (pt.p[1] + ny * t.dH) * H, 0.002);
      //바깥 법선 + 진행 반대쪽으로 조금 (씨앗 고정 흔들림)
      const j = Math.sin(i * 12.9898 + config.render.seed) * 0.5;
      dirs.push(nx + pt.tangent[0] * j * 0.6, ny + pt.tangent[1] * j * 0.6, 0);
      es.push(t.e);
      sizes.push((0.012 + 0.02 * (0.5 + 0.5 * Math.sin(i * 78.233))) * H);
    });
    const sprayGeometry = new THREE.BufferGeometry();
    sprayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    sprayGeometry.setAttribute('aDir', new THREE.Float32BufferAttribute(dirs, 3));
    sprayGeometry.setAttribute('aE', new THREE.Float32BufferAttribute(es, 1));
    sprayGeometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    const spray = new THREE.ShaderMaterial({
      uniforms: {
        uAgeMs: { value: 0 },
        uRevealMs: { value: config.timingMs.reveal },
        uHoldMs: { value: config.timingMs.hold },
        uEraseMs: { value: config.timingMs.erase },
        uExp: { value: config.erase.exponent },
        uSprayMs: { value: o?.sprayMs ?? 250 },
        uDist: { value: (o?.sprayDistH ?? 0.1) * H },
        uViewportHalfH: { value: this.viewportHalfH },
        uCore: colors['uCore'] as { value: THREE.Color },
        uLight: colors['uLight'] as { value: THREE.Color },
      },
      vertexShader: SPRAY_VERTEX,
      fragmentShader: SPRAY_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.parts.push({ role: 'spray', geometry: sprayGeometry, material: spray, points: true });
  }

  //질감 띠: (u, 거리) 직사각형. 세로 두 줄(위 = 바깥 끝, 아래 = 안쪽 끝), 텍스처 위 = 바깥 (flipY 기본)
  static buildStripGeometry(config: RibbonSlashConfig, characterHeight: number): THREE.BufferGeometry {
    const tex = config.texture as NonNullable<RibbonSlashConfig['texture']>;
    const [u0, u1] = tex.uRange;
    const [dTop, dBottom] = tex.dRangeH;
    const points = arcLengthPoints(config.path.points, Math.max(128, config.path.segments));
    const H = characterHeight;
    const positions: number[] = [];
    const uvs: number[] = [];
    const us: number[] = [];
    const ds: number[] = [];
    const index: number[] = [];
    points.forEach((pt, i) => {
      const nx = -pt.tangent[1];
      const ny = pt.tangent[0];
      const tu = (pt.u - u0) / (u1 - u0);
      for (const d of [dTop, dBottom]) {
        positions.push((pt.p[0] + nx * d) * H, (pt.p[1] + ny * d) * H, 0);
        uvs.push(tu, d === dTop ? 1 : 0);
        us.push(pt.u);
        ds.push(d);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
    geometry.setAttribute('aD', new THREE.Float32BufferAttribute(ds, 1));
    geometry.setIndex(index);
    return geometry;
  }

  //호 길이 등간격 띠. 정점마다 u, 호에서 거리(H), 그 자리 안쪽·바깥 두께(H). 위치는 발 기준, 캐릭터 키 배
  //진행 방향 왼쪽 법선이 호 바깥(볼록한 쪽)이다
  static buildGeometry(config: RibbonSlashConfig, characterHeight: number): THREE.BufferGeometry {
    const points = arcLengthPoints(config.path.points, config.path.segments);
    const positions: number[] = [];
    const uvs: number[] = [];
    const dist: number[] = [];
    const inners: number[] = [];
    const outers: number[] = [];
    const index: number[] = [];
    points.forEach((pt, i) => {
      const wi = innerWidthAt(config, pt.u);
      const wo = outerWidthAt(config, pt.u);
      const nx = -pt.tangent[1];
      const ny = pt.tangent[0];
      const H = characterHeight;
      positions.push((pt.p[0] - nx * wi) * H, (pt.p[1] - ny * wi) * H, 0, (pt.p[0] + nx * wo) * H, (pt.p[1] + ny * wo) * H, 0);
      uvs.push(pt.u, 0, pt.u, 1);
      dist.push(-wi, wo);
      inners.push(wi, wi);
      outers.push(wo, wo);
      if (i > 0) {
        const a = (i - 1) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
    geometry.setAttribute('aInner', new THREE.Float32BufferAttribute(inners, 1));
    geometry.setAttribute('aOuter', new THREE.Float32BufferAttribute(outers, 1));
    geometry.setIndex(index);
    return geometry;
  }

  //물방울 점. 붙은 u 자리의 호에서 법선으로 offset 만큼, 바깥 물방울은 법선 방향으로 흩어진다
  static buildDroplets(config: RibbonSlashConfig, characterHeight: number): THREE.BufferGeometry {
    const dense = arcLengthPoints(config.path.points, 512);
    const H = characterHeight;
    const drops = dropletLayout(config);
    const positions: number[] = [];
    const normals: number[] = [];
    const us: number[] = [];
    const sizes: number[] = [];
    const lags: number[] = [];
    const drifts: number[] = [];
    const angles: number[] = [];
    for (const d of drops) {
      const pt = dense[Math.round(d.u * (dense.length - 1))] as (typeof dense)[number];
      const nx = -pt.tangent[1];
      const ny = pt.tangent[0];
      positions.push((pt.p[0] + nx * d.offsetH) * H, (pt.p[1] + ny * d.offsetH) * H, 0.001);
      normals.push(nx * H, ny * H, 0);
      us.push(d.u);
      sizes.push(d.sizeH * H);
      lags.push(d.lagU);
      drifts.push(d.driftH);
      angles.push(Math.atan2(pt.tangent[1], pt.tangent[0]));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aNormal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aLag', new THREE.Float32BufferAttribute(lags, 1));
    geometry.setAttribute('aDrift', new THREE.Float32BufferAttribute(drifts, 1));
    geometry.setAttribute('aAngle', new THREE.Float32BufferAttribute(angles, 1));
    return geometry;
  }

  //화면 높이(장치 px)를 알린다. 창 크기가 바뀔 때 부른다
  setViewportHeight(heightPx: number): void {
    this.viewportHalfH = Math.max(1, heightPx) / 2;
    for (const instance of this.instances) {
      for (const m of instance.materials) {
        const v = m.uniforms['uViewportHalfH'] as THREE.IUniform<number> | undefined;
        if (v) v.value = this.viewportHalfH;
      }
    }
  }

  //살아 있는 효과 수
  get activeCount(): number {
    return this.instances.length;
  }

  //효과 하나를 만든다. at: 발 기준점(월드), facing: 1 오른쪽 · -1 왼쪽. 공간만 뒤집고 u 는 그대로
  spawn(at: THREE.Vector3, facing: 1 | -1, renderOrder = 30): RibbonHandle {
    while (this.instances.length >= MAX_ACTIVE) this.finish(this.instances[0] as Instance);
    const group = new THREE.Group();
    group.position.copy(at);
    group.scale.set(facing, 1, 1);
    const materials: THREE.ShaderMaterial[] = [];
    this.parts.forEach((part, i) => {
      const material = part.material.clone();
      //텍스처는 복제하지 않고 같이 쓴다
      const strip = part.material.uniforms['uStrip'];
      if (strip) (material.uniforms['uStrip'] as THREE.IUniform<THREE.Texture>).value = strip.value as THREE.Texture;
      const viewport = material.uniforms['uViewportHalfH'] as THREE.IUniform<number> | undefined;
      if (viewport) viewport.value = this.viewportHalfH;
      const facingU = material.uniforms['uFacing'] as THREE.IUniform<number> | undefined;
      if (facingU) facingU.value = facing;
      const object = part.points ? new THREE.Points(part.geometry, material) : new THREE.Mesh(part.geometry, material);
      object.renderOrder = renderOrder + i;
      object.frustumCulled = false;
      object.userData['role'] = part.role;
      group.add(object);
      materials.push(material);
    });
    this.root.add(group);
    let resolve: () => void = () => undefined;
    const done = new Promise<void>((r) => (resolve = r));
    const instance: Instance = { id: this.nextId++, epoch: this.epoch, group, materials, age: 0, resolve };
    this.instances.push(instance);
    this.apply(instance);
    return { id: instance.id, done };
  }

  //시간을 흘린다. dtMs 는 부르는 쪽이 배속·역경직을 한 번 곱한 게임 ms
  update(dtMs: number): void {
    for (const instance of [...this.instances]) {
      if (instance.epoch !== this.epoch) {
        this.finish(instance);
        continue;
      }
      instance.age += Math.max(0, dtMs);
      if (instance.age >= slashDuration(this.config)) this.finish(instance);
      else this.apply(instance);
    }
  }

  //정한 시각으로 옮긴다 (실험 화면 시크). 끝 시각 이상이면 숨긴 채 남겨 둔다
  seek(id: number, ageMs: number): void {
    const instance = this.instances.find((x) => x.id === id);
    if (!instance) return;
    instance.age = Math.max(0, ageMs);
    this.apply(instance);
  }

  //지금 시각 (검수용)
  ageOf(id: number): number | null {
    return this.instances.find((x) => x.id === id)?.age ?? null;
  }

  //uniform 에 head·tail·시각을 넣는다. 끝났으면 숨긴다
  private apply(instance: Instance): void {
    const s = slashSample(this.config, instance.age);
    instance.group.visible = s.alive;
    const o = this.options;
    for (const child of instance.group.children) {
      const role = child.userData['role'] as Part['role'];
      if (this.textured) child.visible = role === 'drops' ? o.extraDroplets : role === 'spray' ? o.spray : true;
      else child.visible = role === 'glow' ? this.glowEnabled : role === 'drops' ? this.dropletsEnabled : true;
    }
    const set = (m: THREE.ShaderMaterial, key: string, value: number): void => {
      const u = m.uniforms[key] as THREE.IUniform<number> | undefined;
      if (u) u.value = value;
    };
    for (const m of instance.materials) {
      set(m, 'uHead', s.head);
      set(m, 'uTail', s.tail);
      set(m, 'uAgeSec', instance.age / 1000);
      set(m, 'uAgeMs', instance.age);
      set(m, 'uFlow', o.flow ? 1 : 0);
      set(m, 'uFlare', o.flare ? 1 : 0);
      set(m, 'uGlowOn', o.glow ? 1 : 0);
      set(m, 'uSparkle', o.sparkle ? 1 : 0);
    }
  }

  //하나를 내리고 Promise 를 끝낸다. 재질만 풀고 공유 지오메트리는 둔다
  private finish(instance: Instance): void {
    const i = this.instances.indexOf(instance);
    if (i >= 0) this.instances.splice(i, 1);
    instance.group.removeFromParent();
    for (const m of instance.materials) m.dispose();
    instance.resolve();
  }

  //전부 취소한다 (재시작·장면 이탈). 기다리던 쪽도 풀린다
  clear(): void {
    this.epoch += 1;
    for (const instance of [...this.instances]) this.finish(instance);
  }

  //공유 자원까지 푼다. 이후로는 쓰지 않는다
  dispose(): void {
    this.clear();
    for (const part of this.parts) {
      part.geometry.dispose();
      part.material.dispose();
    }
    for (const t of this.textures) t.dispose();
    this.root.removeFromParent();
  }
}
