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
import { ImageBank, loadCharacter, loadMap, loadUi } from './assets.js';
import { CanvasRenderer } from './canvas.js';
import { Scene, type MapPlacement } from './scene.js';

const ASSETS = '../assets';
const DATA = '../docs/battle-data.json';

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
  readonly camera = new CameraDirector();
  readonly placements: StagePlacement[];
  private readonly ai = new WeightedEnemyAi();
  private readonly aiContext: EnemyAiContext;

  constructor(boot: Boot, stage: Stage, rng: Rng, groundY: number, height: number) {
    const roster = (side: Side) =>
      boot.catalog.data.characters.map((c, i) => ({
        id: `${side === 'ally' ? 'a' : 'e'}${i + 1}`,
        characterId: c.id,
        side,
      }));

    this.battle = new Battle(boot.catalog, roster('ally'), roster('enemy'), { rng, enemyAi: this.ai });
    const resolver = new ClashResolver(boot.catalog, rng, { alliesOf: (c) => this.battle.sideOf(c.side) });
    this.aiContext = { catalog: boot.catalog, resolver, rng };

    this.placements = this.layout(groundY, height);
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
    this.ui = new UiDirector(boot.catalog, stage, context, boot.ui, rng);
  }

  //양 진영을 마주 보게 세운다. 뒷사람일수록 뒤로 밀어 겹치지 않게 한다
  private layout(groundY: number, height: number): StagePlacement[] {
    const out: StagePlacement[] = [];
    for (const side of ['ally', 'enemy'] as const) {
      const members = this.battle.sideOf(side);
      //아군은 왼쪽에서 오른쪽을 본다. facing 1 이 원본 방향(오른쪽)이다
      const facing: 1 | -1 = side === 'ally' ? 1 : -1;
      const sideSign = side === 'ally' ? -1 : 1;
      members.forEach((combatant, index) => {
        //같은 편은 가로로 벌리지 않는다. 원작도 x 가 같고 깊이로만 갈린다
        const spread = members.length > 1 ? index / (members.length - 1) - 0.5 : 0;
        out.push({
          combatantId: combatant.id,
          characterId: combatant.base.id,
          position: {
            x: sideSign * (SIDE_GAP * height) * 0.5,
            y: groundY - REST_BACK * height + spread * ROW_SPAN * height,
          },
          facing,
        });
      });
    }
    return out;
  }

  //아군도 적과 같은 AI 로 둔다. 지금은 연출을 보는 게 목적이다
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
async function boot(): Promise<Boot> {
  const [rawBattle, ui, map] = await Promise.all([
    fetch(DATA).then((r) => r.json()),
    loadUi(ASSETS),
    loadMap(ASSETS),
  ]);
  const catalog = new BattleCatalog(parseBattleData(rawBattle));

  const sprites = new Map<string, SpriteCatalog>();
  const images = new ImageBank(ASSETS);
  await Promise.all(
    catalog.data.characters.map(async (character) => {
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
  status.textContent = '에셋 읽는 중…';

  const loaded = await boot();
  const stage = new Stage(loaded.sprites);
  const first = [...loaded.sprites.values()][0];
  if (!first) throw new Error('에셋이 들어온 캐릭터가 하나도 없다');

  const height = first.characterHeight;
  const groundY = first.ground.y;

  canvas.width = loaded.map.viewport.width;
  canvas.height = loaded.map.viewport.height;
  const scene = new Scene(loaded.map, height, groundY);
  const renderer = new CanvasRenderer(ctx, scene, stage, loaded.images, height);

  let session: Session | null = null;
  //턴 사이에 한 박자 쉰다. 그 외의 완급은 렌더러가 명령마다 알아서 준다
  let restSec = 0;
  let finished = false;

  const feed = (events: readonly BattleEvent[]): void => {
    if (!session) return;
    renderer.push(session.presenter.consume(events));
    renderer.push(session.ui.consume(events));
    renderer.pushCamera(session.camera.consume(events));
  };

  const restart = (): void => {
    const seed = Number(seedInput.value) || 1;
    session = new Session(loaded, stage, createSeededRng(seed), groundY, height);
    renderer.reset(session.placements);
    restSec = 0;
    finished = false;
    status.textContent = `시드 ${seed}`;
    turnLabel.textContent = '1';
    openTurn();
  };

  const openTurn = (): void => {
    if (!session || session.battle.isFinished) return end();
    const startEvents = session.battle.startTurn();
    feed(startEvents);
    if (session.battle.isFinished) return end();

    const targets = new Map<string, string>();
    for (const event of startEvents) {
      if (event.type === 'enemyTargeted') targets.set(event.enemyId, event.targetId);
    }
    session.battle.submitOrders(session.autoOrders(targets));
    //한 턴 분을 통째로 넘긴다. 어느 명령을 얼마나 붙들지는 렌더러가 정한다
    feed(session.battle.resolve());
    turnLabel.textContent = String(session.battle.turn);
  };

  const end = (): void => {
    if (!session || finished) return;
    finished = true;
    const winner = session.battle.winner;
    status.textContent = winner === 'ally' ? '아군 승' : winner === 'enemy' ? '적 승' : '무승부';
  };

  document.getElementById('restart')?.addEventListener('click', restart);

  let last = performance.now();
  const loop = (now: number): void => {
    const deltaSec = Math.min(0.05, (now - last) / 1000);
    last = now;

    renderer.tick(deltaSec);

    //렌더러가 이번 턴 명령을 다 소화했으면 턴을 닫고 다음 턴을 연다
    if (session && !finished && renderer.idle) {
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
    requestAnimationFrame(loop);
  };

  restart();
  requestAnimationFrame(loop);

  const missing = loaded.images.missingFiles;
  if (missing.length > 0) status.textContent += ` · 그림 ${missing.length}개 없음`;
}

void main();
