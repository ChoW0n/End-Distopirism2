//물금 공간형 VFX 시험 화면 (SPEC-005 §15.3). 게임과 같은 무대·같은 카메라에서 평면 재생과 공간형을 나란히 본다
//평면: 게임 종이 인형 판에 원본 S1 장(norm/11-skill1-01~15)을 §12.5 곡선 박자로 넘긴다 (원본은 읽기만 한다)
//공간형: 원본 15 장 몸 판 + 깊이만 쓰는 몸 가림 판 + 휜 띠 메시 + 깊이별 물방울 + 지면 물결
//카메라: 게임 CameraRig 그대로(교전·대기) + 궤도 막대. 카메라 변환을 쓰는 곳은 writeCamera 하나다
//시계: 효과 시각은 게임 시간. 실제 경과에 배속을 한 번만 곱해 더한다

import * as THREE from 'three';
import { parseRibbonConfig, slashDuration, slashSample, originalFrameAt } from '../render/ribbon-slash.js';
import { parseSpaceConfig } from '../render/space-slash.js';
import type { SpriteCatalog } from '../render/manifest.js';
import { loadCharacter } from '../renderer/assets.js';
import { Backdrop } from './backdrop.js';
import { CameraRig } from './camera.js';
import { parseBackdropConfig, parseStage3dConfig } from './config.js';
import { PaperDoll, frameTexture, plateGeometry } from './doll.js';
import { SpaceSlashEffect } from './space-slash.js';
import { loadStrip } from './strip-loader.js';

//쓰는 장 id. 준비 장, 원본 S1 15장, 대기(인형 기본), 맞은 장(자리 표시 적)
const READY = '11-skill1-ready';
const S1 = Array.from({ length: 15 }, (_, i) => `11-skill1-${String(i + 1).padStart(2, '0')}`);
const BODY = '11-skill1-15';
const IDLE = '00-idle';
const HIT = '04-hit';

type View = 'side' | 'flat' | 'space';

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
  const spaceDoll = new PaperDoll('space', catalog, textures, worldPerPixel, 10);
  const enemyDoll = new PaperDoll('enemy', catalog, textures, worldPerPixel, 11);
  for (const doll of [flatDoll, spaceDoll]) {
    doll.root.position.copy(allyAt);
    doll.setFacing(1);
  }
  enemyDoll.root.position.set(space.lab.enemyX, 0, 0);
  enemyDoll.setFacing(-1);
  enemyDoll.showFrame(HIT);
  scene.add(flatDoll.root, spaceDoll.root, enemyDoll.root);

  //몸 가림 판: 공간형 몸과 같은 모양, 색은 안 쓰고 깊이만 쓴다. 띠·물방울·물결이 이 깊이에 가린다
  const occluders = new Map<string, THREE.Mesh>();
  const occluderMaterials: THREE.MeshBasicMaterial[] = [];
  for (const id of [READY, BODY]) {
    const texture = textures.get(id);
    if (!texture) continue;
    const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: space.occluderAlphaCut, colorWrite: false, depthWrite: true, side: THREE.DoubleSide, color: 0xff3df0 });
    const mesh = new THREE.Mesh(plateGeometry(catalog.frame(id), worldPerPixel), material);
    mesh.renderOrder = 9;
    mesh.visible = false;
    spaceDoll.visual.add(mesh);
    occluders.set(id, mesh);
    occluderMaterials.push(material);
  }

  //공간형 효과. 발 기준점에 붙인다
  const effect = new SpaceSlashEffect(config, space, H, strip);
  effect.root.position.copy(allyAt);
  scene.add(effect.root);

  //── 카메라 ──
  const camera = new THREE.PerspectiveCamera(backdrop.fov, 16 / 9, 0.1, 300);
  const rig = new CameraRig(camera, backdrop.homePosition, backdrop.homeLookAt, backdrop.fov, stageConfig.camera, stageConfig.shake);
  const chest = (doll: PaperDoll): THREE.Vector3 => doll.chest(H * 0.5);
  let shot: 'combat' | 'close' | 'home' = 'combat';
  let orbitDeg = 0;
  const applyShot = (): void => {
    if (shot !== 'home') rig.focus(chest(flatDoll), chest(enemyDoll), 1);
    else rig.release();
  };
  applyShot();
  //게임 카메라가 자리를 잡게 미리 흘린다
  for (let i = 0; i < 120; i++) rig.write(1 / 60, i / 60);
  //카메라를 쓰는 유일한 곳: 게임 리그를 흘리고, 근접이면 카일 가슴 쪽으로 다가가고, 궤도 각만큼 카일 발 둘레로 돌린다
  //궤도 전 게임 카메라 회전은 baseQuat 에 남긴다 (원화 판 방향 = 공간형 띠 방향)
  let realSec = 2;
  const baseQuat = new THREE.Quaternion();
  const writeCamera = (dtSec: number): void => {
    realSec += dtSec;
    rig.write(Math.max(1e-4, dtSec), realSec);
    baseQuat.copy(camera.quaternion);
    if (shot === 'close') camera.position.lerp(chest(flatDoll), space.lab.closeIn);
    if (orbitDeg !== 0) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (orbitDeg * Math.PI) / 180);
      camera.position.sub(allyAt).applyQuaternion(q).add(allyAt);
      camera.quaternion.premultiply(q);
    }
    camera.updateMatrixWorld();
  };

  //── 시계 ──
  const pre = space.preRollMs;
  const slashMs = slashDuration(config);
  const loopMs = pre + slashMs + config.timingMs.bodyAfterHold;
  let age = 0;
  let playing = true;
  let rate = 1;
  let loop = true;
  let view: View = 'side';
  let showOccluder = false;
  let occlusionOn = true;

  //시각에 맞춰 두 카일의 장·효과를 맞춘다
  const applyAge = (): void => {
    const t = age - pre;
    flatDoll.showFrame(t < 0 ? READY : (S1[originalFrameAt(t, config.timingMs.reveal)] as string));
    const bodyId = t < 0 ? READY : BODY;
    spaceDoll.showFrame(bodyId);
    for (const [id, mesh] of occluders) mesh.visible = occlusionOn && id === bodyId;
    effect.setAge(Math.max(0, t));
    if (t < 0) effect.root.visible = false;
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
  //층 켜고 끄기
  const layerBox = (id: string, apply: (on: boolean) => void): void => {
    const box = byId<HTMLInputElement>(id);
    box.addEventListener('change', () => apply(box.checked));
    apply(box.checked);
  };
  layerBox('ly-ribbon', (on) => (effect.layers.ribbon = on));
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
      label.textContent = p.kind === 'flat' ? '평면 재생 (원본 15장)' : '공간형 (§15.3)';
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
    effect.root.visible = spaceVisible && t >= 0 && slashSample(config, t).alive;
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
    effect.orient(baseQuat);
    renderer.setScissor(0, 0, canvas.clientWidth, canvas.clientHeight);
    renderer.setViewport(0, 0, canvas.clientWidth, canvas.clientHeight);
    renderer.clear();
    for (const p of panels) drawPanel(p);
    const t = age - pre;
    const s = slashSample(config, Math.max(0, t));
    readout.textContent =
      `시각 ${age.toFixed(0).padStart(4, ' ')} ms (타 ${t.toFixed(0)} ms) · ${rate}× · ` +
      (t < 0 ? '준비 장' : `head ${s.head.toFixed(3)} · tail ${s.tail.toFixed(3)} · 평면 장 ${String(originalFrameAt(t, config.timingMs.reveal) + 1).padStart(2, '0')}`) +
      ` · 카메라 ${shot === 'combat' ? '교전' : shot === 'close' ? '근접' : '대기'} ${orbitDeg}°${showOccluder ? ' · 가림 판 보기' : ''}${missing.length ? ` · 없는 장 ${missing.join(', ')}` : ''}`;
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
    orbit: (deg: number) => {
      orbitDeg = deg;
      orbit.value = String(deg);
      showOrbit();
    },
    layer: (id: string, on: boolean) => {
      const box = byId<HTMLInputElement>(id);
      box.checked = on;
      box.dispatchEvent(new Event('change'));
    },
    state: () => ({ age, pre, loopMs, calls: renderer.info.render.calls, programs: renderer.info.programs?.length ?? 0 }),
  };
}

void main().catch((error: unknown) => {
  const box = document.getElementById('readout');
  if (box) box.textContent = `불러오기 실패: ${String(error)}`;
});
