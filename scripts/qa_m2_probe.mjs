//M2 검수 전용 번들. 본편 소스를 그대로 묶고 측정 참조만 추가한다. 제품 빌드에는 포함하지 않는다
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const output = process.argv[2];
if (!output) throw new Error('사용법: node scripts/qa_m2_probe.mjs <임시 JS 경로>');
const source = readFileSync('src/renderer3d/app3d.ts', 'utf8');
const marker = '  const glyphs:';
if (source.split(marker).length !== 2) throw new Error('측정 삽입 지점을 찾지 못했다');
await build({
  stdin: {
    contents: source.replace(marker, '  window.__m2 = { stage, state: () => ({ phase, turn: session?.battle.turn, speed }) };\n' + marker),
    resolveDir: resolve('src/renderer3d'), loader: 'ts',
  },
  bundle: true, format: 'esm', target: 'es2020', outfile: output,
});
