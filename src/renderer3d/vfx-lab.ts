//물금 실시간 VFX 효과 단독 실험 화면 (SPEC-005 §15.1 단계 B). 캐릭터 없이 경로·소멸만 본다
//고정 원근 카메라, 배경 4색, 배속·프레임 상한·시크, 경로·꼬리/머리·u 화살표·발 기준점 표시
//시계: 효과 시각은 게임 시간. 실제 경과에 배속을 한 번만 곱해 더한다 (역경직 없는 실험 화면)

import * as THREE from 'three';
import { arcLengthPoints, parseRibbonConfig, slashDuration, slashSample, type RibbonSlashConfig } from '../render/ribbon-slash.js';
import { RibbonSlashEffect, type RibbonHandle } from './ribbon-slash.js';

//실험 화면 캐릭터 키(월드). 경로·폭은 이 배수로 잡힌다
const H = 2;

function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`실험 화면 요소가 없다: #${id}`);
  return found as T;
}

//경로·꼬리/머리·u 방향·발 기준점 표시. 효과와 같은 좌우 반전을 받는다
function buildDebug(config: RibbonSlashConfig): THREE.Group {
  const group = new THREE.Group();
  const pts = arcLengthPoints(config.path.points, 128);
  const positions: number[] = [];
  const colors: number[] = [];
  const tailColor = new THREE.Color('#ff9a3c');
  const headColor = new THREE.Color('#5ee07a');
  for (const pt of pts) {
    positions.push(pt.p[0] * H, pt.p[1] * H, 0.002);
    const c = tailColor.clone().lerp(headColor, pt.u);
    colors.push(c.r, c.g, c.b);
  }
  const line = new THREE.BufferGeometry();
  line.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  line.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  group.add(new THREE.Line(line, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false })));
  const dot = (color: THREE.Color, x: number, y: number, r: number): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color, depthTest: false }));
    m.position.set(x, y, 0.004);
    m.renderOrder = 50;
    return m;
  };
  const first = pts[0] as (typeof pts)[number];
  const last = pts[pts.length - 1] as (typeof pts)[number];
  group.add(dot(tailColor, first.p[0] * H, first.p[1] * H, 0.06), dot(headColor, last.p[0] * H, last.p[1] * H, 0.06));
  //u 방향 화살표: 가운데에서 진행 방향으로
  for (const at of [0.25, 0.5, 0.75]) {
    const pt = pts[Math.round(at * (pts.length - 1))] as (typeof pts)[number];
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 12), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false }));
    cone.position.set(pt.p[0] * H, pt.p[1] * H, 0.006);
    cone.rotation.z = Math.atan2(pt.tangent[1], pt.tangent[0]) - Math.PI / 2;
    cone.renderOrder = 51;
    group.add(cone);
  }
  //발 기준점 십자 (경로 원점)
  const cross = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.15, 0, 0.004),
    new THREE.Vector3(0.15, 0, 0.004),
    new THREE.Vector3(0, -0.15, 0.004),
    new THREE.Vector3(0, 0.15, 0.004),
  ]);
  group.add(new THREE.LineSegments(cross, new THREE.LineBasicMaterial({ color: '#ff4d6d', depthTest: false })));
  group.children.forEach((c) => (c.renderOrder = Math.max(c.renderOrder, 49)));
  return group;
}

async function main(): Promise<void> {
  const canvas = byId<HTMLCanvasElement>('view');
  const assets = canvas.dataset['assets'] ?? '../assets';
  const config = parseRibbonConfig(await (await fetch(`${assets}/kyle/realtime-vfx.json`)).json());
  const total = slashDuration(config);
  //결과 자세 여운까지 한 바퀴 (본체가 없어 빈 화면으로 기다린다)
  const loopMs = total + config.timingMs.bodyAfterHold;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  //고정 원근 카메라. 경로가 화면 가운데 오게
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
  camera.position.set(0.6, 1.3, 9.5);
  camera.lookAt(0.6, 1.3, 0);

  //바닥선 (발 높이)
  const ground = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-6, 0, 0), new THREE.Vector3(6, 0, 0)]),
    new THREE.LineBasicMaterial({ color: '#808080', transparent: true, opacity: 0.4 }),
  );
  scene.add(ground);

  const fx = new RibbonSlashEffect(config, H);
  scene.add(fx.root);
  const debug = buildDebug(config);
  scene.add(debug);

  //상태
  let facing: 1 | -1 = 1;
  let handle: RibbonHandle | null = null;
  let age = 0;
  let realElapsed = 0;
  let playing = true;
  let rate = 1;
  let fpsCap = 0;
  let loop = true;
  let lastTime = performance.now();
  let lastFrame = 0;

  //효과를 새로 만든다. 이전 것은 취소한다 (중복 발동 없음)
  const restart = (): void => {
    fx.clear();
    handle = fx.spawn(new THREE.Vector3(0, 0, 0), facing);
    age = 0;
    realElapsed = 0;
  };

  //시각을 정한다. 효과가 이미 내려갔으면 새로 만들어 그 시각으로
  const seek = (ms: number): void => {
    if (!handle || fx.ageOf(handle.id) === null) restart();
    age = Math.max(0, Math.min(loopMs, ms));
    if (handle) fx.seek(handle.id, age);
  };

  //── 조작부 ──
  const playBtn = byId<HTMLButtonElement>('play');
  const slider = byId<HTMLInputElement>('time');
  const readout = byId<HTMLElement>('readout');
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
    restart();
    playing = true;
    showPlay();
  });
  slider.addEventListener('input', () => {
    playing = false;
    showPlay();
    seek(Number(slider.value));
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
  const fpsBox = byId<HTMLElement>('fps');
  for (const f of [0, ...config.test.fps]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = f === 0 ? '제한 없음' : `${f}fps`;
    b.setAttribute('aria-pressed', String(f === fpsCap));
    b.addEventListener('click', () => {
      fpsCap = f;
      for (const x of fpsBox.children) x.setAttribute('aria-pressed', String(x === b));
    });
    fpsBox.append(b);
  }
  const bgBox = byId<HTMLElement>('bg');
  const setBg = (hex: string): void => {
    renderer.setClearColor(new THREE.Color().setStyle(hex, THREE.SRGBColorSpace));
    document.body.style.setProperty('--bg', hex);
  };
  config.test.backgrounds.forEach((hex, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = hex;
    b.title = hex;
    b.setAttribute('aria-label', `배경 ${hex}`);
    b.setAttribute('aria-pressed', String(i === 0));
    b.addEventListener('click', () => {
      setBg(hex);
      for (const x of bgBox.children) x.setAttribute('aria-pressed', String(x === b));
    });
    bgBox.append(b);
  });
  setBg(config.test.backgrounds[0] ?? '#101820');
  const facingBtn = byId<HTMLButtonElement>('facing');
  facingBtn.addEventListener('click', () => {
    facing = facing === 1 ? -1 : 1;
    debug.scale.x = facing;
    facingBtn.textContent = facing === 1 ? '방향: 오른쪽' : '방향: 왼쪽';
    const keep = age;
    restart();
    seek(keep);
  });
  const debugBox = byId<HTMLInputElement>('debug');
  debugBox.addEventListener('change', () => (debug.visible = debugBox.checked));
  const edgeBox = byId<HTMLInputElement>('edge');
  edgeBox.addEventListener('change', () => {
    fx.edgeEnabled = edgeBox.checked;
    if (handle) fx.seek(handle.id, age);
  });
  const loopBox = byId<HTMLInputElement>('loop');
  loopBox.addEventListener('change', () => (loop = loopBox.checked));
  showPlay();

  const resize = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const frame = (now: number): void => {
    requestAnimationFrame(frame);
    //프레임 상한: 상한 간격이 지나기 전이면 그리지도 흘리지도 않는다. 흘릴 때는 지난 그린 프레임부터의 실제 시간 전부
    if (fpsCap > 0 && now - lastFrame < 1000 / fpsCap - 0.5) return;
    const dtReal = Math.min(100, now - lastTime);
    lastTime = now;
    lastFrame = now;
    if (playing) {
      realElapsed += dtReal;
      //배속은 여기서 한 번만 곱한다
      const dtGame = dtReal * rate;
      age += dtGame;
      if (handle) fx.update(dtGame);
      if (age >= loopMs) {
        if (loop) restart();
        else playing = false;
        showPlay();
      }
    }
    slider.value = String(Math.round(Math.min(age, loopMs)));
    const s = slashSample(config, age);
    readout.textContent =
      `효과 시각 ${age.toFixed(0).padStart(4, ' ')} ms (게임 시간) · 실제 경과 ${realElapsed.toFixed(0)} ms · ${rate}× · ` +
      `head ${s.head.toFixed(3)} · tail ${s.tail.toFixed(3)} · 활성 ${fx.activeCount}`;
    renderer.render(scene, camera);
  };
  requestAnimationFrame(frame);
  restart();

  //검수 자동화용 손잡이 (캡처 스크립트가 쓴다)
  (window as unknown as { __vfxLab: unknown }).__vfxLab = {
    seek: (ms: number) => seek(ms),
    pause: () => {
      playing = false;
      showPlay();
    },
    play: () => {
      playing = true;
      showPlay();
    },
    restart,
    state: () => ({
      age,
      ...slashSample(config, age),
      active: fx.activeCount,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0,
      calls: renderer.info.render.calls,
    }),
  };
}

void main().catch((error: unknown) => {
  const box = document.getElementById('readout');
  if (box) box.textContent = `불러오기 실패: ${String(error)}`;
});
