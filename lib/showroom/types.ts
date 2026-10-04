import { z } from "zod";

/**
 * A massing model as `mpillow-office/tools/build_massing.py` writes it to
 * `model/<base>_viewer.json`: the same parts as the GLBs, as plain triangle
 * lists, with what each part is.
 *
 * Axes: X east, Y up, Z south, metres; the floor top is y = 0.
 */
const partSchema = z.object({
  /** Mesh name, e.g. `gd2_glass0`. */
  name: z.string(),
  /** The spec item it was built from, e.g. `gd2`. */
  item: z.string(),
  /** `box` / `prism` for a whole item; `wall` / `head` / `sill` / `glass` for a wall's pieces. */
  role: z.string(),
  glass: z.boolean(),
  /** Part of the spec's `cutaway` set (the walls a camera from that side lifts off). */
  cut: z.boolean(),
  /** sRGB 0-255, as painted in the GLB. Absent on zone pieces. */
  rgb: z.tuple([z.number(), z.number(), z.number()]).optional(),
  /** Zone index into `zones`. Present on zone pieces only. */
  zone: z.number().int().nonnegative().optional(),
  position: z.array(z.number()),
  index: z.array(z.number().int().nonnegative()),
});

export const viewerModelSchema = z.object({
  name: z.string(),
  zones: z.array(z.string()),
  parts: z.array(partSchema),
  /** Every part cut along the zone regions (the ID model). */
  zonePieces: z.array(partSchema),
});

export type ViewerPart = z.infer<typeof partSchema>;
export type ViewerModel = z.infer<typeof viewerModelSchema>;

export type Vec3 = [number, number, number];

/** A dimension chain drawn on the ground: a line a→b, slashes at both ends, `text` at the middle. */
export type ShowroomDim = { a: Vec3; b: Vec3; slash: Vec3; text: string };

export type ShowroomUnit = {
  slug: string;
  title: string;
  subtitle: string;
  model: ViewerModel;
  /** The camera "Reset view" returns to: looking along `dir` at `target`, framed to fit halfW × halfH metres. */
  home: { dir: Vec3; target: Vec3; halfW: number; halfH: number; fov: number };
  /** Key measurements shown beside the model. */
  figures: { label: string; value: string }[];
  dims: ShowroomDim[];
  /** Extension lines from the model out to the dimension chains. */
  extensions: [Vec3, Vec3][];
  /** Room and opening names floated in the scene. */
  tags: { text: string; at: Vec3 }[];
  zoneNames: string[];
  /** The material key: a label and an item painted in that colour. */
  legend: { label: string; item: string }[];
  cutaway: { label: string; hint: string };
  /** Plain names by spec item, and by `item:role` for one piece of a wall. */
  partNames: Record<string, string>;
  pieceNames: Record<string, string>;
  /** Where a part's size came from, when it isn't plain off the drawing. */
  partNotes: Record<string, string>;
  notes: string[];
};
