"""걸음 잔형 원본을 보존하며 크기와 발 위치만 정렬한다. source-layout.json이 기준이다."""
import argparse
import hashlib
from io import BytesIO
import json
from pathlib import Path
from PIL import Image


def build(root):
    """알파를 다시 만들거나 외형을 고치지 않고 등비 축소·평행이동만 적용한다."""
    layout = json.loads((root / 'source-layout.json').read_text())
    (root / 'norm').mkdir(exist_ok=True)
    frames, checks = [], []
    for source in layout['frames']:
        path = root / source['source']
        if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
            raise ValueError(f"원본이 바뀌었다: {path}")
        image = Image.open(path)
        if image.mode != 'RGBA':
            raise ValueError(f"RGBA 원본이 아니다: {path}")
        scale = source['scale']
        size = tuple(round(v * scale) for v in image.size)
        offset = tuple(round(g - p * scale) for g, p in zip(layout['ground'], source['sourceGround']))
        if min(offset) < 0 or any(o + s > c for o, s, c in zip(offset, size, layout['canvas'])):
            raise ValueError(f"캔버스 밖으로 잘린다: {path}")
        normalized = Image.new('RGBA', layout['canvas'])
        normalized.paste(image.resize(size, Image.Resampling.LANCZOS), offset)
        file = f"norm/{source['id']}.png"
        buffer = BytesIO()
        normalized.save(buffer, format='PNG', optimize=True)
        temporary = (root / file).with_suffix('.tmp')
        temporary.write_bytes(buffer.getvalue())
        temporary.replace(root / file)
        with Image.open(root / file) as saved:
            saved.verify()
        alpha = normalized.getchannel('A')
        box = alpha.point(lambda a: 255 if a >= 8 else 0).getbbox()
        if box is None:
            raise ValueError(f"그림이 비었다: {path}")
        box = [max(0, box[0] - 4), max(0, box[1] - 4), min(normalized.width, box[2] + 4), min(normalized.height, box[3] + 4)]
        tip = source.get('sourceTip')
        if 'skill' in source['id'] and tip is None:
            raise ValueError(f"공격 접점이 없다: {path}")
        contact = [round(o + t * scale) for o, t in zip(offset, tip)] if tip else None
        frame = dict(id=source['id'], file=file, scale=scale, scaleMatch=1,
                     anchor=layout['ground'], headCenter=[round(o + h * scale) for o, h in zip(offset, source['sourceHead'])],
                     axeHead=None, bladeTip=contact, tipSource='손끝·주먹 접점 수동 지정' if tip else '무기 없음', bbox=box,
                     ms=source['ms'], windup=source['windup'], impact=source['impact'])
        frames.append(frame)
        histogram = alpha.histogram()
        checks.append(dict(id=frame['id'], rgba=True, size=list(normalized.size), bbox=box,
                           transparentPixels=histogram[0], visiblePixels=sum(histogram[8:]),
                           sourceSha256=source['sha256'], normalizedSha256=hashlib.sha256((root / file).read_bytes()).hexdigest(),
                           fullSourceInsideCanvas=True))
    manifest = dict(version=2, character=layout['character'], canvas=layout['canvas'], ground=layout['ground'], frames=frames, effects=[])
    (root / 'sprite-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (root / 'asset-checks.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2) + '\n')
    print(f"걸음 잔형 {len(frames)}장 정렬 완료. 원본 해시·알파·캔버스 내부 확인.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('assets/remnantWalker'))
    build(parser.parse_args().root)
