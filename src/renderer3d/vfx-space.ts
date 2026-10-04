//카일 전 스킬 공간형 VFX 시험 화면 (SPEC-005 §15.3·§15.4). 게임과 같은 무대·같은 카메라에서 평면 재생과 공간형을 나란히 본다
//S1 평면: 게임 종이 인형 판에 원본 S1 장(norm/11-skill1-01~15)을 §12.5 곡선 박자로 넘긴다 (원본은 읽기만 한다)
//S1 공간형: 원본 15 장 몸 판 + 깊이만 쓰는 몸 가림 판 + 휜 띠 메시 + 깊이별 물방울 + 지면 물결
//S2·S3·결행 (§15.4): 평면은 게임과 같은 통합 장(결행은 깊이 0 면의 효과 장), 공간형은 몸만 남긴 장 + 효과 분리 장을 투영 곡면에 얹는다
//스킬 그림은 고를 때 받는다
//카메라: 게임 CameraRig 그대로(교전·대기) + 궤도 막대. 카메라 변환을 쓰는 곳은 writeCamera 하나다
//시계: 효과 시각은 게임 시간. 실제 경과에 배속을 한 번만 곱해 더한다

import * as THREE from 'three';
import { parseRibbonConfig, slashDuration, slashSample, originalFrameAt } from '../render/ribbon-slash.js';
import { parseSpaceConfig, viewPitchDeg } from '../render/space-slash.js';
import { hPerPixel, parseSpaceFx, skillDuration, trackFrameAt, type SpaceFxSkill } from '../render/space-fx.js';
import type { SpriteCatalog } from '../render/manifest.js';
import { loadCharacter } from '../renderer/assets.js';
import { Backdrop } from './backdrop.js';
import { CameraRig } from './camera.js';
import { parseBackdropConfig, parseStage3dConfig } from './config.js';
import { PaperDoll, frameTexture, plateGeometry } from './doll.js';
import { SpaceSlashEffect } from './space-slash.js';
import { SpaceFxTrackMesh } from './space-fx.js';
import { cropTexture, loadStrip } from './strip-loader.js';

//쓰는 장 id. 준비 장, 원본 S1 15장, 대기(인형 기본), 맞은 장(자리 표시 적)
const READY = '11-skill1-ready';
const S1 = Array.from({ length: 15 }, (_, i) => `11-skill1-${String(i + 1).padStart(2, '0')}`);
const BODY = '11-skill1-15';
const IDLE = '00-idle';
const HIT = '04-hit';

type View = 'side' | 'flat' | 'space';
type SkillId = 's1' | 's2' | 's3' | 'ult';
//결행·S2·S3 끝난 뒤 마지막 장을 붙잡는 시간 (ms)
const AFTER_HOLD = 500;

//고른 스킬의 받은 그림과 메시
interface LoadedSkill {
  skill: SpaceFxSkill;
  space: SpaceFxTrackMesh[];
  flat: SpaceFxTrackMesh[];
  //몸만 남긴 장 (장 id → 텍스처). 가림 판이 쓴다
  bodies: Map<string, THREE.Texture>;
}

function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`시험 화면 요소가 없다: #${id}`);
  return found as T;
}

async function json(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} 를 읽을 수 없다 (${response.status})`);
  return response.json();
}

function image(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => resolve(null);
    element.src = url;
  });
}

async function main(): Promise<void> {
  const canvas = byId<HTMLCanvasElement>('view');
  const readout = byId<HTMLElement>('readout');
  const assets = canvas.dataset['assets'] ?? '../assets';

  //── 데이터 ──
  const rawVfx = await json(`${assets}/kyle/realtime-vfx.json`);
  const config = parseRibbonConfig(rawVfx);
  const space = parseSpaceConfig(rawVfx);
  const stageConfig = parseStage3dConfig(await json(`${assets}/ui/stage3d.json`));
  const mapDir = stageConfig.battle.map;
  const backdropConfig = parseBackdropConfig(await json(`${assets}/${mapDir}/placement.json`));
  const catalog: SpriteCatalog | null = await loadCharacter(assets, 'kyle');
  if (!catalog) throw new Error('카일 매니페스트를 읽을 수 없다');
  const fxConfig = parseSpaceFx(await json(`${assets}/kyle/space-fx.json`));
  const strip = config.texture ? await loadStrip(`${assets}/kyle/${config.texture.file}`) : null;
  if (!strip) throw new Error('띠 질감(s1-strip.png)을 읽을 수 없다 — scripts/kyle_vfx_strip.py 로 만든다');
  readout.textContent = '그림 받는 중…';
  const backdropImages = new Map<string, HTMLImageElement>();
  await Promise.all(
    backdropConfig.layers.map(async (layer) => {
      const found = await image(`${assets}/${mapDir}/${layer.file}`);
      if (found) backdropImages.set(layer.file, found);
    }),
  );
  const wanted = [IDLE, HIT, READY, ...S1];
  const textures = new Map<string, THREE.Texture>();
  await Promise.all(
    wanted.map(async (id) => {
      const frame = catalog.frame(id);
      const found = await image(`${assets}/kyle/${frame.file}`);
      if (found) textures.set(id, frameTexture(found, frame, catalog.manifest.canvas.width, stageConfig.layout.textureMaxSide));
    }),
  );
  const missing = wanted.filter((id) => !textures.has(id));
  if (missing.includes(BODY)) throw new Error('원본 15 장이 없다');

  //── 장면: 게임과 같은 배경·인형·카메라 ──
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setScissorTest(true);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0c0b);
  const backdrop = new Backdrop(scene, backdropConfig);
  backdrop.build(backdropImages);
  //교전 중이라 근경(상단 철골·하단 잔해)은 숨긴다 (§9.5.1)
  for (const m of backdrop.combatHidden) m.visible = false;
  const H = stageConfig.layout.characterHeight;
  const worldPerPixel = H / catalog.characterHeight;

  //인형 셋: 평면 카일 · 공간형 카일 · 자리 표시 적. 평면·공간형 카일은 같은 자리에 서고 그릴 때만 갈린다
  const allyAt = new THREE.Vector3(space.lab.allyX, 0, 0);
  const flatDoll = new PaperDoll('flat', catalog, textures, worldPerPixel, 10);
  //공간형 카일은 몸만 남긴 장을 같은 장 id 로 붙인다 (S1 은 원본 그대로)
  const spaceDoll = new PaperDoll('space', catalog, new Map(textures), worldPerPixel, 10);
  const enemyDoll = new PaperDoll('enemy', catalog, textures, worldPerPixel, 11);
  for (const doll of [flatDoll, spaceDoll]) {
    doll.root.position.copy(allyAt);
    doll.setFacing(1);
  }
  enemyDoll.root.position.set(space.lab.enemyX, 0, 0);
  enemyDoll.setFacing(-1);
  enemyDoll.showFrame(HIT);
  scene.add(flatDoll.root, spaceDoll.root, enemyDoll.root);

  //몸 가림 판: 몸과 같은 모양, 색은 안 쓰고 깊이만 쓴다. 효과가 이 깊이에 가린다. 인형마다 하나, 장이 바뀌면 모양·그림을 바꾼다
  const occluderMaterials: THREE.MeshBasicMaterial[] = [];
  const plateCache = new Map<string, THREE.PlaneGeometry>();
  const plateOf = (id: string): THREE.PlaneGeometry => {
    let g = plateCache.get(id);
    if (!g) {
      g = plateGeometry(catalog.frame(id), worldPerPixel);
      plateCache.set(id, g);
    }
    return g;
  };
  const makeOccluder = (doll: PaperDoll): { set: (id: string | null, texture: THREE.Texture | undefined) => void; mesh: THREE.Mesh } => {
    const material = new THREE.MeshBasicMaterial({ alphaTest: space.occluderAlphaCut, colorWrite: false, depthWrite: true, side: THREE.DoubleSide, color: 0xff3df0 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0, 0), material);
    mesh.renderOrder = 9;
    mesh.visible = false;
    doll.visual.add(mesh);
    occluderMaterials.push(material);
    const set = (id: string | null, texture: THREE.Texture | undefined): void => {
      if (!id || !texture) {
        mesh.visible = false;
        return;
      }
      mesh.geometry = plateOf(id);
      if (material.map !== texture) {
        material.map = texture;
        material.needsUpdate = true;
      }
      mesh.visible = true;
    };
    return { set, mesh };
  };
  const kyleOcc = makeOccluder(spaceDoll);
  const kyleOccluder = kyleOcc.set;
  const enemyOcc = makeOccluder(enemyDoll);
  const enemyOccluder = enemyOcc.set;
  let enemyOccluderOn = false;

  //공간형 효과. 발 기준점에 붙인다
  const effect = new SpaceSlashEffect(config, space, H, strip, viewPitchDeg(backdropConfig.camera));
  effect.root.position.copy(allyAt);
  scene.add(effect.root);
  //S2·S3·결행 효과. 공간형 칸·평면 칸에 따로 보인다
  const spaceFxGroup = new THREE.Group();
  const flatFxGroup = new THREE.Group();
  scene.add(spaceFxGroup, flatFxGroup);

  //── 카메라 ──
  const camera = new THREE.PerspectiveCamera(backdrop.fov, 16 / 9, 0.1, 300);
  const rig = new CameraRig(camera, backdrop.homePosition, backdrop.homeLookAt, backdrop.fov, stageConfig.camera, stageConfig.shake);
  const chest = (doll: PaperDoll): THREE.Vector3 => doll.chest(H * 0.5);
  let shot: 'combat' | 'close' | 'home' = 'combat';
  //근접·궤도의 중심이 되는 인형. 결행은 적 둘레를 본다
  let pivotDoll: PaperDoll = flatDoll;
  let orbitDeg = 0;
  //궤도 높이: 카일 가슴을 중심으로 위로 올려 내려다본다 (도)
  let orbitUpDeg = 0;
  const applyShot = (): void => {
    if (shot !== 'home') rig.focus(chest(flatDoll), chest(enemyDoll), 1);
    else rig.release();
  };
  applyShot();
  //게임 카메라가 자리를 잡게 미리 흘린다
  for (let i = 0; i < 120; i++) rig.write(1 / 60, i / 60);
  //카메라를 쓰는 유일한 곳: 게임 리그를 흘리고, 근접이면 카일 가슴 쪽으로 다가가고, 궤도 각만큼 카일 발 둘레로 돌린다
  //궤도 조작 전 원근 카메라를 보관한다. 궤도만 돌릴 때는 효과가 공간에 그대로 남는다
  let realSec = 2;
  const paintCamera = camera.clone();
  const writeCamera = (dtSec: number): void => {
    realSec += dtSec;
    rig.write(Math.max(1e-4, dtSec), realSec);
    if (shot === 'close') camera.position.lerp(chest(pivotDoll), space.lab.closeIn);
    camera.updateMatrixWorld();
    paintCamera.copy(camera);
    if (orbitUpDeg !== 0) {
      const pivot = chest(pivotDoll);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const q = new THREE.Quaternion().setFromAxisAngle(right, (-orbitUpDeg * Math.PI) / 180);
      camera.position.sub(pivot).applyQuaternion(q).add(pivot);
      camera.quaternion.premultiply(q);
    }
    if (orbitDeg !== 0) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (orbitDeg * Math.PI) / 180);
      const foot = pivotDoll.root.position;
      camera.position.sub(foot).applyQuaternion(q).add(foot);
      camera.quaternion.premultiply(q);
    }
    camera.updateMatrixWorld();
  };

  //── 시계 ──
  const pre = space.preRollMs;
  const slashMs = slashDuration(config);
  const s1LoopMs = pre + slashMs + config.timingMs.bodyAfterHold;
  let loopMs = s1LoopMs;
  let skillId: SkillId = 's1';
  let current: LoadedSkill | null = null;
  const loaded = new Map<SkillId, LoadedSkill>();
  const loading = new Map<SkillId, Promise<LoadedSkill | null>>();
  let selectionRequest = 0;
  let pendingSkill: SkillId | null = null;
  let selectionError = '';
  let age = 0;
  let playing = true;
  let rate = 1;
  let loop = true;
  let view: View = 'side';
  let showOccluder = false;
  let occlusionOn = true;

  //시각에 맞춰 두 카일의 장·효과를 맞춘다
  const applyAge = (): void => {
    const enemyId = current?.skill.enemyFrame ?? HIT;
    enemyDoll.showFrame(enemyId);
    enemyOccluder(occlusionOn ? enemyId : null, textures.get(enemyId));
    enemyOccluderOn = occlusionOn;
    if (skillId === 's1' || !current) {
      const t = age - pre;
      flatDoll.showFrame(t < 0 ? READY : (S1[originalFrameAt(t, config.timingMs.reveal)] as string));
      const bodyId = t < 0 ? READY : BODY;
      spaceDoll.showFrame(bodyId);
      kyleOccluder(occlusionOn ? bodyId : null, textures.get(bodyId));
      effect.setAge(Math.max(0, t));
      if (t < 0) effect.root.visible = false;
      return;
    }
    const sk = current.skill;
    if (sk.scene === 'ultimate') {
      const kyleId = sk.kyleFrame ?? IDLE;
      flatDoll.showFrame(kyleId);
      spaceDoll.showFrame(kyleId);
      kyleOccluder(occlusionOn ? kyleId : null, textures.get(kyleId));
      for (const m of [...current.space, ...current.flat]) m.setTime(age);
      return;
    }
    //S2·S3: 준비 장 → 받은 장을 넘기고 끝나면 마지막 장을 붙잡는다
    const readyMs = sk.ready?.ms ?? 0;
    const track = sk.tracks[0];
    if (!track) return;
    const tt = age - readyMs;
    let id: string;
    if (sk.ready && tt < 0) id = sk.ready.flat;
    else {
      let i = trackFrameAt(track, tt);
      if (i < 0) i = tt < 0 ? 0 : track.frames.length - 1;
      id = track.frames[i]?.flat ?? IDLE;
    }
    flatDoll.showFrame(id);
    spaceDoll.showFrame(id);
    kyleOccluder(occlusionOn ? id : null, current.bodies.get(id) ?? textures.get(id));
    for (const m of current.space) m.setTime(tt);
  };

  //── 스킬 고르기 ──
  //효과 기준점 자리 (월드). 결행 베기는 적 몸통(발과 머리 중심의 중간), 물보라는 적 발, 밤물은 카일 발
  const enemyHitBase = (): [number, number] => {
    const frame = catalog.frame(HIT);
    const hx = (frame.headCenter.x - frame.anchor.x) * worldPerPixel * enemyDoll.facing;
    const hy = (frame.anchor.y - frame.headCenter.y) * worldPerPixel;
    return [hx / 2 / H, hy / 2 / H];
  };
  const buildSkill = async (id: SkillId): Promise<LoadedSkill | null> => {
    if (id === 's1') return null;
    const known = loaded.get(id);
    if (known) return known;
    const sk = fxConfig.skills.find((k) => k.id === id);
    if (!sk) throw new Error(`space-fx.json 에 ${id} 가 없다`);
    const flatIds = new Set<string>();
    if (sk.ready) flatIds.add(sk.ready.flat);
    if (sk.kyleFrame) flatIds.add(sk.kyleFrame);
    for (const t of sk.tracks) for (const f of t.frames) if (f.flat) flatIds.add(f.flat);
    //통합 장: 평면 카일·공간형 준비 장
    await Promise.all(
      [...flatIds].filter((fid) => !textures.has(fid)).map(async (fid) => {
        const frame = catalog.frame(fid);
        const found = await image(`${assets}/kyle/${frame.file}`);
        if (!found) return;
        const tex = frameTexture(found, frame, catalog.manifest.canvas.width, stageConfig.layout.textureMaxSide);
        textures.set(fid, tex);
        flatDoll.addFrame(fid, tex);
        spaceDoll.addFrame(fid, tex);
      }),
    );
    //몸만 남긴 장
    const bodies = new Map<string, THREE.Texture>();
    await Promise.all(
      sk.tracks.flatMap((t) =>
        t.frames
          .filter((f) => f.body && f.flat)
          .map(async (f) => {
            const fid = f.flat as string;
            const found = await image(`${assets}/kyle/${f.body as string}`);
            if (!found) return;
            const tex = frameTexture(found, catalog.frame(fid), catalog.manifest.canvas.width, stageConfig.layout.textureMaxSide);
            bodies.set(fid, tex);
            spaceDoll.addFrame(fid, tex);
          }),
      ),
    );
    //효과 장 + 메시
    const base = enemyHitBase();
    const spaceMeshes: SpaceFxTrackMesh[] = [];
    const flatMeshes: SpaceFxTrackMesh[] = [];
    for (const track of sk.tracks) {
      const texs = await Promise.all(
        track.frames.map(async (f) => {
          const found = await image(`${assets}/kyle/${f.fx}`);
          return found ? cropTexture(found, track, 1024) : null;
        }),
      );
      const k = hPerPixel(track, catalog.characterHeight);
      const at = track.anchor === 'enemyHit' ? base : ([0, 0] as const);
      const sm = new SpaceFxTrackMesh(fxConfig, track, texs, k, H, false, at);
      sm.root.userData['anchor'] = track.anchor;
      spaceFxGroup.add(sm.root);
      spaceMeshes.push(sm);
      //평면 칸: 결행만 효과 장을 따로 얹는다 (S2·S3 는 통합 장에 이미 있다)
      if (sk.scene === 'ultimate') {
        const fm = new SpaceFxTrackMesh(fxConfig, track, texs, k, H, true, at);
        fm.root.userData['anchor'] = track.anchor;
        flatFxGroup.add(fm.root);
        flatMeshes.push(fm);
      }
    }
    const result: LoadedSkill = { skill: sk, space: spaceMeshes, flat: flatMeshes, bodies };
    loaded.set(id, result);
    return result;
  };
  //같은 스킬을 빠르게 다시 골라도 텍스처와 메시를 중복 생성하지 않는다
  const loadSkill = (id: SkillId): Promise<LoadedSkill | null> => {
    const known = loading.get(id);
    if (known) return known;
    const request = buildSkill(id).finally(() => loading.delete(id));
    loading.set(id, request);
    return request;
  };
  //자리 잡기: 결행은 카일이 적 뒤 behindGap 자리에 선다. 그 밖에는 기본 자리
  const enemyAt = new THREE.Vector3(space.lab.enemyX, 0, 0);
  const placeActors = (): void => {
    const ult = current?.skill.scene === 'ultimate';
    const kyleAt = ult ? enemyAt.clone().add(new THREE.Vector3(current?.skill.behindGap ?? 1.1, 0, 0)) : allyAt;
    for (const doll of [flatDoll, spaceDoll]) doll.root.position.copy(kyleAt);
    enemyDoll.root.position.copy(enemyAt);
    pivotDoll = ult ? enemyDoll : flatDoll;
    for (const m of [...(current?.space ?? []), ...(current?.flat ?? [])]) {
      const anchor = m.root.userData['anchor'];
      m.root.position.copy(anchor === 'kyleFoot' ? kyleAt : enemyAt);
    }
  };
  const selectSkill = async (id: SkillId): Promise<void> => {
    const request = ++selectionRequest;
    pendingSkill = id;
    selectionError = '';
    let next: LoadedSkill | null;
    try {
      next = await loadSkill(id);
    } catch (error) {
      if (request !== selectionRequest) return;
      pendingSkill = null;
      selectionError = `불러오기 실패: ${String(error)}`;
      skillBox.value = skillId;
      return;
    }
    //늦게 끝난 이전 요청은 캐시에만 남기고 최신 선택·시간 범위를 덮지 않는다
    if (request !== selectionRequest) return;
    pendingSkill = null;
    for (const l of loaded.values()) for (const m of [...l.space, ...l.flat]) m.root.visible = false;
    skillId = id;
    skillBox.value = id;
    current = next;
    loopMs = next ? skillDuration(next.skill) + AFTER_HOLD : s1LoopMs;
    slider.max = String(loopMs);
    age = 0;
    slider.value = '0';
    placeActors();
    applyShot();
    resize();
  };

  //── 조작부 ──
  const playBtn = byId<HTMLButtonElement>('play');
  const slider = byId<HTMLInputElement>('time');
  slider.max = String(loopMs);
  const showPlay = (): void => {
    playBtn.textContent = playing ? '정지' : '재생';
    playBtn.setAttribute('aria-pressed', String(playing));
  };
  playBtn.addEventListener('click', () => {
    playing = !playing;
    showPlay();
  });
  byId<HTMLButtonElement>('replay').addEventListener('click', () => {
    age = 0;
    playing = true;
    showPlay();
  });
  slider.addEventListener('input', () => {
    playing = false;
    showPlay();
    age = Number(slider.value);
  });
  const rates = byId<HTMLElement>('rates');
  for (const r of config.test.playbackRates) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${r}×`;
    b.setAttribute('aria-pressed', String(r === rate));
    b.addEventListener('click', () => {
      rate = r;
      for (const x of rates.children) x.setAttribute('aria-pressed', String(x === b));
    });
    rates.append(b);
  }
  byId<HTMLInputElement>('loop').addEventListener('change', (e) => (loop = (e.target as HTMLInputElement).checked));
  const viewBox = byId<HTMLSelectElement>('viewmode');
  viewBox.addEventListener('change', () => {
    view = viewBox.value as View;
    resize();
  });
  const skillBox = byId<HTMLSelectElement>('skill');
  skillBox.addEventListener('change', () => {
    void selectSkill(skillBox.value as SkillId);
  });
  const shotBox = byId<HTMLSelectElement>('shot');
  shotBox.addEventListener('change', () => {
    shot = shotBox.value as typeof shot;
    applyShot();
  });
  const orbit = byId<HTMLInputElement>('orbit');
  const orbitOut = byId<HTMLOutputElement>('orbit-v');
  const showOrbit = (): void => {
    orbitOut.value = `${orbitDeg}°`;
  };
  orbit.addEventListener('input', () => {
    orbitDeg = Number(orbit.value);
    showOrbit();
  });
  showOrbit();
  const orbitUp = byId<HTMLInputElement>('orbit-up');
  const orbitUpOut = byId<HTMLOutputElement>('orbit-up-v');
  const showOrbitUp = (): void => {
    orbitUpOut.value = `${orbitUpDeg}°`;
  };
  orbitUp.addEventListener('input', () => {
    orbitUpDeg = Number(orbitUp.value);
    showOrbitUp();
  });
  showOrbitUp();
  //층 켜고 끄기
  const layerBox = (id: string, apply: (on: boolean) => void): void => {
    const box = byId<HTMLInputElement>(id);
    box.addEventListener('change', () => apply(box.checked));
    apply(box.checked);
  };
  let fxOn = true;
  layerBox('ly-ribbon', (on) => {
    effect.layers.ribbon = on;
    fxOn = on;
  });
  layerBox('ly-glow', (on) => (effect.layers.glow = on));
  layerBox('ly-drops', (on) => (effect.layers.droplets = on));
  layerBox('ly-ripples', (on) => (effect.layers.ripples = on));
  layerBox('ly-occlude', (on) => (occlusionOn = on));
  layerBox('opt-flow', (on) => (effect.options.flow = on));
  layerBox('opt-sparkle', (on) => (effect.options.sparkle = on));
  //가림 판 보기: 깊이 판을 자홍으로 칠하고 몸 그림을 옅게
  layerBox('ly-mask', (on) => {
    showOccluder = on;
    for (const m of occluderMaterials) m.colorWrite = on;
    spaceDoll.setOpacity(on ? 0.35 : 1);
    enemyDoll.setOpacity(on ? 0.35 : 1);
  });
  showPlay();

  //── 화면 나누기: 16:9 칸 하나 또는 둘 (넓으면 옆으로, 좁으면 위아래) ──
  const labels = [byId<HTMLElement>('label-a'), byId<HTMLElement>('label-b')];
  let panels: { x: number; y: number; w: number; h: number; kind: 'flat' | 'space' }[] = [];
  const resize = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    const fit = (cw: number, ch: number): { w: number; h: number } => (cw / ch > 16 / 9 ? { w: ch * (16 / 9), h: ch } : { w: cw, h: cw * (9 / 16) });
    if (view === 'side') {
      const across = fit(w / 2, h);
      const stacked = fit(w, h / 2);
      if (across.w * across.h >= stacked.w * stacked.h) {
        const x0 = (w - across.w * 2) / 2;
        const y0 = (h - across.h) / 2;
        panels = [
          { x: x0, y: y0, w: across.w, h: across.h, kind: 'flat' },
          { x: x0 + across.w, y: y0, w: across.w, h: across.h, kind: 'space' },
        ];
      } else {
        const x0 = (w - stacked.w) / 2;
        const y0 = (h - stacked.h * 2) / 2;
        panels = [
          { x: x0, y: y0, w: stacked.w, h: stacked.h, kind: 'flat' },
          { x: x0, y: y0 + stacked.h, w: stacked.w, h: stacked.h, kind: 'space' },
        ];
      }
    } else {
      const one = fit(w, h);
      panels = [{ x: (w - one.w) / 2, y: (h - one.h) / 2, w: one.w, h: one.h, kind: view }];
    }
    effect.setViewportHeight((panels[0]?.h ?? h) * ratio);
    labels.forEach((label, i) => {
      const p = panels[i];
      label.hidden = !p;
      if (!p) return;
      label.style.left = `${p.x + 8}px`;
      label.style.top = `${p.y + 8}px`;
      label.textContent = p.kind === 'flat' ? (skillId === 's1' ? '평면 재생 (원본 15장)' : '평면 재생 (게임과 같은 장)') : skillId === 's1' ? '공간형 (§15.3)' : '공간형 (§15.4 투영 곡면)';
    });
  };
  window.addEventListener('resize', resize);
  resize();

  //한 칸 그리기. 그 칸의 카일만 보이게 한다. 둘 다 같은 카메라
  const drawPanel = (p: (typeof panels)[number]): void => {
    const h = canvas.clientHeight;
    flatDoll.root.visible = p.kind === 'flat';
    spaceDoll.root.visible = p.kind === 'space';
    const spaceVisible = p.kind === 'space';
    const t = age - pre;
    effect.root.visible = skillId === 's1' && spaceVisible && t >= 0 && slashSample(config, t).alive;
    spaceFxGroup.visible = fxOn && spaceVisible;
    flatFxGroup.visible = fxOn && p.kind === 'flat';
    //적 가림 판은 공간형 칸에서만 (적 인형은 두 칸 다 보인다)
    enemyOcc.mesh.visible = spaceVisible && enemyOccluderOn;
    renderer.setViewport(p.x, h - p.y - p.h, p.w, p.h);
    renderer.setScissor(p.x, h - p.y - p.h, p.w, p.h);
    renderer.render(scene, camera);
  };

  let last = performance.now();
  const frame = (now: number): void => {
    requestAnimationFrame(frame);
    const dtReal = Math.max(0, Math.min(100, now - last));
    last = now;
    if (playing) {
      //배속은 여기서 한 번만 곱한다
      age += dtReal * rate;
      if (age >= loopMs) {
        if (loop) age = 0;
        else {
          age = loopMs;
          playing = false;
          showPlay();
        }
      }
    }
    slider.value = String(Math.round(age));
    applyAge();
    writeCamera(dtReal / 1000);
    for (const doll of [flatDoll, spaceDoll, enemyDoll]) doll.faceCamera(camera);
    if (skillId === 's1') effect.orient(paintCamera);
    const foregroundAt = current?.skill.scene === 'self' ? enemyDoll.root.position : undefined;
    for (const m of [...(current?.space ?? []), ...(current?.flat ?? [])]) m.orient(paintCamera, foregroundAt);
    renderer.setScissor(0, 0, canvas.clientWidth, canvas.clientHeight);
    renderer.setViewport(0, 0, canvas.clientWidth, canvas.clientHeight);
    renderer.clear();
    for (const p of panels) drawPanel(p);
    const t = age - pre;
    const s = slashSample(config, Math.max(0, t));
    readout.textContent = (pendingSkill ? `${pendingSkill.toUpperCase()} 그림 받는 중… · ` : selectionError ? `${selectionError} · ` : '') +
      `시각 ${age.toFixed(0).padStart(4, ' ')} ms${skillId === 's1' ? ` (타 ${t.toFixed(0)} ms)` : ''} · ${rate}× · ` +
      (skillId !== 's1'
        ? `${current?.skill.name ?? ''} · 장 ${current ? current.skill.tracks.map((tr) => trackFrameAt(tr, age - (current?.skill.ready?.ms ?? 0)) + 1).join('/') : ''}`
        : t < 0
          ? '준비 장'
          : `head ${s.head.toFixed(3)} · tail ${s.tail.toFixed(3)} · 평면 장 ${String(originalFrameAt(t, config.timingMs.reveal) + 1).padStart(2, '0')}`) +
      ` · 카메라 ${shot === 'combat' ? '교전' : shot === 'close' ? '근접' : '대기'} 궤도 ${orbitDeg}° · 높이 ${orbitUpDeg}°${showOccluder ? ' · 가림 판 보기' : ''}${missing.length ? ` · 없는 장 ${missing.join(', ')}` : ''}`;
  };
  requestAnimationFrame(frame);

  //검수 자동화용 손잡이 (캡처 스크립트가 쓴다)
  (window as unknown as { __vfxSpace: unknown }).__vfxSpace = {
    seek: (ms: number) => {
      playing = false;
      showPlay();
      age = Math.max(0, Math.min(loopMs, ms));
    },
    play: () => {
      playing = true;
      showPlay();
    },
    view: (v: View) => {
      view = v;
      viewBox.value = v;
      resize();
    },
    shot: (s: 'combat' | 'close' | 'home') => {
      shot = s;
      shotBox.value = s;
      applyShot();
    },
    orbit: (deg: number, up = 0) => {
      orbitDeg = deg;
      orbit.value = String(deg);
      showOrbit();
      orbitUpDeg = up;
      orbitUp.value = String(up);
      showOrbitUp();
    },
    layer: (id: string, on: boolean) => {
      const box = byId<HTMLInputElement>(id);
      box.checked = on;
      box.dispatchEvent(new Event('change'));
    },
    skill: async (id: SkillId) => {
      skillBox.value = id;
      await selectSkill(id);
    },
    state: () => ({ skill: skillId, selected: skillBox.value, pendingSkill, selectionError, age, pre, loopMs, enemyOcclusion: enemyOccluderOn, calls: renderer.info.render.calls, programs: renderer.info.programs?.length ?? 0 }),
  };
}

void main().catch((error: unknown) => {
  const box = document.getElementById('readout');
  if (box) box.textContent = `불러오기 실패: ${String(error)}`;
});
