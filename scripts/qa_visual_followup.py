"""S1 색과 S3 측면 형태를 같은 시각·카메라에서 비교할 기준 증거를 만든다."""
import argparse
import hashlib
import json
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright


def pixel_metrics(on_bytes, off_bytes):
    on = np.asarray(Image.open(BytesIO(on_bytes)).convert('RGB')).astype(np.int16)
    off = np.asarray(Image.open(BytesIO(off_bytes)).convert('RGB')).astype(np.int16)
    difference = np.max(np.abs(on - off), axis=2)
    mask = difference > 8
    y, x = np.where(mask)
    if not len(x):
        return {'pixel_count': 0, 'bbox': None}, mask
    covariance = np.cov(np.column_stack([x, y]), rowvar=False)
    eigenvalues = np.maximum(np.linalg.eigvalsh(covariance), 0)
    blue = mask & (on[:, :, 2] > on[:, :, 0] + 15) & (on[:, :, 2] > on[:, :, 1] + 5)
    bright = mask & (on.min(axis=2) > 180)
    return {
        'pixel_count': int(mask.sum()),
        'strong_pixel_count': int((difference > 24).sum()),
        'blue_pixel_count': int(blue.sum()),
        'bright_pixel_count': int(bright.sum()),
        'bbox': [int(x.min()), int(y.min()), int(x.max() + 1), int(y.max() + 1)],
        'width': int(x.max() - x.min() + 1),
        'height': int(y.max() - y.min() + 1),
        'major_span_4sigma': round(float(4 * np.sqrt(eigenvalues[1])), 2),
        'minor_span_4sigma': round(float(4 * np.sqrt(eigenvalues[0])), 2),
        'mask_mean_rgb': np.round(on[mask].mean(axis=0), 2).tolist(),
        'mask_rgb_percentiles_10_50_90': np.round(np.percentile(on[mask], [10, 50, 90], axis=0), 2).tolist(),
        'mean_max_channel_difference': round(float(difference[mask].mean()), 2),
        'bbox_fill_ratio': round(float(mask.sum() / ((x.max() - x.min() + 1) * (y.max() - y.min() + 1))), 4),
        'equivalent_thickness_pixels': round(float(mask.sum() / max(1, 4 * np.sqrt(eigenvalues[1]))), 2),
    }, mask


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:8014')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--source-root', type=Path)
    parser.add_argument('--skills', default='s1,s3', help='확인할 스킬을 쉼표로 연결')
    parser.add_argument('--s1-matrix', action='store_true', help='원본/띠 소스와 5시각·3각도를 비교')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    result = {'viewport': [1280, 720], 'pixel_ratio': 1, 'shot': 'combat', 'comparison': '공간형 효과 켬과 끔의 최대 RGB 채널 차이 > 8. 바탕 혼합색이므로 원본 텍스처 RGB와 직접 등치하지 않는다.', 'cases': [], 'http_errors': [], 'page_errors': []}
    if args.source_root:
        result['source_sha256'] = {name: hashlib.sha256((args.source_root / name).read_bytes()).hexdigest() for name in ['web/vfx-space.js', 'assets/kyle/realtime-vfx.json', 'assets/kyle/space-fx.json']}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1280, 'height': 720}, device_scale_factor=1)
        page.on('pageerror', lambda error: result['page_errors'].append(str(error)))
        page.on('response', lambda response: result['http_errors'].append({'url': response.url, 'status': response.status}) if response.status >= 400 else None)
        page.goto(args.base_url + '/web/vfx-space.html', wait_until='networkidle', timeout=90000)
        page.wait_for_function('window.__vfxSpace !== undefined', timeout=60000)
        result['initial_state'] = page.evaluate('window.__vfxSpace.state()')
        page.evaluate("window.__vfxSpace.view('space'); window.__vfxSpace.shot('combat'); window.__vfxSpace.seek(400)")

        def settle():
            page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))')

        def layers(mode):
            page.evaluate("(mode) => {const a=window.__vfxSpace; a.layer('ly-ribbon', mode!=='off'); for(const id of ['ly-glow','ly-drops','ly-ripples']) a.layer(id,mode==='full');}", mode)
            settle()

        s1_times = [300, 400, 650, 950, 1080] if args.s1_matrix else [400]
        if args.s1_matrix:
            page.wait_for_function('typeof window.__vfxSpace.source === "function"')
            scenarios = [('s1', at, yaw, pitch, 'ribbon', source) for at in s1_times for yaw, pitch in [(0, 0), (-60, 20), (60, 20)] for source in ['original', 'strip']]
            scenarios.extend(('s1', 400, 0, 0, 'full', source) for source in ['original', 'strip'])
        else:
            scenarios = [('s1', 400, 0, 0, 'full', None), ('s1', 400, 0, 0, 'ribbon', None)]
        scenarios.extend(('s3', 700, yaw, pitch, 'full', None) for yaw, pitch in [(0, 0), (-60, 20), (60, 20), (-90, 20), (90, 20)])
        for skill, at_ms, yaw, pitch, mode, source in scenarios:
            if skill not in args.skills.split(','):
                continue
            name = f'{skill}-t{at_ms}-yaw{yaw:+d}-pitch{pitch}-{mode}' + (f'-source-{source}' if source else '')
            page.evaluate('(id) => window.__vfxSpace.skill(id)', skill)
            if source:
                page.evaluate('(source) => window.__vfxSpace.source(source)', source)
                page.wait_for_function('(source) => window.__vfxSpace.state().s1Source === source', arg=source)
            page.evaluate('([at,yaw,pitch]) => {window.__vfxSpace.seek(at); window.__vfxSpace.orbit(yaw,pitch);}', [at_ms, yaw, pitch])
            layers('off')
            off = page.locator('#view').screenshot()
            settle()
            off_again = page.locator('#view').screenshot()
            stability, _ = pixel_metrics(off_again, off)
            layers(mode)
            on = page.locator('#view').screenshot()
            metrics, mask = pixel_metrics(on, off)
            (args.output / (name + '-on.png')).write_bytes(on)
            (args.output / (name + '-off.png')).write_bytes(off)
            Image.fromarray((mask * 255).astype(np.uint8)).save(args.output / (name + '-mask.png'))
            row = {'name': name, 'skill': skill, 'age_ms': at_ms, 'yaw': yaw, 'pitch': pitch, 'layers': mode, 'source': source, 'view': 'space', 'occlusion': True, 'state': page.evaluate('window.__vfxSpace.state()'), 'off_stability_pixels': stability['pixel_count'], 'metrics': metrics}
            result['cases'].append(row)
            (args.output / 'metrics.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps({'name': name, 'effect_pixels': metrics['pixel_count'], 'bbox': metrics['bbox'], 'source_frame': row['state'].get('sourceFrame'), 'off_stability_pixels': stability['pixel_count']}, ensure_ascii=False), flush=True)
        if 's1' in args.skills.split(','):
            page.evaluate("window.__vfxSpace.skill('s1')")
            page.evaluate("window.__vfxSpace.orbit(0,0);window.__vfxSpace.view('flat')")
            layers('full')
            for at in s1_times:
                page.evaluate('(at) => window.__vfxSpace.seek(at)', at)
                settle()
                page.locator('#view').screenshot(path=str(args.output / f's1-t{at}-flat-reference.png'))
        browser.close()
    front = next((row['metrics']['pixel_count'] for row in result['cases'] if row['skill'] == 's3' and row['yaw'] == 0), 1)
    for row in result['cases']:
        if row['skill'] == 's3':
            row['metrics']['area_vs_front'] = round(row['metrics']['pixel_count'] / max(1, front), 4)
    result['valid'] = not result['http_errors'] and not result['page_errors'] and all(row['off_stability_pixels'] == 0 and row['state']['skill'] == row['skill'] and row['state']['age'] == row['age_ms'] and (not row['source'] or row['state'].get('s1Source') == row['source']) for row in result['cases']) and (not args.s1_matrix or result['initial_state'].get('s1Source') == 'original')
    (args.output / 'metrics.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'valid': result['valid'], 'cases': len(result['cases']), 'http_errors': result['http_errors'], 'page_errors': result['page_errors']}, ensure_ascii=False), flush=True)
    if not result['valid']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
