//메시 컷신 계산이 팩의 규칙대로인지 본다 (SPEC-002 §7.1)

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadCharacterAssets } from '../src/platform/node-manifest.js';
import { MeshCutscene } from '../src/render/cutscene-mesh.js';

const here = dirname(fileURLToPath(import.meta.url));
const helper = loadCharacterAssets(resolve(here, '../assets'), 'helper')!;
const data = helper.manifest.meshCutscene!;
const mesh = new MeshCutscene(data);

describe('범고래 메시 컷신', () => {
  it('조력자 컷신은 메시 방식이고 레이어 방식이 아니다', () => {
    expect(data).not.toBeNull();
    expect(helper.manifest.cutscene).toBeNull();
  });

  //팩 rig.json 의 triangles 가 1280개다. 32칸 × (19줄 + 손 경계 1줄) × 2
  it('삼각형 수가 팩 rig.json 과 같다', () => {
    expect(mesh.triangles(0)).toHaveLength(1280);
  });

  //손·창은 같이 움직이기만 한다. 휘면 창이 구부러진다
  it('고정 구간 아래 점은 몸 전체 흔들림만 받는다', () => {
    const phase = 1.1;
    const below = { x: 400, y: data.rigid[1] + 40 };
    const moved = mesh.deform(below, phase);
    expect(moved.x - below.x).toBeCloseTo(data.sway.x * Math.sin(phase));
    expect(moved.y - below.y).toBeCloseTo(data.sway.y * Math.sin(phase));
  });

  //창 위 두 점 사이 거리가 어느 위상에서도 같다 (팩 README: 96시점 0px)
  it('창 위 두 점 사이 거리가 변하지 않는다', () => {
    const a = { x: 100, y: 800 };
    const b = { x: 600, y: 900 };
    const rest = Math.hypot(b.x - a.x, b.y - a.y);
    for (let i = 0; i < 24; i += 1) {
      const phase = (i / 24) * Math.PI * 2;
      const p = mesh.deform(a, phase);
      const q = mesh.deform(b, phase);
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeCloseTo(rest, 6);
    }
  });

  //머리카락은 실제로 움직여야 한다. 흔들림이 없으면 정지 그림과 같다
  it('머리카락 자리는 위상에 따라 움직인다', () => {
    const hair = { x: 270, y: 270 };
    const a = mesh.deform(hair, Math.PI / 2);
    const b = mesh.deform(hair, -Math.PI / 2);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(5);
  });
});
