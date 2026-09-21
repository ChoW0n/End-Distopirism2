//턴 상태머신이 SPEC §3 의 순서대로 도는지 본다

import { describe, expect, it } from 'vitest';
import { Battle, BattleFlowError } from '../src/domain/battle.js';
import { RandomEnemyAi } from '../src/domain/ai.js';
import { createSeededRng } from '../src/domain/rng.js';
import { alwaysFailRng, catalog, skillOf } from './helpers.js';

import type { CombatantInit } from '../src/domain/combatant.js';

const MAIN_S1 = skillOf('main', 'S1');
const MAIN_S2 = skillOf('main', 'S2');
const POLICE_S1 = skillOf('police', 'S1');

const allies: CombatantInit[] = [
  { id: 'a1', characterId: 'main', side: 'ally' },
];
const enemies: CombatantInit[] = [
  { id: 'e1', characterId: 'police', side: 'enemy' },
];

//기본 전투 하나를 만든다
function makeBattle() {
  return new Battle(catalog, allies, enemies, { rng: alwaysFailRng, enemyAi: new RandomEnemyAi() });
}

describe('턴 진행', () => {
  it('턴을 열면 코인이 회복되고 입력 대기로 넘어간다', () => {
    const battle = makeBattle();
    const events = battle.startTurn();

    expect(battle.turn).toBe(1);
    expect(battle.phase).toBe('awaitingOrders');
    expect(events.filter((e) => e.type === 'coinRestored')).toHaveLength(2);
    expect(battle.combatant('a1').coin).toBe(5);
  });

  it('다음 턴 코인 보정치가 회복에 반영되고 한 번 쓰면 사라진다', () => {
    const battle = makeBattle();
    const main = battle.combatant('a1');
    main.nextTurnCoinModifier = 2;

    battle.startTurn();
    expect(main.coin).toBe(7);
    expect(main.nextTurnCoinModifier).toBe(0);
  });

  it('단계를 건너뛰면 막는다', () => {
    const battle = makeBattle();
    expect(() => battle.resolve()).toThrow(BattleFlowError);
    battle.startTurn();
    expect(() => battle.startTurn()).toThrow(BattleFlowError);
  });

  it('덱에 없는 카드나 같은 진영 대상은 거부한다', () => {
    const battle = makeBattle();
    battle.startTurn();

    expect(() => battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: POLICE_S1 }])).toThrow(BattleFlowError);
    expect(() => battle.submitOrders([{ actorId: 'a1', targetId: 'a1', skillId: MAIN_S1 }])).toThrow(BattleFlowError);
    expect(() => battle.submitOrders([{ actorId: 'e1', targetId: 'a1', skillId: POLICE_S1 }])).toThrow(BattleFlowError);
  });

  it('턴을 닫으면 정신력이 30 까지만 돌아온다', () => {
    const battle = makeBattle();
    const main = battle.combatant('a1');
    const enemy = battle.combatant('e1');

    battle.startTurn();
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: MAIN_S1 }]);
    battle.resolve();

    main.mentality = 10;
    enemy.mentality = 50;
    battle.endTurn();

    expect(main.mentality).toBe(14);
    expect(enemy.mentality).toBe(50);
  });

  it('정신력 회복은 상한 30 을 넘지 않는다', () => {
    const battle = makeBattle();
    const main = battle.combatant('a1');

    battle.startTurn();
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: MAIN_S1 }]);
    battle.resolve();

    main.mentality = 28;
    battle.endTurn();
    expect(main.mentality).toBe(30);
  });

  it('턴이 끝나면 상태이상 지속 턴이 줄어든다', () => {
    const battle = makeBattle();
    const enemy = battle.combatant('e1');

    battle.startTurn();
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: MAIN_S1 }]);
    battle.resolve();

    enemy.applyStatus('defenseDown', 1, false);
    const events = battle.endTurn();

    expect(enemy.hasStatus('defenseDown')).toBe(false);
    expect(events.some((e) => e.type === 'statusExpired')).toBe(true);
  });
});

describe('전투 종료', () => {
  it('한쪽이 전멸하면 전투가 끝난다', () => {
    const battle = new Battle(catalog, allies, enemies, {
      rng: createSeededRng(3),
      enemyAi: new RandomEnemyAi(),
    });
    const enemy = battle.combatant('e1');

    battle.startTurn();
    enemy.hp = 1;
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: MAIN_S2 }]);
    const events = battle.resolve();

    expect(enemy.isDefeated).toBe(true);
    expect(battle.phase).toBe('finished');
    expect(battle.winner).toBe('ally');
    expect(events.some((e) => e.type === 'battleEnd')).toBe(true);
  });
});

describe('덱 검증', () => {
  it('덱은 캐릭터의 전용기 3종에서 나온다', () => {
    const battle = makeBattle();
    expect(battle.combatant('a1').deck).toEqual(catalog.deckFor('main'));
    expect(battle.combatant('e1').deck).toEqual(catalog.deckFor('police'));
  });

  it('같은 카드를 두 장 넣으면 막는다', () => {
    expect(() => catalog.validateDeck([MAIN_S1, MAIN_S1])).toThrow();
    expect(() => catalog.validateDeck(catalog.deckFor('main'))).not.toThrow();
  });
});
