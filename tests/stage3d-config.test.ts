//3D 무대 수치 파일이 규격에 맞는지 본다 (SPEC-005 §9)

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseBackdropConfig, parseStage3dConfig, Stage3dConfigError } from '../src/renderer3d/config.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(here, '..', p), 'utf-8'));

describe('3D 무대 수치', () => {
  it('stage3d.json 을 읽는다', () => {
    const config = parseStage3dConfig(read('assets/ui/stage3d.json'));
    expect(config.layout.characterHeight).toBe(2);
    expect(config.motion.strikeTrailTime).toBe(0.1);
    expect(config.camera.panYawDeg).toBe(24);
    expect(config.sparks.countClash).toBeGreaterThan(config.sparks.countHit);
  });

  it('빠진 수치가 있으면 멈춘다', () => {
    const raw = read('assets/ui/stage3d.json') as { motion: Record<string, unknown> };
    delete raw.motion['clashPush'];
    expect(() => parseStage3dConfig(raw)).toThrow(Stage3dConfigError);
  });

  it('placement.json 의 층 자리와 projection 을 합친다', () => {
    const config = parseBackdropConfig(read('assets/map/placement.json'));
    expect(config.camera.fov).toBe(38);
    const byFile = new Map(config.layers.map((l) => [l.file, l]));
    expect(byFile.get('ground.png')?.shape).toBe('floor');
    expect(byFile.get('mid.png')?.scale).toBe(2);
    expect(byFile.get('mid.png')?.offsetY).toBeCloseTo(0.022);
    expect(byFile.get('far.png')?.depth).toBe(70);
  });
});

describe('카일 1대1 무대 (SPEC-001 §7 [D-22])', () => {
  it('대진은 카일 대 걸음 잔형이고 제3 수문 v4 에서 싸운다', () => {
    const config = parseStage3dConfig(read('assets/ui/stage3d.json'));
    expect(config.battle).toMatchObject({ map: 'map-gate3-v4', ally: ['kyle'], enemy: ['remnantWalker'] });
    expect(config.battle.artAlias['remnantWalker']).toBe('kyle');
  });

  it('제3 수문 층을 읽는다. 근경은 교전 중에 숨긴다 (SPEC-005 §9.5.1)', () => {
    const config = parseBackdropConfig(read('assets/map-gate3/placement.json'));
    const files = config.layers.map((l) => l.file);
    expect(files).toEqual(['01-far-gallery.png', '02-gate-booth.png', '03-battle-floor.png', '04-water.png', '05-foreground.png']);
    expect(config.layers.filter((l) => l.hideInCombat).map((l) => l.file)).toEqual(['05-foreground.png']);
    expect(config.name).toBe('제3 수문');
    expect(config.layers.find((l) => l.file === '04-water.png')?.shape).toBe('floor');
    expect(config.camera).toMatchObject({ back: 11.46, height: 3.96 });
  });

  it('제3 수문 v4 층을 읽는다. 상단 철골·하단 잔해는 교전 중에 숨긴다 (SPEC-005 §9.5.1)', () => {
    const config = parseBackdropConfig(read('assets/map-gate3-v4/placement.json'));
    expect(config.name).toBe('제3 수문');
    expect(config.layers.map((l) => l.file)).toEqual(['01-far-gallery.png', '03-battle-floor.png', '02-gate-booth.png', '04-upper-frame.png', '05-lower-frame.png']);
    expect(config.layers.filter((l) => l.hideInCombat).map((l) => l.file)).toEqual(['04-upper-frame.png', '05-lower-frame.png']);
    //바닥이 수문 층보다 먼저 그려져 연석이 바닥 겹침을 가린다 (v4 build.cjs 순서)
    const order = (file: string): number => config.layers.find((l) => l.file === file)?.order ?? 0;
    expect(order('03-battle-floor.png')).toBeLessThan(order('02-gate-booth.png'));
    //v4 구도(모두 보이는 넓은 방)를 지키려고 세운 층을 키우지 않는다
    expect(config.layers.filter((l) => l.shape === 'stand').every((l) => l.scale === 1)).toBe(true);
  });

  it('v4 기준 카메라가 원화 배치(발 0.741, 키 0.24, 바닥 뒤 끝 0.51)를 맞춘다', () => {
    const config = parseBackdropConfig(read('assets/map-gate3-v4/placement.json'));
    const { back, height, lookAtHeight, fov } = config.camera;
    //기준 카메라로 (0, y, z) 를 비춘 화면 세로 자리 (위 0, 아래 1)
    const screenY = (y: number, z: number): number => {
      const pitch = Math.atan2(height - lookAtHeight, back);
      const dy = y - height;
      const dz = back - z;
      const forward = dz * Math.cos(pitch) - dy * Math.sin(pitch);
      const up = dz * Math.sin(pitch) + dy * Math.cos(pitch);
      return 0.5 - up / forward / Math.tan((fov * Math.PI) / 360) / 2;
    };
    expect(screenY(0, 0)).toBeCloseTo(0.741, 2);
    expect(screenY(0, 0) - screenY(2, 0)).toBeCloseTo(0.24, 2);
    expect(screenY(0, -5.5)).toBeCloseTo(0.51, 2);
  });
});
