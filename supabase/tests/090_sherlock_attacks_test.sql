-- Sherlock Bugs: adversarial tests for the Sprint 1 schema.
-- Every assertion states the SECURE behaviour. A failing test here is a migration
-- bug to fix in supabase/migrations/, not a test to relax.
begin;
\ir _helpers.psql
select plan(82);

-- Run a statement as the current role; return its row count, or -1 if it raised.
create or replace function tests.try_rowcount(p_sql text)
returns bigint
language plpgsql
security invoker
as $$
declare
  n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
exception when others then
  return -1;
end
$$;
grant execute on function tests.try_rowcount(text) to anon, authenticated, service_role;

-- Superuser lookups that bypass RLS, for checking what really happened.
create or replace function tests.item_created_by(p_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select created_by from public.items where id = p_id $$;
create or replace function tests.event_created_by(p_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select created_by from public.usage_events where id = p_id $$;
create or replace function tests.role_of(p_h uuid, p_u uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.household_members where household_id = p_h and user_id = p_u $$;
create or replace function tests.count_rows(p_table regclass) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare n bigint; begin execute format('select count(*) from %s', p_table) into n; return n; end $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ================================================================ fixtures
select tests.create_user('a@example.test') as ua \gset
select tests.create_user('b@example.test') as ub \gset
select tests.create_user('m@example.test') as um \gset
select tests.household_of(:'ua') as ha \gset
select tests.household_of(:'ub') as hb \gset

-- A: an item, an event, a scan. M joins A's household as a plain member.
select tests.authenticate_as(:'ua');
insert into public.items (id, household_id, name, quantity, unit, location, expires_on, expiry_source)
values ('aaaaaaaa-0000-4000-8000-000000000001', :'ha', 'Paneer', 1, 'pack', 'fridge', current_date + 3, 'printed');
insert into public.usage_events (id, household_id, item_id, kind, quantity)
values ('aaaaaaaa-0000-4000-8000-0000000000e1', :'ha', 'aaaaaaaa-0000-4000-8000-000000000001', 'added', 1);
insert into storage.objects (bucket_id, name, owner)
values ('scans', :'ha' || '/aaaaaaaa-0000-4000-8000-0000000000f1.jpg', :'ua');
insert into public.household_members (household_id, user_id, role) values (:'ha', :'um', 'member');

-- B: an item of his own.
select tests.authenticate_as(:'ub');
insert into public.items (id, household_id, name, location, expires_on, expiry_source)
values ('bbbbbbbb-0000-4000-8000-000000000001', :'hb', 'Dahi', 'fridge', current_date + 2, 'foodkeeper');

-- ================================================================ 1. B against A's rows
select tests.authenticate_as(:'ub');
select is((select count(*)::int from public.items where household_id = :'ha'), 0, 'B cannot read A''s items');
select is((select count(*)::int from public.usage_events where household_id = :'ha'), 0, 'B cannot read A''s usage_events');
select is((select count(*)::int from public.household_members where household_id = :'ha'), 0, 'B cannot read A''s household_members');
select is((select count(*)::int from public.households where id = :'ha'), 0, 'B cannot read A''s household');
select is((select count(*)::int from storage.objects where name like :'ha' || '/%'), 0, 'B cannot read A''s scans');

select is(tests.try_rowcount($$update public.items set name = 'x' where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$), 0::bigint, 'B cannot update A''s item');
select is(tests.try_rowcount($$delete from public.items where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$), 0::bigint, 'B cannot delete A''s item');
select is(tests.try_rowcount($$update public.usage_events set quantity = 99 where id = 'aaaaaaaa-0000-4000-8000-0000000000e1'$$), 0::bigint, 'B cannot update A''s usage_event');
select is(tests.try_rowcount($$delete from public.usage_events where id = 'aaaaaaaa-0000-4000-8000-0000000000e1'$$), 0::bigint, 'B cannot delete A''s usage_event');
select is(tests.try_rowcount(format($$update public.household_members set role = 'member' where household_id = %L$$, :'ha')), 0::bigint, 'B cannot update A''s household_members');
select is(tests.try_rowcount(format($$delete from public.household_members where household_id = %L$$, :'ha')), 0::bigint, 'B cannot delete A''s household_members');
select is(tests.try_rowcount(format($$update public.households set name = 'pwned' where id = %L$$, :'ha')), 0::bigint, 'B cannot rename A''s household');
select is(tests.try_rowcount(format($$delete from public.households where id = %L$$, :'ha')), 0::bigint, 'B cannot delete A''s household');
select is(tests.try_rowcount(format($$update storage.objects set metadata = '{"x":1}' where name like %L$$, :'ha' || '/%')), 0::bigint, 'B cannot update A''s scan');
select is(tests.try_rowcount(format($$delete from storage.objects where name like %L$$, :'ha' || '/%')), 0::bigint, 'B cannot delete A''s scan');
select is(tests.count_rows('public.items'), 2::bigint, 'after B''s attempts both items still exist');

-- B joining A's household himself
select throws_ok(format($$insert into public.household_members (household_id, user_id, role) values (%L, %L, 'member')$$, :'ha', :'ub'),
  '42501', null, 'B cannot add himself to A''s household');
select throws_ok(format($$insert into public.household_members (household_id, user_id, role) values (%L, %L, 'owner')$$, :'ha', :'ub'),
  '42501', null, 'B cannot add himself to A''s household as owner');

-- ================================================================ 2. cross-household inserts and moves
select throws_ok(format($$insert into public.items (household_id, name, location, expires_on, expiry_source) values (%L, 'Planted', 'pantry', current_date, 'printed')$$, :'ha'),
  '42501', null, 'B cannot insert an item into A''s household');
select throws_ok(format($$update public.items set household_id = %L where id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, :'ha'),
  '42501', null, 'B cannot move his item into A''s household');

-- usage_event pointing at another household's item
select throws_ok(format($$insert into public.usage_events (household_id, item_id, kind) values (%L, 'aaaaaaaa-0000-4000-8000-000000000001', 'binned')$$, :'hb'),
  '23503', null, 'event in B''s household cannot reference A''s item (composite FK)');
select throws_ok(format($$insert into public.usage_events (household_id, item_id, kind) values (%L, 'aaaaaaaa-0000-4000-8000-000000000001', 'binned')$$, :'ha'),
  '42501', null, 'B cannot write an event into A''s household');
select throws_ok(format($$insert into public.usage_events (household_id, item_id, kind) values (%L, 'bbbbbbbb-0000-4000-8000-000000000001', 'used')$$, :'ha'),
  '42501', null, 'B cannot write an event into A''s household for his own item');

-- ================================================================ 3. inserting into households directly
select throws_ok($$insert into public.households (name) values ('Squat')$$, '42501', null, 'authenticated cannot insert into households');
select throws_ok(format($$insert into public.households (id, name) values (%L, 'Collide')$$, :'ha'), '42501', null, 'authenticated cannot insert a household with a chosen id');

-- ================================================================ 4. role escalation (M is a plain member of A)
select tests.authenticate_as(:'um');
select is((select count(*)::int from public.items where household_id = :'ha'), 1, 'sanity: M (member) sees A''s item');
select is(tests.try_rowcount(format($$update public.household_members set role = 'owner' where household_id = %L and user_id = %L$$, :'ha', :'um')), 0::bigint,
  'M cannot promote himself to owner');
select is(tests.role_of(:'ha', :'um'), 'member', 'M is still a member');
select is(tests.try_rowcount(format($$update public.household_members set role = 'member' where household_id = %L and user_id = %L$$, :'ha', :'ua')), 0::bigint,
  'M cannot demote the owner');
select is(tests.try_rowcount(format($$delete from public.household_members where household_id = %L and user_id = %L$$, :'ha', :'ua')), 0::bigint,
  'M cannot remove the owner');
select throws_ok(format($$insert into public.household_members (household_id, user_id, role) values (%L, %L, 'owner')$$, :'ha', :'ub'),
  '42501', null, 'M cannot invite someone as owner');
select is(tests.try_rowcount(format($$delete from public.households where id = %L$$, :'ha')), 0::bigint, 'M (non-owner) cannot delete the household');
-- leave and rejoin as owner
select is(tests.try_rowcount(format($$delete from public.household_members where household_id = %L and user_id = %L$$, :'ha', :'um')), 1::bigint,
  'M can leave');
select throws_ok(format($$insert into public.household_members (household_id, user_id, role) values (%L, %L, 'owner')$$, :'ha', :'um'),
  '42501', null, 'after leaving, M cannot rejoin as owner');
reset role;
insert into public.household_members (household_id, user_id, role) values (:'ha', :'um', 'member');

-- ================================================================ 5. spoofing created_by
select tests.authenticate_as(:'um');
select throws_ok(format($$insert into public.items (household_id, name, location, expires_on, expiry_source, created_by) values (%L, 'Spoof', 'pantry', current_date, 'printed', %L)$$, :'ha', :'ua'),
  '42501', null, 'M cannot insert an item with created_by = A');
select throws_ok(format($$insert into public.usage_events (household_id, item_id, kind, created_by) values (%L, 'aaaaaaaa-0000-4000-8000-000000000001', 'used', %L)$$, :'ha', :'ua'),
  '42501', null, 'M cannot insert an event with created_by = A');
select throws_ok(format($$insert into public.items (household_id, name, location, expires_on, expiry_source, created_by) values (%L, 'Null author', 'pantry', current_date, 'printed', null)$$, :'ha'),
  '42501', null, 'M cannot insert an item with created_by = null');
-- the UPDATE path: policies only check is_member(household_id), not created_by
select tests.try_rowcount(format($$update public.items set created_by = %L where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, :'um')) as spoof_item_n \gset
select is(tests.item_created_by('aaaaaaaa-0000-4000-8000-000000000001'), :'ua'::uuid, 'created_by of an item cannot be rewritten by UPDATE');
select tests.try_rowcount(format($$update public.usage_events set created_by = %L where id = 'aaaaaaaa-0000-4000-8000-0000000000e1'$$, :'um')) as spoof_event_n \gset
select is(tests.event_created_by('aaaaaaaa-0000-4000-8000-0000000000e1'), :'ua'::uuid, 'created_by of a usage_event cannot be rewritten by UPDATE');

-- ================================================================ 6. anon gets nothing
select tests.as_anon();
select throws_ok('select 1 from public.households limit 1',        '42501', null, 'anon: households');
select throws_ok('select 1 from public.household_members limit 1', '42501', null, 'anon: household_members');
select throws_ok('select 1 from public.items limit 1',             '42501', null, 'anon: items');
select throws_ok('select 1 from public.usage_events limit 1',      '42501', null, 'anon: usage_events');
select throws_ok('select 1 from public.shelf_life limit 1',        '42501', null, 'anon: shelf_life');
select throws_ok('select 1 from public.products limit 1',          '42501', null, 'anon: products');
select throws_ok('select 1 from public.ai_usage limit 1',          '42501', null, 'anon: ai_usage');
select throws_ok($$insert into public.households (name) values ('anon')$$, '42501', null, 'anon cannot insert a household');
select throws_ok($$select public.search_food('milk')$$, '42501', null, 'anon cannot call search_food');
select throws_ok(format($$select public.is_member(%L)$$, :'ha'), '42501', null, 'anon cannot call is_member');
select throws_ok(format($$select public.bump_ai_usage(%L)$$, :'ua'), '42501', null, 'anon cannot call bump_ai_usage');
select is((select count(*)::int from storage.objects), 0, 'anon sees no storage objects');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('scans', %L)$$, :'ha' || '/anon.jpg'), '42501', null, 'anon cannot upload a scan');

-- ================================================================ 7. server-owned tables and functions
select tests.authenticate_as(:'ub');
select throws_ok($$insert into public.products (barcode, name) values ('89012345', 'Fake')$$, '42501', null, 'authenticated cannot insert products');
select throws_ok($$update public.products set name = 'x'$$, '42501', null, 'authenticated cannot update products');
select throws_ok($$delete from public.products$$, '42501', null, 'authenticated cannot delete products');
select throws_ok($$update public.shelf_life set fridge_max_days = 999$$, '42501', null, 'authenticated cannot update shelf_life');
select throws_ok(format($$insert into public.ai_usage (user_id, day, calls) values (%L, current_date, 0)$$, :'ub'), '42501', null, 'authenticated cannot insert ai_usage');
select throws_ok($$update public.ai_usage set calls = 0$$, '42501', null, 'authenticated cannot reset ai_usage');
select throws_ok($$delete from public.ai_usage$$, '42501', null, 'authenticated cannot delete ai_usage');
select throws_ok(format($$select public.bump_ai_usage(%L)$$, :'ub'), '42501', null, 'authenticated cannot call bump_ai_usage');
select throws_ok(format($$select public.bump_ai_usage(%L, current_date - 1)$$, :'ua'), '42501', null, 'authenticated cannot bump someone else''s counter');

-- TRUNCATE ignores RLS entirely, so no API role may hold it on a household table.
select ok(not has_table_privilege('authenticated', 'public.items', 'TRUNCATE'), 'authenticated has no TRUNCATE on items');
select ok(not has_table_privilege('authenticated', 'public.usage_events', 'TRUNCATE'), 'authenticated has no TRUNCATE on usage_events');
select ok(not has_table_privilege('authenticated', 'public.household_members', 'TRUNCATE'), 'authenticated has no TRUNCATE on household_members');

-- ================================================================ 8. search_food with hostile input
select lives_ok($$select * from public.search_food($q$'; drop table public.items; --$q$)$$, 'search_food survives SQL-injection-looking input');
select ok(to_regclass('public.items') is not null, 'items table still exists');
select lives_ok($$select * from public.search_food(repeat('a', 100000))$$, 'search_food survives a 100k-char input');
select ok((select count(*) from public.search_food(repeat('palak ', 20000))) <= 10, 'long input still returns at most 10 rows');
select is((select count(*)::int from public.search_food('%')), 0, 'a bare % is a literal, not a wildcard');
select is((select count(*)::int from public.search_food('   ')), 0, 'blank query returns nothing');
select ok((select count(*) from public.search_food('milk')) between 1 and 10, 'sanity: search_food(''milk'') finds rows');

-- ================================================================ 9. storage path tricks (A is the uploader)
select tests.authenticate_as(:'ua');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('scans', %L)$$, '/' || :'ha' || '/x.jpg'),
  '42501', null, 'empty first segment is denied');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('scans', %L)$$, :'hb' || '/x.jpg'),
  '42501', null, 'another household''s uuid is denied');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('scans', %L)$$, '../' || :'ha' || '/x.jpg'),
  '42501', null, 'a leading .. segment is denied');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('scans', %L)$$, :'ha' || '/../' || :'hb' || '/x.jpg'),
  '42501', null, 'a path that climbs from own folder into another household''s is denied');
select throws_ok(format($$update storage.objects set name = %L where name = %L$$, :'hb' || '/moved.jpg', :'ha' || '/aaaaaaaa-0000-4000-8000-0000000000f1.jpg'),
  '42501', null, 'A cannot move her scan into B''s folder');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('avatars', %L)$$, :'ha' || '/x.jpg'),
  '42501', null, 'the scans policies do not open other buckets');
reset role;
select is((select public from storage.buckets where id = 'scans'), false, 'scans bucket is private');

-- ================================================================ 10. catalogue checks
select is_empty($$
  select p.proname from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and not coalesce(p.proconfig @> array['search_path=""'] or p.proconfig @> array['search_path='], false)
$$, 'every SECURITY DEFINER function in public pins search_path to empty');
select is_empty($$
  select c.relname from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity
$$, 'RLS is enabled on every table in public');
select is_empty($$
  select c.relname from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
    and not exists (select 1 from pg_policy pol where pol.polrelid = c.oid)
$$, 'every table in public has at least one policy');
select is_empty($$
  select c.relname from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
$$, 'no views in public (they would bypass RLS unless security_invoker)');

select * from finish();
rollback;
