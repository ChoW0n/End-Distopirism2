//명령을 받아 실제로 그린다 (SPEC-003 §1 의 마지막 층)
//
//여기가 DOM·canvas 를 쓰는 유일한 곳이다. 도메인·어댑터는 그림을 모른다.
//어댑터가 순서를 정하고 여기가 시간을 가진다 — 컷신은 타임라인 장벽으로 다룬다 (SPEC-003 §5.3)

import type { CameraCommand } from '../camera/director.js';
import type { LayerTransform } from '../render/cutscene.js';
import type { SpriteCatalog } from '../render/manifest.js';
import type { RenderCommand } from '../render/presenter.js';
import type { Stage, StagePlacement } from '../render/stage.js';
import type { UiCommand } from '../ui/director.js';
import { Scene, type CameraState } from './scene.js';

//렌더러가 그림을 찾는 통로. 어느 파일이 어느 비트맵인지는 밖에서 정한다
export interface ImageSource {
  //캐릭터 스프라이트 (assets/<캐릭터>/<파일>)
  character(characterId: string, file: string): CanvasImageSource | null;
  //배경 (assets/map/<파일>)
  map(file: string): CanvasImageSource | null;
}

//무대에 선 캐릭터 하나의 현재 모습
interface Actor {
  placement: StagePlacement;
  //지금 재생 중인 프레임 순서와 남은 시간
  frames: string[];
  frameIndex: number;
  elapsed: number;
  //대시 목적지. null 이면 제자리다
  target: { x: number; y: number } | null;
  home: { x: number; y: number };
  speed: number;
  //부유 동작. 기준 높이를 따로 들어서 누적 대입을 막는다 (SPEC-004 §5.3)
  float: { base: { x: number; y: number }; amplitude: number; periodSec: number } | null;
  bars: { hp: number; mentality: number };
  barBox: Record<'hp' | 'mentality', { origin: { x: number; y: number }; width: number; height: number } | null>;
}

//재생 중인 이펙트 하나. 마지막 키프레임에도 그림이 남으므로 끝나면 반드시 지운다
interface LiveEffect {
  characterId: string;
  effectId: string;
  origin: { x: number; y: number };
  //배율을 재는 기준점. 낸 사람의 접지점이다.
  //앵커(날끝·명중점)로 재면 높이 있는 점일수록 지평선에 붙어 이펙트가 쪼그라든다
  groundRef: { x: number; y: number };
  size: { width: number; height: number };
  flipped: boolean;
  blend: string;
  frames: { file: string; ms: number }[];
  elapsed: number;
}

//떠오르는 합 배지
interface LiveBadge {
  //배율을 재는 주인. 바·캐릭터와 같은 배율을 써야 크기가 안 어긋난다
  combatantId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  durationSec: number;
  elapsed: number;
  result: 'win' | 'lose' | 'deadlock';
  text: string | null;
}

//그려지는 중인 타겟 화살표
interface LiveArrow {
  sourceId: string;
  targetId: string;
  curve: { x: number; y: number }[];
  head: { x: number; y: number }[];
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

const FRAME_MS = 130;
//idle·hit 처럼 한 장짜리 상태를 붙들어 두는 시간
const HOLD_SEC = 0.18;
//궁극기의 ready·cardAdded·used 단계를 알아볼 시간
const PHASE_SEC = 0.25;
const CUTSCENE_SEC = 1.6;
const SHAKE_SEC = 0.25;
const BADGE_COLOR: Record<LiveBadge['result'], string> = {
  win: '#ffd94a',
  lose: '#8fb7ff',
  deadlock: '#c9c9c9',
};

export class CanvasRenderer {
  private readonly actors = new Map<string, Actor>();
  private readonly effects: LiveEffect[] = [];
  private readonly badges: LiveBadge[] = [];
  private arrows: LiveArrow[] = [];
  private cutscene: LiveCutscene | null = null;

  //아직 실행하지 않은 명령. 어댑터가 순서를 정하고 여기가 시간을 나눠 준다
  private queue: (RenderCommand | UiCommand)[] = [];
  //이 시간이 지나야 다음 명령을 꺼낸다. 한꺼번에 적용하면 공격 프레임이
  //바로 뒤 idle 에 덮여서 아무것도 안 움직이는 것처럼 보인다
  private gate = 0;

  private camera: CameraState = { focus: { x: 0, y: 0 }, zoom: 1, shake: { x: 0, y: 0 } };
  private shakeLeft = 0;
  private shakeStrength = 0;
  //프레임에 묶인 이펙트. 그 프레임이 실제로 재생될 때 터뜨린다
  private pendingOnFrame: { combatantId: string; frameId: string; command: RenderCommand }[] = [];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly scene: Scene,
    private readonly stage: Stage,
    private readonly images: ImageSource,
    //에셋 없는 캐릭터를 얼마만 하게 그릴지. 에셋 있는 캐릭터의 키를 쓴다
    private readonly placeholderHeight: number,
  ) {}

  //무대에 캐릭터를 세운다. 전투가 새로 시작될 때 부른다
  reset(placements: readonly StagePlacement[]): void {
    this.actors.clear();
    this.effects.length = 0;
    this.badges.length = 0;
    this.arrows = [];
    this.cutscene = null;
    this.queue = [];
    this.gate = 0;
    this.pendingOnFrame = [];
    this.camera = { focus: this.restFocus(placements), zoom: 1, shake: { x: 0, y: 0 } };

    for (const placement of placements) {
      const home = { ...placement.position };
      this.actors.set(placement.combatantId, {
        placement,
        frames: [],
        frameIndex: 0,
        elapsed: 0,
        target: null,
        home,
        speed: 0,
        float: null,
        bars: { hp: 1, mentality: 1 },
        barBox: { hp: null, mentality: null },
      });
    }
  }

  //아무 교전도 없을 때 카메라가 보는 지점. 모두의 접지점 평균이다
  private restFocus(placements: readonly StagePlacement[]): { x: number; y: number } {
    if (placements.length === 0) return { x: 0, y: 0 };
    const sum = placements.reduce(
      (acc, p) => ({ x: acc.x + p.position.x, y: acc.y + p.position.y }),
      { x: 0, y: 0 },
    );
    return { x: sum.x / placements.length, y: sum.y / placements.length };
  }

  //어댑터가 낸 명령을 받아 대기열에 넣는다. 실행은 tick 이 시간을 보며 한다
  push(commands: readonly (RenderCommand | UiCommand)[]): void {
    this.queue.push(...commands);
  }

  //대기열도 비었고 아무도 움직이지 않는 상태. 다음 턴을 열어도 되는지 판단하는 데 쓴다
  get idle(): boolean {
    if (this.cutscene || this.queue.length > 0 || this.gate > 0) return false;
    for (const actor of this.actors.values()) {
      if (actor.target) return false;
    }
    return this.effects.length === 0;
  }

  //카메라 명령은 따로 받는다. 상태를 들고 있는 건 CameraDirector 고 여기는 그림만 맞춘다
  pushCamera(commands: readonly CameraCommand[]): void {
    for (const command of commands) {
      if (command.type === 'shake') {
        this.shakeLeft = SHAKE_SEC;
        this.shakeStrength = command.intensity;
        continue;
      }
      if (command.type === 'idle') {
        this.camera.zoom = 1;
        this.camera.focus = this.restFocus([...this.actors.values()].map((a) => a.placement));
        continue;
      }
      const subjects = command.subjectIds.map((id) => this.actors.get(id)).filter((a): a is Actor => !!a);
      if (subjects.length === 0) continue;
      this.camera.zoom = command.zoom;
      this.camera.focus = {
        x: subjects.reduce((acc, a) => acc + this.positionOf(a).x, 0) / subjects.length,
        y: subjects.reduce((acc, a) => acc + this.positionOf(a).y, 0) / subjects.length,
      };
    }
  }

  //명령 하나를 실행하고, 다음 명령까지 기다릴 시간을 초로 돌려준다
  private apply(command: RenderCommand | UiCommand): number {
    switch (command.type) {
      case 'playFrames': {
        const actor = this.actors.get(command.combatantId);
        if (!actor) return 0;
        actor.frames = [...command.frameIds];
        actor.frameIndex = 0;
        actor.elapsed = 0;
        //전용기처럼 여러 장이면 다 돌 때까지 기다린다. idle·hit 한 장은 짧게만 붙든다
        return command.frameIds.length > 1 ? (command.frameIds.length * FRAME_MS) / 1000 : HOLD_SEC;
      }

      case 'spawnEffect': {
        //프레임에 묶인 것은 그 장이 실제로 재생될 때 터진다
        if (command.frameId) {
          this.pendingOnFrame.push({ combatantId: command.sourceId, frameId: command.frameId, command });
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

      case 'dashTo': {
        const actor = this.actors.get(command.combatantId);
        if (!actor) return 0;
        actor.target = { ...command.position };
        actor.speed = command.speed;
        actor.float = null;
        //도착할 때까지 기다린다. 달려가는 중에 다음 교전이 시작되면 안 된다
        return this.travelSec(actor);
      }

      case 'dashBack': {
        const actor = this.actors.get(command.combatantId);
        if (!actor) return 0;
        actor.target = { ...actor.home };
        return this.travelSec(actor);
      }

      case 'float': {
        const actor = this.actors.get(command.combatantId);
        if (!actor) return 0;
        actor.float = { base: { ...command.base }, amplitude: command.amplitude, periodSec: command.periodSec };
        return 0;
      }

      case 'bar': {
        const actor = this.actors.get(command.combatantId);
        if (!actor) return 0;
        actor.bars[command.kind] = command.ratio;
        actor.barBox[command.kind] = {
          origin: { ...command.origin },
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

      default:
        return 0;
    }
  }

  //목적지까지 걸리는 시간
  private travelSec(actor: Actor): number {
    if (!actor.target || actor.speed <= 0) return 0;
    const here = actor.placement.position;
    return Math.hypot(actor.target.x - here.x, actor.target.y - here.y) / actor.speed;
  }

  //지금 재생 중인 장에 묶여 있던 이펙트를 터뜨린다
  private releaseOnFrame(combatantId: string, frameId: string): void {
    const rest: typeof this.pendingOnFrame = [];
    for (const waiting of this.pendingOnFrame) {
      if (waiting.combatantId === combatantId && waiting.frameId === frameId) {
        this.apply({ ...waiting.command, frameId: null } as RenderCommand);
        continue;
      }
      rest.push(waiting);
    }
    this.pendingOnFrame = rest;
  }

  private spawn(command: Extract<RenderCommand, { type: 'spawnEffect' }>): void {
    const actor = this.actors.get(command.sourceId);
    if (!actor) return;
    const placement = command.placement;
    this.effects.push({
      characterId: actor.placement.characterId,
      effectId: placement.effectId,
      origin: { ...placement.origin },
      groundRef: { ...actor.placement.position },
      size: { ...placement.size },
      flipped: placement.flipped,
      blend: placement.blend,
      frames: placement.frames.map((f) => ({ ...f })),
      elapsed: 0,
    });
  }

  //시간을 흘린다. 여기서만 상태가 움직인다
  tick(deltaSec: number): void {
    if (this.cutscene) {
      this.cutscene.elapsed += deltaSec;
      if (this.cutscene.elapsed >= this.cutscene.durationSec) this.cutscene = null;
    }

    //시간이 되면 다음 명령을 꺼낸다. 컷신이 도는 동안에는 한 개도 안 꺼낸다
    this.gate = Math.max(0, this.gate - deltaSec);
    while (!this.cutscene && this.gate <= 0 && this.queue.length > 0) {
      const command = this.queue.shift();
      if (!command) break;
      this.gate += this.apply(command);
    }

    for (const actor of this.actors.values()) {
      if (actor.frames.length > 0) {
        const before = actor.frameIndex;
        actor.elapsed += deltaSec * 1000;
        while (actor.elapsed >= FRAME_MS && actor.frameIndex < actor.frames.length - 1) {
          actor.elapsed -= FRAME_MS;
          actor.frameIndex += 1;
        }
        //장이 바뀌었거나 막 시작했으면 그 장에 묶인 이펙트를 푼다
        const current = actor.frames[actor.frameIndex];
        if (current && (actor.frameIndex !== before || actor.elapsed === deltaSec * 1000)) {
          this.releaseOnFrame(actor.placement.combatantId, current);
        }
      }
      this.moveActor(actor, deltaSec);
    }

    for (const effect of this.effects) effect.elapsed += deltaSec * 1000;
    //마지막 키프레임에도 그림이 남는다. 끝난 것은 반드시 지운다 (SPEC-002 §5.5)
    let alive = 0;
    for (const effect of this.effects) {
      if (effect.elapsed < totalMs(effect.frames)) this.effects[alive++] = effect;
    }
    this.effects.length = alive;

    for (const badge of this.badges) badge.elapsed += deltaSec;
    let liveBadges = 0;
    for (const badge of this.badges) {
      if (badge.elapsed < badge.durationSec) this.badges[liveBadges++] = badge;
    }
    this.badges.length = liveBadges;

    for (const arrow of this.arrows) arrow.elapsed += deltaSec;

    if (this.shakeLeft > 0) {
      this.shakeLeft = Math.max(0, this.shakeLeft - deltaSec);
      const power = this.shakeStrength * 14 * (this.shakeLeft / SHAKE_SEC);
      this.camera.shake = { x: (Math.random() - 0.5) * power, y: (Math.random() - 0.5) * power };
    } else {
      this.camera.shake = { x: 0, y: 0 };
    }
  }

  //대시 이동과 부유 동작. 부유는 기준 높이에 사인을 더한다. 절대 누적하지 않는다
  private moveActor(actor: Actor, deltaSec: number): void {
    const target = actor.target;
    if (!target) return;

    const here = actor.placement.position;
    const dx = target.x - here.x;
    const dy = target.y - here.y;
    const distance = Math.hypot(dx, dy);
    const step = actor.speed * deltaSec;

    if (distance <= step || distance === 0) {
      actor.placement = { ...actor.placement, position: { ...target } };
      actor.target = null;
      return;
    }
    actor.placement = {
      ...actor.placement,
      position: { x: here.x + (dx / distance) * step, y: here.y + (dy / distance) * step },
    };
  }

  //이 캐릭터가 지금 실제로 서 있는 자리. 부유 동작이 여기서 더해진다
  private positionOf(actor: Actor, nowSec = performance.now() / 1000): { x: number; y: number } {
    const base = actor.placement.position;
    if (!actor.float || actor.target) return { ...base };
    const wave = Math.sin((nowSec / actor.float.periodSec) * Math.PI * 2) * actor.float.amplitude;
    return { x: base.x, y: base.y + wave };
  }

  //한 장면을 그린다
  draw(nowSec: number): void {
    const { width, height } = this.scene.viewport;
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0b0b0d';
    ctx.fillRect(0, 0, width, height);

    this.drawMap('far');
    this.drawMap('mid');
    this.drawMap('ground');

    //뒤에 있는 캐릭터부터 그린다. 앞 사람이 뒤 사람을 가린다
    const ordered = [...this.actors.values()].sort(
      (a, b) => this.positionOf(a, nowSec).y - this.positionOf(b, nowSec).y,
    );
    for (const actor of ordered) {
      if (this.stage.has(actor.placement.characterId)) this.drawActor(actor, nowSec);
      else this.drawPlaceholder(actor, nowSec);
    }
    for (const effect of this.effects) this.drawEffect(effect);

    this.drawMap('front');

    //UI 는 원근을 타되 전경 위에 온다
    for (const actor of ordered) this.drawBars(actor, nowSec);
    for (const badge of this.badges) this.drawBadge(badge);
    for (const arrow of this.arrows) this.drawArrow(arrow);

    if (this.cutscene) this.drawCutscene(this.cutscene);
    ctx.restore();
  }

  private drawMap(id: string): void {
    const layer = this.scene.map.layers.find((l) => l.id === id);
    if (!layer) return;
    const image = this.images.map(layer.file);
    if (!image) return;
    const rect = this.scene.layerRect(layer, this.camera);
    this.ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  }

  private drawActor(actor: Actor, nowSec: number): void {
    const catalog = this.catalogOf(actor);
    if (!catalog) return;

    const frameId = actor.frames[actor.frameIndex] ?? catalog.frameEndingWith('idle')?.id;
    if (!frameId) return;

    const position = this.positionOf(actor, nowSec);
    const placement = { ...actor.placement, position };
    //배율은 접지점에서 잰다. 스프라이트 좌상단으로 재면 키가 클수록 작아진다
    const foot = this.scene.project(position, this.camera);
    const origin = this.scene.offsetFrom(foot, position, this.stage.frameOrigin(placement, frameId));
    const canvas = catalog.manifest.canvas;
    const image = this.images.character(actor.placement.characterId, catalog.frame(frameId).file);
    if (!image) return;

    const width = canvas.width * foot.scale;
    const height = canvas.height * foot.scale;
    const ctx = this.ctx;
    ctx.save();
    if (placement.facing === -1) {
      //좌우 반전. 비트맵만 뒤집고 놓이는 자리는 그대로다
      ctx.translate(origin.x + width, origin.y);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, width, height);
    } else {
      ctx.drawImage(image, origin.x, origin.y, width, height);
    }
    ctx.restore();
  }

  //에셋이 아직 없는 캐릭터. 남의 그림을 물리지 않고 자리만 표시한다 (SPEC-002 §10)
  private drawPlaceholder(actor: Actor, nowSec: number): void {
    const position = this.positionOf(actor, nowSec);
    const foot = this.scene.project(position, this.camera);
    const width = 0.34 * this.placeholderHeight * foot.scale;
    const height = this.placeholderHeight * foot.scale;

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = actor.placement.facing === 1 ? '#6f8fbf' : '#bf6f6f';
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.strokeRect(foot.x - width / 2, foot.y - height, width, height);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(232,228,220,0.75)';
    ctx.font = `${Math.max(10, height * 0.09)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(actor.placement.characterId, foot.x, foot.y - height - 6);
    ctx.restore();
  }

  private drawEffect(effect: LiveEffect): void {
    const frame = frameAt(effect.frames, effect.elapsed);
    if (!frame) return;
    const image = this.images.character(effect.characterId, frame.file);
    if (!image) return;

    //배율은 낸 사람의 접지점에서 잰다. 캐릭터와 같은 배율이라야 크기가 안 어긋난다
    const foot = this.scene.project(effect.groundRef, this.camera);
    const origin = this.scene.offsetFrom(foot, effect.groundRef, effect.origin);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = effect.blend as GlobalCompositeOperation;
    const width = effect.size.width * foot.scale;
    const height = effect.size.height * foot.scale;
    if (effect.flipped) {
      ctx.translate(origin.x + width, origin.y);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, width, height);
    } else {
      ctx.drawImage(image, origin.x, origin.y, width, height);
    }
    ctx.restore();
  }

  private drawBars(actor: Actor, nowSec: number): void {
    const position = this.positionOf(actor, nowSec);
    const base = actor.placement.position;
    //바도 캐릭터와 같은 배율을 쓴다. 따로 재면 캐릭터와 크기가 어긋난다
    const foot = this.scene.project(position, this.camera);

    for (const kind of ['hp', 'mentality'] as const) {
      const box = actor.barBox[kind];
      if (!box) continue;
      const spot = this.scene.offsetFrom(foot, base, box.origin);
      const width = box.width * foot.scale;
      const height = Math.max(2, box.height * foot.scale);

      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(spot.x - 1, spot.y - 1, width + 2, height + 2);
      ctx.fillStyle = kind === 'hp' ? '#d94141' : '#4a8fd9';
      ctx.fillRect(spot.x, spot.y, width * actor.bars[kind], height);
      ctx.restore();
    }
  }

  private drawBadge(badge: LiveBadge): void {
    const t = Math.min(1, badge.elapsed / badge.durationSec);
    const here = {
      x: badge.from.x + (badge.to.x - badge.from.x) * t,
      y: badge.from.y + (badge.to.y - badge.from.y) * t,
    };
    //배율은 주인의 접지점에서 잰다. 머리 위 좌표로 재면 지평선에 가까워 작아진다
    const owner = this.actors.get(badge.combatantId);
    if (!owner) return;
    const ground = this.positionOf(owner);
    const foot = this.scene.project(ground, this.camera);
    const spot = this.scene.offsetFrom(foot, ground, here);

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = BADGE_COLOR[badge.result];
    ctx.font = `bold ${Math.max(12, this.placeholderHeight * 0.11 * foot.scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const label = badge.text ?? (badge.result === 'win' ? '합 승리' : '합 패배');
    ctx.fillText(label, spot.x, spot.y);
    ctx.restore();
  }

  private drawArrow(arrow: LiveArrow): void {
    const shown = Math.max(2, Math.ceil((arrow.elapsed / arrow.drawSec) * arrow.curve.length));
    const points = arrow.curve.slice(0, Math.min(shown, arrow.curve.length));
    if (points.length < 2) return;

    //곡선은 두 사람 사이를 지난다. 배율은 두 접지점 사이를 따라가며 잰다.
    //점마다 자기 높이로 재면 위로 솟은 가운데가 지평선에 붙어 곡선이 접힌다
    const source = this.actors.get(arrow.sourceId);
    const target = this.actors.get(arrow.targetId);
    if (!source || !target) return;
    const from = this.positionOf(source);
    const to = this.positionOf(target);
    const along = (t: number, point: { x: number; y: number }) => {
      const ground = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      return this.scene.offsetFrom(this.scene.project(ground, this.camera), ground, point);
    };

    const ctx = this.ctx;
    const head = along(0, arrow.curve[0] as { x: number; y: number });
    const tail = along(1, arrow.curve[arrow.curve.length - 1] as { x: number; y: number });
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

    //다 그려진 뒤에만 화살촉을 붙인다
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

    const first = cutscene.layers[0];
    if (!first) {
      ctx.restore();
      return;
    }
    //컷신 캔버스를 화면에 맞춘다
    const catalog = this.stage.has(cutscene.characterId) ? this.stage.catalogFor(cutscene.characterId) : null;
    const size = catalog?.manifest.cutscene?.size ?? { width, height };
    const scale = Math.min(width / size.width, height / size.height);
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

  //컷신이 도는 중인지
  get busy(): boolean {
    return this.cutscene !== null;
  }
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
