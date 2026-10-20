#!/usr/bin/env bash
# Runs the Shopify customer import migrations (PRD-shopify-customer-migration,
# slices 02 and 03) against a throwaway local Postgres holding a stand-in for
# the live schema, twice (they must be idempotent), then the assertions in
# supabase/tests/customer-import/: the SQL function decides the agreement
# fixture's rows exactly as the TS preview did (cases.json, written by
# lib/customer-migration/__tests__/sql-agreement.test.ts), a merge never
# changes what the platform owns, a chunk sent twice is refused, a stopped
# batch resumes and reconciles, undo keeps claimed and referenced rows and
# restores the rest, and only the service role can run any of it.
#
#   ./scripts/check-customer-import-sql.sh
#
# Needs a local Postgres 14+ (initdb, pg_ctl, psql). Not part of CI.
set -euo pipefail
cd "$(dirname "$0")/.."

BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
MIGRATIONS=(
  supabase/migrations/20261020100000_customer_import.sql
  supabase/migrations/20261020110000_customer_import_apply.sql
  supabase/migrations/20261020110100_customer_addresses_country_sg.sql
)
ASSERTS=(supabase/tests/customer-import/assert-*.sql)

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

"${PSQL[@]}" -f supabase/tests/customer-import/fixture.sql >/dev/null
for pass in 1 2; do
  for m in "${MIGRATIONS[@]}"; do
    "${PSQL[@]}" -1 -f "$m" >/dev/null || { echo "FAIL: $m (pass $pass)"; exit 1; }
  done
done
for a in "${ASSERTS[@]}"; do
  "${PSQL[@]}" -t -A -f "$a" || { echo "FAIL: $a"; exit 1; }
done
echo "customer import sql ok (${#MIGRATIONS[@]} migrations, run twice; ${#ASSERTS[@]} assert files)"
