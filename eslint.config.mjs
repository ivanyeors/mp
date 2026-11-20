import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Next 16 eslint-config-next ships stricter React Compiler hooks rules.
  // Existing patterns are valid runtime code; keep them as warnings until
  // we can refactor deliberately (not as part of the framework bump).
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/static-components": "warn",
    },
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
  globalIgnores([
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent sessions check out git worktrees here (gitignored, and skipped by
    // vitest.config.ts); each is a full copy of the repo, not code of its own.
    ".claude/worktrees/**",
    // A standalone Node CLI vendored from Scino/fstack; the Next.js rules
    // misfire on it. Its own tsconfig checks it:
    //   tsc -p .claude/skills/statechart/scripts/tsconfig.json
    ".claude/skills/statechart/scripts/**",
  ]),
]);

export default eslintConfig;
