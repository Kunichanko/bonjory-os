-- SNS管理: 文章プリセット

CREATE TABLE IF NOT EXISTS sns_text_presets (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  content    text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sns_text_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sns_text_presets_select" ON sns_text_presets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM profile_positions pp
      JOIN positions pos ON pos.id = pp.position_id
      WHERE pp.profile_id = auth.uid()
        AND (pos.permissions->>'sns_management')::boolean = true
    )
  );

CREATE POLICY "sns_text_presets_all" ON sns_text_presets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
