//명령을 받아 실제로 그린다 (SPEC-003 §1 의 마지막 층 · SPEC-005 전투 연출)
//
//여기가 DOM·canvas 를 쓰는 유일한 곳이다. 도메인·어댑터는 그림을 모른다.
//어댑터가 순서를 정하고 여기가 시간을 가진다 — 컷신은 타임라인 장벽으로 다룬다 (SPEC-003 §5.3).
//히트스톱·슬로모도 여기 시계에만 걸린다. 도메인 결과에는 아무 영향이 없다 (SPEC-005 §5)

import type { CameraCommand } from '../camera/director.js';
import type { LayerTransform } from '../render/cutscene.js';
import type { Point, SpriteCatalog } from '../render/manifest.js';
import type { RenderCommand } from '../render/presenter.js';
import type { Stage, StagePlacement } from '../render/stage.js';
import type { UiCommand } from '../ui/director.js';
import type { MotionData } from '../ui/data.js';
import { Scene, type CameraState } from './scene.js';

//렌더러가 그림을 찾는 통로. 어느 파일이 어느 비트맵인지는 밖에서 정한다
export interface ImageSource {
  //캐릭터 스프라이트 (assets/<캐릭터>/<파일>)
  character(characterId: string, file: string): CanvasImageSource | null;
  //배경 (assets/map/<파일>)
  map(file: string): CanvasImageSource | null;
}

//대기열에 들어가는 것. 카메라 명령도 같은 줄에 선다 (SPEC-005 §3.1)
type Queued = RenderCommand | UiCommand | { type: 'camera'; command: CameraCommand };

//되돌아오는 밀림. 반동·넉백은 튕겼다 돌아오고, 내딛기는 살짝 당겼다가 앞으로 나갔다 돌아온다
interface Push {
  kind: 'recoil' | 'lunge';
  dx: number;
  sec: number;
  t: number;
  //내딛기에서 뒤로 당기는 예비 동작 시간. 이게 끝나야 앞으로 나간다
  windupSec: number;
}

//무대에 선 캐릭터 하나의 현재 모습
interface Actor {
  placement: StagePlacement;
  home: Point;
  //지금 재생 중인 프레임 순서와 남은 시간
  frames: string[];
  frameIndex: number;
  elapsed: number;
  //대시 목적지. null 이면 서 있다
  target: Point | null;
  speed: number;
  //부유 동작. 기준 높이를 따로 들어서 누적 대입을 막는다 (SPEC-004 §5.3)
  float: { base: Point; amplitude: number; periodSec: number } | null;
  pushes: Push[];
  //잔상. 달리는 동안 지난 자리를 몇 장 남긴다
  trail: { count: number; intervalSec: number; alpha: number } | null;
  ghosts: { position: Point; frameId: string | null; age: number }[];
  ghostClock: number;
  //바. 빨간 칸은 바로 줄고, 흰 칸은 뒤따라 줄어든다
  bars: Record<'hp' | 'mentality', { shown: number; lag: number; target: number; tweenSec: number }>;
  //제자리 기준 좌표를 발에서의 거리로 들고 있다. 달려가도 머리 위에 붙어 따라간다
  barBox: Record<'hp' | 'mentality', { rel: Point; width: number; height: number } | null>;
  coins: { rolls: boolean[]; at: Point; size: number; t: number; broken: number | null; brokenT: number } | null;
  power: { value: number; at: Point; size: number; t: number; result: 'win' | 'lose' | 'tie' | null; resultT: number } | null;
  banner: { text: string; at: Point; size: number; sec: number; t: number; facing: 1 | -1 } | null;
  //맞고 몸이 번쩍이는 남은 시간
  hurt: number;
  //숨쉬기 박자를 사람마다 어긋나게 하는 값
  breathPhase: number;
}

//재생 중인 이펙트 하나. 마지막 키프레임에도 그림이 남으므로 끝나면 반드시 지운다
interface LiveEffect {
  characterId: string;
  //생성 시점의 월드 좌표. follow 가 없으면 여기 박힌다
  origin: Point;
  //무기 궤적은 휘두르는 사람을 따라간다. 내딛는 동안 궤적만 제자리에 남으면 칼과 어긋난다
  follow: { combatantId: string; rel: Point } | null;
  //배율을 재는 기준점. 생성 시점의 접지점이다
  groundRef: Point;
  size: { width: number; height: number };
  flipped: boolean;
  blend: string;
  frames: { file: string; ms: number }[];
  elapsed: number;
}

interface LiveSpark {
  contact: Point;
  //배율을 재는 접지점. 접점은 가슴 높이라 그걸로 재면 불꽃이 쪼그라든다
  groundRef: Point;
  size: number;
  t: number;
  tie: boolean;
}

interface LiveNumber {
  owner: string;
  damage: number;
  from: Point;
  to: Point;
  size: number;
  sec: number;
  heavy: boolean;
  t: number;
}

//떠오르는 합 배지
interface LiveBadge {
  combatantId: string;
  from: Point;
  to: Point;
  durationSec: number;
  elapsed: number;
  result: 'win' | 'lose' | 'deadlock';
  text: string | null;
}

//그려지는 중인 타겟 화살표
interface LiveArrow {
  sourceId: string;
  targetId: string;
  curve: Point[];
  head: Point[];
  drawSec: number;
  elapsed: number;
  colorStart: string;
  colorEnd: string;
}

//진행 중인 컷신. 이게 살아 있는 동안 뒤 명령을 흘리지 않는다
interface LiveCutscene {
  characterId: string;
  layers: LayerTransform[];
  elapsed: number;
  durationSec: number;
}

//렌더러 안쪽의 그리기 상수. 연출 수치(ui-data.json)가 아니라 그리는 방식에 딸린 값이다
const FRAME_MS = 130;
//궁극기의 ready·cardAdded·used 단계를 알아볼 시간
const PHASE_SEC = 0.25;
const CUTSCENE_SEC = 1.6;
const SHAKE_SEC = 0.25;
const SHAKE_PX = 16;
//카메라가 목표를 따라가는 빠르기. 클수록 빨리 붙는다
const CAMERA_FOLLOW = 7;
const COIN_FLIP_SEC = 0.2;
const COIN_STAGGER_SEC = 0.045;
const POP_SEC = 0.12;
const SPARK_SEC = 0.26;
const BANNER_FADE_SEC = 0.3;

const BADGE_COLOR: Record<LiveBadge['result'], string> = {
  win: '#ffd94a',
  lose: '#8fb7ff',
  deadlock: '#c9c9c9',
};

export class CanvasRenderer {
  private readonly actors = new Map<string, Actor>();
  private readonly effects: LiveEffect[] = [];
  private readonly sparks: LiveSpark[] = [];
  private readonly numbers: LiveNumber[] = [];
  private readonly badges: LiveBadge[] = [];
  private arrows: LiveArrow[] = [];
  private cutscene: LiveCutscene | null = null;

  //아직 실행하지 않은 명령. 어댑터가 순서를 정하고 여기가 시간을 나눠 준다
  private queue: Queued[] = [];
  //이 시간이 지나야 다음 명령을 꺼낸다
  private gate = 0;
  //히트스톱. 남아 있는 동안 세상이 멈춘다
  private freeze = 0;
  //슬로모. 남아 있는 동안 세상이 scale 배로 흐른다
  private slowmo: { scale: number; left: number } | null = null;
  private flash: { alpha: number; sec: number; t: number } | null = null;

  //카메라. 목표만 명령으로 받고 실제 값은 매 장면 조금씩 따라간다
  private subjects: string[] | null = null;
  private focus: Point = { x: 0, y: 0 };
  private zoom = 1;
  private tilt = 0;
  private zoomGoal = 1;
  private tiltGoal = 0;
  private punch: { amount: number; sec: number; t: number } | null = null;
  private shakeLeft = 0;
  private shakeStrength = 0;
  private shake: Point = { x: 0, y: 0 };

  //프레임에 묶인 이펙트. 그 장이 실제로 화면에 떠 있을 때 터뜨린다 (SPEC-005 §3.2)
  private pendingOnFrame: { combatantId: string; frameId: string; command: RenderCommand }[] = [];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly scene: Scene,
    private readonly stage: Stage,
    private readonly images: ImageSource,
    //에셋 없는 캐릭터를 얼마만 하게 그릴지. 에셋 있는 캐릭터의 키를 쓴다
    private readonly placeholderHeight: number,
    //몸짓 수치 (ui-data.json motion)
    private readonly motion: MotionData,
  ) {}

  //무대에 캐릭터를 세운다. 전투가 새로 시작될 때 부른다
  reset(placements: readonly StagePlacement[]): void {
    this.actors.clear();
    this.effects.length = 0;
    this.sparks.length = 0;
    this.numbers.length = 0;
    this.badges.length = 0;
    this.arrows = [];
    this.cutscene = null;
    this.queue = [];
    this.gate = 0;
    this.freeze = 0;
    this.slowmo = null;
    this.flash = null;
    this.pendingOnFrame = [];
    this.subjects = null;
    this.zoom = this.zoomGoal = 1;
    this.tilt = this.tiltGoal = 0;
    this.punch = null;
    this.shakeLeft = 0;

    for (const placement of placements) {
      this.actors.set(placement.combatantId, {
        placement,
        home: { ...placement.position },
        frames: [],
        frameIndex: 0,
        elapsed: 0,
        target: null,
        speed: 0,
        float: null,
        pushes: [],
        trail: null,
        ghosts: [],
        ghostClock: 0,
        bars: {
          hp: { shown: 1, lag: 1, target: 1, tweenSec: 0.5 },
          mentality: { shown: 1, lag: 1, target: 1, tweenSec: 0.5 },
        },
        barBox: { hp: null, mentality: null },
        coins: null,
        power: null,
        banner: null,
        hurt: 0,
        breathPhase: phaseOf(placement.combatantId),
      });
    }
    this.focus = this.restFocus();
  }

  //어댑터가 낸 명령을 받아 대기열에 넣는다. 실행은 tick 이 시간을 보며 한다
  push(commands: readonly (RenderCommand | UiCommand)[]): void {
    this.queue.push(...commands);
  }

  //카메라 명령도 같은 대기열로 흘린다. 바로 적용하면 턴의 마지막 교전으로 먼저 튄다
  pushCamera(commands: readonly CameraCommand[]): void {
    for (const command of commands) this.queue.push({ type: 'camera', command });
  }

  //대기열도 비었고 아무도 움직이지 않는 상태. 다음 턴을 열어도 되는지 판단하는 데 쓴다
  get idle(): boolean {
    if (this.cutscene || this.queue.length > 0 || this.gate > 0 || this.freeze > 0) return false;
    for (const actor of this.actors.values()) {
      if (actor.target) return false;
    }
    return this.effects.length === 0;
  }

  //컷신이 도는 중인지
  get busy(): boolean {
    return this.cutscene !== null;
  }

  //── 명령 적용 ──

  //명령 하나를 실행하고, 다음 명령까지 기다릴 시간을 초로 돌려준다
  private apply(command: Queued): number {
    switch (command.type) {
      case 'camera':
        this.applyCamera(command.command);
        return 0;

      case 'playFrames': {
        const actor = this.actors.get(command.combatantId);
        if (!actor) return 0;
        actor.frames = [...command.frameIds];
        actor.frameIndex = 0;
        actor.elapsed = 0;
        //바로 뒤에 붙은 궤적은 지금 당겨서 그 장을 기다리게 한다. 다 돈 뒤에 꺼내면 이미 지나간 장이다
        while (this.queue[0]?.type === 'spawnEffect' && this.queue[0].frameId) {
          const next = this.queue.shift() as Extract<RenderCommand, { type: 'spawnEffect' }>;
          this.pendingOnFrame.push({ combatantId: next.sourceId, frameId: next.frameId as string, command: next });
        }
        this.releaseOnFrame(actor);
        if (!command.wait) return 0;
        //한 방이면 살짝 당겼다가 앞으로 내딛는다. 휘두르는 장만 바뀌면 제자리에서 팔만 흔드는 것처럼 보인다
        const windupSec = command.frameIds.length > 1 ? this.motion.windupMs / 1000 : 0;
        actor.pushes.push({
          kind: 'lunge',
          dx: actor.placement.facing * this.motion.lunge * this.heightOf(actor),
          sec: windupSec + this.motion.lungeSec,
          t: 0,
          windupSec,
        });
        //맞닿는 장이 뜰 때까지 붙든다
        let dwellMs = 0;
        for (let i = 0; i < command.frameIds.length - 1; i += 1) dwellMs += this.frameMs(actor, i);
        return dwellMs / 1000;
      }

      case 'spawnEffect': {
        if (command.frameId) {
          this.pendingOnFrame.push({ combatantId: command.sourceId, frameId: command.frameId, command });
          const actor = this.actors.get(command.sourceId);
          if (actor) this.releaseOnFrame(actor);
          return 0;
        }
        this.spawn(command);
        return 0;
      }

      case 'ultimate': {
        //컷신은 타임라인 장벽이다. 도는 동안 뒤 명령이 흐르지 않는다 (SPEC-003 §5.3)
        if (command.phase !== 'cutscene' || !command.layers) return PHASE_SEC;
        this.cutscene = {
          characterId: this.actors.get(command.combatantId)?.placement.characterId ?? '',
          layers: command.layers,
          elapsed: 0,
          durationSec: CUTSCENE_SEC,
        };
        return CUTSCENE_SEC;
      }

      case 'placeholder':
        return 0;

      case 'dashTo': {
        const actor = this.actors.get(command.combatantId);
        if (!actor) return 0;
        actor.target = { ...command.position };
        actor.speed = command.speed;
        actor.float = null;
        actor.trail = { ...command.trail };
        actor.ghosts = [];
        //도착할 때까지 기다린다. 달려가는 중에 코인이 뒤집히면 안 된다
        return this.travelSec(actor);
      }

      case 'dashBack': {
        const actor = this.actors.get(command.combatantId);
        if (!actor) return 0;
        actor.target = { ...actor.home };
        actor.coins = null;
        actor.power = null;
        //돌아가는 건 기다리지 않는다. 다음 교전이 겹쳐 시작해도 된다
        return 0;
      }

      case 'float': {
        const actor = this.actors.get(command.combatantId);
        if (actor) actor.float = { base: { ...command.base }, amplitude: command.amplitude, periodSec: command.periodSec };
        return 0;
      }

      case 'bar': {
        const actor = this.actors.get(command.combatantId);
        if (!actor) return 0;
        const bar = actor.bars[command.kind];
        bar.target = command.ratio;
        bar.shown = command.ratio;
        bar.tweenSec = command.tweenSec;
        actor.barBox[command.kind] = {
          rel: { x: command.origin.x - actor.home.x, y: command.origin.y - actor.home.y },
          width: command.size.width,
          height: command.size.height,
        };
        return 0;
      }

      case 'clashBadge':
        this.badges.push({
          combatantId: command.combatantId,
          from: { ...command.from },
          to: { ...command.to },
          durationSec: command.durationSec,
          elapsed: 0,
          result: command.result,
          text: command.text,
        });
        return 0;

      case 'targetArrow':
        this.arrows.push({
          sourceId: command.sourceId,
          targetId: command.targetId,
          curve: command.curve.map((p) => ({ ...p })),
          head: command.head.map((p) => ({ ...p })),
          drawSec: command.drawSec,
          elapsed: 0,
          colorStart: command.colorStart,
          colorEnd: command.colorEnd,
        });
        return 0;

      case 'clearArrows':
        this.arrows = [];
        return 0;

      case 'skillBanner': {
        const actor = this.actors.get(command.combatantId);
        if (actor) {
          actor.banner = { text: command.text, at: { ...command.at }, size: command.size, sec: command.sec, t: 0, facing: command.facing };
        }
        return 0;
      }

      case 'coinToss': {
        const actor = this.actors.get(command.combatantId);
        if (actor) {
          actor.coins = { rolls: [...command.rolls], at: { ...command.at }, size: command.size, t: 0, broken: null, brokenT: 0 };
          if (actor.power) actor.power = null;
        }
        return 0;
      }

      case 'coinBreak': {
        const actor = this.actors.get(command.combatantId);
        if (actor?.coins) {
          actor.coins.broken = command.coinsLeft;
          actor.coins.brokenT = 0;
        }
        return 0;
      }

      case 'clashPower': {
        const actor = this.actors.get(command.combatantId);
        if (actor) actor.power = { value: command.value, at: { ...command.at }, size: command.size, t: 0, result: null, resultT: 0 };
        return 0;
      }

      case 'clashResult': {
        const involved = command.recoil.map((r) => this.actors.get(r.combatantId)).filter((a): a is Actor => !!a);
        const groundY = involved.length
          ? involved.reduce((acc, a) => acc + a.placement.position.y, 0) / involved.length
          : command.contact.y;
        this.sparks.push({
          contact: { ...command.contact },
          groundRef: { x: command.contact.x, y: groundY },
          size: command.sparkSize,
          t: 0,
          tie: command.winnerId === null,
        });
        for (const { combatantId, dx } of command.recoil) {
          const actor = this.actors.get(combatantId);
          if (!actor) continue;
          actor.pushes.push({ kind: 'recoil', dx, sec: command.recoilSec, t: 0, windupSec: 0 });
          if (actor.power) {
            actor.power.result = command.winnerId === null ? 'tie' : combatantId === command.winnerId ? 'win' : 'lose';
            actor.power.resultT = 0;
          }
        }
        return 0;
      }

      case 'damageNumber':
        this.numbers.push({
          owner: command.combatantId,
          damage: command.damage,
          from: { ...command.from },
          to: { ...command.to },
          size: command.size,
          sec: command.sec,
          heavy: command.heavy,
          t: 0,
        });
        return 0;

      case 'hitStop':
        this.freeze = Math.max(this.freeze, command.sec);
        return command.sec;

      case 'knockback': {
        const actor = this.actors.get(command.combatantId);
        if (actor) {
          actor.pushes.push({ kind: 'recoil', dx: command.dx, sec: command.sec, t: 0, windupSec: 0 });
          actor.hurt = this.motion.hurtSec;
        }
        return 0;
      }

      case 'flash':
        this.flash = { alpha: command.alpha, sec: command.sec, t: 0 };
        return 0;

      case 'beat':
        return command.sec;

      default:
        return 0;
    }
  }

  //카메라 명령. 대상과 목표 배율만 바꾸고, 실제 값은 tick 에서 따라간다
  private applyCamera(command: CameraCommand): void {
    switch (command.type) {
      case 'idle':
        this.subjects = null;
        this.zoomGoal = 1;
        this.tiltGoal = 0;
        return;
      case 'focus':
        this.subjects = [...command.subjectIds];
        this.zoomGoal = command.zoom;
        this.tiltGoal = command.tiltDeg;
        return;
      case 'shake':
        this.shakeLeft = SHAKE_SEC;
        this.shakeStrength = Math.max(this.shakeStrength * (this.shakeLeft / SHAKE_SEC), command.intensity);
        return;
      case 'punch':
        this.punch = { amount: command.zoom, sec: command.sec, t: 0 };
        return;
      case 'slowmo':
        this.slowmo = { scale: command.scale, left: command.sec };
        return;
    }
  }

  //목적지까지 걸리는 시간
  private travelSec(actor: Actor): number {
    if (!actor.target || actor.speed <= 0) return 0;
    const here = actor.placement.position;
    return Math.hypot(actor.target.x - here.x, actor.target.y - here.y) / actor.speed;
  }

  //지금 떠 있는 장에 묶여 있던 이펙트를 터뜨린다
  private releaseOnFrame(actor: Actor): void {
    const current = actor.frames[actor.frameIndex];
    if (!current) return;
    const rest: typeof this.pendingOnFrame = [];
    for (const waiting of this.pendingOnFrame) {
      if (waiting.combatantId === actor.placement.combatantId && waiting.frameId === current) {
        this.spawn(waiting.command as Extract<RenderCommand, { type: 'spawnEffect' }>);
        continue;
      }
      rest.push(waiting);
    }
    this.pendingOnFrame = rest;
  }

  //이펙트를 월드에 박는다. 좌표는 제자리 기준으로 풀려 왔으므로 지금 서 있는 자리로 옮긴다.
  //명중 섬광은 맞은 쪽을, 나머지(궤적·지면 충격·잔불)는 낸 쪽을 따라 옮긴다
  private spawn(command: Extract<RenderCommand, { type: 'spawnEffect' }>): void {
    const source = this.actors.get(command.sourceId);
    if (!source) return;
    const placement = command.placement;
    const catalog = this.catalogOf(source);
    const anchor = catalog ? catalog.effect(placement.effectId).anchor : 'bladeTip';
    const owner = anchor === 'hitPoint' && command.targetId ? (this.actors.get(command.targetId) ?? source) : source;
    const here = this.positionOf(owner);
    const shift = { x: here.x - owner.home.x, y: here.y - owner.home.y };

    this.effects.push({
      characterId: source.placement.characterId,
      origin: { x: placement.origin.x + shift.x, y: placement.origin.y + shift.y },
      //프레임에 묶인 무기 궤적만 따라간다. 연기·잔불·섬광은 터진 자리에 남는다
      follow: command.frameId
        ? { combatantId: owner.placement.combatantId, rel: { x: placement.origin.x - owner.home.x, y: placement.origin.y - owner.home.y } }
        : null,
      groundRef: here,
      size: { ...placement.size },
      flipped: placement.flipped,
      blend: placement.blend,
      frames: placement.frames.map((f) => ({ ...f })),
      elapsed: 0,
    });
  }

  //── 시간 ──

  //시간을 흘린다. 여기서만 상태가 움직인다
  tick(realSec: number): void {
    const slow = this.slowmo ? this.slowmo.scale : 1;
    if (this.slowmo) {
      this.slowmo.left -= realSec;
      if (this.slowmo.left <= 0) this.slowmo = null;
    }
    //히트스톱 동안 세상은 멈추고, 명령 대기와 카메라 흔들림만 흐른다
    const frozen = this.freeze > 0;
    this.freeze = Math.max(0, this.freeze - realSec);
    const dt = frozen ? 0 : realSec * slow;

    if (this.cutscene) {
      this.cutscene.elapsed += realSec;
      if (this.cutscene.elapsed >= this.cutscene.durationSec) this.cutscene = null;
    }

    //시간이 되면 다음 명령을 꺼낸다. 컷신이 도는 동안에는 한 개도 안 꺼낸다
    this.gate = Math.max(0, this.gate - realSec * slow);
    while (!this.cutscene && this.gate <= 0 && this.queue.length > 0) {
      const command = this.queue.shift();
      if (!command) break;
      let dwell = this.apply(command);
      //같이 달려가는 사람들은 한꺼번에 출발한다. 가장 먼 사람이 도착할 때까지 기다린다
      if (command.type === 'dashTo') {
        while (this.queue[0]?.type === 'dashTo') {
          dwell = Math.max(dwell, this.apply(this.queue.shift() as Queued));
        }
      }
      this.gate += dwell;
    }

    for (const actor of this.actors.values()) this.tickActor(actor, dt);
    this.tickWorld(dt);
    this.tickCamera(realSec, dt);
  }

  private tickActor(actor: Actor, dt: number): void {
    if (actor.frames.length > 0 && dt > 0) {
      const before = actor.frameIndex;
      actor.elapsed += dt * 1000;
      while (actor.frameIndex < actor.frames.length - 1 && actor.elapsed >= this.frameMs(actor, actor.frameIndex)) {
        actor.elapsed -= this.frameMs(actor, actor.frameIndex);
        actor.frameIndex += 1;
      }
      if (actor.frameIndex !== before) this.releaseOnFrame(actor);
    }

    //대시. 달리는 동안 잔상을 남긴다
    if (actor.target) {
      if (actor.trail && dt > 0) {
        actor.ghostClock += dt;
        if (actor.ghostClock >= actor.trail.intervalSec) {
          actor.ghostClock = 0;
          actor.ghosts.unshift({ position: { ...actor.placement.position }, frameId: this.currentFrame(actor), age: 0 });
          actor.ghosts.length = Math.min(actor.ghosts.length, actor.trail.count);
        }
      }
      const here = actor.placement.position;
      const dx = actor.target.x - here.x;
      const dy = actor.target.y - here.y;
      const distance = Math.hypot(dx, dy);
      const step = actor.speed * dt;
      if (distance <= step || distance === 0) {
        actor.placement = { ...actor.placement, position: { ...actor.target } };
        actor.target = null;
      } else {
        actor.placement = {
          ...actor.placement,
          position: { x: here.x + (dx / distance) * step, y: here.y + (dy / distance) * step },
        };
      }
    }
    for (const ghost of actor.ghosts) ghost.age += dt;
    if (!actor.target && actor.trail) {
      const life = actor.trail.count * actor.trail.intervalSec;
      actor.ghosts = actor.ghosts.filter((g) => g.age < life);
    }

    for (const push of actor.pushes) push.t += dt;
    actor.pushes = actor.pushes.filter((p) => p.t < p.sec);
    actor.hurt = Math.max(0, actor.hurt - dt);

    //흰 칸은 빨간 칸을 뒤따라 줄어든다. 얼마나 깎였는지가 잠깐 보인다
    for (const kind of ['hp', 'mentality'] as const) {
      const bar = actor.bars[kind];
      const speed = dt / Math.max(0.05, bar.tweenSec);
      if (bar.lag > bar.shown) bar.lag = Math.max(bar.shown, bar.lag - speed);
      else bar.lag = bar.shown;
    }

    if (actor.coins) {
      actor.coins.t += dt;
      if (actor.coins.broken !== null) actor.coins.brokenT += dt;
    }
    if (actor.power) {
      actor.power.t += dt;
      if (actor.power.result) actor.power.resultT += dt;
    }
    if (actor.banner) {
      actor.banner.t += dt;
      if (actor.banner.t > actor.banner.sec + BANNER_FADE_SEC) actor.banner = null;
    }
  }

  private tickWorld(dt: number): void {
    for (const effect of this.effects) effect.elapsed += dt * 1000;
    //마지막 키프레임에도 그림이 남는다. 끝난 것은 반드시 지운다 (SPEC-002 §5.5)
    keep(this.effects, (e) => e.elapsed < totalMs(e.frames));
    for (const spark of this.sparks) spark.t += dt;
    keep(this.sparks, (s) => s.t < SPARK_SEC);
    for (const number of this.numbers) number.t += dt;
    keep(this.numbers, (n) => n.t < n.sec);
    for (const badge of this.badges) badge.elapsed += dt;
    keep(this.badges, (b) => b.elapsed < b.durationSec);
    for (const arrow of this.arrows) arrow.elapsed += dt;
    if (this.flash) {
      this.flash.t += dt;
      if (this.flash.t >= this.flash.sec) this.flash = null;
    }
  }

  //카메라는 목표를 부드럽게 따라간다. 값을 쓰는 곳은 여기 하나다
  private tickCamera(realSec: number, dt: number): void {
    const goal = this.subjects ? this.subjectFocus(this.subjects) : this.restFocus();
    const follow = 1 - Math.exp(-CAMERA_FOLLOW * dt);
    this.focus = { x: this.focus.x + (goal.x - this.focus.x) * follow, y: this.focus.y + (goal.y - this.focus.y) * follow };
    this.zoom += (this.zoomGoal - this.zoom) * follow;
    this.tilt += (this.tiltGoal - this.tilt) * follow;

    if (this.punch) {
      this.punch.t += realSec;
      if (this.punch.t >= this.punch.sec) this.punch = null;
    }

    if (this.shakeLeft > 0) {
      this.shakeLeft = Math.max(0, this.shakeLeft - realSec);
      const power = this.shakeStrength * SHAKE_PX * (this.shakeLeft / SHAKE_SEC);
      this.shake = { x: (Math.random() - 0.5) * power, y: (Math.random() - 0.5) * power };
    } else {
      this.shake = { x: 0, y: 0 };
      this.shakeStrength = 0;
    }
  }

  //카메라가 두 사람에게 붙어 있으면 나머지는 누른다. 누가 싸우는지 한눈에 읽히게 한다 (SPEC-005 §4.2)
  private presence(actor: Actor): number {
    if (!this.subjects || this.subjects.includes(actor.placement.combatantId)) return 1;
    //붙는 정도만큼 서서히 누른다
    const engaged = Math.max(0, Math.min(1, (this.zoom - 1) / Math.max(0.01, this.zoomGoal - 1)));
    return 1 - (1 - this.motion.othersAlpha) * engaged;
  }

  //여러 장짜리 동작의 한 장 길이. 첫 장은 예비 동작이라 길게, 나머지는 휘두름이라 짧게 끊는다
  private frameMs(actor: Actor, index: number): number {
    if (actor.frames.length < 2) return FRAME_MS;
    return index === 0 ? this.motion.windupMs : this.motion.snapMs;
  }

  //캐릭터 키. 에셋이 없으면 빌려 온 키를 쓴다
  private heightOf(actor: Actor): number {
    return this.catalogOf(actor)?.characterHeight ?? this.placeholderHeight;
  }

  //아무 교전도 없을 때 카메라가 보는 지점. 모두의 제자리 평균이다
  private restFocus(): Point {
    const all = [...this.actors.values()];
    if (all.length === 0) return { x: 0, y: 0 };
    return {
      x: all.reduce((acc, a) => acc + a.home.x, 0) / all.length,
      y: all.reduce((acc, a) => acc + a.home.y, 0) / all.length,
    };
  }

  //붙어 있는 두 사람의 중점. 달려가는 동안 계속 따라간다
  private subjectFocus(ids: readonly string[]): Point {
    const found = ids.map((id) => this.actors.get(id)).filter((a): a is Actor => !!a);
    if (found.length === 0) return this.restFocus();
    return {
      x: found.reduce((acc, a) => acc + a.placement.position.x, 0) / found.length,
      y: found.reduce((acc, a) => acc + a.placement.position.y, 0) / found.length,
    };
  }

  //이 캐릭터가 지금 실제로 서 있는 자리. 부유·반동·넉백이 여기서 더해진다
  private positionOf(actor: Actor, nowSec = performance.now() / 1000): Point {
    const base = actor.placement.position;
    let x = base.x;
    let y = base.y;
    if (actor.float && !actor.target) {
      y += Math.sin((nowSec / actor.float.periodSec) * Math.PI * 2) * actor.float.amplitude;
    }
    for (const push of actor.pushes) x += push.dx * pushShape(push);
    return { x, y };
  }

  //── 그리기 ──

  //투영에 넘기는 카메라. 줌·기울기·흔들림은 캔버스 변환 한 곳에서 건다
  private get view(): CameraState {
    return { focus: this.focus, zoom: 1, shake: { x: 0, y: 0 } };
  }

  //한 장면을 그린다
  draw(nowSec: number): void {
    const { width, height } = this.scene.viewport;
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0b0d';
    ctx.fillRect(0, 0, width, height);

    //카메라 변환은 여기 하나다. 배경과 캐릭터가 같이 당겨지고 같이 기운다
    const pivot = this.scene.pivot;
    const punch = this.punch ? this.punch.amount * Math.sin(Math.PI * (this.punch.t / this.punch.sec)) : 0;
    const zoom = this.zoom * (1 + punch);
    //기울여도 모서리가 비지 않을 만큼만 기운다
    const maxTilt = Math.max(0, ((zoom - 1) / (width / height)) * (180 / Math.PI));
    const tilt = Math.max(-maxTilt, Math.min(maxTilt, this.tilt));
    ctx.translate(pivot.x + this.shake.x, pivot.y + this.shake.y);
    ctx.rotate((tilt * Math.PI) / 180);
    ctx.scale(zoom, zoom);
    ctx.translate(-pivot.x, -pivot.y);

    this.drawMap('far');
    this.drawMap('mid');
    this.drawMap('ground');

    //뒤에 있는 캐릭터부터 그린다. 앞 사람이 뒤 사람을 가린다
    const ordered = [...this.actors.values()].sort((a, b) => this.positionOf(a, nowSec).y - this.positionOf(b, nowSec).y);
    for (const actor of ordered) {
      if (this.presence(actor) <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = this.presence(actor);
      if (this.stage.has(actor.placement.characterId)) {
        this.drawGhosts(actor);
        this.drawActor(actor, nowSec);
      } else {
        this.drawPlaceholder(actor, nowSec);
      }
      ctx.restore();
    }
    for (const effect of this.effects) this.drawEffect(effect);
    for (const spark of this.sparks) this.drawSpark(spark);

    this.drawMap('front');

    //정보 UI 는 원근을 타되 전경 위에 온다. 싸우는 둘 것이 맨 위에 오게 뒤에 그린다
    const byFocus = [...ordered].sort((a, b) => this.presence(a) - this.presence(b));
    for (const actor of byFocus) {
      if (this.presence(actor) <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = this.presence(actor) ** 2;
      this.drawBars(actor, nowSec);
      this.drawCoins(actor, nowSec);
      this.drawPower(actor, nowSec);
      this.drawBanner(actor, nowSec);
      ctx.restore();
    }
    for (const badge of this.badges) this.drawBadge(badge);
    for (const number of this.numbers) this.drawNumber(number);
    for (const arrow of this.arrows) this.drawArrow(arrow);
    ctx.restore();

    //여기부터는 화면 고정이다
    this.drawVignette();
    if (this.flash) {
      ctx.save();
      ctx.globalAlpha = this.flash.alpha * (1 - this.flash.t / this.flash.sec);
      ctx.fillStyle = '#fff4e6';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
    if (this.cutscene) this.drawCutscene(this.cutscene);
  }

  private drawMap(id: string): void {
    const layer = this.scene.map.layers.find((l) => l.id === id);
    if (!layer) return;
    const image = this.images.map(layer.file);
    if (!image) return;
    const rect = this.scene.layerRect(layer, this.view);
    this.ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  }

  //스프라이트 한 장을 접지점 기준으로 놓는다. 배율은 발에서 잰다 (SPEC-003 §6.5.2)
  private drawFrame(actor: Actor, frameId: string, position: Point, alpha: number, body = { breath: 1, hurt: 0 }): void {
    const catalog = this.catalogOf(actor);
    if (!catalog) return;
    const placement = { ...actor.placement, position };
    const foot = this.scene.project(position, this.view);
    const origin = this.scene.offsetFrom(foot, position, this.stage.frameOrigin(placement, frameId));
    const image = this.images.character(actor.placement.characterId, catalog.frame(frameId).file);
    if (!image) return;

    const canvas = catalog.manifest.canvas;
    const width = canvas.width * foot.scale;
    const height = canvas.height * foot.scale;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha *= alpha;
    //숨쉬기. 발을 축으로 세로만 살짝 늘었다 줄었다 한다
    if (body.breath !== 1) {
      ctx.translate(foot.x, foot.y);
      ctx.scale(1, body.breath);
      ctx.translate(-foot.x, -foot.y);
    }
    if (placement.facing === -1) {
      //좌우 반전. 비트맵만 뒤집고 놓이는 자리는 그대로다
      ctx.translate(origin.x + width, origin.y);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, width, height);
    } else {
      ctx.translate(origin.x, origin.y);
      ctx.drawImage(image, 0, 0, width, height);
    }
    //맞은 순간 몸이 번쩍인다. 같은 그림을 더하기로 한 번 더 얹는다 (필터 없는 브라우저도 된다)
    if (body.hurt > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= body.hurt;
      ctx.drawImage(image, 0, 0, width, height);
    }
    ctx.restore();
  }

  //지금 보일 장. 달리는 동안은 보는 쪽으로 가면 전진, 등 뒤로 가면 후퇴 장을 쓴다
  private currentFrame(actor: Actor): string | null {
    const catalog = this.catalogOf(actor);
    if (!catalog) return null;
    if (actor.target) {
      const toward = (actor.target.x - actor.placement.position.x) * actor.placement.facing;
      const moving = catalog.frameEndingWith(toward >= 0 ? 'advance' : 'retreat');
      if (moving) return moving.id;
    }
    return actor.frames[actor.frameIndex] ?? catalog.frameEndingWith('idle')?.id ?? null;
  }

  private drawActor(actor: Actor, nowSec: number): void {
    const frameId = this.currentFrame(actor);
    if (!frameId) return;
    //달리거나 휘두르는 중엔 숨쉬기를 멈춘다
    const still = !actor.target && actor.pushes.every((p) => p.kind !== 'lunge');
    const wave = Math.sin(((nowSec + actor.breathPhase * this.motion.breatheSec) / this.motion.breatheSec) * Math.PI * 2);
    const breath = still ? 1 + this.motion.breathe * wave : 1;
    const hurt = this.motion.hurtSec > 0 ? actor.hurt / this.motion.hurtSec : 0;
    this.drawFrame(actor, frameId, this.positionOf(actor, nowSec), 1, { breath, hurt });
  }

  //대시 잔상. 오래된 것일수록 옅다
  private drawGhosts(actor: Actor): void {
    if (!actor.trail || actor.ghosts.length === 0) return;
    const life = actor.trail.count * actor.trail.intervalSec;
    for (let i = actor.ghosts.length - 1; i >= 0; i -= 1) {
      const ghost = actor.ghosts[i];
      if (!ghost) continue;
      const frameId = ghost.frameId ?? this.currentFrame(actor);
      if (!frameId) continue;
      const alpha = actor.trail.alpha * (1 - ghost.age / life) * (1 - i / (actor.ghosts.length + 1));
      if (alpha > 0.01) this.drawFrame(actor, frameId, ghost.position, alpha);
    }
  }

  //에셋이 아직 없는 캐릭터. 남의 그림을 물리지 않고 자리만 표시한다 (SPEC-002 §10)
  private drawPlaceholder(actor: Actor, nowSec: number): void {
    const position = this.positionOf(actor, nowSec);
    const foot = this.scene.project(position, this.view);
    const width = 0.34 * this.placeholderHeight * foot.scale;
    const height = this.placeholderHeight * foot.scale;

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = actor.placement.facing === 1 ? '#6f8fbf' : '#bf6f6f';
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.strokeRect(foot.x - width / 2, foot.y - height, width, height);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(232,228,220,0.6)';
    ctx.font = `${Math.max(10, height * 0.07)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(actor.placement.characterId, foot.x, foot.y - height * 0.5);
    ctx.restore();
  }

  private drawEffect(effect: LiveEffect): void {
    const frame = frameAt(effect.frames, effect.elapsed);
    if (!frame) return;
    const image = this.images.character(effect.characterId, frame.file);
    if (!image) return;

    //따라가는 궤적은 휘두르는 사람의 지금 자리에서 다시 잰다
    const owner = effect.follow ? this.actors.get(effect.follow.combatantId) : undefined;
    const ground = owner ? this.positionOf(owner) : effect.groundRef;
    const at = owner && effect.follow ? { x: ground.x + effect.follow.rel.x, y: ground.y + effect.follow.rel.y } : effect.origin;
    //배율은 접지점에서 잰다. 캐릭터와 같은 배율이라야 크기가 안 어긋난다
    const foot = this.scene.project(ground, this.view);
    const origin = this.scene.offsetFrom(foot, ground, at);
    const width = effect.size.width * foot.scale;
    const height = effect.size.height * foot.scale;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = effect.blend as GlobalCompositeOperation;
    if (effect.flipped) {
      ctx.translate(origin.x + width, origin.y);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, width, height);
    } else {
      ctx.drawImage(image, origin.x, origin.y, width, height);
    }
    ctx.restore();
  }

  //합이 맞부딪히는 접점의 불꽃. 그림 없이 선과 고리로 그린다
  private drawSpark(spark: LiveSpark): void {
    const k = spark.t / SPARK_SEC;
    const foot = this.scene.project(spark.groundRef, this.view);
    const at = this.scene.offsetFrom(foot, spark.groundRef, spark.contact);
    const radius = spark.size * foot.scale * (0.35 + 0.85 * easeOutCubic(k));
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 - k;
    //번쩍이는 중심
    const glow = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
    glow.addColorStop(0, spark.tie ? 'rgba(230,230,230,0.95)' : 'rgba(255,240,200,0.95)');
    glow.addColorStop(0.35, spark.tie ? 'rgba(160,160,160,0.5)' : 'rgba(255,150,60,0.55)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.fill();
    //튀는 줄기. 각도는 접점 좌표로 정해서 같은 합은 같은 모양이 나온다
    ctx.strokeStyle = spark.tie ? '#dcdcdc' : '#ffd08a';
    ctx.lineWidth = Math.max(1.5, radius * 0.06);
    const rays = 10;
    for (let i = 0; i < rays; i += 1) {
      const angle = (i / rays) * Math.PI * 2 + (spark.contact.x % 7) * 0.3;
      const inner = radius * 0.3;
      const outer = radius * (1.1 + 0.5 * ((i * 37) % 5) / 5);
      ctx.beginPath();
      ctx.moveTo(at.x + Math.cos(angle) * inner, at.y + Math.sin(angle) * inner);
      ctx.lineTo(at.x + Math.cos(angle) * outer, at.y + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.restore();
  }

  //주인의 접지점 배율로 머리 위 좌표를 화면에 옮긴다. 제자리 기준 좌표를 지금 자리로 옮겨 붙인다
  private overHead(actor: Actor, point: Point, nowSec: number, fromHome: boolean): { at: Point; scale: number } {
    const position = this.positionOf(actor, nowSec);
    const foot = this.scene.project(position, this.view);
    const base = fromHome ? actor.home : actor.placement.position;
    const moved = { x: point.x - base.x + position.x, y: point.y - base.y + position.y };
    return { at: this.scene.offsetFrom(foot, position, moved), scale: foot.scale };
  }

  private drawBars(actor: Actor, nowSec: number): void {
    const ctx = this.ctx;
    for (const kind of ['hp', 'mentality'] as const) {
      const box = actor.barBox[kind];
      if (!box) continue;
      const { at, scale } = this.overHead(actor, { x: actor.home.x + box.rel.x, y: actor.home.y + box.rel.y }, nowSec, true);
      const width = box.width * scale;
      const height = Math.max(2, box.height * scale);
      const bar = actor.bars[kind];

      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(at.x - 1, at.y - 1, width + 2, height + 2);
      //깎인 만큼 흰 칸이 잠깐 남는다
      ctx.fillStyle = 'rgba(245,235,220,0.85)';
      ctx.fillRect(at.x, at.y, width * bar.lag, height);
      ctx.fillStyle = kind === 'hp' ? '#c8373a' : '#3f82c8';
      ctx.fillRect(at.x, at.y, width * bar.shown, height);
      ctx.restore();
    }
  }

  //머리 위 코인 한 줄. 하나씩 차례로 뒤집혀 앞면(금)·뒷면(검정)을 보인다
  private drawCoins(actor: Actor, nowSec: number): void {
    const coins = actor.coins;
    if (!coins) return;
    const { at, scale } = this.overHead(actor, coins.at, nowSec, false);
    const size = coins.size * scale;
    const gap = size * 0.28;
    const total = coins.rolls.length * size + (coins.rolls.length - 1) * gap;
    const ctx = this.ctx;

    coins.rolls.forEach((heads, i) => {
      const x = at.x - total / 2 + size / 2 + i * (size + gap);
      const start = i * COIN_STAGGER_SEC;
      const k = Math.max(0, Math.min(1, (coins.t - start) / COIN_FLIP_SEC));
      //뒤집는 동안은 세로로 납작해졌다가 결과 면으로 펴진다
      const squash = k < 1 ? Math.abs(Math.cos(k * Math.PI * 2)) : 1;
      const lift = k < 1 ? Math.sin(k * Math.PI) * size * 0.9 : 0;
      const shown = k < 0.5 ? null : heads;

      //깨진 코인은 쪼개지며 떨어진다
      let alpha = 1;
      let drop = 0;
      if (coins.broken !== null && i >= coins.broken) {
        const b = Math.min(1, coins.brokenT / 0.35);
        alpha = 1 - b;
        drop = b * size * 0.8;
      }
      if (alpha <= 0) return;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, at.y - lift + drop);
      ctx.scale(1, Math.max(0.08, squash));
      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = shown === null ? '#8a7b5a' : shown ? '#e3b447' : '#2b2622';
      ctx.fill();
      ctx.lineWidth = Math.max(1, size * 0.1);
      ctx.strokeStyle = shown === false ? '#6b5f55' : '#fff0c4';
      ctx.stroke();
      if (coins.broken !== null && i >= coins.broken) {
        //금 간 선
        ctx.strokeStyle = '#1a1512';
        ctx.lineWidth = Math.max(1, size * 0.08);
        ctx.beginPath();
        ctx.moveTo(-size * 0.3, -size * 0.35);
        ctx.lineTo(size * 0.05, 0);
        ctx.lineTo(-size * 0.1, size * 0.35);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  //위력 숫자. 떠오를 때 튀어나오고, 결과가 나면 이긴 쪽은 커지고 진 쪽은 흔들리며 꺼진다
  private drawPower(actor: Actor, nowSec: number): void {
    const power = actor.power;
    if (!power) return;
    const { at, scale } = this.overHead(actor, power.at, nowSec, false);
    const pop = power.t < POP_SEC ? 1 + 0.5 * (1 - power.t / POP_SEC) : 1;
    let size = power.size * scale * pop;
    let alpha = Math.min(1, power.t / 0.06);
    let x = at.x;
    let y = at.y;
    let fill = '#f4ecdf';
    if (power.result === 'win') {
      size *= 1 + 0.25 * Math.min(1, power.resultT / 0.1);
      fill = '#ffd34d';
    } else if (power.result === 'lose') {
      const k = Math.min(1, power.resultT / 0.3);
      alpha *= 1 - 0.7 * k;
      x += Math.sin(power.resultT * 90) * size * 0.06 * (1 - k);
      y += k * size * 0.3;
      fill = '#9aa3ad';
    } else if (power.result === 'tie') {
      fill = '#cfcfcf';
    }
    this.drawOutlinedText(String(power.value), x, y, size, fill, alpha, '#140f0c');
  }

  //스킬 이름 띠. 상대 쪽에서 미끄러져 들어와 잠깐 머문다
  private drawBanner(actor: Actor, nowSec: number): void {
    const banner = actor.banner;
    if (!banner) return;
    const { at, scale } = this.overHead(actor, banner.at, nowSec, true);
    const size = Math.max(11, banner.size * scale);
    const enter = Math.min(1, banner.t / 0.12);
    const leave = banner.t > banner.sec ? 1 - (banner.t - banner.sec) / BANNER_FADE_SEC : 1;
    const alpha = Math.max(0, Math.min(enter, leave));
    if (alpha <= 0) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    const textWidth = ctx.measureText(banner.text).width;
    const padX = size * 0.7;
    const w = textWidth + padX * 2;
    const h = size * 1.5;
    //띠는 등 뒤로 뻗는다. 뒤쪽에서 미끄러져 들어온다
    const slide = -(1 - easeOutCubic(enter)) * size * 2 * banner.facing;
    const left = at.x + slide - (banner.facing === 1 ? w : 0);
    const top = at.y - h / 2;
    const skew = h * 0.35;

    ctx.globalAlpha = alpha;
    //비스듬한 띠
    ctx.beginPath();
    ctx.moveTo(left + skew, top);
    ctx.lineTo(left + w + skew, top);
    ctx.lineTo(left + w - skew, top + h);
    ctx.lineTo(left - skew, top + h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(16,12,11,0.88)';
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.strokeStyle = '#9b2a26';
    ctx.stroke();
    //앞머리 붉은 표식
    ctx.fillStyle = '#b8322c';
    ctx.fillRect(left - skew * 0.4, top, size * 0.22, h);
    ctx.fillStyle = '#efe6d8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(banner.text, left + padX, top + h / 2);
    ctx.restore();
  }

  private drawBadge(badge: LiveBadge): void {
    const owner = this.actors.get(badge.combatantId);
    if (!owner) return;
    const t = Math.min(1, badge.elapsed / badge.durationSec);
    const here = { x: badge.from.x + (badge.to.x - badge.from.x) * t, y: badge.from.y + (badge.to.y - badge.from.y) * t };
    const { at, scale } = this.overHead(owner, here, performance.now() / 1000, true);
    const label = badge.text ?? (badge.result === 'win' ? '합 승리' : '합 패배');
    this.drawOutlinedText(label, at.x, at.y, Math.max(12, this.placeholderHeight * 0.1 * scale), BADGE_COLOR[badge.result], 1 - t, '#000');
  }

  //피해 숫자. 튀어나오며 떠오르다 사라진다. 큰 한 방은 크고 붉다
  private drawNumber(number: LiveNumber): void {
    const owner = this.actors.get(number.owner);
    if (!owner) return;
    const k = number.t / number.sec;
    const here = {
      x: number.from.x + (number.to.x - number.from.x) * easeOutCubic(k),
      y: number.from.y + (number.to.y - number.from.y) * easeOutCubic(k),
    };
    const { at, scale } = this.overHead(owner, here, performance.now() / 1000, false);
    const pop = number.t < POP_SEC ? 1 + 0.8 * (1 - number.t / POP_SEC) : 1;
    const alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    this.drawOutlinedText(
      String(number.damage),
      at.x,
      at.y,
      Math.max(14, number.size * scale * pop),
      number.heavy ? '#ff4b3a' : '#f5ede0',
      alpha,
      number.heavy ? '#fff2e0' : '#1a0f0c',
    );
  }

  private drawOutlinedText(text: string, x: number, y: number, size: number, fill: string, alpha: number, stroke: string): void {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.16);
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private drawArrow(arrow: LiveArrow): void {
    const shown = Math.max(2, Math.ceil((arrow.elapsed / arrow.drawSec) * arrow.curve.length));
    const points = arrow.curve.slice(0, Math.min(shown, arrow.curve.length));
    if (points.length < 2) return;

    //곡선은 두 사람 사이를 지난다. 배율은 두 접지점 사이를 따라가며 잰다
    const source = this.actors.get(arrow.sourceId);
    const target = this.actors.get(arrow.targetId);
    if (!source || !target) return;
    const from = source.home;
    const to = target.home;
    const along = (t: number, point: Point): Point => {
      const ground = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      return this.scene.offsetFrom(this.scene.project(ground, this.view), ground, point);
    };

    const ctx = this.ctx;
    const head = along(0, arrow.curve[0] as Point);
    const tail = along(1, arrow.curve[arrow.curve.length - 1] as Point);
    const gradient = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
    gradient.addColorStop(0, arrow.colorStart);
    gradient.addColorStop(1, arrow.colorEnd);

    ctx.save();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((point, i) => {
      const spot = along(i / (arrow.curve.length - 1), point);
      if (i === 0) ctx.moveTo(spot.x, spot.y);
      else ctx.lineTo(spot.x, spot.y);
    });
    ctx.stroke();
    if (shown >= arrow.curve.length) {
      ctx.beginPath();
      arrow.head.forEach((point, i) => {
        const spot = along(1, point);
        if (i === 0) ctx.moveTo(spot.x, spot.y);
        else ctx.lineTo(spot.x, spot.y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  //화면 가장자리를 어둡게 눌러 시선을 가운데로 모은다
  private drawVignette(): void {
    const { width, height } = this.scene.viewport;
    const ctx = this.ctx;
    const gradient = ctx.createRadialGradient(width / 2, height * 0.55, height * 0.35, width / 2, height * 0.55, width * 0.72);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  //컷신은 화면을 덮는다. 13레이어를 z 순서대로 피벗에서 돌려 놓는다
  private drawCutscene(cutscene: LiveCutscene): void {
    const { width, height } = this.scene.viewport;
    const ctx = this.ctx;
    const t = cutscene.elapsed / cutscene.durationSec;
    //들어오고 나갈 때만 어둡게. 가운데는 꽉 찬다
    const fade = Math.min(1, Math.min(t, 1 - t) * 6);

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    const catalog = this.stage.has(cutscene.characterId) ? this.stage.catalogFor(cutscene.characterId) : null;
    const size = catalog?.manifest.cutscene?.size ?? { width, height };
    //천천히 다가간다
    const scale = Math.min(width / size.width, height / size.height) * (1 + 0.05 * t);
    const offsetX = (width - size.width * scale) / 2;
    const offsetY = (height - size.height * scale) / 2;

    for (const layer of cutscene.layers) {
      const image = this.images.character(cutscene.characterId, layer.file);
      if (!image) continue;
      ctx.save();
      ctx.translate(offsetX + layer.pivot.x * scale, offsetY + layer.pivot.y * scale);
      ctx.rotate((layer.rotationDeg * Math.PI) / 180);
      ctx.drawImage(
        image,
        layer.offset.x * scale,
        layer.offset.y * scale,
        (image as HTMLImageElement).naturalWidth * scale * layer.scale,
        (image as HTMLImageElement).naturalHeight * scale * layer.scale,
      );
      ctx.restore();
    }
    ctx.restore();
  }

  private catalogOf(actor: Actor): SpriteCatalog | null {
    const characterId = actor.placement.characterId;
    return this.stage.has(characterId) ? this.stage.catalogFor(characterId) : null;
  }
}

//조건에 맞는 것만 남긴다. 제자리에서 줄인다
function keep<T>(list: T[], alive: (item: T) => boolean): void {
  let n = 0;
  for (const item of list) if (alive(item)) list[n++] = item;
  list.length = n;
}

function easeOutCubic(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return 1 - (1 - k) ** 3;
}

//밀림이 지금 몇 할 나가 있는지. dx 에 곱한다
function pushShape(push: Push): number {
  //반동·넉백은 순간 튕겨 나갔다가 부드럽게 제자리로 돌아온다
  if (push.kind === 'recoil') return 1 - easeOutCubic(push.t / push.sec);
  //내딛기. 예비 동작 동안 조금 당겼다가, 휘두를 때 확 나가고, 천천히 돌아온다
  if (push.t < push.windupSec) return -0.2 * easeOutCubic(push.t / push.windupSec);
  const k = (push.t - push.windupSec) / Math.max(0.01, push.sec - push.windupSec);
  if (k < 0.25) return -0.2 + 1.2 * easeOutCubic(k / 0.25);
  return 1 - easeOutCubic((k - 0.25) / 0.75);
}

//이름으로 0~1 사이 값을 만든다. 같은 사람은 늘 같은 값이다
function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 997;
  return h / 997;
}

function totalMs(frames: readonly { ms: number }[]): number {
  return frames.reduce((acc, f) => acc + f.ms, 0);
}

//경과 시간에 해당하는 키프레임
function frameAt(frames: readonly { file: string; ms: number }[], elapsed: number): { file: string } | null {
  let left = elapsed;
  for (const frame of frames) {
    if (left < frame.ms) return frame;
    left -= frame.ms;
  }
  return null;
}
