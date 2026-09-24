//UI 수치 파일이 규격대로 읽히는지, 빠진 키를 기본값으로 때우지 않는지 본다

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { parseUiData, UiDataError } from '../src/ui/data.js';
import { loadUiData } from '../src/platform/node-ui.js';

const here = dirname(fileURLToPath(import.meta.url));
const path = resolve(here, '../assets/ui/ui-data.json');
const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;

describe('assets/ui/ui-data.json', () => {
  it('실제 파일이 읽힌다', () => {
    const data = loadUiData(path);
    expect(data.dash.zoneWidth).toBeGreaterThan(0);
    expect(data.dash.oneSided).toBe('attackerOnly');
    expect(data.arrow.start).toBe('headCenter');
    expect(data.badge.deadlockMax).toBe(3);
  });

  it('좌우 흔들림은 [최소, 최대] 두 개다', () => {
    const { lateralJitter } = loadUiData(path).dash;
    expect(lateralJitter).toHaveLength(2);
    expect(lateralJitter[0]).toBeLessThanOrEqual(lateralJitter[1]);
  });

  //키가 빠진 채 그려지면 어디가 틀렸는지 화면만 보고는 못 찾는다
  it.each([
    'dash', 'float', 'arrow', 'bar', 'badge',
    'clash', 'hitStop', 'damageText', 'banner', 'knockback', 'flash', 'afterimage', 'motion', 'cutscene', 'camera',
  ])('%s 절이 없으면 던진다', (section) => {
    const broken = { ...raw };
    delete broken[section];
    expect(() => parseUiData(broken)).toThrow(UiDataError);
  });

  it('절 안의 키 하나가 빠져도 던진다', () => {
    const broken = JSON.parse(JSON.stringify(raw)) as typeof raw;
    delete (broken['dash'] as Record<string, unknown>)['safeDistance'];
    expect(() => parseUiData(broken)).toThrow(/safeDistance/);
  });

  it('정해진 값이 아닌 문자열이면 던진다', () => {
    const broken = JSON.parse(JSON.stringify(raw)) as typeof raw;
    (broken['dash'] as Record<string, unknown>)['oneSided'] = '아무거나';
    expect(() => parseUiData(broken)).toThrow(/oneSided/);
  });

  it('기본값으로 때우지 않는다 — 빈 객체면 바로 던진다', () => {
    expect(() => parseUiData({})).toThrow(UiDataError);
  });

  it('연출 절의 키 하나가 빠져도 던진다', () => {
    const broken = JSON.parse(JSON.stringify(raw)) as typeof raw;
    delete (broken['camera'] as Record<string, unknown>)['punchZoom'];
    expect(() => parseUiData(broken)).toThrow(/punchZoom/);
  });

  //컷신 눈·입 구간은 [시작, 끝] 이다. 뒤집히면 한 번도 안 켜진다
  it('컷신 구간이 뒤집혀 있으면 던진다', () => {
    const broken = JSON.parse(JSON.stringify(raw)) as typeof raw;
    (broken['cutscene'] as Record<string, unknown>)['blinkAt'] = [0.6, 0.5];
    expect(() => parseUiData(broken)).toThrow(/blinkAt/);
  });
});
