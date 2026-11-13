#!/usr/bin/env python3
"""SocialLite 아이콘 / iOS 스플래시 이미지를 생성한다.

사용: python3 tools/make_icons.py
앱 디렉터리 기준 icons/ 아래에 PNG를 만든다. (PIL 필요)
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")

ACCENT = (122, 235, 200)
BG1 = (12, 13, 17)
BG2 = (24, 26, 33)


def rounded(size, radius_ratio=0.225):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(1, size - 1)
        c = tuple(int(BG1[i] + (BG2[i] - BG1[i]) * t) for i in range(3))
        d.line([(0, y), (size, y)], fill=c + (255,))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255
    )
    img.putalpha(mask)
    return img


def glyph(size, pad_ratio=0.30, block=True, scale=1.0):
    """둥근 사각형 위에 '가위로 잘라낸 재생 마크' — 릴스 제거를 상징한다."""
    base = rounded(size)
    s = size * scale
    off = (size - s) / 2
    pad = s * pad_ratio
    L, R = off + pad, off + s - pad
    T, B = off + pad * 1.15, off + s - pad * 1.15

    mark = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    md = ImageDraw.Draw(mark)
    md.polygon(
        [(L + (R - L) * 0.06, T), (R + (R - L) * 0.02, (T + B) / 2), (L + (R - L) * 0.06, B)],
        fill=(255, 255, 255, 255),
    )

    w = max(2, int(size * 0.048))
    gap = int(w * 2.1)
    x1, y1 = off + s * 0.20, off + s * 0.80
    x2, y2 = off + s * 0.80, off + s * 0.20

    if block:
        md.line([(x1, y1), (x2, y2)], fill=(0, 0, 0, 0), width=gap)
    base.alpha_composite(mark)
    if block:
        ImageDraw.Draw(base).line([(x1, y1), (x2, y2)], fill=ACCENT + (255,), width=w)
    return base


def main():
    os.makedirs(OUT, exist_ok=True)
    for size in (192, 512):
        glyph(size).save(os.path.join(OUT, f"icon-{size}.png"))
    glyph(512, pad_ratio=0.34, scale=0.62).save(os.path.join(OUT, "icon-maskable-512.png"))
    glyph(180, pad_ratio=0.29).save(os.path.join(OUT, "apple-touch-icon-180.png"))
    glyph(32, pad_ratio=0.26).save(os.path.join(OUT, "favicon-32.png"))

    for (w, h) in ((1179, 2556), (1170, 2532), (1290, 2796), (750, 1334)):
        bg = Image.new("RGB", (w, h), (10, 11, 15))
        d = ImageDraw.Draw(bg)
        for y in range(h):
            t = y / (h - 1)
            d.line([(0, y), (w, y)], fill=tuple(int(10 + 16 * t) for _ in range(3)))
        ic = glyph(int(w * 0.26), pad_ratio=0.29)
        bg.paste(ic, ((w - ic.width) // 2, int(h * 0.42)), ic)
        bg.save(os.path.join(OUT, f"splash-{w}x{h}.png"))

    print("icons:", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
