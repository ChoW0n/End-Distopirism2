//전투 이벤트가 교전 한 건 단위 걸음으로 제대로 묶이는지 본다 (SPEC-005 §9.2)
//목 이벤트를 손으로 만들지 않고 진짜 전투를 여러 시드로 돌려 나온 것을 먹인다

import { describe, expect, it } from 'vitest';
import { Battle } from '../src/domain/battle.js';
import { RandomEnemyAi } from '../src/domain/ai.js';
import { createSeededRng } from '../src/domain/rng.js';
import type { BattleEvent } from '../src/domain/types.js';
import type { CombatantInit } from '../src/domain/combatant.js';
import { toStageSteps, type StageStep } from '../src/render/exchange.js';
import { catalog } from './helpers.js';

const allies: CombatantInit[] = [
  { id: 'a1', characterId: 'helper', side: 'ally' },
  { id: 'a2', characterId: 'incinerator', side: 'ally' },
];
const enemies: CombatantInit[] = [
  { id: 'e1', characterId: 'helper', side: 'enemy' },
  { id: 'e2', characterId: 'incinerator', side: 'enemy' },
];
const context = { isPlayerSide: (id: string) => id.startsWith('a') };

//한 판을 끝까지 돌리며 턴마다 이벤트를 모은다. 아군은 자기를 노리는 적을 되받아 합을 자주 만든다
function playOut(seed: number): BattleEvent[][] {
  const battle = new Battle(catalog, allies, enemies, { rng: createSeededRng(seed), enemyAi: new RandomEnemyAi() });
  const turns: BattleEvent[][] = [];
  for (let t = 0; t < 30 && !battle.isFinished; t++) {
    const start = battle.startTurn();
    if (battle.isFinished) break;
    const targeted = new Map<string, string>();
    for (const e of start) if (e.type === 'enemyTargeted') targeted.set(e.targetId, e.enemyId);
    const alive = battle.sideOf('enemy').filter((c) => !c.isDefeated);
    const orders = battle
      .sideOf('ally')
      .filter((c) => !c.isDefeated)
      .map((c, i) => ({
        actorId: c.id,
        targetId: targeted.get(c.id) ?? (alive[i % alive.length] as { id: string }).id,
        skillId: c.deck[0] as number,
      }));
    battle.submitOrders(orders);
    turns.push(battle.resolve());
    if (battle.isFinished) break;
    turns.push(battle.endTurn());
  }
  return turns;
}

//걸음이 들고 있는 이벤트를 전부 모은다
function carried(steps: StageStep[]): BattleEvent[] {
  const out: BattleEvent[] = [];
  for (const step of steps) {
    if (step.kind === 'state') out.push(step.event);
    else if (step.kind === 'oneSided') out.push(...step.events);
    else {
      for (const round of step.rounds) out.push(...round.events);
      out.push(...step.events);
    }
  }
  return out;
}

//현황판을 바꾸는 이벤트. 하나도 빠지거나 두 번 들어가면 안 된다
const STATEFUL = new Set(['damageApplied', 'mentalityChanged', 'defeated', 'statusApplied', 'statusTicked', 'executed']);

describe('교환 묶기', () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];

  it.each(seeds)('시드 %i: 현황판 이벤트가 빠짐없이 한 번씩 실린다', (seed) => {
    for (const events of playOut(seed)) {
      const steps = toStageSteps(events, context);
      const want = events.filter((e) => STATEFUL.has(e.type));
      const got = carried(steps).filter((e) => STATEFUL.has(e.type));
      expect(got).toHaveLength(want.length);
      for (const e of want) expect(got).toContain(e);
    }
  });

  it.each(seeds)('시드 %i: 합 마무리 피해가 진 쪽 체력 감소와 같다', (seed) => {
    for (const events of playOut(seed)) {
      for (const step of toStageSteps(events, context)) {
        if (step.kind !== 'clash' || !step.finisher) continue;
        const f = step.finisher;
        const applied = step.events
          .filter((e) => e.type === 'damageApplied' && e.combatantId === f.loserId)
          .reduce((sum, e) => sum + (e as { damage: number }).damage, 0);
        expect(f.damage).toBe(applied);
        //마무리가 있으면 마지막 판정 라운드는 이긴 쪽이 있는 라운드다
        const wins = step.rounds.filter((r) => r.type === 'win');
        expect(wins.length).toBeGreaterThan(0);
      }
    }
  });

  it('결과 알림은 아군에게만 붙는다', () => {
    let seen = 0;
    for (const seed of seeds) {
      for (const events of playOut(seed)) {
        for (const step of toStageSteps(events, context)) {
          const callouts =
            step.kind === 'oneSided' ? step.callouts : step.kind === 'clash' ? step.rounds.flatMap((r) => r.callouts) : [];
          for (const c of callouts) {
            expect(context.isPlayerSide(c.combatantId)).toBe(true);
            seen += 1;
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('합 라운드 알림은 드러난 면과 위력을 비교한다 (SPEC-001 v3.0)', () => {
    const face = (f: 'front' | 'back'): string => (f === 'front' ? '앞' : '뒤');
    for (const seed of seeds) {
      for (const events of playOut(seed)) {
        for (const step of toStageSteps(events, context)) {
          if (step.kind !== 'clash') continue;
          for (const round of step.rounds) {
            if (round.type !== 'win') continue;
            for (const c of round.callouts) {
              const mine = c.combatantId === step.attackerId ? round.attackerFlip : round.defenderFlip;
              const other = c.combatantId === step.attackerId ? round.defenderFlip : round.attackerFlip;
              const me = `${face(mine.face)} ${mine.power}`;
              const them = `${face(other.face)} ${other.power}`;
              if (c.combatantId === round.winnerId) expect(c).toMatchObject({ success: true, title: '합 승리', reason: `${me} > ${them}` });
              else expect(c).toMatchObject({ success: false, title: '합 패배', reason: `${me} < ${them}` });
              //드러난 위력이 곧 비교 위력이다
              expect([round.winnerPower, round.loserPower].sort()).toEqual([mine.power, other.power].sort());
            }
          }
        }
      }
    }
  });

  it('일방·합 걸음이 실제로 나온다', () => {
    const kinds = new Set<string>();
    for (const seed of seeds) for (const events of playOut(seed)) for (const step of toStageSteps(events, context)) kinds.add(step.kind);
    expect(kinds).toContain('oneSided');
    expect(kinds).toContain('clash');
    expect(kinds).toContain('state');
  });

  it('합 마무리 한 방이 실제로 나온다', () => {
    let finishers = 0;
    for (const seed of seeds) {
      for (const events of playOut(seed)) {
        for (const step of toStageSteps(events, context)) if (step.kind === 'clash' && step.finisher) finishers += 1;
      }
    }
    expect(finishers).toBeGreaterThan(0);
  });
});
