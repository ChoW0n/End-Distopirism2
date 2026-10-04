"""M3 검토 UI 조작과 기본/후보 아트 분리를 실제 Chromium에서 확인한다."""
import argparse
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--standalone', type=Path)
    args = parser.parse_args()
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    subprocess.run(['node', 'scripts/qa_m2_probe.mjs', str(out / 'probe.js')], check=True)
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for width, height in [(1440, 1080), (390, 844)]:
            page = browser.new_page(viewport={'width': width, 'height': height})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda response: errors.append(f'{response.status} {response.url}') if response.status >= 400 else None)
            page.goto(args.base_url + '/web/remnant-review.html', wait_until='networkidle')
            page.wait_for_selector('#load-state', state='hidden')
            assert page.locator('.frame').count() == 11
            for i in range(11):
                page.locator('.frame').nth(i).click()
                assert page.locator('.frame').nth(i).get_attribute('aria-pressed') == 'true'
            page.locator('#background').select_option('light')
            page.locator('#flip').click()
            page.locator('#background').select_option('dark')
            page.locator('#flip').click()
            page.locator('#size').select_option('270')
            page.locator('#size').select_option('460')
            for skill in ['1', '2', '3']:
                page.locator(f'[data-skill="{skill}"]').click()
                page.locator('#play').click()
                page.wait_for_function("document.getElementById('play').textContent === '한 번 재생'")
                assert page.locator('#pose-name').inner_text() == '대기'
            page.locator('[data-skill="1"]').click()
            page.locator('#play').click()
            page.locator('.frame').nth(3).click()
            page.wait_for_timeout(1300)
            assert page.locator('#pose-name').inner_text() == '막기'
            page.locator('.frame').first.click()
            page.evaluate('scrollTo(0,0)')
            overflow = page.evaluate('document.documentElement.scrollWidth > innerWidth')
            assert not overflow
            page.screenshot(path=str(out / f'inspector-{width}.png'), full_page=True)
            results.append(dict(viewport=[width, height], frameButtons=11, threeSequences=True, cancelPlayback=True, horizontalOverflow=overflow, errors=errors))
            page.close()
        if args.standalone:
            page = browser.new_page(viewport={'width': 1440, 'height': 1080})
            errors = []
            requests = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: requests.append(request.url) if request.url.startswith('http') else None)
            page.goto(args.standalone.resolve().as_uri(), wait_until='load')
            page.wait_for_selector('#load-state', state='hidden')
            assert page.locator('.frame').count() == 11
            page.locator('.frame').nth(10).click()
            assert page.locator('#pose-name').inner_text() == '짓누르기 · 타격'
            assert page.locator('#battle-preview').is_hidden()
            assert not requests
            results.append(dict(standalone=True, frameButtons=11, networkRequests=requests, errors=errors))
            page.close()
        context = browser.new_context(viewport={'width': 1600, 'height': 900})
        context.add_init_script("localStorage.setItem('ed.helpSeen','1')")
        page = context.new_page()
        page.route('**/web/battle.js', lambda route: route.fulfill(path=str((out / 'probe.js').resolve()), content_type='text/javascript'))
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: errors.append(f'{response.status} {response.url}') if response.status >= 400 else None)
        for query, expected in [('', 'kyle'), ('?art=remnantWalker', 'remnantWalker')]:
            page.goto(args.base_url + '/web/battle.html' + query, wait_until='networkidle', timeout=90000)
            page.wait_for_selector('#loading', state='hidden')
            art = page.evaluate("window.__m2.stage.actors.get('e1').doll.catalog.manifest.character")
            assert art == expected
            assert page.evaluate("Array.from(window.__m2.stage.actors.values()).every(a=>a.doll.plates.size===a.doll.catalog.manifest.frames.length)")
            assert page.locator('#art-review-note').get_attribute('hidden') is None if query else page.locator('#art-review-note').get_attribute('hidden') is not None
            results.append(dict(query=query, enemyArt=art, errors=list(errors)))
        page.screenshot(path=str(out / 'battle-idle.png'))
        for slot in [1, 2, 3]:
            for phase in ['ready', 'impact']:
                page.evaluate("([slot,phase]) => {const d=window.__m2.stage.actors.get('e1').doll;d.showFrame(d.catalog.manifest.frames.find(f=>f.id.includes('skill'+slot+'-'+phase)).id)}", [slot, phase])
                page.wait_for_timeout(100)
                page.screenshot(path=str(out / f'battle-s{slot}-{phase}.png'))
        browser.close()
    (out / 'ui-checks.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(results, ensure_ascii=False))
    assert all(not row['errors'] for row in results)


if __name__ == '__main__':
    main()
