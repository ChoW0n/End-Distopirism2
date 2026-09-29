//플레이어 입력 단계 (SPEC-004 §10)

import { describe, expect, it } from 'vitest';
import { OrderInput, cardView } from '../src/ui/input.js';
import { catalog, skillOf } from './helpers.js';

const HELPER = catalog.deckFor('helper');
const INCINERATOR = catalog.deckFor('incinerator');

function makeInput() {
  return new OrderInput(
    [
      { id: 'a1', characterId: 'helper', deck: HELPER },
      { id: 'a2', characterId: 'incinerator', deck: INCINERATOR },
    ],
    ['e1', 'e2'],
    new Map([
      ['e1', 'a2'],
      ['e2', 'a2'],
    ]),
  );
}

describe('§10.1 아군 → 타겟 → 카드 순서', () => {
  it('첫 아군이 자동으로 골라진다', () => {
    expect(makeInput().selectedAlly).toBe('a1');
  });

  it('적을 안 고르면 카드를 눌러도 지시가 안 생긴다', () => {
    const input = makeInput();
    expect(input.selectCard(HELPER[0] as number)).toBeNull();
    expect(input.ready).toBe(false);
  });

  it('적 → 카드를 고르면 지시가 확정되고 다음 아군으로 넘어간다', () => {
    const input = makeInput();
    expect(input.selectTarget('e1')).toBe(true);
    expect(input.selectCard(HELPER[1] as number)).toEqual({ actorId: 'a1', targetId: 'e1', skillId: HELPER[1] });
    expect(input.selectedAlly).toBe('a2');
    expect(input.selectedTarget).toBeNull();
  });

  it('남의 덱 카드나 없는 적은 받지 않는다', () => {
    const input = makeInput();
    expect(input.selectTarget('a2')).toBe(false);
    input.selectTarget('e1');
    expect(input.selectCard(INCINERATOR[0] as number)).toBeNull();
  });

  it('전원 지시가 차면 ready, 넣은 순서대로 나간다', () => {
    const input = makeInput();
    input.selectAlly('a2');
    input.selectTarget('e2');
    input.selectCard(INCINERATOR[0] as number);
    input.selectTarget('e1');
    input.selectCard(HELPER[0] as number);
    expect(input.ready).toBe(true);
    expect(input.submitted.map((o) => o.actorId)).toEqual(['a2', 'a1']);
  });

  it('지시를 받은 아군을 다시 고르면 그 지시를 지우고 다시 받는다', () => {
    const input = makeInput();
    input.selectTarget('e1');
    input.selectCard(HELPER[0] as number);
    input.selectAlly('a1');
    expect(input.orderOf('a1')).toBeNull();
    expect(input.selectedAlly).toBe('a1');
  });
});

describe('§10.1 합 안내', () => {
  it('나를 겨눈 적만 합이 된다', () => {
    const input = makeInput();
    expect(input.wouldClash('e1')).toBe(false);
    input.selectAlly('a2');
    expect(input.wouldClash('e1')).toBe(true);
  });
});

describe('§10.2 카드', () => {
  it('카드에는 앞 위력과 뒷 위력이 보인다 (SPEC-001 v3.0 §1)', () => {
    const skill = catalog.skill(skillOf('helper', 'S2'));
    const view = cardView(catalog, skill.id);
    expect(view.frontPower).toBe(skill.frontPower);
    expect(view.backPower).toBe(skill.backPower);
    expect(view.attribute).toBe('방어');
    expect(view.slot).toBe('S2');
  });
});
