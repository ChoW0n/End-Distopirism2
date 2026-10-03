//물금 실시간 VFX 효과 단독 실험 화면 (SPEC-005 §15.1 단계 B). 캐릭터 없이 경로·소멸만 본다
//고정 원근 카메라, 배경 4색, 배속·프레임 상한·시크, 경로·꼬리/머리·u 화살표·발 기준점 표시
//질감 방식(§15.2): 받은 효과 레이어 띠 텍스처 + 화려함 옵션(흐름·머리 섬광·빛 번짐·반짝임·흩어짐·추가 물방울)을 하나씩 켜고 끈다. 절차 방식(§15.1)과 전환해 비교
//원본 비교: 원본 S1 통합 장(norm/11-skill1-*)을 같은 발 기준·같은 크기로 나란히 또는 겹쳐 같은 시각에 돌린다 (참고용)
//시계: 효과 시각은 게임 시간. 실제 경과에 배속을 한 번만 곱해 더한다 (역경직 없는 실험 화면)

import * as THREE from 'three';
import { arcLengthPoints, parseRibbonConfig, slashDuration, slashSample, type RibbonSlashConfig } from '../render/ribbon-slash.js';
import { RibbonSlashEffect, type RibbonHandle, type StripSource } from './ribbon-slash.js';
import type { RibbonOptions } from '../render/ribbon-slash.js';

//실험 화면 캐릭터 키(월드). 경로·폭은 이 배수로 잡힌다
const H = 2;
//원본 장 규격 (sprite-manifest.json): 캔버스 1700x720, 발 [760,600], 캐릭터 키 = 대기 몸 높이 580px
const SHEET = { w: 1700, h: 720, footX: 760, footY: 600, bodyPx: 580 } as const;
//원본 S1 장 이름. 01 타 장, 02~14 잔흔, 15 마무리
const ORIGINAL_FRAMES = Array.from({ length: 15 }, (_, i) => `11-skill1-${String(i + 1).padStart(2, '0')}`);

//시각 → 원본 장 번호(0~14). 01 은 전개 동안, 잔흔 02~14 는 §12.5 곡선(T·(i/n)^(1/k), k=2)으로 780ms, 그 뒤 15
function originalFrameAt(ageMs: number, revealMs: number): number {
  if (ageMs < revealMs) return 0;
  const n = 13;
  const T = 780;
  const t = ageMs - revealMs;
  if (t >= T) return 14;
  for (let i = n - 1; i >= 0; i--) if (t >= T * Math.pow(i / n, 1 / 2)) return 1 + i;
  return 1;
}

//띠 텍스처를 읽는다. 그림과 같은 그림의 RGBA 바이트(흩어짐 칸 고르기용). 없으면 null
async function loadStrip(url: string): Promise<StripSource | null> {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { image, pixels: data.data, width: canvas.width, height: canvas.height };
}

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

  //원본 비교 장 (없으면 비교만 빠진다)
  const loader = new THREE.TextureLoader();
  const originals = await Promise.all(
    ORIGINAL_FRAMES.map(
      (id) =>
        new Promise<THREE.Texture | null>((resolve) =>
          loader.load(
            `${assets}/kyle/norm/${id}.png`,
            (t) => {
              t.colorSpace = THREE.SRGBColorSpace;
              resolve(t);
            },
            undefined,
            () => resolve(null),
          ),
        ),
    ),
  );

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  //고정 원근 카메라. 비교 방식에 따라 거리만 바꾼다
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
  const frameCamera = (wide: boolean): void => {
    camera.position.set(wide ? 0 : -0.3, 0.9, wide ? 12 : 7.5);
    camera.lookAt(wide ? 0 : -0.3, 0.9, 0);
  };
  frameCamera(false);

  //바닥선 (발 높이)
  const ground = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-6, 0, 0), new THREE.Vector3(6, 0, 0)]),
    new THREE.LineBasicMaterial({ color: '#808080', transparent: true, opacity: 0.4 }),
  );
  scene.add(ground);

  //실시간 효과 자리 (나란히 비교면 오른쪽으로 옮긴다)
  const live = new THREE.Group();
  scene.add(live);
  //질감 방식(띠 텍스처가 있으면)과 절차 방식 둘 다 만들어 두고 전환한다
  const strip = config.texture ? await loadStrip(`${assets}/kyle/${config.texture.file}`) : null;
  const procedural = new RibbonSlashEffect(config, H);
  const textured = strip ? new RibbonSlashEffect(config, H, strip) : null;
  live.add(procedural.root);
  if (textured) live.add(textured.root);
  let fx = textured ?? procedural;
  const debug = buildDebug(config);
  live.add(debug);

  //원본 장 판. 발 기준점이 원점에 오게 놓는다
  const px = H / SHEET.bodyPx;
  const originalMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 1 });
  const original = new THREE.Mesh(new THREE.PlaneGeometry(SHEET.w * px, SHEET.h * px), originalMaterial);
  original.position.set((SHEET.w / 2 - SHEET.footX) * px, (SHEET.footY - SHEET.h / 2) * px, -0.01);
  original.renderOrder = 5;
  const originalRoot = new THREE.Group();
  originalRoot.add(original);
  scene.add(originalRoot);
  let compare: 'off' | 'side' | 'over' = 'side';
  const applyCompare = (): void => {
    const has = originals.some((t) => t);
    originalRoot.visible = has && compare !== 'off';
    originalMaterial.opacity = compare === 'over' ? 0.5 : 1;
    originalRoot.position.x = compare === 'side' ? -2.4 : 0;
    live.position.x = compare === 'side' ? 2.4 : 0;
    frameCamera(compare === 'side');
  };

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
  const glowBox = byId<HTMLInputElement>('glow');
  glowBox.addEventListener('change', () => {
    procedural.glowEnabled = glowBox.checked;
    if (handle) fx.seek(handle.id, age);
  });
  const dropBox = byId<HTMLInputElement>('drops');
  dropBox.addEventListener('change', () => {
    procedural.dropletsEnabled = dropBox.checked;
    if (handle) fx.seek(handle.id, age);
  });
  //질감 방식 화려함 옵션. 켜고 끄면 같은 시각을 다시 그린다
  const optionKeys: (keyof RibbonOptions)[] = ['flow', 'flare', 'glow', 'sparkle', 'spray', 'extraDroplets'];
  const setOption = (key: keyof RibbonOptions, on: boolean): void => {
    if (textured) textured.options[key] = on;
    const box = document.getElementById(`opt-${key}`) as HTMLInputElement | null;
    if (box) box.checked = on;
    if (handle) fx.seek(handle.id, age);
  };
  for (const key of optionKeys) {
    const box = byId<HTMLInputElement>(`opt-${key}`);
    box.checked = textured ? textured.options[key] : false;
    box.addEventListener('change', () => setOption(key, box.checked));
  }
  byId<HTMLButtonElement>('opt-all').addEventListener('click', () => optionKeys.forEach((k) => setOption(k, k !== 'extraDroplets')));
  byId<HTMLButtonElement>('opt-none').addEventListener('click', () => optionKeys.forEach((k) => setOption(k, false)));
  //기본값: 설정 파일의 options (흐름·반짝임)
  byId<HTMLButtonElement>('opt-default').addEventListener('click', () => optionKeys.forEach((k) => setOption(k, config.options?.[k] ?? false)));
  //색 보정 막대 (밝기·채도). 같은 시각을 다시 그린다
  const gradeBox = (key: 'brightness' | 'saturation' | 'gamma', id: string): void => {
    const input = byId<HTMLInputElement>(id);
    const out = byId<HTMLOutputElement>(`${id}-v`);
    const show = (): void => {
      out.value = Number(input.value).toFixed(2);
    };
    input.value = String(textured ? textured.grade[key] : 1);
    input.disabled = !textured;
    show();
    input.addEventListener('input', () => {
      if (textured) textured.grade[key] = Number(input.value);
      show();
      if (handle) fx.seek(handle.id, age);
    });
  };
  gradeBox('brightness', 'grade-bright');
  gradeBox('saturation', 'grade-sat');
  gradeBox('gamma', 'grade-gamma');
  //방식 전환: 질감 ↔ 절차. 같은 시각에서 이어 본다
  const modeBox = byId<HTMLSelectElement>('mode');
  const texRow = byId<HTMLElement>('tex-options');
  const procRow = byId<HTMLElement>('proc-options');
  const setMode = (mode: 'texture' | 'procedural'): void => {
    const next = mode === 'texture' && textured ? textured : procedural;
    modeBox.value = next === textured ? 'texture' : 'procedural';
    texRow.hidden = next !== textured;
    procRow.hidden = next === textured;
    if (next === fx) return;
    const keep = age;
    fx.clear();
    fx = next;
    restart();
    seek(keep);
  };
  if (!textured) {
    (modeBox.querySelector('option[value="texture"]') as HTMLOptionElement).disabled = true;
    (modeBox.querySelector('option[value="texture"]') as HTMLOptionElement).textContent = '원본 질감 (띠 텍스처 없음)';
  }
  modeBox.addEventListener('change', () => setMode(modeBox.value as 'texture' | 'procedural'));
  setMode(textured ? 'texture' : 'procedural');
  const compareBox = byId<HTMLSelectElement>('compare');
  compareBox.addEventListener('change', () => {
    compare = compareBox.value as typeof compare;
    applyCompare();
  });
  applyCompare();
  const loopBox = byId<HTMLInputElement>('loop');
  loopBox.addEventListener('change', () => (loop = loopBox.checked));
  showPlay();

  const resize = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    procedural.setViewportHeight(h * renderer.getPixelRatio());
    textured?.setViewportHeight(h * renderer.getPixelRatio());
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const frame = (now: number): void => {
    requestAnimationFrame(frame);
    //프레임 상한: 상한 간격이 지나기 전이면 그리지도 흘리지도 않는다. 흘릴 때는 지난 그린 프레임부터의 실제 시간 전부
    if (fpsCap > 0 && now - lastFrame < 1000 / fpsCap - 0.5) return;
    //첫 프레임의 rAF 시각이 앞서 잰 시각보다 이를 수 있어 0 밑으로 내려가지 않게 한다
    const dtReal = Math.max(0, Math.min(100, now - lastTime));
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
    if (originalRoot.visible) {
      const tex = originals[originalFrameAt(age, config.timingMs.reveal)] ?? null;
      if (originalMaterial.map !== tex) {
        originalMaterial.map = tex;
        originalMaterial.needsUpdate = true;
      }
    }
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
    mode: (m: 'texture' | 'procedural') => setMode(m),
    option: (key: keyof RibbonOptions, on: boolean) => setOption(key, on),
    compare: (mode: 'off' | 'side' | 'over') => {
      compare = mode;
      compareBox.value = mode;
      applyCompare();
    },
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
      textured: fx === textured,
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
