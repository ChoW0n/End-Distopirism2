//교전 중 결단 (SPEC-008 테스트 버전). 기본 자세는 지금 계산과 같고, 자세 넷이 수치대로 걸리는지 본다
import { describe, expect, it } from 'vitest';
import { Battle } from '../src/domain/battle.js';
import { createSeededRng, type Rng } from '../src/domain/rng.js';
import type { BattleEvent } from '../src/domain/types.js';
import { catalog, makeCombatant, makeResolver, skillOf } from './helpers.js';

const d = catalog.decisions;
const S1 = skillOf('main', 'S1');

//정해 둔 값을 차례로 내는 난수원
function sequenceRng(values: number[]): Rng {
  let i = 0;
  return { next: () => values[i++ % values.length] as number };
}

//양쪽 피해 (damageApplied 합)
function damageTo(events: BattleEvent[], id: string): number {
  return events.filter((e): e is Extract<BattleEvent, { type: 'damageApplied' }> => e.type === 'damageApplied' && e.combatantId === id).reduce((s, e) => s + e.damage, 0);
}

describe('결단 수치', () => {
  it('battle-data.json 에 있다', () => {
    expect(d).not.toBeNull();
    expect(d?.press.frontChanceBonus).toBeGreaterThan(0);
  });
});

describe('기본 자세는 지금 계산과 같다', () => {
  it('resolve() 와 resolveNext(steady) 를 끝까지 부른 결과가 같다 (같은 시드)', () => {
    for (const seed of [1, 7, 42]) {
      const make = () =>
        new Battle(
          catalog,
          [
            { id: 'a1', characterId: 'main', side: 'ally' },
            { id: 'a2', characterId: 'helper', side: 'ally' },
          ],
          [
            { id: 'e1', characterId: 'main', side: 'enemy' },
            { id: 'e2', characterId: 'helper', side: 'enemy' },
          ],
          { rng: createSeededRng(seed) },
        );
      const a = make();
      const b = make();
      const orders = (_battle: Battle) => [
        { actorId: 'a1', targetId: 'e1', skillId: S1 },
        { actorId: 'a2', targetId: 'e2', skillId: skillOf('helper', 'S1') },
      ];
      const ea = a.startTurn();
      const eb = b.startTurn();
      expect(eb).toEqual(ea);
      a.submitOrders(orders(a));
      b.submitOrders(orders(b));
      const ra = a.resolve();
      const rb: BattleEvent[] = [];
      while (b.phase === 'resolving') rb.push(...b.resolveNext('steady'));
      expect(rb).toEqual(ra);
      expect(b.phase).toBe(a.phase);
    }
  });
});

describe('결단을 묻는 교전', () => {
  it('아군이 낀 합·아군 일방 공격만 묻고, 다 돌면 null', () => {
    const battle = new Battle(catalog, [{ id: 'a1', characterId: 'main', side: 'ally' }], [{ id: 'e1', characterId: 'main', side: 'enemy' }], { rng: createSeededRng(3) });
    battle.startTurn();
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S1 }]);
    const req = battle.peekDecision();
    expect(req?.allyId).toBe('a1');
    expect(req?.opponentId).toBe('e1');
    expect(['clash', 'oneSided']).toContain(req?.kind);
    const events = battle.resolveNext('press');
    expect(events[0]).toEqual({ type: 'stanceTaken', combatantId: 'a1', stance: 'press' });
    while (battle.phase === 'resolving') {
      //남은 교전은 적의 일방 공격뿐이면 묻지 않는다
      const next = battle.peekDecision();
      if (next) expect(next.allyId).toBe('a1');
      battle.resolveNext();
    }
    expect(battle.peekDecision()).toBeNull();
  });
});

describe('자세 효과', () => {
  it('밀어붙인다: 정신력을 치르고 앞면 확률이 오른다', () => {
    if (!d) throw new Error('결단 수치 없음');
    //0.9 는 기본 확률(최대 0.8)로는 뒷면, 밀어붙이면(상한 0.95) 앞면
    const plain = makeCombatant('a', 'main', 'ally');
    const pushed = makeCombatant('b', 'main', 'ally');
    const resolver = makeResolver(sequenceRng([0.9]));
    expect(resolver.flipCard(plain, catalog.skill(S1)).face).toBe('back');
    const events: BattleEvent[] = [];
    resolver.takeStance(pushed, 'press', events);
    expect(pushed.mentality).toBe(catalog.rules.mentalityMax - d.press.mentalityCost);
    expect(resolver.flipCard(pushed, catalog.skill(S1), 'press').face).toBe('front');
  });

  it('끝장낸다·받아낸다: 피해 배수가 걸리고, 받아내며 지면 정신력이 조금 돌아온다', () => {
    if (!d) throw new Error('결단 수치 없음');
    //공격자 앞면, 방어자 뒷면 → 공격자 승
    const run = (stances: { attacker?: 'allIn' | 'steady'; defender?: 'brace' | 'steady' }) => {
      const att = makeCombatant('att', 'main', 'ally');
      const def = makeCombatant('def', 'main', 'enemy');
      const events = makeResolver(sequenceRng([0, 1])).resolve(att, S1, def, S1, stances);
      return { dmg: damageTo(events, 'def'), events };
    };
    const base = run({}).dmg;
    expect(base).toBeGreaterThan(0);
    expect(run({ attacker: 'allIn' }).dmg).toBe(Math.floor(base * d.allIn.dealtMultiplier));
    const braced = run({ defender: 'brace' });
    expect(braced.dmg).toBe(Math.floor(base * d.brace.takenMultiplier));
    expect(braced.events.some((e) => e.type === 'mentalityChanged' && e.reason === 'stance' && e.delta === d.brace.mentalityOnLose)).toBe(true);
  });

  it('일방 공격: 받아낸다는 주는 피해만 준다', () => {
    if (!d) throw new Error('결단 수치 없음');
    const run = (stance: 'steady' | 'brace') => {
      const att = makeCombatant('att', 'main', 'ally');
      const def = makeCombatant('def', 'main', 'enemy');
      return damageTo(makeResolver(sequenceRng([0])).resolveOneSided(att, S1, def, stance), 'def');
    };
    expect(run('brace')).toBe(Math.floor(run('steady') * d.brace.dealtMultiplier));
  });
});
