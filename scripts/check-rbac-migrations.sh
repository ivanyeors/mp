#!/usr/bin/env bash
# Runs the Users & permissions migrations (PRD users-permissions-rbac) against a
# throwaway local Postgres seeded like production, twice (they must be
# idempotent), then the per-slice assertions in supabase/tests/rbac/.
#
#   ./scripts/check-rbac-migrations.sh
#
# Needs a local Postgres 14+ (initdb, pg_ctl, psql). Not part of CI.
set -euo pipefail
cd "$(dirname "$0")/.."

BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
MIGRATIONS=(
  supabase/migrations/20261004100000_admin_roles.sql
)
ASSERTS=(supabase/tests/rbac/assert-03.sql)

for f in supabase/migrations/2026100411*.sql; do [ -e "$f" ] && MIGRATIONS+=("$f"); done
for f in supabase/tests/rbac/assert-0[4-9].sql supabase/tests/rbac/assert-1*.sql; do [ -e "$f" ] && ASSERTS+=("$f"); done

DIR="$(mktemp -d)"
chmod 777 "$DIR"
RUN=()
if [ "$(id -u)" = 0 ]; then RUN=(su postgres -c); fi
pg() { if [ ${#RUN[@]} -gt 0 ]; then "${RUN[@]}" "$*"; else bash -c "$*"; fi; }
cleanup() { pg "$BIN/pg_ctl -D $DIR/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

pg "$BIN/initdb -D $DIR/data -A trust -U postgres" >/dev/null
pg "$BIN/pg_ctl -D $DIR/data -l $DIR/log -o '-k $DIR -p 5599 -c listen_addresses=' -w start" >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -h "$DIR" -p 5599 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f supabase/tests/rbac/fixture.sql >/dev/null
for pass in 1 2; do
  for m in "${MIGRATIONS[@]}"; do
    "${PSQL[@]}" -f "$m" >/dev/null || { echo "FAIL: $m (pass $pass)"; exit 1; }
  done
done
for a in "${ASSERTS[@]}"; do
  "${PSQL[@]}" -t -A -f "$a" || { echo "FAIL: $a"; exit 1; }
done
echo "rbac migrations ok (${#MIGRATIONS[@]} migrations, run twice)"
