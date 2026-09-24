//메시 컷신의 계산 (SPEC-002 §7.1)
//
//한 장짜리 캐릭터를 격자 삼각형으로 나누고, 시각에 따라 각 꼭짓점을 조금씩 민다.
//그리기는 하지 않는다. 원래 삼각형과 휜 삼각형 짝만 낸다. 렌더러가 잘라 붙인다

import type { MeshCutsceneData, MeshDeformerData, Point } from './manifest.js';

//원래 삼각형과 휜 삼각형 한 짝
export interface MeshTriangle {
  source: [Point, Point, Point];
  target: [Point, Point, Point];
}

//a~b 구간에서 0 에서 1 로 부드럽게 오른다
function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

//변형 하나의 가중치. 있는 항목끼리 곱한다
function weightOf(d: MeshDeformerData, x: number, y: number): number {
  let w = 1;
  if (d.gaussian) {
    const gx = (x - d.gaussian.center.x) / d.gaussian.radius.x;
    const gy = (y - d.gaussian.center.y) / d.gaussian.radius.y;
    w *= Math.exp(-(gx * gx) - gy * gy);
  }
  if (d.xRise) w *= smooth(d.xRise[0], d.xRise[1], x);
  if (d.yRise) w *= smooth(d.yRise[0], d.yRise[1], y);
  if (d.yFall) w *= 1 - smooth(d.yFall[0], d.yFall[1], y);
  return w;
}

export class MeshCutscene {
  //격자는 한 번만 만든다. 꼭짓점 위치만 매번 옮긴다
  private readonly grid: [Point, Point, Point][];

  //격자를 나눈다. 추가 경계선(손·창 경계)은 가로줄에 끼워 넣는다
  constructor(readonly data: MeshCutsceneData) {
    const { width, height } = data.size;
    const xs = Array.from({ length: data.grid.columns + 1 }, (_, i) => (width * i) / data.grid.columns);
    const ys = [
      ...Array.from({ length: data.grid.rows + 1 }, (_, j) => (height * j) / data.grid.rows),
      ...data.grid.extraRows,
    ].sort((a, b) => a - b);

    this.grid = [];
    for (let j = 0; j < ys.length - 1; j += 1) {
      for (let i = 0; i < xs.length - 1; i += 1) {
        const x0 = xs[i]!;
        const x1 = xs[i + 1]!;
        const y0 = ys[j]!;
        const y1 = ys[j + 1]!;
        const a = { x: x0, y: y0 };
        const b = { x: x1, y: y0 };
        const c = { x: x1, y: y1 };
        const d = { x: x0, y: y1 };
        this.grid.push([a, b, c], [a, c, d]);
      }
    }
  }

  //점 하나를 이 위상에서 민다. 손·창 구간은 몸 전체 흔들림만 받는다
  deform(p: Point, phase: number, amount = 1): Point {
    const unlocked = 1 - smooth(this.data.rigid[0], this.data.rigid[1], p.y);
    let dx = 0;
    let dy = 0;
    for (const d of this.data.deformers) {
      const w = weightOf(d, p.x, p.y);
      if (w === 0) continue;
      const wave = Math.sin(phase + d.phase);
      dx += w * d.amp.x * wave;
      dy += w * d.amp.y * wave;
    }
    const sway = Math.sin(phase);
    return {
      x: p.x + amount * (unlocked * dx + this.data.sway.x * sway),
      y: p.y + amount * (unlocked * dy + this.data.sway.y * sway),
    };
  }

  //이 위상의 삼각형 짝 전부
  triangles(phase: number, amount = 1): MeshTriangle[] {
    return this.grid.map((source) => ({
      source,
      target: source.map((p) => this.deform(p, phase, amount)) as [Point, Point, Point],
    }));
  }
}
