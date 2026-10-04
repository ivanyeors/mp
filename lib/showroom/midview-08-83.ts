import raw from "@/mpillow-office/model/midview_08_83_viewer.json";
import { viewerModelSchema, type ShowroomUnit } from "./types";

/**
 * Midview City Blk 22 #08-83 (Sin Ming Lane), the showroom unit, as a bare
 * shell. The geometry is built from `mpillow-office/plans/midview-08-83.yaml`
 * by `tools/build_massing.py`; everything below only says how to show it.
 * Coordinates are the spec's: X east, Z south, metres from the outer faces of
 * the west and north walls.
 */
export const MIDVIEW_08_83: ShowroomUnit = {
  slug: "midview-08-83",
  title: "Midview #08-83",
  subtitle: "Blk 22 Sin Ming Lane, bare shell",
  model: viewerModelSchema.parse(raw),
  home: { dir: [-0.85, 1.25, 0.9], target: [8.4, 0, 4.6], halfW: 12.6, halfH: 8.6, fov: 34 },
  figures: [
    { label: "West face to GD2 line", value: "13.20 m" },
    { label: "Depth, outer faces", value: "7.90 m" },
    { label: "Floor to soffit", value: "3.40 m" },
    { label: "Patio to parapet face", value: "4.13 m" },
  ],
  dims: [
    { a: [0, 0.002, 8.8], b: [13.2, 0.002, 8.8], slash: [0, 0, 1], text: "13.20" },
    { a: [13.2, 0.002, 8.8], b: [17.328, 0.002, 8.8], slash: [0, 0, 1], text: "4.13" },
    { a: [-0.9, 0.002, 0], b: [-0.9, 0.002, 7.9], slash: [1, 0, 0], text: "7.90" },
    { a: [-0.55, 0, -0.55], b: [-0.55, 3.4, -0.55], slash: [1, 0, 0], text: "3.40" },
  ],
  extensions: [
    [[0, 0.002, 8.05], [0, 0.002, 8.95]],
    [[13.2, 0.002, 8.05], [13.2, 0.002, 8.95]],
    [[17.328, 0.002, 8.05], [17.328, 0.002, 8.95]],
    [[-0.3, 0.002, 0], [-1.05, 0.002, 0]],
    [[-0.3, 0.002, 7.9], [-1.05, 0.002, 7.9]],
    [[0, 3.4, 0], [-0.7, 3.4, -0.7]],
  ],
  tags: [
    { text: "Shop floor", at: [5.6, 0.05, 4.4] },
    { text: "WC", at: [11.95, 3.45, 1.0] },
    { text: "Patio", at: [15.6, 0.05, 4.9] },
    { text: "A/C ledge", at: [13.78, 2.15, 1.05] },
    { text: "FD2", at: [-0.75, 0.05, 2.02] },
    { text: "GD2", at: [13.2, 3.45, 4.0] },
  ],
  zoneNames: ["Shop floor", "WC", "Patio and A/C ledge"],
  legend: [
    { label: "Walls", item: "west_wall" },
    { label: "Columns, RWDP", item: "col_nw" },
    { label: "Floor slab", item: "floor" },
    { label: "Glass", item: "gd2_transom" },
    { label: "Parapets, screens", item: "patio_parapet" },
  ],
  cutaway: {
    label: "Lift off the north wall",
    hint: "Hides the north party wall, its three columns and the DB wall nib.",
  },
  partNames: {
    floor: "Floor slab",
    col_nw: "Column",
    col_sw: "Column",
    col_n_mid: "Column",
    col_s_mid: "Column",
    col_ne: "Column",
    rwdp: "Rainwater downpipe casing",
    meter_cab: "Wall nib with the DB board (M)",
    fd2_head: "Bulkhead over the FD2 entrance",
    fd2_return: "Wall return beside FD2",
    west_wall: "West party wall",
    north_wall: "North party wall",
    south_wall: "South party wall",
    wc_west: "WC west wall",
    wc_south: "WC south wall",
    wc_east: "WC east wall",
    gd2: "GD2 window wall",
    gd2_transom: "Fixed glass over the GD2 door",
    patio_north: "Patio parapet, north",
    patio_south: "Patio parapet, south",
    patio_parapet: "Patio parapet, east",
    ac_south: "A/C ledge screen",
    ac_east: "A/C ledge screen",
  },
  pieceNames: {
    "wc_south:head": "Wall over WC door D2",
    "wc_east:glass": "W3 high window",
    "wc_east:sill": "WC wall below W3",
    "wc_east:head": "WC wall above W3",
    "gd2:sill": "GD2 upstand under the glazing",
    "gd2:glass": "GD2 glazing",
    "gd2:head": "Beam over GD2",
    "gd2:wall": "Solid pier beside the GD2 door",
  },
  partNotes: {
    gd2: "Heights scaled off the site video (frames 300, 900, 960), ±0.1 m.",
    gd2_transom: "Scaled off the site video, ±0.1 m. The door below is 0.91 m wide.",
    meter_cab: "From the site video: a solid nib, with the board surface-mounted.",
    wc_east: "W3 sill 2.10 m, head 2.70 m, as confirmed.",
  },
  notes: [
    "GD2 heights (upstand 0.95, transom 1.95, head 3.00) are scaled off the site video, ±0.1 m.",
    "Not modelled: the ceiling slab, the glass door just inside FD2, fittings and finishes.",
    "Built from mpillow-office/plans/midview-08-83.yaml.",
  ],
};
