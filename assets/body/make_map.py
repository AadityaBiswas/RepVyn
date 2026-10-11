"""Write the region maps the app colours at runtime (app/src/figure.ts).

Same muscle detection as make.py, but instead of fixed colours each pixel stores which region it belongs to:
red = muscle code (0 = body base, then the catalog's MUSCLES order + 1), green = coverage (0..255).
The PNG itself is opaque, so browsers decode both channels exactly (no premultiplied alpha).

    python assets/body/make_map.py
"""
import os
import cv2
import numpy as np

from make import HERE, SOURCES, load

# The catalog's muscle order (src/library/schema.ts MUSCLES: the engine regions, then the extra muscles); make.py uses two older names.
# A muscle only shows once the artwork draws it as its own shape and make.py lists that shape. Today that is the first thirteen.
REGIONS = ['chest', 'front_delt', 'side_rear_delt', 'triceps', 'upper_back', 'biceps',
           'quads', 'glutes', 'hamstrings', 'calves', 'abs', 'lower_back',
           'forearms', 'traps', 'obliques', 'adductors', 'hip_flexors']
ALIAS = {'front_delts': 'front_delt', 'rear_delts': 'side_rear_delt'}


def write(name):
    g, dark, lab, stats, cent, n, groups = load(name)
    code = np.zeros(n, np.uint8)
    for r, ids in groups.items():
        for cid in ids:
            code[cid] = REGIONS.index(ALIAS.get(r, r)) + 1
    near = cv2.dilate(lab.astype(np.uint16), np.ones((5, 5), np.uint8))
    edge = (near > 0) & (dark == 0)
    mu = float(np.median(g[dark == 1]))
    alpha = np.clip((250 - g) / 20, 0, 1)
    alpha[edge] = np.clip((250 - g[edge]) / (250 - mu), 0, 1)
    alpha[dark == 1] = 1
    reg = np.zeros(g.shape, np.uint8)
    reg[edge] = code[near[edge]]
    reg[dark == 1] = code[lab[dark == 1]]
    out = np.zeros(g.shape + (3,), np.uint8)  # BGR
    out[:, :, 2] = reg
    out[:, :, 1] = np.round(alpha * 255).astype(np.uint8)
    path = os.path.join(HERE, 'map-%s.png' % name)
    cv2.imwrite(path, out, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    return path


if __name__ == '__main__':
    print('wrote', ', '.join(write(n) for n in SOURCES))
