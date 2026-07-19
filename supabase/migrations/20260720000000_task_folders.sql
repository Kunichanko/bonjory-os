-- 課題フォルダ（管理画面の整理用・利用者には影響なし）
CREATE TABLE task_folders (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 課題→フォルダ割り当て（1課題1フォルダ）。フォルダ削除時は未分類に戻る
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES task_folders(id) ON DELETE SET NULL;

ALTER TABLE task_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_task_folders" ON task_folders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_write_task_folders" ON task_folders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
