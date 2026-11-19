-- ShelfLife core schema (Sprint 1). Contract: docs/CONTRACTS.md, shared/schema.ts.
-- RLS and policies live in 20261118000200_rls.sql; nothing here is reachable
-- by anon/authenticated until that migration enables RLS on every table.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------- enums
create type public.location as enum ('fridge', 'freezer', 'pantry');
create type public.expiry_source as enum ('printed', 'foodkeeper', 'ai_estimate');

-- ---------------------------------------------------------------- households
create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'My kitchen' check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_id_idx on public.household_members (user_id);

-- ---------------------------------------------------------------- shelf_life (FoodKeeper / curated reference data)
-- Immutable wrapper so the generated search column is allowed (array_to_string is only STABLE).
create function public.shelf_life_search_text(p_name text, p_keywords text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(p_name || ' ' || coalesce(pg_catalog.array_to_string(p_keywords, ' '), ''))
$$;

create table public.shelf_life (
  id               integer primary key,
  name             text not null,
  category         text not null,
  keywords         text[] not null default '{}',
  default_location public.location not null,
  pantry_min_days  integer check (pantry_min_days >= 0),
  pantry_max_days  integer check (pantry_max_days >= 0),
  fridge_min_days  integer check (fridge_min_days >= 0),
  fridge_max_days  integer check (fridge_max_days >= 0),
  freezer_min_days integer check (freezer_min_days >= 0),
  freezer_max_days integer check (freezer_max_days >= 0),
  tips             text,
  source           text not null default 'foodkeeper' check (source in ('foodkeeper', 'curated')),
  search_text      text generated always as (public.shelf_life_search_text(name, keywords)) stored,
  check (pantry_min_days  is null or pantry_max_days  is null or pantry_min_days  <= pantry_max_days),
  check (fridge_min_days  is null or fridge_max_days  is null or fridge_min_days  <= fridge_max_days),
  check (freezer_min_days is null or freezer_max_days is null or freezer_min_days <= freezer_max_days)
);
comment on column public.shelf_life.source is
  'foodkeeper = USDA FSIS FoodKeeper row; curated = hand-authored placeholder (see supabase/seed/README.md)';
comment on column public.shelf_life.search_text is 'lower(name + keywords), trigram-indexed for search_food()';

create index shelf_life_name_trgm_idx        on public.shelf_life using gin (name extensions.gin_trgm_ops);
create index shelf_life_search_text_trgm_idx on public.shelf_life using gin (search_text extensions.gin_trgm_ops);
create index shelf_life_keywords_idx         on public.shelf_life using gin (keywords);

-- ---------------------------------------------------------------- products (Open Food Facts barcode cache)
create table public.products (
  barcode       text primary key check (barcode ~ '^[0-9]{8,14}$'),
  name          text,
  brand         text,
  pack_size     text,
  kcal_per_100g numeric check (kcal_per_100g >= 0),
  raw           jsonb,
  fetched_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- items
create table public.items (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 80),
  quantity       numeric not null default 1 check (quantity >= 0 and quantity <= 1000),
  unit           text not null default 'count'
                 check (unit in ('count', 'g', 'kg', 'ml', 'l', 'pack', 'bunch', 'loaf', 'dozen')),
  location       public.location not null,
  added_at       timestamptz not null default now(),
  expires_on     date not null,
  expiry_source  public.expiry_source not null,
  confidence     real check (confidence >= 0 and confidence <= 1),
  shelf_life_id  integer references public.shelf_life (id) on delete set null,
  barcode        text check (barcode ~ '^[0-9]{8,14}$'),
  kcal_per_unit  numeric check (kcal_per_unit >= 0),
  status         text not null default 'active' check (status in ('active', 'used', 'binned')),
  usual_quantity numeric check (usual_quantity >= 0),
  low_threshold  numeric check (low_threshold >= 0),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  -- lets usage_events reference (household_id, id) so an event can never point at another household's item
  unique (household_id, id)
);
create index items_household_status_expires_idx on public.items (household_id, status, expires_on);
create index items_shelf_life_id_idx on public.items (shelf_life_id);

-- ---------------------------------------------------------------- usage_events
create table public.usage_events (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id      uuid not null,
  kind         text not null check (kind in ('added', 'used', 'binned', 'moved')),
  quantity     numeric check (quantity >= 0),
  at           timestamptz not null default now(),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (household_id, item_id) references public.items (household_id, id) on delete cascade
);
create index usage_events_household_at_idx on public.usage_events (household_id, at desc);
create index usage_events_item_id_idx on public.usage_events (item_id);

-- ---------------------------------------------------------------- ai_usage (rate-limit counter, written by service role)
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default current_date,
  calls   integer not null default 0 check (calls >= 0),
  primary key (user_id, day)
);
