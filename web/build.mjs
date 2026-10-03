//도메인을 브라우저용 한 덩어리로 묶는다. 전투 규칙을 웹에서 다시 짜지 않고 그대로 쓴다
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

await build({
  entryPoints: ['src/domain/index.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'ED',
  target: 'es2020',
  outfile: 'web/domain.js',
});
//전투 수치는 도메인이 읽는 그 파일 그대로 복사한다. 웹용 사본을 따로 만들지 않는다
copyFileSync('docs/battle-data.json', 'web/battle-data.json');

//전투 화면. 도메인 + 교환 묶기 + 3D 무대(three.js)를 한 덩어리로 묶는다
//이쪽은 모듈로 싣는다. 데이터와 그림을 fetch 로 읽어서 file:// 로는 안 열린다
await build({
  entryPoints: ['src/renderer3d/app3d.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  outfile: 'web/battle.js',
});
//물금 실시간 VFX 효과 단독 실험 화면 (SPEC-005 §15.1)
await build({
  entryPoints: ['src/renderer3d/vfx-lab.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  outfile: 'web/vfx-lab.js',
});
//물금 공간형 VFX 시험 화면 (SPEC-005 §15.3)
await build({
  entryPoints: ['src/renderer3d/vfx-space.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  outfile: 'web/vfx-space.js',
});
//2D 캔버스 화면은 비교용으로 남긴다 (SPEC-005 §9)
await build({
  entryPoints: ['src/renderer/app.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outfile: 'web/battle2d.js',
});

//파일 하나로도 열리게 묶어 둔다. file:// 로 열면 fetch 가 막혀서 데이터를 안에 박는다
const read = (p) => readFileSync(p, 'utf-8');
const html = read('web/index.html')
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${read('web/style.css')}\n</style>`)
  .replace('<script src="domain.js"></script>', () => `<script>\n${read('web/domain.js')}\n</script>`)
  .replace('<script src="main.js"></script>',
    `<script>\nwindow.__BATTLE_DATA__ = ${read('web/battle-data.json')};\n${read('web/main.js')}\n</script>`);
writeFileSync('web/standalone.html', html);

//공유용 한 장. CSS·스크립트를 안에 넣고 데이터는 같은 폴더의 assets/ · data/ 에서 읽는다.
//그림은 리포에 없으므로(SPEC-002 §9) 올릴 때 파일을 따로 붙인다
//공유본은 그림을 같은 폴더 assets/ 에서 읽는다. CSS·HTML 의 ../assets/ 를 고친다 (UI 묶음 판, SPEC-004 §13.5)
const local = (text) => text.replace(/\.\.\/assets\//g, 'assets/');
const page = local(read('web/battle.html'))
  .replace('<!doctype html>\n', '')
  .replace('<link rel="stylesheet" href="battle.css">', () => `<style>\n${local(read('web/battle.css'))}\n</style>`)
  .replace('<canvas id="view" width="1600" height="900">',
    '<canvas id="view" width="1600" height="900" data-assets="assets" data-battle="data/battle-data.json">')
  //코드에 $& · $' 같은 글자가 있으면 문자열 치환이 그걸 치환 패턴으로 읽어 코드가 깨진다. 함수로 넘긴다
  .replace('<script type="module" src="battle.js"></script>', () => `<script type="module">\n${read('web/battle.js').replace(/<\/script/gi, '<\\/script')}\n</script>`)
  .replace('<body>\n', '')
  .replace('\n</body>', '');
mkdirSync('web/share', { recursive: true });
writeFileSync('web/share/index.html', page);
//물금 VFX 실험 화면 공유본. 설정은 같은 폴더 assets/kyle/realtime-vfx.json 에서 읽는다
const lab = read('web/vfx-lab.html')
  .replace('<!doctype html>\n', '')
  .replace('<canvas id="view">', '<canvas id="view" data-assets="assets">')
  .replace('<script type="module" src="vfx-lab.js"></script>', () => `<script type="module">\n${read('web/vfx-lab.js').replace(/<\/script/gi, '<\\/script')}\n</script>`)
  .replace('<body>\n', '')
  .replace('\n</body>', '');
writeFileSync('web/share/vfx-lab.html', lab);
//물금 공간형 시험 화면 공유본. 설정·그림은 같은 폴더 assets/ 에서 읽는다
const spaceLab = read('web/vfx-space.html')
  .replace('<!doctype html>\n', '')
  .replace('<canvas id="view">', '<canvas id="view" data-assets="assets">')
  .replace('<script type="module" src="vfx-space.js"></script>', () => `<script type="module">\n${read('web/vfx-space.js').replace(/<\/script/gi, '<\\/script')}\n</script>`)
  .replace('<body>\n', '')
  .replace('\n</body>', '');
writeFileSync('web/share/vfx-space.html', spaceLab);
console.log('web/domain.js, web/battle.js, web/vfx-lab.js, web/vfx-space.js, web/battle-data.json, web/standalone.html, web/share/index.html, web/share/vfx-lab.html, web/share/vfx-space.html');
