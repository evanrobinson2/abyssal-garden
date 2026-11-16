#!/usr/bin/env python3
"""Matched comparison: source concept vs render from the hero camera (same 1456x816 frame).
Writes a side-by-side + difference sheet and a JSON of per-cell (6x4 grid) colour and luminance differences.
    python3 compare.py <source.png> <render.png> <out-prefix>      (needs Pillow + numpy)"""
import sys, json
import numpy as np
from PIL import Image, ImageDraw
src, ren, out = sys.argv[1:4]
A = Image.open(src).convert('RGB'); B = Image.open(ren).convert('RGB').resize(A.size)
a = np.asarray(A).astype(np.float32) / 255; b = np.asarray(B).astype(np.float32) / 255
H, W, _ = a.shape; C, R = 6, 4
L = np.array([.2126, .7152, .0722], np.float32)
cells = {}; tot = []
for r in range(R):
    for c in range(C):
        sa = a[H*r//R:H*(r+1)//R, W*c//C:W*(c+1)//C].reshape(-1, 3); sb = b[H*r//R:H*(r+1)//R, W*c//C:W*(c+1)//C].reshape(-1, 3)
        ma, mb = sa.mean(0), sb.mean(0); d = float(np.abs(ma - mb).mean())
        cells[f"{'ABCDEF'[c]}{r+1}"] = {"src": '#%02x%02x%02x' % tuple((ma*255).astype(int)), "ren": '#%02x%02x%02x' % tuple((mb*255).astype(int)),
            "dRGB": round(d, 3), "dLum": round(float((mb - ma) @ L), 3)}
        tot.append(d)
la, lb = a.reshape(-1, 3) @ L, b.reshape(-1, 3) @ L
res = {"meanCellColourDiff": round(float(np.mean(tot)), 4), "worstCells": sorted(cells, key=lambda k: -cells[k]["dRGB"])[:6],
       "lum_src_p1_50_99": [round(float(np.percentile(la, p)), 3) for p in (1, 50, 99)], "lum_ren_p1_50_99": [round(float(np.percentile(lb, p)), 3) for p in (1, 50, 99)], "cells": cells}
json.dump(res, open(out + '.json', 'w'), indent=1)
# sheet: source | render on top; abs diff heat + grid below
diff = (np.abs(a - b).mean(2) * 3).clip(0, 1); heat = Image.fromarray((np.stack([diff, diff * 0.5, 1 - diff], 2) * 255).astype(np.uint8))
sheet = Image.new('RGB', (W * 2 + 10, H * 2 + 10), (12, 12, 16)); sheet.paste(A, (0, 0)); sheet.paste(B, (W + 10, 0)); sheet.paste(heat, (0, H + 10))
over = Image.blend(A, B, 0.5); sheet.paste(over, (W + 10, H + 10))
d = ImageDraw.Draw(sheet)
for ox, oy in ((0, 0), (W + 10, 0), (0, H + 10), (W + 10, H + 10)):
    for c in range(1, C): d.line([(ox + W*c//C, oy), (ox + W*c//C, oy + H)], fill=(255, 255, 0), width=1)
    for r in range(1, R): d.line([(ox, oy + H*r//R), (ox + W, oy + H*r//R)], fill=(255, 255, 0), width=1)
for (ox, oy), t in zip(((0, 0), (W + 10, 0), (0, H + 10), (W + 10, H + 10)), ('SOURCE', 'RENDER', 'DIFFERENCE', '50/50 OVERLAY')):
    d.rectangle([ox + 6, oy + 6, ox + 150, oy + 28], fill=(0, 0, 0)); d.text((ox + 12, oy + 12), t, fill=(255, 255, 0))
sheet.resize((sheet.width // 2, sheet.height // 2)).save(out + '.jpg', quality=88)
print(json.dumps({k: res[k] for k in ('meanCellColourDiff', 'worstCells', 'lum_src_p1_50_99', 'lum_ren_p1_50_99')}))
