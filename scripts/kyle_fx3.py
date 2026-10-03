#카일 전 스킬 효과 분리 v3 묶음을 반입하고, 통합 장에서 효과를 빼 몸만 남긴 장을 만든다 (SPEC-005 §15.4)
#
#받은 묶음: 드라이브 2026-10-03_카일_전스킬_효과분리_v3 (manifest.json · files.json)
#  S2/        찌르기 효과 15장 + 받아내기 효과(빈 장)   1700x720, 발 760,600
#  S3-game/   쳐내기·올려베기·내려베기 효과 39장       1700x720, 발 760,600 (게임 캔버스로 맞춘 판)
#  Ultimate-play-01~04/  결행 베기 4획, 획마다 15장  768x512, 중심 400,280 (적 맞는 자리 기준)
#  물보라·밤물·컷신 선은 이미 assets/kyle/ult/ 에 있다 (같은 그림)
#
#효과 장은 통합 장(norm/12-skill2-*, 13-skill3-*)과 같은 캔버스·같은 자리라서, 통합 = 효과 위에 몸이 아니라
#몸 위에 효과를 얹은 것으로 보고 거꾸로 풀어 몸만 남긴다. 효과가 거의 불투명한 칸은 몸을 알 수 없어 비운다
#PNG 는 커밋하지 않는다. 이 도구와 JSON 만 커밋한다
#실행: python3 scripts/kyle_fx3.py <받은 묶음 폴더>  (Pillow, NumPy 필요)

import hashlib
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'kyle')
OUT = os.path.join(ROOT, 'fx3')
#효과 알파가 이 값 이상이면 그 밑 몸은 알 수 없다고 본다
OPAQUE = 0.96


#받은 파일을 해시로 확인한다. 빈 장으로 표시된 파일은 없어도 투명 장을 만든다
def load_index(src):
    files = json.load(open(os.path.join(src, 'files.json')))
    return {f['file']: f for f in files}


def copy_frame(src, index, rel, dst):
    info = index.get(rel)
    path = os.path.join(src, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(path):
        data = open(path, 'rb').read()
        if info and hashlib.sha256(data).hexdigest() != info['sha256']:
            sys.exit(f'{rel} 해시가 files.json 과 다르다')
        open(dst, 'wb').write(data)
        return
    if info and info.get('empty'):
        Image.new('RGBA', tuple(info['canvas']), (0, 0, 0, 0)).save(dst)
        return
    sys.exit(f'{rel} 가 없다')


#통합 장에서 효과를 빼 몸만 남긴다. 통합 = 효과 over 몸 이므로 몸 = (통합 - 효과) / (1 - 효과 알파)
def body_only(integrated, effect):
    I = np.asarray(Image.open(integrated).convert('RGBA')).astype(np.float64) / 255
    F = np.asarray(Image.open(effect).convert('RGBA')).astype(np.float64) / 255
    ia, fa = I[..., 3:4], F[..., 3:4]
    keep = np.clip(1 - fa, 1e-6, 1)
    ba = np.clip((ia - fa) / keep, 0, 1)
    bp = np.clip((I[..., :3] * ia - F[..., :3] * fa) / keep, 0, 1)
    rgb = np.where(ba > 1e-3, bp / np.maximum(ba, 1e-3), 0)
    ba = np.where(fa >= OPAQUE, 0, ba)
    out = np.concatenate([np.clip(rgb, 0, 1), ba], axis=-1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def main():
    if len(sys.argv) < 2:
        sys.exit('사용: python3 scripts/kyle_fx3.py <받은 묶음 폴더>')
    src = sys.argv[1]
    manifest = json.load(open(os.path.join(src, 'manifest.json')))
    index = load_index(src)
    if os.path.exists(OUT):
        shutil.rmtree(OUT)

    os.makedirs(os.path.join(OUT, 'body'), exist_ok=True)

    #찌르기
    for i, rel in enumerate(manifest['s2']['files'], 1):
        dst = os.path.join(OUT, 's2', f'{i:02d}.png')
        copy_frame(src, index, rel, dst)
        body_only(os.path.join(ROOT, 'norm', f'12-skill2-{i:02d}.png'), dst).save(os.path.join(OUT, 'body', f's2-{i:02d}.png'))

    #쳐내기·올려베기·내려베기. 통합 장이 없는 01·02·39 는 준비 장과 대기 장을 몸으로 쓴다
    for fr in manifest['s3']['frames']:
        i = fr['index']
        name = os.path.basename(fr['file']).replace('s3-fx-', '')
        dst = os.path.join(OUT, 's3', name)
        copy_frame(src, index, fr['file'], dst)
        integrated = os.path.join(ROOT, 'norm', f'13-skill3-{name}')
        if not os.path.exists(integrated):
            integrated = os.path.join(ROOT, 'norm', '13-skill3-ready.png' if i < 3 else '00-idle.png')
        body_only(integrated, dst).save(os.path.join(OUT, 'body', f's3-{i:02d}.png'))

    #결행 4획 (순차 재생판)
    for k, folder in enumerate(manifest['ultimate']['play_folders'], 1):
        for i in range(1, 16):
            rel = f'{folder}/ult-play-{k:02d}-fx-{i:02d}.png'
            copy_frame(src, index, rel, os.path.join(OUT, 'ult', f'p{k}', f'{i:02d}.png'))

    print('반입 끝:', OUT)


if __name__ == '__main__':
    main()
