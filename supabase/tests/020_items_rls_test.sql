-- items policies: members read/write their household's rows; nobody else sees or touches them.
begin;
\ir _helpers.psql
select plan(16);

select tests.create_user('asha@example.test') as asha \gset
select tests.create_user('ravi@example.test') as ravi \gset
select tests.household_of(:'asha') as h_asha \gset
select tests.household_of(:'ravi') as h_ravi \gset

-- Asha (member of h_asha)
select tests.authenticate_as(:'asha');

select lives_ok(format($$
  insert into public.items (id, household_id, name, quantity, unit, location, expires_on, expiry_source, confidence, shelf_life_id)
  values ('11111111-1111-1111-1111-111111111111', %L, 'Toned milk', 2, 'pack', 'fridge', current_date + 2, 'foodkeeper', 0.92, 3)
$$, :'h_asha'), 'member can add an item to her household');

select is((select created_by from public.items where id = '11111111-1111-1111-1111-111111111111'), :'asha'::uuid,
  'created_by defaults to the signed-in user');
select is((select count(*)::int from public.items), 1, 'member sees her household''s items');
select is(tests.rowcount($$update public.items set quantity = 1, status = 'active' where id = '11111111-1111-1111-1111-111111111111'$$),
  1::bigint, 'member can update her item');

select throws_ok(format($$
  insert into public.items (household_id, name, location, expires_on, expiry_source)
  values (%L, 'Sneaky', 'pantry', current_date, 'printed')
$$, :'h_ravi'), '42501', null, 'member cannot insert into another household');

select throws_ok(format($$
  insert into public.items (household_id, name, location, expires_on, expiry_source, created_by)
  values (%L, 'Spoofed', 'pantry', current_date, 'printed', %L)
$$, :'h_asha', :'ravi'), '42501', null, 'member cannot spoof created_by');

select throws_ok(format($$
  update public.items set household_id = %L where id = '11111111-1111-1111-1111-111111111111'
$$, :'h_ravi'), '42501', null, 'member cannot move an item into another household');

select throws_ok(format($$
  insert into public.items (household_id, name, location, expires_on)
  values (%L, 'No source', 'pantry', current_date)
$$, :'h_asha'), '23502', null, 'an expiry date without expiry_source is rejected');

-- Ravi (non-member of h_asha)
select tests.authenticate_as(:'ravi');
select is((select count(*)::int from public.items), 0, 'non-member sees no items');
select is((select count(*)::int from public.items where household_id = :'h_asha'), 0, 'non-member cannot read by household_id');
select is(tests.rowcount($$update public.items set name = 'gone' where id = '11111111-1111-1111-1111-111111111111'$$),
  0::bigint, 'non-member cannot update');
select is(tests.rowcount($$delete from public.items where id = '11111111-1111-1111-1111-111111111111'$$),
  0::bigint, 'non-member cannot delete');
select throws_ok(format($$
  insert into public.items (household_id, name, location, expires_on, expiry_source)
  values (%L, 'Intruder', 'pantry', current_date, 'printed')
$$, :'h_asha'), '42501', null, 'non-member cannot insert');

-- anon
select tests.as_anon();
select throws_ok('select * from public.items', '42501', null, 'anon cannot read items');

-- Asha deletes, and the item is really still there before that
reset role;
select is((select name from public.items where id = '11111111-1111-1111-1111-111111111111'), 'Toned milk', 'non-member writes had no effect');
select tests.authenticate_as(:'asha');
select is(tests.rowcount($$delete from public.items where id = '11111111-1111-1111-1111-111111111111'$$),
  1::bigint, 'member can delete her item');

reset role;
select * from finish();
rollback;
