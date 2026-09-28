//카일 종이 인형 매니페스트가 3D 무대 장 매핑(SPEC-005 §9.4)을 채우는지 본다

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadCharacterAssets } from '../src/platform/node-manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const kyle = loadCharacterAssets(resolve(here, '../assets'), 'kyle');

describe('카일 매니페스트', () => {
  it('읽힌다', () => {
    expect(kyle).not.toBeNull();
  });

  it.each(['idle', 'advance', 'guard', 'hit', 'retreat'])('%s 장이 있다', (suffix) => {
    expect(kyle?.frameEndingWith(suffix)).not.toBeNull();
  });

  it.each(['S1', 'S2', 'S3'] as const)('%s 는 준비·베기·궤적 장을 갖는다', (slot) => {
    const seq = kyle?.frameSequence(slot) ?? [];
    expect(seq.length).toBe(8);
    expect(seq[0]).toMatch(/ready$/);
    expect(seq[1]).toMatch(/peak$/);
  });

  it('피격 장은 드라이브 원본을 같은 캔버스에 앉힌 파일이다', () => {
    expect(kyle?.frameEndingWith('hit')?.file).toBe('frames/05-hit-canvas.png');
    expect(kyle?.manifest.canvas).toEqual({ width: 1280, height: 720 });
  });
});
