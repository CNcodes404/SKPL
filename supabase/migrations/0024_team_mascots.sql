-- Animated team mascots, shown next to the squad on the team page and in a
-- larger popup with sound.
--
-- Each mascot is a transparent looping clip in two encodings, because no
-- single format carries transparency in every browser:
--   mascot_video_url        WebM (VP9 + alpha) for Chrome, Edge, Firefox, Android
--   mascot_video_safari_url H.264 MP4 with the colour picture stacked above its
--                           alpha mask, recombined in the browser (Safari / iOS)
--   mascot_poster_url       still frame, shown while loading and for
--                           reduced-motion visitors
-- mascot_color tints the mascot card's background (hex, e.g. '#2563eb').
--
-- Additive only. The media bucket is widened to accept those videos.
-- Rollback: supabase/backups/0024_team_mascots_rollback.sql.

alter table teams
  add column mascot_name text,
  add column mascot_tagline text,
  add column mascot_bio text,
  add column mascot_color text,
  add column mascot_video_url text,
  add column mascot_video_safari_url text,
  add column mascot_poster_url text;

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/webm', 'video/mp4']
where id = 'media';
