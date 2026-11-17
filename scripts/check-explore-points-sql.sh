#!/usr/bin/env bash
# Runs the Explore points migration (ADR 0030, amendment of 2026-11-17)
# against a throwaway local Postgres holding a stand-in for the parts of the
# live schema it touches, twice (it must be idempotent), then the assertions
# in supabase/tests/explore-points/: the ladder reads only a well-formed
# setting, a Welcome bonus is granted once and never past a step's
# allocation, a used-up step hands over early, Migrated customers and
# partners get none, a flower pays 1 to 5 points once a day and only while
# points are live, the claim's consent subscribes only someone nobody has
# asked, and only the service role can run any of it.
#
#   ./scripts/check-explore-points-sql.sh
#
# Needs a local Postgres 14+ (initdb, pg_ctl, psql). Not part of CI.
set -euo pipefail
cd "$(dirname "$0")/.."

BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
MIGRATIONS=(supabase/migrations/20261117100000_explore_welcome_points.sql)
ASSERTS=(supabase/tests/explore-points/assert-*.sql)

DIR="$(mktemp -d)"
chmod 777 "$DIR"
RUN=()
if [ "$(id -u)" = 0 ]; then RUN=(su postgres -c); fi
pg() { if [ ${#RUN[@]} -gt 0 ]; then "${RUN[@]}" "$*"; else bash -c "$*"; fi; }
cleanup() { pg "$BIN/pg_ctl -D $DIR/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

pg "$BIN/initdb -D $DIR/data -A trust -U postgres" >/dev/null
pg "$BIN/pg_ctl -D $DIR/data -l $DIR/log -o '-k $DIR -p 5598 -c listen_addresses=' -w start" >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -h "$DIR" -p 5598 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f supabase/tests/explore-points/fixture.sql >/dev/null
# Twice in a row: a migration re-run must change nothing.
for m in "${MIGRATIONS[@]}"; do
  for pass in 1 2; do
    "${PSQL[@]}" -1 -f "$m" >/dev/null || { echo "FAIL: $m (pass $pass)"; exit 1; }
  done
done
for a in "${ASSERTS[@]}"; do
  "${PSQL[@]}" -t -A -f "$a" || { echo "FAIL: $a"; exit 1; }
done
echo "explore points sql ok (${#MIGRATIONS[@]} migration, run twice; ${#ASSERTS[@]} assert file)"
