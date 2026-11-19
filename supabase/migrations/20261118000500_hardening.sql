-- Hardening after Sherlock Bugs' review of s1/db-schema.
-- 1. No API role may TRUNCATE (RLS does not apply to it), add triggers or take REFERENCES.
-- 2. household_id, created_by and ids are immutable on UPDATE: column-level UPDATE grants.
-- 3. scans object names must be exactly "{uuid}/{uuid}.{image ext}" (no "..", no extra segments).

-- ---------------------------------------------------------------- 1. table privileges
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- ---------------------------------------------------------------- 2. column-level UPDATE
-- PostgREST note: an upsert (on conflict do update) on these tables sets every supplied column,
-- so it will be refused. Use insert for new rows and update with only the changed columns.
revoke update on table public.items from authenticated;
grant update (
  name, quantity, unit, location, added_at, expires_on, expiry_source, confidence,
  shelf_life_id, barcode, kcal_per_unit, status, usual_quantity, low_threshold
) on table public.items to authenticated;

revoke update on table public.usage_events from authenticated;
grant update (kind, quantity, at) on table public.usage_events to authenticated;

revoke update on table public.households from authenticated;
grant update (name) on table public.households to authenticated;

revoke update on table public.household_members from authenticated;
grant update (role) on table public.household_members to authenticated;

-- ---------------------------------------------------------------- 3. strict scans object names
alter policy scans_select_member on storage.objects
  using (
    bucket_id = 'scans'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif)$'
    and public.is_member_of_folder(name)
  );

alter policy scans_insert_member on storage.objects
  with check (
    bucket_id = 'scans'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif)$'
    and public.is_member_of_folder(name)
  );

alter policy scans_update_member on storage.objects
  using (
    bucket_id = 'scans'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif)$'
    and public.is_member_of_folder(name)
  )
  with check (
    bucket_id = 'scans'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif)$'
    and public.is_member_of_folder(name)
  );

alter policy scans_delete_member on storage.objects
  using (
    bucket_id = 'scans'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif)$'
    and public.is_member_of_folder(name)
  );
