# mpillow-office

Showroom visualisation for the Mpillow showroom fit-out at Midview City.

Everything runs locally on ComfyUI. No paid API nodes, no credits, no cloud
3D services. All models are open weights from Hugging Face.

## Layout

```
source/      Custom Pillow Showroom Design.pdf  -- the brief, Rev A, 10 pp
ref-img/     everything ComfyUI reads, by absolute path
  floorplan/   brief-01..10.png (pages), plan-p4-300dpi.png (the plan)
  site/        the four site photos from page 3
  massing/     baked cutaway, depth, ID and zoned views of the 3D model, plus one
               section per area (massing_sec_<area>*), from render_views.py
  moodboard/   01-entry-waiting/ .. 06-patio-wash-dry/   <- drop refs here
  furniture/   01-entry-waiting/ .. 06-patio-wash-dry/   <- drop refs here
  renders/     earlier outputs kept as references (v1-v3, old sheets)
model/       showroom_massing.glb / .obj  -- the dimensioned 3D model
             showroom_massing_cut.glb     -- north wall + patio roof off (cutaway)
             showroom_massing_ids.glb, showroom_massing_cut_ids.glb
                                          -- the same, coloured by area (ID model)
plans/       <name>.yaml  -- plan specs: every number of a model (showroom.yaml,
                             hdb-4rm-1bh.yaml); sources/ holds their drawings,
                             presets/ the answers that hold for a kind of plan
tools/       build_massing.py, plan_check.py, plan_read.py, plan_env.py,
             render_views.py, build_workflow.py
requirements.txt  -- the Python packages tools/ needs
comfy_nodes/ mp_glb_parts/  -- GLB Part Filter, a custom ComfyUI node: show / hide
                                named parts of a model on the canvas (junction it
                                into ComfyUI/custom_nodes)
workflows/   showroom_moodboard_16x9.json  -- the one workflow
             showroom_zoned_16x9.json      -- colour-zoned areas, three final renders
renders/     outputs (== ComfyUI/output/mpillow-office/)
  moodboard/   one sheet per area + the two master sheets
  final/       plain workflow: one render per camera view, 16:9
               <view>        section 4      <view>_cn        section 5
               zoned workflow: exactly three
               00-sheet_cn_zoned          5.10  four isometrics in one picture
               00-sheet-hires_cn_zoned    5.10b optional 1.5x refine (muted)
               01-section_cn_zoned        5.14  section through the chosen zone (5.12),
                                                derived from the sheet
               02-free-camera_cn_zoned    5.14  the camera you set in the viewer (5.13),
                                                derived from the sheet
```

Nothing is copied between the repo and ComfyUI. References are read from
`ref-img/` by absolute path (the folder loaders and the path-based image
loaders both take one). `renders/` is a directory junction:

```
<repo>/renders  ->  ComfyUI/output/mpillow-office
```

It points from the repo into ComfyUI, not the other way round, because
ComfyUI refuses to read or write through a link that resolves outside its
own input/output folders. The workflow JSON is mirrored to
`ComfyUI/user/default/workflows/mpillow-office/` so it opens from the
sidebar.

## The workflow, in five sections

Open **Workflows -> mpillow-office -> showroom_moodboard_16x9**. It reads
left to right.

**1. MOODBOARDS.** Six groups, one per area. Each reads two folders,
`ref-img/moodboard/<area>/` and `ref-img/furniture/<area>/`, tiles up to
six images from each into a contact sheet, and hands both sheets plus the
area prompt to `Image Edit (Qwen 2509)`, which composes one moodboard sheet.
Drop images into a folder and press Run. The loaders hash the files, so only
the areas whose folders changed re-execute. The area prompt in each group is
the one knob: it drives that area's moodboard *and* its description in the
final render prompt.

**2. FLOOR PLAN -> 3D.** The page-4 plan, a note on how it became geometry,
the GLB in a `Load3D` node you can orbit, and the four baked cutaway views
the renders are locked to (`iso_ne`, `iso_nw`, `iso_low`, `long_sec`).

**3. PROMPTS.** Render base, materials palette, lighting and time of day,
then the six area prompts pulled in from section 1, all concatenated into
one final prompt. A preview node shows the exact text the model receives,
so a change anywhere upstream is visible before the render runs.

**4. RENDERS.** The six area moodboards are tiled into one master moodboard
and the six furniture sheets into one master furniture sheet. Each camera
view then gets its own `Image Edit (Qwen 2509)`: `image` = massing view,
`image2` = master moodboard, `image3` = master furniture, `prompt` = the
final prompt. Output is always 16:9, 1664 x 928.

**5. CONTROLNET RENDERS.** The same final prompt, but generated from scratch
with Qwen-Image and pinned to each camera's depth pass through the InstantX
ControlNet Union. Explicit core nodes: shared loaders (base model, Lightning
LoRA, sampling shift, text encoder, VAE, ControlNet), one positive encode fed
by the section 3 prompt, one negative, then per view `Apply ControlNet ->
KSampler -> VAE Decode -> Save` to `renders/final/<view>_cn`. No reference
images go in, so materials and light come from the prompt while geometry and
viewpoint come from the depth map. `strength` on each Apply ControlNet node
is the knob (1.0 traces the model exactly, 0.6-0.8 lets detail deviate).

## The zoned variant

`showroom_zoned_16x9.json` is the same five-section graph built with
`--zoned`. It answers "how does each area get its own look" with a colour
**ID pass**: `render_views.py` paints every visible surface point with the
flat colour of the area it sits in (by plan position: red entry, green
fitting, blue inventory, yellow workshop, magenta service, cyan patio) and
writes `massing_<view>_ids.png`, a tinted `massing_<view>_zoned.png`, and
`zones.json` with the frame coverage of each area per camera.

- **Section 5.9** does regional prompting. One mask per area is recovered
  from the ID pass by thresholding its R, G and B channels at 0.5 and
  combining them with mask arithmetic (red = R - G - B, yellow = R x G - B,
  and so on). An exact-colour match (`ImageColorToMask`) is not safe: the
  image loader shifts more than half the pixels by a level or two, and the
  live Render Mesh pass some more, which left holes in the masks. Each
  area prompt from section 1 is
  encoded on its own and confined to its mask with `ConditioningSetMask`;
  all sit on top of the whole-scene prompt (full-frame mask, strength 0.35)
  and are combined before the depth ControlNet. The sampler evaluates the
  model once per conditioning entry and blends by mask, so a pass costs
  about seven times a plain one.
The zoned workflow produces exactly **three final renders**, all through
the same zoning:

- **Section 5.10, the sheet: the four isometrics in one picture.**
  Rendered one at a time, each camera is drawn from fresh noise and the
  materials and furniture drift between them. Instead, the four depth
  passes (`iso_ne`, `iso_nw`, `iso_low`, `iso_high`) are tiled two by two
  into one 2048 x 1152 control image, the four ID passes into one mask
  image, and a single sampling pass renders all four cameras inside one
  picture with the zone prompts confined to their zones on the sheet.
  Materials, furniture and light are decided once, in one latent, for
  every angle. The sheet is the deliverable and is not split up. Output
  `renders/final/00-sheet_cn_zoned`. **5.10b** (muted) upscales the whole
  sheet 1.5x to 3072 x 1728 and refines it in place at denoise 0.4 with the
  same masks and depth lock; un-mute its Save node to run it. Output
  `renders/final/00-sheet-hires_cn_zoned`.
- **Section 5.12, one zone section, chosen by number (passes).**
  `render_views.py` bakes a section per area (`SECTIONS`): the model is
  clipped to the area's plan box with the cut faces capped, and an
  orthographic camera looks in from the open side, 15 degrees from above.
  All six depth passes and all six ID passes are loaded into two batches
  and the **ZONE** integer on the canvas (0 entry, 1 fitting, 2 inventory,
  3 workshop, 4 service, 5 patio) picks one of each with `Get Image from
  Batch`. A preview shows the chosen massing section.
- **Section 5.13, one free camera (passes).** A **HIDE PARTS** text box
  is the layer switch: one glTF part name per line (`wall_north`,
  `poly_roof*`, `box_??`; `*` `?` wildcards, `#` comments). ComfyUI has no
  node that hides parts of a model, so the list feeds two `GLB Part
  Filter` nodes (`comfy_nodes/mp_glb_parts`, ours, trimesh): one drops
  those parts from the full model (`showroom_massing.glb`), one drops the
  same parts from the zone-coloured ID twin (`showroom_massing_ids.glb`,
  every part cut along the area boundaries and painted with its area
  colour by `build_massing.py`; its pieces carry a `__z<n>` suffix the
  match ignores), so depth and masks always agree. The default list is
  the cutaway (north wall + patio roof); an empty box is the closed room;
  `show_only` keeps just the listed parts. A `part names in the model`
  preview lists every name you can type. The filtered model goes into a
  `Preview 3D (Advanced)` viewer, which is the camera: orbit, pan and
  zoom it by hand, press Run. Its camera goes to two `Render Mesh` nodes
  that bake, live and at 1664 x 928, the depth pass and the ID pass for
  that exact camera. Nothing is baked in advance, so any angle works,
  including inside the room. A `Create Camera Info` node sits next to the
  viewer for cameras by numbers (orbit yaw / pitch / distance, or an
  explicit eye position); link it to `camera_info` on both Render Mesh
  nodes to use it.
- **Section 5.14, derive: the section and the free camera come from the
  sheet.** Drawn on their own they would start from fresh noise and pick
  their own materials. Instead, the four finished panels are cut out of
  the sheet at panel size and laid out three by two with the two new views;
  the latent of that picture gets a noise mask covering only the two new
  panels (`SetLatentNoiseMask`), so the sampler re-draws just those while
  attending to the finished isometrics in the same latent. The depth and
  ID sheets are tiled the same way, so the new panels are depth-locked and
  zone-prompted exactly like the sheet. Each new panel is then cropped,
  upscaled to 1664 x 928 and refined by its own depth-locked, zone-prompted
  sampler at denoise 0.5. Outputs `renders/final/01-section_cn_zoned` and
  `renders/final/02-free-camera_cn_zoned` (ComfyUI numbers the files, so
  switching zones keeps the earlier ones). Changing the zone or the camera
  re-runs only 5.14 and the refine; the sheet stays cached.
- **Section 4** keeps only the two master moodboard sheets here; there are
  no per-camera edits in the zoned workflow.

The InstantX Union has no segmentation mode (canny, soft edge, depth, pose
only), which is why the ID pass drives masks rather than the ControlNet
itself. Sections 1 to 3 are identical to the plain workflow, so their
results are shared through the ComfyUI cache.

Knobs: the sheet KSampler's `seed` picks a new coherent scheme for all four
cameras at once; the section and free-camera KSamplers have their own
seeds; `SECTIONS` and `SEC_PITCH` in `render_views.py` set where each zone
is cut and from where it is seen; HIDE PARTS in 5.13 (default
`FREE_HIDE` in `build_workflow.py`) sets which parts the free camera
sees.

Tried and dropped: matching each camera to a hero render with
Qwen-Image-Edit-2509 (draft as image 1, hero as image 2). With a photo
reference the edit model reproduces that photo; at partial denoise it
changes nothing, and the depth ControlNet cannot override it.

## The fast zoned variant

`showroom_zoned_fast_16x9.json` (`python tools/build_workflow_fast.py`) is
the zoned workflow, same sections and the same three renders, rebuilt to
run quickly on a 16 GB card. Prompts, areas, colours and camera defaults are
imported from `build_workflow.py`, so the two never drift apart. Outputs
carry a `_fast` suffix so they sit next to the originals for comparison.

- **One model, resident.** Qwen-Image-2.1 (7B, generates and edits) with
  the Viggle turbo v0.3 LoRA merged in, int8, 7.3 GB. It replaces both 20B
  models (Edit-2509 and Qwen-Image, 19 GB each), which never fitted in VRAM
  and streamed from RAM on every step.
- **6 steps, no CFG** (euler + BasicGuider). The turbo schedule's
  resolution shift is computed by the build script into `ManualSigmas`
  nodes, one per picture size, so no custom node is needed. Change a size in
  the script and rebuild; do not hand-edit them.
- **Depth lock:** the Qwen-Image-2.1 Fun ControlNet Union, a model patch
  (`Load Model Patch` -> `Apply Fun ControlNet`), strength 0.85.
- **Moodboards:** the mood and furniture contact sheets go in as reference
  images 1 and 2 of `Text Encode Qwen Image 2.1`; no edit subgraph.
- **Zone masks:** one KJNodes `Color To Mask` per area (RGB distance 120)
  instead of 18 channel-arithmetic nodes per ID image.
- **ZONING switch** (top of section 5): `false` drops the six regional
  prompts and samples with the whole-scene prompt only, for quick look-dev.
  The depth lock stays on.
- Refines (section, free camera, muted 5.10b hi-res at 2560 x 1440) use the
  last two turbo steps, starting near 0.7 noise.

| File | Folder | Source |
| --- | --- | --- |
| `Qwen-Image-2.1-viggle-turbo-v0.3-6step-int8_convrot.safetensors` | diffusion_models | `Viggle/Qwen-Image-2.1-viggle-turbo` |
| `qwen3vl_8b_int8_convrot.safetensors` | text_encoders | `Comfy-Org/Qwen-Image-2.1` |
| `qwen_image_2.1_vae_bf16.safetensors` | vae | `Comfy-Org/Qwen-Image-2.1` |
| `qwen_image_2.1_fun_controlnet_union_int8_convrot.safetensors` | model_patches | `Comfy-Org/Qwen-Image-2.1` |

**Licence:** Qwen-Image-2.1 and the turbo are under the Qwen Research
License (non-commercial). Use them for evaluation; clear the licence before
any render goes to a client.

## Why the 3D step is computed, not generated

Image-to-3D models (TRELLIS.2, Hunyuan3D, Tripo, Meshy, Rodin) rebuild a
single object from a photo. The official ComfyUI docs say TRELLIS.2 "targets
individual items, not scenes or architecture". None will turn a plan into a
room, and the ones installed here are paid cloud APIs.

So `tools/build_massing.py` builds the room from numbers: every dimension
from the brief, every position read off the page-4 plan, all of it in
`plans/showroom.yaml`. 165 parts. It is authored with north up, exactly as
drawn, then mirrored on export so the GLB is right-handed for Y-up viewers.

## New floor plans

A new plan is a new spec, not new code. The `plan-to-3d` skill
(`.claude/skills/plan-to-3d/`) runs the whole loop. By hand:

```
python tools/plan_env.py                          # ready? Python 3.10+, packages, poppler;
                                                  # prints the install commands if not
python -m pip install -r requirements.txt         # the packages (poppler is a system install)
python tools/plan_read.py render plans/sources/<plan>.pdf --out plans/.cache/<plan>.png
python tools/plan_read.py lines|ticks ...         # find the dimension chains -> calibrate
python tools/plan_read.py --spec plans/<plan>.yaml solids | scan z=.. x=.. | grid
python tools/plan_check.py plans/<plan>.yaml --breakdown   # the gate; exit 0 = PASS;
                                                  # per wall / window / door scores
python tools/build_massing.py plans/<plan>.yaml   # -> model/<base>*.glb
```

`plan_check` lays the model over the drawing (`model/<base>_check.png`) and
fails unless every dimension chain adds up, at least 90% of the wall outlines
sit on drawn lines (and every wall at least 60%), every solid fill on the
plan is covered, and no entry in the spec's `assumptions:` is still `open`.
That last point is deliberate: a plan never gives heights, and it is often
ambiguous about a wall or two. Each such value is written down with the
default used, and the skill asks the user about it until it is confirmed.

`plans/hdb-4rm-1bh.yaml` is the worked example: an HDB 4-room type plan
from a vector PDF. Every wall outline lands on the drawing, the dimension
chains close exactly, and its nine assumptions (heights, an undrawn bedroom
wall, the service yard parapet, zoning) were settled with the user. It
passes. `plans/showroom.yaml` rebuilds the committed showroom GLB and its
cutaway byte for byte. The two ID models would come out slightly different:
pieces of a zone that spans several regions are now joined, where the old
script kept only the last, so the committed ones lack a floor piece. The
showroom drawing is a presentation sketch rather than a real plan, so its
check is informational only.

The skill asks first what kind of plan it is. Answers that hold for every
plan of a kind live in `plans/presets/<kind>.yaml`. `hdb.yaml` holds the HDB
heights, parapets and zone grouping, taken from the answers on the first HDB
plan. A new HDB spec starts from that file, and the user accepts or changes
all of its values in one question. Only what is particular to the drawing is
still asked, such as an undrawn wall or an optional partition.

`render_views.py` and the workflow builders still read the showroom's
constants. Rendering a new plan needs them pointed at its spec (next step).

## Pipeline

```
python tools/plan_check.py plans/showroom.yaml   # spec vs drawing -> model/showroom_massing_check.png
python tools/build_massing.py    # plans/showroom.yaml -> model/showroom_massing*.glb (+ ComfyUI/input/3d/)
python tools/render_views.py     # -> ref-img/massing/massing_<view>[_depth|_ids|_zoned].png
                                 #    and massing_sec_<area>*.png, zones.json
python tools/build_workflow.py   # -> workflows/showroom_moodboard_16x9.json (+ sidebar)
python tools/build_workflow.py --zoned   # -> workflows/showroom_zoned_16x9.json (+ sidebar)
```

The zoned workflow needs the custom node once per ComfyUI install (a
junction keeps it in step with the repo; a copy works too). Restart
ComfyUI afterwards:

```
mklink /J D:\AI\ComfyUI\custom_nodes\mp_glb_parts <repo>\mpillow-office\comfy_nodes\mp_glb_parts
```

Nothing is hand-edited JSON. Change a prompt, a folder, a dimension or a
camera in the script and rebuild.

## Models

Already installed; nothing to download for the pipeline:

| File | Role |
| --- | --- |
| `qwen_image_edit_2509_fp8_e4m3fn.safetensors` | image edit (sections 1 and 4) |
| `qwen_image_fp8_e4m3fn.safetensors` | Qwen-Image base, text-to-image (section 5) |
| `Qwen-Image-InstantX-ControlNet-Union.safetensors` | depth ControlNet (section 5; `Comfy-Org/Qwen-Image-InstantX-ControlNets`) |
| `qwen_2.5_vl_7b_fp8_scaled.safetensors` | text encoder (all sections) |
| `qwen_image_vae.safetensors` | VAE (all sections) |
| `Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors` | 4-step LoRA for the edit model |
| `Qwen-Image-Lightning-4steps-V1.0.safetensors` | 4-step LoRA for the base model |

## Known limits

- **`Load3D` cannot run headless.** Its `image` input is a viewport snapshot
  the browser captures, so the chain only executes when you press Run in the
  ComfyUI tab. It is present but muted; the baked views are used instead.
- **Drawing vs brief text.** The plan draws the store strip as 0.62 box row +
  1.00 aisle + 0.44 shelf, the text says 0.80 + 0.76 + 0.44. The model uses
  the text values; the difference is under 0.25 m.
- The brief flags a survey conflict: site gives the main floor as 12.18 x
  7.89 m and the patio as 7.87 x 3.14 m, the as-built gives 10.45 m plus
  4.55 m within 17.75 m overall. **Everything here is built to the
  as-built.** A measured survey is still needed.
