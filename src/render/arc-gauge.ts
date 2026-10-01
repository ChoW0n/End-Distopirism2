//발밑 반원 게이지 계산 (SPEC-004 §14.3·§14.4). 렌더러를 모른다
//중심선을 첫 점부터 경로 길이 비율만큼 잘라 그 띠만 채운다. 납품 gauge-model.cjs · ArcGaugePath.cs 와 같은 식
//웹은 잘린 선을 SVG 마스크로, 유니티는 띠 메시 누적 길이 UV + fillAmount 로 옮긴다

export type GaugePoint = readonly [number, number];

//assets/ui/kit/gauge-layout.json 모양
export interface GaugeLayout {
  canvas: readonly [number, number];
  anchor: readonly [number, number];
  hp: { points: readonly GaugePoint[]; width: number; color: string };
  sp: { points: readonly GaugePoint[]; width: number; color: string };
  pip: { positions: readonly GaugePoint[]; scale: number };
}

//결행 칸 한 칸의 상태. 빈칸 · 축적 · 다음 턴 대기 · 사용 가능
export type PipState = 'empty' | 'charged' | 'pending' | 'full';

//결행 진행 단계. 도메인 플래그를 읽어 정한다 (게이지가 스스로 풀지 않는다)
export type UltimateStage = 'charging' | 'pending' | 'ready';

//비율을 0~1 로 자른다. 숫자가 아니면 0
export function clampRatio(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export class GaugePath {
  private readonly points: GaugePoint[];
  private readonly lengths: number[];
  //경로 전체 길이
  readonly total: number;

  //중심선 점들을 받아 선분 길이를 미리 잰다
  constructor(points: readonly GaugePoint[]) {
    this.points = points.map((p) => [p[0], p[1]] as const);
    this.lengths = this.points.slice(1).map((p, i) => {
      const a = this.points[i] as GaugePoint;
      return Math.hypot(p[0] - a[0], p[1] - a[1]);
    });
    this.total = this.lengths.reduce((sum, l) => sum + l, 0);
  }

  //경로 위 길이 d 지점. 선분 안에서 보간한다
  private at(d: number): { point: GaugePoint; index: number } {
    let remaining = d;
    for (let i = 0; i < this.lengths.length; i++) {
      const length = this.lengths[i] as number;
      const a = this.points[i] as GaugePoint;
      const b = this.points[i + 1] as GaugePoint;
      if (remaining <= length) {
        const t = length > 0 ? remaining / length : 0;
        return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], index: i };
      }
      remaining -= length;
    }
    const last = this.points[this.points.length - 1] as GaugePoint;
    return { point: [last[0], last[1]], index: this.lengths.length - 1 };
  }

  //비율 from~to 사이 구간의 점들. 비면 빈 목록
  segment(from: number, to: number): GaugePoint[] {
    const a = clampRatio(from) * this.total;
    const b = clampRatio(to) * this.total;
    if (b - a <= 0) return [];
    const start = this.at(a);
    const end = this.at(b);
    const out: GaugePoint[] = [start.point];
    //원본 점을 그대로 넘기지 않고 복사한다. 받는 쪽이 고쳐도 경로가 안 바뀐다
    for (let i = start.index + 1; i <= end.index; i++) {
      const p = this.points[i] as GaugePoint;
      out.push([p[0], p[1]]);
    }
    out.push(end.point);
    return out;
  }

  //첫 점부터 비율만큼의 점들. 0 이면 빈 목록 (채움이 완전히 사라진다)
  prefix(ratio: number): GaugePoint[] {
    return this.segment(0, ratio);
  }
}

//가림판(마스크)용으로 끝을 선분 방향으로 늘린다. 채움 그림의 둥근 끝이 잘리지 않게 할 때만 쓴다
//head: 첫 점 앞으로, tail: 끝 점 뒤로 (전체를 채울 때만)
export function extendEnds(points: readonly GaugePoint[], pad: number, head: boolean, tail: boolean): GaugePoint[] {
  const out = points.map((p) => [p[0], p[1]] as const) as GaugePoint[];
  if (out.length < 2) return out;
  const push = (from: GaugePoint, to: GaugePoint): GaugePoint => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
    return [to[0] + ((to[0] - from[0]) / length) * pad, to[1] + ((to[1] - from[1]) / length) * pad];
  };
  if (head) out.unshift(push(out[1] as GaugePoint, out[0] as GaugePoint));
  if (tail) out.push(push(out[out.length - 2] as GaugePoint, out[out.length - 1] as GaugePoint));
  return out;
}

//점들을 SVG 경로 글로. 비면 빈 글
export function pathData(points: readonly GaugePoint[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${round(p[0])} ${round(p[1])}`).join('');
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

//결행 칸 상태들. 칸 i 는 흔적 합보다 뒤면 빈칸, 아니면 단계에 따라 사용 가능·다음 턴 대기·축적
export function pipStates(charge: number, slots: number, stage: UltimateStage): PipState[] {
  const filled = Math.max(0, Math.min(slots, Number.isFinite(charge) ? Math.floor(charge) : 0));
  return Array.from({ length: slots }, (_, i) =>
    i >= filled ? 'empty' : stage === 'ready' ? 'full' : stage === 'pending' ? 'pending' : 'charged',
  );
}

//도메인 플래그로 단계를 정한다. 손에 결행 카드가 있으면 ready, 다음 턴에 들어오면 pending
export function ultimateStage(inHand: boolean, pending: boolean): UltimateStage {
  return inHand ? 'ready' : pending ? 'pending' : 'charging';
}
