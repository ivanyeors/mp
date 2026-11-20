#!/usr/bin/env bash
# SessionStart: install dependencies in a cloud session, so the checks in
# verify.mjs can run. A cloud container starts with no node_modules, and
# without them verify.mjs can only say the checks did not run.
#
# A local session is left alone: the person installs on their own machine.
# The install is skipped when node_modules already matches the lockfile, so a
# resume, clear or compact costs nothing. A failed install does not stop the
# session: it says what failed, and verify.mjs then refuses to pass silently.
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# The hash file lives inside node_modules, so it disappears with the packages
# and git never sees it.
hashes=node_modules/.session-start.sha256
if [ -x node_modules/.bin/eslint ] && sha256sum --check --status "$hashes" 2>/dev/null; then
  exit 0
fi
rm -f "$hashes"
had_deps=false
[ -x node_modules/.bin/eslint ] && [ -x node_modules/.bin/vitest ] && had_deps=true

# corepack can be refused (an isolated worktree, a read-only bin directory)
# while pnpm is already on the PATH, so only the install itself is judged.
corepack enable >/dev/null 2>&1 || true

# Bounded well under the hook's 600 s timeout, so a hung install is reported
# here rather than killed silently by Claude Code.
limit="${SESSION_START_INSTALL_TIMEOUT:-540}"
log="$(mktemp)"
timeout "$limit" pnpm install --frozen-lockfile >"$log" 2>&1
status=$?
if [ "$status" -eq 0 ]; then
  sha256sum .claude/hooks/session-start.sh package.json pnpm-lock.yaml pnpm-workspace.yaml >"$hashes" 2>/dev/null || rm -f "$hashes"
  echo "session-start: installed dependencies (pnpm install --frozen-lockfile)."
else
  if [ "$status" -eq 124 ]; then
    what="pnpm install --frozen-lockfile did not finish within $limit s and was stopped"
  else
    what="pnpm install --frozen-lockfile failed (exit $status)"
  fi
  if $had_deps; then
    echo "session-start: $what. node_modules is still there but may not match the lockfile. Run: pnpm install --frozen-lockfile"
  else
    echo "session-start: $what, so the checks cannot run until it succeeds. Run: pnpm install --frozen-lockfile"
  fi
  tail -n 20 "$log"
fi
rm -f "$log"
exit 0
