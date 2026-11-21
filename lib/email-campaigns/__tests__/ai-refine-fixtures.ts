import type { RewritableBlock } from "@/lib/email-campaigns/ai-refine-brief";
import type { RefineRequest } from "@/lib/email-campaigns/ai-refine-shape";
import type { RefineBrief } from "@/lib/email-campaigns/ai-refine";

export const FITTING_URL = "https://mpillow.com/book?from=email";

type Kind<K extends RefineRequest["kind"]> = Extract<RefineRequest, { kind: K }>;

export const LINKED_TEXT: Extract<RewritableBlock, { type: "text" }> = {
  id: "t1",
  type: "text",
  paragraphs: [
    { kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: ", warm nights are back, and so is the FibreCool cover. It keeps your pillow cool in every size." }] },
    { kind: "p", runs: [{ text: "Not sure of your fit? " }, { text: "Book a fitting", href: FITTING_URL, bold: true }, { text: " and we'll tune it to how you sleep." }] },
  ],
};

export const TITLE: Extract<RewritableBlock, { type: "heading" }> = { id: "h1", type: "heading", level: 1, text: "{first_name}, sleep cooler this December" };

const EMAIL_WORDS = ["Sleep cooler this December", "Warm nights are back, and so is the FibreCool cover. It keeps your pillow cool in every size.", "Shop the covers"];

export const SUBJECTS: Kind<"subjects"> = {
  kind: "subjects",
  campaignId: null,
  subject: "Sleep cooler this December",
  preheader: "",
  name: "December cooling launch",
  words: EMAIL_WORDS,
  exclude: [],
};

export const PREVIEW_LINES: Kind<"preview_lines"> = { ...SUBJECTS, kind: "preview_lines" };

export const REWRITE: Kind<"rewrite"> = {
  kind: "rewrite",
  campaignId: null,
  subject: "Sleep cooler this December",
  name: "December cooling launch",
  block: LINKED_TEXT,
  action: "shorter",
  instruction: "",
  exclude: [],
};

export const brief = (request: RefineRequest, pointsLive = false): RefineBrief => ({ request, pointsLive });

export const subjectsAnswer = (subjects: string[]) => JSON.stringify({ subjects });
export const previewAnswer = (previewLines: string[]) => JSON.stringify({ previewLines });

export const FIVE_SUBJECTS = [
  "Sleep cooler this December, {first_name}",
  "The FibreCool cover is back",
  "Warm nights, cool pillow",
  "Your pillow, cooler in every size",
  "A cooler night's sleep starts with the cover your pillow has been waiting for all year long",
];

export const SHORTER_TEXT = {
  paragraphs: [
    { kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: ", the FibreCool cover is back in every size." }] },
    { kind: "p", runs: [{ text: "Book a fitting", link: "L1", bold: true }, { text: " to get your fit right." }] },
  ],
};
