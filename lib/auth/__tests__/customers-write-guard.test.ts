import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { applyRequires, isPermission } from "@/lib/auth/permissions";

/**
 * Reads on `customers`, writes on `customers-edit` (PRD customer-crm slice 10,
 * and the fifth hazard in its issues README).
 *
 * Every write path on the Customers page must call `requireAdmin`,
 * `requireAdminContext` or `assertAdmin` with `customers-edit`, or with a key
 * that requires it (a tab of it such as `customer-import`). A write path is:
 *
 *  - a POST, PUT, PATCH or DELETE route handler;
 *  - every export of a `"use server"` file, and every inline `"use server"`
 *    function. A server action is a write here by definition: a read belongs
 *    in a GET handler or the page, which stay on `customers`.
 *
 * The guard may sit in a helper in the same file. `requireAnyAdmin` does not
 * count: any-of is weaker than the key. The roots are scanned, not listed, so
 * a write path a later slice adds is checked the day it lands. Outside the
 * roots, a write guarded on `customers` without `customers-edit` fails too.
 */

const ROOTS = ["app/api/shop/customers", "app/api/settings/customers", "app/[lang]/settings/customers"];

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SINGLE_KEY_GUARDS = new Set(["requireAdmin", "requireAdminContext", "assertAdmin"]);
const ANY_KEY_GUARDS = new Set(["requireAnyAdmin", "assertAnyAdmin"]);

/** Holding `key` means holding `customers-edit`. */
const grantsEdit = (key: string) => isPermission(key) && applyRequires([key]).has("customers-edit");

type Guard = { fn: string; keys: string[] };
type WritePath = {
  name: string;
  kind: "route" | "action";
  line: number;
  guards: Guard[];
  /** Set when the guard test cannot read this write path's body. */
  unreadable?: string;
};

type FnBody = ts.ConciseBody | undefined;

const isFunctionLike = (n: ts.Node | undefined): n is ts.ArrowFunction | ts.FunctionExpression =>
  !!n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n));

const exported = (n: ts.Node) =>
  ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

const isDefault = (n: ts.Node) =>
  ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

function startsWithUseServer(statements: readonly ts.Statement[]): boolean {
  for (const s of statements) {
    if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) return false;
    if (s.expression.text === "use server") return true;
  }
  return false;
}

/** Every write path in one file, with the guards each one reaches. */
function writePaths(fileName: string, src: string): WritePath[] {
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const isRoute = /^route\.tsx?$/.test(basename(fileName));
  const useServerFile = startsWithUseServer(sf.statements);

  // Top-level functions and string constants, so a guard reached through a
  // helper (`async function requireEdit() { await assertAdmin(PERM) }`) counts.
  const locals = new Map<string, FnBody>();
  const strings = new Map<string, string>();
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) locals.set(s.name.text, s.body);
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        let init = d.initializer;
        if (init && ts.isAsExpression(init)) init = init.expression;
        if (isFunctionLike(init)) locals.set(d.name.text, init.body);
        else if (init && ts.isStringLiteralLike(init)) strings.set(d.name.text, init.text);
      }
    }
  }

  const literalKeys = (arg: ts.Expression | undefined): string[] => {
    if (!arg) return [];
    if (ts.isStringLiteralLike(arg)) return [arg.text];
    if (ts.isIdentifier(arg) && strings.has(arg.text)) return [strings.get(arg.text)!];
    if (ts.isArrayLiteralExpression(arg)) return arg.elements.flatMap((e) => literalKeys(e));
    return [];
  };

  const guardsIn = (body: FnBody, seen = new Set<string>()): Guard[] => {
    const out: Guard[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const fn = n.expression.text;
        if (SINGLE_KEY_GUARDS.has(fn) || ANY_KEY_GUARDS.has(fn)) out.push({ fn, keys: literalKeys(n.arguments[0]) });
        else if (locals.has(fn) && !seen.has(fn)) {
          seen.add(fn);
          out.push(...guardsIn(locals.get(fn), seen));
        }
      }
      ts.forEachChild(n, visit);
    };
    if (body) visit(body);
    return out;
  };

  const paths: WritePath[] = [];
  const add = (name: string, kind: WritePath["kind"], at: ts.Node, body: FnBody, unreadable?: string) =>
    paths.push({ name, kind, line: lineOf(at), guards: unreadable ? [] : guardsIn(body), unreadable });

  // A route file's write handlers, and a "use server" file's every export.
  const entry = (name: string): WritePath["kind"] | null =>
    isRoute && WRITE_METHODS.has(name) ? "route" : useServerFile ? "action" : null;

  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && exported(s)) {
      const name = isDefault(s) ? "default" : (s.name?.text ?? "default");
      const kind = entry(name);
      if (kind) add(name, kind, s, s.body);
    } else if (ts.isVariableStatement(s) && exported(s)) {
      for (const d of s.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const kind = entry(d.name.text);
        if (!kind) continue;
        let init = d.initializer;
        if (init && ts.isAsExpression(init)) init = init.expression;
        if (isFunctionLike(init)) add(d.name.text, kind, d, init.body);
        else add(d.name.text, kind, d, undefined, "not a function written in this file");
      }
    } else if (ts.isExportDeclaration(s) && s.exportClause && ts.isNamedExports(s.exportClause)) {
      for (const spec of s.exportClause.elements) {
        const kind = entry(spec.name.text);
        if (!kind) continue;
        const local = (spec.propertyName ?? spec.name).text;
        if (s.moduleSpecifier || !locals.has(local)) {
          add(spec.name.text, kind, spec, undefined, "re-exported; define the handler in this file");
        } else add(spec.name.text, kind, spec, locals.get(local));
      }
    } else if (ts.isExportAssignment(s) && useServerFile) {
      if (isFunctionLike(s.expression)) add("default", "action", s, s.expression.body);
      else add("default", "action", s, undefined, "not a function written in this file");
    }
  }

  // Inline server actions: a function whose body opens with "use server".
  if (!useServerFile) {
    const visit = (n: ts.Node) => {
      if (
        (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)) &&
        n.body &&
        ts.isBlock(n.body) &&
        startsWithUseServer(n.body.statements)
      ) {
        const named = n.name && ts.isIdentifier(n.name) ? n.name.text : null;
        const holder = ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name) ? n.parent.name.text : null;
        add(named ?? holder ?? "(inline action)", "action", n, n.body);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }

  return paths;
}

/** Guarded on `customers-edit`, or on a key that requires it, by a single-key guard. */
const checksCustomersEdit = (p: WritePath) =>
  !p.unreadable && p.guards.some((g) => SINGLE_KEY_GUARDS.has(g.fn) && g.keys.some(grantsEdit));

/** Guarded on `customers` with nothing that grants editing: a write left on the read key. */
const leftOnCustomers = (p: WritePath) =>
  p.guards.some((g) => g.keys.includes("customers")) && !checksCustomersEdit(p);

function sourceFiles(dir: string): string[] {
  const full = join(process.cwd(), dir);
  if (!existsSync(full)) return [];
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full).flatMap((name) => {
    if (name === "__tests__" || name === "node_modules" || name.startsWith(".")) return [];
    const child = join(dir, name);
    if (statSync(join(process.cwd(), child)).isDirectory()) return sourceFiles(child);
    return /\.tsx?$/.test(name) && !/\.(test|spec|check)\.tsx?$/.test(name) ? [join(process.cwd(), child)] : [];
  });
}

const scan = (files: string[]) =>
  files.flatMap((f) => writePaths(f, readFileSync(f, "utf8")).map((p) => ({ file: relative(process.cwd(), f), ...p })));

describe("Customers write paths check customers-edit", () => {
  const found = scan(ROOTS.flatMap(sourceFiles));

  it("finds today's write paths, so a pass is not an empty scan", () => {
    const names = found.map((p) => `${p.file} ${p.name}`);
    expect(names).toEqual(
      expect.arrayContaining([
        "app/api/shop/customers/route.ts POST",
        "app/api/shop/customers/[id]/route.ts PATCH",
        "app/api/shop/customers/[id]/addresses/route.ts POST",
        "app/api/shop/customers/[id]/notes/route.ts POST",
        "app/api/shop/customers/[id]/notes/[noteId]/route.ts DELETE",
        "app/api/shop/customers/[id]/marketing-consent/route.ts POST",
        // CRM 06: creating, completing, reassigning and deleting follow-ups.
        "app/api/shop/customers/[id]/followups/route.ts POST",
        "app/api/shop/customers/[id]/followups/[followupId]/route.ts PATCH",
        "app/api/shop/customers/[id]/followups/[followupId]/route.ts DELETE",
      ]),
    );
    // GET handlers are reads: they stay on `customers` and are not listed.
    expect(names.some((n) => n.endsWith(" GET"))).toBe(false);
  });

  it.each(found.map((p) => [`${p.file}:${p.line} ${p.name}`, p] as const))("%s", (_label, p) => {
    expect(p.unreadable, `${p.file}:${p.line} ${p.name} is ${p.unreadable}`).toBeUndefined();
    expect(
      checksCustomersEdit(p),
      `${p.file}:${p.line} ${p.name} must call requireAdmin("customers-edit") or assertAdmin("customers-edit"); ` +
        `it guards on ${JSON.stringify(p.guards)}`,
    ).toBe(true);
  });
});

describe("no write anywhere is left on customers", () => {
  // Any route handler or server action in the app that names `customers`.
  const candidates = ["app", "lib", "components"]
    .flatMap(sourceFiles)
    .filter((f) => /["']customers["']/.test(readFileSync(f, "utf8")));

  it("scans the files that name the key", () => {
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("every write that checks customers also checks customers-edit", () => {
    const left = scan(candidates)
      .filter(leftOnCustomers)
      .map((p) => `${p.file}:${p.line} ${p.name}`);
    expect(left, 'these writes check "customers" (see it) instead of "customers-edit" (change it)').toEqual([]);
  });
});

/** The checker itself: it must fail each way a write can be left on `customers`. */
describe("writePaths and checksCustomersEdit", () => {
  const one = (src: string, file = "app/api/shop/customers/x/route.ts") => writePaths(file, src);
  const ok = (src: string, file?: string) => one(src, file).map(checksCustomersEdit);

  it("fails a write handler that checks customers, passes one that checks customers-edit", () => {
    expect(ok(`export async function POST() { const d = await requireAdmin("customers"); if (d) return d; }`)).toEqual([false]);
    expect(ok(`export async function POST() { const d = await requireAdmin("customers-edit"); if (d) return d; }`)).toEqual([true]);
    expect(ok(`export async function DELETE() { const ctx = await requireAdminContext("customers-edit"); }`)).toEqual([true]);
  });

  it("checks each handler on its own, not the file", () => {
    const src = `
      export async function PATCH() { await requireAdmin("customers"); }
      export async function DELETE() { await requireAdmin("customers-edit"); }`;
    expect(one(src).map((p) => [p.name, checksCustomersEdit(p)])).toEqual([["PATCH", false], ["DELETE", true]]);
  });

  it("ignores reads, and fails a write with no guard or another page's key", () => {
    expect(one(`export async function GET() { await requireAdmin("customers"); }`)).toEqual([]);
    expect(ok(`export async function PUT() { return new Response(null); }`)).toEqual([false]);
    expect(ok(`export async function POST() { await requireAdmin("orders"); }`)).toEqual([false]);
  });

  it("does not accept an any-of guard", () => {
    expect(ok(`export async function POST() { await requireAnyAdmin(["customers-edit", "orders"]); }`)).toEqual([false]);
  });

  it("follows a helper and a key constant in the same file", () => {
    expect(ok(`async function edit() { await assertAdmin("customers-edit"); }
      export async function PATCH() { await edit(); }`)).toEqual([true]);
    expect(ok(`async function see() { await assertAdmin("customers"); }
      export async function PATCH() { await see(); }`)).toEqual([false]);
    expect(ok(`const PERM = "customers-edit" as const;
      export async function POST() { await requireAdmin(PERM); }`)).toEqual([true]);
  });

  it("reads const handlers and local re-exports, and refuses what it cannot read", () => {
    expect(ok(`export const POST = async () => { await requireAdmin("customers"); };`)).toEqual([false]);
    expect(ok(`export const POST = async () => { await requireAdmin("customers-edit"); };`)).toEqual([true]);
    expect(ok(`async function h() { await requireAdmin("customers"); } export { h as PUT };`)).toEqual([false]);
    expect(one(`export { POST } from "./shared";`)[0].unreadable).toMatch(/re-exported/);
    expect(one(`export const DELETE = makeHandler("customers-edit");`)[0].unreadable).toMatch(/not a function/);
  });

  it("treats every export of a use-server file as a write, and only those", () => {
    const src = `"use server";
      async function helper() { return 1; }
      export async function addNote() { await assertAdmin("customers"); }
      export async function archiveSegment() { await assertAdmin("customers-edit"); }`;
    const paths = one(src, "app/[lang]/settings/customers/actions.ts");
    expect(paths.map((p) => [p.name, p.kind, checksCustomersEdit(p)])).toEqual([
      ["addNote", "action", false],
      ["archiveSegment", "action", true],
    ]);
  });

  it("finds an inline server action in a page", () => {
    const src = `export default async function Page() {
      async function save(form: FormData) { "use server"; await assertAdmin("customers"); }
      return null;
    }`;
    const paths = one(src, "app/[lang]/settings/customers/[id]/page.tsx");
    expect(paths.map((p) => [p.name, checksCustomersEdit(p)])).toEqual([["save", false]]);
  });

  it("a page's default export is not a write; a route file's non-method exports are not either", () => {
    expect(one(`export default async function Page() { await requireAdminPage("customers", "en"); }`, "app/x/page.tsx")).toEqual([]);
    expect(one(`export const runtime = "nodejs"; export async function GET() {}`)).toEqual([]);
  });
});
