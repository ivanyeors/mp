"""Blocking -- a movable furniture layer on top of a plan's massing model.

The room comes from the plan spec (tools/build_massing.py). The furniture is
a list of BLOCKS typed on the canvas, one line each (see blocks.py): boxes
with a size, a place, a turn and a prompt. They are the source of truth for
the renders: they go into the depth pass, so every camera sees the same sofa
in the same place, and into a block-ID pass, so each block's prompt is drawn
only where the block is.

  Block Layout        plan + BLOCKS -> model, zone-ID model, block-ID model
  Block Prompts       each block's prompt, confined to its pixels in a block-ID pass
  Propose Blocks      renders -> new BLOCKS lines (SAM 3.1 masks, MoGe depth,
                      aligned to the known room through the exact camera)
  Block Crop Source   one block's pixels in the render that shows it best
                      (input for image-to-3D)
  Block Mask          named blocks' pixels in each view (block inpainting)
  Electrical Layout   the plan's DB + electrical points -> wiring in the model,
                      a light-ID twin (fixture glow), the DB schedule
  Wiring Overlay      runs and points drawn over a render (electrician view)
  Electrical Sheets   E-01..E-04 A3 drawings + PDF (tools/electrical.py)
  Mesh Into Block     an image-to-3D mesh saved as that block's asset; Block
                      Layout fits it into the box from then on

Install: junction this folder into ComfyUI/custom_nodes (like mp_glb_parts)
and restart. Needs trimesh, numpy, pyyaml (tools/ already require them).
"""

import hashlib
import json
import math
import os
import sys

import numpy as np
from typing_extensions import override

import folder_paths
from comfy_api.latest import IO, ComfyExtension, Types

HERE = os.path.dirname(os.path.realpath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import blocks as BL  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))        # mpillow-office/
PLANS = os.path.join(ROOT, "plans")
TOOLS = os.path.join(ROOT, "tools")
OUT_SUBDIR = "mp_blocking"
ZONE_RGB = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (255, 0, 255), (0, 255, 255)]
PROPOSAL_RGB = (255, 140, 0)
DEFAULT_CLASSES = ("sofa:2, armchair:4, chair:6, bench:3, table:4, bed:3, shelf:4, cabinet:4, "
                   "workbench:2, counter:2, rug:2, plant:4")
MoGeModel = IO.Custom("MOGE_MODEL")


# ------------------------------------------------------------------ plan ---

def _plans():
    if not os.path.isdir(PLANS):
        return ["none"]
    return sorted(f for f in os.listdir(PLANS) if f.endswith(".yaml")) or ["none"]


def _tools():
    if TOOLS not in sys.path:
        sys.path.insert(0, TOOLS)
    import spec as S
    import build_massing as BM
    return S, BM


class Plan:
    """What the nodes need from a plan spec: model paths, zones, blocks file."""

    def __init__(self, plan_file):
        S, BM = _tools()
        self.path = os.path.join(PLANS, plan_file)
        self.spec = S.load(self.path)
        out = self.spec.get("output") or {}
        self.model_dir = S.resolve_path(self.spec, out.get("dir", "../model"))
        self.base = out.get("base", self.spec["name"])
        self.name = self.spec["name"]
        self.model = os.path.join(self.model_dir, self.base + ".glb")
        self.ids = os.path.join(self.model_dir, self.base + "_ids.glb")
        bf = self.spec.get("blocks")
        self.blocks_file = S.resolve_path(self.spec, bf) if bf else os.path.join(PLANS, self.name + ".blocks.txt")
        self.asset_dir = os.path.join(self.model_dir, "assets", self.name)
        self.mirror = S.ev(self.spec["mirror_z"], self.spec["_env"]) if self.spec.get("mirror_z") is not None else None
        self.regions = BM.zone_regions(self.spec)

    def zone_of(self, x, z):
        """Zone index of a GLB-frame plan point (None outside every region)."""
        az = self.mirror - z if self.mirror is not None else z
        for (x0, x1, z0, z1), zone in self.regions:
            if x0 <= x <= x1 and z0 <= az <= z1:
                return zone
        return None

    def default_asset(self, name):
        return os.path.join(self.asset_dir, name + ".glb")


def _mtime(p):
    try:
        st = os.stat(p)
        return "%d|%d" % (st.st_size, st.st_mtime_ns)
    except OSError:
        return "-"


def _temp(name):
    d = os.path.join(folder_paths.get_temp_directory(), OUT_SUBDIR)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, name)


def _load_scene(path):
    import trimesh
    return trimesh.load(path, force="scene", process=False)


def _scene_meshes(scene, drop_prefix="blk_"):
    """[(node name, mesh in world space)] of a scene, minus earlier blocks."""
    out = []
    for node_name in scene.graph.nodes_geometry:
        if node_name.lower().startswith(drop_prefix):
            continue
        transform, geom = scene.graph[node_name]
        m = scene.geometry[geom].copy()
        m.apply_transform(transform)
        out.append((node_name, m))
    return out


def _paint(m, rgb):
    import trimesh
    m = m.copy()
    m.visual = trimesh.visual.ColorVisuals(m)
    m.visual.face_colors = np.tile(np.array(list(rgb) + [255], np.uint8), (len(m.faces), 1))
    return m


def _export(parts, path):
    import trimesh
    scene = trimesh.Scene()
    for name, mesh in parts:
        scene.add_geometry(mesh, geom_name=name, node_name=name)
    scene.export(path, file_type="glb")
    return path


def _blocks_from_json(s):
    data = json.loads(s or "[]")
    out = []
    for d in data:
        b = BL.Block(d["name"], d["x"], d["z"], d["w"], d["d"], d["h"], d.get("y", 0.0),
                     d.get("rot", 0.0), d.get("arot", 0.0), d.get("asset"), d.get("prompt", ""))
        b.color = tuple(d.get("color", (0, 0, 0)))
        out.append(b)
    return out


def _out(result):
    """Results of calling another node's execute(): NodeOutput or a tuple."""
    return getattr(result, "result", result)


# ---------------------------------------------------------- Block Layout ---

class MPBlockLayout(IO.ComfyNode):
    @classmethod
    def define_schema(cls):
        return IO.Schema(
            node_id="MPBlockLayout",
            display_name="Block Layout (mpillow)",
            category="3d/mpillow",
            search_aliases=["blocking", "furniture boxes", "layout", "massing furniture"],
            description=(
                "The plan's massing model plus the furniture BLOCKS typed here, one per line: "
                "name x= z= w= d= h= [y=] [rot=] [arot=] [asset=] | prompt. GLB frame: X east, Z south, "
                "metres, x z = centre of the footprint, rot = degrees counter-clockwise from above. "
                "Outputs the model, its zone-ID twin and a block-ID twin (one flat colour per block)."
            ),
            inputs=[
                IO.Combo.Input("plan", options=_plans(), tooltip="Plan spec in mpillow-office/plans/."),
                IO.String.Input("blocks", multiline=True, default="",
                                placeholder="sofa_1  x=2.10 z=5.40 w=2.20 d=0.90 h=0.80 rot=0  | boucle sofa",
                                tooltip="One block per line. Empty = read the plan's blocks file."),
                IO.Boolean.Input("save_to_file", default=True,
                                 tooltip="Write these lines to the plan's blocks file on every run, so "
                                         "build_massing.py and the Admin Panel see the same layout."),
            ],
            outputs=[
                IO.File3DAny.Output(display_name="model_3d", tooltip="Room + blocks (assets where they exist)."),
                IO.File3DAny.Output(display_name="zone_ids_3d", tooltip="Zone-ID twin: blocks in their zone's colour."),
                IO.File3DAny.Output(display_name="block_ids_3d", tooltip="Block-ID twin: room black, one colour per block."),
                IO.String.Output(display_name="blocks_json", tooltip="The parsed blocks, with their ID colours."),
                IO.String.Output(display_name="report"),
            ],
        )

    @classmethod
    def fingerprint_inputs(cls, plan, blocks, save_to_file, **kwargs):
        try:
            p = Plan(plan)
            assets = sorted(os.listdir(p.asset_dir)) if os.path.isdir(p.asset_dir) else []
            key = [p.path, _mtime(p.path), _mtime(p.model), _mtime(p.ids)]
            key += ["%s:%s" % (a, _mtime(os.path.join(p.asset_dir, a))) for a in assets]
            if not (blocks or "").strip():
                key.append(_mtime(p.blocks_file))
        except Exception as e:  # let execute() report it
            key = [repr(e)]
        return hashlib.sha1(("|".join(key) + "|" + blocks + "|%s" % save_to_file).encode("utf-8")).hexdigest()

    @classmethod
    def execute(cls, plan, blocks, save_to_file, **kwargs):
        p = Plan(plan)
        for f in (p.model, p.ids):
            if not os.path.exists(f):
                raise ValueError("Block Layout: %s is missing -- run tools/build_massing.py %s first"
                                 % (f, os.path.relpath(p.path, ROOT)))
        text = blocks if (blocks or "").strip() else (
            open(p.blocks_file, encoding="utf-8").read() if os.path.exists(p.blocks_file) else "")
        try:
            layout = BL.parse(text)
        except BL.LayoutError as e:
            raise ValueError("Block Layout: %s" % e)
        if save_to_file and (blocks or "").strip():
            old = open(p.blocks_file, encoding="utf-8").read() if os.path.exists(p.blocks_file) else None
            if old != blocks:
                with open(p.blocks_file, "w", encoding="utf-8", newline="\n") as f:
                    f.write(blocks if blocks.endswith("\n") else blocks + "\n")

        colors = BL.id_colors(len(layout))
        room = _scene_meshes(_load_scene(p.model))
        room_ids = _scene_meshes(_load_scene(p.ids))
        model_parts = list(room)
        zone_parts = list(room_ids)
        block_parts = [(n, _paint(m, (0, 0, 0))) for n, m in room]
        rows, lines = [], []
        for b, col in zip(layout, colors):
            mesh, asset = BL.block_mesh(b, os.path.dirname(p.blocks_file), p.asset_dir)
            used = asset is not None
            zone = p.zone_of(b.x, b.z)
            zone = 0 if zone is None else zone
            name = "blk_" + b.name
            model_parts.append((name, mesh if used else _paint(mesh, (205, 200, 190))))
            zone_parts.append(("%s__z%d" % (name, zone), _paint(mesh, ZONE_RGB[zone % len(ZONE_RGB)])))
            block_parts.append((name, _paint(mesh, BL.to_linear(col))))
            d = b.as_dict()
            d.update(color=list(col), zone=zone, asset_file=asset if used else None)
            rows.append(d)
            lines.append("%-14s zone %d  colour %-15s %s%s" % (
                b.name, zone, "#%02x%02x%02x" % col, "%.2f x %.2f x %.2f" % (b.w, b.d, b.h),
                "  asset " + os.path.basename(asset) if used else ""))

        key = hashlib.sha1((p.path + _mtime(p.model) + text + json.dumps(
            [r["asset_file"] and _mtime(r["asset_file"]) for r in rows])).encode("utf-8")).hexdigest()[:16]
        f_model = _export(model_parts, _temp("layout_%s.glb" % key))
        f_zone = _export(zone_parts, _temp("layout_%s_ids.glb" % key))
        f_block = _export(block_parts, _temp("layout_%s_blockids.glb" % key))
        report = "%s: %d blocks%s\n%s" % (p.name, len(layout),
                                          "  (saved to %s)" % os.path.relpath(p.blocks_file, ROOT)
                                          if save_to_file and (blocks or "").strip() else "",
                                          "\n".join(lines))
        return IO.NodeOutput(Types.File3D(f_model), Types.File3D(f_zone), Types.File3D(f_block),
                             json.dumps(rows), report)


# ---------------------------------------------------------- Block Prompts --

class MPBlockConditioning(IO.ComfyNode):
    @classmethod
    def define_schema(cls):
        return IO.Schema(
            node_id="MPBlockConditioning",
            display_name="Block Prompts (mpillow)",
            category="3d/mpillow",
            search_aliases=["block prompts", "regional prompt blocks", "furniture prompts"],
            description=(
                "Adds each block's prompt (the text after | on its line), confined to that block's "
                "pixels in a block-ID pass, on top of the incoming conditioning. Works on a single "
                "view or a sheet of views; blocks that are not visible are skipped."
            ),
            inputs=[
                IO.Clip.Input("clip"),
                IO.Conditioning.Input("conditioning"),
                IO.Image.Input("block_ids", tooltip="Block-ID pass (Render Mesh, vertex colors) or a sheet of them."),
                IO.String.Input("blocks_json", force_input=True),
                IO.Float.Input("strength", default=1.0, min=0.0, max=10.0, step=0.05),
                IO.Boolean.Input("enabled", default=True, tooltip="false: pass the conditioning through."),
                IO.Int.Input("min_pixels", default=400, min=0, max=100000,
                             tooltip="Skip a block covering fewer pixels than this."),
            ],
            outputs=[IO.Conditioning.Output(), IO.String.Output(display_name="report")],
        )

    @classmethod
    def execute(cls, clip, conditioning, block_ids, blocks_json, strength, enabled, min_pixels, **kwargs):
        import torch
        import node_helpers
        if not enabled:
            return IO.NodeOutput(conditioning, "block prompts off")
        blocks = _blocks_from_json(blocks_json)
        img = block_ids[0].cpu().numpy()
        cls_map = BL.classify(img, [b.color for b in blocks])
        out = list(conditioning)
        lines = []
        for k, b in enumerate(blocks):
            m = cls_map == k
            n = int(m.sum())
            if not b.prompt or n < min_pixels:
                lines.append("%-14s skipped (%s)" % (b.name, "no prompt" if not b.prompt else "%d px" % n))
                continue
            cond = clip.encode_from_tokens_scheduled(clip.tokenize(b.prompt))
            mask = torch.from_numpy(m.astype(np.float32))[None]
            out += node_helpers.conditioning_set_values(
                cond, {"mask": mask, "set_area_to_bounds": False, "mask_strength": strength})
            lines.append("%-14s %6.2f%% of the frame  | %s" % (b.name, 100.0 * n / m.size, b.prompt))
        return IO.NodeOutput(out, "\n".join(lines))


# ---------------------------------------------------------- Propose Blocks -

def _render_room_t(meshes, cam, W, H):
    import trimesh
    m = trimesh.util.concatenate([mm for _, mm in meshes])
    t, _ = BL.render_depth(np.asarray(m.vertices, float), np.asarray(m.faces, np.int64), cam, W, H)
    lo, hi = m.bounds
    return t, lo, hi


class MPProposeBlocks(IO.ComfyNode):
    @classmethod
    def define_schema(cls):
        cams = []
        for c in "abc":
            cams += [IO.Image.Input("image_" + c, optional=True, tooltip="A finished render."),
                     IO.Load3DCamera.Input("camera_" + c, optional=True,
                                           tooltip="The camera that render was made from."),
                     IO.Load3DModelInfo.Input("model_info_" + c, optional=True,
                                              tooltip="The viewer's model transform, if the camera came from a viewer.")]
        return IO.Schema(
            node_id="MPProposeBlocks",
            display_name="Propose Blocks (mpillow)",
            category="3d/mpillow",
            search_aliases=["render to blocks", "extract furniture", "propose blocks"],
            description=(
                "Reads finished renders back into BLOCKS lines. Per camera: SAM 3.1 finds each class "
                "in the class list, MoGe estimates depth, the depth is aligned to the known room "
                "(same camera, metric) on the background, and every mask is back-projected and boxed "
                "on the floor. Objects seen by several cameras are merged. Blocks already in the "
                "layout are reported as matches, not proposed again. Paste the lines you want into "
                "Block Layout."
            ),
            inputs=[
                IO.Combo.Input("plan", options=_plans()),
                IO.MultiType.Input("model_3d", types=[IO.File3DGLB, IO.File3DAny],
                                   tooltip="The model the renders were drawn on (Block Layout -> part filter)."),
                IO.String.Input("blocks_json", force_input=True),
                IO.Model.Input("sam3_model"),
                IO.Clip.Input("sam3_clip"),
                MoGeModel.Input("moge_model"),
                IO.String.Input("classes", multiline=True,
                                                default=DEFAULT_CLASSES,
                                tooltip="What to look for, comma separated; :N = at most N per view."),
                IO.Float.Input("threshold", default=0.5, min=0.05, max=0.95, step=0.01),
                IO.Float.Input("match_iou", default=0.3, min=0.0, max=1.0, step=0.05,
                               tooltip="Footprint overlap above which a find is the existing block."),
                IO.Int.Input("work_width", default=832, min=256, max=2048, step=8,
                             tooltip="Resolution the geometry is solved at (renders are scaled to it)."),
                IO.Float.Input("max_base", default=2.0, min=0.0, max=10.0, step=0.05,
                               tooltip="Drop finds whose base is higher than this (pendants, ceiling fittings)."),
                IO.Float.Input("max_size", default=4.0, min=0.5, max=20.0, step=0.1,
                               tooltip="Drop finds wider or deeper than this (a mask that ran over several pieces)."),
            ] + cams,
            outputs=[
                IO.String.Output(display_name="proposals", tooltip="BLOCKS lines to paste, plus matches as comments."),
                IO.File3DAny.Output(display_name="preview_3d", tooltip="The model with the proposals in orange."),
                IO.Image.Output(display_name="overlay", tooltip="Each render with what was found."),
            ],
        )

    @classmethod
    def execute(cls, plan, model_3d, blocks_json, sam3_model, sam3_clip, moge_model, classes, threshold,
                match_iou, work_width, max_base, max_size, **kw):
        import torch
        import comfy.utils
        from comfy_extras.nodes_sam3 import SAM3_Detect
        from comfy_extras.nodes_moge import MoGeInference

        p = Plan(plan)
        existing = _blocks_from_json(blocks_json)
        import trimesh
        scene = trimesh.load(model_3d.get_data(), file_type=(model_3d.format or "glb").lower(),
                                           force="scene", process=False)
        room = _scene_meshes(scene, drop_prefix="\0")       # keep blocks: they are part of the depth
        labels = [c.strip() for c in classes.split(",") if c.strip()]
        cands, overlays = [], []
        palette = [np.array(c, np.float32) / 255.0 for c in BL.id_colors(26)]
        for c in "abc":
            img, cam_info = kw.get("image_" + c), kw.get("camera_" + c)
            if img is None or cam_info is None:
                continue
            info = kw.get("model_info_" + c)
            H0, W0 = int(img.shape[1]), int(img.shape[2])
            W = int(work_width)
            H = int(round(W * H0 / W0))
            small = comfy.utils.common_upscale(img[:1, ..., :3].movedim(-1, 1), W, H, "bilinear", "disabled").movedim(1, -1)
            meshes = room
            if info:
                meshes = [(n, m.copy()) for n, m in room]
                for _, m in meshes:
                    m.vertices = BL.apply_model_transform(np.asarray(m.vertices, float), info[0])
            lo_all = np.min([m.bounds[0] for _, m in meshes], axis=0)
            hi_all = np.max([m.bounds[1] for _, m in meshes], axis=0)
            cam = BL.camera_from_info(cam_info, (lo_all + hi_all) / 2)
            room_t, lo, hi = _render_room_t(meshes, cam, W, H)

            geo = _out(MoGeInference.execute(moge_model, small, 9, 0.0, 1, True, False, 3))[0]
            depth = geo["depth"][0].float().cpu()
            if tuple(depth.shape) != (H, W):
                depth = torch.nn.functional.interpolate(depth[None, None], size=(H, W), mode="nearest")[0, 0]
            depth = depth.numpy()

            found = []
            for lab in labels:
                cond = sam3_clip.encode_from_tokens_scheduled(sam3_clip.tokenize(lab))
                masks, boxes = _out(SAM3_Detect.execute(sam3_model, small, cond, None, None, None,
                                                        threshold, 2, True))
                name = lab.split(":")[0].strip()
                scores = [b.get("score", 0.0) for b in (boxes[0] if boxes else [])]
                for i, m in enumerate(masks.cpu().numpy() if masks is not None else []):
                    if m.sum() > 50:
                        found.append((name, scores[i] if i < len(scores) else 0.0, m > 0.5))
            any_mask = np.zeros((H, W), bool)
            for _, _, m in found:
                any_mask |= m
            found = BL.suppress(found)          # one find per object, best-scored label
            ov = small[0].cpu().numpy().copy()
            for k, (name, score, m) in enumerate(found):
                try:
                    pts = BL.points_from_mask(m, depth, room_t, cam, valid_bg=~any_mask)
                except BL.LayoutError:
                    continue
                pts = pts[np.all((pts >= lo - 0.05) & (pts <= hi + 0.05), axis=1)]
                cands.append((name, score, pts))
                ov[m] = ov[m] * 0.45 + palette[k % len(palette)] * 0.55
            overlays.append(torch.from_numpy(ov))

        if not overlays:
            raise ValueError("Propose Blocks: connect at least one image + camera pair")
        merged = BL.merge_views(cands)
        taken = {b.name for b in existing}
        new, notes, dropped = [], {}, []
        for label, pts in merged:
            b = BL.block_from_points(pts, "tmp", prompt=label)
            if b is None:
                continue
            best = max(existing, key=lambda e: BL.footprint_iou(e, b), default=None)
            if best is not None and BL.footprint_iou(best, b) >= match_iou:
                notes.setdefault(best.name, "# %-14s seen as a %s: w=%.2f d=%.2f h=%.2f rot=%g"
                                 % (best.name, label, b.w, b.d, b.h, b.rot))
                continue
            if b.y > max_base or max(b.w, b.d) > max_size:
                dropped.append("# dropped %s at x=%.1f z=%.1f (%s)" % (
                    label, b.x, b.z, "base %.1f m up" % b.y if b.y > max_base else "%.1f m across" % max(b.w, b.d)))
                continue
            b.name = BL.unique_name(label, taken)
            new.append(b)
        text = BL.format_layout(new) if new else "# nothing new found"
        if notes:
            text += "\n\n# already in BLOCKS:\n" + "\n".join(notes[k] for k in sorted(notes))
        if dropped:
            text += "\n\n" + "\n".join(dropped)

        parts = [(n, m) for n, m in room]
        for b in new:
            parts.append(("proposal_" + b.name, _paint(BL.box_mesh(b), PROPOSAL_RGB)))
        key = hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]
        f = _export(parts, _temp("proposals_%s.glb" % key))
        sizes = {tuple(o.shape) for o in overlays}
        if len(sizes) > 1:
            overlays = [o[: min(s[0] for s in sizes), : min(s[1] for s in sizes)] for o in overlays]
        return IO.NodeOutput(text, Types.File3D(f), torch.stack(overlays))


# ------------------------------------------------------- Block Crop Source -

class MPBlockCropSource(IO.ComfyNode):
    @classmethod
    def define_schema(cls):
        return IO.Schema(
            node_id="MPBlockCropSource",
            display_name="Block Crop Source (mpillow)",
            category="3d/mpillow",
            description=(
                "One block's pixels for image-to-3D: from a batch of renders and the matching batch "
                "of block-ID passes, picks the view where the block is largest (or the one you "
                "choose) and returns that render and the block's mask."
            ),
            inputs=[
                IO.Image.Input("renders", tooltip="Finished renders, one per camera, batched."),
                IO.Image.Input("block_ids", tooltip="Block-ID passes in the same order and size."),
                IO.String.Input("blocks_json", force_input=True),
                IO.String.Input("block", default="", tooltip="Block name, as in BLOCKS."),
                IO.Combo.Input("view", options=["largest", "1", "2", "3"], default="largest"),
                IO.Int.Input("grow", default=4, min=0, max=64, tooltip="Dilate the mask by this many pixels."),
            ],
            outputs=[IO.Image.Output(display_name="image"), IO.Mask.Output(display_name="mask"),
                     IO.String.Output(display_name="report")],
        )

    @classmethod
    def execute(cls, renders, block_ids, blocks_json, block, view, grow, **kwargs):
        import torch
        blocks = _blocks_from_json(blocks_json)
        names = [b.name for b in blocks]
        if block.strip() not in names:
            raise ValueError("Block Crop Source: no block %r (blocks: %s)" % (block, ", ".join(names)))
        k = names.index(block.strip())
        n = min(renders.shape[0], block_ids.shape[0])
        masks, areas = [], []
        for i in range(n):
            ids = block_ids[i].cpu().numpy()
            m = BL.classify(ids, [b.color for b in blocks]) == k
            masks.append(m)
            areas.append(int(m.sum()))
        i = int(np.argmax(areas)) if view == "largest" else min(int(view) - 1, n - 1)
        if areas[i] == 0:
            raise ValueError("Block Crop Source: %s is not visible in view %d" % (block, i + 1))
        m = torch.from_numpy(masks[i].astype(np.float32))[None]
        if grow:
            m = torch.nn.functional.max_pool2d(m[None], 2 * grow + 1, 1, grow)[0]
        img = renders[i:i + 1]
        if tuple(img.shape[1:3]) != tuple(m.shape[1:3]):
            m = torch.nn.functional.interpolate(m[None], size=tuple(img.shape[1:3]), mode="nearest")[0]
        rep = "%s: view %d (%s)" % (block, i + 1, ", ".join("view %d %d px" % (j + 1, a) for j, a in enumerate(areas)))
        return IO.NodeOutput(img, m, rep)


# -------------------------------------------------------------- Block Mask -

class MPBlockMask(IO.ComfyNode):
    @classmethod
    def define_schema(cls):
        return IO.Schema(
            node_id="MPBlockMask",
            display_name="Block Mask (mpillow)",
            category="3d/mpillow",
            search_aliases=["block mask", "furniture mask", "inpaint block"],
            description=(
                "The pixels of the named blocks in a block-ID pass (or a batch of them), as a mask: "
                "for inpainting one piece of furniture. Several names: comma separated."
            ),
            inputs=[
                IO.Image.Input("block_ids", tooltip="Block-ID pass(es), as rendered for the camera(s)."),
                IO.String.Input("blocks_json", force_input=True),
                IO.String.Input("block", default="", tooltip="Block name(s) as in BLOCKS, comma separated."),
                IO.Int.Input("grow", default=6, min=0, max=128, tooltip="Dilate the mask by this many pixels."),
            ],
            outputs=[IO.Mask.Output(display_name="mask"), IO.String.Output(display_name="report")],
        )

    @classmethod
    def execute(cls, block_ids, blocks_json, block, grow, **kwargs):
        import torch
        blocks = _blocks_from_json(blocks_json)
        names = [b.name for b in blocks]
        want = [s.strip() for s in (block or "").split(",") if s.strip()]
        missing = [w for w in want if w not in names]
        if missing:
            raise ValueError("Block Mask: no block %s (blocks: %s)" % (", ".join(missing), ", ".join(names)))
        ks = [names.index(w) for w in want]
        masks, lines = [], []
        for i in range(block_ids.shape[0]):
            cls_map = BL.classify(block_ids[i].cpu().numpy(), [b.color for b in blocks])
            m = np.isin(cls_map, ks) if ks else np.zeros(cls_map.shape, bool)
            masks.append(torch.from_numpy(m.astype(np.float32)))
            lines.append("view %d: %d px" % (i + 1, int(m.sum())))
        m = torch.stack(masks)
        if grow:
            m = torch.nn.functional.max_pool2d(m[:, None], 2 * grow + 1, 1, grow)[:, 0]
        return IO.NodeOutput(m, "%s -- %s" % (", ".join(want) or "(none)", ", ".join(lines)))


# --------------------------------------------------------- Mesh Into Block -

class MPMeshIntoBlock(IO.ComfyNode):
    @classmethod
    def define_schema(cls):
        return IO.Schema(
            node_id="MPMeshIntoBlock",
            display_name="Mesh Into Block (mpillow)",
            category="3d/mpillow",
            description=(
                "Saves an image-to-3D mesh as a block's asset, model/assets/<plan>/<block>.glb. From "
                "the next run Block Layout fits it into that block's box (uniform scale, standing on "
                "the floor, turned by the block's rot and arot) in the model and in every pass. "
                "asset=none on the block's line goes back to the box."
            ),
            is_output_node=True,
            inputs=[
                IO.Combo.Input("plan", options=_plans()),
                IO.String.Input("block", default=""),
                IO.MultiType.Input("model_3d", types=[IO.File3DGLB, IO.File3DAny],
                                   tooltip="The generated mesh (TRELLIS.2 / Pixal3D)."),
                IO.Boolean.Input("y_up", default=True,
                                 tooltip="false: the mesh is Z-up; turn it to Y-up before saving."),
            ],
            outputs=[IO.String.Output(display_name="asset_path"), IO.File3DAny.Output(display_name="asset_3d")],
        )

    @classmethod
    def execute(cls, plan, block, model_3d, y_up, **kwargs):
        import trimesh
        name = block.strip()
        if not name:
            raise ValueError("Mesh Into Block: name the block")
        p = Plan(plan)
        scene = trimesh.load(model_3d.get_data(), file_type=(model_3d.format or "glb").lower(),
                             force="scene", process=False)
        if not y_up:
            scene.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, (1, 0, 0)))
        os.makedirs(p.asset_dir, exist_ok=True)
        path = p.default_asset(name)
        scene.export(path, file_type="glb")
        return IO.NodeOutput(os.path.relpath(path, ROOT), Types.File3D(path))


# ------------------------------------------------------------- Electrical ---

def _electrical(plan, points):
    """(Plan, tools/electrical Layer, routes) for a plan + points text."""
    _tools()
    import electrical as EL
    p = Plan(plan)
    try:
        layer = EL.Layer(p.spec, points)
    except EL.ElectricalError as e:
        raise ValueError("Electrical: %s" % e)
    return p, EL, layer, EL.route(layer)


def _points_fingerprint(plan, points):
    try:
        p = Plan(plan)
        el = p.spec.get("electrical") or {}
        f = os.path.join(PLANS, el.get("points", p.name + ".electrical.txt"))
        return "|".join([p.path, _mtime(p.path), _mtime(f), points or ""])
    except Exception as e:
        return repr(e)


class MPElectricalLayout(IO.ComfyNode):
    @classmethod
    def define_schema(cls):
        return IO.Schema(
            node_id="MPElectricalLayout",
            display_name="Electrical Layout (mpillow)",
            category="3d/mpillow",
            search_aliases=["electrical", "wiring", "lighting points", "sockets", "db"],
            description=(
                "The plan's electrical layer: the DB (plan spec), the points typed here one per line "
                "(name kind x= z= [y=] [circuit=] [controls=] [n=] | note), each circuit routed from the "
                "DB at the route height with drops to its accessories. Outputs the model with the wiring "
                "in it, the wiring alone, a light-ID twin for fixture glow, the DB schedule and a check "
                "report. Design intent: to be verified and endorsed by an LEW."
            ),
            inputs=[
                IO.Combo.Input("plan", options=_plans()),
                IO.String.Input("points", multiline=True, default="",
                                tooltip="One point per line. Empty = read the plan's points file."),
                IO.Boolean.Input("save_to_file", default=True,
                                 tooltip="Write these lines to the plan's points file on every run."),
                IO.MultiType.Input("model_3d", types=[IO.File3DGLB, IO.File3DAny],
                                   tooltip="The room the wiring goes into (after hiding parts)."),
            ],
            outputs=[
                IO.File3DAny.Output(display_name="model_with_wiring_3d"),
                IO.File3DAny.Output(display_name="wiring_3d", tooltip="Runs + points only."),
                IO.File3DAny.Output(display_name="light_ids_3d", tooltip="Room black, one colour per light."),
                IO.String.Output(display_name="lights_json", tooltip="Lights as blocks rows, for Block Prompts."),
                IO.String.Output(display_name="schedule"),
                IO.String.Output(display_name="report"),
            ],
        )

    @classmethod
    def fingerprint_inputs(cls, plan, points, save_to_file, **kwargs):
        return hashlib.sha1((_points_fingerprint(plan, points) + "|%s" % save_to_file).encode("utf-8")).hexdigest()

    @classmethod
    def execute(cls, plan, points, save_to_file, model_3d, **kwargs):
        import trimesh
        p, EL, layer, routes = _electrical(plan, points)
        if save_to_file and (points or "").strip():
            old = open(layer.points_file, encoding="utf-8").read() if os.path.exists(layer.points_file) else None
            if old != points:
                with open(layer.points_file, "w", encoding="utf-8", newline="\n") as f:
                    f.write(points if points.endswith("\n") else points + "\n")
        scene = trimesh.load(model_3d.get_data(), file_type=(model_3d.format or "glb").lower(),
                             force="scene", process=False)
        room = _scene_meshes(scene, drop_prefix="\0")
        wiring = EL.wiring_parts(layer, routes)
        lights, rows = EL.light_parts(layer)
        _, sched = EL.schedule(layer, routes)
        errors, warnings = EL.check(layer, p.spec)
        key = hashlib.sha1((layer.text + _mtime(p.path) + str(len(room))).encode("utf-8")).hexdigest()[:16]
        f_all = _export(room + wiring, _temp("electrical_%s.glb" % key))
        f_wire = _export(wiring, _temp("electrical_%s_wiring.glb" % key))
        f_ids = _export([(n, _paint(m, (0, 0, 0))) for n, m in room] + lights, _temp("electrical_%s_lightids.glb" % key))
        report = "%d points, %d circuits\n%s\n%s" % (
            len(layer.points), len(routes), "\n".join("ERROR   " + e for e in errors) or "no errors",
            "\n".join("warning " + w for w in warnings))
        return IO.NodeOutput(Types.File3D(f_all), Types.File3D(f_wire), Types.File3D(f_ids), json.dumps(rows),
                             sched, report)


class MPWiringOverlay(IO.ComfyNode):
    @classmethod
    def define_schema(cls):
        return IO.Schema(
            node_id="MPWiringOverlay",
            display_name="Wiring Overlay (mpillow)",
            category="3d/mpillow",
            search_aliases=["electrician view", "wiring overlay"],
            description="Draws the electrical runs and points over a render, through the camera it was made from.",
            inputs=[
                IO.Image.Input("image"),
                IO.Load3DCamera.Input("camera"),
                IO.Load3DModelInfo.Input("model_info", optional=True),
                IO.Combo.Input("plan", options=_plans()),
                IO.String.Input("points", multiline=True, default="", tooltip="Empty = the plan's points file."),
                IO.Boolean.Input("labels", default=True),
            ],
            outputs=[IO.Image.Output()],
        )

    @classmethod
    def execute(cls, image, camera, plan, points, labels, model_info=None, **kwargs):
        import torch
        p, EL, layer, routes = _electrical(plan, points)
        xf = (lambda v: BL.apply_model_transform(np.asarray(v, float), model_info[0])) if model_info else None
        cam = BL.camera_from_info(camera, np.array([0.0, 1.5, 0.0]))
        out = []
        for i in range(image.shape[0]):
            out.append(torch.from_numpy(EL.overlay_render(image[i].cpu().numpy(), cam, layer, routes, labels, xf)))
        return IO.NodeOutput(torch.stack(out))


class MPElectricalSheets(IO.ComfyNode):
    @classmethod
    def define_schema(cls):
        return IO.Schema(
            node_id="MPElectricalSheets",
            display_name="Electrical Sheets (mpillow)",
            category="3d/mpillow",
            search_aliases=["electrical drawings", "lighting layout", "power layout", "db schedule"],
            description=(
                "E-01 lighting layout, E-02 power + data layout, E-03 DB schedule + single-line diagram, "
                "E-04 point schedule: A3 PNGs and one PDF in renders/electrical/, plus the points over the "
                "source floor plan. Design intent, to be verified and endorsed by an LEW."
            ),
            is_output_node=True,
            inputs=[
                IO.Combo.Input("plan", options=_plans()),
                IO.String.Input("points", multiline=True, default="", tooltip="Empty = the plan's points file."),
            ],
            outputs=[IO.Image.Output(display_name="sheets"), IO.String.Output(display_name="files")],
        )

    @classmethod
    def fingerprint_inputs(cls, plan, points, **kwargs):
        return _points_fingerprint(plan, points)

    @classmethod
    def execute(cls, plan, points, **kwargs):
        import torch
        from PIL import Image
        p, EL, layer, routes = _electrical(plan, points)
        files = EL.draw_sheets(p.spec, layer, routes, os.path.join(ROOT, "renders", "electrical"))
        if p.spec.get("source"):
            files.append(EL.plan_overlay(p.spec, layer, routes, os.path.join(
                ROOT, "renders", "electrical", p.name + "_on_plan.png")))
        imgs = []
        for f in files:
            if f.endswith(".png") and "_E-0" in f:
                im = Image.open(f).convert("RGB").resize((1654, 1169))
                imgs.append(torch.from_numpy(np.asarray(im, np.float32) / 255.0))
        return IO.NodeOutput(torch.stack(imgs), "\n".join(os.path.relpath(f, ROOT) for f in files))


class MPBlockingExtension(ComfyExtension):
    @override
    async def get_node_list(self):
        return [MPBlockLayout, MPBlockConditioning, MPProposeBlocks, MPBlockCropSource, MPBlockMask,
                MPMeshIntoBlock, MPElectricalLayout, MPWiringOverlay, MPElectricalSheets]


async def comfy_entrypoint():
    return MPBlockingExtension()
