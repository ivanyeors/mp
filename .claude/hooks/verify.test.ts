import { spawnSync, execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// verify.mjs run against a throwaway git repository that has no node_modules,
// the state a cloud session is in before (or after a failed) install.
const VERIFY = path.join(import.meta.dirname, "verify.mjs");

let repo: string;

beforeEach(() => {
  // Resolved, because verify.mjs takes the root from git, which resolves
  // symlinks (macOS's /var/folders is one), and compares paths against it.
  repo = realpathSync(mkdtempSync(path.join(tmpdir(), "verify-test-")));
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  writeFileSync(path.join(repo, "README.md"), "x\n");
  writeFileSync(path.join(repo, ".gitignore"), "node_modules\n");
  mkdirSync(path.join(repo, "scripts"));
  writeFileSync(path.join(repo, "scripts/checks.mjs"), "");
  git("add", ".");
  git("commit", "-q", "-m", "init");
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

function verify(mode: string, input: object = {}) {
  const r = spawnSync(process.execPath, [VERIFY, mode], {
    input: JSON.stringify({ cwd: repo, session_id: "s1", ...input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    encoding: "utf8",
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe("verify.mjs without node_modules", () => {
  it("stop with a changed code file exits 2 and names the install command", () => {
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    const r = verify("stop");
    expect(r.code).toBe(2);
    expect(r.err).toContain("pnpm install --frozen-lockfile");
    expect(r.err).toMatch(/not run/);
  });

  it("task with a changed code file exits 2 too", () => {
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    const r = verify("task");
    expect(r.code).toBe(2);
    expect(r.err).toContain("pnpm install --frozen-lockfile");
  });

  it("stop with no changed code file exits 0 and says nothing", () => {
    writeFileSync(path.join(repo, "notes.md"), "y\n");
    const r = verify("stop");
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    expect(r.out).toBe("");
  });

  it("gives up on the fourth stop on the same state and tells the user the checks did not run", () => {
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    for (let i = 0; i < 3; i++) expect(verify("stop").code).toBe(2);
    const r = verify("stop");
    expect(r.code).toBe(0);
    const msg = JSON.parse(r.out).systemMessage as string;
    expect(msg).toMatch(/did not run/);
    expect(msg).toContain("pnpm install --frozen-lockfile");
    expect(msg).not.toContain("corepack");
  });

  it("after giving up, a new state is not blocked again: stop tells the user once, task passes", () => {
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    for (let i = 0; i < 4; i++) verify("stop");
    writeFileSync(path.join(repo, "b.ts"), "export const b = 1;\n");
    const r = verify("stop");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).systemMessage).toMatch(/did not run/);
    const again = verify("stop");
    expect(again.code).toBe(0);
    expect(again.out).toBe("");
    writeFileSync(path.join(repo, "c.ts"), "export const c = 1;\n");
    expect(verify("task").code).toBe(0);
  });

  it("edit on a code file exits 2 once per session, then lets edits through", () => {
    const file = path.join(repo, "a.ts");
    writeFileSync(file, "export const a = 1;\n");
    const first = verify("edit", { tool_input: { file_path: file } });
    expect(first.code).toBe(2);
    expect(first.err).toContain("pnpm install --frozen-lockfile");
    expect(verify("edit", { tool_input: { file_path: file } }).code).toBe(0);
    expect(verify("edit", { tool_input: { file_path: file }, session_id: "s2" }).code).toBe(2);
  });

  it("edit on a file that is not code exits 0", () => {
    const file = path.join(repo, "notes.md");
    writeFileSync(file, "y\n");
    expect(verify("edit", { tool_input: { file_path: file } }).code).toBe(0);
  });
});

describe("verify.mjs once node_modules arrive", () => {
  it("judges a state that gave up for want of node_modules afresh", () => {
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    for (let i = 0; i < 4; i++) verify("stop");
    const bin = path.join(repo, "node_modules/.bin");
    mkdirSync(bin, { recursive: true });
    for (const name of ["eslint", "vitest"]) {
      writeFileSync(path.join(bin, name), "#!/bin/sh\necho stub $0 failed >&2\nexit 1\n");
      chmodSync(path.join(bin, name), 0o755);
    }
    const r = verify("stop");
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/vitest related/);
  });
});

describe("verify.mjs with an unwritable temp directory", () => {
  it("edit still lints", () => {
    const bin = path.join(repo, "node_modules/.bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, "eslint"), "#!/bin/sh\necho stub eslint ran >&2\nexit 1\n");
    writeFileSync(path.join(bin, "vitest"), "#!/bin/sh\nexit 0\n");
    for (const name of ["eslint", "vitest"]) chmodSync(path.join(bin, name), 0o755);
    const blocked = path.join(repo, "not-a-dir");
    writeFileSync(blocked, "");
    const file = path.join(repo, "a.ts");
    writeFileSync(file, "export const a = 1;\n");
    const r = spawnSync(process.execPath, [VERIFY, "edit"], {
      input: JSON.stringify({ cwd: repo, tool_input: { file_path: file } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo, TMPDIR: blocked },
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("stub eslint ran");
  });
});
