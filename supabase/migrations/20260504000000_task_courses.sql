CREATE TABLE task_courses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  target_course text CHECK (target_course IN ('Unity', 'Blender', 'Web')),
  target_stage  text CHECK (target_stage  IN ('Foundation', 'Development', 'Production')),
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE task_course_assignments (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_course_id uuid NOT NULL REFERENCES task_courses(id) ON DELETE CASCADE,
  task_id        uuid NOT NULL REFERENCES tasks(id)        ON DELETE CASCADE,
  sort_order     integer NOT NULL DEFAULT 0,
  UNIQUE(task_course_id, task_id)
);

-- RLS
ALTER TABLE task_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_course_assignments ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは読み取り可（課題一覧ページでも参照するため）
CREATE POLICY "auth_read_task_courses"
  ON task_courses FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "auth_read_task_course_assignments"
  ON task_course_assignments FOR SELECT
  TO authenticated USING (true);

-- 書き込みは認証済みユーザーのみ（ページ側でadmin/task_management権限チェック済み）
CREATE POLICY "auth_write_task_courses"
  ON task_courses FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_write_task_course_assignments"
  ON task_course_assignments FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
