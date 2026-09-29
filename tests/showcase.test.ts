//타수 피해 나누기(SPEC-005 §12.2)와 제작용 자동 시연 걸음(SPEC-005 §13)

import { describe, expect, it } from 'vitest';
import { splitDamage } from '../src/render/exchange.js';
import { showcaseCycle } from '../src/render/showcase.js';

describe('SPEC-005 §12.2 피해 나누기', () => {
  it('똑같이 나누고 나머지는 마지막 타에 얹는다', () => {
    expect(splitDamage(19, 3)).toEqual([6, 6, 7]);
    expect(splitDamage(18, 2)).toEqual([9, 9]);
    expect(splitDamage(24, 1)).toEqual([24]);
  });

  it('합은 규칙의 피해 그대로다', () => {
    for (const [total, hits] of [[2, 3], [0, 2], [31, 4]] as const) {
      const parts = splitDamage(total, hits);
      expect(parts).toHaveLength(hits);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

describe('SPEC-005 §13 자동 시연', () => {
  const steps = showcaseCycle({
    allyId: 'a1',
    enemyId: 'e1',
    //일부러 섞어 넣어도 S1 → S2 → S3 → 궁극기 순서가 된다
    cards: [
      { skillId: 3, slot: 'S3', frontPower: 19 },
      { skillId: 99, slot: 'ULT', frontPower: 33 },
      { skillId: 1, slot: 'S1', frontPower: 24 },
      { skillId: 2, slot: 'S2', frontPower: 18 },
    ],
    enemyCard: { skillId: 50, backPower: 7 },
    enemyMaxHp: 60,
  });
  const clashes = steps.filter((s): s is Extract<typeof s, { kind: 'clash' }> => s.kind === 'clash');

  it('S1 → S2 → S3 → 궁극기 순서로 합을 건다', () => {
    expect(clashes.map((c) => c.attackerSkillId)).toEqual([1, 2, 3, 99]);
  });

  it('아군이 앞면, 적이 뒷면으로 늘 이긴다', () => {
    for (const c of clashes) {
      const round = c.rounds[0];
      expect(round?.type).toBe('win');
      if (round?.type !== 'win') continue;
      expect(round.winnerId).toBe('a1');
      expect(round.attackerFlip.face).toBe('front');
      expect(round.defenderFlip.face).toBe('back');
      expect(c.finisher).toMatchObject({ winnerId: 'a1', loserId: 'e1', damage: round.winnerPower });
    }
  });

  it('적 체력은 1 밑으로 안 내려가고, 한 바퀴 끝에 가득으로 돌아온다', () => {
    const hps = clashes.map((c) => (c.events[0]?.type === 'damageApplied' ? c.events[0].hp : -1));
    expect(hps).toEqual([36, 18, 1, 1]);
    expect(steps.at(-1)).toEqual({ kind: 'state', event: { type: 'damageApplied', combatantId: 'e1', damage: 0, hp: 60 } });
  });
});
