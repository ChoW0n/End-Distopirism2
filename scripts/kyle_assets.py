#카일 완성 스프라이트를 공통 캔버스로 맞추고 sprite-manifest.json 을 만든다 (SPEC-002 §4 · §9.7)
#
#원본은 드라이브에서 받아 assets/kyle/ 아래에 둔다 (리포에는 PNG 가 없다). 폴더는 받은 묶음 그대로다
#  frames/  대기·돌진·복귀·피격 장 (1280x720, 발 657,659)
#  s1/      물금 통합 PNG 15장 + 준비·회수 장 (1280x720, 발 657,659)
#  s2/      찌르기 통합 PNG 15장 + 막기·대기·회수 장 (1600x720, 발 657,659)
#  s3/      칼집 쳐내기·올려베기·내려베기 39장 + animation.json (1400x900, 발 900,780, 원본보다 1.074배 크다)
#  ult/     발도술 준비 v2 · 납도 직전 · 납도 마무리 v2 후면 · 밤물 · 컷신 · 적 피격 베기선·물보라
#
#캔버스마다 크기와 발 자리가 달라서 한 캔버스(1700x720, 발 760,600)에 옮겨 담는다.
#배율이 다른 장은 머리 폭으로 맞춘다. 대기 장 머리 폭 145px 이 기준이다
#실행: python3 scripts/kyle_assets.py  (Pillow, NumPy 필요)

import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'kyle')
OUT_DIR = 'norm'
CANVAS = (1700, 720)
GROUND = (760, 600)


#원본 한 장을 공통 캔버스로 옮긴다. 원본 발 자리가 GROUND 에 오고, 배율만큼 줄인다
def place(src, foot, scale):
    im = Image.open(os.path.join(ROOT, src)).convert('RGBA')
    if scale != 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    canvas = Image.new('RGBA', CANVAS, (0, 0, 0, 0))
    ox = round(GROUND[0] - foot[0] * scale)
    oy = round(GROUND[1] - foot[1] * scale)
    canvas.alpha_composite(im, (max(0, ox), max(0, oy)), (max(0, -ox), max(0, -oy)))
    #원본 그림이 캔버스 밖으로 잘리면 멈춘다
    src_box = Image.open(os.path.join(ROOT, src)).getbbox()
    if src_box:
        x0, y0, x1, y1 = (v * scale for v in src_box)
        if ox + x0 < -1 or oy + y0 < -1 or ox + x1 > CANVAS[0] + 1 or oy + y1 > CANVAS[1] + 1:
            sys.exit(f'{src} 가 공통 캔버스 밖으로 나간다')
    return canvas


#머리 중심. 위에서부터 90줄 안에서 가장 넓은 연속 구간의 가운데
def head_center(alpha):
    top = int(np.where(alpha.any(1))[0][0])
    best = (0, top, 0)
    for y in range(top, min(top + 90, alpha.shape[0])):
        xs = np.where(alpha[y])[0]
        if len(xs) == 0:
            continue
        splits = np.where(np.diff(xs) > 1)[0]
        starts = np.concatenate(([xs[0]], xs[splits + 1]))
        ends = np.concatenate((xs[splits], [xs[-1]]))
        widths = ends - starts
        i = int(widths.argmax())
        if widths[i] > best[0]:
            best = (int(widths[i]), y, float((starts[i] + ends[i]) / 2))
    return [round(best[2], 1), float(best[1] + 20)]


#날끝. 발에서 가장 먼 불투명 점 (예전 매니페스트와 같은 자동 검출)
def blade_tip(alpha):
    ys, xs = np.where(alpha)
    d = (xs - GROUND[0]) ** 2 + (ys - GROUND[1]) ** 2
    i = int(d.argmax())
    return [int(xs[i]), int(ys[i])]


#장 한 개를 만들어 저장하고 매니페스트 항목을 돌려준다
def frame(frame_id, src, foot, scale=1.0, ms=None, impact=False):
    im = place(src, foot, scale)
    name = f'{OUT_DIR}/{frame_id}.png'
    im.save(os.path.join(ROOT, name))
    alpha = np.array(im)[:, :, 3] > 128
    box = im.getbbox()
    entry = {
        'id': frame_id,
        'file': name,
        'scale': round(scale, 4),
        'scaleMatch': 1.0,
        'anchor': list(GROUND),
        'headCenter': head_center(alpha),
        'axeHead': None,
        'bladeTip': blade_tip(alpha),
        'tipSource': '자동 검출(발에서 가장 먼 점)',
        'bbox': list(box),
    }
    if ms is not None:
        entry['ms'] = ms
    if impact:
        entry['impact'] = True
    return entry


def main():
    os.makedirs(os.path.join(ROOT, OUT_DIR), exist_ok=True)
    base = (657, 659)
    frames = [
        frame('00-idle', 'frames/01-idle.png', base),
        frame('01-advance', 'frames/03-user.png', base),
        frame('02-retreat', 'frames/06-recover.png', base),
        frame('03-guard', 's2/pose-00-guard.png', base),
        frame('04-hit', 'frames/05-hit-canvas.png', base),
    ]

    #전용기 1 물금: 준비 장 + 통합 15장. 01~14 각 60ms, 15 는 160ms
    frames.append(frame('11-skill1-ready', 'frames/02-preload.png', base))
    for i in range(1, 16):
        frames.append(frame(f'11-skill1-{i:02d}', f's1/{i:02d}.png', base, ms=160 if i == 15 else 60, impact=i == 1))

    #전용기 2 찌르기: 막기 장에서 찌른다. 01~14 각 70ms, 15 는 120ms
    #막기 장과 같은 그림이라 파일도 같은 것을 가리킨다 (텍스처를 한 번만 만든다)
    #받아내기가 1타다 (SPEC-005 §12.3). 준비 장이 곧 타 장
    ready = frame('12-skill2-ready', 's2/pose-00-guard.png', base, ms=180, impact=True)
    os.remove(os.path.join(ROOT, ready['file']))
    ready['file'] = f'{OUT_DIR}/03-guard.png'
    frames.append(ready)
    for i in range(1, 16):
        frames.append(frame(f'12-skill2-{i:02d}', f's2/{i:02d}.png', base, ms=120 if i == 15 else 70, impact=i == 1))

    #전용기 3: 낮게 진입(준비) → 칼집 쳐내기 · 올려베기 · 내려베기 3타 (SPEC-005 §12) → 마무리. 대기 01·복귀 39 는 무대가 대기 장으로 한다
    anim = json.load(open(os.path.join(ROOT, 's3', 'animation.json'), encoding='utf-8'))
    s3_scale = 1 / 1.074
    s3_foot = (900 - 33 * 1.074, 780)
    for f in anim['frames']:
        index = f['index']
        if index in (1, 39):
            continue
        stem = os.path.basename(f['file'])[:-4]
        frame_id = '13-skill3-ready' if index == 2 else f'13-skill3-{stem}'
        frames.append(frame(frame_id, f's3/{stem}.png', s3_foot, s3_scale, ms=f['duration_ms'], impact=stem.endswith('-impact')))

    #궁극기: 준비 v2(1672x941, 머리 폭 364 → 0.40), 납도 직전(1280x720, 1.0), 납도 마무리 v2 후면(1309x1202, 머리 폭 291 → 0.498)
    frames.append(frame('14-ult-ready', 'ult/ready.png', (822, 916), 145 / 364))
    frames.append(frame('14-ult-post-open', 'ult/post-open.png', (628, 639)))
    frames.append(frame('14-ult-post-closed', 'ult/post-closed.png', (818, 1152), 145 / 291))

    #적에게 붙는 궁극기 이펙트. 캐릭터 키(대기 장 576px) 대비 긴 변 비율이 scale 이다 (SPEC-002 §5.5)
    height = 576
    effects = [
        {
            'id': 'ult-slash', 'name': '발도술 베기선', 'anchor': 'hitPoint', 'size': [768, 512], 'pivot': [400, 280],
            'scale': round(768 / height, 3), 'blend': 'normal', 'loop': False,
            'frames': [{'file': f'ult/slash/{i:02d}.png', 'ms': 60} for i in range(1, 16)],
        },
        {
            'id': 'ult-water', 'name': '발도술 물보라', 'anchor': 'emissionPoint', 'size': [768, 512], 'pivot': [384, 490],
            'scale': round(768 / height, 3), 'blend': 'normal', 'loop': False,
            'frames': [{'file': f'ult/water/{i:02d}.png', 'ms': 60} for i in range(1, 16)],
        },
        {
            'id': 'ult-night-pool', 'name': '발밑 밤물', 'anchor': 'emissionPoint', 'size': [470, 120], 'pivot': [235, 60],
            'scale': round(470 / height, 3), 'blend': 'normal', 'loop': True,
            'frames': [{'file': 'ult/night-pool.png', 'ms': 1000}],
        },
    ]

    manifest = {
        '_comment': '카일 완성 스프라이트 (드라이브 2026-09-29). scripts/kyle_assets.py 가 만든다. 모든 장은 1700x720 공통 캔버스, 발 (760,600). 원화는 오른쪽을 본다. ms 는 전용기 장 넘김 시간, impact 는 궤적 중에 한 번 더 부딪히는 장 (SPEC-005 §9.4)',
        'version': 2,
        'character': 'kyle',
        'canvas': list(CANVAS),
        'ground': list(GROUND),
        'frames': frames,
        'effects': effects,
    }
    with open(os.path.join(ROOT, 'sprite-manifest.json'), 'w', encoding='utf-8') as out:
        json.dump(manifest, out, ensure_ascii=False, indent=2)
        out.write('\n')
    print(f'{len(frames)} 장, 이펙트 {len(effects)} 종')


if __name__ == '__main__':
    main()
