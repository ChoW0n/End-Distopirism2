//궁극기 컷신 13레이어가 SPEC-002 §7 대로 배치되는지 본다
//목 데이터를 만들지 않고 리포에 있는 소각원 매니페스트를 그대로 쓴다

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadSpriteCatalog } from '../src/platform/node-manifest.js';
import { CutsceneDirector, CutsceneError, type CutscenePose } from '../src/render/cutscene.js';
import type { CutsceneData } from '../src/render/manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const sprites = loadSpriteCatalog(resolve(here, '../assets/incinerator/sprite-manifest.json'));
const cutscene = sprites.manifest.cutscene!;
const director = new CutsceneDirector(cutscene);

//레이어 id 로 배치를 찾는다
function find(transforms: ReturnType<CutsceneDirector['layers']>, id: string) {
  const found = transforms.find((t) => t.layerId === id);
  if (!found) throw new Error(`배치에 없다: ${id}`);
  return found;
}

describe('레이어 구조', () => {
  it('13장이 전부 들어 있다', () => {
    expect(cutscene.layers).toHaveLength(13);
    expect(cutscene.size).toEqual({ width: 1774, height: 887 });
  });

  it('body-core 가 루트고 나머지 본체는 그 자식이다', () => {
    expect(director.layer('body-core').parent).toBe('root');
    for (const id of ['body-underpaint', 'coat-rear', 'coat-front', 'coat-side', 'arm-axe', 'head-hood']) {
      expect(director.layer(id).parent).toBe('body-core');
    }
  });

  it('눈 4장과 입 2장은 head-hood 자식이다', () => {
    const face = cutscene.layers.filter((l) => l.parent === 'head-hood');
    expect(face).toHaveLength(6);
    expect(face.filter((l) => l.id.startsWith('eye-'))).toHaveLength(4);
    expect(face.filter((l) => l.id.startsWith('mouth-'))).toHaveLength(2);
  });

  it('부모가 없거나 순환하면 거부한다', () => {
    const orphan: CutsceneData = {
      size: cutscene.size,
      layers: [{ ...director.layer('body-core'), parent: '없는-레이어' }],
    };
    expect(() => new CutsceneDirector(orphan)).toThrow(CutsceneError);

    const core = director.layer('body-core');
    const head = director.layer('head-hood');
    const cyclic: CutsceneData = {
      size: cutscene.size,
      layers: [
        { ...core, parent: 'head-hood' },
        { ...head, parent: 'body-core' },
      ],
    };
    expect(() => new CutsceneDirector(cyclic)).toThrow(CutsceneError);
  });
});

describe('§7 눈·입은 하나만 켠다', () => {
  it('얼굴 그룹이 3개다', () => {
    expect(director.faceGroups.sort()).toEqual(['eye-screen-left', 'eye-screen-right', 'mouth']);
  });

  it('기본 자세에서 각 그룹이 정확히 한 장만 보인다', () => {
    const drawn = director.layers().map((t) => t.layerId);

    for (const group of director.faceGroups) {
      const shown = drawn.filter((id) => id === `${group}-open` || id === `${group}-closed`);
      expect(shown).toHaveLength(1);
    }
    //기본은 눈을 뜨고 입을 다문 상태다
    expect(drawn).toContain('eye-screen-left-open');
    expect(drawn).toContain('mouth-closed');
    expect(drawn).not.toContain('eye-screen-left-closed');
    expect(drawn).not.toContain('mouth-open');
  });

  it('상태를 바꾸면 반대쪽 한 장으로 교체된다', () => {
    const drawn = director
      .layers({ face: { 'eye-screen-left': 'closed', mouth: 'open' } })
      .map((t) => t.layerId);

    expect(drawn).toContain('eye-screen-left-closed');
    expect(drawn).not.toContain('eye-screen-left-open');
    expect(drawn).toContain('mouth-open');
    expect(drawn).not.toContain('mouth-closed');
    //건드리지 않은 눈은 그대로다
    expect(drawn).toContain('eye-screen-right-open');
  });

  it('어떤 자세에서도 같은 그룹이 둘 다 켜지지 않는다', () => {
    const poses: CutscenePose[] = [
      {},
      { face: { 'eye-screen-left': 'closed' } },
      { face: { 'eye-screen-left': 'open', 'eye-screen-right': 'closed', mouth: 'open' } },
    ];

    for (const pose of poses) {
      const drawn = director.layers(pose).map((t) => t.layerId);
      for (const group of director.faceGroups) {
        const shown = drawn.filter((id) => id.startsWith(`${group}-`));
        expect(shown).toHaveLength(1);
      }
    }
  });
});

describe('§7 회전 한도', () => {
  it('매니페스트 값을 넘겨도 한도에서 잘린다', () => {
    //머리·팔은 0.25°, 옷자락은 0.55~0.8°
    expect(director.rotationOf('head-hood', { rotations: { 'head-hood': 45 } })).toBe(0.25);
    expect(director.rotationOf('arm-axe', { rotations: { 'arm-axe': -90 } })).toBe(-0.25);
    expect(director.rotationOf('coat-side', { rotations: { 'coat-side': 10 } })).toBe(0.8);
    expect(director.rotationOf('coat-front', { rotations: { 'coat-front': -10 } })).toBe(-0.55);
  });

  it('motionDeg 가 0인 레이어는 아예 안 돈다', () => {
    expect(director.rotationOf('body-core', { rotations: { 'body-core': 30 } })).toBe(0);
    expect(director.rotationOf('mouth-open', { rotations: { 'mouth-open': 30 } })).toBe(0);
  });

  it('최대 자세에서도 어떤 레이어도 한도를 넘지 않는다', () => {
    for (const transform of director.layers(director.peakPose())) {
      //부모 회전이 누적되므로 조상 한도의 합과 비교한다
      let limit = 0;
      let current = director.layer(transform.layerId);
      for (;;) {
        limit += Math.abs(current.motionDeg);
        if (current.parent === 'root') break;
        current = director.layer(current.parent);
      }
      expect(Math.abs(transform.rotationDeg)).toBeLessThanOrEqual(limit + 1e-9);
    }
  });
});

describe('부모 계층이 실제로 먹는다', () => {
  it('머리를 돌리면 얼굴 파츠가 따라간다', () => {
    const rest = director.layers();
    const turned = director.layers({ rotations: { 'head-hood': 0.25 } });

    const restEye = find(rest, 'eye-screen-left-open');
    const turnedEye = find(turned, 'eye-screen-left-open');

    //눈 자체는 motionDeg 0 이지만 부모 회전이 누적된다
    expect(turnedEye.rotationDeg).toBeCloseTo(0.25, 10);
    //피벗도 머리 피벗을 중심으로 옮겨간다
    expect(turnedEye.pivot).not.toEqual(restEye.pivot);
  });

  it('얼굴 파츠는 자기 중심이 아니라 머리를 따라 돈다', () => {
    const turned = director.layers({ rotations: { 'head-hood': 0.25 } });
    const eye = find(turned, 'eye-screen-left-open');
    const head = director.layer('head-hood');
    const local = director.layer('eye-screen-left-open');

    //머리 피벗에서 눈 피벗까지의 거리는 회전해도 그대로다
    const before = Math.hypot(local.pivot.x - head.pivot.x, local.pivot.y - head.pivot.y);
    const after = Math.hypot(eye.pivot.x - head.pivot.x, eye.pivot.y - head.pivot.y);
    expect(after).toBeCloseTo(before, 6);
  });

  it('자기 회전은 자기 피벗을 옮기지 않는다', () => {
    const rest = find(director.layers(), 'arm-axe');
    const turned = find(director.layers({ rotations: { 'arm-axe': 0.25 } }), 'arm-axe');

    expect(turned.pivot).toEqual(rest.pivot);
    expect(turned.rotationDeg).toBeCloseTo(0.25, 10);
  });

  it('루트를 돌리면 전부 따라 돈다', () => {
    //body-core 는 motionDeg 0 이라 돌지 않는다. 이게 접합부를 지키는 장치다
    const turned = director.layers({ rotations: { 'body-core': 5 } });
    for (const transform of turned) {
      const own = director.layer(transform.layerId).motionDeg;
      //조상 중 body-core 는 0 이므로 자기 한도만 남는다
      expect(Math.abs(transform.rotationDeg)).toBeLessThanOrEqual(Math.abs(own) + 1e-9);
    }
  });
});

describe('§7 배율은 루트에만 한 번', () => {
  it('배율을 바꿔도 레이어 사이 비율이 유지된다', () => {
    const base = director.layers();
    const scaled = director.layers({}, { scale: 2 });

    for (const transform of scaled) {
      const origin = find(base, transform.layerId);
      expect(transform.pivot.x).toBeCloseTo(origin.pivot.x * 2, 9);
      expect(transform.pivot.y).toBeCloseTo(origin.pivot.y * 2, 9);
      expect(transform.offset.x).toBeCloseTo(origin.offset.x * 2, 9);
      expect(transform.offset.y).toBeCloseTo(origin.offset.y * 2, 9);
      //배율이 회전을 건드리면 안 된다
      expect(transform.rotationDeg).toBeCloseTo(origin.rotationDeg, 10);
      expect(transform.scale).toBe(2);
    }
  });

  it('모든 레이어가 같은 배율을 쓴다', () => {
    const scaled = director.layers({}, { scale: 1.5 });
    expect(new Set(scaled.map((t) => t.scale))).toEqual(new Set([1.5]));
  });
});

describe('그리기 순서', () => {
  it('z 오름차순으로 나온다', () => {
    const z = director.layers().map((t) => t.z);
    expect([...z].sort((a, b) => a - b)).toEqual(z);
  });

  it('밑칠이 본체보다 먼저 그려진다', () => {
    //접합부는 뒤에 깔린 body-underpaint 겹침으로만 막혀 있다
    const ids = director.layers().map((t) => t.layerId);
    expect(ids.indexOf('body-underpaint')).toBeLessThan(ids.indexOf('body-core'));
    expect(ids.indexOf('coat-rear')).toBeLessThan(ids.indexOf('body-core'));
    expect(ids.indexOf('body-core')).toBeLessThan(ids.indexOf('head-hood'));
  });

  it('기본 자세에서 10장이 그려진다', () => {
    //13장 중 꺼져 있는 얼굴 파츠 3장이 빠진다
    expect(director.layers()).toHaveLength(10);
  });
});
