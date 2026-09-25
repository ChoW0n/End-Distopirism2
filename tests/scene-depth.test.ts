//원근 깊이 보정 (SPEC-005 §4 depthZoom, 2026-09-25)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseMapPlacement, Scene } from '../src/renderer/scene.js';

const here = dirname(fileURLToPath(import.meta.url));
const map = parseMapPlacement(JSON.parse(readFileSync(resolve(here, '../assets/map/placement.json'), 'utf8')));
const H = 1340;
const ground = 1640;
const scene = new Scene(map, H, ground);
const camera = { focus: { x: 0, y: 0 }, zoom: 1, shake: { x: 0, y: 0 } };

describe('깊이 줌 보정', () => {
  it('접지선에서는 1 이다', () => {
    expect(scene.depthRatio(ground)).toBeCloseTo(1);
  });

  //보정 줌을 곱하면 뒤에 선 사람도 접지선에 선 사람과 같은 크기가 된다
  it('뒤에 설수록 커지고, 곱하면 화면상 크기가 접지선과 같아진다', () => {
    const back = ground - 0.81 * H;
    const ratio = scene.depthRatio(back);
    expect(ratio).toBeGreaterThan(1);
    const scaleAtGround = scene.project({ x: 0, y: ground }, camera).scale;
    const scaleAtBack = scene.project({ x: 0, y: back }, camera).scale;
    expect(scaleAtBack * ratio).toBeCloseTo(scaleAtGround);
  });
});
