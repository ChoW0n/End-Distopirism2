import * as THREE from 'three';
import type { SpacePaintView } from '../render/space-fx.js';

//궤도 조작 전 카메라를 효과의 로컬 H 좌표로 옮긴다. 확대·원근·화면 기울기를 모두 보존한다
export function spacePaintView(camera: THREE.Camera, oriented: THREE.Object3D, height: number): SpacePaintView {
  oriented.updateWorldMatrix(true, false);
  const inverse = oriented.matrixWorld.clone().invert();
  const eye = camera.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse).divideScalar(height);
  const rotation = camera.getWorldQuaternion(new THREE.Quaternion());
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation).transformDirection(inverse);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).transformDirection(inverse);
  return { eye: [eye.x, eye.y, eye.z], right: [right.x, right.y, right.z], up: [up.x, up.y, up.z] };
}

//카메라가 자리를 잡은 뒤에는 같은 격자를 다시 계산하지 않는다
export function samePaintView(a: SpacePaintView | undefined, b: SpacePaintView): boolean {
  return !!a && (['eye', 'right', 'up'] as const).every((key) => a[key].every((n, i) => Math.abs(n - (b[key][i] ?? 0)) < 1e-6));
}
