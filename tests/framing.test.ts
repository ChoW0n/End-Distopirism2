//대기 카메라 여백 (SPEC-004 §13.4) 검증
import { describe, expect, it } from 'vitest';
import { centerOffset, frameStage, projectFramed, type FramingInput, type ScreenRect, type Vec3 } from '../src/render/framing.js';

//제3 수문 기준 카메라 (placement.json)
const eye: Vec3 = [0, 5.51, 10.208];
const target: Vec3 = [0, 2.008, 0];

//사람 한 명의 머리·발·좌우 끝 (키 2.0)
function body(x: number, z: number): Vec3[] {
  return [
    [x - 0.8, 0, z],
    [x + 0.8, 0, z],
    [x, 2.1, z],
  ];
}

//기준 단위 구역을 화면 비율로. 화면 기준 폭이 넓으면 UI 상자 1920 이 가운데에 온다
function zone(refWidth: number, top: number, bottom: number, side: number): ScreenRect {
  const pad = (refWidth - 1920) / 2;
  return { left: (pad + side) / refWidth, right: (pad + 1920 - side) / refWidth, top: top / 1080, bottom: bottom / 1080 };
}

const base = (aspect: number, rect: ScreenRect, points: Vec3[]): FramingInput => ({
  eye,
  target,
  baseFov: 38,
  aspect,
  points,
  rect,
  maxZoomOut: 1.3,
  cover: 1.3,
});

function inside(input: FramingInput, rect: ScreenRect): void {
  const f = frameStage(input);
  for (const p of input.points) {
    const s = projectFramed(input, f, p);
    expect(s).not.toBeNull();
    expect(s!.x).toBeGreaterThanOrEqual(rect.left - 1e-6);
    expect(s!.x).toBeLessThanOrEqual(rect.right + 1e-6);
    expect(s!.y).toBeGreaterThanOrEqual(rect.top - 1e-6);
    expect(s!.y).toBeLessThanOrEqual(rect.bottom + 1e-6);
  }
}

describe('대기 카메라 여백', () => {
  //입력 단계 무대 구역 y 120~800 에 이름표(96)·발밑 바(64)·옆(96) 여백
  const pcRect = zone(1920, 120 + 96, 800 - 64, 96);
  const oneOnOne = [...body(-2.4, 0), ...body(2.4, 0)];
  const twoRows = [...body(-2.4, 0), ...body(-3.9, -1), ...body(-5.4, -2), ...body(2.4, 0), ...body(3.9, -1), ...body(5.4, -2)];

  it('1920×1080: 1대1 이 지시판·위 띠를 피한 구역 안에 들어온다', () => {
    inside(base(16 / 9, pcRect, oneOnOne), pcRect);
  });

  it('1920×1080: 3대3 대형도 들어온다 (필요하면 화각을 넓힌다)', () => {
    const input = base(16 / 9, pcRect, twoRows);
    inside(input, pcRect);
    expect(frameStage(input).fov).toBeGreaterThanOrEqual(38);
  });

  it('iPhone 15 가로 (2556×1179): UI 상자 가운데 1920 안에 들어온다', () => {
    const rect = zone(2341, 120 + 96, 800 - 64, 96);
    inside(base(2556 / 1179, rect, twoRows), rect);
  });

  it('원화보다 확대하지 않는다', () => {
    const tiny = [...body(-0.2, 0), ...body(0.2, 0)].map((p) => [p[0] * 0.1, p[1] * 0.1 + 1, p[2]] as Vec3);
    expect(frameStage(base(16 / 9, pcRect, tiny)).fov).toBeCloseTo(38, 6);
  });

  it('넓히는 한도를 넘지 않는다', () => {
    const wide = [...body(-30, 0), ...body(30, 0)];
    const f = frameStage(base(16 / 9, pcRect, wide));
    const t = Math.tan((f.fov * Math.PI) / 360);
    expect(t).toBeLessThanOrEqual(Math.tan((38 * Math.PI) / 360) * 1.3 + 1e-9);
  });

  it('화면 위·아래 끝이 배경 층이 덮는 범위를 넘지 않는다', () => {
    const t0 = Math.tan((38 * Math.PI) / 360);
    for (const rect of [pcRect, { left: 0, right: 1, top: 0.9, bottom: 1 }, { left: 0, right: 1, top: 0, bottom: 0.1 }]) {
      const f = frameStage(base(16 / 9, rect, oneOnOne));
      const t = Math.tan((f.fov * Math.PI) / 360);
      //렌즈 이동(탄젠트) ± 반 높이가 덮는 범위 안
      expect(f.offsetY * t + t).toBeLessThanOrEqual(t0 * 1.3 + 1e-9);
      expect(f.offsetY * t - t).toBeGreaterThanOrEqual(-t0 * 1.3 - 1e-9);
    }
  });

  it('교전 집중: 바라보는 점이 구역 가운데에 온다', () => {
    const rect = zone(1920, 120, 1020, 0);
    const o = centerOffset(rect);
    //가운데 y = (120 + 1020) / 2 / 1080 → 정규 좌표 1 − 2y
    expect(-o.offsetY).toBeCloseTo(1 - (120 + 1020) / 1080, 9);
    expect(o.offsetX).toBeCloseTo(0, 9);
  });

  it('점이 없으면 원화 화각 그대로 구역 가운데만 맞춘다', () => {
    const f = frameStage(base(16 / 9, pcRect, []));
    expect(f.fov).toBe(38);
    expect(f.offsetY).toBeCloseTo(centerOffset(pcRect).offsetY, 9);
  });
});
