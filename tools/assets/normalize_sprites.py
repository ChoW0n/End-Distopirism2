"""전투 스프라이트를 정규화하고 렌더러가 읽을 좌표 매니페스트를 만든다.

SPEC-002 §3~§5 구현. 오프라인 도구라서 게임 빌드에는 들어가지 않는다.
실행: python3 tools/assets/normalize_sprites.py --raw <원본폴더> --out <출력폴더>
필요 패키지: opencv-python, numpy
"""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

#정규화 캔버스와 기준선. 모든 프레임이 이 좌표계를 공유한다
CANVAS = (2400, 1500)
GROUND_Y = 1340
CENTER_X = 1200

#자동 검출이 틀리는 프레임의 날끝 확정 좌표 (정규화 좌표계). SPEC-002 §5.2
BLADE_OVERRIDE = {
    "05-skill1-ready": [810, 16],
    "10-skill3-cast": [1616, 242],
}


def load_rgba(path):
    #알파까지 그대로 읽는다. 알파가 없으면 불투명으로 채운다
    im = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if im is None:
        raise FileNotFoundError(path)
    if im.shape[2] == 3:
        im = np.dstack([im, np.full(im.shape[:2], 255, np.uint8)])
    return im


def head_blob(bgr, alpha):
    #은백발 덩어리를 찾는다. 밝고 채도가 낮은 픽셀이 머리카락이다
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    mask = ((alpha > 200) & (hsv[:, :, 2] > 195) & (hsv[:, :, 1] < 55)).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, _, stats, centers = cv2.connectedComponentsWithStats(mask, 8)
    if n < 2:
        return None, None
    i = 1 + int(np.argmax(stats[1:, 4]))
    box = [int(stats[i, 0]), int(stats[i, 1]), int(stats[i, 2]), int(stats[i, 3])]
    return box, (float(centers[i][0]), float(centers[i][1]))


def make_head_template(bgr, alpha):
    #기준 프레임(idle)의 머리 주변을 잘라 배율 추정용 템플릿으로 쓴다
    box, _ = head_blob(bgr, alpha)
    x, y, w, h = box
    pad = int(max(w, h) * 0.55)
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(bgr.shape[1], x + w + pad), min(bgr.shape[0], y + h + pad)
    gray = cv2.cvtColor(bgr[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
    mask = (alpha[y0:y1, x0:x1] > 128).astype(np.uint8) * 255
    return gray, mask


def estimate_scale(bgr, template, tpl_mask):
    #머리 템플릿을 배율·회전 바꿔가며 맞춰 프레임 배율을 추정한다.
    #자세에 따라 키가 달라지는 bbox 높이 방식은 웅크린 프레임에서 뒤집힌다 (SPEC-002 §3.2)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    best = (-1.0, 1.0)
    for scale in np.arange(0.65, 1.45, 0.05):
        for rot in (-20, -10, 0, 10, 20):
            m = cv2.getRotationMatrix2D((template.shape[1] / 2, template.shape[0] / 2), rot, float(scale))
            w = int(template.shape[1] * scale) + 6
            h = int(template.shape[0] * scale) + 6
            if w >= gray.shape[1] or h >= gray.shape[0]:
                continue
            m[0, 2] += w / 2 - template.shape[1] / 2
            m[1, 2] += h / 2 - template.shape[0] / 2
            t = cv2.warpAffine(template, m, (w, h))
            tm = cv2.warpAffine(tpl_mask, m, (w, h))
            res = cv2.matchTemplate(gray, t, cv2.TM_CCORR_NORMED, mask=(tm > 128).astype(np.uint8) * 255)
            res = np.nan_to_num(res, nan=-1, posinf=-1, neginf=-1)
            _, score, _, _ = cv2.minMaxLoc(res)
            if score > best[0]:
                best = (float(score), float(scale))
    return best


def blade_tip(bgr, alpha):
    #붉은 도끼 머리를 먼저 찾고, 거기 붙은 밝은 회색 날에서 가장 먼 점을 날끝으로 본다
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    solid = alpha > 200
    red = (solid & (((hsv[:, :, 0] < 10) | (hsv[:, :, 0] > 168)) &
                    (hsv[:, :, 1] > 130) & (hsv[:, :, 2] > 100))).astype(np.uint8)
    red = cv2.morphologyEx(red, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    n, _, stats, centers = cv2.connectedComponentsWithStats(red, 8)
    if n < 2:
        return None, None
    i = 1 + int(np.argmax(stats[1:, 4]))
    head = (float(centers[i][0]), float(centers[i][1]))

    blade = (solid & (hsv[:, :, 2] > 118) & (hsv[:, :, 1] < 75)).astype(np.uint8)
    blade = cv2.morphologyEx(blade, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n2, lab2, st2, ce2 = cv2.connectedComponentsWithStats(blade, 8)
    cand = [(j, st2[j, 4]) for j in range(1, n2)
            if st2[j, 4] > 800 and np.hypot(ce2[j][0] - head[0], ce2[j][1] - head[1]) < 420]
    if not cand:
        return head, None
    j = max(cand, key=lambda c: c[1])[0]
    ys, xs = np.where(lab2 == j)
    k = int(np.argmax((xs - head[0]) ** 2 + (ys - head[1]) ** 2))
    return head, (int(xs[k]), int(ys[k]))


def normalize(raw_dir, out_dir):
    #프레임을 하나씩 읽어 배율을 맞추고 접지선·몸통축에 정렬해 저장한다
    files = sorted(Path(raw_dir).glob("*.png"))
    if not files:
        raise SystemExit(f"원본 프레임이 없다: {raw_dir}")
    base = load_rgba(files[0])
    template, tpl_mask = make_head_template(base[:, :, :3], base[:, :, 3])

    out_dir = Path(out_dir)
    (out_dir / "frames").mkdir(parents=True, exist_ok=True)
    frames = []
    for f in files:
        im = load_rgba(f)
        bgr, alpha = im[:, :, :3], im[:, :, 3]
        ys, xs = np.where(alpha > 200)
        feet = int(ys.max())
        _, head_center = head_blob(bgr, alpha)
        if head_center is None:
            head_center = (float(xs.mean()), float(ys.mean()))
        score, est = estimate_scale(bgr, template, tpl_mask)
        s = 1.0 / est

        #발바닥 띠 중앙과 머리 중앙의 중간을 몸통 축으로 본다. 발만 쓰면 돌진 자세가 밀린다
        band = ys > feet - 40
        axis_x = 0.5 * (float(np.median(xs[band])) + head_center[0])
        mat = np.array([[s, 0, CENTER_X - axis_x * s], [0, s, GROUND_Y - feet * s]], np.float32)
        warped = cv2.warpAffine(im, mat, CANVAS, flags=cv2.INTER_LANCZOS4,
                                borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
        cv2.imwrite(str(out_dir / "frames" / f.name), warped)

        fid = f.stem
        axe, tip = blade_tip(warped[:, :, :3], warped[:, :, 3])
        override = BLADE_OVERRIDE.get(fid)
        ys2, xs2 = np.where(warped[:, :, 3] > 200)
        frames.append({
            "id": fid,
            "file": f"frames/{f.name}",
            "scale": round(s, 4),
            "scaleMatch": round(score, 3),
            "anchor": [CENTER_X, GROUND_Y],
            "headCenter": [round(head_center[0] * s + float(mat[0, 2]), 1),
                           round(head_center[1] * s + float(mat[1, 2]), 1)],
            "axeHead": [round(axe[0]), round(axe[1])] if axe else None,
            "bladeTip": override or (list(tip) if tip else None),
            "tipSource": "수동 확정" if override else ("자동 검출" if tip else "미검출"),
            "bbox": [int(xs2.min()), int(ys2.min()), int(xs2.max()), int(ys2.max())],
        })
        print(f'{fid:26s} 배율 ×{s:.2f} (일치 {score:.3f}) 날끝 {frames[-1]["bladeTip"]}')
    return frames


def read_effects(pack_dir):
    #이펙트 팩의 정렬본과 피벗을 그대로 가져온다. 이미지는 건드리지 않는다
    man = json.load(open(Path(pack_dir) / "manifest.json", encoding="utf-8"))
    return [{
        "id": e["id"],
        "name": e["name"],
        "anchor": e["anchor"],
        "size": e["aligned_size"],
        "pivot": e["aligned_pivot_px"],
        "blend": e["blend"],
        "loop": e["loop"],
        "frames": [{"file": fr["aligned_file"], "ms": fr["duration_ms"]} for fr in e["frames"]],
    } for e in man["effects"]]


def read_cutscene(cut_dir):
    #컷신 v3의 확정 좌표를 읽는다. 추정하지 않는다
    import csv
    cut_dir = Path(cut_dir)
    man = json.load(open(cut_dir / "manifest.json", encoding="utf-8"))
    rows = list(csv.DictReader(open(cut_dir / "REGISTRATION.csv", encoding="utf-8-sig")))
    layers = [{
        "id": r["id"],
        "file": r["file"],
        "pos": [int(r["canvas_x"]), int(r["canvas_y"])],
        "pivot": [int(r["pivot_world_x"]), int(r["pivot_world_y"])],
        "z": int(r["z"]),
        "parent": r["parent"],
        "visibleDefault": r["visible_default"] == "True",
        "motionDeg": man["preview_motion_deg"].get(r["id"], 0),
    } for r in sorted(rows, key=lambda r: int(r["z"]))]
    return {"size": [man["canvas"]["width"], man["canvas"]["height"]] if isinstance(man["canvas"], dict)
            else man["canvas"], "layers": layers}


def verify(manifest):
    #산출물 자가검사. 하나라도 깨지면 매니페스트를 쓰지 않는다
    f = manifest["frames"]
    assert len(f) >= 1, "프레임이 비었다"
    scales = [x["scale"] for x in f]
    assert 0.5 < min(scales) and max(scales) < 2.0, f"배율 보정값이 비정상이다: {min(scales)}~{max(scales)}"
    assert all(x["scaleMatch"] > 0.85 for x in f), "머리 템플릿 일치율이 낮은 프레임이 있다"
    for x in f:
        if x["bladeTip"]:
            tx, ty = x["bladeTip"]
            assert 0 <= tx < CANVAS[0] and 0 <= ty < CANVAS[1], f'{x["id"]} 날끝이 캔버스 밖이다'
    attack = [x for x in f if "skill" in x["id"]]
    assert all(x["bladeTip"] for x in attack), "공격 프레임에 날끝이 없다"
    print(f"자가검사 통과 — 프레임 {len(f)}장, 배율 {min(scales):.2f}~{max(scales):.2f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, help="원본 프레임 폴더 (파일명 순서가 프레임 순서)")
    ap.add_argument("--out", required=True, help="정규화 결과와 매니페스트를 쓸 폴더")
    ap.add_argument("--effects", help="이펙트 팩 폴더 (manifest.json 포함)")
    ap.add_argument("--cutscene", help="컷신 v3 폴더 (REGISTRATION.csv 포함)")
    ap.add_argument("--character", default="incinerator")
    args = ap.parse_args()

    manifest = {
        "version": 1,
        "character": args.character,
        "canvas": list(CANVAS),
        "ground": [CENTER_X, GROUND_Y],
        "frames": normalize(args.raw, args.out),
    }
    if args.effects:
        manifest["effects"] = read_effects(args.effects)
    if args.cutscene:
        manifest["cutscene"] = read_cutscene(args.cutscene)

    verify(manifest)
    out = Path(args.out) / "sprite-manifest.json"
    json.dump(manifest, open(out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("매니페스트 저장:", out)


if __name__ == "__main__":
    main()
