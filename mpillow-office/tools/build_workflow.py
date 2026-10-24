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

--zoned writes a second workflow that uses the colour ID pass baked by
render_views.py ("rotoscoped" areas, one flat colour each) for regional
prompting and produces exactly three final renders:

  section 5.9   regional prompting: the ID pass is split into one mask per
                area (R, G, B thresholded and combined), each area prompt from section 1 is
                encoded on its own and confined to its mask
                (ConditioningSetMask), all combined with the whole-scene
                prompt underneath, then the depth ControlNet.
  section 5.10  the SHEET: four isometric cameras in ONE picture. The four
                depth passes are tiled two by two into one 2048 x 1152
                control image, the four ID passes likewise, and ONE sampling
                pass renders all four cameras inside one picture, so
                materials, furniture and light cannot drift between them.
                Output 00-sheet_cn_zoned (plus an optional, muted 1.5x
                hi-res refine of the whole sheet, 00-sheet-hires_cn_zoned).
  section 5.12  ZONE SECTION passes: one area, chosen by a number 0-5 on
                the canvas. render_views.py bakes a section per area (the
                model clipped to the area's plan box, seen from its open
                side); the depth and ID passes of the chosen one are picked
                out of a batch and turned into zone masks.
  section 5.13  FREE CAMERA passes: a HIDE PARTS text box lists the parts
                of the model to leave out (GLB Part Filter, the custom node
                in comfy_nodes/mp_glb_parts); a Preview 3D (Advanced)
                viewer of the filtered model is the camera, orbited by hand
                (or a Create Camera Info node with numbers). RenderMesh
                bakes the depth pass from it and the ID pass from the
                zone-coloured twin, filtered by the same list, for that
                camera, live, at run time.
  section 5.14  DERIVE: the section and the free camera are drawn FROM the
                finished sheet. Its four finished panels plus the two new
                views are laid out three by two in one picture; a noise
                mask re-noises only the two new panels, so they are decided
                in the same latent as the finished isometrics and inherit
                their materials, furniture and light. Each new panel is then
                cropped and refined at 1664 x 928 with its own depth lock
                and zone masks. Outputs 01-section_cn_zoned and
                02-free-camera_cn_zoned.

  Sections 1-3 are shared with the plain workflow; section 4 keeps only
  the master moodboard sheets. (An earlier version rendered every camera
  on its own and refined sheet panels per camera; both are gone -- the
  sheet IS the isometric deliverable, and everything else derives from it.)
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
if ZONED:
    VIEWS = ["iso_ne", "iso_nw", "iso_low", "iso_high"]   # the four isometrics of the sheet
# Free camera (zoned, 5.13): files in ComfyUI/input/3d, written by build_massing.py.
FREE_MODEL = "3d/showroom_massing.glb"         # full model; parts are hidden on the canvas (5.13)
FREE_ID_MODEL = "3d/showroom_massing_ids.glb"  # its zone-coloured twin: same part names + __z<n>
FREE_HIDE = "wall_north\npatio_wall_n\npoly_roof\npoly_roof_n"   # default = `cutaway` in plans/showroom.yaml
FREE_SEED_OFFSET, SECTION_SEED_OFFSET = 20, 10

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
ZONE_STRENGTH = 1.0        # ConditioningSetMask strength of an area prompt inside its zone
GLOBAL_STRENGTH = 0.35     # whole-scene prompt underneath; weights are normalised, so
                           # inside a zone the area prompt counts ~3:1 against it

# Cross-view consistency (section 5.10): all four cameras are rendered in ONE
# picture, a 2 x 2 sheet of TILE-sized panels, from a sheet of the depth
# passes and a sheet of the ID passes. Then each panel is cut out, upscaled
# to W x H and refined by its own depth-locked, regionally-prompted sampler.
PANEL_W, PANEL_H = 1024, 576            # 16:9, multiples of 16; sheet = 2048 x 1152
SHEET_COLS = 2
SHEET_W, SHEET_H = PANEL_W * SHEET_COLS, PANEL_H * ((len(VIEWS) + SHEET_COLS - 1) // SHEET_COLS)
SHEET_SEED = 20260922
# Optional 5.10b: the whole sheet upscaled 1.5x and refined in place with the
# same masks and depth lock (ComfyUI resizes both to the latent). Muted by
# default: un-mute its Save node to run it.
HIRES_W, HIRES_H = 3072, 1728
# 5.14: the section and the free camera DERIVE from the finished sheet. The
# four finished iso panels and the two new views are laid out three by two in
# one picture; a noise mask re-noises only the two new panels, so they are
# decided in the same latent as the finished panels and inherit their
# materials, furniture and light. Each new panel is then cropped and refined
# at W x H with its own depth lock and zone masks.
DERIVE_COLS = 3
DERIVE_W, DERIVE_H = PANEL_W * DERIVE_COLS, PANEL_H * 2
DERIVE_SEED = 20260923
REFINE_STEPS = 10                      # Lightning schedule; with the denoise below ~5 run
REFINE_DENOISE = 0.5                   # how far the full-res refine may move from the panel:
                                       # 0.3 sharpen only, 0.6 re-imagine details
DERIVE_PROMPT = (
    "This picture is a contact sheet of six photographs of one and the same "
    "custom pillow showroom, arranged three by two, all taken on the same "
    "afternoon. The first four photographs are finished and set the look: "
    "their wall, floor and ceiling finishes, pale ash joinery, furniture, "
    "light fittings, sheer white curtains, white and navy bedding, cream "
    "boucle seating, pale grey epoxy floor, warm sand walls and the same warm "
    "afternoon light. The last two photographs, a section through one area "
    "and a free camera view, show exactly the same finished room with "
    "identical finishes, furniture, fittings and light as the first four. "
    "Every photograph on the sheet is described as follows."
)
HIRES_STEPS = 10                       # Lightning schedule; with the denoise below ~4 run
HIRES_DENOISE = 0.4                    # 0.3 = sharpen only, 0.6 = re-imagine details
SHEET_PROMPT = (
    "This picture is a contact sheet of four photographs of one and the same "
    "custom pillow showroom, arranged two by two, each taken from a different "
    "camera position on the same afternoon. All four photographs show exactly "
    "the same finished room: identical wall, floor and ceiling finishes, "
    "identical pale ash joinery, the same furniture pieces, light fittings, "
    "curtains, bedding, rugs and pillow displays, the same light: sheer WHITE "
    "curtains, white and navy bedding, cream boucle seating, pale grey epoxy "
    "floor (no herringbone, no dark timber), pale ash joinery, warm sand walls. "
    "Every photograph on the sheet is described as follows."
)
SHEET_NOTE = (
    "## 5.10  The sheet: four isometrics in one picture\n\n"
    "Rendering the cameras one at a time draws each from fresh noise, so\n"
    "materials and furniture drift between them. Here the four depth passes\n"
    "are tiled 2 x 2 into one control image, the four ID passes into one\n"
    "mask image, and ONE sampling pass (whole-scene prompt + the six area\n"
    "prompts confined to their zones on the sheet, depth ControlNet) renders\n"
    "all four cameras inside one 2048 x 1152 picture. They cannot disagree:\n"
    "they are decided together in one latent. The sheet is the deliverable;\n"
    "it is not split up.\n\n"
    "**5.10b (optional, muted).** The whole sheet upscaled 1.5x to\n"
    "3072 x 1728 and refined in place at `denoise` 0.4 with the same masks\n"
    "and depth lock (ComfyUI resizes both to the latent). Un-mute the Save\n"
    "node on the right to run it; expect several minutes.\n\n"
    "Knobs:\n"
    "- `seed` on the sheet KSampler: a new seed = a new coherent scheme for\n"
    "  all four cameras at once.\n"
    "- `strength` on the sheet's whole-scene mask / area masks: as in 5.9.\n"
    "- `denoise` on the 5.10b KSampler: 0.3 sharpen only, 0.6 re-imagine.\n\n"
    "Outputs: `renders/final/00-sheet_cn_zoned` and, if un-muted,\n"
    "`renders/final/00-sheet-hires_cn_zoned`.\n\n"
    "Tried and dropped: matching each camera to a hero render with\n"
    "Qwen-Image-Edit-2509. With a photo reference the edit model reproduces\n"
    "that photo; the depth ControlNet cannot override it."
)
ZONE_NOTE = (
    "## Zoned variant\n\n"
    "`render_views.py` bakes an **ID pass** per camera: every visible surface\n"
    "point is painted with the flat colour of the area it sits in (by plan\n"
    "position). Each colour becomes a mask: R, G and B thresholded at 0.5\n"
    "and combined with mask arithmetic (red = R - G - B, yellow = R x G - B,\n"
    "...). An exact-colour match is not used because the image loader and\n"
    "Render Mesh shift many pixels by a level or two, which left holes. The\n"
    "area prompt from section 1 is encoded on its own and\n"
    "`ConditioningSetMask` confines it to that mask. All six sit on top of\n"
    "the whole-scene prompt\n"
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
    "Three renders come out of this workflow, all through the same zoning:\n"
    "the SHEET of four isometrics (5.10), one ZONE SECTION you choose by\n"
    "number (5.12) and one FREE CAMERA you set by hand (5.13). The last two\n"
    "are drawn beside the finished sheet panels (5.14), so they derive\n"
    "their materials and light from the isometrics."
)
SECTION_NOTE = (
    "## 5.12  Zone section: pick one area\n\n"
    "`render_views.py` bakes a section per area: the model is clipped to\n"
    "the area's plan box (cut faces capped) and an orthographic camera looks\n"
    "in from the open side, 15 degrees from above:\n\n"
    "| # | area | looks |\n|---|---|---|\n"
    "| 0 | entry and waiting | west, at the door wall |\n"
    "| 1 | fitting bays | north, at the beds and photo station |\n"
    "| 2 | inventory wall | south, at the display wall |\n"
    "| 3 | workshop | south, bench in front of the inventory wall |\n"
    "| 4 | service band | east, at the patio glazing |\n"
    "| 5 | patio | east, at the open side |\n\n"
    "All six depth passes and all six ID passes are loaded into two batches;\n"
    "the **ZONE** number above picks one of each (`Get Image from Batch`).\n"
    "The chosen ID pass drives the six area masks exactly as on the sheet,\n"
    "so an area that is not in the picture simply gets an empty mask.\n\n"
    "To change the cut, the direction or the pitch, edit `SECTIONS` /\n"
    "`SEC_PITCH` in `tools/render_views.py`, re-run it, press Run here.\n\n"
    "The render itself happens in 5.14, beside the finished isometrics, so\n"
    "the section takes the sheet's look. Output\n"
    "`renders/final/01-section_cn_zoned` (ComfyUI numbers the files, so\n"
    "switching zones does not overwrite the previous one)."
)
FREECAM_NOTE = (
    "## 5.13  Free camera\n\n"
    "**HIDE PARTS** (top left) is the layer switch. One glTF part name per\n"
    "line, `*` `?` wildcards, `#` for a comment: `wall_north`, `poly_roof*`,\n"
    "`box_??`. The list feeds two `GLB Part Filter` nodes (custom node,\n"
    "`comfy_nodes/mp_glb_parts`): one drops those parts from the full model,\n"
    "one drops the same parts from the zone-coloured ID twin, whose pieces\n"
    "carry a `__z<n>` suffix the match ignores -- so depth and masks always\n"
    "agree. The default list is the cutaway (north wall + patio roof). Empty\n"
    "the box for the closed room; switch a filter to `show_only` to keep\n"
    "just the listed parts. `part names in the model` lists every name you\n"
    "can type; `hidden now` echoes what matched.\n\n"
    "The `Preview 3D (Advanced)` viewer shows the filtered model and IS the\n"
    "camera: orbit, pan and zoom it by hand, press Run. Its camera goes to\n"
    "two `Render Mesh` nodes that bake the **depth** pass and the **ID**\n"
    "pass at 1664 x 928 for that exact camera. Nothing about the camera is\n"
    "baked in advance, so any angle works, including inside the room; the\n"
    "camera is saved with the workflow, and the two previews show what the\n"
    "ControlNet and the zone masks receive.\n\n"
    "Prefer numbers? Connect the `Create Camera Info` node to `camera_info`\n"
    "on BOTH Render Mesh nodes instead (orbit: yaw / pitch / distance around\n"
    "the target; look_at: an explicit eye position, e.g. 1.6 m high inside).\n"
    "Render Mesh is always perspective (`fov` from the viewer).\n\n"
    "The render itself happens in 5.14, beside the finished isometrics, so\n"
    "the view takes the sheet's look. Output\n"
    "`renders/final/02-free-camera_cn_zoned`."
)
DERIVE_NOTE = (
    "## 5.14  The section and the free camera derive from the sheet\n\n"
    "Drawn on their own, the section and the free camera would start from\n"
    "fresh noise and pick their own materials. Instead they are drawn NEXT TO\n"
    "the finished isometrics: the four finished panels are cut out of the\n"
    "sheet (5.10) at panel size and laid out three by two with two\n"
    "placeholder panels; the latent of that picture gets a noise mask that\n"
    "covers only the two placeholders, so the sampler re-draws just those\n"
    "while attending to the finished panels in the same latent. The depth\n"
    "sheet and the ID sheet are tiled the same way (iso passes from 5.10,\n"
    "section passes from 5.12, free camera passes from 5.13), so the two new\n"
    "panels are depth-locked and zone-prompted exactly like the sheet.\n\n"
    "Each new panel is then cropped, upscaled to 1664 x 928 and refined by\n"
    "its own depth-locked, zone-prompted sampler at `denoise` 0.5: detail\n"
    "comes back; what the sheet decided stays.\n\n"
    "Change the ZONE number (5.12) or move the camera (5.13) and press Run:\n"
    "5.10 is cached, only this stage and the refine re-run.\n\n"
    "Knobs:\n"
    "- `seed` on the 5.14 KSampler: a new draw of the two panels, same look.\n"
    "- `denoise` on a refine KSampler: 0.3 sharpen only, 0.6 re-imagine.\n"
    "- `strength` on the whole-sheet mask: lower = area prompts dominate.\n\n"
    "Outputs: `renders/final/01-section_cn_zoned` and\n"
    "`renders/final/02-free-camera_cn_zoned`."
)
ZONE_README = (
    "\n\n---\n\n**ZONED VARIANT.** This copy of the workflow uses the colour ID pass\n"
    "(`ref-img/massing/massing_<view>_ids.png`) for regional prompting (each\n"
    "area prompt confined to its own zone mask on top of the whole-scene\n"
    "prompt, then the depth ControlNet) and produces exactly THREE final\n"
    "renders in `renders/final/`:\n\n"
    "1. `00-sheet_cn_zoned` -- the four isometric cameras in ONE picture\n"
    "   (5.10). One sampling pass, so materials, furniture and light agree.\n"
    "   Optional muted 1.5x hi-res refine of the whole sheet (5.10b).\n"
    "2. `01-section_cn_zoned` -- a section through ONE area, chosen by the\n"
    "   ZONE number in 5.12 (0 entry .. 5 patio).\n"
    "3. `02-free-camera_cn_zoned` -- any camera you set by hand in the 3D\n"
    "   viewer of 5.13 (or by numbers); depth and zone passes are baked live.\n\n"
    "Renders 2 and 3 DERIVE from render 1 (5.14): they are drawn beside the\n"
    "four finished isometric panels in one picture, with only their own two\n"
    "panels re-noised, so they take the sheet's materials, furniture and\n"
    "light; then each is cropped and refined at full size.\n\n"
    "Section 4 keeps only the master moodboard sheets here.\n"
    "Built with `python tools/build_workflow.py --zoned`."
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
    # The template scales image1 to a ~1 MP Flux Kontext size before VAEEncode,
    # which turned 1664 x 928 into 1392 x 752. Every image1 in this graph is
    # already W x H, so bypass that node and the edits come out 16:9.
    for n in edit_sg["nodes"]:
        if n["type"] == "FluxKontextImageScale":
            n["mode"] = 4
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

    if ZONED:
        # The interactive viewer lives in 5.13 (it IS the free camera). Here:
        # the six zone sections the 5.12 render can be locked to.
        for k, (slug, _, _) in enumerate(AREAS):
            add_image(34 + k, (S2X + 20 + (k % 3) * 380, S2Y + 540 + (k // 3) * 320),
                      "massing/massing_sec_%s.png" % slug,
                      "2.3  Zone section %d -- %s  (-> 5.12)" % (k, slug), (360, 300))
    else:
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
                  "massing/massing_%s.png" % cam,
                  "2.4  Massing view -- %s  (baked, render lock)" % cam, (520, 360))
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
        nodes.append(text(57, (S3X + 20, S3Y + 1280), (480, 300), SHEET_PROMPT,
                          "3.5  SHEET PROMPT  (four cameras in one picture  ->  5.10)"))
        nodes.append(concat(58, (CX, S3Y + 1740), "", " ", "sheet + final prompt  ->  section 5.10"))
        link(57, 0, 58, 0, "STRING")
        link(FINAL_PROMPT, 0, 58, 1, "STRING")
        nodes.append(text(59, (S3X + 20, S3Y + 1620), (480, 300), DERIVE_PROMPT,
                          "3.6  DERIVE PROMPT  (section + free camera from the sheet  ->  5.14)"))
        nodes.append(concat(1690, (CX, S3Y + 1900), "", " ", "derive + final prompt  ->  section 5.14"))
        link(59, 0, 1690, 0, "STRING")
        link(FINAL_PROMPT, 0, 1690, 1, "STRING")
        SHEET_TEXT, DERIVE_TEXT, s3_h = 58, 1690, 2080
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

    if ZONED:
        # The three final renders are all in section 5; no per-camera edits here.
        group("SECTION 4  --  MASTER SHEETS  (moodboards; the renders are in section 5)",
              S4X - 20, S4Y - 20, 640, 1100, SECTION_COLORS["s4"])
    else:
        for j, cam in enumerate(VIEWS):
            b = 200 + j * 10
            y = S4Y + 60 + j * 700
            nodes.append(edit_node(b, (S4X + 620, y), "4.3  RENDER -- %s  (Image Edit, Qwen 2509)" % cam))
            nodes.append(save(b + 1, (S4X + 620, y + 300), "%s/final/%s" % (OUT_PREFIX, cam),
                              "4.4  renders/final/%s" % cam, (520, 360)))
            link(VIEW_NODE[cam], 0, b, 0, "IMAGE")      # massing view      -> image
            link(MASTER_MOOD, 0, b, 1, "IMAGE")         # master moodboard  -> image2
            link(MASTER_FURN, 0, b, 2, "IMAGE")         # master furniture  -> image3
            link(RENDER_PROMPT, 0, b, 3, "STRING")      # final prompt      -> prompt
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
                      outputs=[out("LATENT", "LATENT")],
                      title="5.4  Empty latent 1664 x 928" + ("  (section 5.12 + free camera 5.13)" if ZONED else "")))
    nodes.append(node(309, "MarkdownNote", (LX, S5Y + 1320), (420, 460), [CN_NOTE],
                      title="5  How this differs from section 4"))

    link(300, 0, 301, 0, "MODEL")
    link(301, 0, 302, 0, "MODEL")
    link(303, 0, 306, 0, "CLIP")
    link(303, 0, 307, 0, "CLIP")
    link(FINAL_PROMPT, 0, 306, 1, "STRING")

    ROW = 420 if ZONED else 700
    s5_h = 60 + len(VIEWS) * ROW
    VX = S5X + 500
    AX = VX + 440
    s5_right = AX + 980                    # right edge of the section 5 group
    if ZONED:
        for slug, _, _ in AREAS:
            for p in ("massing_sec_%s_depth.png" % slug, "massing_sec_%s_ids.png" % slug):
                if not os.path.exists(os.path.join(REF_ABS, "massing", p)):
                    raise SystemExit("missing ref-img/massing/%s -- run tools/render_views.py first" % p)
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

        def masks_robust(first, col, y, id_src):
            """Six area masks from an ID image: threshold the R, G, B channels at
            0.5 and combine with mask arithmetic. Exact colour (ImageColorToMask)
            is NOT safe here: the image loader shifts half the pixels by a level
            or two and RenderMesh some more, which left holes in the masks.
            Ids first..first+17.
            Returns the mask node per area."""
            chan = {}
            for c, name in enumerate(("red", "green", "blue")):
                nodes.append(node(first + c, "ImageToMask", (col, y + c * 130), (240, 60), [name],
                                  inputs=[inp("image", "IMAGE")], outputs=[out("MASK", "MASK")],
                                  title="%s channel" % name))
                nodes.append(node(first + 3 + c, "ThresholdMask", (col, y + 60 + c * 130), (240, 60), [0.5],
                                  inputs=[inp("mask", "MASK")], outputs=[out("MASK", "MASK")],
                                  title="%s > 0.5" % name[0].upper()))
                link(id_src, 0, first + c, 0, "IMAGE")
                link(first + c, 0, first + 3 + c, 0, "MASK")
                chan[name[0].upper()] = first + 3 + c
            # area = (ops on channels): red R-G-B, green G-R-B, blue B-R-G,
            # yellow R*G-B, magenta R*B-G, cyan G*B-R
            recipe = [("R", "subtract", "G", "B"), ("G", "subtract", "R", "B"), ("B", "subtract", "R", "G"),
                      ("R", "multiply", "G", "B"), ("R", "multiply", "B", "G"), ("G", "multiply", "B", "R")]
            outs = []
            for k, (a, op, b, c) in enumerate(recipe):
                cname = ZONES[k][0]
                n1, n2 = first + 6 + 2 * k, first + 7 + 2 * k
                nodes.append(node(n1, "MaskComposite", (col + 280, y + k * 130), (260, 130), [0, 0, op],
                                  inputs=[inp("destination", "MASK"), inp("source", "MASK")],
                                  outputs=[out("MASK", "MASK")], title="%s %s %s" % (a, op, b)))
                nodes.append(node(n2, "MaskComposite", (col + 580, y + k * 130), (260, 130), [0, 0, "subtract"],
                                  inputs=[inp("destination", "MASK"), inp("source", "MASK")],
                                  outputs=[out("MASK", "MASK")],
                                  title="- %s  =  %s  =  area %d" % (c, cname, k + 1)))
                link(chan[a], 0, n1, 0, "MASK")
                link(chan[b], 0, n1, 1, "MASK")
                link(n1, 0, n2, 0, "MASK")
                link(chan[c], 0, n2, 1, "MASK")
                outs.append(n2)
            return outs

        def zone_conditioning(first, col, y, masks, base=367):
            """Each area prompt confined to its mask, all on top of the whole-scene
            prompt (`base`: 367 whole frame, 372 whole sheet). Ids first+10..+15
            (set mask), +20..+25 (combine).
            Returns the combined conditioning node."""
            prev = base
            for k, mk in enumerate(masks):
                ry = y + k * 130
                nodes.append(node(first + 10 + k, "ConditioningSetMask", (col, ry), (300, 110),
                                  [ZONE_STRENGTH, "default"],
                                  inputs=[inp("conditioning", "CONDITIONING"), inp("mask", "MASK")],
                                  outputs=[out("CONDITIONING", "CONDITIONING")],
                                  title="area %d prompt, only in its zone" % (k + 1)))
                nodes.append(node(first + 20 + k, "ConditioningCombine", (col + 340, ry), (240, 60), [],
                                  inputs=[inp("conditioning_1", "CONDITIONING"),
                                          inp("conditioning_2", "CONDITIONING")],
                                  outputs=[out("CONDITIONING", "CONDITIONING")], title="+"))
                link(360 + k, 0, first + 10 + k, 0, "CONDITIONING")
                link(mk, 0, first + 10 + k, 1, "MASK")
                link(prev, 0, first + 20 + k, 0, "CONDITIONING")
                link(first + 10 + k, 0, first + 20 + k, 1, "CONDITIONING")
                prev = first + 20 + k
            return prev

        def render_chain(first, col, y, positive, depth_src, seed, prefix, title, note, note_title,
                         latent=308, steps=CN_STEPS, denoise=1.0):
            """Apply ControlNet -> KSampler (from `latent`, default the empty one) ->
            decode -> save. Uses ids first..first+4."""
            nodes.append(node(first, "ControlNetApplyAdvanced", (col, y), (340, 170),
                              [CN_STRENGTH, 0.0, 1.0],
                              inputs=[inp("positive", "CONDITIONING"), inp("negative", "CONDITIONING"),
                                      inp("control_net", "CONTROL_NET"), inp("image", "IMAGE"),
                                      inp("vae", "VAE", optional=True)],
                              outputs=[out("positive", "CONDITIONING"), out("negative", "CONDITIONING")],
                              title="Apply ControlNet  (depth, strength)"))
            nodes.append(node(first + 1, "KSampler", (col, y + 210), (340, 270),
                              [seed, "fixed", steps, CN_CFG, "euler", "simple", denoise],
                              inputs=[inp("model", "MODEL"), inp("positive", "CONDITIONING"),
                                      inp("negative", "CONDITIONING"), inp("latent_image", "LATENT")],
                              outputs=[out("LATENT", "LATENT")],
                              title="KSampler  (seed%s)" % (", denoise = how far from the panel" if denoise < 1 else "")))
            nodes.append(node(first + 2, "VAEDecode", (col, y + 520), (340, 50), [],
                              inputs=[inp("samples", "LATENT"), inp("vae", "VAE")],
                              outputs=[out("IMAGE", "IMAGE")], title="VAE Decode"))
            nodes.append(save(first + 3, (col + 380, y), "%s/final/%s" % (OUT_PREFIX, prefix),
                              "%s  renders/final/%s" % (title, prefix), (520, 360)))
            nodes.append(node(first + 4, "MarkdownNote", (col, y + 610), (340, 560), [note],
                              title=note_title))
            link(positive, 0, first, 0, "CONDITIONING")
            link(307, 0, first, 1, "CONDITIONING")
            link(305, 0, first, 2, "CONTROL_NET")
            link(depth_src, 0, first, 3, "IMAGE")
            link(304, 0, first, 4, "VAE")
            link(302, 0, first + 1, 0, "MODEL")
            link(first, 0, first + 1, 1, "CONDITIONING")
            link(first, 1, first + 1, 2, "CONDITIONING")
            link(latent, 0, first + 1, 3, "LATENT")
            link(first + 1, 0, first + 2, 0, "LATENT")
            link(304, 0, first + 2, 1, "VAE")
            link(first + 2, 0, first + 3, 0, "IMAGE")
            return col + 380 + 540

        # ---- 5.10  THE SHEET: all cameras in one picture ------------------
        SX, y0 = S5X + 500, S5Y + 60 + len(VIEWS) * ROW + 60

        def tiles(first, col, srcs, method, title):
            """Scale each source to a tile, batch, tile 2 x 2. Returns the sheet node."""
            for j, src in enumerate(srcs):
                nodes.append(node(first + j, "ImageScale", (col, y0 + j * 100), (400, 90),
                                  [method, PANEL_W, PANEL_H, "disabled"],
                                  inputs=[inp("image", "IMAGE")], outputs=[out("IMAGE", "IMAGE")],
                                  title="%s tile -- %s" % (title, VIEWS[j])))
                link(src, 0, first + j, 0, "IMAGE")
            prev_id = None
            for k in range(len(srcs) - 1):
                nid = first + 4 + k
                nodes.append(image_batch(nid, (col, y0 + 420 + k * 70)))
                link(first if k == 0 else prev_id, 0, nid, 0, "IMAGE")
                link(first + k + 1, 0, nid, 1, "IMAGE")
                prev_id = nid
            g = first + 7
            nodes.append(node(g, "ImageConcatFromBatch", (col, y0 + 650), (400, 110), [SHEET_COLS, False, 4096],
                              inputs=[inp("images", "IMAGE")], outputs=[out("IMAGE", "IMAGE")],
                              title="%s SHEET  (%d x %d)" % (title, SHEET_W, SHEET_H)))
            link(prev_id, 0, g, 0, "IMAGE")
            return g

        DEPTH_SHEET = tiles(380, SX, [310 + j * 10 for j in range(len(VIEWS))], "lanczos", "5.10 depth")
        ID_SHEET = tiles(390, SX + 440, [500 + j * 40 for j in range(len(VIEWS))], "nearest-exact", "5.10 ID")
        nodes.append(node(371, "CLIPTextEncode", (SX + 880, y0), (400, 120), [""],
                          inputs=[inp("clip", "CLIP"), inp("text", "STRING", widget=True)],
                          outputs=[out("CONDITIONING", "CONDITIONING")],
                          title="5.10  SHEET PROMPT  <- section 3"))
        nodes.append(node(372, "ConditioningSetMask", (SX + 880, y0 + 160), (400, 110),
                          [GLOBAL_STRENGTH, "default"],
                          inputs=[inp("conditioning", "CONDITIONING"), inp("mask", "MASK")],
                          outputs=[out("CONDITIONING", "CONDITIONING")],
                          title="5.10  whole-sheet prompt underneath  (strength)"))
        nodes.append(node(370, "EmptySD3LatentImage", (SX + 880, y0 + 310), (400, 110), [SHEET_W, SHEET_H, 1],
                          outputs=[out("LATENT", "LATENT")], title="5.10  Empty latent %d x %d" % (SHEET_W, SHEET_H)))
        link(303, 0, 371, 0, "CLIP")
        link(SHEET_TEXT, 0, 371, 1, "STRING")
        link(371, 0, 372, 0, "CONDITIONING")
        link(366, 0, 372, 1, "MASK")
        prev = zone_conditioning(1520, SX + 1780, y0 + 460,
                                 masks_robust(1500, SX + 880, y0 + 460, ID_SHEET), base=372)
        nodes.append(node(450, "ControlNetApplyAdvanced", (SX + 2420, y0), (340, 170),
                          [CN_STRENGTH, 0.0, 1.0],
                          inputs=[inp("positive", "CONDITIONING"), inp("negative", "CONDITIONING"),
                                  inp("control_net", "CONTROL_NET"), inp("image", "IMAGE"),
                                  inp("vae", "VAE", optional=True)],
                          outputs=[out("positive", "CONDITIONING"), out("negative", "CONDITIONING")],
                          title="5.10  Apply ControlNet  (depth sheet)"))
        nodes.append(node(451, "KSampler", (SX + 2420, y0 + 210), (340, 270),
                          [SHEET_SEED, "fixed", CN_STEPS, CN_CFG, "euler", "simple", 1.0],
                          inputs=[inp("model", "MODEL"), inp("positive", "CONDITIONING"),
                                  inp("negative", "CONDITIONING"), inp("latent_image", "LATENT")],
                          outputs=[out("LATENT", "LATENT")], title="5.10  KSampler  (one pass, four cameras)"))
        nodes.append(node(452, "VAEDecode", (SX + 2420, y0 + 520), (340, 50), [],
                          inputs=[inp("samples", "LATENT"), inp("vae", "VAE")],
                          outputs=[out("IMAGE", "IMAGE")], title="VAE Decode"))
        nodes.append(node(454, "MarkdownNote", (SX + 2420, y0 + 610), (340, 640), [SHEET_NOTE],
                          title="5.10  The sheet  (how and why)"))
        nodes.append(save(453, (SX + 2800, y0), "%s/final/00-sheet_cn_zoned" % OUT_PREFIX,
                          "5.10  renders/final/00-sheet_cn_zoned", (640, 420)))
        link(prev, 0, 450, 0, "CONDITIONING")
        link(307, 0, 450, 1, "CONDITIONING")
        link(305, 0, 450, 2, "CONTROL_NET")
        link(DEPTH_SHEET, 0, 450, 3, "IMAGE")
        link(304, 0, 450, 4, "VAE")
        link(302, 0, 451, 0, "MODEL")
        link(450, 0, 451, 1, "CONDITIONING")
        link(450, 1, 451, 2, "CONDITIONING")
        link(370, 0, 451, 3, "LATENT")
        link(451, 0, 452, 0, "LATENT")
        link(304, 0, 452, 1, "VAE")
        link(452, 0, 453, 0, "IMAGE")

        # ---- 5.10b  optional hi-res refine of the whole sheet (muted) ------
        hx = SX + 3480
        nodes.append(node(455, "ImageScale", (hx, y0), (400, 90), ["lanczos", HIRES_W, HIRES_H, "disabled"],
                          inputs=[inp("image", "IMAGE")], outputs=[out("IMAGE", "IMAGE")],
                          title="5.10b  sheet x1.5  (%d x %d)" % (HIRES_W, HIRES_H)))
        nodes.append(node(456, "VAEEncode", (hx, y0 + 130), (400, 40), [],
                          inputs=[inp("pixels", "IMAGE"), inp("vae", "VAE")],
                          outputs=[out("LATENT", "LATENT")], title="-> latent"))
        nodes.append(node(457, "KSampler", (hx, y0 + 210), (400, 270),
                          [SHEET_SEED, "fixed", HIRES_STEPS, CN_CFG, "euler", "simple", HIRES_DENOISE],
                          inputs=[inp("model", "MODEL"), inp("positive", "CONDITIONING"),
                                  inp("negative", "CONDITIONING"), inp("latent_image", "LATENT")],
                          outputs=[out("LATENT", "LATENT")],
                          title="5.10b  KSampler  (refines the sheet in place: denoise)"))
        nodes.append(node(458, "VAEDecode", (hx, y0 + 520), (400, 50), [],
                          inputs=[inp("samples", "LATENT"), inp("vae", "VAE")],
                          outputs=[out("IMAGE", "IMAGE")], title="VAE Decode"))
        nodes.append(save(459, (hx, y0 + 610), "%s/final/00-sheet-hires_cn_zoned" % OUT_PREFIX,
                          "5.10b  renders/final/00-sheet-hires_cn_zoned  (OPTIONAL: un-mute to run)",
                          (400, 320), mode=MUTED))
        link(452, 0, 455, 0, "IMAGE")
        link(455, 0, 456, 0, "IMAGE")
        link(304, 0, 456, 1, "VAE")
        link(302, 0, 457, 0, "MODEL")
        link(450, 0, 457, 1, "CONDITIONING")
        link(450, 1, 457, 2, "CONDITIONING")
        link(456, 0, 457, 3, "LATENT")
        link(457, 0, 458, 0, "LATENT")
        link(304, 0, 458, 1, "VAE")
        link(458, 0, 459, 0, "IMAGE")
        group("5.10  THE SHEET  --  four isometric cameras rendered in ONE pass  (final render 1 of 3)",
              SX - 20, y0 - 50, 3920, 1330, "#6a4a3a", 20)
        s5_right = max(s5_right, SX + 3920)

        def batch_all(first, col, y, srcs):
            """Chain ImageBatch nodes first.. over srcs; returns the last node."""
            prev_id = None
            for k in range(len(srcs) - 1):
                nid = first + k
                nodes.append(image_batch(nid, (col, y + k * 70)))
                link(srcs[0] if k == 0 else prev_id, 0, nid, 0, "IMAGE")
                link(srcs[k + 1], 0, nid, 1, "IMAGE")
                prev_id = nid
            return prev_id

        def pick(nid, pos, title):
            nodes.append(node(nid, "ImageFromBatch", pos, (400, 100), [0, 1],
                              inputs=[inp("image", "IMAGE"), inp("batch_index", "INT", widget=True),
                                      inp("length", "INT", widget=True)],
                              outputs=[out("IMAGE", "IMAGE")], title=title))

        # ---- 5.12  ZONE SECTION: one area, chosen by number ---------------
        y1 = y0 + 1330 + 60
        for k, (slug, _, _) in enumerate(AREAS):
            cy = y1 + (k // 2) * 280
            add_image(1200 + k, (SX + (k % 2) * 440, cy), "massing/massing_sec_%s_depth.png" % slug,
                      "5.12  depth %d -- %s" % (k, slug), (400, 250))
            add_image(1206 + k, (SX + 880 + (k % 2) * 440, cy), "massing/massing_sec_%s_ids.png" % slug,
                      "5.12  ID %d -- %s" % (k, slug), (400, 250))
        PX = SX + 1760
        nodes.append(node(1250, "PrimitiveInt", (PX, y1), (840, 90), [0, "fixed"],
                          outputs=[out("INT", "INT")],
                          title="5.12  ZONE  --  0 entry | 1 fitting | 2 inventory | 3 workshop | 4 service | 5 patio"))
        d_last = batch_all(1220, PX, y1 + 130, [1200 + k for k in range(len(AREAS))])
        pick(1225, (PX, y1 + 500), "depth of the chosen zone")
        link(d_last, 0, 1225, 0, "IMAGE")
        link(1250, 0, 1225, 1, "INT")
        i_last = batch_all(1230, PX + 440, y1 + 130, [1206 + k for k in range(len(AREAS))])
        pick(1235, (PX + 440, y1 + 500), "ID pass of the chosen zone")
        link(i_last, 0, 1235, 0, "IMAGE")
        link(1250, 0, 1235, 1, "INT")
        b_last = batch_all(1240, PX, y1 + 660, [34 + k for k in range(len(AREAS))])   # section 2 views
        pick(1245, (PX, y1 + 1030), "massing of the chosen zone")
        link(b_last, 0, 1245, 0, "IMAGE")
        link(1250, 0, 1245, 1, "INT")
        nodes.append(node(1246, "PreviewImage", (PX + 440, y1 + 660), (400, 300), [],
                          inputs=[inp("images", "IMAGE")], title="5.12  the chosen zone  (massing)"))
        link(1245, 0, 1246, 0, "IMAGE")
        MX = PX + 920
        sec_pos = zone_conditioning(1470, MX + 880, y1, masks_robust(1260, MX, y1, 1235))
        nodes.append(node(1294, "MarkdownNote", (MX + 1500, y1), (400, 700), [SECTION_NOTE],
                          title="5.12  Zone section  (how and why)"))
        right = MX + 1900
        group("5.12  ZONE SECTION  --  one area, chosen by the ZONE number: passes + zone masks  (rendered in 5.14)",
              SX - 20, y1 - 50, right - SX + 40, 1260, "#3a5a6a", 20)
        s5_right = max(s5_right, right + 20)

        # ---- 5.13  FREE CAMERA: the viewer is the camera --------------------
        y2 = y1 + 1260 + 60
        FX = SX
        l3d_out = [out("model_3d", "FILE_3D"), out("model_3d_info", "LOAD3D_MODEL_INFO"),
                   out("camera_info", "LOAD3D_CAMERA"), out("width", "INT"), out("height", "INT")]
        filt_out = [out("model_3d", "FILE_3D"), out("all_parts", "STRING"),
                    out("affected", "STRING"), out("visible_count", "INT")]
        filt_in = lambda: [inp("parts", "STRING", widget=True), inp("model_3d", "FILE_3D", optional=True)]
        # one list drives both filters; the ID twin's __z<n> suffix is ignored by the match
        nodes.append(text(1309, (FX, y2), (620, 170), FREE_HIDE,
                          "5.13  HIDE PARTS  --  one part name per line, * ? wildcards, # comment  (both models)"))
        nodes.append(node(1300, "MPGLBPartFilter", (FX, y2 + 200), (620, 150), [FREE_MODEL, FREE_HIDE, "hide"],
                          inputs=filt_in(), outputs=list(filt_out),
                          title="5.13  model, parts hidden  (%s)" % FREE_MODEL))
        nodes.append(node(1311, "Preview3DAdvanced", (FX, y2 + 380), (620, 540), [{}, W, H],
                          inputs=[inp("model_3d", "FILE_3D"),
                                  inp("model_3d_info", "LOAD3D_MODEL_INFO", optional=True),
                                  inp("camera_info", "LOAD3D_CAMERA", optional=True)],
                          outputs=list(l3d_out),
                          title="5.13  FREE CAMERA  --  orbit / pan / zoom here, then Run"))
        nodes.append(node(1301, "MPGLBPartFilter", (FX, y2 + 950), (620, 150), [FREE_ID_MODEL, FREE_HIDE, "hide"],
                          inputs=filt_in(), outputs=list(filt_out),
                          title="5.13  ID model, same parts hidden  (%s)" % FREE_ID_MODEL))
        nodes.append(node(1302, "Get3DComponents", (FX + 660, y2), (300, 60), [],
                          inputs=[inp("model_3d", "FILE_3D")], outputs=[out("mesh", "MESH")]))
        nodes.append(node(1303, "Get3DComponents", (FX + 660, y2 + 600), (300, 60), [],
                          inputs=[inp("model_3d", "FILE_3D")], outputs=[out("mesh", "MESH")]))
        rm_in = lambda: [inp("mesh", "MESH"), inp("model_3d_info", "LOAD3D_MODEL_INFO", optional=True),
                         inp("camera_info", "LOAD3D_CAMERA", optional=True)]
        nodes.append(node(1304, "RenderMesh", (FX + 660, y2 + 100), (300, 200), ["depth", W, H, "#000000"],
                          inputs=rm_in(), outputs=[out("image", "IMAGE"), out("mask", "MASK")],
                          title="depth pass  (live, this camera)"))
        nodes.append(node(1305, "RenderMesh", (FX + 660, y2 + 700), (300, 200), ["vertex colors", W, H, "#000000"],
                          inputs=rm_in(), outputs=[out("image", "IMAGE"), out("mask", "MASK")],
                          title="ID pass  (live, this camera)"))
        nodes.append(node(1306, "PreviewImage", (FX + 1000, y2), (400, 330), [],
                          inputs=[inp("images", "IMAGE")], title="5.13  depth  --  what the ControlNet gets"))
        nodes.append(node(1307, "PreviewImage", (FX + 1000, y2 + 600), (400, 330), [],
                          inputs=[inp("images", "IMAGE")], title="5.13  ID pass  --  the zone masks"))
        nodes.append(node(1312, "PreviewAny", (FX + 1000, y2 + 350), (400, 230), [],
                          inputs=[inp("source", "*")],
                          title="5.13  part names in the model  --  what HIDE PARTS can name"))
        nodes.append(node(1313, "PreviewAny", (FX + 660, y2 + 920), (300, 180), [],
                          inputs=[inp("source", "*")], title="hidden now"))
        nodes.append(node(1308, "CreateCameraInfo", (FX + 660, y2 + 340), (300, 240),
                          ["orbit", 135.0, 30.0, 24.0, TARGET[0], TARGET[1], TARGET[2],
                           0.0, 35.0, 1.0, "perspective"],
                          outputs=[out("camera_info", "LOAD3D_CAMERA")],
                          title="camera by numbers  (alternative: link to both camera_info)"))
        link(1309, 0, 1300, 0, "STRING")
        link(1309, 0, 1301, 0, "STRING")
        link(1300, 0, 1311, 0, "FILE_3D")
        link(1311, 0, 1302, 0, "FILE_3D")
        link(1302, 0, 1304, 0, "MESH")
        link(1311, 1, 1304, 1, "LOAD3D_MODEL_INFO")
        link(1311, 2, 1304, 2, "LOAD3D_CAMERA")
        link(1301, 0, 1303, 0, "FILE_3D")
        link(1303, 0, 1305, 0, "MESH")
        link(1311, 1, 1305, 1, "LOAD3D_MODEL_INFO")
        link(1311, 2, 1305, 2, "LOAD3D_CAMERA")
        link(1304, 0, 1306, 0, "IMAGE")
        link(1305, 0, 1307, 0, "IMAGE")
        link(1300, 1, 1312, 0, "STRING")
        link(1300, 2, 1313, 0, "STRING")
        MX = FX + 1440
        free_pos = zone_conditioning(1310, MX + 880, y2, masks_robust(1350, MX, y2, 1305))
        nodes.append(node(1344, "MarkdownNote", (MX + 1500, y2), (400, 700), [FREECAM_NOTE],
                          title="5.13  Free camera  (how and why)"))
        right = MX + 1900
        group("5.13  FREE CAMERA  --  hide parts, set any angle: depth + zone passes baked live  (rendered in 5.14)",
              SX - 20, y2 - 50, right - SX + 40, 1260, "#5a5a2f", 20)
        s5_right = max(s5_right, right + 20)

        # ---- 5.14  DERIVE: section + free camera from the finished sheet ----
        y3 = y2 + 1260 + 60
        DX = SX

        def scale_tile(nid, pos, src, method, title):
            nodes.append(node(nid, "ImageScale", pos, (400, 90), [method, PANEL_W, PANEL_H, "disabled"],
                              inputs=[inp("image", "IMAGE")], outputs=[out("IMAGE", "IMAGE")], title=title))
            link(src, 0, nid, 0, "IMAGE")

        def concat_sheet(nid, pos, srcs, title):
            """Batch srcs in order and tile them DERIVE_COLS wide. Uses ids nid..nid+5."""
            last = batch_all(nid, pos[0], pos[1], srcs)
            nodes.append(node(nid + 5, "ImageConcatFromBatch", (pos[0], pos[1] + 370), (400, 110),
                              [DERIVE_COLS, False, 4096],
                              inputs=[inp("images", "IMAGE")], outputs=[out("IMAGE", "IMAGE")], title=title))
            link(last, 0, nid + 5, 0, "IMAGE")
            return nid + 5

        # the four finished iso panels, cut from the sheet (5.10) at panel size
        iso_panels = []
        for j, cam in enumerate(VIEWS):
            cx, cy = (j % SHEET_COLS) * PANEL_W, (j // SHEET_COLS) * PANEL_H
            nodes.append(node(1718 + j, "ImageCrop", (DX, y3 + j * 120), (400, 110), [PANEL_W, PANEL_H, cx, cy],
                              inputs=[inp("image", "IMAGE")], outputs=[out("IMAGE", "IMAGE")],
                              title="5.14  finished panel -- %s  (from the sheet)" % cam))
            link(452, 0, 1718 + j, 0, "IMAGE")
            iso_panels.append(1718 + j)
        scale_tile(1702, (DX, y3 + 500), 1225, "lanczos", "5.14  section depth tile")
        scale_tile(1703, (DX, y3 + 600), 1304, "lanczos", "5.14  free camera depth tile")
        scale_tile(1704, (DX, y3 + 700), 1235, "nearest-exact", "5.14  section ID tile")
        scale_tile(1705, (DX, y3 + 800), 1305, "nearest-exact", "5.14  free camera ID tile")
        # the picture: finished panels + the two depth tiles as placeholders (fully re-noised)
        BASE = concat_sheet(1722, (DX + 440, y3), iso_panels + [1702, 1703],
                            "5.14  BASE  (%d x %d: 4 finished + 2 placeholders)" % (DERIVE_W, DERIVE_H))
        DEPTH_B = concat_sheet(1706, (DX + 880, y3), [380 + j for j in range(len(VIEWS))] + [1702, 1703],
                               "5.14  depth SHEET  (%d x %d)" % (DERIVE_W, DERIVE_H))
        ID_B = concat_sheet(1712, (DX + 1320, y3), [390 + j for j in range(len(VIEWS))] + [1704, 1705],
                            "5.14  ID SHEET  (%d x %d)" % (DERIVE_W, DERIVE_H))
        nodes.append(node(1728, "VAEEncode", (DX + 440, y3 + 520), (400, 40), [],
                          inputs=[inp("pixels", "IMAGE"), inp("vae", "VAE")],
                          outputs=[out("LATENT", "LATENT")], title="-> latent"))
        nodes.append(node(1729, "SolidMask", (DX + 440, y3 + 600), (400, 110), [0.0, DERIVE_W, DERIVE_H],
                          outputs=[out("MASK", "MASK")], title="keep: the four finished panels (0)"))
        nodes.append(node(1730, "SolidMask", (DX + 440, y3 + 750), (400, 110), [1.0, PANEL_W * 2, PANEL_H],
                          outputs=[out("MASK", "MASK")], title="re-noise: the two new panels (1)"))
        nodes.append(node(1731, "MaskComposite", (DX + 440, y3 + 900), (400, 130),
                          [PANEL_W * (len(VIEWS) % DERIVE_COLS), PANEL_H * (len(VIEWS) // DERIVE_COLS), "add"],
                          inputs=[inp("destination", "MASK"), inp("source", "MASK")],
                          outputs=[out("MASK", "MASK")], title="noise mask  (new panels only)"))
        nodes.append(node(1732, "SetLatentNoiseMask", (DX + 440, y3 + 1070), (400, 50), [],
                          inputs=[inp("samples", "LATENT"), inp("mask", "MASK")],
                          outputs=[out("LATENT", "LATENT")], title="latent: finished panels frozen"))
        link(BASE, 0, 1728, 0, "IMAGE")
        link(304, 0, 1728, 1, "VAE")
        link(1729, 0, 1731, 0, "MASK")
        link(1730, 0, 1731, 1, "MASK")
        link(1728, 0, 1732, 0, "LATENT")
        link(1731, 0, 1732, 1, "MASK")
        # prompt: derive text + final prompt, whole sheet underneath, six areas by ID
        nodes.append(node(1700, "CLIPTextEncode", (DX + 1760, y3), (400, 120), [""],
                          inputs=[inp("clip", "CLIP"), inp("text", "STRING", widget=True)],
                          outputs=[out("CONDITIONING", "CONDITIONING")],
                          title="5.14  DERIVE PROMPT  <- section 3"))
        nodes.append(node(1701, "ConditioningSetMask", (DX + 1760, y3 + 160), (400, 110),
                          [GLOBAL_STRENGTH, "default"],
                          inputs=[inp("conditioning", "CONDITIONING"), inp("mask", "MASK")],
                          outputs=[out("CONDITIONING", "CONDITIONING")],
                          title="5.14  whole-sheet prompt underneath  (strength)"))
        link(303, 0, 1700, 0, "CLIP")
        link(DERIVE_TEXT, 0, 1700, 1, "STRING")
        link(1700, 0, 1701, 0, "CONDITIONING")
        link(366, 0, 1701, 1, "MASK")
        der_pos = zone_conditioning(1760, DX + 1760 + 880, y3 + 310,
                                    masks_robust(1740, DX + 1760, y3 + 310, ID_B), base=1701)
        KX = DX + 1760 + 1500
        nodes.append(node(1790, "ControlNetApplyAdvanced", (KX, y3), (340, 170), [CN_STRENGTH, 0.0, 1.0],
                          inputs=[inp("positive", "CONDITIONING"), inp("negative", "CONDITIONING"),
                                  inp("control_net", "CONTROL_NET"), inp("image", "IMAGE"),
                                  inp("vae", "VAE", optional=True)],
                          outputs=[out("positive", "CONDITIONING"), out("negative", "CONDITIONING")],
                          title="5.14  Apply ControlNet  (depth sheet)"))
        nodes.append(node(1791, "KSampler", (KX, y3 + 210), (340, 270),
                          [DERIVE_SEED, "fixed", CN_STEPS, CN_CFG, "euler", "simple", 1.0],
                          inputs=[inp("model", "MODEL"), inp("positive", "CONDITIONING"),
                                  inp("negative", "CONDITIONING"), inp("latent_image", "LATENT")],
                          outputs=[out("LATENT", "LATENT")],
                          title="5.14  KSampler  (only the two new panels are drawn)"))
        nodes.append(node(1792, "VAEDecode", (KX, y3 + 520), (340, 50), [],
                          inputs=[inp("samples", "LATENT"), inp("vae", "VAE")],
                          outputs=[out("IMAGE", "IMAGE")], title="VAE Decode"))
        nodes.append(node(1793, "PreviewImage", (KX + 380, y3), (640, 400), [],
                          inputs=[inp("images", "IMAGE")],
                          title="5.14  the derived sheet  (four finished + section + free camera)"))
        nodes.append(node(1794, "MarkdownNote", (KX, y3 + 610), (340, 620), [DERIVE_NOTE],
                          title="5.14  Deriving from the sheet  (how and why)"))
        link(der_pos, 0, 1790, 0, "CONDITIONING")
        link(307, 0, 1790, 1, "CONDITIONING")
        link(305, 0, 1790, 2, "CONTROL_NET")
        link(DEPTH_B, 0, 1790, 3, "IMAGE")
        link(304, 0, 1790, 4, "VAE")
        link(302, 0, 1791, 0, "MODEL")
        link(1790, 0, 1791, 1, "CONDITIONING")
        link(1790, 1, 1791, 2, "CONDITIONING")
        link(1732, 0, 1791, 3, "LATENT")
        link(1791, 0, 1792, 0, "LATENT")
        link(304, 0, 1792, 1, "VAE")
        link(1792, 0, 1793, 0, "IMAGE")
        # crop each new panel, upscale to W x H, refine with its own depth lock + zone masks
        RX = KX + 1060
        finals = [("section", 1795, 1797, 1799, sec_pos, 1225, CN_SEED + SECTION_SEED_OFFSET,
                   "01-section_cn_zoned", 1810, 0),
                  ("free camera", 1796, 1798, 1800, free_pos, 1304, CN_SEED + FREE_SEED_OFFSET,
                   "02-free-camera_cn_zoned", 1820, 620)]
        for name, crop, scl, enc, positive, depth_src, seed, prefix, first, dy in finals:
            k = len(VIEWS) + (0 if name == "section" else 1)
            cx, cy = (k % DERIVE_COLS) * PANEL_W, (k // DERIVE_COLS) * PANEL_H
            nodes.append(node(crop, "ImageCrop", (RX, y3 + dy), (400, 110), [PANEL_W, PANEL_H, cx, cy],
                              inputs=[inp("image", "IMAGE")], outputs=[out("IMAGE", "IMAGE")],
                              title="5.14  %s panel  (from the derived sheet)" % name))
            nodes.append(node(scl, "ImageScale", (RX, y3 + dy + 130), (400, 90), ["lanczos", W, H, "center"],
                              inputs=[inp("image", "IMAGE")], outputs=[out("IMAGE", "IMAGE")],
                              title="upscale to %d x %d" % (W, H)))
            nodes.append(node(enc, "VAEEncode", (RX, y3 + dy + 240), (400, 40), [],
                              inputs=[inp("pixels", "IMAGE"), inp("vae", "VAE")],
                              outputs=[out("LATENT", "LATENT")], title="-> latent for the refine"))
            link(1792, 0, crop, 0, "IMAGE")
            link(crop, 0, scl, 0, "IMAGE")
            link(scl, 0, enc, 0, "IMAGE")
            link(304, 0, enc, 1, "VAE")
            right = render_chain(first, RX + 440, y3 + dy, positive, depth_src, seed, prefix,
                                 "5.14  FINAL %s" % name.upper(), "", "", latent=enc,
                                 steps=REFINE_STEPS, denoise=REFINE_DENOISE)
        # render_chain wrote an empty note per chain; drop those two
        nodes[:] = [n for n in nodes if not (n["id"] in (1814, 1824))]
        group("5.14  DERIVE  --  section + free camera drawn beside the finished isometrics, then refined at full size  (final renders 2 and 3 of 3)",
              SX - 20, y3 - 50, right - SX + 40, 1300, "#2f5a4a", 20)
        s5_right = max(s5_right, right + 20)
        s5_h = max(s5_h, y3 + 1300 - S5Y)

    for j, cam in enumerate(VIEWS):
        b = 310 + j * 10
        y = S5Y + 60 + j * ROW
        add_image(b, (VX, y), "massing/massing_%s_depth.png" % cam,
                  "5.5  Depth pass -- %s" % cam, (400, 330))
        if ZONED:
            # Baked passes only; they feed the sheet (5.10). No per-camera render.
            z = 500 + j * 40
            add_image(z, (VX + 440, y), "massing/massing_%s_ids.png" % cam,
                      "5.9  ID pass -- %s  (one colour per area)" % cam, (400, 330))
            group("5.5  %s  (baked passes  ->  the sheet, 5.10)" % cam.upper(),
                  VX - 20, y - 50, 880, ROW - 40, "#6a3f4a", 20)
            continue
        positive = 306
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
        nodes.append(save(b + 4, (AX + 380, y), "%s/final/%s_cn" % (OUT_PREFIX, cam),
                          "5.8  renders/final/%s_cn" % cam, (520, 360)))

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

        group("5.5  %s  (depth-locked)" % cam.upper(), VX - 20, y - 50, AX - VX + 960, ROW - 40, "#6a3f4a", 20)

    group("SECTION 5  --  CONTROLNET RENDERS  (Qwen-Image + InstantX Union on the depth pass%s)"
          % (" + regional prompts:  the SHEET, one ZONE SECTION, one FREE CAMERA" if ZONED else ""),
          S5X - 20, S5Y - 20, s5_right - S5X, s5_h, SECTION_COLORS["s5"])

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
