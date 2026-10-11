"""Tint the body figures for the app-designer mockups from the region maps (same maps the app colours at runtime).

    python design/app-designer/fig.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
BODY = os.path.join(HERE, '..', '..', 'assets', 'body')
OUT = os.path.join(HERE, 'img')
REGIONS = ['chest', 'front_delt', 'side_rear_delt', 'triceps', 'upper_back', 'biceps',
           'quads', 'glutes', 'hamstrings', 'calves', 'abs', 'lower_back']
MAPS = {v: np.array(Image.open(os.path.join(BODY, 'map-%s.png' % v)).convert('RGB')) for v in ('front', 'back')}

LIGHT = dict(ready='#AEAEB2', base='#E1E1E6')
DARK = dict(ready='#48484A', base='#2C2C2E')
ON_RED = dict(ready='#9B1B2E', base='#B72038')
DARK_THUMB = dict(ready='#636366', base='#48484A')  # on the dark theme's #2C2C2E tile        # on the light theme's hero card (#C4223A)
ON_RED_DARK = dict(ready='#8C1A2C', base='#AC2036')   # on the dark theme's hero card (#B8233A)
RED = '#D91E36'
# Work ramps: light gets darker with work, dark gets brighter (further from the ground either way).
RAMP_LIGHT = [(0, '#F7CDD2'), (0.5, '#E8596B'), (0.75, '#D91E36'), (1, '#7A0E1E')]
RAMP_DARK = [(0, '#5A1A26'), (0.5, '#B02236'), (0.75, '#E22A40'), (1, '#FF9AA5')]


def rgb(h):
    return [int(h[i:i + 2], 16) for i in (1, 3, 5)]


def ramp(v, stops):
    v = max(0.0, min(1.0, v))
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if v <= b:
            k = (v - a) / (b - a)
            return '#%02X%02X%02X' % tuple(round(x + (y - x) * k) for x, y in zip(rgb(ca), rgb(cb)))
    return stops[-1][1]


def render(view, pal, colours):
    """colours: region -> hex. Anything absent is `ready`."""
    m = MAPS[view]
    lut = np.array([rgb(pal['base'])] + [rgb(colours.get(r, pal['ready'])) for r in REGIONS] + [rgb(pal['base'])] * 243, np.uint8)
    out = np.dstack([lut[m[:, :, 0]], m[:, :, 1]])
    return Image.fromarray(out, 'RGBA')


def trunk(view, from_row):
    """1 where the figure is kept: below `from_row` only the torso and legs, no arms or hands."""
    al = MAPS[view][:, :, 1] > 76
    h, w = al.shape
    keep = np.ones((h, w))
    for y in range(from_row, h):
        row = al[y]
        edges = np.flatnonzero(np.diff(np.concatenate([[0], row, [0]]).astype(np.int8)))
        for x0, x1 in zip(edges[::2], edges[1::2]):
            if not 0.3 * w < (x0 + x1) / 2 < 0.7 * w:
                keep[y, max(0, x0 - 2):x1 + 2] = 0
    return keep


def render_hd(view, pal, colours, scale=6, keep=None, top=0, only_above=None):
    """The same figure, enlarged with re-sharpened edges, for crops shown bigger than the map."""
    m = MAPS[view]
    code, al = m[:, :, 0], m[:, :, 1] / 255.0
    if keep is not None:
        al = al * keep
    h, w = code.shape
    if only_above:  # (row, regions): above that row keep whole muscles only, so nothing is sliced flat
        row, regions = only_above
        al = al.copy()
        al[:row] *= np.isin(code[:row], [REGIONS.index(r) + 1 for r in regions])
        top = int(np.flatnonzero(al.max(axis=1) > 0.4)[0]) - 2

    def up(mask):
        im = Image.fromarray((mask * 255).astype(np.uint8)).resize((w * scale, h * scale), Image.BICUBIC).filter(ImageFilter.GaussianBlur(scale * 0.55))
        return np.clip((np.asarray(im, float) / 255 - 0.5) * scale * 1.5 + 0.5, 0, 1)

    out = np.empty((h * scale, w * scale, 3))
    out[:] = rgb(pal['base'])
    for i, r in enumerate(REGIONS):
        k = up(((code == i + 1) & (al > 0.4)).astype(float))[:, :, None]
        out = out * (1 - k) + np.array(rgb(colours.get(r, pal['ready']))) * k
    img = Image.fromarray(np.dstack([out, up(al) * 255]).round().astype(np.uint8), 'RGBA')
    # A cropped plate keeps only the trunk's columns, so it can sit flush in a layout. Drawn at 6x, saved at 3x.
    img = img.crop((round(0.27 * w) * scale, top * scale, round(0.73 * w) * scale, h * scale)) if top else img
    return img.resize((img.width // 2, img.height // 2), Image.LANCZOS)


def save(img, name):
    img.save(os.path.join(OUT, name + '.png'), optimize=True)


def thumb(view, region, pal, name, colour=RED, size=224):
    m = MAPS[view]
    ys, xs = np.where((m[:, :, 0] == REGIONS.index(region) + 1) & (m[:, :, 1] > 128))
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    side = int(max(x1 - x0, y1 - y0) * 1.18)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    img = render(view, pal, {region: colour})
    box = (cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2)
    save(img.crop(box).resize((size, size), Image.LANCZOS), name)


LEGS = ['quads', 'glutes', 'hamstrings', 'calves']
UPPER = ['chest', 'front_delt', 'side_rear_delt', 'triceps', 'upper_back', 'biceps']
# Saturday 10 Oct: push on Thursday, pull on Wednesday, legs on Monday (recovered).
NOW = dict(chest=0.8, front_delt=0.62, side_rear_delt=0.62, triceps=0.45)
TOMORROW = dict(chest=0.35)
MONDAY = {}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    # Today's card: legs white, abs (the plank) a step lighter than the resting muscles, no arms.
    white = {**{r: '#FFFFFF' for r in LEGS}, 'abs': '#D4586A'}
    save(render_hd('front', ON_RED, white, keep=trunk('front', 250), top=250), 'hero-legs-light')
    save(render_hd('front', ON_RED_DARK, white, keep=trunk('front', 250), top=250), 'hero-legs-dark')
    # Workout page: the trained region only, front and back, cut under the chest.
    plan = {**{r: RED for r in LEGS}, 'abs': '#EE8794'}
    save(render_hd('front', LIGHT, plan, keep=trunk('front', 240), only_above=(400, ['abs', 'quads'])), 'plate-front-light')
    save(render_hd('back', LIGHT, plan, keep=trunk('back', 240), only_above=(440, ['glutes'])), 'plate-back-light')
    for v in ('front', 'back'):
        save(render(v, LIGHT, {r: RED for r in LEGS}), 'today-%s-light' % v)
        save(render(v, DARK, {r: '#E22A40' for r in LEGS}), 'today-%s-dark' % v)
        for name, vals in (('now', NOW), ('tomorrow', TOMORROW), ('monday', MONDAY)):
            save(render(v, LIGHT, {r: ramp(x, RAMP_LIGHT) for r, x in vals.items()}), 'body-%s-%s-light' % (name, v))
        # Exploration B: a thermal reading. Today's muscles hottest, Thursday's push still warm.
        heat = {**{r: ramp(x * 0.7, RAMP_DARK) for r, x in NOW.items()}, **{r: '#FFD9DD' for r in LEGS}}
        save(render(v, dict(ready='#3A3A3C', base='#232325'), heat), 'thermal-%s' % v)
    for pal, t in ((LIGHT, 'light'), (DARK_THUMB, 'dark')):
        thumb('front', 'quads', pal, 'thumb-quads-' + t)
        thumb('back', 'glutes', pal, 'thumb-glutes-' + t)
        thumb('back', 'hamstrings', pal, 'thumb-hamstrings-' + t)
        thumb('back', 'calves', pal, 'thumb-calves-' + t)
        thumb('front', 'abs', pal, 'thumb-abs-' + t)
    # Body tab rows: the recovering muscle in its own work colour.
    for view, region, x in (('front', 'chest', 0.8), ('front', 'front_delt', 0.62), ('back', 'triceps', 0.45)):
        thumb(view, region, LIGHT, 'rec-' + region, ramp(x, RAMP_LIGHT))
    thumb('front', 'chest', LIGHT, 'rec-chest-tomorrow', ramp(0.35, RAMP_LIGHT))
    print('wrote', len(os.listdir(OUT)), 'images to', OUT)
