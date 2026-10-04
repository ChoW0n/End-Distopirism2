//전 스킬 공간형 계산 (SPEC-005 §15.4) 검증. 게임 카메라에서 원화 자리와 겹침, 바닥 밑으로 안 감, 세로 평면이 아님, 받은 박자 그대로
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { hPerPixel, paintDepth, paintPoint, parseSpaceFx, placeGridBehind, placeOnSurface, skillDuration, surfaceDepth, surfaceGrid, trackDuration, trackFrameAt } from '../src/render/space-fx.js';
import { spacePaintView } from '../src/renderer3d/space-projection.js';
import { CameraRig } from '../src/renderer3d/camera.js';
import { parseStage3dConfig } from '../src/renderer3d/config.js';
import { SpaceFxTrackMesh } from '../src/renderer3d/space-fx.js';
import { SpaceSlashEffect } from '../src/renderer3d/space-slash.js';
import { arcLengthPoints, parseRibbonConfig } from '../src/render/ribbon-slash.js';
import { parseSpaceConfig, viewPitchDeg } from '../src/render/space-slash.js';

const config = parseSpaceFx(JSON.parse(readFileSync('assets/kyle/space-fx.json', 'utf8')));
const placement = JSON.parse(readFileSync('assets/map-gate3-v4/placement.json', 'utf8')) as { projection: { camera: { back: number; height: number; lookAtHeight: number; fov: number } } };
const stage = parseStage3dConfig(JSON.parse(readFileSync('assets/ui/stage3d.json', 'utf8')));
const H = stage.layout.characterHeight;
const cameraFor = (shot: 'home' | 'combat' | 'close'): THREE.PerspectiveCamera => {
  const config = placement.projection.camera;
  const camera = new THREE.PerspectiveCamera(config.fov, 16 / 9, 0.1, 300);
  const rig = new CameraRig(camera, new THREE.Vector3(0, config.height, config.back), new THREE.Vector3(0, config.lookAtHeight, 0), config.fov, stage.camera, stage.shake);
  if (shot !== 'home') rig.focus(new THREE.Vector3(-0.55, H / 2, 0), new THREE.Vector3(0.55, H / 2, 0), 1);
  for (let i = 0; i < 120; i++) rig.write(1 / 60, i / 60);
  if (shot === 'close') camera.position.lerp(new THREE.Vector3(-0.55, H / 2, 0), 0.5);
  camera.updateMatrixWorld();
  return camera;
};
const localFrame = (camera: THREE.Camera): THREE.Group => {
  const frame = new THREE.Group();
  frame.position.set(-0.55, 0, 0);
  frame.rotation.set(0, new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y, 0);
  frame.updateMatrixWorld();
  return frame;
};
const camera = cameraFor('combat');
const frame = localFrame(camera);
const view = spacePaintView(camera, frame, H);
const project = (point: readonly number[], camera: THREE.Camera, frame: THREE.Group): THREE.Vector3 => new THREE.Vector3(point[0], point[1], point[2]).multiplyScalar(H).applyMatrix4(frame.matrixWorld).project(camera);
//카일 캐릭터 키(px). 매니페스트가 없는 환경에서도 돌게 대기 몸 높이 580 을 쓴다
const CHAR_PX = 580;
const skill = (id: string) => {
  const s = config.skills.find((k) => k.id === id);
  if (!s) throw new Error(id);
  return s;
};

describe('투영 곡면', () => {
  it.each(['home', 'combat', 'close'] as const)('%s 원근 카메라에서 모든 곡면 꼭짓점이 원화와 0.01px 이내로 겹친다', (shot) => {
    const camera = cameraFor(shot);
    const frame = localFrame(camera);
    const view = spacePaintView(camera, frame, H);
    for (const s of config.skills) {
      for (const track of s.tracks) {
        const k = hPerPixel(track, CHAR_PX);
        for (const name of new Set(track.frames.map((f) => f.surface))) {
          const surface = config.surfaces[name];
          if (!surface) throw new Error(name);
          const g = surfaceGrid(track, surface, k, view, config.groundLift, config.grid);
          const [gx] = config.grid;
          const [x0, y0, x1, y1] = track.crop;
          for (let v = 0; v < g.positions.length / 3; v++) {
            const p: [number, number, number] = [g.positions[v * 3] as number, g.positions[v * 3 + 1] as number, g.positions[v * 3 + 2] as number];
            const i = v % (gx + 1);
            const j = Math.floor(v / (gx + 1));
            const px = x0 + ((x1 - x0) * i) / gx;
            const py = y0 + ((y1 - y0) * j) / config.grid[1];
            //기대값은 계산 함수가 아니라 실제 인형 판과 같은 회전·원근 행렬로 만든다
            const painted = new THREE.Vector3((px - track.pivot[0]) * k * H, (track.pivot[1] - py) * k * H, 0).applyQuaternion(camera.quaternion).add(frame.position).project(camera);
            const seen = project(p, camera, frame);
            expect(Math.hypot((seen.x - painted.x) * 960, (seen.y - painted.y) * 540)).toBeLessThan(0.01);
            expect(p[1]).toBeGreaterThanOrEqual(config.groundLift - 1e-6);
          }
        }
      }
    }
  });

  it('곡면이 세로 평면이 아니다: 효과가 있는 칸에서 깊이 폭이 0.3H 를 넘는다', () => {
    for (const s of config.skills) {
      for (const track of s.tracks) {
        const k = hPerPixel(track, CHAR_PX);
        for (const name of new Set(track.frames.map((f) => f.surface))) {
          if (name === 'none' || name === 'flat') continue;
          const g = surfaceGrid(track, config.surfaces[name] as never, k, view, config.groundLift, config.grid);
          const zs = Array.from({ length: g.positions.length / 3 }, (_, v) => g.positions[v * 3 + 2] as number);
          expect(Math.max(...zs) - Math.min(...zs), `${s.id}/${track.name}/${name}`).toBeGreaterThan(0.3);
        }
      }
    }
  });

  it('바닥 밑 원화 점은 바닥에 눕고 화면 자리는 그대로, floor 는 늘 바닥', () => {
    const down = config.surfaces['downcut'];
    const floor = config.surfaces['floor'];
    if (!down || !floor) throw new Error('곡면');
    const p = placeOnSurface(down, 0.2, -0.15, view, config.groundLift);
    expect(p[1]).toBeCloseTo(config.groundLift, 9);
    expect(project(p, camera, frame).x).toBeCloseTo(project(paintPoint(view, 0.2, -0.15), camera, frame).x, 9);
    expect(project(p, camera, frame).y).toBeCloseTo(project(paintPoint(view, 0.2, -0.15), camera, frame).y, 9);
    const f = placeOnSurface(floor, 0.2, 0.05, view, config.groundLift);
    expect(f[1]).toBeCloseTo(config.groundLift, 9);
    expect(project(f, camera, frame).x).toBeCloseTo(project(paintPoint(view, 0.2, 0.05), camera, frame).x, 9);
    expect(project(f, camera, frame).y).toBeCloseTo(project(paintPoint(view, 0.2, 0.05), camera, frame).y, 9);
    expect(surfaceDepth(floor, 3, 3)).toBe(0);
  });

  it('띄운 결행 기준점도 원화 판의 같은 자리에 투영된다', () => {
    const cut = config.surfaces['cut3'];
    if (!cut) throw new Error('cut3');
    const b = placeOnSurface(cut, 0.3, 0.1, view, config.groundLift, [0.05, 0.6]);
    const expected = project(paintPoint(view, 0.35, 0.7), camera, frame);
    const seen = project(b, camera, frame);
    expect(seen.x).toBeCloseTo(expected.x, 9);
    expect(seen.y).toBeCloseTo(expected.y, 9);
  });

  it('찌르기는 위 물보라가 뒤로, 아래가 앞으로 비틀리고 뿌리 쪽이 더 비틀린다', () => {
    const t = config.surfaces['thrust'];
    if (!t) throw new Error('thrust');
    expect(surfaceDepth(t, 1.2, 0.7)).toBeLessThan(surfaceDepth(t, 1.2, 0.2));
    const twist = (x: number) => surfaceDepth(t, x, 0.2) - surfaceDepth(t, x, 0.7);
    expect(twist(0.3)).toBeGreaterThan(twist(1.4));
  });
});

describe('실제 메시의 원근 투영', () => {
  it('S3 올려베기는 양쪽 60도·높이 20도에서도 실제 호 부분의 면적과 깊이가 남는다', () => {
    const track = skill('s3').tracks[0];
    const surface = config.surfaces['upcut'];
    if (!track || !surface) throw new Error('올려베기');
    const g = surfaceGrid(track, surface, hPerPixel(track, CHAR_PX), view, config.groundLift, config.grid);
    const enemy = new THREE.Vector3(0.55, 0, 0).applyMatrix4(frame.matrixWorld.clone().invert()).divideScalar(H);
    placeGridBehind(view, g.positions, paintDepth(view, [enemy.x, enemy.y, enemy.z]) + 0.004, config.groundLift);
    //08-upcut-impact 원화의 위·중간·아래 호가 채우는 격자 칸. 투명 여백의 면적은 제외한다
    const patches = [[32, 1], [35, 3], [37, 7], [35, 11]] as const;
    const columns = config.grid[0] + 1;
    const point = (i: number): THREE.Vector3 => new THREE.Vector3(g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]).multiplyScalar(H).applyMatrix4(frame.matrixWorld);
    const area = (camera: THREE.Camera): number => {
      const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
      return patches.reduce((sum, [x, y]) => {
        const a = y * columns + x;
        const [p, q, r, s] = [a, a + 1, a + columns, a + columns + 1].map((i) => point(i).project(camera)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
        return sum + triangle(p, r, q) + triangle(q, r, s);
      }, 0);
    };
    const frontArea = area(camera);
    for (const yaw of [-60, 60]) {
      const orbit = camera.clone();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(orbit.quaternion);
      const rise = new THREE.Quaternion().setFromAxisAngle(right, -20 * Math.PI / 180);
      const chest = new THREE.Vector3(-0.55, H / 2, 0);
      orbit.position.sub(chest).applyQuaternion(rise).add(chest);
      orbit.quaternion.premultiply(rise);
      const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw * Math.PI / 180);
      orbit.position.sub(frame.position).applyQuaternion(turn).add(frame.position);
      orbit.quaternion.premultiply(turn);
      orbit.updateMatrixWorld();
      expect(area(orbit) / frontArea).toBeGreaterThan(0.5);
    }
    const depths = patches.map(([x, y]) => g.positions[(y * columns + x) * 3 + 2] as number);
    expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(0.2);
  });

  it('S2 메시를 적 판 뒤로 배치해도 원화와 겹치고 적 몸 높이에서 효과가 앞으로 튀어나오지 않는다', () => {
    const track = skill('s2').tracks[0];
    if (!track) throw new Error('S2');
    const k = hPerPixel(track, CHAR_PX);
    const textures = track.frames.map(() => new THREE.Texture());
    const fx = new SpaceFxTrackMesh(config, track, textures, k, H, false);
    fx.root.position.set(-0.55, 0, 0);
    const enemyAt = new THREE.Vector3(0.55, 0, 0);
    fx.setTime(0);
    for (const shot of ['home', 'combat', 'close'] as const) {
      const camera = cameraFor(shot);
      fx.orient(camera, enemyAt);
      fx.root.updateMatrixWorld(true);
      const mesh = fx.root.children[0]?.children[0] as THREE.Mesh;
      const positions = mesh.geometry.getAttribute('position');
      const [x0, y0, x1, y1] = track.crop;
      const [gx, gy] = config.grid;
      const forward = camera.getWorldDirection(new THREE.Vector3());
      const enemyDepth = enemyAt.clone().sub(camera.position).dot(forward);
      let bodyHeightPoints = 0;
      for (let v = 0; v < positions.count; v++) {
        const x = x0 + (x1 - x0) * (v % (gx + 1)) / gx;
        const y = y0 + (y1 - y0) * Math.floor(v / (gx + 1)) / gy;
        const expectedWorld = new THREE.Vector3((x - track.pivot[0]) * k * H, (track.pivot[1] - y) * k * H, 0).applyQuaternion(camera.quaternion).add(fx.root.position);
        const actualWorld = new THREE.Vector3().fromBufferAttribute(positions, v).applyMatrix4(mesh.matrixWorld);
        const ray = expectedWorld.clone().sub(camera.position);
        const pointOnEnemy = ray.clone().multiplyScalar(enemyDepth / ray.dot(forward)).add(camera.position);
        if (pointOnEnemy.y > config.groundLift * H + 1e-4) {
          expect(actualWorld.clone().sub(camera.position).dot(forward)).toBeGreaterThan(enemyDepth);
          bodyHeightPoints++;
        }
        expect(actualWorld.y).toBeGreaterThanOrEqual(config.groundLift * H - 1e-6);
        const expected = expectedWorld.project(camera);
        const seen = actualWorld.project(camera);
        expect(Math.hypot((seen.x - expected.x) * 960, (seen.y - expected.y) * 540)).toBeLessThan(0.01);
      }
      expect(bodyHeightPoints).toBeGreaterThan(100);
    }
    fx.dispose();
    textures.forEach((texture) => texture.dispose());
  });

  it('적 뒤로 물리는 보정은 지면에 닿기 전까지 곡면 깊이 차를 보존한다', () => {
    const points = new Float32Array([0, 2, 1, 0.5, 2.4, 0, -0.4, 2.2, -1]);
    const depthOf = () => [0, 3, 6].map((i) => paintDepth(view, [points[i] as number, points[i + 1] as number, points[i + 2] as number]));
    const before = depthOf();
    const minimumDepth = Math.max(...before) + 0.2;
    placeGridBehind(view, points, minimumDepth, config.groundLift);
    const after = depthOf();
    expect(Math.min(...after)).toBeCloseTo(minimumDepth, 5);
    expect((after[2] as number) - (after[0] as number)).toBeCloseTo((before[2] as number) - (before[0] as number), 5);
  });

  it('S1 질감 띠의 호·단면이 근접·교전 카메라에서 평면 질감 좌표와 겹친다', () => {
    const raw = JSON.parse(readFileSync('assets/kyle/realtime-vfx.json', 'utf8'));
    const ribbon = parseRibbonConfig(raw);
    const space = parseSpaceConfig(raw);
    const strip = { image: { width: 32, height: 8 }, pixels: new Uint8ClampedArray(32 * 8 * 4), width: 32, height: 8 };
    const fx = new SpaceSlashEffect(ribbon, space, H, strip, viewPitchDeg(placement.projection.camera));
    fx.root.position.set(-0.55, 0, 0);
    const mesh = fx.root.children[0]?.children.find((node) => (node as THREE.Mesh).geometry?.hasAttribute('aD')) as THREE.Mesh;
    const positions = mesh.geometry.getAttribute('position');
    const ds = mesh.geometry.getAttribute('aD');
    const path = arcLengthPoints(ribbon.path.points, Math.max(128, ribbon.path.segments));
    for (const shot of ['combat', 'close'] as const) {
      const camera = cameraFor(shot);
      fx.orient(camera);
      fx.root.updateMatrixWorld(true);
      for (let v = 0; v < positions.count; v++) {
        const pt = path[Math.floor(v / (space.crossRows + 1))];
        if (!pt) throw new Error('띠 점');
        const d = ds.getX(v);
        const expected = new THREE.Vector3((pt.p[0] - pt.tangent[1] * d) * H, (pt.p[1] + pt.tangent[0] * d) * H, 0).applyQuaternion(camera.quaternion).add(fx.root.position).project(camera);
        const seen = new THREE.Vector3().fromBufferAttribute(positions, v).applyMatrix4(mesh.matrixWorld).project(camera);
        expect(Math.hypot((seen.x - expected.x) * 960, (seen.y - expected.y) * 540)).toBeLessThan(0.01);
      }
    }
    fx.dispose();
  });
});

describe('받은 박자 (v3 manifest)', () => {
  it('장 수: S2 15 · S3 39 · 결행 4획 15장씩 + 물보라 15 + 밤물', () => {
    expect(skill('s2').tracks[0]?.frames.length).toBe(15);
    expect(skill('s3').tracks[0]?.frames.length).toBe(39);
    const ult = skill('ult');
    expect(ult.tracks.filter((t) => t.anchor === 'enemyHit').map((t) => t.frames.length)).toEqual([15, 15, 15, 15]);
    expect(ult.tracks.find((t) => t.name === '물보라')?.frames.length).toBe(15);
  });

  it('S2 70ms×14·120ms, S3 단계 시간, 결행 획 시작 0·100·200·300 · 물보라 350 · 1250ms 끝', () => {
    const s2 = skill('s2').tracks[0];
    if (!s2) throw new Error('s2');
    expect(trackDuration(s2)).toBe(70 * 14 + 120);
    const s3 = skill('s3').tracks[0];
    if (!s3) throw new Error('s3');
    expect(s3.frames.map((f) => f.ms).slice(0, 8)).toEqual([380, 70, 90, 40, 40, 40, 40, 110]);
    const ult = skill('ult');
    expect(ult.tracks.filter((t) => t.anchor === 'enemyHit').map((t) => t.delayMs)).toEqual([0, 100, 200, 300]);
    expect(ult.tracks.find((t) => t.name === '물보라')?.delayMs).toBe(350);
    expect(skillDuration(ult)).toBe(1250);
    expect(skillDuration(skill('s2'))).toBe(180 + 70 * 14 + 120);
  });

  it('장 넘기기는 시작 전·끝난 뒤 -1, 사이에는 앞으로만 간다', () => {
    for (const s of config.skills) {
      for (const track of s.tracks) {
        expect(trackFrameAt(track, track.delayMs - 1)).toBe(-1);
        expect(trackFrameAt(track, track.delayMs)).toBe(0);
        expect(trackFrameAt(track, track.delayMs + trackDuration(track))).toBe(-1);
        let last = 0;
        for (let t = track.delayMs; t < track.delayMs + trackDuration(track); t += 7) {
          const f = trackFrameAt(track, t);
          expect(f).toBeGreaterThanOrEqual(last);
          last = f;
        }
        expect(last).toBe(track.frames.length - 1);
      }
    }
  });

  it('S2·S3 장마다 평면 비교용 통합 장과 몸만 남긴 장이 있다', () => {
    for (const id of ['s2', 's3']) {
      for (const f of skill(id).tracks[0]?.frames ?? []) {
        expect(f.flat).toBeTruthy();
        expect(f.body).toMatch(/^fx3\/body\//);
      }
    }
  });

  //그림이 있는 환경(반입 후)에서만 파일까지 본다
  it.runIf(existsSync('assets/kyle/fx3/s2/01.png'))('가리키는 그림이 다 있다', () => {
    for (const s of config.skills) for (const t of s.tracks) for (const f of t.frames) {
      expect(existsSync(`assets/kyle/${f.fx}`), f.fx).toBe(true);
      if (f.body) expect(existsSync(`assets/kyle/${f.body}`), f.body).toBe(true);
    }
  });
});
