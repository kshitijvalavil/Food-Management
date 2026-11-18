-- households + household_members policies, and the signup trigger.
begin;
\ir _helpers.psql
select plan(24);

select tests.create_user('asha@example.test', '{"household_name": "Asha''s kitchen"}') as asha \gset
select tests.create_user('ravi@example.test') as ravi \gset
select tests.create_user('meera@example.test') as meera \gset
select tests.household_of(:'asha') as h_asha \gset
select tests.household_of(:'ravi') as h_ravi \gset

-- handle_new_user
select isnt(:'h_asha'::uuid, null, 'signup creates a household for the new user');
select is((select name from public.households where id = :'h_asha'), 'Asha''s kitchen', 'household name comes from signup metadata');
select is((select name from public.households where id = :'h_ravi'), 'My kitchen', 'default household name');
select is((select role from public.household_members where household_id = :'h_asha' and user_id = :'asha'), 'owner', 'new user is the owner');
select is((select count(*)::int from public.household_members where user_id = :'asha'), 1, 'exactly one membership per new user');

-- Asha (owner of h_asha)
select tests.authenticate_as(:'asha');
select results_eq('select id from public.households', format('values (%L::uuid)', :'h_asha'), 'member sees only her own household');
select is((select count(*)::int from public.household_members where household_id = :'h_ravi'), 0, 'member cannot see another household''s members');
select is(tests.rowcount(format('update public.households set name = %L where id = %L', 'Asha home', :'h_asha')), 1::bigint, 'member can rename her household');
select is(tests.rowcount(format('update public.households set name = %L where id = %L', 'hacked', :'h_ravi')), 0::bigint, 'non-member cannot rename another household');
select is(tests.rowcount(format('delete from public.households where id = %L', :'h_ravi')), 0::bigint, 'non-member cannot delete another household');
select throws_ok('insert into public.households (name) values (''new'')', '42501', null, 'authenticated cannot create households directly');

-- Owner adds Meera as a member
select lives_ok(format('insert into public.household_members (household_id, user_id, role) values (%L, %L, ''member'')', :'h_asha', :'meera'),
  'owner can add a member');
-- Non-member Asha cannot add herself to Ravi's household
select throws_ok(format('insert into public.household_members (household_id, user_id, role) values (%L, %L, ''owner'')', :'h_ravi', :'asha'),
  '42501', null, 'non-member cannot join another household');

-- Meera (member, not owner)
select tests.authenticate_as(:'meera');
select is((select count(*)::int from public.household_members where household_id = :'h_asha'), 2, 'new member sees both members of the shared household');
select is((select count(*)::int from public.households), 2, 'member of two households sees both');
select throws_ok(format('insert into public.household_members (household_id, user_id, role) values (%L, %L, ''member'')', :'h_asha', :'ravi'),
  '42501', null, 'a non-owner member cannot add people');
select is(tests.rowcount(format('update public.household_members set role = ''owner'' where household_id = %L and user_id = %L', :'h_asha', :'meera')),
  0::bigint, 'a non-owner member cannot promote herself');
select is(tests.rowcount(format('delete from public.households where id = %L', :'h_asha')), 0::bigint, 'a non-owner member cannot delete the household');
select is(tests.rowcount(format('delete from public.household_members where household_id = %L and user_id = %L', :'h_asha', :'asha')),
  0::bigint, 'a non-owner member cannot remove the owner');
select is(tests.rowcount(format('delete from public.household_members where household_id = %L and user_id = %L', :'h_asha', :'meera')),
  1::bigint, 'a member can leave a household');

-- Ravi: sees nothing of Asha's
select tests.authenticate_as(:'ravi');
select is((select count(*)::int from public.households where id = :'h_asha'), 0, 'non-member sees no other household');

-- anon
select tests.as_anon();
select throws_ok('select * from public.households', '42501', null, 'anon cannot read households');
select throws_ok('select * from public.household_members', '42501', null, 'anon cannot read memberships');

-- Owner can delete her own household
select tests.authenticate_as(:'asha');
select is(tests.rowcount(format('delete from public.households where id = %L', :'h_asha')), 1::bigint, 'owner can delete her household');

reset role;
select * from finish();
rollback;
