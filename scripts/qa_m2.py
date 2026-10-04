"""M2 시연·자동 관전의 실제 렌더 프레임과 캡처를 검사한다. 제품 JS는 바꾸지 않는다."""
import argparse
import hashlib
import json
import subprocess
import tempfile
import time
from pathlib import Path
from playwright.sync_api import sync_playwright


def summarize(record):
    """컷신은 별도 전경이므로 무대 판 경계 판정에서 제외한다."""
    rows = record['frames']
    visible = [r for r in rows if not r['cut']]
    return {
        'frames': len(rows),
        'actualSeed': record['startedSeeds'][-1],
        'bodyOutsideFrames': sum(any(min(b['box']) < -1e-5 or max(b['box']) > 1.00001 for b in r['bodies']) for r in visible),
        'cardCoveredFrames': sum(any(c['box'][1] < r['top'] - 1e-5 for c in r['cards']) for r in visible),
        'nightAmbientFrames': sum(r['sea'] and r['ambient'] for r in rows),
        'nightFrames': sum(r['sea'] for r in rows),
        'cutsceneFrames': sum(r['cut'] for r in rows),
        'cutsceneFlashFrames': sum(r['cut'] and r.get('cutFlash', False) for r in rows),
        'maxTrauma': max((r.get('trauma', 0) for r in rows), default=0),
        'renderSeconds': round(rows[-1]['t'] - rows[0]['t'], 3) if rows else 0,
        'wallSeconds': record['wallSeconds'],
        'turns': rows[-1]['state']['turn'] if rows else None,
        'result': record['result'],
        'events': {kind: sum(e['method'] == kind for e in record['events']) for kind in ['flash', 'dimBackdrop', 'powerClash', 'ultimateStart', 'ultimateEnd', 'impactFrame']},
        'errors': record['errors'],
        'complete': record['complete'],
        'screenshots': record['screenshots'],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cases', default='showcase,watch:1,watch:2,watch:20001')
    parser.add_argument('--reduced-motion', action='store_true')
    parser.add_argument('--width', type=int, default=1600)
    parser.add_argument('--height', type=int, default=900)
    parser.add_argument('--art-preview', choices=['remnantWalker'])
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    result = {'viewport': [args.width, args.height], 'reducedMotion': args.reduced_motion, 'artPreview': args.art_preview, 'source': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(), 'hashes': {}, 'cases': {}}
    for folder in ['src/renderer3d', 'src/render', 'assets/ui']:
        for file in Path(folder).glob('*'):
            if file.suffix in ['.ts', '.json']:
                result['hashes'][str(file)] = hashlib.sha256(file.read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory(prefix='ed2-m2-') as temporary, sync_playwright() as p:
        bundle = str(Path(temporary) / 'probe.js')
        subprocess.run(['node', 'scripts/qa_m2_probe.mjs', bundle], check=True)
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for case in args.cases.split(','):
            mode, _, seed = case.partition(':')
            context = browser.new_context(viewport={'width': args.width, 'height': args.height}, reduced_motion='reduce' if args.reduced_motion else 'no-preference')
            context.add_init_script("localStorage.setItem('ed.helpSeen','1')")
            page = context.new_page()
            page.route('**/web/battle.js', lambda route: route.fulfill(path=bundle, content_type='text/javascript'))
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda response: errors.append(f'{response.status} {response.url}') if response.status >= 400 else None)
            preview = f'?art={args.art_preview}' if args.art_preview else ''
            page.goto(args.base_url + '/web/battle.html' + preview, wait_until='networkidle', timeout=90000)
            page.wait_for_selector('#loading', state='hidden', timeout=60000)
            #빈 적으로 전투가 끝난 경우는 렌더 검증으로 인정하지 않는다
            roster = page.evaluate("Array.from(window.__m2.stage.actors, ([id,a]) => ({id, art:a.doll.catalog.manifest.character, plate:!!a.doll.pickTarget, frames:a.doll.catalog.manifest.frames.length, loaded:a.doll.plates.size}))")
            if len(roster) != 2 or not all(a['plate'] and a['frames'] > 0 and a['loaded'] == a['frames'] for a in roster):
                raise RuntimeError(f'검수 대진의 인물 판이 빠졌다: {roster}')
            if args.art_preview and not any(a['id'] == 'e1' and a['art'] == args.art_preview for a in roster):
                raise RuntimeError(f'요청한 후보 그림이 실제 적과 다르다: {roster}')
            page.evaluate(Path('scripts/qa_m2_capture.js').read_text())
            page.locator('#menu-open').click()
            if seed:
                page.locator('details.dev').evaluate('(el) => el.open=true')
                page.locator('#seed').fill(seed)
            if seed:
                #시드 입력값은 재시작할 때 읽힌다. 관전 모드 전환만 하면 이전 세션이 계속된다
                page.locator('#restart').click()
                actual_seed = page.evaluate('window.__m2.startedSeeds.at(-1)')
                if actual_seed != int(seed):
                    raise RuntimeError(f'요청 시드 {seed}와 생성 시드 {actual_seed}가 다르다')
            else:
                page.locator('#menu-close').click()
            #보이는 메뉴에서 모드만 선택한 것과 같은 변경 이벤트. 첫 렌더 프레임부터 기록한다
            page.evaluate('(mode) => {window.__m2.record=true;const el=document.getElementById("mode");el.value=mode;el.dispatchEvent(new Event("change"));}', mode)
            start = time.monotonic()
            last_progress = 0
            shots = []
            complete = False
            while time.monotonic() - start < 480:
                page.wait_for_timeout(100)
                status = page.evaluate('({paused:window.__m2.paused, shots:window.__m2.shots, cycles:window.__m2.cycles, state:window.__m2.state()})')
                if status['paused']:
                    shot = status['shots'][-1]
                    filename = case.replace(':', '-') + '-' + shot['name'] + '.png'
                    page.screenshot(path=str(args.output / filename))
                    shots.append({'file': filename, 'frame': shot['row']})
                    page.evaluate('window.__m2.paused=false')
                complete = status['cycles'] >= 2 if mode == 'showcase' else page.locator('#result').is_visible()
                if complete:
                    break
                elapsed = time.monotonic() - start
                if elapsed - last_progress > 25:
                    print(case, round(elapsed, 1), status['state'], flush=True)
                    last_progress = elapsed
            page.screenshot(path=str(args.output / (case.replace(':', '-') + '-end.png')))
            record = page.evaluate('({frames:window.__m2.rows,events:window.__m2.events,startedSeeds:window.__m2.startedSeeds})')
            record.update({'wallSeconds': round(time.monotonic() - start, 3), 'result': page.locator('#result').inner_text() if mode == 'watch' else '시연 1주기', 'complete': complete, 'errors': errors, 'screenshots': shots})
            (args.output / (case.replace(':', '-') + '-raw.json')).write_text(json.dumps(record, ensure_ascii=False))
            summary = summarize(record)
            summary['roster'] = roster
            summary['pass'] = complete and not errors and all(summary[key] == 0 for key in ['bodyOutsideFrames', 'cardCoveredFrames', 'nightAmbientFrames'])
            if args.reduced_motion:
                summary['pass'] &= all(summary['events'][key] == 0 for key in ['flash', 'impactFrame']) and summary['cutsceneFlashFrames'] == 0 and summary['maxTrauma'] == 0
            result['cases'][case] = summary
            (args.output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
            print(json.dumps({case: summary}, ensure_ascii=False), flush=True)
            context.close()
        browser.close()
    if not all(c['pass'] for c in result['cases'].values()):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
