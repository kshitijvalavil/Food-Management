-- TEST-ONLY bootstrap for running migrations + pgTAP on a plain PostgreSQL
-- (no Docker / no `supabase start`). It recreates the tiny slice of a Supabase
-- database our migrations depend on. NEVER apply this to a real Supabase project.
-- On a real Supabase database (`supabase test db` runs every file in this folder
-- through pg_prove/psql) it detects auth.users, changes NOTHING and just emits one
-- passing TAP line, so it can never replace Supabase's own auth/storage objects.
--
-- Usage (see supabase/tests/run_local.sh):
--   psql -f supabase/tests/_bootstrap_stub.sql; then each migration; then seed.sql

select (to_regclass('auth.users') is not null) as is_real_supabase \gset

\if :is_real_supabase
create extension if not exists pgtap with schema extensions;
select plan(1);
select pass('bootstrap stub skipped: running on a real Supabase database');
select * from finish();
\else

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

-- Supabase's default search_path for the postgres role.
do $$ begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end $$;
set search_path = "$user", public, extensions;

grant usage on schema public, extensions to anon, authenticated, service_role;
grant usage on schema auth, storage to anon, authenticated, service_role;

-- Supabase grants table/function/sequence privileges in public to the API roles by default.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ---------------------------------------------------------------- auth
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Same body as Supabase's auth.uid(): prefer the legacy per-claim GUC, else the claims JSON.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

-- ---------------------------------------------------------------- storage
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null unique,
  owner              uuid,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
-- Supabase grants the API roles full table privileges here and relies on RLS.
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- Same body as Supabase's storage.foldername(): every path segment except the file name.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

\endif
