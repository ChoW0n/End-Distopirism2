//여러 턴 예약 입력 (SPEC-001 v4.0 §3·§6) 검증
import { describe, expect, it } from 'vitest';
import { PlanInput, type PlanBudget } from '../src/ui/plan-input.js';
import { catalog, skillOf } from './helpers.js';

const K1 = skillOf('kyle', 'S1');
const K2 = skillOf('kyle', 'S2');
const K3 = skillOf('kyle', 'S3');
const ap = catalog.rules.actionPoints;

function make(actionPoints: number): PlanInput {
  const budget: PlanBudget = { actionPoints, floor: ap.floor, max: ap.max, regenPerTurn: ap.regenPerTurn, cost: (id) => catalog.skill(id).apCost };
  return new PlanInput([{ id: 'a1', characterId: 'kyle', deck: [K1, K2, K3] }], ['e1'], new Map([['e1', 'a1']]), new Map([['a1', budget]]));
}

describe('예약 입력', () => {
  it('행동력 1에서 얻은 결행을 빚 없이 예약하고 비용 미리보기를 맞춘다', () => {
    const skillId = catalog.rules.ultimateSkillId;
    const budget: PlanBudget = { actionPoints: 1, floor: 0, max: ap.max, regenPerTurn: ap.regenPerTurn, cost: (id) => catalog.skill(id).apCost };
    const input = new PlanInput([{ id: 'a1', characterId: 'kyle', deck: [K1, K2, K3, skillId] }],
      ['e1'], new Map(), new Map([['a1', budget]]));
    expect(input.selectCard(skillId)).toBe(true);
    expect(input.budgetOf('a1')).toMatchObject({ after: 0, end: 1 });
    expect(input.ready).toBe(true);
  });

  it('적이 하나면 대상이 미리 골라지고, 누른 순서가 턴 순서다', () => {
    const input = make(2);
    expect(input.selectedTarget).toBe('e1');
    input.selectCard(K3);
    input.selectCard(K1);
    expect(input.stepsOf('a1').map((s) => s.skillId)).toEqual([K3, K1]);
    expect(input.orderOf('a1')).toEqual({ actorId: 'a1', targetId: 'e1', skillId: K3 });
    expect(input.ready).toBe(true);
  });

  it('다시 누르면 빠지고 뒤 칸이 당겨진다', () => {
    const input = make(2);
    input.selectCard(K1);
    input.selectCard(K2);
    input.selectCard(K1);
    expect(input.stepsOf('a1').map((s) => s.skillId)).toEqual([K2]);
  });

  it('예약 뒤·예약이 끝난 뒤 행동력을 셈하고, 빚 한도를 넘는 카드는 막는다', () => {
    const input = make(1);
    input.selectCard(K3);
    input.selectCard(K2);
    expect(input.budgetOf('a1')).toMatchObject({ after: -2, end: 0 });
    //-2 에서 물금(1) 을 더하면 -3 이라 된다
    expect(input.canToggle(K1)).toBe(true);
    input.selectCard(K1);
    expect(input.budgetOf('a1')).toMatchObject({ after: -3, end: 0 });
    //빚 한도를 1 로 잡으면(빚 불가) 행동력 1 에서 잔향(2)은 못 더한다
    const strict = new PlanInput([{ id: 'a1', characterId: 'kyle', deck: [K1, K2, K3] }], ['e1'], new Map(), new Map([['a1', { actionPoints: 1, floor: 0, max: ap.max, regenPerTurn: 1, cost: (id: number) => catalog.skill(id).apCost }]]));
    expect(strict.canToggle(K3)).toBe(false);
    expect(strict.selectCard(K3)).toBe(false);
  });
});
