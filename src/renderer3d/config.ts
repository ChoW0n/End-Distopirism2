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
  //타수 (SPEC-005 §12). 도착 뒤 준비 장 시간·따라가는 시간·중간 타 밀림·받아내기 파고듦
  readyHold: number;
  followTime: number;
  hitKnock: number;
  parryLunge: number;
  //피격 슬로우 (SPEC-005 §12.1 v2.11). 게임 시간 배율과 실제 시간
  hitSlowScale: number;
  hitSlowTime: number;
  //다시 붙는 돌진 속도 (월드/초, SPEC-005 §12.1 v2.13)
  followSpeed: number;
  //휘두르기 잔흔 지우기 곡선 세기. 1 이면 납품처럼 고르게, 크면 처음엔 천천히 끝은 촤라락 (SPEC-005 §12.5)
  decayEase: number;
}

//발밑 체력·정신력 바 (SPEC-004 §2.2.1)
export interface FootBarConfig {
  widthRatio: number;
  minWidth: number;
  hpHeight: number;
  mtHeight: number;
  gap: number;
  tween: number;
  downFade: number;
}

//대기 카메라 여백 (SPEC-004 §13.4). 여백은 UI 기준 단위(1920×1080 화면의 px), 몸 크기는 캐릭터 키 비율
export interface FramingConfig {
  //화각을 넓히는 한도 (원화 화각 탄젠트 배수)
  maxZoomOut: number;
  //배경 층이 위아래로 덮는 범위 (원화 화면 반 높이 배수)
  cover: number;
  //머리 위 이름표·노림 표지 자리
  tagMargin: number;
  //발밑 바·궁극기 칸 자리
  footMargin: number;
  //좌우 여백 (바 숫자 포함)
  sideMargin: number;
  //몸 반 폭과 머리 높이 (캐릭터 키 비율)
  bodyHalfWidth: number;
  headHeight: number;
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

//연출 실험 모드 수치 (SPEC-005 §15). 조사 문서 §9 의 초기 튜닝값에서 시작한다
export interface LabConfig {
  //히트스톱 단계(초): 중간 타 · 마지막 타 · 궁극기 마지막 베기 (A08)
  hitStop: { light: number; heavy: number; climax: number };
  //마지막 타에서 때린 쪽이 타 장을 더 붙잡는 시간(초, 게임) (C09)
  attackerHold: number;
  //여러 타의 마지막 타 앞 멈춤(초, 게임) (조사 §2.1)
  finalBeatPause: number;
  //흔들림·화각 펀치 배율 (E06·E07)
  shake: { light: number; heavy: number; climax: number };
  //배경 누르기: 밝기 · 들어가기 · 붙잡기 · 풀기(초, 실제) (F04·C04)
  dim: { level: number; in: number; hold: number; out: number };
  //임팩트 프레임 길이(초, 실제) (C01)
  impactFrame: { seconds: number };
  //대기 숨쉬기: 세로 배율 진폭 · 주기(초) (A05)
  breath: { amplitude: number; period: number };
  //소리 좌우 폭 (H08)
  pan: { width: number };
  //연타 소리 세기 (H06)
  voiceGain: { intermediate: number; final: number };
  //궁극기: 납도 뒤 정적(초, 실제) · 연속 베기 간격(초, 실제) (A10)
  ultimate: { payoffDelay: number; slashIntervals: number[] };
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
  footBar: FootBarConfig;
  framing: FramingConfig;
  lab: LabConfig;
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
  //원화 일부를 잘라 다른 자리에 옮겨 그린 뒤 층으로 쓴다 (밤바다 먼 도시, SPEC-005 §10.2). 비어 있으면 원화 그대로
  draws: BackdropDraw[];
}

//원화에서 잘라 올 곳과 놓을 곳 (픽셀, 원화 좌표)
export interface BackdropDraw {
  source: [number, number, number, number];
  destination: [number, number, number, number];
}

//기준 카메라와 배경 층들
export interface BackdropConfig {
  //화면 왼쪽 위에 적는 장소 이름. 없으면 빈 문자열
  name: string;
  //원화 합성 크기(픽셀). draws 로 층을 합칠 때 쓴다
  viewport: [number, number];
  camera: { back: number; height: number; lookAtHeight: number; fov: number; aspect: number };
  standSpread: number;
  scaleAnchor: [number, number];
  layers: BackdropLayer[];
  //지형 재질·환경 이펙트 색 (SPEC-005 §16.2). 없으면 콘크리트·중간 회색
  surface: SurfaceConfig;
}

//맵 지형. 환경 이펙트가 낼지 말지와 색을 정한다
export interface SurfaceConfig {
  kind: string;
  //multiply_rgb 스프라이트에 곱할 색
  tint: string;
  //균열(alpha_silhouette)을 칠할 색
  crack: string;
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
      'bystanderFade', 'foregroundFade', 'readyHold', 'followTime', 'hitKnock', 'parryLunge', 'hitSlowScale', 'hitSlowTime', 'followSpeed',
      'decayEase',
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
    footBar: numbers<FootBarConfig>(root['footBar'], 'footBar', ['widthRatio', 'minWidth', 'hpHeight', 'mtHeight', 'gap', 'tween', 'downFade']),
    framing: numbers<FramingConfig>(root['framing'], 'framing', ['maxZoomOut', 'cover', 'tagMargin', 'footMargin', 'sideMargin', 'bodyHalfWidth', 'headHeight']),
    lab: parseLab(root['lab']),
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
      draws: parseDraws(where['draws'], id),
    });
  }
  const name = typeof root['name'] === 'string' ? (root['name'] as string) : '';
  const viewport = root['viewport'];
  const size: [number, number] =
    Array.isArray(viewport) && viewport.length === 2 && viewport.every((v) => typeof v === 'number') ? [viewport[0] as number, viewport[1] as number] : [1672, 941];
  const sf = root['surface'];
  const surface: SurfaceConfig =
    typeof sf === 'object' && sf !== null && !Array.isArray(sf)
      ? {
          kind: String((sf as Json)['kind'] ?? 'concrete'),
          tint: String((sf as Json)['tint'] ?? '#909090'),
          crack: String((sf as Json)['crack'] ?? '#262626'),
        }
      : { kind: 'concrete', tint: '#909090', crack: '#262626' };
  return { name, viewport: size, camera, standSpread: spread, scaleAnchor: [anchor[0] as number, anchor[1] as number], layers, surface };
}

//숫자 4개 묶음
function rect4(value: unknown, path: string): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4 || value.some((v) => typeof v !== 'number')) throw new Stage3dConfigError(`${path} 가 숫자 4개가 아니다`);
  return value as [number, number, number, number];
}

//층 하나의 옮겨 그리기 목록. 없으면 빈 목록
function parseDraws(value: unknown, id: string): BackdropDraw[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Stage3dConfigError(`placement.layers.${id}.draws 가 목록이 아니다`);
  return value.map((raw, i) => {
    const d = obj(raw, `placement.layers.${id}.draws[${i}]`);
    return { source: rect4(d['source'], `${id}.draws[${i}].source`), destination: rect4(d['destination'], `${id}.draws[${i}].destination`) };
  });
}

//연출 실험 모드 수치를 읽는다
function parseLab(raw: unknown): LabConfig {
  const o = obj(raw, 'lab');
  const tier = (key: string) => numbers<{ light: number; heavy: number; climax: number }>(o[key], `lab.${key}`, ['light', 'heavy', 'climax']);
  const one = numbers<{ attackerHold: number; finalBeatPause: number }>(o, 'lab', ['attackerHold', 'finalBeatPause']);
  const ultimate = numbers<{ payoffDelay: number; slashIntervals: number[] }>(o['ultimate'], 'lab.ultimate', ['payoffDelay', 'slashIntervals']);
  if (!Array.isArray(ultimate.slashIntervals) || ultimate.slashIntervals.length === 0) throw new Stage3dConfigError('lab.ultimate.slashIntervals 가 숫자 목록이 아니다');
  return {
    hitStop: tier('hitStop'),
    attackerHold: one.attackerHold,
    finalBeatPause: one.finalBeatPause,
    shake: tier('shake'),
    dim: numbers<LabConfig['dim']>(o['dim'], 'lab.dim', ['level', 'in', 'hold', 'out']),
    impactFrame: numbers<LabConfig['impactFrame']>(o['impactFrame'], 'lab.impactFrame', ['seconds']),
    breath: numbers<LabConfig['breath']>(o['breath'], 'lab.breath', ['amplitude', 'period']),
    pan: numbers<LabConfig['pan']>(o['pan'], 'lab.pan', ['width']),
    voiceGain: numbers<LabConfig['voiceGain']>(o['voiceGain'], 'lab.voiceGain', ['intermediate', 'final']),
    ultimate,
  };
}
