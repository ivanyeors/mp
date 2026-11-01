#!/usr/bin/env bash
# Runs the Fitting import migrations (ADR 0039) against a throwaway local
# Postgres holding a stand-in for the live schema, each twice (each must be
# idempotent), after the Shopify import migrations it sits beside, then the
# assertions in supabase/tests/fitting-import/: rows attach by email, then by
# mobile, one person's visits land on one Customer, a match fills only nulls,
# the same file twice creates nothing, a chunk out of order is refused, the
# batch reconciles, undo removes only what nobody has signed in to or
# referenced, phone_e164 agrees with normalizePhone,
# and only the service role can run any of it.
#
#   ./scripts/check-fitting-import-sql.sh
#
# Needs a local Postgres 14+ (initdb, pg_ctl, psql). Not part of CI.
set -euo pipefail
cd "$(dirname "$0")/.."

BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
BEFORE=(
  supabase/migrations/20261020100000_customer_import.sql
  supabase/migrations/20261020110000_customer_import_apply.sql
)
MIGRATIONS=(
  supabase/migrations/20261031120000_customer_fittings.sql
  supabase/migrations/20261101100000_fitting_import_one_person.sql
)
ASSERTS=(supabase/tests/fitting-import/assert-*.sql)

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

"${PSQL[@]}" -f supabase/tests/customer-import/fixture.sql >/dev/null
for m in "${BEFORE[@]}"; do
  "${PSQL[@]}" -1 -f "$m" >/dev/null || { echo "FAIL: $m"; exit 1; }
done
# Each one twice in a row, in order: a migration re-run must change nothing,
# and a later one may replace what an earlier one made.
for m in "${MIGRATIONS[@]}"; do
  for pass in 1 2; do
    "${PSQL[@]}" -1 -f "$m" >/dev/null || { echo "FAIL: $m (pass $pass)"; exit 1; }
  done
done
for a in "${ASSERTS[@]}"; do
  "${PSQL[@]}" -t -A -f "$a" || { echo "FAIL: $a"; exit 1; }
done
echo "fitting import sql ok (${#MIGRATIONS[@]} migrations, each run twice; ${#ASSERTS[@]} assert files)"
