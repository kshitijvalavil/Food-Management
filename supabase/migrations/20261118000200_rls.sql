-- Row level security for every public table, membership helpers, and the
-- signup trigger that gives each new user a household they own.

-- ---------------------------------------------------------------- helpers
-- SECURITY DEFINER so policies can check membership without recursing into
-- household_members' own RLS. search_path is pinned to '' (everything qualified).
create function public.is_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = (select auth.uid())
  )
$$;

create function public.is_owner(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
$$;

revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.is_owner(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated, service_role;
grant execute on function public.is_owner(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- enable RLS everywhere
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.shelf_life        enable row level security;
alter table public.products          enable row level security;
alter table public.items             enable row level security;
alter table public.usage_events      enable row level security;
alter table public.ai_usage          enable row level security;

-- The app always signs in; anon gets no table access at all (defence in depth on top of RLS).
revoke all on table
  public.households, public.household_members, public.shelf_life, public.products,
  public.items, public.usage_events, public.ai_usage
from anon;

-- Reference / server-owned tables: authenticated may only read.
revoke insert, update, delete, truncate on table public.shelf_life, public.products from authenticated;
revoke all on table public.ai_usage from authenticated;
grant select on table public.ai_usage to authenticated;
-- Households are created by the signup trigger (and later by an invite RPC), never directly.
revoke insert, truncate on table public.households from authenticated;

-- ---------------------------------------------------------------- households
create policy households_select_member on public.households
  for select to authenticated
  using (public.is_member(id));

create policy households_update_member on public.households
  for update to authenticated
  using (public.is_member(id))
  with check (public.is_member(id));

create policy households_delete_owner on public.households
  for delete to authenticated
  using (public.is_owner(id));

-- ---------------------------------------------------------------- household_members
create policy household_members_select_member on public.household_members
  for select to authenticated
  using (public.is_member(household_id));

-- Only an owner can add people (Sprint 2 invite flow builds on this).
create policy household_members_insert_owner on public.household_members
  for insert to authenticated
  with check (public.is_owner(household_id));

create policy household_members_update_owner on public.household_members
  for update to authenticated
  using (public.is_owner(household_id))
  with check (public.is_owner(household_id));

-- An owner can remove others; anyone can leave (remove their own row).
create policy household_members_delete_owner_or_self on public.household_members
  for delete to authenticated
  using (
    public.is_owner(household_id)
    or user_id = (select auth.uid())
  );

-- ---------------------------------------------------------------- shelf_life / products (read-only reference data)
create policy shelf_life_select_authenticated on public.shelf_life
  for select to authenticated
  using (true);

create policy products_select_authenticated on public.products
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------- items
create policy items_select_member on public.items
  for select to authenticated
  using (public.is_member(household_id));

create policy items_insert_member on public.items
  for insert to authenticated
  with check (
    public.is_member(household_id)
    and created_by = (select auth.uid())
  );

create policy items_update_member on public.items
  for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

create policy items_delete_member on public.items
  for delete to authenticated
  using (public.is_member(household_id));

-- ---------------------------------------------------------------- usage_events
create policy usage_events_select_member on public.usage_events
  for select to authenticated
  using (public.is_member(household_id));

create policy usage_events_insert_member on public.usage_events
  for insert to authenticated
  with check (
    public.is_member(household_id)
    and created_by = (select auth.uid())
  );

create policy usage_events_update_member on public.usage_events
  for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

create policy usage_events_delete_member on public.usage_events
  for delete to authenticated
  using (public.is_member(household_id));

-- ---------------------------------------------------------------- ai_usage
-- Writes are service-role only (service_role bypasses RLS). A user may read
-- their own counter so the app can show "n photo scans left today".
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Atomic increment for the edge-function rate limiter. Returns the new count.
create function public.bump_ai_usage(p_user_id uuid, p_day date default current_date)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.ai_usage as u (user_id, day, calls)
  values (p_user_id, p_day, 1)
  on conflict (user_id, day) do update set calls = u.calls + 1
  returning u.calls
$$;
revoke execute on function public.bump_ai_usage(uuid, date) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, date) to service_role;

-- ---------------------------------------------------------------- signup trigger
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'household_name', '')), '');
begin
  insert into public.households (name)
  values (coalesce(left(v_name, 80), 'My kitchen'))
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, new.id, 'owner');

  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
