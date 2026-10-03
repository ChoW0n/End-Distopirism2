//웹 3D 전투 화면 입구 (SPEC-005 §9). 도메인 → 교환 묶기 → 3D 무대를 여기서 한 번만 엮는다
//
//규칙은 src/domain, 걸음 묶기는 src/render/exchange.ts, 그림과 시간은 Stage3D 가 맡는다.
//명령 패널·현황판·단축키는 2D 화면과 같은 DOM 을 그대로 쓴다. 이 파일은 배선만 한다

import { WeightedEnemyAi, type EnemyAiContext } from '../domain/ai.js';
import { Battle, type BattleOrder } from '../domain/battle.js';
import { ClashResolver } from '../domain/clash.js';
import { BattleCatalog, parseBattleData } from '../domain/data.js';
import { createSeededRng, type Rng } from '../domain/rng.js';
import type { BattleEvent, Side } from '../domain/types.js';
import { ultimateStage, type GaugeLayout } from '../render/arc-gauge.js';
import { toStageSteps } from '../render/exchange.js';
import { showcaseCycle, type ShowcaseCard } from '../render/showcase.js';
import type { SpriteCatalog } from '../render/manifest.js';
import { parseEnvVfx, usedAtlases, type EnvVfx } from '../render/envvfx.js';
import { parseCharacterSounds, type CharacterSounds } from '../render/sounds.js';
import { parseUltimateArt, type UltimateArt } from '../render/ultimate.js';
import type { UiData } from '../ui/data.js';
import { cardView, OrderInput, type InputMember } from '../ui/input.js';
import { loadCharacter, loadIndex, loadUi } from '../renderer/assets.js';
import { CommandPanel } from '../renderer/command-panel.js';
import { SynthSound } from '../renderer/sound.js';
import { parseBackdropConfig, parseStage3dConfig, type BackdropConfig, type BattleSetup, type Stage3dConfig } from './config.js';
import type { CardPlates } from './card.js';
import { Stage3D, type EnvFxBundle, type RosterEntry, type UltimateBundle } from './stage.js';
import { bindFullscreen } from './fullscreen.js';

const view = document.getElementById('view') as HTMLCanvasElement | null;
const ASSETS = view?.dataset['assets'] ?? '../assets';
const DATA = view?.dataset['battle'] ?? '../docs/battle-data.json';

async function json(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} 를 읽을 수 없다 (${response.status})`);
  return response.json();
}

//비트맵 하나. 실패하면 null 이고 화면에서 빠진다
function image(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => resolve(null);
    element.src = url;
  });
}

interface Boot {
  catalog: BattleCatalog;
  ui: UiData;
  stage: Stage3dConfig;
  backdrop: BackdropConfig;
  backdropImages: Map<string, HTMLImageElement>;
  sprites: Map<string, SpriteCatalog>;
  frames: Map<string, HTMLImageElement>;
  ultimates: Map<string, UltimateBundle>;
  //캐릭터 id → 녹음 소리 묶음과 받은 파일 (SPEC-005 §14)
  voices: Map<string, CharacterSounds>;
  samples: Map<string, ArrayBuffer>;
  //공용 환경 이펙트 (SPEC-005 §16). 데이터를 못 읽으면 null 이고 이펙트 없이 간다
  envFx: EnvFxBundle | null;
  missing: string[];
}

//데이터와 그림을 받아 온다. 3D 는 인형 장과 배경만 쓴다 (캐릭터 이펙트는 2단계, §9.7)
async function boot(progress: (text: string, ratio: number) => void): Promise<Boot> {
  const [rawBattle, ui, rawStage] = await Promise.all([json(DATA), loadUi(ASSETS), json(`${ASSETS}/ui/stage3d.json`)]);
  const catalog = new BattleCatalog(parseBattleData(rawBattle));
  const stage = parseStage3dConfig(rawStage);
  //배경 폴더는 대진 설정이 정한다 (제3 수문 = map-gate3)
  const mapDir = stage.battle.map;
  const backdrop = parseBackdropConfig(await json(`${ASSETS}/${mapDir}/placement.json`));
  const drawn = await loadIndex(ASSETS);

  const sprites = new Map<string, SpriteCatalog>();
  await Promise.all(
    catalog.data.characters.map(async (character) => {
      if (!drawn.has(character.id)) return;
      const loaded = await loadCharacter(ASSETS, character.id);
      if (loaded) sprites.set(character.id, loaded);
    }),
  );

  //궁극기 시간표가 있는 캐릭터 (assets/index.json 의 ultimates). 없는 파일을 찔러 404 를 내지 않는다 (SPEC-004 §12)
  const index = (await json(`${ASSETS}/index.json`)) as Record<string, unknown>;
  const ultimateIds = Array.isArray(index['ultimates']) ? (index['ultimates'] as unknown[]).filter((id): id is string => typeof id === 'string') : [];
  const arts = new Map<string, { art: UltimateArt; environment: BackdropConfig | null }>();
  await Promise.all(
    ultimateIds
      .filter((id) => sprites.has(id))
      .map(async (id) => {
        const art = parseUltimateArt(await json(`${ASSETS}/${id}/ultimate.json`));
        const environment = art.environment ? parseBackdropConfig(await json(`${ASSETS}/${art.environment}/placement.json`)) : null;
        arts.set(id, { art, environment });
      }),
  );

  //녹음 소리가 있는 캐릭터 (assets/index.json 의 sounds). 소리는 그림과 따로 받는다. 못 받아도 전투는 된다
  const soundIds = Array.isArray(index['sounds']) ? (index['sounds'] as unknown[]).filter((id): id is string => typeof id === 'string') : [];
  const voices = new Map<string, CharacterSounds>();
  const samples = new Map<string, ArrayBuffer>();
  await Promise.all(
    soundIds
      .filter((id) => sprites.has(id))
      .map(async (id) => {
        const voice = parseCharacterSounds(await json(`${ASSETS}/${id}/sounds.json`));
        voices.set(id, voice);
        await Promise.all(
          Object.entries(voice.files).map(async ([soundId, file]) => {
            try {
              const res = await fetch(`${ASSETS}/${id}/${file}`);
              if (res.ok) samples.set(`${id}/${soundId}`, await res.arrayBuffer());
            } catch {
              //소리 파일이 없으면 그 소리만 빠진다
            }
          }),
        );
      }),
  );

  //공용 환경 이펙트 데이터. 바인딩이 쓰는 아틀라스만 그림 목록에 넣는다
  let envVfx: EnvVfx | null = null;
  try {
    envVfx = parseEnvVfx(await json(`${ASSETS}/env-vfx/metadata/manifest.json`), await json(`${ASSETS}/env-vfx/metadata/camera-presets.json`), await json(`${ASSETS}/env-vfx/bindings.json`));
  } catch {
    envVfx = null;
  }

  //받을 파일 목록. 진행률을 보여 준다 (SPEC-004 §12)
  const jobs: { key: string; url: string }[] = [];
  for (const layer of backdrop.layers) jobs.push({ key: `${mapDir}/${layer.file}`, url: `${ASSETS}/${mapDir}/${layer.file}` });
  for (const [id, sprite] of sprites) {
    for (const frame of sprite.manifest.frames) jobs.push({ key: `${id}/${frame.file}`, url: `${ASSETS}/${id}/${frame.file}` });
  }
  //궁극기 이펙트 장·컷신·고유 전장 층
  for (const [id, { art, environment }] of arts) {
    const effectIds = new Set(Object.values(art.effects));
    const files = new Set<string>([art.cutscene.foreground, art.cutscene.line]);
    for (const effect of sprites.get(id)?.manifest.effects ?? []) if (effectIds.has(effect.id)) for (const f of effect.frames) files.add(f.file);
    for (const file of files) jobs.push({ key: `${id}/${file}`, url: `${ASSETS}/${id}/${file}` });
    if (art.environment && environment) for (const layer of environment.layers) jobs.push({ key: `${art.environment}/${layer.file}`, url: `${ASSETS}/${art.environment}/${layer.file}` });
  }
  for (const file of envVfx ? usedAtlases(envVfx) : []) jobs.push({ key: `env-vfx/${file}`, url: `${ASSETS}/env-vfx/${file}` });
  let done = 0;
  const loaded = new Map<string, HTMLImageElement>();
  const missing: string[] = [];
  progress(`그림 0 / ${jobs.length}`, 0);
  await Promise.all(
    jobs.map(async (job) => {
      const bitmap = await image(job.url);
      if (bitmap) loaded.set(job.key, bitmap);
      else missing.push(job.key);
      done += 1;
      progress(`그림 ${done} / ${jobs.length}`, done / jobs.length);
    }),
  );

  const backdropImages = new Map<string, HTMLImageElement>();
  for (const layer of backdrop.layers) {
    const found = loaded.get(`${mapDir}/${layer.file}`);
    if (found) backdropImages.set(layer.file, found);
  }
  const ultimates = new Map<string, UltimateBundle>();
  for (const [id, { art, environment }] of arts) {
    const envImages = new Map<string, HTMLImageElement>();
    if (art.environment && environment) {
      for (const layer of environment.layers) {
        const found = loaded.get(`${art.environment}/${layer.file}`);
        if (found) envImages.set(layer.file, found);
      }
    }
    ultimates.set(id, {
      art,
      environment: environment ? { config: environment, images: envImages } : null,
      image: (file) => loaded.get(`${id}/${file}`) ?? null,
    });
  }
  const envImages = new Map<string, HTMLImageElement>();
  for (const file of envVfx ? usedAtlases(envVfx) : []) {
    const found = loaded.get(`env-vfx/${file}`);
    if (found) envImages.set(file, found);
  }
  const envFx = envVfx && envImages.size > 0 ? { vfx: envVfx, images: envImages } : null;
  return { catalog, ui, stage, backdrop, backdropImages, sprites, frames: loaded, ultimates, voices, samples, envFx, missing };
}

//전투 한 판을 들고 있는 통. 재시작하면 통째로 갈아 끼운다
class Session {
  readonly battle: Battle;
  private readonly ai = new WeightedEnemyAi();
  private readonly aiContext: EnemyAiContext;

  constructor(
    private readonly catalog: BattleCatalog,
    rng: Rng,
    private readonly setup: BattleSetup,
  ) {
    const roster = (side: Side, ids: readonly string[]) =>
      ids.map((characterId, i) => ({ id: `${side === 'ally' ? 'a' : 'e'}${i + 1}`, characterId, side }));
    this.battle = new Battle(catalog, roster('ally', setup.ally), roster('enemy', setup.enemy), { rng, enemyAi: this.ai });
    const resolver = new ClashResolver(catalog, rng);
    this.aiContext = { catalog, resolver, rng };
  }

  //무대에 세울 사람들
  roster(): RosterEntry[] {
    return this.battle.combatants.map((c) => {
      const alias = this.setup.artAlias[c.base.id];
      return {
        combatantId: c.id,
        characterId: c.base.id,
        artId: alias ?? c.base.id,
        //남의 그림을 세우면 이름표에 자리 표시라고 적는다
        name: alias ? `${c.base.name} · 자리 표시` : c.base.name,
        side: c.side,
        hp: c.hp,
        maxHp: c.base.maxHp,
        mentality: c.mentality,
        maxMentality: this.catalog.rules.mentalityMax,
      };
    });
  }

  inputAllies(): (InputMember & { name: string })[] {
    return this.battle
      .sideOf('ally')
      .filter((c) => !c.isDefeated)
      .map((c) => ({ id: c.id, characterId: c.base.id, deck: [...c.deck], name: c.base.name }));
  }

  inputEnemies(): { id: string; name: string }[] {
    return this.battle
      .sideOf('enemy')
      .filter((c) => !c.isDefeated)
      .map((c) => ({ id: c.id, name: c.base.name }));
  }

  //자동 관전일 때 아군도 적과 같은 AI 로 둔다
  autoOrders(enemyTargets: Map<string, string>): BattleOrder[] {
    const enemies = this.battle.sideOf('enemy').filter((c) => !c.isDefeated);
    const orders: BattleOrder[] = [];
    const taken = new Set<string>();
    for (const ally of this.battle.sideOf('ally')) {
      if (ally.isDefeated || enemies.length === 0) continue;
      const targetId = this.ai.chooseTarget(ally, enemies, taken, this.aiContext);
      taken.add(targetId);
      const target = this.battle.combatant(targetId);
      const skillId = this.ai.chooseSkill(ally, { target, isClash: enemyTargets.get(targetId) === ally.id, opponentSkillId: null }, this.aiContext);
      orders.push({ actorId: ally.id, targetId, skillId });
    }
    return orders;
  }
}

//UI 상자 기준 단위 (SPEC-004 §13.1). 1920x1080 상자를 창에 맞춰 줄이는 배율을 CSS 에 적는다
const UI_WIDTH = 1920;
const UI_HEIGHT = 1080;
function layoutUi(): number {
  const u = Math.min(window.innerWidth / UI_WIDTH, window.innerHeight / UI_HEIGHT);
  document.documentElement.style.setProperty('--u', String(u));
  return u;
}

//캔버스 기준 비율 구역 (0~1)
function fraction(rect: DOMRect, canvas: DOMRect): { left: number; right: number; top: number; bottom: number } {
  const w = Math.max(1, canvas.width);
  const h = Math.max(1, canvas.height);
  return {
    left: Math.max(0, (rect.left - canvas.left) / w),
    right: Math.min(1, (rect.right - canvas.left) / w),
    top: Math.max(0, (rect.top - canvas.top) / h),
    bottom: Math.min(1, (rect.bottom - canvas.top) / h),
  };
}

async function main(): Promise<void> {
  layoutUi();
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const host = canvas.parentElement as HTMLElement;
  const status = document.getElementById('status') as HTMLElement;
  const turnLabel = document.getElementById('turn') as HTMLElement;
  const seedInput = document.getElementById('seed') as HTMLInputElement;
  const modeSelect = document.getElementById('mode') as HTMLSelectElement | null;
  const autoNext = document.getElementById('autonext') as HTMLInputElement | null;
  const loading = document.getElementById('loading');
  const loadingBar = document.getElementById('loading-bar');
  const loadingText = document.getElementById('loading-text');
  let speed = 1;
  status.textContent = '불러오는 중…';

  const loaded = await boot((text, ratio) => {
    if (loadingText) loadingText.textContent = text;
    if (loadingBar) loadingBar.style.width = `${Math.round(ratio * 100)}%`;
  });
  //UI 묶음 v4 (SPEC-004 §14). 작은 버튼 판이 들어오면 판을 씌운다. 없으면 임시 도형 그대로
  const kit = `${ASSETS}/ui/kit`;
  const display = loaded.ui.display;
  const [kitProbe, plateFront, plateBack, markGlyph, insightGlyph, resolveGlyph] = await Promise.all(
    ['U3_small_default', 'U15_overhead_front', 'U15_overhead_back', 'R_mark', 'R_insight', 'R_resolve'].map((name) => image(`${kit}/${name}.png`)),
  );
  //카일 완성 카드 K 머리 위 판. cardKit 에 있는 (캐릭터, 기술)만 (§14.8)
  const completePlates = new Map<string, CardPlates>();
  await Promise.all(
    Object.entries(display.cardKit).flatMap(([characterId, names]) =>
      Object.keys(names).map(async (id) => {
        const [front, back] = await Promise.all([image(`${kit}/K${id}_overhead_front.png`), image(`${kit}/K${id}_overhead_back.png`)]);
        if (front && back) completePlates.set(`${characterId}/${id}`, { front, back, complete: true });
      }),
    ),
  );
  //발밑 반원 게이지 경로 (§14.3). 그림이 없으면 같은 경로를 선으로 그린다
  const gaugeLayout = await fetch(`${kit}/gauge-layout.json`)
    .then((r) => (r.ok ? (r.json() as Promise<GaugeLayout>) : null))
    .catch(() => null);
  if (kitProbe) document.documentElement.classList.add('kit');
  loading?.setAttribute('hidden', '');
  //장소 이름은 맵 데이터가 정한다
  const stageName = document.querySelector('.stage-name');
  if (stageName && loaded.backdrop.name) stageName.textContent = loaded.backdrop.name;
  if (loaded.sprites.size === 0) throw new Error('에셋이 들어온 캐릭터가 하나도 없다');

  const sound = new SynthSound(loaded.ui.sound);
  for (const [id, data] of loaded.samples) sound.addSample(id, data);
  const soundToggle = document.getElementById('sound') as HTMLInputElement | null;
  //소리가 잠겨 있는 동안 소리 칸 옆에 눌러 켜라는 안내를 띄운다
  const soundHint = document.getElementById('sound-hint');
  const showHint = (): void => {
    if (soundHint) soundHint.hidden = sound.running || (soundToggle ? !soundToggle.checked : false);
  };
  const unlock = (): void => {
    sound.unlock();
    sound.setMuted(soundToggle ? !soundToggle.checked : false);
    window.setTimeout(showHint, 300);
  };
  showHint();
  //소리 잠금은 사용자 입력 안에서만 풀린다. 터치 기기는 손을 뗄 때 풀리므로 여러 입력에 모두 건다
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlock, { capture: true });
  soundToggle?.addEventListener('change', unlock);

  const stage = new Stage3D(
    canvas,
    host,
    loaded.stage,
    loaded.backdrop,
    loaded.backdropImages,
    loaded.sprites,
    (characterId, file) => loaded.frames.get(`${characterId}/${file}`) ?? null,
    (skillId, characterId) => {
      const view = cardView(loaded.catalog, skillId, { name: characterId ? display.cardKit[characterId]?.[skillId] : undefined, terms: display.terms });
      return { slot: view.slot, name: view.name, frontPower: view.frontPower, backPower: view.backPower, attribute: view.trace };
    },
    sound,
    loaded.ultimates,
    loaded.voices,
    loaded.envFx,
  );
  const glyphs: Partial<Record<string, HTMLImageElement>> = {};
  if (markGlyph) glyphs['attack'] = markGlyph;
  if (insightGlyph) glyphs['defense'] = insightGlyph;
  if (resolveGlyph) glyphs['support'] = resolveGlyph;
  stage.setKit({
    plates: plateFront && plateBack ? { front: plateFront, back: plateBack } : null,
    completePlates: (characterId, skillId) => completePlates.get(`${characterId}/${skillId}`) ?? null,
    glyphs,
    gauge: gaugeLayout ? { base: kitProbe ? kit : null, layout: gaugeLayout } : null,
  });
  //UI 가 덮지 않는 구역을 재서 무대에 넘긴다 (SPEC-004 §13.4). 위 띠 아래 ~ 지시판 위가 입력 단계 구역, 위 띠 아래 ~ 홈 인디케이터 위가 교전 구역
  const uiBox = document.getElementById('ui');
  const topBar = document.querySelector('.topbar');
  const commandBox = document.getElementById('command');
  const applyLayout = (): void => {
    const u = layoutUi();
    stage.resize();
    if (!uiBox || !topBar || !commandBox) return;
    const c = canvas.getBoundingClientRect();
    const box = uiBox.getBoundingClientRect();
    const top = topBar.getBoundingClientRect().bottom;
    const panelTop = commandBox.getBoundingClientRect().top;
    //홈 인디케이터 자리 (아래 60)
    const bottom = box.bottom - 60 * u;
    const zone = (y0: number, y1: number) => fraction(new DOMRect(box.left, y0, box.width, y1 - y0), c);
    stage.setFrameZones({ home: zone(top, panelTop), focus: zone(top, bottom) }, u);
  };
  applyLayout();
  window.addEventListener('resize', applyLayout);
  window.addEventListener('orientationchange', applyLayout);
  //게임 화면만 전체화면 (SPEC-004 §13.6). 크기가 바뀌면 resize 가 와서 여백을 다시 잰다
  bindFullscreen(host, document.getElementById('fullscreen'));

  //턴 진행 단계 (2D 화면과 같다)
  //showcase: 제작 확인용 자동 시연 (SPEC-005 §13)
  //turnEnd: 턴 마감을 재생하는 동안. 결행 칸 '다음 턴 대기'가 이때 보인다 (SPEC-004 §14.4)
  type Phase = 'waitInput' | 'input' | 'resolving' | 'turnEnd' | 'done' | 'showcase';
  let phase: Phase = 'done';
  let session: Session | null = null;
  let input: OrderInput | null = null;
  let enemyTargets = new Map<string, string>();
  let restSec = 0;
  const playing = (): boolean => (modeSelect?.value ?? 'play') === 'play';
  //연출 실험(lab)도 시연 걸음을 돈다. 실험 기법만 더 켠다 (SPEC-005 §15)
  const labbing = (): boolean => modeSelect?.value === 'lab';
  const showcasing = (): boolean => modeSelect?.value === 'showcase' || labbing();
  const labMotion = document.getElementById('lab-motion') as HTMLInputElement | null;
  const labFlash = document.getElementById('lab-flash') as HTMLInputElement | null;
  const labOptions = document.getElementById('lab-options');
  //실험 모드 켬·끔과 접근성 체크를 무대에 알린다
  const applyLab = (): void => {
    const on = labbing();
    labOptions?.toggleAttribute('hidden', !on);
    stage.setLab(on ? { reducedMotion: labMotion?.checked ?? false, reducedFlash: labFlash?.checked ?? false } : null);
  };
  labMotion?.addEventListener('change', applyLab);
  labFlash?.addEventListener('change', applyLab);
  let showcaseSteps: ReturnType<typeof showcaseCycle> = [];
  //환경 이펙트 검수 중인지
  let reviewing = false;
  const isAlly = (id: string): boolean => session?.battle.combatant(id).side === 'ally';

  //이벤트를 걸음으로 묶어 무대에 넘긴다 (§9.2)
  const feed = (events: readonly BattleEvent[]): void => {
    stage.play(toStageSteps(events, { isPlayerSide: isAlly }));
  };

  //발밑 결행 칸. 흔적 합과 결행 카드·대기 플래그를 도메인에서 읽는다 (SPEC-004 §14.4)
  const showGauges = (): void => {
    if (!session) return;
    const rules = loaded.catalog.rules;
    for (const c of session.battle.combatants) {
      const stageOf = ultimateStage(c.deck.includes(rules.ultimateSkillId), c.ultimatePending);
      stage.setGauge(c.id, c.isDefeated ? null : { charge: Math.min(c.attributeTotal, rules.ultimateThreshold), total: rules.ultimateThreshold, stage: stageOf });
    }
  };

  //이름표 오른쪽 상태 아이콘. 턴 시작·끝에 도메인에서 다시 읽는다 (SPEC-004 §13.5 U10)
  const showStatuses = (): void => {
    if (!session) return;
    for (const c of session.battle.combatants) stage.setStatuses(c.id, c.isDefeated ? [] : c.statuses.map((st) => ({ id: st.id, turns: st.turns })));
  };

  //적이 노리는 대상을 적 이름표 아래에 적는다 (§9.6). 노림 받는 아군이 그 적을 치라고 이미 지시했으면 합 표지 (U5)
  const showTargets = (on: boolean): void => {
    if (!session) return;
    for (const enemy of session.battle.sideOf('enemy')) {
      const targetId = enemyTargets.get(enemy.id);
      const name = targetId ? session.battle.combatant(targetId).base.name : '';
      const clash = !!targetId && input?.orderOf(targetId)?.targetId === enemy.id;
      stage.setNote(enemy.id, on ? name : '', clash);
    }
  };

  //아군 칸 초상화 (SPEC-004 §13.5 U6). 대기 장의 머리 쪽을 잘라 한 번만 만든다. 남의 그림을 세운 캐릭터면 그 그림
  const faces = new Map<string, string | null>();
  const portrait = (characterId: string): string | null => {
    if (faces.has(characterId)) return faces.get(characterId) ?? null;
    const artId = loaded.stage.battle.artAlias[characterId] ?? characterId;
    const frame = loaded.sprites.get(artId)?.frameEndingWith('idle');
    const bitmap = frame ? loaded.frames.get(`${artId}/${frame.file}`) : undefined;
    let url: string | null = null;
    if (frame && bitmap) {
      const [x0, y0, x1, y1] = frame.bbox;
      //창 비율 116:79 (SPEC-004 §14.9 U6). 폭은 몸 높이의 0.42, 가로 가운데는 발 기준점
      const w = Math.min(x1 - x0, (y1 - y0) * 0.42);
      const h = (w * 79) / 116;
      const left = Math.max(0, frame.anchor.x - w / 2);
      const canvasEl = document.createElement('canvas');
      canvasEl.width = 232;
      canvasEl.height = 158;
      canvasEl.getContext('2d')?.drawImage(bitmap, left, Math.max(0, y0 - h * 0.04), w, h, 0, 0, 232, 158);
      try {
        url = canvasEl.toDataURL('image/png');
      } catch {
        url = `${ASSETS}/${artId}/${frame.file}`;
      }
    }
    faces.set(characterId, url);
    return url;
  };

  const refresh = (): void => {
    if (!session || !input || phase !== 'input') return;
    panel.show(input, session.inputAllies(), session.inputEnemies());
    showTargets(true);
    stage.setSelection({
      ally: input.selectedAlly,
      target: input.selectedTarget,
      pickable: input.selectedAlly ? session.inputEnemies().map((e) => e.id) : session.inputAllies().map((a) => a.id),
    });
  };
  const panel = new CommandPanel(loaded.catalog, loaded.ui.side, {
    ally: (id) => {
      input?.selectAlly(id);
      refresh();
    },
    target: (id) => {
      input?.selectTarget(id);
      refresh();
    },
    card: (skillId) => {
      input?.selectCard(skillId);
      refresh();
    },
    go: () => submit(),
  }, portrait, {
    //상세 줄 (SPEC-004 §14.6). 확률·흔적은 도메인에서 읽기만 한다
    display,
    kit: kitProbe ? kit : null,
    chance: (allyId, skillId) => (session ? session.battle.frontChance(allyId, skillId) : null),
    traces: (allyId) => {
      if (!session) return null;
      const c = session.battle.combatant(allyId);
      return { ...c.attributes, threshold: loaded.catalog.rules.ultimateThreshold };
    },
  });

  //시연 한 바퀴. 아군 첫 캐릭터가 S1 → S2 → S3 → 궁극기로 합에서 이긴다 (SPEC-005 §13)
  const startShowcase = (): void => {
    if (!session) return;
    const ally = session.battle.sideOf('ally')[0];
    const enemy = session.battle.sideOf('enemy')[0];
    if (!ally || !enemy) return;
    const catalog = loaded.catalog;
    const cards: ShowcaseCard[] = [...catalog.deckFor(ally.base.id), catalog.rules.ultimateSkillId].map((id) => {
      const skill = catalog.skill(id);
      return { skillId: skill.id, slot: skill.slot, frontPower: skill.frontPower };
    });
    const enemyCard = catalog.skill(catalog.deckFor(enemy.base.id)[0] as number);
    showcaseSteps = showcaseCycle({
      allyId: ally.id,
      enemyId: enemy.id,
      cards,
      enemyCard: { skillId: enemyCard.id, backPower: enemyCard.backPower },
      enemyMaxHp: enemy.base.maxHp,
    });
    stage.play(showcaseSteps);
  };

  //판이 끝났을 때 가운데 배너 (U19). 다음 판을 시작하면 지운다
  const result = document.getElementById('result');
  const showResult = (winner: Side | null): void => {
    if (!result) return;
    result.hidden = false;
    result.className = `result ${winner === 'ally' ? 'win' : winner === 'enemy' ? 'lose' : 'draw'}`;
    result.textContent = winner === 'ally' ? '승리' : winner === 'enemy' ? '패배' : '무승부';
  };

  const restart = (): void => {
    if (result) result.hidden = true;
    const seed = Number(seedInput.value) || 1;
    session = new Session(loaded.catalog, createSeededRng(seed), loaded.stage.battle);
    stage.reset(session.roster());
    applyLab();
    reviewing = modeSelect?.value === 'envfx';
    //환경 이펙트 검수 (SPEC-005 §16.4). 전투 없이 사건마다 이펙트를 낸다
    if (reviewing) {
      input = null;
      phase = 'done';
      turnLabel.textContent = '-';
      panel.idle('공용 환경 이펙트 검수 — 사건마다 한 번씩, 전투 맵과 밤바다에서 돈다');
      void stage.reviewEnvFx((text) => (status.textContent = `환경 이펙트 · ${text}`));
      return;
    }
    if (showcasing()) {
      input = null;
      phase = 'showcase';
      status.textContent = labbing() ? '연출 실험 · S1 → S2 → S3 → 결행' : '시연 · S1 → S2 → S3 → 결행';
      turnLabel.textContent = '-';
      panel.idle(labbing() ? '조사한 연출 기법을 켠 실험 — 본편에는 아직 없다' : '제작 확인용 자동 시연 — 아군이 합에서 늘 이긴다');
      startShowcase();
      return;
    }
    restSec = 0;
    input = null;
    status.textContent = playing() ? '전투 중' : `자동 관전 · 시드 ${seed}`;
    turnLabel.textContent = '1';
    phase = 'resolving';
    openTurn();
  };

  const openTurn = (): void => {
    if (!session || session.battle.isFinished) return end();
    const startEvents = session.battle.startTurn();
    feed(startEvents);
    showGauges();
    showStatuses();
    turnLabel.textContent = String(session.battle.turn);
    if (session.battle.isFinished) return end();
    enemyTargets = new Map<string, string>();
    for (const event of startEvents) if (event.type === 'enemyTargeted') enemyTargets.set(event.enemyId, event.targetId);
    if (playing()) {
      phase = 'waitInput';
      panel.idle('적이 노릴 대상을 고르는 중…');
      return;
    }
    session.battle.submitOrders(session.autoOrders(enemyTargets));
    feed(session.battle.resolve());
    phase = 'resolving';
    panel.idle('자동 관전 중');
  };

  const beginInput = (): void => {
    if (!session) return;
    input = new OrderInput(session.inputAllies(), session.inputEnemies().map((e) => e.id), enemyTargets);
    phase = 'input';
    //쓰러진 사람을 빼고 남은 사람으로 대기 카메라를 다시 잡는다
    stage.reframe();
    showTargets(true);
    refresh();
  };

  const submit = (): void => {
    if (!session || !input || phase !== 'input' || !input.ready) return;
    session.battle.submitOrders(input.submitted);
    input = null;
    showTargets(false);
    stage.setSelection({ ally: null, target: null, pickable: [] });
    feed(session.battle.resolve());
    phase = 'resolving';
    panel.idle('교전 중…');
  };

  const end = (): void => {
    if (!session || phase === 'done') return;
    phase = 'done';
    input = null;
    showTargets(false);
    stage.setSelection({ ally: null, target: null, pickable: [] });
    showGauges();
    const winner = session.battle.winner;
    status.textContent = winner === 'ally' ? '아군 승' : winner === 'enemy' ? '적 승' : '무승부';
    showStatuses();
    showResult(winner);
    panel.idle(`${status.textContent} — 재시작을 누르면 다시 한다`);
    if (autoNext?.checked) {
      window.setTimeout(() => {
        if (phase !== 'done' || !autoNext.checked) return;
        seedInput.value = String((Number(seedInput.value) || 1) + 1);
        restart();
      }, 3500);
    }
  };

  //무대 위 사람을 눌러 고른다 (§9.6)
  const pickAt = (event: MouseEvent): string | null => {
    if (phase !== 'input' || !session) return null;
    return stage.hitTest(event.clientX, event.clientY);
  };
  const pick = (id: string | null): void => {
    if (!id || !session || !input || phase !== 'input') return;
    if (session.inputAllies().some((a) => a.id === id)) input.selectAlly(id);
    else if (session.inputEnemies().some((e) => e.id === id)) input.selectTarget(id);
    refresh();
  };
  canvas.addEventListener('click', (event) => pick(pickAt(event)));
  //이름표를 눌러도 고른다 (작은 화면에서 몸보다 누르기 쉽다)
  stage.onTagPick(pick);
  canvas.addEventListener('mousemove', (event) => {
    canvas.style.cursor = pickAt(event) ? 'pointer' : '';
  });

  const help = document.getElementById('help');
  const closeHelp = (): void => {
    help?.setAttribute('hidden', '');
    try {
      localStorage.setItem('ed.helpSeen', '1');
    } catch {
      //저장이 막혀 있으면 다음에 또 뜰 뿐이다
    }
  };
  document.getElementById('help-open')?.addEventListener('click', () => {
    document.getElementById('menu')?.setAttribute('hidden', '');
    help?.removeAttribute('hidden');
  });
  document.getElementById('help-close')?.addEventListener('click', closeHelp);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.getElementById('menu')?.setAttribute('hidden', '');
      return closeHelp();
    }
    if (phase !== 'input' || !input || !session) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
      return;
    }
    const n = Number(event.key);
    const hand = input.hand;
    if (Number.isInteger(n) && n >= 1 && n <= hand.length) {
      input.selectCard(hand[n - 1] as number);
      refresh();
    }
  });
  let seen = false;
  try {
    seen = localStorage.getItem('ed.helpSeen') === '1';
  } catch {
    seen = false;
  }
  if (!seen) help?.removeAttribute('hidden');

  document.getElementById('restart')?.addEventListener('click', restart);
  modeSelect?.addEventListener('change', () => {
    if (!session) return;
    //시연으로 들어가거나 나오면 처음부터 다시 한다
    if (showcasing() || phase === 'showcase' || modeSelect?.value === 'envfx' || reviewing) return restart();
    if (!playing() && (phase === 'input' || phase === 'waitInput')) {
      input = null;
      showTargets(false);
      stage.setSelection({ ally: null, target: null, pickable: [] });
      session.battle.submitOrders(session.autoOrders(enemyTargets));
      feed(session.battle.resolve());
      phase = 'resolving';
      panel.idle('자동 관전 중');
    }
  });
  //배속은 위 띠 버튼 하나로 ×1 → ×2 → ×3 를 돈다
  const speedButton = document.getElementById('speed');
  speedButton?.addEventListener('click', () => {
    speed = speed >= 3 ? 1 : speed + 1;
    stage.setSpeed(speed);
    const label = speedButton.querySelector('span');
    if (label) label.textContent = `×${speed}`;
    speedButton.setAttribute('aria-pressed', String(speed > 1));
  });
  //자동 전투: 직접 조작 ↔ 자동 관전
  const autoButton = document.getElementById('auto');
  const showAuto = (): void => autoButton?.setAttribute('aria-pressed', String(modeSelect?.value === 'watch'));
  autoButton?.addEventListener('click', () => {
    if (!modeSelect) return;
    modeSelect.value = modeSelect.value === 'watch' ? 'play' : 'watch';
    modeSelect.dispatchEvent(new Event('change'));
  });
  modeSelect?.addEventListener('change', showAuto);
  showAuto();
  //메뉴 겹창
  const menu = document.getElementById('menu');
  document.getElementById('menu-open')?.addEventListener('click', () => {
    help?.setAttribute('hidden', '');
    menu?.removeAttribute('hidden');
  });
  document.getElementById('menu-close')?.addEventListener('click', () => menu?.setAttribute('hidden', ''));
  document.getElementById('restart')?.addEventListener('click', () => menu?.setAttribute('hidden', ''));

  let last = performance.now();
  const loop = (now: number): void => {
    const deltaSec = Math.min(0.05, (now - last) / 1000) * speed;
    last = now;
    stage.tick(deltaSec);
    if (session && phase === 'waitInput' && stage.idle) beginInput();
    if (session && phase === 'showcase' && stage.idle) startShowcase();
    if (session && phase === 'resolving' && stage.idle) {
      restSec -= deltaSec;
      if (restSec <= 0) {
        if (session.battle.isFinished) end();
        else {
          //턴 마감을 먼저 재생하고 결행 칸을 다시 읽는다. 다음 턴 카드는 그다음에 들어온다
          feed(session.battle.endTurn());
          showGauges();
          showStatuses();
          phase = 'turnEnd';
        }
        restSec = 0.5;
      }
    }
    if (session && phase === 'turnEnd' && stage.idle) {
      restSec -= deltaSec;
      if (restSec <= 0) {
        openTurn();
        restSec = 0.5;
      }
    }
    requestAnimationFrame(loop);
  };

  restart();
  requestAnimationFrame(loop);
  if (loaded.missing.length > 0) status.textContent += ` · 그림 ${loaded.missing.length}개 없음`;
}

void main();
