//웹 3D 무대 본체 (SPEC-005 §9). 걸음(StageStep)을 하나씩 받아 종이 인형 타임라인으로 재생한다
//
//시간 규칙: 인형 몸짓·스파크는 게임 시간(역경직에 멈춤), 카메라·대기열·알림은 실제 시간
//쓰는 곳 규칙: 카메라는 CameraRig.write, 시간 배율은 Clock 안에서만 쓴다

import * as THREE from 'three';
import type { BattleEvent, CardFace, Side, SkillSlot } from '../domain/types.js';
import { splitDamage, type ClashRound, type FlipView, type StageStep, type StepCallout } from '../render/exchange.js';
import type { SpriteCatalog } from '../render/manifest.js';
import type { CharacterSounds } from '../render/sounds.js';
import type { UltimateArt } from '../render/ultimate.js';
import type { SoundPlayer } from '../renderer/sound.js';
import { Backdrop } from './backdrop.js';
import { CameraRig } from './camera.js';
import { FlipCard } from './card.js';
import { all, Clock, ease } from './clock.js';
import type { BackdropConfig, Stage3dConfig } from './config.js';
import { CutsceneOverlay } from './cutscene.js';
import { DustField } from './dust.js';
import { EffectLayer, effectTextures } from './effects.js';
import { frameTexture, PaperDoll } from './doll.js';
import { Overlay, type ScreenPoint, type Selection3d, type UltimateGauge } from './overlay.js';
import { SparkField } from './sparks.js';

//무대에 세울 사람 한 명
export interface RosterEntry {
  combatantId: string;
  characterId: string;
  //세울 그림의 캐릭터 id. 그림이 없는 캐릭터는 대진 설정의 자리 표시 그림을 쓴다 (SPEC-001 §7 [D-22])
  artId: string;
  name: string;
  side: Side;
  hp: number;
  maxHp: number;
  mentality: number;
  maxMentality: number;
}

//현황판이 읽는 값. 2D 렌더러와 같은 모양이다
export interface ActorSnapshot {
  combatantId: string;
  name: string;
  side: Side;
  hp: { value: number; max: number } | null;
  mentality: { value: number; max: number } | null;
  down: boolean;
}

interface Actor {
  entry: RosterEntry;
  doll: PaperDoll;
  hp: number;
  mentality: number;
}

//카드에 적을 스킬 정보 (SPEC-005 §11)
export interface StageSkill {
  slot: SkillSlot;
  name: string;
  frontPower: number;
  backPower: number;
}

//궁극기 연출에 쓸 것 (SPEC-005 §10.2). 시간표와 고유 전장, 이펙트·컷신 그림
export interface UltimateBundle {
  art: UltimateArt;
  environment: { config: BackdropConfig; images: Map<string, HTMLImageElement> } | null;
  //캐릭터 폴더 안 파일 이름으로 그림을 찾는다 (이펙트 장·컷신)
  image: (file: string) => HTMLImageElement | null;
}

//무대가 준비해 둔 궁극기 한 벌
interface UltimateStage {
  art: UltimateArt;
  environment: Backdrop | null;
  //고유 전장 흐림 손잡이
  fade: { v: number; backdrop: Backdrop | null };
  //이펙트 id → 장 텍스처
  effects: Map<string, THREE.Texture[]>;
  background: HTMLCanvasElement | null;
  foreground: HTMLImageElement | null;
  line: HTMLImageElement | null;
}

//카드 테두리 진영 색. 이름표·결과 알림의 진영 색과 같다 (SPEC-004 §11)
const CARD_TINT = { ally: '#6f9bbd', enemy: '#b3262b' } as const;

//재시작하면 도는 타임라인을 끊는다
class Aborted extends Error {}

//타격 무게 단계 (SPEC-005 §15 A08). 중간 타 · 마지막 타 · 궁극기 마지막 베기
type HitTier = 'light' | 'heavy' | 'climax';

//녹음 소리 재생 선택지. impactIn 은 지금부터 맞닿는 순간까지(초, 실제). at 은 소리가 날 자리
interface VoiceOptions {
  impactIn?: number;
  at?: THREE.Vector3;
  gain?: number;
}

//연출 실험 모드 켬 상태 (SPEC-005 §15)
export interface LabOptions {
  //흔들림 줄이기: 흔들림·화각 펀치를 끈다
  reducedMotion: boolean;
  //섬광 줄이기: 임팩트 프레임·컷신 선 번쩍임을 끈다
  reducedFlash: boolean;
}

export class Stage3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly rig: CameraRig;
  private readonly clock = new Clock();
  private readonly sparks: SparkField;
  private readonly overlay: Overlay;
  //전투 배경. 실험 모드에서 타격 순간 밝기를 누른다
  private readonly backdrop: Backdrop;
  //바닥 먼지 (실험 모드 D05)
  private readonly dust: DustField;
  //연출 실험 모드 (SPEC-005 §15). null 이면 끈다
  private lab: LabOptions | null = null;
  //배속. 소리를 앞당겨 예약할 때 실제 시간으로 바꾸는 데 쓴다
  private speed = 1;
  //배경 누르기 세대. 새 누르기가 오면 앞 것의 풀기를 건너뛴다
  private dimToken = 0;
  //배경 밝기 손잡이. 전투 배경과 고유 전장을 같이 누른다
  private readonly dimKnob = {
    stage: this as Stage3D,
    value: 1,
    get v(): number {
      return this.value;
    },
    set v(x: number) {
      this.value = x;
      this.stage.applyBrightness(x);
    },
  };
  private readonly actors = new Map<string, Actor>();
  private queue: StageStep[] = [];
  private running = false;
  //재시작 세대. 이전 세대의 타임라인은 다음 await 에서 멈춘다
  private epoch = 0;
  private readonly raycaster = new THREE.Raycaster();
  //캐릭터별 장 텍스처. 재시작해도 다시 만들지 않는다
  private readonly textures = new Map<string, Map<string, THREE.Texture>>();
  private readonly worldPerPixel = new Map<string, number>();
  //머리 위 카드와 그 주인 인형
  private readonly cards = new Map<FlipCard, PaperDoll>();
  //궁극기 이펙트·컷신 (SPEC-005 §10.2)
  private readonly effects: EffectLayer;
  private readonly cutscene: CutsceneOverlay;
  //캐릭터 id → 궁극기 한 벌
  private readonly ultimates = new Map<string, UltimateStage>();
  //교전 중에 숨길 근경 재질과 그 투명도 손잡이
  private readonly foreground: THREE.MeshBasicMaterial[];
  private readonly foregroundFade = {
    stage: this as Stage3D,
    value: 1,
    get v(): number {
      return this.value;
    },
    set v(x: number) {
      this.value = x;
      for (const m of this.stage.foreground) m.opacity = x;
    },
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    host: HTMLElement,
    private readonly config: Stage3dConfig,
    backdropConfig: BackdropConfig,
    backdropImages: Map<string, HTMLImageElement>,
    private readonly sprites: Map<string, SpriteCatalog>,
    private readonly frameImages: (characterId: string, file: string) => HTMLImageElement | null,
    private readonly skillInfo: (skillId: number) => StageSkill,
    private readonly sound: SoundPlayer,
    ultimates: Map<string, UltimateBundle> = new Map(),
    //그림 주인 캐릭터 id → 녹음 소리 묶음 (SPEC-005 §14)
    private readonly voices: Map<string, CharacterSounds> = new Map(),
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene.background = new THREE.Color(0x0e0c0b);
    const backdrop = new Backdrop(this.scene, backdropConfig);
    this.backdrop = backdrop;
    backdrop.build(backdropImages);
    this.foreground = backdrop.combatHidden;
    this.camera = new THREE.PerspectiveCamera(backdrop.fov, canvas.width / canvas.height, 0.1, 300);
    this.rig = new CameraRig(this.camera, backdrop.homePosition, backdrop.homeLookAt, backdrop.fov, config.camera, config.shake);
    this.sparks = new SparkField(this.scene, config.sparks);
    this.dust = new DustField(this.scene, config.layout.characterHeight);
    this.overlay = new Overlay(host, config.footBar);
    this.effects = new EffectLayer(this.scene, config.layout.characterHeight);
    this.cutscene = new CutsceneOverlay(host);
    for (const [characterId, bundle] of ultimates) this.prepareUltimate(characterId, bundle);
    this.resize();
    this.preload();
  }

  //모든 장·이펙트·고유 전장 텍스처를 미리 그래픽 카드에 올린다
  //처음 보이는 순간 올리면 그 한 프레임이 멈춰 장이 끊겨 보인다 (SPEC-005 §12.1)
  private preload(): void {
    const upload = (texture: THREE.Texture | null | undefined): void => {
      if (texture) this.renderer.initTexture(texture);
    };
    for (const characterId of this.sprites.keys()) for (const texture of this.texturesOf(characterId)?.values() ?? []) upload(texture);
    for (const u of this.ultimates.values()) {
      for (const list of u.effects.values()) list.forEach(upload);
      u.environment?.root.traverse((node) => {
        const material = (node as THREE.Mesh).material;
        if (material && !Array.isArray(material)) upload((material as THREE.MeshBasicMaterial).map);
      });
    }
  }

  //궁극기 한 벌을 미리 세운다. 고유 전장은 숨겨 두고, 컷신 배경은 전장 층을 합쳐 한 장으로 만든다
  private prepareUltimate(characterId: string, bundle: UltimateBundle): void {
    const catalog = this.sprites.get(characterId);
    if (!catalog) return;
    let environment: Backdrop | null = null;
    let background: HTMLCanvasElement | null = null;
    if (bundle.environment) {
      environment = new Backdrop(this.scene, bundle.environment.config);
      environment.build(bundle.environment.images);
      environment.setOpacity(0);
      background = composeBackdrop(bundle.environment.config, bundle.environment.images);
    }
    const effects = new Map<string, THREE.Texture[]>();
    for (const id of Object.values(bundle.art.effects)) {
      const effect = catalog.manifest.effects.find((e) => e.id === id);
      if (effect) effects.set(id, effectTextures(effect.frames.map((f) => bundle.image(f.file))));
    }
    this.ultimates.set(characterId, {
      art: bundle.art,
      environment,
      fade: { v: 0, backdrop: environment },
      effects,
      background,
      foreground: bundle.image(bundle.art.cutscene.foreground),
      line: bundle.image(bundle.art.cutscene.line),
    });
  }

  //카드 슬롯. 인형 장 고르기에 쓴다
  private slotOf(skillId: number): SkillSlot {
    return this.skillInfo(skillId).slot;
  }

  //캔버스가 보이는 크기에 그리기 버퍼를 맞춘다
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  //캐릭터의 장 텍스처를 한 번만 만든다
  private texturesOf(characterId: string): Map<string, THREE.Texture> | null {
    const cached = this.textures.get(characterId);
    if (cached) return cached;
    const catalog = this.sprites.get(characterId);
    if (!catalog) return null;
    const out = new Map<string, THREE.Texture>();
    //같은 그림·같은 자리를 여러 장이 나눠 쓰면 텍스처도 하나만 만든다 (카일 전용기 3장이 같은 베기 장을 쓴다)
    const byFile = new Map<string, THREE.Texture>();
    for (const frame of catalog.manifest.frames) {
      const image = this.frameImages(characterId, frame.file);
      if (!image) continue;
      const key = `${frame.file}|${frame.bbox.join(',')}`;
      const texture = byFile.get(key) ?? frameTexture(image, frame, catalog.manifest.canvas.width, this.config.layout.textureMaxSide);
      byFile.set(key, texture);
      out.set(frame.id, texture);
    }
    this.textures.set(characterId, out);
    //키는 대기 장에서 잰다. 공격 장으로 재면 판마다 크기가 흔들린다
    this.worldPerPixel.set(characterId, this.config.layout.characterHeight / catalog.characterHeight);
    return out;
  }

  //사람을 다시 세운다. 같은 편은 깊이로 벌린다 (§9.5)
  reset(roster: readonly RosterEntry[]): void {
    this.epoch += 1;
    this.queue = [];
    this.running = false;
    this.clock.clear();
    this.sparks.clear();
    this.dust.clear();
    this.dimToken += 1;
    this.dimKnob.v = 1;
    this.scene.background = new THREE.Color(0x0e0c0b);
    this.overlay.clear();
    for (const card of this.cards.keys()) card.dispose();
    this.cards.clear();
    this.effects.clear();
    this.cutscene.clear();
    for (const u of this.ultimates.values()) u.environment?.setOpacity(0);
    for (const actor of this.actors.values()) this.scene.remove(actor.doll.root);
    this.actors.clear();

    const layout = this.config.layout;
    const index = { ally: 0, enemy: 0 };
    for (const entry of roster) {
      const catalog = this.sprites.get(entry.artId);
      const textures = this.texturesOf(entry.artId);
      //그림이 없는 캐릭터는 3D 에 세우지 않는다. 남의 그림을 대신 쓰지 않는다 (§9.4)
      if (!catalog || !textures) continue;
      const row = index[entry.side]++;
      const sign = entry.side === 'ally' ? -1 : 1;
      const doll = new PaperDoll(entry.combatantId, catalog, textures, this.worldPerPixel.get(entry.artId) ?? 1, 10 + row);
      doll.home.set(sign * (layout.sideHalfGap + row * layout.rowOutward), 0, -row * layout.rowDepth);
      doll.setFacing(entry.side === 'ally' ? 1 : -1);
      doll.reset();
      this.scene.add(doll.root);
      this.actors.set(entry.combatantId, { entry, doll, hp: entry.hp, mentality: entry.mentality });
    }
    this.overlay.setActors(roster.filter((r) => this.actors.has(r.combatantId)));
    this.foregroundFade.v = 1;
    this.rig.snapHome();
  }

  //걸음을 대기열에 넣는다. 앞 걸음이 끝나야 다음이 돈다
  play(steps: readonly StageStep[]): void {
    this.queue.push(...steps);
    if (!this.running) void this.run(this.epoch);
  }

  get idle(): boolean {
    return !this.running && this.queue.length === 0;
  }

  private async run(epoch: number): Promise<void> {
    this.running = true;
    try {
      while (this.queue.length > 0 && epoch === this.epoch) {
        const step = this.queue.shift() as StageStep;
        //무대에 없는 사람(그림 없음)이 낀 걸음은 현황판 값만 바꾸고 넘긴다
        if (step.kind !== 'state' && !this.stepOnStage(step)) {
          this.applyAll(stepEvents(step));
          continue;
        }
        if (step.kind !== 'state') this.enterExchange(step.kind === 'oneSided' ? [step.attackerId, step.targetId] : [step.attackerId, step.defenderId]);
        if (step.kind === 'oneSided') await this.playOneSided(step, epoch);
        else if (step.kind === 'clash') await this.playClash(step, epoch);
        else this.applyState(step.event);
      }
      //대기열이 비면 모두 다시 보이고 근경도 돌아온다
      if (epoch === this.epoch) this.leaveExchange();
    } catch (error) {
      if (!(error instanceof Aborted)) console.error(error);
    } finally {
      if (epoch === this.epoch) this.running = false;
    }
  }

  private stepOnStage(step: Exclude<StageStep, { kind: 'state' }>): boolean {
    const ids = step.kind === 'oneSided' ? [step.attackerId, step.targetId] : [step.attackerId, step.defenderId];
    return ids.every((id) => this.actors.has(id));
  }

  //교전 한 건을 연다. 참가자만 보이고 구경꾼·근경은 흐려져 사라진다 (SPEC-005 §9.3·§9.5.1)
  private enterExchange(participants: readonly string[]): void {
    const m = this.config.motion;
    this.clock.tween(this.foregroundFade, 'v', 0, m.foregroundFade);
    for (const [id, a] of this.actors) this.setShown(a.doll, participants.includes(id));
  }

  //교전이 다 끝났다. 모두 다시 보이고 근경도 돌아온다
  private leaveExchange(): void {
    this.clock.tween(this.foregroundFade, 'v', 1, this.config.motion.foregroundFade);
    for (const a of this.actors.values()) this.setShown(a.doll, true);
  }

  //인형 하나를 보이거나 숨긴다. 쓰러진 인형은 쓰러짐 흐림으로 돌아간다
  private setShown(d: PaperDoll, shown: boolean): void {
    const m = this.config.motion;
    if (d.hidden === !shown) return;
    d.hidden = !shown;
    const target = shown ? (d.down ? m.downOpacity : 1) : 0;
    this.clock.tween(d.fade, 'v', target, m.bystanderFade);
  }

  //세대가 바뀌었으면 멈춘다. 모든 await 뒤에 부른다
  private async wait<T>(job: Promise<T>, epoch: number): Promise<T> {
    const out = await job;
    if (epoch !== this.epoch) throw new Aborted();
    return out;
  }

  private actor(id: string): Actor {
    const found = this.actors.get(id);
    if (!found) throw new Aborted();
    return found;
  }

  //── 현황판 값 ──

  //이벤트 하나를 현황판 값에 반영한다. 쓰러짐은 여기서 연출까지 시작한다
  private applyState(event: BattleEvent): void {
    if (event.type === 'damageApplied') {
      const a = this.actors.get(event.combatantId);
      if (a) a.hp = event.hp;
    } else if (event.type === 'statusTicked') {
      const a = this.actors.get(event.combatantId);
      if (a) {
        a.hp = Math.max(0, a.hp - event.damage);
        this.overlay.number(this.headPoint(event.combatantId, 0.2), String(event.damage), '');
      }
    } else if (event.type === 'mentalityChanged') {
      const a = this.actors.get(event.combatantId);
      if (a) a.mentality = event.mentality;
    } else if (event.type === 'defeated') {
      const a = this.actors.get(event.combatantId);
      if (a && !a.doll.down) void this.fallDown(a, this.epoch).catch(() => undefined);
    }
  }

  private applyAll(events: readonly BattleEvent[]): void {
    for (const e of events) this.applyState(e);
  }

  //── 몸짓 (§8.2) ──

  private dir(from: PaperDoll, to: PaperDoll): number {
    return Math.sign(to.root.position.x - from.root.position.x) || from.facing;
  }

  private chest(d: PaperDoll): THREE.Vector3 {
    return d.chest(this.config.layout.characterHeight * 0.5);
  }

  //뒤로 물러나며 준비 장
  private windup(d: PaperDoll, frame: string, dir: number): Promise<void> {
    d.showFrame(frame);
    return this.clock.tween(d.visual.position, 'x', d.toLocalX(-dir * this.config.motion.windupBack), this.config.motion.windupTime);
  }

  //상대 앞까지 가속해 들어간다
  private dash(d: PaperDoll, toX: number, toZ: number, time: number): Promise<unknown> {
    d.setPose('dash');
    this.dashSound(d);
    return all(
      this.clock.tween(d.root.position, 'x', toX, time, ease.inQuad),
      this.clock.tween(d.root.position, 'z', toZ, time, ease.inQuad),
      this.clock.tween(d.visual.position, 'x', 0, time),
    );
  }

  //앞으로 내딛는 충돌 장
  private strike(d: PaperDoll, frame: string, dir: number): Promise<void> {
    d.showFrame(frame);
    return this.clock.tween(d.visual.position, 'x', d.toLocalX(dir * this.config.motion.strikeReach), this.config.motion.strikeTime, ease.outBack);
  }

  //타 나누기 (§12.1). 장 목록을 타 장(impact)마다 끊는다. 타 장이 없으면 둘째 장 하나가 한 타다
  private hitSegments(d: PaperDoll, frames: readonly string[]): string[][] {
    const marks = frames.map((id, i) => (d.catalog.frame(id).impact ? i : -1)).filter((i) => i >= 0);
    if (marks.length === 0) marks.push(frames.length > 1 ? 1 : 0);
    return marks.map((start, k) => frames.slice(start, marks[k + 1] ?? frames.length));
  }

  //장 하나를 보이는 시간. 매니페스트 ms 가 있으면 그대로, 없으면 궤적 시간을 나눠 쓴다 (§9.4)
  private frameSeconds(d: PaperDoll, id: string, count: number): number {
    const ms = d.catalog.frame(id).ms;
    return ms !== null ? ms / 1000 : this.config.motion.strikeTrailTime / Math.max(1, count);
  }

  //한 타의 나머지 장을 넘긴다. 첫 장(타 장)은 이미 보이고 있다
  private async playSegment(d: PaperDoll, segment: readonly string[], epoch: number): Promise<void> {
    await this.wait(this.clock.waitGame(this.frameSeconds(d, segment[0] as string, segment.length - 1)), epoch);
    for (const id of segment.slice(1)) {
      if (d.down) return;
      d.showFrame(id);
      this.frameVoice(d, id);
      await this.wait(this.clock.waitGame(this.frameSeconds(d, id, segment.length - 1)), epoch);
    }
  }

  //중간 타에 맞은 쪽이 피격 장으로 밀린다. 자리 자체가 밀려서 때린 쪽이 따라간다 (§12.1)
  //distance 를 주면 그만큼만 밀린다 (궁극기 연속 베기는 조금씩)
  private nudge(d: PaperDoll, dir: number, distance = this.config.motion.hitKnock): Promise<void> {
    const m = this.config.motion;
    d.setPose('hurt');
    return this.clock.tween(d.root.position, 'x', d.root.position.x + dir * distance, m.knockTime, ease.outExpo);
  }

  //맞은 쪽의 지금 발 x (월드)
  private worldX(d: PaperDoll): number {
    return d.root.position.x + d.visual.position.x * d.root.scale.x;
  }

  //도착한 뒤의 한 방 전부 (§12). 준비 장 → 타마다 치고·밀리고·따라간다. 마지막 타에 걸음 이벤트를 적용한다
  //receive: 받아내기 타에 진 쪽이 파고들 장 (합에서만)
  private async playHits(W: PaperDoll, L: PaperDoll, frames: readonly string[], damage: number, events: readonly BattleEvent[], cards: readonly (FlipCard | null)[], receive: string | null, epoch: number): Promise<void> {
    const m = this.config.motion;
    const dir = this.dir(W, L);
    const segments = this.hitSegments(W, frames);
    //다음 타 준비 장(windup)은 앞 타 끝에서 떼어 다음 타 앞에 붙인다. 따라붙은 뒤에 넘긴다 (§12.1 v2.18)
    const windups: string[][] = segments.map(() => []);
    for (let k = 0; k + 1 < segments.length; k++) {
      const seg = segments[k] as string[];
      while (seg.length > 1 && W.catalog.frame(seg[seg.length - 1] as string).windup) (windups[k + 1] as string[]).unshift(seg.pop() as string);
    }
    const parts = splitDamage(damage, segments.length);
    const parry = frames.length > 1 && segments[0]?.[0] === frames[0];

    //준비 장. 받아내기 카드는 준비 장이 곧 첫 타다
    if (!parry) {
      W.showFrame(frames[0] as string);
      await this.wait(this.clock.waitGame(m.readyHold), epoch);
    }
    const lab = this.lab ? this.config.lab : null;
    for (let k = 0; k < segments.length; k++) {
      const segment = segments[k] as string[];
      const last = k === segments.length - 1;
      //앞 타 장을 다 넘긴 뒤, 처음 달려갈 때처럼 돌진 장으로 날아간 자리까지 달려 붙는다 (§12.1 v2.18)
      if (k > 0 && !L.down && Math.abs(this.worldX(L) - this.worldX(W)) > m.contactGap * 1.25) {
        const toX = this.worldX(L) - dir * m.contactGap;
        const time = Math.max(m.followTime, Math.abs(toX - this.worldX(W)) / m.followSpeed);
        W.setPose('dash');
        this.dashSound(W);
        await this.wait(
          all(this.clock.tween(W.root.position, 'x', toX, time, ease.inOutQuad), this.clock.tween(W.root.position, 'z', L.root.position.z, time, ease.inOutQuad)),
          epoch,
        );
      }
      //실험 모드: 여러 타의 마지막 타 앞에서 한 번 멈춘다 (짧게–짧게–멈춤–강하게, §15)
      if (lab && last && k > 0) await this.wait(this.clock.waitGame(lab.finalBeatPause), epoch);
      //다음 타 준비 장. 도착한 뒤 제자리에서 넘긴다
      for (const id of windups[k] ?? []) {
        W.showFrame(id);
        await this.wait(this.clock.waitGame(this.frameSeconds(W, id, segment.length)), epoch);
      }
      //칼 소리: 받아내기는 막는 소리, 나머지는 그 타 장의 소리 (§14). 맞닿는 순간(strikeTime 뒤)에 정점이 오게 미리 예약한다
      const soundId = parry && k === 0 ? (this.voiceOf(W)?.parry ?? null) : (this.voiceOf(W)?.frames[segment[0] as string] ?? null);
      const contactGuess = this.chest(W).lerp(this.chest(L), this.config.sparks.contactBias);
      this.voice(W, soundId, { impactIn: this.wallSeconds(m.strikeTime), at: contactGuess, gain: lab ? (last ? lab.voiceGain.final : lab.voiceGain.intermediate) : 1 });
      if (parry && k === 0) {
        //받아내기: 진 쪽이 먼저 파고들어 막는 장에 부딪힌다. 일방이면 막는 장 그대로 밀쳐 들어간다
        W.showFrame(segment[0] as string);
        if (receive) {
          L.showFrame(receive);
          await this.wait(this.clock.tween(L.visual.position, 'x', L.toLocalX(-dir * m.parryLunge), m.strikeTime, ease.outBack), epoch);
        } else {
          await this.wait(this.strike(W, segment[0] as string, dir), epoch);
        }
      } else {
        await this.wait(this.strike(W, segment[0] as string, dir), epoch);
      }
      const contact = this.chest(W).lerp(this.chest(L), this.config.sparks.contactBias);
      const part = parts[k] ?? 0;
      //받아내기도 금속 스파크는 낸다. 그림에 없는 베기 이펙트는 붙이지 않는다 (§12.3 v2.17)
      this.impact(contact, L, dir, part, false, last ? events : [], last ? damage : 0, true, last ? 'heavy' : 'light');
      if (k === 0) for (const card of cards) void this.fadeCard(card);
      //실험 모드: 마지막 타는 때린 쪽이 타 장을 더 붙잡는다. 맞은 쪽은 바로 날아간다 (비대칭 홀드 C09)
      const decay = lab && last ? this.clock.waitGame(lab.attackerHold).then(() => this.playSegment(W, segment, epoch)) : this.playSegment(W, segment, epoch);
      const jobs: Promise<void>[] = [this.clock.tween(W.visual.position, 'x', 0, m.knockTime), decay];
      if (!L.down) {
        //중간 타는 맞은 쪽만 날아간다. 때린 쪽은 이 타의 남은 장을 제자리에서 다 넘긴 뒤 따라간다 (§12.1 v2.18)
        if (!last) jobs.push(this.nudge(L, dir), this.clock.tween(L.visual.position, 'x', 0, m.knockTime));
        else if (damage > 0) jobs.push(this.knockback(L, dir, damage, damage >= m.heavyDamage, epoch));
      }
      //날아가는 쪽까지 카메라가 둘을 잡는다
      const fly = last ? Math.min(m.knockMax, m.knockBase + damage * m.knockPerDamage) : m.hitKnock;
      if (!L.down) this.rig.focus(this.chest(W), this.chest(L).add(new THREE.Vector3(dir * fly, 0, 0)), dir);
      await this.wait(all(jobs), epoch);
    }
    await this.wait(this.clock.waitReal(m.lingerAfterHit), epoch);
  }

  //맞은 쪽이 공격 반대로 밀린다. 기울지 않는다 (§8.9)
  private async knockback(d: PaperDoll, dir: number, damage: number, heavy: boolean, epoch: number): Promise<void> {
    const m = this.config.motion;
    d.setPose('hurt');
    const distance = Math.min(m.knockMax, m.knockBase + damage * m.knockPerDamage);
    await this.wait(
      all(
        this.clock.tween(d.visual.position, 'x', d.toLocalX(dir * distance), m.knockTime, ease.outExpo),
        this.clock.tween(d.visual.position, 'y', heavy ? m.staggerDrop : 0, m.knockTime, ease.outExpo),
      ),
      epoch,
    );
    //실험 모드: 날아가 멈춘 발밑에 바닥 먼지 (D05)
    if (this.lab) {
      const dust = this.config.lab.dust;
      this.dust.burst(this.footOf(d), dir, dust.count, dust.life, dust.size, dust.spread);
    }
    if (heavy) await this.wait(this.clock.waitGame(m.staggerHold), epoch);
  }

  //맞은 쪽은 튕기며 제자리
  private springBack(d: PaperDoll): Promise<unknown> {
    const m = this.config.motion;
    if (d.down) return Promise.resolve();
    d.setPose('retreat');
    const f = ease.outElastic(m.settleAmplitude, m.settlePeriod);
    return all(this.clock.tween(d.visual.position, 'x', 0, m.settleTime, f), this.clock.tween(d.visual.position, 'y', 0, m.settleTime, f));
  }

  //제자리로 돌아간다
  private returnHome(d: PaperDoll): Promise<unknown> {
    const m = this.config.motion;
    if (d.down) return Promise.resolve();
    d.setPose('retreat');
    return all(
      this.clock.tween(d.root.position, 'x', d.home.x, m.returnTime, ease.outCubic),
      this.clock.tween(d.root.position, 'z', d.home.z, m.returnTime, ease.outCubic),
      this.clock.tween(d.visual.position, 'x', 0, m.returnTime),
      this.clock.tween(d.visual.position, 'y', 0, m.returnTime),
    );
  }

  //쓰러짐. 피격 장으로 바꾸고 가라앉으며 흐려진다. 기울이지 않는다
  private async fallDown(a: Actor, epoch: number): Promise<void> {
    const m = this.config.motion;
    const d = a.doll;
    d.down = true;
    d.setPose('hurt');
    this.sound.play('down');
    await this.wait(
      all(
        this.clock.tween(d.visual.position, 'y', -m.downSink, m.downTime, ease.outCubic),
        this.clock.tween(d.fade, 'v', d.hidden ? 0 : m.downOpacity, m.downTime),
      ),
      epoch,
    );
  }

  //── 녹음 소리 (§14) ──

  //이 인형 그림 주인의 소리 묶음
  private voiceOf(d: PaperDoll): CharacterSounds | null {
    return this.voices.get(d.catalog.manifest.character) ?? null;
  }

  //소리 id 하나를 낸다. 없으면 조용히 넘어간다. 녹음이 났으면 true
  //맞닿는 순간을 알면 파일 안 정점(lead)만큼 앞당겨 예약한다 (§14 v2.17). 실험 모드는 소리 자리로 좌우를 준다 (§15 H08)
  private voice(d: PaperDoll, id: string | null, options: VoiceOptions = {}): boolean {
    const v = this.voiceOf(d);
    if (!v || !id) return false;
    const lead = (v.lead[id] ?? 0) / 1000;
    const delay = options.impactIn !== undefined ? Math.max(0, Math.min(0.5, options.impactIn - lead)) : 0;
    const pan = this.lab && options.at ? this.panOf(options.at) : 0;
    return this.sound.playSample?.(`${v.character}/${id}`, (v.gain[id] ?? 1) * (options.gain ?? 1), { delay, pan }) ?? false;
  }

  //장이 보일 때 그 장에 묶인 소리
  private frameVoice(d: PaperDoll, frameId: string, options: VoiceOptions = {}): void {
    this.voice(d, this.voiceOf(d)?.frames[frameId] ?? null, options);
  }

  //월드 자리의 화면 좌우 → 소리 좌우 (-폭 ~ 폭)
  private panOf(at: THREE.Vector3): number {
    const n = at.clone().project(this.camera);
    return Math.max(-1, Math.min(1, n.x)) * this.config.lab.pan.width;
  }

  //게임 시간 → 실제(벽시계) 시간. 지금 시간 배율과 배속을 나눈다
  private wallSeconds(game: number): number {
    return game / Math.max(0.05, this.clock.scale) / Math.max(0.1, this.speed);
  }

  //돌진 소리. 녹음이 없으면 합성
  private dashSound(d: PaperDoll): void {
    if (!this.voice(d, this.voiceOf(d)?.dash ?? null)) this.sound.play('dash');
  }

  //피격 슬로우 (§12.1). 역경직·밀림이 끝난 뒤(after 초, 실제 시간) 잠깐 게임 시간이 느려진다. 다음 타가 오면 새로 건다
  private slowToken = 0;
  private hitSlow(after: number): void {
    const m = this.config.motion;
    const token = ++this.slowToken;
    this.clock.setSlowMotion(1);
    void this.clock
      .waitReal(after)
      .then(() => {
        if (token !== this.slowToken) return;
        this.clock.setSlowMotion(m.hitSlowScale);
        return this.clock.waitReal(m.hitSlowTime);
      })
      .then(() => {
        if (token === this.slowToken) this.clock.setSlowMotion(1);
      });
  }

  //맞는 순간. 스파크·역경직·카메라·소리·현황판·피해 숫자
  //total: 흐트러짐을 판정할 전체 피해 (타수가 있으면 마지막 타에만 넘긴다, §12.2)
  //sparks: 불꽃을 낼지. 받아내기는 그림에 이펙트가 없어 불꽃을 내지 않는다 (§12.3)
  //tier 는 실험 모드의 타격 무게 단계다 (§15). 실험 모드가 아니면 쓰지 않는다
  private impact(contact: THREE.Vector3, target: PaperDoll, dir: number, damage: number, clash: boolean, events: readonly BattleEvent[], total = damage, sparks = true, tier: HitTier | null = null): void {
    const s = this.config.shake;
    const h = this.config.hitStop;
    const heavy = total >= this.config.motion.heavyDamage;
    if (sparks) this.sparks.burst(contact, dir, clash, 10);

    const lab = this.lab && tier ? this.config.lab : null;
    const seconds = lab && tier ? lab.hitStop[tier] : clash && damage <= 0 ? h.clashSeconds : Math.min(h.maxSeconds, h.baseSeconds + damage * h.perDamageSeconds);
    this.clock.startHitStop(seconds, h.scale);
    //밀림은 제 속도로 보이고 슬로우는 그 뒤에 건다 (§12.1 v2.12)
    if (damage > 0) this.hitSlow(seconds + this.config.motion.knockTime);
    const power = damage > 0 ? Math.min(1, damage / s.damageForMaxShake) : s.clashPower;
    //실험 모드: 중간 타는 작게, 마지막·궁극기는 크게 (E06·E07). 흔들림 줄이기면 흔들지 않는다
    if (!(this.lab?.reducedMotion && lab)) this.rig.impact(lab && tier ? power * lab.shake[tier] : power, dir);
    if (lab && (tier === 'heavy' || tier === 'climax')) void this.dimBackdrop();
    if (lab && tier === 'climax' && !this.lab?.reducedFlash) void this.impactFrame();
    this.sound.play(damage <= 0 ? 'clash' : heavy ? 'hitHeavy' : 'hit');
    //중간 타는 이벤트가 없어 현황판 체력만 그 타만큼 줄인다. 마지막 타의 이벤트가 규칙 값으로 맞춘다
    const actor = this.actors.get(target.combatantId);
    if (actor && damage > 0 && events.length === 0 && !clash) actor.hp = Math.max(0, actor.hp - damage);
    this.applyAll(events);
    if (damage > 0) {
      this.overlay.number(this.headPoint(target.combatantId, 0.1), String(damage), heavy ? 'heavy' : '');
      if (heavy) this.overlay.number(this.headPoint(target.combatantId, 0.55), '흐트러짐', 'tag');
    }
  }

  //달려가는 아군 머리 위에 결과 알림 (§8.10)
  private showCallouts(callouts: readonly StepCallout[], runners: readonly string[]): void {
    for (const c of callouts) {
      if (!runners.includes(c.combatantId)) continue;
      this.overlay.callout(c.combatantId, c.success, c.title, c.reason, this.clock.realNow, this.config.callout.seconds);
    }
  }

  //── 카드 뒤집기 (SPEC-005 §11) ──

  //머리 위 카드를 만든다. 진영 색 테두리
  private makeCard(owner: PaperDoll, flip: FlipView): FlipCard {
    const info = this.skillInfo(flip.skillId);
    const side = this.actor(flip.combatantId).entry.side;
    const card = new FlipCard(
      { name: info.name, slot: info.slot, frontPower: info.frontPower, backPower: info.backPower, tint: side === 'ally' ? CARD_TINT.ally : CARD_TINT.enemy },
      this.config.cardFlip.height,
    );
    this.scene.add(card.root);
    this.cards.set(card, owner);
    return card;
  }

  //카드가 뜨는 자리. 머리 위 headLift 만큼, 카드 가운데가 오게 한다
  private cardAnchor(d: PaperDoll): THREE.Vector3 {
    const c = this.config.cardFlip;
    const h = this.config.layout.characterHeight;
    return new THREE.Vector3(
      d.root.position.x + d.visual.position.x * d.root.scale.x,
      h * 1.05 + d.visual.position.y + c.headLift + c.height / 2,
      d.root.position.z,
    );
  }

  //③④ 카드를 돌리다 나온 면으로 멈춘다. 멈추는 순간 '띵' 과 함께 한 번 튄다. 실제 시간이라 슬로우에 느려지지 않는다
  private async revealCards(pairs: readonly { card: FlipCard; face: CardFace }[], epoch: number): Promise<void> {
    const c = this.config.cardFlip;
    this.sound.play('flip');
    const spins: Promise<void>[] = [];
    for (const { card, face } of pairs) {
      card.state.spin = 0;
      card.state.dim = 0;
      card.state.opacity = 1;
      void this.clock.tweenReal(card.state, 'scale', 1, c.spinTime * 0.25, ease.outBack);
      spins.push(this.clock.tweenReal(card.state, 'spin', FlipCard.restAngle(face, c.spinTurns), c.spinTime, ease.outCubic));
    }
    await this.wait(all(spins), epoch);
    this.sound.play('reveal');
    for (const { card } of pairs) card.state.scale = 1.3;
    await this.wait(all(pairs.map(({ card }) => this.clock.tweenReal(card.state, 'scale', 1, c.revealPop, ease.outQuad))), epoch);
  }

  //⑤ 진 쪽 카드는 어두워지며 작아진다
  private dimCard(card: FlipCard): void {
    const c = this.config.cardFlip;
    void this.clock.tweenReal(card.state, 'dim', 1, c.holdTime * 0.5);
    void this.clock.tweenReal(card.state, 'scale', 0.8, c.holdTime * 0.5);
  }

  //카드를 흐리게 지우고 장면에서 뺀다
  private async fadeCard(card: FlipCard | null): Promise<void> {
    if (!card) return;
    await this.clock.tweenReal(card.state, 'opacity', 0, this.config.cardFlip.fadeTime);
    this.cards.delete(card);
    card.dispose();
  }

  //② 슬로우 동안 목표 쪽으로 다가간다. 게임 시간 몫을 슬로우 배율로 맞춰 카드가 멈출 때쯤 도착한다
  private approach(d: PaperDoll, toX: number, toZ: number): Promise<unknown> {
    const c = this.config.cardFlip;
    const gameSec = (c.spinTime + c.revealPop + c.holdTime) * c.slowScale;
    d.setPose('dash');
    this.dashSound(d);
    const x = d.root.position.x + (toX - d.root.position.x) * c.approachShare;
    const z = d.root.position.z + (toZ - d.root.position.z) * c.approachShare;
    return all(
      this.clock.tween(d.root.position, 'x', x, gameSec, ease.linear),
      this.clock.tween(d.root.position, 'z', z, gameSec, ease.linear),
      this.clock.tween(d.visual.position, 'x', 0, gameSec),
    );
  }

  //── 걸음 재생 (§9.3 · §11) ──

  private async playOneSided(step: Extract<StageStep, { kind: 'oneSided' }>, epoch: number): Promise<void> {
    const a = this.actor(step.attackerId).doll;
    const d = this.actor(step.targetId).doll;
    const m = this.config.motion;
    const c = this.config.cardFlip;
    const dir = this.dir(a, d);
    const frames = a.skillFrames(this.slotOf(step.skillId));
    const toX = d.root.position.x - dir * m.contactGap;
    const toZ = d.root.position.z;

    //① 초점 · 선딜레이
    this.rig.focus(this.chest(a), this.chest(d), dir);
    await this.wait(this.windup(a, a.poseFrame('dash'), dir), epoch);

    //② 달려가며 슬로우 → ③④ 카드 회전·띵 → ⑤ 비교
    const card = this.makeCard(a, step.flip);
    this.clock.setSlowMotion(c.slowScale);
    const run = this.approach(a, toX, toZ);
    await this.wait(this.revealCards([{ card, face: step.flip.face }], epoch), epoch);
    this.showCallouts(step.callouts, [step.attackerId]);
    await this.wait(this.clock.waitReal(c.holdTime), epoch);
    await this.wait(run as Promise<void>, epoch);
    this.clock.setSlowMotion(1);
    //궁극기면 ⑥⑦ 대신 궁극기 시간표 (§10.2)
    const ultimate = this.ultimateFor(step.attackerId, step.skillId);
    if (ultimate) {
      await this.playUltimate(ultimate, a, d, step.damage, step.events, [card], epoch);
      return;
    }
    //⑥ 슬로우가 풀리고 남은 거리를 달린다
    await this.wait(this.dash(a, toX, toZ, m.dashTime * (1 - c.approachShare)), epoch);
    this.rig.focus(this.chest(a), this.chest(d), dir);

    //⑦ 준비 장 → 타마다 치고 따라간다 (§12)
    await this.wait(this.playHits(a, d, frames, step.damage, step.events, [card], null, epoch), epoch);

    this.rig.release();
    //여러 타에 밀려난 쪽은 제자리로 걸어 돌아간다
    const moved = Math.abs(d.root.position.x - d.home.x) > 0.01;
    await this.wait(all((moved ? this.returnHome(d) : this.springBack(d)) as Promise<void>, this.returnHome(a) as Promise<void>), epoch);
    this.settle(a);
    this.settle(d);
  }

  private async playClash(step: Extract<StageStep, { kind: 'clash' }>, epoch: number): Promise<void> {
    const A = this.actor(step.attackerId).doll;
    const D = this.actor(step.defenderId).doll;
    const m = this.config.motion;
    const c = this.config.cardFlip;
    const dir = this.dir(A, D);
    const fa = A.skillFrames(this.slotOf(step.attackerSkillId));
    const fd = D.skillFrames(this.slotOf(step.defenderSkillId));

    //① 초점 · 둘 다 선딜레이
    this.rig.focus(this.chest(A), this.chest(D), dir);
    await this.wait(all(this.windup(A, A.poseFrame('dash'), dir), this.windup(D, D.poseFrame('dash'), -dir)), epoch);

    //붙는 자리. 가운데에서 서로 contactGap 만큼 떨어진다
    const midX = (A.root.position.x + D.root.position.x) / 2;
    const midZ = (A.root.position.z + D.root.position.z) / 2;
    const ax = midX - (dir * m.contactGap) / 2;
    const dx = midX + (dir * m.contactGap) / 2;

    let cardA: FlipCard | null = null;
    let cardD: FlipCard | null = null;
    //교착이면 붙은 채로 다시 뒤집는다. 처음 한 번만 달려서 다가간다
    let engaged = false;

    for (const round of step.rounds as ClashRound[]) {
      cardA ??= this.makeCard(A, round.attackerFlip);
      cardD ??= this.makeCard(D, round.defenderFlip);

      //② 달려가며 슬로우 (다시 뒤집기면 제자리에서 슬로우만)
      this.clock.setSlowMotion(c.slowScale);
      const run = engaged ? null : all(this.approach(A, ax, midZ) as Promise<void>, this.approach(D, dx, midZ) as Promise<void>);
      if (engaged) {
        A.setPose('guard');
        D.setPose('guard');
      }
      //③④ 카드 회전·띵
      await this.wait(
        this.revealCards(
          [
            { card: cardA, face: round.attackerFlip.face },
            { card: cardD, face: round.defenderFlip.face },
          ],
          epoch,
        ),
        epoch,
      );

      //⑤ 비교. 진 쪽 카드가 어두워진다. 아군이면 결과 알림
      this.showCallouts(round.callouts, [step.attackerId, step.defenderId]);
      if (round.type === 'win') this.dimCard(round.loserId === step.attackerId ? cardA : cardD);
      await this.wait(this.clock.waitReal(c.holdTime), epoch);
      if (run) await this.wait(run as Promise<void>, epoch);
      this.clock.setSlowMotion(1);

      if (round.type === 'win') {
        //이긴 라운드는 비교로 끝. 라운드 이벤트(정신력)는 여기서 현황판에 반영한다
        this.applyAll(round.events);
        break;
      }

      //교착 — 서로 맞닿아 튕긴다. 불꽃과 함께 둘 다 조금 밀리고 다시 뒤집는다
      const time = engaged ? m.reengageTime : m.dashTime * (1 - c.approachShare);
      await this.wait(all(this.dash(A, ax, midZ, time) as Promise<void>, this.dash(D, dx, midZ, time) as Promise<void>), epoch);
      this.rig.focus(this.chest(A), this.chest(D), dir);
      await this.wait(all(this.strike(A, (fa[1] ?? fa[0]) as string, dir), this.strike(D, (fd[1] ?? fd[0]) as string, -dir)), epoch);
      this.impact(this.chest(A).lerp(this.chest(D), 0.5), D, dir, 0, true, round.events);
      this.sound.play('clashTie');
      const push = (d: PaperDoll, away: number): Promise<void>[] => {
        d.setPose('guard');
        return [
          this.clock.tween(d.root.position, 'x', d.root.position.x + away * m.deadlockPush, m.knockTime, ease.outExpo),
          this.clock.tween(d.visual.position, 'x', 0, m.knockTime),
        ];
      };
      await this.wait(all(push(A, -dir), push(D, dir)), epoch);
      await this.wait(this.clock.waitGame(m.roundRest), epoch);
      engaged = true;
    }

    const f = step.finisher;
    if (f) {
      //⑥⑦ 이긴 쪽이 남은 거리를 달려 진 쪽을 친다. 진 쪽은 막는 장으로 선다
      const W = this.actor(f.winnerId).doll;
      const L = this.actor(f.loserId).doll;
      const wdir = this.dir(W, L);
      const fw = W.skillFrames(this.slotOf(f.winnerSkillId));
      //궁극기로 이겼으면 한 방을 궁극기 시간표로 바꾼다 (§10.2)
      const ultimate = this.ultimateFor(f.winnerId, f.winnerSkillId);
      if (ultimate) {
        await this.playUltimate(ultimate, W, L, f.damage, step.events, [cardA, cardD], epoch);
        return;
      }
      L.setPose('guard');
      await this.wait(this.dash(W, L.root.position.x - wdir * m.contactGap, L.root.position.z, engaged ? m.reengageTime : m.dashTime), epoch);
      this.rig.focus(this.chest(W), this.chest(L), wdir);
      //받아내기 타에 진 쪽이 파고들 장: 진 쪽 카드의 준비 장. 통합 PNG 의 맞닿는 장은 이펙트가 같이 그려져 있다 (§12.3)
      const fl = L.skillFrames(this.slotOf(f.loserId === step.attackerId ? step.attackerSkillId : step.defenderSkillId));
      await this.wait(this.playHits(W, L, fw, f.damage, step.events, [cardA, cardD], fl[0] as string, epoch), epoch);
    } else {
      //교착 한도로 끝났다. 한 방 없이 돌아간다
      this.applyAll(step.events);
      void this.fadeCard(cardA);
      void this.fadeCard(cardD);
      await this.wait(this.clock.waitReal(m.lingerAfterHit), epoch);
    }

    this.rig.release();
    await this.wait(all(this.returnHome(A) as Promise<void>, this.returnHome(D) as Promise<void>), epoch);
    this.settle(A);
    this.settle(D);
  }

  //걸음이 끝난 인형을 대기 장으로
  private settle(d: PaperDoll): void {
    if (!d.down) d.setPose('idle');
  }

  //── 궁극기 (§10.2) ──

  //이 사람이 이 카드로 궁극기 시간표를 돌리는지. 그림이 없으면 보통 한 방으로 친다
  //남의 그림을 빌려 선 사람(artAlias)은 그 그림 주인의 궁극기를 쓰지 않는다 (§9.4 · §10.2)
  private ultimateFor(combatantId: string, skillId: number): UltimateStage | null {
    if (this.slotOf(skillId) !== 'ULT') return null;
    const a = this.actors.get(combatantId);
    if (!a || a.entry.artId !== a.entry.characterId) return null;
    return this.ultimates.get(a.entry.characterId) ?? null;
  }

  //발 자리 (월드)
  private footOf(d: PaperDoll): THREE.Vector3 {
    return new THREE.Vector3(d.root.position.x + d.visual.position.x * d.root.scale.x, 0.02, d.root.position.z + 0.05);
  }

  //준비 → 전장 교체 → 컷신 → 적 뒤편 → 납도·지연 피격 → 전장 복귀. 시각은 실제 시간
  private async playUltimate(u: UltimateStage, W: PaperDoll, L: PaperDoll, damage: number, events: readonly BattleEvent[], cards: readonly (FlipCard | null)[], epoch: number): Promise<void> {
    const t = u.art.timeline;
    const m = this.config.motion;
    const start = this.clock.realNow;
    const at = (sec: number) => this.wait(this.clock.waitReal(Math.max(0, start + sec - this.clock.realNow)), epoch);
    const wdir = this.dir(W, L);
    const effect = (id: string) => W.catalog.manifest.effects.find((e) => e.id === id) ?? null;
    const spawn = (id: string, where: THREE.Vector3, options: { hold?: boolean; order?: number; roll?: number } = {}) => {
      const data = effect(id);
      const textures = u.effects.get(id);
      return data && textures ? this.effects.spawn(data, textures, where, W.facing, this.clock.realNow, options) : null;
    };

    //0 준비 장 + 발밑 밤물
    W.showFrame(u.art.frames.ready);
    const ultVoice = (key: string, at?: THREE.Vector3) => this.voice(W, this.voiceOf(W)?.ultimate[key] ?? null, at ? { at } : {});
    ultVoice('start');
    this.rig.focus(this.chest(W), this.chest(L), wdir);
    const pool = spawn(u.art.effects.pool, this.footOf(W), { hold: true, order: 9 });
    if (pool) {
      pool.material.opacity = 0;
      this.effects.fade(pool, 1, t.poolIn, this.clock.realNow);
    }

    //고유 전장으로 순간 교체
    await at(t.swapEnvironment);
    u.fade.v = 1;
    u.environment?.setOpacity(1);

    //컷신
    await at(t.cutsceneStart);
    void this.clock.waitReal(t.cutLine - t.cutsceneStart).then(() => {
      if (this.cutscene.active) ultVoice('cutLine');
    });
    //섬광 줄이기면 선을 그을 때 화면이 번쩍이지 않는다 (§15)
    this.cutscene.flash = !this.lab?.reducedFlash;
    this.cutscene.play(u.art.cutscene, { background: u.background, foreground: u.foreground, line: u.line }, this.clock.realNow, t.cutsceneEnd - t.cutsceneStart, t.cutLine - t.cutsceneStart);

    //컷신이 걷히면 적 뒤편에 납도 직전 장으로 서 있다
    await at(t.appearBehind);
    this.effects.fade(pool, 0, 0.1, this.clock.realNow);
    W.root.position.x = L.root.position.x + wdir * u.art.behindGap;
    W.root.position.z = L.root.position.z;
    W.visual.position.set(0, 0, 0);
    W.showFrame(u.art.frames.open);
    this.rig.focus(this.chest(L), this.chest(W), wdir);

    //검집이 닫히는 순간부터 여러 번 늦게 베인다. 이펙트는 적 자리에 낸다 (§10.2 v2.11)
    const cuts = u.art.slashes;
    const parts = splitDamage(damage, cuts.count);
    const h = this.config.layout.characterHeight;
    let knock: Promise<void> = Promise.resolve();
    //실험 모드: 납도 소리 → 정적 → 지연 절단(베기선·피해·물보라·소리)이 한 사건으로 온다. 베기 간격은 마지막 앞이 길다 (§15 A10)
    const lab = this.lab ? this.config.lab.ultimate : null;
    const payoff = t.sheathClick + (lab ? lab.payoffDelay : 0);
    const cutTime = (i: number): number => {
      if (!lab) return t.sheathClick + i * cuts.interval;
      let time = payoff;
      for (let j = 0; j < i; j++) time += lab.slashIntervals[Math.min(j, lab.slashIntervals.length - 1)] ?? cuts.interval;
      return time;
    };
    const beats: { time: number; run: () => void }[] = [
      {
        time: lab ? payoff : t.water,
        run: () => {
          spawn(u.art.effects.water, this.footOf(L));
          ultVoice('water', this.chest(L));
        },
      },
    ];
    if (lab) {
      beats.push({
        time: t.sheathClick,
        run: () => {
          W.showFrame(u.art.frames.closed);
          ultVoice('sheathClick', this.chest(W));
          for (const card of cards) void this.fadeCard(card);
        },
      });
    }
    for (let i = 0; i < cuts.count; i++) {
      const last = i === cuts.count - 1;
      beats.push({
        time: cutTime(i),
        run: () => {
          if (i === 0 && !lab) {
            W.showFrame(u.art.frames.closed);
            ultVoice('sheathClick');
            for (const card of cards) void this.fadeCard(card);
          }
          const [ox, oy] = cuts.offset[i % cuts.offset.length] ?? [0, 0];
          const where = this.chest(L).add(new THREE.Vector3(ox * h * W.facing, oy * h, 0));
          spawn(u.art.effects.slash, where, { roll: ((cuts.rollDeg[i % cuts.rollDeg.length] ?? 0) * Math.PI) / 180 });
          const part = parts[i] ?? 0;
          //베기선 그림이 곧 이펙트라 금속 불꽃은 내지 않는다. 0.08초 간격이라 중간 베기는 조금만 밀린다
          this.impact(this.chest(L), L, -wdir, part, false, last ? events : [], last ? damage : 0, false, last ? 'climax' : 'light');
          if (L.down) return;
          if (!last) void this.nudge(L, -wdir, m.hitKnock * cuts.nudgeShare);
          else if (damage > 0) knock = this.knockback(L, -wdir, damage, damage >= m.heavyDamage, epoch);
        },
      });
    }
    beats.sort((a, b) => a.time - b.time);
    for (const beat of beats) {
      await at(beat.time);
      beat.run();
    }

    //전장 복귀
    await at(t.restoreEnvironment);
    void this.clock.tweenReal(u.fade, 'v', 0, t.restoreFade);
    await at(t.end);
    u.environment?.setOpacity(0);
    await this.wait(knock, epoch);

    this.rig.release();
    const moved = Math.abs(L.root.position.x - L.home.x) > 0.01;
    await this.wait(all((moved ? this.returnHome(L) : this.springBack(L)) as Promise<void>, this.returnHome(W) as Promise<void>), epoch);
    this.settle(W);
    this.settle(L);
  }

  //── 매 프레임 ──

  //시간 → 몸짓·스파크(게임) → 카메라(실제) → 판 세우기 → 겹층 → 그리기
  tick(realDt: number): void {
    const gameDt = this.clock.step(realDt);
    const rect = this.canvas.getBoundingClientRect();
    this.sparks.step(gameDt, this.camera, rect.width, rect.height);
    this.dust.step(gameDt);
    //실험 모드: 대기 장만 발을 고정한 채 아주 작게 숨쉰다 (§15 A05). 사람마다 박자를 조금 어긋낸다
    if (this.lab) {
      const b = this.config.lab.breath;
      let phase = 0;
      for (const a of this.actors.values()) {
        a.doll.breath = a.doll.idle && !a.doll.down ? b.amplitude * Math.sin((this.clock.realNow / b.period + phase) * Math.PI * 2) : 0;
        phase += 0.37;
      }
    }
    this.rig.write(realDt, this.clock.realNow);
    //겹층(이름표·발밑 바)이 이번 프레임 카메라로 투영하게 행렬을 먼저 맞춘다. 안 하면 한 프레임 늦게 따라온다
    this.camera.updateMatrixWorld();
    for (const a of this.actors.values()) a.doll.faceCamera(this.camera);
    for (const [card, owner] of this.cards) card.update(this.cardAnchor(owner), this.camera);
    this.effects.update(this.clock.realNow, this.camera);
    this.cutscene.update(this.clock.realNow);
    for (const u of this.ultimates.values()) if (u.fade.v < 1 && u.fade.v > 0) u.environment?.setOpacity(u.fade.v);
    this.overlay.update(
      (id) => this.headPoint(id, 0),
      (id) => this.actors.get(id)?.doll.down ?? false,
      this.clock.realNow,
      this.config.callout.headOffset * 0.06,
      (id) => this.footPoint(id),
      (id) => {
        const a = this.actors.get(id);
        return a ? { hp: a.hp, maxHp: a.entry.maxHp, mentality: a.mentality, maxMentality: a.entry.maxMentality } : null;
      },
    );
    this.renderer.render(this.scene, this.camera);
  }

  //발 화면 좌표 (0~1). 발밑 바가 여기 붙는다 (SPEC-004 §2.2.1). 숨은 인형은 null
  private footPoint(id: string): ScreenPoint {
    const a = this.actors.get(id);
    if (!a || a.doll.hidden) return null;
    //인형 뿌리는 카메라 회전을 따라 돌아 있어서 안쪽(visual)의 밀림이 월드 x 로만 가지 않는다. 발(판 원점)의 실제 월드 자리를 쓴다
    a.doll.root.updateMatrixWorld(true);
    const p = a.doll.visual.getWorldPosition(new THREE.Vector3()).project(this.camera);
    if (p.z > 1) return null;
    return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
  }

  //머리 위 화면 좌표 (0~1). lift 는 캐릭터 키 비율로 더 올린다
  private headPoint(id: string, lift: number): ScreenPoint {
    const a = this.actors.get(id);
    if (!a || a.doll.hidden) return null;
    const d = a.doll;
    const h = this.config.layout.characterHeight;
    const p = new THREE.Vector3(d.root.position.x + d.visual.position.x * d.root.scale.x, h * (1.05 + lift) + d.visual.position.y, d.root.position.z).project(this.camera);
    if (p.z > 1) return null;
    return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
  }

  //현황판 값
  snapshot(): ActorSnapshot[] {
    return [...this.actors.values()].map((a) => ({
      combatantId: a.entry.combatantId,
      name: a.entry.name,
      side: a.entry.side,
      hp: { value: a.hp, max: a.entry.maxHp },
      mentality: { value: a.mentality, max: a.entry.maxMentality },
      down: a.doll.down,
    }));
  }

  //화면 좌표(클라이언트 px)로 사람을 찾는다. 판 전체를 맞는 것으로 친다 (§9.6)
  hitTest(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = [...this.actors.values()].filter((a) => !a.doll.down && !a.doll.hidden).map((a) => a.doll.pickTarget).filter((t): t is THREE.Object3D => t !== null);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    return hit ? ((hit.object.userData['combatantId'] as string | undefined) ?? null) : null;
  }

  setSelection(selection: Selection3d): void {
    this.overlay.setSelection(selection);
  }

  //이름표 아래 한 줄 (적이 노리는 대상 등)
  setNote(combatantId: string, text: string): void {
    this.overlay.setNote(combatantId, text);
  }

  //연출 실험 모드를 켜고 끈다 (SPEC-005 §15)
  setLab(options: LabOptions | null): void {
    this.lab = options ? { ...options } : null;
    if (!this.lab) for (const a of this.actors.values()) a.doll.breath = 0;
  }

  //배속을 알린다. 소리를 앞당겨 예약할 때 쓴다
  setSpeed(speed: number): void {
    this.speed = speed;
  }

  //배경 밝기를 전투 배경·고유 전장에 같이 쓴다
  applyBrightness(value: number): void {
    this.backdrop.setBrightness(value);
    for (const u of this.ultimates.values()) u.environment?.setBrightness(value);
  }

  //배경 정보 억제·암부 (§15 F04·C04). 배경만 잠깐 눌렀다 푼다. 인물·카드·바는 그대로
  private async dimBackdrop(): Promise<void> {
    const d = this.config.lab.dim;
    const token = ++this.dimToken;
    await this.clock.tweenReal(this.dimKnob, 'v', d.level, d.in);
    await this.clock.waitReal(d.hold);
    if (token !== this.dimToken) return;
    await this.clock.tweenReal(this.dimKnob, 'v', 1, d.out);
  }

  //임팩트 프레임 (§15 C01). 인물은 검은 실루엣, 배경은 밝은 면으로 아주 잠깐 바꾼다. 궁극기 마지막 베기에만 쓴다
  private async impactFrame(): Promise<void> {
    const roots = [this.backdrop.root, ...[...this.ultimates.values()].flatMap((u) => (u.environment ? [u.environment.root] : []))];
    const shown = roots.map((r) => r.visible);
    for (const r of roots) r.visible = false;
    const background = this.scene.background;
    this.scene.background = new THREE.Color(0xe9e4da);
    for (const a of this.actors.values()) a.doll.setTint(0x000000);
    await this.clock.waitReal(this.config.lab.impactFrame.seconds);
    roots.forEach((r, i) => (r.visible = shown[i] ?? r.visible));
    this.scene.background = background;
    for (const a of this.actors.values()) a.doll.setTint(0xffffff);
  }

  //발밑 궁극기 칸 (SPEC-004 §2.2.1)
  setGauge(combatantId: string, gauge: UltimateGauge | null): void {
    this.overlay.setGauge(combatantId, gauge);
  }
}

//걸음이 들고 있는 이벤트 전부
function stepEvents(step: Exclude<StageStep, { kind: 'state' }>): BattleEvent[] {
  if (step.kind === 'oneSided') return step.events;
  return [...step.rounds.flatMap((r) => r.events), ...step.events];
}

//고유 전장 층을 그리는 순서대로 한 장에 합친다. 궁극기 컷신 배경이다 (SPEC-005 §10.2)
function composeBackdrop(config: BackdropConfig, images: Map<string, HTMLImageElement>): HTMLCanvasElement {
  const [w, h] = config.viewport;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  for (const layer of [...config.layers].sort((a, b) => a.order - b.order)) {
    const image = images.get(layer.file);
    if (!image) continue;
    const r = image.naturalWidth > 0 ? image.naturalWidth / w : 1;
    if (layer.draws.length > 0) {
      for (const d of layer.draws) {
        const [sx, sy, sw, sh] = d.source;
        ctx.drawImage(image, sx * r, sy * r, sw * r, sh * r, ...d.destination);
      }
    } else {
      const [x, y, rw, rh] = layer.rect;
      ctx.drawImage(image, x * w, y * h, rw * w, rh * h);
    }
  }
  return canvas;
}
