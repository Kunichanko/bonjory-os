CREATE TABLE ai_task_themes (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content    text NOT NULL,
  gen_type   text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_task_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_ai_task_themes"
  ON ai_task_themes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "auth_write_ai_task_themes"
  ON ai_task_themes FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
