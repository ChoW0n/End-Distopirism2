//대기 카메라 여백 (SPEC-004 §13.4). UI 가 덮지 않는 빈 구역 안에 사람 전원이 들어오게 화각과 렌즈 이동을 정한다
//카메라 자리·방향은 그대로 둔다. 원근이 바뀌지 않아 배경 원화와 인형이 어긋나지 않는다
//렌더러를 모른다. 웹은 투영 행렬에, 유니티는 물리 카메라 lensShift(= 렌즈 이동 ÷ 2)에 넣는다

export type Vec3 = readonly [number, number, number];

//화면 비율 구역 (0~1, 좌상단 원점)
export interface ScreenRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface FramingInput {
  //카메라 자리와 바라보는 점. 위쪽은 +y
  eye: Vec3;
  target: Vec3;
  //원화 세로 화각(도). 이보다 좁히지 않는다
  baseFov: number;
  //화면 가로 ÷ 세로
  aspect: number;
  //화면에 넣을 월드 점들 (사람마다 머리·발·좌우 끝)
  points: readonly Vec3[];
  //점들이 들어갈 빈 구역
  rect: ScreenRect;
  //화각을 넓히는 한도 (원화 화각의 탄젠트 배수)
  maxZoomOut: number;
  //배경 층이 위아래로 덮는 범위 (원화 화면 반 높이의 배수). 화면 위·아래 끝이 이 밖으로 나가지 않는다
  cover: number;
}

//세로 화각(도)과 투영 이동량(정규 화면 좌표). 이동량은 투영 행렬의 [8]·[9] 칸에 그대로 넣는다
export interface Framing {
  fov: number;
  offsetX: number;
  offsetY: number;
}

//흔들림까지 반영한 카메라 공간 점들을 빈 구역에 담는다. 기존 구도가 안전하면 그대로 돌려준다
//필요한 만큼만 화각을 넓히고 렌즈를 옮긴다. 점의 z 는 카메라 앞에서 음수다
export function containViewPoints(points: readonly Vec3[], aspect: number, current: Framing, rect: ScreenRect): Framing {
  const front = points.filter((p) => p[2] < -1e-6);
  if (front.length === 0) return current;
  const us = front.map((p) => p[0] / -p[2]);
  const vs = front.map((p) => p[1] / -p[2]);
  const u0 = Math.min(...us), u1 = Math.max(...us);
  const v0 = Math.min(...vs), v1 = Math.max(...vs);
  const t = Math.max(
    Math.tan(current.fov * Math.PI / 360),
    (u1 - u0) / (2 * aspect * Math.max(1e-3, rect.right - rect.left)),
    (v1 - v0) / (2 * Math.max(1e-3, rect.bottom - rect.top)),
  );
  const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));
  return {
    fov: Math.atan(t) * 360 / Math.PI,
    offsetX: clamp(current.offsetX, u1 / (t * aspect) - (2 * rect.right - 1), u0 / (t * aspect) - (2 * rect.left - 1)),
    offsetY: clamp(current.offsetY, v1 / t - (1 - 2 * rect.top), v0 / t - (1 - 2 * rect.bottom)),
  };
}

const DEG = Math.PI / 180;

function sub(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(a: Vec3): [number, number, number] {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

//구역 가운데의 정규 화면 좌표 (y 는 위가 +)
function center(rect: ScreenRect): { x: number; y: number } {
  return { x: rect.left + rect.right - 1, y: 1 - (rect.top + rect.bottom) };
}

//바라보는 점이 구역 가운데에 오게 하는 이동량. 교전 집중 화면에 쓴다
export function centerOffset(rect: ScreenRect): { offsetX: number; offsetY: number } {
  const c = center(rect);
  return { offsetX: -c.x, offsetY: -c.y };
}

//점들을 구역 안에 넣는 화각·이동량을 구한다. 다 못 넣으면 한도까지만 넓히고 가운데를 맞춘다
export function frameStage(input: FramingInput): Framing {
  const forward = normalize(sub(input.target, input.eye));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const t0 = Math.tan((input.baseFov * DEG) / 2);
  const r = input.rect;
  const c = center(r);
  //카메라 앞에 있는 점만 탄젠트 좌표(가로 u, 세로 v)로 바꾼다
  const us: number[] = [];
  const vs: number[] = [];
  for (const p of input.points) {
    const d = sub(p, input.eye);
    const depth = dot(d, forward);
    if (depth <= 1e-6) continue;
    us.push(dot(d, right) / depth);
    vs.push(dot(d, up) / depth);
  }
  if (us.length === 0) return { fov: input.baseFov, ...centerOffset(r) };
  const uMin = Math.min(...us);
  const uMax = Math.max(...us);
  const vMin = Math.min(...vs);
  const vMax = Math.max(...vs);
  //구역의 정규 화면 폭·높이 (각각 최대 2)
  const width = Math.max(1e-3, 2 * (r.right - r.left));
  const height = Math.max(1e-3, 2 * (r.bottom - r.top));
  const need = Math.max((uMax - uMin) / (input.aspect * width), (vMax - vMin) / height);
  const tMax = t0 * Math.max(1, input.maxZoomOut);
  const cover = t0 * input.cover;
  //구역 위·아래 끝의 정규 좌표
  const yTop = 1 - 2 * r.top;
  const yBottom = 1 - 2 * r.bottom;
  //이 화각에서 세로 렌즈 이동이 될 수 있는 범위: 점이 구역 안에 들고 배경 층 밖이 안 보이는 것
  const range = (t: number): [number, number] => [Math.max(vMax - yTop * t, t - cover), Math.min(vMin - yBottom * t, cover - t)];
  //배경 밖을 피하느라 렌즈를 덜 옮기면 그만큼 화각을 더 넓힌다
  let t = Math.min(tMax, Math.max(t0, need));
  for (let i = 0; i < 48 && t < tMax; i++) {
    const [lo, hi] = range(t);
    if (lo <= hi) break;
    t = Math.min(tMax, t + (tMax - t0) / 32);
  }
  //점 묶음의 가운데가 구역 가운데에 오는 렌즈 이동 (탄젠트 단위). 가로는 배경이 거울로 이어져 가두지 않는다
  const sx = (uMin + uMax) / 2 - c.x * t * input.aspect;
  //세로는 될 수 있는 범위 안에서 가운데에 가장 가깝게. 범위가 없으면 배경 덮개를 먼저 지킨다
  const [lo, hi] = range(t);
  const want = (vMin + vMax) / 2 - c.y * t;
  const sy = lo <= hi ? Math.min(hi, Math.max(lo, want)) : Math.min(cover - t, Math.max(t - cover, want));
  return { fov: (2 * Math.atan(t)) / DEG, offsetX: sx / (t * input.aspect), offsetY: sy / t };
}

//월드 점을 이 화각·이동량으로 비춘 화면 비율 좌표 (0~1, 좌상단 원점). 검사·테스트용
export function projectFramed(input: Pick<FramingInput, 'eye' | 'target' | 'aspect'>, framing: Framing, p: Vec3): { x: number; y: number } | null {
  const forward = normalize(sub(input.target, input.eye));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const d = sub(p, input.eye);
  const depth = dot(d, forward);
  if (depth <= 1e-6) return null;
  const t = Math.tan((framing.fov * DEG) / 2);
  const nx = dot(d, right) / depth / (t * input.aspect) - framing.offsetX;
  const ny = dot(d, up) / depth / t - framing.offsetY;
  return { x: (nx + 1) / 2, y: (1 - ny) / 2 };
}
