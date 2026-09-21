//v2.0 §2 속성 누적과 §3 궁극기 발동 흐름을 본다
//코인이 전부 실패하는 난수원을 써서 어느 쪽이 이길지 고정한다

import { describe, expect, it } from 'vitest';
import { Battle } from '../src/domain/battle.js';
import { WeightedEnemyAi, type EnemyAi } from '../src/domain/ai.js';
import { alwaysFailRng, catalog, makeCombatant, makeResolver, skillOf } from './helpers.js';
import type { Combatant, CombatantInit } from '../src/domain/combatant.js';

const S1 = skillOf('main', 'S1');
const S2 = skillOf('main', 'S2');
const S3 = skillOf('main', 'S3');
const ULT = catalog.rules.ultimateSkillId;

//대본대로만 고르는 AI. 매칭과 카드를 고정해야 결과를 확인할 수 있다
class ScriptedAi implements EnemyAi {
  constructor(
    private readonly targetId: string,
    private readonly skillId: number,
  ) {}

  chooseTarget(): string {
    return this.targetId;
  }

  chooseSkill(): number {
    return this.skillId;
  }
}

//아군 1 대 적 1 전투. 적은 항상 a1 을 겨누고 지정한 카드만 낸다
function makeBattle(enemySkillId: number) {
  const allies: CombatantInit[] = [{ id: 'a1', characterId: 'main', side: 'ally' }];
  const enemies: CombatantInit[] = [{ id: 'e1', characterId: 'main', side: 'enemy' }];
  return new Battle(catalog, allies, enemies, {
    rng: alwaysFailRng,
    enemyAi: new ScriptedAi('a1', enemySkillId),
  });
}

//한 합을 돌린다. S2(9) 가 S1(7) 을 이긴다
function runClash(attackerSkillId: number, defenderSkillId: number) {
  const attacker = makeCombatant('a', 'main', 'ally');
  const defender = makeCombatant('b', 'main', 'enemy');
  const resolver = makeResolver(alwaysFailRng, [attacker, defender]);
  const events = resolver.resolve(attacker, attackerSkillId, defender, defenderSkillId);
  return { attacker, defender, events };
}

describe('§2 속성 누적', () => {
  it('합에서 이기면 낸 전용기에 대응하는 속성만 오른다', () => {
    const { attacker, defender, events } = runClash(S2, S1);

    //S2 는 방어 속성이다
    expect(attacker.attributes).toEqual({ attack: 0, defense: 1, support: 0 });
    expect(events.filter((e) => e.type === 'attributeGained')).toHaveLength(1);
    expect(events.find((e) => e.type === 'attributeGained')).toMatchObject({
      combatantId: 'a',
      attribute: 'defense',
      value: 1,
    });
    //진 쪽은 아무것도 얻지 못한다
    expect(defender.attributeTotal).toBe(0);
  });

  it('S1 은 공격, S3 는 보조를 올린다', () => {
    expect(runClash(S1, S1).attacker.attributes.attack).toBe(0);
    //S1 끼리는 교착이라 아무도 못 얻는다. S3 로 이기면 보조가 오른다
    expect(runClash(S3, S1).attacker.attributes.support).toBe(1);
  });

  it('재대결을 여러 번 해도 속성은 합당 1회다', () => {
    //메인 캐릭터 코인 5개라 패자가 5번 져야 합이 끝난다
    const { attacker, events } = runClash(S2, S1);

    expect(events.filter((e) => e.type === 'clashRoundWin').length).toBeGreaterThan(1);
    expect(events.filter((e) => e.type === 'attributeGained')).toHaveLength(1);
    expect(attacker.attributeTotal).toBe(1);
  });

  it('일방 공격은 이겨도 속성이 오르지 않는다', () => {
    const attacker = makeCombatant('a', 'main', 'ally');
    const target = makeCombatant('b', 'main', 'enemy');
    const resolver = makeResolver(alwaysFailRng, [attacker, target]);

    const events = resolver.resolveOneSided(attacker, S2, target);

    expect(target.hp).toBeLessThan(target.base.maxHp);
    expect(attacker.attributeTotal).toBe(0);
    expect(events.some((e) => e.type === 'attributeGained')).toBe(false);
  });
});

describe('§3 궁극기', () => {
  //속성 합이 기준에 닿도록 직접 채운다
  function fill(combatant: Combatant, attack: number, defense: number, support: number): void {
    combatant.attributes.attack = attack;
    combatant.attributes.defense = defense;
    combatant.attributes.support = support;
  }

  it('속성 합이 3이 되는 턴의 종료 시점에 ultimateReady 가 나온다', () => {
    const battle = makeBattle(S1);
    const ally = battle.combatant('a1');

    battle.startTurn();
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S2 }]);
    const resolved = battle.resolve();
    //합에서 이겨 방어 1을 얻은 상태에 공격·보조를 채워 합 3을 만든다
    expect(resolved.some((e) => e.type === 'attributeGained')).toBe(true);
    fill(ally, 1, 1, 1);

    const end = battle.endTurn();
    expect(end.some((e) => e.type === 'ultimateReady' && e.combatantId === 'a1')).toBe(true);
    expect(ally.ultimatePending).toBe(true);
    //판정만 했을 뿐 아직 카드는 없다
    expect(ally.deck).not.toContain(ULT);
  });

  it('조건에 못 미치면 ultimateReady 가 나오지 않는다', () => {
    const battle = makeBattle(S1);
    const ally = battle.combatant('a1');

    battle.startTurn();
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S2 }]);
    battle.resolve();
    fill(ally, 1, 1, 0);

    expect(battle.endTurn().some((e) => e.type === 'ultimateReady')).toBe(false);
    expect(ally.ultimatePending).toBe(false);
  });

  it('다음 턴 시작에 궁극기 카드가 덱에 들어온다', () => {
    const battle = makeBattle(S1);
    const ally = battle.combatant('a1');

    battle.startTurn();
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S2 }]);
    battle.resolve();
    fill(ally, 1, 1, 1);
    battle.endTurn();
    expect(ally.deck).toHaveLength(3);

    battle.startTurn();

    expect(ally.ultimatePending).toBe(false);
    expect(ally.deck).toContain(ULT);
    expect(ally.deck).toHaveLength(4);
  });

  it('궁극기를 쓰면 속성이 0으로 돌아가고 카드가 빠진다', () => {
    const battle = makeBattle(S1);
    const ally = battle.combatant('a1');

    //궁극기를 손에 넣는다
    battle.startTurn();
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S2 }]);
    battle.resolve();
    fill(ally, 1, 1, 1);
    battle.endTurn();
    battle.startTurn();
    expect(ally.deck).toContain(ULT);

    //궁극기를 낸다
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: ULT }]);
    const resolved = battle.resolve();

    expect(resolved.some((e) => e.type === 'ultimateUsed' && e.combatantId === 'a1')).toBe(true);
    expect(ally.attributeTotal).toBe(0);
    expect(ally.deck).not.toContain(ULT);
    expect(ally.deck).toHaveLength(3);
  });

  it('속성 조합은 자유다 — 한 속성에 3이 몰려도 발동한다', () => {
    const battle = makeBattle(S1);
    const ally = battle.combatant('a1');

    battle.startTurn();
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S2 }]);
    battle.resolve();
    fill(ally, 3, 0, 0);

    expect(battle.endTurn().some((e) => e.type === 'ultimateReady')).toBe(true);
  });

  it('이미 궁극기를 들고 있으면 다시 알리지 않는다', () => {
    const battle = makeBattle(S1);
    const ally = battle.combatant('a1');

    battle.startTurn();
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S2 }]);
    battle.resolve();
    fill(ally, 1, 1, 1);
    battle.endTurn();
    battle.startTurn();
    expect(ally.deck).toContain(ULT);

    //카드를 쥔 채 속성이 다시 3이어도 중복 통지는 없다
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S2 }]);
    battle.resolve();
    fill(ally, 1, 1, 1);
    expect(battle.endTurn().some((e) => e.type === 'ultimateReady')).toBe(false);
  });
});

describe('§3.2 수치 미정 카드', () => {
  it('AI 는 궁극기를 고르지 않는다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy');
    enemy.addCard(ULT);
    expect(enemy.deck).toContain(ULT);

    const target = makeCombatant('t', 'main', 'ally');
    const ai = new WeightedEnemyAi();
    const context = { catalog, resolver: makeResolver(alwaysFailRng, [enemy, target]), rng: alwaysFailRng };

    for (let i = 0; i < 200; i += 1) {
      const picked = ai.chooseSkill(enemy, { target, isClash: true, opponentSkillId: S1 }, context);
      expect(picked).not.toBe(ULT);
    }
  });
});
