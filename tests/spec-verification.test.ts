//SPEC-001 §11 의 검증 기준을 실행 가능한 형태로 옮긴 것
//v2.0 개정으로 카드 9종이 전용기 3종으로 바뀌었고, v3.0 개정(D-23)으로 코인이 없어지고 카드 앞/뒤가 생겼다

import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../src/domain/rng.js';
import type { BattleEvent } from '../src/domain/types.js';
import { alwaysBackRng, alwaysFrontRng, catalog, makeCombatant, makeResolver, skillOf } from './helpers.js';

const MAIN_S1 = skillOf('main', 'S1');
const MAIN_S2 = skillOf('main', 'S2');

describe('v3.0 §2 앞면 확률에 정신력·체력이 반영된다', () => {
  const skill = catalog.skill(MAIN_S1);

  //정신력·체력을 바꿔가며 1000번 뒤집어 실제 앞면 비율을 센다
  function measure(mentality: number, hp: number, seed: number): number {
    const combatant = makeCombatant('t', 'main', 'ally');
    combatant.mentality = mentality;
    combatant.hp = hp;
    const resolver = makeResolver(createSeededRng(seed));
    let front = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (resolver.flipCard(combatant, skill).face === 'front') front += 1;
    }
    return front / 1000;
  }

  it('정신력·체력이 가득이면 카드 최대(80%) 근처다', () => {
    expect(Math.abs(measure(100, 112, 1) - 0.8)).toBeLessThanOrEqual(0.03);
  });

  it('정신력 0 · 체력 가득이면 가운데(55%) 근처다', () => {
    expect(Math.abs(measure(0, 112, 7) - 0.55)).toBeLessThanOrEqual(0.03);
  });

  it('확률 계산식이 최소 + (최대 − 최소) × (정신력 비 · 체력 비 평균) 이다', () => {
    const combatant = makeCombatant('t', 'main', 'ally');
    const resolver = makeResolver(alwaysBackRng);
    expect(resolver.frontChance(combatant, skill)).toBeCloseTo(0.8, 10);
    combatant.mentality = 50;
    combatant.hp = 56;
    expect(resolver.frontChance(combatant, skill)).toBeCloseTo(0.3 + 0.5 * 0.5, 10);
    combatant.mentality = 0;
    combatant.hp = 0;
    expect(resolver.frontChance(combatant, skill)).toBeCloseTo(0.3, 10);
  });

  it('카드마다 최대가 다르다. 효과·밸류가 큰 카일 카드는 앞면이 덜 나온다', () => {
    const kyle = makeCombatant('k', 'kyle', 'ally');
    const resolver = makeResolver(alwaysBackRng);
    expect(resolver.frontChance(kyle, catalog.skill(skillOf('kyle', 'S1')))).toBeCloseTo(0.75, 10);
    expect(resolver.frontChance(kyle, catalog.skill(skillOf('kyle', 'S2')))).toBeCloseTo(0.7, 10);
    expect(resolver.frontChance(kyle, catalog.skill(skillOf('kyle', 'S3')))).toBeCloseTo(0.75, 10);
  });

  it('드러난 면의 위력이 그 교전의 위력이다', () => {
    const combatant = makeCombatant('t', 'main', 'ally');
    expect(makeResolver(alwaysFrontRng).flipCard(combatant, skill)).toMatchObject({ face: 'front', power: skill.frontPower });
    expect(makeResolver(alwaysBackRng).flipCard(combatant, skill)).toMatchObject({ face: 'back', power: skill.backPower });
  });

  it('모든 카드의 앞면 확률이 30~80% 안에 있다', () => {
    for (const s of catalog.data.skills) {
      expect(s.frontChance[0]).toBeGreaterThanOrEqual(0.3);
      expect(s.frontChance[1]).toBeLessThanOrEqual(0.8);
      expect(s.frontPower).toBeGreaterThanOrEqual(s.backPower);
    }
  });
});

describe('§11-2 레벨차 보너스는 상대 방어레벨 기준이다', () => {
  const resolver = makeResolver(alwaysBackRng);

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
    const power = catalog.skill(MAIN_S1).backPower;

    //메인(공29) 기준 방5 는 보너스 6, 방12 는 보너스 4 가 나와야 한다
    expect(resolver.calculateDamage(attacker, weakDefender, power).levelBonus).toBe(6);
    expect(resolver.calculateDamage(attacker, toughDefender, power).levelBonus).toBe(4);
  });

  it('v3.0 §3 피해는 이긴 쪽이 드러낸 위력 + 레벨차 보너스다', () => {
    const attacker = makeCombatant('a', 'main', 'ally');
    const defender = makeCombatant('b', 'main', 'enemy');
    //S2 앞 19 vs S1 앞 12 → S2 가 이긴다. 공29 vs 방5 보너스 6
    const events = makeResolver(alwaysFrontRng).resolve(attacker, MAIN_S2, defender, MAIN_S1);
    expect(events.find((e) => e.type === 'damageApplied')).toMatchObject({
      combatantId: 'b',
      damage: catalog.skill(MAIN_S2).frontPower + 6,
    });
  });
});

describe('§11-3 동점은 교착으로 처리된다 (v3.0: 다시 뒤집는다)', () => {
  //같은 캐릭터가 같은 전용기를 내고 늘 뒷면이 나오면 위력이 정확히 같아진다
  function runDeadlockClash() {
    const attacker = makeCombatant('a', 'main', 'ally');
    const defender = makeCombatant('b', 'main', 'enemy');
    const resolver = makeResolver(alwaysBackRng, [attacker, defender]);
    const events = resolver.resolve(attacker, MAIN_S1, defender, MAIN_S1);
    return { attacker, defender, events };
  }

  it('위력이 같으면 양쪽이 카드를 다시 뒤집는다', () => {
    const { events } = runDeadlockClash();
    //교착 한도 3 번 모두 양쪽이 한 장씩 뒤집는다
    expect(events.filter((e) => e.type === 'cardFlipped')).toHaveLength(2 * catalog.rules.deadlockLimit);
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

describe('§4.6 합에서 지면 정신력이 깎인다 [D-21]', () => {
  //강화 공격(뒤 9)이 무난한 공격(뒤 7)을 늘 이긴다. v3.0 은 합 한 번에 판정도 한 번이다
  it('진 쪽은 한 번 5 깎이고 이긴 쪽은 상한에서 멈춘다', () => {
    const attacker = makeCombatant('a', 'main', 'ally');
    const defender = makeCombatant('b', 'main', 'enemy');
    const resolver = makeResolver(alwaysBackRng, [attacker, defender]);
    const events = resolver.resolve(attacker, MAIN_S2, defender, MAIN_S1);

    const lost = events.filter((e) => e.type === 'mentalityChanged' && e.reason === 'clashLose');
    expect(lost).toHaveLength(1);
    expect(defender.mentality).toBe(100 + catalog.rules.mentalityOnClashLose);
    expect(attacker.mentality).toBe(100);
  });
});

describe('§11-4 상태이상 4종이 명시된 타이밍에 발동한다', () => {
  it('출혈은 턴 시작에 최대체력의 1% 를 깎고 중첩된다', () => {
    const bleeding = makeCombatant('b', 'main', 'enemy');
    const resolver = makeResolver(alwaysBackRng, [bleeding]);
    const events: BattleEvent[] = [];

    bleeding.applyStatus('bleed', 3, true);
    bleeding.applyStatus('bleed', 3, true);
    resolver.applyTurnStartStatuses(bleeding, events);

    //메인 캐릭터 최대체력 112 의 1% 는 1, 2중첩이면 2
    expect(events.find((e) => e.type === 'statusTicked')).toMatchObject({
      combatantId: 'b',
      status: 'bleed',
      damage: 2,
    });
    expect(bleeding.hp).toBe(112 - 2);
  });

  it('출혈은 한 턴에 여러 교전을 치러도 한 번만 들어간다', () => {
    const attacker = makeCombatant('a', 'main', 'ally');
    const bleeding = makeCombatant('b', 'main', 'enemy');
    const resolver = makeResolver(alwaysBackRng, [attacker, bleeding]);

    bleeding.applyStatus('bleed', 3, true);
    const clashEvents = resolver.resolve(attacker, MAIN_S2, bleeding, MAIN_S1);
    const oneSidedEvents = resolver.resolveOneSided(attacker, MAIN_S1, bleeding);

    expect([...clashEvents, ...oneSidedEvents].filter((e) => e.type === 'statusTicked')).toHaveLength(0);
  });

  it('혼란은 실제 정신력이 아니라 계산값만 20 낮춘다', () => {
    const combatant = makeCombatant('a', 'main', 'ally');
    const resolver = makeResolver(alwaysBackRng);

    combatant.mentality = 50;
    combatant.applyStatus('confusion', 1, false);

    expect(combatant.mentality).toBe(50);
    expect(resolver.effectiveMentality(combatant)).toBe(30);
    //정신력 비 0.3 · 체력 비 1 → 상태 0.65 → 0.3 + 0.5 × 0.65
    expect(resolver.frontChance(combatant, catalog.skill(MAIN_S1))).toBeCloseTo(0.625, 10);
  });

  it('독은 주는 피해를 10% 줄이고 받는 피해를 5% 늘린다', () => {
    const resolver = makeResolver(alwaysBackRng);
    //S2 앞 19 + 레벨차 보너스 6 = 25
    const power = catalog.skill(MAIN_S2).frontPower;
    const base = 25;

    const clean = makeCombatant('a', 'main', 'ally');
    const target = makeCombatant('b', 'main', 'enemy');
    expect(resolver.calculateDamage(clean, target, power).damage).toBe(base);

    const poisonedAttacker = makeCombatant('c', 'main', 'ally');
    poisonedAttacker.applyStatus('poison', 3, false);
    expect(resolver.calculateDamage(poisonedAttacker, target, power).damage).toBe(Math.floor(base * 0.9));

    const poisonedTarget = makeCombatant('d', 'main', 'enemy');
    poisonedTarget.applyStatus('poison', 3, false);
    expect(resolver.calculateDamage(clean, poisonedTarget, power).damage).toBe(Math.floor(base * 1.05));
  });

  it('방어력감소는 방어레벨을 절반만 적용한다', () => {
    const defender = makeCombatant('b', 'helper', 'enemy');
    const resolver = makeResolver(alwaysBackRng);

    expect(resolver.effectiveDefLevel(defender)).toBe(12);
    defender.applyStatus('defenseDown', 1, false);
    expect(resolver.effectiveDefLevel(defender)).toBe(6);
  });

  it('지속 턴이 다 되면 사라지고 중첩 불가는 겹치지 않는다', () => {
    const combatant = makeCombatant('a', 'main', 'ally');

    combatant.applyStatus('confusion', 1, false);
    combatant.applyStatus('confusion', 1, false);
    expect(combatant.stackCount('confusion')).toBe(1);

    combatant.beginTurn();
    expect(combatant.expireStatuses()).toEqual(['confusion']);
    expect(combatant.hasStatus('confusion')).toBe(false);
  });
});

describe('§11-5 전용기 수치가 v3.0 §7 표와 일치한다', () => {
  //v3.0 §7. 공통 캐릭터는 뒷 위력 7·9·11 이 같고, 앞 위력은 옛 코인 수로 갈린다
  const expected = [
    { slot: 'S1', attribute: 'attack', backPower: 7 },
    { slot: 'S2', attribute: 'defense', backPower: 9 },
    { slot: 'S3', attribute: 'support', backPower: 11 },
  ] as const;
  const fronts: Record<string, [number, number, number]> = {
    helper: [10, 15, 17],
    main: [12, 19, 21],
    police: [9, 13, 15],
    incinerator: [11, 17, 19],
  };

  //캐릭터는 나중에 계속 추가된다. 개수를 박지 않고 로스터에서 뽑는다
  const roster = catalog.data.characters.map((c) => c.id);
  //§1.1 공통 표를 쓰는 캐릭터. 카일·걸음 잔형은 SPEC-001 §7 [D-22] 의 자기 표를 쓴다
  const OWN_TABLE = new Set(['kyle', 'remnantWalker']);
  const common = roster.filter((id) => !OWN_TABLE.has(id));

  it('캐릭터마다 전용기 3종이 있고 궁극기는 1종이다', () => {
    expect(catalog.data.skills.filter((s) => s.slot !== 'ULT')).toHaveLength(roster.length * 3);
    expect(catalog.data.skills.filter((s) => s.slot === 'ULT')).toHaveLength(1);
  });

  it.each(roster)('%s 는 자기 전용기 3종만 들고 있다', (characterId) => {
    const deck = catalog.deckFor(characterId);
    expect(deck).toHaveLength(3);
    for (const id of deck) {
      expect(catalog.skill(id).character).toBe(characterId);
    }
  });

  it.each(expected)('$slot 의 수치와 속성이 스펙과 같다', (row) => {
    const index = ['S1', 'S2', 'S3'].indexOf(row.slot);
    for (const characterId of common) {
      const skill = catalog.skill(skillOf(characterId, row.slot));
      expect(skill.attribute).toBe(row.attribute);
      expect(skill.backPower).toBe(row.backPower);
      expect(skill.frontPower).toBe(fronts[characterId]?.[index]);
      expect(skill.frontChance).toEqual([0.3, 0.8]);
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
    expect(ultimate).toMatchObject({ frontPower: 33, backPower: 18 });
  });

  it('모든 전용기가 설명문을 갖고 있다', () => {
    for (const skill of catalog.data.skills) {
      expect(skill.text.length).toBeGreaterThan(0);
    }
  });

  it('밸런싱 원칙 1 — 앞/뒤 위력 비가 3.0배를 넘지 않는다 (v3.0 §8)', () => {
    for (const skill of catalog.data.skills) {
      if (skill.backPower === 0) continue;
      expect(skill.frontPower / skill.backPower).toBeLessThanOrEqual(3.0);
    }
  });
});

describe('§7 [D-22] 카일·걸음 잔형 제안값 (v3.0 §7 앞/뒤)', () => {
  const table = [
    { id: 'kyle', slot: 'S1', attribute: 'attack', frontPower: 24, backPower: 8, frontChance: [0.3, 0.75] },
    { id: 'kyle', slot: 'S2', attribute: 'defense', frontPower: 18, backPower: 6, frontChance: [0.3, 0.7] },
    { id: 'kyle', slot: 'S3', attribute: 'support', frontPower: 19, backPower: 7, frontChance: [0.3, 0.75] },
    { id: 'remnantWalker', slot: 'S1', attribute: 'attack', frontPower: 16, backPower: 7, frontChance: [0.3, 0.8] },
    { id: 'remnantWalker', slot: 'S2', attribute: 'defense', frontPower: 18, backPower: 9, frontChance: [0.3, 0.8] },
    { id: 'remnantWalker', slot: 'S3', attribute: 'support', frontPower: 17, backPower: 11, frontChance: [0.3, 0.8] },
  ] as const;

  it.each(table)('$id $slot 수치가 표와 같다', (row) => {
    const skill = catalog.skill(skillOf(row.id, row.slot));
    expect(skill).toMatchObject({ attribute: row.attribute, frontPower: row.frontPower, backPower: row.backPower });
    expect(skill.frontChance).toEqual([...row.frontChance]);
  });

  it('카일 S1 은 물금이고, S2 가 틈을 드러내고 S3 가 그 틈을 친다', () => {
    expect(catalog.skill(skillOf('kyle', 'S1')).name).toBe('물금');
    expect(catalog.skill(skillOf('kyle', 'S2')).effect?.onWin).toMatchObject({ type: 'applyStatus', status: 'defenseDown', turns: 1 });
    expect(catalog.skill(skillOf('kyle', 'S3')).effect?.onWin).toMatchObject({ type: 'damageModifier', amount: 3 });
  });

  it('카일 카드 설명에 역할(속성 이름)을 드러내지 않는다', () => {
    for (const slot of ['S1', 'S2', 'S3'] as const) {
      const text = catalog.skill(skillOf('kyle', slot)).text;
      expect(text).not.toMatch(/공격 속성|방어 속성|보조 속성/);
    }
  });

  it('카일 스탯이 표와 같다', () => {
    expect(catalog.character('kyle')).toMatchObject({ maxHp: 96, atkLevel: 34, defLevel: 6, mentality: 100 });
    expect(catalog.character('remnantWalker')).toMatchObject({ maxHp: 110, atkLevel: 30, defLevel: 8, mentality: 100 });
  });
});
