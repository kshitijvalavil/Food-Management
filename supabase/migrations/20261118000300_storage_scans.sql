-- Private bucket for capture photos. Object path: "{household_id}/{uuid}.jpg".
-- Access is keyed on the first path segment: only members of that household
-- can read, upload, replace or delete. Supabase already enables RLS on storage.objects.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scans', 'scans', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Text comparison (not ::uuid) so a malformed first segment simply denies
-- access instead of raising an invalid-uuid error.
create function public.is_member_of_folder(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id::text = (storage.foldername(p_object_name))[1]
      and m.user_id = (select auth.uid())
  )
$$;
revoke execute on function public.is_member_of_folder(text) from public, anon;
grant execute on function public.is_member_of_folder(text) to authenticated, service_role;

create policy scans_select_member on storage.objects
  for select to authenticated
  using (bucket_id = 'scans' and public.is_member_of_folder(name));

create policy scans_insert_member on storage.objects
  for insert to authenticated
  with check (bucket_id = 'scans' and public.is_member_of_folder(name));

create policy scans_update_member on storage.objects
  for update to authenticated
  using (bucket_id = 'scans' and public.is_member_of_folder(name))
  with check (bucket_id = 'scans' and public.is_member_of_folder(name));

create policy scans_delete_member on storage.objects
  for delete to authenticated
  using (bucket_id = 'scans' and public.is_member_of_folder(name));
