//카일 녹음 소리 묶음이 SPEC-005 §14 표대로 장·사건에 묶이는지 본다

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadCharacterAssets } from '../src/platform/node-manifest.js';
import { CharacterSoundsError, parseCharacterSounds } from '../src/render/sounds.js';

const here = dirname(fileURLToPath(import.meta.url));
const kyle = loadCharacterAssets(resolve(here, '../assets'), 'kyle');
const sounds = parseCharacterSounds(JSON.parse(readFileSync(resolve(here, '../assets/kyle/sounds.json'), 'utf8')));

describe('카일 소리 묶음', () => {
  it('마른 발소리는 쓰지 않는다', () => {
    expect(Object.keys(sounds.files)).not.toContain('move_step_dry');
  });

  it('장에 묶인 소리는 모두 타격 장이다', () => {
    for (const frameId of Object.keys(sounds.frames)) {
      const frame = kyle?.manifest.frames.find((f) => f.id === frameId);
      expect(frame, frameId).toBeDefined();
      expect(frame?.impact, frameId).toBe(true);
    }
  });

  it('전용기 1·2·3 타격 장마다 소리가 있다', () => {
    const impacts = (kyle?.manifest.frames ?? []).filter((f) => f.impact && /-skill[123]-|-upcut-|-downcut-/.test(f.id) && !f.id.includes('ready'));
    for (const f of impacts) expect(sounds.frames[f.id], f.id).toBeDefined();
  });

  it('받아내기·돌진·궁극기 사건 소리가 있다', () => {
    expect(sounds.parry).toBe('s2_guard');
    expect(sounds.dash).toBe('move_dash');
    expect(Object.keys(sounds.ultimate).sort()).toEqual(['cutLine', 'sheathClick', 'start', 'water']);
  });

  it('파일이 없는 소리를 가리키면 거절한다', () => {
    expect(() => parseCharacterSounds({ character: 'x', files: {}, dash: 'nope' })).toThrow(CharacterSoundsError);
  });
});
