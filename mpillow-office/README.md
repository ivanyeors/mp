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
  massing/     baked cutaway, depth, ID and zoned views of the 3D model (render_views.py)
  moodboard/   01-entry-waiting/ .. 06-patio-wash-dry/   <- drop refs here
  furniture/   01-entry-waiting/ .. 06-patio-wash-dry/   <- drop refs here
  renders/     earlier outputs kept as references (v1-v3, old sheets)
model/       showroom_massing.glb / .obj  -- the dimensioned 3D model
tools/       build_massing.py, render_views.py, build_workflow.py
workflows/   showroom_moodboard_16x9.json  -- the one workflow
             showroom_zoned_16x9.json      -- the same, with colour-zoned areas
renders/     outputs (== ComfyUI/output/mpillow-office/)
  moodboard/   one sheet per area + the two master sheets
  final/       one render per camera view, 16:9
               <view>        section 4      <view>_cn        section 5
               <view>_zoned  section 4 zoned <view>_cn_zoned section 5 zoned
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

- **Section 4** receives the tinted view and a colour legend appended to the
  prompt, so the edit model knows which zone is which. Output
  `renders/final/<view>_zoned`.
- **Section 5** does regional prompting. `ImageColorToMask` recovers one
  mask per area from the ID pass; each area prompt from section 1 is
  encoded on its own and confined to its mask with `ConditioningSetMask`;
  all sit on top of the whole-scene prompt (full-frame mask, strength 0.5)
  and are combined before the depth ControlNet. The sampler evaluates the
  model once per conditioning entry and blends by mask, so a view costs
  about seven times the plain section 5 sampling. Output
  `renders/final/<view>_cn_zoned`.

Only areas covering at least 1% of a camera's frame are wired into that
view. The InstantX Union has no segmentation mode (canny, soft edge, depth,
pose only), which is why the ID pass drives masks rather than the
ControlNet itself. Sections 1 to 3 are identical to the plain workflow, so
their results are shared through the ComfyUI cache.

## Why the 3D step is computed, not generated

Image-to-3D models (TRELLIS.2, Hunyuan3D, Tripo, Meshy, Rodin) rebuild a
single object from a photo. The official ComfyUI docs say TRELLIS.2 "targets
individual items, not scenes or architecture". None will turn a plan into a
room, and the ones installed here are paid cloud APIs.

So `tools/build_massing.py` builds the room from numbers: every dimension
from the brief, every position read off the page-4 plan. 165 parts. It is
authored with north up, exactly as drawn, then mirrored on export so the GLB
is right-handed for Y-up viewers.

## Pipeline

```
python tools/build_massing.py    # -> model/showroom_massing.glb (+ ComfyUI/input/3d/)
python tools/render_views.py     # -> ref-img/massing/massing_<view>[_depth].png
python tools/build_workflow.py   # -> workflows/showroom_moodboard_16x9.json (+ sidebar)
python tools/build_workflow.py --zoned   # -> workflows/showroom_zoned_16x9.json (+ sidebar)
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
