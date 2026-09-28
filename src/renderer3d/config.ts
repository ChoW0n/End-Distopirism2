//웹 3D 무대 수치를 읽는다 (assets/ui/stage3d.json · assets/map/placement.json 의 projection)
//수치를 코드에 박지 않는다. 규격이 틀리면 어디가 틀렸는지 말하고 멈춘다

export interface LayoutConfig {
  characterHeight: number;
  sideHalfGap: number;
  rowDepth: number;
  rowOutward: number;
  textureMaxSide: number;
}

export interface MotionConfig {
  windupTime: number;
  windupBack: number;
  dashTime: number;
  contactGap: number;
  strikeTime: number;
  strikeReach: number;
  knockTime: number;
  knockBase: number;
  knockPerDamage: number;
  knockMax: number;
  staggerDrop: number;
  staggerHold: number;
  lingerAfterHit: number;
  strikeTrailTime: number;
  strikeTrailPeakShare: number;
  settleTime: number;
  settleAmplitude: number;
  settlePeriod: number;
  returnTime: number;
  clashWinnerRecoil: number;
  clashPush: number;
  deadlockPush: number;
  reengageTime: number;
  roundRest: number;
  downTime: number;
  downSink: number;
  downOpacity: number;
  heavyDamage: number;
}

export interface CameraConfig {
  focusSizeGain: number;
  focusHeight: number;
  panYawDeg: number;
  dutchDeg: number;
  fovZoom: number;
  followTime: number;
  returnFollowTime: number;
}

export interface ShakeConfig {
  damageForMaxShake: number;
  traumaPerHit: number;
  traumaPerDamage: number;
  traumaDecay: number;
  maxOffset: [number, number, number];
  maxAngle: [number, number, number];
  frequency: number;
  kickImpulse: number;
  kickStiffness: number;
  kickDamping: number;
  fovPunch: number;
  clashPower: number;
}

export interface HitStopConfig {
  scale: number;
  baseSeconds: number;
  perDamageSeconds: number;
  maxSeconds: number;
  clashSeconds: number;
}

export interface SparkConfig {
  countHit: number;
  countClash: number;
  speedMin: number;
  speedMax: number;
  gravity: number;
  drag: number;
  lifeMin: number;
  lifeMax: number;
  length: number;
  width: number;
  coneDeg: number;
  backShare: number;
  coreSize: number;
  coreLife: number;
  contactBias: number;
}

export interface CalloutConfig {
  seconds: number;
  headOffset: number;
}

export interface Stage3dConfig {
  layout: LayoutConfig;
  motion: MotionConfig;
  camera: CameraConfig;
  shake: ShakeConfig;
  hitStop: HitStopConfig;
  sparks: SparkConfig;
  callout: CalloutConfig;
}

//배경 층 한 장 (SPEC-005 §8.8)
export interface BackdropLayer {
  file: string;
  //원화 합성에서 이 층이 놓인 화면 자리 (x, y, 너비, 높이). 좌상단 원점
  rect: [number, number, number, number];
  shape: 'stand' | 'floor';
  depth: number;
  scale: number;
  offsetY: number;
  near: number;
  far: number;
  halfWidth: number;
  mirrorX: boolean;
  mirrorY: boolean;
}

//기준 카메라와 배경 층들
export interface BackdropConfig {
  camera: { back: number; height: number; lookAtHeight: number; fov: number; aspect: number };
  standSpread: number;
  scaleAnchor: [number, number];
  layers: BackdropLayer[];
}

export class Stage3dConfigError extends Error {
  constructor(message: string) {
    super(`stage3d: ${message}`);
    this.name = 'Stage3dConfigError';
  }
}

type Json = Record<string, unknown>;

function obj(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Stage3dConfigError(`${path} 가 객체가 아니다`);
  return value as Json;
}

//적힌 키가 전부 숫자인 묶음을 읽는다. 빠진 키가 있으면 멈춘다
function numbers<T>(source: unknown, path: string, keys: readonly (keyof T & string)[]): T {
  const o = obj(source, path);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const v = o[key];
    if (Array.isArray(v)) {
      if (v.some((x) => typeof x !== 'number')) throw new Stage3dConfigError(`${path}.${key} 에 숫자가 아닌 값이 있다`);
      out[key] = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else throw new Stage3dConfigError(`${path}.${key} 가 숫자가 아니다`);
  }
  return out as T;
}

//stage3d.json 을 읽는다
export function parseStage3dConfig(raw: unknown): Stage3dConfig {
  const root = obj(raw, 'stage3d');
  return {
    layout: numbers<LayoutConfig>(root['layout'], 'layout', ['characterHeight', 'sideHalfGap', 'rowDepth', 'rowOutward', 'textureMaxSide']),
    motion: numbers<MotionConfig>(root['motion'], 'motion', [
      'windupTime', 'windupBack', 'dashTime', 'contactGap', 'strikeTime', 'strikeReach', 'knockTime', 'knockBase',
      'knockPerDamage', 'knockMax', 'staggerDrop', 'staggerHold', 'lingerAfterHit', 'strikeTrailTime',
      'strikeTrailPeakShare', 'settleTime', 'settleAmplitude', 'settlePeriod', 'returnTime', 'clashWinnerRecoil',
      'clashPush', 'deadlockPush', 'reengageTime', 'roundRest', 'downTime', 'downSink', 'downOpacity', 'heavyDamage',
    ]),
    camera: numbers<CameraConfig>(root['camera'], 'camera', ['focusSizeGain', 'focusHeight', 'panYawDeg', 'dutchDeg', 'fovZoom', 'followTime', 'returnFollowTime']),
    shake: numbers<ShakeConfig>(root['shake'], 'shake', [
      'damageForMaxShake', 'traumaPerHit', 'traumaPerDamage', 'traumaDecay', 'maxOffset', 'maxAngle', 'frequency',
      'kickImpulse', 'kickStiffness', 'kickDamping', 'fovPunch', 'clashPower',
    ]),
    hitStop: numbers<HitStopConfig>(root['hitStop'], 'hitStop', ['scale', 'baseSeconds', 'perDamageSeconds', 'maxSeconds', 'clashSeconds']),
    sparks: numbers<SparkConfig>(root['sparks'], 'sparks', [
      'countHit', 'countClash', 'speedMin', 'speedMax', 'gravity', 'drag', 'lifeMin', 'lifeMax', 'length', 'width',
      'coneDeg', 'backShare', 'coreSize', 'coreLife', 'contactBias',
    ]),
    callout: numbers<CalloutConfig>(root['callout'], 'callout', ['seconds', 'headOffset']),
  };
}

//placement.json 의 층 자리와 projection 을 합쳐 배경 설정을 만든다
export function parseBackdropConfig(raw: unknown): BackdropConfig {
  const root = obj(raw, 'placement');
  const projection = obj(root['projection'], 'placement.projection');
  const camera = numbers<BackdropConfig['camera']>(projection['camera'], 'projection.camera', ['back', 'height', 'lookAtHeight', 'fov', 'aspect']);
  const spread = projection['standSpread'];
  const anchor = projection['scaleAnchor'];
  if (typeof spread !== 'number') throw new Stage3dConfigError('projection.standSpread 가 숫자가 아니다');
  if (!Array.isArray(anchor) || anchor.length !== 2 || anchor.some((v) => typeof v !== 'number')) {
    throw new Stage3dConfigError('projection.scaleAnchor 가 숫자 2개가 아니다');
  }
  const specs = obj(projection['layers'], 'projection.layers');
  const placed = root['layers'];
  if (!Array.isArray(placed)) throw new Stage3dConfigError('placement.layers 가 목록이 아니다');

  const layers: BackdropLayer[] = [];
  for (const [id, specRaw] of Object.entries(specs)) {
    const spec = obj(specRaw, `projection.layers.${id}`);
    const where = placed.map((p) => obj(p, 'placement.layers[]')).find((p) => p['id'] === id);
    if (!where) throw new Stage3dConfigError(`placement.layers 에 ${id} 가 없다`);
    const n = (key: string, fallback: number): number => (typeof spec[key] === 'number' ? (spec[key] as number) : fallback);
    const shape = spec['shape'] === 'floor' ? 'floor' : 'stand';
    layers.push({
      file: String(where['file']),
      rect: [Number(where['x']), Number(where['y']), Number(where['width']), Number(where['height'])],
      shape,
      depth: n('depth', 20),
      scale: n('scale', 1),
      offsetY: n('offsetY', 0),
      near: n('near', -8),
      far: n('far', 40),
      halfWidth: n('halfWidth', 45),
      mirrorX: spec['mirrorOutsideX'] === true,
      mirrorY: spec['mirrorOutsideY'] === true,
    });
  }
  return { camera, standSpread: spread, scaleAnchor: [anchor[0] as number, anchor[1] as number], layers };
}
