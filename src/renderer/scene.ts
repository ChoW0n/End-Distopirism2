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

export class Scene {
  //무대 1px 당 화면 px. 캐릭터 키가 화면에서 차지할 비율로 정해진다
  private readonly unit: number;
  //지평선과 발 기준선. 원근 배율을 이 둘 사이 거리로 잰다
  private readonly horizonY: number;
  private readonly baseFootY: number;

  //characterHeight 는 캐릭터 키 H, groundY 는 무대의 접지선이다
  constructor(
    readonly map: MapPlacement,
    characterHeight: number,
    private readonly groundY: number,
  ) {
    const height = map.viewport.height;
    this.unit = (map.characterHeightRatio * height) / characterHeight;
    this.horizonY = map.groundBoundary * height;
    this.baseFootY = map.footYRatio * height;
    if (this.baseFootY <= this.horizonY) {
      throw new SceneError('발 기준선이 지평선보다 위에 있다. placement.json 을 확인할 것');
    }
  }

  get viewport(): { width: number; height: number } {
    return this.map.viewport;
  }

  //줌을 뺀 화면 좌표. 무대 y 가 클수록(앞쪽일수록) 아래로 내려오고 커진다
  private flat(point: Point): Projected {
    const y = this.baseFootY + (point.y - this.groundY) * this.unit;
    //지평선에 가까울수록 작아진다. 2.5D 의 거리감이 여기서 나온다
    const depth = Math.max(0.05, (y - this.horizonY) / (this.baseFootY - this.horizonY));
    return { x: point.x * this.unit * depth, y, scale: this.unit * depth };
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
    const drift = camera.focus.x * this.unit * layer.parallax;
    return {
      x: layer.x * width - drift + camera.shake.x * layer.parallax,
      y: layer.y * height + camera.shake.y * layer.parallax,
      width: layer.width * width,
      height: layer.height * height,
    };
  }
}
