-- shelf_life, products, ai_usage and search_food(): read rules and server-only writes.
begin;
\ir _helpers.psql
select plan(21);

select tests.create_user('asha@example.test') as asha \gset
select tests.create_user('ravi@example.test') as ravi \gset

insert into public.products (barcode, name, brand, pack_size, kcal_per_100g)
values ('8901262150019', 'Toned Milk', 'Test Dairy', '500 ml', 58);
insert into public.ai_usage (user_id, day, calls) values (:'asha', current_date, 3), (:'ravi', current_date, 7);

select tests.authenticate_as(:'asha');

-- shelf_life
select ok((select count(*) from public.shelf_life) >= 100, 'authenticated can read shelf_life');
select throws_ok($$insert into public.shelf_life (id, name, category, default_location) values (9999, 'x', 'x', 'pantry')$$,
  '42501', null, 'authenticated cannot insert shelf_life');
select throws_ok($$update public.shelf_life set name = 'x' where id = 1$$, '42501', null, 'authenticated cannot update shelf_life');
select throws_ok($$delete from public.shelf_life where id = 1$$, '42501', null, 'authenticated cannot delete shelf_life');

-- products
select is((select name from public.products where barcode = '8901262150019'), 'Toned Milk', 'authenticated can read products');
select throws_ok($$insert into public.products (barcode, name) values ('12345678', 'x')$$, '42501', null, 'authenticated cannot insert products');
select throws_ok($$update public.products set name = 'x'$$, '42501', null, 'authenticated cannot update products');
select throws_ok($$delete from public.products$$, '42501', null, 'authenticated cannot delete products');

-- ai_usage
select results_eq('select calls from public.ai_usage', 'values (3)', 'user sees only her own ai_usage counter');
select throws_ok(format($$insert into public.ai_usage (user_id, day, calls) values (%L, current_date + 1, 0)$$, :'asha'),
  '42501', null, 'authenticated cannot insert ai_usage');
select throws_ok($$update public.ai_usage set calls = 0$$, '42501', null, 'authenticated cannot reset ai_usage');
select throws_ok(format($$select public.bump_ai_usage(%L)$$, :'asha'), '42501', null, 'authenticated cannot call bump_ai_usage');

-- search_food
select is((select name from public.search_food('palak') limit 1), 'Spinach / palak', 'search_food finds Hindi keyword palak');
select is((select name from public.search_food('dahi') limit 1), 'Curd / dahi (homemade)', 'search_food finds dahi');
select is((select name from public.search_food('Atta') limit 1), 'Atta / whole wheat flour', 'search_food is case-insensitive');
select is((select name from public.search_food('tomto') limit 1), 'Tomatoes', 'search_food tolerates typos (trigram)');
select ok((select count(*) from public.search_food('dal')) <= 10, 'search_food returns at most 10 rows');
select is_empty($$select * from public.search_food('   ')$$, 'blank query returns nothing');

-- anon
select tests.as_anon();
select throws_ok('select * from public.shelf_life', '42501', null, 'anon cannot read shelf_life');
select throws_ok($$select * from public.search_food('milk')$$, '42501', null, 'anon cannot call search_food');

-- service_role writes (bypasses RLS)
reset role;
set local role service_role;
select is(public.bump_ai_usage(:'asha'), 4, 'service_role bump_ai_usage increments atomically');

reset role;
select * from finish();
rollback;
