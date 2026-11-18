-- Structural checks: RLS on every table, the expected policies, helpers, indexes, bucket, seed.
begin;
\ir _helpers.psql
select plan(30);

select tables_are('public',
  array['households', 'household_members', 'shelf_life', 'products', 'items', 'usage_events', 'ai_usage'],
  'public has exactly the contract tables');

select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0, 'RLS is enabled on every public table');

select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)),
  0, 'every public table has at least one policy');

select policies_are('public', 'households',
  array['households_select_member', 'households_update_member', 'households_delete_owner']);
select policies_are('public', 'household_members',
  array['household_members_select_member', 'household_members_insert_owner',
        'household_members_update_owner', 'household_members_delete_owner_or_self']);
select policies_are('public', 'shelf_life', array['shelf_life_select_authenticated']);
select policies_are('public', 'products', array['products_select_authenticated']);
select policies_are('public', 'items',
  array['items_select_member', 'items_insert_member', 'items_update_member', 'items_delete_member']);
select policies_are('public', 'usage_events',
  array['usage_events_select_member', 'usage_events_insert_member',
        'usage_events_update_member', 'usage_events_delete_member']);
select policies_are('public', 'ai_usage', array['ai_usage_select_own']);
select policies_are('storage', 'objects',
  array['scans_select_member', 'scans_insert_member', 'scans_update_member', 'scans_delete_member']);

select policy_roles_are('public', 'items', 'items_select_member', array['authenticated']);
select policy_roles_are('public', 'shelf_life', 'shelf_life_select_authenticated', array['authenticated']);

select enum_has_labels('public', 'location', array['fridge', 'freezer', 'pantry']);
select enum_has_labels('public', 'expiry_source', array['printed', 'foodkeeper', 'ai_estimate']);

select is_definer('public', 'is_member', array['uuid'], 'is_member is SECURITY DEFINER');
select is_definer('public', 'handle_new_user', array[]::text[], 'handle_new_user is SECURITY DEFINER');
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and not coalesce(p.proconfig, '{}') @> array['search_path=""']),
  0, 'every SECURITY DEFINER function in public pins search_path to empty');

select has_index('public', 'items', 'items_household_status_expires_idx',
  array['household_id', 'status', 'expires_on'], 'items(household_id, status, expires_on) index');
select has_index('public', 'shelf_life', 'shelf_life_name_trgm_idx', 'trigram index on shelf_life.name');
select has_index('public', 'shelf_life', 'shelf_life_search_text_trgm_idx', 'trigram index on name+keywords');

select trigger_is('auth', 'users', 'on_auth_user_created', 'public', 'handle_new_user');

select col_not_null('public', 'items', 'expiry_source', 'every item expiry carries a source');
select col_not_null('public', 'items', 'household_id', 'every item belongs to a household');
select col_type_is('public', 'items', 'expires_on', 'date', 'items.expires_on is a date');

select is((select public from storage.buckets where id = 'scans'), false, 'scans bucket exists and is private');

select ok((select count(*) from public.shelf_life) >= 100, 'shelf_life is seeded (>= 100 rows)');
select is(
  (select count(*)::int from public.shelf_life where source not in ('foodkeeper', 'curated')),
  0, 'every shelf_life row has a known source');
select ok(
  (select bool_and(k = lower(k)) from public.shelf_life, unnest(keywords) k),
  'all shelf_life keywords are lowercase');
select ok(
  exists (select 1 from public.shelf_life where 'palak' = any (keywords))
  and exists (select 1 from public.shelf_life where 'dahi' = any (keywords))
  and exists (select 1 from public.shelf_life where 'atta' = any (keywords))
  and exists (select 1 from public.shelf_life where 'methi' = any (keywords))
  and exists (select 1 from public.shelf_life where 'dhania' = any (keywords)),
  'Hindi keywords palak, dahi, atta, methi, dhania are present');

select * from finish();
rollback;
