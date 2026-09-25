//명령을 받아 실제로 그린다 (SPEC-003 §1 의 마지막 층 · SPEC-005 전투 연출)
//
//여기가 DOM·canvas 를 쓰는 유일한 곳이다. 도메인·어댑터는 그림을 모른다.
//어댑터가 순서를 정하고 여기가 시간을 가진다 — 컷신은 타임라인 장벽으로 다룬다 (SPEC-003 §5.3).
//히트스톱·슬로모도 여기 시계에만 걸린다. 도메인 결과에는 아무 영향이 없다 (SPEC-005 §5)

import type { CameraCommand } from '../camera/director.js';
import { CutsceneDirector, type CutscenePose, type LayerTransform } from '../render/cutscene.js';
import { MeshCutscene } from '../render/cutscene-mesh.js';
import type { Point, SpriteCatalog } from '../render/manifest.js';
import type { RenderCommand } from '../render/presenter.js';
import type { Stage, StagePlacement } from '../render/stage.js';
import type { UiCommand } from '../ui/director.js';
import type { CutsceneFxData, EffectFxData, MotionData } from '../ui/data.js';
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
  //지난 tick 에 보이던 장. 바뀌는 순간을 잡는다
  shown: string | null;
  //장 겹치기. 앞 장을 잠깐 옅게 남긴다 (SPEC-005 §2.3)
  blend: { frameId: string; t: number } | null;
  //자세 튕김이 시작된 뒤 지난 시간(초). null 이면 튕기지 않는다
  pop: number | null;
  //휘두르는 동안 남기는 지난 장
  strikeGhosts: { position: Point; frameId: string; age: number }[];
  //휘두르는 한 방이 진행 중인지. 한 방 명령에서 켜지고 다른 자세 명령에서 꺼진다
  striking: boolean;
  //밀려나고 따라 들어가는 이동. 튕겨 돌아오지 않고 그 자리에 머문다 (SPEC-005 §2.3.3)
  slides: { dx: number; sec: number; t: number }[];
  //대시가 끝난 뒤 밀려나거나 따라 들어간 누적 거리. 월드에 박히는 표시를 이만큼 옮긴다
  drift: number;
  //보이는 정도. 교전에 안 낀 사람은 othersAlpha 쪽으로 othersFadeSec 동안 옮겨 간다
  presence: number;
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
  //흐린 더하기 겹을 한 번 더 얹을지 (SPEC-002 §6-7)
  glow: boolean;
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
  //흔들 수 있으면 매 장면 자세를 새로 계산한다. 없으면 받은 레이어를 그대로 그린다
  director: CutsceneDirector | null;
  //메시 방식이면 이쪽이다 (SPEC-002 §7.1). 눈·입을 덮은 텍스처를 한 장 들고 매 장면 다시 칠한다
  mesh: { rig: MeshCutscene; texture: HTMLCanvasElement } | null;
  layers: LayerTransform[];
  elapsed: number;
  durationSec: number;
}

//렌더러 안쪽의 그리기 상수. 연출 수치(ui-data.json)가 아니라 그리는 방식에 딸린 값이다
const FRAME_MS = 130;
//궁극기의 ready·cardAdded·used 단계를 알아볼 시간
const PHASE_SEC = 0.25;
const SHAKE_SEC = 0.25;
const SHAKE_PX = 16;
//카메라가 목표를 따라가는 빠르기. 클수록 빨리 붙는다
const CAMERA_FOLLOW = 7;
const COIN_FLIP_SEC = 0.2;
const COIN_STAGGER_SEC = 0.045;
const POP_SEC = 0.12;
const SPARK_SEC = 0.32;
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
  //달려가는 중이라 도착을 기다리는 이펙트 (SPEC-002 §5.4.2)
  private arrivals: Extract<RenderCommand, { type: 'spawnEffect' }>[] = [];
  //잔상·번쩍임 실루엣을 만드는 작업 캔버스. 하나를 돌려 쓴다
  private readonly scratch = document.createElement('canvas');
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
  //휘두르는 장이 바뀔 때의 작은 순간 확대. 카메라 감독 명령이 아니라 렌더러 안에서 건다
  private kick: { amount: number; sec: number; t: number } | null = null;
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
    //궁극기 컷인 수치 (ui-data.json cutscene)
    private readonly cut: CutsceneFxData,
    //이펙트 재생 수치 (ui-data.json effects)
    private readonly fx: EffectFxData,
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
    this.arrivals = [];
    this.subjects = null;
    this.zoom = this.zoomGoal = 1;
    this.tilt = this.tiltGoal = 0;
    this.punch = null;
    this.kick = null;
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
        shown: null,
        blend: null,
        pop: null,
        strikeGhosts: [],
        striking: false,
        slides: [],
        drift: 0,
        presence: 1,
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
    if (this.cutscene || this.queue.length > 0 || this.gate > 0 || this.freeze > 0 || this.arrivals.length > 0) return false;
    for (const actor of this.actors.values()) {
      if (actor.target || actor.slides.length > 0) return false;
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
        actor.striking = command.wait === true;
        //바로 뒤에 붙은 궤적·움찔은 지금 당겨서 그 장을 기다리게 한다. 다 돈 뒤에 꺼내면 이미 지나간 장이다
        for (;;) {
          const next = this.queue[0];
          if (next?.type === 'spawnEffect' && next.frameId) {
            this.queue.shift();
            this.pendingOnFrame.push({ combatantId: next.sourceId, frameId: next.frameId, command: next });
          } else if (next?.type === 'flinch') {
            this.queue.shift();
            this.pendingOnFrame.push({ combatantId: next.sourceId, frameId: next.frameId, command: next });
          } else break;
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

      case 'flinch':
        this.pendingOnFrame.push({ combatantId: command.sourceId, frameId: command.frameId, command });
        {
          const source = this.actors.get(command.sourceId);
          if (source) this.releaseOnFrame(source);
        }
        return 0;

      case 'spawnEffect': {
        //도착하면 낼 이펙트. 뒤따라 오는 대시 명령이 먼저 걸리게 이번 장면 끝에 판단한다
        if (command.onArrive) {
          this.arrivals.push(command);
          return 0;
        }
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
        if (command.phase !== 'cutscene') return PHASE_SEC;
        const characterId = this.actors.get(command.combatantId)?.placement.characterId ?? '';
        const manifest = this.stage.has(characterId) ? this.stage.catalogFor(characterId).manifest : null;
        const data = manifest?.cutscene ?? null;
        const meshData = manifest?.meshCutscene ?? null;
        //레이어도 메시도 없으면 컷신 없이 넘어간다
        if (!command.layers && !meshData) return PHASE_SEC;
        this.cutscene = {
          characterId,
          director: data ? new CutsceneDirector(data) : null,
          mesh: meshData ? { rig: new MeshCutscene(meshData), texture: this.meshTexture(meshData.size) } : null,
          layers: command.layers ?? [],
          elapsed: 0,
          durationSec: this.cut.sec,
        };
        return this.cut.sec;
      }

      case 'placeholder':
        return 0;

      case 'dashTo': {
        const actor = this.actors.get(command.combatantId);
        if (!actor) return 0;
        actor.target = { ...command.position };
        actor.speed = command.speed;
        actor.float = null;
        actor.slides = [];
        actor.drift = 0;
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
        actor.slides = [];
        actor.drift = 0;
        actor.striking = false;
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
        //이긴 쪽(교착이면 공격자)의 합 불꽃 그림이 있으면 그걸, 없으면 도형 불꽃을 그린다 (SPEC-002 §5.4.2)
        const owner = (command.winnerId ? this.actors.get(command.winnerId) : undefined) ?? involved[0];
        const drawn = owner ? this.spawnClashEffects(owner, command.contact, groundY) : false;
        if (!drawn) {
          this.sparks.push({
            contact: { ...command.contact },
            groundRef: { x: command.contact.x, y: groundY },
            size: command.sparkSize,
            t: 0,
            tie: command.winnerId === null,
          });
        }
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

      case 'damageNumber': {
        //UI 감독은 밀려난 거리를 모른다. 지금 밀려나 있는 만큼 옮겨 띄운다
        const drift = this.actors.get(command.combatantId)?.drift ?? 0;
        this.numbers.push({
          owner: command.combatantId,
          damage: command.damage,
          from: { x: command.from.x + drift, y: command.from.y },
          to: { x: command.to.x + drift, y: command.to.y },
          size: command.size,
          sec: command.sec,
          heavy: command.heavy,
          t: 0,
        });
        return 0;
      }

      case 'hitStop':
        this.freeze = Math.max(this.freeze, command.sec);
        return command.sec;

      case 'knockback': {
        const actor = this.actors.get(command.combatantId);
        if (actor) {
          //밀린 자리에 머문다. 튕겨 돌아오면 공격자와 얼굴을 맞댄다 (SPEC-005 §2.3.3)
          actor.slides.push({ dx: command.dx, sec: command.sec, t: 0 });
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

  //멈춰 선 사람의 도착 이펙트를 지금 선 자리에 낸다
  private releaseArrivals(): void {
    if (this.arrivals.length === 0) return;
    const rest: typeof this.arrivals = [];
    for (const command of this.arrivals) {
      const actor = this.actors.get(command.sourceId);
      if (actor?.target) rest.push(command);
      else this.spawn(command);
    }
    this.arrivals = rest;
  }

  //지금 떠 있는 장에 묶여 있던 이펙트를 터뜨린다
  private releaseOnFrame(actor: Actor): void {
    const current = actor.frames[actor.frameIndex];
    if (!current) return;
    const rest: typeof this.pendingOnFrame = [];
    for (const waiting of this.pendingOnFrame) {
      if (waiting.combatantId === actor.placement.combatantId && waiting.frameId === current) {
        if (waiting.command.type === 'flinch') this.flinch(waiting.command);
        else this.spawn(waiting.command as Extract<RenderCommand, { type: 'spawnEffect' }>);
        continue;
      }
      rest.push(waiting);
    }
    this.pendingOnFrame = rest;
  }

  //마지막이 아닌 휘두름에 맞은 쪽. 번쩍이고 한 발 밀리고 잠깐 맞는 자세를 보였다 돌아온다 (SPEC-005 §2.3.2)
  private flinch(command: Extract<RenderCommand, { type: 'flinch' }>): void {
    const target = this.actors.get(command.combatantId);
    const source = this.actors.get(command.sourceId);
    if (!target || !source) return;
    target.hurt = this.motion.hurtSec;
    const away = target.placement.position.x >= source.placement.position.x ? 1 : -1;
    target.slides.push({ dx: away * this.motion.follow * this.heightOf(target), sec: this.motion.popMs / 1000 + 0.1, t: 0 });
    const hit = this.catalogOf(target)?.frameEndingWith('hit')?.id;
    const back = this.currentFrame(target);
    if (hit && back && !target.striking) {
      target.frames = [hit, back];
      target.frameIndex = 0;
      target.elapsed = 0;
    }
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
      //날끝 궤적만 휘두르는 사람을 따라간다. 분출·연기·불티·섬광은 터진 자리에 남는다 (SPEC-002 §6-8)
      follow:
        command.frameId && anchor === 'bladeTip'
          ? { combatantId: owner.placement.combatantId, rel: { x: placement.origin.x - owner.home.x, y: placement.origin.y - owner.home.y } }
          : null,
      groundRef: here,
      size: { ...placement.size },
      flipped: placement.flipped,
      blend: placement.blend,
      frames: this.stretch(placement.frames),
      elapsed: 0,
      glow: catalog?.bindings.glow.includes(placement.effectId) ?? false,
    });
  }

  //짧은 이펙트는 장마다 같은 비율로 늘린다. 발생·최대·소멸 비율은 그대로다 (SPEC-002 §6-6)
  private stretch(frames: readonly { file: string; ms: number }[]): { file: string; ms: number }[] {
    const total = totalMs(frames);
    const k = total > 0 && total < this.fx.minMs ? this.fx.minMs / total : 1;
    return frames.map((f) => ({ file: f.file, ms: f.ms * k }));
  }

  //합 접점에 이긴 쪽의 합 불꽃 그림을 띄운다. 좌표는 UI 감독이 준 지금 접점이라 옮기지 않는다
  private spawnClashEffects(owner: Actor, contact: Point, groundY: number): boolean {
    const catalog = this.catalogOf(owner);
    const frameId = this.currentFrame(owner);
    if (!catalog || !frameId || catalog.bindings.clash.length === 0) return false;
    for (const effectId of catalog.bindings.clash) {
      const placement = this.stage.placeEffect(
        effectId,
        { source: owner.placement, sourceFrameId: frameId },
        { flipped: owner.placement.facing === -1, at: contact },
      );
      this.effects.push({
        characterId: owner.placement.characterId,
        origin: { ...placement.origin },
        follow: null,
        groundRef: { x: contact.x, y: groundY },
        size: { ...placement.size },
        flipped: placement.flipped,
        blend: placement.blend,
        frames: this.stretch(placement.frames),
        elapsed: 0,
        glow: catalog.bindings.glow.includes(effectId),
      });
    }
    return true;
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
      if (this.cutscene.elapsed >= this.cutscene.durationSec) {
        this.cutscene = null;
        //컷인이 빠지는 순간 전투 화면이 번쩍이며 돌아온다
        this.flash = { alpha: this.cut.flashAlpha, sec: this.cut.outSec, t: 0 };
      }
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

    for (const actor of this.actors.values()) {
      this.tickActor(actor, dt);
      this.tickPresence(actor, realSec);
    }
    this.keepApart(dt);
    this.releaseArrivals();
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
    //밀려나고 따라 들어간 만큼 서 있는 자리 자체를 옮긴다
    for (const slide of actor.slides) {
      const before = easeOutCubic(slide.t / slide.sec);
      slide.t = Math.min(slide.sec, slide.t + dt);
      const step = slide.dx * (easeOutCubic(slide.t / slide.sec) - before);
      actor.placement = { ...actor.placement, position: { x: actor.placement.position.x + step, y: actor.placement.position.y } };
      actor.drift += step;
    }
    actor.slides = actor.slides.filter((s) => s.t < s.sec);
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
    this.tickPose(actor, dt);
  }

  //장이 바뀌는 순간을 잡아 끊김을 가린다 (SPEC-005 §2.3)
  private tickPose(actor: Actor, dt: number): void {
    if (actor.blend) {
      actor.blend.t += dt * 1000;
      if (actor.blend.t >= this.motion.blendMs) actor.blend = null;
    }
    if (actor.pop !== null) {
      actor.pop += dt;
      if (actor.pop * 1000 >= this.motion.popMs) actor.pop = null;
    }
    const ghostLife = (this.motion.blendMs * 3) / 1000;
    for (const ghost of actor.strikeGhosts) ghost.age += dt;
    actor.strikeGhosts = actor.strikeGhosts.filter((g) => g.age < ghostLife);

    const now = this.currentFrame(actor);
    const before = actor.shown;
    actor.shown = now;
    if (!before || !now || before === now) return;

    //앞 장을 잠깐 남긴다. 대기·준비 같은 작은 전환에만 쓴다.
    //휘두르는 한 방과 맞는 순간은 자세가 크게 바뀌어 두 몸으로 보였다 (SPEC-005 §2.3.5)
    const calm = !this.striking(actor) && actor.hurt <= 0 && !isSkillFrame(before) && !isSkillFrame(now);
    actor.blend = calm ? { frameId: before, t: 0 } : null;
    if (!this.striking(actor)) return;
    //휘두르는 장이면 한 발 따라 들어간다. 맞는 쪽도 같은 만큼 밀리므로 간격이 유지된다 (SPEC-005 §2.3.3)
    if (this.swingHoldOf(actor, now) > 0) {
      actor.slides.push({ dx: actor.placement.facing * this.motion.follow * this.heightOf(actor), sec: this.motion.popMs / 1000 + 0.1, t: 0 });
    }
    //휘두르는 중이면 튕기고, 지난 장을 잔상으로 남기고, 카메라를 살짝 찬다
    actor.pop = 0;
    actor.strikeGhosts.unshift({ position: this.positionOf(actor), frameId: before, age: 0 });
    actor.strikeGhosts.length = Math.min(actor.strikeGhosts.length, this.motion.strikeGhosts);
    if (this.subjects?.includes(actor.placement.combatantId)) {
      this.kick = { amount: this.motion.poseKick, sec: this.motion.popMs / 1000, t: 0 };
    }
  }

  //교전 중인 둘의 몸이 겹치지 않게 벌린다. 휘두르는 쪽이 있으면 맞는 쪽이 밀린다 (SPEC-005 §2.3.4)
  //발 간격만 지키면 찌르기·쓸기 장에서 몸이 상대 안으로 들어갔다
  private keepApart(dt: number): void {
    if (!this.subjects || this.subjects.length !== 2 || dt <= 0) return;
    const a = this.actors.get(this.subjects[0] ?? '');
    const b = this.actors.get(this.subjects[1] ?? '');
    if (!a || !b || a.target || b.target) return;
    //a 가 보는 쪽에 b 가 있어야 한다. 서로 마주 보지 않으면 재지 않는다
    const toward = a.placement.facing;
    if (b.placement.facing === toward) return;
    const ax = this.bodyX(a);
    const bx = this.bodyX(b);
    if (ax === null || bx === null) return;
    const need = this.motion.bodyGap * Math.max(this.heightOf(a), this.heightOf(b));
    const gap = (bx - ax) * toward;
    if (gap >= need) return;
    //한 번에 튀지 않게 bodyGapSec 에 걸쳐 벌린다
    const k = this.motion.bodyGapSec > 0 ? 1 - Math.exp((-3 * dt) / this.motion.bodyGapSec) : 1;
    const step = (need - gap) * k;
    const aShare = b.striking && !a.striking ? 1 : a.striking && !b.striking ? 0 : 0.5;
    this.shove(a, -toward * step * aShare);
    this.shove(b, toward * step * (1 - aShare));
  }

  //지금 장의 몸 중심 x. 머리 중심을 몸통 기준으로 쓴다
  private bodyX(actor: Actor): number | null {
    const frameId = this.currentFrame(actor);
    if (!frameId || !this.catalogOf(actor)) return null;
    const placement = { ...actor.placement, position: this.positionOf(actor) };
    return this.stage.framePoint(placement, frameId, 'headCenter').x;
  }

  //밀려난 자리에 머물게 옮긴다. 피해 숫자도 같이 따라간다 (SPEC-005 §2.3.3)
  private shove(actor: Actor, dx: number): void {
    if (dx === 0) return;
    const at = actor.placement.position;
    actor.placement = { ...actor.placement, position: { x: at.x + dx, y: at.y } };
    actor.drift += dx;
  }

  //휘두르는 한 방이 진행 중인지
  private striking(actor: Actor): boolean {
    return actor.striking;
  }

  //이 장이 휘두르는 장이면 버틸 시간(ms), 아니면 0. 붙은 이펙트가 다 사라질 때까지 버틴다 (SPEC-005 §2.3.2)
  private swingHoldOf(actor: Actor, frameId: string): number {
    const catalog = this.catalogOf(actor);
    if (!catalog) return 0;
    const effectIds = catalog.effectsOnFrame(frameId);
    if (effectIds.length === 0) return 0;
    //늘려 트는 길이 기준이다. 원래 길이로 재면 이펙트 도중에 다음 장이 나간다
    const longest = Math.max(...effectIds.map((id) => totalMs(this.stretch(catalog.effect(id).frames))));
    return Math.max(this.motion.swingHoldMs, longest);
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
    if (this.kick) {
      this.kick.t += dt;
      if (this.kick.t >= this.kick.sec) this.kick = null;
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
    return actor.presence;
  }

  //숨김 정도를 목표 쪽으로 옮긴다. 줌 진행률에 묶으면 당기는 내내 반투명한 사람이 겹쳐 보였다 (SPEC-005 §4.2)
  private tickPresence(actor: Actor, realSec: number): void {
    const hidden = this.subjects !== null && !this.subjects.includes(actor.placement.combatantId);
    const goal = hidden ? this.motion.othersAlpha : 1;
    const step = this.motion.othersFadeSec > 0 ? realSec / this.motion.othersFadeSec : 1;
    actor.presence = actor.presence < goal ? Math.min(goal, actor.presence + step) : Math.max(goal, actor.presence - step);
  }


  //여러 장짜리 동작의 한 장 길이. 첫 장은 준비라 버티고, 휘두르는 장은 이펙트가 끝날 때까지 버티고,
  //나머지 중간 장은 짧게 넘긴다 (SPEC-005 §2.3.2)
  private frameMs(actor: Actor, index: number): number {
    if (actor.frames.length < 2) return FRAME_MS;
    if (index === 0) return this.motion.windupMs;
    const frameId = actor.frames[index];
    const hold = frameId ? this.swingHoldOf(actor, frameId) : 0;
    return hold > 0 ? hold : this.motion.snapMs;
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
    const kick = this.kick ? this.kick.amount * (1 - easeOutCubic(this.kick.t / this.kick.sec)) : 0;
    const zoom = this.zoom * (1 + punch + kick);
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
  private drawFrame(
    actor: Actor,
    frameId: string,
    position: Point,
    alpha: number,
    body: { breath: number; hurt: number; pop?: number; tint?: string } = { breath: 1, hurt: 0 },
  ): void {
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
    //숨쉬기는 세로만, 자세 튕김은 가로세로 같이. 둘 다 발을 축으로 한다
    const pop = body.pop ?? 1;
    if (body.breath !== 1 || pop !== 1) {
      ctx.translate(foot.x, foot.y);
      ctx.scale(pop, body.breath * pop);
      ctx.translate(-foot.x, -foot.y);
    }
    if (placement.facing === -1) {
      //좌우 반전. 비트맵만 뒤집고 놓이는 자리는 그대로다
      ctx.translate(origin.x + width, origin.y);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(origin.x, origin.y);
    }
    //잔상은 한 색으로 채운 실루엣이다. 원색이면 캐릭터가 둘로 보였다 (SPEC-005 §2.3.5)
    if (body.tint) {
      this.drawTinted(image, width, height, body.tint);
      ctx.restore();
      return;
    }
    ctx.drawImage(image, 0, 0, width, height);
    //맞은 순간 몸이 번쩍인다. 그림 모양대로 색만 덮는다. 더하기로 겹치면 흰 옷이 통째로 날아갔다
    if (body.hurt > 0 && this.motion.hurtAlpha > 0) {
      ctx.globalAlpha *= body.hurt * body.hurt * this.motion.hurtAlpha;
      this.drawTinted(image, width, height, this.motion.hurtColor);
    }
    ctx.restore();
  }

  //그림의 불투명한 곳만 한 색으로 채워 지금 변환 위에 그린다. 작업 캔버스는 하나를 돌려 쓴다
  private drawTinted(image: CanvasImageSource, width: number, height: number, color: string): void {
    const w = Math.max(1, Math.ceil(width));
    const h = Math.max(1, Math.ceil(height));
    const scratch = this.scratch;
    if (scratch.width < w) scratch.width = w;
    if (scratch.height < h) scratch.height = h;
    const g = scratch.getContext('2d');
    if (!g) return;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    g.drawImage(image, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(scratch, 0, 0, w, h, 0, 0, width, height);
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
    const still = !actor.target && !actor.striking;
    const wave = Math.sin(((nowSec + actor.breathPhase * this.motion.breatheSec) / this.motion.breatheSec) * Math.PI * 2);
    const breath = still ? 1 + this.motion.breathe * wave : 1;
    const hurt = this.motion.hurtSec > 0 ? actor.hurt / this.motion.hurtSec : 0;
    const position = this.positionOf(actor, nowSec);
    //휘두름 잔상. 오래된 것일수록 옅다
    const ghostLife = (this.motion.blendMs * 3) / 1000;
    for (let i = actor.strikeGhosts.length - 1; i >= 0; i -= 1) {
      const ghost = actor.strikeGhosts[i];
      if (!ghost) continue;
      const fade = this.motion.strikeGhostAlpha * (1 - ghost.age / ghostLife) * (1 - i / (actor.strikeGhosts.length + 1));
      if (fade > 0.01) this.drawFrame(actor, ghost.frameId, ghost.position, fade, { breath: 1, hurt: 0, tint: this.motion.ghostColor });
    }
    //앞 장을 아래에 옅게 깔고 새 장을 위에 그린다. 새 장이 못 덮은 곳만 번져 보인다
    if (actor.blend) {
      const fade = 0.8 * (1 - actor.blend.t / this.motion.blendMs);
      if (fade > 0.01) this.drawFrame(actor, actor.blend.frameId, position, fade, { breath, hurt: 0 });
    }
    const pop = actor.pop === null ? 1 : 1 + this.motion.popScale * (1 - easeOutCubic((actor.pop * 1000) / this.motion.popMs));
    this.drawFrame(actor, frameId, position, 1, { breath, hurt, pop });
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
      if (alpha > 0.01) this.drawFrame(actor, frameId, ghost.position, alpha, { breath: 1, hurt: 0, tint: this.motion.ghostColor });
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

  //이펙트 한 개. 키프레임 사이를 겹쳐 넘기고 마지막 장은 사라지며 끝난다 (SPEC-005 §2.3)
  private drawEffect(effect: LiveEffect): void {
    const step = keyframeAt(effect.frames, effect.elapsed);
    if (!step) return;
    const fadeMs = this.motion.effectFadeMs;
    const next = effect.frames[step.index + 1];
    //다음 장이 있으면 끝 무렵에 다음 장을 위에 겹친다. 키프레임이 짧으니 장 길이의 반을 넘기지 않는다
    const overlapMs = next ? Math.min(fadeMs, step.frame.ms * 0.5) : 0;
    const incoming = next && step.left < overlapMs ? 1 - step.left / overlapMs : 0;
    //마지막 장은 끝나기 전 fadeMs 동안 옅어진다. 끝나면 지운다
    const outgoing = next ? 1 : Math.min(1, step.left / Math.max(1, Math.min(fadeMs, step.frame.ms)));
    this.drawEffectImage(effect, step.frame.file, outgoing);
    if (next && incoming > 0) this.drawEffectImage(effect, next.file, incoming);
  }

  private drawEffectImage(effect: LiveEffect, file: string, alpha: number): void {
    if (alpha <= 0.01) return;
    const image = this.images.character(effect.characterId, file);
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
    ctx.globalAlpha *= alpha;
    ctx.globalCompositeOperation = effect.blend as GlobalCompositeOperation;
    if (effect.flipped) {
      ctx.translate(origin.x + width, origin.y);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(origin.x, origin.y);
    }
    ctx.drawImage(image, 0, 0, width, height);
    //발광 겹. 원본은 일반 합성 그대로 두고 흐린 복사본을 더하기로 한 번 더 얹는다 (SPEC-002 §6-7)
    if (effect.glow && this.fx.glowAlpha > 0 && 'filter' in ctx) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= this.fx.glowAlpha;
      ctx.filter = `blur(${Math.max(1, Math.max(width, height) * this.fx.glowBlur)}px)`;
      ctx.drawImage(image, 0, 0, width, height);
      ctx.filter = 'none';
    }
    ctx.restore();
  }

  //합이 맞부딪히는 접점의 불꽃. 그림 없이 쐐기 파편과 고리로 그린다.
  //이펙트 팩 톤(흰 심지·붉은 테·검붉은 파편)에 맞춘다. 노란 별빛은 배경 톤에서 튀었다
  private drawSpark(spark: LiveSpark): void {
    const k = spark.t / SPARK_SEC;
    const foot = this.scene.project(spark.groundRef, this.view);
    const at = this.scene.offsetFrom(foot, spark.groundRef, spark.contact);
    const size = spark.size * foot.scale;
    const radius = size * (0.35 + 0.85 * easeOutCubic(k));
    const fade = 1 - k;
    const hot = spark.tie ? '235,235,235' : '255,244,236';
    const rim = spark.tie ? '150,150,150' : '226,36,44';
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    //번쩍이는 심지. 처음 몇 장만 크게 터지고 빨리 줄어든다
    const core = size * (0.55 - 0.35 * k);
    const glow = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, core * 1.8);
    glow.addColorStop(0, `rgba(${hot},${0.95 * fade})`);
    glow.addColorStop(0.3, `rgba(${rim},${0.6 * fade})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(at.x, at.y, core * 1.8, 0, Math.PI * 2);
    ctx.fill();

    //퍼지는 충격 고리. 원근 바닥 위라 납작하게 눕힌다
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(${rim},${0.8 * fade})`;
    ctx.lineWidth = Math.max(1, size * 0.04 * fade);
    ctx.beginPath();
    ctx.ellipse(at.x, at.y, radius * 1.25, radius * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    //튀는 쐐기 파편. 가운데가 굵고 끝이 뾰족하다. 각도는 접점 좌표로 정해서 같은 합은 같은 모양이 나온다
    const shards = 9;
    for (let i = 0; i < shards; i += 1) {
      const angle = (i / shards) * Math.PI * 2 + (spark.contact.x % 7) * 0.3;
      const reach = radius * (0.9 + 0.7 * (((i * 37) % 5) / 5));
      const inner = radius * 0.25 + reach * 0.35 * k;
      const width = size * 0.06 * (1 - 0.5 * k);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const mid = (inner + reach) / 2;
      ctx.fillStyle = i % 3 === 0 ? `rgba(${hot},${fade})` : `rgba(${rim},${fade})`;
      ctx.beginPath();
      ctx.moveTo(at.x + cos * inner, at.y + sin * inner);
      ctx.lineTo(at.x + cos * mid - sin * width, at.y + sin * mid + cos * width);
      ctx.lineTo(at.x + cos * reach, at.y + sin * reach);
      ctx.lineTo(at.x + cos * mid + sin * width, at.y + sin * mid - cos * width);
      ctx.closePath();
      ctx.fill();
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
  //궁극기 컷인. 기운 띠가 밀려 들어오고 그 안에서 캐릭터가 숨쉰다 (SPEC-005 §2.4)
  private drawCutscene(cutscene: LiveCutscene): void {
    const { width, height } = this.scene.viewport;
    const cut = this.cut;
    const ctx = this.ctx;
    const t = cutscene.elapsed;
    const progress = t / cutscene.durationSec;
    //들어옴·나감 진행도. 0 이면 화면 밖, 1 이면 제자리
    const enter = easeOutCubic(t / cut.inSec);
    const leave = easeOutCubic((cutscene.durationSec - t) / cut.outSec);
    const shown = Math.min(enter, leave);

    ctx.save();
    //뒤 전투 화면을 누른다. 까맣게 지우지 않는다
    ctx.globalAlpha = cut.dim * shown;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;

    //띠. 들어올 땐 오른쪽에서, 나갈 땐 왼쪽으로 빠진다
    const bandHeight = height * cut.bandHeight;
    const skew = Math.tan((cut.bandSkewDeg * Math.PI) / 180) * width;
    const slide = (1 - enter) * width - (1 - leave) * width;
    const top = (height - bandHeight) / 2;
    const band = new Path2D();
    band.moveTo(slide - skew, top + skew * 0.5);
    band.lineTo(slide + width + skew, top - skew * 0.5);
    band.lineTo(slide + width + skew, top + bandHeight - skew * 0.5);
    band.lineTo(slide - skew, top + bandHeight + skew * 0.5);
    band.closePath();

    const fill = ctx.createLinearGradient(0, top, 0, top + bandHeight);
    fill.addColorStop(0, '#2a1d17');
    fill.addColorStop(0.5, '#15100d');
    fill.addColorStop(1, '#2a1d17');
    ctx.fillStyle = fill;
    ctx.fill(band);

    ctx.save();
    ctx.clip(band);
    this.drawSpeedLines(t, top, bandHeight, slide);
    this.drawCutsceneLayers(cutscene, progress, enter, top, bandHeight);
    ctx.restore();

    //띠 가장자리의 불씨 선
    ctx.strokeStyle = 'rgba(214,92,40,0.85)';
    ctx.lineWidth = Math.max(2, height * 0.004);
    ctx.beginPath();
    ctx.moveTo(slide - skew, top + skew * 0.5);
    ctx.lineTo(slide + width + skew, top - skew * 0.5);
    ctx.moveTo(slide + width + skew, top + bandHeight - skew * 0.5);
    ctx.lineTo(slide - skew, top + bandHeight + skew * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  //띠 안을 가로지르는 속도선. 같은 시각이면 같은 모양이 나오게 번호로 자리를 정한다
  private drawSpeedLines(t: number, top: number, bandHeight: number, slide: number): void {
    const { width, height } = this.scene.viewport;
    const ctx = this.ctx;
    const lines = 26;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < lines; i += 1) {
      const lane = ((i * 37) % lines) / lines;
      const speed = 1.4 + ((i * 13) % 7) * 0.25;
      const length = width * (0.12 + ((i * 29) % 5) * 0.04);
      const x = width - (((t * speed * width + i * 211) % (width + length)) as number) + slide;
      const y = top + lane * bandHeight;
      ctx.strokeStyle = `rgba(232,200,170,${0.05 + ((i * 7) % 5) * 0.025})`;
      ctx.lineWidth = Math.max(1, height * (0.0015 + ((i * 3) % 4) * 0.0008));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + length, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  //컷신 레이어. 흔들림 한도 안에서 레이어마다 어긋나게 흔들고, 정해진 구간에 눈·입을 바꾼다
  private drawCutsceneLayers(cutscene: LiveCutscene, progress: number, enter: number, top: number, bandHeight: number): void {
    const { width } = this.scene.viewport;
    const cut = this.cut;
    const ctx = this.ctx;
    if (cutscene.mesh) {
      this.drawMeshCutscene(cutscene, cutscene.mesh, progress, enter, top, bandHeight);
      return;
    }
    const catalog = this.stage.has(cutscene.characterId) ? this.stage.catalogFor(cutscene.characterId) : null;
    const size = catalog?.manifest.cutscene?.size ?? { width, height: bandHeight };

    const layers = cutscene.director ? cutscene.director.layers(this.cutscenePose(cutscene.director, cutscene.elapsed, progress)) : cutscene.layers;
    //띠를 꽉 채우고 천천히 다가간다. 옆에서 미끄러져 들어온다
    const scale = Math.max(width / size.width, bandHeight / size.height) * (1 + cut.pushZoom * progress);
    const offsetX = (width - size.width * scale) / 2 + (1 - enter) * cut.slideFrom * width;
    //위를 맞춘다. 가운데로 맞추면 후드가 띠 밖으로 잘린다. 넘치는 건 다리 쪽이다
    const offsetY = top;

    for (const layer of layers) {
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
  }

  //메시 컷신 텍스처로 쓸 빈 캔버스
  private meshTexture(size: { width: number; height: number }): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    return canvas;
  }

  //메시 컷신. 전경에 눈·입 조각을 덮은 텍스처를 격자 삼각형으로 휘어 붙인다 (SPEC-002 §7.1)
  private drawMeshCutscene(
    cutscene: LiveCutscene,
    mesh: { rig: MeshCutscene; texture: HTMLCanvasElement },
    progress: number,
    enter: number,
    top: number,
    bandHeight: number,
  ): void {
    const { width } = this.scene.viewport;
    const cut = this.cut;
    const data = mesh.rig.data;
    const image = (file: string) => this.images.character(cutscene.characterId, file);
    const foreground = image(data.foreground);
    if (!foreground) return;

    //텍스처: 전경 위에 눈 감은 조각·입 다문 조각을 덮는다. 범고래 원화는 입이 열려 있다
    const within = ([from, to]: [number, number]): boolean => progress >= from && progress <= to;
    const tex = mesh.texture.getContext('2d');
    if (!tex) return;
    tex.clearRect(0, 0, data.size.width, data.size.height);
    tex.drawImage(foreground, 0, 0, data.size.width, data.size.height);
    this.patch(tex, image(data.eye.file), data.eye.patch, within(cut.blinkAt) ? 1 : 0, data.size);
    this.patch(tex, image(data.mouth.file), data.mouth.patch, within(cut.mouthAt) ? 0 : 1, data.size);

    const ctx = this.ctx;
    const scale = Math.max(width / data.size.width, bandHeight / data.size.height) * (1 + cut.pushZoom * progress);
    const offsetX = (width - data.size.width * scale) / 2 + (1 - enter) * cut.slideFrom * width;
    ctx.save();
    ctx.translate(offsetX, top);
    ctx.scale(scale, scale);
    const phase = (cutscene.elapsed / cut.swaySec) * Math.PI * 2;

    //배경은 몸보다 덜 흔들린다
    const background = image(data.background);
    if (background) {
      const shift = Math.sin(phase) * 4;
      ctx.drawImage(background, -16 + shift, -10, data.size.width + 32, data.size.height + 20);
    }

    //가장자리가 비지 않게 가운데를 축으로 살짝 키운다
    ctx.translate(data.size.width / 2, data.size.height / 2);
    ctx.scale(data.zoom, data.zoom);
    ctx.translate(-data.size.width / 2, -data.size.height / 2);
    for (const tri of mesh.rig.triangles(phase)) this.drawTriangle(mesh.texture, tri.source, tri.target);
    ctx.restore();
  }

  //다각형 모양으로 잘라 조각을 덮는다. 조각 원화는 컷신 캔버스와 같은 크기로 그린다
  private patch(
    tex: CanvasRenderingContext2D,
    source: CanvasImageSource | null,
    polygon: readonly Point[],
    alpha: number,
    size: { width: number; height: number },
  ): void {
    if (!source || alpha <= 0 || polygon.length < 3) return;
    tex.save();
    tex.beginPath();
    polygon.forEach((p, i) => (i === 0 ? tex.moveTo(p.x, p.y) : tex.lineTo(p.x, p.y)));
    tex.closePath();
    tex.clip();
    tex.globalAlpha = alpha;
    tex.drawImage(source, 0, 0, size.width, size.height);
    tex.restore();
  }

  //원래 삼각형을 휜 삼각형으로 옮겨 그린다. 이웃 칸과 틈이 안 보이게 2.5px 넓혀 자른다
  private drawTriangle(texture: CanvasImageSource, source: readonly Point[], target: readonly Point[]): void {
    const [a, b, c] = source as [Point, Point, Point];
    const [d, e, f] = target as [Point, Point, Point];
    const det = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (det === 0) return;
    const A = ((e.x - d.x) * (c.y - a.y) - (f.x - d.x) * (b.y - a.y)) / det;
    const C = ((f.x - d.x) * (b.x - a.x) - (e.x - d.x) * (c.x - a.x)) / det;
    const B = ((e.y - d.y) * (c.y - a.y) - (f.y - d.y) * (b.y - a.y)) / det;
    const D = ((f.y - d.y) * (b.x - a.x) - (e.y - d.y) * (c.x - a.x)) / det;
    const E = d.x - A * a.x - C * a.y;
    const F = d.y - B * a.x - D * a.y;
    const cx = (d.x + e.x + f.x) / 3;
    const cy = (d.y + e.y + f.y) / 3;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    target.forEach((q, i) => {
      const vx = q.x - cx;
      const vy = q.y - cy;
      const l = Math.hypot(vx, vy) || 1;
      const x = q.x + (vx / l) * 2.5;
      const y = q.y + (vy / l) * 2.5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.clip();
    ctx.transform(A, B, C, D, E, F);
    ctx.drawImage(texture, 0, 0);
    ctx.restore();
  }

  //지금 시각의 컷신 자세. 회전은 한도(motionDeg)까지만, 눈·입은 파츠 이름으로 고른다
  private cutscenePose(director: CutsceneDirector, sec: number, progress: number): CutscenePose {
    const rotations: Record<string, number> = {};
    for (const layer of director.cutscene.layers) {
      if (layer.motionDeg === 0) continue;
      const phase = phaseOf(layer.id) * Math.PI * 2;
      rotations[layer.id] = layer.motionDeg * Math.sin((sec / this.cut.swaySec) * Math.PI * 2 + phase);
    }
    const within = ([from, to]: [number, number]): boolean => progress >= from && progress <= to;
    const face: Record<string, 'open' | 'closed'> = {};
    for (const group of director.faceGroups) {
      if (group.includes('eye')) face[group] = within(this.cut.blinkAt) ? 'closed' : 'open';
      if (group.includes('mouth')) face[group] = within(this.cut.mouthAt) ? 'open' : 'closed';
    }
    return { rotations, face };
  }

  private catalogOf(actor: Actor): SpriteCatalog | null {
    const characterId = actor.placement.characterId;
    return this.stage.has(characterId) ? this.stage.catalogFor(characterId) : null;
  }
}

//조건에 맞는 것만 남긴다. 제자리에서 줄인다
//전용기 장인지. 장 이름의 skillN 표기로 가린다 (SpriteCatalog.frameSequence 와 같은 규칙)
function isSkillFrame(frameId: string): boolean {
  return /skill\d/.test(frameId);
}

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

//경과 시간에 해당하는 키프레임과 그 장의 남은 시간
function keyframeAt(
  frames: readonly { file: string; ms: number }[],
  elapsed: number,
): { frame: { file: string; ms: number }; index: number; left: number } | null {
  let left = elapsed;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (!frame) continue;
    if (left < frame.ms) return { frame, index, left: frame.ms - left };
    left -= frame.ms;
  }
  return null;
}

