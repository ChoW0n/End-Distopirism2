//D-7 매칭 판정과 일방 공격을 본다
//적의 타겟 선택을 고정한 AI 를 끼워 넣어 매칭 결과를 의도대로 만든다

import { describe, expect, it } from 'vitest';
import { Battle, type Engagement } from '../src/domain/battle.js';
import { WeightedEnemyAi, type EnemyAi } from '../src/domain/ai.js';
import { alwaysFailRng, catalog, makeCombatant, makeResolver } from './helpers.js';
import type { Combatant, CombatantInit } from '../src/domain/combatant.js';

//타겟과 카드를 미리 정해두는 AI. 매칭 결과를 시험하려면 적의 선택이 고정돼야 한다
class ScriptedAi implements EnemyAi {
  constructor(
    private readonly targets: Record<string, string>,
    private readonly skillId = 1001,
  ) {}

  chooseTarget(enemy: Combatant): string {
    const target = this.targets[enemy.id];
    if (!target) throw new Error(`대본에 ${enemy.id} 의 타겟이 없다`);
    return target;
  }

  chooseSkill(): number {
    return this.skillId;
  }
}

const allyIds = ['a1', 'a2', 'a3'];
const enemyIds = ['e1', 'e2', 'e3'];

//3 대 3 전투를 만든다. 적 타겟은 대본대로 고정된다
function makeBattle(targets: Record<string, string>, ai: EnemyAi = new ScriptedAi(targets)) {
  const allies: CombatantInit[] = allyIds.map((id) => ({
    id,
    characterId: 'main',
    side: 'ally' as const,
    deck: [1001, 1004],
  }));
  const enemies: CombatantInit[] = enemyIds.map((id) => ({
    id,
    characterId: 'main',
    side: 'enemy' as const,
    deck: [1001, 1004],
  }));
  return new Battle(catalog, allies, enemies, { rng: alwaysFailRng, enemyAi: ai });
}

//교전 종류별 개수를 센다
function countKinds(engagements: readonly Engagement[]): Record<string, number> {
  const counts: Record<string, number> = { clash: 0, allyOneSided: 0, enemyOneSided: 0 };
  for (const engagement of engagements) {
    counts[engagement.kind] = (counts[engagement.kind] ?? 0) + 1;
  }
  return counts;
}

describe('§3 매칭 판정', () => {
  it('아군 셋이 적 하나에 몰리면 합 1건 + 일방 공격이 아군에게 2건 들어온다', () => {
    //적은 각자 다른 아군을 겨눈다. e1 만 자기를 겨눈 a1 과 상호 지정이 된다
    const battle = makeBattle({ e1: 'a1', e2: 'a2', e3: 'a3' });
    battle.startTurn();
    battle.submitOrders([
      { actorId: 'a1', targetId: 'e1', skillId: 1001 },
      { actorId: 'a2', targetId: 'e1', skillId: 1001 },
      { actorId: 'a3', targetId: 'e1', skillId: 1001 },
    ]);

    const counts = countKinds(battle.plannedEngagements);
    expect(counts.clash).toBe(1);
    //a2, a3 의 공격은 e1 에게 일방으로 들어간다
    expect(counts.allyOneSided).toBe(2);
    //e2, e3 는 아무도 겨누지 않아 각자 타겟을 일방으로 때린다
    expect(counts.enemyOneSided).toBe(2);
  });

  it('서로 같은 상대를 겨누면 합 3건에 일방 공격이 없다', () => {
    const battle = makeBattle({ e1: 'a1', e2: 'a2', e3: 'a3' });
    battle.startTurn();
    battle.submitOrders([
      { actorId: 'a1', targetId: 'e1', skillId: 1001 },
      { actorId: 'a2', targetId: 'e2', skillId: 1001 },
      { actorId: 'a3', targetId: 'e3', skillId: 1001 },
    ]);

    expect(countKinds(battle.plannedEngagements)).toEqual({
      clash: 3,
      allyOneSided: 0,
      enemyOneSided: 0,
    });
  });

  it('어긋나면 양쪽 다 일방 공격이 된다', () => {
    //a1 은 e1 을 겨누는데 e1 은 a2 를 겨눈다
    const battle = makeBattle({ e1: 'a2', e2: 'a1', e3: 'a3' });
    battle.startTurn();
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: 1001 }]);

    const counts = countKinds(battle.plannedEngagements);
    expect(counts.clash).toBe(0);
    expect(counts.allyOneSided).toBe(1);
    expect(counts.enemyOneSided).toBe(3);
  });

  it('적 타겟은 턴 시작에 정해져서 아군 입력에 흔들리지 않는다', () => {
    const battle = makeBattle({ e1: 'a1', e2: 'a2', e3: 'a3' });
    const events = battle.startTurn();

    const targeted = events.filter((e) => e.type === 'enemyTargeted');
    expect(targeted).toHaveLength(3);
    expect(targeted[0]).toMatchObject({ enemyId: 'e1', targetId: 'a1' });
  });
});

describe('§4.7 일방 공격', () => {
  it('이겨도 정신력이 오르지 않는다', () => {
    const attacker = makeCombatant('a', 'main', 'ally', [1001]);
    const target = makeCombatant('b', 'main', 'enemy', [1001]);
    attacker.mentality = 50;
    const resolver = makeResolver(alwaysFailRng, [attacker, target]);

    resolver.resolveOneSided(attacker, 1001, target);

    expect(attacker.mentality).toBe(50);
    expect(target.hp).toBeLessThan(target.base.maxHp);
  });

  it('맞는 쪽 코인이 줄지 않는다', () => {
    const attacker = makeCombatant('a', 'main', 'ally', [1001]);
    const target = makeCombatant('b', 'main', 'enemy', [1001]);
    const resolver = makeResolver(alwaysFailRng, [attacker, target]);

    const events = resolver.resolveOneSided(attacker, 1001, target);

    expect(target.coin).toBe(target.base.maxCoin);
    expect(events.some((e) => e.type === 'coinLost')).toBe(false);
  });

  it('교착이 생기지 않는다', () => {
    //합이었다면 같은 카드끼리 붙어 교착 3회로 끝났을 조합이다
    const attacker = makeCombatant('a', 'main', 'ally', [1001]);
    const target = makeCombatant('b', 'main', 'enemy', [1001]);
    const resolver = makeResolver(alwaysFailRng, [attacker, target]);

    const events = resolver.resolveOneSided(attacker, 1001, target);

    expect(events.some((e) => e.type === 'deadlock')).toBe(false);
    expect(target.hp).toBe(target.base.maxHp - 15);
  });

  it('합 승리 효과는 그대로 발동한다', () => {
    const attacker = makeCombatant('a', 'main', 'ally', [1005]);
    const target = makeCombatant('b', 'main', 'enemy', [1001]);
    const resolver = makeResolver(alwaysFailRng, [attacker, target]);

    //독 바르기의 승리 효과
    resolver.resolveOneSided(attacker, 1005, target);
    expect(target.hasStatus('poison')).toBe(true);
  });

  it('방어 태세로는 일방 공격을 막지 못한다', () => {
    //맞는 쪽은 자기 타겟을 때리는 중이라 카드가 관여하지 않는다
    const attacker = makeCombatant('a', 'main', 'ally', [1001]);
    const target = makeCombatant('b', 'main', 'enemy', [1006]);
    const resolver = makeResolver(alwaysFailRng, [attacker, target]);

    const events = resolver.resolveOneSided(attacker, 1001, target);

    expect(events.some((e) => e.type === 'damageNullified')).toBe(false);
    expect(target.hp).toBeLessThan(target.base.maxHp);
  });

  it('쓰러진 캐릭터가 낀 남은 교전은 건너뛴다', () => {
    //적이 전부 a3 를 겨눠서 a1 · a2 의 공격은 둘 다 일방이 된다
    const battle = makeBattle({ e1: 'a3', e2: 'a3', e3: 'a3' });
    battle.startTurn();
    battle.combatant('e1').hp = 1;
    battle.submitOrders([
      { actorId: 'a1', targetId: 'e1', skillId: 1004 },
      { actorId: 'a2', targetId: 'e1', skillId: 1004 },
    ]);

    const events = battle.resolve();
    //a1 이 e1 을 먼저 눕히므로 a2 의 교전은 실행되지 않는다
    expect(battle.combatant('e1').isDefeated).toBe(true);
    expect(events.filter((e) => e.type === 'oneSidedStart' && e.attackerId === 'a2')).toHaveLength(0);
  });
});

describe('전투 전체가 굴러간다', () => {
  it('가중 AI 로 3 대 3 을 끝까지 돌려도 멈추지 않는다', () => {
    const battle = makeBattle({}, new WeightedEnemyAi());
    let guard = 0;

    while (!battle.isFinished && guard < 200) {
      guard += 1;
      battle.startTurn();
      if (battle.isFinished) break;

      const orders = battle
        .sideOf('ally')
        .filter((c) => !c.isDefeated)
        .map((ally, index) => ({
          actorId: ally.id,
          targetId: battle.sideOf('enemy').filter((e) => !e.isDefeated)[index % 3]?.id ?? 'e1',
          skillId: 1004,
        }));
      battle.submitOrders(orders);
      battle.resolve();
      if (battle.isFinished) break;
      battle.endTurn();
    }

    expect(battle.phase).toBe('finished');
    expect(guard).toBeLessThan(200);
  });
});
