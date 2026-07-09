-- 最終提出に動画1本（30MBまで）を添付できるようにする
ALTER TABLE task_assignments
  ADD COLUMN IF NOT EXISTS video_url text;
