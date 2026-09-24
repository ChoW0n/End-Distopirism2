//조력자(범고래) 에셋이 파이프라인을 제대로 통과했는지 본다 (SPEC-002 §9.5)
//그림은 커밋하지 않으므로 좌표 매니페스트만 검사한다

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadCharacterAssets } from '../src/platform/node-manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../assets');
const helper = loadCharacterAssets(assets, 'helper')!;
const incinerator = loadCharacterAssets(assets, 'incinerator')!;

describe('조력자 매니페스트', () => {
  it('범고래 팩이 helper 로 반입되어 있다', () => {
    expect(helper).not.toBeNull();
    expect(helper.manifest.character).toBe('helper');
  });

  //렌더러가 이름 끝으로 찾는 장이 다 있어야 대시·후퇴·피격이 그려진다 (SPEC-005 §2.1)
  it.each(['idle', 'advance', 'retreat', 'guard', 'hit'])('%s 장이 있다', (suffix) => {
    expect(helper.frameEndingWith(suffix)).not.toBeNull();
  });

  //전용기 1 은 준비 → 당김 → 찌르기 3장이다 (범고래 본체 13장 README)
  it('전용기 장 수가 S1 3장 · S2 2장 · S3 3장이다', () => {
    expect(helper.frameSequence('S1')).toEqual(['05-skill1-ready', '06-skill1-cast', '06b-skill1-thrust']);
    expect(helper.frameSequence('S2')).toHaveLength(2);
    expect(helper.frameSequence('S3')).toHaveLength(3);
  });

  it('모든 장의 창끝이 캔버스 안에 있다', () => {
    const { width, height } = helper.manifest.canvas;
    for (const frame of helper.manifest.frames) {
      expect(frame.bladeTip, frame.id).not.toBeNull();
      const tip = frame.bladeTip!;
      expect(tip.x).toBeGreaterThanOrEqual(0);
      expect(tip.x).toBeLessThan(width);
      expect(tip.y).toBeGreaterThan(0);
      expect(tip.y).toBeLessThan(height);
    }
  });

  //모든 장이 같은 접지점에 선다. 발이 뜨거나 파묻히면 대시 때 흔들린다
  it('모든 장의 기준점이 매니페스트 접지점과 같다', () => {
    for (const frame of helper.manifest.frames) expect(frame.anchor).toEqual(helper.ground);
  });

  //창이 길어서 소각원 캔버스로는 잘린다. 캐릭터마다 캔버스가 달라도 된다
  it('캔버스가 소각원과 달라도 서 있는 키는 비슷하다', () => {
    expect(helper.manifest.canvas).not.toEqual(incinerator.manifest.canvas);
    const ratio = helper.characterHeight / incinerator.characterHeight;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.25);
  });
});
