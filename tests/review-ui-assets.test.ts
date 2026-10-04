//QA-01: 첫 화면에서 요청되지 않은 UI 상태도 검토 묶음에 들어가야 한다
import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertUiAssets, collectUiAssets } from '../scripts/review_ui_assets.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const KIT = 'assets/ui/kit';
const temporary: string[] = [];
const pathFor = (name: string): string => `${KIT}/${name}.png`;

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'ed2-ui-assets-'));
  temporary.push(root);
  for (const path of ['web/battle.css', 'assets/ui/ui-data.json', `${KIT}/manifest.json`, `${KIT}/gauge-layout.json`]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(ROOT, path), join(root, path));
  }
  return root;
}

afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('검토 묶음의 전체 UI 상태', () => {
  it('QA에서 누락된 20개 상태를 화면 요청 여부와 관계없이 포함한다', () => {
    const required = [
      'K2041_default', 'K2041_selected', 'K2042_default', 'K2042_selected', 'K2043_default', 'K2043_selected',
      'K2099_default', 'K2099_selected', 'K2099_locked',
      'U12_ultimate_charged', 'U12_ultimate_pending', 'U12_ultimate_full',
      'U1_clash_default', 'U1_clash_pressed', 'U3_small_pressed', 'U6_ally_ordered',
      'U5_target_clash', 'U14_clash_draw', 'U19_banner_win', 'U19_banner_lose',
    ];
    expect(collectUiAssets(ROOT)).toEqual(expect.arrayContaining(required.map(pathFor)));
  });

  it('출혈·쓰러짐·일반 카드 등 다른 캐릭터 상태도 포함한다', () => {
    expect(collectUiAssets(ROOT)).toEqual(expect.arrayContaining([
      'U10_status_bleed', 'U10_status_confusion', 'U10_status_poison', 'U10_status_defense_down',
      'U6_ally_default', 'U6_ally_fallen', 'U2_s1_default', 'U2_s2_selected', 'U2_s3_locked',
      'U16_ultimate_card_default', 'U16_ultimate_card_selected', 'U16_ultimate_card_locked',
    ].map(pathFor)));
  });

  it('데이터에 카드가 추가되면 하단 카드와 머리 위 카드의 모든 상태를 포함한다', () => {
    const root = fixture();
    const ui = JSON.parse(readFileSync(join(root, 'assets/ui/ui-data.json'), 'utf-8'));
    ui.display.cardKit.next = { 9999: '새 기술' };
    writeFileSync(join(root, 'assets/ui/ui-data.json'), JSON.stringify(ui));
    const manifest = JSON.parse(readFileSync(join(root, KIT, 'manifest.json'), 'utf-8'));
    const names = ['K9999_default', 'K9999_selected', 'K9999_locked', 'K9999_overhead_front', 'K9999_overhead_back'];
    manifest.assets.push(...names.map((name) => ({ name })));
    writeFileSync(join(root, KIT, 'manifest.json'), JSON.stringify(manifest));
    expect(collectUiAssets(root)).toEqual(expect.arrayContaining(names.map(pathFor)));
  });

  it('납품 목록에 없는 CSS 참조는 조용히 빠뜨리지 않고 실패한다', () => {
    const root = fixture();
    writeFileSync(join(root, 'web/battle.css'), '.result { background: url(../assets/ui/kit/unknown.png); }');
    expect(() => collectUiAssets(root)).toThrow('assets/ui/kit/unknown.png');
  });

  it('다른 요청 파일이 모두 있어도 선택 상태 하나가 없으면 누락 경로를 보고한다', () => {
    const root = fixture();
    const paths = collectUiAssets(root);
    for (const path of paths.filter((path) => path.endsWith('.png'))) writeFileSync(join(root, path), 'fixture');
    expect(() => assertUiAssets(root, paths)).not.toThrow();
    rmSync(join(root, KIT, 'K2041_selected.png'));
    expect(() => assertUiAssets(root, paths)).toThrow('UI 의존성 1개 누락');
    expect(() => assertUiAssets(root, paths)).toThrow('assets/ui/kit/K2041_selected.png');
  });

  it('빈 파일과 그림 이름으로 만든 폴더도 정상 에셋으로 인정하지 않는다', () => {
    const root = fixture();
    writeFileSync(join(root, KIT, 'U1_clash_default.png'), '');
    mkdirSync(join(root, KIT, 'U1_clash_pressed.png'));
    expect(() => assertUiAssets(root, ['U1_clash_default', 'U1_clash_pressed'].map(pathFor))).toThrow('UI 의존성 2개 누락');
  });
});
