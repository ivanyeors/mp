"""
Render the massing model to flat-shaded beauty + depth passes.

ComfyUI's Load3D node cannot run headless -- its `image` input is a viewport
snapshot the browser captures, so the node only works when the graph is run
from the ComfyUI tab. To keep renders reproducible from the CLI, the massing
views are baked here instead, with an exact orthographic camera.

Outputs go to ref-img/massing/. The workflow reads them by absolute path:
the beauty passes feed section 4 (image edit), the depth passes (near = white)
feed section 5 (ControlNet Union, depth).

Two more passes per camera serve the zoned variant of the workflow
(build_workflow.py --zoned):

  massing_<view>_ids.png    ID pass: every visible surface point painted with
                            the flat colour of the showroom area it sits in
                            (by plan position, see ZONES). Exact colours, no
                            shading, no antialiasing, so ImageColorToMask in
                            ComfyUI recovers each area as a clean mask.
  massing_<view>_zoned.png  the beauty pass tinted with the same colours, for
                            Qwen-Image-Edit with a colour legend in the prompt.
  zones.json                per view, the fraction of the frame each area
                            covers, so the builder only wires visible areas.

    python tools/render_views.py
    python tools/render_views.py --list
    python tools/render_views.py iso_ne
"""

import argparse
import json
import math
import os

import numpy as np
import trimesh
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MODEL = os.path.join(ROOT, "model", "showroom_massing.glb")
VIEWS = os.path.join(ROOT, "ref-img", "massing")

W, H = 1664, 928                  # Qwen-Image native 16:9
LIGHT = np.array([0.45, 0.82, -0.35])   # from the north-east, above (Z is south)
AMBIENT = 0.42
BG = (138, 141, 146)
ZONE_TINT = 0.40                  # how much ID colour goes into the zoned beauty pass

# Plan constants, from build_massing.py (plan z is measured from the south wall).
PLAN_W = 7.90
X_PANTRY = 10.45                  # service band starts
X_PATIO = 13.20                   # patio starts
Z_INV_TOP = 2.08                  # south strip: rack, aisle, inventory wall, sign band
Z_BENCH_TOP = 2.90                # workbench band
X_ENTRY = 4.40                    # west end: door, seats, rug, feature wall

# Area slug (matches build_workflow.AREAS), legend colour name, RGB.
# Pure primaries/secondaries: far apart for exact-colour masking, nameable in
# a prompt legend.
ZONES = [
    ("01-entry-waiting",     "red",     (255, 0, 0)),
    ("02-fitting-bays",      "green",   (0, 255, 0)),
    ("03-inventory-wall",    "blue",    (0, 0, 255)),
    ("04-workshop",          "yellow",  (255, 255, 0)),
    ("05-service-pantry-wc", "magenta", (255, 0, 255)),
    ("06-patio-wash-dry",    "cyan",    (0, 255, 255)),
]

# Parts dropped per camera so the view reads as an architectural cutaway --
# without this the wall nearest the camera hides the whole interior.
CUT_N = ["wall_north", "patio_wall_n", "poly_roof", "poly_roof_n"]

# name -> (yaw deg, pitch deg, margin, culled parts)
CAMERAS = {
    # model is X east / Z south; a camera "north-east" of it sits at +X, -Z
    "iso_ne":   (135.0, 30.0, 1.04, CUT_N),
    "iso_nw":   (-135.0, 30.0, 1.04, CUT_N + ["wall_west_n", "wall_west_s", "wall_west_head"]),
    "iso_low":  (145.0, 18.0, 1.04, CUT_N),
    "plan":     (0.0, 89.0, 1.02, ["poly_roof", "poly_roof_n"]),
    "long_sec": (180.0, 8.0, 1.02, CUT_N),      # from the north, looking south
}


def basis(yaw_deg, pitch_deg):
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    d = np.array([math.cos(pitch) * math.sin(yaw),
                  math.sin(pitch),
                  math.cos(pitch) * math.cos(yaw)])
    forward = -d / np.linalg.norm(d)
    up = np.array([0.0, 1.0, 0.0])
    if abs(forward @ up) > 0.999:
        up = np.array([0.0, 0.0, -1.0])     # plan view: north (-Z) at the top
    right = np.cross(forward, up)
    right /= np.linalg.norm(right)
    true_up = np.cross(right, forward)
    return right, true_up, forward


def rasterize(verts, faces, colors, yaw, pitch, margin):
    """Flat-shaded orthographic rasteriser with a z-buffer."""
    right, true_up, forward = basis(yaw, pitch)

    x = verts @ right
    y = verts @ true_up
    z = verts @ forward

    # fit the projected bbox into the frame
    spanx = max(x.max() - x.min(), 1e-6)
    spany = max(y.max() - y.min(), 1e-6)
    scale = min(W / (spanx * margin), H / (spany * margin))
    cx = W / 2 - (x.min() + x.max()) / 2 * scale
    cy = H / 2 + (y.min() + y.max()) / 2 * scale

    sx = x * scale + cx
    sy = -y * scale + cy

    # face normals for lambert shading
    v0, v1, v2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    n = np.cross(v1 - v0, v2 - v0)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    n = n / np.maximum(ln, 1e-12)
    lam = np.clip(n @ (LIGHT / np.linalg.norm(LIGHT)), 0.0, 1.0)
    shade = AMBIENT + (1.0 - AMBIENT) * lam

    rgb = np.zeros((H, W, 3), np.float32)
    rgb[:] = np.array(BG, np.float32) / 255.0
    zbuf = np.full((H, W), np.inf, np.float32)
    wx = np.full((H, W), np.nan, np.float32)      # world x of the visible point
    wz = np.full((H, W), np.nan, np.float32)      # world z (GLB, mirrored) of it

    px = sx[faces]          # (M,3)
    py = sy[faces]
    pz = z[faces]
    vx = verts[:, 0][faces]  # world coords, for the ID pass
    vz = verts[:, 2][faces]

    order = np.argsort(-pz.mean(axis=1))    # far to near, helps the z test
    for fi in order:
        ax, bx, cxx = px[fi]
        ay, by, cyy = py[fi]
        az, bz, cz = pz[fi]

        x0 = max(int(math.floor(min(ax, bx, cxx))), 0)
        x1 = min(int(math.ceil(max(ax, bx, cxx))) + 1, W)
        y0 = max(int(math.floor(min(ay, by, cyy))), 0)
        y1 = min(int(math.ceil(max(ay, by, cyy))) + 1, H)
        if x0 >= x1 or y0 >= y1:
            continue

        denom = (by - cyy) * (ax - cxx) + (cxx - bx) * (ay - cyy)
        if abs(denom) < 1e-9:
            continue

        gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        w0 = ((by - cyy) * (gx - cxx) + (cxx - bx) * (gy - cyy)) / denom
        w1 = ((cyy - ay) * (gx - cxx) + (ax - cxx) * (gy - cyy)) / denom
        w2 = 1.0 - w0 - w1

        inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not inside.any():
            continue

        depth = w0 * az + w1 * bz + w2 * cz
        sub_z = zbuf[y0:y1, x0:x1]
        hit = inside & (depth < sub_z)
        if not hit.any():
            continue

        sub_z[hit] = depth[hit]
        col = colors[fi][:3].astype(np.float32) / 255.0 * shade[fi]
        rgb[y0:y1, x0:x1][hit] = col
        wx[y0:y1, x0:x1][hit] = (w0 * vx[fi, 0] + w1 * vx[fi, 1] + w2 * vx[fi, 2])[hit]
        wz[y0:y1, x0:x1][hit] = (w0 * vz[fi, 0] + w1 * vz[fi, 1] + w2 * vz[fi, 2])[hit]

    return rgb, zbuf, wx, wz


def depth_image(zbuf):
    finite = np.isfinite(zbuf)
    out = np.zeros(zbuf.shape, np.float32)
    if finite.any():
        z = zbuf[finite]
        lo, hi = z.min(), z.max()
        rng = max(hi - lo, 1e-6)
        out[finite] = 1.0 - (zbuf[finite] - lo) / rng     # near = white
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)


def zone_ids(wx, wz):
    """Area index per pixel (-1 = no geometry) from the plan position of the
    visible surface point. The GLB is mirrored on export (Z south), so plan z
    from the south wall is PLAN_W - z."""
    valid = np.isfinite(wx)
    x = np.where(valid, wx, 0.0)
    z = PLAN_W - np.where(valid, wz, 0.0)
    rules = [
        (x >= X_PATIO, 5),                          # patio
        ((x >= X_PANTRY) & (z < 1.0), 3),           # sewing table, workshop prompt
        (x >= X_PANTRY, 4),                         # service band
        (z < Z_INV_TOP, 2),                         # south strip
        (z < Z_BENCH_TOP, 3),                       # workbench
        (x < X_ENTRY, 0),                           # west end
    ]
    ids = np.select([c for c, _ in rules], [i for _, i in rules], default=1)  # else fitting
    return np.where(valid, ids, -1)


def id_image(ids):
    out = np.zeros(ids.shape + (3,), np.uint8)
    for i, (_, _, rgb) in enumerate(ZONES):
        out[ids == i] = rgb
    return out


def zoned_image(rgb, ids):
    tint = id_image(ids).astype(np.float32) / 255.0
    zoned = np.where((ids >= 0)[..., None], rgb * (1 - ZONE_TINT) + tint * ZONE_TINT, rgb)
    return (np.clip(zoned, 0, 1) * 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("camera", nargs="?", default=None)
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    if args.list:
        for k, v in CAMERAS.items():
            print("%-10s yaw=%6.1f pitch=%5.1f  cull=%s" % (k, v[0], v[1], ",".join(v[3])))
        return

    scene = trimesh.load(MODEL)
    os.makedirs(VIEWS, exist_ok=True)
    todo = {args.camera: CAMERAS[args.camera]} if args.camera else CAMERAS
    zones_path = os.path.join(VIEWS, "zones.json")
    coverage = {}
    if os.path.exists(zones_path):
        with open(zones_path, encoding="utf-8") as f:
            coverage = json.load(f)

    for name, (yaw, pitch, margin, cull) in todo.items():
        keep = [g for gname, g in scene.geometry.items() if gname not in cull]
        mesh = trimesh.util.concatenate(keep)
        verts = np.asarray(mesh.vertices, np.float64)
        faces = np.asarray(mesh.faces, np.int64)
        colors = np.asarray(mesh.visual.face_colors, np.uint8)

        rgb, zbuf, wx, wz = rasterize(verts, faces, colors, yaw, pitch, margin)

        beauty = os.path.join(VIEWS, "massing_%s.png" % name)
        Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).save(beauty)

        depth = os.path.join(VIEWS, "massing_%s_depth.png" % name)
        Image.fromarray(depth_image(zbuf)).save(depth)

        ids = zone_ids(wx, wz)
        Image.fromarray(id_image(ids)).save(os.path.join(VIEWS, "massing_%s_ids.png" % name))
        Image.fromarray(zoned_image(rgb, ids)).save(os.path.join(VIEWS, "massing_%s_zoned.png" % name))
        coverage[name] = {slug: round(float((ids == i).mean()), 4)
                          for i, (slug, _, _) in enumerate(ZONES)}

        print("  %-10s -> %s  (+ depth, ids, zoned)  cover: %s" % (
            name, os.path.basename(beauty),
            " ".join("%s=%.0f%%" % (slug[:2], v * 100) for slug, v in coverage[name].items())))

    with open(zones_path, "w", encoding="utf-8") as f:
        json.dump(coverage, f, indent=2)
    print("wrote %s" % VIEWS)


if __name__ == "__main__":
    main()
