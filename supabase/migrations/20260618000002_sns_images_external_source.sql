-- SNS画像: タイムライン提出物（サムネ・提出画像）を直接URL参照で添付できるようにする

ALTER TABLE sns_images
  ADD COLUMN IF NOT EXISTS image_url text;

UPDATE sns_images
  SET image_url = 'https://wrfcupvheechjarjjsoo.supabase.co/storage/v1/object/public/media/' || storage_path
  WHERE image_url IS NULL AND storage_path IS NOT NULL;

ALTER TABLE sns_images
  ALTER COLUMN storage_path DROP NOT NULL,
  ALTER COLUMN image_url SET NOT NULL;
