//카드 9종의 효과가 §6 의 타이밍대로 실제로 동작하는지 본다
//코인이 항상 실패하는 난수원을 써서 피해량을 고정시키고 승패를 의도대로 만든다

import { describe, expect, it } from 'vitest';
import type { BattleEvent } from '../src/domain/types.js';
import { alwaysFailRng, catalog, makeCombatant, makeResolver } from './helpers.js';

//합을 한 판 돌린다. 공격자가 이기도록 카드 조합을 골라 쓴다
function runClash(
  attackerSkillId: number,
  defenderSkillId: number,
  options: { attackerCharacter?: string; defenderCharacter?: string } = {},
) {
  const attacker = makeCombatant('a', options.attackerCharacter ?? 'main', 'ally', [attackerSkillId]);
  const defender = makeCombatant('b', options.defenderCharacter ?? 'main', 'enemy', [defenderSkillId]);
  const resolver = makeResolver(alwaysFailRng, [attacker, defender]);
  const events = resolver.resolve(attacker, attackerSkillId, defender, defenderSkillId);
  return { attacker, defender, events };
}

//특정 종류의 이벤트만 걸러낸다
function eventsOf<T extends BattleEvent['type']>(events: BattleEvent[], type: T) {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}

describe('1001 마무리', () => {
  it('합에서 지면 현재 정신력의 5% 를 잃는다', () => {
    //공격자 마무리 15, 방어자 사기 진작 11 이라 공격자가 계속 이긴다
    const { defender } = runClash(1001, 1007);
    expect(defender.hp).toBeLessThan(defender.base.maxHp);
    //패배한 쪽이 마무리를 냈을 때만 정신력이 깎이므로 여기서는 그대로다
    expect(defender.mentality).toBe(100);

    //메인 마무리 15 가 지하경찰 화염 공격 16 에 밀려 이번엔 공격자가 진다
    const { attacker } = runClash(1001, 1009, { defenderCharacter: 'police' });
    expect(attacker.mentality).toBe(95);
  });

  it('체력이 최대치의 1% 미만으로 남으면 그 자리에서 처형된다', () => {
    //방어 태세로 피해가 막혀 살아남았지만 이미 빈사인 상황
    const attacker = makeCombatant('a', 'main', 'ally', [1001]);
    const defender = makeCombatant('b', 'main', 'enemy', [1006]);
    defender.hp = 3;
    const resolver = makeResolver(alwaysFailRng, [attacker, defender]);
    const events = resolver.resolve(attacker, 1001, defender, 1006);

    expect(eventsOf(events, 'damageNullified')).toHaveLength(1);
    expect(eventsOf(events, 'executed')).toHaveLength(1);
    expect(defender.isDefeated).toBe(true);
  });
});

describe('1002 무모한 일격', () => {
  it('이기면 내 체력을 먼저 지불한다', () => {
    const { attacker, defender } = runClash(1002, 1007);
    //무모한 일격 6 + 레벨차 6 = 12, 사기 진작 5 + 6 = 11
    expect(attacker.hp).toBe(attacker.base.maxHp - 10);
    expect(defender.hp).toBe(defender.base.maxHp - 12);
  });
});

describe('1004 강력한 한 방', () => {
  it('이기면 내 피해가 8 늘어난다', () => {
    const { defender } = runClash(1004, 1007);
    //8 + 레벨차 6 = 14, 여기에 +8
    expect(defender.base.maxHp - defender.hp).toBe(22);
  });

  it('지면 상대 피해가 12 늘어난다', () => {
    const { defender } = runClash(1001, 1004);
    //마무리 15 가 강력한 한 방 14 를 이기고, 패자 효과로 +12
    expect(defender.base.maxHp - defender.hp).toBe(27);
  });
});

describe('1006 방어 태세', () => {
  it('합에서 져도 피해를 받지 않는다', () => {
    const { defender, events } = runClash(1001, 1006);
    expect(eventsOf(events, 'damageNullified')).toHaveLength(1);
    expect(defender.hp).toBe(defender.base.maxHp);
  });

  it('덱에 두 장 넣을 수 없다', () => {
    expect(() => catalog.validateDeck([1006, 1006])).toThrow();
    expect(() => catalog.validateDeck([1006, 1001, 1001, 1001])).not.toThrow();
  });
});

describe('1007 사기 진작', () => {
  it('이기면 아군 전체의 다음 턴 코인이 1 늘어난다', () => {
    const attacker = makeCombatant('a', 'main', 'ally', [1007]);
    const ally = makeCombatant('a2', 'helper', 'ally', [1001]);
    const defender = makeCombatant('b', 'police', 'enemy', [1006]);
    const resolver = makeResolver(alwaysFailRng, [attacker, ally, defender]);

    //사기 진작 5+6=11 이 방어 태세 0+7=7 을 이긴다
    resolver.resolve(attacker, 1007, defender, 1006);

    expect(attacker.nextTurnCoinModifier).toBe(1);
    expect(ally.nextTurnCoinModifier).toBe(1);
    expect(defender.nextTurnCoinModifier).toBe(0);
  });
});

describe('합 종료 시 상태이상을 거는 카드', () => {
  it('1003 연속 찌르기 — 이기면 상대에게 출혈', () => {
    const { defender } = runClash(1003, 1007);
    expect(defender.hasStatus('bleed')).toBe(true);
  });

  it('1003 연속 찌르기 — 지면 나에게 혼란', () => {
    const { defender } = runClash(1001, 1003);
    expect(defender.hasStatus('confusion')).toBe(true);
  });

  it('1005 독 바르기 — 이기면 상대에게 3턴 독', () => {
    const { defender, events } = runClash(1005, 1007);
    expect(defender.hasStatus('poison')).toBe(true);
    expect(eventsOf(events, 'statusApplied')[0]).toMatchObject({ status: 'poison', turns: 3 });
  });

  it('1008 파열 — 이기면 상대 방어력감소, 지면 나에게 출혈', () => {
    const win = runClash(1008, 1007);
    expect(win.defender.hasStatus('defenseDown')).toBe(true);

    const lose = runClash(1001, 1008);
    expect(lose.defender.hasStatus('bleed')).toBe(true);
  });
});

describe('1009 화염 공격', () => {
  it('성공 코인 1개당 공격레벨이 2 오른다', () => {
    const attacker = makeCombatant('a', 'main', 'ally');
    const defender = makeCombatant('b', 'main', 'enemy');
    const resolver = makeResolver(alwaysFailRng);
    const skill = catalog.skill(1009);

    //코인 3개 성공이면 공격레벨 29 + 6 = 35, 방어 5 기준 레벨차 보너스 7
    const hit = resolver.calculateDamage(attacker, defender, skill, 3);
    expect(hit.levelBonus).toBe(7);
    expect(hit.damage).toBe(9 + 3 * 2 + 7);
  });
});

describe('정신력 하한', () => {
  it('피해를 다 넣고 나서 정신력이 20 미만이면 혼란이 자동으로 붙는다', () => {
    const attacker = makeCombatant('a', 'main', 'ally', [1001]);
    const defender = makeCombatant('b', 'main', 'enemy', [1007]);
    defender.mentality = 15;
    const resolver = makeResolver(alwaysFailRng, [attacker, defender]);

    resolver.resolve(attacker, 1001, defender, 1007);
    expect(defender.hasStatus('confusion')).toBe(true);
  });
});
