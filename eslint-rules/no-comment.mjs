// mp/no-comment: comments are banned in product code (agent-rails PRD,
// decision 4). A reason goes where something checks it.
//
// Counting is per line: every line of a `//` run and every line of a block
// or JSX comment is one report, so a line added under an existing comment,
// or inside an existing block, raises the file's count. Rewording a line
// does not.
//
// Allowed:
// - a `ponytail:` comment (CLAUDE.md: a deliberate shortcut names its
//   ceiling and upgrade path): a `//` run or a block whose first text starts
//   with `ponytail:`, up to PONYTAIL_LINES lines; lines past that are
//   reported like any other;
// - the directive comments a tool acts on that this codebase really has
//   (surveyed 2026-11-20 across app/, components/, lib/, hooks/, proxy.ts):
//   `// @vitest-environment <env>` as the first comment of a test file,
//   before any code, with
//   an environment Vitest ships; and `/*turbopackIgnore: true*/` (Turbopack
//   reads it inside an import or fs call). Nothing else: no @ts-expect-error,
//   triple-slash reference or webpack magic comment exists here today, so
//   none is allowed until one is needed and added on purpose.
// ESLint's own directives are not allowed: linterOptions.noInlineConfig
// already makes them inert, and this rule reports them as comments.
//
// Also reported, as comments by another name:
// - a shebang (`#! ...`): no product file is run as a script;
// - a statement that is only a string (`"mount-only";`), other than the
//   directives React and Next act on. Next 16.4 honours "use cache: private"
//   and "use cache: remote" besides plain "use cache".

const PONYTAIL_LINES = 4;

const VITEST_ENVIRONMENTS = new Set(["node", "jsdom", "happy-dom", "edge-runtime"]);
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const STRING_DIRECTIVES = new Set([
  "use client",
  "use server",
  "use strict",
  "use cache",
  "use cache: private",
  "use cache: remote",
  "use memo",
  "use no memo",
]);

const MESSAGE =
  "Comments are not allowed here. Put the reason where something checks it: a clearer name, " +
  "a type, a test or a *.check.ts. A deliberate shortcut may carry one `ponytail:` comment " +
  `of at most ${PONYTAIL_LINES} lines naming its ceiling and the upgrade path.`;

const STRING_MESSAGE =
  "A statement that is only a string is a comment by another name. Put the reason where something " +
  "checks it: a clearer name, a type, a test or a *.check.ts. Only the directives React and Next act on " +
  '("use client", "use server", "use cache", ...) may stand alone.';

function isTurbopackIgnore(comment) {
  return comment.type === "Block" && /^\s*turbopackIgnore:\s*true\s*$/.test(comment.value);
}

function isVitestEnvironment(comment, isFirst, filename) {
  if (!isFirst || comment.type !== "Line" || !TEST_FILE.test(filename)) return false;
  const match = /^\s*@vitest-environment\s+(\S+)\s*$/.exec(comment.value);
  return Boolean(match && VITEST_ENVIRONMENTS.has(match[1]));
}

function startsWithPonytail(comment) {
  // Block comments may be JSDoc-style (`/** ponytail: ... */`).
  const text = comment.type === "Block" ? comment.value.replace(/^[\s*]+/, "") : comment.value.trimStart();
  return text.startsWith("ponytail:");
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Disallow comments except a short `ponytail:` note and tool directives" },
    schema: [],
    messages: { comment: MESSAGE, string: STRING_MESSAGE },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const filename = context.filename;

    const reportLines = (startLine, endLine) => {
      for (let line = startLine; line <= endLine; line++) {
        context.report({ loc: { line, column: 0 }, messageId: "comment" });
      }
    };

    return {
      Program() {
        const all = sourceCode.getAllComments();
        const comments = all.filter(
          (c, i) =>
            !isTurbopackIgnore(c) &&
            !isVitestEnvironment(c, i === 0 && !sourceCode.getTokenBefore(c), filename),
        );

        // A run: consecutive `//` comments with only whitespace between.
        const runs = [];
        for (const c of comments) {
          const run = runs.at(-1);
          const prev = run?.at(-1);
          const joins =
            prev &&
            prev.type === "Line" &&
            c.type === "Line" &&
            c.loc.start.line === prev.loc.end.line + 1 &&
            sourceCode.text.slice(prev.range[1], c.range[0]).trim() === "";
          if (joins) run.push(c);
          else runs.push([c]);
        }

        for (const run of runs) {
          const first = run[0].loc.start.line;
          const last = run.at(-1).loc.end.line;
          const allowedThrough = startsWithPonytail(run[0]) && run[0].type !== "Shebang" ? first + PONYTAIL_LINES - 1 : first - 1;
          if (last > allowedThrough) reportLines(Math.max(first, allowedThrough + 1), last);
        }
      },
      ExpressionStatement(node) {
        const e = node.expression;
        const text =
          e.type === "Literal" && typeof e.value === "string"
            ? e.value
            : e.type === "TemplateLiteral" && e.expressions.length === 0
              ? null
              : undefined;
        if (text === undefined) return;
        if (text !== null && node.directive !== undefined && STRING_DIRECTIVES.has(text)) return;
        context.report({ node, messageId: "string" });
      },
    };
  },
};

export default rule;
