-- Rollback for migrations/0024_team_mascots.sql. Run in the SQL Editor.
--
-- Drops the mascot columns and restores the media bucket's original image-only,
-- 5 MB limits. Uploaded mascot videos stay in storage under media/mascots/;
-- delete them from the Storage page if they're no longer wanted.

alter table teams
  drop column if exists mascot_name,
  drop column if exists mascot_tagline,
  drop column if exists mascot_bio,
  drop column if exists mascot_color,
  drop column if exists mascot_video_url,
  drop column if exists mascot_video_safari_url,
  drop column if exists mascot_poster_url;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
where id = 'media';
