//전 스킬 공간형 계산 (SPEC-005 §15.4) 검증. 게임 카메라에서 원화 자리와 겹침, 바닥 밑으로 안 감, 세로 평면이 아님, 받은 박자 그대로
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hPerPixel, parseSpaceFx, placeOnSurface, skillDuration, surfaceDepth, surfaceGrid, trackDuration, trackFrameAt } from '../src/render/space-fx.js';
import { screenOf, viewPitchDeg } from '../src/render/space-slash.js';

const config = parseSpaceFx(JSON.parse(readFileSync('assets/kyle/space-fx.json', 'utf8')));
const placement = JSON.parse(readFileSync('assets/map-gate3-v4/placement.json', 'utf8')) as { projection: { camera: { back: number; height: number; lookAtHeight: number } } };
const pitch = viewPitchDeg(placement.projection.camera);
//카일 캐릭터 키(px). 매니페스트가 없는 환경에서도 돌게 대기 몸 높이 580 을 쓴다
const CHAR_PX = 580;
const skill = (id: string) => {
  const s = config.skills.find((k) => k.id === id);
  if (!s) throw new Error(id);
  return s;
};

describe('투영 곡면', () => {
  it('모든 장의 격자 꼭짓점이 게임 카메라에서 원화 자리와 겹치고 바닥 밑으로 가지 않는다', () => {
    for (const s of config.skills) {
      for (const track of s.tracks) {
        const k = hPerPixel(track, CHAR_PX);
        for (const name of new Set(track.frames.map((f) => f.surface))) {
          const surface = config.surfaces[name];
          if (!surface) throw new Error(name);
          const g = surfaceGrid(track, surface, k, pitch, config.groundLift, config.grid);
          const [gx] = config.grid;
          const [x0, y0, x1, y1] = track.crop;
          for (let v = 0; v < g.positions.length / 3; v++) {
            const p: [number, number, number] = [g.positions[v * 3] as number, g.positions[v * 3 + 1] as number, g.positions[v * 3 + 2] as number];
            const i = v % (gx + 1);
            const j = Math.floor(v / (gx + 1));
            const px = x0 + ((x1 - x0) * i) / gx;
            const py = y0 + ((y1 - y0) * j) / config.grid[1];
            const [sx, sy] = screenOf(p, pitch);
            expect(sx).toBeCloseTo((px - track.pivot[0]) * k, 4);
            expect(sy).toBeCloseTo((track.pivot[1] - py) * k, 4);
            expect(p[1]).toBeGreaterThanOrEqual(config.groundLift - 1e-6);
          }
        }
      }
    }
  });

  it('곡면이 세로 평면이 아니다: 효과가 있는 칸에서 깊이 폭이 0.3H 를 넘는다', () => {
    for (const s of config.skills) {
      for (const track of s.tracks) {
        const k = hPerPixel(track, CHAR_PX);
        for (const name of new Set(track.frames.map((f) => f.surface))) {
          if (name === 'none' || name === 'flat') continue;
          const g = surfaceGrid(track, config.surfaces[name] as never, k, pitch, config.groundLift, config.grid);
          const zs = Array.from({ length: g.positions.length / 3 }, (_, v) => g.positions[v * 3 + 2] as number);
          expect(Math.max(...zs) - Math.min(...zs), `${s.id}/${track.name}/${name}`).toBeGreaterThan(0.3);
        }
      }
    }
  });

  it('바닥 밑 원화 점은 바닥에 눕고 화면 자리는 그대로, floor 는 늘 바닥', () => {
    const down = config.surfaces['downcut'];
    const floor = config.surfaces['floor'];
    if (!down || !floor) throw new Error('곡면');
    const p = placeOnSurface(down, 0.2, -0.15, pitch, config.groundLift);
    expect(p[1]).toBeCloseTo(config.groundLift, 9);
    expect(screenOf(p, pitch)[1]).toBeCloseTo(-0.15, 9);
    const f = placeOnSurface(floor, 0.2, 0.05, pitch, config.groundLift);
    expect(f[1]).toBeCloseTo(config.groundLift, 9);
    expect(screenOf(f, pitch)[1]).toBeCloseTo(0.05, 9);
    expect(surfaceDepth(floor, 3, 3)).toBe(0);
  });

  it('기준점을 띄우면(결행 베기) 화면 자리도 그만큼 옮겨지고 깊이는 그대로', () => {
    const cut = config.surfaces['cut3'];
    if (!cut) throw new Error('cut3');
    const a = placeOnSurface(cut, 0.3, 0.1, pitch, config.groundLift);
    const b = placeOnSurface(cut, 0.3, 0.1, pitch, config.groundLift, [0.05, 0.6]);
    const [sx, sy] = screenOf(b, pitch);
    expect(sx).toBeCloseTo(0.35, 9);
    expect(sy).toBeCloseTo(0.7, 9);
    expect(b[2]).toBeCloseTo(a[2], 9);
  });

  it('찌르기는 위 물보라가 뒤로, 아래가 앞으로 비틀리고 뿌리 쪽이 더 비틀린다', () => {
    const t = config.surfaces['thrust'];
    if (!t) throw new Error('thrust');
    expect(surfaceDepth(t, 1.2, 0.7)).toBeLessThan(surfaceDepth(t, 1.2, 0.2));
    const twist = (x: number) => surfaceDepth(t, x, 0.2) - surfaceDepth(t, x, 0.7);
    expect(twist(0.3)).toBeGreaterThan(twist(1.4));
  });
});

describe('받은 박자 (v3 manifest)', () => {
  it('장 수: S2 15 · S3 39 · 결행 4획 15장씩 + 물보라 15 + 밤물', () => {
    expect(skill('s2').tracks[0]?.frames.length).toBe(15);
    expect(skill('s3').tracks[0]?.frames.length).toBe(39);
    const ult = skill('ult');
    expect(ult.tracks.filter((t) => t.anchor === 'enemyHit').map((t) => t.frames.length)).toEqual([15, 15, 15, 15]);
    expect(ult.tracks.find((t) => t.name === '물보라')?.frames.length).toBe(15);
  });

  it('S2 70ms×14·120ms, S3 단계 시간, 결행 획 시작 0·100·200·300 · 물보라 350 · 1250ms 끝', () => {
    const s2 = skill('s2').tracks[0];
    if (!s2) throw new Error('s2');
    expect(trackDuration(s2)).toBe(70 * 14 + 120);
    const s3 = skill('s3').tracks[0];
    if (!s3) throw new Error('s3');
    expect(s3.frames.map((f) => f.ms).slice(0, 8)).toEqual([380, 70, 90, 40, 40, 40, 40, 110]);
    const ult = skill('ult');
    expect(ult.tracks.filter((t) => t.anchor === 'enemyHit').map((t) => t.delayMs)).toEqual([0, 100, 200, 300]);
    expect(ult.tracks.find((t) => t.name === '물보라')?.delayMs).toBe(350);
    expect(skillDuration(ult)).toBe(1250);
    expect(skillDuration(skill('s2'))).toBe(180 + 70 * 14 + 120);
  });

  it('장 넘기기는 시작 전·끝난 뒤 -1, 사이에는 앞으로만 간다', () => {
    for (const s of config.skills) {
      for (const track of s.tracks) {
        expect(trackFrameAt(track, track.delayMs - 1)).toBe(-1);
        expect(trackFrameAt(track, track.delayMs)).toBe(0);
        expect(trackFrameAt(track, track.delayMs + trackDuration(track))).toBe(-1);
        let last = 0;
        for (let t = track.delayMs; t < track.delayMs + trackDuration(track); t += 7) {
          const f = trackFrameAt(track, t);
          expect(f).toBeGreaterThanOrEqual(last);
          last = f;
        }
        expect(last).toBe(track.frames.length - 1);
      }
    }
  });

  it('S2·S3 장마다 평면 비교용 통합 장과 몸만 남긴 장이 있다', () => {
    for (const id of ['s2', 's3']) {
      for (const f of skill(id).tracks[0]?.frames ?? []) {
        expect(f.flat).toBeTruthy();
        expect(f.body).toMatch(/^fx3\/body\//);
      }
    }
  });

  //그림이 있는 환경(반입 후)에서만 파일까지 본다
  it.runIf(existsSync('assets/kyle/fx3/s2/01.png'))('가리키는 그림이 다 있다', () => {
    for (const s of config.skills) for (const t of s.tracks) for (const f of t.frames) {
      expect(existsSync(`assets/kyle/${f.fx}`), f.fx).toBe(true);
      if (f.body) expect(existsSync(`assets/kyle/${f.body}`), f.body).toBe(true);
    }
  });
});
