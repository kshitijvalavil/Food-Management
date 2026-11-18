#!/usr/bin/env bash
# Run the DB tests on a plain local PostgreSQL (no Docker / Supabase CLI needed).
# Needs: psql, pg_prove, and the pgtap + pg_trgm extensions on the server
#   (Debian/Ubuntu: apt-get install postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl).
# Connection comes from the usual PG* env vars (PGHOST, PGPORT, PGUSER); the user must be a superuser.
# With Docker available, prefer the real thing: npx supabase db reset && npx supabase test db
set -euo pipefail

cd "$(dirname "$0")/../.."
DB="${TEST_DB:-shelflife_test}"

dropdb --if-exists "$DB"
createdb "$DB"

run() { echo "== $1"; psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }
run supabase/tests/_bootstrap_stub.sql
for f in supabase/migrations/*.sql; do run "$f"; done
run supabase/seed.sql

pg_prove -d "$DB" supabase/tests/*_test.sql
