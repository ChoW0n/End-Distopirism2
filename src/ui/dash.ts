//교전이 벌어질 자리를 잡는다 (SPEC-004 §5, §7.7)
//
//순수 계산이다. 좌표계·스프라이트와 무관하고 같은 씨앗이면 같은 자리가 나온다.
//원본은 Random.Range 를 그대로 썼고 30회 실패하면 겹친 자리를 경고만 찍고 썼다.
//여기서는 주입된 Rng 만 쓰고, 실패하면 구역을 격자로 나눠 빈 칸에 넣는다

import type { Rng } from '../domain/rng.js';
import type { Point } from '../render/manifest.js';
import type { DashData } from './data.js';

//달려갈 사람 하나와 그 목적지
export interface DashSpot {
  combatantId: string;
  position: Point;
}

//이번 교전에 달려갈 사람들. 일방 공격이면 한쪽만 들어온다
export interface DashRequest {
  //원래 서 있던 자리. 중점을 잡고 좌우를 가르는 데 쓴다
  movers: { combatantId: string; from: Point }[];
  //교전의 중심. 일방 공격이면 달려가는 사람이 하나뿐이라 그 사람 자리가 중심이 되면 안 된다.
  //맞는 쪽까지 넣은 중점을 밖에서 넣어 준다
  center?: Point;
}

//격자를 넓히는 한도. 이만큼 넓혀도 자리가 없으면 구역 설정 자체가 잘못된 것이다
const GRID_RING_LIMIT = 8;

//두 점 사이 거리
function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class DashPlanner {
  //이번 턴에 이미 쓴 자리. 교전이 여러 건이라 턴 단위로 쌓인다 (D-7)
  private occupied: Point[] = [];

  //data 의 값은 전부 캐릭터 키 H 배수다. 여기서 실제 길이로 바꾼다
  constructor(
    private readonly data: DashData,
    private readonly rng: Rng,
  ) {}

  //턴이 바뀌면 쓴 자리를 비운다
  reset(): void {
    this.occupied = [];
  }

  //지금까지 잡힌 자리들. 시험용이다
  get taken(): readonly Point[] {
    return this.occupied;
  }

  //교전 한 건의 자리를 잡는다. height 는 캐릭터 키 H
  plan(request: DashRequest, height: number): DashSpot[] {
    const movers = request.movers;
    if (movers.length === 0) return [];

    //중심은 교전 쌍의 중점이다. 무대 중앙에 고정하면 교전이 전부 한 자리에 겹친다.
    //거기서 카메라 쪽으로 조금 당긴다. 원작도 전투 구역이 캐릭터 줄보다 앞에 있다
    const base = request.center ?? this.midpoint(movers.map((m) => m.from));
    const center = { x: base.x, y: base.y + this.data.forward * height };
    //왼쪽에 있던 사람이 왼쪽에 선다. 달려가다 서로 지나치지 않게 한다
    const ordered = [...movers].sort((a, b) => a.from.x - b.from.x);

    const found = this.tryRandom(ordered, center, height);
    const spots = found ?? this.gridFallback(ordered, center, height);

    for (const spot of spots) this.occupied.push(spot.position);
    return spots;
  }

  //일방 공격. 맞는 쪽은 제자리이므로 공격자가 그 옆, 같은 깊이로 붙는다.
  //둘의 중점으로 달리면 허공에 대고 휘두르고, 명중 이펙트는 멀리 선 맞는 쪽에 뜬다
  beside(mover: { combatantId: string; from: Point }, target: Point, height: number): DashSpot {
    const side = mover.from.x < target.x ? -1 : 1;
    const position = { x: target.x + side * this.data.pairGap * height, y: target.y };
    this.occupied.push(position);
    return { combatantId: mover.combatantId, position };
  }

  //무작위로 뽑아 본다. retries 번 안에 겹치지 않는 조합이 나오면 그걸 쓴다
  private tryRandom(
    movers: { combatantId: string; from: Point }[],
    center: Point,
    height: number,
  ): DashSpot[] | null {
    const gap = this.data.pairGap * height;
    const halfWidth = (this.data.zoneWidth * height) / 2;
    const halfDepth = (this.data.zoneDepth * height) / 2;
    //양쪽 다 구역 안에 들어오도록 간격의 절반만큼 좁혀서 뽑는다
    const span = Math.max(0, halfWidth - gap / 2);

    for (let attempt = 0; attempt < this.data.retries; attempt += 1) {
      const baseX = center.x + this.between(-span, span);
      const baseY = center.y + this.between(-halfDepth, halfDepth);

      const spots = movers.map((mover, index) => {
        //한 명이면 중앙, 둘이면 간격만큼 갈라선다
        const side = movers.length === 1 ? 0 : index === 0 ? -gap / 2 : gap / 2;
        return {
          combatantId: mover.combatantId,
          position: {
            x: baseX + side + this.lateralJitter(height),
            y: baseY + this.between(-this.data.depthJitter, this.data.depthJitter) * height,
          },
        };
      });

      if (this.allClear(spots, height)) return spots;
    }
    return null;
  }

  //뽑은 자리가 이미 쓴 자리·서로와 충분히 떨어져 있는지 본다
  private allClear(spots: DashSpot[], height: number): boolean {
    const safe = this.data.safeDistance * height;
    for (let i = 0; i < spots.length; i += 1) {
      const here = spots[i]?.position;
      if (!here) continue;
      for (const other of this.occupied) {
        if (distance(here, other) < safe) return false;
      }
      for (let j = i + 1; j < spots.length; j += 1) {
        const there = spots[j]?.position;
        if (there && distance(here, there) < safe) return false;
      }
    }
    return true;
  }

  //무작위가 계속 실패하면 구역을 격자로 나눠 빈 칸에 넣는다
  //원본처럼 겹친 자리를 그냥 쓰지 않는다. 무작위가 아니라 항상 같은 결과가 나온다
  private gridFallback(
    movers: { combatantId: string; from: Point }[],
    center: Point,
    height: number,
  ): DashSpot[] {
    const safe = this.data.safeDistance * height;
    const halfWidth = (this.data.zoneWidth * height) / 2;
    const halfDepth = (this.data.zoneDepth * height) / 2;
    const columns = Math.max(1, Math.floor((halfWidth * 2) / safe));
    const rows = Math.max(1, Math.floor((halfDepth * 2) / safe));

    const free: Point[] = [];
    //구역 안을 먼저 훑고, 모자라면 한 겹씩 넓혀 가며 빈 칸을 더 찾는다.
    //원본처럼 겹친 자리를 쓰지 않으려면 자리가 모자랄 때 구역을 넓히는 수밖에 없다
    for (let ring = 0; free.length < movers.length && ring < GRID_RING_LIMIT; ring += 1) {
      for (let row = -ring; row < rows + ring; row += 1) {
        for (let column = -ring; column < columns + ring; column += 1) {
          //이미 안쪽 겹에서 본 칸은 건너뛴다
          const inner = ring > 0 && row >= -(ring - 1) && row < rows + ring - 1 && column >= -(ring - 1) && column < columns + ring - 1;
          if (inner) continue;

          const point = {
            x: center.x - halfWidth + safe * (column + 0.5),
            y: center.y - halfDepth + safe * (row + 0.5),
          };
          const clearOfTaken = this.occupied.every((taken) => distance(point, taken) >= safe);
          const clearOfPicked = free.every((picked) => distance(point, picked) >= safe);
          if (clearOfTaken && clearOfPicked) free.push(point);
        }
      }
    }

    return movers.map((mover, index) => ({
      combatantId: mover.combatantId,
      //여기까지 와서도 못 찾으면 구역 밖으로 밀어 둔다. 실제로 걸릴 일은 없다
      position: free[index] ?? {
        x: center.x + halfWidth + safe * (this.occupied.length + index + 1),
        y: center.y,
      },
    }));
  }

  //좌우 흔들림. 정해진 폭 안에서 크기를 뽑고 방향을 뒤집는다
  private lateralJitter(height: number): number {
    const [min, max] = this.data.lateralJitter;
    const magnitude = this.between(min, max) * height;
    return this.rng.next() < 0.5 ? -magnitude : magnitude;
  }

  //두 값 사이 실수 하나
  private between(min: number, max: number): number {
    return min + this.rng.next() * (max - min);
  }

  //점들의 중점
  private midpoint(points: Point[]): Point {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }
}
