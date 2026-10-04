import { describe, expect, it } from 'vitest';
import { WeightedEnemyAi } from '../src/domain/ai.js';
import { Battle } from '../src/domain/battle.js';
import { createSeededRng } from '../src/domain/rng.js';
import { catalog, makeResolver } from './helpers.js';

describe('상태 지속 수정 후 현재 1대1 전투 회귀', () => {
  it('카일 대 걸음 잔형 200시드가 100턴 안에 끝나고 매 단계 HP·정신력이 범위를 지킨다', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = createSeededRng(seed);
      const ai = new WeightedEnemyAi();
      const battle = new Battle(
        catalog,
        [{ id: 'kyle', characterId: 'kyle', side: 'ally' }],
        [{ id: 'enemy', characterId: 'remnantWalker', side: 'enemy' }],
        { rng, enemyAi: ai },
      );
      const context = { catalog, resolver: makeResolver(rng), rng };
      const kyle = battle.combatant('kyle');
      const enemy = battle.combatant('enemy');

      const checkBounds = () => {
        for (const combatant of battle.combatants) {
          const label = `시드 ${seed}, 턴 ${battle.turn}, 단계 ${battle.phase}, 참가자 ${combatant.id}`;
          expect(Number.isFinite(combatant.hp), label).toBe(true);
          expect(combatant.hp, label).toBeGreaterThanOrEqual(0);
          expect(combatant.hp, label).toBeLessThanOrEqual(combatant.base.maxHp);
          expect(Number.isFinite(combatant.mentality), label).toBe(true);
          expect(combatant.mentality, label).toBeGreaterThanOrEqual(0);
          expect(combatant.mentality, label).toBeLessThanOrEqual(catalog.rules.mentalityMax);
        }
      };

      for (let turn = 0; turn < 100 && !battle.isFinished; turn += 1) {
        battle.startTurn();
        checkBounds();
        if (battle.isFinished) break;

        //아군도 실제 적 AI 규칙으로 고른다. 카드는 난수로 달라져도 같은 시드는 같은 전투다
        const skillId = ai.chooseSkill(kyle, { target: enemy, isClash: true, opponentSkillId: null }, context);
        battle.submitOrders([{ actorId: kyle.id, targetId: enemy.id, skillId }]);
        battle.resolve();
        checkBounds();
        if (battle.isFinished) break;

        battle.endTurn();
        checkBounds();
      }

      expect(battle.isFinished, `시드 ${seed}의 전투 종료`).toBe(true);
      expect(battle.winner, `시드 ${seed}의 승패 확정`).not.toBeNull();
      expect(battle.combatants.filter((combatant) => combatant.isDefeated), `시드 ${seed}의 패자`).toHaveLength(1);
    }
  });
});
