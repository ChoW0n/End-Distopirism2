//전투 이벤트가 렌더 명령으로 제대로 바뀌는지 본다
//목 이벤트를 손으로 만들지 않고 진짜 전투를 돌려서 나온 것을 그대로 먹인다

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Battle } from '../src/domain/battle.js';
import type { EnemyAi } from '../src/domain/ai.js';
import { loadCharacterAssets } from '../src/platform/node-manifest.js';
import { Stage, type StagePlacement } from '../src/render/stage.js';
import { BattlePresenter, type RenderCommand } from '../src/render/presenter.js';
import { alwaysFailRng, catalog, skillOf } from './helpers.js';
import type { BattleEvent } from '../src/domain/types.js';
import type { CombatantInit } from '../src/domain/combatant.js';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../assets');
const sprites = loadCharacterAssets(assets, 'incinerator')!;

const S1 = skillOf('incinerator', 'S1');
const S2 = skillOf('incinerator', 'S2');
const S3 = skillOf('incinerator', 'S3');
const ULT = catalog.rules.ultimateSkillId;

//에셋이 들어온 캐릭터만 무대에 오른다
const stage = new Stage(new Map([['incinerator', sprites]]));

//아군은 왼쪽, 적은 오른쪽을 보게 세운다
const placements = new Map<string, StagePlacement>([
  ['a1', { combatantId: 'a1', characterId: 'incinerator', position: { x: 600, y: sprites.ground.y }, facing: 1 }],
  ['e1', { combatantId: 'e1', characterId: 'incinerator', position: { x: 1800, y: sprites.ground.y }, facing: -1 }],
]);

const context = {
  actor(combatantId: string): StagePlacement {
    const found = placements.get(combatantId);
    if (!found) throw new Error(`무대에 없다: ${combatantId}`);
    return found;
  },
};

//대본대로만 고르는 적 AI
class ScriptedAi implements EnemyAi {
  constructor(private readonly skillId: number) {}
  chooseTarget(): string {
    return 'a1';
  }
  chooseSkill(): number {
    return this.skillId;
  }
}

//1 대 1 전투를 만든다
function makeBattle(enemySkillId = S1) {
  const allies: CombatantInit[] = [{ id: 'a1', characterId: 'incinerator', side: 'ally' }];
  const enemies: CombatantInit[] = [{ id: 'e1', characterId: 'incinerator', side: 'enemy' }];
  return new Battle(catalog, allies, enemies, {
    rng: alwaysFailRng,
    enemyAi: new ScriptedAi(enemySkillId),
  });
}

function makePresenter() {
  return new BattlePresenter(catalog, stage, context);
}

//한 턴을 돌려 교전 이벤트를 얻는다
function resolveTurn(battle: Battle, allySkillId: number): BattleEvent[] {
  battle.startTurn();
  battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: allySkillId }]);
  return battle.resolve();
}

//피해가 확정된 순간에 나오는 연출만 골라낸다. 프레임에 묶인 무기 궤적은 제외된다
function impactEffects(commands: RenderCommand[]) {
  return commands.filter(
    (c): c is Extract<RenderCommand, { type: 'spawnEffect' }> =>
      c.type === 'spawnEffect' && c.frameId === null,
  );
}

function framesFor(commands: RenderCommand[], combatantId: string): string[][] {
  return commands
    .filter((c): c is Extract<RenderCommand, { type: 'playFrames' }> => c.type === 'playFrames')
    .filter((c) => c.combatantId === combatantId)
    .map((c) => c.frameIds);
}

describe('교전이 시작되면 전용기 동작이 나간다', () => {
  it('합이면 양쪽 다 자기 전용기 프레임을 낸다', () => {
    const presenter = makePresenter();
    const commands = presenter.consume(resolveTurn(makeBattle(S1), S2));

    //S2 는 2장, S1 도 2장이다
    expect(framesFor(commands, 'a1')[0]).toEqual(sprites.frameSequence('S2'));
    expect(framesFor(commands, 'e1')[0]).toEqual(sprites.frameSequence('S1'));
  });

  it('궁극기는 프레임이 아니라 컷신으로 빠진다', () => {
    const battle = makeBattle(S1);
    const ally = battle.combatant('a1');

    //궁극기를 손에 쥐여 준다
    battle.startTurn();
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S2 }]);
    battle.resolve();
    ally.attributes.attack = catalog.rules.ultimateThreshold;
    battle.endTurn();
    battle.startTurn();
    expect(ally.deck).toContain(ULT);

    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: ULT }]);
    const commands = makePresenter().consume(battle.resolve());

    expect(commands.some((c) => c.type === 'playCutscene' && c.combatantId === 'a1')).toBe(true);
    //컷신으로 빠졌으니 a1 의 전용기 프레임은 나오지 않는다
    expect(framesFor(commands, 'a1')[0]).not.toEqual(sprites.frameSequence('S1'));
  });

  it('컷신이 피해 판정을 새로 만들지 않는다 (SPEC-002 §7)', () => {
    const battle = makeBattle(S1);
    const ally = battle.combatant('a1');
    const enemy = battle.combatant('e1');

    battle.startTurn();
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S2 }]);
    battle.resolve();
    ally.attributes.attack = catalog.rules.ultimateThreshold;
    battle.endTurn();
    battle.startTurn();

    const hpBefore = enemy.hp;
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: ULT }]);
    const events = battle.resolve();
    const hpAfterDomain = enemy.hp;

    //연출을 만들어도 도메인 상태가 더 움직이지 않는다
    const commands = makePresenter().consume(events);
    expect(enemy.hp).toBe(hpAfterDomain);
    expect(enemy.hp).toBeLessThan(hpBefore);

    //순서는 합 확정 → 연출 → 기존 피해 적용이다
    const cutsceneAt = commands.findIndex((c) => c.type === 'playCutscene');
    const effectAt = commands.findIndex((c) => c.type === 'spawnEffect');
    expect(cutsceneAt).toBeGreaterThanOrEqual(0);
    if (effectAt >= 0) expect(cutsceneAt).toBeLessThan(effectAt);
  });
});

describe('§6-1 명중했을 때만 이펙트가 난다', () => {
  it('피해가 들어가면 맞은 쪽 몸에 섬광이 붙는다', () => {
    const presenter = makePresenter();
    const commands = presenter.consume(resolveTurn(makeBattle(S1), S2));

    const spawns = impactEffects(commands);
    expect(spawns).toHaveLength(1);
    expect(spawns[0]).toMatchObject({ sourceId: 'a1', targetId: 'e1' });

    //섬광은 맞은 쪽 근처에 잡힌다
    const target = context.actor('e1');
    expect(Math.abs(spawns[0]!.placement.anchorPoint.x - target.position.x)).toBeLessThan(300);
    expect(spawns[0]!.placement.effectId).toBe('impact');
  });

  it('맞은 쪽이 피격 자세를 잡는다', () => {
    const presenter = makePresenter();
    const commands = presenter.consume(resolveTurn(makeBattle(S1), S2));
    const hitFrame = sprites.frameEndingWith('hit')!.id;

    expect(framesFor(commands, 'e1')).toContainEqual([hitFrame]);
  });

  it('교착으로 끝나면 명중 연출이 안 난다', () => {
    //같은 전용기끼리 붙으면 피해가 같아 교착이 된다
    const presenter = makePresenter();
    const events = resolveTurn(makeBattle(S1), S1);

    expect(events.some((e) => e.type === 'deadlockLimit')).toBe(true);
    const commands = presenter.consume(events);
    //무기 궤적은 휘둘렀으니 나오지만 섬광·지면 충격은 안 나온다
    expect(impactEffects(commands)).toHaveLength(0);
  });

  it('교착이면 지면 충격도 안 난다', () => {
    //S3 마무리 프레임에 ground-impact 가 묶여 있지만 맞아야 나온다 (§6-1)
    const presenter = makePresenter();
    const commands = presenter.consume(resolveTurn(makeBattle(S3), S3));

    const ids = commands
      .filter((c): c is Extract<RenderCommand, { type: 'spawnEffect' }> => c.type === 'spawnEffect')
      .map((c) => c.placement.effectId);
    expect(ids).not.toContain('ground-impact');
    expect(ids).not.toContain('impact');
  });

  it('피해 0 은 이펙트를 내지 않는다', () => {
    const presenter = makePresenter();
    const commands = presenter.consume([
      { type: 'clashStart', attackerId: 'a1', defenderId: 'e1', attackerSkillId: S2, defenderSkillId: S1 },
      { type: 'damageApplied', combatantId: 'e1', damage: 0, hp: 320 },
    ]);

    expect(impactEffects(commands)).toHaveLength(0);
  });

  it('막힌 피해는 방어 자세만 내고 섬광은 안 낸다', () => {
    const presenter = makePresenter();
    const guardFrame = sprites.frameEndingWith('guard')!.id;
    const commands = presenter.consume([
      { type: 'clashStart', attackerId: 'a1', defenderId: 'e1', attackerSkillId: S2, defenderSkillId: S1 },
      { type: 'damageNullified', combatantId: 'e1', skillId: S1 },
    ]);

    expect(framesFor(commands, 'e1')).toContainEqual([guardFrame]);
    expect(impactEffects(commands)).toHaveLength(0);
  });
});

describe('교전이 끝나면 기본 자세로 돌아간다', () => {
  it('합이 끝나면 양쪽 다 idle 이다', () => {
    const presenter = makePresenter();
    const commands = presenter.consume(resolveTurn(makeBattle(S1), S2));
    const idle = sprites.frameEndingWith('idle')!.id;

    expect(framesFor(commands, 'a1').at(-1)).toEqual([idle]);
    expect(framesFor(commands, 'e1').at(-1)).toEqual([idle]);
  });

  it('일방 공격도 맞는 쪽은 전용기를 내지 않는다', () => {
    //적이 다른 쪽을 겨누게 해서 일방 공격을 만든다
    const presenter = makePresenter();
    const commands = presenter.consume([
      { type: 'oneSidedStart', attackerId: 'a1', targetId: 'e1', skillId: S2 },
      { type: 'damageApplied', combatantId: 'e1', damage: 15, hp: 305 },
      { type: 'oneSidedEnd', attackerId: 'a1', targetId: 'e1' },
    ]);

    expect(framesFor(commands, 'a1')[0]).toEqual(sprites.frameSequence('S2'));
    //맞는 쪽은 피격과 idle 만 나온다
    const hit = sprites.frameEndingWith('hit')!.id;
    const idle = sprites.frameEndingWith('idle')!.id;
    expect(framesFor(commands, 'e1')).toEqual([[hit], [idle]]);
  });
});

describe('에셋이 캐릭터마다 따로 들어온다', () => {
  //조력자는 아직 스프라이트가 없다. 소각원 에셋을 대신 물리지 않는다 (SPEC-002 §10)
  const mixedPlacements = new Map<string, StagePlacement>([
    ['a1', { combatantId: 'a1', characterId: 'incinerator', position: { x: 600, y: sprites.ground.y }, facing: 1 }],
    ['e1', { combatantId: 'e1', characterId: 'helper', position: { x: 1800, y: sprites.ground.y }, facing: -1 }],
  ]);
  const mixedContext = {
    actor: (id: string) => mixedPlacements.get(id)!,
  };

  it('에셋 없는 캐릭터는 플레이스홀더로 나온다', () => {
    const presenter = new BattlePresenter(catalog, stage, mixedContext);
    const commands = presenter.consume([
      { type: 'clashStart', attackerId: 'a1', defenderId: 'e1', attackerSkillId: S2, defenderSkillId: S1 },
      { type: 'damageApplied', combatantId: 'e1', damage: 15, hp: 300 },
      { type: 'clashEnd', attackerId: 'a1', defenderId: 'e1', winnerId: 'a1' },
    ]);

    const placeholders = commands.filter(
      (c): c is Extract<RenderCommand, { type: 'placeholder' }> => c.type === 'placeholder',
    );
    expect(placeholders.length).toBeGreaterThan(0);
    expect(placeholders.every((c) => c.combatantId === 'e1' && c.characterId === 'helper')).toBe(true);
    //에셋 있는 쪽은 정상으로 나온다
    expect(framesFor(commands, 'a1')[0]).toEqual(sprites.frameSequence('S2'));
  });

  it('에셋 없는 캐릭터의 프레임이나 이펙트를 만들지 않는다', () => {
    const presenter = new BattlePresenter(catalog, stage, mixedContext);
    const commands = presenter.consume([
      { type: 'clashStart', attackerId: 'a1', defenderId: 'e1', attackerSkillId: S2, defenderSkillId: S1 },
      { type: 'damageApplied', combatantId: 'e1', damage: 15, hp: 300 },
    ]);

    expect(framesFor(commands, 'e1')).toHaveLength(0);
    //맞은 쪽 좌표를 풀 수 없으니 섬광도 안 낸다
    expect(impactEffects(commands)).toHaveLength(0);
  });

  it('섞인 상태로 전투를 돌려도 터지지 않는다', () => {
    const presenter = new BattlePresenter(catalog, stage, mixedContext);
    const allies: CombatantInit[] = [{ id: 'a1', characterId: 'incinerator', side: 'ally' }];
    const enemies: CombatantInit[] = [{ id: 'e1', characterId: 'helper', side: 'enemy' }];
    const battle = new Battle(catalog, allies, enemies, {
      rng: alwaysFailRng,
      enemyAi: new ScriptedAi(skillOf('helper', 'S1')),
    });

    let guard = 0;
    expect(() => {
      while (!battle.isFinished && guard < 100) {
        guard += 1;
        presenter.consume(battle.startTurn());
        if (battle.isFinished) break;
        battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S2 }]);
        presenter.consume(battle.resolve());
        if (battle.isFinished) break;
        presenter.consume(battle.endTurn());
      }
    }).not.toThrow();
    expect(battle.isFinished).toBe(true);
  });
});

describe('§5.4 프레임에 묶인 이펙트', () => {
  it('바인딩 파일이 정한 프레임에서 궤적이 나온다', () => {
    const presenter = makePresenter();
    const commands = presenter.consume([
      { type: 'clashStart', attackerId: 'a1', defenderId: 'e1', attackerSkillId: S2, defenderSkillId: S1 },
    ]);

    const trails = commands.filter(
      (c): c is Extract<RenderCommand, { type: 'spawnEffect' }> =>
        c.type === 'spawnEffect' && c.frameId !== null,
    );
    //S2 는 08-skill2-peak 에서 수평 베기, S1 은 06-skill1-cast 에서 대각 베기
    expect(trails.map((c) => [c.frameId, c.placement.effectId])).toEqual([
      ['08-skill2-peak', 'slash-horizontal'],
      ['06-skill1-cast', 'slash-diagonal'],
    ]);
  });

  it('준비 프레임에는 이펙트를 걸지 않는다', () => {
    const presenter = makePresenter();
    const commands = presenter.consume([
      { type: 'clashStart', attackerId: 'a1', defenderId: 'e1', attackerSkillId: S2, defenderSkillId: S1 },
    ]);

    const boundFrames = commands
      .filter((c): c is Extract<RenderCommand, { type: 'spawnEffect' }> => c.type === 'spawnEffect')
      .map((c) => c.frameId);
    for (const ready of ['05-skill1-ready', '07-skill2-ready', '09-skill3-anticipation']) {
      expect(boundFrames).not.toContain(ready);
    }
  });

  it('바인딩에 없는 이펙트는 호출되지 않는다', () => {
    //화염 3종은 쓰는 기술이 생기기 전까지 안 나온다 (§5.4)
    const presenter = makePresenter();
    const commands = presenter.consume(resolveTurn(makeBattle(S1), S2));
    const ids = commands
      .filter((c): c is Extract<RenderCommand, { type: 'spawnEffect' }> => c.type === 'spawnEffect')
      .map((c) => c.placement.effectId);

    for (const unused of ['fire-horizontal', 'fire-rising', 'ash-mixed']) {
      expect(ids).not.toContain(unused);
    }
  });
});

describe('전투 한 판을 통째로 돌려도 깨지지 않는다', () => {
  it('모든 이벤트를 먹여도 명령이 일관된다', () => {
    const battle = makeBattle(S1);
    const presenter = makePresenter();
    const commands: RenderCommand[] = [];
    let guard = 0;

    while (!battle.isFinished && guard < 100) {
      guard += 1;
      commands.push(...presenter.consume(battle.startTurn()));
      if (battle.isFinished) break;
      battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S2 }]);
      commands.push(...presenter.consume(battle.resolve()));
      if (battle.isFinished) break;
      commands.push(...presenter.consume(battle.endTurn()));
    }

    expect(battle.isFinished).toBe(true);
    expect(commands.length).toBeGreaterThan(0);

    //이펙트는 전부 매니페스트에 있는 것이고 좌표가 숫자다
    for (const command of commands) {
      if (command.type !== 'spawnEffect') continue;
      expect(() => sprites.effect(command.placement.effectId)).not.toThrow();
      expect(Number.isFinite(command.placement.origin.x)).toBe(true);
      expect(Number.isFinite(command.placement.origin.y)).toBe(true);
    }

    //프레임도 전부 실재하는 것이다
    for (const command of commands) {
      if (command.type !== 'playFrames') continue;
      for (const frameId of command.frameIds) {
        expect(() => sprites.frame(frameId)).not.toThrow();
      }
    }
  });
});
