//M1 러너가 실제 자동 관전의 난수·예약·턴 종료 순서를 보존하는지 검증한다
import { describe, expect, it } from 'vitest';
import { WeightedEnemyAi } from '../src/domain/ai.js';
import { Battle } from '../src/domain/battle.js';
import { ClashResolver } from '../src/domain/clash.js';
import { BattleCatalog } from '../src/domain/data.js';
import { PlanBoard, plannedBattleOptions } from '../src/domain/plan.js';
import { createSeededRng } from '../src/domain/rng.js';
import type { BattleEvent } from '../src/domain/types.js';
import { runSimulation, summarize } from '../scripts/simulation.js';
import { catalog } from './helpers.js';

const setup = { ally: ['kyle'], enemy: ['remnantWalker'] };

//전투를 충분히 늘려 빚 상환 턴을 끝나기 전에 반드시 관찰한다
function longBattle(): BattleCatalog {
  const data = structuredClone(catalog.data);
  for (const c of data.characters) c.maxHp = 10000;
  return new BattleCatalog(data);
}

describe('예약 시뮬레이터', () => {
  it.each([1, 5, 42, 137])('시드 %i의 모든 사건이 실제 자동 관전 배선과 같다', (seed) => {
    const rng = createSeededRng(seed);
    const board = new PlanBoard(catalog, new WeightedEnemyAi(), { catalog, resolver: new ClashResolver(catalog, rng), rng });
    const battle = new Battle(catalog, [{ id: 'a1', characterId: 'kyle', side: 'ally' }],
      [{ id: 'e1', characterId: 'remnantWalker', side: 'enemy' }], { rng, ...plannedBattleOptions(board) });
    board.attach(battle);
    const expected: BattleEvent[] = [];
    for (let t = 0; t < 100 && !battle.isFinished; t++) {
      const start = battle.startTurn();
      expected.push(...start);
      if (battle.isFinished) break;
      if (board.needsPlan('a1')) expected.push(...board.submit('a1', board.choosePlan(battle.combatant('a1'))));
      const aimed = new Map(start.filter((e) => e.type === 'enemyTargeted').map((e) => [e.enemyId, e.targetId]));
      battle.submitOrders(board.orders(aimed));
      expected.push(...battle.resolve());
      if (battle.isFinished) break;
      expected.push(...battle.endTurn(), ...board.endTurn());
    }
    expect(battle.isFinished).toBe(true);
    const actual: BattleEvent[] = [];
    const result = runSimulation(catalog, setup, seed, 'ai', 25, (events) => actual.push(...events));
    expect(actual).toEqual(expected);
    expect(result.winner).toBe(battle.winner);
    expect(result.turns).toBe(battle.turn);
  });

  it('욕심 봇이 빚 한도까지 쓰고 행동 없는 턴에 실제 일방 공격을 받는다', () => {
    const data = longBattle();
    const result = runSimulation(data, setup, 5, 'greedy', 25, (events) => {
      for (const e of events) if (e.type === 'planSet') {
        expect(new Set(e.steps.map((s) => s.skillId)).size).toBe(e.steps.length);
        expect(e.actionPoints).toBeGreaterThanOrEqual(data.rules.actionPoints.floor);
      }
    }, 20);
    expect(result.sides.ally.minActionPoints).toBe(data.rules.actionPoints.floor);
    expect(result.sides.ally.idleTurns).toBeGreaterThan(0);
    expect(result.sides.ally.idleAttacksReceived).toBeGreaterThan(0);
  });

  it('신중 봇은 예약 뒤에도 빚이 없고 20턴 동안 행동 없음이 발생하지 않는다', () => {
    const result = runSimulation(longBattle(), setup, 5, 'cautious', 25, (events) => {
      for (const e of events) if (e.type === 'planSet' && e.combatantId === 'a1') expect(e.actionPoints).toBeGreaterThanOrEqual(0);
    }, 20);
    expect(result.sides.ally.plans).toBeGreaterThan(1);
    expect(result.sides.ally.debtPlans).toBe(0);
    expect(result.sides.ally.idleTurns).toBe(0);
  });

  it('결행 카드를 낸 횟수와 합에서 이겨 공격한 횟수를 구분한다', () => {
    const results = Array.from({ length: 40 }, (_, i) => runSimulation(longBattle(), setup, i + 1, 'ai', 25, undefined, 20));
    for (const r of results) {
      for (const side of ['ally', 'enemy'] as const) expect(r.sides[side].ultimateAttacks).toBeLessThanOrEqual(r.sides[side].ultimateUses);
    }
    expect(results.some((r) => r.sides.ally.ultimateUses > r.sides.ally.ultimateAttacks
      || r.sides.enemy.ultimateUses > r.sides.enemy.ultimateAttacks)).toBe(true);
  });

  it('상한 미종료를 무승부로 합치지 않고 집계 분모에도 남긴다', () => {
    const result = runSimulation(longBattle(), setup, 1, 'ai', 25, undefined, 1);
    const summary = summarize([result]);
    expect(result.timedOut).toBe(true);
    expect(summary.wins).toEqual({ ally: 0, enemy: 0, draw: 0, timeout: 1 });
    expect(summary.runs).toBe(1);
    expect(summary.turns.mean).toBe(1);
  });
});
