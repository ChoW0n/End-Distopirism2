//물금 띠 효과의 생성·취소·반복 (SPEC-005 §15.1 · 준비물 QA T04·T05). WebGL 없이 three 객체만 본다
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseRibbonConfig, slashDuration } from '../src/render/ribbon-slash.js';
import { RibbonSlashEffect } from '../src/renderer3d/ribbon-slash.js';

const config = parseRibbonConfig(JSON.parse(readFileSync(new URL('../assets/kyle/realtime-vfx.json', import.meta.url), 'utf-8')));
const total = slashDuration(config);
const at = new THREE.Vector3();

//Promise 가 이미 끝났는지
async function settled(p: Promise<void>): Promise<boolean> {
  let done = false;
  void p.then(() => (done = true));
  await Promise.resolve();
  await Promise.resolve();
  return done;
}

describe('RibbonSlashEffect', () => {
  it('띠 정점: 구간 수 + 1 쌍, u 는 0 에서 1', () => {
    const g = RibbonSlashEffect.buildGeometry(config, 2);
    const uv = g.getAttribute('uv');
    expect(uv.count).toBe((config.path.segments + 1) * 2);
    expect(uv.getX(0)).toBe(0);
    expect(uv.getX(uv.count - 1)).toBe(1);
    g.dispose();
  });

  it('끝 시각에 내려가고 Promise 가 끝난다', async () => {
    const fx = new RibbonSlashEffect(config, 2);
    const h = fx.spawn(at, 1);
    fx.update(total - 1);
    expect(fx.activeCount).toBe(1);
    expect(await settled(h.done)).toBe(false);
    fx.update(1);
    expect(fx.activeCount).toBe(0);
    expect(await settled(h.done)).toBe(true);
    fx.dispose();
  });

  it('소멸 중 취소(재시작)에도 Promise 가 끝나고 자식이 남지 않는다', async () => {
    const fx = new RibbonSlashEffect(config, 2);
    const h = fx.spawn(at, -1);
    fx.update(500);
    fx.clear();
    expect(fx.activeCount).toBe(0);
    expect(fx.root.children).toHaveLength(0);
    expect(await settled(h.done)).toBe(true);
    fx.dispose();
  });

  it('동시에 4개까지, 넘으면 가장 오래된 것을 끝낸다', async () => {
    const fx = new RibbonSlashEffect(config, 2);
    const first = fx.spawn(at, 1);
    for (let i = 0; i < 4; i++) fx.spawn(at, 1);
    expect(fx.activeCount).toBe(4);
    expect(await settled(first.done)).toBe(true);
    fx.dispose();
  });

  it('100회 반복 뒤 활성 0, 장면 자식 0', () => {
    const fx = new RibbonSlashEffect(config, 2);
    for (let i = 0; i < 100; i++) {
      fx.spawn(at, i % 2 ? 1 : -1);
      fx.update(total / 3);
    }
    fx.update(total);
    expect(fx.activeCount).toBe(0);
    expect(fx.root.children).toHaveLength(0);
    fx.dispose();
  });

  it('좌우 반전은 공간(scale.x)만, 시크로 같은 시각에 같은 uniform', () => {
    const fx = new RibbonSlashEffect(config, 2);
    const a = fx.spawn(at, 1);
    const b = fx.spawn(at, -1);
    fx.seek(a.id, 610);
    fx.seek(b.id, 610);
    const [ga, gb] = fx.root.children as THREE.Group[];
    expect(ga?.scale.x).toBe(1);
    expect(gb?.scale.x).toBe(-1);
    const tail = (g: THREE.Group | undefined) => ((g?.children[0] as THREE.Mesh).material as THREE.ShaderMaterial).uniforms['uTail']?.value;
    expect(tail(ga)).toBe(tail(gb));
    expect(tail(ga)).toBeCloseTo(0.25, 8);
    fx.dispose();
  });
});
