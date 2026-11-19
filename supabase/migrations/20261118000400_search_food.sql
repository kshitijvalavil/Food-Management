-- search_food(q): top 10 shelf_life rows for a free-text query, matching the
-- name and keywords (incl. Hindi names like "palak", "dahi") by exact keyword,
-- substring and trigram similarity. SECURITY INVOKER: callers need shelf_life
-- read access, which every signed-in user has.

create function public.search_food(q text)
returns setof public.shelf_life
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select lower(btrim(left(coalesce(q, ''), 60))) as term
  ),
  pattern as (
    select term,
           '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%' as like_term
    from input
    where term <> ''
  )
  select s.*
  from public.shelf_life s, pattern p
  where s.search_text like p.like_term
     or extensions.word_similarity(p.term, s.search_text) >= 0.45
     or extensions.similarity(lower(s.name), p.term) >= 0.3
  order by
    (lower(s.name) = p.term) desc,
    (p.term = any (s.keywords)) desc,
    (lower(s.name) like p.term || '%') desc,
    greatest(
      extensions.similarity(lower(s.name), p.term),
      extensions.word_similarity(p.term, s.search_text)
    ) desc,
    s.name
  limit 10
$$;

revoke execute on function public.search_food(text) from public, anon;
grant execute on function public.search_food(text) to authenticated, service_role;
