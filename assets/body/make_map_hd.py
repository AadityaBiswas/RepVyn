"""Enlarge the region maps so the figures stay sharp when the app crops in on them.

Reads map-front.png / map-back.png (red = region code, green = coverage, see make_map.py) and writes
map-front-2x.png / map-back-2x.png in the same encoding at twice the size, with re-sharpened edges.

    python assets/body/make_map_hd.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SCALE = 2
DRAW = 6  # drawn at 6x, then reduced, so thin slivers do not stair-step


def up(mask, w, h):
    im = Image.fromarray((mask * 255).astype(np.uint8)).resize((w * DRAW, h * DRAW), Image.BICUBIC).filter(ImageFilter.GaussianBlur(DRAW * 0.55))
    sharp = np.clip((np.asarray(im, float) / 255 - 0.5) * DRAW * 1.5 + 0.5, 0, 1)
    return np.asarray(Image.fromarray((sharp * 255).astype(np.uint8)).resize((w * SCALE, h * SCALE), Image.LANCZOS), float) / 255


def write(view):
    m = np.array(Image.open(os.path.join(HERE, 'map-%s.png' % view)).convert('RGB'))
    code, al = m[:, :, 0], m[:, :, 1] / 255.0
    h, w = code.shape
    best = np.full((h * SCALE, w * SCALE), 0.5)
    out = np.zeros((h * SCALE, w * SCALE, 3), np.uint8)
    for c in range(1, int(code.max()) + 1):
        k = up(((code == c) & (al > 0.4)).astype(float), w, h)
        out[:, :, 0][k > best] = c
        best = np.maximum(best, k)
    out[:, :, 1] = np.round(up(al, w, h) * 255)
    path = os.path.join(HERE, 'map-%s-2x.png' % view)
    Image.fromarray(out, 'RGB').save(path, optimize=True)
    return '%s (%d KB)' % (path, os.path.getsize(path) // 1024)


if __name__ == '__main__':
    print('wrote', ', '.join(write(v) for v in ('front', 'back')))
