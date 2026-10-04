//행동력과 여러 턴 예약 (SPEC-001 v4.0 §7) 검증

import { describe, expect, it } from 'vitest';
import { WeightedEnemyAi } from '../src/domain/ai.js';
import { Battle } from '../src/domain/battle.js';
import { ClashResolver } from '../src/domain/clash.js';
import { PlanBoard, PlanError, plannedBattleOptions } from '../src/domain/plan.js';
import { createSeededRng } from '../src/domain/rng.js';
import type { BattleEvent } from '../src/domain/types.js';
import { catalog, skillOf } from './helpers.js';

const K1 = skillOf('kyle', 'S1');
const K2 = skillOf('kyle', 'S2');
const K3 = skillOf('kyle', 'S3');

//카일 대 걸음 잔형 한 판과 예약판
function setup(seed = 1) {
  const rng = createSeededRng(seed);
  const board = new PlanBoard(catalog, new WeightedEnemyAi(), { catalog, resolver: new ClashResolver(catalog, rng), rng });
  const battle = new Battle(
    catalog,
    [{ id: 'a1', characterId: 'kyle', side: 'ally' }],
    [{ id: 'e1', characterId: 'remnantWalker', side: 'enemy' }],
    { rng, ...plannedBattleOptions(board) },
  );
  board.attach(battle);
  return { battle, board };
}

//예약대로 한 턴을 돌린다
function runTurn(battle: Battle, board: PlanBoard): BattleEvent[] {
  const events = battle.startTurn();
  if (battle.isFinished) return events;
  const aimed = new Map<string, string>();
  for (const e of events) if (e.type === 'enemyTargeted') aimed.set(e.enemyId, e.targetId);
  battle.submitOrders(board.orders(aimed));
  events.push(...battle.resolve());
  if (battle.isFinished) return events;
  events.push(...battle.endTurn(), ...board.endTurn());
  return events;
}

//아군 예약을 넣고 한 턴을 돌린다
function runTurnWith(battle: Battle, board: PlanBoard, steps: { skillId: number; targetId: string }[]): BattleEvent[] {
  const events = battle.startTurn();
  if (battle.isFinished) return events;
  board.submit('a1', steps);
  const aimed = new Map<string, string>();
  for (const e of events) if (e.type === 'enemyTargeted') aimed.set(e.enemyId, e.targetId);
  battle.submitOrders(board.orders(aimed));
  events.push(...battle.resolve());
  if (battle.isFinished) return events;
  events.push(...battle.endTurn(), ...board.endTurn());
  return events;
}

const rules = catalog.rules.actionPoints;

describe('행동력', () => {
  it('시작 2, 턴 종료마다 +1, 최대 4 를 넘지 않는다', () => {
    const { battle, board } = setup();
    expect(board.actionPoints('a1')).toBe(rules.start);
    battle.startTurn();
    board.submit('a1', [{ skillId: K1, targetId: 'e1' }]);
    expect(board.actionPoints('a1')).toBe(rules.start - 1);
    board.endTurn();
    expect(board.actionPoints('a1')).toBe(rules.start);
    for (let i = 0; i < 6; i++) board.endTurn();
    expect(board.actionPoints('a1')).toBe(rules.max);
  });

  it('카드 비용: S1 1 · S2 1 · S3 2 · 결행 1 (v4.0 §9)', () => {
    expect([K1, K2, K3, catalog.rules.ultimateSkillId].map((id) => catalog.skill(id).apCost)).toEqual([1, 1, 2, 1]);
  });
});

describe('예약', () => {
  it('비용 합만큼 즉시 줄고, 빚을 져서 길게 짤 수 있다. 빚 한도 아래는 거부', () => {
    const { battle, board } = setup();
    battle.startTurn();
    //2 - (2+1+1) = -2 ≥ -3
    board.submit('a1', [{ skillId: K3, targetId: 'e1' }, { skillId: K2, targetId: 'e1' }, { skillId: K1, targetId: 'e1' }]);
    expect(board.actionPoints('a1')).toBe(-2);
    expect(board.steps('a1').map((s) => s.skillId)).toEqual([K3, K2, K1]);
  });

  it('빚 한도를 넘는 예약, 같은 카드 두 번, 예약 중 다시 짜기는 거부한다', () => {
    const { battle, board } = setup();
    battle.startTurn();
    expect(board.problem('a1', [{ skillId: K1, targetId: 'e1' }, { skillId: K1, targetId: 'e1' }])).toMatch(/한 번만/);
    expect(board.problem('a1', [{ skillId: K1, targetId: 'a1' }])).toMatch(/같은 진영/);
    board.submit('a1', [{ skillId: K1, targetId: 'e1' }]);
    expect(() => board.submit('a1', [{ skillId: K2, targetId: 'e1' }])).toThrow(PlanError);
  });

  it('행동력이 1 미만이면 예약할 수 없다', () => {
    const { battle, board } = setup();
    battle.startTurn();
    board.submit('a1', [{ skillId: K3, targetId: 'e1' }, { skillId: K2, targetId: 'e1' }, { skillId: K1, targetId: 'e1' }]);
    //세 칸을 다 쓰면 -2 + 3 = 1. 두 칸까지는 예약이 남아 있다
    board.endTurn();
    board.endTurn();
    expect(board.steps('a1')).toHaveLength(1);
    board.endTurn();
    expect(board.actionPoints('a1')).toBe(1);
    expect(board.needsPlan('a1')).toBe(true);
  });
});

describe('진행', () => {
  it('예약 맨 앞 카드로 행동하고 턴 종료에 그 칸을 뺀다. 적 예약은 아군 입력 전에 공개된다', () => {
    const { battle, board } = setup(3);
    const start = battle.startTurn();
    expect(start.some((e) => e.type === 'planSet' && e.combatantId === 'e1')).toBe(true);
    expect(battle.phase).toBe('awaitingOrders');
    board.submit('a1', [{ skillId: K2, targetId: 'e1' }, { skillId: K1, targetId: 'e1' }]);
    const aimed = new Map(start.filter((e) => e.type === 'enemyTargeted').map((e) => [e.enemyId, e.targetId] as [string, string]));
    const orders = board.orders(aimed);
    expect(orders).toEqual([{ actorId: 'a1', targetId: 'e1', skillId: K2 }]);
    battle.submitOrders(orders);
    const events = battle.resolve();
    let used: number | null = null;
    for (const e of events) {
      if (e.type === 'clashStart' && e.attackerId === 'a1') used = e.attackerSkillId;
      if (e.type === 'oneSidedStart' && e.attackerId === 'a1') used = e.skillId;
    }
    expect(used).toBe(K2);
    battle.endTurn();
    board.endTurn();
    expect(board.steps('a1').map((s) => s.skillId)).toEqual([K1]);
  });

  it('행동력 1 에서 빚을 크게 지면 예약이 끝난 뒤 행동 없는 턴이 오고, 적이 겨누면 일방으로 맞는다', () => {
    const { battle, board } = setup(5);
    //1턴: 잔향 하나로 행동력 0, 턴 종료에 1
    runTurnWith(battle, board, [{ skillId: K3, targetId: 'e1' }]);
    expect(board.actionPoints('a1')).toBe(1);
    //2턴: 1 에서 세 칸(비용 4)을 예약해 -3. 세 턴 뒤 0 이라 행동이 없다
    runTurnWith(battle, board, [{ skillId: K3, targetId: 'e1' }, { skillId: K2, targetId: 'e1' }, { skillId: K1, targetId: 'e1' }]);
    runTurn(battle, board);
    runTurn(battle, board);
    if (battle.isFinished) return;
    expect(board.actionPoints('a1')).toBe(0);
    const events = battle.startTurn();
    if (battle.isFinished) return;
    expect(events.some((e) => e.type === 'idle' && e.combatantId === 'a1')).toBe(true);
    expect(board.needsPlan('a1')).toBe(false);
    expect(board.orders(new Map())).toEqual([]);
    battle.submitOrders([]);
    expect(battle.resolve().some((e) => e.type === 'clashStart')).toBe(false);
  });

  it('카일 대 걸음 잔형 예약 판이 40 시드 모두 30 턴 안에 끝나고 행동력이 한도 안에 있다', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { battle, board } = setup(seed);
      for (let t = 0; t < 30 && !battle.isFinished; t++) {
        const events = battle.startTurn();
        if (battle.isFinished) break;
        //아군도 AI 로 예약한다 (자동 관전과 같다)
        if (board.needsPlan('a1')) board.submit('a1', board.choosePlan(battle.combatant('a1')));
        const aimed = new Map<string, string>();
        for (const e of events) if (e.type === 'enemyTargeted') aimed.set(e.enemyId, e.targetId);
        battle.submitOrders(board.orders(aimed));
        battle.resolve();
        if (battle.isFinished) break;
        battle.endTurn();
        board.endTurn();
        for (const id of ['a1', 'e1']) {
          expect(board.actionPoints(id)).toBeGreaterThanOrEqual(rules.floor);
          expect(board.actionPoints(id)).toBeLessThanOrEqual(rules.max);
        }
      }
      expect(battle.isFinished, `seed ${seed}`).toBe(true);
    }
  });
});
