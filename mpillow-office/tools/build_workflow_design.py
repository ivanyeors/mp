"""
Generate the DESIGN workflow: a plan's model with a movable furniture layer,
rendered from cameras you set, dressed by reference images per zone, then
corrected zone by zone (and block by block) with prompts.

    python tools/build_workflow_design.py                          # plans/midview-08-83.yaml
    python tools/build_workflow_design.py plans/<name>.yaml
    -> workflows/design_<name>_16x9.json (+ the ComfyUI sidebar)

Read left to right; each stage is one coloured group and shows only what you
edit. The plumbing is in subgraphs (double-click one to open it).

  1  REFERENCES        a folder per zone + a lighting folder; no prompts
  2  PLAN + 3D         the plan's model, parts to hide
  3  FURNITURE BLOCKS  BLOCKS on the canvas (the source of truth)
  4  CAMERAS           A, B, C (by numbers, or by hand in a viewer) and a top view
  5  FIRST PASS        all four cameras in ONE sampling pass (2 x 2 sheet), each
                       zone drawn from its own references, the lighting refs over
                       everything; then A, B, C refined at 1664 x 928
  6  INPAINT           per zone: a prompt + that zone's refs, redrawn inside the
                       zone only, in every camera; then optional named blocks
  7  OUTPUTS           first pass, finals, the sheet
  8  PROPOSE BLOCKS    renders -> new BLOCKS lines (SAM 3.1 + MoGe)       muted
  9  BLOCK -> 3D ASSET one block's pixels -> TRELLIS.2 -> its asset        muted

Why references per zone work without prompts: Text Encode Qwen Image 2.1
puts the reference into the conditioning as latents; a conditioning masked to
a zone is sampled in its own pass and only weighted into its zone's pixels,
so each zone is drawn from its own references only.
"""

import copy
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_massing as BM  # noqa: E402
import build_workflow as B  # noqa: E402
import build_workflow_fast as F  # noqa: E402
import spec as S  # noqa: E402
import wf  # noqa: E402

ROOT = B.ROOT
DEFAULT_SPEC = os.path.join(ROOT, "plans", "midview-08-83.yaml")
TRELLIS_TEMPLATE = "3d_pixal3d_trellis2_image_to_model.json"
node, inp, out, text, save = B.node, B.inp, B.out, B.text, B.save
Port = wf.Port
MUTED = B.MUTED

W, H = B.W, B.H                                   # 1664 x 928
PANEL_W, PANEL_H = 1024, 576
SHEET_W, SHEET_H = PANEL_W * 2, PANEL_H * 2       # 2048 x 1152: A B / C TOP
CAMS = ["A", "B", "C"]
SEEDS = {"sheet": 20261004, "refine": 20261005, "inpaint": 20261010, "block": 20261020}
REF_CAP, REF_COLS = 12, 4                         # a reference sheet: up to 12 images, 4 across (16:9)
REF_RES = 768                                     # reference pixel budget: lower = less copying
INPAINT_DENOISE = 0.5
BLOCK_DENOISE = 0.65
SAM3_FILE = "sam3.1_multiplex_fp16.safetensors"
MOGE_FILE = "moge_2_vitl_normal_fp16.safetensors"
PROPOSE_CLASSES = ("sofa:2, armchair:4, chair:6, bench:3, table:4, bed:3, shelf:4, cabinet:4, "
                   "workbench:2, counter:2, rug:2, plant:4")
STAGE = {1: "#2d4a3e", 2: "#2f4858", 3: "#2f4f58", 4: "#5a4a2f", 5: "#6a3f4a", 6: "#2f5a4a", 7: "#3f3f5a",
         8: "#4a2f5a", 9: "#4a2f5a"}

# Cameras by numbers, GLB frame (X east, Y up, Z south), metres. look_at:
# eye -> target, vertical fov. Defaults are for midview-08-83 (13.2 x 7.9 m
# shop floor, entry doors on the west wall, glazing GD2 on the east).
CAMERA_DEFAULTS = {
    "midview-08-83": {
        "A": ((0.9, 1.6, 2.1), (9.0, 0.9, 5.2), 65.0),       # from the entry, looking east
        "B": ((12.6, 1.6, 6.9), (3.0, 0.9, 3.0), 65.0),      # from the glazing, looking west
        "C": ((11.4, 3.1, 2.4), (3.0, 0.0, 6.0), 70.0),      # high corner by the WC, looking south-west
    },
}
TOP_FOV = 30.0

# ---- fixed text: inside the subgraphs, never edited on the canvas ----------
BASE_INSTRUCTION = (
    "A photorealistic architectural interior photograph of a custom pillow "
    "showroom, built exactly to the layout shown: keep every wall, column, "
    "window, door and every piece of furniture in precisely the position, size "
    "and proportion given, and keep exactly the same viewpoint. A real full-size "
    "room, NOT a scale model. Picture 1 is the lighting reference: match its "
    "light quality, colour temperature, contrast and mood."
)
DAY = " Daytime: soft natural daylight from the glazing, balanced with warm interior light."
NIGHT = (" Evening: the windows are dark; warm artificial light from the fittings, soft pools "
         "of light on the floor and walls, gentle shadows.")
SHEET_PROMPT = (
    "This picture is a contact sheet of four photographs of one and the same "
    "finished room, two by two: top left camera A, top right camera B, bottom "
    "left camera C, bottom right a straight top-down view. All four show exactly "
    "the same finishes, the same furniture pieces in the same places, the same "
    "light. "
)
REF_INSTRUCTION = (
    "Picture 1 is the design reference for this area of the room. Draw this "
    "area as a real, full-size interior photographed in exactly the style, "
    "materials, colours, finishes and furniture design shown in picture 1. Keep "
    "every wall, opening and piece of furniture where the layout puts it; do not "
    "copy the composition of picture 1."
)
INPAINT_SUFFIX = (
    " Match the materials, colours and finishes of picture 1 where they apply; "
    "keep the walls, the furniture positions, the viewpoint and the light."
)

# ---- stage 6 prompts: the details, per zone (edited on the canvas) ---------
ZONE_PROMPTS = {
    "01-shop-floor": (
        "The shop floor: waiting seats by the entry doors, fitting beds, the "
        "inventory wall of pale ash shelving, the workbench; warm sand plaster "
        "walls, pale grey epoxy floor."
    ),
    "02-wc": "A small WC: wall-hung basin and toilet, terrazzo tiles, warm light.",
    "03-patio": (
        "The patio outside the glazing: grey stone pavers, teak bench, potted "
        "plants, lockable outdoor storage, open sky above the parapet."
    ),
}

README = (
    "# %(plan)s -- design workflow\n\n"
    "**Read left to right. Each coloured group is one stage; edit only what is\n"
    "on the canvas. Double-click a subgraph to see its plumbing.**\n\n"
    "| stage | you edit |\n|---|---|\n"
    "| 1 REFERENCES | images in `ref-img/design/%(plan)s/zones/<zone>/` and `lighting/` -- no prompts |\n"
    "| 2 PLAN + 3D | plan (Block Layout), HIDE PARTS |\n"
    "| 3 FURNITURE BLOCKS | BLOCKS lines: place, size, `| prompt` per piece |\n"
    "| 4 CAMERAS | numbers per camera, or CAMERAS FROM VIEWERS + orbit |\n"
    "| 5 FIRST PASS | controls panel: seed, night, strengths, zoning |\n"
    "| 6 INPAINT | a prompt per zone (+ on, denoise, seed); BLOCKS to redo |\n"
    "| 7 OUTPUTS | nothing: `renders/design/%(plan)s_*` |\n\n"
    "Muted: 8 PROPOSE BLOCKS (SAM 3.1 + MoGe), 9 BLOCK -> 3D ASSET (TRELLIS.2).\n\n"
    "Built with `python tools/build_workflow_design.py %(spec)s`."
)
NOTE_REFS = (
    "## References\n\n"
    "One folder per zone, one for the lighting. Drop images in; up to %d per\n"
    "folder are tiled into one sheet (4 across). No prompts here: each zone is\n"
    "drawn from its own sheet, inside its own pixels only. The lighting sheet\n"
    "conditions the whole frame, so the zones share one light.\n\n"
    "A folder must hold at least one image.\n\n"
    "Too literal (the reference's layout shows up)? Lower **REF RESOLUTION**\n"
    "or **ZONE STRENGTH** in stage 5." % REF_CAP
)
NOTE_BLOCKS = (
    "## BLOCKS\n\n"
    "```\nname  x= z= w= d= h= [y=] [rot=] [shape=] [arot=] [asset=]  | prompt\n```\n"
    "- **x z** centre of the footprint, **w** along X (east), **d** along Z (south),\n"
    "  **h** up; metres, origin = outer faces of the west and north walls.\n"
    "- **y** base height (wall cabinets), **rot** degrees counter-clockwise from above.\n"
    "- Drawn as a silhouette from its name (sofa, chair, bed, table, bench, shelf,\n"
    "  cabinet, rug, plant; else a box) or `shape=`; it faces north (-Z) at rot 0.\n"
    "- **| prompt** is drawn only on that block's pixels.\n"
    "- An asset made in 9 replaces the box automatically; **asset=none** = box;\n"
    "  **arot** turns the asset inside its box.\n"
    "- Block Layout writes the lines to the plan's blocks file, which\n"
    "  `build_massing.py` and the Admin Panel's Showroom Model page read.\n\n"
    "Block colours in the block-ID pass follow line order: insert new blocks\n"
    "at the end to keep the others' colours."
)
NOTE_CAMERAS = (
    "## Cameras\n\n"
    "**By numbers** (default): each Create Camera Info is `look_at` -- the\n"
    "eye position and the target, GLB frame (X east, Y up, Z south), metres,\n"
    "and the vertical fov.\n\n"
    "**By hand**: set **CAMERAS FROM VIEWERS** to true, orbit / pan / zoom\n"
    "each viewer, Run.\n\n"
    "**Top** is fixed and fills the fourth panel of the sheet: it pins the\n"
    "layout for the other three.\n\n"
    "Each camera renders depth, zone-ID and block-ID at 1664 x 928 (the strip\n"
    "next to it, left to right)."
)
NOTE_FIRST = (
    "## First pass\n\n"
    "The four depth passes are tiled into one 2048 x 1152 sheet and sampled\n"
    "ONCE, so every camera gets the same design. Each zone is conditioned by\n"
    "its reference sheet inside its own pixels; the lighting sheet and the\n"
    "day / night line sit underneath, over the whole frame; each block's\n"
    "`| prompt` is drawn on its own pixels. A, B, C are then cut out,\n"
    "upscaled and refined (last two turbo steps).\n\n"
    "- **SEED** a new design for every camera.\n"
    "- **ZONING** false: lighting references only (fast look-dev).\n"
    "- **ZONE STRENGTH** how hard each zone follows its references.\n"
    "- **LIGHT STRENGTH** the lighting layer underneath.\n"
    "- **REF RESOLUTION** lower = looser, less copying of the references."
)
NOTE_INPAINT = (
    "## Inpaint\n\n"
    "Each zone node redraws its zone in A, B and C: the zone's pixels\n"
    "(from the zone-ID pass, grown and feathered) are re-noised and drawn\n"
    "again from **your prompt + the zone's reference sheet**, depth locked;\n"
    "everything outside the mask is kept exactly.\n\n"
    "- **enabled** off: the image passes through (nothing is sampled).\n"
    "- **denoise** 0.3 touch-up, 0.5 redraw details, 0.8 new design.\n"
    "- **seed** the same for all three cameras, so they agree.\n"
    "- **grow** pixels added round the zone (seams).\n\n"
    "Zones run in order (1, 2, 3), then **BLOCKS** redoes the named\n"
    "pieces (comma separated names from BLOCKS) with their own prompt."
)
NOTE_PROPOSE = (
    "## Propose blocks (muted)\n\n"
    "Un-mute this group once `%s` (checkpoints) and `%s`\n"
    "(geometry_estimation) are installed.\n\n"
    "For each render: SAM 3.1 finds every class in the list (`:N` = at most N\n"
    "per view), MoGe estimates depth, the depth is aligned to the known room\n"
    "(same camera, metric), and each find is back-projected and boxed on the\n"
    "floor. Finds seen from several cameras are merged, whatever each called\n"
    "them. Finds on an existing block are listed under `# already in BLOCKS`;\n"
    "pendants and blobs over several pieces are listed as `# dropped`.\n\n"
    "Copy the lines you want into BLOCKS (stage 3). Orange boxes in the\n"
    "viewer are the proposals." % (SAM3_FILE, MOGE_FILE)
)
NOTE_ASSET = (
    "## Block -> 3D asset (muted)\n\n"
    "Un-mute this group once the TRELLIS.2 files are installed (README).\n\n"
    "1. **ASSET BLOCK**: the block's name.\n"
    "2. Block Crop Source picks the camera where that block is largest and its\n"
    "   mask from the block-ID pass.\n"
    "3. TRELLIS.2 (ComfyUI's own template chain) makes a textured mesh.\n"
    "4. Mesh Into Block saves it as `model/assets/<plan>/<block>.glb`. From the\n"
    "   next Run, Block Layout fits it into the block's box everywhere.\n\n"
    "Best results: frame camera C close on the piece (three-quarter, from the\n"
    "front) and set Block Crop Source `view` to 3. A piece that is 1 % of a\n"
    "wide shot gives a blurry crop and a shallow mesh.\n\n"
    "Front facing the wrong way? Add `arot=90` (or 180, 270) on the block's line."
)


def load_plan(path):
    spec = S.load(path)
    out_ = spec.get("output") or {}
    base = out_.get("base", spec["name"])
    blocks_file = S.resolve_path(spec, spec["blocks"]) if spec.get("blocks") else None
    blocks = open(blocks_file, encoding="utf-8").read() if blocks_file and os.path.exists(blocks_file) else ""
    zones = [(z["slug"], z.get("label", z["slug"])) for z in spec.get("zones") or []]
    parts, _, _ = BM.build(spec)
    import trimesh
    lo, hi = trimesh.util.concatenate(list(parts.values())).bounds
    if spec.get("mirror_z") is not None:
        mz = S.ev(spec["mirror_z"], spec["_env"])
        lo[2], hi[2] = mz - hi[2], mz - lo[2]
    el = spec.get("electrical") or {}
    pf = S.resolve_path(spec, el["points"]) if el.get("points") else None
    points = open(pf, encoding="utf-8").read() if pf and os.path.exists(pf) else ""
    return dict(name=spec["name"], base=base, file=os.path.basename(path), blocks=blocks, zones=zones,
                lo=lo, hi=hi, cutaway=spec.get("cutaway") or [], electrical=bool(el), points=points)


def trellis_template():
    import comfyui_workflow_templates_json as T
    path = os.path.join(os.path.dirname(T.__file__), "templates", TRELLIS_TEMPLATE)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def ref_folders(plan, zones):
    """ref-img/design/<plan>/zones/<slug>/ per zone + lighting/. Missing ones
    are created (empty -- a folder loader needs at least one image)."""
    base = os.path.join(B.REF_ABS, "design", plan)
    dirs = [os.path.join(base, "zones", slug) for slug, _ in zones] + [os.path.join(base, "lighting")]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
        if not any(f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")) for f in os.listdir(d)):
            print("NOTE:   %s is empty -- add at least one reference image" % os.path.relpath(d, ROOT))
    return dirs


# ============================================================ subgraphs ====
# Each returns a wf.Subgraph. Inputs with a default are widgets on the
# instance (one value per instance); the rest are sockets.

def sg_ref_sheet(g):
    sg = g.subgraph("Reference sheet", [("folder", "STRING", "")], [("sheet", "IMAGE")],
                    "A folder of reference images, tiled 4 across into one 16:9 sheet.")
    ld = sg.add(node(sg.new(), "LoadImagesFromFolderKJ", (0, 0), (360, 250),
                     ["", B.TILE_W, B.TILE_H, "crop", REF_CAP, 0, False],
                     inputs=[inp("folder", "STRING", widget=True)],
                     outputs=[out("image", "IMAGE"), out("mask", "MASK"), out("count", "INT"),
                              out("image_path", "STRING")], title="the folder"))
    gr = sg.add(node(sg.new(), "ImageConcatFromBatch", (400, 0), (300, 110), [REF_COLS, False, 4096],
                     inputs=[inp("images", "IMAGE")], outputs=[out("IMAGE", "IMAGE")], title="tile, 4 across"))
    pd = sg.add(node(sg.new(), "ResizeAndPadImage", (400, 150), (300, 130), [PANEL_W, PANEL_H, "white", "lanczos"],
                     inputs=[inp("image", "IMAGE")], outputs=[out("IMAGE", "IMAGE")], title="pad to 16:9"))
    sg.link(sg.port("folder"), 0, ld, 0, "STRING")
    sg.link(ld, 0, gr, 0, "IMAGE")
    sg.link(gr, 0, pd, 0, "IMAGE")
    sg.ret("sheet", pd)
    return sg


def sg_model(g):
    sg = g.subgraph("Model: hide parts",
                    [("parts", "STRING"), ("model_3d", "FILE_3D"), ("zone_ids_3d", "FILE_3D"),
                     ("block_ids_3d", "FILE_3D")],
                    [("model_3d", "FILE_3D"), ("mesh", "MESH"), ("zone_mesh", "MESH"), ("block_mesh", "MESH")],
                    "The three models (model, zone-ID, block-ID) with the same parts hidden, and their meshes.")
    for k, (name, title) in enumerate([("model_3d", "model"), ("zone_ids_3d", "zone-ID model"),
                                       ("block_ids_3d", "block-ID model")]):
        f = sg.add(node(sg.new(), "MPGLBPartFilter", (0, k * 200), (290, 150), ["none", "", "hide"],
                        inputs=[inp("parts", "STRING", widget=True), inp("model_3d", "FILE_3D", optional=True)],
                        outputs=[out("model_3d", "FILE_3D"), out("all_parts", "STRING"),
                                 out("affected", "STRING"), out("visible_count", "INT")],
                        title="%s, parts hidden" % title))
        c = sg.add(node(sg.new(), "Get3DComponents", (330, k * 200), (300, 60), [],
                        inputs=[inp("model_3d", "FILE_3D")], outputs=[out("mesh", "MESH")], title="mesh: %s" % title))
        sg.link(sg.port("parts"), 0, f, 0, "STRING")
        sg.link(sg.port(name), 0, f, 1, "FILE_3D")
        sg.link(f, 0, c, 0, "FILE_3D")
        if k == 0:
            sg.ret("model_3d", f)
        sg.ret(["mesh", "zone_mesh", "block_mesh"][k], c)
    return sg


def sg_camera(g):
    sg = g.subgraph("Camera passes",
                    [("by_numbers", "LOAD3D_CAMERA"), ("by_hand", "LOAD3D_CAMERA"),
                     ("by_hand_transform", "LOAD3D_MODEL_INFO"), ("from_viewers", "BOOLEAN", False),
                     ("mesh", "MESH"), ("zone_mesh", "MESH"), ("block_mesh", "MESH"), ("light_mesh", "MESH")],
                    [("camera", "LOAD3D_CAMERA"), ("model_info", "LOAD3D_MODEL_INFO"), ("depth", "IMAGE"),
                     ("zone_ids", "IMAGE"), ("block_ids", "IMAGE"), ("light_ids", "IMAGE"), ("passes", "IMAGE")],
                    "One camera (by numbers or from its viewer) -> depth, zone-ID, block-ID and light-ID passes.")
    sw = sg.add(node(sg.new(), "ComfySwitchNode", (0, 0), (320, 100), [False],
                     inputs=[inp("on_false", "LOAD3D_CAMERA", optional=True),
                             inp("on_true", "LOAD3D_CAMERA", optional=True), inp("switch", "BOOLEAN", widget=True)],
                     outputs=[out("output", "LOAD3D_CAMERA")], title="camera"))
    si = sg.add(node(sg.new(), "ComfySwitchNode", (0, 140), (320, 100), [False],
                     inputs=[inp("on_false", "LOAD3D_MODEL_INFO", optional=True),
                             inp("on_true", "LOAD3D_MODEL_INFO", optional=True), inp("switch", "BOOLEAN", widget=True)],
                     outputs=[out("output", "LOAD3D_MODEL_INFO")], title="model transform (viewer only)"))
    sg.link(sg.port("by_numbers"), 0, sw, 0, "LOAD3D_CAMERA")
    sg.link(sg.port("by_hand"), 0, sw, 1, "LOAD3D_CAMERA")
    sg.link(sg.port("from_viewers"), 0, sw, 2, "BOOLEAN")
    sg.link(sg.port("by_hand_transform"), 0, si, 1, "LOAD3D_MODEL_INFO")
    sg.link(sg.port("from_viewers"), 0, si, 2, "BOOLEAN")
    sg.ret("camera", sw)
    sg.ret("model_info", si)
    passes = []
    for k, (mesh, mode, name) in enumerate([("mesh", "depth", "depth"), ("zone_mesh", "vertex colors", "zone_ids"),
                                            ("block_mesh", "vertex colors", "block_ids"),
                                            ("light_mesh", "vertex colors", "light_ids")]):
        rm = sg.add(node(sg.new(), "RenderMesh", (360 + k * 330, 0), (310, 200), [mode, W, H, "#000000"],
                         inputs=[inp("mesh", "MESH"), inp("model_3d_info", "LOAD3D_MODEL_INFO", optional=True),
                                 inp("camera_info", "LOAD3D_CAMERA", optional=True)],
                         outputs=[out("image", "IMAGE"), out("mask", "MASK")], title=name))
        sg.link(sg.port(mesh), 0, rm, 0, "MESH")
        sg.link(si, 0, rm, 1, "LOAD3D_MODEL_INFO")
        sg.link(sw, 0, rm, 2, "LOAD3D_CAMERA")
        sg.ret(name, rm)
        passes.append(rm)
    sg.ret("passes", sg.batch((360, 260), passes))
    return sg


def sg_tile(g, method):
    sg = g.subgraph("2 x 2 sheet (%s)" % method,
                    [(n, "IMAGE") for n in ("a", "b", "c", "top")], [("sheet", "IMAGE")],
                    "Four passes scaled to %d x %d and tiled A B / C TOP." % (PANEL_W, PANEL_H))
    tiles = [sg.scale((0, k * 130), sg.port(n), PANEL_W, PANEL_H, method, "tile " + n)
             for k, n in enumerate(("a", "b", "c", "top"))]
    sg.ret("sheet", sg.tile((360, 0), tiles, 2, "sheet %d x %d" % (SHEET_W, SHEET_H)))
    return sg


def _shared_inputs(*names):
    types = {"model": "MODEL", "patch": "MODEL_PATCH", "vae": "VAE", "sampler": "SAMPLER", "clip": "CLIP"}
    return [(n, types[n]) for n in names]


def _bind(sg, *names):
    """Point the turbo-stack helpers at the subgraph's inputs."""
    attr = {"model": "UNET", "patch": "PATCH", "vae": "VAE", "sampler": "SAMPLER", "clip": "CLIP"}
    for n in names:
        setattr(sg, attr[n], sg.port(n))


def sg_lighting(g):
    sg = g.subgraph("Lighting conditioning",
                    _shared_inputs("clip", "vae") + [("lighting", "IMAGE"), ("night", "BOOLEAN", False),
                                                     ("ref_resolution", "INT", REF_RES)],
                    [("sheet", "CONDITIONING"), ("single", "CONDITIONING")],
                    "The whole-frame layer: the base instruction + day or night + the lighting reference sheet.")
    _bind(sg, "clip", "vae")
    base = sg.add(text(sg.new(), (0, 0), (420, 200), BASE_INSTRUCTION, "base instruction"))
    day = sg.add(text(sg.new(), (0, 240), (420, 100), DAY, "day"))
    night = sg.add(text(sg.new(), (0, 380), (420, 100), NIGHT, "night"))
    sheet = sg.add(text(sg.new(), (0, 520), (420, 160), SHEET_PROMPT, "sheet framing"))
    sw = sg.add(node(sg.new(), "ComfySwitchNode", (460, 240), (240, 100), [False],
                     inputs=[inp("on_false", "STRING", optional=True), inp("on_true", "STRING", optional=True),
                             inp("switch", "BOOLEAN", widget=True)],
                     outputs=[out("output", "STRING")], title="day / night"))
    sg.link(day, 0, sw, 0, "STRING")
    sg.link(night, 0, sw, 1, "STRING")
    sg.link(sg.port("night"), 0, sw, 2, "BOOLEAN")
    single = sg.add(B.concat(sg.new(), (740, 0), "", "", "instruction + light"))
    sg.link(base, 0, single, 0, "STRING")
    sg.link(sw, 0, single, 1, "STRING")
    both = sg.add(B.concat(sg.new(), (740, 520), "", "", "sheet + instruction + light"))
    sg.link(sheet, 0, both, 0, "STRING")
    sg.link(single, 0, both, 1, "STRING")
    res = sg.port("ref_resolution")
    e1 = sg.encode((1200, 0), "single view + lighting sheet", single, images=(sg.port("lighting"),), resolution=res)
    e2 = sg.encode((1200, 520), "sheet + lighting sheet", both, images=(sg.port("lighting"),), resolution=res)
    sg.ret("single", e1)
    sg.ret("sheet", e2)
    return sg


def sg_zone_ref(g):
    sg = g.subgraph("Zone reference conditioning",
                    _shared_inputs("clip", "vae") + [("reference", "IMAGE"), ("ref_resolution", "INT", REF_RES)],
                    [("conditioning", "CONDITIONING")],
                    "A zone's reference sheet with a fixed instruction -- no prompt to write.")
    _bind(sg, "clip", "vae")
    t = sg.add(text(sg.new(), (0, 0), (420, 220), REF_INSTRUCTION, "fixed instruction"))
    sg.ret("conditioning", sg.encode((460, 0), "reference -> conditioning", t, images=(sg.port("reference"),),
                                     resolution=sg.port("ref_resolution")))
    return sg


def sg_scene(g, zones):
    zin = [("zone_%d" % (k + 1), "CONDITIONING") for k in range(len(zones))]
    sg = g.subgraph("Scene conditioning (%d zones)" % len(zones),
                    _shared_inputs("clip") + [("lighting", "CONDITIONING")] + zin +
                    [("zone_ids", "IMAGE"), ("block_ids", "IMAGE"), ("blocks_json", "STRING"),
                     ("light_ids", "IMAGE"), ("lights_json", "STRING"),
                     ("zoning", "BOOLEAN", True), ("light_strength", "FLOAT", B.GLOBAL_STRENGTH),
                     ("zone_strength", "FLOAT", B.ZONE_STRENGTH), ("block_prompts", "BOOLEAN", True),
                     ("fixture_glow", "BOOLEAN", True)],
                    [("conditioning", "CONDITIONING"), ("report", "STRING")],
                    "Lighting over the frame, each zone's references in its zone, each block's prompt on its "
                    "pixels, each light fitting's glow at its fitting.")
    _bind(sg, "clip")
    sg.FULL_MASK = sg.add(node(sg.new(), "SolidMask", (0, -160), (300, 110), [1.0, W, H],
                               outputs=[out("MASK", "MASK")], title="whole frame (any size)"))
    sg.area_cond = [sg.port(n) for n, _ in zin]
    sg.ZONING = sg.port("zoning")
    zc = sg.zoned((0, 0), sg.port("lighting"), sg.port("zone_ids"), "zones (ZONING switch)", zones=zones,
                  global_strength=sg.port("light_strength"), zone_strength=sg.port("zone_strength"))
    bc = sg.add(node(sg.new(), "MPBlockConditioning", (960, 0), (360, 200), [1.0, True, 400],
                     inputs=[inp("clip", "CLIP"), inp("conditioning", "CONDITIONING"), inp("block_ids", "IMAGE"),
                             inp("blocks_json", "STRING"), inp("enabled", "BOOLEAN", widget=True)],
                     outputs=[out("CONDITIONING", "CONDITIONING"), out("report", "STRING")],
                     title="block prompts (each block's | prompt)"))
    sg.link(sg.CLIP, 0, bc, 0, "CLIP")
    sg.link(zc, 0, bc, 1, "CONDITIONING")
    sg.link(sg.port("block_ids"), 0, bc, 2, "IMAGE")
    sg.link(sg.port("blocks_json"), 0, bc, 3, "STRING")
    sg.link(sg.port("block_prompts"), 0, bc, 4, "BOOLEAN")
    gl = sg.add(node(sg.new(), "MPBlockConditioning", (1360, 0), (360, 200), [1.0, True, 30],
                     inputs=[inp("clip", "CLIP"), inp("conditioning", "CONDITIONING"), inp("block_ids", "IMAGE"),
                             inp("blocks_json", "STRING"), inp("enabled", "BOOLEAN", widget=True)],
                     outputs=[out("CONDITIONING", "CONDITIONING"), out("report", "STRING")],
                     title="fixture glow (each light's note, at the fitting)"))
    sg.link(sg.CLIP, 0, gl, 0, "CLIP")
    sg.link(bc, 0, gl, 1, "CONDITIONING")
    sg.link(sg.port("light_ids"), 0, gl, 2, "IMAGE")
    sg.link(sg.port("lights_json"), 0, gl, 3, "STRING")
    sg.link(sg.port("fixture_glow"), 0, gl, 4, "BOOLEAN")
    sg.ret("conditioning", gl)
    sg.ret("report", bc, 1)
    return sg


def sg_sheet_sample(g):
    sg = g.subgraph("First pass sampler (sheet)",
                    _shared_inputs("model", "patch", "vae", "sampler") +
                    [("conditioning", "CONDITIONING"), ("depth", "IMAGE"), ("seed", "INT", SEEDS["sheet"])],
                    [("image", "IMAGE")],
                    "Six turbo steps on the 2048 x 1152 sheet, depth locked.")
    _bind(sg, "model", "patch", "vae", "sampler")
    sig = sg.sigmas_node((0, 0), F.RAW_FULL, SHEET_W, SHEET_H, "sigmas 6 steps @ %d x %d" % (SHEET_W, SHEET_H))
    m = sg.depth_lock((0, 120), sg.port("depth"), "depth lock (Fun ControlNet)")
    lat = sg.empty_latent((0, 340), SHEET_W, SHEET_H, "empty latent %d x %d" % (SHEET_W, SHEET_H))
    sg.ret("image", sg.sample((400, 0), m, sg.port("conditioning"), lat, sig, sg.port("seed"), "one pass, four cameras"))
    return sg


def sg_refine(g):
    sg = g.subgraph("Refine one camera",
                    _shared_inputs("model", "patch", "vae", "sampler") +
                    [("sheet", "IMAGE"), ("conditioning", "CONDITIONING"), ("depth", "IMAGE"),
                     ("seed", "INT", SEEDS["refine"]), ("panel_x", "INT", 0), ("panel_y", "INT", 0)],
                    [("image", "IMAGE")],
                    "Cut a panel out of the sheet, upscale to %d x %d, last two turbo steps." % (W, H))
    _bind(sg, "model", "patch", "vae", "sampler")
    c = sg.add(node(sg.new(), "ImageCrop", (0, 0), (320, 130), [PANEL_W, PANEL_H, 0, 0],
                    inputs=[inp("image", "IMAGE"), inp("x", "INT", widget=True), inp("y", "INT", widget=True)],
                    outputs=[out("IMAGE", "IMAGE")], title="the camera's panel"))
    sg.link(sg.port("sheet"), 0, c, 0, "IMAGE")
    sg.link(sg.port("panel_x"), 0, c, 1, "INT")
    sg.link(sg.port("panel_y"), 0, c, 2, "INT")
    up = sg.scale((0, 170), c, W, H, "lanczos", "upscale to %d x %d" % (W, H))
    en = sg.vae_encode((0, 310), up)
    sig = sg.sigmas_node((0, 400), F.RAW_REFINE, W, H, "sigmas refine (2 steps) @ %d x %d" % (W, H))
    m = sg.depth_lock((360, 0), sg.port("depth"), "depth lock")
    sg.ret("image", sg.sample((360, 220), m, sg.port("conditioning"), en, sig, sg.port("seed"), "refine (2 steps)"))
    return sg


def sg_inpaint(g, title, desc, zone_rgb=None, denoise=INPAINT_DENOISE, seed=SEEDS["inpaint"], enabled=True):
    """Inpaint the same area in A, B and C. zone_rgb: the zone's ID colour
    (mask from the zone-ID pass, with a reference sheet); None: named blocks
    (mask from the block-ID pass, prompt only)."""
    zone = zone_rgb is not None
    ins = _shared_inputs("model", "patch", "vae", "sampler", "clip")
    ins += [("reference", "IMAGE")] if zone else [("blocks_json", "STRING")]
    for c in "abc":
        ins += [("image_" + c, "IMAGE"), ("ids_" + c, "IMAGE"), ("depth_" + c, "IMAGE")]
    ins += [("prompt", "STRING")] + ([] if zone else [("blocks", "STRING")])
    ins += [("enabled", "BOOLEAN", enabled), ("denoise", "FLOAT", denoise), ("seed", "INT", seed),
            ("grow", "INT", 12 if zone else 8)]
    if zone:
        ins += [("ref_resolution", "INT", REF_RES)]
    sg = g.subgraph(title, ins, [("image_" + c, "IMAGE") for c in "abc"], desc)
    _bind(sg, "model", "patch", "vae", "sampler", "clip")

    if zone:
        suffix = sg.add(text(sg.new(), (0, 0), (420, 120), INPAINT_SUFFIX, "fixed: follow picture 1"))
        prompt = sg.add(B.concat(sg.new(), (0, 160), "", "", "your prompt + follow picture 1"))
        sg.link(sg.port("prompt"), 0, prompt, 0, "STRING")
        sg.link(suffix, 0, prompt, 1, "STRING")
        cond = sg.encode((0, 330), "prompt + zone reference", prompt, images=(sg.port("reference"),),
                         resolution=sg.port("ref_resolution"))
    else:
        cond = sg.encode((0, 330), "prompt", sg.port("prompt"))
    full = sg.sigmas_node((0, 530), F.RAW_FULL, W, H, "sigmas 6 steps @ %d x %d" % (W, H))
    split = sg.add(node(sg.new(), "SplitSigmasDenoise", (0, 650), (320, 100), [denoise],
                        inputs=[inp("sigmas", "SIGMAS"), inp("denoise", "FLOAT", widget=True)],
                        outputs=[out("high_sigmas", "SIGMAS"), out("low_sigmas", "SIGMAS")], title="denoise"))
    sg.link(full, 0, split, 0, "SIGMAS")
    sg.link(sg.port("denoise"), 0, split, 1, "FLOAT")

    for j, c in enumerate("abc"):
        x, y = 480, j * 760
        img, ids, depth = sg.port("image_" + c), sg.port("ids_" + c), sg.port("depth_" + c)
        if zone:
            cm = sg.add(node(sg.new(), "ColorToMask", (x, y), (300, 130),
                             [False, (zone_rgb >> 16) & 255, (zone_rgb >> 8) & 255, zone_rgb & 255,
                              wf.MASK_THRESHOLD, 16],
                             inputs=[inp("images", "IMAGE")], outputs=[out("MASK", "MASK")],
                             title="%s: the zone" % c.upper()))
            sg.link(ids, 0, cm, 0, "IMAGE")
        else:
            cm = sg.add(node(sg.new(), "MPBlockMask", (x, y), (300, 130), ["", 0],
                             inputs=[inp("block_ids", "IMAGE"), inp("blocks_json", "STRING"),
                                     inp("block", "STRING", widget=True)],
                             outputs=[out("mask", "MASK"), out("report", "STRING")],
                             title="%s: the blocks" % c.upper()))
            sg.link(ids, 0, cm, 0, "IMAGE")
            sg.link(sg.port("blocks_json"), 0, cm, 1, "STRING")
            sg.link(sg.port("blocks"), 0, cm, 2, "STRING")
        gm = sg.add(node(sg.new(), "GrowMaskWithBlur", (x, y + 170), (300, 250),
                         [12, 0.0, True, False, 6.0, 1.0, 1.0, False],
                         inputs=[inp("mask", "MASK"), inp("expand", "INT", widget=True)],
                         outputs=[out("mask", "MASK"), out("mask_inverted", "MASK")], title="grow + feather"))
        sg.link(cm, 0, gm, 0, "MASK")
        sg.link(sg.port("grow"), 0, gm, 1, "INT")
        en = sg.vae_encode((x + 340, y), img)
        nm = sg.add(node(sg.new(), "SetLatentNoiseMask", (x + 340, y + 90), (300, 60), [],
                         inputs=[inp("samples", "LATENT"), inp("mask", "MASK")],
                         outputs=[out("LATENT", "LATENT")], title="only inside the mask"))
        sg.link(en, 0, nm, 0, "LATENT")
        sg.link(gm, 0, nm, 1, "MASK")
        m = sg.depth_lock((x + 340, y + 190), depth, "%s: depth lock + inpaint context" % c.upper(),
                          inpaint_src=img, mask_src=gm)
        dec = sg.sample((x + 720, y), m, cond, nm, Port(split, 1), sg.port("seed"), "%s: redraw" % c.upper())
        comp = sg.add(node(sg.new(), "ImageCompositeMasked", (x + 1080, y), (300, 170), [0, 0, False],
                           inputs=[inp("destination", "IMAGE"), inp("source", "IMAGE"),
                                   inp("mask", "MASK", optional=True)],
                           outputs=[out("IMAGE", "IMAGE")], title="%s: keep everything outside" % c.upper()))
        sg.link(img, 0, comp, 0, "IMAGE")
        sg.link(dec, 0, comp, 1, "IMAGE")
        sg.link(gm, 0, comp, 2, "MASK")
        sw = sg.add(node(sg.new(), "ComfySwitchNode", (x + 1080, y + 210), (240, 100), [True],
                         inputs=[inp("on_false", "IMAGE", optional=True), inp("on_true", "IMAGE", optional=True),
                                 inp("switch", "BOOLEAN", widget=True)],
                         outputs=[out("output", "IMAGE")], title="%s: enabled?" % c.upper()))
        sg.link(img, 0, sw, 0, "IMAGE")
        sg.link(comp, 0, sw, 1, "IMAGE")
        sg.link(sg.port("enabled"), 0, sw, 2, "BOOLEAN")
        sg.ret("image_" + c, sw)
    return sg


# ================================================================ main =====

def main():
    spec_path = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SPEC
    P = load_plan(spec_path)
    plan = P["name"]
    out_path = os.path.join(ROOT, "workflows", "design_%s_16x9.json" % plan)
    zone_list = P["zones"] or [("whole", "whole")]
    zones = B.ZONES[:len(zone_list)]
    cx, cz = (P["lo"][0] + P["hi"][0]) / 2, (P["lo"][2] + P["hi"][2]) / 2
    span = max(P["hi"][0] - P["lo"][0], (P["hi"][2] - P["lo"][2]) * W / H)
    top_eye = (cx, span / 2 / (0.268 * W / H) * 1.05, cz + 0.01)    # tan(15 deg) = 0.268
    cams = CAMERA_DEFAULTS.get(plan) or {
        k: ((P["lo"][0] + 0.8 + i * 1.0, 1.6, P["lo"][2] + 0.8), (cx, 0.9, cz), 65.0)
        for i, k in enumerate(CAMS)}
    folders = ref_folders(plan, zone_list)
    out_prefix = "%s/design/%s" % (B.OUT_PREFIX, plan)

    g = wf.Graph()
    new, add, link, group = g.new, g.add, g.link, g.group

    def wire(src, inst, sg, name, typ, slot=0):
        link(src, slot, inst, sg.index_in(name), typ)

    def port(inst, sg, name):
        return Port(inst, sg.index_out(name))

    def preview(pos, size, src, title):
        p = add(node(new(), "PreviewImage", pos, size, [], inputs=[inp("images", "IMAGE")], title=title))
        link(src, 0, p, 0, "IMAGE")
        return p

    def prim(kind, pos, value, title, width=420):
        typ = {"PrimitiveBoolean": "BOOLEAN", "PrimitiveInt": "INT", "PrimitiveFloat": "FLOAT",
               "PrimitiveString": "STRING"}[kind]
        wv = [value, "fixed"] if kind == "PrimitiveInt" else [value]
        return add(node(new(), kind, pos, (width, 60), wv, outputs=[out(typ, typ)], title=title))

    SG = dict(ref=sg_ref_sheet(g), model=sg_model(g), camera=sg_camera(g), lanczos=sg_tile(g, "lanczos"),
              nearest=sg_tile(g, "nearest-exact"), light=sg_lighting(g), zref=sg_zone_ref(g),
              scene=sg_scene(g, zones), sheet=sg_sheet_sample(g), refine=sg_refine(g))

    Y0 = -1080
    add(node(1, "MarkdownNote", (-3040, Y0 - 760), (1500, 700),
             [README % {"plan": plan, "spec": os.path.relpath(spec_path, ROOT).replace("\\", "/")}],
             title="READ ME  --  where to edit"))

    # ======================= 1  REFERENCES =================================
    X1 = -3040
    REF = []
    rows = [("ZONE %d  %s  (%s)" % (k + 1, slug, zones[k][0]), folders[k]) for k, (slug, _) in enumerate(zone_list)]
    rows.append(("LIGHTING  (whole frame)", folders[-1]))
    for k, (label, folder) in enumerate(rows):
        y = Y0 + 60 + k * 440
        r = g.instance(SG["ref"], (X1 + 20, y), (460, 100), "1.%d  %s" % (k + 1, label), {"folder": folder})
        preview((X1 + 500, y), (640, 400), r, "1.%d  the sheet it sees" % (k + 1))
        REF.append(r)
    LIGHT_REF, ZONE_REF = REF[-1], REF[:-1]
    add(node(new(), "MarkdownNote", (X1 + 20, Y0 + 180), (460, 360), [NOTE_REFS], title="1.0  References, how"))
    h1 = 60 + len(rows) * 440
    group("1  REFERENCES  --  a folder per zone + lighting;  no prompts", X1 - 20, Y0 - 20, 1200, h1, STAGE[1])

    # ======================= 2  PLAN + 3D ==================================
    X2 = X1 + 1220
    layout = add(node(new(), "MPBlockLayout", (X2 + 20, Y0 + 60), (420, 160), [P["file"], "", True],
                      inputs=[inp("blocks", "STRING", widget=True)],
                      outputs=[out("model_3d", "FILE_3D"), out("zone_ids_3d", "FILE_3D"),
                               out("block_ids_3d", "FILE_3D"), out("blocks_json", "STRING"), out("report", "STRING")],
                      title="2.1  Block Layout  (plan + BLOCKS from 3)"))
    BLOCKS_JSON = Port(layout, 3)
    hide_default = "# one part name per line, * ? wildcards -- e.g. a cutaway:\n" + "".join(
        "# %s\n" % c for c in P["cutaway"])
    t_hide = add(text(new(), (X2 + 20, Y0 + 260), (420, 220), hide_default, "2.2  HIDE PARTS  (all three models)"))
    mdl = g.instance(SG["model"], (X2 + 20, Y0 + 520), (420, 140), "2.3  model, parts hidden")
    link(t_hide, 0, mdl, SG["model"].index_in("parts"), "STRING")
    for k, nm in enumerate(["model_3d", "zone_ids_3d", "block_ids_3d"]):
        link(layout, k, mdl, SG["model"].index_in(nm), "FILE_3D")
    MODEL3D = port(mdl, SG["model"], "model_3d")
    MESHES = [port(mdl, SG["model"], n) for n in ("mesh", "zone_mesh", "block_mesh")]
    viewer_io = dict(inputs=[inp("model_3d", "FILE_3D"), inp("model_3d_info", "LOAD3D_MODEL_INFO", optional=True),
                             inp("camera_info", "LOAD3D_CAMERA", optional=True)],
                     outputs=[out("model_3d", "FILE_3D"), out("model_3d_info", "LOAD3D_MODEL_INFO"),
                              out("camera_info", "LOAD3D_CAMERA"), out("width", "INT"), out("height", "INT")])
    ov = add(node(new(), "Preview3DAdvanced", (X2 + 460, Y0 + 60), (560, 600), [{}, W, H],
                  title="2.4  the model  (orbit to check)", **copy.deepcopy(viewer_io)))
    if P["electrical"]:
        EY = Y0 + 740
        t_pts = add(text(new(), (X2 + 20, EY), (560, 640), P["points"],
                         "2.5  ELECTRICAL POINTS  --  name kind x= z= [y=] [circuit=] [controls=] [n=] | note"))
        el = add(node(new(), "MPElectricalLayout", (X2 + 20, EY + 680), (420, 160), [P["file"], "", True],
                      inputs=[inp("points", "STRING", widget=True), inp("model_3d", "FILE_3D")],
                      outputs=[out("model_with_wiring_3d", "FILE_3D"), out("wiring_3d", "FILE_3D"),
                               out("light_ids_3d", "FILE_3D"), out("lights_json", "STRING"),
                               out("schedule", "STRING"), out("report", "STRING")],
                      title="2.6  Electrical Layout  (DB from the plan + POINTS)"))
        link(t_pts, 0, el, 0, "STRING")
        link(MODEL3D, 0, el, 1, "FILE_3D")
        show = prim("PrimitiveBoolean", (X2 + 460, Y0 + 680), True, "SHOW WIRING  --  in the viewer above", 560)
        sw = add(node(new(), "ComfySwitchNode", (X2 + 620, EY + 680), (240, 100), [True],
                      inputs=[inp("on_false", "FILE_3D", optional=True), inp("on_true", "FILE_3D", optional=True),
                              inp("switch", "BOOLEAN", widget=True)],
                      outputs=[out("output", "FILE_3D")], title="wiring?"))
        link(MODEL3D, 0, sw, 0, "FILE_3D")
        link(el, 0, sw, 1, "FILE_3D")
        link(show, 0, sw, 2, "BOOLEAN")
        link(sw, 0, ov, 0, "FILE_3D")
        lm = add(node(new(), "Get3DComponents", (X2 + 620, EY + 800), (240, 60), [],
                      inputs=[inp("model_3d", "FILE_3D")], outputs=[out("mesh", "MESH")], title="mesh: light-ID"))
        link(el, 2, lm, 0, "FILE_3D")
        LIGHT_MESH, LIGHTS_JSON = lm, Port(el, 3)
        for k, (slot, title) in enumerate([(4, "2.7  DB schedule"), (5, "2.8  check  (ERROR = settle before work)")]):
            pa = add(node(new(), "PreviewAny", (X2 + 600, EY + k * 330), (420, 300), [], inputs=[inp("source", "*")],
                          title=title))
            link(el, slot, pa, 0, "*")
        es = add(node(new(), "MPElectricalSheets", (X2 + 20, EY + 880), (420, 100), [P["file"], ""],
                      inputs=[inp("points", "STRING", widget=True)],
                      outputs=[out("sheets", "IMAGE"), out("files", "STRING")],
                      title="2.9  ELECTRICAL SHEETS  ->  renders/electrical/  (E-01..E-04 + PDF)"))
        link(t_pts, 0, es, 0, "STRING")
        preview((X2 + 460, EY + 880), (560, 400), es, "2.9  the sheets  (design intent -- an LEW endorses)")
        h2 = EY + 1300 - Y0
    else:
        link(MODEL3D, 0, ov, 0, "FILE_3D")
        LIGHT_MESH = MESHES[2]
        LIGHTS_JSON = add(node(new(), "PrimitiveString", (X2 + 20, Y0 + 700), (420, 60), ["[]"],
                               outputs=[out("STRING", "STRING")], title="no electrical layer in this plan"))
        h2 = 820
    group("2  PLAN + 3D + ELECTRICAL  --  the model, parts to hide, the DB + points + wiring",
          X2 - 20, Y0 - 20, 1060, h2, STAGE[2])

    # ======================= 3  FURNITURE BLOCKS ===========================
    X3 = X2 + 1060
    t_blocks = add(text(new(), (X3 + 20, Y0 + 60), (900, 620), P["blocks"],
                        "3.1  BLOCKS  --  one per line: name x= z= w= d= h= [y=] [rot=] | prompt"))
    link(t_blocks, 0, layout, 0, "STRING")
    rep = add(node(new(), "PreviewAny", (X3 + 20, Y0 + 720), (900, 260), [], inputs=[inp("source", "*")],
                   title="3.2  layout report  (zone, ID colour, size, asset)"))
    link(layout, 4, rep, 0, "*")
    add(node(new(), "MarkdownNote", (X3 + 960, Y0 + 60), (480, 620), [NOTE_BLOCKS], title="3.0  BLOCKS, how"))
    group("3  FURNITURE BLOCKS  --  the movable layout + a prompt per piece", X3 - 20, Y0 - 20, 1480, 1020, STAGE[3])

    # ======================= 4  CAMERAS ====================================
    X4 = X3 + 1500
    from_viewers = prim("PrimitiveBoolean", (X4 + 20, Y0 + 60), False,
                        "CAMERAS FROM VIEWERS  --  false: by numbers  |  true: as framed in the viewers", 600)
    add(node(new(), "MarkdownNote", (X4 + 20, Y0 + 150), (600, 420), [NOTE_CAMERAS], title="4.0  Cameras, how"))
    CAM, INFO, PASS = {}, {}, {}
    csg = SG["camera"]
    for j, name in enumerate(CAMS + ["TOP"]):
        x, y = X4 + 660, Y0 + 60 + j * 560
        eye, tgt, fov = (top_eye, (cx, 0.0, cz), TOP_FOV) if name == "TOP" else cams[name]
        num = add(node(new(), "CreateCameraInfo", (x, y), (320, 300),
                       ["look_at", round(eye[0], 3), round(eye[1], 3), round(eye[2], 3),
                        round(tgt[0], 3), round(tgt[1], 3), round(tgt[2], 3), 0.0, fov, 1.0, "perspective"],
                       outputs=[out("camera_info", "LOAD3D_CAMERA")],
                       title="CAMERA %s  by numbers  (eye x y z, target, fov)" % name))
        c = g.instance(csg, (x, y + 340), (320, 160), "4.%d  camera %s passes" % (j + 1, name))
        wire(num, c, csg, "by_numbers", "LOAD3D_CAMERA")
        for k, nm in enumerate(["mesh", "zone_mesh", "block_mesh"]):
            wire(MESHES[k], c, csg, nm, "MESH")
        wire(LIGHT_MESH, c, csg, "light_mesh", "MESH")
        if name != "TOP":
            v = add(node(new(), "Preview3DAdvanced", (x + 360, y), (520, 360), [{}, W, H],
                         title="CAMERA %s  by hand  (orbit here; used when CAMERAS FROM VIEWERS)" % name,
                         **copy.deepcopy(viewer_io)))
            link(MODEL3D, 0, v, 0, "FILE_3D")
            wire(v, c, csg, "by_hand", "LOAD3D_CAMERA", 2)
            wire(v, c, csg, "by_hand_transform", "LOAD3D_MODEL_INFO", 1)
            wire(from_viewers, c, csg, "from_viewers", "BOOLEAN")
            preview((x + 900, y), (560, 360), port(c, csg, "passes"), "%s  depth | zone-ID | block-ID" % name)
        else:
            preview((x + 360, y), (560, 360), port(c, csg, "passes"), "%s  depth | zone-ID | block-ID" % name)
        CAM[name], INFO[name] = port(c, csg, "camera"), port(c, csg, "model_info")
        PASS[name] = [port(c, csg, n) for n in ("depth", "zone_ids", "block_ids", "light_ids")]
    group("4  CAMERAS  --  A, B, C you set + a top view", X4 - 20, Y0 - 20, 2140, 60 + 4 * 560, STAGE[4])

    # ======================= 5  FIRST PASS =================================
    X5 = X4 + 2160
    g.UNET = add(node(new(), "UNETLoader", (X5 + 20, Y0 + 60), (460, 90), [F.MODELS["unet"], "default"],
                      outputs=[out("MODEL", "MODEL")], title="5.1  Qwen-Image-2.1 Viggle turbo v0.3 (int8, 6 steps)"))
    g.CLIP = add(node(new(), "CLIPLoader", (X5 + 20, Y0 + 180), (460, 110), [F.MODELS["clip"], "qwen_image", "default"],
                      outputs=[out("CLIP", "CLIP")], title="5.1  Text encoder (Qwen3-VL 8B, int8)"))
    g.VAE = add(node(new(), "VAELoader", (X5 + 20, Y0 + 320), (460, 60), [F.MODELS["vae"]],
                     outputs=[out("VAE", "VAE")], title="5.1  VAE (Qwen-Image-2.1)"))
    g.PATCH = add(node(new(), "ModelPatchLoader", (X5 + 20, Y0 + 410), (460, 60), [F.MODELS["patch"]],
                       outputs=[out("MODEL_PATCH", "MODEL_PATCH")], title="5.1  Fun ControlNet Union (depth)"))
    g.SAMPLER = add(node(new(), "KSamplerSelect", (X5 + 20, Y0 + 500), (460, 60), ["euler"],
                         outputs=[out("SAMPLER", "SAMPLER")], title="5.1  sampler: euler (turbo rule)"))
    add(node(new(), "MarkdownNote", (X5 + 20, Y0 + 600), (460, 560), [F.MODEL_NOTE], title="5.1  Models and schedule"))
    shared = {"model": (g.UNET, "MODEL"), "patch": (g.PATCH, "MODEL_PATCH"), "vae": (g.VAE, "VAE"),
              "sampler": (g.SAMPLER, "SAMPLER"), "clip": (g.CLIP, "CLIP")}

    def wire_shared(inst, sg):
        for nm, (src, typ) in shared.items():
            if nm in [i[0] for i in sg.inputs]:
                wire(src, inst, sg, nm, typ)

    CX = X5 + 520
    CTL = dict(
        seed=prim("PrimitiveInt", (CX, Y0 + 60), SEEDS["sheet"], "SEED  --  a new design for every camera"),
        night=prim("PrimitiveBoolean", (CX, Y0 + 150), False, "NIGHT  --  false: daytime  |  true: evening"),
        zoning=prim("PrimitiveBoolean", (CX, Y0 + 240), True,
                    "ZONING  --  true: zone references in their zones  |  false: lighting only"),
        zone_strength=prim("PrimitiveFloat", (CX, Y0 + 330), B.ZONE_STRENGTH, "ZONE STRENGTH  (references, per zone)"),
        light_strength=prim("PrimitiveFloat", (CX, Y0 + 420), B.GLOBAL_STRENGTH,
                            "LIGHT STRENGTH  (lighting layer underneath)"),
        ref_res=prim("PrimitiveInt", (CX, Y0 + 510), REF_RES, "REF RESOLUTION  (lower = looser)"),
        block_prompts=prim("PrimitiveBoolean", (CX, Y0 + 600), True, "BLOCK PROMPTS  --  each block's | prompt"),
        fixture_glow=prim("PrimitiveBoolean", (CX, Y0 + 690), P["electrical"],
                          "FIXTURE GLOW  --  each light point's note, at the fitting"),
    )
    add(node(new(), "MarkdownNote", (CX, Y0 + 780), (420, 560), [NOTE_FIRST], title="5.0  First pass, how"))
    group("5.1  CONTROLS  --  edit these", CX - 20, Y0 + 10, 460, 690, "#8a5a3a", 20)

    LX = CX + 480
    lt = g.instance(SG["light"], (LX, Y0 + 60), (360, 140), "5.2  lighting conditioning")
    wire_shared(lt, SG["light"])
    wire(LIGHT_REF, lt, SG["light"], "lighting", "IMAGE")
    wire(CTL["night"], lt, SG["light"], "night", "BOOLEAN")
    wire(CTL["ref_res"], lt, SG["light"], "ref_resolution", "INT")
    ZC = []
    for k, (slug, _) in enumerate(zone_list):
        zr = g.instance(SG["zref"], (LX, Y0 + 240 + k * 150), (360, 110),
                        "5.3  zone %d (%s) references" % (k + 1, zones[k][0]))
        wire_shared(zr, SG["zref"])
        wire(ZONE_REF[k], zr, SG["zref"], "reference", "IMAGE")
        wire(CTL["ref_res"], zr, SG["zref"], "ref_resolution", "INT")
        ZC.append(zr)

    def scene(pos, lighting_slot, ids, bids, lids, title):
        s = g.instance(SG["scene"], pos, (360, 220), title)
        sgs = SG["scene"]
        wire(g.CLIP, s, sgs, "clip", "CLIP")
        link(lt, lighting_slot, s, sgs.index_in("lighting"), "CONDITIONING")
        for k, zr in enumerate(ZC):
            wire(zr, s, sgs, "zone_%d" % (k + 1), "CONDITIONING")
        wire(ids, s, sgs, "zone_ids", "IMAGE")
        wire(bids, s, sgs, "block_ids", "IMAGE")
        wire(BLOCKS_JSON, s, sgs, "blocks_json", "STRING")
        wire(lids, s, sgs, "light_ids", "IMAGE")
        wire(LIGHTS_JSON, s, sgs, "lights_json", "STRING")
        for nm, typ in [("zoning", "BOOLEAN"), ("light_strength", "FLOAT"), ("zone_strength", "FLOAT"),
                        ("block_prompts", "BOOLEAN"), ("fixture_glow", "BOOLEAN")]:
            wire(CTL[nm], s, sgs, nm, typ)
        return s

    TX = LX + 400
    sheets = {}
    for k, (kind, method) in enumerate([("depth", "lanczos"), ("zone", "nearest"), ("block", "nearest"),
                                        ("light", "nearest")]):
        t = g.instance(SG[method], (TX, Y0 + 60 + k * 170), (320, 130), "5.4  %s sheet" % kind)
        for n, cam in zip(("a", "b", "c", "top"), CAMS + ["TOP"]):
            wire(PASS[cam][k], t, SG[method], n, "IMAGE")
        sheets[kind] = t
    sc = scene((TX, Y0 + 760), 0, sheets["zone"], sheets["block"], sheets["light"], "5.5  sheet conditioning")
    rp = add(node(new(), "PreviewAny", (TX, Y0 + 1020), (360, 260), [], inputs=[inp("source", "*")],
                  title="which block prompts are in play"))
    link(sc, 1, rp, 0, "*")
    SX = TX + 400
    sh = g.instance(SG["sheet"], (SX, Y0 + 60), (360, 160), "5.6  FIRST PASS  --  one sheet, four cameras")
    wire_shared(sh, SG["sheet"])
    wire(sc, sh, SG["sheet"], "conditioning", "CONDITIONING")
    wire(sheets["depth"], sh, SG["sheet"], "depth", "IMAGE")
    wire(CTL["seed"], sh, SG["sheet"], "seed", "INT")
    preview((SX, Y0 + 260), (760, 460), sh, "5.6  the sheet  (A B / C TOP)")
    PASS1 = {}
    for j, name in enumerate(CAMS):
        y = Y0 + 780 + j * 420
        s = scene((SX, y), 1, PASS[name][1], PASS[name][2], PASS[name][3], "5.7  %s conditioning" % name)
        r = g.instance(SG["refine"], (SX + 400, y), (360, 200), "5.7  refine %s" % name,
                       {"seed": SEEDS["refine"] + j, "panel_x": (j % 2) * PANEL_W, "panel_y": (j // 2) * PANEL_H})
        wire_shared(r, SG["refine"])
        wire(sh, r, SG["refine"], "sheet", "IMAGE")
        wire(s, r, SG["refine"], "conditioning", "CONDITIONING")
        wire(PASS[name][0], r, SG["refine"], "depth", "IMAGE")
        PASS1[name] = r
    group("5  FIRST PASS  --  references + lighting, no prompts;  one sheet, then A B C refined",
          X5 - 20, Y0 - 20, SX + 800 - X5, 780 + 3 * 420 + 20, STAGE[5])

    # ======================= 6  INPAINT ====================================
    X6 = SX + 820
    add(node(new(), "MarkdownNote", (X6 + 20, Y0 + 60), (520, 520), [NOTE_INPAINT], title="6.0  Inpaint, how"))
    cur = {name: PASS1[name] for name in CAMS}
    cur_slot = {name: 0 for name in CAMS}

    def chain(inst, sg, ids_k):
        wire_shared(inst, sg)
        for j, name in enumerate(CAMS):
            c = "abc"[j]
            link(cur[name], cur_slot[name], inst, sg.index_in("image_" + c), "IMAGE")
            wire(PASS[name][ids_k], inst, sg, "ids_" + c, "IMAGE")
            wire(PASS[name][0], inst, sg, "depth_" + c, "IMAGE")
        for j, name in enumerate(CAMS):
            cur[name], cur_slot[name] = inst, sg.index_out("image_" + "abc"[j])

    for k, (slug, _) in enumerate(zone_list):
        y = Y0 + 620 + k * 420
        cname, rgb = zones[k]
        sgz = sg_inpaint(g, "Inpaint zone %d (%s)" % (k + 1, cname),
                         "Redraw zone %d (%s) in A, B and C from a prompt + its references." % (k + 1, slug),
                         zone_rgb=rgb, seed=SEEDS["inpaint"] + k)
        t = add(text(new(), (X6 + 20, y), (520, 360), ZONE_PROMPTS.get(
            slug, "The %s." % slug.split("-", 1)[-1].replace("-", " ")), "6.%d  ZONE %d PROMPT  --  %s (%s)" % (
            k + 1, k + 1, slug, cname)))
        z = g.instance(sgz, (X6 + 580, y), (380, 260), "6.%d  inpaint zone %d  (%s)" % (k + 1, k + 1, cname))
        wire(t, z, sgz, "prompt", "STRING")
        wire(ZONE_REF[k], z, sgz, "reference", "IMAGE")
        wire(CTL["ref_res"], z, sgz, "ref_resolution", "INT")
        chain(z, sgz, 1)
    yb = Y0 + 620 + len(zone_list) * 420
    sgb = sg_inpaint(g, "Inpaint blocks", "Redraw the named blocks in A, B and C from a prompt.",
                     denoise=BLOCK_DENOISE, seed=SEEDS["block"], enabled=False)
    tb = prim("PrimitiveString", (X6 + 20, yb), "waiting_sofa", "6.%d  BLOCKS to redraw  (names, comma separated)"
              % (len(zone_list) + 1), 520)
    tp = add(text(new(), (X6 + 20, yb + 90), (520, 270),
                  "A low three-seat sofa in cream boucle with a solid oak base, soft rounded arms.",
                  "6.%d  BLOCKS PROMPT" % (len(zone_list) + 1)))
    bi = g.instance(sgb, (X6 + 580, yb), (380, 260), "6.%d  inpaint blocks  (off by default)" % (len(zone_list) + 1))
    wire(tb, bi, sgb, "blocks", "STRING")
    wire(tp, bi, sgb, "prompt", "STRING")
    wire(BLOCKS_JSON, bi, sgb, "blocks_json", "STRING")
    chain(bi, sgb, 2)
    FINALS = [Port(cur[n], cur_slot[n]) for n in CAMS]
    for j, name in enumerate(CAMS):
        preview((X6 + 1000, Y0 + 60 + j * 420), (720, 400), FINALS[j], "6  %s after inpaint" % name)
    h6 = max(620 + (len(zone_list) + 1) * 420, 60 + 3 * 420) + 20
    group("6  INPAINT  --  per zone: your prompt + its references, inside the zone only;  then blocks",
          X6 - 20, Y0 - 20, 1760, h6, STAGE[6])

    # ======================= 7  OUTPUTS ====================================
    X7 = X6 + 1760
    s = add(save(new(), (X7 + 20, Y0 + 60), "%s_sheet" % out_prefix, "7.1  renders/design/%s_sheet" % plan, (640, 420)))
    link(sh, 0, s, 0, "IMAGE")
    for j, name in enumerate(CAMS):
        y = Y0 + 520 + j * 480
        p1 = add(save(new(), (X7 + 20, y), "%s_pass1_cam_%s" % (out_prefix, name.lower()),
                      "7.%d  first pass %s  ->  _pass1_cam_%s" % (j + 2, name, name.lower()), (640, 440)))
        link(PASS1[name], 0, p1, 0, "IMAGE")
        fs = add(save(new(), (X7 + 680, y), "%s_cam_%s" % (out_prefix, name.lower()),
                      "7.%d  FINAL %s  ->  renders/design/%s_cam_%s" % (j + 2, name, plan, name.lower()), (760, 440)))
        link(FINALS[j], 0, fs, 0, "IMAGE")
        if P["electrical"]:
            wo = add(node(new(), "MPWiringOverlay", (X7 + 1480, y), (320, 160), [P["file"], "", True],
                          inputs=[inp("image", "IMAGE"), inp("camera", "LOAD3D_CAMERA"),
                                  inp("model_info", "LOAD3D_MODEL_INFO", optional=True),
                                  inp("points", "STRING", widget=True)],
                          outputs=[out("IMAGE", "IMAGE")], title="7.%d  wiring over %s" % (j + 2, name)))
            link(FINALS[j], 0, wo, 0, "IMAGE")
            link(CAM[name], 0, wo, 1, "LOAD3D_CAMERA")
            link(INFO[name], 0, wo, 2, "LOAD3D_MODEL_INFO")
            link(t_pts, 0, wo, 3, "STRING")
            es_ = add(save(new(), (X7 + 1840, y), "%s_cam_%s_electrical" % (out_prefix, name.lower()),
                           "7.%d  ELECTRICIAN VIEW %s  ->  _cam_%s_electrical" % (j + 2, name, name.lower()),
                           (760, 440)))
            link(wo, 0, es_, 0, "IMAGE")
    group("7  OUTPUTS  --  renders/design/%s_*  (first pass | final | electrician view)" % plan,
          X7 - 20, Y0 - 20, 2640 if P["electrical"] else 1480, 520 + 3 * 480, STAGE[7])

    # ======================= 8  PROPOSE BLOCKS (muted) =====================
    S8X, S8Y = X3, Y0 + 2400
    first = len(g.nodes)
    ck = add(node(new(), "CheckpointLoaderSimple", (S8X + 20, S8Y + 60), (420, 100), [SAM3_FILE],
                  outputs=[out("MODEL", "MODEL"), out("CLIP", "CLIP"), out("VAE", "VAE")], title="8.1  SAM 3.1"))
    mg = add(node(new(), "LoadMoGeModel", (S8X + 20, S8Y + 200), (420, 60), [MOGE_FILE],
                  outputs=[out("moge_model", "MOGE_MODEL")], title="8.1  MoGe-2"))
    prop_in = [inp("model_3d", "FILE_3D"), inp("blocks_json", "STRING"), inp("sam3_model", "MODEL"),
               inp("sam3_clip", "CLIP"), inp("moge_model", "MOGE_MODEL")]
    for c in "abc":
        prop_in += [inp("image_" + c, "IMAGE", optional=True), inp("camera_" + c, "LOAD3D_CAMERA", optional=True),
                    inp("model_info_" + c, "LOAD3D_MODEL_INFO", optional=True)]
    pr = add(node(new(), "MPProposeBlocks", (S8X + 480, S8Y + 60), (460, 420),
                  [P["file"], PROPOSE_CLASSES, 0.5, 0.3, 832, 2.0, 4.0],
                  inputs=prop_in, outputs=[out("proposals", "STRING"), out("preview_3d", "FILE_3D"),
                                           out("overlay", "IMAGE")],
                  title="8.2  Propose Blocks  (renders -> BLOCKS lines)"))
    link(MODEL3D, 0, pr, 0, "FILE_3D")
    link(BLOCKS_JSON, 0, pr, 1, "STRING")
    link(ck, 0, pr, 2, "MODEL")
    link(ck, 1, pr, 3, "CLIP")
    link(mg, 0, pr, 4, "MOGE_MODEL")
    for j, name in enumerate(CAMS):
        link(FINALS[j], 0, pr, 5 + 3 * j, "IMAGE")
        link(CAM[name], 0, pr, 6 + 3 * j, "LOAD3D_CAMERA")
        link(INFO[name], 0, pr, 7 + 3 * j, "LOAD3D_MODEL_INFO")
    pa = add(node(new(), "PreviewAny", (S8X + 980, S8Y + 60), (560, 420), [], inputs=[inp("source", "*")],
                  title="8.3  PROPOSALS  --  copy the lines you want into BLOCKS"))
    link(pr, 0, pa, 0, "*")
    p3 = add(node(new(), "Preview3DAdvanced", (S8X + 1580, S8Y + 60), (560, 420), [{}, W, H],
                  title="8.4  proposals in orange", **copy.deepcopy(viewer_io)))
    link(pr, 1, p3, 0, "FILE_3D")
    preview((S8X + 2180, S8Y + 60), (560, 420), Port(pr, 2), "8.5  what was found, per camera")
    add(node(new(), "MarkdownNote", (S8X + 20, S8Y + 300), (420, 480), [NOTE_PROPOSE], title="8.0  Propose, how"))
    for n in g.nodes[first:]:
        n["mode"] = MUTED
    group("8  PROPOSE BLOCKS  --  render -> blocking;  MUTED until SAM 3.1 + MoGe are installed",
          S8X - 20, S8Y - 20, 2800, 840, STAGE[8])

    # ======================= 9  BLOCK -> 3D ASSET (muted) ==================
    S9X, S9Y = X3, S8Y + 920
    first = len(g.nodes)
    name_box = prim("PrimitiveString", (S9X + 20, S9Y + 60), "waiting_sofa", "9.1  ASSET BLOCK  (a block name from BLOCKS)")
    rend = g.batch((S9X + 20, S9Y + 160), FINALS)
    ids = g.batch((S9X + 20, S9Y + 320), [PASS[n][2] for n in CAMS])
    cs = add(node(new(), "MPBlockCropSource", (S9X + 20, S9Y + 480), (420, 200), ["", "largest", 4],
                  inputs=[inp("renders", "IMAGE"), inp("block_ids", "IMAGE"), inp("blocks_json", "STRING"),
                          inp("block", "STRING", widget=True)],
                  outputs=[out("image", "IMAGE"), out("mask", "MASK"), out("report", "STRING")],
                  title="9.2  Block Crop Source  (the view where it is largest)"))
    link(rend, 0, cs, 0, "IMAGE")
    link(ids, 0, cs, 1, "IMAGE")
    link(BLOCKS_JSON, 0, cs, 2, "STRING")
    link(name_box, 0, cs, 3, "STRING")
    mesh_out = embed_trellis(g, (S9X + 5500, S9Y + 600), cs)
    mi = add(node(new(), "MPMeshIntoBlock", (S9X + 20, S9Y + 720), (420, 160), [P["file"], "", True],
                  inputs=[inp("block", "STRING", widget=True), inp("model_3d", "FILE_3D")],
                  outputs=[out("asset_path", "STRING"), out("asset_3d", "FILE_3D")],
                  title="9.4  Mesh Into Block  (-> model/assets/%s/<block>.glb)" % plan))
    link(name_box, 0, mi, 0, "STRING")
    link(mesh_out, 0, mi, 1, "FILE_3D")
    ap = add(node(new(), "PreviewAny", (S9X + 20, S9Y + 920), (420, 120), [], inputs=[inp("source", "*")],
                  title="9.5  saved as"))
    link(mi, 0, ap, 0, "*")
    add(node(new(), "MarkdownNote", (S9X + 480, S9Y + 60), (480, 520), [NOTE_ASSET], title="9.0  Asset, how"))
    for n in g.nodes[first:]:
        n["mode"] = MUTED
    group("9  BLOCK -> 3D ASSET  --  TRELLIS.2;  MUTED until its models are installed",
          S9X - 20, S9Y - 20, 11000, 2600, STAGE[9])

    g.write("mpillow-design-%s" % plan, out_path)


# ----------------------------------------------------------- TRELLIS.2 -----
# ComfyUI's own Pixal3D / TRELLIS.2 template, trimmed to TRELLIS.2 only: its
# image loader becomes Block Crop Source, background removal is dropped (the
# block-ID mask is exact), and the Pixal3D branch with its switches goes.
DROP = {122, 192, 193, 248, 313, 316, 317, 318, 319, 314, 315, 298, 242, 56, 55}
TEXTURE_RES = 2048
DECIMATE_FACES = 150000


def embed_trellis(g, origin, crop_src):
    """Copy the template's nodes into g, rewired; returns the node whose
    output 0 is the finished, textured GLB (MeshToFile3D)."""
    T = trellis_template()
    tn = {n["id"]: n for n in T["nodes"]}
    # (template node, output slot) -> (our node, output slot), for the dropped ones
    redirect = {(122, 0): (crop_src, 0), (122, 1): (crop_src, 1), (248, 0): (crop_src, 1),
                (318, 0): ("T", 40, 0), (314, 0): ("T", 299, 0), (315, 0): ("T", 299, 1)}
    xs = [n["pos"][0] for n in T["nodes"] if n["id"] not in DROP]
    ys = [n["pos"][1] for n in T["nodes"] if n["id"] not in DROP]
    ox, oy = origin[0] - min(xs), origin[1] - min(ys)
    ids = {}
    for tid, n in tn.items():
        if tid in DROP:
            continue
        c = copy.deepcopy(n)
        c["id"] = ids[tid] = g.new()
        c["pos"] = [n["pos"][0] + ox, n["pos"][1] + oy]
        for i in c.get("inputs", []):
            i["link"] = None
        for o in c.get("outputs", []):
            o["links"] = []
        if tid == 94:                                    # the template stores this INT as a string
            c["widgets_values"] = [int(v) for v in c["widgets_values"]]
        if tid == 186:                                   # DecimateMesh: furniture, not a hero prop
            c["widgets_values"][0] = DECIMATE_FACES
        if tid == 288:                                   # texture resolution
            c["widgets_values"] = [TEXTURE_RES, "fixed"]
        if tid == 322:                                   # Save3DAdvanced
            c["widgets_values"][0] = "%s/assets/asset" % B.OUT_PREFIX
        g.add(c)

    def source(tid, slot):
        while (tid, slot) in redirect:
            r = redirect[(tid, slot)]
            if r[0] == "T":
                tid, slot = r[1], r[2]
                continue
            return r
        return ids[tid], slot

    for l in T["links"]:
        _, src, sslot, dst, dslot, typ = l[:6]
        if dst in DROP:
            continue
        s, so = source(src, sslot)
        g.link(s, so, ids[dst], dslot, typ)
    for grp in T.get("groups", []):
        x, y, w, h = grp["bounding"]
        if x + ox < origin[0] - 1000:
            continue
        g.group("9.3  TRELLIS.2 -- " + grp["title"], x + ox, y + oy, w, h, grp.get("color", "#444"), 18)
    return ids[285]


if __name__ == "__main__":
    main()
