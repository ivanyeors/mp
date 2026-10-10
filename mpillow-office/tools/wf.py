"""
A ComfyUI graph under construction, for the build_workflow_*.py scripts.

Nodes, links and groups are collected in order; `finish()` resolves every
link onto its slots (and fails on a bad one) and returns the workflow JSON.
The building blocks are the Qwen-Image-2.1 turbo stack of the fast zoned
workflow -- encode, sample, depth lock, tiling, zone masks -- so every graph
that renders on it shares one implementation. Shared loaders (UNET, CLIP,
VAE, PATCH, SAMPLER, ZONING, FULL_MASK) are node ids the caller sets once
they exist.
"""

import json
import math
import os
import shutil
import uuid

import build_workflow as B

node, inp, out, image_batch = B.node, B.inp, B.out, B.image_batch

CN_STRENGTH = 0.85            # Fun ControlNet on the depth pass: 1.0 traces, 0.6 loose
MASK_THRESHOLD = 120          # Color To Mask: RGB distance; zone colours are >= 255 apart
ENC_RES = 1024                # Text Encode Qwen Image 2.1: pixel budget for reference images


def turbo_sigmas(raw, w, h):
    """The Viggle Turbo Sigmas node, evaluated at build time: diffusers'
    dynamic exponential shift, mu from the token count of a w x h latent."""
    tokens = (w // 16) * (h // 16)
    mu = 0.5 + (0.9 - 0.5) * (tokens - 256) / (8192 - 256)
    s = [math.exp(mu) / (math.exp(mu) + (1 / t - 1)) for t in raw] + [0.0]
    return ", ".join("%.6f" % x for x in s)


WIDGET_TYPES = ("INT", "FLOAT", "STRING", "BOOLEAN")
SG_IN, SG_OUT = -10, -20                  # a subgraph's input and output nodes
BLANK = {"INT": 0, "FLOAT": 0.0, "STRING": "", "BOOLEAN": False}


class Port(tuple):
    """(node, slot) -- a source that is not output 0 of a node, e.g. a
    subgraph input. Graph.link() takes one wherever it takes a node id."""

    def __new__(cls, node_id, slot):
        return tuple.__new__(cls, (node_id, slot))


class Graph:
    def __init__(self, first_id=3000, first_image_id=20000, root=None):
        self.nodes, self.links, self.groups = [], [], []
        self.root = root or self
        self._lid, self._nid, self._img = 0, first_id, first_image_id
        self.UNET = self.CLIP = self.VAE = self.PATCH = self.SAMPLER = None
        self.ZONING = self.FULL_MASK = None
        self.area_cond = []                   # one encode per zone, in zone order
        self.definitions = []                 # subgraph definitions (root only)

    # ---------------------------------------------------------- plumbing --
    def new(self, n=1):
        r = self.root
        v = r._nid
        r._nid += n
        return v

    def add(self, n):
        self.nodes.append(n)
        return n["id"]

    def link(self, src, sslot, dst, dslot, typ):
        if isinstance(src, Port):
            src, sslot = src
        r = self.root
        r._lid += 1
        self.links.append([r._lid, src, sslot, dst, dslot, typ])

    def group(self, title, x, y, w, h, color, font=24):
        self.groups.append({"id": len(self.groups) + 1, "title": title, "bounding": [x, y, w, h],
                            "color": color, "font_size": font, "flags": {}})

    def add_image(self, pos, path, title, size):
        """Path-based image loader + its preview (ids id and id + 400). `path`
        is absolute, or relative to ref-img/."""
        i = self._img
        self._img += 1
        if not os.path.isabs(path):
            path = os.path.join(B.REF_ABS, *path.split("/"))
        ns, lk = B.load_image(i, pos, path, title, size)
        self.nodes.extend(ns)
        self.link(*lk)
        return i

    # ------------------------------------------------------ the turbo stack --
    def encode(self, pos, title, prompt_src, images=(), size=(420, 160), resolution=None):
        """Text Encode Qwen Image 2.1. images = reference image sources, in
        order. resolution = a source for the reference pixel budget (else
        ENC_RES)."""
        ins = [inp("clip", "CLIP"), inp("vae", "VAE", optional=True), inp("prompt", "STRING", widget=True)]
        if resolution is not None:
            ins.append(inp("resolution", "INT", widget=True))
        first_img = len(ins)
        for k in range(len(images) + 1):          # autogrow: one spare slot
            d = inp("images.image_%d" % (k + 1), "IMAGE", optional=True)
            d["localized_name"] = "image_%d" % (k + 1)
            ins.append(d)
        e = self.add(node(self.new(), "TextEncodeQwenImage21", pos, size, ["", "", ENC_RES], inputs=ins,
                          outputs=[out("positive", "CONDITIONING"), out("negative", "CONDITIONING"),
                                   out("latent", "LATENT")], title=title))
        self.link(self.CLIP, 0, e, 0, "CLIP")
        self.link(self.VAE, 0, e, 1, "VAE")
        self.link(prompt_src, 0, e, 2, "STRING")
        if resolution is not None:
            self.link(resolution, 0, e, 3, "INT")
        for k, src in enumerate(images):
            self.link(src, 0, e, first_img + k, "IMAGE")
        return e

    def sample(self, pos, model, cond, latent, sigmas, seed, title):
        """RandomNoise + BasicGuider + SamplerCustomAdvanced + VAE Decode.
        Returns the decode node. seed: a number, or a source (Port) for it."""
        x, y = pos
        linked = isinstance(seed, Port)
        nz = self.add(node(self.new(), "RandomNoise", (x, y), (320, 90), [0 if linked else seed, "fixed"],
                           inputs=[inp("noise_seed", "INT", widget=True)] if linked else [],
                           outputs=[out("NOISE", "NOISE")], title="seed"))
        if linked:
            self.link(seed, 0, nz, 0, "INT")
        gd = self.add(node(self.new(), "BasicGuider", (x, y + 120), (320, 50), None,
                           inputs=[inp("model", "MODEL"), inp("conditioning", "CONDITIONING")],
                           outputs=[out("GUIDER", "GUIDER")], title="guider (no CFG)"))
        sm = self.add(node(self.new(), "SamplerCustomAdvanced", (x, y + 200), (320, 110), None,
                           inputs=[inp("noise", "NOISE"), inp("guider", "GUIDER"), inp("sampler", "SAMPLER"),
                                   inp("sigmas", "SIGMAS"), inp("latent_image", "LATENT")],
                           outputs=[out("output", "LATENT"), out("denoised_output", "LATENT")], title=title))
        dc = self.add(node(self.new(), "VAEDecode", (x, y + 340), (320, 50), [],
                           inputs=[inp("samples", "LATENT"), inp("vae", "VAE")],
                           outputs=[out("IMAGE", "IMAGE")], title="VAE Decode"))
        self.link(model, 0, gd, 0, "MODEL")
        self.link(cond, 0, gd, 1, "CONDITIONING")
        self.link(nz, 0, sm, 0, "NOISE")
        self.link(gd, 0, sm, 1, "GUIDER")
        self.link(self.SAMPLER, 0, sm, 2, "SAMPLER")
        self.link(sigmas, 0, sm, 3, "SIGMAS")
        self.link(latent, 0, sm, 4, "LATENT")
        self.link(sm, 0, dc, 0, "LATENT")
        self.link(self.VAE, 0, dc, 1, "VAE")
        return dc

    def empty_latent(self, pos, w, h, title):
        return self.add(node(self.new(), "EmptyLatentImage", pos, (320, 110), [w, h, 1],
                             outputs=[out("LATENT", "LATENT")], title=title))

    def sigmas_node(self, pos, raw, w, h, title):
        return self.add(node(self.new(), "ManualSigmas", pos, (420, 80), [turbo_sigmas(raw, w, h)],
                             outputs=[out("SIGMAS", "SIGMAS")], title=title))

    def depth_lock(self, pos, depth_src, title, inpaint_src=None, mask_src=None):
        """Apply Fun ControlNet (depth) as a model patch. Returns the patched
        model. With inpaint_src + mask_src the union model also sees the
        picture around the mask (inpaint mode)."""
        c = self.add(node(self.new(), "ZImageFunControlnet", pos, (340, 190), [CN_STRENGTH, 0.0, 1.0],
                          inputs=[inp("model", "MODEL"), inp("model_patch", "MODEL_PATCH"), inp("vae", "VAE"),
                                  inp("image", "IMAGE", optional=True), inp("inpaint_image", "IMAGE", optional=True),
                                  inp("mask", "MASK", optional=True)],
                          outputs=[out("MODEL", "MODEL")], title=title))
        self.link(self.UNET, 0, c, 0, "MODEL")
        self.link(self.PATCH, 0, c, 1, "MODEL_PATCH")
        self.link(self.VAE, 0, c, 2, "VAE")
        self.link(depth_src, 0, c, 3, "IMAGE")
        if inpaint_src is not None:
            self.link(inpaint_src, 0, c, 4, "IMAGE")
        if mask_src is not None:
            self.link(mask_src, 0, c, 5, "MASK")
        return c

    def vae_encode(self, pos, src, title="-> latent"):
        e = self.add(node(self.new(), "VAEEncode", pos, (320, 50), [],
                          inputs=[inp("pixels", "IMAGE"), inp("vae", "VAE")],
                          outputs=[out("LATENT", "LATENT")], title=title))
        self.link(src, 0, e, 0, "IMAGE")
        self.link(self.VAE, 0, e, 1, "VAE")
        return e

    def scale(self, pos, src, w, h, method, title, crop="disabled"):
        s = self.add(node(self.new(), "ImageScale", pos, (320, 110), [method, w, h, crop],
                          inputs=[inp("image", "IMAGE")], outputs=[out("IMAGE", "IMAGE")], title=title))
        self.link(src, 0, s, 0, "IMAGE")
        return s

    def crop(self, pos, src, w, h, x, y, title):
        c = self.add(node(self.new(), "ImageCrop", pos, (320, 130), [w, h, x, y],
                          inputs=[inp("image", "IMAGE")], outputs=[out("IMAGE", "IMAGE")], title=title))
        self.link(src, 0, c, 0, "IMAGE")
        return c

    def batch(self, pos, srcs):
        """ImageBatch chain over srcs, in order. Returns the last node."""
        x, y = pos
        prev = None
        for k in range(len(srcs) - 1):
            b = self.add(image_batch(self.new(), (x, y + k * 70)))
            self.link(srcs[0] if k == 0 else prev, 0, b, 0, "IMAGE")
            self.link(srcs[k + 1], 0, b, 1, "IMAGE")
            prev = b
        return prev

    def tile(self, pos, srcs, cols, title):
        """Batch srcs in order and tile them `cols` wide."""
        x, y = pos
        prev = self.batch(pos, srcs)
        g = self.add(node(self.new(), "ImageConcatFromBatch", (x, y + 70 * (len(srcs) - 1) + 10), (320, 110),
                          [cols, False, 4096], inputs=[inp("images", "IMAGE")],
                          outputs=[out("IMAGE", "IMAGE")], title=title))
        self.link(prev, 0, g, 0, "IMAGE")
        return g

    def zoned(self, pos, base_cond, id_src, title, zones=B.ZONES, global_strength=None, zone_strength=None):
        """One prompt per zone, each confined to its colour in the ID image, on
        top of `base_cond` masked to the whole frame; then the ZONING switch
        picks this or the plain whole-scene prompt. Returns the switch node.
        global_strength / zone_strength: sources for the two mask strengths
        (else GLOBAL_STRENGTH / ZONE_STRENGTH)."""
        x, y = pos

        def set_mask(p, strength, src, title):
            ins = [inp("conditioning", "CONDITIONING"), inp("mask", "MASK")]
            if src is not None:
                ins.append(inp("strength", "FLOAT", widget=True))
            n = self.add(node(self.new(), "ConditioningSetMask", p, (300, 110), [strength, "default"], inputs=ins,
                              outputs=[out("CONDITIONING", "CONDITIONING")], title=title))
            if src is not None:
                self.link(src, 0, n, 2, "FLOAT")
            return n
        full = set_mask((x, y), B.GLOBAL_STRENGTH, global_strength, "whole scene underneath (strength)")
        self.link(base_cond, 0, full, 0, "CONDITIONING")
        self.link(self.FULL_MASK, 0, full, 1, "MASK")
        prev = full
        for k, (cname, rgb) in enumerate(zones):
            ry = y + 140 + k * 150
            m = self.add(node(self.new(), "ColorToMask", (x, ry), (300, 130),
                              [False, (rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, MASK_THRESHOLD, 16],
                              inputs=[inp("images", "IMAGE")], outputs=[out("MASK", "MASK")],
                              title="%s = area %d" % (cname, k + 1)))
            sm = set_mask((x + 330, ry), B.ZONE_STRENGTH, zone_strength, "area %d, only in its zone" % (k + 1))
            cb = self.add(node(self.new(), "ConditioningCombine", (x + 660, ry), (220, 60), [],
                               inputs=[inp("conditioning_1", "CONDITIONING"), inp("conditioning_2", "CONDITIONING")],
                               outputs=[out("CONDITIONING", "CONDITIONING")], title="+"))
            self.link(id_src, 0, m, 0, "IMAGE")
            self.link(self.area_cond[k], 0, sm, 0, "CONDITIONING")
            self.link(m, 0, sm, 1, "MASK")
            self.link(prev, 0, cb, 0, "CONDITIONING")
            self.link(sm, 0, cb, 1, "CONDITIONING")
            prev = cb
        sw = self.add(node(self.new(), "ComfySwitchNode", (x + 660, y), (220, 100), [True],
                           inputs=[inp("on_false", "CONDITIONING", optional=True),
                                   inp("on_true", "CONDITIONING", optional=True),
                                   inp("switch", "BOOLEAN", widget=True)],
                           outputs=[out("output", "CONDITIONING")], title=title))
        self.link(base_cond, 0, sw, 0, "CONDITIONING")
        self.link(prev, 0, sw, 1, "CONDITIONING")
        self.link(self.ZONING, 0, sw, 2, "BOOLEAN")
        return sw

    # ---------------------------------------------------------- subgraphs --
    def subgraph(self, name, inputs, outputs, description=""):
        """A new subgraph definition, built by the caller through the returned
        Subgraph (same helpers as a Graph). inputs: [(name, type)] or
        [(name, type, default)] -- a default makes it a widget on every
        instance, with its own value per instance. outputs: [(name, type)]."""
        sg = Subgraph(self.root, name, inputs, outputs, description)
        self.root.definitions.append(sg)
        return sg

    def instance(self, sg, pos, size, title=None, values=None, mode=0, color=None):
        """Place a subgraph. values: {input name: widget value}; the rest keep
        the subgraph's defaults. Inputs and outputs keep the subgraph's order:
        link to them with sg.index_in(name) / sg.index_out(name)."""
        values = values or {}
        unknown = set(values) - {nm for nm, _, d in sg.inputs if d is not None}
        if unknown:
            raise SystemExit("subgraph %s: no widget input %s" % (sg.name, ", ".join(sorted(unknown))))
        # The frontend gives an instance a widget for every input that feeds an
        # inner widget -- linked or not -- and fills them from widgets_values in
        # order, so a linked one (a prompt from a text box) needs a placeholder.
        shown = sg.widget_inputs()
        ins, wv = [], []
        for nm, typ, default in sg.inputs:
            ins.append(inp(nm, typ, widget=nm in shown))
            if nm in shown:
                wv.append(values.get(nm, default if default is not None else BLANK[typ]))
        n = node(self.new(), sg.id, pos, size, wv, inputs=ins,
                 outputs=[out(nm, typ) for nm, typ in sg.outputs],
                 props={"proxyWidgets": [[str(i), w] for i, w in sg.promoted]},
                 title=title or sg.name, mode=mode, color=color)
        return self.add(n)

    # ------------------------------------------------------------- output --
    @staticmethod
    def _resolve(nodes, links, ends=None):
        """Put link ids onto node slots. ends = {SG_IN: [...], SG_OUT: [...]}:
        a subgraph's boundary slots (dicts with linkIds)."""
        by_id = {}
        for n in nodes:
            if n["id"] in by_id:
                raise SystemExit("duplicate node id %d" % n["id"])
            by_id[n["id"]] = n
        for lk, src, sslot, dst, dslot, typ in links:
            try:
                if ends is not None and src == SG_IN:
                    ends[SG_IN][sslot]["linkIds"].append(lk)
                else:
                    by_id[src]["outputs"][sslot].setdefault("links", []).append(lk)
                if ends is not None and dst == SG_OUT:
                    t = ends[SG_OUT][dslot]
                    if t["linkIds"]:
                        raise SystemExit("subgraph output %s linked twice" % t["name"])
                    t["linkIds"].append(lk)
                else:
                    slot = by_id[dst]["inputs"][dslot]
                    if slot.get("link") is not None:
                        raise SystemExit("input %s of node %s linked twice" % (slot["name"], dst))
                    slot["link"] = lk
            except (KeyError, IndexError):
                raise SystemExit("bad link %d: %s[%d] -> %s[%d]" % (lk, src, sslot, dst, dslot))
        for i, n in enumerate(nodes):
            n["order"] = i
        return by_id

    def finish(self, graph_id):
        """Resolve links onto slots and return the workflow dict."""
        ids = set(self._resolve(self.nodes, self.links))
        defs = [sg.definition() for sg in self.definitions]
        for sg in self.definitions:
            ids |= {n["id"] for n in sg.nodes}
        g = {"id": graph_id, "revision": 0,
             "last_node_id": max(ids), "last_link_id": self._lid,
             "nodes": self.nodes, "links": self.links, "groups": self.groups}
        if defs:
            g["definitions"] = {"subgraphs": defs}
        g.update({"config": {}, "extra": {}, "version": 0.4})
        return g

    def write(self, graph_id, path, sidebar=B.SIDEBAR):
        graph = self.finish(graph_id)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(graph, f, indent=2)
        if os.path.isdir(os.path.dirname(sidebar)):
            os.makedirs(sidebar, exist_ok=True)
            shutil.copy(path, os.path.join(sidebar, os.path.basename(path)))
        print("nodes:  %d  (+ %d in %d subgraphs)" % (len(self.nodes), sum(len(s.nodes) for s in self.definitions),
                                                     len(self.definitions)))
        print("links:  %d" % len(self.links))
        print("wrote:  %s (%s bytes)" % (path, format(os.path.getsize(path), ",")))
        print("copied: %s" % sidebar)


class Subgraph(Graph):
    """A subgraph definition under construction. Its inputs are Ports on the
    subgraph's input node (sg.port("clip")); its outputs are set with
    sg.ret("image", src). Node and link ids come from the root graph, so they
    are unique across the whole workflow."""

    def __init__(self, root, name, inputs, outputs, description=""):
        Graph.__init__(self, root=root)
        self.name = name
        self.description = description
        self.id = str(uuid.uuid5(uuid.NAMESPACE_URL, "mpillow-office/subgraph/" + name))
        self.inputs = [(i[0], i[1], i[2] if len(i) > 2 else None) for i in inputs]
        self.outputs = list(outputs)
        self.promoted = []                     # (inner node id, widget name)
        for nm, typ, default in self.inputs:
            if default is not None and typ not in WIDGET_TYPES:
                raise SystemExit("subgraph %s: %s is %s, not a widget type" % (name, nm, typ))

    def index_in(self, name):
        return [i[0] for i in self.inputs].index(name)

    def index_out(self, name):
        return [o[0] for o in self.outputs].index(name)

    def port(self, name):
        return Port(SG_IN, self.index_in(name))

    def ret(self, name, src, slot=0):
        k = self.index_out(name)
        self.link(src, slot, SG_OUT, k, self.outputs[k][1])

    def widget_inputs(self):
        """Names of the inputs that end on an inner node's widget, plus every
        input with a default (a widget by declaration)."""
        by_id = {n["id"]: n for n in self.nodes}
        names = {nm for nm, _, d in self.inputs if d is not None}
        for _, src, sslot, dst, dslot, typ in self.links:
            if src == SG_IN and typ in WIDGET_TYPES and dst in by_id:
                if by_id[dst]["inputs"][dslot].get("widget"):
                    names.add(self.inputs[sslot][0])
        return names

    def promote(self, node_id, widget):
        """Show an inner widget on every instance (one value, shared)."""
        self.promoted.append((node_id, widget))

    def definition(self):
        ins = [{"id": str(uuid.uuid5(uuid.NAMESPACE_URL, "%s/in/%s" % (self.id, nm))), "name": nm,
                "type": typ, "linkIds": [], "localized_name": nm} for nm, typ, _ in self.inputs]
        outs = [{"id": str(uuid.uuid5(uuid.NAMESPACE_URL, "%s/out/%s" % (self.id, nm))), "name": nm,
                 "type": typ, "linkIds": [], "localized_name": nm} for nm, typ in self.outputs]
        self._resolve(self.nodes, self.links, {SG_IN: ins, SG_OUT: outs})
        for d in outs:
            if not d["linkIds"]:
                raise SystemExit("subgraph %s: output %s is not connected" % (self.name, d["name"]))
        for d in ins:
            if not d["linkIds"]:
                raise SystemExit("subgraph %s: input %s is not used" % (self.name, d["name"]))
        x0 = min([n["pos"][0] for n in self.nodes] or [0])
        x1 = max([n["pos"][0] + n["size"][0] for n in self.nodes] or [0])
        y0 = min([n["pos"][1] for n in self.nodes] or [0])
        x_in, x_out = x0 - 360, x1 + 120
        for k, d in enumerate(ins):
            d["pos"] = [x_in + 180, y0 + 24 + 20 * k]
        for k, d in enumerate(outs):
            d["pos"] = [x_out + 20, y0 + 24 + 20 * k]
        return {
            "id": self.id, "version": 1,
            "state": {"lastGroupId": len(self.groups), "lastNodeId": max([n["id"] for n in self.nodes] or [0]),
                      "lastLinkId": max([lk[0] for lk in self.links] or [0]), "lastRerouteId": 0},
            "revision": 0, "config": {}, "name": self.name, "description": self.description,
            "inputNode": {"id": SG_IN, "bounding": [x_in, y0, 200, 48 + 20 * len(ins)]},
            "outputNode": {"id": SG_OUT, "bounding": [x_out, y0, 200, 48 + 20 * len(outs)]},
            "inputs": ins, "outputs": outs, "widgets": [],
            "nodes": self.nodes, "groups": self.groups,
            "links": [{"id": lk, "origin_id": s, "origin_slot": ss, "target_id": t, "target_slot": ts, "type": typ}
                      for lk, s, ss, t, ts, typ in self.links],
            "extra": {},
        }
