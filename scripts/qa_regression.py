"""전투 화면의 QA 회귀를 실제 Chromium 입력과 네트워크 실패로 재현한다."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', type=Path, default=Path('/tmp/ed2-qa'))
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--suite', default='smoke,modal,vfx,captures,battle,mobile', help='실행할 검증을 쉼표로 연결: smoke,vfx,battle,mobile,captures,modal,orbit')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    results = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])

        def new_page(width=1280, height=720, seen=True, mobile=False):
            context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=mobile, has_touch=mobile)
            if seen:
                context.add_init_script("localStorage.setItem('ed.helpSeen', '1')")
            page = context.new_page()
            page.set_default_timeout(20000)
            capture = {'requests': [], 'http_errors': [], 'page_errors': []}
            page.on('request', lambda request: capture['requests'].append(request.url))
            page.on('response', lambda response: capture['http_errors'].append({'url': response.url, 'status': response.status}) if response.status >= 400 else None)
            page.on('pageerror', lambda error: capture['page_errors'].append(str(error)))
            return context, page, capture

        def screenshot(page, name):
            path = args.output / (name + '.png')
            page.screenshot(path=str(path), full_page=True, timeout=30000)
            return path.name

        def ready(page):
            page.goto(args.base_url + '/web/battle.html', wait_until='networkidle', timeout=90000)
            page.wait_for_selector('#loading', state='hidden', timeout=90000)
            page.wait_for_selector('#command:not(.off)', timeout=30000)

        def report(name, passed, details):
            record = {'case': name, 'pass': bool(passed), **details}
            results.append(record)
            (args.output / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps({key: value for key, value in record.items() if key not in ('requests', 'unrelated_requests')}, ensure_ascii=False), flush=True)

        def select_card(page, slot, touch=False):
            action = 'tap' if touch else 'click'
            if page.locator('#cmd-allies button').count():
                getattr(page.locator('#cmd-allies button').first, action)()
            getattr(page.locator('.tag3d.enemy').first, action)()
            getattr(page.locator('#cmd-cards .card.' + slot).first, action)()
            page.wait_for_selector('#cmd-go[aria-disabled="false"]')

        if 'smoke' in args.suite.split(','):
            context, page, capture = new_page()
            try:
                ready(page)
                unused = [url for url in capture['requests'] if '/helper/' in url or '/incinerator/' in url]
                report('현재 대진의 에셋만 요청', not unused, {'unrelated_requests': unused, 'request_count': len(capture['requests'])})
                select_card(page, 's1')
                page.locator('#help-open').click()
                before = page.locator('#cmd-step').inner_text()
                page.keyboard.press('Enter')
                page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                after = page.locator('#cmd-step').inner_text()
                stable = 'off' not in (page.locator('#command').get_attribute('class') or '')
                report('도움말 Enter 전투 입력 차단', stable, {'before': before, 'after': after, 'help_visible': page.locator('#help').is_visible(), 'screenshot': screenshot(page, 'help-enter'), **capture})
                page.keyboard.press('Escape')
                page.locator('#menu-open').click()
                page.locator('#restart').click()
                page.wait_for_selector('#command:not(.off)', timeout=30000)
                select_card(page, 's1')
                page.locator('#menu-open').click()
                page.locator('#menu-close').focus()
                page.keyboard.press('Enter')
                page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                report('메뉴 Enter 전투 입력 차단', 'off' not in (page.locator('#command').get_attribute('class') or ''), {'step': page.locator('#cmd-step').inner_text(), 'screenshot': screenshot(page, 'menu-enter')})
                if not args.baseline:
                    page.locator('#cmd-allies button').first.click()
                    page.locator('.tag3d.enemy').first.click()
                    page.locator('#cmd-cards .s1').focus()
                    page.keyboard.press('2')
                    order = page.locator('#cmd-allies').inner_text()
                    report('카드 포커스 중 숫자 2로 S2 선택', '이면' in order, {'order': order})
                    page.locator('#cmd-allies button').first.click()
                    page.locator('.tag3d.enemy').first.click()
                    page.locator('#cmd-cards .s3').focus()
                    page.keyboard.press('Enter')
                    order = page.locator('#cmd-allies').inner_text()
                    report('카드 포커스 Enter로 S3 선택', '잔향' in order and 'off' not in (page.locator('#command').get_attribute('class') or ''), {'order': order, 'step': page.locator('#cmd-step').inner_text()})
                    page.locator('#cmd-go').focus()
                    page.keyboard.press('Enter')
                    page.wait_for_selector('#command.off', state='attached')
                    report('교전 시작 버튼 Enter 진행', True, {'step': page.locator('#cmd-step').inner_text()})
            finally:
                context.close()
            context, page, capture = new_page()
            try:
                page.route('**/docs/battle-data.json', lambda route: route.fulfill(status=503, content_type='text/plain', body='QA simulated service failure'))
                page.goto(args.base_url + '/web/battle.html', wait_until='networkidle', timeout=90000)
                failed_text = page.locator('#loading').inner_text()
                retry = page.locator('#loading-retry, #retry, [data-retry]').count()
                report('필수 데이터 503 오류 안내', '실패' in failed_text and bool(retry), {'loading_text': failed_text, 'retry_count': retry, 'screenshot': screenshot(page, 'loading-503'), **capture})
                if retry:
                    page.unroute('**/docs/battle-data.json')
                    page.locator('#loading-retry, #retry, [data-retry]').first.click()
                    page.wait_for_selector('#loading', state='hidden', timeout=90000)
                    page.wait_for_selector('#command:not(.off)', timeout=30000)
                    report('필수 데이터 복구 후 다시 시도', True, {'screenshot': screenshot(page, 'loading-retry')})
            finally:
                context.close()

        if 'modal' in args.suite.split(','):
            context, page, capture = new_page()
            try:
                ready(page)
                page.locator('.tag3d.enemy').first.click()
                before = page.locator('#cmd-step').inner_text()
                page.locator('#help-open').click()
                focus = [page.evaluate('document.activeElement.id')]
                page.keyboard.press('Tab')
                focus.append(page.evaluate('document.activeElement.id'))
                page.keyboard.press('Shift+Tab')
                focus.append(page.evaluate('document.activeElement.id'))
                page.keyboard.press('2')
                after = page.locator('#cmd-step').inner_text()
                auto = page.locator('#auto').bounding_box()
                page.mouse.click(auto['x'] + auto['width'] / 2, auto['y'] + auto['height'] / 2)
                blocked = page.locator('#auto').get_attribute('aria-pressed') == 'false'
                page.keyboard.press('Escape')
                restored = page.evaluate('document.activeElement.id')
                report('도움말 포커스 순환과 배경·숫자 차단', focus == ['help-close'] * 3 and before == after and blocked and restored == 'help-open', {'focus_cycle': focus, 'before': before, 'after': after, 'background_auto_blocked': blocked, 'restored_focus': restored})
                page.locator('#menu-open').click()
                focus = [page.evaluate('document.activeElement.id')]
                page.keyboard.press('Shift+Tab')
                focus.append(page.evaluate('document.activeElement.id'))
                page.keyboard.press('Tab')
                focus.append(page.evaluate('document.activeElement.id'))
                page.keyboard.press('3')
                after = page.locator('#cmd-step').inner_text()
                page.mouse.click(auto['x'] + auto['width'] / 2, auto['y'] + auto['height'] / 2)
                blocked = page.locator('#auto').get_attribute('aria-pressed') == 'false'
                page.keyboard.press('Escape')
                restored = page.evaluate('document.activeElement.id')
                report('메뉴 포커스 순환과 배경·숫자 차단', focus == ['restart', 'menu-close', 'restart'] and before == after and blocked and restored == 'menu-open', {'focus_cycle': focus, 'before': before, 'after': after, 'background_auto_blocked': blocked, 'restored_focus': restored, **capture})
            finally:
                context.close()

        if 'vfx' in args.suite.split(','):
            context, page, capture = new_page()
            try:
                page.goto(args.base_url + '/web/vfx-space.html', wait_until='networkidle', timeout=90000)
                page.wait_for_function('window.__vfxSpace !== undefined', timeout=60000)
                held = []
                page.route('**/kyle/fx3/body/s2-01.png', lambda route: held.append(route))
                page.locator('#skill').select_option('s2')
                page.wait_for_function("performance.getEntriesByType('resource').some(e => e.name.includes('/norm/12-skill2'))", timeout=30000)
                page.locator('#skill').select_option('s1')
                for route in held:
                    route.continue_()
                page.wait_for_load_state('networkidle')
                page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                state = page.evaluate('window.__vfxSpace.state()')
                report('VFX 늦은 S2 요청이 최신 S1을 덮지 않음', state['skill'] == 's1', {'selection': page.locator('#skill').input_value(), 'state': state, 'readout': page.locator('#readout').inner_text(), 'held_requests': len(held), 'screenshot': screenshot(page, 'vfx-race'), **capture})
                page.unroute('**/kyle/fx3/body/s2-01.png')
                for slot in ['s2', 's3', 'ult', 's1']:
                    page.locator('#skill').select_option(slot)
                    page.wait_for_function('(slot) => window.__vfxSpace.state().skill === slot', arg=slot, timeout=90000)
                    page.wait_for_load_state('networkidle')
                    page.evaluate('window.__vfxSpace.seek(500)')
                    report('VFX 선택 ' + slot, page.evaluate('window.__vfxSpace.state().skill') == slot, {'state': page.evaluate('window.__vfxSpace.state()'), 'selection': page.locator('#skill').input_value(), 'screenshot': screenshot(page, 'vfx-' + slot)})
                report('VFX 요청 오류 없음', not capture['http_errors'] and not capture['page_errors'], capture)
            finally:
                context.close()

        if 'captures' in args.suite.split(','):
            context, page, capture = new_page()
            try:
                page.goto(args.base_url + '/web/vfx-space.html', wait_until='networkidle', timeout=90000)
                page.wait_for_function('window.__vfxSpace !== undefined', timeout=60000)
                page.evaluate("window.__vfxSpace.shot('combat'); window.__vfxSpace.orbit(0, 0)")
                for slot, at in [('s1', 400), ('s2', 200), ('s3', 700), ('ult', 350)]:
                    page.locator('#skill').select_option(slot)
                    page.wait_for_function('(slot) => window.__vfxSpace.state().skill === slot', arg=slot, timeout=90000)
                    page.evaluate('(at) => window.__vfxSpace.seek(at)', at)
                    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                    for occlude in ([True, False] if slot in ['s2', 's3'] else [True]):
                        page.locator('#ly-occlude').set_checked(occlude)
                        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                        state = page.evaluate('window.__vfxSpace.state()')
                        report('원문 시각 ' + slot + (' 가림 켬' if occlude else ' 가림 끔'), state['skill'] == slot and state['age'] == at and state.get('enemyOcclusion') == occlude, {'at_ms': at, 'state': state, 'occlusion': occlude, 'readout': page.locator('#readout').inner_text(), 'screenshot': screenshot(page, slot + '-t' + str(at) + ('-occlusion-on' if occlude else '-occlusion-off'))})
                    page.locator('#ly-occlude').check()
                report('원문 시각 캡처 요청 오류 없음', not capture['http_errors'] and not capture['page_errors'], capture)
            finally:
                context.close()

        if 'orbit' in args.suite.split(','):
            context, page, capture = new_page()
            try:
                page.goto(args.base_url + '/web/vfx-space.html', wait_until='networkidle', timeout=90000)
                page.wait_for_function('window.__vfxSpace !== undefined', timeout=60000)
                page.evaluate("window.__vfxSpace.shot('combat'); window.__vfxSpace.orbit(60, 20)")
                for slot, at in [('s2', 200), ('s3', 700)]:
                    page.locator('#skill').select_option(slot)
                    page.wait_for_function('(slot) => window.__vfxSpace.state().skill === slot', arg=slot, timeout=90000)
                    page.evaluate('(at) => window.__vfxSpace.seek(at)', at)
                    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                    state = page.evaluate('window.__vfxSpace.state()')
                    report('공간 궤도 검수 ' + slot, state['skill'] == slot and state['age'] == at and state.get('enemyOcclusion') is True, {'at_ms': at, 'orbit': 60, 'height': 20, 'state': state, 'readout': page.locator('#readout').inner_text(), 'screenshot': screenshot(page, slot + '-t' + str(at) + '-orbit60-height20')})
                report('공간 궤도 검수 요청 오류 없음', not capture['http_errors'] and not capture['page_errors'], capture)
            finally:
                context.close()

        if 'battle' in args.suite.split(','):
            context, page, capture = new_page()
            try:
                ready(page)
                page.locator('#speed').click()
                page.locator('#speed').click()
                turns = []
                for turn in range(1, 31):
                    page.wait_for_function("!document.querySelector('#result').hidden || !document.querySelector('#command').classList.contains('off')", timeout=120000)
                    if page.locator('#result').is_visible():
                        break
                    slots = ['s1', 's2', 's3']
                    selected = 'ult' if page.locator('#cmd-cards .ult').count() else slots[(turn - 1) % 3]
                    select_card(page, selected)
                    turns.append({'turn': page.locator('#turn').inner_text(), 'slot': selected, 'order': page.locator('#cmd-allies').inner_text()})
                    if selected == 'ult':
                        screenshot(page, 'manual-ultimate-ready')
                    page.locator('#cmd-go').click()
                    page.wait_for_selector('#command.off', state='attached')
                outcome = page.locator('#result').inner_text()
                report('직접 조작 시드 1 S1 S2 S3 궁극기 승리', outcome == '승리' and {'s1', 's2', 's3', 'ult'}.issubset({row['slot'] for row in turns}), {'outcome': outcome, 'turns': turns, 'screenshot': screenshot(page, 'manual-result')})
                for seed, expected in [(2, '패배'), (3, '패배')]:
                    page.locator('#menu-open').click()
                    page.locator('details.dev').evaluate('(element) => element.open = true')
                    page.locator('#seed').fill(str(seed))
                    page.locator('#mode').select_option('watch')
                    page.locator('#restart').click()
                    page.wait_for_selector('#result:not([hidden])', timeout=180000)
                    outcome = page.locator('#result').inner_text()
                    report('자동 관전 시드 ' + str(seed), outcome == expected, {'outcome': outcome, 'expected': expected, 'turn': page.locator('#turn').inner_text(), 'screenshot': screenshot(page, 'auto-seed-' + str(seed))})
                report('전투 전체 요청 오류 없음', not capture['http_errors'] and not capture['page_errors'], capture)
            finally:
                context.close()

        if 'mobile' in args.suite.split(','):
            context, page, capture = new_page(844, 390, mobile=True)
            try:
                ready(page)
                select_card(page, 's1', touch=True)
                landscape = page.locator('#cmd-go').is_visible() and not page.locator('.rotate').is_visible()
                screenshot(page, 'mobile-landscape')
                page.locator('#cmd-go').tap()
                page.wait_for_selector('#command.off', state='attached')
                page.set_viewport_size({'width': 390, 'height': 844})
                page.wait_for_selector('.rotate', state='visible')
                report('모바일 가로 입력과 세로 회전 안내', landscape, {'portrait_hint': page.locator('.rotate').inner_text(), 'screenshot': screenshot(page, 'mobile-portrait'), **capture})
            finally:
                context.close()
        browser.close()
    failed = [result['case'] for result in results if not result['pass']]
    print(json.dumps({'passed': len(results) - len(failed), 'failed': failed, 'output': str(args.output)}, ensure_ascii=False), flush=True)
    if failed and not args.baseline:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
