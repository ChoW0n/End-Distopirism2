//무대 배경. 원근으로 그려진 층들을 기준 카메라에서 비춰 판에 입힌다 (SPEC-005 §8.8)
//기준 카메라에서 보면 원화 합성과 똑같고, 카메라가 움직이면 층 깊이만큼 시차가 난다
//원근 바닥 그림을 평평한 판에 반복해 깔면 원근이 두 번 들어간다. 그걸 막는 것이 이 모듈이다

import * as THREE from 'three';
import type { BackdropConfig, BackdropLayer } from './config.js';

export class Backdrop {
  //기준 카메라. 대기 카메라도 이 자세를 쓴다
  readonly paintCamera: THREE.PerspectiveCamera;
  readonly homePosition: THREE.Vector3;
  readonly homeLookAt: THREE.Vector3;
  readonly fov: number;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly config: BackdropConfig,
  ) {
    const cam = config.camera;
    this.fov = cam.fov;
    this.homePosition = new THREE.Vector3(0, cam.height, cam.back);
    this.homeLookAt = new THREE.Vector3(0, cam.lookAtHeight, 0);
    this.paintCamera = new THREE.PerspectiveCamera(cam.fov, cam.aspect, 0.1, 500);
    this.paintCamera.position.copy(this.homePosition);
    this.paintCamera.lookAt(this.homeLookAt);
    this.paintCamera.updateMatrixWorld();
    this.paintCamera.updateProjectionMatrix();
  }

  //층을 전부 세운다. 그림은 파일 이름으로 찾는다. 없는 층은 빠진다
  build(images: Map<string, HTMLImageElement>): void {
    const order = [-30, -20, -10];
    this.config.layers.forEach((layer, i) => {
      const image = images.get(layer.file);
      if (!image) return;
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      texture.wrapS = layer.mirrorX ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping;
      texture.wrapT = layer.mirrorY ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;
      const mesh = layer.shape === 'floor' ? this.floor(layer, texture) : this.stand(layer, texture);
      mesh.renderOrder = order[Math.min(i, order.length - 1)] ?? -10;
      this.scene.add(mesh);
    });
  }

  //기준 카메라 화면의 한 점(정규 좌표)에서 쏜 선이 z 평면과 만나는 곳
  private rayToZ(nx: number, ny: number, z: number): THREE.Vector3 {
    const cam = this.paintCamera;
    const dir = new THREE.Vector3(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
    return cam.position.clone().addScaledVector(dir, (z - cam.position.z) / dir.z);
  }

  //층의 화면 자리를 기준점(바닥 경계 가운데)에서 키우고 내린다
  private scaledRect(layer: BackdropLayer): [number, number, number, number] {
    const [ax, ay] = this.config.scaleAnchor;
    const [x, y, w, h] = layer.rect;
    const k = layer.scale;
    return [ax + (x - ax) * k, ay + (y - ay) * k + layer.offsetY, w * k, h * k];
  }

  //판의 꼭짓점마다 기준 카메라 화면 자리를 구해 그림 좌표로 바꾼다
  private projectUV(mesh: THREE.Mesh, rect: [number, number, number, number]): void {
    mesh.updateMatrixWorld();
    const pos = mesh.geometry.getAttribute('position');
    const uv = mesh.geometry.getAttribute('uv');
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(this.paintCamera);
      const sx = (v.x + 1) / 2;
      const sy = (1 - v.y) / 2;
      uv.setXY(i, (sx - rect[0]) / rect[2], 1 - (sy - rect[1]) / rect[3]);
    }
    uv.needsUpdate = true;
  }

  private material(texture: THREE.Texture): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, fog: false });
  }

  //세운 층. 웹은 카메라가 -Z 를 보므로 깊이 d 는 z = -d 다
  private stand(layer: BackdropLayer, texture: THREE.Texture): THREE.Mesh {
    const z = -layer.depth;
    const spread = this.config.standSpread;
    const a = this.rayToZ(-spread, 1.3, z);
    const b = this.rayToZ(spread, -1.3, z);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(b.x - a.x, a.y - b.y, 96, 24), this.material(texture));
    mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, z);
    this.projectUV(mesh, this.scaledRect(layer));
    return mesh;
  }

  //바닥. y=0 판에 카메라 쪽(near)부터 먼 쪽(far)까지 깐다
  private floor(layer: BackdropLayer, texture: THREE.Texture): THREE.Mesh {
    const nearZ = -layer.near;
    const farZ = -layer.far;
    const geometry = new THREE.PlaneGeometry(layer.halfWidth * 2, nearZ - farZ, 240, 160);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, this.material(texture));
    mesh.position.set(0, 0, (nearZ + farZ) / 2);
    this.projectUV(mesh, layer.rect);
    return mesh;
  }
}
