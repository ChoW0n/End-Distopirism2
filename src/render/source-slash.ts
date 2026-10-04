//원본 효과 장의 픽셀 자리를 보존하고, 휘두름 궤적에서 깊이만 빌려 온다
import { arcLengthPoints, type RibbonSlashConfig } from './ribbon-slash.js';
import { spacePath, type SpaceSlashConfig } from './space-slash.js';

export interface SourceSlashConfig {
  readonly canvas: readonly [number, number];
  readonly pivot: readonly [number, number];
  readonly bodyPx: number;
  readonly crop: readonly [number, number, number, number];
  //가로·세로 칸 수. 꼭짓점은 각각 한 줄씩 더 있다
  readonly grid: readonly [number, number];
  readonly frames: readonly string[];
}

export class SourceSlashConfigError extends Error {}

function finiteTuple(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every((n) => typeof n === 'number' && Number.isFinite(n));
}

//15장 모두 같은 캔버스·잘라낸 범위·기준점을 쓴다
export function parseSourceSlashConfig(raw: unknown): SourceSlashConfig {
  const c = raw as SourceSlashConfig | null;
  if (!c || !finiteTuple(c.canvas, 2) || !c.canvas.every((n) => Number.isInteger(n) && n > 0)) {
    throw new SourceSlashConfigError('source.canvas 는 양의 정수 [너비, 높이]');
  }
  if (!finiteTuple(c.pivot, 2) || !Number.isFinite(c.bodyPx) || c.bodyPx <= 0) {
    throw new SourceSlashConfigError('source.pivot 은 유한한 좌표, bodyPx 는 양수');
  }
  if (!finiteTuple(c.crop, 4) || c.crop[0] < 0 || c.crop[1] < 0 || c.crop[2] > c.canvas[0] || c.crop[3] > c.canvas[1]
    || c.crop[0] >= c.crop[2] || c.crop[1] >= c.crop[3]) {
    throw new SourceSlashConfigError('source.crop 은 캔버스 안의 [x0, y0, x1, y1]');
  }
  if (!finiteTuple(c.grid, 2) || !c.grid.every((n) => Number.isInteger(n) && n > 0) || (c.grid[0] + 1) * (c.grid[1] + 1) > 65536) {
    throw new SourceSlashConfigError('source.grid 는 양의 정수 칸 수, 꼭짓점은 65536개 이하');
  }
  if (!Array.isArray(c.frames) || c.frames.length !== 15 || !c.frames.every((frame) => typeof frame === 'string' && frame.trim().length > 0)) {
    throw new SourceSlashConfigError('source.frames 는 원본 순서의 파일 이름 15개');
  }
  return c;
}

export interface SourceSlashGrid {
  //정점마다 [원본 x/H, 원본 y/H, 깊이/H]. 카메라 투영은 렌더러가 맡는다
  samples: Float32Array;
  //잘라낸 텍스처의 좌상단은 (0, 1), 우하단은 (1, 0)
  uvs: Float32Array;
  indices: Uint16Array;
}

//pitchDeg 는 기준 휘두름 면의 각도다. 관측 카메라나 재생 시각은 깊이에 관여하지 않는다
export function sourceSlashGrid(source: SourceSlashConfig, ribbon: RibbonSlashConfig, space: SpaceSlashConfig, pitchDeg: number): SourceSlashGrid {
  const [cols, rows] = source.grid;
  const [x0, y0, x1, y1] = source.crop;
  const count = (cols + 1) * (rows + 1);
  const samples = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const indices = new Uint16Array(cols * rows * 6);
  const flat = arcLengthPoints(ribbon.path.points, 256);
  const path = spacePath(ribbon, space, 256, pitchDeg);
  const innerMax = Math.max(1e-6, ribbon.texture ? Math.abs(ribbon.texture.dRangeH[1]) : Math.max(...ribbon.path.innerWidthsH.map((entry) => entry[1])));

  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) {
      const vertex = row * (cols + 1) + col;
      const x = (x0 + ((x1 - x0) * col) / cols - source.pivot[0]) / source.bodyPx;
      const y = (source.pivot[1] - y0 - ((y1 - y0) * row) / rows) / source.bodyPx;
      let nearest = 0;
      let along = 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      //가까운 꼭짓점으로 반올림하면 원본 픽셀 사이에 깊이 계단이 생긴다
      for (let segment = 0; segment < flat.length - 1; segment += 1) {
        const a = flat[segment]!;
        const b = flat[segment + 1]!;
        const dx = b.p[0] - a.p[0];
        const dy = b.p[1] - a.p[1];
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - a.p[0]) * dx + (y - a.p[1]) * dy) / lengthSquared)) : 0;
        const px = x - a.p[0] - dx * t;
        const py = y - a.p[1] - dy * t;
        const distance = px * px + py * py;
        if (distance < bestDistance) {
          bestDistance = distance;
          nearest = segment;
          along = t;
        }
      }

      const a = flat[nearest]!;
      const b = flat[nearest + 1]!;
      const pa = path[nearest]!;
      const pb = path[nearest + 1]!;
      const lerp = (first: number, last: number): number => first + (last - first) * along;
      //선분 경계에서도 같은 접선을 쓰도록 양 끝 접선도 보간한다
      const tx = lerp(a.tangent[0], b.tangent[0]);
      const ty = lerp(a.tangent[1], b.tangent[1]);
      const tangentLength = Math.hypot(tx, ty) || 1;
      const d = ((x - lerp(a.p[0], b.p[0])) * -ty + (y - lerp(a.p[1], b.p[1])) * tx) / tangentLength;
      const curl = Math.max(0, Math.min(1, -d / innerMax));
      const depth = lerp(pa.p[2], pb.p[2]) + lerp(pa.cross[2], pb.cross[2]) * d + lerp(pa.normal[2], pb.normal[2]) * space.curlH * curl * curl;
      samples.set([x, y, depth], vertex * 3);
      uvs.set([col / cols, 1 - row / rows], vertex * 2);

      if (row < rows && col < cols) {
        const below = vertex + cols + 1;
        indices.set([vertex, below, vertex + 1, below, below + 1, vertex + 1], (row * cols + col) * 6);
      }
    }
  }
  return { samples, uvs, indices };
}
