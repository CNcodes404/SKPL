-- Public storage bucket for team logos and player photos, uploaded directly
-- from the admin panel instead of relying on external hotlinked image URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "media_public_read" on storage.objects
  for select using (bucket_id = 'media');

create policy "media_admin_insert" on storage.objects
  for insert with check (bucket_id = 'media' and is_admin());

create policy "media_admin_update" on storage.objects
  for update using (bucket_id = 'media' and is_admin()) with check (bucket_id = 'media' and is_admin());

create policy "media_admin_delete" on storage.objects
  for delete using (bucket_id = 'media' and is_admin());
