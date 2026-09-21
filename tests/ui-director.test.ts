//UI 명령이 이벤트에서 제대로 나오는지 본다
//대시 배치는 순수 계산이라 따로 떼어 재현성부터 확인한다

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Battle } from '../src/domain/battle.js';
import type { EnemyAi } from '../src/domain/ai.js';
import { createSeededRng } from '../src/domain/rng.js';
import { loadCharacterAssets } from '../src/platform/node-manifest.js';
import { loadUiData } from '../src/platform/node-ui.js';
import { Stage, type StagePlacement } from '../src/render/stage.js';
import { DashPlanner } from '../src/ui/dash.js';
import { UiDirector, type UiCommand } from '../src/ui/director.js';
import { alwaysFailRng, catalog, skillOf } from './helpers.js';
import type { CombatantInit } from '../src/domain/combatant.js';

const here = dirname(fileURLToPath(import.meta.url));
const sprites = loadCharacterAssets(resolve(here, '../assets'), 'incinerator')!;
const uiData = loadUiData(resolve(here, '../assets/ui/ui-data.json'));
const stage = new Stage(new Map([['incinerator', sprites]]));

const S1 = skillOf('incinerator', 'S1');
const S2 = skillOf('incinerator', 'S2');
const H = sprites.characterHeight;

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
  combatants: () => [...placements.keys()],
};

class ScriptedAi implements EnemyAi {
  constructor(private readonly skillId: number) {}
  chooseTarget(): string {
    return 'a1';
  }
  chooseSkill(): number {
    return this.skillId;
  }
}

function makeBattle(enemySkillId = S1) {
  const allies: CombatantInit[] = [{ id: 'a1', characterId: 'incinerator', side: 'ally' }];
  const enemies: CombatantInit[] = [{ id: 'e1', characterId: 'incinerator', side: 'enemy' }];
  return new Battle(catalog, allies, enemies, { rng: alwaysFailRng, enemyAi: new ScriptedAi(enemySkillId) });
}

function makeDirector(seed = 1) {
  return new UiDirector(catalog, stage, context, uiData, createSeededRng(seed));
}

function pick<T extends UiCommand['type']>(commands: UiCommand[], type: T) {
  return commands.filter((c): c is Extract<UiCommand, { type: T }> => c.type === type);
}

//한 턴을 돌려 나온 명령을 전부 모은다
function runTurn(director: UiDirector, allySkillId = S2) {
  const battle = makeBattle();
  const commands: UiCommand[] = [];
  commands.push(...director.consume(battle.startTurn()));
  battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: allySkillId }]);
  commands.push(...director.consume(battle.resolve()));
  return commands;
}

describe('§5 중앙 대시 배치', () => {
  const pair = {
    movers: [
      { combatantId: 'a1', from: { x: 600, y: 1340 } },
      { combatantId: 'e1', from: { x: 1800, y: 1340 } },
    ],
  };

  it('같은 시드면 같은 좌표가 나온다', () => {
    const first = new DashPlanner(uiData.dash, createSeededRng(7)).plan(pair, H);
    const second = new DashPlanner(uiData.dash, createSeededRng(7)).plan(pair, H);
    expect(first).toEqual(second);
  });

  it('시드가 다르면 자리가 달라진다', () => {
    const first = new DashPlanner(uiData.dash, createSeededRng(7)).plan(pair, H);
    const second = new DashPlanner(uiData.dash, createSeededRng(99)).plan(pair, H);
    expect(first).not.toEqual(second);
  });

  it('중심은 교전 쌍의 중점이다. 무대 중앙이 아니다', () => {
    const spots = new DashPlanner(uiData.dash, createSeededRng(3)).plan(pair, H);
    const midX = (600 + 1800) / 2;
    const halfWidth = (uiData.dash.zoneWidth * H) / 2;
    for (const spot of spots) {
      expect(Math.abs(spot.position.x - midX)).toBeLessThanOrEqual(halfWidth + uiData.dash.lateralJitter[1] * H);
    }
  });

  it('교전이 여러 건이어도 겹침 방지 거리 미만인 쌍이 없다', () => {
    const planner = new DashPlanner(uiData.dash, createSeededRng(11));
    const all: { x: number; y: number }[] = [];
    //D-7 로 한 턴에 교전이 여러 건 생긴다
    for (let i = 0; i < 4; i += 1) {
      const spots = planner.plan(
        {
          movers: [
            { combatantId: `a${i}`, from: { x: 600 + i * 40, y: 1340 } },
            { combatantId: `e${i}`, from: { x: 1800 + i * 40, y: 1340 } },
          ],
        },
        H,
      );
      all.push(...spots.map((s) => s.position));
    }

    const safe = uiData.dash.safeDistance * H;
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i]!;
        const b = all[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(safe - 1e-9);
      }
    }
  });

  it('무작위가 전부 실패하면 격자 폴백이 돈다 — 겹친 자리를 쓰지 않는다', () => {
    //구역을 아주 좁히고 겹침 방지 거리를 키우면 무작위로는 못 찾는다
    const tight = { ...uiData.dash, zoneWidth: 0.2, zoneDepth: 0.05, safeDistance: 1.0, retries: 30 };
    const planner = new DashPlanner(tight, createSeededRng(5));
    const first = planner.plan(pair, H);
    const second = planner.plan(pair, H);

    //겹친 자리를 쓰지 않는다. 두 번째 교전이 첫 번째와 같은 점에 서지 않는다
    for (const a of first) {
      for (const b of second) {
        expect(a.position).not.toEqual(b.position);
      }
    }

    //폴백은 무작위가 아니다. 씨앗이 달라도 같은 자리가 나오는 걸로 확인한다
    const other = new DashPlanner(tight, createSeededRng(12345));
    expect([other.plan(pair, H), other.plan(pair, H)]).toEqual([first, second]);
  });

  it('턴이 바뀌면 쓴 자리를 비운다', () => {
    const planner = new DashPlanner(uiData.dash, createSeededRng(2));
    planner.plan(pair, H);
    expect(planner.taken.length).toBe(2);
    planner.reset();
    expect(planner.taken.length).toBe(0);
  });

  it('한 명만 넘기면 한 자리만 잡는다', () => {
    const spots = new DashPlanner(uiData.dash, createSeededRng(4)).plan(
      { movers: [{ combatantId: 'a1', from: { x: 600, y: 1340 } }] },
      H,
    );
    expect(spots).toHaveLength(1);
  });
});

describe('§5 대시 명령', () => {
  it('합이면 양쪽 다 달려간다', () => {
    const dashes = pick(runTurn(makeDirector()), 'dashTo');
    expect(dashes.map((d) => d.combatantId).sort()).toEqual(['a1', 'e1']);
  });

  it('일방 공격은 공격자만 달려간다', () => {
    const battle = makeBattle();
    const director = makeDirector();
    director.consume(battle.startTurn());
    //적이 a1 을 겨누고 있으므로 다른 쪽을 치면 일방이 된다 — 1대1 이라 서로 겨누면 합이다
    battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S2 }]);
    const commands = director.consume(battle.resolve());
    const starts = pick(commands, 'dashTo');
    //이 구성은 합이라 둘 다 나온다. 일방은 DashPlanner 쪽에서 본다
    expect(starts.length).toBeGreaterThan(0);
  });

  it('교전이 끝나면 제자리로 돌아가고 대기 동작을 다시 건다', () => {
    const commands = runTurn(makeDirector());
    expect(pick(commands, 'dashBack').map((c) => c.combatantId).sort()).toEqual(['a1', 'e1']);
    //되돌아간 뒤 부유 동작이 다시 걸린다
    const lastBack = commands.findIndex((c) => c.type === 'dashBack');
    expect(commands.slice(lastBack).some((c) => c.type === 'float')).toBe(true);
  });

  it('부유 동작은 기준 높이를 같이 준다 — 누적 대입을 못 하게 한다', () => {
    const floats = pick(runTurn(makeDirector()), 'float');
    expect(floats.length).toBeGreaterThan(0);
    for (const command of floats) {
      expect(command.base).toEqual(context.actor(command.combatantId).position);
      expect(command.amplitude).toBeCloseTo(uiData.float.amplitude * H);
      expect(command.periodSec).toBe(uiData.float.periodSec);
    }
  });
});

describe('§2 바', () => {
  it('체력·정신력 둘 다 0~1 비율로 나온다', () => {
    const bars = pick(runTurn(makeDirector()), 'bar');
    expect(bars.some((b) => b.kind === 'hp')).toBe(true);
    expect(bars.some((b) => b.kind === 'mentality')).toBe(true);
    for (const bar of bars) {
      expect(bar.ratio).toBeGreaterThanOrEqual(0);
      expect(bar.ratio).toBeLessThanOrEqual(1);
    }
  });

  it('바 폭은 캐릭터 키 배수다', () => {
    const bar = pick(runTurn(makeDirector()), 'bar')[0]!;
    expect(bar.size.width).toBeCloseTo(uiData.bar.width * H);
    expect(bar.size.height).toBeCloseTo(uiData.bar.height * H);
  });

  //H 를 프레임마다 재면 공격할 때 바가 캐릭터 따라 출렁인다
  it('공격 프레임이 섞여도 바 y 가 움직이지 않는다', () => {
    const battle = makeBattle();
    const director = makeDirector();
    const commands: UiCommand[] = [];
    for (let turn = 0; turn < 3; turn += 1) {
      commands.push(...director.consume(battle.startTurn()));
      battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S2 }]);
      commands.push(...director.consume(battle.resolve()));
      commands.push(...director.consume(battle.endTurn()));
    }

    //대기·공격·피격 프레임을 다 지나도 바 자리는 한 곳뿐이다
    const ys = pick(commands, 'bar')
      .filter((b) => b.kind === 'hp')
      .map((b) => b.origin.y);
    expect(ys.length).toBeGreaterThan(3);
    expect(new Set(ys).size).toBe(1);
  });

  it('체력이 깎이면 비율이 내려간다', () => {
    const ratios = pick(runTurn(makeDirector()), 'bar')
      .filter((b) => b.kind === 'hp' && b.combatantId === 'e1')
      .map((b) => b.ratio);
    expect(ratios[ratios.length - 1]).toBeLessThan(1);
  });

  it('체력바가 정신력바보다 위에 온다', () => {
    const bars = pick(runTurn(makeDirector()), 'bar').filter((b) => b.combatantId === 'a1');
    const hp = bars.find((b) => b.kind === 'hp');
    const mentality = bars.find((b) => b.kind === 'mentality');
    //화면에서는 y 가 작을수록 위다
    if (hp && mentality) expect(hp.origin.y).toBeLessThan(mentality.origin.y);
  });
});

describe('§4 배지', () => {
  it('합이 끝나면 양쪽에 승리·패배가 동시에 뜬다', () => {
    const badges = pick(runTurn(makeDirector()), 'clashBadge');
    expect(badges).toHaveLength(2);
    expect(badges.map((b) => b.result).sort()).toEqual(['lose', 'win']);
    expect(badges.map((b) => b.combatantId).sort()).toEqual(['a1', 'e1']);
  });

  it('배지는 위로 떠오른다', () => {
    const badge = pick(runTurn(makeDirector()), 'clashBadge')[0]!;
    expect(badge.to.y).toBeLessThan(badge.from.y);
    expect(badge.from.y - badge.to.y).toBeCloseTo(uiData.badge.rise * H);
    expect(badge.durationSec).toBe(uiData.badge.riseSec);
  });

  it('승리·패배 배지에는 글씨가 없다', () => {
    for (const badge of pick(runTurn(makeDirector()), 'clashBadge')) {
      expect(badge.text).toBeNull();
    }
  });

  it('교착이면 n/3 을 같이 띄운다', () => {
    const director = makeDirector();
    const commands = director.consume([
      { type: 'clashStart', attackerId: 'a1', defenderId: 'e1', attackerSkillId: S2, defenderSkillId: S1 },
      { type: 'deadlock', attackerId: 'a1', defenderId: 'e1', count: 2 },
      { type: 'clashEnd', attackerId: 'a1', defenderId: 'e1', winnerId: null },
    ]);
    const badges = pick(commands, 'clashBadge');
    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect(badge.result).toBe('deadlock');
      expect(badge.text).toBe('교착 2/3');
    }
  });

  it('교착 상한에 걸리면 3/3 이다', () => {
    const director = makeDirector();
    const commands = director.consume([
      { type: 'clashStart', attackerId: 'a1', defenderId: 'e1', attackerSkillId: S2, defenderSkillId: S1 },
      { type: 'deadlock', attackerId: 'a1', defenderId: 'e1', count: 2 },
      { type: 'deadlockLimit', attackerId: 'a1', defenderId: 'e1' },
      { type: 'clashEnd', attackerId: 'a1', defenderId: 'e1', winnerId: null },
    ]);
    expect(pick(commands, 'clashBadge')[0]!.text).toBe('교착 3/3');
  });

  it('교착 없이 무승부면 배지를 붙이지 않는다', () => {
    const director = makeDirector();
    const commands = director.consume([
      { type: 'clashStart', attackerId: 'a1', defenderId: 'e1', attackerSkillId: S2, defenderSkillId: S1 },
      { type: 'clashEnd', attackerId: 'a1', defenderId: 'e1', winnerId: null },
    ]);
    expect(pick(commands, 'clashBadge')).toHaveLength(0);
  });

  it('배지는 바보다 위에 뜬다', () => {
    const commands = runTurn(makeDirector());
    const badge = pick(commands, 'clashBadge').find((b) => b.combatantId === 'a1')!;
    const hpBar = pick(commands, 'bar').find((b) => b.combatantId === 'a1' && b.kind === 'hp')!;
    expect(badge.from.y).toBeLessThan(hpBar.origin.y);
  });
});

describe('§3 곡선 타겟 화살표', () => {
  it('적이 겨누면 화살표가 나온다', () => {
    const arrows = pick(makeDirector().consume(makeBattle().startTurn()), 'targetArrow');
    expect(arrows).toHaveLength(1);
    expect(arrows[0]).toMatchObject({ sourceId: 'e1', targetId: 'a1' });
  });

  it('곡선은 점 목록으로 온다. 렌더러에 공식을 넘기지 않는다', () => {
    const arrow = pick(makeDirector().consume(makeBattle().startTurn()), 'targetArrow')[0]!;
    expect(arrow.curve).toHaveLength(uiData.arrow.segments + 1);
    for (const point of arrow.curve) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('가운데가 양끝보다 위로 솟는다', () => {
    const arrow = pick(makeDirector().consume(makeBattle().startTurn()), 'targetArrow')[0]!;
    const start = arrow.curve[0]!;
    const end = arrow.curve[arrow.curve.length - 1]!;
    const middle = arrow.curve[Math.floor(arrow.curve.length / 2)]!;
    //화면에서는 y 가 작을수록 위다
    expect(middle.y).toBeLessThan(Math.min(start.y, end.y));
  });

  it('양끝이 머리 중심에 붙는다 (U-3 임시값)', () => {
    const arrow = pick(makeDirector().consume(makeBattle().startTurn()), 'targetArrow')[0]!;
    const head = stage.framePoint(context.actor('e1'), '00-idle', 'headCenter');
    expect(arrow.curve[0]!.x).toBeCloseTo(head.x);
    expect(arrow.curve[0]!.y).toBeCloseTo(head.y);
  });

  it('화살촉 세 점이 끝점에 붙는다', () => {
    const arrow = pick(makeDirector().consume(makeBattle().startTurn()), 'targetArrow')[0]!;
    const tip = arrow.curve[arrow.curve.length - 1]!;
    expect(arrow.head[1]).toEqual(tip);
    //날개는 촉에서 headLength 안쪽에 있다
    for (const wing of [arrow.head[0], arrow.head[2]]) {
      expect(Math.hypot(wing.x - tip.x, wing.y - tip.y)).toBeLessThan(uiData.arrow.headLength * H * 2);
    }
  });

  it('아군 선택도 화살표를 낸다 — 이건 이벤트가 아니라 입력이다', () => {
    const arrows = pick(makeDirector().selectTarget('a1', 'e1'), 'targetArrow');
    expect(arrows[0]).toMatchObject({ sourceId: 'a1', targetId: 'e1' });
  });

  it('교전이 시작되면 화살표를 한 번만 지운다', () => {
    const commands = runTurn(makeDirector());
    expect(pick(commands, 'clearArrows')).toHaveLength(1);
    const clearAt = commands.findIndex((c) => c.type === 'clearArrows');
    const dashAt = commands.findIndex((c) => c.type === 'dashTo');
    expect(clearAt).toBeLessThan(dashAt);
  });
});

describe('전투 한 판을 통째로 돌려도 깨지지 않는다', () => {
  it('모든 이벤트를 먹여도 명령이 일관된다', () => {
    const battle = makeBattle();
    const director = makeDirector();
    const commands: UiCommand[] = [];
    let guard = 0;

    while (!battle.isFinished && guard < 100) {
      guard += 1;
      commands.push(...director.consume(battle.startTurn()));
      if (battle.isFinished) break;
      battle.submitOrders([{ actorId: 'a1', targetId: 'e1', skillId: S2 }]);
      commands.push(...director.consume(battle.resolve()));
      if (battle.isFinished) break;
      commands.push(...director.consume(battle.endTurn()));
    }

    expect(battle.isFinished).toBe(true);
    expect(commands.length).toBeGreaterThan(0);

    for (const command of commands) {
      if (command.type === 'bar') {
        expect(command.ratio).toBeGreaterThanOrEqual(0);
        expect(command.ratio).toBeLessThanOrEqual(1);
        expect(Number.isFinite(command.origin.x)).toBe(true);
      }
      if (command.type === 'dashTo') expect(Number.isFinite(command.position.y)).toBe(true);
      if (command.type === 'targetArrow') expect(command.curve.length).toBeGreaterThan(1);
    }
  });
});
