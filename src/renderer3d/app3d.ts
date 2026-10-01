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
import { toStageSteps } from '../render/exchange.js';
import { showcaseCycle, type ShowcaseCard } from '../render/showcase.js';
import type { SpriteCatalog } from '../render/manifest.js';
import { parseCharacterSounds, type CharacterSounds } from '../render/sounds.js';
import { parseUltimateArt, type UltimateArt } from '../render/ultimate.js';
import type { UiData } from '../ui/data.js';
import { OrderInput, type InputMember } from '../ui/input.js';
import { loadCharacter, loadIndex, loadUi } from '../renderer/assets.js';
import { CommandPanel } from '../renderer/command-panel.js';
import { SynthSound } from '../renderer/sound.js';
import { parseBackdropConfig, parseStage3dConfig, type BackdropConfig, type BattleSetup, type Stage3dConfig } from './config.js';
import { Stage3D, type RosterEntry, type UltimateBundle } from './stage.js';

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
  return { catalog, ui, stage, backdrop, backdropImages, sprites, frames: loaded, ultimates, voices, samples, missing };
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

async function main(): Promise<void> {
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
    (skillId) => {
      const skill = loaded.catalog.skill(skillId);
      return { slot: skill.slot, name: skill.name, frontPower: skill.frontPower, backPower: skill.backPower };
    },
    sound,
    loaded.ultimates,
    loaded.voices,
  );
  window.addEventListener('resize', () => stage.resize());

  //턴 진행 단계 (2D 화면과 같다)
  //showcase: 제작 확인용 자동 시연 (SPEC-005 §13)
  type Phase = 'waitInput' | 'input' | 'resolving' | 'done' | 'showcase';
  let phase: Phase = 'done';
  let session: Session | null = null;
  let input: OrderInput | null = null;
  let enemyTargets = new Map<string, string>();
  let restSec = 0;
  const playing = (): boolean => (modeSelect?.value ?? 'play') === 'play';
  const showcasing = (): boolean => modeSelect?.value === 'showcase';
  let showcaseSteps: ReturnType<typeof showcaseCycle> = [];
  const isAlly = (id: string): boolean => session?.battle.combatant(id).side === 'ally';

  //이벤트를 걸음으로 묶어 무대에 넘긴다 (§9.2)
  const feed = (events: readonly BattleEvent[]): void => {
    stage.play(toStageSteps(events, { isPlayerSide: isAlly }));
  };

  //발밑 궁극기 칸. 속성 합과 궁극기 카드를 도메인에서 읽는다 (SPEC-004 §2.2.1)
  const showGauges = (): void => {
    if (!session) return;
    const rules = loaded.catalog.rules;
    for (const c of session.battle.combatants) {
      const ready = c.ultimatePending || c.deck.includes(rules.ultimateSkillId);
      stage.setGauge(c.id, c.isDefeated ? null : { filled: Math.min(c.attributeTotal, rules.ultimateThreshold), total: rules.ultimateThreshold, ready });
    }
  };

  //적이 노리는 대상을 적 이름표 아래에 적는다 (§9.6)
  const showTargets = (on: boolean): void => {
    if (!session) return;
    for (const enemy of session.battle.sideOf('enemy')) {
      const targetId = enemyTargets.get(enemy.id);
      const name = targetId ? session.battle.combatant(targetId).base.name : '';
      stage.setNote(enemy.id, on && name ? `→ ${name}` : '');
    }
  };

  const refresh = (): void => {
    if (!session || !input || phase !== 'input') return;
    panel.show(input, session.inputAllies(), session.inputEnemies());
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

  const restart = (): void => {
    const seed = Number(seedInput.value) || 1;
    session = new Session(loaded.catalog, createSeededRng(seed), loaded.stage.battle);
    stage.reset(session.roster());
    if (showcasing()) {
      input = null;
      phase = 'showcase';
      status.textContent = '시연 · S1 → S2 → S3 → 궁극기';
      turnLabel.textContent = '-';
      panel.idle('제작 확인용 자동 시연 — 아군이 합에서 늘 이긴다');
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
    panel.idle('합 진행 중…');
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
  canvas.addEventListener('click', (event) => {
    const id = pickAt(event);
    if (!id || !session || !input) return;
    if (session.inputAllies().some((a) => a.id === id)) input.selectAlly(id);
    else if (session.inputEnemies().some((e) => e.id === id)) input.selectTarget(id);
    refresh();
  });
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
  document.getElementById('help-open')?.addEventListener('click', () => help?.removeAttribute('hidden'));
  document.getElementById('help-close')?.addEventListener('click', closeHelp);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') return closeHelp();
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
    if (showcasing() || phase === 'showcase') return restart();
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
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
    button.addEventListener('click', () => {
      speed = Number(button.dataset['speed']) || 1;
      for (const other of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) other.setAttribute('aria-pressed', String(other === button));
    });
  }

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
          feed(session.battle.endTurn());
          openTurn();
        }
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
