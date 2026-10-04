"""
Check a plan spec against the drawing it was read from.

    python tools/plan_check.py plans/<name>.yaml        # exit 0 = pass, 1 = fail

The spec is built (nothing exported) and every part's plan footprint is laid
over the source drawing through the spec's `calibrate` points. Four checks:

  assumptions  every entry in `assumptions:` is settled -- an `open` one means
               a value is still a guess that nobody has confirmed. FAIL.
  dims         every dimension chain in `dims:` adds up to its total (as
               drawn on the plan). FAIL if one does not.
  edges        for each part drawn at the plan cut (not `overhead`), the fraction of its footprint outline that lies
               within `tol` of a line on the drawing. Walls (full-height parts,
               or check: wall) must pass `wall_pass` overall and `part_min`
               each. FAIL. Furniture is reported, not gated: plans draw it loosely.
  missing      solid dark fills on the drawing (structural walls, columns)
               that no part covers. FAIL above `blob_min`.

Writes next to the GLBs (output.dir):
  <base>_check.png   drawing (grey) + walls (red) + furniture (blue outline);
                     failing parts orange and labelled, missing fills magenta,
                     dimension chain ticks green
  <base>_zones.png   drawing + zone regions, coloured as the ID model
  <base>_check.json  every number above, for the plan-to-3d skill to act on

Spec keys used here:
  source:    {image: path} or {pdf: path, page: 1, dpi: 200}
  calibrate: [{px: [u, v], at: [x, z]}, ...]  >= 2 points, not collinear in
             either axis; image pixel <- authoring coordinates
  dims:      [{label, segments: [mm...], total: mm, axis: x|z, at: <other
              coordinate, m>, from: <start, m>}]  axis/at/from only to draw it
  check:     {tol: 0.05, wall_pass: 0.90, part_min: 0.60, blob_min: 0.15,
              ink_lum: 150, solid_lum: 100, solid_min: 0.06}
"""

import argparse
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spec as S  # noqa: E402
import build_massing as B  # noqa: E402
import plan_env as E  # noqa: E402

DEFAULTS = dict(tol=0.05, wall_pass=0.90, part_min=0.60, blob_min=0.15,
                ink_lum=150, solid_lum=100, solid_min=0.06)


# ---- drawing --------------------------------------------------------------

def load_drawing(spec):
    src = spec.get("source") or {}
    if "image" in src:
        path = S.resolve_path(spec, src["image"])
    elif "pdf" in src:
        pdf = S.resolve_path(spec, src["pdf"])
        page, dpi = int(src.get("page", 1)), int(src.get("dpi", 200))
        cache = os.path.join(spec["_dir"], ".cache")
        os.makedirs(cache, exist_ok=True)
        stem = os.path.join(cache, "%s_p%d_%ddpi" % (spec["name"], page, dpi))
        path = stem + ".png"
        if not os.path.exists(path) or os.path.getmtime(path) < os.path.getmtime(pdf):
            subprocess.run([E.require_pdftoppm(), "-f", str(page), "-l", str(page), "-r", str(dpi),
                            "-png", "-singlefile", pdf, stem], check=True)
    else:
        raise S.SpecError("spec has no source: {image} or {pdf}")
    im = cv2.imread(path)
    if im is None:
        raise S.SpecError("cannot read drawing " + path)
    return im, path


def calibration(spec):
    """Least-squares u = a + sx * x, v = b + sz * z from the calibrate points."""
    pts = spec.get("calibrate") or []
    if len(pts) < 2:
        raise S.SpecError("calibrate needs at least two points")
    env = spec["_env"]
    xs = np.array([[float(S.ev(p["at"][0], env)), float(p["px"][0])] for p in pts])
    zs = np.array([[float(S.ev(p["at"][1], env)), float(p["px"][1])] for p in pts])
    out = []
    for arr in (xs, zs):
        if np.ptp(arr[:, 0]) <= 0:
            raise S.SpecError("calibrate points must differ in both x and z")
        s, a = np.polyfit(arr[:, 0], arr[:, 1], 1)
        out.append((a, s))
    (a, sx), (b, sz) = out
    resid = max(np.abs(a + sx * xs[:, 0] - xs[:, 1]).max(), np.abs(b + sz * zs[:, 0] - zs[:, 1]).max())
    return (a, sx, b, sz), float(resid)


def to_px(cal, pts):
    a, sx, b, sz = cal
    pts = np.asarray(pts, float)
    return np.stack([a + sx * pts[:, 0], b + sz * pts[:, 1]], 1)


# ---- model ----------------------------------------------------------------

def footprint(mesh):
    """Plan outline (x, z) of a mesh: union of its upward-ish faces, projected."""
    v = mesh.vertices[:, [0, 2]]
    tris = []
    for f in mesh.faces:
        t = v[f]
        area = 0.5 * abs((t[1, 0] - t[0, 0]) * (t[2, 1] - t[0, 1]) - (t[2, 0] - t[0, 0]) * (t[1, 1] - t[0, 1]))
        if area > 1e-9:
            tris.append(Polygon(t))
    if not tris:
        return None
    return unary_union(tris).buffer(0)


def polys(geom):
    if geom is None or geom.is_empty:
        return []
    return list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom]


def draw_poly(img, cal, geom, color, thick=-1):
    for p in polys(geom):
        rings = [p.exterior] + list(p.interiors)
        pts = [np.round(to_px(cal, np.array(r.coords))).astype(np.int32) for r in rings]
        if thick < 0:
            cv2.fillPoly(img, pts, color)
        else:
            cv2.polylines(img, pts, True, color, thick, cv2.LINE_AA)


# ---- check ----------------------------------------------------------------

def check(spec):
    cfg = dict(DEFAULTS, **(spec.get("check") or {}))
    env = spec["_env"]
    im, drawing = load_drawing(spec)
    cal, resid = calibration(spec)
    ppm = (abs(cal[1]) + abs(cal[3])) / 2                     # pixels per metre
    tol_px = max(2.0, cfg["tol"] * ppm)
    H_, W_ = im.shape[:2]

    res = {"spec": spec["_path"], "drawing": drawing, "px_per_m": [cal[1], cal[3]],
           "calibration_residual_px": resid, "fail": []}

    # 1. assumptions
    open_ = [a for a in spec.get("assumptions") or [] if a.get("status", "open") == "open"]
    res["assumptions_open"] = [a.get("about", "?") for a in open_]
    if open_:
        res["fail"].append("%d open assumption(s)" % len(open_))

    # 2. dimension chains
    res["dims"] = []
    for d in spec.get("dims") or []:
        segs = [float(S.ev(x, env)) for x in d["segments"]]
        total = float(S.ev(d["total"], env)) if "total" in d else None
        r = {"label": d.get("label", "?"), "sum": sum(segs), "total": total}
        if total is not None:
            r["error"] = sum(segs) - total
            r["ok"] = abs(r["error"]) <= float(d.get("tol", 2))
            if not r["ok"]:
                res["fail"].append("dims '%s': segments sum to %g, total says %g"
                                   % (r["label"], sum(segs), total))
        res["dims"].append(r)

    # 3 + 4. geometry against the drawing
    parts, _, info = B.build(spec)
    kinds = info["kinds"]
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
    chroma = im.max(2).astype(int) - im.min(2).astype(int)
    ink = (g < cfg["ink_lum"]) & (chroma < 60)
    dist = cv2.distanceTransform((~ink).astype(np.uint8), cv2.DIST_L2, 5)

    feet = {}
    for n, m in parts.items():
        if kinds[n] in ("none", "overhead"):
            continue
        fp = footprint(m)
        if fp is not None and fp.area > 1e-6:
            feet[n] = fp

    part_res, wall_hits, wall_all = {}, 0, 0
    for n, fp in feet.items():
        mask = np.zeros((H_, W_), np.uint8)
        draw_poly(mask, cal, fp, 255, 1)
        ys, xs = np.nonzero(mask)
        if len(xs) == 0:
            part_res[n] = {"kind": kinds[n], "on_line": None, "note": "off the drawing"}
            continue
        d = dist[ys, xs]
        hit = int((d <= tol_px).sum())
        part_res[n] = {"kind": kinds[n], "on_line": round(hit / len(d), 3), "px": int(len(d)), "hits": hit,
                       "worst_mm": round(float(np.percentile(d, 95)) / ppm * 1000)}
        if kinds[n] == "wall":
            wall_hits += hit
            wall_all += len(d)
    res["parts"] = part_res
    res["walls_on_line"] = round(wall_hits / wall_all, 3) if wall_all else None
    bad_walls = sorted((n for n, r in part_res.items()
                        if r["kind"] == "wall" and (r["on_line"] or 0) < cfg["part_min"]),
                       key=lambda n: part_res[n]["on_line"] or 0)
    res["walls_off"] = bad_walls
    if wall_all and res["walls_on_line"] < cfg["wall_pass"]:
        res["fail"].append("walls: %.0f%% of wall outlines on a drawn line (need %.0f%%)"
                           % (100 * res["walls_on_line"], 100 * cfg["wall_pass"]))
    if bad_walls:
        res["fail"].append("walls off the drawing: " + ", ".join(bad_walls[:12])
                           + (" ..." if len(bad_walls) > 12 else ""))

    solid = ((g < cfg["solid_lum"]) & (chroma < 40)).astype(np.uint8)
    k = max(3, int(round(cfg["solid_min"] * ppm)) | 1)
    solid = cv2.morphologyEx(solid, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    cover = np.zeros((H_, W_), np.uint8)
    for fp in feet.values():
        draw_poly(cover, cal, fp, 1)
    cover = cv2.dilate(cover, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(2 * tol_px) | 1,) * 2))
    miss = (solid & (1 - cover)).astype(np.uint8)
    # only look inside the model's extent (+ 0.5 m): titles, legends and
    # schedules elsewhere on the sheet are not part of the plan
    if feet:
        bx = unary_union(list(feet.values())).bounds
        (u0, v0), (u1, v1) = to_px(cal, [(bx[0] - 0.5, bx[1] - 0.5), (bx[2] + 0.5, bx[3] + 0.5)])
        u0, u1 = sorted([int(u0), int(u1)])
        v0, v1 = sorted([int(v0), int(v1)])
        keep = np.zeros_like(miss)
        keep[max(0, v0):max(0, v1), max(0, u0):max(0, u1)] = 1
        miss &= keep
    n_cc, lab, stats, _ = cv2.connectedComponentsWithStats(miss, 8)
    a, sx, b, sz = cal
    missing = []
    for i in range(1, n_cc):
        x, y, w, h, area = stats[i]
        if area < (cfg["blob_min"] * ppm) ** 2 / 4 or max(w, h) < cfg["blob_min"] * ppm:
            continue
        xa, xb = sorted([(x - a) / sx, (x + w - a) / sx])
        za, zb = sorted([(y - b) / sz, (y + h - b) / sz])
        missing.append({"px": [int(x), int(y), int(w), int(h)],
                        "x": [round(float(xa), 3), round(float(xb), 3)],
                        "z": [round(float(za), 3), round(float(zb), 3)],
                        "area_m2": round(area / ppm ** 2, 3)})
    res["missing"] = missing
    if missing:
        res["fail"].append("%d solid fill(s) on the drawing with no part" % len(missing))

    res["breakdown"] = breakdown(res, info, dist, cal, ppm, tol_px)
    res["pass"] = not res["fail"]
    return res, im, cal, feet, kinds


def _probe(dist, cal, pts):
    """Distance (px) from each plan point to the nearest ink; inf if off the sheet."""
    px = np.round(to_px(cal, pts)).astype(int)
    H_, W_ = dist.shape
    ok = (px[:, 0] >= 0) & (px[:, 0] < W_) & (px[:, 1] >= 0) & (px[:, 1] < H_)
    out = np.full(len(pts), np.inf)
    out[ok] = dist[px[ok, 1], px[ok, 0]]
    return out


def breakdown(res, info, dist, cal, ppm, tol_px):
    """Per spec item and per opening: how well it sits on the drawing.

    Items: the outline score of their pieces cut by the plan (walls, solids,
    furniture), pooled. Openings: each jamb (the wall end, across the wall
    thickness) against the nearest drawn line, and for windows the glazing --
    the share of stations along the opening where the drawing has a line
    running inside the wall thickness (a drawn window), versus a clear gap
    (a drawn door)."""
    origin = info.get("origin", {})
    kinds = info.get("kinds", {})
    items = {}
    for n, (item, typ, role, colour) in origin.items():
        e = items.setdefault(item, {"type": typ, "colour": colour, "roles": {}, "hits": 0, "px": 0,
                                    "worst_mm": 0, "unchecked": True})
        e["roles"][role] = e["roles"].get(role, 0) + 1
        if kinds.get(n) != "none":
            e["unchecked"] = False
    for n, r in res["parts"].items():
        if n not in origin or r.get("on_line") is None:
            continue
        item, typ, role, colour = origin[n]
        e = items[item]
        if role in ("glass", "sill"):
            continue                     # panes and sills are scored with their opening
        e["hits"] += r["hits"]
        e["px"] += r["px"]
        e["worst_mm"] = max(e["worst_mm"], r["worst_mm"])
    for e in items.values():
        e["on_line"] = round(e["hits"] / e["px"], 3) if e["px"] else None

    def category(item, e):
        if e["type"] == "wall":
            return "wall"
        if e["colour"] == "structure":
            return "structure"
        return "other"

    for item, e in items.items():
        e["category"] = category(item, e)

    ops = []
    for o in info.get("openings", []):
        (x0, z0), (x1, z1) = o["p0"], o["p1"]
        nx, nz = o["normal"]
        h = o["t"] / 2
        across = np.linspace(-h, h, 9)
        jambs = []
        for (cx, cz) in ((x0, z0), (x1, z1)):
            dj = _probe(dist, cal, [(cx + a * nx, cz + a * nz) for a in across])
            jambs.append({"on_line": round(float((dj <= tol_px).mean()), 2),
                          "off_mm": round(float(np.median(dj)) / ppm * 1000)})
        # stations along the opening, 5 cm in from each jamb
        L = float(np.hypot(x1 - x0, z1 - z0))
        st = np.linspace(min(0.05, L / 4), L - min(0.05, L / 4), 15)
        dx, dz = (x1 - x0) / L, (z1 - z0) / L
        inner = np.linspace(-h * 0.7, h * 0.7, 7)
        lined = 0
        for sv in st:
            dline = _probe(dist, cal, [(x0 + dx * sv + a * nx, z0 + dz * sv + a * nz) for a in inner])
            lined += bool((dline <= 1.0).any())
        ops.append({"wall": o["wall"], "index": o["index"], "kind": o["kind"],
                    "unchecked": items.get(o["wall"], {}).get("unchecked", False),
                    "at": round(o["at"], 3), "w": round(o["w"], 3),
                    "sill": o["sill"], "head": o["head"],
                    "jambs": jambs, "lines_across": round(lined / len(st), 2)})
    return {"items": items, "openings": ops}


# ---- pictures -------------------------------------------------------------

def overlay(spec, res, im, cal, feet, kinds):
    base = cv2.cvtColor(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    base = cv2.addWeighted(base, 0.55, np.full_like(base, 255), 0.45, 0)
    fill = base.copy()
    for n, fp in feet.items():
        if kinds[n] == "wall":
            draw_poly(fill, cal, fp, (40, 40, 220))
    out = cv2.addWeighted(fill, 0.45, base, 0.55, 0)
    for n, fp in feet.items():
        if kinds[n] != "wall":
            draw_poly(out, cal, fp, (200, 110, 30), 1)
    for n in res["walls_off"]:
        draw_poly(out, cal, feet[n], (0, 140, 255), 3)
        c = feet[n].representative_point()
        u, v = to_px(cal, [(c.x, c.y)])[0]
        cv2.putText(out, n, (int(u) + 4, int(v)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 100, 230), 1, cv2.LINE_AA)
    for m in res["missing"]:
        x, y, w, h = m["px"]
        cv2.rectangle(out, (x - 3, y - 3), (x + w + 3, y + h + 3), (200, 0, 200), 2)
    env = spec["_env"]
    for d in spec.get("dims") or []:
        if "axis" not in d:
            continue
        pos = float(S.ev(d["from"], env))
        at = float(S.ev(d["at"], env))
        ticks = [pos]
        for sgm in d["segments"]:
            pos += float(S.ev(sgm, env)) / 1000.0
            ticks.append(pos)
        pts = [(t, at) if d["axis"] == "x" else (at, t) for t in ticks]
        px = np.round(to_px(cal, pts)).astype(int)
        cv2.polylines(out, [px.reshape(-1, 1, 2)], False, (40, 160, 40), 1, cv2.LINE_AA)
        for u, v in px:
            if d["axis"] == "x":
                cv2.line(out, (u, v - 9), (u, v + 9), (40, 160, 40), 2)
            else:
                cv2.line(out, (u - 9, v), (u + 9, v), (40, 160, 40), 2)
    verdict = "PASS" if res["pass"] else "FAIL"
    cv2.putText(out, "%s  walls on line %s" % (verdict, res["walls_on_line"]), (12, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (30, 150, 30) if res["pass"] else (0, 0, 200), 2, cv2.LINE_AA)
    return out


def zones_picture(spec, im, cal):
    base = cv2.cvtColor(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    tint = base.copy()
    H_, W_ = im.shape[:2]
    a, sx, b, sz = cal
    lo = to_px(cal, [((0 - a) / sx, (0 - b) / sz)])[0]
    zones = spec.get("zones") or []
    for (x0, x1, z0, z1), zi in B.zone_regions(spec):
        # clamp open sides to the drawing
        xs = sorted([(0 - a) / sx, (W_ - a) / sx])
        zs = sorted([(0 - b) / sz, (H_ - b) / sz])
        x0, x1 = max(x0, xs[0]), min(x1, xs[1])
        z0, z1 = max(z0, zs[0]), min(z1, zs[1])
        p = to_px(cal, [(x0, z0), (x1, z1)]).round().astype(int)
        r, g, bl = B.ZONE_RGB[zi]
        cv2.rectangle(tint, tuple(p[0]), tuple(p[1]), (bl, g, r), -1)
        label = zones[zi]["slug"] if zi < len(zones) else str(zi)
        cx, cy = p.mean(0).astype(int)
        cv2.putText(base, label, (cx - 60, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
    del lo
    return cv2.addWeighted(tint, 0.35, base, 0.65, 0)


def print_breakdown(res):
    b = res["breakdown"]
    items = b["items"]
    for cat, title in (("structure", "STRUCTURE (solid on the drawing)"), ("wall", "WALLS"),
                       ("other", "OTHER (floor, ledges, furniture)")):
        rows = sorted((n, e) for n, e in items.items() if e["category"] == cat)
        if not rows:
            continue
        print()
        print(title)
        print("  %-18s %-32s %9s %10s" % ("item", "pieces", "on line", "95% within"))
        for n, e in rows:
            pieces = ", ".join("%d %s" % (c, r) for r, c in sorted(e["roles"].items()))
            if e["unchecked"]:
                print("  %-18s %-32s   not on the drawing (check: none -- see assumptions)" % (n, pieces))
                continue
            print("  %-18s %-32s %8s %8s mm" % (
                n, pieces, "-" if e["on_line"] is None else "%.0f%%" % (100 * e["on_line"]), e["worst_mm"]))
    for kind, title in (("window", "WINDOWS"), ("door", "DOORS / OPENINGS")):
        rows = [o for o in b["openings"] if (o["kind"] == "window") == (kind == "window")]
        if not rows:
            continue
        print()
        print(title)
        print("  %-18s %6s %6s %11s %13s %13s %8s" % (
            "wall #", "at", "width", "sill-head" if kind == "window" else "head",
            "jamb A", "jamb B", "drawn"))
        for o in rows:
            hs = ("%.2f-%.2f" % (o["sill"], o["head"])) if kind == "window" else "%.2f" % o["head"]
            ja, jb = o["jambs"]
            drawn = o["lines_across"]
            if o["unchecked"]:
                verdict = "added on the user's answer, not drawn"
            elif kind == "window":
                verdict = "glazing drawn %.0f%%" % (100 * drawn)
            else:
                verdict = "open gap" if drawn < 0.3 else "leaf / threshold drawn"
            if o["unchecked"]:
                print("  %-18s %6.3f %6.3f %11s %27s  %s" % (
                    "%s #%d" % (o["wall"], o["index"]), o["at"], o["w"], hs, "-", verdict))
                continue
            print("  %-18s %6.3f %6.3f %11s %5.0f%% %4dmm %5.0f%% %4dmm  %s" % (
                "%s #%d" % (o["wall"], o["index"]), o["at"], o["w"], hs,
                100 * ja["on_line"], ja["off_mm"], 100 * jb["on_line"], jb["off_mm"], verdict))


def main():
    ap = argparse.ArgumentParser(description="check a plan spec against its drawing")
    ap.add_argument("spec")
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--breakdown", action="store_true",
                    help="per wall, structure, window and door: how it sits on the drawing")
    a = ap.parse_args()
    spec = S.load(a.spec)
    res, im, cal, feet, kinds = check(spec)

    out = spec.get("output") or {}
    out_dir = S.resolve_path(spec, out.get("dir", "../model"))
    base = out.get("base", spec["name"])
    os.makedirs(out_dir, exist_ok=True)
    png = os.path.join(out_dir, base + "_check.png")
    cv2.imwrite(png, overlay(spec, res, im, cal, feet, kinds))
    if spec.get("zone_regions"):
        cv2.imwrite(os.path.join(out_dir, base + "_zones.png"), zones_picture(spec, im, cal))
    with open(os.path.join(out_dir, base + "_check.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1)

    print("drawing:     %s" % res["drawing"])
    print("scale:       %.2f / %.2f px per m (x / z), calibration residual %.1f px"
          % (res["px_per_m"][0], res["px_per_m"][1], res["calibration_residual_px"]))
    for d in res["dims"]:
        print("dims:        %-28s sum %8.1f  total %s  %s" % (
            d["label"], d["sum"], d["total"], "" if d.get("ok", True) else "<-- MISMATCH"))
    print("walls:       %s of wall outlines on a drawn line" % res["walls_on_line"])
    if not a.quiet:
        for n, r in sorted(res["parts"].items(), key=lambda kv: kv[1]["on_line"] or 0):
            if (r["on_line"] or 0) < 0.6:
                print("  %-9s %-28s %5s on line, 95%% within %s mm" % (
                    r["kind"], n, r["on_line"], r.get("worst_mm")))
    for m in res["missing"]:
        print("missing:     solid fill at x %s z %s (%.2f m2)" % (m["x"], m["z"], m["area_m2"]))
    for q in res["assumptions_open"]:
        print("open:        %s" % q)
    if a.breakdown:
        print_breakdown(res)
    print("picture:     %s" % png)
    print("RESULT:      %s" % ("PASS" if res["pass"] else "FAIL -- " + "; ".join(res["fail"])))
    sys.exit(0 if res["pass"] else 1)


if __name__ == "__main__":
    main()
