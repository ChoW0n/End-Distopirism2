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
  it('대진은 카일 대 걸음 잔형이고 제3 수문에서 싸운다', () => {
    const config = parseStage3dConfig(read('assets/ui/stage3d.json'));
    expect(config.battle).toMatchObject({ map: 'map-gate3', ally: ['kyle'], enemy: ['remnantWalker'] });
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
});
