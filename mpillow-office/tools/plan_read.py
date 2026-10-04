"""
Measuring tools for reading a floor plan drawing into a spec -- the
instruments the plan-to-3d skill uses; nothing here decides anything.

    python tools/plan_read.py render  plan.pdf [--page 1] [--dpi 300] [--out x.png]
    python tools/plan_read.py lines   plan.png [--min 0.5]          long straight dimension lines
    python tools/plan_read.py ticks   plan.png --row V | --col U    tick marks crossing a dimension line
    python tools/plan_read.py --spec plans/x.yaml solids            black fills as outlines, metres
    python tools/plan_read.py --spec plans/x.yaml scan z=2.75 x=6.2 ink runs along a line, metres
    python tools/plan_read.py --spec plans/x.yaml grid              metre grid over the plan, in tiles

`lines` and `ticks` work in pixels and come first: find the dimension chains,
read the pixel position of their ticks, and put two of them in the spec's
`calibrate`. Everything after that is in metres through the spec.

`scan` prints every dark run crossed by a horizontal (z=) or vertical (x=)
line. A thin wall drawn as a double line shows as two runs -- its faces;
a window as three or four; a solid structural wall as one wide run.
"""

import argparse
import os
import subprocess
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spec as S  # noqa: E402
import plan_check as C  # noqa: E402
import plan_env as E  # noqa: E402


def runs(a):
    out, s = [], None
    for i, v in enumerate(a):
        if v and s is None:
            s = i
        if not v and s is not None:
            out.append((s, i - 1))
            s = None
    if s is not None:
        out.append((s, len(a) - 1))
    return out


def groups(idx, gap=2):
    out = []
    for i in idx:
        if out and i - out[-1][-1] <= gap:
            out[-1].append(i)
        else:
            out.append([i])
    return [float(np.mean(g)) for g in out]


def cmd_render(a):
    out = a.out or os.path.splitext(a.file)[0] + "_p%d_%ddpi.png" % (a.page, a.dpi)
    subprocess.run([E.require_pdftoppm(), "-f", str(a.page), "-l", str(a.page), "-r", str(a.dpi), "-png",
                    "-singlefile", a.file, os.path.splitext(out)[0]], check=True)
    im = cv2.imread(out)
    print("%s  %d x %d px" % (out, im.shape[1], im.shape[0]))


def cmd_lines(a):
    g = cv2.imread(a.file, cv2.IMREAD_GRAYSCALE)
    d = g < 128
    H, W = d.shape
    print("horizontal lines (row: length px):")
    for r in groups([i for i in range(H) if max((e - s + 1 for s, e in runs(d[i])), default=0) > a.min * W]):
        r = int(round(r))
        seg = max(runs(d[r]), key=lambda se: se[1] - se[0])
        print("  row %5d  u %d..%d" % (r, seg[0], seg[1]))
    print("vertical lines (col: length px):")
    for c in groups([j for j in range(W) if max((e - s + 1 for s, e in runs(d[:, j])), default=0) > a.min * H]):
        c = int(round(c))
        seg = max(runs(d[:, c]), key=lambda se: se[1] - se[0])
        print("  col %5d  v %d..%d" % (c, seg[0], seg[1]))


def cmd_ticks(a):
    g = cv2.imread(a.file, cv2.IMREAD_GRAYSCALE)
    d = g < 128
    if a.row is not None:
        band = d[a.row - 8:a.row + 9, :].sum(0)
    else:
        band = d[:, a.col - 8:a.col + 9].sum(1)
    t = groups([i for i, v in enumerate(band) if v >= 12])
    print("ticks:", " ".join("%.1f" % x for x in t))
    print("steps:", " ".join("%.1f" % (b - x) for x, b in zip(t, t[1:])))


def load(a):
    spec = S.load(a.spec)
    im, path = C.load_drawing(spec)
    cal, _ = C.calibration(spec)
    return spec, im, cal


def cmd_solids(a):
    spec, im, cal = load(a)
    ua, sx, vb, sz = cal
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    sol = (g < 100).astype(np.uint8)
    k = max(3, int(round(0.08 * abs(sx))) | 1)
    sol = cv2.morphologyEx(sol, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(sol)
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if area < (0.15 * abs(sx)) ** 2:
            continue
        cs, _ = cv2.findContours((lab == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        ap = cv2.approxPolyDP(cs[0], 2.0, True)[:, 0]
        pts = [[round(float((p[0] - ua) / sx), 3), round(float((p[1] - vb) / sz), 3)] for p in ap]
        print("solid x %.3f..%.3f z %.3f..%.3f  (%d corners)" % (
            min(p[0] for p in pts), max(p[0] for p in pts), min(p[1] for p in pts), max(p[1] for p in pts), len(pts)))
        print("  poly:", pts)


def cmd_scan(a):
    spec, im, cal = load(a)
    ua, sx, vb, sz = cal
    d = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY) < 150
    H, W = d.shape
    for q in a.lines:
        axis, val = q.split("=")
        val = float(val)
        if axis == "z":
            v = int(round(vb + sz * val))
            r = runs(d[v])
            out = ["%.3f-%.3f" % ((s - ua) / sx, (e + 1 - ua) / sx) for s, e in r]
        else:
            u = int(round(ua + sx * val))
            r = runs(d[:, u])
            out = ["%.3f-%.3f" % ((s - vb) / sz, (e + 1 - vb) / sz) for s, e in r]
        print("%s=%g: %s" % (axis, val, "  ".join(out)))


def cmd_grid(a):
    spec, im, cal = load(a)
    ua, sx, vb, sz = cal
    H, W = im.shape[:2]
    out = im.copy()
    xs = np.arange(np.floor(-ua / sx * 2) / 2, (W - ua) / sx, 0.5)
    zs = np.arange(np.floor(min(-vb / sz, (H - vb) / sz) * 2) / 2, max(-vb / sz, (H - vb) / sz), 0.5)
    for x in xs:
        u = int(round(ua + sx * x))
        whole = abs(x - round(x)) < 1e-6
        cv2.line(out, (u, 0), (u, H), (0, 0, 255) if whole else (255, 180, 180), 1)
        if whole:
            for v in range(20, H, 400):
                cv2.putText(out, "x%g" % x, (u + 2, v), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
    for z in zs:
        v = int(round(vb + sz * z))
        whole = abs(z - round(z)) < 1e-6
        cv2.line(out, (0, v), (W, v), (0, 0, 255) if whole else (255, 180, 180), 1)
        if whole:
            for u in range(4, W, 400):
                cv2.putText(out, "z%g" % z, (u, v - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
    # tile the model's extent so each piece is readable at full resolution
    parts, _, info = __import__("build_massing").build(spec)
    lo = np.min([m.bounds[0] for m in parts.values()], 0)
    hi = np.max([m.bounds[1] for m in parts.values()], 0)
    (u0, v0), (u1, v1) = C.to_px(cal, [(lo[0] - 1, lo[2] - 1), (hi[0] + 1, hi[2] + 1)])
    u0, u1 = sorted([max(0, int(u0)), min(W, int(u1))])
    v0, v1 = sorted([max(0, int(v0)), min(H, int(v1))])
    os.makedirs(a.out, exist_ok=True)
    tile = 1000
    for i, v in enumerate(range(v0, v1, tile - 100)):
        for j, u in enumerate(range(u0, u1, tile - 100)):
            p = os.path.join(a.out, "%s_grid_%d%d.png" % (spec["name"], i, j))
            cv2.imwrite(p, out[v:min(v + tile, v1), u:min(u + tile, u1)])
            print(p)


def main():
    ap = argparse.ArgumentParser(description="measure a floor plan drawing")
    ap.add_argument("--spec")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("render")
    p.add_argument("file")
    p.add_argument("--page", type=int, default=1)
    p.add_argument("--dpi", type=int, default=300)
    p.add_argument("--out")
    p = sub.add_parser("lines")
    p.add_argument("file")
    p.add_argument("--min", type=float, default=0.3, help="fraction of the sheet a line must span")
    p = sub.add_parser("ticks")
    p.add_argument("file")
    p.add_argument("--row", type=int)
    p.add_argument("--col", type=int)
    sub.add_parser("solids")
    p = sub.add_parser("scan")
    p.add_argument("lines", nargs="+", help="z=<metres> or x=<metres>")
    p = sub.add_parser("grid")
    p.add_argument("--out", default=".")
    a = ap.parse_args()
    if a.cmd in ("solids", "scan", "grid") and not a.spec:
        ap.error(a.cmd + " needs --spec (for the drawing and its calibration)")
    {"render": cmd_render, "lines": cmd_lines, "ticks": cmd_ticks, "solids": cmd_solids,
     "scan": cmd_scan, "grid": cmd_grid}[a.cmd](a)


if __name__ == "__main__":
    main()
