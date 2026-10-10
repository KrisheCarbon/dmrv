-- The app lets a supervisor photograph a paper lab report as well as attach a
-- PDF, so the private soil-reports bucket must accept JPEG photos too.

update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg']::text[]
where id = 'soil-reports';
