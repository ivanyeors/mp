import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const CLIENT_ROOT_DIRS = ["app", "components", "lib", "hooks"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const SERVICE_ROLE_MODULE = "lib/supabase/server.ts";
const BROWSER_SAFE_ENV = /^(NEXT_PUBLIC_\w+|NODE_ENV)$/;
const SERVER_ONLY_PACKAGE = "@anthropic-ai/sdk";

const KNOWN_CLIENT_TO_SERVICE_ROLE: string[] = [
  "app/[lang]/mbolster-config/mbolster-config-client.tsx -> lib/discovery-source/index.ts -> lib/supabase/server.ts",
  "app/[lang]/mbolster-config/mbolster-config-client.tsx -> lib/rules-engine/persist.ts -> lib/supabase/server.ts",
  "app/[lang]/mbolster-config/mbolster-config-client.tsx -> lib/site-settings.ts -> lib/supabase/server.ts",
  "app/[lang]/mp-config/mp-config-client.tsx -> lib/discovery-source/index.ts -> lib/supabase/server.ts",
  "app/[lang]/mp-config/mp-config-client.tsx -> lib/rules-engine/persist.ts -> lib/supabase/server.ts",
  "app/[lang]/mp-config/mp-config-client.tsx -> lib/site-settings.ts -> lib/supabase/server.ts",
  "app/[lang]/settings/faq/faq-client.tsx -> lib/faq/index.ts -> lib/supabase/server.ts",
  "app/[lang]/settings/faq/faq-client.tsx -> lib/faq/seed.ts -> lib/supabase/server.ts",
  "app/[lang]/settings/faq/faq-client.tsx -> lib/page-faq/index.ts -> lib/supabase/server.ts",
  "app/[lang]/settings/faq/faq-client.tsx -> lib/page-faq/seed.ts -> lib/supabase/server.ts",
  "app/[lang]/settings/forms/forms-client.tsx -> lib/discovery-source/index.ts -> lib/supabase/server.ts",
  "app/[lang]/settings/forms/forms-client.tsx -> lib/site-settings.ts -> lib/supabase/server.ts",
  "app/[lang]/settings/results/[id]/result-detail-client.tsx -> lib/rules-engine/persist.ts -> lib/supabase/server.ts",
  "components/configurator/preview-contact-fields.tsx -> lib/discovery-source/index.ts -> lib/supabase/server.ts",
  "components/configurator/preview-contact-fields.tsx -> lib/site-settings.ts -> lib/supabase/server.ts",
  "components/settings/page-faqs-panel.tsx -> lib/faq/index.ts -> lib/supabase/server.ts",
  "components/settings/page-faqs-panel.tsx -> lib/faq/seed.ts -> lib/supabase/server.ts",
  "components/settings/page-faqs-panel.tsx -> lib/page-faq/index.ts -> lib/supabase/server.ts",
  "components/settings/page-faqs-panel.tsx -> lib/page-faq/seed.ts -> lib/supabase/server.ts",
];

type ParsedModule = {
  directive: "use client" | "use server" | null;
  imports: string[];
  importsServerOnlyPackage: boolean;
  readsServerEnv: boolean;
};

const parsed = new Map<string, ParsedModule>();

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) out.push(rel);
  }
  return out;
}

function isFile(rel: string) {
  const abs = path.join(ROOT, rel);
  return existsSync(abs) && statSync(abs).isFile();
}

function resolveSpecifier(fromRel: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = specifier.slice(2);
  else if (specifier.startsWith(".")) base = path.posix.join(path.posix.dirname(fromRel), specifier);
  else return null;
  base = path.posix.normalize(base);
  const stripped = base.replace(/\.(js|jsx|mjs)$/, "");
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((ext) => stripped + ext),
    ...SOURCE_EXTENSIONS.map((ext) => `${base}/index${ext}`),
  ];
  return candidates.find((c) => SOURCE_EXTENSIONS.includes(path.extname(c)) && isFile(c)) ?? null;
}

function directiveOf(source: ts.SourceFile): ParsedModule["directive"] {
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    const text = statement.expression.text;
    if (text === "use client" || text === "use server") return text;
  }
  return null;
}

function namedBindingsAreAllTypes(elements: ts.NodeArray<ts.ImportSpecifier | ts.ExportSpecifier>) {
  return elements.length > 0 && elements.every((element) => element.isTypeOnly);
}

function importIsErased(node: ts.ImportDeclaration) {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  const bindings = clause.namedBindings;
  return !!bindings && ts.isNamedImports(bindings) && namedBindingsAreAllTypes(bindings.elements);
}

function exportIsErased(node: ts.ExportDeclaration) {
  if (node.isTypeOnly) return true;
  const clause = node.exportClause;
  return !!clause && ts.isNamedExports(clause) && namedBindingsAreAllTypes(clause.elements);
}

function isProcessEnv(node: ts.Node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "env" &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process"
  );
}

function envReadIsServerOnly(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression)) {
    return !BROWSER_SAFE_ENV.test(node.name.text);
  }
  if (ts.isElementAccessExpression(node) && isProcessEnv(node.expression)) {
    const key = node.argumentExpression;
    return !(ts.isStringLiteralLike(key) && BROWSER_SAFE_ENV.test(key.text));
  }
  if (ts.isVariableDeclaration(node) && node.initializer && isProcessEnv(node.initializer)) {
    if (!ts.isObjectBindingPattern(node.name)) return true;
    return node.name.elements.some((element) => {
      const key = element.propertyName ?? element.name;
      return !(ts.isIdentifier(key) && BROWSER_SAFE_ENV.test(key.text));
    });
  }
  return false;
}

function parse(rel: string): ParsedModule {
  const cached = parsed.get(rel);
  if (cached) return cached;
  const text = readFileSync(path.join(ROOT, rel), "utf8");
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, false);
  const specifiers: string[] = [];
  let readsServerEnv = false;
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!importIsErased(node)) specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!exportIsErased(node)) specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      if (ts.isStringLiteral(expression)) specifiers.push(expression.text);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteralLike(node.arguments[0])) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) specifiers.push(node.arguments[0].text);
    }
    if (envReadIsServerOnly(node)) readsServerEnv = true;
    ts.forEachChild(node, visit);
  };
  visit(source);
  const imports = [
    ...new Set(specifiers.map((s) => resolveSpecifier(rel, s)).filter((r): r is string => r !== null)),
  ];
  const importsServerOnlyPackage = specifiers.some((s) => s === SERVER_ONLY_PACKAGE || s.startsWith(`${SERVER_ONLY_PACKAGE}/`));
  const result: ParsedModule = { directive: directiveOf(source), imports, importsServerOnlyPackage, readsServerEnv };
  parsed.set(rel, result);
  return result;
}

function shortestChainTo(start: string, isServerOnly: (rel: string) => boolean): string[] | null {
  const previous = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current !== start && isServerOnly(current)) {
      const chain = [current];
      for (let at = previous.get(current); at; at = previous.get(at)) chain.unshift(at);
      return chain;
    }
    const currentModule = parse(current);
    if (current !== start && currentModule.directive === "use server") continue;
    for (const next of currentModule.imports) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  return null;
}

function chainsCrossingIntoServiceRole(start: string): string[][] {
  const previous = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  const chains: string[][] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentModule = parse(current);
    if (current !== start && currentModule.directive === "use server") continue;
    if (current === SERVICE_ROLE_MODULE) continue;
    if (currentModule.imports.includes(SERVICE_ROLE_MODULE)) {
      const chain = [current, SERVICE_ROLE_MODULE];
      for (let at = previous.get(current); at; at = previous.get(at)) chain.unshift(at);
      chains.push(chain);
    }
    for (const next of currentModule.imports) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  return chains;
}

function exportsSupabaseAdmin(rel: string) {
  const source = ts.createSourceFile(rel, readFileSync(path.join(ROOT, rel), "utf8"), ts.ScriptTarget.Latest, false);
  const isExported = (node: ts.Node) =>
    ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  return source.statements.some((statement) => {
    if (ts.isFunctionDeclaration(statement)) return isExported(statement) && statement.name?.text === "supabaseAdmin";
    if (ts.isVariableStatement(statement)) {
      return (
        isExported(statement) &&
        statement.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === "supabaseAdmin")
      );
    }
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      return statement.exportClause.elements.some((e) => e.name.text === "supabaseAdmin");
    }
    return false;
  });
}

if (!isFile(SERVICE_ROLE_MODULE)) {
  console.error(
    `client-boundary: ${SERVICE_ROLE_MODULE} does not exist, so this check would guard nothing. ` +
      "If the service-role client moved, point SERVICE_ROLE_MODULE in lib/supabase/client-boundary.check.ts at its new file.",
  );
  process.exit(1);
}
if (!exportsSupabaseAdmin(SERVICE_ROLE_MODULE)) {
  console.error(
    `client-boundary: ${SERVICE_ROLE_MODULE} no longer exports supabaseAdmin, so this check would guard nothing. ` +
      "Point SERVICE_ROLE_MODULE in lib/supabase/client-boundary.check.ts at the file that does.",
  );
  process.exit(1);
}

const startedAt = performance.now();

const clientFiles = CLIENT_ROOT_DIRS.flatMap((dir) => walk(dir, [])).filter(
  (rel) => parse(rel).directive === "use client",
);

const routeKeyFor = (chain: string[]) =>
  chain.length === 2 ? `${chain[0]} -> ${chain[1]}` : `${chain[0]} -> ${chain.at(-2)} -> ${chain.at(-1)}`;

const found = new Map<string, string[]>();
const clientsReachingServiceRole = new Set<string>();
const serverEnvChains = new Map<string, string[]>();
const serverOnlyPackageChains: string[][] = [];
for (const client of clientFiles) {
  const toPackage = parse(client).importsServerOnlyPackage ? [client] : shortestChainTo(client, (rel) => parse(rel).importsServerOnlyPackage);
  if (toPackage) serverOnlyPackageChains.push([...toPackage, SERVER_ONLY_PACKAGE]);
  for (const chain of chainsCrossingIntoServiceRole(client)) {
    found.set(routeKeyFor(chain), chain);
    clientsReachingServiceRole.add(client);
  }
  const toServerEnv = shortestChainTo(client, (rel) => rel === SERVICE_ROLE_MODULE || parse(rel).readsServerEnv);
  if (toServerEnv) serverEnvChains.set(client, toServerEnv);
}

const elapsedMs = Math.round(performance.now() - startedAt);

const lineFor = (chain: string[]) => `${chain[0]} -> ${chain[1] === chain.at(-1) ? "" : `${chain[1]} -> `}${chain.at(-1)}`;
const known = new Set(KNOWN_CLIENT_TO_SERVICE_ROLE);
const newViolations = [...found.keys()].filter((key) => !known.has(key)).sort();
const staleEntries = [...known].filter((key) => !found.has(key)).sort();

const problems: string[] = [];
if (newViolations.length > 0) {
  problems.push(
    `${newViolations.length} new route(s) from a "use client" file into the service-role client (${SERVICE_ROLE_MODULE}, supabaseAdmin(), which bypasses RLS), each with its shortest chain:`,
    ...newViolations.map((key) => `  ${found.get(key)!.join("\n    -> ")}`),
    "Fix: move the call behind a server action (\"use server\") or a route handler and call that from the client,",
    "or split the pure helper the client needs into its own module that does not import the server code.",
    "Use `import type` when the client only needs a type: type-only imports are erased.",
  );
}
if (serverOnlyPackageChains.length > 0) {
  problems.push(
    `${serverOnlyPackageChains.length} "use client" file(s) reach ${SERVER_ONLY_PACKAGE}, which ships the SDK to every visitor of that page, each with its shortest chain:`,
    ...serverOnlyPackageChains.map((chain) => `  ${chain.join("\n    -> ")}`),
    "Fix: split what the client needs (constants, labels, types) into a module that does not import the SDK.",
  );
}
if (staleEntries.length > 0) {
  problems.push(
    `${staleEntries.length} route(s) in KNOWN_CLIENT_TO_SERVICE_ROLE no longer exist. Delete them from lib/supabase/client-boundary.check.ts so the list only shrinks:`,
    ...staleEntries.map((key) => `  ${key}`),
  );
}

console.log(
  `client-boundary: ${clientFiles.length} "use client" files; ` +
    `${clientsReachingServiceRole.size} reach ${SERVICE_ROLE_MODULE} by ${found.size} route(s) (enforced, ${known.size} known); ` +
    `${serverEnvChains.size} reach a module reading a non-NEXT_PUBLIC_ process.env name (measured, not enforced); ${elapsedMs} ms`,
);
if (process.argv.includes("--list-server-env")) {
  for (const chain of [...serverEnvChains.values()].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`  ${lineFor(chain)}`);
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("client-boundary.check.ts: ok");
