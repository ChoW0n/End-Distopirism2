//물금 실시간 VFX 띠 효과 (SPEC-005 §15.1). 곡선 띠 메시 + 셰이더로 꼬리부터 지운다
//계산은 src/render/ribbon-slash.ts 가 하고, 여기는 three.js 메시와 uniform 만 맡는다 (렌더링 어댑터)
//몸체는 일반 알파 혼합, 밝은 얇은 경계만 약한 가산 혼합. 블룸·흔들림·입자는 없다

import * as THREE from 'three';
import { arcLengthPoints, slashDuration, slashSample, widthAt, type RibbonSlashConfig } from '../render/ribbon-slash.js';

//한 번에 살아 있을 수 있는 수. 넘으면 가장 오래된 것을 취소한다 (준비물 성능 예산)
const MAX_ACTIVE = 4;

//띠 정점 셰이더. u·v 만 넘긴다
const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

//띠 조각 셰이더. 몸체(uEdgePass 0)와 경계(1) 두 번 그린다. 노이즈는 시간 항이 없는 고정 공간 노이즈 (TS staticNoise 와 같은 식)
const FRAGMENT = /* glsl */ `
uniform float uHead;
uniform float uTail;
uniform float uFeather;
uniform float uNoiseAmp;
uniform float uSeed;
uniform float uEdgePass;
uniform float uEdgeWidth;
uniform float uOpacity;
uniform vec3 uBody;
uniform vec3 uMiddle;
uniform vec3 uEdge;
uniform vec3 uCore;
varying vec2 vUv;

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

void main() {
  float u = vUv.x;
  float v = vUv.y;
  float shaken = u + staticNoise(u, v) * uNoiseAmp;
  //꼬리 쪽: 노이즈로 흔든 u 가 tail 을 넘은 곳만 남는다. 경계는 부드럽게
  float keep = uTail <= 0.0 ? 1.0 : smoothstep(uTail, uTail + uFeather, shaken);
  //머리 쪽: 전개 중에는 head 까지만
  float reveal = uHead >= 1.0 ? 1.0 : 1.0 - smoothstep(uHead - uFeather, uHead, u);
  float across = abs(v - 0.5) * 2.0;
  float soft = 1.0 - smoothstep(0.78, 1.0, across);
  float mask = keep * reveal;
  if (uEdgePass < 0.5) {
    vec3 col = mix(uMiddle, uBody, smoothstep(0.0, 0.9, across));
    gl_FragColor = vec4(col, mask * soft * uOpacity);
  } else {
    //진행 바깥쪽(v = 1) 얇은 띠만 밝게
    float band = smoothstep(1.0 - uEdgeWidth, 1.0 - uEdgeWidth * 0.35, v) * (1.0 - smoothstep(0.96, 1.0, v));
    vec3 col = mix(uEdge, uCore, band);
    gl_FragColor = vec4(col * band * mask * uOpacity, 1.0);
  }
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
  private readonly bodyBase: THREE.ShaderMaterial;
  private readonly edgeBase: THREE.ShaderMaterial;
  private readonly instances: Instance[] = [];
  private nextId = 1;
  //clear 할 때마다 오른다. 앞 epoch 의 생성은 무시된다
  private epoch = 0;
  //경계 가산을 켜고 끈다 (실험 화면 토글)
  edgeEnabled = true;

  //설정과 캐릭터 키(월드)를 받아 공유 지오메트리·재질을 한 번만 만든다
  constructor(
    private readonly config: RibbonSlashConfig,
    characterHeight: number,
  ) {
    this.geometry = RibbonSlashEffect.buildGeometry(config, characterHeight);
    const palette = config.paletteSRGB;
    const color = (hex: string): THREE.Color => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
    const uniforms = () => ({
      uHead: { value: 0 },
      uTail: { value: 0 },
      uFeather: { value: config.erase.edgeFeatherU },
      uNoiseAmp: { value: config.erase.staticNoiseAmplitudeU },
      uSeed: { value: config.render.seed },
      uEdgePass: { value: 0 },
      uEdgeWidth: { value: config.render.edgeWidthV },
      uOpacity: { value: 1 },
      uBody: { value: color(palette.body) },
      uMiddle: { value: color(palette.middle) },
      uEdge: { value: color(palette.edge) },
      uCore: { value: color(palette.core) },
    });
    this.bodyBase = new THREE.ShaderMaterial({
      uniforms: uniforms(),
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    const edgeUniforms = uniforms();
    edgeUniforms.uEdgePass.value = 1;
    edgeUniforms.uOpacity.value = config.render.edgeOpacity;
    this.edgeBase = new THREE.ShaderMaterial({
      uniforms: edgeUniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }

  //호 길이 등간격 띠. 정점마다 u(경로 비율)·v(0 안쪽 ~ 1 바깥쪽). 위치는 발 기준, 캐릭터 키 배
  static buildGeometry(config: RibbonSlashConfig, characterHeight: number): THREE.BufferGeometry {
    const points = arcLengthPoints(config.path.points, config.path.segments);
    const half = (config.path.maxWidthInCharacterHeights * characterHeight) / 2;
    const positions: number[] = [];
    const uvs: number[] = [];
    const index: number[] = [];
    points.forEach((pt, i) => {
      const w = widthAt(config, pt.u) * half;
      //진행 방향의 왼쪽 법선
      const nx = -pt.tangent[1];
      const ny = pt.tangent[0];
      const x = pt.p[0] * characterHeight;
      const y = pt.p[1] * characterHeight;
      positions.push(x - nx * w, y - ny * w, 0, x + nx * w, y + ny * w, 0);
      uvs.push(pt.u, 0, pt.u, 1);
      if (i > 0) {
        const a = (i - 1) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    return geometry;
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
    const edge = this.edgeBase.clone();
    const bodyMesh = new THREE.Mesh(this.geometry, body);
    const edgeMesh = new THREE.Mesh(this.geometry, edge);
    bodyMesh.renderOrder = renderOrder;
    edgeMesh.renderOrder = renderOrder + 1;
    edgeMesh.visible = this.edgeEnabled;
    group.add(bodyMesh, edgeMesh);
    this.root.add(group);
    let resolve: () => void = () => undefined;
    const done = new Promise<void>((r) => (resolve = r));
    const instance: Instance = { id: this.nextId++, epoch: this.epoch, group, materials: [body, edge], age: 0, resolve };
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

  //지금 시각의 상태 (검수용)
  ageOf(id: number): number | null {
    return this.instances.find((x) => x.id === id)?.age ?? null;
  }

  //uniform 에 head·tail 을 넣는다. 끝났으면 숨긴다
  private apply(instance: Instance): void {
    const s = slashSample(this.config, instance.age);
    instance.group.visible = s.alive && s.head > s.tail;
    (instance.group.children[1] as THREE.Object3D).visible = this.edgeEnabled;
    for (const m of instance.materials) {
      (m.uniforms['uHead'] as THREE.IUniform<number>).value = s.head;
      (m.uniforms['uTail'] as THREE.IUniform<number>).value = s.tail;
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
    this.bodyBase.dispose();
    this.edgeBase.dispose();
    this.root.removeFromParent();
  }
}
