#카일 S1 물금 효과 띠 텍스처를 만든다 (SPEC-005 §15.2)
#
#받은 효과 레이어(호 좌표로 편 흑백 띠)에 원본 S1 장에서 뽑은 소멸 시각과 번짐을 붙여 RGB 한 장으로 묶는다
#  R 밝기 · G 소멸 시각 T(0~1) · B 번짐 (불투명 RGB. 덮임은 셰이더가 R 에서 계산한다)
#띠 자리(u 범위·거리 범위)와 호 곡선은 assets/kyle/realtime-vfx.json 의 path·texture 를 그대로 쓴다
#
#실행: python3 scripts/kyle_vfx_strip.py  (Pillow, NumPy 필요)
#입력: assets/kyle/vfx/s1-layer-source.png, assets/kyle/norm/11-skill1-01~14.png
#출력: assets/kyle/vfx/s1-strip.png  (PNG 는 커밋하지 않는다)

import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
KYLE = os.path.join(ROOT, 'assets', 'kyle')
#원본 장 규격 (sprite-manifest.json): 발 (760,600), 캐릭터 키 = 대기 몸 높이 580px
FOOT_X, FOOT_Y, BODY_PX = 760.0, 600.0, 580.0


#3차 베지어 점들
def bezier(points, t):
    p = np.asarray(points, dtype=float)
    s = 1 - t
    return (s ** 3)[:, None] * p[0] + (3 * s * s * t)[:, None] * p[1] + (3 * s * t * t)[:, None] * p[2] + (t ** 3)[:, None] * p[3]


#호 길이 비율 u 마다 호 위 점과 바깥 법선. 셰이더·TS 와 같은 등간격 기준
def arc_frame(points, us):
    t = np.linspace(0, 1, 16001)
    b = bezier(points, t)
    length = np.r_[0, np.cumsum(np.linalg.norm(np.diff(b, axis=0), axis=1))]
    tt = np.interp(np.clip(us, 0, 1) * length[-1], length, t)
    c = bezier(points, tt)
    eps = 1e-4
    d = bezier(points, np.clip(tt + eps, 0, 1)) - bezier(points, np.clip(tt - eps, 0, 1))
    d /= np.linalg.norm(d, axis=1)[:, None]
    #진행 방향 왼쪽 법선 = 호 바깥
    n = np.c_[-d[:, 1], d[:, 0]]
    return c, n


#이중선형 샘플 (캔버스 밖은 0)
def sample(img, x, y):
    h, w = img.shape[:2]
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx = (x - x0)[..., None]
    fy = (y - y0)[..., None]
    out = np.zeros(x.shape + (img.shape[2],))
    for dy, wy in ((0, 1 - fy), (1, fy)):
        for dx, wx in ((0, 1 - fx), (1, fx)):
            xi = x0 + dx
            yi = y0 + dy
            ok = (xi >= 0) & (xi < w) & (yi >= 0) & (yi < h)
            v = np.zeros(x.shape + (img.shape[2],))
            v[ok] = img[yi[ok], xi[ok]]
            out += v * wx * wy
    return out


#통합 장에서 효과(파랑·흰 파랑)만 남긴 덮임. 몸·칼은 무채색이라 빠진다
def effect_alpha(rgba):
    r, g, b, a = (rgba[..., i] for i in range(4))
    blue = np.clip((b - np.maximum(r, g * 0.85)) / 60.0, 0, 1)
    white = np.clip((np.minimum(np.minimum(r, g), b) - 170) / 60.0, 0, 1) * np.clip((b - r) / 25.0, 0, 1)
    return np.clip(np.maximum(blue, white), 0, 1) * (a / 255.0)


#상자 흐림 (가로·세로 누적합). 여러 번 돌리면 가우스에 가깝다
def box_blur(img, radius):
    if radius < 1:
        return img
    k = 2 * radius + 1
    out = img
    for axis in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[axis] = (radius + 1, radius)
        c = np.cumsum(np.pad(out, pad, mode='edge'), axis=axis)
        hi = np.take(c, np.arange(k, c.shape[axis]), axis=axis)
        lo = np.take(c, np.arange(0, c.shape[axis] - k), axis=axis)
        out = (hi - lo) / k
    return out


def main():
    cfg = json.load(open(os.path.join(KYLE, 'realtime-vfx.json'), encoding='utf-8'))
    tex = cfg['texture']
    layer = np.asarray(Image.open(os.path.join(KYLE, tex['source'])).convert('L'), dtype=float) / 255.0
    H, W = layer.shape
    u0, u1 = tex['uRange']
    d_top, d_bottom = tex['dRangeH']

    #소멸 시각은 반 해상도로 잡고 늘린다
    sh, sw = H // 2, W // 2
    us = u0 + (np.arange(sw) + 0.5) / sw * (u1 - u0)
    ds = d_top + (np.arange(sh) + 0.5) / sh * (d_bottom - d_top)
    c, n = arc_frame(cfg['path']['points'], us)
    px = (c[:, 0][None, :] + n[:, 0][None, :] * ds[:, None]) * BODY_PX + FOOT_X
    py = FOOT_Y - (c[:, 1][None, :] + n[:, 1][None, :] * ds[:, None]) * BODY_PX
    alphas = []
    for k in range(1, 15):
        frame = np.asarray(Image.open(os.path.join(KYLE, 'norm', f'11-skill1-{k:02d}.png')).convert('RGBA'), dtype=float)
        alphas.append(effect_alpha(sample(frame, px, py)))
    base = alphas[0]
    known = base > 0.2
    T = np.ones_like(base)
    for k in range(1, 14):
        gone = (alphas[k] < 0.5 * base) & (T == 1) & known
        T[gone] = (k - 1) / 13.0
    #끝까지 안 사라진 칸은 칼끝 쪽(u > 0.85, 원본 13·14 장 잔여)만 믿는다. 그 밖은 몸·소매 파랑이 섞인 것이라 모르는 칸으로 둔다
    persist = known & (T >= 1) & (us[None, :] <= 0.85)
    known = known & ~persist
    #원본에서 못 잡은 칸은 이웃 평균으로 채운다 (정규화 흐림)
    weight = known.astype(float)
    filled = T * weight
    for radius in (3, 6, 12, 24, 48):
        num = box_blur(box_blur(filled, radius), radius)
        den = box_blur(box_blur(weight, radius), radius)
        est = np.where(den > 1e-4, num / np.maximum(den, 1e-4), np.nan)
        hole = ~known & ~np.isnan(est)
        T = np.where(known, T, np.where(hole, est, T))
        known = known | hole
        weight = known.astype(float)
        filled = T * weight
    T = np.asarray(Image.fromarray((np.clip(T, 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR), dtype=float) / 255.0

    lo, span = tex['coverage']
    coverage = np.clip((layer - lo) / span, 0, 1)
    #원본은 전체가 함께 옅어져서 T 가 낮은 쪽에 몰린다. 덮인 칸 안에서 순위로 0~1 에 고르게 편다 (순서는 그대로)
    covered = coverage > 0.05
    order = np.argsort(T[covered], kind='stable')
    ranks = np.empty(order.size)
    ranks[order] = np.arange(order.size) / max(1, order.size - 1)
    T = T.copy()
    T[covered] = ranks
    glow = box_blur(box_blur(box_blur(layer, 10), 10), 10)
    glow = np.clip(glow / max(glow.max(), 1e-6), 0, 1)
    rgb = np.stack([layer, T, glow], axis=-1)
    out = os.path.join(KYLE, tex['file'])
    Image.fromarray((rgb * 255 + 0.5).astype(np.uint8), 'RGB').save(out)
    print(out, f'{W}x{H}', 'T 평균', round(float(T[coverage > 0.2].mean()), 3))


if __name__ == '__main__':
    main()
