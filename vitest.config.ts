import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  // Tests never need Tailwind. Vite can't load postcss.config.mjs's
  // string-form plugin, which broke `vitest related` (the hooks' test run)
  // as soon as its module graph reached a .css import.
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.claude/worktrees/**",
    ],
  },
});
