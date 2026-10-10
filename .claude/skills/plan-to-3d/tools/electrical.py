"""
The electrical layer of a plan: the DB, every electrical point, the circuits
they are on, how the cable gets there -- and the drawings an electrician reads.

    python tools/electrical.py plans/<name>.yaml              # check + schedule + drawings
    python tools/electrical.py plans/<name>.yaml --propose    # write a starting points file
    python tools/electrical.py plans/<name>.yaml --no-sheets  # check + schedule only

Read in the order an electrician reads a job:

  1  origin    the DB (spec `electrical.db`): every run starts there
  2  points    one per line in the points file (spec `electrical.points`):
                 name  kind  x= z= [y=] [circuit=] [controls=L1,L2] [n=] [w=] | note
               GLB frame like BLOCKS (X east, Z south, metres); y = mounting
               height to the centre of the accessory, default per kind
  3  circuits  points grouped by circuit=; the prefix says what it is
               (L lighting, P power, AC aircon, WH water heater, E emergency,
               D data); a switch's controls= names the circuits it switches
  4  routes    each circuit: a riser from the DB to the route height, then
               orthogonal runs at that height (false ceiling / trunking) on a
               minimum spanning tree, then a vertical drop to each accessory
  5  drawings  E-01 lighting layout, E-02 power layout, E-03 DB schedule +
               single-line diagram, E-04 point schedule (A3, PNG + one PDF),
               and the points laid over the source floor plan

Ratings and cable sizes are typical suggestions for SS 638 practice. Every
sheet says so: these are design-intent drawings, to be verified and endorsed
by a Licensed Electrical Worker (LEW) before any work.

Spec block (all optional except points and db):

  electrical:
    standard: SS 638
    points: <name>.electrical.txt
    db: {x: .., z: .., y: 1.60, face: east, on: meter_cab}
    ceiling: 3.10                       # finished ceiling: ceiling points sit here
    route: {height: 3.25, kind: false_ceiling | exposed}
    supply: {phases: single, rating: 63}
    aircon: [{x: .., z: .., y: 2.4, note: ..}]      # indoor units -> isolators
    assumptions: [{about, used, status: open|confirmed, answer}]
"""

import argparse
import math
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import spec as S  # noqa: E402

# kind: (family, default height (m, or "ceil"), nominal load W, description)
KINDS = {
    "downlight":  ("light", "ceil", 12, "recessed LED downlight"),
    "pendant":    ("light", "ceil", 40, "pendant on a ceiling rose"),
    "cove":       ("light", "ceil", 30, "LED cove / strip driver"),
    "track":      ("light", "ceil", 60, "track light feed"),
    "spot":       ("light", "ceil", 8, "adjustable LED spot"),
    "linear":     ("light", "ceil", 20, "LED linear light"),
    "wall_light": ("light", 2.10, 15, "wall light"),
    "fan":        ("light", "ceil", 25, "exhaust fan"),
    "emergency":  ("light", "ceil", 5, "emergency luminaire, maintained, 3 h"),
    "exit":       ("light", 2.30, 5, "exit sign, maintained"),
    "switch":     ("control", 1.35, 0, "light switch"),
    "socket13a":  ("power", 0.30, 300, "13 A switched socket outlet (BS 1363)"),
    "fcu":        ("power", 0.45, 500, "13 A fused connection unit (spur)"),
    "isolator":   ("power", 2.20, 2500, "20 A DP isolator (aircon)"),
    "heater":     ("power", 1.80, 3000, "20 A DP switch, water heater point"),
    "floor_box":  ("power", 0.00, 600, "floor box, twin 13 A"),
    "data":       ("data", 0.30, 0, "data outlet, Cat 6"),
}
# circuit prefix: (what, MCB A, cable, RCCB group, max points (warn))
CIRCUITS = {
    "L":  ("lighting", 10, "1.5 mm2 Cu PVC/PVC 2C+E", "RCCB 2  100 mA", 12),
    "E":  ("emergency lighting", 10, "1.5 mm2 Cu PVC/PVC 2C+E", "RCCB 2  100 mA", 12),
    "P":  ("13 A socket outlets, radial", 20, "2.5 mm2 Cu PVC/PVC 2C+E", "RCCB 1  30 mA", 8),
    "AC": ("aircon", 20, "2.5 mm2 Cu PVC/PVC 2C+E", "RCCB 2  100 mA", 1),
    "WH": ("water heater", 20, "2.5 mm2 Cu PVC/PVC 2C+E", "RCCB 1  30 mA", 1),
    "D":  ("data", None, "Cat 6 U/UTP to the data cabinet", None, 24),
}
CIRCUIT_COLORS = [(214, 39, 40), (31, 119, 180), (44, 160, 44), (255, 127, 14), (148, 103, 189),
                  (140, 86, 75), (227, 119, 194), (23, 190, 207), (188, 189, 34), (127, 127, 127)]
DISCLAIMER = ("DESIGN INTENT -- to be verified and endorsed by a Licensed Electrical Worker (LEW) before "
              "any work. Ratings and cable sizes are suggestions, not a design calculation.")
WET = ("wc", "toilet", "bath", "shower", "wet")
OUTDOOR = ("patio", "balcony", "terrace", "yard", "garden", "outdoor", "ac-ledge")


class ElectricalError(ValueError):
    pass


class Point:
    def __init__(self, name, kind, x, z, y=None, circuit="", controls=(), n=1, w=None, note=""):
        if kind not in KINDS:
            raise ElectricalError("%s: unknown kind %r (kinds: %s)" % (name, kind, ", ".join(sorted(KINDS))))
        self.name, self.kind, self.x, self.z, self.y = name, kind, float(x), float(z), y
        self.circuit, self.controls, self.n = circuit, list(controls), int(n)
        self.w = w
        self.note = note

    @property
    def family(self):
        return KINDS[self.kind][0]

    @property
    def load(self):
        return float(self.w) if self.w is not None else KINDS[self.kind][2] * self.n

    def height(self, ceiling):
        if self.y is not None:
            return float(self.y)
        d = KINDS[self.kind][1]
        return ceiling if d == "ceil" else d


# ------------------------------------------------------------- the text ----

def parse(text):
    """Points text -> [Point]. Blank lines and # comments are skipped."""
    pts, seen = [], set()
    for ln, raw in enumerate((text or "").splitlines(), 1):
        line = raw.split("#", 1)[0] if "|" not in raw else raw
        if "|" in line:
            body, note = line.split("|", 1)
            body = body.split("#", 1)[0]
        else:
            body, note = line, ""
        tok = body.split()
        if not tok:
            continue
        if len(tok) < 2 or "=" in tok[0] or "=" in tok[1]:
            raise ElectricalError("line %d: start with a name and a kind: %r" % (ln, raw.strip()))
        name, kind, kv = tok[0], tok[1], {}
        for t in tok[2:]:
            if "=" not in t:
                raise ElectricalError("line %d: %r is not key=value" % (ln, t))
            k, v = t.split("=", 1)
            kv[k.lower()] = v
        bad = set(kv) - {"x", "z", "y", "circuit", "controls", "n", "w"}
        if bad:
            raise ElectricalError("line %d: unknown key(s) %s" % (ln, ", ".join(sorted(bad))))
        if "x" not in kv or "z" not in kv:
            raise ElectricalError("line %d (%s): x= and z= are required" % (ln, name))
        if name in seen:
            raise ElectricalError("line %d: duplicate point name %s" % (ln, name))
        seen.add(name)
        try:
            p = Point(name, kind, float(kv["x"]), float(kv["z"]),
                      float(kv["y"]) if "y" in kv else None, kv.get("circuit", ""),
                      [c for c in kv.get("controls", "").split(",") if c], int(kv.get("n", 1)),
                      float(kv["w"]) if "w" in kv else None, note.strip())
        except ValueError as e:
            raise ElectricalError("line %d (%s): %s" % (ln, name, e))
        pts.append(p)
    return pts


def format_line(p):
    s = "%-8s %-10s x=%-6.2f z=%-6.2f" % (p.name, p.kind, p.x, p.z)
    if p.y is not None:
        s += " y=%-5.2f" % p.y
    if p.circuit:
        s += " circuit=%s" % p.circuit
    if p.controls:
        s += " controls=%s" % ",".join(p.controls)
    if p.n != 1:
        s += " n=%d" % p.n
    if p.w is not None:
        s += " w=%g" % p.w
    return s + ("  | " + p.note if p.note else "")


def prefix(circuit):
    m = re.match(r"[A-Za-z]+", circuit or "")
    p = m.group(0).upper() if m else ""
    return p if p in CIRCUITS else ("AC" if p.startswith("AC") else ("WH" if p.startswith("WH") else p))


# ------------------------------------------------------------- the spec ----

class Layer:
    """The electrical layer of a plan spec, resolved."""

    def __init__(self, spec, points_text=None):
        el = spec.get("electrical")
        if not el:
            raise ElectricalError("%s has no electrical: block" % spec["name"])
        env = spec["_env"]
        self.spec = spec
        self.standard = el.get("standard", "SS 638")
        self.mirror = S.ev(spec["mirror_z"], env) if spec.get("mirror_z") is not None else None
        db = el.get("db")
        if not db:
            raise ElectricalError("electrical.db is not set: where is the DB? (ask)")
        self.db = dict(x=float(S.ev(db["x"], env)), z=self.glb_z(float(S.ev(db["z"], env))),
                       y=float(S.ev(db.get("y", 1.6), env)), face=db.get("face", ""), on=db.get("on", ""))
        H = float(env.get("H", 3.0))
        self.ceiling = float(S.ev(el.get("ceiling", H), env))
        route = el.get("route") or {}
        self.route_h = float(S.ev(route.get("height", self.ceiling + 0.1), env))
        self.route_kind = route.get("kind", "false_ceiling")
        # no false ceiling to recess into: ceiling fittings are surface mounted
        self.mount = "surface" if self.route_kind == "exposed" else "recessed"
        self.supply = el.get("supply") or {}
        self.assumptions = el.get("assumptions") or []
        self.points_file = S.resolve_path(spec, el["points"]) if el.get("points") else os.path.join(
            spec["_dir"], spec["name"] + ".electrical.txt")
        if points_text is None or not points_text.strip():
            points_text = open(self.points_file, encoding="utf-8").read() if os.path.exists(self.points_file) else ""
        self.text = points_text
        self.points = parse(points_text)

    def glb_z(self, z):
        return self.mirror - z if self.mirror is not None else z

    def circuits(self):
        """{circuit: [points]} in first-seen order (switches under every circuit they control)."""
        out = {}
        for p in self.points:
            if p.circuit:
                out.setdefault(p.circuit, []).append(p)
        for p in self.points:
            for c in p.controls:
                out.setdefault(c, [])
        return out

    def switches_for(self, circuit):
        return [p for p in self.points if circuit in p.controls]

    def open_assumptions(self):
        return [a.get("about", "?") for a in self.assumptions if a.get("status", "open") == "open"]


# ------------------------------------------------------------- geometry ----

def room_geometry(spec):
    """Plan geometry for drawing and proposing, GLB frame: (walls, glass,
    floor) as shapely geometry, and the door openings."""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    import build_massing as BM
    parts, _, info = BM.build(spec)
    mz = S.ev(spec["mirror_z"], spec["_env"]) if spec.get("mirror_z") is not None else None
    walls, glass, floor = [], [], []
    for n, m in parts.items():
        if n.startswith("blk_"):
            continue
        v = np.asarray(m.vertices)[:, [0, 2]].copy()
        if mz is not None:
            v[:, 1] = mz - v[:, 1]
        tris = [Polygon(v[f]) for f in np.asarray(m.faces) if Polygon(v[f]).area > 1e-9]
        if not tris:
            continue
        hull = unary_union(tris).buffer(0)
        lo, hi = m.bounds
        if n == "floor" or info["kinds"].get(n) == "furniture" and hi[1] - lo[1] < 0.3 and lo[1] < 0:
            floor.append(hull)
        elif "glass" in n:
            glass.append(hull)
        elif lo[1] <= 1.0 <= hi[1] and info["kinds"].get(n) in ("wall", "furniture"):
            walls.append(hull)
    doors = []
    for o in info["openings"]:
        p0, p1, nrm = list(o["p0"]), list(o["p1"]), list(o["normal"])
        if mz is not None:
            p0[1], p1[1], nrm[1] = mz - p0[1], mz - p1[1], -nrm[1]
        doors.append(dict(o, p0=tuple(p0), p1=tuple(p1), normal=tuple(nrm)))
    return unary_union(walls), unary_union(glass) if glass else None, unary_union(floor), doors


def zone_of(spec, x, z):
    import build_massing as BM
    az = S.ev(spec["mirror_z"], spec["_env"]) - z if spec.get("mirror_z") is not None else z
    for (x0, x1, z0, z1), zi in BM.zone_regions(spec):
        if x0 <= x <= x1 and z0 <= az <= z1:
            return zi
    return None


# ---------------------------------------------------------------- check ----

def check(layer, spec=None):
    """-> (errors, warnings): what an LEW would send back."""
    errors, warnings = [], []
    pts = layer.points
    names = {p.name for p in pts}
    circuits = layer.circuits()
    if not pts:
        errors.append("no electrical points")
    for p in pts:
        fam = p.family
        if fam in ("light", "power", "data") and not p.circuit:
            errors.append("%s (%s) is on no circuit" % (p.name, p.kind))
        if p.kind == "switch":
            if not p.controls:
                errors.append("%s switches nothing (controls=)" % p.name)
            for c in p.controls:
                if c not in circuits or not circuits[c]:
                    errors.append("%s controls %s, which has no points" % (p.name, c))
        h = p.height(layer.ceiling)
        if h < 0 or h > layer.route_h:
            errors.append("%s at y=%.2f is outside floor..route height" % (p.name, h))
        if p.circuit and prefix(p.circuit) not in CIRCUITS:
            warnings.append("%s: circuit %s has no known prefix (L P AC WH E D)" % (p.name, p.circuit))
        if p.circuit and prefix(p.circuit) == "L" and fam == "power":
            warnings.append("%s: a %s on lighting circuit %s" % (p.name, p.kind, p.circuit))
        if p.circuit and prefix(p.circuit) == "P" and fam == "light":
            warnings.append("%s: a %s on power circuit %s" % (p.name, p.kind, p.circuit))
    for c, cp in circuits.items():
        pre = prefix(c)
        lim = CIRCUITS.get(pre, (None,) * 5)[4]
        count = len(cp)
        if lim and count > lim:
            warnings.append("%s: %d accessories, more than the usual %d for a %s circuit" % (c, count, lim, CIRCUITS[pre][0]))
        if pre == "L" and cp and not layer.switches_for(c):
            warnings.append("%s: no switch controls it" % c)
        if pre in CIRCUITS and CIRCUITS[pre][1]:
            amps = sum(p.load for p in cp) / 230.0
            if amps > 0.8 * CIRCUITS[pre][1]:
                warnings.append("%s: %.1f A connected on a %d A MCB" % (c, amps, CIRCUITS[pre][1]))
    if spec is not None:
        floor = room_geometry(spec)[2]
        from shapely.geometry import Point as SP
        for p in pts:
            if not floor.buffer(0.3).contains(SP(p.x, p.z)):
                errors.append("%s at x=%.2f z=%.2f is outside the plan" % (p.name, p.x, p.z))
    for a in layer.open_assumptions():
        errors.append("open: " + a)
    del names
    return errors, warnings


# --------------------------------------------------------------- routes ----

def route(layer):
    """{circuit: [(a, b, role)]}: 3D segments, role riser | run | drop."""
    db = layer.db
    top = np.array([db["x"], layer.route_h, db["z"]])
    out = {}
    for c, cps in layer.circuits().items():
        pts = list(cps)
        if prefix(c) == "L" or prefix(c) == "E":
            pts += [s for s in layer.switches_for(c) if s.controls and s.controls[0] == c]
        if not pts:
            continue
        segs = [(np.array([db["x"], db["y"] + 0.35, db["z"]]), top, "riser")]
        nodes = [top] + [np.array([p.x, layer.route_h, p.z]) for p in pts]
        in_tree, rest = [0], list(range(1, len(nodes)))
        while rest:                     # Prim on the Manhattan metric
            best = None
            for i in in_tree:
                for j in rest:
                    d = abs(nodes[i][0] - nodes[j][0]) + abs(nodes[i][2] - nodes[j][2])
                    if best is None or d < best[0]:
                        best = (d, i, j)
            _, i, j = best
            a, b = nodes[i], nodes[j]
            corner = np.array([b[0], layer.route_h, a[2]])
            if np.linalg.norm(corner - a) > 1e-6:
                segs.append((a, corner, "run"))
            if np.linalg.norm(b - corner) > 1e-6:
                segs.append((corner, b, "run"))
            in_tree.append(j)
            rest.remove(j)
        for p in pts:
            h = p.height(layer.ceiling)
            if layer.route_h - h > 1e-3:
                segs.append((np.array([p.x, layer.route_h, p.z]), np.array([p.x, h, p.z]), "drop"))
        out[c] = segs
    return out


def lengths(routes):
    return {c: sum(float(np.linalg.norm(b - a)) for a, b, _ in segs) for c, segs in routes.items()}


def schedule(layer, routes):
    """[(way, circuit, what, points, load W, MCB, cable, RCCB, length m)] + text."""
    L = lengths(routes)
    rows = []
    for way, (c, cps) in enumerate(layer.circuits().items(), 1):
        pre = prefix(c)
        what, mcb, cable, rccb, _ = CIRCUITS.get(pre, ("?", None, "?", None, 0))
        kinds = {}
        for p in cps:
            kinds[p.kind] = kinds.get(p.kind, 0) + 1
        desc = ", ".join("%d %s" % (n, k) for k, n in kinds.items())
        rows.append(dict(way=way, circuit=c, what=what, points=desc, load=sum(p.load for p in cps),
                         mcb="%d A type B" % mcb if mcb else "-", cable=cable, rccb=rccb or "-",
                         length=round(L.get(c, 0.0) * 1.1, 1)))
    lines = ["DB at x %.2f z %.2f, %.2f m up%s  --  %s  --  supply %s" % (
        layer.db["x"], layer.db["z"], layer.db["y"], (" on " + layer.db["on"]) if layer.db["on"] else "",
        layer.standard, "%s phase %s A" % (layer.supply.get("phases", "?"), layer.supply.get("rating", "?")))]
    lines.append("%-4s %-6s %-28s %-34s %7s %-12s %-26s %-15s %6s" % (
        "way", "circ", "serves", "points", "load W", "MCB", "cable", "RCCB", "len m"))
    for r in rows:
        lines.append("%-4d %-6s %-28s %-34s %7.0f %-12s %-26s %-15s %6.1f" % (
            r["way"], r["circuit"], r["what"][:28], r["points"][:34], r["load"], r["mcb"], r["cable"][:26],
            r["rccb"], r["length"]))
    lines.append(DISCLAIMER)
    return rows, "\n".join(lines)


def circuit_colors(layer):
    return {c: CIRCUIT_COLORS[i % len(CIRCUIT_COLORS)] for i, c in enumerate(layer.circuits())}


# -------------------------------------------------------------- propose ----

def propose(spec, blocks=()):
    """A starting points file from the plan: a downlight grid per indoor zone
    (wall lights on the facade outdoors), sockets along the inner wall faces,
    a socket (or floor box) for each appliance in BLOCKS, emergency lights, an
    exit sign and a data point by the DB, switches by the DB for the main zone
    and at the door into the main zone for the others. A start to edit, not
    a design."""
    from shapely.geometry import Point as SP, box as sbox
    from shapely.ops import nearest_points
    import build_massing as BM
    walls, glass, floor, doors = room_geometry(spec)
    el = spec.get("electrical") or {}
    env = spec["_env"]
    db = el.get("db") or {}
    mount = "surface" if (el.get("route") or {}).get("kind") == "exposed" else "recessed"
    mz = S.ev(spec["mirror_z"], env) if spec.get("mirror_z") is not None else None
    dbx = float(S.ev(db.get("x", 0), env))
    dbz = float(S.ev(db.get("z", 0), env))
    if mz is not None:
        dbz = mz - dbz
    zones = spec.get("zones") or []
    fx0, fz0, fx1, fz1 = floor.bounds
    head = ["# %s -- electrical points. A STARTING layout proposed from the plan by" % spec["name"],
            "# tools/electrical.py --propose: move, add, delete. One point per line:",
            "#   name  kind  x= z= [y=] [circuit=] [controls=L1,L2] [n=] [w=]  | note",
            "# GLB frame (X east, Z south, metres), y = height to the accessory centre",
            "# (default per kind). Circuit prefix: L lighting, P power, AC aircon,",
            "# WH water heater, E emergency, D data."]
    count = {}

    def circuit(pre):
        count[pre] = count.get(pre, 0) + 1
        return "%s%d" % (pre, count[pre])

    def line(name, kind, x, z, extra, note):
        return "%-8s %-10s x=%.2f z=%.2f %s | %s" % (name, kind, x, z, extra + " " if extra else "", note)

    def free(x, z, r=0.12):
        return floor.contains(SP(x, z)) and walls.distance(SP(x, z)) > r

    def wall_face(x, z, reach=0.4, inside=None):
        """(x, z) moved onto the nearest wall face, 0.03 off it into `inside`
        (default: the floor, clear of walls); None if no wall within reach or
        it is glazing."""
        p = SP(x, z)
        if walls.distance(p) > reach or (glass is not None and glass.distance(p) < 0.25):
            return None
        q = nearest_points(walls, p)[0]
        best = None
        for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            c = SP(q.x + dx * 0.03, q.y + dz * 0.03)
            ok = (inside.contains(c) if inside is not None else floor.contains(c)) and walls.distance(c) > 0.02
            if ok and (best is None or c.distance(p) < best.distance(p)):
                best = c
        return (round(best.x, 2), round(best.y, 2)) if best is not None else None

    regions = {}
    for (x0, x1, z0, z1), zi in BM.zone_regions(spec):
        if mz is not None:
            z0, z1 = mz - z1, mz - z0
        r = sbox(max(x0, fx0), max(z0, fz0), min(x1, fx1), min(z1, fz1)).intersection(floor)
        regions[zi] = r if zi not in regions else regions[zi].union(r)
    main = max(regions, key=lambda k: regions[k].area)
    rooms = {zi: r.difference(walls) for zi, r in regions.items()}

    def largest(geom):
        return max(geom.geoms, key=lambda g: g.area) if hasattr(geom, "geoms") else geom

    sections, switches = [], []
    lights_of = {}
    pc = None
    sockets_on_pc = 0
    for zi in sorted(regions):
        slug = zones[zi]["slug"] if zi < len(zones) else "zone%d" % zi
        room = largest(rooms[zi])
        wet = any(w in slug for w in WET)
        outdoor = any(w in slug for w in OUTDOOR)
        out = ["", "# ---- zone %d  %s ----" % (zi + 1, slug)]
        rx0, rz0, rx1, rz1 = room.bounds
        lights = []
        if outdoor:                    # on the facade, inside the zone, every ~2.5 m
            n = max(1, int((rz1 - rz0) / 2.5))
            for k in range(n):
                x, z = rx0 + 0.05, rz0 + (k + 0.5) * (rz1 - rz0) / n
                lights.append(("wall_light", x, z, "y=2.40", "warm outdoor wall light, IP65"))
        else:
            step = 1.6 if wet else 2.0
            nx, nz = max(1, int(round((rx1 - rx0) / step))), max(1, int(round((rz1 - rz0) / step)))
            for i in range(nx):
                for j in range(nz):
                    x, z = rx0 + (i + 0.5) * (rx1 - rx0) / nx, rz0 + (j + 0.5) * (rz1 - rz0) / nz
                    if room.contains(SP(x, z)) and free(x, z, 0.3):
                        lights.append(("downlight", x, z, "", "warm 2700K %s downlight" % mount))
            if wet:
                c = room.centroid
                lights.append(("fan", c.x + 0.35, c.y + 0.35, "", "exhaust fan, ducted out"))
        circs = []
        for g0 in range(0, len(lights), 10):
            c = circuit("L")
            circs.append(c)
            for k, (kind, x, z, extra, note) in enumerate(lights[g0:g0 + 10], 1):
                out.append(line("%s-%d" % (c, k), kind, x, z, (extra + " circuit=" + c).strip(), note))
        lights_of[zi] = (circs, wet, outdoor)
        if not outdoor:
            c = room.centroid
            ex, ez = c.x - 0.45, c.y
            if free(ex, ez):
                out.append(line("EM%d" % (zi + 1), "emergency", ex, ez, "circuit=E1", "maintained emergency luminaire"))
        # sockets along the inner wall faces, ~3 m apart, not at glazing or doorways
        if outdoor:
            c = room.centroid
            w = wall_face(c.x, c.y, reach=20)
            if w:
                pcx = circuit("P")
                out.append(line(pcx + "-1", "socket13a", w[0], w[1], "n=2 circuit=" + pcx, "weatherproof IP66 twin"))
        elif not wet:
            ring = room.exterior
            s = 1.0
            while s < ring.length:
                q = ring.interpolate(s)
                if walls.distance(q) < 0.05:
                    w = wall_face(q.x, q.y, inside=room)
                    if w and room.buffer(0.05).contains(SP(*w)):
                        if pc is None or sockets_on_pc >= 6:
                            pc, sockets_on_pc = circuit("P"), 0
                        sockets_on_pc += 1
                        out.append(line("%s-%d" % (pc, sockets_on_pc), "socket13a", w[0], w[1], "n=2 circuit=" + pc,
                                        "twin"))
                        s += 3.0
                        continue
                s += 0.25
        sections.append(out)
    # switches: the main zone by the DB / entry; the others at their door into the main zone
    sw = ["", "# ---- switches ----"]
    by_db = list(lights_of[main][0])
    k = 0
    for zi, (circs, wet, outdoor) in lights_of.items():
        if zi == main or not circs:
            continue
        spot = None
        for d in doors:
            if d["kind"] != "door":
                continue
            (x0, z0), (x1, z1), (nx, nz) = d["p0"], d["p1"], d["normal"]
            mx, mzz = (x0 + x1) / 2, (z0 + z1) / 2
            a = zone_of(spec, mx + nx * 0.3, mzz + nz * 0.3)
            b = zone_of(spec, mx - nx * 0.3, mzz - nz * 0.3)
            if {a, b} != {zi, main}:
                continue
            side = 1 if a == main else -1            # on the main side: outside a wet room, inside for the outdoors
            t = np.array([x1 - x0, z1 - z0])
            t /= max(np.linalg.norm(t), 1e-6)
            off = 0.03 + d.get("t", 0.1) / 2
            spot = (x1 + t[0] * 0.15 + side * nx * off, z1 + t[1] * 0.15 + side * nz * off, d["wall"])
            break
        if spot is None:
            by_db += circs
            continue
        k += 1
        sw.append(line("S%d" % k, "switch", spot[0], spot[1], "controls=" + ",".join(circs),
                       "by the %s door, %s side" % (spot[2], zones[main]["slug"] if main < len(zones) else "main")))
    for g0 in range(0, len(by_db), 4):
        k += 1
        w = wall_face(dbx + 0.05, dbz + 0.45 + 0.3 * (g0 // 4), reach=0.6) or (dbx + 0.03, dbz + 0.45)
        sw.append(line("S%d" % k, "switch", w[0], w[1], "controls=" + ",".join(by_db[g0:g0 + 4]),
                       "switch bank by the DB / entry"))
    dbl = ["", "# ---- by the DB ----",
           line("X1", "exit", dbx + 0.05, dbz + 1.2, "circuit=E1", "exit sign over the entry"),
           line("D1-1", "data", dbx + 0.03, dbz - 0.25 if dbz > 0.7 else dbz + 0.8, "circuit=D1",
                "data, router by the DB")]
    # appliances in BLOCKS: a worktop socket on the nearest wall, or a floor box under a free-standing piece
    app = re.compile(r"coffee|sewing|machine|kettle|fridge|\btv\b|screen|printer|computer|lamp|iron")
    apps = []
    for b in blocks:
        if not app.search((b.get("prompt") or "").lower()):
            continue
        if apps == [] or len(apps) >= 4:
            ac = circuit("P")
        apps.append(b)
        w = wall_face(b["x"], b["z"], reach=0.5 + max(b["w"], b["d"]) / 2)
        if w:
            y = b.get("h", 0.0) + 0.15 if b.get("h", 0.0) > 0.6 else 0.30
            dbl.append(line("%s-%d" % (ac, len(apps)), "socket13a", w[0], w[1], "y=%.2f n=2 circuit=%s" % (y, ac),
                            "for %s" % b["name"]))
        else:
            dbl.append(line("%s-%d" % (ac, len(apps)), "floor_box", b["x"], b["z"], "circuit=" + ac,
                            "floor box under %s" % b["name"]))
    for k2, a in enumerate(el.get("aircon") or [], 1):
        x, z = float(S.ev(a["x"], env)), float(S.ev(a["z"], env))
        dbl.append(line("AC%d" % k2, "isolator", x, mz - z if mz is not None else z,
                        "y=%.2f circuit=AC%d" % (float(S.ev(a.get("y", 2.2), env)), k2),
                        a.get("note", "aircon indoor unit")))
    body = [ln for s in sections for ln in s] + sw + dbl
    return "\n".join(head + body) + "\n"


# ------------------------------------------------------------- 3D parts ----

def _paint(m, rgb):
    import trimesh
    m.visual = trimesh.visual.ColorVisuals(m)
    m.visual.face_colors = np.tile(np.array(list(rgb) + [255], np.uint8), (len(m.faces), 1))
    return m


def wiring_parts(layer, routes, radius=0.02):
    """[(name, mesh)]: circuit-coloured runs and markers for every point, GLB frame."""
    import trimesh
    cols = circuit_colors(layer)
    parts = []
    for c, segs in routes.items():
        for k, (a, b, role) in enumerate(segs):
            if np.linalg.norm(b - a) < 1e-3:
                continue
            cyl = trimesh.creation.cylinder(radius=radius * (1.4 if role == "riser" else 1.0), segment=[a, b],
                                            sections=8)
            parts.append(("elec_%s_%s%d" % (c, role, k), _paint(cyl, cols[c])))
    for p in layer.points:
        h = p.height(layer.ceiling)
        col = cols.get(p.circuit or (p.controls[0] if p.controls else ""), (90, 90, 90))
        if p.family == "light":
            m = trimesh.creation.cylinder(radius=0.09, height=0.03, sections=16)
            m.apply_translation([p.x, h - 0.015, p.z])
        else:
            m = trimesh.creation.box(extents=[0.14 if p.n > 1 else 0.09, 0.09, 0.14 if p.n > 1 else 0.09])
            m.apply_translation([p.x, h, p.z])
        parts.append(("elec_pt_" + p.name, _paint(m, col)))
    db = layer.db
    m = trimesh.creation.box(extents=[0.14, 0.7, 0.5])
    m.apply_translation([db["x"] + 0.07, db["y"], db["z"]])
    parts.append(("elec_DB", _paint(m, (40, 40, 40))))
    return parts


def light_parts(layer, radius=0.2):
    """Light-ID discs (one colour each, blocks-style JSON rows) for the
    fixture glow: [(name, mesh)], [row]."""
    import trimesh
    sys.path.insert(0, os.path.join(os.path.dirname(HERE), "comfy_nodes", "mp_blocking"))
    import blocks as BL
    lights = [p for p in layer.points if p.family == "light"]
    cols = BL.id_colors(len(lights))
    parts, rows = [], []
    for p, col in zip(lights, cols):
        h = p.height(layer.ceiling)
        m = trimesh.creation.cylinder(radius=radius, height=0.02, sections=24)
        if p.kind in ("wall_light", "exit"):
            m = trimesh.creation.box(extents=[0.25, 0.25, 0.25])
        m.apply_translation([p.x, h - 0.02, p.z])
        parts.append(("light_" + p.name, _paint(m, BL.to_linear(col))))
        default = {"downlight": "a warm 2700K %s downlight, glowing softly" % layer.mount, "fan": "a white exhaust grille",
                   "emergency": "a small white emergency light", "exit": "a green exit sign"}.get(
            p.kind, "a warm glowing %s" % KINDS[p.kind][3])
        rows.append(dict(name=p.name, x=p.x, z=p.z, w=2 * radius, d=2 * radius, h=0.02, y=h,
                         color=list(col), prompt=p.note if p.note and p.family == "light" and len(p.note) > 12 else default))
    return parts, rows


# ------------------------------------------------------------- 2D views ----

def project(cam, pts, W, H):
    """GLB points (N, 3) -> pixels (N, 2) and depth along the view, as RenderMesh."""
    eye, f, r, u, fov = cam
    d = np.asarray(pts, float) - eye
    zf = d @ f
    tn = math.tan(0.5 * fov)
    with np.errstate(divide="ignore", invalid="ignore"):
        xn = (d @ r) / (zf * tn * W / H)
        yn = (d @ u) / (zf * tn)
    return np.stack([(xn + 1) * 0.5 * W, (1 - yn) * 0.5 * H], 1), zf


def overlay_render(img, cam, layer, routes, label=True, xf=None):
    """The wiring drawn over a render (H, W, 3 float 0..1) -> same shape.
    xf: a model transform (N, 3) -> (N, 3) when the camera came from a viewer."""
    import cv2
    xf = xf or (lambda v: np.asarray(v, float))
    H, W = img.shape[:2]
    out = (np.clip(img[..., :3], 0, 1) * 255).astype(np.uint8)[..., ::-1].copy()
    base = out.copy()
    cols = circuit_colors(layer)
    for c, segs in routes.items():
        col = cols[c][::-1]
        for a, b, role in segs:
            n = max(2, int(np.linalg.norm(b - a) / 0.05))
            line = xf(np.linspace(a, b, n))
            px, z = project(cam, line, W, H)
            ok = z > 0.05
            for k in range(n - 1):
                if ok[k] and ok[k + 1]:
                    cv2.line(out, tuple(np.round(px[k]).astype(int)), tuple(np.round(px[k + 1]).astype(int)),
                             col, 3 if role != "drop" else 2, cv2.LINE_AA)
    out = cv2.addWeighted(out, 0.85, base, 0.15, 0)
    for p in layer.points:
        q, z = project(cam, xf([[p.x, p.height(layer.ceiling), p.z]]), W, H)
        if z[0] <= 0.05:
            continue
        u, v = np.round(q[0]).astype(int)
        if not (0 <= u < W and 0 <= v < H):
            continue
        col = cols.get(p.circuit or (p.controls[0] if p.controls else ""), (90, 90, 90))[::-1]
        cv2.circle(out, (u, v), 9, (255, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(out, (u, v), 9, col, 3, cv2.LINE_AA)
        if label:
            t = "%s %s" % (p.name, p.circuit or "")
            cv2.putText(out, t, (u + 12, v - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 3, cv2.LINE_AA)
            cv2.putText(out, t, (u + 12, v - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (20, 20, 20), 1, cv2.LINE_AA)
    db = layer.db
    q, z = project(cam, xf([[db["x"], db["y"], db["z"]]]), W, H)
    if z[0] > 0.05:
        u, v = np.round(q[0]).astype(int)
        cv2.rectangle(out, (u - 14, v - 20), (u + 14, v + 20), (30, 30, 30), -1)
        cv2.putText(out, "DB", (u - 11, v + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return out[..., ::-1].astype(np.float32) / 255.0


def plan_overlay(spec, layer, routes, path):
    """The points and runs laid over the source floor plan (the planning
    step: check them against the drawing before anything else)."""
    import cv2
    import plan_check as PC
    im, _ = PC.load_drawing(spec)
    cal, _ = PC.calibration(spec)
    base = cv2.cvtColor(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    out = cv2.addWeighted(base, 0.6, np.full_like(base, 255), 0.4, 0)
    cols = circuit_colors(layer)

    def px(x, z):
        az = layer.mirror - z if layer.mirror is not None else z
        return tuple(np.round(PC.to_px(cal, [(x, az)])[0]).astype(int))
    for c, segs in routes.items():
        for a, b, role in segs:
            if role == "run":
                cv2.line(out, px(a[0], a[2]), px(b[0], b[2]), cols[c][::-1], 2, cv2.LINE_AA)
    for p in layer.points:
        u, v = px(p.x, p.z)
        col = cols.get(p.circuit or (p.controls[0] if p.controls else ""), (90, 90, 90))[::-1]
        if p.family == "light":
            cv2.circle(out, (u, v), 7, col, 2, cv2.LINE_AA)
            cv2.line(out, (u - 5, v - 5), (u + 5, v + 5), col, 1, cv2.LINE_AA)
            cv2.line(out, (u - 5, v + 5), (u + 5, v - 5), col, 1, cv2.LINE_AA)
        elif p.kind == "switch":
            cv2.circle(out, (u, v), 4, col, -1, cv2.LINE_AA)
            cv2.line(out, (u, v), (u + 9, v - 9), col, 2, cv2.LINE_AA)
        else:
            cv2.rectangle(out, (u - 6, v - 4), (u + 6, v + 4), col, -1)
        cv2.putText(out, p.name, (u + 8, v + 12), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (40, 40, 40), 1, cv2.LINE_AA)
    u, v = px(layer.db["x"], layer.db["z"])
    cv2.rectangle(out, (u - 4, v - 14), (u + 12, v + 14), (20, 20, 20), -1)
    cv2.putText(out, "DB", (u + 14, v + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (20, 20, 20), 1, cv2.LINE_AA)
    cv2.putText(out, "%s -- electrical points on the drawing (design intent, LEW to verify)" % spec["name"],
                (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (20, 20, 20), 1, cv2.LINE_AA)
    cv2.imwrite(path, out)
    return path


# --------------------------------------------------------------- sheets ----

A3 = (420.0, 297.0)                               # mm, landscape


def _symbol(ax, p, col, ceiling):
    """IEC 60617-style plan symbols, sized in metres (drawn at 1:50)."""
    from matplotlib.patches import Circle, Rectangle, Polygon as MP
    x, z = p.x, p.z
    k = p.kind
    if k in ("downlight", "pendant", "cove", "track", "spot", "linear", "wall_light", "fan", "emergency"):
        r = 0.13
        ax.add_patch(Circle((x, z), r, fill=k == "emergency", fc="#ffffff", ec=col, lw=1.0, zorder=5))
        ax.plot([x - r * .7, x + r * .7], [z - r * .7, z + r * .7], color=col, lw=0.8, zorder=6)
        ax.plot([x - r * .7, x + r * .7], [z + r * .7, z - r * .7], color=col, lw=0.8, zorder=6)
        if k == "emergency":
            ax.add_patch(Circle((x, z), r * 0.45, fc=col, ec=col, zorder=7))
        if k == "fan":
            ax.text(x, z - 0.22, "EF", ha="center", va="center", fontsize=4.5, color=col, zorder=7)
        if k == "wall_light":
            ax.plot([x - r, x + r], [z, z], color=col, lw=2.0, zorder=6)
        if k in ("spot", "linear", "cove"):
            ax.text(x, z - 0.22, {"spot": "SP", "linear": "LN", "cove": "LED"}[k], ha="center", va="center",
                    fontsize=4.5, color=col, zorder=7)
    elif k == "exit":
        ax.add_patch(Rectangle((x - 0.18, z - 0.08), 0.36, 0.16, fc="#ffffff", ec=col, lw=1.0, zorder=5))
        ax.text(x, z, "EXIT", ha="center", va="center", fontsize=4, color=col, zorder=6)
    elif k == "switch":
        ax.add_patch(Circle((x, z), 0.05, fc=col, ec=col, zorder=6))
        ax.plot([x, x + 0.18], [z, z - 0.18], color=col, lw=1.0, zorder=6)
        for g in range(max(1, len(p.controls))):
            t = 0.18 - 0.05 * g
            ax.plot([x + t, x + t + 0.06], [z - t, z - t + 0.06], color=col, lw=1.0, zorder=6)
    elif k == "socket13a":
        ax.add_patch(MP([[x - 0.12, z], [x + 0.12, z], [x, z + 0.12]], closed=True, fc="#ffffff", ec=col, lw=1.0,
                        zorder=5))
        ax.plot([x - 0.12, x + 0.12], [z, z], color=col, lw=1.4, zorder=6)
        if p.n > 1:
            ax.text(x, z + 0.05, "2", ha="center", va="center", fontsize=4, color=col, zorder=7)
    elif k in ("fcu", "isolator", "heater"):
        ax.add_patch(Rectangle((x - 0.1, z - 0.1), 0.2, 0.2, fc="#ffffff", ec=col, lw=1.0, zorder=5))
        ax.text(x, z, {"fcu": "F", "isolator": "I", "heater": "WH"}[k], ha="center", va="center", fontsize=4.5,
                color=col, zorder=6)
    elif k == "data":
        ax.add_patch(MP([[x - 0.1, z - 0.06], [x + 0.1, z - 0.06], [x, z + 0.1]], closed=True, fc=col, ec=col,
                        zorder=5))


def _plan_axes(fig, spec, geometry, scale=50.0, title=""):
    walls, glass, floor, _ = geometry
    x0, z0, x1, z1 = floor.bounds
    x0, z0, x1, z1 = x0 - 0.6, z0 - 0.9, x1 + 0.6, z1 + 0.6
    w_mm, h_mm = (x1 - x0) * 1000 / scale, (z1 - z0) * 1000 / scale
    left, top = 15.0, 18.0
    ax = fig.add_axes([left / A3[0], 1 - (top + h_mm) / A3[1], w_mm / A3[0], h_mm / A3[1]])
    ax.set_xlim(x0, x1)
    ax.set_ylim(z1, z0)                           # z south = down the sheet; north up
    ax.set_aspect("equal")
    ax.axis("off")
    from shapely.geometry import MultiPolygon

    def fill(geom, fc, ec, lw, z=1):
        if geom is None or geom.is_empty:
            return
        for p in (geom.geoms if isinstance(geom, MultiPolygon) or hasattr(geom, "geoms") else [geom]):
            if not hasattr(p, "exterior"):
                continue
            xs, zs = p.exterior.xy
            ax.fill(xs, zs, fc=fc, ec=ec, lw=lw, zorder=z)
    fill(floor, "#ffffff", "#cccccc", 0.3, 0)
    fill(walls, "#9a9a9a", "#333333", 0.6, 2)
    fill(glass, "#d8ecf5", "#3c7ea0", 0.5, 2)
    # north arrow + scale bar
    ax.annotate("N", xy=(x1 - 0.3, z0 + 0.15), xytext=(x1 - 0.3, z0 + 0.65), ha="center", fontsize=7,
                arrowprops=dict(arrowstyle="-|>", lw=0.8), annotation_clip=False)
    for k in range(5):
        ax.add_patch(__import__("matplotlib.patches", fromlist=["Rectangle"]).Rectangle(
            (x0 + 0.3 + k, z1 - 0.35), 1.0, 0.08, fc="#333333" if k % 2 == 0 else "#ffffff", ec="#333333", lw=0.4))
    ax.text(x0 + 0.3, z1 - 0.45, "0", fontsize=4.5, ha="center")
    ax.text(x0 + 5.3, z1 - 0.45, "5 m", fontsize=4.5, ha="center")
    fig.text(left / A3[0], 1 - (top - 6) / A3[1], title, fontsize=11, weight="bold", va="bottom")
    return ax


def _dims(ax, xs, zs, z_line, x_line, origin):
    """Running set-out dimensions (mm) along the top and the left, from the origin."""
    for vals, horizontal in ((sorted(set(round(v, 2) for v in xs)), True),
                             (sorted(set(round(v, 2) for v in zs)), False)):
        if not vals:
            continue
        ref = origin[0] if horizontal else origin[1]
        for v in vals:
            if horizontal:
                ax.plot([v, v], [z_line - 0.06, z_line + 0.06], color="#555555", lw=0.4)
                ax.text(v, z_line - 0.1, "%d" % round((v - ref) * 1000), rotation=90, fontsize=3.6, ha="center",
                        va="bottom", color="#555555")
            else:
                ax.plot([x_line - 0.06, x_line + 0.06], [v, v], color="#555555", lw=0.4)
                ax.text(x_line - 0.1, v, "%d" % round((v - ref) * 1000), fontsize=3.6, ha="right", va="center",
                        color="#555555")
        if horizontal:
            ax.plot([ref, vals[-1]], [z_line, z_line], color="#555555", lw=0.4)
        else:
            ax.plot([x_line, x_line], [ref, vals[-1]], color="#555555", lw=0.4)


def _title_block(fig, spec, number, title, layer, scale="1:50"):
    import datetime
    x, y, w, h = 0.59, 0.025, 0.395, 0.17
    ax = fig.add_axes([x, y, w, h])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.add_patch(__import__("matplotlib.patches", fromlist=["Rectangle"]).Rectangle((0, 0), 1, 1, fill=False, lw=0.8))
    for yy in (0.25, 0.5, 0.75):
        ax.plot([0, 1], [yy, yy], color="black", lw=0.4)
    ax.plot([0.7, 0.7], [0.25, 1], color="black", lw=0.4)
    ax.text(0.02, 0.87, "PROJECT", fontsize=4)
    ax.text(0.02, 0.79, "%s  --  electrical installation" % spec["name"], fontsize=7, weight="bold")
    ax.text(0.02, 0.62, "DRAWING", fontsize=4)
    ax.text(0.02, 0.54, title, fontsize=7, weight="bold")
    ax.text(0.02, 0.37, "STANDARD  %s     SUPPLY  %s phase, %s A" % (
        layer.standard, layer.supply.get("phases", "?"), layer.supply.get("rating", "?")), fontsize=4.5)
    ax.text(0.02, 0.29, "DB  x %.2f  z %.2f  %.2f m to centre%s" % (
        layer.db["x"], layer.db["z"], layer.db["y"], ("  on " + layer.db["on"]) if layer.db["on"] else ""),
        fontsize=4.5)
    ax.text(0.72, 0.87, "No.", fontsize=4)
    ax.text(0.72, 0.79, number, fontsize=9, weight="bold")
    ax.text(0.72, 0.62, "SCALE  %s @ A3" % scale, fontsize=4.5)
    ax.text(0.72, 0.54, "DATE  %s" % datetime.date.today().isoformat(), fontsize=4.5)
    ax.text(0.72, 0.37, "REV  A  (proposal)", fontsize=4.5)
    import textwrap
    ax.text(0.02, 0.15, "\n".join(textwrap.wrap(DISCLAIMER, 120)), fontsize=4.3, color="#b00000", va="center",
            weight="bold")


def _legend(fig, layer, items, x=0.015, y=0.2):
    lines = ["LEGEND  (mounting heights to the accessory centre, above finished floor)"]
    heights = {}
    for p in layer.points:
        if p.kind in items:
            heights.setdefault(p.kind, set()).add(round(p.height(layer.ceiling), 2))
    for kind, hs in heights.items():
        # the heights actually set, not the kind's default: a point's y= overrides it
        h = " / ".join("%.2f" % v for v in sorted(hs)) + " m" + (" (see E-04)" if len(hs) > 1 else "")
        if KINDS[kind][1] == "ceil":
            h = "at ceiling " + h
        lines.append("  %-11s %-44s %s" % (kind, KINDS[kind][3].replace("recessed", layer.mount), h))
    lines.append("  runs at %.2f m (%s), drops vertical to each accessory; colour = circuit" % (
        layer.route_h, layer.route_kind.replace("_", " ")))
    lines.append("  set-out dimensions in mm from the outer faces of the west and north walls")
    fig.text(x, y, "\n".join(lines), fontsize=4.6, family="monospace", va="top")


def draw_sheets(spec, layer, routes, out_dir):
    """E-01..E-04 as PNG + one PDF. Returns the paths."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages
    os.makedirs(out_dir, exist_ok=True)
    geometry = room_geometry(spec)
    cols = {c: "#%02x%02x%02x" % rgb for c, rgb in circuit_colors(layer).items()}
    rows, _ = schedule(layer, routes)
    base = os.path.join(out_dir, spec["name"])
    paths = []
    pdf = PdfPages(base + "_electrical.pdf")

    def finish(fig, tag):
        p = "%s_%s.png" % (base, tag)
        fig.savefig(p, dpi=200)
        pdf.savefig(fig)
        plt.close(fig)
        paths.append(p)

    def plan_sheet(number, title, families, tag):
        fig = plt.figure(figsize=(A3[0] / 25.4, A3[1] / 25.4))
        ax = _plan_axes(fig, spec, geometry, title="%s  %s" % (number, title))
        pts = [p for p in layer.points if p.family in families or (p.kind == "switch" and "light" in families)]
        for c, segs in routes.items():
            cps = layer.circuits()[c]
            if not any(p.family in families for p in cps):
                continue
            for a, b, role in segs:
                if role == "run":
                    ax.plot([a[0], b[0]], [a[2], b[2]], color=cols[c], lw=0.7, ls="--", zorder=3, alpha=0.8)
        for p in pts:
            col = cols.get(p.circuit or (p.controls[0] if p.controls else ""), "#555555")
            _symbol(ax, p, col, layer.ceiling)
            tag_ = p.circuit if p.circuit else "/".join(p.controls)
            ax.text(p.x + 0.16, p.z + 0.2, "%s %s" % (p.name, tag_), fontsize=3.4, color=col, zorder=8)
            if p.kind == "switch":
                for c in p.controls:
                    lights = [q for q in layer.circuits().get(c, []) if q.family == "light"]
                    if lights:
                        q = min(lights, key=lambda q: (q.x - p.x) ** 2 + (q.z - p.z) ** 2)
                        ax.annotate("", xy=(q.x, q.z), xytext=(p.x, p.z),
                                    arrowprops=dict(arrowstyle="-", ls=":", lw=0.6, color=cols.get(c, "#555"),
                                                    connectionstyle="arc3,rad=0.25"), zorder=4)
        db = layer.db
        from matplotlib.patches import Rectangle
        ax.add_patch(Rectangle((db["x"], db["z"] - 0.25), 0.14, 0.5, fc="#222222", zorder=9))
        ax.text(db["x"] + 0.2, db["z"], "DB", fontsize=6, weight="bold", va="center", zorder=9)
        x0, z0 = geometry[2].bounds[0], geometry[2].bounds[1]
        _dims(ax, [p.x for p in pts], [p.z for p in pts], z0 - 0.45, x0 - 0.35, (0.0, 0.0))
        _legend(fig, layer, {p.kind for p in pts})
        circ_lines = ["CIRCUITS"] + ["  %-5s %s" % (r["circuit"], r["what"]) for r in rows
                                     if any(p.family in families for p in layer.circuits()[r["circuit"]])]
        fig.text(0.36, 0.2, "\n".join(circ_lines), fontsize=4.6, family="monospace", va="top")
        _title_block(fig, spec, number, title, layer)
        finish(fig, tag)

    plan_sheet("E-01", "LIGHTING LAYOUT", {"light"}, "E-01_lighting")
    plan_sheet("E-02", "POWER + DATA LAYOUT", {"power", "data"}, "E-02_power")

    # E-03: DB schedule + single-line diagram
    fig = plt.figure(figsize=(A3[0] / 25.4, A3[1] / 25.4))
    fig.text(15 / A3[0], 1 - 12 / A3[1], "E-03  DB SCHEDULE + SINGLE-LINE DIAGRAM", fontsize=11, weight="bold")
    ax = fig.add_axes([0.04, 0.42, 0.92, 0.48])
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 60)
    ax.axis("off")
    groups = {}
    for r in rows:
        if r["mcb"] != "-":                       # data is not a DB way
            groups.setdefault(r["rccb"], []).append(r)
    ax.plot([5, 5], [55, 45], color="black", lw=1.2)
    ax.text(6, 54, "INCOMING SUPPLY  %s phase  %s A" % (layer.supply.get("phases", "?"), layer.supply.get("rating", "?")),
            fontsize=6)
    ax.text(6, 49, "MAIN ISOLATOR  %s A DP" % layer.supply.get("rating", 63), fontsize=6)
    ax.plot([4, 6], [48, 50], color="black", lw=1.2)
    ax.plot([5, 5 + 90], [45, 45], color="black", lw=1.2)
    gx = 8
    span = 88.0 / max(1, sum(len(v) for v in groups.values()))
    for rccb, rs in groups.items():
        x0 = gx
        x1 = gx + span * len(rs)
        if rccb != "-":
            ax.plot([(x0 + x1) / 2, (x0 + x1) / 2], [45, 40], color="black", lw=1.0)
            ax.add_patch(__import__("matplotlib.patches", fromlist=["Rectangle"]).Rectangle(
                ((x0 + x1) / 2 - 3, 36), 6, 4, fill=False, lw=0.8))
            ax.text((x0 + x1) / 2, 38, rccb.replace("  ", "\n"), fontsize=4.5, ha="center", va="center")
            ax.plot([x0 + span / 2, x1 - span / 2], [36, 36], color="black", lw=1.0)
            bus = 36
        else:
            bus = 45
        for k, r in enumerate(rs):
            cx = x0 + span * (k + 0.5)
            ax.plot([cx, cx], [bus, 22], color=cols.get(r["circuit"], "black"), lw=1.0)
            ax.plot([cx - 0.8, cx + 0.8], [27, 29], color="black", lw=1.0)
            ax.text(cx, 31, r["mcb"].replace(" type ", "\n"), fontsize=4, ha="center")
            ax.text(cx, 20, "%s\n%s\n%.0f W\n%.0f m" % (r["circuit"], r["what"].split(",")[0][:16], r["load"],
                                                        r["length"]), fontsize=4, ha="center", va="top")
        gx = x1
    tab = fig.add_axes([0.04, 0.2, 0.92, 0.2])
    tab.axis("off")
    cell = [[r["way"], r["circuit"], r["what"], r["points"], "%.0f" % r["load"], r["mcb"], r["cable"], r["rccb"],
             "%.1f" % r["length"]] for r in rows]
    t = tab.table(cellText=cell, colLabels=["way", "circuit", "serves", "points", "load W", "MCB", "cable", "RCCB",
                                            "length m"], loc="upper center", cellLoc="left")
    t.auto_set_font_size(False)
    t.set_fontsize(4.8)
    t.scale(1, 0.9)
    _title_block(fig, spec, "E-03", "DB SCHEDULE + SINGLE-LINE DIAGRAM", layer, scale="NTS")
    finish(fig, "E-03_db")

    # E-04: point schedule
    fig = plt.figure(figsize=(A3[0] / 25.4, A3[1] / 25.4))
    fig.text(15 / A3[0], 1 - 12 / A3[1], "E-04  POINT SCHEDULE", fontsize=11, weight="bold")
    tab = fig.add_axes([0.04, 0.22, 0.92, 0.7])
    tab.axis("off")
    cell = [[p.name, p.kind, p.circuit or "/".join(p.controls), "%d" % round(p.x * 1000), "%d" % round(p.z * 1000),
             "%d" % round(p.height(layer.ceiling) * 1000), "%.0f" % p.load, p.note[:60]] for p in layer.points]
    t = tab.table(cellText=cell or [[""] * 8], colLabels=["point", "kind", "circuit", "x mm", "z mm", "height mm",
                                                          "load W", "note"], loc="upper center", cellLoc="left")
    t.auto_set_font_size(False)
    t.set_fontsize(4.2)
    t.scale(1, 0.75)
    _title_block(fig, spec, "E-04", "POINT SCHEDULE", layer, scale="NTS")
    finish(fig, "E-04_points")
    pdf.close()
    paths.append(base + "_electrical.pdf")
    return paths


# ------------------------------------------------------------------ cli ----

def main():
    ap = argparse.ArgumentParser(description="the electrical layer of a plan spec")
    ap.add_argument("spec")
    ap.add_argument("--propose", action="store_true", help="write a starting points file (not over an existing one)")
    ap.add_argument("--force", action="store_true", help="with --propose: overwrite the points file")
    ap.add_argument("--no-sheets", action="store_true")
    a = ap.parse_args()
    spec = S.load(a.spec)
    el = spec.get("electrical")
    if not el:
        print("no electrical: block in %s -- add one (the DB first)" % a.spec)
        sys.exit(1)
    if a.propose:
        pf = S.resolve_path(spec, el["points"]) if el.get("points") else os.path.join(
            spec["_dir"], spec["name"] + ".electrical.txt")
        if os.path.exists(pf) and not a.force:
            print("exists: %s (--force to overwrite)" % pf)
            sys.exit(1)
        blocks = []
        if spec.get("blocks"):
            sys.path.insert(0, os.path.join(os.path.dirname(HERE), "comfy_nodes", "mp_blocking"))
            import blocks as BL
            bf = S.resolve_path(spec, spec["blocks"])
            if os.path.exists(bf):
                blocks = [b.as_dict() for b in BL.parse(open(bf, encoding="utf-8").read())]
        with open(pf, "w", encoding="utf-8", newline="\n") as f:
            f.write(propose(spec, blocks))
        print("wrote:   %s" % pf)
    layer = Layer(spec)
    routes = route(layer)
    errors, warnings = check(layer, spec)
    _, text = schedule(layer, routes)
    print(text)
    for w in warnings:
        print("warning: %s" % w)
    for e in errors:
        print("ERROR:   %s" % e)
    out = spec.get("output") or {}
    out_dir = S.resolve_path(spec, out.get("dir", "../model"))
    base = out.get("base", spec["name"])
    if spec.get("source"):
        print("plan:    %s" % plan_overlay(spec, layer, routes, os.path.join(out_dir, base + "_electrical_plan.png")))
    if not a.no_sheets:
        for p in draw_sheets(spec, layer, routes, os.path.join(os.path.dirname(HERE), "renders", "electrical")):
            print("sheet:   %s" % p)
    print("RESULT:  %s" % ("PASS" if not errors else "FAIL -- %d to settle" % len(errors)))
    sys.exit(0 if not errors else 1)


if __name__ == "__main__":
    main()
