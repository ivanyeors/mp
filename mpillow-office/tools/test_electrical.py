"""
Self-test for the electrical layer (tools/electrical.py). No ComfyUI.

  1. the points text round-trips; bad lines are refused with their line number;
  2. the checks catch what an LEW would send back (no circuit, a switch with
     nothing to switch, an overloaded radial, an open assumption);
  3. routing: every point is reached, every run is level at the route height
     and axis-aligned, drops are vertical, each circuit is one tree from the DB;
  4. a projected point lands where RenderMesh would draw it;
  5. the plan's own points file passes everything but its open assumptions.

    python tools/test_electrical.py                       # plans/midview-08-83.yaml
    python tools/test_electrical.py plans/<name>.yaml
"""

import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import electrical as EL  # noqa: E402
import spec as S  # noqa: E402

SAMPLE = """
# a comment
L1-1  downlight x=2 z=2 circuit=L1 | warm
L1-2  downlight x=4 z=2 circuit=L1
S1    switch    x=1 z=1 controls=L1  | by the door
P1-1  socket13a x=0.1 z=3 n=2 circuit=P1 | twin
"""


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


def fake_spec(text, **el):
    spec = {"name": "t", "_env": {"H": 3.0}, "_dir": HERE,
            "electrical": dict({"db": {"x": 0.0, "z": 0.0, "y": 1.6}, "ceiling": 2.8,
                                "route": {"height": 2.9}}, **el)}
    return spec, EL.Layer(spec, text)


def test_text():
    pts = EL.parse(SAMPLE)
    check([p.name for p in pts] == ["L1-1", "L1-2", "S1", "P1-1"], "names")
    again = EL.parse("\n".join(EL.format_line(p) for p in pts))
    for a, b in zip(pts, again):
        check((a.name, a.kind, a.x, a.z, a.circuit, a.controls, a.n, a.note) ==
              (b.name, b.kind, b.x, b.z, b.circuit, b.controls, b.n, b.note), "round trip " + a.name)
    for bad, want in [("X1 lamp x=1 z=1", "unknown kind"), ("X1 downlight x=1", "x= and z="),
                      ("\n\nX1 downlight x=1 z=1 colour=red", "line 3"), ("L1 downlight x=1 z=1\nL1 fan x=1 z=1",
                                                                          "duplicate")]:
        try:
            EL.parse(bad)
        except EL.ElectricalError as e:
            check(want in str(e), "%r: %s" % (bad, e))
        else:
            raise AssertionError("accepted: %r" % bad)
    print("text: ok")


def test_checks():
    _, layer = fake_spec(SAMPLE)
    errors, warnings = EL.check(layer)
    check(not errors, "clean sample has errors: %s" % errors)
    _, layer = fake_spec(SAMPLE + "L9-1 downlight x=1 z=1\nS9 switch x=1 z=1\n")
    errors, _ = EL.check(layer)
    check(any("L9-1" in e and "no circuit" in e for e in errors), "point without circuit: %s" % errors)
    check(any("S9" in e and "switches nothing" in e for e in errors), "switch without controls: %s" % errors)
    many = "".join("P2-%d socket13a x=%d z=1 n=2 circuit=P2\n" % (k, k) for k in range(12))
    _, layer = fake_spec(SAMPLE + many)
    _, warnings = EL.check(layer)
    check(any("P2" in w and "accessories" in w for w in warnings), "busy radial: %s" % warnings)
    check(any("P2" in w and "MCB" in w for w in warnings), "overloaded radial: %s" % warnings)
    _, layer = fake_spec(SAMPLE, assumptions=[{"about": "supply", "status": "open"}])
    errors, _ = EL.check(layer)
    check(errors == ["open: supply"], "open assumption: %s" % errors)
    print("checks: ok")


def assert_routes(layer, routes):
    db = layer.db
    for c, segs in routes.items():
        ends = []
        for a, b, role in segs:
            d = b - a
            if role == "run":
                check(abs(a[1] - layer.route_h) < 1e-9 and abs(b[1] - layer.route_h) < 1e-9, "%s: run off level" % c)
                check(min(abs(d[0]), abs(d[2])) < 1e-9, "%s: diagonal run %s -> %s" % (c, a, b))
            elif role == "drop":
                check(abs(d[0]) < 1e-9 and abs(d[2]) < 1e-9 and d[1] < 0, "%s: drop not vertical" % c)
            else:
                check(abs(a[0] - db["x"]) < 1e-9 and abs(a[2] - db["z"]) < 1e-9, "%s: riser not at the DB" % c)
            ends += [tuple(np.round(a, 6)), tuple(np.round(b, 6))]
        # connected: walk from the DB riser over shared end points
        adj = {}
        for a, b, _ in segs:
            ka, kb = tuple(np.round(a, 6)), tuple(np.round(b, 6))
            adj.setdefault(ka, set()).add(kb)
            adj.setdefault(kb, set()).add(ka)
        start = tuple(np.round(segs[0][0], 6))
        seen, todo = {start}, [start]
        while todo:
            for n in adj[todo.pop()]:
                if n not in seen:
                    seen.add(n)
                    todo.append(n)
        check(seen == set(ends), "%s: not one tree from the DB" % c)
        cps = layer.circuits()[c] + [s for s in layer.switches_for(c) if s.controls[0] == c]
        for p in cps:
            target = tuple(np.round([p.x, p.height(layer.ceiling), p.z], 6))
            check(target in seen, "%s: %s not reached" % (c, p.name))


def test_routes():
    _, layer = fake_spec(SAMPLE)
    routes = EL.route(layer)
    check(set(routes) == {"L1", "P1"}, "circuits routed: %s" % sorted(routes))
    assert_routes(layer, routes)
    print("routes: ok")


def test_projection():
    cam_info = {"position": {"x": 0, "y": 1.5, "z": 5}, "target": {"x": 0, "y": 1.5, "z": 0}, "fov": 60}
    sys.path.insert(0, os.path.join(ROOT, "comfy_nodes", "mp_blocking"))
    import blocks as BL
    cam = BL.camera_from_info(cam_info)
    W, H = 400, 300
    dirs = BL.pixel_dirs(cam, W, H)
    for (v, u) in [(150, 200), (40, 30), (260, 370)]:
        p = cam[0] + dirs[v, u] * 3.7
        q, z = EL.project(cam, [p], W, H)
        check(abs(q[0][0] - (u + 0.5)) < 1e-6 and abs(q[0][1] - (v + 0.5)) < 1e-6,
              "pixel (%d, %d) projects to %s" % (u, v, q[0]))
        check(z[0] > 0, "in front")
    print("projection: ok")


def test_plan(path):
    spec = S.load(path)
    if not spec.get("electrical"):
        print("plan: %s has no electrical block, skipped" % path)
        return
    layer = EL.Layer(spec)
    routes = EL.route(layer)
    assert_routes(layer, routes)
    errors, warnings = EL.check(layer, spec)
    real = [e for e in errors if not e.startswith("open: ")]
    check(not real, "plan points: %s" % real)
    rows, _ = EL.schedule(layer, routes)
    check(len(rows) == len(layer.circuits()), "one DB way per circuit")
    print("plan: ok (%d points, %d circuits, %d open assumption(s), %d warning(s))" % (
        len(layer.points), len(routes), len(errors) - len(real), len(warnings)))


if __name__ == "__main__":
    test_text()
    test_checks()
    test_routes()
    test_projection()
    test_plan(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "plans", "midview-08-83.yaml"))
