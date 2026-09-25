//무대 좌표를 화면 좌표로 옮긴다. 2.5D 투영이 여기 한 곳에만 있다
//
//FOV·바닥 기울기를 새로 정하지 않는다. assets/map/placement.json 이 이미 들고 있는
//지평선(groundBoundaryApprox) · 발 기준선(footYRatio) · 캐릭터 키 비율로만 푼다.
//원본 카메라 버그는 transform 을 쓰는 지점이 둘이어서 났다. 여기가 유일한 지점이다

import type { Point } from '../render/manifest.js';

//배경 한 겹
export interface MapLayerData {
  id: string;
  file: string;
  //정규화 좌표. 뷰포트 너비·높이의 비율이다
  x: number;
  y: number;
  width: number;
  height: number;
  //0 이면 카메라를 따라가지 않고, 1 이면 그대로 따라간다
  parallax: number;
}

//테스트 맵 배치 (assets/map/placement.json)
export interface MapPlacement {
  viewport: { width: number; height: number };
  drawOrder: string[];
  //바닥 뒤 경계. 이 선이 지평선 노릇을 한다
  groundBoundary: number;
  characterHeightRatio: number;
  footYRatio: number;
  layers: MapLayerData[];
}

export class SceneError extends Error {
  constructor(message: string) {
    super(`scene: ${message}`);
    this.name = 'SceneError';
  }
}

type Json = Record<string, unknown>;

function obj(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SceneError(`${path} 가 객체가 아니다`);
  }
  return value as Json;
}

function num(source: Json, key: string, path: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SceneError(`${path}.${key} 가 숫자가 아니다`);
  }
  return value;
}

function str(source: Json, key: string, path: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new SceneError(`${path}.${key} 가 문자열이 아니다`);
  }
  return value;
}

//JSON.parse 결과를 검증된 맵 배치로 바꾼다. 키가 없으면 던진다
export function parseMapPlacement(raw: unknown): MapPlacement {
  const source = obj(raw, 'placement');
  const viewport = source['viewport'];
  if (!Array.isArray(viewport) || viewport.length !== 2) {
    throw new SceneError('placement.viewport 가 숫자 두 개짜리 배열이 아니다');
  }
  const order = source['drawOrder'];
  if (!Array.isArray(order) || order.some((v) => typeof v !== 'string')) {
    throw new SceneError('placement.drawOrder 가 문자열 배열이 아니다');
  }
  const layers = source['layers'];
  if (!Array.isArray(layers)) throw new SceneError('placement.layers 가 배열이 아니다');

  return {
    viewport: { width: Number(viewport[0]), height: Number(viewport[1]) },
    drawOrder: order as string[],
    groundBoundary: num(source, 'groundBoundaryApprox', 'placement'),
    characterHeightRatio: num(source, 'characterHeightRatio', 'placement'),
    footYRatio: num(source, 'footYRatio', 'placement'),
    layers: layers.map((raw, i) => {
      const layer = obj(raw, `placement.layers[${i}]`);
      const path = `placement.layers[${i}]`;
      return {
        id: str(layer, 'id', path),
        file: str(layer, 'file', path),
        x: num(layer, 'x', path),
        y: num(layer, 'y', path),
        width: num(layer, 'width', path),
        height: num(layer, 'height', path),
        parallax: num(layer, 'parallax', path),
      };
    }),
  };
}

//화면에 놓인 결과. scale 은 무대 1px 이 화면 몇 px 이 되는지다
export interface Projected {
  x: number;
  y: number;
  scale: number;
}

//카메라가 지금 보고 있는 것. CameraDirector 가 낸 명령을 렌더러가 여기에 녹여 둔다
export interface CameraState {
  //무대 좌표. 화면 가운데에 올 지점
  focus: Point;
  zoom: number;
  //흔들림으로 생긴 화면 픽셀 오프셋
  shake: Point;
}

//원작 Battle.unity 의 카메라 세로 화각. 우리가 새로 정한 값이 아니라 승계한 값이다
export const FIELD_OF_VIEW_DEG = 60;

//지평선에 너무 붙으면 나눗셈이 터진다. 이보다 가까이는 안 간다
const MIN_DISTANCE = 1;

export class Scene {
  //초점 거리(화면 px). 원작 화각에서 나온다
  private readonly focal: number;
  //카메라에서 발 기준선까지 거리, 카메라가 바닥에서 뜬 높이. 둘 다 무대 단위다
  private readonly refDistance: number;
  private readonly cameraHeight: number;
  //지평선과 발 기준선
  private readonly horizonY: number;
  private readonly baseFootY: number;

  //characterHeight 는 캐릭터 키 H, groundY 는 무대의 접지선이다
  constructor(
    readonly map: MapPlacement,
    characterHeight: number,
    private readonly groundY: number,
  ) {
    const height = map.viewport.height;
    this.horizonY = map.groundBoundary * height;
    this.baseFootY = map.footYRatio * height;
    if (this.baseFootY <= this.horizonY) {
      throw new SceneError('발 기준선이 지평선보다 위에 있다. placement.json 을 확인할 것');
    }

    //발 기준선에서 무대 1px 이 화면에서 차지하는 px
    const unit = (map.characterHeightRatio * height) / characterHeight;
    this.focal = height / 2 / Math.tan((FIELD_OF_VIEW_DEG * Math.PI) / 360);
    this.refDistance = this.focal / unit;
    this.cameraHeight = (this.baseFootY - this.horizonY) / unit;
  }

  //카메라에서 이 지점까지의 거리. 무대 y 가 클수록 앞이라 가깝다
  private distanceTo(point: Point): number {
    return Math.max(MIN_DISTANCE, this.refDistance - (point.y - this.groundY));
  }

  get viewport(): { width: number; height: number } {
    return this.map.viewport;
  }

  //줌을 뺀 화면 좌표. 진짜 원근이다 — 화면 위치도 배율도 거리에 반비례한다.
  //
  //깊이를 화면 y 에 선형으로 깔면 좁은 띠에서는 비슷하지만 줄이 깊어지면 어긋난다.
  //뒷줄이 실제보다 훨씬 작아져서 원작 대형을 그대로 옮기면 사람이 사라진다
  //접지선 배율 ÷ 이 깊이의 배율. 뒤에 선 사람일수록 1 보다 크다. 카메라가 깊이만큼 더 당길 때 쓴다
  depthRatio(y: number): number {
    return this.distanceTo({ x: 0, y }) / this.distanceTo({ x: 0, y: this.groundY });
  }

  private flat(point: Point): Projected {
    const distance = this.distanceTo(point);
    const scale = this.focal / distance;
    return {
      x: point.x * scale,
      y: this.horizonY + (this.focal * this.cameraHeight) / distance,
      scale,
    };
  }

  //무대 좌표를 화면 좌표로 옮긴다. 카메라가 보는 지점이 화면 가운데에 온다.
  //
  //**기준점은 발이 닿는 지점이어야 한다.** 스프라이트 좌상단으로 재면 키 큰 그림일수록
  //위쪽이 지평선에 가까워져서 배율이 작게 잡힌다. 한 덩어리의 배율은 접지점 하나로 정한다
  project(point: Point, camera: CameraState): Projected {
    const here = this.flat(point);
    const origin = this.flat(camera.focus);
    const centerX = this.map.viewport.width / 2;

    return {
      x: centerX + (here.x - origin.x) * camera.zoom + camera.shake.x,
      y: this.baseFootY + (here.y - origin.y) * camera.zoom + camera.shake.y,
      scale: here.scale * camera.zoom,
    };
  }

  //카메라가 보는 지점이 화면에 떨어지는 자리. 줌·기울기는 이 점을 중심으로 건다
  get pivot(): Point {
    return { x: this.map.viewport.width / 2, y: this.baseFootY };
  }

  //기준점의 배율로 다른 점을 떨어뜨려 놓는다. 한 덩어리가 통째로 같은 배율을 쓴다
  offsetFrom(reference: Projected, from: Point, to: Point): Point {
    return {
      x: reference.x + (to.x - from.x) * reference.scale,
      y: reference.y + (to.y - from.y) * reference.scale,
    };
  }

  //배경 한 겹이 놓일 화면 사각형. 시차만큼만 카메라를 따라간다
  layerRect(layer: MapLayerData, camera: CameraState): { x: number; y: number; width: number; height: number } {
    const { width, height } = this.map.viewport;
    //카메라가 무대 가운데에서 얼마나 벗어났는지를 화면 픽셀로 잰다
    const drift = camera.focus.x * (this.focal / this.refDistance) * layer.parallax;
    return {
      x: layer.x * width - drift + camera.shake.x * layer.parallax,
      y: layer.y * height + camera.shake.y * layer.parallax,
      width: layer.width * width,
      height: layer.height * height,
    };
  }
}
