//UI·연출 수치를 읽는다 (SPEC-004 §8)
//
//단위는 전부 캐릭터 키 H 배수고 시간은 초다. 픽셀 값은 이 파일에 없다.
//키가 없으면 기본값으로 때우지 않고 던진다. 수치가 빠진 채 그려지면
//어디가 틀렸는지 화면만 보고는 못 찾는다 (매니페스트 로더와 같은 방침)

//대시 구역과 이동
export interface DashData {
  zoneWidth: number;
  zoneDepth: number;
  //합을 벌일 때 두 사람 사이 거리
  pairGap: number;
  //좌우로 흔드는 폭의 [최소, 최대]
  lateralJitter: [number, number];
  depthJitter: number;
  //교전 중심을 카메라 쪽으로 당기는 양. 원작은 전투 구역이 캐릭터 줄보다 앞에 있다
  forward: number;
  //이 거리보다 가까우면 자리를 다시 뽑는다
  safeDistance: number;
  retries: number;
  speed: number;
  //일방 공격일 때 누가 달려가는가
  oneSided: 'attackerOnly' | 'both';
}

//대기 중 위아래로 떠 있는 동작
export interface FloatData {
  amplitude: number;
  periodSec: number;
}

//곡선 타겟 화살표
export interface ArrowData {
  //시작점을 어디서 잡는가. 카드 UI 가 생기면 selectedCard 로 바꾼다 (U-3)
  start: 'headCenter' | 'selectedCard';
  curveHeight: number;
  segments: number;
  drawSec: number;
  headLength: number;
  headAngleDeg: number;
  colorStart: string;
  colorEnd: string;
}

//체력바·정신력바
export interface BarData {
  width: number;
  height: number;
  gap: number;
  topMargin: number;
  tweenSec: number;
  easing: string;
}

//합 승리/패배/교착 배지
export interface BadgeData {
  rise: number;
  riseSec: number;
  deadlockMax: number;
}

//합 한 번의 박자와 모양 (SPEC-005 §2)
export interface ClashFxData {
  coinSec: number;
  powerSec: number;
  resultSec: number;
  recoilWinner: number;
  recoilLoser: number;
  recoilSec: number;
  sparkSize: number;
  //머리 위 코인 한 개 지름
  coinSize: number;
  //위력 숫자 글자 크기와 자리 (캐릭터 앞쪽 가슴 높이)
  powerSize: number;
  powerOffsetX: number;
  powerOffsetY: number;
  //맞부딪히는 높이 (발에서부터)
  contactHeight: number;
}

//맞는 순간 멈추는 시간
export interface HitStopData {
  clashSec: number;
  baseSec: number;
  perDamageSec: number;
  maxSec: number;
}

export interface DamageTextData {
  rise: number;
  sec: number;
  //이 이상이면 큰 한 방이다
  heavyDamage: number;
  //뜨기 시작하는 높이 (발에서부터)와 글자 크기
  height: number;
  size: number;
}

export interface BannerData {
  sec: number;
  //머리 위 높이, 상대 쪽으로 비키는 거리, 글자 크기
  height: number;
  offsetX: number;
  size: number;
}

export interface KnockbackData {
  distance: number;
  sec: number;
}

export interface FlashData {
  alpha: number;
  sec: number;
}

export interface AfterimageData {
  count: number;
  intervalSec: number;
  alpha: number;
}

//12장뿐인 스프라이트를 몸짓으로 보강하는 수치. 렌더러가 받는다 (SPEC-005 §6)
export interface MotionData {
  //교전 중 싸우지 않는 사람의 불투명도. 0 이면 숨긴다
  othersAlpha: number;
  //그 불투명도까지 옮겨 가는 시간 (SPEC-005 §4.2)
  othersFadeSec: number;
  //여러 장짜리 동작에서 첫 장(예비 동작)과 나머지 장(휘두름)의 길이
  windupMs: number;
  snapMs: number;
  //한 방을 휘두를 때 앞으로 내딛는 거리와 시간
  lunge: number;
  lungeSec: number;
  //서 있을 때 숨쉬는 폭과 주기
  breathe: number;
  breatheSec: number;
  //맞았을 때 몸이 번쩍이는 시간
  hurtSec: number;
  //휘두른 장을 버티는 최소 시간. 붙은 이펙트가 더 길면 그만큼 (SPEC-005 §2.3.2)
  swingHoldMs: number;
  //휘두를 때마다 따라 들어가고 맞는 쪽이 밀리는 거리 (H 배수)
  follow: number;
  //마지막 한 방 뒤 쉬는 시간
  afterHitSec: number;
  //장이 바뀌면 앞 장을 옅게 남기는 시간 (SPEC-005 §2.3)
  blendMs: number;
  //휘두르는 장이 바뀔 때 커졌다 돌아오는 크기·시간
  popScale: number;
  popMs: number;
  //휘두르는 동안 남기는 지난 장 수·불투명도
  strikeGhosts: number;
  strikeGhostAlpha: number;
  //휘두르는 장이 바뀔 때 카메라 순간 확대
  poseKick: number;
  //이펙트 키프레임 겹치기·마지막 장이 사라지는 시간
  effectFadeMs: number;
  //교전 중 두 몸 중심의 최소 간격(H 배수)과 벌리는 시간 (SPEC-005 §2.3.4)
  bodyGap: number;
  bodyGapSec: number;
  //대시·휘두름 잔상 실루엣 색 (SPEC-005 §2.3.5)
  ghostColor: string;
  //맞은 번쩍임 색·세기
  hurtColor: string;
  hurtAlpha: number;
}

//이펙트 재생 수치. 렌더러가 받는다 (SPEC-002 §6-6 · §6-7)
export interface EffectFxData {
  //이보다 짧은 이펙트는 장마다 같은 비율로 늘린다
  minMs: number;
  //발광 겹 세기와 흐림 반경(이펙트 긴 변 비율)
  glowAlpha: number;
  glowBlur: number;
}

//궁극기 컷인 수치. 렌더러가 받는다 (SPEC-005 §2.4)
export interface CutsceneFxData {
  //전체 길이·들어옴·나감
  sec: number;
  inSec: number;
  outSec: number;
  //뒤 전투 화면을 누르는 정도
  dim: number;
  //띠 기울기(도)·높이(화면 높이 비율)
  bandSkewDeg: number;
  bandHeight: number;
  //옆에서 들어오는 거리(화면 너비 비율)·천천히 다가가는 정도
  slideFrom: number;
  pushZoom: number;
  //레이어 흔들림 주기
  swaySec: number;
  //눈 감는 구간·입 여는 구간. 전체 길이 비율 [시작, 끝]
  blinkAt: [number, number];
  mouthAt: [number, number];
  //나갈 때 번쩍임 세기
  flashAlpha: number;
}

//카메라 수치. CameraDirector 가 받는다
export interface CameraData {
  focusZoom: number;
  punchZoom: number;
  punchSec: number;
  tiltDeg: number;
  slowmoScale: number;
  slowmoSec: number;
  shakeReferenceDamage: number;
  //교전 깊이에 따라 줌을 보정하는 범위. 뒷줄 교전도 화면상 같은 크기로 보인다 (SPEC-005 §4, 2026-09-25)
  depthZoom: [number, number];
}

//쓰러진 사람이 사라지는 시간·어두워지는 정도 (SPEC-005 §7.2)
export interface DownData {
  sec: number;
  dim: number;
}

//피해 숫자 말고 뜨는 글자. 무효·처형·상태 이름·자기 피해·상태 피해 (SPEC-005 §7.3)
export type FloatTextKind = 'self' | 'tick' | 'execute' | 'nullify' | 'status';
export interface FloatTextData {
  size: number;
  rise: number;
  sec: number;
  height: number;
  colors: Record<FloatTextKind, string>;
  //체력 바 아래 상태 이름표
  chipSize: number;
  chipGap: number;
}

//전투 결과 띠 (SPEC-005 §7.4)
export interface ResultData {
  inSec: number;
  bandHeight: number;
  size: number;
}

//합성 소리 이름. 렌더러가 명령을 실행하는 순간 낸다 (SPEC-005 §7.5)
export const SOUND_CUES = [
  'dash', 'coin', 'clash', 'clashTie', 'coinBreak', 'swing', 'hit', 'hitHeavy', 'guard', 'down', 'ultimate', 'result',
] as const;
export type SoundCue = (typeof SOUND_CUES)[number];
export interface SoundData {
  master: number;
  gains: Record<SoundCue, number>;
}

export interface UiData {
  dash: DashData;
  float: FloatData;
  arrow: ArrowData;
  bar: BarData;
  badge: BadgeData;
  clash: ClashFxData;
  hitStop: HitStopData;
  damageText: DamageTextData;
  banner: BannerData;
  knockback: KnockbackData;
  flash: FlashData;
  afterimage: AfterimageData;
  motion: MotionData;
  effects: EffectFxData;
  cutscene: CutsceneFxData;
  camera: CameraData;
  down: DownData;
  floatText: FloatTextData;
  result: ResultData;
  sound: SoundData;
}

//수치 파일이 규격과 다를 때 던진다
export class UiDataError extends Error {
  constructor(message: string) {
    super(`ui-data: ${message}`);
    this.name = 'UiDataError';
  }
}

type Json = Record<string, unknown>;

//객체인지 확인한다
function obj(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UiDataError(`${path} 가 객체가 아니다`);
  }
  return value as Json;
}

//숫자를 꺼낸다. 없으면 던진다
function num(source: Json, key: string, path: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UiDataError(`${path}.${key} 가 숫자가 아니다`);
  }
  return value;
}

//문자열을 꺼낸다. 고를 수 있는 값이 정해져 있으면 그 안에 드는지도 본다
function str<T extends string>(source: Json, key: string, path: string, allowed?: readonly T[]): T {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new UiDataError(`${path}.${key} 가 문자열이 아니다`);
  }
  if (allowed && !allowed.includes(value as T)) {
    throw new UiDataError(`${path}.${key} 가 ${allowed.join(' | ')} 중 하나가 아니다: ${value}`);
  }
  return value as T;
}

//숫자 두 개짜리 범위를 꺼낸다
function range(source: Json, key: string, path: string): [number, number] {
  const value = source[key];
  if (!Array.isArray(value) || value.length !== 2) {
    throw new UiDataError(`${path}.${key} 가 숫자 두 개짜리 배열이 아니다`);
  }
  const [min, max] = value;
  if (typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min) || !Number.isFinite(max)) {
    throw new UiDataError(`${path}.${key} 의 값이 숫자가 아니다`);
  }
  if (min > max) throw new UiDataError(`${path}.${key} 의 최소가 최대보다 크다`);
  return [min, max];
}

//JSON.parse 결과를 검증된 UI 수치로 바꾼다
export function parseUiData(raw: unknown): UiData {
  const source = obj(raw, 'ui-data');

  const dash = obj(source['dash'], 'dash');
  const float = obj(source['float'], 'float');
  const arrow = obj(source['arrow'], 'arrow');
  const bar = obj(source['bar'], 'bar');
  const badge = obj(source['badge'], 'badge');
  const cutscene = obj(source['cutscene'], 'cutscene');
  const motion = obj(source['motion'], 'motion');
  const camera = obj(source['camera'], 'camera');
  const floatColors = obj(obj(source['floatText'], 'floatText')['colors'], 'floatText.colors');
  const sound = obj(source['sound'], 'sound');
  const soundGains = obj(sound['gains'], 'sound.gains');
  //숫자만 들어 있는 절은 키 목록으로 한 번에 읽는다
  const numbers = <K extends string>(name: string, keys: readonly K[]): Record<K, number> => {
    const section = obj(source[name], name);
    return Object.fromEntries(keys.map((key) => [key, num(section, key, name)])) as Record<K, number>;
  };

  return {
    dash: {
      zoneWidth: num(dash, 'zoneWidth', 'dash'),
      zoneDepth: num(dash, 'zoneDepth', 'dash'),
      pairGap: num(dash, 'pairGap', 'dash'),
      lateralJitter: range(dash, 'lateralJitter', 'dash'),
      depthJitter: num(dash, 'depthJitter', 'dash'),
      forward: num(dash, 'forward', 'dash'),
      safeDistance: num(dash, 'safeDistance', 'dash'),
      retries: num(dash, 'retries', 'dash'),
      speed: num(dash, 'speed', 'dash'),
      oneSided: str(dash, 'oneSided', 'dash', ['attackerOnly', 'both'] as const),
    },
    float: {
      amplitude: num(float, 'amplitude', 'float'),
      periodSec: num(float, 'periodSec', 'float'),
    },
    arrow: {
      start: str(arrow, 'start', 'arrow', ['headCenter', 'selectedCard'] as const),
      curveHeight: num(arrow, 'curveHeight', 'arrow'),
      segments: num(arrow, 'segments', 'arrow'),
      drawSec: num(arrow, 'drawSec', 'arrow'),
      headLength: num(arrow, 'headLength', 'arrow'),
      headAngleDeg: num(arrow, 'headAngleDeg', 'arrow'),
      colorStart: str(arrow, 'colorStart', 'arrow'),
      colorEnd: str(arrow, 'colorEnd', 'arrow'),
    },
    bar: {
      width: num(bar, 'width', 'bar'),
      height: num(bar, 'height', 'bar'),
      gap: num(bar, 'gap', 'bar'),
      topMargin: num(bar, 'topMargin', 'bar'),
      tweenSec: num(bar, 'tweenSec', 'bar'),
      easing: str(bar, 'easing', 'bar'),
    },
    badge: {
      rise: num(badge, 'rise', 'badge'),
      riseSec: num(badge, 'riseSec', 'badge'),
      deadlockMax: num(badge, 'deadlockMax', 'badge'),
    },
    clash: numbers('clash', [
      'coinSec', 'powerSec', 'resultSec', 'recoilWinner', 'recoilLoser', 'recoilSec', 'sparkSize',
      'coinSize', 'powerSize', 'powerOffsetX', 'powerOffsetY', 'contactHeight',
    ] as const),
    hitStop: numbers('hitStop', ['clashSec', 'baseSec', 'perDamageSec', 'maxSec'] as const),
    damageText: numbers('damageText', ['rise', 'sec', 'heavyDamage', 'height', 'size'] as const),
    banner: numbers('banner', ['sec', 'height', 'offsetX', 'size'] as const),
    knockback: numbers('knockback', ['distance', 'sec'] as const),
    flash: numbers('flash', ['alpha', 'sec'] as const),
    afterimage: numbers('afterimage', ['count', 'intervalSec', 'alpha'] as const),
    motion: {
      ...numbers('motion', [
        'othersAlpha', 'windupMs', 'snapMs', 'lunge', 'lungeSec', 'breathe', 'breatheSec', 'hurtSec',
        'swingHoldMs', 'follow', 'afterHitSec', 'blendMs', 'popScale', 'popMs', 'strikeGhosts', 'strikeGhostAlpha', 'poseKick', 'effectFadeMs',
        'bodyGap', 'bodyGapSec', 'hurtAlpha', 'othersFadeSec',
      ] as const),
      ghostColor: str(motion, 'ghostColor', 'motion'),
      hurtColor: str(motion, 'hurtColor', 'motion'),
    },
    effects: numbers('effects', ['minMs', 'glowAlpha', 'glowBlur'] as const),
    cutscene: {
      ...numbers('cutscene', [
        'sec', 'inSec', 'outSec', 'dim', 'bandSkewDeg', 'bandHeight', 'slideFrom', 'pushZoom', 'swaySec', 'flashAlpha',
      ] as const),
      blinkAt: range(cutscene, 'blinkAt', 'cutscene'),
      mouthAt: range(cutscene, 'mouthAt', 'cutscene'),
    },
    camera: {
      ...numbers('camera', [
        'focusZoom', 'punchZoom', 'punchSec', 'tiltDeg', 'slowmoScale', 'slowmoSec', 'shakeReferenceDamage',
      ] as const),
      depthZoom: range(camera, 'depthZoom', 'camera'),
    },
    down: numbers('down', ['sec', 'dim'] as const),
    floatText: {
      ...numbers('floatText', ['size', 'rise', 'sec', 'height', 'chipSize', 'chipGap'] as const),
      colors: {
        self: str(floatColors, 'self', 'floatText.colors'),
        tick: str(floatColors, 'tick', 'floatText.colors'),
        execute: str(floatColors, 'execute', 'floatText.colors'),
        nullify: str(floatColors, 'nullify', 'floatText.colors'),
        status: str(floatColors, 'status', 'floatText.colors'),
      },
    },
    result: numbers('result', ['inSec', 'bandHeight', 'size'] as const),
    sound: {
      master: num(sound, 'master', 'sound'),
      gains: Object.fromEntries(SOUND_CUES.map((cue) => [cue, num(soundGains, cue, 'sound.gains')])) as Record<SoundCue, number>,
    },
  };
}
