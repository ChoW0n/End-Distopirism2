//SPEC-001 §11 의 검증 기준을 실행 가능한 형태로 옮긴 것
//이 파일이 통과해야 "스펙대로 구현했다"고 말할 수 있다

import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../src/domain/rng.js';
import type { BattleEvent } from '../src/domain/types.js';
import { alwaysFailRng, catalog, makeCombatant, makeResolver } from './helpers.js';

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
    expect(measure(100, 1)).toBeCloseTo(0.6, 1);
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
    const skill = catalog.skill(1001);
    const first = resolver.calculateDamage(attacker, weakDefender, skill, 0);
    const second = resolver.calculateDamage(attacker, toughDefender, skill, 0);

    //메인(공29) 기준 방5 는 보너스 6, 방12 는 보너스 4 가 나와야 한다
    expect(first.levelBonus).toBe(6);
    expect(second.levelBonus).toBe(4);
  });
});

describe('§11-3 동점은 교착으로 처리된다', () => {
  //같은 캐릭터가 같은 카드를 내고 코인이 전부 실패하면 피해가 정확히 같아진다
  function runDeadlockClash() {
    const attacker = makeCombatant('a', 'main', 'ally');
    const defender = makeCombatant('b', 'main', 'enemy');
    const resolver = makeResolver(alwaysFailRng, [attacker, defender]);
    const events = resolver.resolve(attacker, 1001, defender, 1001);
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

    const deadlocks = events.filter((e) => e.type === 'deadlock');
    expect(deadlocks).toHaveLength(catalog.rules.deadlockLimit);
    expect(events.some((e) => e.type === 'deadlockLimit')).toBe(true);
    expect(attacker.mentality).toBe(90);
    expect(defender.mentality).toBe(90);
  });

  it('교착으로 끝난 합에는 승자가 없고 피해도 없다', () => {
    const { attacker, defender, events } = runDeadlockClash();
    const end = events.find((e) => e.type === 'clashEnd');
    expect(end).toMatchObject({ winnerId: null });
    expect(attacker.hp).toBe(attacker.base.maxHp);
    expect(defender.hp).toBe(defender.base.maxHp);
  });

  it('G-5 교착으로 끝나면 합 종료 효과가 양쪽 다 발동하지 않는다', () => {
    //같은 카드를 들려 보내면 피해가 같아져 교착이 된다
    function runWith(skillId: number) {
      const attacker = makeCombatant('a', 'main', 'ally', [skillId]);
      const defender = makeCombatant('b', 'main', 'enemy', [skillId]);
      const resolver = makeResolver(alwaysFailRng, [attacker, defender]);
      const events = resolver.resolve(attacker, skillId, defender, skillId);
      return { attacker, defender, events };
    }

    //사기 진작 — 승리 시 아군 코인 +1, 패배 시 -2. 둘 다 나오면 안 된다
    const morale = runWith(1007);
    expect(morale.events.some((e) => e.type === 'deadlockLimit')).toBe(true);
    expect(morale.attacker.nextTurnCoinModifier).toBe(0);
    expect(morale.defender.nextTurnCoinModifier).toBe(0);

    //파열 — 승리 시 상대 방어력감소, 패배 시 나에게 출혈. 상태이상이 하나도 붙으면 안 된다
    const rupture = runWith(1008);
    expect(rupture.events.some((e) => e.type === 'deadlockLimit')).toBe(true);
    expect(rupture.events.some((e) => e.type === 'statusApplied')).toBe(false);
    expect(rupture.attacker.statuses).toHaveLength(0);
    expect(rupture.defender.statuses).toHaveLength(0);
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
    const ticked = events.find((e) => e.type === 'statusTicked');
    expect(ticked).toMatchObject({ combatantId: 'b', status: 'bleed', damage: 6 });
    expect(bleeding.hp).toBe(320 - 6);
  });

  it('출혈은 한 턴에 여러 교전을 치러도 한 번만 들어간다', () => {
    //D-7 로 한 캐릭터가 합 1건 + 일방 피격까지 받을 수 있어 교전마다 넣으면 중복된다
    const attacker = makeCombatant('a', 'main', 'ally', [1001]);
    const bleeding = makeCombatant('b', 'main', 'enemy', [1001]);
    const resolver = makeResolver(alwaysFailRng, [attacker, bleeding]);

    bleeding.applyStatus('bleed', 3, true);
    const clashEvents = resolver.resolve(attacker, 1001, bleeding, 1001);
    const oneSidedEvents = resolver.resolveOneSided(attacker, 1001, bleeding);

    const ticks = [...clashEvents, ...oneSidedEvents].filter((e) => e.type === 'statusTicked');
    expect(ticks).toHaveLength(0);
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
    //강력한 한 방 8 + 코인 3×5 + 레벨차 보너스 6 = 29
    const skill = catalog.skill(1004);
    const base = 29;

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

describe('§11-5 카드 9종의 수치와 효과가 스펙 표와 일치한다', () => {
  //SPEC §6 표를 그대로 옮긴 기대값
  const expected = [
    { id: 1001, name: '마무리', baseDamage: 9, coinPower: 2, timing: 'onDamage', maxInDeck: 3 },
    { id: 1002, name: '무모한 일격', baseDamage: 6, coinPower: 1, timing: 'beforeDamage', maxInDeck: 3 },
    { id: 1003, name: '연속 찌르기', baseDamage: 7, coinPower: 1, timing: 'onClashEnd', maxInDeck: 3 },
    { id: 1004, name: '강력한 한 방', baseDamage: 8, coinPower: 3, timing: 'beforeDamageCalc', maxInDeck: 3 },
    { id: 1005, name: '독 바르기', baseDamage: 9, coinPower: 1, timing: 'onClashEnd', maxInDeck: 3 },
    { id: 1006, name: '방어 태세', baseDamage: 0, coinPower: 0, timing: 'onTakeDamage', maxInDeck: 1 },
    { id: 1007, name: '사기 진작', baseDamage: 5, coinPower: 1, timing: 'onClashEnd', maxInDeck: 3 },
    { id: 1008, name: '파열', baseDamage: 6, coinPower: 2, timing: 'onClashEnd', maxInDeck: 3 },
    { id: 1009, name: '화염 공격', baseDamage: 9, coinPower: 2, timing: 'onCoinSuccess+onDamageCalc', maxInDeck: 3 },
  ];

  it('9종이 전부 있다', () => {
    expect(catalog.data.skills).toHaveLength(9);
  });

  it.each(expected)('$name 의 수치와 타이밍이 스펙과 같다', (row) => {
    const skill = catalog.skill(row.id);
    expect(skill.name).toBe(row.name);
    expect(skill.baseDamage).toBe(row.baseDamage);
    expect(skill.coinPower).toBe(row.coinPower);
    expect(skill.effect.timing).toBe(row.timing);
    expect(skill.maxInDeck).toBe(row.maxInDeck);
  });

  it('모든 카드가 설명문을 갖고 있다', () => {
    for (const skill of catalog.data.skills) {
      expect(skill.text.length).toBeGreaterThan(0);
    }
  });

  it('밸런싱 원칙 1 — 변동폭이 3.0배를 넘지 않는다', () => {
    //최대 코인 수는 캐릭터 중 가장 많은 값을 쓴다
    const maxCoin = Math.max(...catalog.data.characters.map((c) => c.maxCoin));
    for (const skill of catalog.data.skills) {
      if (skill.baseDamage === 0) continue;
      const swing = (skill.baseDamage + maxCoin * skill.coinPower) / skill.baseDamage;
      expect(swing).toBeLessThanOrEqual(3.0);
    }
  });
});
