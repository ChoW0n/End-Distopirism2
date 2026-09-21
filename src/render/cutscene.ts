//궁극기 컷신 13레이어를 배치한다 (SPEC-002 §7)
//
//좌표는 v3 확정값을 그대로 쓴다. 특징점·밝기 매칭으로 추정하지 않는다.
//13장을 좌표대로 놓으면 제공된 조립본과 픽셀 차이가 0이라는 게 검증된 상태다
//
//실제 그리기는 하지 않는다. 각 레이어가 어디에 어느 각도로 놓이는지까지만 낸다

import type { CutsceneData, CutsceneLayerData, Point } from './manifest.js';

//눈·입은 상태별로 하나만 켠다. 둘 다 켜면 얼굴이 겹친다
export type FaceState = 'open' | 'closed';

//이번 프레임의 자세
export interface CutscenePose {
  //레이어별 회전량(도). 매니페스트의 motionDeg 를 한도로 잘린다
  rotations?: Readonly<Record<string, number>>;
  //얼굴 파츠 그룹별 상태. 예: { 'eye-screen-left': 'closed' }
  face?: Readonly<Record<string, FaceState>>;
}

//화면에 놓일 레이어 한 장
//렌더러는 pivot 으로 옮기고 rotationDeg 만큼 돌린 뒤 offset 위치에 비트맵을 그린다
export interface LayerTransform {
  layerId: string;
  file: string;
  //피벗이 놓일 캔버스 좌표
  pivot: Point;
  //피벗에서 비트맵 좌상단까지의 거리. 회전 전 기준이다
  offset: Point;
  //부모 회전까지 누적된 최종 각도
  rotationDeg: number;
  z: number;
  scale: number;
}

//컷신 데이터가 규격과 다를 때 던진다
export class CutsceneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CutsceneError';
  }
}

const OPEN_SUFFIX = '-open';
const CLOSED_SUFFIX = '-closed';

//얼굴 파츠면 그룹 이름과 상태를 낸다. id 규칙에서 읽어내고 코드에 박지 않는다
function facePartOf(layerId: string): { group: string; state: FaceState } | null {
  if (layerId.endsWith(OPEN_SUFFIX)) {
    return { group: layerId.slice(0, -OPEN_SUFFIX.length), state: 'open' };
  }
  if (layerId.endsWith(CLOSED_SUFFIX)) {
    return { group: layerId.slice(0, -CLOSED_SUFFIX.length), state: 'closed' };
  }
  return null;
}

//한 점을 중심 기준으로 회전시킨다
function rotateAbout(center: Point, degrees: number, p: Point): Point {
  if (degrees === 0) return { ...p };
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export class CutsceneDirector {
  private readonly byId: Map<string, CutsceneLayerData>;
  //얼굴 파츠 그룹 → 기본으로 켜져 있던 상태
  private readonly faceDefaults: Map<string, FaceState>;

  //레이어 구조를 검사한다. 부모가 없거나 순환이면 여기서 막는다
  constructor(readonly cutscene: CutsceneData) {
    this.byId = new Map(cutscene.layers.map((l) => [l.id, l]));
    this.faceDefaults = new Map();

    for (const layer of cutscene.layers) {
      if (layer.parent !== 'root' && !this.byId.has(layer.parent)) {
        throw new CutsceneError(`${layer.id} 의 부모를 찾을 수 없다: ${layer.parent}`);
      }
      this.assertNoCycle(layer);

      const part = facePartOf(layer.id);
      if (!part || !layer.visibleDefault) continue;
      if (this.faceDefaults.has(part.group)) {
        throw new CutsceneError(`${part.group} 의 기본 상태가 둘 이상 켜져 있다`);
      }
      this.faceDefaults.set(part.group, part.state);
    }
  }

  //눈·입처럼 상태가 갈리는 파츠 그룹 목록
  get faceGroups(): string[] {
    return [...this.faceDefaults.keys()];
  }

  //모든 파츠가 제자리에 선 기본 자세
  restPose(): CutscenePose {
    return {};
  }

  //매니페스트가 허용하는 최대치까지 흔든 자세. 한도 확인용이다
  peakPose(): CutscenePose {
    const rotations: Record<string, number> = {};
    for (const layer of this.cutscene.layers) {
      if (layer.motionDeg !== 0) rotations[layer.id] = layer.motionDeg;
    }
    return { rotations };
  }

  //이번 자세의 레이어 배치를 z 순서대로 낸다. 꺼진 파츠는 빠진다
  //배율은 컷신 루트에만 한 번 먹인다. 파츠별로 늘리면 정렬이 깨진다
  layers(pose: CutscenePose = {}, options: { scale?: number } = {}): LayerTransform[] {
    const scale = options.scale ?? 1;
    const visible = this.cutscene.layers.filter((l) => this.isVisible(l, pose));

    return visible
      .map((layer) => {
        const parent = layer.parent === 'root' ? null : this.byId.get(layer.parent)!;
        //자기 회전은 자기 피벗을 움직이지 않는다. 피벗을 옮기는 건 조상들뿐이다
        const pivot = parent ? this.through(parent, layer.pivot, pose) : { ...layer.pivot };

        return {
          layerId: layer.id,
          file: layer.file,
          pivot: { x: pivot.x * scale, y: pivot.y * scale },
          offset: {
            x: (layer.pos.x - layer.pivot.x) * scale,
            y: (layer.pos.y - layer.pivot.y) * scale,
          },
          rotationDeg: this.totalRotation(layer, pose),
          z: layer.z,
          scale,
        };
      })
      .sort((a, b) => a.z - b.z);
  }

  //이 레이어에 실제로 먹일 회전량. 매니페스트 한도를 넘지 못한다
  rotationOf(layerId: string, pose: CutscenePose): number {
    const layer = this.layer(layerId);
    const requested = pose.rotations?.[layerId] ?? 0;
    const limit = Math.abs(layer.motionDeg);
    if (limit === 0) return 0;
    return Math.max(-limit, Math.min(limit, requested));
  }

  //레이어를 찾는다. 없으면 던진다
  layer(id: string): CutsceneLayerData {
    const found = this.byId.get(id);
    if (!found) throw new CutsceneError(`컷신 레이어를 찾을 수 없다: ${id}`);
    return found;
  }

  //이 파츠를 이번 자세에서 그릴지 정한다
  private isVisible(layer: CutsceneLayerData, pose: CutscenePose): boolean {
    const part = facePartOf(layer.id);
    if (!part) return layer.visibleDefault;

    //그룹마다 딱 하나만 켠다. 요청이 없으면 기본 상태를 쓴다
    const wanted = pose.face?.[part.group] ?? this.faceDefaults.get(part.group);
    return part.state === wanted;
  }

  //부모 회전까지 더한 최종 각도
  private totalRotation(layer: CutsceneLayerData, pose: CutscenePose): number {
    let total = 0;
    let current: CutsceneLayerData | null = layer;
    while (current) {
      total += this.rotationOf(current.id, pose);
      current = current.parent === 'root' ? null : this.byId.get(current.parent) ?? null;
    }
    return total;
  }

  //한 점을 이 레이어와 그 조상들의 회전에 통과시킨다
  private through(layer: CutsceneLayerData, p: Point, pose: CutscenePose): Point {
    const rotated = rotateAbout(layer.pivot, this.rotationOf(layer.id, pose), p);
    if (layer.parent === 'root') return rotated;
    return this.through(this.byId.get(layer.parent)!, rotated, pose);
  }

  //부모를 따라 올라가다 자기 자신을 다시 만나면 던진다
  private assertNoCycle(start: CutsceneLayerData): void {
    const seen = new Set<string>([start.id]);
    let current = start;
    while (current.parent !== 'root') {
      const parent = this.byId.get(current.parent);
      if (!parent) return;
      if (seen.has(parent.id)) {
        throw new CutsceneError(`컷신 레이어 부모가 순환한다: ${parent.id}`);
      }
      seen.add(parent.id);
      current = parent;
    }
  }
}
