#!/usr/bin/env node
// PreToolUse guard: blocks the few actions that can't be taken back.
//
// The test is the one from Anthropic's "Rethinking Claude Code best practices":
// if Claude gets this wrong once, can we undo it? Wrong code can be reverted,
// so the model decides. These can't, so the harness decides, before auto mode's
// classifier ever sees the call:
//
//   - discarding uncommitted work (reset --hard, checkout/restore over
//     changes, clean, stash drop) while there is work to lose
//   - force pushes, pushes to main, and --no-verify (it skips the pre-push
//     author guard, and Vercel then silently builds nothing)
//   - SQL that destroys data: DROP TABLE/SCHEMA/DATABASE, TRUNCATE, dropping a
//     column, DELETE or UPDATE with no WHERE. Through the Supabase MCP, psql,
//     or `supabase db push` of a migration that does it. Other database
//     changes are allowed (owner, 2026-11-17).
//   - scripts that reach real people or live money: the customer migration
//     send, live-Stripe runs, and the WhatsApp scripts that send or register
//
// Exit 2 blocks the call and hands the reason to Claude. Input it can't parse
// as JSON is let through. If the guard itself crashes or times out, the call
// is blocked (`onFailure: "block"` in .claude/settings.json): a guard that
// fails open guards nothing.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------- shell ----

/**
 * Remove here-document bodies, so a commit message or a SQL script fed through
 * `<<EOF` is never read as commands. (psql input is checked separately, on the
 * raw text.)
 */
export function stripHeredocs(cmd) {
  const re = /<<(-?)\s*(['"]?)([A-Za-z_][\w-]*)\2/;
  let out = "";
  let rest = cmd;
  for (let guard = 0; guard < 50; guard++) {
    const m = re.exec(rest);
    if (!m) break;
    const nl = rest.indexOf("\n", m.index + m[0].length);
    if (nl === -1) break;
    const lines = rest.slice(nl + 1).split("\n");
    const end = lines.findIndex((l) => l.trim() === m[3]);
    if (end === -1) break;
    out += rest.slice(0, nl + 1);
    rest = rest.slice(nl + 1 + lines.slice(0, end + 1).join("\n").length);
  }
  return out + rest;
}

/** Index of the `)` (or backtick) closing a substitution that starts at `start`. */
function closeOf(cmd, start, backtick) {
  if (backtick) {
    const j = cmd.indexOf("`", start);
    return j === -1 ? cmd.length : j;
  }
  let depth = 1;
  let q = null;
  for (let j = start; j < cmd.length; j++) {
    const c = cmd[j];
    if (q) {
      if (c === q) q = null;
      else if (c === "\\" && q === '"') j++;
    } else if (c === "'" || c === '"') q = c;
    else if (c === "\\") j++;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return j;
  }
  return cmd.length;
}

/**
 * Split a shell command into simple commands, each a list of words with quotes
 * removed. Rough by design: it errs towards finding a command, never towards
 * hiding one. `$(...)` and backticks, quoted or not, become commands of their
 * own; so do subshells.
 */
export function parseShell(cmd) {
  const commands = [];
  let words = [];
  let word = "";
  let inWord = false;
  let quote = null;
  const endWord = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else word += c;
      continue;
    }
    if ((c === "$" && cmd[i + 1] === "(") || c === "`") {
      const start = c === "`" ? i + 1 : i + 2;
      const end = closeOf(cmd, start, c === "`");
      commands.push(...parseShell(cmd.slice(start, end)));
      word += "$(…)";
      inWord = true;
      i = end;
      continue;
    }
    if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === "\\" && i + 1 < cmd.length) word += cmd[++i];
      else word += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (c === "\\" && i + 1 < cmd.length) {
      word += cmd[++i];
      inWord = true;
    } else if (/\s/.test(c) && c !== "\n") {
      endWord();
    } else if (";&|\n()".includes(c)) {
      endCommand();
    } else {
      word += c;
      inWord = true;
    }
  }
  endCommand();
  return commands;
}

const WRAPPERS = new Set(["sudo", "command", "nohup", "exec", "time", "builtin"]);

/** Drop leading VAR=value words and wrappers like `timeout 5` or `env -i`. */
export function stripPrefix(words) {
  let w = [...words];
  for (let guard = 0; guard < 20 && w.length; guard++) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) w = w.slice(1);
    else if (WRAPPERS.has(w[0])) w = w.slice(1);
    else if (w[0] === "env") {
      w = w.slice(1);
      while (w.length && (w[0].startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]))) w = w.slice(1);
    } else if (w[0] === "timeout" || w[0] === "nice") {
      w = w.slice(1);
      while (w.length && w[0].startsWith("-")) w = w.slice(w[0] === "-n" ? 2 : 1);
      if (w[0] === undefined) break;
      if (/^\d/.test(w[0])) w = w.slice(1);
    } else if (w[0] === "xargs") {
      w = w.slice(1);
      while (w.length && w[0].startsWith("-")) w = w.slice(1);
    } else break;
  }
  return w;
}

/** Every simple command in `cmd`, following `sh -c` and `eval` one level down at a time. */
export function commandsIn(cmd, depth = 0) {
  const out = [];
  for (const raw of parseShell(stripHeredocs(cmd))) {
    const w = stripPrefix(raw);
    if (!w.length) continue;
    out.push(w);
    const prog = path.basename(w[0]);
    if (depth < 3 && ["sh", "bash", "zsh", "dash"].includes(prog)) {
      const i = w.indexOf("-c");
      if (i !== -1 && w[i + 1]) out.push(...commandsIn(w[i + 1], depth + 1));
    }
    if (depth < 3 && prog === "eval") out.push(...commandsIn(w.slice(1).join(" "), depth + 1));
  }
  return out;
}

// ------------------------------------------------------------------ sql ----

/** Why this SQL destroys data for good, or null. */
export function destructiveSql(sql) {
  const text = String(sql)
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .toLowerCase();
  for (const raw of text.split(";")) {
    const s = raw.replace(/\s+/g, " ").trim();
    if (!s) continue;
    const short = s.length > 80 ? `${s.slice(0, 80)}…` : s;
    if (/\bdrop (table|schema|database)\b/.test(s)) return `drops a table, schema or database: "${short}"`;
    if (/\btruncate\b/.test(s)) return `empties a table: "${short}"`;
    if (/\balter table\b.*?\bdrop (?!constraint\b|default\b|not null\b|identity\b|expression\b)/.test(s))
      return `drops a column: "${short}"`;
    if (/\bdelete from\b/.test(s) && !/\bwhere\b/.test(s)) return `deletes every row: "${short}"`;
    if (/\bupdate (?!set\b)[\w."]+ set\b/.test(s) && !/\bwhere\b/.test(s))
      return `overwrites every row: "${short}"`;
  }
  return null;
}

// ------------------------------------------------------------------ git ----

const GIT_VALUE_OPTS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

/** Split `git [global options] <sub> <args>` into { dir, sub, args }. */
export function parseGit(words, cwd) {
  let dir = cwd;
  let i = 1;
  while (i < words.length && words[i].startsWith("-")) {
    if (words[i] === "-C") dir = path.resolve(dir, words[i + 1] ?? ".");
    i += GIT_VALUE_OPTS.has(words[i]) ? 2 : 1;
  }
  return { dir, sub: words[i], args: words.slice(i + 1) };
}

/** True when a short-option cluster like `-fu` holds `letter` before any option that takes a value. */
function clusterHas(arg, letter, takesValue = "") {
  if (!/^-[A-Za-z]+$/.test(arg)) return false;
  for (const ch of arg.slice(1)) {
    if (ch === letter) return true;
    if (takesValue.includes(ch)) return false;
  }
  return false;
}

const MAIN = new Set(["main", "master"]);

function pushTargets(args) {
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (["-o", "--push-option", "--repo", "--receive-pack", "--exec"].includes(a)) i++;
    else if (!a.startsWith("-")) positional.push(a);
  }
  return positional.slice(1); // the first is the remote
}

function gitVerdict({ dir, sub, args }, sys) {
  if (args.includes("--no-verify") || (sub === "commit" && args.some((a) => clusterHas(a, "n", "mFCcSt"))))
    return "--no-verify skips the pre-push author guard; a commit Vercel won't build then gets no preview and no error. Fix what the hook reports instead.";

  if (sub === "push") {
    const force =
      args.some((a) => a === "--force" || a === "--mirror" || clusterHas(a, "f", "o")) ||
      pushTargets(args).some((r) => r.startsWith("+"));
    if (force)
      return "a force push rewrites published history. Use --force-with-lease on your own branch if it is truly needed, or ask the user.";
    const targets = pushTargets(args);
    const dst = (r) => {
      const d = (r.includes(":") ? r.split(":").pop() : r).replace(/^\+/, "").replace(/^refs\/heads\//, "");
      return d === "HEAD" ? sys.branch(dir) : d;
    };
    if (targets.some((r) => MAIN.has(dst(r))) || (targets.length === 0 && MAIN.has(sys.branch(dir))))
      return "pushing to main deploys to production without a pull request or CI. Push a branch and open a pull request.";
    return null;
  }

  const lose = (what) =>
    `${what} would throw away uncommitted work in ${dir}, which can't be recovered. Commit or stash it first, or ask the user.`;
  // graphify-out/ is generated; taking main's copy is the documented merge fix.
  const keep = (paths) => paths.filter((p) => !/^(\.\/)?graphify-out(\/|$)/.test(p));
  const named = (list) => {
    const paths = keep(list);
    return list.length > 0 && paths.length === 0 ? null : paths;
  };
  if (sub === "reset" && (args.includes("--hard") || args.includes("--merge")) && sys.dirty(dir, []))
    return lose(`git reset ${args.includes("--hard") ? "--hard" : "--merge"}`);
  if (sub === "checkout") {
    const dd = args.indexOf("--");
    const paths = dd !== -1 ? named(args.slice(dd + 1)) : args.includes(".") ? ["."] : null;
    const force = args.includes("--force") || args.some((a) => clusterHas(a, "f", "bB"));
    if (paths && sys.dirty(dir, paths)) return lose("git checkout over changed files");
    if (force && sys.dirty(dir, [])) return lose("git checkout --force");
  }
  if (sub === "restore" && !(args.includes("--staged") && !args.includes("--worktree") && !args.includes("-W"))) {
    const list = [];
    for (let i = 0; i < args.length; i++) {
      if (["-s", "--source"].includes(args[i])) i++;
      else if (!args[i].startsWith("-")) list.push(args[i]);
    }
    const paths = named(list);
    if (paths && sys.dirty(dir, paths)) return lose("git restore");
  }
  if (sub === "switch" && (args.includes("--discard-changes") || args.includes("--force") || args.includes("-f")) && sys.dirty(dir, []))
    return lose("git switch --discard-changes");
  if (sub === "clean") {
    const forced = args.some((a) => a === "--force" || clusterHas(a, "f", "e"));
    const dry = args.some((a) => a === "--dry-run" || clusterHas(a, "n", "e"));
    if (forced && !dry) {
      if (args.some((a) => clusterHas(a, "x", "e") || clusterHas(a, "X", "e")))
        return "git clean -x deletes ignored files too, including .env.local and other files git can't restore.";
      if (sys.untracked(dir)) return lose("git clean");
    }
  }
  if (sub === "stash" && ["drop", "clear"].includes(args[0]))
    return `git stash ${args[0]} deletes saved work for good. Ask the user first.`;
  return null;
}

// ------------------------------------------------------------- commands ----

const RUNNERS = new Set(["node", "npx", "tsx", "pnpm", "npm", "yarn", "bun", "bunx", "deno"]);
const WHATSAPP_SENDS = /whatsapp-(test|preview|langprobe|wait-and-test|register|create-templates)\b/;
const LIVE_STRIPE_SCRIPTS = /costings-sync-prices|costings:sync|stripe-sync-all|stripe:sync-all/;

function runsScript(words) {
  const prog = path.basename(words[0]);
  return RUNNERS.has(prog) || /(^|\/)scripts\//.test(words[0]);
}

function supabaseVerdict(args, dir, sys) {
  const [a, b] = args;
  if (a === "db" && b === "reset" && args.some((x) => x === "--linked" || x.startsWith("--db-url")))
    return "supabase db reset against a remote database wipes it.";
  if ((a === "projects" || a === "branches") && b === "delete") return `supabase ${a} delete can't be undone.`;
  if (a === "storage" && b === "rm") return "supabase storage rm deletes stored files for good.";
  if (a === "db" && b === "push") return pendingMigrationsVerdict(dir, sys);
  return null;
}

function pendingMigrationsVerdict(dir, sys) {
  for (const file of sys.newMigrations(dir)) {
    const why = destructiveSql(sys.read(path.join(dir, file)));
    if (why) return `migration ${file} ${why}. Data it removes can't be brought back; ask the user to apply it.`;
  }
  return null;
}

/** The reason to block a Bash command, or null. */
export function bashVerdict(command, cwd, sys) {
  const cmds = commandsIn(command);
  for (const w of cmds) {
    const prog = path.basename(w[0]);
    if (prog === "git") {
      const why = gitVerdict(parseGit(w, cwd), sys);
      if (why) return why;
    }
    if (runsScript(w)) {
      const args = w.slice(1).join(" ");
      if (/customer-migration-send/.test(args))
        return "the customer migration send emails real customers; a human runs every wave (see the script's header). Ask the user to run it.";
      if (WHATSAPP_SENDS.test(args))
        return "this WhatsApp script sends to real numbers or changes the business account. Ask the user to run it.";
      if (LIVE_STRIPE_SCRIPTS.test(args) && w.includes("--live"))
        return "--live writes to the live Stripe account. Run it in test mode, or ask the user.";
      if (/(^|\s)(run\s+)?db:push\b/.test(args) && ["pnpm", "npm", "yarn", "bun"].includes(prog)) {
        const why = pendingMigrationsVerdict(cwd, sys);
        if (why) return why;
      }
    }
    const supa = prog === "supabase" ? w.slice(1) : RUNNERS.has(prog) && w.includes("supabase") ? w.slice(w.indexOf("supabase") + 1) : null;
    if (supa) {
      const why = supabaseVerdict(supa, cwd, sys);
      if (why) return why;
    }
    if (prog === "stripe" && w.includes("--live")) return "--live acts on the live Stripe account. Ask the user.";
    if (prog === "psql") {
      const why = destructiveSql(command) ?? psqlFiles(w, cwd, sys);
      if (why) return `this psql command ${why}. Data it removes can't be brought back; ask the user.`;
    }
  }
  return null;
}

function psqlFiles(w, cwd, sys) {
  for (let i = 1; i < w.length; i++) {
    const f = w[i] === "-f" || w[i] === "--file" ? w[i + 1] : w[i].startsWith("--file=") ? w[i].slice(7) : null;
    if (f) {
      const why = destructiveSql(sys.read(path.resolve(cwd, f)));
      if (why) return why;
    }
  }
  return null;
}

/** The reason to block this tool call, or null. `sys` reads git and files (swapped out in tests). */
export function verdict(input, sys = realSys) {
  const tool = String(input?.tool_name ?? "");
  const ti = input?.tool_input ?? {};
  const cwd = input?.cwd || process.cwd();
  if (tool === "Bash") return bashVerdict(String(ti.command ?? ""), cwd, sys);
  if (/supabase/i.test(tool)) {
    if (/__(execute_sql|apply_migration)$/.test(tool)) {
      const why = destructiveSql(ti.query ?? "");
      if (why) return `this SQL ${why}. Data it removes can't be brought back; ask the user to run it.`;
    }
    if (/__(delete_branch|reset_branch)$/.test(tool)) return "this deletes a database branch's data for good. Ask the user.";
  }
  return null;
}

// ------------------------------------------------------------------ sys ----

const git = (dir, args) => {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};

export const realSys = {
  dirty: (dir, paths = []) =>
    git(dir, ["status", "--porcelain", "--untracked-files=no", "--", ...paths]).trim() !== "",
  untracked: (dir) => /^\?\? /m.test(git(dir, ["status", "--porcelain"])),
  branch: (dir) => git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
  // Migrations main doesn't have yet: the ones `db push` would most likely apply.
  newMigrations: (dir) =>
    [
      ...git(dir, ["diff", "--name-only", "origin/main", "--", "supabase/migrations"]).split("\n"),
      ...git(dir, ["ls-files", "--others", "--exclude-standard", "--", "supabase/migrations"]).split("\n"),
    ].filter((f) => f.endsWith(".sql")),
  read: (file) => {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return "";
    }
  },
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let why = null;
  try {
    why = verdict(JSON.parse(readFileSync(0, "utf8")));
  } catch {
    process.exit(0);
  }
  if (why) {
    process.stderr.write(`Blocked by .claude/hooks/guard.mjs: ${why}\n`);
    process.exit(2);
  }
}
