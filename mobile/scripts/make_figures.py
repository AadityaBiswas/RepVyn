"""The body figures for the phone app, cut from the same region maps the web app paints from (app/src/figure.ts).

React Native has no canvas, so each muscle becomes its own white mask (alpha = coverage), tinted at runtime with Image tintColor.
Writes mobile/assets/figure/*.png and mobile/src/figures.gen.ts (the static requires Metro needs, plus every box).
Run from the repo root:  python mobile/scripts/make_figures.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "mobile" / "assets" / "figure"
GEN = ROOT / "mobile" / "src" / "figures.gen.ts"
MUSCLES = ["chest", "front_delt", "side_rear_delt", "triceps", "upper_back", "biceps", "quads", "glutes", "hamstrings", "calves",
           "abs", "lower_back", "forearms", "traps", "obliques", "adductors", "hip_flexors"]
FRONT = {"chest", "front_delt", "biceps", "quads", "abs", "forearms", "obliques", "adductors", "hip_flexors"}
S = 2  # the maps are drawn at twice the 468 x 860 artwork
GAP, WIDTH = 21, 7.5  # contour rings, as in figure.ts


def legs_keep(code, cover, view):
    """Torso and legs only, as legs() in figure.ts: no arms or hands, and above the hips only whole muscles."""
    h, w = code.shape
    keep = np.zeros((h, w), bool)
    solid = cover > 76
    for y in range(h):
        row = solid[y]
        x = 0
        while x < w:
            if row[x]:
                start = x
                while x < w and row[x]:
                    x += 1
                mid = (start + x) / 2
                if 0.3 * w < mid < 0.7 * w:
                    keep[y, max(0, start - S):min(w, x + S)] = True
            x += 1
    hip = (400 if view == "front" else 440) * S
    whole = [MUSCLES.index(m) + 1 for m in (["abs", "quads"] if view == "front" else ["glutes"])]
    upper = np.isin(code[:hip], whole)
    keep[:hip] &= upper
    rows = np.where((keep[:hip] & (cover[:hip] > 100)).any(axis=1))[0]
    top = int(rows[0]) if len(rows) else hip
    return keep, [round(0.27 * w), max(0, top - 2 * S), round(0.73 * w), h]


def depth(code):
    """How far each pixel is inside its muscle, by peeling one pixel at a time (alternating 4- and 8-neighbour steps ~ round)."""
    inside = code > 0
    d = np.zeros(code.shape, np.float32)
    cur = inside.copy()
    step = 0
    while cur.any() and step < 400:
        step += 1
        p = np.pad(code * cur, 1)
        same = lambda dy, dx: p[1 + dy:p.shape[0] - 1 + dy, 1 + dx:p.shape[1] - 1 + dx] == code
        nb = same(-1, 0) & same(1, 0) & same(0, -1) & same(0, 1)
        if step % 2 == 0:
            nb &= same(-1, -1) & same(-1, 1) & same(1, -1) & same(1, 1)
        nxt = cur & nb
        d[cur & ~nxt] = step - 0.5
        cur = nxt
    return d


def ring(dd):
    t = np.abs(((dd + GAP / 2) % GAP) - GAP / 2)
    a = np.clip(WIDTH / 2 + 0.75 - t, 0, 1)
    a[dd < GAP * 0.7] = 0
    return a


def save(name, alpha, files):
    ys, xs = np.nonzero(alpha)
    if not len(ys):
        return None
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    a = alpha[y0:y1, x0:x1]
    img = np.zeros((*a.shape, 2), np.uint8)
    img[..., 0] = 255
    img[..., 1] = a
    Image.fromarray(img, "LA").save(OUT / f"{name}.png", optimize=True)
    files.append(name)
    return [x0, y0, x1, y1]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*.png"):  # masks and maps alike
        f.unlink()
    files: list[str] = []
    data = {}
    for view in ("front", "back"):
        m = np.array(Image.open(ROOT / "assets" / "body" / f"map-{view}-2x.png").convert("RGB"))
        code, cover = m[..., 0].astype(np.int32), m[..., 1].astype(np.int32)
        h, w = code.shape
        keep, legs_box = legs_keep(code, cover, view)
        solid = np.where(cover > 140, code, 0)
        rings = ring(depth(solid))
        v = {"w": w, "h": h, "legsBox": legs_box, "all": {}, "legs": {}, "rings": {}, "thumbs": {}}
        for k in range(0, len(MUSCLES) + 1):
            name = "base" if k == 0 else MUSCLES[k - 1]
            mask = (code == k) & (cover > 0)
            if not mask.any():
                continue
            alpha = np.where(mask, cover, 0).astype(np.uint8)
            box = save(f"{view}-all-{name}", alpha, files)
            if box:
                v["all"][name] = box
            box = save(f"{view}-legs-{name}", np.where(keep, alpha, 0).astype(np.uint8), files)
            if box:
                v["legs"][name] = box
            if k:
                r = np.where(solid == k, (rings * 255).round(), 0).astype(np.uint8)
                box = save(f"{view}-ring-{name}", r, files)
                if box:
                    v["rings"][name] = box
                # The close-up for a muscle: a square around it, as thumb() in figure.ts.
                if (name in FRONT) == (view == "front"):
                    ys, xs = np.nonzero((code == k) & (cover >= 128))
                    if len(ys):
                        half = round(max(xs.max() - xs.min(), ys.max() - ys.min()) * 0.59)
                        cx, cy = round((xs.min() + xs.max()) / 2), round((ys.min() + ys.max()) / 2)
                        v["thumbs"][name] = [cx - half, cy - half, cx + half, cy + half]
        data[view] = v
        # One map for the phone's Skia shader (figure.native.tsx): R = code + 32 if the legs-only view keeps the pixel,
        # G = coverage, B = contour-ring strength. Opaque RGB, so decoding never premultiplies the data.
        rgb = np.zeros((h, w, 3), np.uint8)
        rgb[..., 0] = np.where(cover > 0, code, 0) + 32 * keep
        rgb[..., 1] = cover
        rgb[..., 2] = (np.where(solid > 0, rings, 0) * 255).round().astype(np.uint8)
        Image.fromarray(rgb, "RGB").save(OUT / f"map-{view}.png", optimize=True)
    lines = ["// Made by mobile/scripts/make_figures.py from assets/body/map-*-2x.png. Do not edit.", "/* eslint-disable */",
             f"export const FIG = {json.dumps(data)} as const;", "export const IMG: Record<string, number> = {"]
    lines += [f'  "{n}": require("../assets/figure/{n}.png"),' for n in files]
    lines.append("};")
    lines.append('export const MAPS = { front: require("../assets/figure/map-front.png"), back: require("../assets/figure/map-back.png") } as const;')
    GEN.write_text("\n".join(lines) + "\n", encoding="utf8")
    print(len(files), "masks;", sum((OUT / f"{n}.png").stat().st_size for n in files) // 1024, "KB")


if __name__ == "__main__":
    main()
