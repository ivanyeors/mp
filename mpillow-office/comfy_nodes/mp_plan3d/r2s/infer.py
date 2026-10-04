"""Raster2Seq inference: plan image -> labelled room polygons + door / window segments.

Mirrors predict.py + engine.generate/_process_predictions (poly2seq, semantic,
per-token class vote, doors / windows as 2-corner lines) without the training,
evaluation and dataset code.
"""

import math
import os
from types import SimpleNamespace

import cv2
import numpy as np
import torch

# checkpoint key -> (image_size, semantic_classes, label names, door / window class ids)
CC5K = {0: "outdoor", 1: "kitchen", 2: "living", 3: "bedroom", 4: "bath", 5: "entry", 6: "storage",
        7: "garage", 8: "undefined", 9: "window", 10: "door"}
R2G = {0: "unknown", 1: "living", 2: "kitchen", 3: "bedroom", 4: "bathroom", 5: "restroom", 6: "balcony",
       7: "closet", 8: "corridor", 9: "washing", 10: "PS", 11: "outside"}
PRESETS = {
    "cubicasa5k": dict(image_size=256, semantic_classes=12, labels=CC5K, door=10, window=9),
    "raster2graph": dict(image_size=256, semantic_classes=13, labels=R2G, door=None, window=None),
    "raster2graph-512": dict(image_size=512, semantic_classes=13, labels=R2G, door=None, window=None),
}
_CACHE = {}


def preset_of(path):
    name = os.path.splitext(os.path.basename(path))[0].lower().replace("_", "-")
    for key in sorted(PRESETS, key=len, reverse=True):
        if key in name:
            return key
    raise ValueError("Raster2Seq: can't tell which checkpoint %s is; name it cubicasa5k.pth, "
                     "raster2graph.pth or raster2graph-512.pth" % os.path.basename(path))


def _args(p, device):
    return SimpleNamespace(
        input_channels=3, image_size=p["image_size"], semantic_classes=p["semantic_classes"],
        poly2seq=True, seq_len=512, num_bins=32, pre_decoder_pos_embed=False, learnable_dec_pe=False,
        dec_qkv_proj=False, dec_attn_concat_src=True, per_token_sem_loss=True, add_cls_token=False,
        backbone="resnet50", lr_backbone=0, dilation=False, position_embedding="sine",
        position_embedding_scale=2 * math.pi, num_feature_levels=4, enc_layers=6, dec_layers=6,
        dim_feedforward=1024, hidden_dim=256, dropout=0.1, nheads=8, num_queries=800, num_polys=20,
        dec_n_points=4, enc_n_points=4, query_pos_type="sine", with_poly_refine=False, masked_attn=False,
        aux_loss=False, use_anchor=True, label_smoothing=0.0, device=device)


def load(path, device="cuda"):
    key = (path, device)
    if key not in _CACHE:
        from .discrete_tokenizer import DiscreteTokenizer
        from .raster2seq import build
        p = PRESETS[preset_of(path)]
        args = _args(p, device)
        tok = DiscreteTokenizer(args.num_bins, args.seq_len, add_cls=False)
        args.vocab_size = len(tok)
        model = build(args, train=False, tokenizer=tok)
        ck = torch.load(path, map_location="cpu", weights_only=False)
        sd = {k[7:] if k.startswith("module.") else k: v for k, v in (ck.get("ema") or ck["model"]).items()}
        missing, _ = model.load_state_dict(sd, strict=False)
        if missing:
            raise RuntimeError("Raster2Seq: %d weights missing from %s, e.g. %s" % (len(missing), path, missing[:3]))
        model.eval().requires_grad_(False).to(device)
        _CACHE.clear()
        _CACHE[key] = (model, p)
    return _CACHE[key]


def letterbox(rgb, size):
    """predict.py's ResizeAndPad: fit, bicubic, centre on white."""
    h, w = rgb.shape[:2]
    s = min(size / h, size / w)
    nh, nw = int(h * s), int(w * s)
    top, left = (size - nh) // 2, (size - nw) // 2
    out = np.full((size, size, 3), 255, np.uint8)
    out[top:top + nh, left:left + nw] = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_CUBIC)
    return out, s, left, top


@torch.no_grad()
def predict(rgb, path, device="cuda"):
    """rgb: HxWx3 uint8/float 0-255. Returns dict rooms=[(Nx2 px, label)], doors=[2x2], windows=[2x2]."""
    from .misc import TokenType
    model, p = load(path, device)
    S = p["image_size"]
    img, s, left, top = letterbox(np.clip(rgb, 0, 255).astype(np.uint8), S)
    x = torch.from_numpy(img).permute(2, 0, 1).float().div(255)[None].to(device)
    out = model.forward_inference(x, True)
    seq = out["gen_out"][0]
    cls = out["pred_room_logits"][0][..., :-1].argmax(-1).cpu().numpy()

    polys, lengths, cur = [], [0], []
    for t in seq:
        if isinstance(t, int):
            if t in (TokenType.sep.value, TokenType.eos.value, TokenType.cls.value, -1) and cur:
                polys.append(cur)
                lengths.append(len(cur) + 1)
                cur = []
            if t in (-1, TokenType.eos.value):
                break
            continue
        cur.append(t)
    if cur:
        polys.append(cur)
        lengths.append(len(cur) + 1)
    starts = np.cumsum(lengths)

    def to_px(c):
        return (np.asarray(c, np.float32) * (S - 1) - [left, top]) / s

    res = dict(rooms=[], doors=[], windows=[], labels=p["labels"], size=S)
    for j, poly in enumerate(polys):
        if len(poly) < 2:
            continue
        votes = cls[starts[j]:starts[j + 1]][:-1]
        k = int(np.bincount(votes).argmax()) if len(votes) else -1
        c = np.asarray(poly, np.float32)
        if len(poly) == 2:  # a door / window drawn as a line
            seg = to_px(c)
            (res["windows"] if k == p["window"] else res["doors"]).append(seg)
        elif cv2.contourArea(np.around(c * (S - 1)).astype(np.float32)) >= 100:
            res["rooms"].append((to_px(c), p["labels"].get(k, str(k))))
    return res
