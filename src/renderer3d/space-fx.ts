//전 스킬 공간형 효과 한 묶음 (SPEC-005 §15.4). 효과 분리 장을 격자 메시에 얹고 장마다 그림과 곡면을 바꾼다
//평면 비교용은 인형과 같은 카메라 방향의 원화 판을 쓰고 깊이 시험을 끈다

import * as THREE from 'three';
import { paintDepth, placeGridBehind, surfaceGrid, trackFrameAt, type SpaceFxConfig, type SpaceFxTrack, type SpacePaintView } from '../render/space-fx.js';
import { samePaintView, spacePaintView } from './space-projection.js';

export class SpaceFxTrackMesh {
  //기준점에 놓이는 뿌리. 그 밑에 좌우만 게임 카메라 쪽으로 돈 틀, 그 밑에 H 배율 메시
  readonly root = new THREE.Group();
  private readonly oriented = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  //곡면 이름 → 격자
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private paintView: SpacePaintView | undefined;
  private minimumDepth = 0;

  //textures 는 장마다 하나 (빈 장은 null). flat 이면 깊이 0 면·깊이 시험 끔
  constructor(
    private readonly config: SpaceFxConfig,
    private readonly track: SpaceFxTrack,
    private readonly textures: readonly (THREE.Texture | null)[],
    private readonly hPerPx: number,
    private readonly H: number,
    private readonly flat: boolean,
    //기준점이 발에서 떨어진 정도(H). 결행 베기는 적 몸통 높이
    private readonly base: readonly [number, number] = [0, 0],
  ) {
    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: !flat,
      side: THREE.DoubleSide,
      fog: false,
    });
    const names = flat ? ['flat'] : [...new Set(track.frames.map((f) => f.surface))];
    for (const name of names) {
      const surface = config.surfaces[name];
      if (!surface) continue;
      const view: SpacePaintView = { eye: [0, 2, 10], right: [1, 0, 0], up: [0, 1, 0] };
      const g = surfaceGrid(track, surface, hPerPx, view, config.groundLift, config.grid, base, flat);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
      geometry.setIndex(g.indices);
      this.geometries.set(name, geometry);
    }
    this.mesh = new THREE.Mesh(this.geometries.values().next().value ?? new THREE.BufferGeometry(), this.material);
    this.mesh.scale.setScalar(H);
    this.mesh.renderOrder = flat ? 30 : 20;
    this.mesh.frustumCulled = false;
    this.oriented.add(this.mesh);
    this.root.add(this.oriented);
    this.root.visible = false;
  }

  //월드 위를 유지한 틀 안에서 기준 카메라 광선에 맞춰 원화 점을 배치한다
  orient(camera: THREE.Camera, foregroundAt?: THREE.Vector3): void {
    this.oriented.rotation.set(0, new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y, 0);
    const view = spacePaintView(camera, this.oriented, this.H);
    const front = foregroundAt?.clone().applyMatrix4(this.oriented.matrixWorld.clone().invert()).divideScalar(this.H);
    const minimumDepth = front && !this.flat ? paintDepth(view, [front.x, front.y, front.z]) + 0.004 : 0;
    if (samePaintView(this.paintView, view) && Math.abs(this.minimumDepth - minimumDepth) < 1e-6) return;
    this.paintView = view;
    this.minimumDepth = minimumDepth;
    for (const [name, geometry] of this.geometries) {
      const surface = this.config.surfaces[name];
      if (!surface) continue;
      const grid = surfaceGrid(this.track, surface, this.hPerPx, view, this.config.groundLift, this.config.grid, this.base, this.flat);
      if (minimumDepth > 0) placeGridBehind(view, grid.positions, minimumDepth, this.config.groundLift);
      const position = geometry.getAttribute('position') as THREE.BufferAttribute;
      position.array.set(grid.positions);
      position.needsUpdate = true;
    }
  }

  //스킬 시작 기준 시각(ms)에 보일 장을 고른다. 그림이 없으면 숨긴다
  setTime(tMs: number): void {
    const i = trackFrameAt(this.track, tMs);
    const texture = i >= 0 ? this.textures[i] : null;
    if (!texture) {
      this.root.visible = false;
      return;
    }
    const frame = this.track.frames[i];
    const geometry = this.geometries.get(this.flat ? 'flat' : (frame?.surface ?? '')) ?? null;
    if (!geometry) {
      this.root.visible = false;
      return;
    }
    this.mesh.geometry = geometry;
    if (this.material.map !== texture) {
      this.material.map = texture;
      this.material.needsUpdate = true;
    }
    this.root.visible = true;
  }

  dispose(): void {
    for (const g of this.geometries.values()) g.dispose();
    this.material.dispose();
  }
}
