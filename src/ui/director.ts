//전투 이벤트를 UI 명령으로 바꾼다 (SPEC-004 §1, §6 · SPEC-005)
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
  //trail 은 잔상 설정. 렌더러가 달리는 동안 지난 자리를 옅게 남긴다
  | {
      type: 'dashTo';
      combatantId: string;
      position: Point;
      speed: number;
      trail: { count: number; intervalSec: number; alpha: number };
    }
  | { type: 'dashBack'; combatantId: string }
  //기준 높이를 같이 준다. 렌더러가 base + sin(t)·amplitude 로 그린다
  //원본처럼 position.y += sin(...) 로 누적하면 캐릭터가 떠내려간다 (§5.3)
  | { type: 'float'; combatantId: string; base: Point; amplitude: number; periodSec: number }
  //── 아래는 SPEC-005 전투 연출 ──
  //쓴 스킬 이름. 머리 위 상대 쪽에 잠깐 뜬다
  | { type: 'skillBanner'; combatantId: string; text: string; at: Point; size: number; sec: number; facing: 1 | -1 }
  //머리 위 코인이 뒤집힌다. rolls 는 이번 라운드 앞면 여부
  | { type: 'coinToss'; combatantId: string; rolls: boolean[]; at: Point; size: number }
  //진 쪽 코인 하나가 깨진다
  | { type: 'coinBreak'; combatantId: string; coinsLeft: number }
  //이번 라운드 위력. 상대 쪽 가슴 높이에 뜬다
  | { type: 'clashPower'; combatantId: string; value: number; at: Point; size: number }
  //맞부딪힘. 접점에 불꽃, 양쪽 반동. 진 쪽이 더 밀린다. 교착이면 winnerId 가 null
  | {
      type: 'clashResult';
      winnerId: string | null;
      contact: Point;
      sparkSize: number;
      recoil: { combatantId: string; dx: number }[];
      recoilSec: number;
    }
  | {
      type: 'damageNumber';
      combatantId: string;
      damage: number;
      from: Point;
      to: Point;
      size: number;
      sec: number;
      heavy: boolean;
    }
  //렌더러 시계만 멈춘다. 도메인 결과와 무관하다
  | { type: 'hitStop'; sec: number }
  | { type: 'knockback'; combatantId: string; dx: number; sec: number }
  | { type: 'flash'; alpha: number; sec: number }
  //다음 명령까지 쉬는 박자. 합 라운드가 읽히게 한다
  | { type: 'beat'; sec: number };

//진행 중인 합 하나. 배지를 끝에 한 번만 내기 위해 모아 둔다
interface ActiveClash {
  attackerId: string;
  defenderId: string;
  deadlockCount: number;
}

//진행 중인 교전 하나. 라운드 박자를 세는 데 쓴다
interface ActiveEngagement {
  //합이면 2명, 일방이면 1명이 코인을 굴린다
  rollers: number;
  attackerId: string;
  targetId: string;
  coinsSeen: number;
  powersSeen: number;
}

//캐릭터 한 명의 몸 비율. 에셋이 없으면 기준 캐릭터에서 빌린다
interface Body {
  height: number;
  //발에서 bbox 윗변까지, 발에서 머리 중심까지 (위쪽이 음수)
  top: number;
  head: number;
}

export class UiDirector {
  private readonly dash: DashPlanner;
  //체력은 이벤트마다 전체 값이 오지 않아서 여기서 따라 센다.
  //damageApplied 는 확정값을 주므로 그때마다 어긋난 값이 맞춰진다
  private readonly hp = new Map<string, number>();
  //정신력도 마찬가지다. mentalityChanged 는 바뀔 때만 오므로 시작값은 캐릭터 데이터에서 온다
  private readonly mentality = new Map<string, number>();
  private clash: ActiveClash | null = null;
  private engagement: ActiveEngagement | null = null;
  //대시로 잡아 둔 자리. 접점·피해 숫자 위치를 여기서 잰다. 제자리로 가면 지운다
  private readonly standing = new Map<string, Point>();
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
          this.engagement = {
            rollers: 2,
            attackerId: event.attackerId,
            targetId: event.defenderId,
            coinsSeen: 0,
            powersSeen: 0,
          };
          this.pushBanner(commands, event.attackerId, event.attackerSkillId);
          this.pushBanner(commands, event.defenderId, event.defenderSkillId);
          this.pushDash(commands, [event.attackerId, event.defenderId], [event.attackerId, event.defenderId]);
          break;

        case 'oneSidedStart':
          this.clearArrows(commands);
          this.engagement = {
            rollers: 1,
            attackerId: event.attackerId,
            targetId: event.targetId,
            coinsSeen: 0,
            powersSeen: 0,
          };
          this.pushBanner(commands, event.attackerId, event.skillId);
          //일방 공격은 공격자만 달려간다. 맞는 쪽은 제자리다.
          //다만 중심은 둘의 중점이라야 한다. 공격자 혼자로 잡으면 제자리에서 안 움직인다
          this.pushDash(
            commands,
            this.data.dash.oneSided === 'both' ? [event.attackerId, event.targetId] : [event.attackerId],
            [event.attackerId, event.targetId],
          );
          break;

        //코인은 양쪽이 다 굴린 뒤에 한 박자 쉰다
        case 'coinRolled':
          this.pushCoins(commands, event.combatantId, event.rolls);
          if (this.engagement && ++this.engagement.coinsSeen % this.engagement.rollers === 0) {
            commands.push({ type: 'beat', sec: this.data.clash.coinSec });
          }
          break;

        case 'damageCalculated':
          this.pushPower(commands, event.combatantId, event.damage);
          if (this.engagement && ++this.engagement.powersSeen % this.engagement.rollers === 0) {
            commands.push({ type: 'beat', sec: this.data.clash.powerSec });
          }
          break;

        case 'clashRoundWin':
          this.pushClashResult(commands, event.winnerId);
          break;

        case 'coinLost':
          commands.push({ type: 'coinBreak', combatantId: event.combatantId, coinsLeft: event.coin });
          break;

        case 'deadlock':
          if (this.clash) this.clash.deadlockCount = event.count;
          this.pushClashResult(commands, null);
          break;

        case 'deadlockLimit':
          if (this.clash) this.clash.deadlockCount = this.data.badge.deadlockMax;
          break;

        case 'damageApplied':
          this.hp.set(event.combatantId, event.hp);
          if (event.damage > 0) this.pushImpact(commands, event.combatantId, event.damage);
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
          this.engagement = null;
          break;

        case 'oneSidedEnd':
          this.pushDashBack(commands, [event.attackerId, event.targetId]);
          this.engagement = null;
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
      if (!this.hasBody(id)) continue;
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

  //달려갈 자리를 잡아 명령으로 낸다. participants 는 중심을 잡는 데만 쓴다
  private pushDash(commands: UiCommand[], combatantIds: string[], participants: string[]): void {
    const movers = combatantIds
      .filter((id) => this.hasBody(id))
      .map((id) => ({ combatantId: id, from: { ...this.context.actor(id).position } }));
    if (movers.length === 0) return;

    const first = movers[0];
    if (!first) return;
    const spots = participants.map((id) => this.context.actor(id).position);
    const center = {
      x: spots.reduce((acc, p) => acc + p.x, 0) / spots.length,
      y: spots.reduce((acc, p) => acc + p.y, 0) / spots.length,
    };
    for (const spot of this.dash.plan({ movers, center }, this.heightOf(first.combatantId))) {
      this.standing.set(spot.combatantId, { ...spot.position });
      commands.push({
        type: 'dashTo',
        combatantId: spot.combatantId,
        position: spot.position,
        speed: this.data.dash.speed * this.heightOf(spot.combatantId),
        trail: { ...this.data.afterimage },
      });
    }
  }

  //교전이 끝나면 제자리로 돌아가고 대기 동작을 다시 건다
  private pushDashBack(commands: UiCommand[], combatantIds: string[]): void {
    for (const id of combatantIds) {
      if (!this.hasBody(id)) continue;
      this.standing.delete(id);
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
    if (!this.hasBody(combatantId)) return;
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
    if (!this.hasBody(combatantId)) return;

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
    const body = this.bodyOf(combatantId);
    //bbox 상단을 무대 좌표로 옮긴다. 화면에서는 y 가 작을수록 위다
    const bboxTop = this.context.actor(combatantId).position.y + body.top;
    return bboxTop - this.data.bar.topMargin * body.height;
  }

  //체력바의 윗변. 배지가 이 위에 붙는다
  private barTop(combatantId: string): number {
    const height = this.heightOf(combatantId);
    return this.mentalityBottom(combatantId) - (2 * this.data.bar.height + this.data.bar.gap) * height;
  }

  //캐릭터 키 H. 정지 프레임으로만 잰다 (SPEC-004 U-2)
  private heightOf(combatantId: string): number {
    return this.bodyOf(combatantId).height;
  }

  //몸 비율. 자기 에셋이 있으면 그걸, 없으면 기준 캐릭터 것을 쓴다 (SPEC-005 §5)
  private bodyOf(combatantId: string): Body {
    const characterId = this.context.actor(combatantId).characterId;
    const catalog = this.stage.has(characterId) ? this.stage.catalogFor(characterId) : this.stage.reference();
    if (!catalog) throw new Error('에셋이 들어온 캐릭터가 하나도 없어 UI 비율을 잡을 수 없다');
    const idle = catalog.frameEndingWith('idle') ?? catalog.manifest.frames[0];
    if (!idle) throw new Error(`${characterId} 에 프레임이 없다`);
    return {
      height: catalog.characterHeight,
      top: idle.bbox[1] - idle.anchor.y,
      head: idle.headCenter.y - idle.anchor.y,
    };
  }

  //지금 서 있는 자리. 달려가 있으면 그 자리다
  private whereIs(combatantId: string): Point {
    return this.standing.get(combatantId) ?? this.context.actor(combatantId).position;
  }

  //상대 쪽을 보는 방향. 교전 상대가 오른쪽에 있으면 1
  private towardOpponent(combatantId: string): 1 | -1 {
    const engagement = this.engagement;
    if (engagement) {
      const other = combatantId === engagement.attackerId ? engagement.targetId : engagement.attackerId;
      return this.whereIs(other).x >= this.whereIs(combatantId).x ? 1 : -1;
    }
    return this.context.actor(combatantId).facing;
  }

  //스킬 이름 띠. 머리 위 상대 쪽에 뜬다
  private pushBanner(commands: UiCommand[], combatantId: string, skillId: number): void {
    if (!this.hasBody(combatantId)) return;
    const body = this.bodyOf(combatantId);
    const home = this.context.actor(combatantId).position;
    const facing = this.towardOpponent(combatantId);
    const banner = this.data.banner;
    commands.push({
      type: 'skillBanner',
      combatantId,
      text: this.battle.skill(skillId).name,
      at: { x: home.x + facing * banner.offsetX * body.height, y: home.y - banner.height * body.height },
      size: banner.size * body.height,
      sec: banner.sec,
      facing,
    });
  }

  //머리 위 코인 한 줄. 바 묶음 바로 위다
  private pushCoins(commands: UiCommand[], combatantId: string, rolls: boolean[]): void {
    if (!this.hasBody(combatantId)) return;
    const height = this.heightOf(combatantId);
    const size = this.data.clash.coinSize * height;
    //바는 제자리 기준으로 잡혀 있다. 달려간 만큼 옮겨서 캐릭터 머리 위에 붙인다
    const shift = this.shiftOf(combatantId);
    commands.push({
      type: 'coinToss',
      combatantId,
      rolls: [...rolls],
      at: {
        x: this.whereIs(combatantId).x,
        y: this.barTop(combatantId) + shift.y - this.data.bar.gap * height - size / 2,
      },
      size,
    });
  }

  //위력 숫자. 상대 쪽 가슴 높이다
  private pushPower(commands: UiCommand[], combatantId: string, value: number): void {
    if (!this.hasBody(combatantId)) return;
    const height = this.heightOf(combatantId);
    const here = this.whereIs(combatantId);
    const clash = this.data.clash;
    commands.push({
      type: 'clashPower',
      combatantId,
      value,
      at: {
        x: here.x + this.towardOpponent(combatantId) * clash.powerOffsetX * height,
        y: here.y - clash.powerOffsetY * height,
      },
      size: clash.powerSize * height,
    });
  }

  //합 한 라운드의 결과. 접점에 불꽃, 양쪽 반동, 카메라가 당기는 사이 잠깐 멈춘다
  private pushClashResult(commands: UiCommand[], winnerId: string | null): void {
    const engagement = this.engagement;
    if (!engagement) return;
    const ids = [engagement.attackerId, engagement.targetId].filter((id) => this.hasBody(id));
    if (ids.length === 0) return;

    const clash = this.data.clash;
    const height = this.heightOf(ids[0] as string);
    const points = ids.map((id) => this.whereIs(id));
    const contact = {
      x: points.reduce((acc, p) => acc + p.x, 0) / points.length,
      y: points.reduce((acc, p) => acc + p.y, 0) / points.length - clash.contactHeight * height,
    };

    commands.push({
      type: 'clashResult',
      winnerId,
      contact,
      sparkSize: clash.sparkSize * height,
      //접점에서 멀어지는 쪽으로 밀린다. 진 쪽이 더 크게, 교착이면 똑같이 중간만큼
      recoil: ids.map((id) => {
        const away = this.whereIs(id).x >= contact.x ? 1 : -1;
        const distance =
          winnerId === null
            ? (clash.recoilWinner + clash.recoilLoser) / 2
            : id === winnerId
              ? clash.recoilWinner
              : clash.recoilLoser;
        return { combatantId: id, dx: away * distance * height };
      }),
      recoilSec: clash.recoilSec,
    });
    commands.push({ type: 'hitStop', sec: this.data.hitStop.clashSec });
    commands.push({ type: 'beat', sec: clash.resultSec });
  }

  //피해가 실제로 들어간 한 방. 멈춤·숫자·넉백·(크면) 번쩍임
  private pushImpact(commands: UiCommand[], damagedId: string, damage: number): void {
    if (!this.hasBody(damagedId)) return;
    const stop = this.data.hitStop;
    commands.push({ type: 'hitStop', sec: Math.min(stop.maxSec, stop.baseSec + damage * stop.perDamageSec) });

    const text = this.data.damageText;
    const height = this.heightOf(damagedId);
    const here = this.whereIs(damagedId);
    const heavy = damage >= text.heavyDamage;
    const from = { x: here.x, y: here.y - text.height * height };
    commands.push({
      type: 'damageNumber',
      combatantId: damagedId,
      damage,
      from,
      to: { x: from.x, y: from.y - text.rise * height },
      size: text.size * height * (heavy ? 1.4 : 1),
      sec: text.sec,
      heavy,
    });

    //때린 쪽 반대로 밀린다
    const engagement = this.engagement;
    const source = engagement
      ? damagedId === engagement.targetId
        ? engagement.attackerId
        : engagement.targetId
      : null;
    const away = source && source !== damagedId ? (here.x >= this.whereIs(source).x ? 1 : -1) : -this.context.actor(damagedId).facing;
    commands.push({
      type: 'knockback',
      combatantId: damagedId,
      dx: away * this.data.knockback.distance * height,
      sec: this.data.knockback.sec,
    });

    if (heavy) commands.push({ type: 'flash', alpha: this.data.flash.alpha, sec: this.data.flash.sec });
  }

  //달려가 있는 만큼의 차이. 바는 제자리 기준이라 코인을 따라 붙일 때 쓴다
  private shiftOf(combatantId: string): Point {
    const home = this.context.actor(combatantId).position;
    const here = this.whereIs(combatantId);
    return { x: here.x - home.x, y: here.y - home.y };
  }

  //화살표 하나를 그린다. 베지어 계산을 여기서 끝내고 점 목록만 넘긴다
  private pushArrow(commands: UiCommand[], sourceId: string, targetId: string): void {
    if (!this.hasBody(sourceId) || !this.hasBody(targetId)) return;

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
    //자기 에셋이 있으면 반전까지 따지는 framePoint 로 정확히 잡는다
    if (this.stage.has(placement.characterId)) {
      const catalog = this.stage.catalogFor(placement.characterId);
      const idle = catalog.frameEndingWith('idle') ?? catalog.manifest.frames[0];
      if (idle) return this.stage.framePoint(placement, idle.id, 'headCenter');
    }
    return { x: placement.position.x, y: placement.position.y + this.bodyOf(combatantId).head };
  }

  //그려 둔 화살표를 한 번만 지운다
  private clearArrows(commands: UiCommand[]): void {
    if (!this.arrowsDrawn) return;
    commands.push({ type: 'clearArrows' });
    this.arrowsDrawn = false;
  }

  //UI 를 붙일 수 있는지. 자기 에셋이 없어도 비율을 빌릴 기준 캐릭터가 있으면 된다 (SPEC-005 §5)
  private hasBody(combatantId: string): boolean {
    return this.stage.has(this.context.actor(combatantId).characterId) || this.stage.reference() !== null;
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
