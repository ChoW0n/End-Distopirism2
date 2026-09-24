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

//카메라 수치. CameraDirector 가 받는다
export interface CameraData {
  focusZoom: number;
  punchZoom: number;
  punchSec: number;
  tiltDeg: number;
  slowmoScale: number;
  slowmoSec: number;
  shakeReferenceDamage: number;
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
  camera: CameraData;
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
    camera: numbers('camera', [
      'focusZoom', 'punchZoom', 'punchSec', 'tiltDeg', 'slowmoScale', 'slowmoSec', 'shakeReferenceDamage',
    ] as const),
  };
}
