//물금 실시간 VFX 물결 베기 (SPEC-005 §15.1). 곡선 띠 메시 + 셰이더 + 물방울 점으로 원본 S1 물결 베기를 그리고, 꼬리부터 지운다
//계산은 src/render/ribbon-slash.ts 가 하고, 여기는 three.js 메시와 uniform 만 맡는다 (렌더링 어댑터)
//몸통은 일반 알파 혼합, 흰 심·거품 빛만 가산 혼합. 블룸·흔들림은 없다

import * as THREE from 'three';
import {
  arcLengthPoints,
  dropletLayout,
  innerWidthAt,
  outerWidthAt,
  slashDuration,
  slashSample,
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
  private readonly geometry: THREE.BufferGeometry;
  private readonly dropGeometry: THREE.BufferGeometry;
  private readonly bodyBase: THREE.ShaderMaterial;
  private readonly glowBase: THREE.ShaderMaterial;
  private readonly dropBase: THREE.ShaderMaterial;
  private readonly instances: Instance[] = [];
  private nextId = 1;
  //clear 할 때마다 오른다. 앞 epoch 의 생성은 무시된다
  private epoch = 0;
  //화면 높이의 절반(장치 px). 물방울 크기 계산에 쓴다
  private viewportHalfH = 400;
  //빛(가산)·물방울을 켜고 끈다 (실험 화면 토글)
  glowEnabled = true;
  dropletsEnabled = true;

  //설정과 캐릭터 키(월드)를 받아 공유 지오메트리·재질을 한 번만 만든다
  constructor(
    private readonly config: RibbonSlashConfig,
    characterHeight: number,
  ) {
    this.geometry = RibbonSlashEffect.buildGeometry(config, characterHeight);
    this.dropGeometry = RibbonSlashEffect.buildDroplets(config, characterHeight);
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
    this.bodyBase = ribbon(0, THREE.NormalBlending);
    this.glowBase = ribbon(1, THREE.AdditiveBlending);
    this.dropBase = new THREE.ShaderMaterial({
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
      const drop = instance.materials[2];
      if (drop) (drop.uniforms['uViewportHalfH'] as THREE.IUniform<number>).value = this.viewportHalfH;
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
    const body = this.bodyBase.clone();
    const glow = this.glowBase.clone();
    const drop = this.dropBase.clone();
    (drop.uniforms['uViewportHalfH'] as THREE.IUniform<number>).value = this.viewportHalfH;
    (drop.uniforms['uFacing'] as THREE.IUniform<number>).value = facing;
    const bodyMesh = new THREE.Mesh(this.geometry, body);
    const glowMesh = new THREE.Mesh(this.geometry, glow);
    const dropPoints = new THREE.Points(this.dropGeometry, drop);
    bodyMesh.renderOrder = renderOrder;
    glowMesh.renderOrder = renderOrder + 1;
    dropPoints.renderOrder = renderOrder + 2;
    dropPoints.frustumCulled = false;
    group.add(bodyMesh, glowMesh, dropPoints);
    this.root.add(group);
    let resolve: () => void = () => undefined;
    const done = new Promise<void>((r) => (resolve = r));
    const instance: Instance = { id: this.nextId++, epoch: this.epoch, group, materials: [body, glow, drop], age: 0, resolve };
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
    const [, glowMesh, dropPoints] = instance.group.children as [THREE.Object3D, THREE.Object3D, THREE.Object3D];
    glowMesh.visible = this.glowEnabled;
    dropPoints.visible = this.dropletsEnabled;
    for (const m of instance.materials) {
      (m.uniforms['uHead'] as THREE.IUniform<number>).value = s.head;
      (m.uniforms['uTail'] as THREE.IUniform<number>).value = s.tail;
      const age = m.uniforms['uAgeSec'] as THREE.IUniform<number> | undefined;
      if (age) age.value = instance.age / 1000;
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
    this.geometry.dispose();
    this.dropGeometry.dispose();
    this.bodyBase.dispose();
    this.glowBase.dispose();
    this.dropBase.dispose();
    this.root.removeFromParent();
  }
}
