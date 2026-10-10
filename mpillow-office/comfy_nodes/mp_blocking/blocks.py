"""Blocks: the movable furniture / fixture layer of a massing model.

Pure Python (numpy + trimesh), no ComfyUI imports, so the custom nodes in
this folder and tools/build_massing.py share one implementation.

A layout is plain text, one block per line, in the GLB frame (X east, Y up,
Z south, metres -- the frame every viewer and Render Mesh use):

    # name   centre x / z, footprint w (along X) x d (along Z), height h
    sofa_1   x=2.10 z=5.40 w=2.20 d=0.90 h=0.80 rot=0          | boucle three-seat sofa, oak legs
    shelf_1  x=6.00 z=0.45 w=3.00 d=0.40 h=2.20 y=0 rot=0      | pale ash open shelving
    bed_1    x=4.50 z=4.00 w=1.60 d=2.10 h=0.45 asset=../model/assets/midview-08-83/bed_1.glb

  x z      centre of the footprint
  w d h    size along X, along Z and up, before rotation
  y        base height (default 0, on the floor; a wall cabinet sits higher)
  rot      degrees about the vertical, counter-clockwise seen from above
  asset    a mesh that replaces the box, fitted into it (MeshIntoBlock writes these)
  arot     extra turn of the asset inside its box, degrees (its front may face
           any way when it comes out of an image-to-3D model)
  shape    the silhouette drawn inside the box: sofa, chair, bed, table, bench,
           shelf, cabinet, rug, plant or box. Default: the first of those words
           in the block's name (waiting_sofa -> sofa), else box. A piece's
           front faces -Z (north) at rot=0; its back is on the +Z side.
  | text   the block's prompt: what the renders should draw in its place

`#` starts a comment. Unknown keys are an error, so a typo never moves a
block silently.
"""

import math
import os
import re

import numpy as np

KEYS = ("x", "z", "w", "d", "h", "y", "rot", "arot")
SHAPES = ("sofa", "chair", "bed", "table", "bench", "shelf", "cabinet", "rug", "plant", "box")
SHAPE_WORDS = {"sofa": "sofa", "couch": "sofa", "armchair": "sofa", "chair": "chair", "stool": "chair",
               "bed": "bed", "table": "table", "desk": "table", "workbench": "table", "bench": "bench",
               "shelf": "shelf", "shelving": "shelf", "rack": "shelf", "bookcase": "shelf",
               "cabinet": "cabinet", "counter": "cabinet", "store": "cabinet", "wardrobe": "cabinet",
               "sideboard": "cabinet", "rug": "rug", "mat": "rug", "plant": "plant"}
REQUIRED = ("x", "z", "w", "d", "h")
_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_\-]*$")


class LayoutError(ValueError):
    pass


class Block:
    __slots__ = ("name", "x", "z", "w", "d", "h", "y", "rot", "arot", "asset", "prompt", "shape", "color")

    def __init__(self, name, x, z, w, d, h, y=0.0, rot=0.0, arot=0.0, asset=None, prompt="", shape=None):
        self.name, self.x, self.z, self.w, self.d, self.h = name, x, z, w, d, h
        self.y, self.rot, self.arot, self.asset, self.prompt = y, rot, arot, asset, prompt
        self.shape = shape           # None = from the name
        self.color = None            # its block-ID colour, once a layout assigns one

    def kind(self):
        """The silhouette this block is drawn with."""
        if self.shape:
            return self.shape
        for tok in re.split(r"[_\-\d]+", self.name.lower()):
            if tok in SHAPE_WORDS:
                return SHAPE_WORDS[tok]
        return "box"

    def as_dict(self):
        return {k: getattr(self, k) for k in self.__slots__}

    def corners(self):
        """Footprint corners [(x, z)] x 4, counter-clockwise seen from above."""
        c, s = math.cos(math.radians(self.rot)), math.sin(math.radians(self.rot))
        out = []
        for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            lx, lz = u * self.w / 2, v * self.d / 2
            # counter-clockwise from above (+Y up, Z south): a turn about +Y
            out.append((self.x + c * lx + s * lz, self.z - s * lx + c * lz))
        return out

    def __repr__(self):
        return "Block(%s)" % format_line(self)


# ---------------------------------------------------------------- text -----

def parse(text):
    """Layout text -> [Block]. Raises LayoutError naming the line."""
    blocks, seen = [], set()
    for no, raw in enumerate((text or "").splitlines(), 1):
        body, _, prompt = raw.partition("|")
        body = body.split("#", 1)[0].strip()
        prompt = prompt.strip()
        if not body:
            continue
        toks = body.split()
        name = toks[0]
        if not _NAME.match(name) or "=" in name:
            raise LayoutError("line %d: a block starts with its name (letters, digits, _ -), got %r" % (no, name))
        if name in seen:
            raise LayoutError("line %d: duplicate block name %r" % (no, name))
        vals, asset, shape = {}, None, None
        for tok in toks[1:]:
            k, eq, v = tok.partition("=")
            if not eq:
                raise LayoutError("line %d (%s): expected key=value, got %r" % (no, name, tok))
            k = k.lower()
            if k == "asset":
                asset = v
                continue
            if k == "shape":
                if v.lower() not in SHAPES:
                    raise LayoutError("line %d (%s): shape %r is not one of %s" % (no, name, v, ", ".join(SHAPES)))
                shape = v.lower()
                continue
            if k not in KEYS:
                raise LayoutError("line %d (%s): unknown key %r (keys: %s, shape, asset)"
                                  % (no, name, k, " ".join(KEYS)))
            try:
                vals[k] = float(v)
            except ValueError:
                raise LayoutError("line %d (%s): %s=%r is not a number" % (no, name, k, v))
        missing = [k for k in REQUIRED if k not in vals]
        if missing:
            raise LayoutError("line %d (%s): missing %s" % (no, name, ", ".join(missing)))
        for k in ("w", "d", "h"):
            if vals[k] <= 0:
                raise LayoutError("line %d (%s): %s must be > 0" % (no, name, k))
        seen.add(name)
        blocks.append(Block(name, vals["x"], vals["z"], vals["w"], vals["d"], vals["h"],
                            vals.get("y", 0.0), vals.get("rot", 0.0), vals.get("arot", 0.0), asset, prompt,
                            shape))
    return blocks


def _num(v):
    s = "%.2f" % v
    return "0.00" if s == "-0.00" else s


def format_line(b, name_w=10):
    parts = ["%-*s" % (name_w, b.name),
             "x=%s z=%s w=%s d=%s h=%s" % (_num(b.x), _num(b.z), _num(b.w), _num(b.d), _num(b.h))]
    if abs(b.y) > 1e-9:
        parts.append("y=%s" % _num(b.y))
    parts.append("rot=%s" % ("%g" % round(b.rot, 1)))
    if abs(b.arot) > 1e-9:
        parts.append("arot=%g" % round(b.arot, 1))
    if b.shape:
        parts.append("shape=%s" % b.shape)
    if b.asset:
        parts.append("asset=%s" % b.asset)
    line = " ".join(parts)
    return "%-58s | %s" % (line, b.prompt) if b.prompt else line


def format_layout(blocks):
    w = max([len(b.name) for b in blocks] + [8]) + 1
    return "\n".join(format_line(b, w) for b in blocks)


# ------------------------------------------------------------- colours -----

def id_colors(n):
    """n distinct flat sRGB colours for the block-ID pass, never black (black =
    no block). Channel levels {0, 128, 255} give 26 colours; beyond that four
    levels give 63. Order is fixed, so block k keeps its colour as long as the
    lines above it do not change."""
    levels = (0, 128, 255) if n <= 26 else (0, 85, 170, 255)
    cols = [(r, g, b) for r in levels for g in levels for b in levels if (r, g, b) != (0, 0, 0)]
    # interleave so neighbours in the list differ strongly
    cols.sort(key=lambda c: (sum(1 for v in c if v == 0), c), reverse=True)
    if n > len(cols):
        raise LayoutError("%d blocks: the block-ID pass holds at most %d" % (n, len(cols)))
    return cols[:n]


def to_linear(rgb):
    """sRGB 0-255 -> the value to store in a glTF COLOR_0 so that Render Mesh,
    which treats vertex colours as linear and re-encodes them (pow 1/2.2),
    gives the sRGB value back exactly."""
    return tuple(int(round(255.0 * (c / 255.0) ** 2.2)) for c in rgb)


def classify(img, colors, max_dist=40.0):
    """Per-pixel block index (-1 = none) by nearest colour in `colors` (sRGB
    0-255), from an HxWx3 image in 0-255 or 0-1."""
    a = np.asarray(img, np.float32)[..., :3]
    if a.max() <= 1.0 + 1e-6:
        a = a * 255.0
    if not colors:
        return np.full(a.shape[:2], -1, np.int32)
    c = np.asarray(colors, np.float32)
    d = np.linalg.norm(a[:, :, None, :] - c[None, None, :, :], axis=-1)
    idx = d.argmin(-1).astype(np.int32)
    return np.where(d.min(-1) <= max_dist, idx, -1)


# --------------------------------------------------------------- meshes ----

def _paint(m, rgb):
    m.visual.face_colors = np.tile(np.array(list(rgb) + [255], np.uint8), (len(m.faces), 1))
    return m


def _place(m, b):
    """Turn a mesh centred on the footprint origin by b.rot and move it to b."""
    import trimesh
    m.apply_transform(trimesh.transformations.rotation_matrix(math.radians(b.rot), (0, 1, 0)))
    m.apply_translation((b.x, 0.0, b.z))
    return m


def _part(x0, x1, y0, y1, z0, z1):
    import trimesh
    m = trimesh.creation.box(extents=(max(x1 - x0, 1e-3), max(y1 - y0, 1e-3), max(z1 - z0, 1e-3)))
    m.apply_translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    return m


def silhouette(kind, w, d, h):
    """A furniture silhouette made of boxes, inside w x h x d (centred on the
    footprint, standing on y = 0, front towards -Z). Every shape reaches all
    six faces of the box, so a block reads back at its own size."""
    X, Z = w / 2, d / 2
    if kind == "sofa":
        arm = min(0.22, 0.12 * w)
        back = min(0.25, 0.3 * d)
        seat = 0.5 * h
        return [_part(-X, X, 0, seat * 0.75, -Z, Z),                 # base
                _part(-X + arm, X - arm, seat * 0.75, seat, -Z, Z - back),   # cushions
                _part(-X, X, 0, h, Z - back, Z),                     # back
                _part(-X, -X + arm, 0, 0.72 * h, -Z, Z),             # arms
                _part(X - arm, X, 0, 0.72 * h, -Z, Z)]
    if kind == "chair":
        leg, seat, t = 0.05, 0.55 * h, 0.06
        out = [_part(-X, X, seat - t, seat, -Z, Z), _part(-X, X, seat, h, Z - t, Z)]
        for sx in (-X, X - leg):
            for sz in (-Z, Z - leg):
                out.append(_part(sx, sx + leg, 0, seat - t, sz, sz + leg))
        return out
    if kind == "bed":
        base, mat = 0.5 * h, 0.035
        pil_h, pil_d = min(0.12, 0.25 * h), min(0.45, 0.22 * d)
        return [_part(-X, X, 0, base, -Z, Z),                         # frame
                _part(-X + mat, X - mat, base, h - pil_h, -Z + mat, Z - mat),   # mattress
                _part(-X + 0.08, -0.02, h - pil_h, h, Z - pil_d - 0.05, Z - 0.05),   # pillows
                _part(0.02, X - 0.08, h - pil_h, h, Z - pil_d - 0.05, Z - 0.05),
                _part(-X, X, base, h, Z - 0.05, Z)]                      # low headboard
    if kind == "table":
        leg, top = 0.06, min(0.05, 0.1 * h)
        out = [_part(-X, X, h - top, h, -Z, Z)]
        for sx in (-X + 0.03, X - leg - 0.03):
            for sz in (-Z + 0.03, Z - leg - 0.03):
                out.append(_part(sx, sx + leg, 0, h - top, sz, sz + leg))
        return out
    if kind == "bench":
        top = min(0.08, 0.2 * h)
        return [_part(-X, X, h - top, h, -Z, Z), _part(-X, -X + 0.06, 0, h - top, -Z, Z),
                _part(X - 0.06, X, 0, h - top, -Z, Z)]
    if kind == "shelf":
        t = 0.025
        bays = max(1, int(round(w / 0.9)))
        out = []
        for i in range(bays + 1):
            xi = -X + i * w / bays
            out.append(_part(max(-X, min(xi - t / 2, X - t)), min(X, max(xi + t / 2, -X + t)), 0, h, -Z, Z))
        n = max(2, int(round(h / 0.4)))
        out += [_part(-X, X, j * (h - t) / n, j * (h - t) / n + t, -Z, Z) for j in range(n + 1)]
        out.append(_part(-X, X, 0, h, Z - 0.012, Z))                 # back panel
        return out
    if kind == "cabinet":
        plinth = min(0.08, 0.15 * h)
        return [_part(-X, X, plinth, h, -Z, Z), _part(-X + 0.04, X - 0.04, 0, plinth, -Z + 0.05, Z)]
    if kind == "plant":
        pot = 0.35 * h
        return [_part(-0.3 * X, 0.3 * X, 0, pot, -0.3 * Z, 0.3 * Z), _part(-X, X, pot, h, -Z, Z)]
    return [_part(-X, X, 0, h, -Z, Z)]                                # box, rug


def box_mesh(b):
    """The block's own geometry: its silhouette (see `shape`), placed."""
    import trimesh
    m = trimesh.util.concatenate(silhouette(b.kind(), b.w, b.d, b.h))
    m.apply_translation((0.0, b.y, 0.0))
    return _place(m, b)


def load_asset(path):
    import trimesh
    s = trimesh.load(path, force="scene", process=False)
    meshes = [g for g in s.dump() if hasattr(g, "faces") and len(g.faces)] if hasattr(s, "dump") else [s]
    if not meshes:
        raise LayoutError("asset has no geometry: %s" % path)
    return trimesh.util.concatenate(meshes)


def fit_asset(mesh, b):
    """Scale (uniformly) and move `mesh` so it fits block b: centred on the
    footprint, standing on b.y, as large as fits w x d x h after b.arot."""
    import trimesh
    m = mesh.copy()
    if abs(b.arot) > 1e-9:
        m.apply_transform(trimesh.transformations.rotation_matrix(math.radians(b.arot), (0, 1, 0)))
    lo, hi = m.bounds
    ext = np.maximum(hi - lo, 1e-9)
    k = min(b.w / ext[0], b.h / ext[1], b.d / ext[2])
    m.apply_translation(-np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2]))
    m.apply_scale(k)
    m.apply_translation((0.0, b.y, 0.0))
    return _place(m, b)


def asset_path(b, base_dir=None):
    if not b.asset:
        return None
    return b.asset if os.path.isabs(b.asset) or base_dir is None else os.path.normpath(os.path.join(base_dir, b.asset))


def resolve_asset(b, plans_dir, asset_dir):
    """The asset file a block uses, or None for the box: asset=none -> the box;
    asset=<path> (relative to the plans folder) -> that file; no asset key ->
    <asset_dir>/<block>.glb when Mesh Into Block has written one."""
    if b.asset and b.asset.lower() == "none":
        return None
    if b.asset:
        return asset_path(b, plans_dir)
    p = os.path.join(asset_dir, b.name + ".glb")
    return p if os.path.exists(p) else None


def block_mesh(b, plans_dir, asset_dir):
    """The mesh for one block: its asset fitted into the box when there is one,
    else the box. Returns (mesh, asset file or None)."""
    path = resolve_asset(b, plans_dir, asset_dir)
    if path and os.path.exists(path):
        return fit_asset(load_asset(path), b), path
    return box_mesh(b), None


# --------------------------------------------------- camera (Render Mesh) --

def camera_from_info(camera_info, bounds_center=None):
    """eye, forward, right, up, vertical fov (rad) -- exactly as ComfyUI's
    RenderMesh builds them from a Load3D / Preview3D / Create Camera Info
    camera (comfy_extras/nodes_mesh_postprocess.py)."""
    def vec(d):
        d = d or {}
        return np.array([float(d.get("x", 0.0)), float(d.get("y", 0.0)), float(d.get("z", 0.0))])
    eye = vec(camera_info.get("position"))
    tgt = camera_info.get("target")
    target = vec(tgt) if tgt else np.asarray(bounds_center, float)
    f = target - eye
    f = f / max(np.linalg.norm(f), 1e-6)
    up = np.array([0.0, 1.0, 0.0])
    if abs(f @ up) >= 0.99:
        up = np.array([0.0, 0.0, 1.0])
    r = np.cross(f, up)
    r = r / max(np.linalg.norm(r), 1e-6)
    u = np.cross(r, f)
    fov = float(camera_info.get("fov", 0) or 0) or 40.0
    zoom = float(camera_info.get("zoom", 1.0) or 1.0)
    fov_rad = 2.0 * math.atan(math.tan(math.radians(fov) * 0.5) / max(zoom, 1e-3))
    return eye, f, r, u, fov_rad


def pixel_dirs(cam, W, H):
    """Unit ray directions (H, W, 3) for every pixel centre, as RenderMesh."""
    eye, f, r, u, fov = cam
    ys = 1.0 - (np.arange(H) + 0.5) / H * 2.0
    xs = (np.arange(W) + 0.5) / W * 2.0 - 1.0
    gy, gx = np.meshgrid(ys, xs, indexing="ij")
    tn = math.tan(0.5 * fov)
    d = r * (gx * tn * W / H)[..., None] + u * (gy * tn)[..., None] + f
    return d / np.linalg.norm(d, axis=-1, keepdims=True)


def apply_model_transform(verts, transform):
    """A viewer's model transform (scale, quaternion, position), as RenderMesh."""
    if not transform:
        return verts
    s = np.array([transform["scale"][k] for k in "xyz"], float)
    p = np.array([transform["position"][k] for k in "xyz"], float)
    q = transform["quaternion"]
    x, y, z, w = (float(q[k]) for k in "xyzw")
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    return (verts * s) @ R.T + p


def render_depth(verts, faces, cam, W, H, colors=None):
    """Perspective z-buffer of a triangle mesh. Returns (t, idx): t = metric
    distance along each pixel's ray (inf = no hit), idx = face index (-1).
    Faces crossing the near plane are dropped (cameras sit outside or well
    inside a room, so this only loses geometry right at the lens)."""
    eye, f, r, u, fov = cam
    tn = math.tan(0.5 * fov)
    rel = verts - eye
    cz = rel @ f
    cx = rel @ r
    cy = rel @ u
    near = 0.05
    sx = (cx / np.maximum(cz, 1e-9) / (tn * W / H) + 1.0) * 0.5 * W
    sy = (1.0 - cy / np.maximum(cz, 1e-9) / tn) * 0.5 * H
    zbuf = np.full((H, W), np.inf)
    fid = np.full((H, W), -1, np.int64)
    fz = cz[faces]
    ok = (fz > near).all(axis=1)
    order = np.argsort(-fz.mean(axis=1))
    for fi in order:
        if not ok[fi]:
            continue
        a, b, c = faces[fi]
        ax, bx, cx_ = sx[a], sx[b], sx[c]
        ay, by, cy_ = sy[a], sy[b], sy[c]
        x0 = max(int(math.floor(min(ax, bx, cx_))), 0)
        x1 = min(int(math.ceil(max(ax, bx, cx_))) + 1, W)
        y0 = max(int(math.floor(min(ay, by, cy_))), 0)
        y1 = min(int(math.ceil(max(ay, by, cy_))) + 1, H)
        if x0 >= x1 or y0 >= y1:
            continue
        den = (by - cy_) * (ax - cx_) + (cx_ - bx) * (ay - cy_)
        if abs(den) < 1e-12:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        w0 = ((by - cy_) * (gx - cx_) + (cx_ - bx) * (gy - cy_)) / den
        w1 = ((cy_ - ay) * (gx - cx_) + (ax - cx_) * (gy - cy_)) / den
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -1e-9) & (w1 >= -1e-9) & (w2 >= -1e-9)
        if not inside.any():
            continue
        # perspective-correct depth: interpolate 1/z in screen space
        iz = w0 / fz[fi, 0] + w1 / fz[fi, 1] + w2 / fz[fi, 2]
        z = 1.0 / np.maximum(iz, 1e-12)
        sub = zbuf[y0:y1, x0:x1]
        hit = inside & (z < sub)
        if hit.any():
            sub[hit] = z[hit]
            fid[y0:y1, x0:x1][hit] = fi
    dirs = pixel_dirs(cam, W, H)
    t = zbuf / np.maximum(dirs @ f, 1e-9)       # optical-axis depth -> ray distance
    return t, fid


# ------------------------------------------------------- render -> blocks --

def _cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]


def _hull(pts):
    """Convex hull of 2-D points (monotone chain), counter-clockwise."""
    p = np.unique(np.round(pts, 3), axis=0)          # millimetres: plenty, and far fewer points
    if len(p) < 3:
        return p
    p = p[np.lexsort((p[:, 1], p[:, 0]))]

    def half(seq):
        h = []
        for q in seq:
            while len(h) >= 2 and _cross2(h[-1] - h[-2], q - h[-2]) <= 0:
                h.pop()
            h.append(q)
        return h
    lower, upper = half(p), half(p[::-1])
    return np.array(lower[:-1] + upper[:-1])


def min_area_rect(pts):
    """Smallest rectangle round 2-D points (x, z) -> (cx, cz, w, d, rot_deg).
    rot follows the layout convention; w >= d is not enforced, rot is folded
    into (-45, 45] so an unrotated block stays rot=0."""
    h = _hull(np.asarray(pts, float))
    if len(h) < 3:
        lo, hi = np.asarray(pts).min(0), np.asarray(pts).max(0)
        return (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, max(hi[0] - lo[0], 0.05), max(hi[1] - lo[1], 0.05), 0.0
    best = None
    edges = np.roll(h, -1, axis=0) - h
    for e in edges:
        ang = math.atan2(e[1], e[0])
        c, s = math.cos(ang), math.sin(ang)
        R = np.array([[c, s], [-s, c]])           # rotate points by -ang
        q = h @ R.T
        lo, hi = q.min(0), q.max(0)
        area = (hi[0] - lo[0]) * (hi[1] - lo[1])
        if best is None or area < best[0] - 1e-12:
            best = (area, ang, lo, hi)
    _, ang, lo, hi = best
    c, s = math.cos(ang), math.sin(ang)
    mid = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2])
    cx, cz = c * mid[0] - s * mid[1], s * mid[0] + c * mid[1]
    w, d = hi[0] - lo[0], hi[1] - lo[1]
    # the rectangle's first axis points along `ang` in (x, z); the layout's
    # rot turns +X counter-clockwise from above, i.e. towards -Z: rot = -ang
    rot = -math.degrees(ang)
    while rot > 45:
        rot -= 90
        w, d = d, w
    while rot <= -45:
        rot += 90
        w, d = d, w
    return cx, cz, w, d, rot


def fit_depth(est, ref, valid):
    """Least-squares scale + shift so a * est + b ~ ref on `valid` pixels, with
    one round of outlier trimming (furniture the masks missed, sky, glass)."""
    e, r = est[valid], ref[valid]
    if len(e) < 50:
        raise LayoutError("too few background pixels to align the depth (%d)" % len(e))
    A = np.stack([e, np.ones_like(e)], 1)
    sol = np.linalg.lstsq(A, r, rcond=None)[0]
    res = np.abs(A @ sol - r)
    keep = res <= np.quantile(res, 0.8)
    sol = np.linalg.lstsq(A[keep], r[keep], rcond=None)[0]
    return float(sol[0]), float(sol[1])


def points_from_mask(mask, depth_est, room_t, cam, valid_bg=None, inverse=False):
    """World points of one mask. depth_est is the monocular depth of the render
    (optical-axis z, any scale and offset -- MoGe); room_t the metric ray
    distance of the known model from the same camera (render_depth). The
    estimate is aligned to the model on the background, then the mask is
    back-projected through the exact camera."""
    H, W = mask.shape
    dirs = pixel_dirs(cam, W, H)
    eye, f = cam[0], cam[1]
    cosf = dirs @ f
    room_z = room_t * cosf
    est = np.asarray(depth_est, float)
    if inverse:
        est = 1.0 / np.maximum(est, 1e-6)
    bg = np.isfinite(room_z) & np.isfinite(est) & (est > 0)
    if valid_bg is not None:
        bg &= valid_bg
    a, b = fit_depth(est, room_z, bg)
    z = a * est + b
    m = mask & np.isfinite(z) & (z > 0)
    pts = eye + dirs[m] * (z[m] / cosf[m])[:, None]
    return pts


def block_from_points(pts, name, prompt="", floor_snap=0.25, room_lo=None, room_hi=None):
    """A Block round world points: robust (trimmed) extents, footprint as the
    smallest rectangle, base snapped to the floor when it is close."""
    p = np.asarray(pts, float)
    if room_lo is not None:
        inside = np.all((p >= np.asarray(room_lo) - 0.05) & (p <= np.asarray(room_hi) + 0.05), axis=1)
        p = p[inside]
    if len(p) < 30:
        return None
    # trim stray points only: thin parts at the ends (a sofa's arms) are few
    # points but real, so the cut is 0.2 %, not a percent
    y_lo, y_hi = np.quantile(p[:, 1], [0.002, 0.998])
    cen = np.median(p[:, [0, 2]], axis=0)
    rad = np.linalg.norm(p[:, [0, 2]] - cen, axis=1)
    p2 = p[rad <= np.quantile(rad, 0.998)]
    cx, cz, w, d, rot = min_area_rect(p2[:, [0, 2]])
    y0 = 0.0 if y_lo < floor_snap else float(y_lo)
    h = max(float(y_hi) - y0, 0.05)
    return Block(name, float(cx), float(cz), max(w, 0.05), max(d, 0.05), h, y0, round(rot, 1), 0.0, None, prompt)


def footprint_iou(a, b, n=48, over="union"):
    """Overlap of two blocks' footprints / their union (or / the smaller one,
    over="min"), by sampling."""
    from_pts = lambda blk: np.array(blk.corners())
    pa, pb = from_pts(a), from_pts(b)
    lo = np.minimum(pa.min(0), pb.min(0))
    hi = np.maximum(pa.max(0), pb.max(0))
    gx, gz = np.meshgrid(np.linspace(lo[0], hi[0], n), np.linspace(lo[1], hi[1], n))
    q = np.stack([gx.ravel(), gz.ravel()], 1)

    def inside(poly):
        ok = np.ones(len(q), bool)
        for i in range(4):
            p0, p1 = poly[i], poly[(i + 1) % 4]
            e = p1 - p0
            ok &= (e[0] * (q[:, 1] - p0[1]) - e[1] * (q[:, 0] - p0[0])) >= -1e-9
        return ok
    ia, ib = inside(pa), inside(pb)
    den = (ia | ib).sum() if over == "union" else min(ia.sum(), ib.sum())
    return float((ia & ib).sum()) / float(max(den, 1))


def overlap_3d(a, b):
    """How much of the smaller of two finds lies inside the other: footprint
    overlap over the smaller footprint, times height overlap over the shorter
    one. A camera that sees only a sofa's arm still joins the sofa; a rug
    under it shares a footprint but not a height."""
    lo, hi = max(a.y, b.y), min(a.y + a.h, b.y + b.h)
    vert = max(0.0, hi - lo) / max(min(a.h, b.h), 1e-6)
    return footprint_iou(a, b, over="min") * vert


def merge_views(cands, iou=0.5):
    """[(label, score, points)] from several cameras -> [(label, points)], one
    per object. Finds that overlap in 3-D are one object whatever they were
    called (a detector names one box sofa, bench and table); the best-scored
    label wins."""
    groups = []
    for label, score, pts in sorted(cands, key=lambda c: -c[1]):
        b = block_from_points(pts, "tmp")
        if b is None:
            continue
        for g in groups:
            if overlap_3d(g[2], b) >= iou:
                g[1].append(pts)
                g[2] = block_from_points(np.concatenate(g[1]), "tmp")
                break
        else:
            groups.append([label, [pts], b])
    return [(g[0], np.concatenate(g[1])) for g in groups]


def suppress(finds, iou=0.5):
    """Cross-class non-maximum suppression in one view: [(label, score, mask)]
    -> the best-scored find per object (mask IoU, or one mask mostly inside
    a better one)."""
    kept = []
    for label, score, m in sorted(finds, key=lambda f: -f[1]):
        area = m.sum()
        dup = False
        for _, _, k in kept:
            inter = (m & k).sum()
            if inter / max((m | k).sum(), 1) >= iou or inter / max(min(area, k.sum()), 1) >= 0.8:
                dup = True
                break
        if not dup:
            kept.append((label, score, m))
    return kept


def unique_name(label, taken):
    base = re.sub(r"[^A-Za-z0-9]+", "_", label.strip().lower()).strip("_") or "block"
    if not base[0].isalpha():
        base = "b_" + base
    k = 1
    while "%s_%d" % (base, k) in taken:
        k += 1
    name = "%s_%d" % (base, k)
    taken.add(name)
    return name
