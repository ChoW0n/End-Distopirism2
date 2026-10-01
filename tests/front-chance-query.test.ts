//상세 줄 확률 질의 (SPEC-004 §14.6). 교전이 쓰는 식과 같은 값을 내고 상태를 바꾸지 않는다
import { describe, expect, it } from 'vitest';
import { Battle } from '../src/domain/battle.js';
import { frontChanceOf } from '../src/domain/clash.js';
import { alwaysBackRng, catalog, skillOf } from './helpers.js';

const S1 = skillOf('main', 'S1');

function makeBattle() {
  return new Battle(catalog, [{ id: 'a1', characterId: 'main', side: 'ally' }], [{ id: 'e1', characterId: 'main', side: 'enemy' }], { rng: alwaysBackRng });
}

describe('Battle.frontChance', () => {
  it('지금 체력·정신력으로 계산한 값과 같다', () => {
    const battle = makeBattle();
    const a = battle.combatant('a1');
    const expected = frontChanceOf(catalog.rules, catalog.skill(S1), a.mentality, a.hp, a.base.maxHp);
    expect(battle.frontChance('a1', S1)).toBeCloseTo(expected, 12);
  });

  it('읽어도 체력·정신력·단계가 그대로다', () => {
    const battle = makeBattle();
    const a = battle.combatant('a1');
    const before = { hp: a.hp, mentality: a.mentality, phase: battle.phase, turn: battle.turn };
    battle.frontChance('a1', S1);
    expect({ hp: a.hp, mentality: a.mentality, phase: battle.phase, turn: battle.turn }).toEqual(before);
  });
});
