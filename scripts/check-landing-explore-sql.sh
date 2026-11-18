#!/usr/bin/env bash
# Runs 20261118120000_landing_explore_section.sql against a throwaway local
# Postgres holding the live home page layout, twice (it must be idempotent), then
# supabase/tests/landing-explore/assert-placement.sql: the Explore section sits
# just below the founder's note, everything after it (live and draft positions)
# moves down one, and no two sections share a position. It also runs the
# migration on an empty table and on one with no founder's note, where it must
# insert nothing.
#
#   ./scripts/check-landing-explore-sql.sh
#
# Needs a local Postgres 14+ (initdb, pg_ctl, psql). Not part of CI.
set -euo pipefail
cd "$(dirname "$0")/.."

BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
MIGRATION=supabase/migrations/20261118120000_landing_explore_section.sql

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

"${PSQL[@]}" -f supabase/tests/landing-explore/fixture.sql >/dev/null
for pass in 1 2; do
  "${PSQL[@]}" -1 -f "$MIGRATION" >/dev/null || { echo "FAIL: $MIGRATION (pass $pass)"; exit 1; }
done
"${PSQL[@]}" -t -A -f supabase/tests/landing-explore/assert-placement.sql

# The same migration with `public.landing_sections` resolving to each edge case.
for schema in empty_case no_founder_case; do
  sed "s/public\.landing_sections/$schema.landing_sections/g" "$MIGRATION" | "${PSQL[@]}" -1 >/dev/null
  n=$("${PSQL[@]}" -t -A -c "select count(*) from $schema.landing_sections where slug = 'explore'")
  [ "$n" = 0 ] || { echo "FAIL: $schema got an Explore row"; exit 1; }
done
echo "landing explore sql ok (run twice; empty table and no founder's note left alone)"
