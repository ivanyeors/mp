import { z } from "zod";

const partSchema = z.object({
  name: z.string(),
  item: z.string(),
  role: z.string(),
  glass: z.boolean(),
  cut: z.boolean(),
  rgb: z.tuple([z.number(), z.number(), z.number()]).optional(),
  zone: z.number().int().nonnegative().optional(),
  position: z.array(z.number()),
  index: z.array(z.number().int().nonnegative()),
});

export const viewerModelSchema = z.object({
  name: z.string(),
  zones: z.array(z.string()),
  parts: z.array(partSchema),
  zonePieces: z.array(partSchema),
});

export type ViewerPart = z.infer<typeof partSchema>;
export type ViewerModel = z.infer<typeof viewerModelSchema>;

export type Vec3 = [number, number, number];

export type ShowroomDim = { a: Vec3; b: Vec3; slash: Vec3; text: string };

export type ShowroomUnit = {
  slug: string;
  title: string;
  subtitle: string;
  model: ViewerModel;
  home: { dir: Vec3; target: Vec3; halfW: number; halfH: number; fov: number };
  figures: { label: string; value: string }[];
  dims: ShowroomDim[];
  extensions: [Vec3, Vec3][];
  tags: { text: string; at: Vec3 }[];
  zoneNames: string[];
  legend: { label: string; item: string }[];
  cutaway: { label: string; hint: string };
  partNames: Record<string, string>;
  pieceNames: Record<string, string>;
  partNotes: Record<string, string>;
  notes: string[];
};
