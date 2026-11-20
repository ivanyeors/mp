import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import mp from "./eslint-rules/index.mjs";

// Lint has no warnings (agent-rails PRD, decision 2): every rule is `error` or
// off. ESLint's bulk suppressions (eslint-suppressions.json) only count rules
// set to `error`, and a warning nobody is made to fix is noise. So every rule
// any config below sets to `warn` is raised to `error` here, options kept,
// including the React Compiler rules this file used to downgrade and any
// `warn` a future eslint-config-next adds.
function promoteWarnings(configs) {
  return configs.map((config) => {
    if (!config.rules) return config;
    const rules = Object.fromEntries(
      Object.entries(config.rules).map(([name, value]) => {
        const [severity, ...options] = Array.isArray(value) ? value : [value];
        const isWarn = severity === "warn" || severity === 1;
        return [name, isWarn ? ["error", ...options] : value];
      }),
    );
    return { ...config, rules };
  });
}

const SHOPIFY_MESSAGE =
  "Nothing new integrates with Shopify (CLAUDE.md, 'Shopify is being replaced'). " +
  "The only Shopify work is the one-time customer import and the cutover (ADR 0029), " +
  "and it lives in lib/shopify/, app/api/shopify/, app/api/cron/shopify-*/ and scripts/. " +
  "Build this on this platform's own data instead.";

const SCRIPTS_MESSAGE =
  "Product code does not import from scripts/: those are one-off operational scripts, not a library, " +
  "and scripts/ is exempt from the Shopify ban, so an import from there is a way around it. " +
  "Move what you need into lib/.";

// Each ban is a regex on the import string. A path with a segment that is
// exactly `shopify` covers `@/lib/shopify/...`, `@/lib/./shopify/...`,
// `../inventory/../shopify/...` and `@/app/api/shopify/...`, and leaves
// `@/lib/shopify-redirects` and `./shopify-csv` alone.
const SHOPIFY = { regex: "^@shopify/|(^|/)shopify(/|$)", message: SHOPIFY_MESSAGE };
const SCRIPTS = { regex: "(^|/)scripts(/|$)", message: SCRIPTS_MESSAGE };

const SHOPIFY_FOLDERS = ["lib/shopify/**", "app/api/shopify/**", "app/api/cron/shopify-*/**"];
const TOOLING = [".claude/**", "eslint-rules/**", "*.config.{js,mjs,cjs,ts,mts,cts}"];

// no-restricted-imports covers `import` and `export ... from`;
// no-restricted-syntax covers `import()` and `require()` whose source is a
// string or a template literal (any of its static parts).
// esquery reads `/.../` as the regex's bounds, so a `/` inside is /.
// ponytail: both read the import string, not the resolved file: a path that
// reaches lib/shopify without a `shopify` segment (a symlink, a tsconfig
// alias added for it, a computed import() source) still gets through. The
// upgrade is import/no-restricted-paths (eslint-config-next already loads
// eslint-plugin-import), which resolves the path first.
function banModules(...bans) {
  if (bans.length === 0) return { "no-restricted-imports": "off", "no-restricted-syntax": "off" };
  const esq = (regex) => regex.replaceAll("/", "\\u002F");
  return {
    "no-restricted-imports": ["error", { patterns: bans.map(({ regex, message }) => ({ regex, message })) }],
    "no-restricted-syntax": [
      "error",
      ...bans.flatMap(({ regex, message }) => [
        { selector: `ImportExpression[source.value=/${esq(regex)}/]`, message },
        { selector: `ImportExpression > TemplateLiteral > TemplateElement[value.cooked=/${esq(regex)}/]`, message },
        { selector: `CallExpression[callee.name='require'] > Literal[value=/${esq(regex)}/]`, message },
        { selector: `CallExpression[callee.name='require'] > TemplateLiteral > TemplateElement[value.cooked=/${esq(regex)}/]`, message },
      ]),
    ],
  };
}

const eslintConfig = defineConfig([
  ...promoteWarnings([...nextVitals, ...nextTs]),
  {
    // ESLint directive comments (`eslint-disable`, `/* eslint ... */`) do
    // nothing: a violation that exists today is counted in
    // eslint-suppressions.json, and a new one gets fixed.
    // reportUnusedDisableDirectives defaults to `warn`; no warnings here.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "error" },
    plugins: { mp },
  },
  // One-off operational scripts (WhatsApp Graph API probes, seeds, Stripe sync)
  // parse untyped third-party JSON responses. tsconfig.json already excludes
  // scripts/** from typechecking for the same reason; mirror that for this one
  // rule so `pnpm lint` can be a hard CI gate on application code instead of
  // failing every run on five pre-existing `any` annotations. Every other rule
  // still applies to scripts/.
  {
    files: ["scripts/**/*.ts", "scripts/**/*.mts", "scripts/**/*.mjs"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // The product rails (PRD decisions 3-5) apply to every linted file; the
  // exemptions below are listed, so a new root folder or file is covered
  // without anyone remembering to add it. What ESLint lints outside app/,
  // components/, lib/, hooks/ and proxy.ts, and which side each is on:
  //   product:  public/sw.js (a hand-written service worker)
  //   tooling:  scripts/**, .claude/** (hooks, skills, preview fixtures),
  //             eslint-rules/**, the root *.config.* files
  {
    rules: {
      "mp/no-effect": "error",
      "mp/no-comment": "error",
      ...banModules(SHOPIFY, SCRIPTS),
    },
  },
  // hooks/ is the one place effects live.
  { files: ["hooks/**"], rules: { "mp/no-effect": "off" } },
  // Vendored primitives.
  { files: ["components/ui/**"], rules: { "mp/no-effect": "off", "mp/no-comment": "off" } },
  // Rewritten whole by scripts/gen-silhouette-master.mjs, header included.
  { files: ["lib/spatial-fillings/silhouette-master.ts"], rules: { "mp/no-comment": "off" } },
  // Shopify's own folders may import Shopify, but not scripts/.
  { files: SHOPIFY_FOLDERS, rules: banModules(SCRIPTS) },
  // Tooling keeps the house style (comments that say why) and may import
  // scripts/; it still may not reach Shopify.
  {
    files: TOOLING,
    rules: { "mp/no-effect": "off", "mp/no-comment": "off", ...banModules(SHOPIFY) },
  },
  // The one-time import and the cutover are run from scripts/.
  {
    files: ["scripts/**"],
    rules: { "mp/no-effect": "off", "mp/no-comment": "off", ...banModules() },
  },
  globalIgnores([
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent sessions check out git worktrees here (gitignored, and skipped by
    // vitest.config.ts); each is a full copy of the repo, not code of its own.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
