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
  //교전에 끼지 않은 인형·근경이 흐려져 사라지는 시간 (SPEC-005 §9.3·§9.5.1)
  bystanderFade: number;
  foregroundFade: number;
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

//카드 뒤집기 연출 수치 (SPEC-005 §11)
export interface CardFlipConfig {
  slowScale: number;
  approachShare: number;
  spinTime: number;
  spinTurns: number;
  revealPop: number;
  holdTime: number;
  height: number;
  headLift: number;
  fadeTime: number;
}

export interface CalloutConfig {
  seconds: number;
  headOffset: number;
}

//싸울 무대와 대진 (SPEC-001 §7 [D-22])
export interface BattleSetup {
  //배경 폴더 (assets/<map>/placement.json)
  map: string;
  ally: string[];
  enemy: string[];
  //그림이 없는 캐릭터에 임시로 세울 그림. 이름표에 자리 표시라고 적는다
  artAlias: Record<string, string>;
}

export interface Stage3dConfig {
  battle: BattleSetup;
  layout: LayoutConfig;
  motion: MotionConfig;
  camera: CameraConfig;
  shake: ShakeConfig;
  hitStop: HitStopConfig;
  sparks: SparkConfig;
  callout: CalloutConfig;
  cardFlip: CardFlipConfig;
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
  //그리기 순서. 인형은 10 대, 근경은 인형보다 크게
  order: number;
  //교전 중에는 숨긴다 (근경. SPEC-005 §9.5.1)
  hideInCombat: boolean;
}

//기준 카메라와 배경 층들
export interface BackdropConfig {
  //화면 왼쪽 위에 적는 장소 이름. 없으면 빈 문자열
  name: string;
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
    battle: parseBattleSetup(root['battle']),
    layout: numbers<LayoutConfig>(root['layout'], 'layout', ['characterHeight', 'sideHalfGap', 'rowDepth', 'rowOutward', 'textureMaxSide']),
    motion: numbers<MotionConfig>(root['motion'], 'motion', [
      'windupTime', 'windupBack', 'dashTime', 'contactGap', 'strikeTime', 'strikeReach', 'knockTime', 'knockBase',
      'knockPerDamage', 'knockMax', 'staggerDrop', 'staggerHold', 'lingerAfterHit', 'strikeTrailTime',
      'strikeTrailPeakShare', 'settleTime', 'settleAmplitude', 'settlePeriod', 'returnTime', 'clashWinnerRecoil',
      'clashPush', 'deadlockPush', 'reengageTime', 'roundRest', 'downTime', 'downSink', 'downOpacity', 'heavyDamage',
      'bystanderFade', 'foregroundFade',
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
    cardFlip: numbers<CardFlipConfig>(root['cardFlip'], 'cardFlip', [
      'slowScale', 'approachShare', 'spinTime', 'spinTurns', 'revealPop', 'holdTime', 'height', 'headLift', 'fadeTime',
    ]),
  };
}

//대진 설정을 읽는다
function parseBattleSetup(raw: unknown): BattleSetup {
  const o = obj(raw, 'battle');
  const list = (key: string): string[] => {
    const v = o[key];
    if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== 'string')) throw new Stage3dConfigError(`battle.${key} 가 캐릭터 id 목록이 아니다`);
    return v as string[];
  };
  if (typeof o['map'] !== 'string') throw new Stage3dConfigError('battle.map 이 문자열이 아니다');
  const alias = obj(o['artAlias'] ?? {}, 'battle.artAlias');
  const artAlias: Record<string, string> = {};
  for (const [k, v] of Object.entries(alias)) if (typeof v === 'string') artAlias[k] = v;
  return { map: o['map'] as string, ally: list('ally'), enemy: list('enemy'), artAlias };
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
      order: n('order', shape === 'floor' ? -10 : -20),
      hideInCombat: spec['hideInCombat'] === true,
    });
  }
  const name = typeof root['name'] === 'string' ? (root['name'] as string) : '';
  return { name, camera, standSpread: spread, scaleAnchor: [anchor[0] as number, anchor[1] as number], layers };
}
