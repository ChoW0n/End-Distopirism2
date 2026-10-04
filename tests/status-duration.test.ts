import { describe, expect, it } from 'vitest';
import { Battle } from '../src/domain/battle.js';
import { alwaysFrontRng, catalog, makeCombatant, makeResolver, skillOf } from './helpers.js';

const KYLE_S1 = skillOf('kyle', 'S1');
const KYLE_S2 = skillOf('kyle', 'S2');
const KYLE_S3 = skillOf('kyle', 'S3');

//적의 선택과 카드 앞면을 고정해 실제 전투 두 턴을 재현한다
function makeBattle() {
  return new Battle(
    catalog,
    [{ id: 'kyle', characterId: 'kyle', side: 'ally' }],
    [{ id: 'enemy', characterId: 'remnantWalker', side: 'enemy' }],
    {
      rng: alwaysFrontRng,
      enemyAi: {
        chooseTarget: () => 'kyle',
        chooseSkill: () => skillOf('remnantWalker', 'S1'),
      },
    },
  );
}

function resolveTurn(battle: Battle, skillId: number) {
  battle.submitOrders([{ actorId: 'kyle', targetId: 'enemy', skillId }]);
  return battle.resolve();
}

describe('QA-02 상태이상의 부여 턴과 지속 턴', () => {
  it.each([
    { skillId: KYLE_S1, name: '물금', power: 24, calculated: 31, applied: 31 },
    { skillId: KYLE_S3, name: '잔향', power: 19, calculated: 26, applied: 29 },
  ])('이면 승리의 방어 감소가 다음 턴 $name 피해를 $applied 로 올리고 그 턴 종료에 만료된다', ({ skillId, power, calculated, applied }) => {
    const battle = makeBattle();
    const enemy = battle.combatant('enemy');
    const resolver = makeResolver(alwaysFrontRng);

    battle.startTurn();
    const first = resolveTurn(battle, KYLE_S2);
    expect(first).toContainEqual({ type: 'damageCalculated', combatantId: 'kyle', damage: 24, power: 18, levelBonus: 6 });
    expect(first).toContainEqual({ type: 'statusApplied', combatantId: 'enemy', status: 'defenseDown', turns: 1 });
    expect(resolver.effectiveDefLevel(enemy)).toBe(4);
    expect(battle.endTurn().some((event) => event.type === 'statusExpired')).toBe(false);

    battle.startTurn();
    expect(resolver.effectiveDefLevel(enemy)).toBe(4);
    const hpBefore = enemy.hp;
    const next = resolveTurn(battle, skillId);
    expect(next).toContainEqual({ type: 'damageCalculated', combatantId: 'kyle', damage: calculated, power, levelBonus: 7 });
    expect(next).toContainEqual({ type: 'damageApplied', combatantId: 'enemy', damage: applied, hp: hpBefore - applied });
    expect(battle.endTurn()).toContainEqual({ type: 'statusExpired', combatantId: 'enemy', status: 'defenseDown' });
    expect(resolver.effectiveDefLevel(enemy)).toBe(8);
  });

  it('이면을 다음 턴에 다시 맞히면 중첩 없이 방어 감소가 한 턴 더 이어진다', () => {
    const battle = makeBattle();
    const enemy = battle.combatant('enemy');

    for (let turn = 1; turn <= 2; turn += 1) {
      battle.startTurn();
      resolveTurn(battle, KYLE_S2);
      expect(battle.endTurn().some((event) => event.type === 'statusExpired')).toBe(false);
      expect(enemy.statuses).toEqual([{ id: 'defenseDown', turns: 1 }]);
    }

    battle.startTurn();
    expect(resolveTurn(battle, KYLE_S1)).toContainEqual({ type: 'damageCalculated', combatantId: 'kyle', damage: 31, power: 24, levelBonus: 7 });
    expect(battle.endTurn()).toContainEqual({ type: 'statusExpired', combatantId: 'enemy', status: 'defenseDown' });
  });

  it('출혈은 부여 다음 턴부터 3회 발동하고 뒤에 건 중첩은 자기 지속 턴에 맞춰 만료된다', () => {
    const battle = makeBattle();
    const enemy = battle.combatant('enemy');
    const resolver = makeResolver(alwaysFrontRng);
    const finishTurn = () => {
      battle.submitOrders([]);
      battle.resolve();
      return battle.endTurn();
    };

    expect(battle.startTurn().some((event) => event.type === 'statusTicked')).toBe(false);
    resolver.applyStatus(enemy, 'bleed', 3, []);
    expect(finishTurn().some((event) => event.type === 'statusExpired')).toBe(false);

    const expectedDamage = [1, 2, 1];
    for (let index = 0; index < expectedDamage.length; index += 1) {
      const ticks = battle.startTurn().filter((event) => event.type === 'statusTicked');
      expect(ticks).toEqual([{ type: 'statusTicked', combatantId: 'enemy', status: 'bleed', damage: expectedDamage[index] }]);
      if (index === 0) resolver.applyStatus(enemy, 'bleed', 1, []);
      const ended = finishTurn();
      expect(ended.filter((event) => event.type === 'statusExpired')).toHaveLength(index === 0 ? 0 : 1);
      expect(enemy.stackCount('bleed')).toBe([2, 1, 0][index]);
    }

    expect(enemy.hp).toBe(enemy.base.maxHp - 4);
    expect(battle.startTurn().some((event) => event.type === 'statusTicked')).toBe(false);
  });

  it('패배로 생긴 혼란이 다음 턴 앞면 확률에 적용되고 정신력 원값을 별도로 깎지 않는다', () => {
    const battle = makeBattle();
    const enemy = battle.combatant('enemy');
    const resolver = makeResolver(alwaysFrontRng);
    enemy.mentality = 24;

    battle.startTurn();
    expect(resolveTurn(battle, KYLE_S1)).toContainEqual({ type: 'statusApplied', combatantId: 'enemy', status: 'confusion', turns: 1 });
    expect(enemy.mentality).toBe(19);
    expect(battle.endTurn().some((event) => event.type === 'statusExpired')).toBe(false);

    battle.startTurn();
    expect(enemy.mentality).toBe(23);
    expect(resolver.effectiveMentality(enemy)).toBe(3);
    const next = resolveTurn(battle, KYLE_S1);
    const flip = next.find((event) => event.type === 'cardFlipped' && event.combatantId === 'enemy');
    expect(flip).toMatchObject({ chance: expect.closeTo(0.4893181818, 8) });
    expect(next.some((event) => event.type === 'statusApplied')).toBe(false);
    expect(battle.endTurn()).toContainEqual({ type: 'statusExpired', combatantId: 'enemy', status: 'confusion' });
    expect(enemy.hasStatus('confusion')).toBe(false);
  });

  it.each([
    { turns: 1, remaining: [2, 1, undefined] },
    { turns: 3, remaining: [3, 2, 1, undefined] },
    { turns: 4, remaining: [4, 3, 2, 1, undefined] },
  ])('기존 독 3턴에 $turns 턴을 다시 걸어도 긴 지속을 보존하고 정해진 시점에 만료된다', ({ turns, remaining }) => {
    const combatant = makeCombatant('a', 'main', 'ally');
    combatant.applyStatus('poison', 3, false);

    for (let index = 0; index < remaining.length; index += 1) {
      combatant.beginTurn();
      if (index === 0) {
        combatant.applyStatus('poison', turns, false);
        expect(combatant.stackCount('poison')).toBe(1);
      }
      const expired = combatant.expireStatuses();
      expect(combatant.statuses[0]?.turns).toBe(remaining[index]);
      expect(expired).toEqual(remaining[index] === undefined ? ['poison'] : []);
    }
  });
});
