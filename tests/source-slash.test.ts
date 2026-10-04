import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRibbonConfig, type RibbonSlashConfig } from '../src/render/ribbon-slash.js';
import { paintPoint, placePaintPoint, type SpacePaintView } from '../src/render/space-fx.js';
import { crossPoint, parseSpaceConfig, spacePath } from '../src/render/space-slash.js';
import { parseSourceSlashConfig, sourceSlashGrid, type SourceSlashConfig } from '../src/render/source-slash.js';

const raw = JSON.parse(readFileSync('assets/kyle/realtime-vfx.json', 'utf8')) as unknown;
const ribbon = parseRibbonConfig(raw);
const space = parseSpaceConfig(raw);
const source: SourceSlashConfig = {
  canvas: [1600, 1200], pivot: [1000, 950], bodyPx: 580,
  crop: [20, 10, 1500, 1100], grid: [40, 30],
  frames: Array.from({ length: 15 }, (_, i) => `s1-${String(i + 1).padStart(2, '0')}.png`),
};

//한 픽셀 폭의 작은 격자로 원하는 원본 평면 좌표의 깊이를 읽는다
function sourceAt(x: number, y: number): SourceSlashConfig {
  const bodyPx = 1000000;
  const px = bodyPx + x * bodyPx;
  const py = bodyPx - y * bodyPx;
  return { ...source, canvas: [4000000, 4000000], pivot: [bodyPx, bodyPx], bodyPx, crop: [px, py, px + 1, py + 1], grid: [1, 1] };
}

describe('원본 효과 장 설정', () => {
  it('15장의 순서와 원본 캔버스 정보를 그대로 읽는다', () => {
    expect(parseSourceSlashConfig(source)).toEqual(source);
  });

  it.each([
    { canvas: [0, 1200] }, { pivot: [Number.NaN, 950] }, { bodyPx: 0 },
    { crop: [20, 10, 1700, 1100] }, { crop: [20, 10, 20, 1100] },
    { grid: [0, 30] }, { grid: [1.5, 30] }, { grid: [256, 256] },
    { frames: source.frames.slice(1) }, { frames: [...source.frames.slice(1), ''] },
  ])('규격이 잘못된 설정을 거부한다: %j', (override) => {
    expect(() => parseSourceSlashConfig({ ...source, ...override })).toThrow();
  });
});

describe('원본 픽셀과 공간 깊이', () => {
  it('각 꼭짓점의 UV를 원본 픽셀로 되돌리면 x·y와 정확히 일치하고 삼각형은 정면을 향한다', () => {
    const mesh = sourceSlashGrid(source, ribbon, space, 12);
    const vertices = (source.grid[0] + 1) * (source.grid[1] + 1);
    expect(mesh.samples).toHaveLength(vertices * 3);
    expect(mesh.uvs).toHaveLength(vertices * 2);
    expect(mesh.indices).toHaveLength(source.grid[0] * source.grid[1] * 6);
    const [x0, y0, x1, y1] = source.crop;
    for (let i = 0; i < vertices; i += 1) {
      const px = x0 + mesh.uvs[i * 2]! * (x1 - x0);
      const py = y0 + (1 - mesh.uvs[i * 2 + 1]!) * (y1 - y0);
      expect(mesh.samples[i * 3]).toBeCloseTo((px - source.pivot[0]) / source.bodyPx, 6);
      expect(mesh.samples[i * 3 + 1]).toBeCloseTo((source.pivot[1] - py) / source.bodyPx, 6);
      expect(Number.isFinite(mesh.samples[i * 3 + 2])).toBe(true);
    }
    expect([...mesh.uvs.slice(0, 2)]).toEqual([0, 1]);
    expect([...mesh.uvs.slice(-2)]).toEqual([1, 0]);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i]! * 3;
      const b = mesh.indices[i + 1]! * 3;
      const c = mesh.indices[i + 2]! * 3;
      const cross = (mesh.samples[b]! - mesh.samples[a]!) * (mesh.samples[c + 1]! - mesh.samples[a + 1]!)
        - (mesh.samples[b + 1]! - mesh.samples[a + 1]!) * (mesh.samples[c]! - mesh.samples[a]!);
      expect(cross).toBeGreaterThan(0);
    }
  });

  it('가까운 정점으로 반올림하지 않아 경계 양쪽 깊이가 연속으로 이어진다', () => {
    const straight: RibbonSlashConfig = { ...ribbon, path: { ...ribbon.path, points: [[0, 0], [1 / 3, 0], [2 / 3, 0], [1, 0]] } };
    const linear = { ...space, depthH: [[0, -0.5], [1, 0.5]] as const, curlH: 0 };
    const boundary = 128.5 / 256;
    const xs = [boundary - 0.000001, boundary, boundary + 0.000001];
    const depths = xs.map((x) => sourceSlashGrid(sourceAt(x, 0), straight, linear, 12).samples[2]!);
    depths.forEach((depth, i) => expect(depth).toBeCloseTo(xs[i]! - 0.5, 8));
    expect(depths[2]! - depths[0]!).toBeCloseTo(0.000002, 8);
  });

  it('안쪽 말림과 바깥 단면은 기존 공간 궤적의 깊이만 적용하고 원본 x·y는 바꾸지 않는다', () => {
    const straight: RibbonSlashConfig = { ...ribbon, path: { ...ribbon.path, points: [[0, 0], [1 / 3, 0], [2 / 3, 0], [1, 0]] } };
    const curved = { ...space, depthH: [[0, -0.5], [0.5, 0.5], [1, 0.2]] as const };
    const point = spacePath(straight, curved, 256, 12)[64]!;
    for (const d of [-0.2, 0.2]) {
      const mesh = sourceSlashGrid(sourceAt(0.25, d), straight, curved, 12);
      expect(mesh.samples[0]).toBeCloseTo(0.25, 7);
      expect(mesh.samples[1]).toBeCloseTo(d, 7);
      expect(mesh.samples[2]).toBeCloseTo(crossPoint(curved, point, d, Math.abs(ribbon.texture!.dRangeH[1]))[2], 7);
    }
  });

  it('몸 뒤와 앞을 모두 덮으며 카메라가 달라져도 같은 원본 격자의 깊이는 그대로다', () => {
    const mesh = sourceSlashGrid(source, ribbon, space, 12);
    const depths = [...mesh.samples].filter((_, i) => i % 3 === 2);
    expect(Math.min(...depths)).toBeLessThan(-0.3);
    expect(Math.max(...depths)).toBeGreaterThan(0.5);
    expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(1);
    const views: SpacePaintView[] = [
      { eye: [0, 2, 5], right: [1, 0, 0], up: [0, 1, 0] },
      { eye: [1, 3, 7], right: [0.96, 0, -0.28], up: [0, 1, 0] },
    ];
    for (const view of views) {
      for (let i = 0; i < mesh.samples.length; i += 3) {
        const pixel = paintPoint(view, mesh.samples[i]!, mesh.samples[i + 1]!);
        const placed = placePaintPoint(view, pixel, mesh.samples[i + 2]!, 0.004);
        const t = (placed[2] - view.eye[2]) / (pixel[2] - view.eye[2]);
        expect(placed[0]).toBeCloseTo(view.eye[0] + (pixel[0] - view.eye[0]) * t, 8);
        expect(placed[1]).toBeCloseTo(view.eye[1] + (pixel[1] - view.eye[1]) * t, 8);
      }
    }
    expect(sourceSlashGrid(source, ribbon, space, 12)).toEqual(mesh);
  });
});
