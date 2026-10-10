"""
Self-test for the blocking layer (comfy_nodes/mp_blocking/blocks.py). No
ComfyUI and no ML models: the "render" is the model itself.

  1. layout text round-trips, rotated boxes have the right footprint;
  2. Propose Blocks' geometry: the plan's model with its blocks is rendered
     from two cameras inside the room, each block's pixels stand in for a
     SAM mask, and the true depth -- distorted by an unknown scale and
     offset, as a monocular estimate is -- stands in for MoGe. Every block
     some camera sees whole must come back within 8 cm and 3 degrees (near
     pieces land within 2-3 cm; the margin is for pieces seen only from far).

    python tools/test_blocks.py                       # plans/midview-08-83.yaml
    python tools/test_blocks.py plans/<name>.yaml
"""

import math
import os
import sys

import numpy as np
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "comfy_nodes", "mp_blocking"))
import blocks as BL  # noqa: E402
import build_massing as BM  # noqa: E402
import spec as S  # noqa: E402

W, H = 832, 464
TOL_M, TOL_DEG = 0.08, 3.0   # a piece seen only from ~11 m with the 0.4 % warp below is ~6 cm out
MIN_PX = 750            # a block must cover this much of a view to be judged


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


def test_text():
    text = ("# comment\n"
            "sofa_1  x=2.1 z=5.4 w=2.2 d=0.9 h=0.8 rot=30 | boucle sofa, oak legs\n"
            "shelf   x=6 z=0.45 w=3 d=0.4 h=2.2 y=0.1 arot=90 asset=none\n")
    bs = BL.parse(text)
    check([b.name for b in bs] == ["sofa_1", "shelf"], "names")
    check(bs[0].prompt == "boucle sofa, oak legs" and bs[1].asset == "none", "prompt / asset")
    again = BL.parse(BL.format_layout(bs))
    for a, b in zip(bs, again):
        check(BL.format_line(a) == BL.format_line(b), "round trip: %s" % a.name)
    for bad in ("x=1 z=1 w=1 d=1 h=1", "a x=1 z=1 w=1 d=1", "a x=1 z=1 w=1 d=1 h=1 q=2",
                "a x=1 z=1 w=0 d=1 h=1", "a x=1 z=1 w=1 d=1 h=1\na x=2 z=1 w=1 d=1 h=1"):
        try:
            BL.parse(bad)
        except BL.LayoutError:
            continue
        raise AssertionError("accepted a bad line: %r" % bad)
    # rot = 90 counter-clockwise from above: the w side runs north-south
    b = BL.Block("r", 0, 0, 2.0, 0.5, 1.0, rot=90)
    lo, hi = BL.box_mesh(b).bounds
    check(np.allclose(hi - lo, [0.5, 1.0, 2.0], atol=1e-9), "rotated extents %s" % (hi - lo))
    # +X turned 30 degrees counter-clockwise from above points to -Z (north)
    m = BL.box_mesh(BL.Block("r", 0, 0, 2.0, 0.01, 0.01, rot=30))
    far = m.vertices[np.argmax(m.vertices[:, 0])]
    check(far[2] < 0, "rot direction")
    x, z, w, d, rot = BL.min_area_rect(np.array(BL.Block("r", 3, 4, 2.0, 0.6, 1, rot=20).corners()))
    check(abs(x - 3) < 1e-3 and abs(z - 4) < 1e-3 and abs(w - 2.0) < 1e-3 and abs(d - 0.6) < 1e-3
          and abs(rot - 20) < 0.05, "min_area_rect %s" % ((x, z, w, d, rot),))
    cols = BL.id_colors(26)
    check(len(set(cols)) == 26 and (0, 0, 0) not in cols, "id colours")
    back = [tuple(int(round(255 * (c / 255) ** (1 / 2.2))) for c in BL.to_linear(rgb)) for rgb in cols]
    check(back == cols, "to_linear survives Render Mesh's re-encode")
    print("text, boxes, colours: ok")


def test_propose(spec_path):
    spec = S.load(spec_path)
    parts, _, _ = BM.build(spec)
    blocks = [b for b, _ in BM.spec_blocks(spec)]
    check(blocks, "%s has no blocks" % spec_path)
    for b in blocks:                  # the silhouettes, not any asset: they fill the box exactly
        m = BL.box_mesh(b)
        if spec.get("mirror_z") is not None:
            mirror = np.diag([1.0, 1.0, -1.0, 1.0])
            mirror[2, 3] = S.ev(spec["mirror_z"], spec["_env"])
            m.apply_transform(mirror)
        parts["blk_" + b.name] = m
    if spec.get("mirror_z") is not None:          # into the GLB frame, as exported
        mz = S.ev(spec["mirror_z"], spec["_env"])
        mirror = np.diag([1.0, 1.0, -1.0, 1.0])
        mirror[2, 3] = mz
        for m in parts.values():
            m.apply_transform(mirror)
    names = list(parts)
    meshes = [parts[n] for n in names]
    owner = np.concatenate([np.full(len(m.faces), i) for i, m in enumerate(meshes)])
    big = trimesh.util.concatenate(meshes)
    verts, faces = np.asarray(big.vertices, float), np.asarray(big.faces, np.int64)
    lo, hi = big.bounds
    centre = (lo + hi) / 2
    rng = np.random.default_rng(7)

    cams = [{"position": {"x": 1.0, "y": 2.9, "z": 1.0}, "target": {"x": 8.0, "y": 0.0, "z": 5.5}, "fov": 60},
            {"position": {"x": 12.4, "y": 2.9, "z": 6.9}, "target": {"x": 4.0, "y": 0.0, "z": 2.5}, "fov": 60},
            {"position": {"x": 6.0, "y": 3.2, "z": 7.4}, "target": {"x": 6.0, "y": 0.0, "z": 1.0}, "fov": 70}]
    block_idx = {"blk_" + b.name: k for k, b in enumerate(blocks)}
    cands, px = [], {}
    for ci, ci_info in enumerate(cams):
        cam = BL.camera_from_info(ci_info, centre)
        t, fid = BL.render_depth(verts, faces, cam, W, H)
        part = np.where(fid >= 0, owner[np.maximum(fid, 0)], -1)
        dirs = BL.pixel_dirs(cam, W, H)
        z_true = t * (dirs @ cam[1])
        a, b0 = rng.uniform(0.6, 1.6), rng.uniform(-0.8, 0.8)
        est = (z_true - b0) / a                      # what MoGe "sees": wrong scale and offset
        # monocular depth errors are smooth, not per-pixel: a gentle warp
        # across the frame (up to 0.4 %) plus a little grain
        gy, gx = np.mgrid[0:H, 0:W] / np.array([H, W])[:, None, None]
        warp = 0.004 * (rng.uniform(-1, 1) * gx + rng.uniform(-1, 1) * gy)
        est = est * (1 + warp + rng.normal(0, 0.0005, est.shape))
        masks = {}
        for pi, n in enumerate(names):
            if n in block_idx:
                m = part == pi
                if m.sum() >= 50:
                    masks[n] = m
        any_mask = np.zeros((H, W), bool)
        for m in masks.values():
            any_mask |= m
        # the reference depth is the model the renders were drawn on, blocks included
        for n, m in masks.items():
            pts = BL.points_from_mask(m, est, t, cam, valid_bg=~any_mask)
            cands.append((n, 1.0, pts))
            whole = not (m[0].any() or m[-1].any() or m[:, 0].any() or m[:, -1].any())
            if whole:                    # judged only where some camera sees all of it
                px[n] = max(px.get(n, 0), int(m.sum()))
        print("  camera %d: %d blocks visible" % (ci + 1, len(masks)))

    merged = BL.merge_views(cands)
    bad, judged = [], 0
    for b in blocks:
        n = "blk_" + b.name
        if px.get(n, 0) < MIN_PX:
            print("  %-16s not judged (%d px in a view that holds all of it)" % (b.name, px.get(n, 0)))
            continue
        judged += 1
        got = [BL.block_from_points(p, b.name) for lab, p in merged if lab == n]
        got = [g for g in got if g is not None]
        check(got, "%s was not recovered" % b.name)
        g = got[0]
        dr = (g.rot - b.rot + 45) % 90 - 45
        same_axes = abs(((g.rot - b.rot) % 180)) < 45 or abs(((g.rot - b.rot) % 180) - 180) < 45
        gw, gd = (g.w, g.d) if same_axes else (g.d, g.w)
        err = max(abs(g.x - b.x), abs(g.z - b.z), abs(gw - b.w), abs(gd - b.d), abs(g.h - b.h), abs(g.y - b.y))
        ok = err <= TOL_M and abs(dr) <= TOL_DEG
        print("  %-16s err %.3f m  rot %+.1f deg  %s" % (b.name, err, dr, "ok" if ok else "FAIL"))
        if not ok:
            bad.append((b, g))
    check(judged >= 5, "only %d blocks were seen well enough to judge" % judged)
    if bad:
        raise AssertionError("not recovered within %.2f m / %.0f deg: %s" % (
            TOL_M, TOL_DEG, ", ".join("%s -> %s" % (b.name, BL.format_line(g)) for b, g in bad)))
    print("propose geometry: ok (%d blocks)" % judged)


if __name__ == "__main__":
    test_text()
    test_propose(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "plans", "midview-08-83.yaml"))
