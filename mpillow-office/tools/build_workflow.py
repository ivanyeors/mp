"""
Generate THE Mpillow showroom workflow -- one integrated graph in four sections,
laid out left to right so the flow reads as a pipeline:

  1. MOODBOARDS     six areas. Each area reads two folders under ref-img/
                    (moodboard/<area>/ and furniture/<area>/), tiles them into
                    contact sheets, and Qwen-Image-Edit composes them + the
                    area prompt into one moodboard sheet.
  2. PLAN -> 3D     the page-4 floor plan, the dimensioned massing GLB
                    (build_massing.py), the interactive Load3D chain, and the
                    baked cutaway views that feed the renders.
  3. PROMPTS        render base + materials + lighting, then the six area
                    prompts (shared with section 1) concatenated into the one
                    final prompt, previewed so you can read what the model gets.
  4. RENDERS        the six area moodboards -> one master sheet; the six
                    furniture sheets -> one master sheet; then one
                    Qwen-Image-Edit per camera view: image=massing view,
                    image2=master moodboard, image3=master furniture,
                    prompt=final prompt.
  5. CONTROLNET     the same final prompt through Qwen-Image text-to-image with
                    the InstantX ControlNet Union locked to each camera's
                    depth pass (render_views.py). Full generative freedom on
                    materials and light; geometry and viewpoint pinned by the
                    depth map. Compare with section 4 side by side.

Drop images into any ref-img/ folder and re-run: the folder loaders hash the
files, so only the branches whose inputs changed re-execute.

References are read straight from <repo>/ref-img by absolute path. Outputs
land in <repo>/renders, which is a directory junction onto
ComfyUI/output/mpillow-office (ComfyUI refuses to read or write through a link
that resolves outside its own input/output folders, so the link points from
the repo into ComfyUI, not the other way).

    python tools/build_workflow.py            # -> workflows/showroom_moodboard_16x9.json
    python tools/build_workflow.py --zoned    # -> workflows/showroom_zoned_16x9.json

--zoned writes a second, otherwise identical workflow that uses the colour
ID pass baked by render_views.py ("rotoscoped" areas, one flat colour each):

  section 4   the massing view carries the area tints and the prompt gets a
              colour legend, so Qwen-Image-Edit knows which zone is which.
  section 5   regional prompting: the ID pass is split into one mask per area
              (ImageColorToMask), each area prompt from section 1 is encoded on
              its own and confined to its mask (ConditioningSetMask), all
              combined with the whole-scene prompt underneath, then the depth
              ControlNet and the sampler as before. Only areas visible in a
              camera (zones.json) are wired into that view.
"""

import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EDIT_TPL = os.path.join(HERE, "_edit2509_template.json")
ZONED = "--zoned" in sys.argv
OUT = os.path.join(ROOT, "workflows",
                   "showroom_zoned_16x9.json" if ZONED else "showroom_moodboard_16x9.json")
SIDEBAR = r"D:\AI\ComfyUI\user\default\workflows\mpillow-office"

REF_ABS = os.path.join(ROOT, "ref-img")          # for the folder loaders
OUT_PREFIX = "mpillow-office"                   # output/mpillow-office == <repo>/renders

W, H = 1664, 928                    # Qwen-Image native 16:9
TILE_W, TILE_H = 832, 624           # contact-sheet tiles, 4:3
MAX_TILES = 6
MODEL_FILE = "3d/showroom_massing.glb"      # Load3D lists files relative to ComfyUI/input
MUTED = 2                           # 0 = active, 2 = muted, 4 = bypassed
TARGET = (8.88, 1.64, 3.95)         # model centre, from build_massing.py

VIEWS = ["iso_ne", "iso_nw", "iso_low", "long_sec"]

# --------------------------------------------------------------------------
# Areas -- one folder pair, one prompt, one moodboard each. The prompt is the
# single knob: it drives that area's moodboard AND its description in the
# final render prompt.
# --------------------------------------------------------------------------
AREAS = [
    ("01-entry-waiting", "entry and waiting area",
     "Entry and waiting (west end): a recessed double door, a cream boucle "
     "lounge bench along the west wall on a natural jute rug, a pale ash "
     "feature display wall showing pillows, a small brass side table. It reads "
     "as a living room, not a shop."),
    ("02-fitting-bays", "fitting bays, feature wall and photo station",
     "Fitting bays (north side): two low super single beds dressed in white "
     "and navy washed linen, a sheer white curtain on one oval ceiling track "
     "that closes around both beds, LED cove light under each bed, and a photo "
     "station with a pale backdrop and two camera positions."),
    ("03-inventory-wall", "inventory wall and box store",
     "Inventory wall and box store (south side): a full-height pale ash "
     "inventory wall with plinth drawers, pillow stacks and inserts at hand "
     "height, fabric bolts at eye level and a backlit signage band on top; "
     "behind it a charcoal steel rack with three levels of birch ply boxes and "
     "a rolling ladder."),
    ("04-workshop", "workshop bench and sewing area",
     "Workshop: a 7.2 m continuous birch ply workbench for cut, fill and sew "
     "under a long backlit stretched-fabric light panel, a sewing table at the "
     "east end, tools on a rail, everything tidy and well lit."),
    ("05-service-pantry-wc", "pantry, WC and work table",
     "Service band: a small pantry with a coffee and tea counter, the existing "
     "WC relined in warm stone, a long pale timber work table with stools, and "
     "a glass door out to the patio."),
    ("06-patio-wash-dry", "patio wash and dry deck",
     "Patio (east end): a wash and dry deck under a translucent polycarbonate "
     "roof, two washing machines, charcoal weatherproof lockable storage "
     "cabinets, wall-mounted drying racks, ziptrack blinds on the open side, "
     "city sky beyond."),
]

MOOD_PREFIX = (
    "Compose the reference photos into one clean collage of photographs for "
    "the %s of a custom pillow showroom: a grid of photos on a plain pale "
    "background with consistent palette and lighting. Photographs only -- "
    "absolutely no words, titles, captions, labels, logos or dimension lines "
    "anywhere in the image. The area should look like this:"
)

# The first pass called the input a "massing model" and Qwen rendered a scale
# maquette sitting on a rug in someone's living room. Say plainly that this is
# a full-size interior and that the frame holds nothing else.
BASE_PROMPT = (
    "A photorealistic architectural interior photograph of a custom pillow "
    "showroom, built exactly to the layout shown. Keep every wall, shelf, "
    "storage rack, bed, curtain track and workbench in precisely the position, "
    "size and proportion given, and keep exactly the same viewpoint. This is a "
    "real full-size room with its near walls cut away -- it is NOT a scale "
    "model, NOT a dollhouse, NOT a diorama on a table. There is no surrounding "
    "room, no floor or rug beneath it and no background object; the interior "
    "fills the whole frame. Replace the flat grey surfaces with the real "
    "materials, textures and lighting described, as shot on a full-frame camera "
    "with a tilt-shift lens, natural film grain, high dynamic range."
)

MATERIALS = (
    "Warm sand microcement plaster walls, pale ash timber joinery with rounded "
    "soft corners, birch plywood in the workshop, brushed brass fittings, "
    "charcoal powder-coated steel racking, cream boucle upholstery, navy washed "
    "linen bedding, natural jute rug, pale grey epoxy floor."
)

LIGHTING = (
    "Late afternoon. Soft daylight through the patio glazing and the sheer "
    "curtains, warm 2700K brass dome pendants just switched on, LED cove light "
    "under the beds and the seat bench, a backlit fabric panel over the "
    "workbench giving shadow-free work light. Calm, warm, residential."
)

README = (
    "# Mpillow showroom -- one integrated workflow\n\n"
    "Read left to right. Five sections:\n\n"
    "**1. MOODBOARDS.** One group per area. Each reads two folders in the repo:\n"
    "`ref-img/moodboard/<area>/` (materials, light, atmosphere) and\n"
    "`ref-img/furniture/<area>/` (specific pieces). Drop images in, press Run.\n"
    "The folder loaders hash the files, so only changed areas re-run. The area\n"
    "prompt in each group drives that moodboard AND the render.\n\n"
    "**2. PLAN -> 3D.** The page-4 plan, the dimensioned model\n"
    "(`tools/build_massing.py` -> `showroom_massing.glb`, shown in Load3D),\n"
    "and the baked cutaway views (`tools/render_views.py`) that the renders\n"
    "are locked to. No AI model turns a floor plan into a room; the geometry is\n"
    "computed from the brief's dimensions.\n\n"
    "**3. PROMPTS.** Render base, materials, lighting, then the six area\n"
    "prompts, concatenated into one final prompt. The preview node shows the\n"
    "exact text the model receives.\n\n"
    "**4. RENDERS.** Six area moodboards -> one master sheet; six furniture\n"
    "sheets -> one master sheet; then one render per camera view.\n\n"
    "**5. CONTROLNET RENDERS.** The same final prompt through Qwen-Image\n"
    "text-to-image, with the InstantX ControlNet Union pinned to each camera's\n"
    "depth pass. No reference images go in here: materials and light come from\n"
    "the prompt, geometry and viewpoint from the depth map. `strength` on each\n"
    "Apply ControlNet node is the knob (1.0 traces the model exactly). Compare\n"
    "`renders/final/<view>` (section 4) with `renders/final/<view>_cn`.\n\n"
    "Outputs land in the repo: `renders/moodboard/`, `renders/final/`.\n"
    "Always 16:9 (1664 x 928). Local models only; nothing spends credits.\n\n"
    "The Load3D chain is MUTED: its `image` input is a browser viewport\n"
    "snapshot, so it only works when you press Run in this tab. Un-mute it here\n"
    "to orbit the model by hand."
)

PLAN_NOTE = (
    "## Floor plan -> 3D\n\n"
    "Image-to-3D models (TRELLIS.2, Hunyuan3D, Tripo, Meshy, Rodin) rebuild a\n"
    "single object from a photo. None of them can read a plan and produce a\n"
    "room, and the ones installed here are paid cloud APIs.\n\n"
    "So the plan on the left is turned into geometry by\n"
    "`tools/build_massing.py`: every dimension from the brief, every position\n"
    "read off this drawing. 165 parts, exact to the centimetre.\n\n"
    "```\n"
    "python tools/build_massing.py   # -> model/showroom_massing.glb\n"
    "python tools/render_views.py    # -> ref-img/massing/*.png\n"
    "```\n\n"
    "Edit a number in the ZONES block, run both, press Run here. The views\n"
    "below are what the renders are locked to."
)

CN_NOTE = (
    "## Section 5 vs section 4\n\n"
    "**Section 4** edits the grey massing view with Qwen-Image-Edit, using the\n"
    "master moodboard and furniture sheets as picture references. It keeps\n"
    "the geometry but tends to keep the flat CG look too.\n\n"
    "**Section 5** generates from scratch with Qwen-Image and pins the result\n"
    "to the depth pass of the same camera through the InstantX ControlNet\n"
    "Union. Nothing grey goes in, so the model is free on materials and light;\n"
    "walls, racks, beds and viewpoint still land where the 3D model puts them.\n\n"
    "Knobs:\n"
    "- `strength` on Apply ControlNet: 1.0 traces the depth exactly, 0.6-0.8\n"
    "  lets furniture and detail deviate.\n"
    "- `end_percent` below 1.0 releases the lock for the last steps (finer\n"
    "  texture, slightly looser geometry).\n"
    "- `steps` 4 / `cfg` 1.0 go with the Lightning LoRA. Bypass the LoRA and\n"
    "  use 20 steps / cfg 2.5 for the full-quality model (5x slower).\n"
    "- `seed` is fixed per view so re-runs are comparable.\n\n"
    "Depth maps come from `tools/render_views.py` (near = white). The prompt is\n"
    "the same final prompt as section 4, so any change in sections 1 or 3\n"
    "shows in both."
)

SECTION_COLORS = {"s1": "#2d4a3e", "s2": "#2f4858", "s3": "#5a4a2f", "s4": "#4a2f5a",
                  "s5": "#5a2f3a"}

# Section 5: Qwen-Image base + InstantX ControlNet Union on the depth pass.
CN_MODELS = {
    "unet": "qwen_image_fp8_e4m3fn.safetensors",
    "lora": "Qwen-Image-Lightning-4steps-V1.0.safetensors",
    "clip": "qwen_2.5_vl_7b_fp8_scaled.safetensors",
    "vae": "qwen_image_vae.safetensors",
    "controlnet": "Qwen-Image-InstantX-ControlNet-Union.safetensors",
}
CN_STRENGTH = 0.85            # 1.0 = trace the depth map exactly, 0.6 = loose
CN_STEPS, CN_CFG = 4, 1.0     # Lightning 4-step LoRA; cfg 1.0 ignores the negative
CN_SHIFT = 3.1                # ModelSamplingAuraFlow; raise if blurry/dark
CN_SEED = 20260920
NEGATIVE = (
    "scale model, diorama, dollhouse, miniature on a table, cartoon, "
    "illustration, flat grey untextured CG surfaces, blurry, low quality, "
    "text, watermark, caption, logo."
)
AREA_COLOR = "#3a5a4c"

# --------------------------------------------------------------------------
# Zoned variant (--zoned). One colour per area, in AREAS order, identical to
# render_views.ZONES. Section 5 masks the ID pass per colour so each area
# prompt only conditions its own pixels; section 4 gets the tinted view + LEGEND.
# --------------------------------------------------------------------------
ZONES = [("red", 0xFF0000), ("green", 0x00FF00), ("blue", 0x0000FF),
         ("yellow", 0xFFFF00), ("magenta", 0xFF00FF), ("cyan", 0x00FFFF)]
ZONE_MIN_COVER = 0.01      # wire an area into a view only if it covers >= 1% of the frame
ZONE_STRENGTH = 1.0        # ConditioningSetMask strength of an area prompt inside its zone
GLOBAL_STRENGTH = 0.5      # whole-scene prompt underneath; weights are normalised, so
                           # inside a zone the area prompt counts 2:1 against it
LEGEND = (
    "The colour tints on the picture are zone markers, not materials: "
    + "; ".join("%s tint = %s" % (ZONES[i][0], AREAS[i][1]) for i in range(len(AREAS)))
    + ". Render each tinted zone as that area, exactly as described above, and "
    "remove every tint completely: there is no red, green, blue, yellow, magenta "
    "or cyan colour cast anywhere in the finished photograph."
)
ZONE_NOTE = (
    "## Zoned variant\n\n"
    "`render_views.py` bakes an **ID pass** per camera: every visible surface\n"
    "point is painted with the flat colour of the area it sits in (by plan\n"
    "position). `ImageColorToMask` turns each colour into a mask; the area\n"
    "prompt from section 1 is encoded on its own and `ConditioningSetMask`\n"
    "confines it to that mask. All six sit on top of the whole-scene prompt\n"
    "(masked to the full frame at `GLOBAL_STRENGTH`), are combined, and go\n"
    "through the depth ControlNet and the sampler as in the plain workflow.\n\n"
    "The sampler runs the model once per conditioning entry and blends the\n"
    "results by mask, so a view with six areas costs about 7x the plain\n"
    "section 5 sampling time (still 4 steps).\n\n"
    "Knobs:\n"
    "- `strength` on the whole-scene mask: lower = area prompts dominate more.\n"
    "- `strength` on an area mask: raise for a stubborn area, or 0 to drop it.\n"
    "- colours: red entry, green fitting, blue inventory, yellow workshop,\n"
    "  magenta service, cyan patio (`render_views.ZONES`).\n\n"
    "Outputs go to `renders/final/<view>_cn_zoned`; section 4 to\n"
    "`renders/final/<view>_zoned`, so the plain workflow's files stay put."
)
ZONE_README = (
    "\n\n---\n\n**ZONED VARIANT.** This copy of the workflow uses the colour ID pass\n"
    "(`ref-img/massing/massing_<view>_ids.png`): section 4 receives the tinted\n"
    "massing view plus a colour legend in the prompt; section 5 runs regional\n"
    "prompting, each area prompt confined to its own zone mask on top of the\n"
    "whole-scene prompt, then the depth ControlNet. Outputs carry a `_zoned`\n"
    "suffix. Built with `python tools/build_workflow.py --zoned`."
)


def node(nid, ntype, pos, size, widgets=None, inputs=None, outputs=None,
         props=None, title=None, mode=0, color=None):
    n = {
        "id": nid, "type": ntype, "pos": list(pos), "size": list(size),
        "flags": {}, "order": 0, "mode": mode,
        "inputs": inputs or [], "outputs": outputs or [],
        "properties": props if props is not None else {"Node name for S&R": ntype},
    }
    if widgets is not None:
        n["widgets_values"] = widgets
    if title:
        n["title"] = title
    if color:
        n["color"] = color
    return n


def inp(name, typ, widget=False, optional=False):
    d = {"name": name, "type": typ, "link": None}
    if widget:
        d["widget"] = {"name": name}
    if optional:
        d["shape"] = 7
    return d


def out(name, typ):
    return {"name": name, "type": typ, "links": []}


def load_image(nid, pos, path, title, size=(420, 420)):
    """Path-based loader (VHS) + a preview so the image is visible in the graph.

    Core LoadImage only accepts files physically inside ComfyUI/input, so the
    repo's ref-img/ is read by absolute path instead. Uses ids nid and nid+400.
    """
    # VHS serialises widgets_values as a name->value dict (not the usual list)
    # and flags the node red ("Failed to restore node") if it gets a list whose
    # length differs from its widget count, so hand it its own format.
    ld = node(nid, "VHS_LoadImagePath", pos, (size[0], 130),
              {"image": path, "custom_width": 0, "custom_height": 0},
              outputs=[out("IMAGE", "IMAGE"), out("mask", "MASK")], title=title)
    pv = node(nid + 400, "PreviewImage", (pos[0], pos[1] + 150), (size[0], size[1] - 150), [],
              inputs=[inp("images", "IMAGE")], title="preview")
    return [ld, pv], (nid, 0, nid + 400, 0, "IMAGE")


def folder_loader(nid, pos, folder, title):
    return node(nid, "LoadImagesFromFolderKJ", pos, (360, 250),
                [folder, TILE_W, TILE_H, "crop", MAX_TILES, 0, False],
                outputs=[out("image", "IMAGE"), out("mask", "MASK"),
                         out("count", "INT"), out("image_path", "STRING")],
                title=title)


def grid(nid, pos, title="Contact sheet"):
    return node(nid, "ImageConcatFromBatch", pos, (300, 110), [3, False, 4096],
                inputs=[inp("images", "IMAGE")], outputs=[out("IMAGE", "IMAGE")],
                title=title)


def pad(nid, pos):
    return node(nid, "ResizeAndPadImage", pos, (300, 130), [W, H, "white", "lanczos"],
                inputs=[inp("image", "IMAGE")], outputs=[out("IMAGE", "IMAGE")],
                title="Pad to 16:9")


def text(nid, pos, size, value, title):
    return node(nid, "PrimitiveStringMultiline", pos, size, [value],
                outputs=[out("STRING", "STRING")], title=title)


def concat(nid, pos, a_widget, delimiter, title, link_a=True, link_b=True):
    inputs = [inp("string_a", "STRING", widget=True), inp("string_b", "STRING", widget=True)]
    return node(nid, "StringConcatenate", pos, (420, 130),
                [a_widget, "", delimiter], inputs=inputs,
                outputs=[out("STRING", "STRING")], title=title)


def save(nid, pos, prefix, title, size=(420, 380), mode=0):
    return node(nid, "SaveImage", pos, size, [prefix],
                inputs=[inp("images", "IMAGE")], title=title, mode=mode)


def image_batch(nid, pos):
    return node(nid, "ImageBatch", pos, (240, 60), [],
                inputs=[inp("image1", "IMAGE"), inp("image2", "IMAGE")],
                outputs=[out("IMAGE", "IMAGE")])


def main():
    with open(EDIT_TPL, encoding="utf-8") as f:
        edit_tpl = json.load(f)
    edit_sg = edit_tpl["definitions"]["subgraphs"][0]
    EDIT_T = edit_sg["id"]
    edit_inst = [n for n in edit_tpl["nodes"] if n["type"] == EDIT_T][0]
    edit_props, edit_in_tpl = edit_inst["properties"], edit_inst["inputs"]

    def edit_node(nid, pos, title):
        ins = []
        for e in edit_in_tpl:
            c = {"name": e["name"], "type": e["type"], "link": None}
            for k in ("label", "widget", "shape"):
                if k in e:
                    c[k] = dict(e[k]) if isinstance(e[k], dict) else e[k]
            ins.append(c)
        return node(nid, EDIT_T, pos, (400, 260), [], inputs=ins,
                    outputs=[out("IMAGE", "IMAGE")], props=dict(edit_props), title=title)

    nodes, links, groups = [], [], []
    lid = [0]

    def link(src, sslot, dst, dslot, typ):
        lid[0] += 1
        links.append([lid[0], src, sslot, dst, dslot, typ])

    def group(title, x, y, w, h, color, font=24):
        groups.append({"id": len(groups) + 1, "title": title,
                       "bounding": [x, y, w, h], "color": color,
                       "font_size": font, "flags": {}})

    nodes.append(node(1, "MarkdownNote", (-3040, -1700), (2100, 520),
                      [README + (ZONE_README if ZONED else "")],
                      title="READ ME" + ("  --  ZONED VARIANT" if ZONED else "")))

    # ======================= SECTION 1: MOODBOARDS ==========================
    S1X, S1Y, AREA_H = -3040, -1080, 800
    for i, (slug, label, prompt) in enumerate(AREAS):
        b = 100 + i * 10
        y = S1Y + 60 + i * AREA_H
        mood_dir = os.path.join(REF_ABS, "moodboard", slug)
        furn_dir = os.path.join(REF_ABS, "furniture", slug)

        nodes.append(folder_loader(b, (S1X + 20, y), mood_dir, "1.%d.a  ref-img/moodboard/%s" % (i + 1, slug)))
        nodes.append(grid(b + 1, (S1X + 400, y)))
        nodes.append(pad(b + 2, (S1X + 400, y + 150)))
        nodes.append(folder_loader(b + 3, (S1X + 20, y + 330), furn_dir, "1.%d.b  ref-img/furniture/%s" % (i + 1, slug)))
        nodes.append(grid(b + 4, (S1X + 400, y + 330)))
        nodes.append(pad(b + 5, (S1X + 400, y + 480)))
        nodes.append(text(b + 6, (S1X + 740, y), (440, 280), prompt,
                          "1.%d.c  AREA PROMPT -- %s" % (i + 1, label)))
        nodes.append(concat(b + 7, (S1X + 740, y + 320), MOOD_PREFIX % label, " ",
                            "moodboard instruction + area prompt"))
        nodes.append(edit_node(b + 8, (S1X + 1220, y), "1.%d.d  Image Edit (Qwen 2509) -- moodboard" % (i + 1)))
        nodes.append(save(b + 9, (S1X + 1220, y + 300), "%s/moodboard/%s" % (OUT_PREFIX, slug),
                          "1.%d.e  renders/moodboard/%s" % (i + 1, slug)))

        link(b, 0, b + 1, 0, "IMAGE")
        link(b + 1, 0, b + 2, 0, "IMAGE")
        link(b + 3, 0, b + 4, 0, "IMAGE")
        link(b + 4, 0, b + 5, 0, "IMAGE")
        link(b + 6, 0, b + 7, 1, "STRING")          # area prompt -> string_b
        link(b + 2, 0, b + 8, 0, "IMAGE")           # mood sheet      -> image
        link(b + 5, 0, b + 8, 1, "IMAGE")           # furniture sheet -> image2
        link(b + 7, 0, b + 8, 3, "STRING")          # instruction     -> prompt
        link(b + 8, 0, b + 9, 0, "IMAGE")

        group("1.%d  %s" % (i + 1, label.upper()), S1X, y - 60, 1660, AREA_H - 40, AREA_COLOR, 20)

    group("SECTION 1  --  MOODBOARDS  (folder-driven, one per area)",
          S1X - 20, S1Y - 20, 1700, 60 + len(AREAS) * AREA_H, SECTION_COLORS["s1"])

    # ======================= SECTION 2: PLAN -> 3D ==========================
    S2X, S2Y = -1300, -1080
    def add_image(nid, pos, rel, title, size):
        ns, lk = load_image(nid, pos, os.path.join(REF_ABS, *rel.split("/")), title, size)
        nodes.extend(ns)
        link(*lk)

    add_image(20, (S2X + 20, S2Y + 60), "floorplan/plan-p4-300dpi.png",
              "2.1  Floor plan (brief p.4, 300 dpi)", (520, 420))
    nodes.append(node(21, "MarkdownNote", (S2X + 580, S2Y + 60), (520, 420), [PLAN_NOTE],
                      title="2.2  build_massing.py  (dimensions -> GLB)"))

    nodes.append(node(
        22, "Load3D", (S2X + 20, S2Y + 540), (520, 620), [MODEL_FILE, {}, W, H], mode=MUTED,
        outputs=[out("image", "IMAGE"), out("mask", "MASK"), out("mesh_path", "STRING"),
                 out("normal", "IMAGE"), out("camera_info", "LOAD3D_CAMERA"),
                 out("recording_video", "VIDEO"), out("model_3d", "FILE_3D"),
                 out("model_3d_info", "LOAD3D_MODEL_INFO")],
        title="2.3  showroom_massing.glb  (orbit it here -- chain MUTED for headless runs)"))
    nodes.append(node(23, "Get3DComponents", (S2X + 580, S2Y + 540), (300, 60), [], mode=MUTED,
                      inputs=[inp("model_3d", "FILE_3D")], outputs=[out("mesh", "MESH")]))
    nodes.append(node(24, "CreateCameraInfo", (S2X + 580, S2Y + 640), (300, 280),
                      ["orbit", 135.0, 30.0, 14.0, TARGET[0], TARGET[1], TARGET[2],
                       0.0, 35.0, 1.0, "orthographic"], mode=MUTED,
                      outputs=[out("camera_info", "LOAD3D_CAMERA")], title="Isometric camera (NE)"))
    nodes.append(node(25, "RenderMesh", (S2X + 580, S2Y + 960), (300, 200),
                      ["vertex colors", W, H, "#8a8d92"], mode=MUTED,
                      inputs=[inp("mesh", "MESH"), inp("model_3d_info", "LOAD3D_MODEL_INFO", optional=True),
                              inp("camera_info", "LOAD3D_CAMERA", optional=True)],
                      outputs=[out("image", "IMAGE"), out("mask", "MASK")], title="Live massing render"))
    nodes.append(save(26, (S2X + 920, S2Y + 540), OUT_PREFIX + "/massing/live",
                      "renders/massing/live", (180, 200), mode=MUTED))
    link(22, 6, 23, 0, "FILE_3D")
    link(23, 0, 25, 0, "MESH")
    link(22, 7, 25, 1, "LOAD3D_MODEL_INFO")
    link(24, 0, 25, 2, "LOAD3D_CAMERA")
    link(25, 0, 26, 0, "IMAGE")

    VIEW_NODE = {}
    for k, cam in enumerate(VIEWS):
        nid = 30 + k
        VIEW_NODE[cam] = nid
        col, row = k % 2, k // 2
        add_image(nid, (S2X + 20 + col * 560, S2Y + 1220 + row * 400),
                  "massing/massing_%s%s.png" % (cam, "_zoned" if ZONED else ""),
                  "2.4  Massing view -- %s  (baked, render lock%s)" % (cam, ", area tints" if ZONED else ""),
                  (520, 360))
    group("SECTION 2  --  FLOOR PLAN  ->  3D MASSING  ->  VIEWS",
          S2X - 20, S2Y - 20, 1180, 2080, SECTION_COLORS["s2"])

    # ======================= SECTION 3: PROMPTS =============================
    S3X, S3Y = -80, -1080
    nodes.append(text(40, (S3X + 20, S3Y + 60), (480, 300), BASE_PROMPT, "3.1  RENDER BASE  (photographic, geometry lock)"))
    nodes.append(text(41, (S3X + 20, S3Y + 400), (480, 240), MATERIALS, "3.2  MATERIALS PALETTE"))
    nodes.append(text(42, (S3X + 20, S3Y + 680), (480, 240), LIGHTING, "3.3  LIGHTING + TIME OF DAY"))

    CX = S3X + 540
    nodes.append(concat(44, (CX, S3Y + 60), "", " Materials: ", "base + materials"))
    nodes.append(concat(45, (CX, S3Y + 210), "", " Lighting: ", "+ lighting"))
    link(40, 0, 44, 0, "STRING")
    link(41, 0, 44, 1, "STRING")
    link(44, 0, 45, 0, "STRING")
    link(42, 0, 45, 1, "STRING")

    prev = 45
    for i, (slug, label, _) in enumerate(AREAS):
        nid = 50 + i
        delim = " The areas, west to east: " if i == 0 else " "
        nodes.append(concat(nid, (CX, S3Y + 360 + i * 150), "", delim, "+ area %d  (%s)" % (i + 1, slug)))
        link(prev, 0, nid, 0, "STRING")
        link(100 + i * 10 + 6, 0, nid, 1, "STRING")   # area prompt from section 1
        prev = nid
    FINAL_PROMPT = prev

    nodes.append(node(56, "PreviewAny", (CX, S3Y + 1280), (420, 420), [],
                      inputs=[inp("source", "*")], title="3.4  FINAL PROMPT  (what the renders receive)"))
    link(FINAL_PROMPT, 0, 56, 0, "*")
    RENDER_PROMPT, s3_h = FINAL_PROMPT, 1800
    if ZONED:
        nodes.append(text(57, (S3X + 20, S3Y + 1280), (480, 300), LEGEND,
                          "3.5  COLOUR LEGEND  (zoned views; section 4 only)"))
        nodes.append(concat(58, (CX, S3Y + 1740), "", " ", "final prompt + legend  ->  section 4"))
        link(FINAL_PROMPT, 0, 58, 0, "STRING")
        link(57, 0, 58, 1, "STRING")
        RENDER_PROMPT, s3_h = 58, 1920
    group("SECTION 3  --  PROMPTS  ->  ONE FINAL RENDER PROMPT",
          S3X - 20, S3Y - 20, 1060, s3_h, SECTION_COLORS["s3"])

    # ======================= SECTION 4: RENDERS =============================
    S4X, S4Y = 1040, -1080

    def batch_chain(first_id, x, srcs, title):
        prev_id = None
        for k in range(len(srcs) - 1):
            nid = first_id + k
            nodes.append(image_batch(nid, (x, S4Y + 60 + k * 90)))
            if k == 0:
                link(srcs[0], 0, nid, 0, "IMAGE")
            else:
                link(prev_id, 0, nid, 0, "IMAGE")
            link(srcs[k + 1], 0, nid, 1, "IMAGE")
            prev_id = nid
        g = first_id + 5
        nodes.append(grid(g, (x, S4Y + 530), title))
        link(prev_id, 0, g, 0, "IMAGE")
        return g

    MASTER_MOOD = batch_chain(60, S4X + 20, [100 + i * 10 + 8 for i in range(6)], "4.1  MASTER MOODBOARD  (6 areas)")
    MASTER_FURN = batch_chain(70, S4X + 300, [100 + i * 10 + 5 for i in range(6)], "4.2  MASTER FURNITURE  (6 areas)")
    nodes.append(save(66, (S4X + 20, S4Y + 680), OUT_PREFIX + "/moodboard/00-master-moodboard",
                      "renders/moodboard/00-master-moodboard", (260, 300)))
    nodes.append(save(76, (S4X + 300, S4Y + 680), OUT_PREFIX + "/moodboard/00-master-furniture",
                      "renders/moodboard/00-master-furniture", (260, 300)))
    link(MASTER_MOOD, 0, 66, 0, "IMAGE")
    link(MASTER_FURN, 0, 76, 0, "IMAGE")

    for j, cam in enumerate(VIEWS):
        b = 200 + j * 10
        y = S4Y + 60 + j * 700
        sfx = "_zoned" if ZONED else ""
        nodes.append(edit_node(b, (S4X + 620, y), "4.3  RENDER -- %s  (Image Edit, Qwen 2509%s)"
                               % (cam, ", tinted view + legend" if ZONED else "")))
        nodes.append(save(b + 1, (S4X + 620, y + 300), "%s/final/%s%s" % (OUT_PREFIX, cam, sfx),
                          "4.4  renders/final/%s%s" % (cam, sfx), (520, 360)))
        link(VIEW_NODE[cam], 0, b, 0, "IMAGE")      # massing view      -> image
        link(MASTER_MOOD, 0, b, 1, "IMAGE")         # master moodboard  -> image2
        link(MASTER_FURN, 0, b, 2, "IMAGE")         # master furniture  -> image3
        link(RENDER_PROMPT, 0, b, 3, "STRING")      # final prompt (+ legend) -> prompt
        link(b, 0, b + 1, 0, "IMAGE")
        group("4.3  %s" % cam.upper(), S4X + 600, y - 50, 580, 660, "#5a3f6a", 20)

    group("SECTION 4  --  MASTER SHEETS  ->  RENDERS  (one per camera view, 16:9)",
          S4X - 20, S4Y - 20, 1240, 60 + len(VIEWS) * 700, SECTION_COLORS["s4"])

    # ======================= SECTION 5: CONTROLNET ==========================
    # Qwen-Image base + InstantX ControlNet Union (depth). Explicit core nodes
    # so every knob is on the canvas. Loaders are shared; each view gets its own
    # Apply ControlNet -> KSampler -> VAE Decode -> Save.
    S5X, S5Y = 2320, -1080
    LX = S5X + 20

    nodes.append(node(300, "UNETLoader", (LX, S5Y + 60), (420, 90), [CN_MODELS["unet"], "default"],
                      outputs=[out("MODEL", "MODEL")], title="5.1  Qwen-Image base (fp8)"))
    nodes.append(node(301, "LoraLoaderModelOnly", (LX, S5Y + 190), (420, 90), [CN_MODELS["lora"], 1.0],
                      inputs=[inp("model", "MODEL")], outputs=[out("MODEL", "MODEL")],
                      title="5.1  Lightning 4-step LoRA"))
    nodes.append(node(302, "ModelSamplingAuraFlow", (LX, S5Y + 320), (420, 60), [CN_SHIFT],
                      inputs=[inp("model", "MODEL")], outputs=[out("MODEL", "MODEL")],
                      title="5.1  Sampling shift"))
    nodes.append(node(303, "CLIPLoader", (LX, S5Y + 420), (420, 110), [CN_MODELS["clip"], "qwen_image", "default"],
                      outputs=[out("CLIP", "CLIP")], title="5.1  Text encoder (Qwen2.5-VL 7B)"))
    nodes.append(node(304, "VAELoader", (LX, S5Y + 570), (420, 60), [CN_MODELS["vae"]],
                      outputs=[out("VAE", "VAE")], title="5.1  VAE"))
    nodes.append(node(305, "ControlNetLoader", (LX, S5Y + 670), (420, 60), [CN_MODELS["controlnet"]],
                      outputs=[out("CONTROL_NET", "CONTROL_NET")],
                      title="5.2  ControlNet Union (InstantX, depth)"))
    nodes.append(node(306, "CLIPTextEncode", (LX, S5Y + 770), (420, 120), [""],
                      inputs=[inp("clip", "CLIP"), inp("text", "STRING", widget=True)],
                      outputs=[out("CONDITIONING", "CONDITIONING")],
                      title="5.3  POSITIVE  <- final prompt (section 3)"))
    nodes.append(node(307, "CLIPTextEncode", (LX, S5Y + 930), (420, 200), [NEGATIVE],
                      inputs=[inp("clip", "CLIP")],
                      outputs=[out("CONDITIONING", "CONDITIONING")],
                      title="5.3  NEGATIVE  (only used when cfg > 1)"))
    nodes.append(node(308, "EmptySD3LatentImage", (LX, S5Y + 1170), (420, 110), [W, H, 1],
                      outputs=[out("LATENT", "LATENT")], title="5.4  Empty latent 1664 x 928"))
    nodes.append(node(309, "MarkdownNote", (LX, S5Y + 1320), (420, 460), [CN_NOTE],
                      title="5  How this differs from section 4"))

    link(300, 0, 301, 0, "MODEL")
    link(301, 0, 302, 0, "MODEL")
    link(303, 0, 306, 0, "CLIP")
    link(303, 0, 307, 0, "CLIP")
    link(FINAL_PROMPT, 0, 306, 1, "STRING")

    ROW = 760 if ZONED else 700
    s5_h = 60 + len(VIEWS) * ROW
    if ZONED:
        cover_path = os.path.join(REF_ABS, "massing", "zones.json")
        if not os.path.exists(cover_path):
            raise SystemExit("missing %s -- run tools/render_views.py first" % cover_path)
        with open(cover_path, encoding="utf-8") as f:
            COVER = json.load(f)
        # Shared: one text encode per area (text <- the section 1 area prompt)
        # and the whole-scene prompt masked to the full frame underneath.
        for k, (slug, label, _) in enumerate(AREAS):
            nodes.append(node(360 + k, "CLIPTextEncode", (LX, S5Y + 1820 + k * 150), (420, 120), [""],
                              inputs=[inp("clip", "CLIP"), inp("text", "STRING", widget=True)],
                              outputs=[out("CONDITIONING", "CONDITIONING")],
                              title="5.9  AREA %d (%s)  <- section 1 prompt" % (k + 1, ZONES[k][0])))
            link(303, 0, 360 + k, 0, "CLIP")
            link(100 + k * 10 + 6, 0, 360 + k, 1, "STRING")
        nodes.append(node(366, "SolidMask", (LX, S5Y + 2740), (420, 110), [1.0, W, H],
                          outputs=[out("MASK", "MASK")], title="5.9  Whole frame"))
        nodes.append(node(367, "ConditioningSetMask", (LX, S5Y + 2890), (420, 110),
                          [GLOBAL_STRENGTH, "default"],
                          inputs=[inp("conditioning", "CONDITIONING"), inp("mask", "MASK")],
                          outputs=[out("CONDITIONING", "CONDITIONING")],
                          title="5.9  Whole-scene prompt underneath  (strength)"))
        link(306, 0, 367, 0, "CONDITIONING")
        link(366, 0, 367, 1, "MASK")
        nodes.append(node(368, "MarkdownNote", (LX, S5Y + 3040), (420, 440), [ZONE_NOTE],
                          title="5.9  Zoning  (how and why)"))
        s5_h = max(s5_h, 3540)

    for j, cam in enumerate(VIEWS):
        b = 310 + j * 10
        y = S5Y + 60 + j * ROW
        VX = S5X + 500
        add_image(b, (VX, y), "massing/massing_%s_depth.png" % cam,
                  "5.5  Depth pass -- %s" % cam, (400, 330))
        positive, AX = 306, VX + 440
        if ZONED:
            z = 500 + j * 40
            add_image(z, (VX, y + 380), "massing/massing_%s_ids.png" % cam,
                      "5.9  ID pass -- %s  (one colour per area)" % cam, (400, 330))
            visible = [k for k, (slug, _, _) in enumerate(AREAS)
                       if COVER.get(cam, {}).get(slug, 0) >= ZONE_MIN_COVER]
            prev = 367
            for p, k in enumerate(visible):
                cname, cval = ZONES[k]
                ry = y + p * 115
                nodes.append(node(z + 1 + p, "ImageColorToMask", (VX + 440, ry), (280, 60), [cval],
                                  inputs=[inp("image", "IMAGE")], outputs=[out("MASK", "MASK")],
                                  title="%s  =  area %d" % (cname, k + 1)))
                nodes.append(node(z + 7 + p, "ConditioningSetMask", (VX + 760, ry), (300, 110),
                                  [ZONE_STRENGTH, "default"],
                                  inputs=[inp("conditioning", "CONDITIONING"), inp("mask", "MASK")],
                                  outputs=[out("CONDITIONING", "CONDITIONING")],
                                  title="area %d prompt, only in its zone" % (k + 1)))
                nodes.append(node(z + 13 + p, "ConditioningCombine", (VX + 1100, ry), (240, 60), [],
                                  inputs=[inp("conditioning_1", "CONDITIONING"),
                                          inp("conditioning_2", "CONDITIONING")],
                                  outputs=[out("CONDITIONING", "CONDITIONING")], title="+"))
                link(z, 0, z + 1 + p, 0, "IMAGE")
                link(360 + k, 0, z + 7 + p, 0, "CONDITIONING")
                link(z + 1 + p, 0, z + 7 + p, 1, "MASK")
                link(prev, 0, z + 13 + p, 0, "CONDITIONING")
                link(z + 7 + p, 0, z + 13 + p, 1, "CONDITIONING")
                prev = z + 13 + p
            positive, AX = prev, VX + 1380
        nodes.append(node(b + 1, "ControlNetApplyAdvanced", (AX, y), (340, 170),
                          [CN_STRENGTH, 0.0, 1.0],
                          inputs=[inp("positive", "CONDITIONING"), inp("negative", "CONDITIONING"),
                                  inp("control_net", "CONTROL_NET"), inp("image", "IMAGE"),
                                  inp("vae", "VAE", optional=True)],
                          outputs=[out("positive", "CONDITIONING"), out("negative", "CONDITIONING")],
                          title="5.6  Apply ControlNet  (strength)"))
        nodes.append(node(b + 2, "KSampler", (AX, y + 210), (340, 270),
                          [CN_SEED + j, "fixed", CN_STEPS, CN_CFG, "euler", "simple", 1.0],
                          inputs=[inp("model", "MODEL"), inp("positive", "CONDITIONING"),
                                  inp("negative", "CONDITIONING"), inp("latent_image", "LATENT")],
                          outputs=[out("LATENT", "LATENT")], title="5.7  KSampler"))
        nodes.append(node(b + 3, "VAEDecode", (AX, y + 520), (340, 50), [],
                          inputs=[inp("samples", "LATENT"), inp("vae", "VAE")],
                          outputs=[out("IMAGE", "IMAGE")], title="VAE Decode"))
        sfx = "_cn_zoned" if ZONED else "_cn"
        nodes.append(save(b + 4, (AX + 380, y), "%s/final/%s%s" % (OUT_PREFIX, cam, sfx),
                          "5.8  renders/final/%s%s" % (cam, sfx), (520, 360)))

        link(positive, 0, b + 1, 0, "CONDITIONING")
        link(307, 0, b + 1, 1, "CONDITIONING")
        link(305, 0, b + 1, 2, "CONTROL_NET")
        link(b, 0, b + 1, 3, "IMAGE")               # depth pass -> control image
        link(304, 0, b + 1, 4, "VAE")
        link(302, 0, b + 2, 0, "MODEL")
        link(b + 1, 0, b + 2, 1, "CONDITIONING")
        link(b + 1, 1, b + 2, 2, "CONDITIONING")
        link(308, 0, b + 2, 3, "LATENT")
        link(b + 2, 0, b + 3, 0, "LATENT")
        link(304, 0, b + 3, 1, "VAE")
        link(b + 3, 0, b + 4, 0, "IMAGE")
        group("5.5  %s  (depth-locked%s)" % (cam.upper(), ", zoned prompts" if ZONED else ""),
              VX - 20, y - 50, AX - VX + 960, ROW - 40, "#6a3f4a", 20)

    group("SECTION 5  --  CONTROLNET RENDERS  (Qwen-Image + InstantX Union on the depth pass%s)"
          % (" + regional prompts" if ZONED else ""),
          S5X - 20, S5Y - 20, AX - S5X + 980, s5_h, SECTION_COLORS["s5"])

    # ---------------- resolve links onto slots --------------------------
    by_id = {n["id"]: n for n in nodes}
    for lk, src, sslot, dst, dslot, typ in links:
        try:
            o = by_id[src]["outputs"][sslot]
            by_id[dst]["inputs"][dslot]
        except (KeyError, IndexError):
            raise SystemExit("bad link %d: %s[%d] -> %s[%d]" % (lk, src, sslot, dst, dslot))
        if o.get("links") is None:
            o["links"] = []
        o["links"].append(lk)
        by_id[dst]["inputs"][dslot]["link"] = lk

    for i, n in enumerate(nodes):
        n["order"] = i

    graph = {
        "id": "mpillow-showroom-zoned" if ZONED else "mpillow-showroom",
        "revision": 0,
        "last_node_id": max(n["id"] for n in nodes),
        "last_link_id": lid[0],
        "nodes": nodes,
        "links": links,
        "groups": groups,
        "definitions": {"subgraphs": [edit_sg]},
        "config": {},
        "extra": {},
        "version": 0.4,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(graph, f, indent=2)
    if os.path.isdir(os.path.dirname(SIDEBAR)):
        os.makedirs(SIDEBAR, exist_ok=True)
        shutil.copy(OUT, os.path.join(SIDEBAR, os.path.basename(OUT)))

    print("nodes:  %d" % len(nodes))
    print("links:  %d" % len(links))
    print("groups: %d" % len(groups))
    print("wrote:  %s (%s bytes)" % (OUT, format(os.path.getsize(OUT), ",")))
    print("copied: %s" % SIDEBAR)


if __name__ == "__main__":
    main()
