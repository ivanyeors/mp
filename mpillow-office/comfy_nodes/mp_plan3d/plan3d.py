"""
Floor plan image -> clean, metric 3D massing (GLB), for any plan.

The generic sibling of tools/build_massing.py, which hard-codes one showroom.
Image-to-3D models (TRELLIS, Hunyuan3D, Tripo) rebuild single objects as
blobby, unscaled meshes; every serious plan-to-3D pipeline instead goes
plan -> vector walls -> exact extrusion. This is that pipeline:

  1. recognise  walls / doors / windows. `segment()` runs a ResNet34-UNet
                trained on CubiCasa5K (huggingface.co/Yytsi/floorplan-to-3d-walls,
                MIT): furniture, text, hatching and dimension lines come out
                as floor. `detect_walls_cv()` is the model-free fallback for
                clean CAD exports (dark + thick = wall).
     + rooms    optional. `detect_rooms()` runs Raster2Seq (SIGGRAPH'26,
                github.com/Cornell-VAILab/Raster2Seq, MIT): labelled room
                polygons + door / window lines. The rooms become the zones,
                and where two rooms meet with no wall the segmenter saw, the
                straight line drawn on the plan between them becomes a
                partition (hairline WC / storage walls the segmenter reads
                as furniture). Lines must be solid and straight, so dotted
                curtain tracks, text and furniture curves are never walls.
  2. correct    anything the model cannot know (hairline partitions drawn
                like furniture, functional zones with no walls) is painted
                on the plan: an `add_walls` mask is OR-ed in, an `erase`
                mask is cut out, a `zone_map` (flat red / green / blue /
                yellow / magenta / cyan regions) overrides the room zones.
  3. clean      wall regions -> polygons, edges within `snap_deg` of the
                plan axes snapped exactly horizontal / vertical, collinear
                points dropped: walls become crisp prisms, a few dozen
                triangles each.
  4. build      walls extruded to `wall_height`; door gaps get a lintel
                from `door_height`, window gaps a sill to `sill_height` and
                a lintel; one floor slab per zone; optional ceiling.
                Exterior walls are split by side (ext_north .. ext_west), so
                a cutaway is one line in HIDE PARTS.
  5. ID twin    every part cut along the zone territories and painted in
                the zone colour, named <part>__z<n> (GLB Part Filter
                ignores the suffix, so one HIDE list drives both models).

Plan axes: image right = +X (east), image down = +Z (south), Y up, metres,
origin at the walls' north-west corner. Right-handed, as three.js and
ComfyUI's Load3D / RenderMesh expect.

No ComfyUI imports here; __init__.py wraps it, and
    python plan3d.py plan.png --width 17.75 [--cv]
runs it from the shell.
"""

import math
import os

import cv2
import numpy as np
import trimesh
from shapely.geometry import Polygon

ZONE_RGB = [(255, 0, 0), (0, 255, 0), (0, 0, 255),
            (255, 255, 0), (255, 0, 255), (0, 255, 255)]
OTHER_RGB = (255, 255, 255)        # zones past the sixth: in no zone mask
NAMES = ["red", "green", "blue", "yellow", "magenta", "cyan"]

PALETTE = {
    "wall": (196, 193, 188),
    "floor": (176, 173, 168),
    "lintel": (196, 193, 188),
    "sill": (196, 193, 188),
    "ceiling": (210, 208, 204),
}

SEG_CLASSES = ("floor", "wall", "door", "window")
_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
_STD = np.array([0.229, 0.224, 0.225], np.float32)
_MODEL = {}


# ---- 1. recognise ------------------------------------------------------------

def load_seg_model(path, device="cuda"):
    key = (path, device)
    if key not in _MODEL:
        import segmentation_models_pytorch as smp
        from safetensors.torch import load_file
        m = smp.Unet("resnet34", encoder_weights=None, classes=4)
        m.load_state_dict(load_file(path))
        _MODEL[key] = m.eval().to(device)
    return _MODEL[key]


def segment(rgb, model, size=512, device="cuda"):
    """rgb: HxWx3 float 0..1.  Returns HxW int labels (0 floor, 1 wall, 2 door, 3 window).

    The model saw whole plans letterboxed to 512 px; run it at that scale (a
    larger `size` starts reading furniture outlines as walls) and upsample the
    logits, not the labels, to the plan's own resolution for smooth edges."""
    import torch
    H, W = rgb.shape[:2]
    s = size / max(H, W)
    h, w = max(1, round(H * s)), max(1, round(W * s))
    canvas = np.tile(_MEAN, (size, size, 1))
    y0, x0 = (size - h) // 2, (size - w) // 2
    canvas[y0:y0 + h, x0:x0 + w] = cv2.resize(rgb.astype(np.float32), (w, h), interpolation=cv2.INTER_AREA)
    x = torch.from_numpy(((canvas - _MEAN) / _STD).transpose(2, 0, 1))[None].to(device)
    with torch.no_grad():
        logits = model(x)[0, :, y0:y0 + h, x0:x0 + w]
        logits = torch.nn.functional.interpolate(logits[None], (H, W), mode="bilinear",
                                                 align_corners=False)[0]
    return logits.argmax(0).cpu().numpy().astype(np.uint8)


def detect_rooms(rgb, labels, path, device="cuda", margin=0.02):
    """Raster2Seq rooms on the plan.  rgb: HxWx3 float 0..1, labels: segment() output.

    Returns dict(rooms=[(Nx2 px, name)], doors=[2x2 px], windows=[2x2 px]) in plan
    pixels.  The model letterboxes to 256 / 512 px, so the plan is cropped to the
    walls first: on a presentation sheet that more than doubles the pixels per
    room and is what makes thin partitions readable."""
    try:
        from .r2s import infer
    except ImportError:                           # run as a script
        from r2s import infer
    H, W = labels.shape
    ys, xs = np.nonzero(labels == 1)
    x0, y0, x1, y1 = 0, 0, W, H
    if len(xs):
        m = int(margin * max(np.ptp(xs), np.ptp(ys)))
        x0, y0 = max(int(xs.min()) - m, 0), max(int(ys.min()) - m, 0)
        x1, y1 = min(int(xs.max()) + m + 1, W), min(int(ys.max()) + m + 1, H)
    r = infer.predict(rgb[y0:y1, x0:x1] * 255.0, path, device)
    off = np.array([x0, y0], np.float32)
    return dict(rooms=[(p + off, n) for p, n in r["rooms"]],
                doors=[q + off for q in r["doors"]], windows=[q + off for q in r["windows"]])


def _disk(px):
    px = max(1, int(round(px)))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (px, px))


def detect_walls_cv(rgb, wall_threshold=0.45, min_wall_px=6):
    """Model-free walls: dark, unsaturated strokes at least `min_wall_px` thick."""
    hsv = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2HSV)
    dark = (hsv[..., 2] < wall_threshold * 255) & (hsv[..., 1] < 90)
    return cv2.morphologyEx(dark.astype(np.uint8), cv2.MORPH_OPEN, _disk(min_wall_px))


def _drop_specks(mask, frac=0.01, min_px=0):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n <= 1:
        return mask.astype(np.uint8)
    area = stats[1:, cv2.CC_STAT_AREA]
    keep = np.zeros(n, np.uint8)
    keep[1:] = area >= max(area.max() * frac, min_px)
    return keep[lab]


# ---- 2. masks -> plan layers ---------------------------------------------------

def _close_lines(mask, length):
    """Close gaps up to `length` px along the plan axes only (no corner blobs)."""
    length = max(3, int(length))
    p = length                                    # erosion treats the image border as wall: pad it away
    m = np.pad(mask, p)
    h = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (length, 1)))
    v = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (1, length)))
    return np.maximum(np.maximum(h, v)[p:-p, p:-p], mask)


def _zones_from_map(zone_rgb, footprint):
    """Painted zone map (flat primary colours) -> int zone ids (0 = none, k+1 = zone k)."""
    z = np.zeros(footprint.shape, np.int32)
    hi = zone_rgb > 0.5
    for k, c in enumerate(ZONE_RGB):
        want = np.array(c) > 127
        hit = np.all(hi == want, axis=-1)
        sat = zone_rgb.max(-1) - zone_rgb.min(-1)
        z[hit & (sat > 0.5)] = k + 1
    return z * footprint


def _footprint(closed):
    """Everything an outside flood fill cannot reach; plus the outside (1-px padded)."""
    h, w = closed.shape
    ff = np.pad(1 - closed, 1, constant_values=1).astype(np.uint8)   # 1-px free border
    cv2.floodFill(ff, np.zeros((h + 4, w + 4), np.uint8), (0, 0), 2)
    return (ff[1:-1, 1:-1] != 2).astype(np.uint8), (ff == 2).astype(np.uint8)


def _rasterise_rooms(rooms, shape, mpp, min_room_m2):
    """Room polygons -> int map (k+1 = room k, largest first) and the kept names."""
    rooms = [(p, n, abs(cv2.contourArea(p.astype(np.float32))) * mpp * mpp) for p, n in rooms]
    rooms = [r for r in rooms if r[2] >= min_room_m2]
    rooms.sort(key=lambda r: -r[2])
    R = np.zeros(shape, np.int32)
    for k in range(len(rooms)):                   # largest first, so smaller rooms stay on top
        cv2.fillPoly(R, [np.round(rooms[k][0]).astype(np.int32)], k + 1)
    return R, [r[1] for r in rooms]


def _room_partitions(R, walls, ink, footprint, doors, mpp, thickness_m=0.1, reach_m=0.25,
                     min_len_m=0.6):
    """Walls between neighbouring rooms that the segmenter missed, snapped to the drawing.

    The room model says *where* two rooms meet (the Voronoi seam between their
    polygons); the plan says *exactly where* the wall is: a solid, straight
    line of ink at least `min_len_m` long near that seam. Dotted or curved
    lines, text and anything already covered by a segmented wall are ignored;
    the model's door lines cut openings."""
    if R.max() < 2:
        return np.zeros_like(walls)
    seed = (R == 0).astype(np.uint8)
    d, near = cv2.distanceTransformWithLabels(seed, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    lut = np.zeros(near.max() + 1, np.int32)
    ys, xs = np.nonzero(R)
    lut[near[ys, xs]] = R[ys, xs]
    V = lut[near]                                 # nearest room everywhere
    ok = d <= reach_m / mpp
    seam = np.zeros(R.shape, np.uint8)
    seam[:, 1:] |= ((V[:, 1:] != V[:, :-1]) & ok[:, 1:] & ok[:, :-1]).astype(np.uint8)
    seam[1:, :] |= ((V[1:] != V[:-1]) & ok[1:] & ok[:-1]).astype(np.uint8)
    band = cv2.dilate(seam, _disk(2 * reach_m / mpp)) & footprint

    # Solid straight strokes only: an opening with a long thin kernel removes text,
    # dots, dashes, arcs and furniture curves.
    L = max(5, int(min_len_m / mpp))
    line = cv2.dilate(ink, np.ones((2, 2), np.uint8)) & band
    lines = np.maximum(cv2.morphologyEx(line, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (L, 1))),
                       cv2.morphologyEx(line, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, L))))
    part = cv2.dilate(lines, _disk(max(2, thickness_m / mpp)))

    # Not where a real wall already is; reconnect the survivors to it.
    dw = cv2.distanceTransform((1 - walls).astype(np.uint8), cv2.DIST_L2, 5)
    core = (part & (dw > 0.2 / mpp)).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(core, 8)
    keep = np.zeros(n, np.uint8)
    keep[1:] = np.maximum(stats[1:, cv2.CC_STAT_WIDTH], stats[1:, cv2.CC_STAT_HEIGHT]) * mpp >= min_len_m
    part = part & cv2.dilate(keep[lab], _disk(0.5 / mpp)) & footprint
    # A partition is built off a wall; a free-standing outline is furniture.
    n, lab = cv2.connectedComponents(part, connectivity=8)
    near_wall = np.zeros(n, np.float32) + 1e9
    np.minimum.at(near_wall, lab.ravel(), dw.ravel())
    ok = near_wall <= (thickness_m + 0.05) / mpp
    ok[0] = False
    part = ok[lab].astype(np.uint8)

    cut = np.zeros_like(part)
    for q in doors:
        a, b = (tuple(int(v) for v in np.round(p)) for p in q)
        cv2.line(cut, a, b, 1, max(3, int(0.4 / mpp)))
    return (part & (1 - cut)).astype(np.uint8)


def plan_layers(walls, doors, windows, mpp, max_opening_m=2.2, min_room_m2=1.0, zone_map=None,
                min_opening_m=0.5, max_gap_depth_m=0.6):
    """Binary wall / door / window masks -> walls, openings, footprint, zones."""
    walls = _drop_specks(walls, 0.01, 16)
    if walls.sum() == 0:
        raise ValueError("no walls found")
    closed = _close_lines(walls, max_opening_m / mpp)

    # Footprint: everything an outside flood fill cannot reach. The padded outside
    # keeps its 1-px border, for walls on the crop edge.
    footprint, outside_pad = _footprint(closed)

    gaps = (closed & (1 - walls) & footprint).astype(np.uint8)
    # Real openings span at least `min_opening_m`; shorter slivers are notches the closing filled.
    n, lab, stats, _ = cv2.connectedComponentsWithStats(gaps, 8)
    keep = np.zeros(n, np.uint8)
    span = np.maximum(stats[:, cv2.CC_STAT_WIDTH], stats[:, cv2.CC_STAT_HEIGHT]) * mpp
    # ...and are only a wall thick: closing between parallel lines (racks, benches)
    # fills whole areas, which are floor, not openings.
    depth = np.zeros(n, np.float32)
    np.maximum.at(depth, lab.ravel(), cv2.distanceTransform(gaps, cv2.DIST_L2, 5).ravel())
    keep[1:] = (span[1:] >= min_opening_m) & (2 * depth[1:] * mpp <= max_gap_depth_m)
    gaps = keep[lab]
    # A gap is a window when the model saw window pixels in or next to it, else a door.
    win = cv2.dilate((windows > 0).astype(np.uint8), _disk(5))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(gaps, 8)
    win_gap = np.zeros_like(gaps)
    for i in range(1, n):
        comp = lab == i
        if (win[comp] > 0).mean() > 0.3:
            win_gap[comp] = 1
    door_gap = gaps & (1 - win_gap)

    zone_ids = None
    if zone_map is not None and zone_map.ndim == 2:          # room ids (detect_rooms)
        z = zone_map * footprint * (1 - walls)
        zone_ids = [int(i) for i in np.unique(z) if i]
        lut = np.zeros(int(zone_map.max()) + 1, np.int32)
        lut[zone_ids] = np.arange(1, len(zone_ids) + 1)
        zones = lut[z]
    elif zone_map is not None:
        zones = _zones_from_map(zone_map, footprint)
    else:
        free = footprint & (1 - closed)
        n, lab, stats, _ = cv2.connectedComponentsWithStats(free, 4)
        min_px = min_room_m2 / (mpp * mpp)
        ids = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= min_px]
        ids.sort(key=lambda i: -stats[i, cv2.CC_STAT_AREA])
        zones = np.zeros(lab.shape, np.int32)
        for k, i in enumerate(ids):
            zones[lab == i] = k + 1
    n_zones = int(zones.max())
    if n_zones == 0:
        zones = footprint.astype(np.int32)        # one zone: the whole footprint
        n_zones = 1

    # Territories: every footprint pixel -> nearest zone (walls split down the middle).
    seed = (zones == 0).astype(np.uint8)
    _, near = cv2.distanceTransformWithLabels(seed, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    lut = np.zeros(near.max() + 1, np.int32)
    ys, xs = np.nonzero(zones)
    lut[near[ys, xs]] = zones[ys, xs]
    territory = lut[near] * footprint

    shell = cv2.dilate(outside_pad, _disk(max(3, 0.6 / mpp)))[1:-1, 1:-1]   # band along the outside
    exterior = walls & shell
    area = [float((zones == k + 1).sum() * mpp * mpp) for k in range(n_zones)]
    return dict(walls=walls, footprint=footprint, door_gaps=door_gap, window_gaps=win_gap,
                zones=zones, territory=territory, exterior=exterior, shell=shell, n_zones=n_zones, zone_m2=area,
                zone_ids=zone_ids)


# ---- 3. clean: masks -> snapped polygons ------------------------------------------

def _snap_ring(pts, snap_deg):
    """Snap near-axis edges of a closed ring exactly horizontal / vertical."""
    p = pts.astype(np.float64).copy()
    n = len(p)
    if n < 3:
        return p
    tol = math.tan(math.radians(snap_deg))
    for axis in (1, 0):                         # horizontal edges set y, then vertical set x
        for i in range(n):
            a, b = p[i], p[(i + 1) % n]
            dx, dy = abs(b[0] - a[0]), abs(b[1] - a[1])
            if axis == 1 and dx > 0 and dy <= tol * dx:
                m = (a[1] + b[1]) / 2
                p[i][1] = p[(i + 1) % n][1] = m
            if axis == 0 and dy > 0 and dx <= tol * dy:
                m = (a[0] + b[0]) / 2
                p[i][0] = p[(i + 1) % n][0] = m
    # drop duplicates and collinear points
    out = []
    for i in range(n):
        a, b, c = p[i - 1], p[i], p[(i + 1) % n]
        if np.allclose(a, b):
            continue
        if abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) < 1e-6:
            continue
        out.append(b)
    return np.array(out)


def polygons(mask, mpp, simplify_px=1.5, snap_deg=6.0):
    """Binary mask -> clean shapely polygons in metres (x east, z south)."""
    m = (mask > 0).astype(np.uint8)
    if m.sum() == 0:
        return []
    cnts, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hier is None:
        return []
    hier = hier[0]

    def ring(c):
        c = cv2.approxPolyDP(c, simplify_px, True)[:, 0, :]
        return _snap_ring(c, snap_deg) if snap_deg > 0 else c.astype(float)

    out = []
    for i, c in enumerate(cnts):
        if hier[i][3] != -1:
            continue
        shell = ring(c)
        if len(shell) < 3:
            continue
        holes, j = [], hier[i][2]
        while j != -1:
            hr = ring(cnts[j])
            if len(hr) >= 3:
                holes.append(hr * mpp)
            j = hier[j][0]
        p = Polygon(shell * mpp, holes).buffer(0)
        if not p.is_empty and p.area > (3 * mpp) ** 2:
            out.append(p)
    return out


# (x, y_plan, z_extrude) -> (X = x, Y = z_extrude, Z = y_plan)
_SWAP = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1]], float)


def extrude(polys, y0, y1, color):
    if y1 - y0 <= 1e-4:
        return None
    meshes = []
    for p in polys:
        for g in getattr(p, "geoms", [p]):
            if g.area <= 0:
                continue
            m = trimesh.creation.extrude_polygon(g, y1 - y0)
            m.apply_transform(_SWAP)                 # trimesh re-winds on det < 0
            m.apply_translation((0, y0, 0))
            meshes.append(m)
    if not meshes:
        return None
    m = trimesh.util.concatenate(meshes)
    m.merge_vertices()
    rgba = np.array(list(color) + [255], np.uint8)
    m.visual.face_colors = np.tile(rgba, (len(m.faces), 1))
    return m


def _side_masks(exterior, footprint):
    ys, xs = np.nonzero(footprint)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    h, w = exterior.shape
    yy, xx = np.mgrid[0:h, 0:w]
    side = np.stack([yy - y0, y1 - yy, x1 - xx, xx - x0]).argmin(0)   # N S E W
    return {name: (exterior & (side == i)).astype(np.uint8)
            for i, name in enumerate(["ext_north", "ext_south", "ext_east", "ext_west"])}


# ---- 4 + 5. build ----------------------------------------------------------------

def build(labels, plan_width_m, wall_height=2.8, door_height=2.1, sill_height=0.9,
          floor_thickness=0.1, ceiling=True, add_walls=None, erase=None, zone_map=None,
          max_opening_m=2.2, min_room_m2=1.0, simplify_px=1.5, snap_deg=6.0,
          rooms=None, plan_rgb=None, room_walls=True, partition_m=0.1):
    """labels: HxW (0 floor, 1 wall, 2 door, 3 window).  Returns (parts, id_parts, info).

    rooms: detect_rooms() output; its rooms become the zones (unless a zone_map is
    given) and, with room_walls, missed partitions are added from the ink in plan_rgb."""
    walls = (labels == 1).astype(np.uint8)
    if add_walls is not None:
        walls |= (add_walls > 0.5).astype(np.uint8)
    if erase is not None:
        walls &= (erase <= 0.5).astype(np.uint8)
    walls = _drop_specks(walls, 0.01, 16)
    ys, xs = np.nonzero(walls)
    if len(xs) == 0:
        raise ValueError("no walls found")
    ox, oy, ex, ey = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    mpp = plan_width_m / float(ex - ox)          # plan_width_m = outer face to outer face, west-east

    def crop(m):
        return None if m is None else m[oy:ey, ox:ex]

    windows = crop((labels == 3).astype(np.uint8)).copy()
    walls_c = crop(walls).copy()
    zones_in, names, n_part = crop(zone_map), None, 0
    if rooms is not None and rooms["rooms"]:
        off = np.array([ox, oy], np.float32)
        R, names = _rasterise_rooms([(p - off, n) for p, n in rooms["rooms"]], walls_c.shape, mpp, min_room_m2)
        for q in rooms["windows"]:                # helps tell window gaps from door gaps
            a, b = (tuple(int(v) for v in np.round(p - off)) for p in q)
            cv2.line(windows, a, b, 1, max(3, int(0.25 / mpp)))
        if room_walls and plan_rgb is not None:
            g = crop(plan_rgb)
            ink = ((g.mean(-1) < 0.8) & (g.max(-1) - g.min(-1) < 0.25)).astype(np.uint8)
            fp, _ = _footprint(_close_lines(walls_c, max_opening_m / mpp))
            part = _room_partitions(R, walls_c, ink, fp, [q - off for q in rooms["doors"]], mpp, partition_m)
            if erase is not None:
                part &= crop((erase <= 0.5).astype(np.uint8))
            n_part = int(cv2.connectedComponents(part, connectivity=8)[0] - 1)
            walls_c |= part
        if zone_map is None:
            zones_in = R

    L = plan_layers(walls_c, crop((labels == 2).astype(np.uint8)), windows,
                    mpp, max_opening_m, min_room_m2, zones_in)
    if names is not None and zone_map is None and L["zone_ids"] is not None:
        names = [names[i - 1] for i in L["zone_ids"]]
    else:
        names = None
    # Everything on the outer band is named by facade (ext_south, ext_south_door_lintels, ...)
    # so `ext_south*` in HIDE PARTS opens that whole side; the rest is interior.
    sides = _side_masks(L["shell"], L["footprint"])
    layers = {}                                   # name -> (mask, y0, y1, colour)
    for kind, m, y0, y1, col in (
            ("", L["walls"], 0.0, wall_height, PALETTE["wall"]),
            ("_door_lintels", L["door_gaps"], door_height, wall_height, PALETTE["lintel"]),
            ("_window_lintels", L["window_gaps"], door_height, wall_height, PALETTE["lintel"]),
            ("_window_sills", L["window_gaps"], 0.0, sill_height, PALETTE["sill"])):
        for side, sm in sides.items():
            layers[side + kind] = (m & sm, y0, y1, col)
        layers[("walls_interior" if not kind else kind[1:])] = (m & (1 - L["shell"]), y0, y1, col)
    for k in range(L["n_zones"]):
        layers["floor_z%d" % k] = ((L["territory"] == k + 1).astype(np.uint8),
                                   -floor_thickness, 0.0, PALETTE["floor"])
    if ceiling:
        layers["ceiling"] = (L["footprint"], wall_height, wall_height + floor_thickness, PALETTE["ceiling"])

    parts, id_parts = {}, {}
    terr = L["territory"]
    for name, (m, y0, y1, col) in layers.items():
        mesh = extrude(polygons(m, mpp, simplify_px, snap_deg), y0, y1, col)
        if mesh is None:
            continue
        parts[name] = mesh
        for k in range(L["n_zones"]):
            piece = extrude(polygons(m & (terr == k + 1), mpp, simplify_px, snap_deg),
                            y0, y1, zone_rgb(k))
            if piece is not None:
                id_parts["%s__z%d" % (name, k)] = piece

    H, W = L["footprint"].shape
    info = dict(mpp=mpp, size=(W * mpp, wall_height, H * mpp), layers=L,
                n_zones=L["n_zones"], zone_m2=L["zone_m2"], crop=(ox, oy, ex, ey),
                zone_names=names, partitions=n_part, rooms=rooms)
    return parts, id_parts, info


def zone_rgb(k):
    return ZONE_RGB[k] if k < len(ZONE_RGB) else OTHER_RGB


# ---- outputs -------------------------------------------------------------------------

def scene_of(items):
    scene = trimesh.Scene()
    for name, mesh in items.items():
        scene.add_geometry(mesh, geom_name=name, node_name=name)
    return scene


def export(items, path):
    scene_of(items).export(path, file_type="glb")
    return path


def overlay(info, plan_rgb=None):
    """What was understood: zones tinted, walls black, door gaps orange, window gaps blue."""
    L = info["layers"]
    terr = L["territory"]
    h, w = terr.shape
    if plan_rgb is not None:
        ox, oy, ex, ey = info["crop"]
        base = (plan_rgb[oy:ey, ox:ex] * 255).astype(np.float32)
        img = (base * 0.35 + 255 * 0.65)
    else:
        img = np.full((h, w, 3), 255.0, np.float32)
    for k in range(info["n_zones"]):
        c = np.array(zone_rgb(k), np.float32)
        sel = terr == k + 1
        img[sel] = img[sel] * 0.6 + c * 0.4
    img[L["door_gaps"] > 0] = (255, 140, 0)
    img[L["window_gaps"] > 0] = (0, 110, 255)
    img[L["walls"] > 0] = (0, 0, 0)
    img = img.clip(0, 255).astype(np.uint8)
    scale = max(0.5, min(h, w) / 900.0)
    for k in range(info["n_zones"]):
        sel = (L["zones"] == k + 1).astype(np.uint8)
        if sel.sum() == 0:
            continue
        dt = cv2.distanceTransform(sel, cv2.DIST_L2, 5)
        y, x = np.unravel_index(dt.argmax(), dt.shape)
        name = NAMES[k] if k < len(NAMES) else "other"
        if info.get("zone_names"):
            name = info["zone_names"][k]
        label = "z%d %s %.1f m2" % (k, name, info["zone_m2"][k])
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, scale, 2)
        cv2.putText(img, label, (int(x - tw / 2), int(y + th / 2)), cv2.FONT_HERSHEY_SIMPLEX,
                    scale, (0, 0, 0), max(1, int(2 * scale)), cv2.LINE_AA)
    return img


def cameras(info, fov=35.0):
    """Look-at cameras framing the model (LOAD3D_CAMERA dicts)."""
    sx, sy, sz = info["size"]
    c = np.array([sx / 2, sy * 0.35, sz / 2])
    radius = 0.5 * math.sqrt(sx * sx + sy * sy + sz * sz)
    dist = radius / math.tan(math.radians(fov) / 2) * 0.8   # bounding sphere is loose for a flat plan

    def orbit(yaw, pitch):
        y, p = math.radians(yaw), math.radians(pitch)
        return c + dist * np.array([math.sin(y) * math.cos(p), math.sin(p), math.cos(y) * math.cos(p)]), c

    views = {                                     # yaw 0 = camera due south looking north; +90 = east
        "iso_se": orbit(45, 35), "iso_sw": orbit(-45, 35),
        "iso_ne": orbit(135, 35), "iso_nw": orbit(-135, 35),
        "top": orbit(0, 88),
        "eye_level": (np.array([sx * 0.12, 1.6, sz * 0.5]), np.array([sx * 0.9, 1.2, sz * 0.5])),
    }
    xyz = lambda v: {"x": float(v[0]), "y": float(v[1]), "z": float(v[2])}
    return {n: {"position": xyz(e), "target": xyz(t), "fov": float(fov),
                "cameraType": "perspective", "zoom": 1.0} for n, (e, t) in views.items()}


def report(info, parts, id_parts):
    sx, sy, sz = info["size"]
    tris = sum(len(m.faces) for m in parts.values())
    lines = ["scale      %.4f m / px  (%.1f px / m)" % (info["mpp"], 1 / info["mpp"]),
             "footprint  %.2f m (X, east) x %.2f m (Z, south), walls %.2f m" % (sx, sz, sy),
             "centre     x %.2f  y %.2f  z %.2f   (target for Create Camera Info)" % (sx / 2, sy / 2, sz / 2),
             "zones      %d%s" % (info["n_zones"], "  (rooms from Raster2Seq)" if info.get("zone_names") else "")]
    if info.get("rooms") is not None:
        lines.insert(3, "rooms      %d read, %d added partition(s), %d door / %d window lines"
                     % (len(info["rooms"]["rooms"]), info.get("partitions", 0),
                        len(info["rooms"]["doors"]), len(info["rooms"]["windows"])))
    for k, a in enumerate(info["zone_m2"]):
        name = NAMES[k] if k < len(NAMES) else "white (no mask)"
        room = info["zone_names"][k] if info.get("zone_names") else ""
        lines.append("  z%-2d %-8s %7.1f m2  %s" % (k, name, a, room))
    lines.append("parts      %d  (+ %d zone pieces), %d triangles" % (len(parts), len(id_parts), tris))
    lines += ["  %-16s %5d tris" % (n, len(m.faces)) for n, m in parts.items()]
    return "\n".join(lines)


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="floor plan image -> GLB + ID twin")
    ap.add_argument("plan")
    ap.add_argument("--width", type=float, required=True, help="outer width of the walls, west-east, metres")
    ap.add_argument("--height", type=float, default=2.8)
    ap.add_argument("--model", default=r"D:\AI\ComfyUI\models\floorplan\floorplan-to-3d-walls.safetensors")
    ap.add_argument("--cv", action="store_true", help="model-free wall detection")
    ap.add_argument("--zones", help="painted zone map, same size as the plan")
    ap.add_argument("--add-walls", help="mask image: white = extra wall")
    ap.add_argument("--rooms", help="Raster2Seq checkpoint (models/floorplan/raster2seq/cubicasa5k.pth)")
    ap.add_argument("--no-room-walls", action="store_true", help="rooms as zones only, no added partitions")
    ap.add_argument("--out", default=".")
    a = ap.parse_args()
    rgb = cv2.imread(a.plan)[:, :, ::-1].astype(np.float32) / 255.0
    if a.cv:
        labels = detect_walls_cv(rgb)
    else:
        labels = segment(rgb, load_seg_model(a.model))
    zm = cv2.imread(a.zones)[:, :, ::-1].astype(np.float32) / 255.0 if a.zones else None
    aw = cv2.imread(a.add_walls, cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255.0 if a.add_walls else None
    rooms = detect_rooms(rgb, labels, a.rooms) if a.rooms else None
    parts, id_parts, info = build(labels, a.width, a.height, add_walls=aw, zone_map=zm, rooms=rooms,
                                  plan_rgb=rgb, room_walls=not a.no_room_walls)
    stem = os.path.splitext(os.path.basename(a.plan))[0]
    export(parts, os.path.join(a.out, stem + "_3d.glb"))
    export(id_parts, os.path.join(a.out, stem + "_3d_ids.glb"))
    cv2.imwrite(os.path.join(a.out, stem + "_3d_understood.png"), overlay(info, rgb)[:, :, ::-1])
    print(report(info, parts, id_parts))
