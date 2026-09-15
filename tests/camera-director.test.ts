//카메라 상태머신이 실제 전투 이벤트를 보고 제대로 상태를 옮기는지 본다
//목 이벤트를 손으로 만들지 않고 진짜 전투를 한 판 돌려서 나온 것을 그대로 먹인다

import { describe, expect, it } from 'vitest';
import { Battle } from '../src/domain/battle.js';
import { WeightedEnemyAi } from '../src/domain/ai.js';
import { ClashResolver } from '../src/domain/clash.js';
import { createSeededRng } from '../src/domain/rng.js';
import { CameraDirector, type CameraCommand } from '../src/camera/director.js';
import { catalog } from './helpers.js';
import type { BattleEvent } from '../src/domain/types.js';
import type { CombatantInit } from '../src/domain/combatant.js';

const DECK = [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009];

//양 진영 3명씩 미러 구성
function makeRoster(side: 'ally' | 'enemy'): CombatantInit[] {
  const prefix = side === 'ally' ? 'a' : 'e';
  return (['helper', 'main', 'police'] as const).map((characterId, index) => ({
    id: `${prefix}${index + 1}`,
    characterId,
    side,
    deck: [...DECK],
  }));
}

//전투를 끝까지 돌리면서 턴마다 이벤트 묶음을 모은다
function runBattle(seed: number): BattleEvent[][] {
  const rng = createSeededRng(seed);
  const ai = new WeightedEnemyAi();
  const battle = new Battle(catalog, makeRoster('ally'), makeRoster('enemy'), { rng, enemyAi: ai });
  const resolver = new ClashResolver(catalog, rng, { alliesOf: (c) => battle.sideOf(c.side) });
  const context = { catalog, resolver, rng };

  const batches: BattleEvent[][] = [];
  let guard = 0;

  while (!battle.isFinished && guard < 100) {
    guard += 1;
    const startEvents = battle.startTurn();
    batches.push(startEvents);
    if (battle.isFinished) break;

    const enemyTargets = new Map<string, string>();
    for (const event of startEvents) {
      if (event.type === 'enemyTargeted') enemyTargets.set(event.enemyId, event.targetId);
    }

    const enemies = battle.sideOf('enemy').filter((c) => !c.isDefeated);
    const taken = new Set<string>();
    const orders = battle
      .sideOf('ally')
      .filter((c) => !c.isDefeated)
      .map((ally) => {
        const targetId = ai.chooseTarget(ally, enemies, taken, context);
        taken.add(targetId);
        const target = battle.combatant(targetId);
        const isClash = enemyTargets.get(targetId) === ally.id;
        const skillId = ai.chooseSkill(ally, { target, isClash, opponentSkillId: null }, context);
        return { actorId: ally.id, targetId, skillId };
      });

    battle.submitOrders(orders);
    batches.push(battle.resolve());
    if (battle.isFinished) break;
    batches.push(battle.endTurn());
  }

  return batches;
}

//전투 한 판의 이벤트를 전부 감독에게 먹이고 명령 시퀀스를 받는다
function directBattle(seed: number): { director: CameraDirector; commands: CameraCommand[] } {
  const director = new CameraDirector();
  const commands: CameraCommand[] = [];
  for (const batch of runBattle(seed)) {
    commands.push(...director.consume(batch));
  }
  return { director, commands };
}

describe('교전에 붙는다', () => {
  it('시작 상태는 원경이다', () => {
    expect(new CameraDirector().currentShot).toEqual({ kind: 'idle' });
  });

  it('첫 교전이 시작되면 두 사람에게 붙는다', () => {
    const director = new CameraDirector();
    const batches = runBattle(1);

    //턴 시작 묶음만으로는 아직 붙지 않는다
    expect(director.consume(batches[0] ?? [])).toEqual([]);
    expect(director.currentShot).toEqual({ kind: 'idle' });

    //첫 교전이 시작되는 지점까지만 먹인다. 묶음 끝까지 먹이면 마지막 교전이 끝나 원경으로 돌아간다
    const resolveEvents = batches[1] ?? [];
    const firstStart = resolveEvents.findIndex(
      (e) => e.type === 'clashStart' || e.type === 'oneSidedStart',
    );
    const commands = director.consume(resolveEvents.slice(0, firstStart + 1));

    const first = commands[0];
    expect(first?.type).toBe('focus');
    if (first?.type !== 'focus') throw new Error('첫 명령이 focus 가 아니다');
    expect(first.subjectIds).toHaveLength(2);
    expect(first.zoom).toBeGreaterThan(1);
    expect(director.currentShot.kind).toBe('focus');
  });

  it('합이든 일방 공격이든 똑같이 붙는다', () => {
    const director = new CameraDirector();
    const clash = director.consume([
      { type: 'clashStart', attackerId: 'a1', defenderId: 'e1', attackerSkillId: 1001, defenderSkillId: 1004 },
    ]);
    expect(clash[0]).toMatchObject({ type: 'focus', subjectIds: ['a1', 'e1'] });

    const oneSided = director.consume([{ type: 'oneSidedStart', attackerId: 'a2', targetId: 'e3', skillId: 1009 }]);
    expect(oneSided[0]).toMatchObject({ type: 'focus', subjectIds: ['a2', 'e3'] });
  });
});

describe('피해는 보고 있는 대상을 바꾸지 않는다', () => {
  it('피해가 연달아 들어와도 붙은 상태가 풀리지 않는다', () => {
    const director = new CameraDirector();
    director.consume([
      { type: 'clashStart', attackerId: 'a1', defenderId: 'e1', attackerSkillId: 1001, defenderSkillId: 1004 },
    ]);
    const before = director.currentShot;

    const commands = director.consume([
      { type: 'damageApplied', combatantId: 'e1', damage: 12, hp: 300 },
      { type: 'damageApplied', combatantId: 'a1', damage: 10, hp: 310 },
      { type: 'damageApplied', combatantId: 'e1', damage: 45, hp: 255 },
    ]);

    expect(commands.every((c) => c.type === 'shake')).toBe(true);
    expect(commands).toHaveLength(3);
    expect(director.currentShot).toEqual(before);
  });

  it('피해량이 클수록 세게 흔들리고 1을 넘지 않는다', () => {
    const director = new CameraDirector();
    const commands = director.consume([
      { type: 'damageApplied', combatantId: 'e1', damage: 15, hp: 300 },
      { type: 'damageApplied', combatantId: 'e1', damage: 120, hp: 180 },
    ]);

    expect(commands[0]).toMatchObject({ type: 'shake', intensity: 0.5 });
    expect(commands[1]).toMatchObject({ type: 'shake', intensity: 1 });
  });

  it('피해 0은 흔들지 않는다', () => {
    const director = new CameraDirector();
    expect(director.consume([{ type: 'damageApplied', combatantId: 'e1', damage: 0, hp: 300 }])).toEqual([]);
  });

  it('처형은 최대로 흔든다', () => {
    const director = new CameraDirector();
    expect(director.consume([{ type: 'executed', combatantId: 'e1' }])).toEqual([
      { type: 'shake', intensity: 1 },
    ]);
  });
});

describe('교전 사이에 원경이 끼지 않는다', () => {
  it('뒤에 교전이 남아 있으면 원경으로 돌아가지 않는다', () => {
    const director = new CameraDirector();
    const commands = director.consume([
      { type: 'clashStart', attackerId: 'a1', defenderId: 'e1', attackerSkillId: 1001, defenderSkillId: 1004 },
      { type: 'clashEnd', attackerId: 'a1', defenderId: 'e1', winnerId: 'a1' },
      { type: 'oneSidedStart', attackerId: 'a2', targetId: 'e2', skillId: 1009 },
      { type: 'oneSidedEnd', attackerId: 'a2', targetId: 'e2' },
    ]);

    expect(commands.filter((c) => c.type === 'idle')).toHaveLength(1);
    //마지막 교전이 끝난 뒤에만 원경으로 돌아간다
    expect(commands[commands.length - 1]).toEqual({ type: 'idle' });
  });

  it('실제 전투 한 턴 안에서도 교전 사이에 원경이 없다', () => {
    const batches = runBattle(1);
    const director = new CameraDirector();
    director.consume(batches[0] ?? []);
    const commands = director.consume(batches[1] ?? []);

    //교전이 두 건 이상인 턴을 골랐는지 확인한다
    expect(commands.filter((c) => c.type === 'focus').length).toBeGreaterThan(1);
    //원경은 맨 끝에 한 번만 나온다
    const idleIndexes = commands.flatMap((c, i) => (c.type === 'idle' ? [i] : []));
    expect(idleIndexes).toEqual([commands.length - 1]);
  });

  it('같은 대상에 다시 붙으라는 지시는 중복으로 내지 않는다', () => {
    const director = new CameraDirector();
    const start: BattleEvent = {
      type: 'clashStart',
      attackerId: 'a1',
      defenderId: 'e1',
      attackerSkillId: 1001,
      defenderSkillId: 1004,
    };

    expect(director.consume([start])).toHaveLength(1);
    expect(director.consume([start])).toHaveLength(0);
  });
});

describe('전투 전체', () => {
  it('전투가 끝나면 원경으로 끝난다', () => {
    const { director, commands } = directBattle(1);

    expect(director.currentShot).toEqual({ kind: 'idle' });
    expect(commands[commands.length - 1]).toEqual({ type: 'idle' });
  });

  it('원경 명령이 연달아 두 번 나오지 않는다', () => {
    const { commands } = directBattle(1);
    for (let i = 1; i < commands.length; i += 1) {
      if (commands[i]?.type === 'idle') expect(commands[i - 1]?.type).not.toBe('idle');
    }
  });

  it('여러 시드에서도 focus 없이 shake 만 나오는 일이 없다', () => {
    //흔들림은 항상 누군가에게 붙어 있는 동안 나와야 한다
    for (const seed of [1, 2, 3, 7, 42]) {
      const director = new CameraDirector();
      let focused = false;
      for (const batch of runBattle(seed)) {
        for (const command of director.consume(batch)) {
          if (command.type === 'focus') focused = true;
          if (command.type === 'idle') focused = false;
          if (command.type === 'shake') expect(focused).toBe(true);
        }
      }
    }
  });
});
