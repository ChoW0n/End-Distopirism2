//웹 3D 무대 본체 (SPEC-005 §9). 걸음(StageStep)을 하나씩 받아 종이 인형 타임라인으로 재생한다
//
//시간 규칙: 인형 몸짓·스파크는 게임 시간(역경직에 멈춤), 카메라·대기열·알림은 실제 시간
//쓰는 곳 규칙: 카메라는 CameraRig.write, 시간 배율은 Clock 안에서만 쓴다

import * as THREE from 'three';
import type { BattleEvent, CardFace, Side, SkillSlot } from '../domain/types.js';
import type { ClashRound, FlipView, StageStep, StepCallout } from '../render/exchange.js';
import type { SpriteCatalog } from '../render/manifest.js';
import type { SoundPlayer } from '../renderer/sound.js';
import { Backdrop } from './backdrop.js';
import { CameraRig } from './camera.js';
import { FlipCard } from './card.js';
import { all, Clock, ease } from './clock.js';
import type { BackdropConfig, Stage3dConfig } from './config.js';
import { frameTexture, PaperDoll } from './doll.js';
import { Overlay, type ScreenPoint, type Selection3d } from './overlay.js';
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

//카드 테두리 진영 색. 이름표·결과 알림의 진영 색과 같다 (SPEC-004 §11)
const CARD_TINT = { ally: '#6f9bbd', enemy: '#b3262b' } as const;

//재시작하면 도는 타임라인을 끊는다
class Aborted extends Error {}

export class Stage3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly rig: CameraRig;
  private readonly clock = new Clock();
  private readonly sparks: SparkField;
  private readonly overlay: Overlay;
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
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene.background = new THREE.Color(0x0e0c0b);
    const backdrop = new Backdrop(this.scene, backdropConfig);
    backdrop.build(backdropImages);
    this.foreground = backdrop.combatHidden;
    this.camera = new THREE.PerspectiveCamera(backdrop.fov, canvas.width / canvas.height, 0.1, 300);
    this.rig = new CameraRig(this.camera, backdrop.homePosition, backdrop.homeLookAt, backdrop.fov, config.camera, config.shake);
    this.sparks = new SparkField(this.scene, config.sparks);
    this.overlay = new Overlay(host);
    this.resize();
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
    this.overlay.clear();
    for (const card of this.cards.keys()) card.dispose();
    this.cards.clear();
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
    this.sound.play('dash');
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

  //충돌 장 뒤로 남은 장을 넘긴다. 첫 장을 peakShare 만큼 붙잡는다
  private async trail(d: PaperDoll, frames: readonly string[], epoch: number): Promise<void> {
    const rest = frames.slice(2);
    if (rest.length === 0) return;
    const m = this.config.motion;
    const peak = m.strikeTrailTime * m.strikeTrailPeakShare;
    const step = (m.strikeTrailTime - peak) / rest.length;
    await this.wait(this.clock.waitGame(peak), epoch);
    for (const f of rest) {
      if (d.down) return;
      d.showFrame(f);
      await this.wait(this.clock.waitGame(step), epoch);
    }
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

  //맞는 순간. 스파크·역경직·카메라·소리·현황판·피해 숫자
  private impact(contact: THREE.Vector3, target: PaperDoll, dir: number, damage: number, clash: boolean, events: readonly BattleEvent[]): void {
    const s = this.config.shake;
    const h = this.config.hitStop;
    const heavy = damage >= this.config.motion.heavyDamage;
    this.sparks.burst(contact, dir, clash, 10);
    const seconds = clash && damage <= 0 ? h.clashSeconds : Math.min(h.maxSeconds, h.baseSeconds + damage * h.perDamageSeconds);
    this.clock.startHitStop(seconds, h.scale);
    this.rig.impact(damage > 0 ? Math.min(1, damage / s.damageForMaxShake) : s.clashPower, dir);
    this.sound.play(damage <= 0 ? 'clash' : heavy ? 'hitHeavy' : 'hit');
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
    this.sound.play('dash');
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
    await this.wait(this.windup(a, frames[0] as string, dir), epoch);

    //② 달려가며 슬로우 → ③④ 카드 회전·띵 → ⑤ 비교
    const card = this.makeCard(a, step.flip);
    this.clock.setSlowMotion(c.slowScale);
    const run = this.approach(a, toX, toZ);
    await this.wait(this.revealCards([{ card, face: step.flip.face }], epoch), epoch);
    this.showCallouts(step.callouts, [step.attackerId]);
    await this.wait(this.clock.waitReal(c.holdTime), epoch);
    await this.wait(run as Promise<void>, epoch);
    //⑥ 슬로우가 풀리고 남은 거리를 달린다
    this.clock.setSlowMotion(1);
    await this.wait(this.dash(a, toX, toZ, m.dashTime * (1 - c.approachShare)), epoch);
    this.rig.focus(this.chest(a), this.chest(d), dir);

    //⑦ 한 방
    await this.wait(this.strike(a, (frames[1] ?? frames[0]) as string, dir), epoch);
    const contact = this.chest(a).lerp(this.chest(d), this.config.sparks.contactBias);
    this.impact(contact, d, dir, step.damage, false, step.events);
    void this.fadeCard(card);
    const trail = this.trail(a, frames, epoch);
    const jobs: Promise<unknown>[] = [this.clock.tween(a.visual.position, 'x', 0, m.knockTime)];
    if (step.damage > 0 && !d.down) jobs.push(this.knockback(d, dir, step.damage, step.damage >= m.heavyDamage, epoch));
    await this.wait(all(...(jobs as Promise<void>[])), epoch);
    await this.wait(this.clock.waitReal(m.lingerAfterHit), epoch);
    await this.wait(trail, epoch);

    this.rig.release();
    await this.wait(all(this.springBack(d) as Promise<void>, this.returnHome(a) as Promise<void>), epoch);
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
    await this.wait(all(this.windup(A, fa[0] as string, dir), this.windup(D, fd[0] as string, -dir)), epoch);

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
      const run = engaged ? null : all(this.approach(A, ax, midZ), this.approach(D, dx, midZ));
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
      L.setPose('guard');
      await this.wait(this.dash(W, L.root.position.x - wdir * m.contactGap, L.root.position.z, engaged ? m.reengageTime : m.dashTime), epoch);
      this.rig.focus(this.chest(W), this.chest(L), wdir);
      await this.wait(this.strike(W, (fw[1] ?? fw[0]) as string, wdir), epoch);
      const contact = this.chest(W).lerp(this.chest(L), this.config.sparks.contactBias);
      this.impact(contact, L, wdir, f.damage, false, step.events);
      void this.fadeCard(cardA);
      void this.fadeCard(cardD);
      const trail = this.trail(W, fw, epoch);
      const jobs: Promise<void>[] = [this.clock.tween(W.visual.position, 'x', 0, m.knockTime)];
      if (f.damage > 0 && !L.down) jobs.push(this.knockback(L, wdir, f.damage, f.damage >= m.heavyDamage, epoch));
      await this.wait(all(jobs), epoch);
      await this.wait(this.clock.waitReal(m.lingerAfterHit), epoch);
      await this.wait(trail, epoch);
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

  //── 매 프레임 ──

  //시간 → 몸짓·스파크(게임) → 카메라(실제) → 판 세우기 → 겹층 → 그리기
  tick(realDt: number): void {
    const gameDt = this.clock.step(realDt);
    const rect = this.canvas.getBoundingClientRect();
    this.sparks.step(gameDt, this.camera, rect.width, rect.height);
    this.rig.write(realDt, this.clock.realNow);
    for (const a of this.actors.values()) a.doll.faceCamera(this.camera);
    for (const [card, owner] of this.cards) card.update(this.cardAnchor(owner), this.camera);
    this.overlay.update(
      (id) => this.headPoint(id, 0),
      (id) => this.actors.get(id)?.doll.down ?? false,
      this.clock.realNow,
      this.config.callout.headOffset * 0.06,
    );
    this.renderer.render(this.scene, this.camera);
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
}

//걸음이 들고 있는 이벤트 전부
function stepEvents(step: Exclude<StageStep, { kind: 'state' }>): BattleEvent[] {
  if (step.kind === 'oneSided') return step.events;
  return [...step.rounds.flatMap((r) => r.events), ...step.events];
}
