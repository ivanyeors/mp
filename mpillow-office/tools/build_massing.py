"""
Build a dimensioned massing model from a plan spec.

This is the "floor plan -> 3D" step. No image-to-3D model can do it (they all
reconstruct single objects, not rooms), so the geometry is computed: every
number lives in a spec, plans/<name>.yaml, read off the drawing and the brief,
and this script only turns the spec into meshes. The showroom is
plans/showroom.yaml; a new plan is a new spec, checked against its drawing by
tools/plan_check.py before it is built.

    python tools/build_massing.py                       # plans/showroom.yaml
    python tools/build_massing.py plans/<name>.yaml

Writes, into the spec's `output.dir` (model/), and copies into
ComfyUI/input/3d/ so the Load3D nodes in the workflows can open them:

  <base>.glb           the model, as drawn (+ <base>.obj)
  <base>_cut.glb       the `cutaway` parts removed (as the iso cameras see it)
  <base>_ids.glb       every part cut along the zone regions and painted with
                       its zone colour (the ID model: ComfyUI's RenderMesh bakes
                       an ID pass from it for any camera)
  <base>_cut_ids.glb   the ID model, cutaway
  <base>_viewer.json   every part's mesh with its item, role, colour, zone and
                       cutaway flag, for the Admin Panel's 3D viewer
                       (app/[lang]/settings/showroom)

Spec format
-----------
Axes while authoring: X = east, Y = up, Z = the plan's other axis, metres.
With `mirror_z: <width>` Z is measured from the south wall (north up, as
drawn) and mirrored on export (z' = width - z); without it Z already points
south (image down). Either way the GLB is right-handed with X east and Z
south, which is what every Y-up viewer (ComfyUI Load3D, three.js) expects.

  name, vars, palette, mirror_z, output: {dir, base}, cutaway: [names]
  zones:        [{slug, label}]  -- index n is colour ZONE_RGB[n], suffix __z<n>
  zone_regions: [{zone, x: [x0, x1], z: [z0, z1]}]  disjoint plan boxes that
                tile the plan; null = open. Order is the order pieces are cut.
  items: one part each (or several, with `for`):
    box      {name, x: [x0, x1], z: [z0, z1], y: [y0, y1], color}
    segment  {type: segment, name, p0: [x, z], p1: [x, z], y, t, color}
               a bar of thickness t between two plan points
    prism    {type: prism, name, poly: [[x, z], ...], y, color}
               any plan outline, extruded (L-shaped columns, odd floors)
    wall     {type: wall, name, p0, p1, t, y, color, side: center|left|right,
              openings: [{at, w, kind: door|window|opening, head, sill, glass}]}
               `at` = distance from p0 to the opening's near edge. Pieces are
               <name>_<k>; a head above an opening <name>_head<k>, a window
               sill <name>_sill<k>, its pane <name>_glass<k>.
    group    {type: group, items: [...]}
  every item may carry  for: {var: iterable, ...}  (nested, outer first),
  let: {var: expr}, if: expr; `name` is a str.format template over them.
  check: wall | furniture | overhead | none  overrides how plan_check treats
  the part (default: wall if it stands on the floor, is >= 2 m tall and not a
  thin post; wall pieces are walls, heads overhead, sills and panes furniture).
  A plan is a cut at about 1 m: overhead and none parts are not drawn on it.
"""

import argparse
import fnmatch
import json
import math
import os
import shutil
import sys

import numpy as np
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spec as S  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(HERE), "comfy_nodes", "mp_blocking"))
import blocks as BL  # noqa: E402

COMFY_3D = r"D:\AI\ComfyUI\input\3d"
DEFAULT_SPEC = os.path.join(os.path.dirname(HERE), "plans", "showroom.yaml")

ZONE_RGB = [(255, 0, 0), (0, 255, 0), (0, 0, 255),
            (255, 255, 0), (255, 0, 255), (0, 255, 255)]


def _paint(m, color):
    rgba = np.array(list(color) + [255], np.uint8)
    m.visual.face_colors = np.tile(rgba, (len(m.faces), 1))
    return m


def box(x0, z0, x1, z1, y0, y1, name="?"):
    """Axis-aligned box from a plan footprint plus a height range."""
    ex, ey, ez = abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)
    if min(ex, ey, ez) <= 0:
        raise S.SpecError("degenerate box: " + name)
    m = trimesh.creation.box(extents=(ex, ey, ez))
    m.apply_translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    return m


def segment(p0, p1, y0, y1, t, name="?"):
    """Thin bar between two plan points, rotated about Y."""
    (x0, z0), (x1, z1) = p0, p1
    length = math.hypot(x1 - x0, z1 - z0)
    if min(length, y1 - y0, t) <= 0:
        raise S.SpecError("degenerate segment: " + name)
    m = trimesh.creation.box(extents=(length, y1 - y0, t))
    ang = math.atan2(-(z1 - z0), (x1 - x0))
    m.apply_transform(trimesh.transformations.rotation_matrix(ang, (0, 1, 0)))
    m.apply_translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    return m


def prism(poly, y0, y1, name="?"):
    from shapely.geometry import Polygon
    pg = Polygon([(x, -z) for x, z in poly])      # extrude in XY, then lay it down
    if not pg.is_valid or pg.area <= 0:
        raise S.SpecError("bad outline: " + name)
    m = trimesh.creation.extrude_polygon(pg, y1 - y0)
    m.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, (1, 0, 0)))
    m.apply_translation((0, y0, 0))
    return m


def bar(p0, p1, y0, y1, t, offset, name):
    """A wall piece from p0 to p1 (plan points), thickness t, shifted sideways by
    `offset` x t (0 = centred on the line). Axis-aligned pieces become exact boxes."""
    (x0, z0), (x1, z1) = p0, p1
    L = math.hypot(x1 - x0, z1 - z0)
    nx, nz = -(z1 - z0) / L, (x1 - x0) / L          # left of the direction p0 -> p1
    cx, cz = offset * t * nx, offset * t * nz
    if abs(z1 - z0) < 1e-9:
        zc = z0 + cz
        return box(min(x0, x1), zc - t / 2, max(x0, x1), zc + t / 2, y0, y1, name)
    if abs(x1 - x0) < 1e-9:
        xc = x0 + cx
        return box(xc - t / 2, min(z0, z1), xc + t / 2, max(z0, z1), y0, y1, name)
    return segment((x0 + cx, z0 + cz), (x1 + cx, z1 + cz), y0, y1, t, name)


def wall(it, env, name, add, openings):
    p0, p1 = ev2(it["p0"], env), ev2(it["p1"], env)
    t = S.ev(it["t"], env)
    y0, y1 = S.ev(it["y"], env)
    offset = {"center": 0.0, "left": 0.5, "right": -0.5}[it.get("side", "center")]
    L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    d = ((p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L)

    def at(s):
        return (p0[0] + d[0] * s, p0[1] + d[1] * s)

    ops = sorted((S.ev(o["at"], env), S.ev(o["w"], env), o) for o in it.get("openings") or [])
    s, k = 0.0, 0
    for i, (a, w, o) in enumerate(ops):
        if a < s - 1e-6 or a + w > L + 1e-6:
            raise S.SpecError("%s: opening %d (at %.3f, w %.3f) overlaps or runs past the "
                              "wall (length %.3f)" % (name, i, a, w, L))
        if a - s > 1e-6:
            add("%s_%d" % (name, k), bar(at(s), at(a), y0, y1, t, offset, name), kind="wall", role="wall")
            k += 1
        kind = o.get("kind", "door")
        head = S.ev(o.get("head", env.get("door_h", 2.1) if kind != "window"
                         else env.get("window_head", 2.1)), env)
        if head < y1 - 1e-6:
            add("%s_head%d" % (name, i), bar(at(a), at(a + w), head, y1, t, offset, name),
                kind="overhead", role="head")
        sill = None
        if kind == "window":
            sill = S.ev(o.get("sill", env.get("sill_h", 0.9)), env)
            if sill > y0 + 1e-6:
                add("%s_sill%d" % (name, i), bar(at(a), at(a + w), y0, sill, t, offset, name),
                    kind="furniture", role="sill")
            if o.get("glass", True):
                add("%s_glass%d" % (name, i),
                    bar(at(a), at(a + w), sill, head, min(t, 0.03), offset, name), "glass", "furniture", "glass")
        nx, nz = -d[1], d[0]                      # left of the wall direction
        c0 = (at(a)[0] + offset * t * nx, at(a)[1] + offset * t * nz)
        c1 = (at(a + w)[0] + offset * t * nx, at(a + w)[1] + offset * t * nz)
        openings.append(dict(wall=name, index=i, kind=kind, at=a, w=w, sill=sill, head=head,
                             p0=c0, p1=c1, normal=(nx, nz), t=t,
                             glass=kind == "window" and o.get("glass", True)))
        s = a + w
    if L - s > 1e-6:
        add("%s_%d" % (name, k), bar(at(s), at(L), y0, y1, t, offset, name), kind="wall", role="wall")


def ev2(v, env):
    p = S.ev(v, env)
    return (float(p[0]), float(p[1]))


def build(spec):
    """Spec -> (parts, id_parts, info), meshes in authoring coordinates."""
    env0 = spec["_env"]
    palette = {k: tuple(S.ev(v, env0)) for k, v in (spec.get("palette") or {}).items()}
    parts, kinds, origin, openings = {}, {}, {}, []

    def colour(c):
        if isinstance(c, str):
            if c not in palette:
                raise S.SpecError("unknown palette colour %r" % c)
            return palette[c]
        return tuple(c)

    def emit(item, env):
        typ = item.get("type", "box")
        if typ == "group":
            for sub in item["items"]:
                for e in S.expand(sub, env):
                    emit(sub, e)
            return
        name = item["name"].format(**env)
        col = colour(item.get("color", "shell"))
        check = item.get("check")

        def add(n, mesh, col_override=None, kind=None, role=None):
            if n in parts:
                raise S.SpecError("duplicate part name: " + n)
            parts[n] = _paint(mesh, palette.get(col_override, col) if col_override else col)
            kinds[n] = check or kind
            origin[n] = (name, typ, role or typ, item.get("color", "shell"))

        if typ == "box":
            x0, x1 = S.ev(item["x"], env)
            z0, z1 = S.ev(item["z"], env)
            y0, y1 = S.ev(item["y"], env)
            add(name, box(x0, z0, x1, z1, y0, y1, name))
        elif typ == "segment":
            y0, y1 = S.ev(item["y"], env)
            add(name, segment(ev2(item["p0"], env), ev2(item["p1"], env), y0, y1,
                              S.ev(item["t"], env), name))
        elif typ == "prism":
            y0, y1 = S.ev(item["y"], env)
            add(name, prism([ev2(p, env) for p in item["poly"]], y0, y1, name))
        elif typ == "wall":
            wall(item, env, name, add, openings)
        else:
            raise S.SpecError("%s: unknown type %r" % (name, typ))

    for item in spec["items"]:
        for env in S.expand(item, env0):
            emit(item, env)

    for b, mesh in spec_blocks(spec):
        n = "blk_" + b.name
        if n in parts:
            raise S.SpecError("duplicate part name: " + n)
        parts[n] = _paint(mesh, BLOCK_RGB)
        kinds[n] = "none"
        origin[n] = (b.name, "block", "block", "block")

    for n, m in parts.items():                     # default classification for plan_check:
        if kinds[n] is None:                       # a wall stands on the floor, is full
            lo, hi = m.bounds                      # height and is not a thin post or fin
            thin = min(hi[0] - lo[0], hi[2] - lo[2]) < 0.08
            kinds[n] = "wall" if lo[1] <= 0.05 and hi[1] - lo[1] >= 2.0 and not thin else "furniture"

    regions = zone_regions(spec)
    id_parts = {}
    for name, mesh in parts.items():
        for (x0, x1, z0, z1), zone in regions:
            piece = clip_box(mesh, x0, x1, z0, z1)
            if piece is None:
                continue
            key = "%s__z%d" % (name, zone)
            if key in id_parts:          # a zone made of several regions: join, don't overwrite
                piece = trimesh.util.concatenate([id_parts[key], piece])
            id_parts[key] = _paint(piece, ZONE_RGB[zone])
    return parts, id_parts, {"kinds": kinds, "palette": palette, "origin": origin, "openings": openings}


BLOCK_RGB = (205, 200, 190)


def spec_blocks(spec):
    """[(Block, mesh in authoring coordinates)] from the spec's `blocks:` file.
    Blocks are written in the GLB frame, so with mirror_z each mesh is mirrored
    here and comes back into place when export() mirrors the model."""
    if not spec.get("blocks"):
        return []
    path = S.resolve_path(spec, spec["blocks"])
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        try:
            layout = BL.parse(f.read())
        except BL.LayoutError as e:
            raise S.SpecError("%s: %s" % (path, e))
    out_dir = S.resolve_path(spec, (spec.get("output") or {}).get("dir", "../model"))
    asset_dir = os.path.join(out_dir, "assets", spec["name"])
    out = []
    for b in layout:
        mesh, _ = BL.block_mesh(b, os.path.dirname(path), asset_dir)
        if spec.get("mirror_z") is not None:
            mirror = np.diag([1.0, 1.0, -1.0, 1.0])
            mirror[2, 3] = S.ev(spec["mirror_z"], spec["_env"])
            mesh.apply_transform(mirror)
        out.append((b, mesh))
    return out


def zone_regions(spec):
    """[((x0, x1, z0, z1), zone index)], open sides as +-INF, in spec order."""
    INF = S.CONSTS["INF"]
    out = []
    for reg in spec.get("zone_regions") or []:
        x0, x1 = S.ev(reg.get("x", [None, None]), spec["_env"])
        z0, z1 = S.ev(reg.get("z", [None, None]), spec["_env"])
        out.append(((-INF if x0 is None else x0, INF if x1 is None else x1,
                     -INF if z0 is None else z0, INF if z1 is None else z1),
                    zone_index(spec, reg["zone"])))
    return out


def zone_index(spec, z):
    if isinstance(z, int):
        return z
    for i, zone in enumerate(spec.get("zones") or []):
        if zone["slug"] == z:
            return i
    raise S.SpecError("unknown zone %r" % z)


def clip_box(mesh, x0, x1, z0, z1):
    """The part of `mesh` inside the plan box, cut faces capped; None if empty."""
    INF = S.CONSTS["INF"]
    lo, hi = mesh.bounds
    if lo[0] >= x1 or hi[0] <= x0 or lo[2] >= z1 or hi[2] <= z0:
        return None
    if lo[0] >= x0 and hi[0] <= x1 and lo[2] >= z0 and hi[2] <= z1:
        return mesh.copy()
    m = mesh
    for normal, origin, bound in (((1, 0, 0), (x0, 0, 0), x0), ((-1, 0, 0), (x1, 0, 0), x1),
                                  ((0, 0, 1), (0, 0, z0), z0), ((0, 0, -1), (0, 0, z1), z1)):
        if abs(bound) >= INF:
            continue
        try:
            m = trimesh.intersections.slice_mesh_plane(m, normal, origin, cap=True)
        except Exception:
            m = trimesh.intersections.slice_mesh_plane(m, normal, origin, cap=False)
        if m is None or m.is_empty or len(m.faces) == 0:
            return None
    return m


def viewer_json(spec, parts, id_parts, info, cut_match):
    """The model as plain JSON for the web viewer: one entry per part, with the
    item it came from, its role (wall / head / sill / glass / box ...), its
    painted colour, and the same per-zone pieces as the ID model."""
    def piece(name, mesh):
        base, _, zone = name.partition("__z")
        item, _, role, colour = info["origin"][base]
        out = {"name": base, "item": item, "role": role,
               "glass": role == "glass" or colour == "glass", "cut": cut_match(base)}
        if zone:
            out["zone"] = int(zone)
        else:
            out["rgb"] = [int(c) for c in mesh.visual.face_colors[0][:3]]
        out["position"] = [round(float(v), 4) for v in mesh.vertices.flatten()]
        out["index"] = [int(i) for i in mesh.faces.flatten()]
        return out

    return {"name": spec["name"],
            "zones": [z["slug"] for z in spec.get("zones") or []],
            "parts": [piece(n, m) for n, m in parts.items()],
            "zonePieces": [piece(n, m) for n, m in id_parts.items()]}


def export(spec, parts, id_parts, info=None):
    env = spec["_env"]
    if spec.get("mirror_z") is not None:
        # Mirror Z so the model is right-handed (X east, Y up, Z south). trimesh
        # re-orients the faces itself when a transform has a negative determinant.
        mirror = np.diag([1.0, 1.0, -1.0, 1.0])
        mirror[2, 3] = S.ev(spec["mirror_z"], env)
        for mesh in parts.values():
            mesh.apply_transform(mirror)
        for mesh in id_parts.values():
            mesh.apply_transform(mirror)
    for n, mesh in parts.items():
        if mesh.is_watertight:
            assert mesh.volume > 0, "inverted winding: " + n

    out = spec.get("output") or {}
    out_dir = S.resolve_path(spec, out.get("dir", "../model"))
    base = out.get("base", spec["name"])
    os.makedirs(out_dir, exist_ok=True)
    comfy = os.environ.get("MP_COMFY_3D", COMFY_3D)
    cut = spec.get("cutaway") or []

    def export_glb(filename, items):
        scene = trimesh.Scene()
        for name, mesh in items.items():
            scene.add_geometry(mesh, geom_name=name, node_name=name)
        path = os.path.join(out_dir, filename)
        scene.export(path)
        if os.path.isdir(comfy):
            shutil.copy(path, os.path.join(comfy, filename))
        print("glb:     %s  (%s bytes, %d parts)" % (path, format(os.path.getsize(path), ","), len(items)))
        return path

    def is_cut(name):
        return any(fnmatch.fnmatchcase(name.split("__z")[0], c) for c in cut)

    def without(items):
        return {n: m for n, m in items.items() if not is_cut(n)}

    export_glb(base + ".glb", parts)
    export_glb(base + "_cut.glb", without(parts))
    if id_parts:
        export_glb(base + "_ids.glb", id_parts)
        export_glb(base + "_cut_ids.glb", without(id_parts))

    if info is not None:
        path = os.path.join(out_dir, base + "_viewer.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(viewer_json(spec, parts, id_parts, info, is_cut), f, separators=(",", ":"))
            f.write("\n")
        print("viewer:  %s  (%s bytes)" % (path, format(os.path.getsize(path), ",")))

    merged = trimesh.util.concatenate(list(parts.values()))
    obj = os.path.join(out_dir, base + ".obj")
    merged.export(obj)

    print("parts:   %d  (+ %d zone pieces)" % (len(parts), len(id_parts)))
    print("extents: %s  (X len, Y height, Z width)" % merged.extents.round(2))
    print("centre:  %s" % merged.bounds.mean(axis=0).round(2))
    print("obj:     %s  (%s bytes)" % (obj, format(os.path.getsize(obj), ",")))


def main():
    ap = argparse.ArgumentParser(description="plan spec -> massing GLBs")
    ap.add_argument("spec", nargs="?", default=DEFAULT_SPEC)
    a = ap.parse_args()
    spec = S.load(a.spec)
    parts, id_parts, info = build(spec)
    export(spec, parts, id_parts, info)


if __name__ == "__main__":
    main()
