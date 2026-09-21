//전투 이벤트를 UI 명령으로 바꾼다 (SPEC-004 §1, §6)
//
//BattlePresenter · CameraDirector 와 같은 자리다. 셋 다 같은 BattleEvent[] 를 각자 본다.
//UI 가 프리젠터를 통해 전투를 읽지 않는다.
//
//좌표는 전부 무대 좌표다. 화면 픽셀이 이 파일에 들어오면 아키텍처 규칙 위반이다 (U-1).
//원본은 BattleManager 1,232줄이 상태·연출·UI·입력을 전부 들고 있었다

import type { BattleCatalog } from '../domain/data.js';
import type { Rng } from '../domain/rng.js';
import type { BattleEvent } from '../domain/types.js';
import type { Point } from '../render/manifest.js';
import type { Stage, StagePlacement } from '../render/stage.js';
import { DashPlanner } from './dash.js';
import type { UiData } from './data.js';

//참가자 id 로 무대 배치를 찾는 통로. 프리젠터와 같은 모양이다
export interface UiContext {
  actor(combatantId: string): StagePlacement;
  //지금 전투에 있는 참가자 전부. 대기 동작을 걸 대상이다
  combatants(): readonly string[];
}

//합이 끝났을 때 붙는 배지
export type BadgeResult = 'win' | 'lose' | 'deadlock';

//렌더러가 받아 해석할 UI 명령. 좌표는 전부 무대 좌표다
export type UiCommand =
  //바는 좌상단과 크기까지 여기서 정한다. 렌더러는 채움 비율만 그린다
  | {
      type: 'bar';
      combatantId: string;
      kind: 'hp' | 'mentality';
      ratio: number;
      origin: Point;
      size: { width: number; height: number };
      tweenSec: number;
      easing: string;
    }
  //곡선은 이미 계산된 점 목록이다. 렌더러에 곡선 공식을 넘기지 않는다
  | {
      type: 'targetArrow';
      sourceId: string;
      targetId: string;
      curve: Point[];
      head: [Point, Point, Point];
      drawSec: number;
      colorStart: string;
      colorEnd: string;
    }
  | { type: 'clearArrows' }
  //text 는 교착 카운터. 스프라이트가 나오기 전까지 이걸로 그린다 (U-4)
  | {
      type: 'clashBadge';
      combatantId: string;
      result: BadgeResult;
      from: Point;
      to: Point;
      durationSec: number;
      text: string | null;
    }
  | { type: 'dashTo'; combatantId: string; position: Point; speed: number }
  | { type: 'dashBack'; combatantId: string }
  //기준 높이를 같이 준다. 렌더러가 base + sin(t)·amplitude 로 그린다
  //원본처럼 position.y += sin(...) 로 누적하면 캐릭터가 떠내려간다 (§5.3)
  | { type: 'float'; combatantId: string; base: Point; amplitude: number; periodSec: number };

//진행 중인 합 하나. 배지를 끝에 한 번만 내기 위해 모아 둔다
interface ActiveClash {
  attackerId: string;
  defenderId: string;
  deadlockCount: number;
}

export class UiDirector {
  private readonly dash: DashPlanner;
  //체력은 이벤트마다 전체 값이 오지 않아서 여기서 따라 센다.
  //damageApplied 는 확정값을 주므로 그때마다 어긋난 값이 맞춰진다
  private readonly hp = new Map<string, number>();
  //정신력도 마찬가지다. mentalityChanged 는 바뀔 때만 오므로 시작값은 캐릭터 데이터에서 온다
  private readonly mentality = new Map<string, number>();
  private clash: ActiveClash | null = null;
  //화살표가 그려져 있는지. 교전이 시작되면 한 번 지운다
  private arrowsDrawn = false;

  constructor(
    private readonly battle: BattleCatalog,
    private readonly stage: Stage,
    private readonly context: UiContext,
    private readonly data: UiData,
    rng: Rng,
  ) {
    this.dash = new DashPlanner(data.dash, rng);
  }

  //이벤트 묶음을 받아 UI 명령 목록을 낸다
  consume(events: readonly BattleEvent[]): UiCommand[] {
    const commands: UiCommand[] = [];

    for (const event of events) {
      switch (event.type) {
        case 'turnStart':
          this.dash.reset();
          this.onTurnStart(commands);
          break;

        //적이 누구를 겨눴는지 화살표로 보여 준다
        case 'enemyTargeted':
          this.pushArrow(commands, event.enemyId, event.targetId);
          break;

        case 'clashStart':
          this.clearArrows(commands);
          this.clash = { attackerId: event.attackerId, defenderId: event.defenderId, deadlockCount: 0 };
          this.pushDash(commands, [event.attackerId, event.defenderId]);
          break;

        case 'oneSidedStart':
          this.clearArrows(commands);
          //일방 공격은 공격자만 달려간다. 맞는 쪽은 제자리다
          this.pushDash(
            commands,
            this.data.dash.oneSided === 'both' ? [event.attackerId, event.targetId] : [event.attackerId],
          );
          break;

        case 'deadlock':
          if (this.clash) this.clash.deadlockCount = event.count;
          break;

        case 'deadlockLimit':
          if (this.clash) this.clash.deadlockCount = this.data.badge.deadlockMax;
          break;

        case 'damageApplied':
          this.hp.set(event.combatantId, event.hp);
          this.pushBar(commands, event.combatantId, 'hp');
          break;

        //출혈 등은 남은 체력을 안 주므로 깎인 만큼만 빼 둔다
        case 'statusTicked':
          this.hp.set(event.combatantId, this.hpOf(event.combatantId) - event.damage);
          this.pushBar(commands, event.combatantId, 'hp');
          break;

        case 'mentalityChanged':
          this.mentality.set(event.combatantId, event.mentality);
          this.pushBar(commands, event.combatantId, 'mentality');
          break;

        case 'clashEnd':
          this.pushBadges(commands, event.winnerId);
          this.pushDashBack(commands, [event.attackerId, event.defenderId]);
          this.clash = null;
          break;

        case 'oneSidedEnd':
          this.pushDashBack(commands, [event.attackerId, event.targetId]);
          break;

        case 'turnEnd':
          this.clearArrows(commands);
          break;

        default:
          break;
      }
    }

    return commands;
  }

  //아군이 고른 대상을 화살표로 그린다. 이건 이벤트가 아니라 입력이라 따로 받는다
  selectTarget(sourceId: string, targetId: string): UiCommand[] {
    const commands: UiCommand[] = [];
    this.pushArrow(commands, sourceId, targetId);
    return commands;
  }

  //턴이 시작되면 모두 제자리에서 대기 동작으로 돌아간다
  private onTurnStart(commands: UiCommand[]): void {
    for (const id of this.context.combatants()) {
      if (!this.hasAssets(id)) continue;
      commands.push({
        type: 'float',
        combatantId: id,
        base: { ...this.context.actor(id).position },
        amplitude: this.data.float.amplitude * this.heightOf(id),
        periodSec: this.data.float.periodSec,
      });
      //턴마다 바를 한 번 새로 낸다. 정신력은 바뀔 때만 이벤트가 와서 이게 없으면 첫 턴에 안 뜬다
      this.pushBar(commands, id, 'hp');
      this.pushBar(commands, id, 'mentality');
    }
  }

  //달려갈 자리를 잡아 명령으로 낸다
  private pushDash(commands: UiCommand[], combatantIds: string[]): void {
    const movers = combatantIds
      .filter((id) => this.hasAssets(id))
      .map((id) => ({ combatantId: id, from: { ...this.context.actor(id).position } }));
    if (movers.length === 0) return;

    const first = movers[0];
    if (!first) return;
    for (const spot of this.dash.plan({ movers }, this.heightOf(first.combatantId))) {
      commands.push({
        type: 'dashTo',
        combatantId: spot.combatantId,
        position: spot.position,
        speed: this.data.dash.speed * this.heightOf(spot.combatantId),
      });
    }
  }

  //교전이 끝나면 제자리로 돌아가고 대기 동작을 다시 건다
  private pushDashBack(commands: UiCommand[], combatantIds: string[]): void {
    for (const id of combatantIds) {
      if (!this.hasAssets(id)) continue;
      commands.push({ type: 'dashBack', combatantId: id });
      commands.push({
        type: 'float',
        combatantId: id,
        base: { ...this.context.actor(id).position },
        amplitude: this.data.float.amplitude * this.heightOf(id),
        periodSec: this.data.float.periodSec,
      });
    }
  }

  //합이 끝나면 양쪽에 동시에 배지가 뜬다 (§4.1)
  private pushBadges(commands: UiCommand[], winnerId: string | null): void {
    const clash = this.clash;
    if (!clash) return;

    const both = [clash.attackerId, clash.defenderId];
    if (winnerId === null) {
      //교착이 한 번도 없었으면 그냥 무승부다. 교착 배지를 붙이지 않는다
      if (clash.deadlockCount === 0) return;
      const text = `교착 ${clash.deadlockCount}/${this.data.badge.deadlockMax}`;
      for (const id of both) this.pushBadge(commands, id, 'deadlock', text);
      return;
    }

    for (const id of both) {
      this.pushBadge(commands, id, id === winnerId ? 'win' : 'lose', null);
    }
  }

  //배지 하나. 바 묶음보다 한 단 위에서 떠오른다
  private pushBadge(commands: UiCommand[], combatantId: string, result: BadgeResult, text: string | null): void {
    if (!this.hasAssets(combatantId)) return;
    const height = this.heightOf(combatantId);
    const from = {
      x: this.context.actor(combatantId).position.x,
      y: this.barTop(combatantId) - this.data.bar.gap * height,
    };
    commands.push({
      type: 'clashBadge',
      combatantId,
      result,
      from,
      to: { x: from.x, y: from.y - this.data.badge.rise * height },
      durationSec: this.data.badge.riseSec,
      text,
    });
  }

  //바 하나를 낸다. 체력은 따라 센 값, 정신력은 이벤트가 준 값을 쓴다
  private pushBar(commands: UiCommand[], combatantId: string, kind: 'hp' | 'mentality'): void {
    if (!this.hasAssets(combatantId)) return;

    const height = this.heightOf(combatantId);
    const bar = this.data.bar;
    const width = bar.width * height;
    const barHeight = bar.height * height;
    //체력바가 정신력바 위에 온다 (원본 sortingOrder 3 vs 1)
    const bottom = kind === 'hp' ? this.barTop(combatantId) + barHeight : this.mentalityBottom(combatantId);

    commands.push({
      type: 'bar',
      combatantId,
      kind,
      ratio: kind === 'hp' ? this.hpRatio(combatantId) : this.mentalityRatio(combatantId),
      origin: { x: this.context.actor(combatantId).position.x - width / 2, y: bottom - barHeight },
      size: { width, height: barHeight },
      tweenSec: bar.tweenSec,
      easing: bar.easing,
    });
  }

  //정신력바의 바닥. 머리 위 여백만큼 띄운 자리다 (SPEC-002 §5.1)
  private mentalityBottom(combatantId: string): number {
    const placement = this.context.actor(combatantId);
    const catalog = this.stage.catalogFor(placement.characterId);
    const idle = catalog.frameEndingWith('idle') ?? catalog.manifest.frames[0];
    if (!idle) return placement.position.y;

    //bbox 상단을 무대 좌표로 옮긴다. 화면에서는 y 가 작을수록 위다
    const bboxTop = placement.position.y + (idle.bbox[1] - idle.anchor.y);
    return bboxTop - this.data.bar.topMargin * this.heightOf(combatantId);
  }

  //체력바의 윗변. 배지가 이 위에 붙는다
  private barTop(combatantId: string): number {
    const height = this.heightOf(combatantId);
    return this.mentalityBottom(combatantId) - (2 * this.data.bar.height + this.data.bar.gap) * height;
  }

  //캐릭터 키 H. 정지 프레임으로만 잰다 (SPEC-004 U-2)
  private heightOf(combatantId: string): number {
    return this.stage.catalogFor(this.context.actor(combatantId).characterId).characterHeight;
  }

  //화살표 하나를 그린다. 베지어 계산을 여기서 끝내고 점 목록만 넘긴다
  private pushArrow(commands: UiCommand[], sourceId: string, targetId: string): void {
    if (!this.hasAssets(sourceId) || !this.hasAssets(targetId)) return;

    const arrow = this.data.arrow;
    const height = this.heightOf(sourceId);
    const start = this.arrowPoint(sourceId);
    const end = this.arrowPoint(targetId);
    //제어점은 두 점의 중점에서 위로 띄운다. 화면에서는 y 가 작을수록 위다
    const control = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - arrow.curveHeight * height };

    const curve: Point[] = [];
    for (let i = 0; i <= arrow.segments; i += 1) {
      curve.push(bezier(i / arrow.segments, start, control, end));
    }

    commands.push({
      type: 'targetArrow',
      sourceId,
      targetId,
      curve,
      head: arrowHead(curve, arrow.headLength * height, arrow.headAngleDeg),
      drawSec: arrow.drawSec,
      colorStart: arrow.colorStart,
      colorEnd: arrow.colorEnd,
    });
    this.arrowsDrawn = true;
  }

  //화살표가 붙는 점. 카드 UI 가 들어오면 데이터 한 줄로 바뀐다 (U-3)
  private arrowPoint(combatantId: string): Point {
    const placement = this.context.actor(combatantId);
    const catalog = this.stage.catalogFor(placement.characterId);
    const idle = catalog.frameEndingWith('idle') ?? catalog.manifest.frames[0];
    if (!idle) return { ...placement.position };
    return this.stage.framePoint(placement, idle.id, 'headCenter');
  }

  //그려 둔 화살표를 한 번만 지운다
  private clearArrows(commands: UiCommand[]): void {
    if (!this.arrowsDrawn) return;
    commands.push({ type: 'clearArrows' });
    this.arrowsDrawn = false;
  }

  //에셋이 아직 안 들어온 캐릭터는 UI 도 붙이지 않는다 (SPEC-002 §10)
  private hasAssets(combatantId: string): boolean {
    return this.stage.has(this.context.actor(combatantId).characterId);
  }

  //따라 센 체력. 아직 못 봤으면 최대 체력이다
  private hpOf(combatantId: string): number {
    const known = this.hp.get(combatantId);
    if (known !== undefined) return known;
    return this.maxHpOf(combatantId);
  }

  private maxHpOf(combatantId: string): number {
    return this.battle.character(this.context.actor(combatantId).characterId).maxHp;
  }

  private hpRatio(combatantId: string): number {
    return clamp01(this.hpOf(combatantId) / this.maxHpOf(combatantId));
  }

  //따라 센 정신력. 아직 못 봤으면 캐릭터의 시작 정신력이다
  private mentalityRatio(combatantId: string): number {
    const characterId = this.context.actor(combatantId).characterId;
    const known = this.mentality.get(combatantId) ?? this.battle.character(characterId).mentality;
    return clamp01(known / this.battle.rules.mentalityMax);
  }
}

//0~1 로 자른다
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

//2차 베지어 한 점
function bezier(t: number, start: Point, control: Point, end: Point): Point {
  const u = 1 - t;
  return {
    x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
    y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
  };
}

//곡선 끝에 붙는 화살촉 세 점. 마지막 두 점이 만드는 방향을 쓴다
function arrowHead(curve: Point[], length: number, angleDeg: number): [Point, Point, Point] {
  const tip = curve[curve.length - 1] ?? { x: 0, y: 0 };
  const before = curve[curve.length - 2] ?? tip;
  const dx = tip.x - before.x;
  const dy = tip.y - before.y;
  const norm = Math.hypot(dx, dy) || 1;
  const ux = dx / norm;
  const uy = dy / norm;
  //진행 방향의 수직. 좌우 날개를 벌리는 데 쓴다
  const spread = Math.tan((angleDeg * Math.PI) / 180) * length;

  return [
    { x: tip.x - ux * length - uy * spread, y: tip.y - uy * length + ux * spread },
    { ...tip },
    { x: tip.x - ux * length + uy * spread, y: tip.y - uy * length - ux * spread },
  ];
}
