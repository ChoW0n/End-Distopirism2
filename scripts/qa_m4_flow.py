"""M4 첫 방문 안내·소리 잠금·예약 입력·재시작을 실제 브라우저에서 확인한다."""
import argparse
import hashlib
import json
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--baseline-ref', help='수정 전 도움말과 비교할 커밋')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {
        'source': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
        'htmlSha256': hashlib.sha256(Path('web/battle.html').read_bytes()).hexdigest(),
        'measure': '자동 입력 기능 검사. 사람의 플레이 시간·실기기 성능 검사가 아니다.',
        'cases': [],
    }

    def save(row):
        report['cases'].append(row)
        (args.output / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(row, ensure_ascii=False), flush=True)

    bounds = """() => {
        const dialog = document.querySelector('#help'), button = document.querySelector('#help-close');
        const d = dialog.getBoundingClientRect(), b = button.getBoundingClientRect();
        return {scrollHeight:dialog.scrollHeight, clientHeight:dialog.clientHeight,
            buttonBottom:b.bottom, viewportHeight:innerHeight,
            fits:dialog.scrollHeight <= dialog.clientHeight + 1 && b.bottom <= d.bottom && b.bottom <= innerHeight,
            koreanFont:getComputedStyle(dialog).fontFamily};
    }"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        report['browser'] = browser.version
        if args.baseline_ref:
            old = subprocess.check_output(['git', 'show', args.baseline_ref + ':web/battle.html'], text=True)
            page = browser.new_page(viewport={'width': 1600, 'height': 900})
            page.route('**/web/battle.html', lambda route: route.fulfill(body=old, content_type='text/html'))
            page.goto(args.base_url + '/web/battle.html', wait_until='networkidle', timeout=90000)
            page.wait_for_selector('#loading', state='hidden')
            row = page.evaluate(bounds)
            page.screenshot(path=str(args.output / 'help-before.png'))
            save({'case': '수정 전 첫 방문 도움말', 'baseline': args.baseline_ref, **row})
            page.close()
        for width, height in [(1600, 900), (844, 390)]:
            context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=width == 844, is_mobile=width == 844)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda response: errors.append(f'{response.status} {response.url}') if response.status >= 400 else None)
            start = time.monotonic()
            page.goto(args.base_url + '/web/battle.html', wait_until='networkidle', timeout=90000)
            page.wait_for_selector('#loading', state='hidden', timeout=90000)
            seconds = round(time.monotonic() - start, 3)
            assert page.locator('#help').is_visible()
            row = page.evaluate(bounds)
            page.screenshot(path=str(args.output / f'help-after-{width}.png'))
            assert row['fits'], row
            assert page.locator('#sound-hint').is_visible()
            action = 'tap' if width == 844 else 'click'
            getattr(page.locator('#help-close'), action)()
            page.wait_for_selector('#sound-hint', state='hidden')
            page.wait_for_selector('#command:not(.off)')
            assert page.evaluate("localStorage.getItem('ed.helpSeen')") == '1'
            getattr(page.locator('.tag3d.enemy').first, action)()
            for slot in ['s1', 's2', 's3']:
                getattr(page.locator('#cmd-cards .' + slot), action)()
            order = page.locator('#cmd-allies').inner_text()
            assert all(name in order for name in ['물금', '이면', '잔향'])
            assert page.locator('#cmd-go').get_attribute('aria-disabled') == 'false'
            page.screenshot(path=str(args.output / f'plan-{width}.png'))
            getattr(page.locator('#cmd-go'), action)()
            page.wait_for_selector('#command.off', state='attached')
            getattr(page.locator('#menu-open'), action)()
            getattr(page.locator('#restart'), action)()
            page.wait_for_selector('#command:not(.off)', timeout=30000)
            assert page.locator('#turn').inner_text() == '1'
            assert page.locator('#result').is_hidden()
            assert not any(name in page.locator('#cmd-allies').inner_text() for name in ['물금', '이면', '잔향'])
            page.reload(wait_until='networkidle', timeout=90000)
            page.wait_for_selector('#loading', state='hidden')
            assert page.locator('#help').is_hidden()
            getattr(page.locator('#help-open'), action)()
            assert page.locator('#help').is_visible()
            getattr(page.locator('#help-close'), action)()
            if width == 844:
                page.set_viewport_size({'width': 390, 'height': 844})
                page.wait_for_selector('.rotate', state='visible')
                page.screenshot(path=str(args.output / 'portrait.png'))
            assert not errors, errors
            save({'case': f'첫 방문·예약·재시작 {width}×{height}', 'pass': True, **row,
                  'loadWallSeconds': seconds, 'soundUnlock': True, 'plan': order,
                  'restartDuringBattle': True, 'helpSeenPersists': True,
                  'errors': errors})
            context.close()
        browser.close()


if __name__ == '__main__':
    main()
