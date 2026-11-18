-- usage_events policies, plus the guarantee that an event cannot point at another household's item.
begin;
\ir _helpers.psql
select plan(11);

select tests.create_user('asha@example.test') as asha \gset
select tests.create_user('ravi@example.test') as ravi \gset
select tests.household_of(:'asha') as h_asha \gset
select tests.household_of(:'ravi') as h_ravi \gset

insert into public.items (id, household_id, name, location, expires_on, expiry_source, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', :'h_asha', 'Paneer', 'fridge', current_date + 3, 'foodkeeper', :'asha'),
  ('bbbbbbbb-0000-0000-0000-000000000001', :'h_ravi', 'Atta', 'pantry', current_date + 60, 'foodkeeper', :'ravi');

select tests.authenticate_as(:'asha');
select lives_ok(format($$
  insert into public.usage_events (id, household_id, item_id, kind, quantity)
  values ('eeeeeeee-0000-0000-0000-000000000001', %L, 'aaaaaaaa-0000-0000-0000-000000000001', 'used', 1)
$$, :'h_asha'), 'member can log usage on her item');
select is((select count(*)::int from public.usage_events), 1, 'member sees her household''s events');
select is(tests.rowcount($$update public.usage_events set quantity = 2 where id = 'eeeeeeee-0000-0000-0000-000000000001'$$),
  1::bigint, 'member can update her event');
select throws_ok(format($$
  insert into public.usage_events (household_id, item_id, kind) values (%L, 'bbbbbbbb-0000-0000-0000-000000000001', 'binned')
$$, :'h_ravi'), '42501', null, 'member cannot log events in another household');
select throws_ok(format($$
  insert into public.usage_events (household_id, item_id, kind) values (%L, 'bbbbbbbb-0000-0000-0000-000000000001', 'binned')
$$, :'h_asha'), '23503', null, 'event cannot reference another household''s item');

select tests.authenticate_as(:'ravi');
select is((select count(*)::int from public.usage_events where household_id = :'h_asha'), 0, 'non-member sees no events');
select is(tests.rowcount($$update public.usage_events set quantity = 9 where id = 'eeeeeeee-0000-0000-0000-000000000001'$$),
  0::bigint, 'non-member cannot update events');
select is(tests.rowcount($$delete from public.usage_events where id = 'eeeeeeee-0000-0000-0000-000000000001'$$),
  0::bigint, 'non-member cannot delete events');
select throws_ok(format($$
  insert into public.usage_events (household_id, item_id, kind) values (%L, 'aaaaaaaa-0000-0000-0000-000000000001', 'binned')
$$, :'h_asha'), '42501', null, 'non-member cannot insert events');

select tests.as_anon();
select throws_ok('select * from public.usage_events', '42501', null, 'anon cannot read events');

select tests.authenticate_as(:'asha');
select is(tests.rowcount($$delete from public.usage_events where id = 'eeeeeeee-0000-0000-0000-000000000001'$$),
  1::bigint, 'member can delete her event');

reset role;
select * from finish();
rollback;
