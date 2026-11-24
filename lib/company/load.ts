import { unstable_cache } from "next/cache";
import { DriveError } from "@/lib/media-assets/drive";
import { outputSource, type OutputFile } from "./drive";
import { latestReports, outputsOf } from "./overview";
import { parseReport, type Report } from "./report";

export const COMPANY_OUTPUTS_TAG = "company-outputs";

export type Outputs =
  | { state: "ok"; source: "drive" | "local"; files: OutputFile[]; reports: Map<string, Report>; listedAt: string }
  | { state: "unconfigured" }
  | { state: "error"; message: string };

const listFiles = unstable_cache(
  async () => {
    const source = outputSource();
    if (!source) return null;
    return { source: source.kind, files: await source.list(), listedAt: new Date().toISOString() };
  },
  ["company-outputs-list"],
  { revalidate: 120, tags: [COMPANY_OUTPUTS_TAG] },
);

const readFile = unstable_cache(
  async (id: string, mimeType: string, modifiedTime: string) => {
    const source = outputSource();
    if (!source || !modifiedTime) return null;
    return source.read({ id, mimeType });
  },
  ["company-outputs-file"],
  { revalidate: 86_400, tags: [COMPANY_OUTPUTS_TAG] },
);

export async function readOutput(file: OutputFile): Promise<string | null> {
  try {
    return await readFile(file.id, file.mimeType, file.modifiedTime);
  } catch {
    return null;
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof DriveError) return err.message;
  if (err instanceof Error) return err.message;
  return "Google Drive could not be read.";
}

export async function loadOutputs(feedSize = 20): Promise<Outputs> {
  let listed: Awaited<ReturnType<typeof listFiles>>;
  try {
    listed = await listFiles();
  } catch (err) {
    return { state: "error", message: errorMessage(err) };
  }
  if (!listed) return { state: "unconfigured" };

  const outputs = outputsOf(listed.files);
  const wanted = new Map<string, OutputFile>();
  for (const o of latestReports(outputs).values()) wanted.set(o.file.id, o.file);
  for (const o of outputs.filter((x) => x.name.kind !== "draft" && x.name.kind !== "file").slice(0, feedSize)) wanted.set(o.file.id, o.file);

  const reports = new Map<string, Report>();
  await Promise.all(
    [...wanted.values()].map(async (file) => {
      const text = await readOutput(file);
      if (text !== null) reports.set(file.id, parseReport(text));
    }),
  );
  return { state: "ok", source: listed.source, files: listed.files, reports, listedAt: listed.listedAt };
}
