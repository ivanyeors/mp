"""
Generate the FAST zoned showroom workflow: the same concept and the same three
final renders as `build_workflow.py --zoned`, rebuilt on one small, few-step
model so the whole graph fits in 16 GB of VRAM.

    python tools/build_workflow_fast.py   # -> workflows/showroom_zoned_fast_16x9.json

What changed against showroom_zoned_16x9.json, and why it is faster:

  * ONE model for everything. The old graph swapped two 20B models
    (Qwen-Image-Edit-2509 for the moodboards, Qwen-Image for the renders),
    19 GB each at fp8, neither of which fits a 16 GB card, so every step
    streamed weights from RAM. Here Qwen-Image-2.1 (7B, generation AND
    editing in one model) with the Viggle turbo LoRA merged in, int8, 7.3 GB,
    stays resident from the first moodboard to the last refine.
  * 6 steps, no CFG (Viggle turbo v0.3 schedule, BasicGuider). The schedule's
    resolution shift is computed here, per latent size, into ManualSigmas
    nodes, so no custom node is needed.
  * The ControlNet is the Qwen-Image-2.1 Fun ControlNet Union, a model patch
    (Load Model Patch -> Apply Fun ControlNet) on the depth pass.
  * Moodboards: the mood and furniture contact sheets go straight in as
    reference images 1 and 2 of Text Encode Qwen Image 2.1; no edit subgraph.
  * Zone masks: one KJNodes Color To Mask per area (distance threshold)
    instead of 18 channel-arithmetic nodes per ID image.
  * ZONING switch: the six regional prompts cost one model pass each per
    step. Switch it off for a quick look with the whole-scene prompt alone
    (about 3-5x faster sampling); geometry still comes from the depth lock.
  * Qwen-Image-2.1 caches the text K/V once per sampling run (keyed by the
    conditioning), so each extra regional prompt is cheaper than it was.

Sections 1-4 and 5.12 / 5.13 (zone section by number, free camera from the
3D viewer, GLB Part Filter) are the same concept as the zoned workflow;
prompts, areas, colours and camera defaults are imported from
build_workflow.py so the two graphs never drift apart.

Licence: Qwen-Image-2.1 and the Viggle turbo are under the Qwen RESEARCH
LICENSE (non-commercial). Fine for evaluation; clear it before client use.
"""

import json
import math
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_workflow as B  # noqa: E402  (prompts, areas, zones, node helpers)

ROOT = B.ROOT
OUT = os.path.join(ROOT, "workflows", "showroom_zoned_fast_16x9.json")
SIDEBAR = B.SIDEBAR
REF_ABS, OUT_PREFIX = B.REF_ABS, B.OUT_PREFIX
node, inp, out, text, concat, save, image_batch = B.node, B.inp, B.out, B.text, B.concat, B.save, B.image_batch

W, H = B.W, B.H                                  # 1664 x 928, 16:9
VIEWS = ["iso_ne", "iso_nw", "iso_low", "iso_high"]
PANEL_W, PANEL_H = 1024, 576
SHEET_COLS = 2
SHEET_W, SHEET_H = PANEL_W * 2, PANEL_H * 2       # 2048 x 1152
DERIVE_COLS = 3
DERIVE_W, DERIVE_H = PANEL_W * 3, PANEL_H * 2     # 3072 x 1152
HIRES_W, HIRES_H = 2560, 1440                     # 5.10b; Qwen-Image-2.1 tops out near 4 MP
MUTED = B.MUTED

MODELS = {
    "unet": "Qwen-Image-2.1-viggle-turbo-v0.3-6step-int8_convrot.safetensors",
    "clip": "qwen3vl_8b_int8_convrot.safetensors",
    "vae": "qwen_image_2.1_vae_bf16.safetensors",
    "patch": "qwen_image_2.1_fun_controlnet_union_int8_convrot.safetensors",
}
# Viggle turbo v0.3: raw (unshifted) nodes. Full = 6 steps from pure noise.
# Refine = the two low-noise nodes only: starts at ~0.7 after the shift, i.e.
# keeps the composition and re-draws detail. Drop the 0.5 to sharpen only.
RAW_FULL = [1.0, 0.9375, 0.875, 0.75, 0.5, 0.25]
RAW_REFINE = [0.5, 0.25]
CN_STRENGTH = 0.85            # Fun ControlNet on the depth pass: 1.0 traces, 0.6 loose
MASK_THRESHOLD = 120          # Color To Mask: RGB distance; zone colours are >= 255 apart
ENC_RES = 1024                # Text Encode Qwen Image 2.1: pixel budget for reference images
SEEDS = {"mood": 20261004, "sheet": B.SHEET_SEED, "derive": B.DERIVE_SEED,
         "section": B.CN_SEED + B.SECTION_SEED_OFFSET, "free": B.CN_SEED + B.FREE_SEED_OFFSET}


def turbo_sigmas(raw, w, h):
    """The Viggle Turbo Sigmas node, evaluated at build time: diffusers'
    dynamic exponential shift, mu from the token count of a w x h latent."""
    tokens = (w // 16) * (h // 16)
    mu = 0.5 + (0.9 - 0.5) * (tokens - 256) / (8192 - 256)
    s = [math.exp(mu) / (math.exp(mu) + (1 / t - 1)) for t in raw] + [0.0]
    return ", ".join("%.6f" % x for x in s)


README = (
    "# Mpillow showroom -- FAST zoned workflow\n\n"
    "Same concept and the same three renders as `showroom_zoned_16x9`, on one\n"
    "7B model that stays in VRAM: **Qwen-Image-2.1 + Viggle turbo v0.3**\n"
    "(int8, 6 steps, no CFG). Moodboards, sheet, section and free camera all\n"
    "use the same loaders (top of section 5).\n\n"
    "1. `00-sheet_cn_zoned_fast` -- four isometrics in ONE picture (5.10)\n"
    "2. `01-section_cn_zoned_fast` -- the zone chosen by number (5.12)\n"
    "3. `02-free-camera_cn_zoned_fast` -- the camera you set in the viewer (5.13)\n\n"
    "Renders 2 and 3 derive from the sheet (5.14), exactly as before.\n\n"
    "**Speed knobs**\n"
    "- **ZONING** (top of section 5): `true` = six regional prompts confined\n"
    "  to their ID-pass zones (the concept, slower); `false` = whole-scene\n"
    "  prompt only (fast look-dev). The depth lock is on either way.\n"
    "- Mute section 1 once the moodboards are made; its outputs are cached.\n"
    "- 5.10b hi-res refine is muted; un-mute its Save node when you want it.\n\n"
    "**Do not** raise steps or add CFG: the turbo schedule is fixed (6 steps,\n"
    "BasicGuider). Change the seed for a new scheme.\n\n"
    "Licence: Qwen Research License (non-commercial) -- evaluation only until\n"
    "it is cleared. Built with `python tools/build_workflow_fast.py`."
)

MODEL_NOTE = (
    "## Models  (all in ComfyUI/models)\n\n"
    "| folder | file |\n|---|---|\n"
    "| diffusion_models | `%s` |\n| text_encoders | `%s` |\n| vae | `%s` |\n"
    "| model_patches | `%s` |\n\n"
    "The turbo is the Qwen-Image-2.1 base with the Viggle v0.3 LoRA merged\n"
    "in (Viggle/Qwen-Image-2.1-viggle-turbo). Its 6-step schedule needs a\n"
    "resolution-dependent shift; the ManualSigmas nodes here hold it\n"
    "pre-computed for each picture size (1664 x 928, the 2048 x 1152 sheet,\n"
    "the 3072 x 1152 derive sheet, the 2560 x 1440 hi-res). If you change a\n"
    "size, re-run `tools/build_workflow_fast.py` rather than editing them.\n\n"
    "Sampler: euler + BasicGuider (no CFG, no negative prompt) -- the turbo's\n"
    "rules. Refines use the last two nodes of the schedule (start ~0.7):\n"
    "composition kept, detail re-drawn." % (MODELS["unet"], MODELS["clip"], MODELS["vae"], MODELS["patch"])
)


def main():
    nodes, links, groups = [], [], []
    lid = [0]
    nid = [3000]

    def new(n=1):
        v = nid[0]
        nid[0] += n
        return v

    def add(n):
        nodes.append(n)
        return n["id"]

    def link(src, sslot, dst, dslot, typ):
        lid[0] += 1
        links.append([lid[0], src, sslot, dst, dslot, typ])

    def group(title, x, y, w, h, color, font=24):
        groups.append({"id": len(groups) + 1, "title": title, "bounding": [x, y, w, h],
                       "color": color, "font_size": font, "flags": {}})

    img_id = [20000]                       # path loaders: id and id+400 (its preview)

    def add_image(pos, rel, title, size):
        i = img_id[0]
        img_id[0] += 1
        ns, lk = B.load_image(i, pos, os.path.join(REF_ABS, *rel.split("/")), title, size)
        nodes.extend(ns)
        link(*lk)
        return i

    # ---------------- shared building blocks -------------------------------
    def encode(pos, title, prompt_src, images=(), size=(420, 160)):
        """Text Encode Qwen Image 2.1. images = reference image sources, in order."""
        ins = [inp("clip", "CLIP"), inp("vae", "VAE", optional=True), inp("prompt", "STRING", widget=True)]
        for k in range(len(images) + 1):          # autogrow: one spare slot
            d = inp("images.image_%d" % (k + 1), "IMAGE", optional=True)
            d["localized_name"] = "image_%d" % (k + 1)
            ins.append(d)
        e = add(node(new(), "TextEncodeQwenImage21", pos, size, ["", "", ENC_RES], inputs=ins,
                     outputs=[out("positive", "CONDITIONING"), out("negative", "CONDITIONING"),
                              out("latent", "LATENT")], title=title))
        link(CLIP, 0, e, 0, "CLIP")
        link(VAE, 0, e, 1, "VAE")
        link(prompt_src, 0, e, 2, "STRING")
        for k, src in enumerate(images):
            link(src, 0, e, 3 + k, "IMAGE")
        return e

    def sample(pos, model, cond, latent, sigmas, seed, title):
        """RandomNoise + BasicGuider + SamplerCustomAdvanced + VAE Decode.
        Returns the decode node."""
        x, y = pos
        nz = add(node(new(), "RandomNoise", (x, y), (320, 90), [seed, "fixed"],
                      outputs=[out("NOISE", "NOISE")], title="seed"))
        gd = add(node(new(), "BasicGuider", (x, y + 120), (320, 50), None,
                      inputs=[inp("model", "MODEL"), inp("conditioning", "CONDITIONING")],
                      outputs=[out("GUIDER", "GUIDER")], title="guider (no CFG)"))
        sm = add(node(new(), "SamplerCustomAdvanced", (x, y + 200), (320, 110), None,
                      inputs=[inp("noise", "NOISE"), inp("guider", "GUIDER"), inp("sampler", "SAMPLER"),
                              inp("sigmas", "SIGMAS"), inp("latent_image", "LATENT")],
                      outputs=[out("output", "LATENT"), out("denoised_output", "LATENT")], title=title))
        dc = add(node(new(), "VAEDecode", (x, y + 340), (320, 50), [],
                      inputs=[inp("samples", "LATENT"), inp("vae", "VAE")],
                      outputs=[out("IMAGE", "IMAGE")], title="VAE Decode"))
        link(model, 0, gd, 0, "MODEL")
        link(cond, 0, gd, 1, "CONDITIONING")
        link(nz, 0, sm, 0, "NOISE")
        link(gd, 0, sm, 1, "GUIDER")
        link(SAMPLER, 0, sm, 2, "SAMPLER")
        link(sigmas, 0, sm, 3, "SIGMAS")
        link(latent, 0, sm, 4, "LATENT")
        link(sm, 0, dc, 0, "LATENT")
        link(VAE, 0, dc, 1, "VAE")
        return dc

    def empty_latent(pos, w, h, title):
        return add(node(new(), "EmptyLatentImage", pos, (320, 110), [w, h, 1],
                        outputs=[out("LATENT", "LATENT")], title=title))

    def sigmas_node(pos, raw, w, h, title):
        return add(node(new(), "ManualSigmas", pos, (420, 80), [turbo_sigmas(raw, w, h)],
                        outputs=[out("SIGMAS", "SIGMAS")], title=title))

    def depth_lock(pos, depth_src, title):
        """Apply Fun ControlNet (depth) as a model patch. Returns the patched model."""
        c = add(node(new(), "ZImageFunControlnet", pos, (340, 190), [CN_STRENGTH, 0.0, 1.0],
                     inputs=[inp("model", "MODEL"), inp("model_patch", "MODEL_PATCH"), inp("vae", "VAE"),
                             inp("image", "IMAGE", optional=True), inp("inpaint_image", "IMAGE", optional=True),
                             inp("mask", "MASK", optional=True)],
                     outputs=[out("MODEL", "MODEL")], title=title))
        link(UNET, 0, c, 0, "MODEL")
        link(PATCH, 0, c, 1, "MODEL_PATCH")
        link(VAE, 0, c, 2, "VAE")
        link(depth_src, 0, c, 3, "IMAGE")
        return c

    def vae_encode(pos, src, title="-> latent"):
        e = add(node(new(), "VAEEncode", pos, (320, 50), [],
                     inputs=[inp("pixels", "IMAGE"), inp("vae", "VAE")],
                     outputs=[out("LATENT", "LATENT")], title=title))
        link(src, 0, e, 0, "IMAGE")
        link(VAE, 0, e, 1, "VAE")
        return e

    def scale(pos, src, w, h, method, title, crop="disabled"):
        s = add(node(new(), "ImageScale", pos, (320, 110), [method, w, h, crop],
                     inputs=[inp("image", "IMAGE")], outputs=[out("IMAGE", "IMAGE")], title=title))
        link(src, 0, s, 0, "IMAGE")
        return s

    def crop(pos, src, w, h, x, y, title):
        c = add(node(new(), "ImageCrop", pos, (320, 130), [w, h, x, y],
                     inputs=[inp("image", "IMAGE")], outputs=[out("IMAGE", "IMAGE")], title=title))
        link(src, 0, c, 0, "IMAGE")
        return c

    def tile(pos, srcs, cols, title):
        """Batch srcs in order and tile them `cols` wide."""
        x, y = pos
        prev = None
        for k in range(len(srcs) - 1):
            b = add(image_batch(new(), (x, y + k * 70)))
            link(srcs[0] if k == 0 else prev, 0, b, 0, "IMAGE")
            link(srcs[k + 1], 0, b, 1, "IMAGE")
            prev = b
        g = add(node(new(), "ImageConcatFromBatch", (x, y + 70 * (len(srcs) - 1) + 10), (320, 110),
                     [cols, False, 4096], inputs=[inp("images", "IMAGE")],
                     outputs=[out("IMAGE", "IMAGE")], title=title))
        link(prev, 0, g, 0, "IMAGE")
        return g

    def zoned(pos, base_cond, id_src, title):
        """Six area prompts, each confined to its colour in the ID image, on top
        of `base_cond` masked to the whole frame; then the ZONING switch picks
        this or the plain whole-scene prompt. Returns the switch node."""
        x, y = pos
        full = add(node(new(), "ConditioningSetMask", (x, y), (300, 110), [B.GLOBAL_STRENGTH, "default"],
                        inputs=[inp("conditioning", "CONDITIONING"), inp("mask", "MASK")],
                        outputs=[out("CONDITIONING", "CONDITIONING")], title="whole scene underneath (strength)"))
        link(base_cond, 0, full, 0, "CONDITIONING")
        link(FULL_MASK, 0, full, 1, "MASK")
        prev = full
        for k, (cname, rgb) in enumerate(B.ZONES):
            ry = y + 140 + k * 150
            m = add(node(new(), "ColorToMask", (x, ry), (300, 130),
                         [False, (rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, MASK_THRESHOLD, 16],
                         inputs=[inp("images", "IMAGE")], outputs=[out("MASK", "MASK")],
                         title="%s = area %d" % (cname, k + 1)))
            sm = add(node(new(), "ConditioningSetMask", (x + 330, ry), (300, 110), [B.ZONE_STRENGTH, "default"],
                          inputs=[inp("conditioning", "CONDITIONING"), inp("mask", "MASK")],
                          outputs=[out("CONDITIONING", "CONDITIONING")],
                          title="area %d prompt, only in its zone" % (k + 1)))
            cb = add(node(new(), "ConditioningCombine", (x + 660, ry), (220, 60), [],
                          inputs=[inp("conditioning_1", "CONDITIONING"), inp("conditioning_2", "CONDITIONING")],
                          outputs=[out("CONDITIONING", "CONDITIONING")], title="+"))
            link(id_src, 0, m, 0, "IMAGE")
            link(AREA_COND[k], 0, sm, 0, "CONDITIONING")
            link(m, 0, sm, 1, "MASK")
            link(prev, 0, cb, 0, "CONDITIONING")
            link(sm, 0, cb, 1, "CONDITIONING")
            prev = cb
        sw = add(node(new(), "ComfySwitchNode", (x + 660, y), (220, 100), [True],
                      inputs=[inp("on_false", "CONDITIONING", optional=True),
                              inp("on_true", "CONDITIONING", optional=True),
                              inp("switch", "BOOLEAN", widget=True)],
                      outputs=[out("output", "CONDITIONING")], title=title))
        link(base_cond, 0, sw, 0, "CONDITIONING")
        link(prev, 0, sw, 1, "CONDITIONING")
        link(ZONING, 0, sw, 2, "BOOLEAN")
        return sw

    # ======================= SHARED LOADERS (section 5.1) ===================
    # Created first so every section can wire to them; drawn at the top of 5.
    S5X, S5Y = 2320, -1080
    LX = S5X + 20
    UNET = add(node(new(), "UNETLoader", (LX, S5Y + 60), (460, 90), [MODELS["unet"], "default"],
                    outputs=[out("MODEL", "MODEL")], title="5.1  Qwen-Image-2.1 Viggle turbo v0.3 (int8, 6 steps)"))
    CLIP = add(node(new(), "CLIPLoader", (LX, S5Y + 180), (460, 110), [MODELS["clip"], "qwen_image", "default"],
                    outputs=[out("CLIP", "CLIP")], title="5.1  Text encoder (Qwen3-VL 8B, int8)"))
    VAE = add(node(new(), "VAELoader", (LX, S5Y + 320), (460, 60), [MODELS["vae"]],
                   outputs=[out("VAE", "VAE")], title="5.1  VAE (Qwen-Image-2.1)"))
    PATCH = add(node(new(), "ModelPatchLoader", (LX, S5Y + 410), (460, 60), [MODELS["patch"]],
                     outputs=[out("MODEL_PATCH", "MODEL_PATCH")], title="5.2  Fun ControlNet Union (depth)"))
    SAMPLER = add(node(new(), "KSamplerSelect", (LX, S5Y + 500), (460, 60), ["euler"],
                       outputs=[out("SAMPLER", "SAMPLER")], title="5.1  sampler: euler (turbo rule)"))
    ZONING = add(node(new(), "PrimitiveBoolean", (LX, S5Y + 590), (460, 60), [True],
                      outputs=[out("BOOLEAN", "BOOLEAN")],
                      title="ZONING  --  true: regional prompts (concept)  |  false: whole-scene only (fast)"))
    SIG_W = sigmas_node((LX, S5Y + 680), RAW_FULL, W, H, "sigmas 6 steps @ %d x %d" % (W, H))
    SIG_SHEET = sigmas_node((LX, S5Y + 790), RAW_FULL, SHEET_W, SHEET_H, "sigmas 6 steps @ %d x %d" % (SHEET_W, SHEET_H))
    SIG_DERIVE = sigmas_node((LX, S5Y + 900), RAW_FULL, DERIVE_W, DERIVE_H,
                             "sigmas 6 steps @ %d x %d" % (DERIVE_W, DERIVE_H))
    SIG_REFINE = sigmas_node((LX, S5Y + 1010), RAW_REFINE, W, H, "sigmas refine (2 steps) @ %d x %d" % (W, H))
    SIG_HIRES = sigmas_node((LX, S5Y + 1120), RAW_REFINE, HIRES_W, HIRES_H,
                            "sigmas refine (2 steps) @ %d x %d" % (HIRES_W, HIRES_H))
    LAT_W = empty_latent((LX, S5Y + 1230), W, H, "empty latent %d x %d" % (W, H))
    FULL_MASK = add(node(new(), "SolidMask", (LX, S5Y + 1370), (460, 110), [1.0, W, H],
                         outputs=[out("MASK", "MASK")], title="whole frame (any size: masks scale to the latent)"))
    add(node(new(), "MarkdownNote", (LX, S5Y + 1510), (460, 620), [MODEL_NOTE], title="5.1  Models and schedule"))

    add(node(1, "MarkdownNote", (-3040, -1700), (2100, 520), [README], title="READ ME  --  FAST ZONED VARIANT"))

    # ======================= SECTION 1: MOODBOARDS ==========================
    S1X, S1Y, AREA_H = -3040, -1080, 800
    AREA_TEXT, MOODS, FURNS = [], [], []
    for i, (slug, label, prompt) in enumerate(B.AREAS):
        b = new(10)
        y = S1Y + 60 + i * AREA_H
        add(B.folder_loader(b, (S1X + 20, y), os.path.join(REF_ABS, "moodboard", slug),
                            "1.%d.a  ref-img/moodboard/%s" % (i + 1, slug)))
        add(B.grid(b + 1, (S1X + 400, y)))
        add(B.pad(b + 2, (S1X + 400, y + 150)))
        add(B.folder_loader(b + 3, (S1X + 20, y + 330), os.path.join(REF_ABS, "furniture", slug),
                            "1.%d.b  ref-img/furniture/%s" % (i + 1, slug)))
        add(B.grid(b + 4, (S1X + 400, y + 330)))
        add(B.pad(b + 5, (S1X + 400, y + 480)))
        add(text(b + 6, (S1X + 740, y), (440, 280), prompt, "1.%d.c  AREA PROMPT -- %s" % (i + 1, label)))
        add(concat(b + 7, (S1X + 740, y + 320), B.MOOD_PREFIX % label, " ", "moodboard instruction + area prompt"))
        link(b, 0, b + 1, 0, "IMAGE")
        link(b + 1, 0, b + 2, 0, "IMAGE")
        link(b + 3, 0, b + 4, 0, "IMAGE")
        link(b + 4, 0, b + 5, 0, "IMAGE")
        link(b + 6, 0, b + 7, 1, "STRING")
        e = encode((S1X + 1220, y), "1.%d.d  edit: image 1 = moodboard, image 2 = furniture" % (i + 1),
                   b + 7, images=(b + 2, b + 5))
        dc = sample((S1X + 1220, y + 190), UNET, e, LAT_W, SIG_W, SEEDS["mood"] + i,
                    "1.%d.d  sample (6 steps)" % (i + 1))
        sv = add(save(new(), (S1X + 1260 + 320, y + 190), "%s/moodboard/%s_fast" % (OUT_PREFIX, slug),
                      "1.%d.e  renders/moodboard/%s_fast" % (i + 1, slug), (300, 300)))
        link(dc, 0, sv, 0, "IMAGE")
        AREA_TEXT.append(b + 6)
        MOODS.append(dc)
        FURNS.append(b + 5)
        group("1.%d  %s" % (i + 1, label.upper()), S1X, y - 60, 1940, AREA_H - 40, B.AREA_COLOR, 20)
    group("SECTION 1  --  MOODBOARDS  (folder-driven, one per area; mute once made)",
          S1X - 20, S1Y - 20, 1980, 60 + len(B.AREAS) * AREA_H, B.SECTION_COLORS["s1"])

    # ======================= SECTION 2: PLAN -> 3D ==========================
    S2X, S2Y = -1000, -1080
    add_image((S2X + 20, S2Y + 60), "floorplan/plan-p4-300dpi.png", "2.1  Floor plan (brief p.4, 300 dpi)", (520, 420))
    add(node(new(), "MarkdownNote", (S2X + 580, S2Y + 60), (480, 420), [B.PLAN_NOTE],
             title="2.2  build_massing.py  (dimensions -> GLB)"))
    SEC_VIEWS = []
    for k, (slug, _, _) in enumerate(B.AREAS):
        SEC_VIEWS.append(add_image((S2X + 20 + (k % 3) * 360, S2Y + 540 + (k // 3) * 320),
                                   "massing/massing_sec_%s.png" % slug,
                                   "2.3  Zone section %d -- %s" % (k, slug), (340, 300)))
    group("SECTION 2  --  FLOOR PLAN  ->  3D MASSING", S2X - 20, S2Y - 20, 1120, 1240, B.SECTION_COLORS["s2"])

    # ======================= SECTION 3: PROMPTS =============================
    S3X, S3Y = 160, -1080
    t_base = add(text(new(), (S3X + 20, S3Y + 60), (480, 300), B.BASE_PROMPT, "3.1  RENDER BASE"))
    t_mat = add(text(new(), (S3X + 20, S3Y + 400), (480, 240), B.MATERIALS, "3.2  MATERIALS PALETTE"))
    t_light = add(text(new(), (S3X + 20, S3Y + 680), (480, 240), B.LIGHTING, "3.3  LIGHTING + TIME OF DAY"))
    CX = S3X + 540
    c1 = add(concat(new(), (CX, S3Y + 60), "", " Materials: ", "base + materials"))
    c2 = add(concat(new(), (CX, S3Y + 210), "", " Lighting: ", "+ lighting"))
    link(t_base, 0, c1, 0, "STRING")
    link(t_mat, 0, c1, 1, "STRING")
    link(c1, 0, c2, 0, "STRING")
    link(t_light, 0, c2, 1, "STRING")
    prev = c2
    for i, (slug, _, _) in enumerate(B.AREAS):
        c = add(concat(new(), (CX, S3Y + 360 + i * 150), "", " The areas, west to east: " if i == 0 else " ",
                       "+ area %d  (%s)" % (i + 1, slug)))
        link(prev, 0, c, 0, "STRING")
        link(AREA_TEXT[i], 0, c, 1, "STRING")
        prev = c
    FINAL = prev
    pv = add(node(new(), "PreviewAny", (CX, S3Y + 1280), (420, 420), [], inputs=[inp("source", "*")],
                  title="3.4  FINAL PROMPT  (what the renders receive)"))
    link(FINAL, 0, pv, 0, "*")
    t_sheet = add(text(new(), (S3X + 20, S3Y + 1280), (480, 300), B.SHEET_PROMPT, "3.5  SHEET PROMPT  (-> 5.10)"))
    SHEET_TEXT = add(concat(new(), (CX, S3Y + 1740), "", " ", "sheet + final prompt  ->  5.10"))
    link(t_sheet, 0, SHEET_TEXT, 0, "STRING")
    link(FINAL, 0, SHEET_TEXT, 1, "STRING")
    t_der = add(text(new(), (S3X + 20, S3Y + 1620), (480, 300), B.DERIVE_PROMPT, "3.6  DERIVE PROMPT  (-> 5.14)"))
    DERIVE_TEXT = add(concat(new(), (CX, S3Y + 1900), "", " ", "derive + final prompt  ->  5.14"))
    link(t_der, 0, DERIVE_TEXT, 0, "STRING")
    link(FINAL, 0, DERIVE_TEXT, 1, "STRING")
    group("SECTION 3  --  PROMPTS  ->  ONE FINAL RENDER PROMPT", S3X - 20, S3Y - 20, 1060, 2080,
          B.SECTION_COLORS["s3"])

    # ======================= SECTION 4: MASTER SHEETS =======================
    S4X, S4Y = 1280, -1080
    mm = tile((S4X + 20, S4Y + 60), MOODS, 3, "4.1  MASTER MOODBOARD  (6 areas)")
    mf = tile((S4X + 360, S4Y + 60), FURNS, 3, "4.2  MASTER FURNITURE  (6 areas)")
    for src, x, name in ((mm, S4X + 20, "00-master-moodboard_fast"), (mf, S4X + 360, "00-master-furniture_fast")):
        s = add(save(new(), (x, S4Y + 600), "%s/moodboard/%s" % (OUT_PREFIX, name), "renders/moodboard/" + name,
                     (320, 300)))
        link(src, 0, s, 0, "IMAGE")
    group("SECTION 4  --  MASTER SHEETS", S4X - 20, S4Y - 20, 740, 960, B.SECTION_COLORS["s4"])

    # ======================= SECTION 5 ======================================
    # 5.9 shared prompt encodes: one per area (<- section 1) + sheet + derive
    EX = S5X + 520
    AREA_COND = []
    for k, (slug, _, _) in enumerate(B.AREAS):
        AREA_COND.append(encode((EX, S5Y + 60 + k * 190), "5.9  AREA %d (%s)  <- section 1 prompt" % (k + 1, B.ZONES[k][0]),
                                AREA_TEXT[k]))
    SHEET_COND = encode((EX, S5Y + 60 + 6 * 190), "5.9  SHEET PROMPT  <- section 3", SHEET_TEXT)
    DERIVE_COND = encode((EX, S5Y + 60 + 7 * 190), "5.9  DERIVE PROMPT  <- section 3", DERIVE_TEXT)
    WHOLE_COND = encode((EX, S5Y + 60 + 8 * 190), "5.9  FINAL PROMPT  (section + free camera refines)", FINAL)
    add(node(new(), "MarkdownNote", (EX, S5Y + 60 + 9 * 190), (420, 440), [B.ZONE_NOTE.replace(
        "R, G and B thresholded at 0.5\nand combined with mask arithmetic (red = R - G - B, yellow = R x G - B,\n...)",
        "one KJNodes Color To Mask per\ncolour with a distance threshold")], title="5.9  Zoning  (how and why)"))
    group("5.1 - 5.9  SHARED: models, schedules, ZONING switch, prompt encodes",
          S5X, S5Y + 10, 980, 2200, "#6a3f4a", 20)

    # 5.5 baked passes of the four isometrics
    BX = S5X + 1020
    DEPTH, IDS = [], []
    for j, cam in enumerate(VIEWS):
        y = S5Y + 60 + j * 360
        DEPTH.append(add_image((BX, y), "massing/massing_%s_depth.png" % cam, "5.5  depth -- %s" % cam, (360, 320)))
        IDS.append(add_image((BX + 380, y), "massing/massing_%s_ids.png" % cam, "5.5  ID pass -- %s" % cam, (360, 320)))
    group("5.5  BAKED PASSES  (four isometrics -> the sheet)", BX - 20, S5Y + 10, 780, 1470, "#6a3f4a", 20)

    # ---- 5.10 THE SHEET ----------------------------------------------------
    SX, y0 = S5X + 1840, S5Y + 60
    dts = [scale((SX, y0 + j * 130), DEPTH[j], PANEL_W, PANEL_H, "lanczos", "depth tile -- %s" % VIEWS[j])
           for j in range(4)]
    its = [scale((SX + 340, y0 + j * 130), IDS[j], PANEL_W, PANEL_H, "nearest-exact", "ID tile -- %s" % VIEWS[j])
           for j in range(4)]
    DEPTH_SHEET = tile((SX, y0 + 540), dts, SHEET_COLS, "5.10  depth SHEET %d x %d" % (SHEET_W, SHEET_H))
    ID_SHEET = tile((SX + 340, y0 + 540), its, SHEET_COLS, "5.10  ID SHEET %d x %d" % (SHEET_W, SHEET_H))
    sheet_cond = zoned((SX + 700, y0), SHEET_COND, ID_SHEET, "5.10  conditioning  (ZONING switch)")
    m_sheet = depth_lock((SX + 1620, y0), DEPTH_SHEET, "5.10  depth lock (Fun ControlNet, strength)")
    lat_sheet = empty_latent((SX + 1620, y0 + 220), SHEET_W, SHEET_H, "empty latent %d x %d" % (SHEET_W, SHEET_H))
    SHEET_IMG = sample((SX + 1620, y0 + 370), m_sheet, sheet_cond, lat_sheet, SIG_SHEET, SEEDS["sheet"],
                       "5.10  one pass, four cameras")
    s = add(save(new(), (SX + 2000, y0), "%s/final/00-sheet_cn_zoned_fast" % OUT_PREFIX,
                 "5.10  renders/final/00-sheet_cn_zoned_fast", (640, 420)))
    link(SHEET_IMG, 0, s, 0, "IMAGE")
    # 5.10b hi-res refine (muted)
    hx = SX + 2680
    hs = scale((hx, y0), SHEET_IMG, HIRES_W, HIRES_H, "lanczos", "5.10b  sheet -> %d x %d" % (HIRES_W, HIRES_H))
    hd = scale((hx, y0 + 140), DEPTH_SHEET, HIRES_W, HIRES_H, "lanczos", "depth sheet -> hi-res")
    m_hi = depth_lock((hx, y0 + 280), hd, "5.10b  depth lock")
    he = vae_encode((hx, y0 + 500), hs)
    HI_IMG = sample((hx, y0 + 580), m_hi, sheet_cond, he, SIG_HIRES, SEEDS["sheet"], "5.10b  refine (2 steps)")
    s = add(save(new(), (hx, y0 + 1000), "%s/final/00-sheet-hires_cn_zoned_fast" % OUT_PREFIX,
                 "5.10b  renders/final/00-sheet-hires_cn_zoned_fast  (OPTIONAL: un-mute)", (340, 300), mode=MUTED))
    link(HI_IMG, 0, s, 0, "IMAGE")
    group("5.10  THE SHEET  --  four isometric cameras in ONE pass  (final render 1 of 3)",
          SX - 20, y0 - 50, 3060, 1420, "#6a4a3a", 20)

    # ---- 5.12 ZONE SECTION -------------------------------------------------
    y1 = y0 + 1420
    sd, si = [], []
    for k, (slug, _, _) in enumerate(B.AREAS):
        cy = y1 + (k // 2) * 280
        sd.append(add_image((SX + (k % 2) * 380, cy), "massing/massing_sec_%s_depth.png" % slug,
                            "5.12  depth %d -- %s" % (k, slug), (360, 250)))
        si.append(add_image((SX + 780 + (k % 2) * 380, cy), "massing/massing_sec_%s_ids.png" % slug,
                            "5.12  ID %d -- %s" % (k, slug), (360, 250)))
    PX = SX + 1560
    zone = add(node(new(), "PrimitiveInt", (PX, y1), (840, 90), [0, "fixed"], outputs=[out("INT", "INT")],
                    title="5.12  ZONE  --  0 entry | 1 fitting | 2 inventory | 3 workshop | 4 service | 5 patio"))

    def pick_from(pos, srcs, title):
        x, y = pos
        prev = None
        for k in range(len(srcs) - 1):
            b = add(image_batch(new(), (x, y + k * 70)))
            link(srcs[0] if k == 0 else prev, 0, b, 0, "IMAGE")
            link(srcs[k + 1], 0, b, 1, "IMAGE")
            prev = b
        p = add(node(new(), "ImageFromBatch", (x, y + 370), (400, 100), [0, 1],
                     inputs=[inp("image", "IMAGE"), inp("batch_index", "INT", widget=True),
                             inp("length", "INT", widget=True)],
                     outputs=[out("IMAGE", "IMAGE")], title=title))
        link(prev, 0, p, 0, "IMAGE")
        link(zone, 0, p, 1, "INT")
        return p

    SEC_DEPTH = pick_from((PX, y1 + 130), sd, "depth of the chosen zone")
    SEC_ID = pick_from((PX + 440, y1 + 130), si, "ID pass of the chosen zone")
    sec_mass = pick_from((PX, y1 + 630), SEC_VIEWS, "massing of the chosen zone")
    pv = add(node(new(), "PreviewImage", (PX + 440, y1 + 630), (400, 300), [], inputs=[inp("images", "IMAGE")],
                  title="5.12  the chosen zone  (massing)"))
    link(sec_mass, 0, pv, 0, "IMAGE")
    sec_cond = zoned((PX + 900, y1), WHOLE_COND, SEC_ID, "5.12  conditioning  (ZONING switch)")
    add(node(new(), "MarkdownNote", (PX + 1820, y1), (400, 700), [B.SECTION_NOTE], title="5.12  Zone section"))
    group("5.12  ZONE SECTION  --  one area by number: passes + zone masks  (rendered in 5.14)",
          SX - 20, y1 - 50, PX + 2240 - SX, 1200, "#3a5a6a", 20)

    # ---- 5.13 FREE CAMERA --------------------------------------------------
    y2 = y1 + 1200
    FX = SX
    l3d_out = [out("model_3d", "FILE_3D"), out("model_3d_info", "LOAD3D_MODEL_INFO"),
               out("camera_info", "LOAD3D_CAMERA"), out("width", "INT"), out("height", "INT")]
    filt_out = lambda: [out("model_3d", "FILE_3D"), out("all_parts", "STRING"),
                        out("affected", "STRING"), out("visible_count", "INT")]
    filt_in = lambda: [inp("parts", "STRING", widget=True), inp("model_3d", "FILE_3D", optional=True)]
    hide = add(text(new(), (FX, y2), (620, 170), B.FREE_HIDE,
                    "5.13  HIDE PARTS  --  one part name per line, * ? wildcards, # comment  (both models)"))
    f_full = add(node(new(), "MPGLBPartFilter", (FX, y2 + 200), (620, 150), [B.FREE_MODEL, B.FREE_HIDE, "hide"],
                      inputs=filt_in(), outputs=filt_out(), title="5.13  model, parts hidden"))
    viewer = add(node(new(), "Preview3DAdvanced", (FX, y2 + 380), (620, 540), [{}, W, H],
                      inputs=[inp("model_3d", "FILE_3D"), inp("model_3d_info", "LOAD3D_MODEL_INFO", optional=True),
                              inp("camera_info", "LOAD3D_CAMERA", optional=True)],
                      outputs=list(l3d_out), title="5.13  FREE CAMERA  --  orbit / pan / zoom here, then Run"))
    f_ids = add(node(new(), "MPGLBPartFilter", (FX, y2 + 950), (620, 150), [B.FREE_ID_MODEL, B.FREE_HIDE, "hide"],
                     inputs=filt_in(), outputs=filt_out(), title="5.13  ID model, same parts hidden"))
    g1 = add(node(new(), "Get3DComponents", (FX + 660, y2), (300, 60), [], inputs=[inp("model_3d", "FILE_3D")],
                  outputs=[out("mesh", "MESH")]))
    g2 = add(node(new(), "Get3DComponents", (FX + 660, y2 + 600), (300, 60), [], inputs=[inp("model_3d", "FILE_3D")],
                  outputs=[out("mesh", "MESH")]))
    rm_in = lambda: [inp("mesh", "MESH"), inp("model_3d_info", "LOAD3D_MODEL_INFO", optional=True),
                     inp("camera_info", "LOAD3D_CAMERA", optional=True)]
    FREE_DEPTH = add(node(new(), "RenderMesh", (FX + 660, y2 + 100), (300, 200), ["depth", W, H, "#000000"],
                          inputs=rm_in(), outputs=[out("image", "IMAGE"), out("mask", "MASK")],
                          title="depth pass  (live, this camera)"))
    FREE_ID = add(node(new(), "RenderMesh", (FX + 660, y2 + 700), (300, 200), ["vertex colors", W, H, "#000000"],
                       inputs=rm_in(), outputs=[out("image", "IMAGE"), out("mask", "MASK")],
                       title="ID pass  (live, this camera)"))
    p1 = add(node(new(), "PreviewImage", (FX + 1000, y2), (400, 330), [], inputs=[inp("images", "IMAGE")],
                  title="5.13  depth  --  what the ControlNet gets"))
    p2 = add(node(new(), "PreviewImage", (FX + 1000, y2 + 600), (400, 330), [], inputs=[inp("images", "IMAGE")],
                  title="5.13  ID pass  --  the zone masks"))
    p3 = add(node(new(), "PreviewAny", (FX + 1000, y2 + 350), (400, 230), [], inputs=[inp("source", "*")],
                  title="5.13  part names in the model"))
    p4 = add(node(new(), "PreviewAny", (FX + 660, y2 + 920), (300, 180), [], inputs=[inp("source", "*")],
                  title="hidden now"))
    add(node(new(), "CreateCameraInfo", (FX + 660, y2 + 340), (300, 240),
             ["orbit", 135.0, 30.0, 24.0, B.TARGET[0], B.TARGET[1], B.TARGET[2], 0.0, 35.0, 1.0, "perspective"],
             outputs=[out("camera_info", "LOAD3D_CAMERA")],
             title="camera by numbers  (alternative: link to both camera_info)"))
    link(hide, 0, f_full, 0, "STRING")
    link(hide, 0, f_ids, 0, "STRING")
    link(f_full, 0, viewer, 0, "FILE_3D")
    link(viewer, 0, g1, 0, "FILE_3D")
    link(g1, 0, FREE_DEPTH, 0, "MESH")
    link(viewer, 1, FREE_DEPTH, 1, "LOAD3D_MODEL_INFO")
    link(viewer, 2, FREE_DEPTH, 2, "LOAD3D_CAMERA")
    link(f_ids, 0, g2, 0, "FILE_3D")
    link(g2, 0, FREE_ID, 0, "MESH")
    link(viewer, 1, FREE_ID, 1, "LOAD3D_MODEL_INFO")
    link(viewer, 2, FREE_ID, 2, "LOAD3D_CAMERA")
    link(FREE_DEPTH, 0, p1, 0, "IMAGE")
    link(FREE_ID, 0, p2, 0, "IMAGE")
    link(f_full, 1, p3, 0, "STRING")
    link(f_full, 2, p4, 0, "STRING")
    MX = FX + 1440
    free_cond = zoned((MX, y2), WHOLE_COND, FREE_ID, "5.13  conditioning  (ZONING switch)")
    add(node(new(), "MarkdownNote", (MX + 920, y2), (400, 700), [B.FREECAM_NOTE], title="5.13  Free camera"))
    group("5.13  FREE CAMERA  --  hide parts, set any angle: depth + zone passes baked live  (rendered in 5.14)",
          SX - 20, y2 - 50, MX + 1340 - SX, 1200, "#5a5a2f", 20)

    # ---- 5.14 DERIVE -------------------------------------------------------
    y3 = y2 + 1200
    DX = SX
    panels = [crop((DX, y3 + j * 150), SHEET_IMG, PANEL_W, PANEL_H, (j % 2) * PANEL_W, (j // 2) * PANEL_H,
                   "finished panel -- %s" % VIEWS[j]) for j in range(4)]
    sec_dt = scale((DX, y3 + 620), SEC_DEPTH, PANEL_W, PANEL_H, "lanczos", "section depth tile")
    free_dt = scale((DX, y3 + 750), FREE_DEPTH, PANEL_W, PANEL_H, "lanczos", "free camera depth tile")
    sec_it = scale((DX, y3 + 880), SEC_ID, PANEL_W, PANEL_H, "nearest-exact", "section ID tile")
    free_it = scale((DX, y3 + 1010), FREE_ID, PANEL_W, PANEL_H, "nearest-exact", "free camera ID tile")
    base = tile((DX + 360, y3), panels + [sec_dt, free_dt], DERIVE_COLS,
                "5.14  BASE  %d x %d  (4 finished + 2 placeholders)" % (DERIVE_W, DERIVE_H))
    d_sheet = tile((DX + 720, y3), dts + [sec_dt, free_dt], DERIVE_COLS, "5.14  depth SHEET")
    i_sheet = tile((DX + 1080, y3), its + [sec_it, free_it], DERIVE_COLS, "5.14  ID SHEET")
    be = vae_encode((DX + 360, y3 + 500), base)
    keep = add(node(new(), "SolidMask", (DX + 360, y3 + 580), (320, 110), [0.0, DERIVE_W, DERIVE_H],
                    outputs=[out("MASK", "MASK")], title="keep: the four finished panels (0)"))
    renoise = add(node(new(), "SolidMask", (DX + 360, y3 + 720), (320, 110), [1.0, PANEL_W * 2, PANEL_H],
                       outputs=[out("MASK", "MASK")], title="re-noise: the two new panels (1)"))
    nm = add(node(new(), "MaskComposite", (DX + 360, y3 + 860), (320, 130), [PANEL_W, PANEL_H, "add"],
                  inputs=[inp("destination", "MASK"), inp("source", "MASK")], outputs=[out("MASK", "MASK")],
                  title="noise mask  (new panels only)"))
    ln = add(node(new(), "SetLatentNoiseMask", (DX + 360, y3 + 1020), (320, 50), [],
                  inputs=[inp("samples", "LATENT"), inp("mask", "MASK")], outputs=[out("LATENT", "LATENT")],
                  title="latent: finished panels frozen"))
    link(keep, 0, nm, 0, "MASK")
    link(renoise, 0, nm, 1, "MASK")
    link(be, 0, ln, 0, "LATENT")
    link(nm, 0, ln, 1, "MASK")
    der_cond = zoned((DX + 1440, y3), DERIVE_COND, i_sheet, "5.14  conditioning  (ZONING switch)")
    KX = DX + 2360
    m_der = depth_lock((KX, y3), d_sheet, "5.14  depth lock (derive sheet)")
    DER_IMG = sample((KX, y3 + 220), m_der, der_cond, ln, SIG_DERIVE, SEEDS["derive"],
                     "5.14  only the two new panels are drawn")
    pv = add(node(new(), "PreviewImage", (KX + 360, y3), (640, 400), [], inputs=[inp("images", "IMAGE")],
                  title="5.14  the derived sheet"))
    link(DER_IMG, 0, pv, 0, "IMAGE")
    add(node(new(), "MarkdownNote", (KX + 360, y3 + 430), (640, 600), [B.DERIVE_NOTE.replace(
        "`denoise` 0.5", "the last two turbo steps").replace(
        "- `denoise` on a refine KSampler: 0.3 sharpen only, 0.6 re-imagine.",
        "- refine strength: the `sigmas refine` node in 5.1 (drop its first value to sharpen only).")],
        title="5.14  Deriving from the sheet"))
    RX = KX + 1040
    for k, (name, cond, depth_src, seed, prefix) in enumerate((
            ("section", sec_cond, SEC_DEPTH, SEEDS["section"], "01-section_cn_zoned_fast"),
            ("free camera", free_cond, FREE_DEPTH, SEEDS["free"], "02-free-camera_cn_zoned_fast"))):
        dy = k * 640
        slot = len(VIEWS) + k
        c = crop((RX, y3 + dy), DER_IMG, PANEL_W, PANEL_H, (slot % DERIVE_COLS) * PANEL_W,
                 (slot // DERIVE_COLS) * PANEL_H, "5.14  %s panel" % name)
        up = scale((RX, y3 + dy + 150), c, W, H, "lanczos", "upscale to %d x %d" % (W, H), crop="center")
        en = vae_encode((RX, y3 + dy + 280), up)
        mdl = depth_lock((RX + 340, y3 + dy), depth_src, "depth lock -- %s" % name)
        img = sample((RX + 340, y3 + dy + 210), mdl, cond, en, SIG_REFINE, seed, "refine %s (2 steps)" % name)
        sv = add(save(new(), (RX + 700, y3 + dy), "%s/final/%s" % (OUT_PREFIX, prefix),
                      "5.14  FINAL %s  ->  renders/final/%s" % (name.upper(), prefix), (520, 360)))
        link(img, 0, sv, 0, "IMAGE")
    group("5.14  DERIVE  --  section + free camera beside the finished isometrics, then refined  (final renders 2 and 3)",
          SX - 20, y3 - 50, RX + 1260 - SX, 1300, "#2f5a4a", 20)

    group("SECTION 5  --  RENDERS  (Qwen-Image-2.1 turbo + Fun ControlNet depth + zones:  SHEET, ZONE SECTION, FREE CAMERA)",
          S5X - 20, S5Y - 20, RX + 1300 - S5X, y3 + 1300 - S5Y, B.SECTION_COLORS["s5"])

    # ---------------- resolve links onto slots ------------------------------
    by_id = {}
    for n in nodes:
        if n["id"] in by_id:
            raise SystemExit("duplicate node id %d" % n["id"])
        by_id[n["id"]] = n
    for lk, src, sslot, dst, dslot, typ in links:
        try:
            o = by_id[src]["outputs"][sslot]
            by_id[dst]["inputs"][dslot]
        except (KeyError, IndexError):
            raise SystemExit("bad link %d: %s[%d] -> %s[%d]" % (lk, src, sslot, dst, dslot))
        o.setdefault("links", []).append(lk)
        by_id[dst]["inputs"][dslot]["link"] = lk
    for i, n in enumerate(nodes):
        n["order"] = i

    graph = {"id": "mpillow-showroom-zoned-fast", "revision": 0,
             "last_node_id": max(by_id), "last_link_id": lid[0],
             "nodes": nodes, "links": links, "groups": groups,
             "config": {}, "extra": {}, "version": 0.4}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(graph, f, indent=2)
    if os.path.isdir(os.path.dirname(SIDEBAR)):
        os.makedirs(SIDEBAR, exist_ok=True)
        shutil.copy(OUT, os.path.join(SIDEBAR, os.path.basename(OUT)))
    print("nodes:  %d" % len(nodes))
    print("links:  %d" % len(links))
    print("wrote:  %s (%s bytes)" % (OUT, format(os.path.getsize(OUT), ",")))
    print("copied: %s" % SIDEBAR)


if __name__ == "__main__":
    main()
