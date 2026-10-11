"""Colour the anatomy figures per muscle state.

Reads body-front.png / body-back.png (flat grey figures, muscles separated by white gaps),
finds each muscle as a connected dark region, and writes tinted PNGs with a transparent background.

    python assets/body/make.py

ponytail: component ids are tied to these two source images; if the art is regenerated, re-run
with DEBUG=1 to print numbered overlays (dbg-*.png) and update FRONT / BACK below.
"""
import os
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))

# component id -> muscle. Anything not listed is body base (head, neck, hands, feet).
FRONT = {
    'upper_back': [3, 4],
    'front_delts': [5, 6],
    'chest': [7, 8],
    'biceps': [9, 10, 28, 29],
    'triceps': [11, 12],
    'abs': [13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 30, 31, 32, 33, 38, 39, 41, 42],
    'quads': [43, 44, 45, 46, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60],
    'calves': [62, 63, 65, 66, 67, 68, 69, 70, 72, 73],
    'forearms': [26, 27, 34, 35, 36, 37, 40],
}
BACK = {
    'upper_back': [1, 2, 5, 6, 7, 8, 11, 12, 13, 14],
    'rear_delts': [3, 4],
    'triceps': [9, 10],
    'lower_back': [20, 22],
    'glutes': [24, 25, 28, 29],
    'hamstrings': [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42],
    'calves': [43, 44, 45, 46, 47, 48],
    'forearms': [15, 16, 17, 18, 19, 21],
}
SOURCES = {'front': ('body-front.png', 190, FRONT), 'back': ('body-back.png', 185, BACK)}

# How used each region is, 0 (ready) to 1 (fully used). Demo state matching the canvas mock:
# push muscles were trained on Wednesday, legs are fresh. Regions not listed are ready.
USED = {'chest': 0.95, 'front_delts': 0.7, 'triceps': 0.5, 'upper_back': 0.3}
# Ready muscles are grey; used muscles go from pale red to dark red.
REDS = [(0.0, '#F7CDD2'), (0.5, '#E8596B'), (0.75, '#D91E36'), (1.0, '#7A0E1E')]
THEMES = {
    'light': {'ready': '#AEAEB2', 'base': '#E1E1E6'},
    'dark': {'ready': '#48484A', 'base': '#2C2C2E'},
}
# Share of the weekly set target done per region (Progress tab), shown relative to the most-trained
# region: that one is the darkest red, the rest are paler, untrained regions stay grey (same scale as USED).
WEEK = {'chest': 0.75, 'triceps': 0.67, 'front_delts': 0.63, 'upper_back': 0.57, 'biceps': 0.44, 'abs': 0.33, 'rear_delts': 0.3}
WEEK_REL = {r: v / max(WEEK.values()) for r, v in WEEK.items()}
# Muscles in today's workout (workout page).
TODAY = {'quads': 1, 'glutes': 1, 'hamstrings': 1, 'calves': 1}
SOLID = [(0.0, '#D91E36'), (1.0, '#D91E36')]
# Program emphasis (program picker): what each program trains most.
UPPER = ['chest', 'upper_back', 'front_delts', 'rear_delts', 'biceps', 'triceps']
LOWER = ['quads', 'glutes', 'hamstrings', 'calves']
PROG = {
    'balanced': {r: 0.6 for r in UPPER + LOWER + ['abs', 'lower_back']},
    'upper': dict({r: 0.95 for r in UPPER}, **{r: 0.15 for r in LOWER}, abs=0.5, lower_back=0.5),
    'legs': dict({r: 0.95 for r in LOWER}, **{r: 0.15 for r in UPPER}, abs=0.5, lower_back=0.5),
}
# name -> (values per region, colour ramp); regions with no value are ready grey
SETS = {'body': (USED, REDS), 'week': (WEEK_REL, REDS), 'today': (TODAY, SOLID)}
SETS.update({'prog-' + k: (v, REDS) for k, v in PROG.items()})
# Home's red workout card: today's muscles in white, the rest of the body in darker reds, for both themes.
SETS['hero'] = (TODAY, [(0.0, '#FFFFFF'), (1.0, '#FFFFFF')])
ON_RED = {'ready': '#9B1B2E', 'base': '#AB1E33'}
# The same figure with nothing lit; the finished screen fades from this one to 'hero' so the muscles light up.
SETS['heroff'] = ({}, SOLID)


def bgr(hex_):
    h = hex_.lstrip('#')
    return np.array([int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16)], np.float32)


def ramp(stops, v):
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if v <= b:
            return bgr(ca) + (bgr(cb) - bgr(ca)) * (v - a) / (b - a)
    return bgr(stops[-1][1])


def load(name):
    f, thr, groups = SOURCES[name]
    im = cv2.imread(os.path.join(HERE, f), cv2.IMREAD_UNCHANGED)
    a = im[:, :, 3].astype(np.float32) / 255
    g = cv2.cvtColor(im[:, :, :3], cv2.COLOR_BGR2GRAY).astype(np.float32) * a + 255 * (1 - a)
    ys, xs = np.where(g < 250)
    g = g[ys.min() - 6:ys.max() + 7, xs.min() - 6:xs.max() + 7]
    dark = (g < thr).astype(np.uint8)
    n, lab, stats, cent = cv2.connectedComponentsWithStats(dark, connectivity=4)
    return g, dark, lab, stats, cent, n, groups


def render(name, theme, kind):
    g, dark, lab, stats, cent, n, groups = load(name)
    pal = ON_RED if kind.startswith('hero') else THEMES[theme]
    values, stops = SETS[kind]
    idle = bgr(pal['ready'])
    region = {cid: r for r, ids in groups.items() for cid in ids}
    colour = np.zeros((n, 3), np.float32) + bgr(pal['base'])
    for cid, r in region.items():
        colour[cid] = ramp(stops, values[r]) if values.get(r, 0) > 0 else idle
    near = cv2.dilate(lab.astype(np.uint16), np.ones((5, 5), np.uint8))  # nearest muscle for anti-aliased edges
    edge = (near > 0) & (dark == 0)
    mu = float(np.median(g[dark == 1]))
    out = np.zeros(g.shape + (4,), np.float32)
    out[:, :, :3] = bgr(pal['base'])
    out[:, :, 3] = np.clip((250 - g) / 20, 0, 1)
    out[edge, :3] = colour[near[edge]]
    out[edge, 3] = np.clip((250 - g[edge]) / (250 - mu), 0, 1)
    out[dark == 1, :3] = colour[lab[dark == 1]]
    out[dark == 1, 3] = 1
    out[:, :, 3] *= 255
    cv2.imwrite(os.path.join(HERE, '%s-%s-%s.png' % (kind, name, theme)), out.astype(np.uint8))


def debug(name):
    g, dark, lab, stats, cent, n, _ = load(name)
    vis = cv2.resize(cv2.cvtColor(g.astype(np.uint8), cv2.COLOR_GRAY2BGR), None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= 60:
            cv2.putText(vis, str(i), (int(cent[i][0] * 2) - 10, int(cent[i][1] * 2) + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1, cv2.LINE_AA)
    cv2.imwrite(os.path.join(HERE, 'dbg-%s.png' % name), vis)


if __name__ == '__main__':
    for name in SOURCES:
        if os.environ.get('DEBUG'):
            debug(name)
        for theme in THEMES:
            for kind in SETS:
                render(name, theme, kind)
    print('wrote', ', '.join('%s-%s-%s.png' % (k, n, t) for k in SETS for n in SOURCES for t in THEMES))
