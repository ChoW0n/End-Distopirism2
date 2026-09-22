//계층 규칙을 코드로 붙들어 둔다 (CLAUDE.md · SPEC-003 §7)
//유니티 재전환이 죽는 건 도메인에 렌더러 의존성이 섞이는 순간이다

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../src');

//폴더 밑의 .ts 파일을 전부 읽는다
function filesIn(dir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesIn(full));
    else if (name.endsWith('.ts')) out.push({ path: full, text: readFileSync(full, 'utf-8') });
  }
  return out;
}

//렌더러·브라우저 냄새가 나는 말들
const FORBIDDEN = [
  /\bdocument\b/,
  /\bwindow\b/,
  /\bHTMLCanvasElement\b/,
  /\bCanvasRenderingContext2D\b/,
  /\bfetch\(/,
  /from 'three/,
  /\brequestAnimationFrame\b/,
];

describe('계층 규칙', () => {
  //도메인은 순수해야 한다. 이벤트만 내보낸다
  it.each(['domain', 'render', 'ui', 'camera'])('src/%s 에 DOM·렌더러 의존성이 없다', (layer) => {
    for (const file of filesIn(join(src, layer))) {
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(file.text), `${file.path} 에 ${pattern} 이 있다`).toBe(false);
      }
    }
  });

  it('도메인이 바깥 계층을 가져다 쓰지 않는다', () => {
    for (const file of filesIn(join(src, 'domain'))) {
      expect(file.text).not.toMatch(/from '\.\.\/(render|ui|camera|renderer|platform)/);
    }
  });

  //파일 시스템을 아는 건 platform 뿐이다. 브라우저에서는 이 자리만 갈아 끼운다
  it.each(['domain', 'render', 'ui', 'camera'])('src/%s 가 파일 시스템을 모른다', (layer) => {
    for (const file of filesIn(join(src, layer))) {
      expect(file.text).not.toMatch(/from 'node:/);
    }
  });

  //게임 수치를 코드에 박지 않는다 — 전투 규칙 상수가 도메인에 없어야 한다
  it('도메인에 전투 수치가 박혀 있지 않다', () => {
    for (const file of filesIn(join(src, 'domain'))) {
      //0.6(코인 확률) · 100(정신력 상한) 같은 값은 battle-data.json 에서 온다
      expect(file.text).not.toMatch(/coinBaseProbability\s*=\s*[\d.]/);
      expect(file.text).not.toMatch(/mentalityMax\s*=\s*\d/);
    }
  });

  //렌더러만 DOM 을 쓴다. 타입 검사도 갈라 놓았다
  it('renderer 만 DOM 을 쓴다', () => {
    const tsconfig = JSON.parse(readFileSync(resolve(here, '../tsconfig.json'), 'utf-8')) as {
      compilerOptions: { lib: string[] };
      exclude: string[];
    };
    expect(tsconfig.compilerOptions.lib).not.toContain('DOM');
    expect(tsconfig.exclude).toContain('src/renderer');

    const renderer = JSON.parse(
      readFileSync(resolve(here, '../tsconfig.renderer.json'), 'utf-8'),
    ) as { compilerOptions: { lib: string[] }; include: string[] };
    expect(renderer.compilerOptions.lib).toContain('DOM');
    expect(renderer.include).toEqual(['src/renderer']);
  });
});
