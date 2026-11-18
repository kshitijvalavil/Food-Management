-- storage.objects policies for the private `scans` bucket ("{household_id}/{uuid}.jpg").
begin;
\ir _helpers.psql
select plan(10);

select tests.create_user('asha@example.test') as asha \gset
select tests.create_user('ravi@example.test') as ravi \gset
select tests.household_of(:'asha') as h_asha \gset
select tests.household_of(:'ravi') as h_ravi \gset

select tests.authenticate_as(:'asha');
select lives_ok(format($$insert into storage.objects (bucket_id, name, owner) values ('scans', %L, %L)$$,
  :'h_asha' || '/0b6f0e1e-0000-4000-8000-000000000001.jpg', :'asha'), 'member can upload into her household folder');
select is((select count(*)::int from storage.objects where bucket_id = 'scans'), 1, 'member can list her household''s scans');
select is(tests.rowcount(format($$update storage.objects set metadata = '{"a":1}' where name = %L$$,
  :'h_asha' || '/0b6f0e1e-0000-4000-8000-000000000001.jpg')), 1::bigint, 'member can update her scan');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('scans', %L)$$,
  :'h_ravi' || '/x.jpg'), '42501', null, 'member cannot upload into another household folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('scans', 'not-a-uuid/x.jpg')$$,
  '42501', null, 'malformed folder is denied, not an error');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('scans', 'x.jpg')$$,
  '42501', null, 'object at bucket root is denied');

select tests.authenticate_as(:'ravi');
select is((select count(*)::int from storage.objects where bucket_id = 'scans'), 0, 'non-member sees no scans');
select is(tests.rowcount($$delete from storage.objects where bucket_id = 'scans'$$), 0::bigint, 'non-member cannot delete scans');

select tests.as_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'scans'), 0, 'anon sees no scans');

select tests.authenticate_as(:'asha');
select is(tests.rowcount($$delete from storage.objects where bucket_id = 'scans'$$), 1::bigint, 'member can delete her scan');

reset role;
select * from finish();
rollback;
