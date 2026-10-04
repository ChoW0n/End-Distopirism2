//카메라가 따라가는 중·타격 확대 중에도 인물과 카드가 UI 구역을 침범하지 않는지 실제 투영으로 검증한다
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { CameraRig } from '../src/renderer3d/camera.js';
import { parseStage3dConfig } from '../src/renderer3d/config.js';
import { containViewPoints, type Vec3 } from '../src/render/framing.js';

const config = parseStage3dConfig(JSON.parse(readFileSync('assets/ui/stage3d.json', 'utf8')));
const safe = { left: 0.04, right: 0.96, top: 0.14, bottom: 0.86 };

describe('교전 화면 경계', () => {
  for (const aspect of [16 / 9, 19.5 / 9, 4 / 3]) {
    it(`${aspect.toFixed(2)} 화면비에서 카드 공개·밀려남·타격 펀치·복귀를 보호한다`, () => {
      const camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 300);
      const rig = new CameraRig(camera, new THREE.Vector3(0, 5.51, 10.208), new THREE.Vector3(0, 2.008, 0), 38, config.camera, config.shake);
      rig.setFocusShift(0, 0.04);
      let points: THREE.Vector3[] = [];
      for (let frame = 0; frame < 240; frame++) {
        //양쪽 방향·큰 밀려남·급격한 착지를 함께 확인한다
        const direction = frame < 120 ? 1 : -1;
        const gap = frame % 120 < 60 ? 1.1 : 9;
        const a = new THREE.Vector3(-direction * gap / 2, 0, 0);
        const b = new THREE.Vector3(direction * gap / 2, 0, -0.8);
        if (frame % 120 < 100) rig.focus(a, b, direction);
        else rig.release();
        if (frame % 30 === 0) rig.impact(1, direction);
        rig.write(1 / 60, frame / 60, (pose) => {
          points = [a, b].flatMap((anchor) => [-1.6, 1.6].flatMap((x) => [0, 4.1].map((y) => new THREE.Vector3(x, y, 0).applyQuaternion(pose.quaternion).add(anchor))));
          return { points, rect: safe };
        });
        for (const point of points) {
          const p = point.clone().project(camera);
          expect((p.x + 1) / 2).toBeGreaterThanOrEqual(safe.left - 1e-6);
          expect((p.x + 1) / 2).toBeLessThanOrEqual(safe.right + 1e-6);
          expect((1 - p.y) / 2).toBeGreaterThanOrEqual(safe.top - 1e-6);
          expect((1 - p.y) / 2).toBeLessThanOrEqual(safe.bottom + 1e-6);
        }
      }
    });
  }

  it('이미 안전한 구도와 화면에 없는 점은 확대·이동하지 않는다', () => {
    const framing = { fov: 38, offsetX: 0, offsetY: 0 };
    const points: Vec3[] = [[-1, -1, -10], [1, 1, -10], [100, 100, 1]];
    expect(containViewPoints(points, 16 / 9, framing, safe)).toEqual(framing);
    expect(containViewPoints([], 16 / 9, framing, safe)).toEqual(framing);
  });
});
