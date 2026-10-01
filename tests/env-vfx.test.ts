//공용 환경 이펙트 v1 바인딩이 납품 manifest·카메라 프리셋과 SPEC-005 §16 을 지키는지 본다

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { EnvVfxError, parseEnvVfx, usedAtlases } from '../src/render/envvfx.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(here, '../assets/env-vfx', p), 'utf8'));
const manifest = read('metadata/manifest.json');
const camera = read('metadata/camera-presets.json');
const bindings = read('bindings.json');
const vfx = parseEnvVfx(manifest, camera, bindings);

describe('공용 환경 이펙트 v1', () => {
  it('128장·애니메이션 12종을 읽는다', () => {
    expect(vfx.sprites.size).toBe(128);
    expect(vfx.animations.size).toBe(12);
  });

  it('D 는 50/80/120/180ms · 페이드 180, E·F 는 33/50/83/150ms · 페이드 140 (납품 README)', () => {
    expect(vfx.animations.get('D_contact')).toMatchObject({ durations: [50, 80, 120, 180], fadeLast: 180 });
    expect(vfx.animations.get('F_front_ring')).toMatchObject({ durations: [33, 50, 83, 150], fadeLast: 140 });
  });

  it('균열은 알파만 쓰는 색 교체 그림이다', () => {
    expect(vfx.sprites.get('B_02_01')?.tint).toBe('alpha_silhouette');
  });

  it('물 위에는 먼지·균열·파편을 내지 않는다 (§16.1)', () => {
    for (const [name, b] of vfx.events) {
      if (!b.surfaces.includes('water')) continue;
      for (const sp of b.spawns) expect(sp.play, name).toMatch(/^F_/);
    }
  });

  it('카메라 상한 0.8%H, 프리셋은 납품값 그대로', () => {
    expect(vfx.camera.cap).toBe(0.008);
    expect(vfx.camera.presets.get('pressure')).toEqual({ amplitude: 0.0025, duration: 140, zoom: 0.01 });
  });

  it('쓰는 아틀라스는 D·F·G·B 넷뿐이다', () => {
    expect(usedAtlases(vfx)).toEqual(['atlases/B_cracks.png', 'atlases/D_dust.png', 'atlases/F_pressure.png', 'atlases/G_residue.png']);
  });

  it('없는 그림을 가리키면 멈춘다', () => {
    expect(() => parseEnvVfx(manifest, camera, { events: { x: { surfaces: [], camera: 'none', spawns: [{ play: 'Z_99', anchor: 'foot' }] } } })).toThrow(EnvVfxError);
  });
});
