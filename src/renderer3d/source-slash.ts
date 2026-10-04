//물금 원본 RGBA 장을 휘두름 깊이에 놓는다. 원본 색·알파·붓결은 바꾸지 않는다
import * as THREE from 'three';
import { originalFrameAt, type RibbonSlashConfig } from '../render/ribbon-slash.js';
import type { SpaceSlashConfig } from '../render/space-slash.js';
import { paintPoint, placePaintPoint, type SpacePaintView } from '../render/space-fx.js';
import { sourceSlashGrid, type SourceSlashConfig } from '../render/source-slash.js';
import { samePaintView, spacePaintView } from './space-projection.js';

export class SourceSlashEffect {
  readonly root = new THREE.Group();
  private readonly oriented = new THREE.Group();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.MeshBasicMaterial;
  private readonly samples: Float32Array;
  private paintView: SpacePaintView | undefined;

  //텍스처는 원본 색 공간 그대로 읽는다. 몸과의 가림만 깊이 시험으로 처리한다
  constructor(
    source: SourceSlashConfig,
    private readonly ribbon: RibbonSlashConfig,
    space: SpaceSlashConfig,
    private readonly H: number,
    private readonly textures: readonly THREE.Texture[],
    pitchDeg: number,
  ) {
    const grid = sourceSlashGrid(source, ribbon, space, pitchDeg);
    this.samples = grid.samples;
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(grid.samples.length), 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(grid.uvs, 2));
    this.geometry.setIndex(new THREE.BufferAttribute(grid.indices, 1));
    this.material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.renderOrder = 30;
    mesh.frustumCulled = false;
    this.oriented.add(mesh);
    this.root.add(this.oriented);
    this.setAge(0);
  }

  //궤도 조작 전 카메라에 원화 좌표를 맞춘다. 궤도를 돌려도 효과의 깊이는 고정된다
  orient(camera: THREE.Camera): void {
    this.oriented.rotation.set(0, new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y, 0);
    const view = spacePaintView(camera, this.oriented, this.H);
    if (samePaintView(this.paintView, view)) return;
    this.paintView = view;
    const position = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.samples.length; i += 3) {
      const p = placePaintPoint(view, paintPoint(view, this.samples[i]!, this.samples[i + 1]!), this.samples[i + 2]!, 0.004);
      position.setXYZ(i / 3, p[0] * this.H, p[1] * this.H, p[2] * this.H);
    }
    position.needsUpdate = true;
  }

  //평면 원본과 같은 p² 장 선택을 쓴다. 별도 색 보정이나 입자를 더하지 않는다
  setAge(ageMs: number): void {
    const texture = this.textures[originalFrameAt(Math.max(0, ageMs), this.ribbon.timingMs.reveal)];
    if (texture && this.material.map !== texture) {
      this.material.map = texture;
      this.material.needsUpdate = true;
    }
    this.root.visible = ageMs >= 0 && !!texture;
  }

  //그림 소유권은 로더에 두고 메시 자원만 해제한다
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.root.removeFromParent();
  }
}
