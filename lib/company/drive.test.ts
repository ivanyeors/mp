import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AGENTS_FOLDER_ID, GOOGLE_DOC, childFolder, driveSource, localSource } from "./drive";

const FOLDER = "application/vnd.google-apps.folder";
const file = (id: string, name: string, mimeType: string) => ({ id, name, mimeType, modifiedTime: "2026-11-24T00:00:00.000Z", webViewLink: `https://drive.google.com/${id}` });

const authHeaders: string[] = [];

function fakeDrive(tree: Record<string, ReturnType<typeof file>[]>, bodies: Record<string, string>) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    authHeaders.push(JSON.stringify(init?.headers ?? {}));
    const u = new URL(String(url));
    const q = u.searchParams.get("q");
    if (q) {
      const parent = /'([^']+)' in parents/.exec(q)![1];
      return new Response(JSON.stringify({ files: tree[parent] ?? [] }), { status: 200 });
    }
    const key = `${u.pathname}${u.search}`;
    const body = Object.entries(bodies).find(([k]) => key.includes(k))?.[1];
    return body === undefined ? new Response('{"error":{"message":"File not found: x."}}', { status: 404 }) : new Response(body, { status: 200 });
  });
}

describe("childFolder", () => {
  it("walks only year, month, trackers and company folders", () => {
    expect(childFolder("", "2026")).toBe("2026");
    expect(childFolder("", "_trackers")).toBe("_trackers");
    expect(childFolder("", "_company")).toBe("_company");
    expect(childFolder("", "Old stuff")).toBeNull();
    expect(childFolder("2026", "2026-11")).toBe("2026/2026-11");
    expect(childFolder("2026", "2027-01")).toBeNull();
    expect(childFolder("2026", "misc")).toBeNull();
    expect(childFolder("_company", "agents")).toBe("_company/agents");
    expect(childFolder("2026/2026-11", "nested")).toBeNull();
  });
});

describe("driveSource", () => {
  const tree = {
    [AGENTS_FOLDER_ID]: [file("y2026", "2026", FOLDER), file("trk", "_trackers", FOLDER), file("old", "Old stuff", FOLDER), file("manual", "00 Agent Manual", GOOGLE_DOC)],
    y2026: [file("m11", "2026-11", FOLDER), file("misc", "misc", FOLDER)],
    m11: [file("rep1", "2026-11-24_crm_weekly.md", "text/markdown"), file("doc1", "2026-11-18_sec-code_weekly", GOOGLE_DOC)],
    trk: [file("csv1", "bd_pipeline.csv", "text/csv")],
    old: [file("nope", "should-not-list.md", "text/markdown")],
  };
  const bodies = {
    "/files/doc1/export?mimeType=text%2Fmarkdown": "\\# Title\n\nStatus: OK\n\n| a | b |\n\n| 1 | 2 |\n",
    "/files/rep1?alt=media": "# CRM\n",
  };

  it("lists the files under the walked folders, with the folder each sits in", async () => {
    const src = driveSource(async () => "token", fakeDrive(tree, bodies) as unknown as typeof fetch);
    const files = await src.list();
    expect(files.map((f) => [f.folder, f.name]).sort()).toEqual([
      ["2026/2026-11", "2026-11-18_sec-code_weekly"],
      ["2026/2026-11", "2026-11-24_crm_weekly.md"],
      ["_trackers", "bd_pipeline.csv"],
    ]);
  });

  it("exports a Google Doc as Markdown and repairs its tables; downloads a Markdown file as it is", async () => {
    const fetchImpl = fakeDrive(tree, bodies);
    const src = driveSource(async () => "token", fetchImpl as unknown as typeof fetch);
    expect(await src.read({ id: "doc1", mimeType: GOOGLE_DOC })).toBe("# Title\n\nStatus: OK\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n");
    expect(await src.read({ id: "rep1", mimeType: "text/markdown" })).toBe("# CRM\n");
    expect(fetchImpl).toHaveBeenCalled();
    expect(authHeaders.length).toBeGreaterThan(0);
    expect(authHeaders.every((h) => h.includes("Bearer token"))).toBe(true);
  });

  it("refuses an id that is not a Drive id, and reports Drive's own error", async () => {
    const src = driveSource(async () => "token", fakeDrive(tree, bodies) as unknown as typeof fetch);
    await expect(src.read({ id: "../etc/passwd", mimeType: "text/markdown" })).rejects.toThrow(/Not a Drive file id/);
    await expect(src.read({ id: "missing", mimeType: "text/markdown" })).rejects.toMatchObject({ code: "not_found", message: "File not found: x." });
  });
});

describe("localSource", () => {
  it("reads the same layout from a folder, treating .gdoc as a Google Doc, and stays inside it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "outputs-"));
    mkdirSync(join(dir, "2026", "2026-11"), { recursive: true });
    writeFileSync(join(dir, "2026", "2026-11", "2026-11-18_ops_weekly.gdoc"), "\\#\\# Numbers\n");
    writeFileSync(join(dir, "2026", "2026-11", "notes.txt"), "ignored");
    writeFileSync(join(dir, "loose.md"), "ignored");
    const src = localSource(dir);
    const files = await src.list();
    expect(files.map((f) => [f.name, f.mimeType])).toEqual([["2026-11-18_ops_weekly", GOOGLE_DOC]]);
    expect(await src.read(files[0])).toBe("## Numbers\n");
    await expect(src.read({ id: "../../etc/hosts", mimeType: "text/markdown" })).rejects.toThrow(/Outside/);
  });
});
