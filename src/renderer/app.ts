//전투 화면 입구. 도메인 → 어댑터 → 렌더러를 여기서 한 번만 엮는다
//
//규칙은 전부 src/domain 이 들고 있고, 좌표는 src/render·src/ui 가 정하고,
//그림과 시간은 CanvasRenderer 가 맡는다. 이 파일은 배선만 한다

import { CameraDirector } from '../camera/director.js';
import { WeightedEnemyAi, type EnemyAiContext } from '../domain/ai.js';
import { Battle, type BattleOrder } from '../domain/battle.js';
import { ClashResolver } from '../domain/clash.js';
import { BattleCatalog, parseBattleData } from '../domain/data.js';
import { createSeededRng, type Rng } from '../domain/rng.js';
import type { BattleEvent, Side } from '../domain/types.js';
import type { SpriteCatalog } from '../render/manifest.js';
import { BattlePresenter } from '../render/presenter.js';
import { Stage, type StagePlacement } from '../render/stage.js';
import { UiDirector } from '../ui/director.js';
import type { UiData } from '../ui/data.js';
import { OrderInput, type InputMember } from '../ui/input.js';
import { ImageBank, loadCharacter, loadIndex, loadMap, loadUi } from './assets.js';
import { BattleHud, CommandPanel } from './command-panel.js';
import { SynthSound } from './sound.js';
import { CanvasRenderer, type ActorLabel } from './canvas.js';
import { Scene, type MapPlacement } from './scene.js';

//데이터 위치는 캔버스의 data-assets · data-battle 로 바꿀 수 있다. 리포 안 web/ 에서 열면 기본값이다
const view = document.getElementById('view') as HTMLCanvasElement | null;
const ASSETS = view?.dataset['assets'] ?? '../assets';
const DATA = view?.dataset['battle'] ?? '../docs/battle-data.json';
//한 편에 세울 인원. 미러 대결에서 쓴다
const MIRROR_SIZE = 2;

//배치는 원작 Battle.unity 에서 뽑았다 (2026-09-22). 전부 캐릭터 키 H 배수다.
//
//원작 값: 바닥 y=-577, 카메라 (0,-9,-306) 아래로 15°, FOV 60.
//아군 x=0 / 적 x=833 이고, 같은 편끼리는 x 가 같고 z 로만 벌어진다 (697 ↔ 1176).
//카메라 높이 568 월드가 우리 무대에서 1407 (= 1.05H) 로 떨어지므로 그 비로 환산했다.
//
//  진영 간 가로   833 / 568 = 1.47 카메라높이 → 1.54 H
//  같은 편 깊이   473 / 568 = 0.83          → 0.87 H
const SIDE_GAP = 1.54;
//같은 편이 앞뒤로 벌어지는 전체 폭. 원작은 2명이 0.87 H 만큼 떨어져 있었다.
//우리는 4명이라 같은 폭 안에 나눠 세운다 — 간격을 그대로 쓰면 앞줄이 화면을 덮는다
const ROW_SPAN = 0.87;
//쉴 때 서 있는 자리는 전투 구역보다 뒤다. 원작 BattleZone 이 캐릭터 줄보다
//439 월드(0.77 카메라높이) 앞에 있는 것을 옮긴 값이다
const REST_BACK = 0.81;

interface Boot {
  catalog: BattleCatalog;
  ui: UiData;
  map: MapPlacement;
  sprites: Map<string, SpriteCatalog>;
  images: ImageBank;
}

//전투 한 판을 들고 있는 통. 재시작하면 통째로 갈아 끼운다
class Session {
  readonly battle: Battle;
  readonly presenter: BattlePresenter;
  readonly ui: UiDirector;
  readonly camera: CameraDirector;
  readonly placements: StagePlacement[];
  private readonly ai = new WeightedEnemyAi();
  private readonly catalog: BattleCatalog;
  private readonly aiContext: EnemyAiContext;

  //characterIds 는 한 편의 구성이다. 양 진영이 같은 구성으로 선다
  constructor(boot: Boot, stage: Stage, rng: Rng, groundY: number, height: number, characterIds: readonly string[]) {
    this.catalog = boot.catalog;
    const roster = (side: Side) =>
      characterIds.map((characterId, i) => ({
        id: `${side === 'ally' ? 'a' : 'e'}${i + 1}`,
        characterId,
        side,
      }));

    this.battle = new Battle(boot.catalog, roster('ally'), roster('enemy'), { rng, enemyAi: this.ai });
    const resolver = new ClashResolver(boot.catalog, rng);
    this.aiContext = { catalog: boot.catalog, resolver, rng };

    this.placements = this.layout(groundY, height, boot.ui.side.rowStagger);
    const byId = new Map(this.placements.map((p) => [p.combatantId, p]));
    const context = {
      actor: (id: string) => {
        const found = byId.get(id);
        if (!found) throw new Error(`무대에 없다: ${id}`);
        return found;
      },
      combatants: () => [...byId.keys()],
    };

    this.presenter = new BattlePresenter(boot.catalog, stage, context);
    this.camera = new CameraDirector(boot.ui.camera);
    this.ui = new UiDirector(boot.catalog, stage, context, boot.ui, rng);
  }

  //양 진영을 마주 보게 세운다. 뒷사람일수록 뒤로 밀어 겹치지 않게 한다
  private layout(groundY: number, height: number, stagger: number): StagePlacement[] {
    const out: StagePlacement[] = [];
    for (const side of ['ally', 'enemy'] as const) {
      const members = this.battle.sideOf(side);
      //아군은 왼쪽에서 오른쪽을 본다. facing 1 이 원본 방향(오른쪽)이다
      const facing: 1 | -1 = side === 'ally' ? 1 : -1;
      const sideSign = side === 'ally' ? -1 : 1;
      members.forEach((combatant, index) => {
        //같은 편은 가로로 벌리지 않는다. 원작도 x 가 같고 깊이로만 갈린다
        const spread = members.length > 1 ? index / (members.length - 1) - 0.5 : 0;
        //뒷줄일수록 바깥으로 조금 비킨다. 깊이만 다르면 몸·바·이름표가 겹쳐 쌓였다 (SPEC-004 §12)
        const back = members.length > 1 ? 0.5 - spread : 0;
        out.push({
          combatantId: combatant.id,
          characterId: combatant.base.id,
          position: {
            x: sideSign * (SIDE_GAP * height) * 0.5 + sideSign * back * stagger * height,
            y: groundY - REST_BACK * height + spread * ROW_SPAN * height,
          },
          facing,
        });
      });
    }
    return out;
  }

  //이름표·현황판에 쓸 이름과 진영
  labels(): ActorLabel[] {
    return this.battle.combatants.map((c) => ({ combatantId: c.id, name: c.base.name, side: c.side }));
  }

  //입력 단계에 넘길 살아 있는 아군. 덱은 지금 손에 있는 카드다
  inputAllies(): (InputMember & { name: string })[] {
    return this.battle
      .sideOf('ally')
      .filter((c) => !c.isDefeated)
      .map((c) => ({ id: c.id, characterId: c.base.id, deck: [...c.deck], name: c.base.name }));
  }

  //입력 단계에 넘길 살아 있는 적
  inputEnemies(): { id: string; name: string }[] {
    return this.battle
      .sideOf('enemy')
      .filter((c) => !c.isDefeated)
      .map((c) => ({ id: c.id, name: c.base.name }));
  }

  //이 캐릭터 이름. 데이터에서 온다
  nameOf(characterId: string): string {
    return this.catalog.character(characterId).name;
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
      const skillId = this.ai.chooseSkill(
        ally,
        { target, isClash: enemyTargets.get(targetId) === ally.id, opponentSkillId: null },
        this.aiContext,
      );
      orders.push({ actorId: ally.id, targetId, skillId });
    }
    return orders;
  }
}

//데이터와 그림을 전부 받아 온다
async function boot(progress: (text: string, ratio: number) => void): Promise<Boot> {
  const [rawBattle, ui, map] = await Promise.all([
    fetch(DATA).then((r) => r.json()),
    loadUi(ASSETS),
    loadMap(ASSETS),
  ]);
  const catalog = new BattleCatalog(parseBattleData(rawBattle));
  //매니페스트가 있는 캐릭터만 읽는다. 없는 캐릭터를 찔러 404 를 내지 않는다 (SPEC-004 §12)
  const drawn = await loadIndex(ASSETS);
  progress('그림', 0);

  const sprites = new Map<string, SpriteCatalog>();
  const images = new ImageBank(ASSETS, (done, total) => progress(`그림 ${done} / ${total}`, total > 0 ? done / total : 0));
  await Promise.all(
    catalog.data.characters.map(async (character) => {
      if (!drawn.has(character.id)) return;
      const loaded = await loadCharacter(ASSETS, character.id);
      //에셋이 아직 없는 캐릭터는 그냥 빠진다. 남의 그림을 대신 물리지 않는다
      if (!loaded) return;
      sprites.set(character.id, loaded);
      await images.preloadCharacter(character.id, loaded);
    }),
  );
  await images.preloadMap(map);
  return { catalog, ui, map, sprites, images };
}

async function main(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d 컨텍스트를 못 잡았다');

  const status = document.getElementById('status') as HTMLElement;
  const turnLabel = document.getElementById('turn') as HTMLElement;
  const seedInput = document.getElementById('seed') as HTMLInputElement;
  const rosterSelect = document.getElementById('roster') as HTMLSelectElement | null;
  const modeSelect = document.getElementById('mode') as HTMLSelectElement | null;
  const autoNext = document.getElementById('autonext') as HTMLInputElement | null;
  const loading = document.getElementById('loading');
  const loadingBar = document.getElementById('loading-bar');
  const loadingText = document.getElementById('loading-text');
  //보는 사람용 배속. 렌더러 시계만 빨라진다. 전투 결과는 같다
  let speed = 1;
  status.textContent = '불러오는 중…';

  //불러오기 진행률. 검은 화면으로 두지 않는다 (SPEC-004 §12)
  const loaded = await boot((text, ratio) => {
    if (loadingText) loadingText.textContent = text;
    if (loadingBar) loadingBar.style.width = `${Math.round(ratio * 100)}%`;
  });
  loading?.setAttribute('hidden', '');
  const stage = new Stage(loaded.sprites);
  const first = [...loaded.sprites.values()][0];
  if (!first) throw new Error('에셋이 들어온 캐릭터가 하나도 없다');

  const height = first.characterHeight;
  const groundY = first.ground.y;

  canvas.width = loaded.map.viewport.width;
  canvas.height = loaded.map.viewport.height;
  const scene = new Scene(loaded.map, height, groundY);
  //소리는 첫 클릭·키 입력에 켜진다. 브라우저가 그 전에는 못 내게 막는다 (SPEC-005 §7.5)
  const sound = new SynthSound(loaded.ui.sound);
  const soundToggle = document.getElementById('sound') as HTMLInputElement | null;
  const unlock = (): void => {
    sound.unlock();
    sound.setMuted(soundToggle ? !soundToggle.checked : false);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  soundToggle?.addEventListener('change', unlock);
  const renderer = new CanvasRenderer(
    ctx,
    scene,
    stage,
    loaded.images,
    height,
    loaded.ui.motion,
    loaded.ui.cutscene,
    loaded.ui.effects,
    loaded.ui.down,
    loaded.ui.camera,
    { side: loaded.ui.side, bar: loaded.ui.bar, badge: loaded.ui.badge },
    sound,
  );

  //턴 진행 단계. 입력을 기다리는 동안은 렌더러가 한가해도 턴을 넘기지 않는다
  //  waitInput  턴 시작 연출이 끝나길 기다린다. 끝나면 명령 패널을 켠다
  //  input      플레이어가 지시를 넣는 중
  //  resolving  합 재생 중. 끝나면 턴을 닫고 다음 턴을 연다
  //  done       전투가 끝났다
  type Phase = 'waitInput' | 'input' | 'resolving' | 'done';
  let phase: Phase = 'done';
  let session: Session | null = null;
  let input: OrderInput | null = null;
  let enemyTargets = new Map<string, string>();
  //턴 사이에 한 박자 쉰다. 그 외의 완급은 렌더러가 명령마다 알아서 준다
  let restSec = 0;

  const playing = (): boolean => (modeSelect?.value ?? 'play') === 'play';

  //이벤트 하나마다 세 어댑터의 명령을 모아 순서대로 흘린다 (SPEC-005 §3.1).
  //어댑터별로 한 턴 분을 통째로 넣으면 프리젠터 명령이 전부 앞에 서서 박자가 안 맞는다.
  //한 이벤트 안에서는 동작 → 카메라 → UI 순이다. 휘두른 뒤에 흔들리고, 흔들린 뒤에 숫자가 뜬다
  const feed = (events: readonly BattleEvent[]): void => {
    if (!session) return;
    events.forEach((event, i) => {
      if (!session) return;
      renderer.push(session.presenter.consume([event]));
      //원경을 끼울지 판단하려면 이 턴에 남은 이벤트를 같이 봐야 한다
      renderer.pushCamera(session.camera.consume([event], events.slice(i + 1)));
      renderer.push(session.ui.consume([event]));
    });
  };

  //명령 패널. 누른 것을 입력 상태에 넣고 다시 그린다 (SPEC-004 §10)
  const refresh = (): void => {
    if (!session || !input || phase !== 'input') return;
    panel.show(input, session.inputAllies(), session.inputEnemies());
    renderer.setSelection({
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
      if (!session || !input) return;
      const order = input.selectCard(skillId);
      //고른 대상을 화살표로 긋는다. 입력은 이벤트가 아니라서 따로 받는다 (§6.1)
      if (order) renderer.push(session.ui.selectTarget(order.actorId, order.targetId));
      refresh();
    },
    go: () => submit(),
  });
  const hud = new BattleHud(
    document.getElementById('hud-ally') as HTMLElement,
    document.getElementById('hud-enemy') as HTMLElement,
    loaded.ui.side,
    { hp: loaded.ui.bar.hpColor, mentality: loaded.ui.bar.mentalityColor },
  );

  //한 편 구성. 미러면 그림이 있는 캐릭터만 채우고, 전체면 데이터의 캐릭터 전원이다
  const roster = (): string[] => {
    if (rosterSelect?.value === 'all') return loaded.catalog.data.characters.map((c) => c.id);
    //데이터 순서대로 세운다. 그림을 받은 순서를 따르면 판마다 자리가 바뀐다
    const drawn = loaded.catalog.data.characters.map((c) => c.id).filter((id) => loaded.sprites.has(id));
    return Array.from({ length: MIRROR_SIZE }, (_, i) => drawn[i % drawn.length] as string);
  };

  const restart = (): void => {
    const seed = Number(seedInput.value) || 1;
    session = new Session(loaded, stage, createSeededRng(seed), groundY, height, roster());
    renderer.reset(session.placements, session.labels());
    restSec = 0;
    input = null;
    status.textContent = playing() ? '전투 중' : `자동 관전 · 시드 ${seed}`;
    turnLabel.textContent = '1';
    openTurn();
  };

  const openTurn = (): void => {
    if (!session || session.battle.isFinished) return end();
    const startEvents = session.battle.startTurn();
    feed(startEvents);
    turnLabel.textContent = String(session.battle.turn);
    if (session.battle.isFinished) return end();

    enemyTargets = new Map<string, string>();
    for (const event of startEvents) {
      if (event.type === 'enemyTargeted') enemyTargets.set(event.enemyId, event.targetId);
    }
    if (playing()) {
      //적 화살표가 다 그려진 뒤에 패널을 켠다
      phase = 'waitInput';
      panel.idle('적이 노릴 대상을 고르는 중…');
      return;
    }
    session.battle.submitOrders(session.autoOrders(enemyTargets));
    //한 턴 분을 통째로 넘긴다. 어느 명령을 얼마나 붙들지는 렌더러가 정한다
    feed(session.battle.resolve());
    phase = 'resolving';
    panel.idle('자동 관전 중');
  };

  //입력 단계를 연다. 지시가 없는 첫 아군이 골라진 채로 시작한다
  const beginInput = (): void => {
    if (!session) return;
    input = new OrderInput(
      session.inputAllies(),
      session.inputEnemies().map((e) => e.id),
      enemyTargets,
    );
    phase = 'input';
    refresh();
  };

  //지시를 도메인에 넘기고 합을 재생한다
  const submit = (): void => {
    if (!session || !input || phase !== 'input' || !input.ready) return;
    session.battle.submitOrders(input.submitted);
    input = null;
    renderer.setSelection({ ally: null, target: null, pickable: [] });
    feed(session.battle.resolve());
    phase = 'resolving';
    panel.idle('합 진행 중…');
  };

  const end = (): void => {
    if (!session || phase === 'done') return;
    phase = 'done';
    input = null;
    renderer.setSelection({ ally: null, target: null, pickable: [] });
    const winner = session.battle.winner;
    status.textContent = winner === 'ally' ? '아군 승' : winner === 'enemy' ? '적 승' : '무승부';
    panel.idle(`${status.textContent} — 재시작을 누르면 다시 한다`);
    //끝나면 잠깐 보여 주고 다음 시드로 넘어간다. 관전 검수용이다
    if (autoNext?.checked) {
      window.setTimeout(() => {
        if (phase !== 'done' || !autoNext.checked) return;
        seedInput.value = String((Number(seedInput.value) || 1) + 1);
        restart();
      }, 3500);
    }
  };

  //무대 위 사람을 눌러 고른다. 화면 좌표 → 사람은 렌더러가 푼다 (§10.3)
  const canvasPoint = (event: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };
  const pickAt = (event: MouseEvent): string | null => {
    if (phase !== 'input' || !session) return null;
    const { x, y } = canvasPoint(event);
    return renderer.hitTest(x, y);
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

  //단축키. Enter 합 진행, 숫자는 카드, Esc 는 도움말 닫기
  const help = document.getElementById('help');
  const openHelp = (): void => help?.removeAttribute('hidden');
  const closeHelp = (): void => {
    help?.setAttribute('hidden', '');
    try {
      localStorage.setItem('ed.helpSeen', '1');
    } catch {
      //저장이 막혀 있으면 다음에 또 뜰 뿐이다
    }
  };
  document.getElementById('help-open')?.addEventListener('click', openHelp);
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
      const order = input.selectCard(hand[n - 1] as number);
      if (order) renderer.push(session.ui.selectTarget(order.actorId, order.targetId));
      refresh();
    }
  });
  let seen = false;
  try {
    seen = localStorage.getItem('ed.helpSeen') === '1';
  } catch {
    seen = false;
  }
  if (!seen) openHelp();

  document.getElementById('restart')?.addEventListener('click', restart);
  rosterSelect?.addEventListener('change', restart);
  //관전으로 바꾸면 지금 입력 중인 턴은 AI 가 마저 둔다
  modeSelect?.addEventListener('change', () => {
    if (!session) return;
    if (!playing() && (phase === 'input' || phase === 'waitInput')) {
      input = null;
      renderer.setSelection({ ally: null, target: null, pickable: [] });
      session.battle.submitOrders(session.autoOrders(enemyTargets));
      feed(session.battle.resolve());
      phase = 'resolving';
      panel.idle('자동 관전 중');
    }
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
    button.addEventListener('click', () => {
      speed = Number(button.dataset['speed']) || 1;
      for (const other of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
        other.setAttribute('aria-pressed', String(other === button));
      }
    });
  }

  let last = performance.now();
  const loop = (now: number): void => {
    const deltaSec = Math.min(0.05, (now - last) / 1000) * speed;
    last = now;

    renderer.tick(deltaSec);

    if (session && phase === 'waitInput' && renderer.idle) beginInput();
    //렌더러가 이번 턴 명령을 다 소화했으면 턴을 닫고 다음 턴을 연다
    if (session && phase === 'resolving' && renderer.idle) {
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

    renderer.draw(now / 1000);
    hud.update(renderer.snapshot());
    requestAnimationFrame(loop);
  };

  restart();
  requestAnimationFrame(loop);

  const missing = loaded.images.missingFiles;
  if (missing.length > 0) status.textContent += ` · 그림 ${missing.length}개 없음`;
}

void main();
