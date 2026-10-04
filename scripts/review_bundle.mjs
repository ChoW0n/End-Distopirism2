//아스트라 검토 묶음을 만든다 (docs/REVIEW-001 §7)
//그림·소리는 리포에 없어서(SPEC-002 §9) 요청 파일과 전체 UI 상태 의존성을 실행 묶음 하나로 싼다
//
//1. 화면을 빌드하고 타입 검사·테스트 결과를 BUILD.json 에 적는다
//2. 정적 서버를 띄우고 Playwright 로 세 화면을 열어 요청한 파일을 모은다. 404·페이지 오류가 하나라도 나면 멈춘다
//3. 같은 길에 screenshots/ 를 찍는다 (JPEG)
//4. review-bundle/<이름>/ 폴더와 같은 이름의 zip 을 만든다 (커밋하지 않는다)
//
//실행: node scripts/review_bundle.mjs            (그림이 들어 있는 작업 환경에서)
//Playwright 는 devDependency 가 아니다. 전역 설치본을 찾고, 없으면 PLAYWRIGHT_MODULE 로 경로를 준다

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertUiAssets, collectUiAssets } from './review_ui_assets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
const sha = run('git', ['rev-parse', '--short', 'HEAD']).stdout.trim();
const NAME = `end-distopirism2-review-${sha}`;
const BASE = join(ROOT, 'review-bundle');
const OUT = join(BASE, NAME);
//원본 출처·프레임 해시는 화면이 요청하지 않아도 검토 묶음에 보존한다
const S1_METADATA = ['assets/kyle/source-vfx.json', 'assets/kyle/vfx/s1-original/manifest.json'];

//세 화면. 묶음 첫 화면의 목록도 이 표로 만든다
const PAGES = [
  { path: 'web/battle.html', title: '전투', note: '실제 게임. 카일 1대1 · 제3 수문 v4. 메뉴 ☰ → 조작에서 시연·연출 실험·환경 이펙트 검수' },
  { path: 'web/vfx-space.html', title: '공간형 VFX', note: 'S1·S2·S3·결행 효과를 3D 곡면에 얹은 것과 평면 재생 비교. 궤도 슬라이더로 카메라를 돌린다' },
  { path: 'web/vfx-lab.html', title: '물금 실시간 VFX', note: 'S1 물금 셰이더 띠와 원본 15장 비교' },
];

//요청 경로 → 파일 형식
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.md': 'text/markdown; charset=utf-8',
};

function step(text) {
  console.log(`· ${text}`);
}

function originalVfxAssets(root) {
  const config = JSON.parse(readFileSync(join(root, S1_METADATA[0]), 'utf-8'));
  const manifest = JSON.parse(readFileSync(join(root, S1_METADATA[1]), 'utf-8'));
  const frames = config.frames.map((file) => `assets/kyle/${file}`);
  const recorded = manifest.frames.map((frame) => `assets/kyle/${frame.kyleRelativeFile}`);
  if (frames.length !== 15 || new Set(frames).size !== 15 || JSON.stringify(frames) !== JSON.stringify(recorded)) {
    throw new Error('S1 원본 15장 설정과 출처 목록이 일치하지 않는다');
  }
  for (const [index, file] of frames.entries()) {
    const sha256 = createHash('sha256').update(readFileSync(join(root, file))).digest('hex');
    if (sha256 !== manifest.frames[index].sha256) throw new Error(`S1 원본 해시가 다르다: ${file}`);
  }
  return { frames, files: [...S1_METADATA, ...frames] };
}

//Playwright 를 찾는다. 프로젝트 → PLAYWRIGHT_MODULE → 전역 설치본 순서
async function loadPlaywright() {
  const tries = ['playwright', process.env.PLAYWRIGHT_MODULE, '/opt/node22/lib/node_modules/playwright/index.mjs'].filter(Boolean);
  for (const t of tries) {
    try {
      return await import(t.startsWith('/') ? pathToFileURL(t).href : t);
    } catch {
      //다음 후보
    }
  }
  throw new Error('Playwright 를 찾지 못했다. PLAYWRIGHT_MODULE=<playwright/index.mjs 경로> 로 알려 준다');
}

//리포 루트를 그대로 내보내는 정적 서버. 화면이 ../assets 를 부르므로 루트에서 띄운다
function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

//빌드와 자동 검사. 실패해도 묶음은 만들되 BUILD.json 과 화면에 실패를 적는다
function buildAndCheck() {
  step('화면 빌드 (node web/build.mjs)');
  const build = run('node', ['web/build.mjs']);
  if (build.status !== 0) throw new Error(`빌드 실패\n${build.stderr}`);
  step('타입 검사 (npm run typecheck)');
  const tsc = run('npm', ['run', 'typecheck']);
  step('테스트 (vitest)');
  const test = run('npx', ['vitest', 'run', '--reporter=json']);
  let tests = { ok: false, total: 0, passed: 0, failed: 0, skipped: 0, files: 0 };
  try {
    const j = JSON.parse(test.stdout.slice(test.stdout.indexOf('{')));
    tests = { ok: j.success, total: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests, skipped: j.numPendingTests ?? 0, files: j.testResults?.length ?? 0 };
  } catch {
    tests.error = test.stderr.slice(-2000);
  }
  return {
    typecheck: { ok: tsc.status === 0, ...(tsc.status === 0 ? {} : { output: (tsc.stdout + tsc.stderr).slice(-2000) }) },
    tests,
  };
}

//세 화면을 돌며 요청 파일을 모으고 화면을 찍는다
async function crawl(origin, shots) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const seen = new Set();
  const errors = [];
  const open = async (path) => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('response', (r) => {
      const u = new URL(r.url());
      if (u.origin !== origin) return;
      if (r.status() >= 400) errors.push(`${r.status()} ${u.pathname}`);
      else seen.add(decodeURIComponent(u.pathname).replace(/^\//, ''));
    });
    page.on('pageerror', (e) => errors.push(`${path}: ${e.message}`));
    await page.goto(`${origin}/${path}`);
    return page;
  };
  const shot = (page, name) => page.screenshot({ path: join(shots, `${name}.jpg`), type: 'jpeg', quality: 85 });

  //전투: 불러오기가 끝나면 도움말을 닫고 모드마다 몇 장
  step('전투 화면');
  let page = await open('web/battle.html');
  await page.waitForSelector('#loading[hidden]', { state: 'attached', timeout: 120000 });
  if (await page.isVisible('#help-close')) await page.click('#help-close');
  await page.waitForTimeout(1500);
  await shot(page, 'battle-01-input');
  const mode = async (m) => {
    await page.evaluate((m) => {
      const box = document.querySelector('#mode');
      box.value = m;
      box.dispatchEvent(new Event('change'));
    }, m);
  };
  await mode('showcase');
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(2500);
    await shot(page, `battle-showcase-${String(i + 1).padStart(2, '0')}`);
  }
  await mode('envfx');
  await page.waitForTimeout(4000);
  await shot(page, 'battle-envfx');
  await mode('watch');
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(4000);
    await shot(page, `battle-watch-${i + 1}`);
  }
  await page.close();

  //공간형: 스킬마다 게임 카메라 세 시각 + 돌린 카메라 두 장
  step('공간형 VFX 화면');
  page = await open('web/vfx-space.html');
  await page.waitForFunction(() => window.__vfxSpace !== undefined, null, { timeout: 120000 });
  if (await page.evaluate(() => window.__vfxSpace.state().s1Source) !== 'original') errors.push('S1 기본 모드가 원본 컬러가 아니다');
  for (const skill of ['s1', 's2', 's3', 'ult']) {
    await page.evaluate((s) => window.__vfxSpace.skill(s), skill);
    const { loopMs } = await page.evaluate(() => window.__vfxSpace.state());
    const at = (k) => Math.round(loopMs * k);
    for (const source of skill === 's1' ? ['original', 'strip'] : [null]) {
      if (source) {
        await page.evaluate((value) => window.__vfxSpace.source(value), source);
        if (await page.evaluate(() => window.__vfxSpace.state().s1Source) !== source) errors.push(`S1 ${source} 모드 전환 실패`);
      }
      const label = source ? `${skill}-${source}` : skill;
      for (const k of [0.2, 0.4, 0.6]) {
        await page.evaluate(([ms]) => {
          window.__vfxSpace.orbit(0, 0);
          window.__vfxSpace.seek(ms);
        }, [at(k)]);
        await page.waitForTimeout(400);
        await shot(page, `space-${label}-t${at(k)}`);
      }
      for (const [yaw, up] of [[60, 0], [0, 55]]) {
        await page.evaluate(([y, u, ms]) => {
          window.__vfxSpace.orbit(y, u);
          window.__vfxSpace.seek(ms);
        }, [yaw, up, at(0.4)]);
        await page.waitForTimeout(400);
        await shot(page, `space-${label}-orbit${yaw}-${up}`);
      }
    }
    if (skill === 's1') {
      await page.evaluate(() => window.__vfxSpace.source('original'));
      if (await page.evaluate(() => window.__vfxSpace.state().s1Source) !== 'original') errors.push('S1 원본 컬러 모드 복귀 실패');
    }
  }
  await page.close();

  //물금 실시간: 나란히 비교 두 시각
  step('물금 실시간 VFX 화면');
  page = await open('web/vfx-lab.html');
  await page.waitForFunction(() => window.__vfxLab !== undefined, null, { timeout: 120000 });
  for (const ms of [200, 450]) {
    await page.evaluate((t) => {
      window.__vfxLab.compare('side');
      window.__vfxLab.pause();
      window.__vfxLab.seek(t);
    }, ms);
    await page.waitForTimeout(400);
    await shot(page, `lab-s1-t${ms}`);
  }
  await page.close();
  await browser.close();
  return { seen: [...seen].filter((p) => p !== '').sort(), errors };
}

//묶음 첫 화면. 세 화면·검토 문서·스크린샷 목록
function landing(info, shots) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const check = (ok) => (ok ? '<b class="ok">통과</b>' : '<b class="bad">실패</b>');
  const pages = PAGES.map((p) => `<li><a href="${p.path}">${esc(p.title)}</a><span>${esc(p.note)}</span></li>`).join('\n');
  const pics = shots.map((f) => `<a href="screenshots/${f}"><img loading="lazy" src="screenshots/${f}" alt="${esc(f)}"><small>${esc(f)}</small></a>`).join('\n');
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>End-Distopirism2 검토 묶음</title>
<style>
  :root { color-scheme: dark; --bg: #16130f; --panel: #211c16; --line: #3a3128; --text: #e8e0d4; --dim: #a39787; --gold: #c9a35a; }
  body { margin: 0; padding: 24px 16px 48px; background: var(--bg); color: var(--text); font: 15px/1.6 system-ui, sans-serif; }
  main { max-width: 1100px; margin: 0 auto; display: grid; gap: 24px; }
  h1 { margin: 0; font-size: 22px; } h2 { margin: 0 0 8px; font-size: 16px; color: var(--gold); }
  p, small { color: var(--dim); } a { color: var(--gold); }
  ul.pages { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
  ul.pages li { display: grid; gap: 2px; padding: 12px 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; }
  ul.pages a { font-weight: 600; font-size: 16px; } ul.pages span { color: var(--dim); }
  .ok { color: #8fc58a; } .bad { color: #e07a6a; }
  table { border-collapse: collapse; } td { padding: 2px 12px 2px 0; }
  code { background: var(--panel); padding: 1px 6px; border-radius: 4px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
  .grid a { display: grid; gap: 4px; text-decoration: none; } .grid img { width: 100%; border: 1px solid var(--line); border-radius: 4px; }
</style>
<main>
  <header>
    <h1>End-Distopirism2 검토 묶음</h1>
    <p>커밋 <code>${esc(info.commit)}</code> · ${esc(info.date)} · 검토 요청서 <a href="docs/REVIEW-001-아스트라-검토요청.md">REVIEW-001</a> (번호 R1~R6 으로 답해 주세요)</p>
  </header>
  <section><h2>화면</h2><ul class="pages">
${pages}
  </ul><p>정적 서버로 열어야 한다 (<code>python3 -m http.server 8000</code>). <code>file://</code> 로는 데이터를 못 읽는다.</p></section>
  <section><h2>자동 검사</h2><table>
    <tr><td>타입 검사</td><td>${check(info.typecheck.ok)}</td></tr>
    <tr><td>테스트</td><td>${check(info.tests.ok)} ${info.tests.passed}/${info.tests.total} · 건너뜀 ${info.tests.skipped} (${info.tests.files} 파일)</td></tr>
    <tr><td>묶음 파일</td><td>${info.files} 개 · 요청 파일과 전체 UI 상태 의존성</td></tr>
  </table></section>
  <section><h2>스크린샷 (작업 쪽에서 찍음, 1600×900)</h2><div class="grid">
${pics}
  </div></section>
</main>
`;
}

async function main() {
  //누락된 UI가 있으면 빌드·화면 순회 전에 멈춘다
  const uiAssets = collectUiAssets(ROOT);
  assertUiAssets(ROOT, uiAssets);
  const s1Assets = originalVfxAssets(ROOT);
  const checks = buildAndCheck();
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  rmSync(OUT, { recursive: true, force: true });
  const shots = join(OUT, 'screenshots');
  mkdirSync(shots, { recursive: true });
  let result;
  try {
    result = await crawl(origin, shots);
  } finally {
    server.close();
  }
  for (const file of s1Assets.frames) {
    if (!result.seen.includes(file)) result.errors.push(`S1 원본 프레임이 요청되지 않았다: ${file}`);
  }
  if (result.errors.length > 0) {
    throw new Error(`화면에서 오류가 났다. 묶음을 만들지 않는다\n${result.errors.join('\n')}`);
  }

  //요청한 파일 + 모든 UI 상태 + 원본 출처 + 읽을 문서
  const docs = readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md') || (f.startsWith('qa-') && f.endsWith('.json'))).map((f) => `docs/${f}`);
  const files = [...new Set([...result.seen, ...uiAssets, ...s1Assets.files, ...docs, 'docs/참고/gpt-astra-이미지제작-능력.md'])].sort();
  step(`파일 ${files.length}개 복사`);
  for (const rel of files) {
    const dst = join(OUT, rel);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(ROOT, rel), dst);
  }
  assertUiAssets(OUT, uiAssets);
  originalVfxAssets(OUT);
  const info = {
    name: NAME,
    commit: run('git', ['rev-parse', 'HEAD']).stdout.trim(),
    branch: run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim(),
    date: new Date().toISOString(),
    dirty: run('git', ['status', '--porcelain', '--', 'src', 'web', 'docs', 'assets', 'tests', 'scripts']).stdout.trim() !== '',
    ...checks,
    uiAssets: { ok: true, count: uiAssets.length },
    s1Original: { ok: true, frames: s1Assets.frames.length, metadata: S1_METADATA },
    files: files.length,
    pages: PAGES.map((p) => p.path),
  };
  writeFileSync(join(OUT, 'BUILD.json'), `${JSON.stringify(info, null, 2)}\n`);
  writeFileSync(join(OUT, 'asset-list.txt'), `${files.join('\n')}\n`);
  writeFileSync(join(OUT, 'index.html'), landing(info, readdirSync(shots).sort()));

  step('zip');
  rmSync(`${OUT}.zip`, { force: true });
  const zip = spawnSync('zip', ['-qr', `${NAME}.zip`, NAME], { cwd: BASE });
  if (zip.status !== 0) throw new Error('zip 실패 (zip 명령이 있어야 한다)');
  const mb = (statSync(`${OUT}.zip`).size / 1e6).toFixed(1);
  console.log(`\n묶음: ${OUT}.zip (${mb} MB, 파일 ${files.length}개)`);
  if (!checks.typecheck.ok || !checks.tests.ok) console.log('주의: 타입 검사나 테스트가 실패했다. BUILD.json 을 본다');
  if (info.dirty) console.log('주의: 커밋 안 된 변경이 있다. 묶음이 커밋과 다를 수 있다');
}

main().catch((error) => {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
});
