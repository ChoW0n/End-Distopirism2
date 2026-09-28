//웹 3D 무대 본체 (SPEC-005 §9). 걸음(StageStep)을 하나씩 받아 종이 인형 타임라인으로 재생한다
//
//시간 규칙: 인형 몸짓·스파크는 게임 시간(역경직에 멈춤), 카메라·대기열·알림은 실제 시간
//쓰는 곳 규칙: 카메라는 CameraRig.write, 시간 배율은 Clock 안에서만 쓴다

import * as THREE from 'three';
import type { BattleEvent, Side, SkillSlot } from '../domain/types.js';
import type { ClashRound, StageStep, StepCallout } from '../render/exchange.js';
import type { SpriteCatalog } from '../render/manifest.js';
import type { SoundPlayer } from '../renderer/sound.js';
import { Backdrop } from './backdrop.js';
import { CameraRig } from './camera.js';
import { all, Clock, ease } from './clock.js';
import type { BackdropConfig, Stage3dConfig } from './config.js';
import { frameTexture, PaperDoll } from './doll.js';
import { Overlay, type ScreenPoint, type Selection3d } from './overlay.js';
import { SparkField } from './sparks.js';

//무대에 세울 사람 한 명
export interface RosterEntry {
  combatantId: string;
  characterId: string;
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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    host: HTMLElement,
    private readonly config: Stage3dConfig,
    backdropConfig: BackdropConfig,
    backdropImages: Map<string, HTMLImageElement>,
    private readonly sprites: Map<string, SpriteCatalog>,
    private readonly frameImages: (characterId: string, file: string) => HTMLImageElement | null,
    private readonly slotOf: (skillId: number) => SkillSlot,
    private readonly sound: SoundPlayer,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene.background = new THREE.Color(0x0e0c0b);
    const backdrop = new Backdrop(this.scene, backdropConfig);
    backdrop.build(backdropImages);
    this.camera = new THREE.PerspectiveCamera(backdrop.fov, canvas.width / canvas.height, 0.1, 300);
    this.rig = new CameraRig(this.camera, backdrop.homePosition, backdrop.homeLookAt, backdrop.fov, config.camera, config.shake);
    this.sparks = new SparkField(this.scene, config.sparks);
    this.overlay = new Overlay(host);
    this.resize();
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
    for (const frame of catalog.manifest.frames) {
      const image = this.frameImages(characterId, frame.file);
      if (image) out.set(frame.id, frameTexture(image, frame, this.config.layout.textureMaxSide));
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
    for (const actor of this.actors.values()) this.scene.remove(actor.doll.root);
    this.actors.clear();

    const layout = this.config.layout;
    const index = { ally: 0, enemy: 0 };
    for (const entry of roster) {
      const catalog = this.sprites.get(entry.characterId);
      const textures = this.texturesOf(entry.characterId);
      //그림이 없는 캐릭터는 3D 에 세우지 않는다. 남의 그림을 대신 쓰지 않는다 (§9.4)
      if (!catalog || !textures) continue;
      const row = index[entry.side]++;
      const sign = entry.side === 'ally' ? -1 : 1;
      const doll = new PaperDoll(entry.combatantId, catalog, textures, this.worldPerPixel.get(entry.characterId) ?? 1, 10 + row);
      doll.home.set(sign * (layout.sideHalfGap + row * layout.rowOutward), 0, -row * layout.rowDepth);
      doll.setFacing(entry.side === 'ally' ? 1 : -1);
      doll.reset();
      this.scene.add(doll.root);
      this.actors.set(entry.combatantId, { entry, doll, hp: entry.hp, mentality: entry.mentality });
    }
    this.overlay.setActors(roster.filter((r) => this.actors.has(r.combatantId)));
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
        if (step.kind === 'oneSided') await this.playOneSided(step, epoch);
        else if (step.kind === 'clash') await this.playClash(step, epoch);
        else this.applyState(step.event);
      }
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
    const fade = {
      get v(): number {
        return d.opacityValue;
      },
      set v(x: number) {
        d.setOpacity(x);
      },
    };
    await this.wait(
      all(this.clock.tween(d.visual.position, 'y', -m.downSink, m.downTime, ease.outCubic), this.clock.tween(fade, 'v', m.downOpacity, m.downTime)),
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

  //── 걸음 재생 (§9.3) ──

  private async playOneSided(step: Extract<StageStep, { kind: 'oneSided' }>, epoch: number): Promise<void> {
    const a = this.actor(step.attackerId).doll;
    const d = this.actor(step.targetId).doll;
    const m = this.config.motion;
    const dir = this.dir(a, d);
    const frames = a.skillFrames(this.slotOf(step.skillId));

    this.rig.focus(this.chest(a), this.chest(d), dir);
    await this.wait(this.windup(a, frames[0] as string, dir), epoch);
    this.showCallouts(step.callouts, [step.attackerId]);
    await this.wait(this.dash(a, d.root.position.x - dir * m.contactGap, d.root.position.z, m.dashTime), epoch);
    this.rig.focus(this.chest(a), this.chest(d), dir);
    await this.wait(this.strike(a, (frames[1] ?? frames[0]) as string, dir), epoch);

    const contact = this.chest(a).lerp(this.chest(d), this.config.sparks.contactBias);
    this.impact(contact, d, dir, step.damage, false, step.events);
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
    const dir = this.dir(A, D);
    const fa = A.skillFrames(this.slotOf(step.attackerSkillId));
    const fd = D.skillFrames(this.slotOf(step.defenderSkillId));

    this.rig.focus(this.chest(A), this.chest(D), dir);
    await this.wait(all(this.windup(A, fa[0] as string, dir), this.windup(D, fd[0] as string, -dir)), epoch);

    //붙는 자리. 가운데에서 서로 contactGap 만큼 떨어진다
    const midX = (A.root.position.x + D.root.position.x) / 2;
    const midZ = (A.root.position.z + D.root.position.z) / 2;
    const ax = midX - (dir * m.contactGap) / 2;
    const dx = midX + (dir * m.contactGap) / 2;

    for (let i = 0; i < step.rounds.length; i++) {
      const round = step.rounds[i] as ClashRound;
      this.showCallouts(round.callouts, [step.attackerId, step.defenderId]);
      const time = i === 0 ? m.dashTime : m.reengageTime;
      await this.wait(all(this.dash(A, ax, midZ, time) as Promise<void>, this.dash(D, dx, midZ, time) as Promise<void>), epoch);
      this.rig.focus(this.chest(A), this.chest(D), dir);
      await this.wait(all(this.strike(A, (fa[1] ?? fa[0]) as string, dir), this.strike(D, (fd[1] ?? fd[0]) as string, -dir)), epoch);
      const contact = this.chest(A).lerp(this.chest(D), 0.5);
      this.impact(contact, D, dir, 0, true, round.events);
      this.sound.play(round.type === 'deadlock' ? 'clashTie' : 'clash');

      //진 쪽이 밀린다. 교착이면 둘 다 조금 밀린다
      const pushes: Promise<void>[] = [];
      const push = (d: PaperDoll, away: number, distance: number): void => {
        d.setPose('guard');
        pushes.push(this.clock.tween(d.root.position, 'x', d.root.position.x + away * distance, m.knockTime, ease.outExpo));
        pushes.push(this.clock.tween(d.visual.position, 'x', 0, m.knockTime));
      };
      if (round.type === 'win') {
        const loser = round.loserId === step.attackerId ? A : D;
        const winner = loser === A ? D : A;
        push(loser, loser === A ? -dir : dir, m.clashPush);
        pushes.push(this.clock.tween(winner.visual.position, 'x', 0, m.knockTime));
      } else {
        push(A, -dir, m.deadlockPush);
        push(D, dir, m.deadlockPush);
      }
      await this.wait(all(pushes), epoch);
      await this.wait(this.clock.waitGame(m.roundRest), epoch);
    }

    const f = step.finisher;
    if (f) {
      //이긴 쪽이 진 쪽을 친다
      const W = this.actor(f.winnerId).doll;
      const L = this.actor(f.loserId).doll;
      const wdir = this.dir(W, L);
      const fw = W.skillFrames(this.slotOf(f.winnerSkillId));
      await this.wait(this.dash(W, L.root.position.x - wdir * m.contactGap, L.root.position.z, m.reengageTime), epoch);
      await this.wait(this.strike(W, (fw[1] ?? fw[0]) as string, wdir), epoch);
      const contact = this.chest(W).lerp(this.chest(L), this.config.sparks.contactBias);
      this.impact(contact, L, wdir, f.damage, false, step.events);
      const trail = this.trail(W, fw, epoch);
      const jobs: Promise<void>[] = [this.clock.tween(W.visual.position, 'x', 0, m.knockTime)];
      if (f.damage > 0 && !L.down) jobs.push(this.knockback(L, wdir, f.damage, f.damage >= m.heavyDamage, epoch));
      await this.wait(all(jobs), epoch);
      await this.wait(this.clock.waitReal(m.lingerAfterHit), epoch);
      await this.wait(trail, epoch);
    } else {
      this.applyAll(step.events);
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
    if (!a) return null;
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
    const targets = [...this.actors.values()].filter((a) => !a.doll.down).map((a) => a.doll.pickTarget).filter((t): t is THREE.Object3D => t !== null);
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
