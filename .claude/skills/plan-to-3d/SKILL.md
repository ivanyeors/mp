---
name: plan-to-3d
description: Turn a floor plan (PDF or image) into an accurate, dimensioned 3D massing model (GLB + zone ID twin) for the mpillow-office render pipeline. Checks the machine first (Python packages, poppler) and helps install what is missing, asks what kind of plan it is (HDB flats start from a preset of known answers), reads the drawing into a plan spec, verifies it against the drawing with plan_check, and grills the user on every value the drawing does not settle before building. Use when the user gives a new floor plan, says "plan to 3D", "make a GLB from this plan", "new floor plan", or asks to update an existing plan spec.
---

# plan-to-3d

A floor plan becomes geometry by **reading numbers, not pixels**. You read the
drawing into a spec, a script checks the spec against the drawing, and the user
settles every value the drawing cannot. Only then is the model built.

Everything lives in `mpillow-office/`. Run commands from there.

| File | Role |
| --- | --- |
| `tools/plan_env.py` | is this machine ready? Python packages, a test build, poppler; prints install commands |
| `requirements.txt` | the Python packages the tools need |
| `plans/presets/<kind>.yaml` | answers that hold for a kind of plan (`hdb.yaml`), offered as one question |
| `plans/<slug>.yaml` | the spec: every wall, opening, zone and height, in metres |
| `plans/sources/` | the source drawing, copied in |
| `tools/plan_read.py` | measuring instruments (render, lines, ticks, solids, scan, grid) |
| `tools/plan_check.py` | the gate: dims add up, walls on drawn lines, no structure missed, no open assumptions |
| `tools/build_massing.py` | spec -> `model/<base>.glb`, `_cut`, `_ids`, `_cut_ids` |
| `tools/electrical.py` | the electrical layer: DB + points file -> check, routes, DB schedule, plan overlay, E-01..E-04 sheets |
| `plans/<slug>.electrical.txt` | the electrical points, one per line (written by `--propose`, then edited) |

Read the docstring at the top of `tools/build_massing.py` for the spec format
before writing one. `plans/hdb-4rm-1bh.yaml` is a worked example from a PDF;
`plans/showroom.yaml` shows loops, groups and furniture.

## Rules

- **Never guess silently.** A value is either read off the drawing (a
  dimension, or measured between drawn lines with `scan`) or it is an
  assumption with `status: open`. Heights are never on a plan: ceiling, door
  head, window sill / head and parapet are always assumptions. A preset does
  not change that: its values count once the user accepts them.
- **The drawing's own numbers win over measuring.** When a dimension chain
  says 3150, use 3.150, and use the scan only to locate things the chain
  doesn't cover.
- **The check is the bar, not your opinion.** Do not report a model as done
  until `plan_check` prints `RESULT: PASS` and you have looked at the overlay.

## Workflow

### 0. Check the machine

```bash
python tools/plan_env.py
```

`RESULT: READY` means go on. Otherwise it lists what is missing and prints
the commands that install it. Don't run them unasked. Ask with
AskUserQuestion ("Install them now? (Recommended)" / "I'll install them
myself"), say what each command does, run them, and re-run the check until
it prints READY.

- **Python packages:** run the printed `pip install` line. It names the
  interpreter the check ran on, so the packages land where the tools run.
- **Poppler** (reads PDFs): `winget install ...` on Windows and
  `brew install poppler` on macOS run unattended. On Linux it needs sudo, so
  ask the user to run it themselves: `! sudo apt-get install -y poppler-utils`.
  A poppler installed this minute is found without restarting the terminal.
- **No Python, or older than 3.10:** install Python first (Windows
  `winget install -e --id Python.Python.3.12`, macOS
  `brew install python@3.12`). On macOS and Linux the command may be
  `python3`; use it everywhere below.

### 1. Intake

Copy the drawing to `plans/sources/<slug>.<ext>` and start
`plans/<slug>.yaml` with `name`, `output: {dir: ../model, base: <slug_underscored>}`
and `source:` (`{pdf, page, dpi: 300}` or `{image}`). Rasterise and look at it:

```bash
python tools/plan_read.py render plans/sources/<slug>.pdf --dpi 300 --out plans/.cache/<slug>.png
```

Read the image. Note the room names, which walls are solid black
(structural), which are double lines (non-structural), the windows (triple
lines), the doors (swing arcs), dashed elements, and every dimension chain.

**Ask what kind of plan it is** (AskUserQuestion, one question): HDB flat;
condo / private apartment; landed house; commercial, showroom or other. Put
the kind the drawing suggests first, marked "(Recommended)". An HDB plan
names an HDB flat type ("4-ROOM TYPE 1B(H)") and often has HDB in the PDF
title (`pdfinfo <pdf>`). Its room set (HOUSEHOLD SHELTER, SERVICE YARD,
A/C LEDGE) is only a hint, because condos have those rooms too.

- **HDB flat:** start the spec from `plans/presets/hdb.yaml`. Copy its
  `vars`, `palette`, `zones` and `assumptions`, and leave the assumptions
  open until step 6. Use its `reading` notes while you read the walls.
- **Another kind:** if `plans/presets/<kind>.yaml` exists, do the same with
  it. If not, there's no preset: every height is an open assumption, asked
  one by one in step 6.

### 2. Calibrate from the dimension chains

```bash
python tools/plan_read.py lines plans/.cache/<slug>.png          # rows / cols of long dimension lines
python tools/plan_read.py ticks plans/.cache/<slug>.png --row 358   # tick pixels along one
```

Pick the origin as the first tick of the top and left chains (usually the
outer faces of the walls). Put two ticks far apart into `calibrate:`
(`{px: [u, v], at: [x, z]}`), and record **every** chain in `dims:` with
`axis`, `at`, `from` so the check draws its ticks over the drawing's own.
Compare the tick steps in pixels with the written numbers. If they disagree
by more than about 1%, the drawing is not to scale: make that an assumption
and ask.

Axes: X east (image right), Z south (image down), metres, no `mirror_z`.

### 3. Read the walls

```bash
python tools/plan_read.py --spec plans/<slug>.yaml solids           # structural fills as outlines
python tools/plan_read.py --spec plans/<slug>.yaml scan z=2.75 x=6.2   # line faces, metres
python tools/plan_read.py --spec plans/<slug>.yaml grid --out plans/.cache   # metre grid tiles to look at
```

- Solid fills -> `prism` items from the `solids` polygons, snapped to the mm.
- Double lines -> `wall` items, centred between the two faces, `t` = the
  gap between the faces.
- Openings -> `openings:` on the wall, `at` from `p0`. Doors use `door_h`;
  windows `sill_h` / `window_head` unless given their own.
- One `floor` prism along the outline at the outer wall faces. Follow the
  facade, not columns or fins that project past it.
- Furniture only if the user wants it in the renders; the zoned workflow
  works without it.

Look at the grid tiles while you scan: the numbers tell you where a line is,
and the picture tells you what it is.

### 4. Zones

The render pipeline has six zone colours. Propose a grouping of the rooms into
six or fewer zones and write `zones:` and `zone_regions:` (disjoint boxes that
tile the plan, cut along wall centre lines). The grouping is always an open
assumption, because it decides which prompt drives which part of the picture.

### 5. Check, and fix until clean

```bash
python tools/plan_check.py plans/<slug>.yaml --breakdown
```

`--breakdown` scores every element separately: each structural piece and
wall (how much of its outline lies on drawn lines), each window (both jambs,
and whether the drawing has glazing lines across it) and each door (both
jambs, open gap or leaf/threshold drawn). Read it line by line. An
ungated item below 100%, such as the floor, still deserves a look: on the
first HDB plan it caught a floor slab traced along the columns' outer faces
instead of the facade, 0.3 m outside the bedrooms.

Then **look at** `model/<base>_check.png`:
- red = walls in the model, blue outline = other parts, orange + label = a
  wall off the drawing, magenta box = a solid fill on the drawing that no part
  covers, green = the spec's dimension chains drawn as ticks.
- The green ticks must land on the drawing's ticks. If they don't, the
  calibration or a `dims` entry is wrong.
- Fix the spec and re-run until the only failures left are open
  assumptions. A wall can be off the drawing for a legitimate reason (the
  drawing itself is inconsistent). In that case don't move it. Make it an
  assumption and ask.

Also check `model/<base>_zones.png`, which shows the zone regions over the plan.

### 5b. Electrical: the DB first, then the points

Do this once the walls pass, before the grill, so its questions go in the
same session. It follows the order an electrician reads a job: where the
supply comes in, how each point is fed, then the drawings. The docstring of
`tools/electrical.py` has the format.

1. **Find the DB on the drawing.** Look for `DB`, `M` (meter), `MSB`, a
   distribution-board symbol or a meter cabinet, usually by the entrance or
   in a store / service yard. Write `electrical:` in the spec with
   `db: {x, z, y, face, on: <part>}`, `points: <slug>.electrical.txt` and
   `standard: SS 638`.
   **If the drawing doesn't show the DB, stop and ask** (AskUserQuestion)
   before anything else, because every run starts there. Offer the likely
   spots as options, each with its coordinates and the reason: by the main
   entrance, in the store or service yard, beside the meter cabinet. Don't
   propose points until the DB is settled.
2. **Record what the drawing can't say** as `electrical.assumptions`
   (`status: open`): the DB mounting height; the ceiling and cable route
   (false ceiling and its height, or exposed trunking / conduit; take the
   brief's "services above ..." when it gives one); the incoming supply
   (single or three phase, rating); the aircon indoor units (positions, or
   none); a water heater (HDB bathrooms: yes, by default).
3. **Propose a starting layout**, then overlay it on the floor plan:
   ```bash
   python tools/electrical.py plans/<slug>.yaml --propose
   ```
   This writes the points file and prints the DB schedule. It also writes
   `model/<base>_electrical_plan.png` (the points and runs over the source
   drawing) and the sheets in `renders/electrical/`. **Look at the
   overlay**: switches by the doors, sockets on walls (not glazing or
   doorways), lights clear of columns. Edit the points file, re-run without
   `--propose`, and look again. Show the overlay to the user when you grill.
4. **The gate.** `tools/electrical.py` prints `RESULT: PASS` only with no
   errors (a point on no circuit, a switch with nothing to switch, a point
   outside the plan) and no open electrical assumptions. Warnings (a busy
   radial, an overloaded MCB) go to the user as questions, not silent fixes.

Every sheet says the drawings are design intent, to be verified and endorsed
by a Licensed Electrical Worker (LEW). Say the same when you report: they are
for coordination with the electrician, not a certified design.

### 6. Grill the user

Every `status: open` assumption becomes a question, asked with
**AskUserQuestion**:

- **With a preset, ask its defaults first, all in one question.** For
  example: "Use the HDB defaults for this flat? Ceiling 2.60, doors 2.10,
  windows 1.00-2.10, bath windows 1.60-2.10, ledge and yard parapets 1.00
  (open above), zones grouped the HDB way". Options: "Use the HDB defaults
  (Recommended)" / "Change some of them" (then ask about each value they
  name). On yes, set every copied entry to `status: confirmed`,
  `answer: HDB defaults, accepted`. After that, ask only the preset's
  `still_ask` items this drawing raises, plus whatever the check found.
  With the preset, the first HDB plan's nine questions come down to three:
  the defaults, the undrawn main bedroom wall and the kitchen divider.
- Up to 4 questions per call, grouped by topic (heights; walls the drawing
  leaves ambiguous; zones; electrical: the DB, the route, the supply, the
  aircon and heater points).
- Each question names the place (room, wall, coordinates), says what the
  drawing shows, and offers the value you used as the first option
  "(Recommended)" plus the realistic alternatives, each with a one-line
  consequence. The user can always type a measured value. (The user has
  confirmed this style is what they want: concrete location, what the
  drawing shows, a recommended default, real alternatives.)
- A conflict between the drawing's written numbers and its measured lines
  needs no question: the written number wins. Record it as a confirmed
  assumption with that reason.
- For a question about a location, attach the relevant crop of the check
  overlay or grid tile (SendUserFile, or paste its path) so the user sees
  what you mean.
- When an answer raises a new uncertainty (for example "the bedroom has a
  wall there", which leads to "where's its door?"), add that assumption and
  ask again. Keep going until nothing is open. That is the point of the
  session.

Record each answer in the spec. Change the value, then set `status:
confirmed` with `answer: "<what the user said>"` on the assumption, so the
next reader knows where the value came from.

When a kind of plan has no preset yet, offer at the end to save its
confirmed answers as `plans/presets/<kind>.yaml`, written like `hdb.yaml`.
The next plan of that kind then gets one question for them too. When an HDB
answer turns out to hold for HDB flats generally, offer to add it to
`hdb.yaml`.

### 7. Build and report

```bash
python tools/plan_check.py plans/<slug>.yaml     # must print RESULT: PASS
python tools/electrical.py plans/<slug>.yaml     # must print RESULT: PASS (with an electrical block)
python tools/build_massing.py plans/<slug>.yaml
```

Report: the check numbers (walls on line, dims), the overlay picture, the
answers that changed the model, and the GLB paths. With an electrical layer,
also report the DB position, the circuits, and the sheets PDF path. `render_views.py` and the
workflow builders are still wired to the showroom. Say so if the user wants
renders of the new plan.

The build also writes `model/<base>_viewer.json`, which the Admin Panel's
Showroom Model page (`/settings/showroom`) renders in 3D. That page shows the
unit in `lib/showroom/midview-08-83.ts`. To show another plan there, add a unit
file like it (part names, tags, dimension chains, home camera) and point the
page at it. Its test fails if a part name doesn't match the spec.

## When a plan spec already exists

Edit the spec, re-run `plan_check` and grill on anything new. Never delete a
confirmed assumption: change the value and update its `answer`.
