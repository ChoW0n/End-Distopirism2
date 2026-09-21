//sprite-manifest.json 을 검증해서 렌더러가 쓸 타입으로 바꾼다 (SPEC-002 §4)
//도메인의 data.ts 와 같은 방식이다. 파일을 직접 읽지 않고 파싱과 검증만 한다
//이미지는 리포에 없다. 여기서 다루는 건 좌표뿐이다 (SPEC-002 §9)

//무대 위의 한 점
export interface Point {
  x: number;
  y: number;
}

//이펙트가 붙는 자리 4종 (SPEC-002 §5.1)
export type EffectAnchor = 'bladeTip' | 'hitPoint' | 'groundPoint' | 'emissionPoint';

//정규화된 전투 프레임 1장
export interface FrameData {
  id: string;
  file: string;
  scale: number;
  scaleMatch: number;
  //접지 기준점. 이 점이 무대 위치에 놓인다
  anchor: Point;
  headCenter: Point;
  axeHead: Point | null;
  bladeTip: Point | null;
  tipSource: string;
  bbox: [number, number, number, number];
}

//이펙트 한 컷
export interface EffectFrameData {
  file: string;
  ms: number;
}

//이펙트 1종
export interface EffectData {
  id: string;
  name: string;
  anchor: EffectAnchor;
  size: { width: number; height: number };
  //비트맵 안에서 앵커에 맞출 점
  pivot: Point;
  blend: string;
  loop: boolean;
  frames: EffectFrameData[];
}

//궁극기 컷신 레이어 1장 (SPEC-002 §7)
export interface CutsceneLayerData {
  id: string;
  file: string;
  pos: Point;
  pivot: Point;
  z: number;
  parent: string;
  visibleDefault: boolean;
  motionDeg: number;
}

export interface CutsceneData {
  size: { width: number; height: number };
  layers: CutsceneLayerData[];
}

export interface SpriteManifest {
  version: number;
  character: string;
  canvas: { width: number; height: number };
  //접지선 기준점. x 는 캔버스 중앙, y 는 발이 닿는 높이
  ground: Point;
  frames: FrameData[];
  effects: EffectData[];
  cutscene: CutsceneData | null;
}

//어느 프레임에서 어느 이펙트가 터지는지 (SPEC-002 §5.4)
//캐릭터마다 프레임 포즈가 달라서 캐릭터별로 따로 둔다. 매니페스트와 달리 사람이 쓰는 파일이다
export interface EffectBindings {
  character: string;
  //프레임 id → 그 프레임에서 터질 이펙트 id 목록
  frames: Record<string, string[]>;
  //궁극기 전용 조합. 궁극기는 전용기 3과 마무리 프레임을 공유해서 프레임으로는 안 갈린다
  ultimate: string[];
  //격파 직후에 남는 잔류 이펙트
  defeat: string[];
}

//바인딩이 없는 캐릭터를 위한 빈 값. 에셋이 아직 없으면 이펙트 없이 돌아간다
export const EMPTY_BINDINGS: EffectBindings = { character: '', frames: {}, ultimate: [], defeat: [] };

//매니페스트가 규격과 다를 때 던진다
export class SpriteManifestError extends Error {
  constructor(message: string) {
    super(`sprite-manifest: ${message}`);
    this.name = 'SpriteManifestError';
  }
}

type Json = Record<string, unknown>;

//객체인지 확인한다
function obj(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SpriteManifestError(`${path} 가 객체가 아니다`);
  }
  return value as Json;
}

//숫자를 꺼낸다
function num(source: Json, key: string, path: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SpriteManifestError(`${path}.${key} 가 숫자가 아니다`);
  }
  return value;
}

//문자열을 꺼낸다
function str(source: Json, key: string, path: string): string {
  const value = source[key];
  if (typeof value !== 'string') {
    throw new SpriteManifestError(`${path}.${key} 가 문자열이 아니다`);
  }
  return value;
}

//[x, y] 쌍을 점으로 바꾼다
function point(value: unknown, path: string): Point {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new SpriteManifestError(`${path} 가 [x, y] 가 아니다`);
  }
  const [x, y] = value;
  if (typeof x !== 'number' || typeof y !== 'number') {
    throw new SpriteManifestError(`${path} 의 좌표가 숫자가 아니다`);
  }
  return { x, y };
}

//없을 수도 있는 좌표. 날끝이 검출되지 않은 프레임이 여기 해당한다
function optionalPoint(value: unknown, path: string): Point | null {
  return value === null || value === undefined ? null : point(value, path);
}

//배열을 꺼낸다
function arr(source: Json, key: string, path: string): unknown[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    throw new SpriteManifestError(`${path}.${key} 가 배열이 아니다`);
  }
  return value;
}

const ANCHORS: readonly EffectAnchor[] = ['bladeTip', 'hitPoint', 'groundPoint', 'emissionPoint'];

//프레임 1장을 읽는다
function parseFrame(raw: unknown, index: number): FrameData {
  const path = `frames[${index}]`;
  const source = obj(raw, path);
  const bbox = arr(source, 'bbox', path);
  if (bbox.length !== 4 || bbox.some((v) => typeof v !== 'number')) {
    throw new SpriteManifestError(`${path}.bbox 가 숫자 4개가 아니다`);
  }

  return {
    id: str(source, 'id', path),
    file: str(source, 'file', path),
    scale: num(source, 'scale', path),
    scaleMatch: num(source, 'scaleMatch', path),
    anchor: point(source['anchor'], `${path}.anchor`),
    headCenter: point(source['headCenter'], `${path}.headCenter`),
    axeHead: optionalPoint(source['axeHead'], `${path}.axeHead`),
    bladeTip: optionalPoint(source['bladeTip'], `${path}.bladeTip`),
    tipSource: str(source, 'tipSource', path),
    bbox: bbox as [number, number, number, number],
  };
}

//이펙트 1종을 읽는다
function parseEffect(raw: unknown, index: number): EffectData {
  const path = `effects[${index}]`;
  const source = obj(raw, path);
  const anchor = str(source, 'anchor', path);
  if (!ANCHORS.includes(anchor as EffectAnchor)) {
    throw new SpriteManifestError(`${path}.anchor 를 알 수 없다: ${anchor}`);
  }
  const size = point(source['size'], `${path}.size`);

  return {
    id: str(source, 'id', path),
    name: str(source, 'name', path),
    anchor: anchor as EffectAnchor,
    size: { width: size.x, height: size.y },
    pivot: point(source['pivot'], `${path}.pivot`),
    blend: str(source, 'blend', path),
    loop: source['loop'] === true,
    frames: arr(source, 'frames', path).map((frame, i) => {
      const framePath = `${path}.frames[${i}]`;
      const f = obj(frame, framePath);
      return { file: str(f, 'file', framePath), ms: num(f, 'ms', framePath) };
    }),
  };
}

//컷신 레이어를 읽는다. 좌표는 v3 확정값이라 추정하지 않는다 (SPEC-002 §7)
function parseCutscene(raw: unknown): CutsceneData {
  const source = obj(raw, 'cutscene');
  const size = point(source['size'], 'cutscene.size');
  return {
    size: { width: size.x, height: size.y },
    layers: arr(source, 'layers', 'cutscene').map((layer, i) => {
      const path = `cutscene.layers[${i}]`;
      const l = obj(layer, path);
      return {
        id: str(l, 'id', path),
        file: str(l, 'file', path),
        pos: point(l['pos'], `${path}.pos`),
        pivot: point(l['pivot'], `${path}.pivot`),
        z: num(l, 'z', path),
        parent: str(l, 'parent', path),
        visibleDefault: l['visibleDefault'] === true,
        motionDeg: num(l, 'motionDeg', path),
      };
    }),
  };
}

//JSON.parse 결과를 받아 검증된 매니페스트로 바꾼다
export function parseSpriteManifest(raw: unknown): SpriteManifest {
  const source = obj(raw, 'root');
  const canvas = point(source['canvas'], 'canvas');

  const manifest: SpriteManifest = {
    version: num(source, 'version', 'root'),
    character: str(source, 'character', 'root'),
    canvas: { width: canvas.x, height: canvas.y },
    ground: point(source['ground'], 'ground'),
    frames: arr(source, 'frames', 'root').map(parseFrame),
    effects: source['effects'] === undefined ? [] : arr(source, 'effects', 'root').map(parseEffect),
    cutscene: source['cutscene'] === undefined ? null : parseCutscene(source['cutscene']),
  };

  if (manifest.frames.length === 0) throw new SpriteManifestError('프레임이 하나도 없다');

  //id 는 조회 키라 중복되면 안 된다
  const frameIds = new Set<string>();
  for (const frame of manifest.frames) {
    if (frameIds.has(frame.id)) throw new SpriteManifestError(`프레임 id 가 중복된다: ${frame.id}`);
    frameIds.add(frame.id);
  }

  //공격 프레임에 날끝이 없으면 베기 이펙트를 붙일 자리가 없다 (SPEC-002 §8)
  for (const frame of manifest.frames) {
    if (frame.id.includes('skill') && !frame.bladeTip) {
      throw new SpriteManifestError(`공격 프레임에 날끝이 없다: ${frame.id}`);
    }
  }

  return manifest;
}

//JSON.parse 결과를 검증된 이펙트 바인딩으로 바꾼다
//_ 로 시작하는 키는 설명용이라 읽지 않는다
export function parseEffectBindings(raw: unknown): EffectBindings {
  const source = obj(raw, 'bindings');
  const frames: Record<string, string[]> = {};

  for (const [frameId, value] of Object.entries(obj(source['frames'], 'bindings.frames'))) {
    if (frameId.startsWith('_')) continue;
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      throw new SpriteManifestError(`bindings.frames.${frameId} 가 문자열 배열이 아니다`);
    }
    frames[frameId] = value as string[];
  }

  return {
    character: str(source, 'character', 'bindings'),
    frames,
    ultimate: idList(source['ultimate'], 'bindings.ultimate'),
    defeat: idList(source['defeat'], 'bindings.defeat'),
  };
}

//이펙트 id 목록 하나를 검증한다. 없으면 빈 배열로 둔다
function idList(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new SpriteManifestError(`${path} 가 문자열 배열이 아니다`);
  }
  return value as string[];
}

//id 로 빠르게 찾기 위한 조회표
export class SpriteCatalog {
  private readonly framesById: Map<string, FrameData>;
  private readonly effectsById: Map<string, EffectData>;

  //검증된 매니페스트를 받아 조회표를 만든다. 바인딩은 없으면 빈 값으로 둔다
  constructor(
    readonly manifest: SpriteManifest,
    readonly bindings: EffectBindings = EMPTY_BINDINGS,
  ) {
    this.framesById = new Map(manifest.frames.map((f) => [f.id, f]));
    this.effectsById = new Map(manifest.effects.map((e) => [e.id, e]));

    //바인딩이 실재하지 않는 프레임이나 이펙트를 가리키면 연출이 조용히 빠진다
    for (const [frameId, effectIds] of Object.entries(bindings.frames)) {
      this.frame(frameId);
      for (const id of effectIds) this.effect(id);
    }
    for (const id of [...bindings.ultimate, ...bindings.defeat]) this.effect(id);
  }

  //이 프레임에서 터질 이펙트 목록. 바인딩이 없으면 빈 배열이다
  effectsOnFrame(frameId: string): string[] {
    return this.bindings.frames[frameId] ?? [];
  }

  get ground(): Point {
    return this.manifest.ground;
  }

  //프레임을 찾는다. 없으면 던진다
  frame(id: string): FrameData {
    const found = this.framesById.get(id);
    if (!found) throw new SpriteManifestError(`프레임을 찾을 수 없다: ${id}`);
    return found;
  }

  //이펙트를 찾는다. 없으면 던진다
  effect(id: string): EffectData {
    const found = this.effectsById.get(id);
    if (!found) throw new SpriteManifestError(`이펙트를 찾을 수 없다: ${id}`);
    return found;
  }

  //이름 끝으로 프레임을 찾는다. 프레임 id 를 코드에 박지 않기 위한 것
  frameEndingWith(suffix: string): FrameData | null {
    return this.manifest.frames.find((f) => f.id.endsWith(suffix)) ?? null;
  }

  //해당 자리에 붙는 이펙트 목록. 어느 전용기에 어느 이펙트를 쓸지는 아직 정해지지 않았다
  effectsByAnchor(anchor: EffectAnchor): EffectData[] {
    return this.manifest.effects.filter((e) => e.anchor === anchor);
  }

  //전용기 자리에 해당하는 프레임 순서를 낸다. 파일 이름의 skillN 을 그대로 읽는다
  //v2.0 §1 의 프레임 수(S1 2장 · S2 2장 · S3 3장)와 매니페스트가 일치한다
  frameSequence(slot: 'S1' | 'S2' | 'S3'): string[] {
    const marker = `skill${slot[1]}`;
    return this.manifest.frames.filter((f) => f.id.includes(marker)).map((f) => f.id);
  }
}
