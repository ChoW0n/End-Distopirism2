//그림·메타데이터·UI를 내장해 서버 없이 열리는 M3 검토본을 만든다
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = 'assets/remnantWalker';
const manifest = JSON.parse(readFileSync(`${root}/sprite-manifest.json`, 'utf8'));
const layout = JSON.parse(readFileSync(`${root}/source-layout.json`, 'utf8'));
const checks = JSON.parse(readFileSync(`${root}/asset-checks.json`, 'utf8'));
const images = manifest.frames.map(frame => {
  const bytes = readFileSync(`${root}/${frame.file}`);
  if (createHash('sha256').update(bytes).digest('hex') !== checks.find(check => check.id === frame.id)?.normalizedSha256) {
    throw new Error(`검증 후 그림이 바뀌었다: ${frame.file}`);
  }
  return `data:image/png;base64,${bytes.toString('base64')}`;
});
const escapeScript = text => text.replace(/<\/script/gi, '<\\/script');
const script = `window.REMNANT_REVIEW_DATA=${escapeScript(JSON.stringify({ manifest, layout, images }))};\n${readFileSync('web/remnant-review.js', 'utf8')}`;
const html = readFileSync('web/remnant-review.html', 'utf8')
  .replace('<link rel="stylesheet" href="remnant-review.css">', () => `<style>${readFileSync('web/remnant-review.css', 'utf8')}</style>`)
  .replace('<script src="remnant-review.js" defer></script>', () => `<script>${escapeScript(script)}</script>`);
const output = resolve(process.argv[2] ?? 'out/End-Distopirism-M3.html');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, html);
console.log(`${output}: ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB, ${images.length}장 내장`);
