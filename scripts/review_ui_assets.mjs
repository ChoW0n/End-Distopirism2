//화면을 잠깐 순회해도 눌림·궁극기·승패 상태의 그림이 빠지지 않게 전체 UI 의존성을 정한다
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = 'assets/ui/kit';
//CSS 밖에서 app3d·overlay 가 동적으로 읽는 공통 그림
const DYNAMIC_IMAGES = [
  'U3_small_default', 'U15_overhead_front', 'U15_overhead_back',
  'R_mark', 'R_insight', 'R_resolve',
  'G_frame', 'G_hp_track', 'G_hp_fill', 'G_hp_loss',
  'G_sp_track', 'G_sp_fill', 'G_sp_loss', 'G_selection', 'G_critical',
  'U12_ultimate_empty', 'U12_ultimate_charged', 'U12_ultimate_pending', 'U12_ultimate_full',
];
const CARD_STATES = ['default', 'selected', 'locked', 'overhead_front', 'overhead_back'];

export function collectUiAssets(root = ROOT) {
  const css = readFileSync(join(root, 'web/battle.css'), 'utf-8');
  const ui = JSON.parse(readFileSync(join(root, 'assets/ui/ui-data.json'), 'utf-8'));
  const manifest = JSON.parse(readFileSync(join(root, KIT, 'manifest.json'), 'utf-8'));
  //선택자가 아직 한 번도 적용되지 않은 CSS 주소도 모두 포함한다
  const cssImages = [...css.matchAll(/assets\/ui\/kit\/([\w-]+\.png)/g)].map((m) => `${KIT}/${m[1]}`);
  const cards = Object.values(ui.display.cardKit).flatMap((skills) =>
    Object.keys(skills).flatMap((id) => CARD_STATES.map((state) => `${KIT}/K${id}_${state}.png`)),
  );
  const images = [...new Set([...cssImages, ...DYNAMIC_IMAGES.map((name) => `${KIT}/${name}.png`), ...cards])].sort();
  const registered = new Set(manifest.assets.map((asset) => `${KIT}/${asset.name}.png`));
  const unregistered = images.filter((path) => !registered.has(path));
  if (unregistered.length) throw new Error(`UI 납품 목록에 없는 참조\n${unregistered.join('\n')}`);
  return [...images, `${KIT}/gauge-layout.json`, `${KIT}/manifest.json`].sort();
}

export function assertUiAssets(root, paths) {
  const missing = paths.filter((path) => {
    try {
      const file = statSync(join(root, path));
      return !file.isFile() || file.size === 0;
    } catch {
      return true;
    }
  });
  if (missing.length) throw new Error(`UI 의존성 ${missing.length}개 누락. 묶음을 만들지 않는다\n${missing.join('\n')}`);
}

//node scripts/review_ui_assets.mjs [검사할 묶음 루트]. 소스의 전체 의존성을 대상 폴더와 비교한다
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const paths = collectUiAssets();
    assertUiAssets(resolve(process.argv[2] ?? ROOT), paths);
    console.log(`UI 의존성 ${paths.length}개 통과`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
