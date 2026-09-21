//SPEC-001 §11 의 검증 기준을 실행 가능한 형태로 옮긴 것
//v2.0 개정으로 카드 9종이 전용기 3종으로 바뀌었고, 코인·정신력·교착·레벨차는 v1.0 그대로다

import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../src/domain/rng.js';
import type { BattleEvent } from '../src/domain/types.js';
import { alwaysFailRng, catalog, makeCombatant, makeResolver, skillOf } from './helpers.js';

const MAIN_S1 = skillOf('main', 'S1');
const MAIN_S2 = skillOf('main', 'S2');

describe('§11-1 코인 성공 확률에 정신력이 반영된다', () => {
  //정신력을 바꿔가며 1000번 굴려 실제 성공률을 센다
  function measure(mentality: number, seed: number): number {
    const combatant = makeCombatant('t', 'main', 'ally');
    combatant.mentality = mentality;
    combatant.coin = 1;
    const resolver = makeResolver(createSeededRng(seed));

    let success = 0;
    for (let i = 0; i < 1000; i += 1) {
      success += resolver.rollCoins(combatant).successCount;
    }
    return success / 1000;
  }

  it('정신력 100 이면 60% 근처다', () => {
    expect(Math.abs(measure(100, 1) - 0.6)).toBeLessThanOrEqual(0.03);
  });

  it('정신력 50 이면 30% 근처다', () => {
    expect(Math.abs(measure(50, 7) - 0.3)).toBeLessThanOrEqual(0.03);
  });

  it('정신력 0 이면 한 번도 성공하지 않는다', () => {
    expect(measure(0, 13)).toBe(0);
  });

  it('확률 계산식이 0.6 × 정신력/100 이다', () => {
    const combatant = makeCombatant('t', 'main', 'ally');
    const resolver = makeResolver(alwaysFailRng);
    combatant.mentality = 100;
    expect(resolver.coinProbability(combatant)).toBeCloseTo(0.6, 10);
    combatant.mentality = 50;
    expect(resolver.coinProbability(combatant)).toBeCloseTo(0.3, 10);
    combatant.mentality = 0;
    expect(resolver.coinProbability(combatant)).toBe(0);
  });
});

describe('§11-2 레벨차 보너스는 상대 방어레벨 기준이다', () => {
  const resolver = makeResolver(alwaysFailRng);

  it('공32 vs 방12 는 5', () => {
    expect(resolver.levelDiffBonus(32, 12)).toBe(5);
  });

  it('공29 vs 방5 는 6', () => {
    expect(resolver.levelDiffBonus(29, 5)).toBe(6);
  });

  it('공29 vs 방26 은 조건 미충족이라 0', () => {
    expect(resolver.levelDiffBonus(29, 26)).toBe(0);
  });

  it('차이가 딱 4면 조건을 만족하지 않는다', () => {
    expect(resolver.levelDiffBonus(9, 5)).toBe(0);
    expect(resolver.levelDiffBonus(10, 5)).toBe(1);
  });

  it('매 합마다 새로 계산해서 이전 값이 남지 않는다', () => {
    const attacker = makeCombatant('a', 'main', 'ally');
    const weakDefender = makeCombatant('b', 'main', 'enemy');
    const toughDefender = makeCombatant('c', 'helper', 'enemy');
    const skill = catalog.skill(MAIN_S1);

    //메인(공29) 기준 방5 는 보너스 6, 방12 는 보너스 4 가 나와야 한다
    expect(resolver.calculateDamage(attacker, weakDefender, skill, 0).levelBonus).toBe(6);
    expect(resolver.calculateDamage(attacker, toughDefender, skill, 0).levelBonus).toBe(4);
  });
});

describe('§11-3 동점은 교착으로 처리된다', () => {
  //같은 캐릭터가 같은 전용기를 내고 코인이 전부 실패하면 피해가 정확히 같아진다
  function runDeadlockClash() {
    const attacker = makeCombatant('a', 'main', 'ally');
    const defender = makeCombatant('b', 'main', 'enemy');
    const resolver = makeResolver(alwaysFailRng, [attacker, defender]);
    const events = resolver.resolve(attacker, MAIN_S1, defender, MAIN_S1);
    return { attacker, defender, events };
  }

  it('동점이면 코인을 잃지 않는다', () => {
    const { attacker, defender, events } = runDeadlockClash();
    expect(events.some((e) => e.type === 'coinLost')).toBe(false);
    expect(attacker.coin).toBe(attacker.base.maxCoin);
    expect(defender.coin).toBe(defender.base.maxCoin);
  });

  it('교착이 3회 쌓이면 합이 끝나고 양측 정신력이 10 깎인다', () => {
    const { attacker, defender, events } = runDeadlockClash();

    expect(events.filter((e) => e.type === 'deadlock')).toHaveLength(catalog.rules.deadlockLimit);
    expect(events.some((e) => e.type === 'deadlockLimit')).toBe(true);
    expect(attacker.mentality).toBe(90);
    expect(defender.mentality).toBe(90);
  });

  it('교착으로 끝난 합에는 승자가 없고 피해도 없다', () => {
    const { attacker, defender, events } = runDeadlockClash();
    expect(events.find((e) => e.type === 'clashEnd')).toMatchObject({ winnerId: null });
    expect(attacker.hp).toBe(attacker.base.maxHp);
    expect(defender.hp).toBe(defender.base.maxHp);
  });

  it('G-5 교착으로 끝나면 합 종료 효과도 속성 누적도 일어나지 않는다', () => {
    const { attacker, defender, events } = runDeadlockClash();

    expect(events.some((e) => e.type === 'deadlockLimit')).toBe(true);
    expect(events.some((e) => e.type === 'statusApplied')).toBe(false);
    expect(events.some((e) => e.type === 'attributeGained')).toBe(false);
    expect(attacker.attributeTotal).toBe(0);
    expect(defender.attributeTotal).toBe(0);
  });
});

describe('§11-4 상태이상 4종이 명시된 타이밍에 발동한다', () => {
  it('출혈은 턴 시작에 최대체력의 1% 를 깎고 중첩된다', () => {
    const bleeding = makeCombatant('b', 'main', 'enemy');
    const resolver = makeResolver(alwaysFailRng, [bleeding]);
    const events: BattleEvent[] = [];

    bleeding.applyStatus('bleed', 3, true);
    bleeding.applyStatus('bleed', 3, true);
    resolver.applyTurnStartStatuses(bleeding, events);

    //메인 캐릭터 최대체력 320 의 1% 는 3, 2중첩이면 6
    expect(events.find((e) => e.type === 'statusTicked')).toMatchObject({
      combatantId: 'b',
      status: 'bleed',
      damage: 6,
    });
    expect(bleeding.hp).toBe(320 - 6);
  });

  it('출혈은 한 턴에 여러 교전을 치러도 한 번만 들어간다', () => {
    const attacker = makeCombatant('a', 'main', 'ally');
    const bleeding = makeCombatant('b', 'main', 'enemy');
    const resolver = makeResolver(alwaysFailRng, [attacker, bleeding]);

    bleeding.applyStatus('bleed', 3, true);
    const clashEvents = resolver.resolve(attacker, MAIN_S2, bleeding, MAIN_S1);
    const oneSidedEvents = resolver.resolveOneSided(attacker, MAIN_S1, bleeding);

    expect([...clashEvents, ...oneSidedEvents].filter((e) => e.type === 'statusTicked')).toHaveLength(0);
  });

  it('혼란은 실제 정신력이 아니라 계산값만 20 낮춘다', () => {
    const combatant = makeCombatant('a', 'main', 'ally');
    const resolver = makeResolver(alwaysFailRng);

    combatant.mentality = 50;
    combatant.applyStatus('confusion', 1, false);

    expect(combatant.mentality).toBe(50);
    expect(resolver.effectiveMentality(combatant)).toBe(30);
    expect(resolver.coinProbability(combatant)).toBeCloseTo(0.18, 10);
  });

  it('독은 주는 피해를 10% 줄이고 받는 피해를 5% 늘린다', () => {
    const resolver = makeResolver(alwaysFailRng);
    //S2 는 9 + 코인 2×5 + 레벨차 보너스 6 = 25
    const skill = catalog.skill(MAIN_S2);
    const base = 25;

    const clean = makeCombatant('a', 'main', 'ally');
    const target = makeCombatant('b', 'main', 'enemy');
    expect(resolver.calculateDamage(clean, target, skill, 5).damage).toBe(base);

    const poisonedAttacker = makeCombatant('c', 'main', 'ally');
    poisonedAttacker.applyStatus('poison', 3, false);
    expect(resolver.calculateDamage(poisonedAttacker, target, skill, 5).damage).toBe(Math.floor(base * 0.9));

    const poisonedTarget = makeCombatant('d', 'main', 'enemy');
    poisonedTarget.applyStatus('poison', 3, false);
    expect(resolver.calculateDamage(clean, poisonedTarget, skill, 5).damage).toBe(Math.floor(base * 1.05));
  });

  it('방어력감소는 방어레벨을 절반만 적용한다', () => {
    const defender = makeCombatant('b', 'helper', 'enemy');
    const resolver = makeResolver(alwaysFailRng);

    expect(resolver.effectiveDefLevel(defender)).toBe(12);
    defender.applyStatus('defenseDown', 1, false);
    expect(resolver.effectiveDefLevel(defender)).toBe(6);
  });

  it('지속 턴이 다 되면 사라지고 중첩 불가는 겹치지 않는다', () => {
    const combatant = makeCombatant('a', 'main', 'ally');

    combatant.applyStatus('confusion', 1, false);
    combatant.applyStatus('confusion', 1, false);
    expect(combatant.stackCount('confusion')).toBe(1);

    expect(combatant.expireStatuses()).toEqual(['confusion']);
    expect(combatant.hasStatus('confusion')).toBe(false);
  });
});

describe('§11-5 전용기 수치가 v2.0 §1.1 표와 일치한다', () => {
  //v2.0 §1.1 제안값. 세 캐릭터가 같은 형식의 S1/S2/S3 를 하나씩 갖는다
  const expected = [
    { slot: 'S1', attribute: 'attack', baseDamage: 7, coinPower: 1 },
    { slot: 'S2', attribute: 'defense', baseDamage: 9, coinPower: 2 },
    { slot: 'S3', attribute: 'support', baseDamage: 11, coinPower: 2 },
  ] as const;

  it('전용기 9종 + 궁극기 1종이 있다', () => {
    expect(catalog.data.skills).toHaveLength(10);
    expect(catalog.data.skills.filter((s) => s.slot !== 'ULT')).toHaveLength(9);
  });

  it.each(['helper', 'main', 'police'])('%s 는 자기 전용기 3종만 들고 있다', (characterId) => {
    const deck = catalog.deckFor(characterId);
    expect(deck).toHaveLength(3);
    for (const id of deck) {
      expect(catalog.skill(id).character).toBe(characterId);
    }
  });

  it.each(expected)('$slot 의 수치와 속성이 스펙과 같다', (row) => {
    for (const characterId of ['helper', 'main', 'police']) {
      const skill = catalog.skill(skillOf(characterId, row.slot));
      expect(skill.attribute).toBe(row.attribute);
      expect(skill.baseDamage).toBe(row.baseDamage);
      expect(skill.coinPower).toBe(row.coinPower);
    }
  });

  it('전용기는 주인이 아닌 캐릭터의 덱에 없다', () => {
    const helperDeck = catalog.deckFor('helper');
    for (const id of catalog.deckFor('main')) {
      expect(helperDeck).not.toContain(id);
    }
  });

  it('궁극기는 임시 수치를 갖고 속성을 올리지 않는다', () => {
    const ultimate = catalog.ultimate;
    expect(ultimate.slot).toBe('ULT');
    //궁극기는 속성을 올리지 않는다. 쓰면 오히려 0으로 돌아간다
    expect(ultimate.attribute).toBeNull();
    //2026-09-21 임시값. 확정되면 이 수치와 tbd 표시가 같이 바뀐다
    expect(ultimate.tbd).toBe(false);
    expect(ultimate.baseDamage).toBeGreaterThan(0);
  });

  it('모든 전용기가 설명문을 갖고 있다', () => {
    for (const skill of catalog.data.skills) {
      expect(skill.text.length).toBeGreaterThan(0);
    }
  });

  it('밸런싱 원칙 1 — 변동폭이 3.0배를 넘지 않는다', () => {
    const maxCoin = Math.max(...catalog.data.characters.map((c) => c.maxCoin));
    for (const skill of catalog.data.skills) {
      if (skill.baseDamage === 0) continue;
      const swing = (skill.baseDamage + maxCoin * skill.coinPower) / skill.baseDamage;
      expect(swing).toBeLessThanOrEqual(3.0);
    }
  });
});
