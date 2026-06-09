-- SNS管理: サンプルツイートと投稿リスト

CREATE TABLE IF NOT EXISTS sns_sample_tweets (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  content    text        NOT NULL,
  use_for_ai boolean     NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sns_posts (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  content    text        NOT NULL,
  status     text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted')),
  created_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  posted_at  timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sns_sample_tweets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sns_posts         ENABLE ROW LEVEL SECURITY;

-- sns_management 権限を持つユーザーのみ操作可能
CREATE POLICY "sns_sample_tweets_select" ON sns_sample_tweets
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

CREATE POLICY "sns_sample_tweets_all" ON sns_sample_tweets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "sns_posts_select" ON sns_posts
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

CREATE POLICY "sns_posts_insert" ON sns_posts
  FOR INSERT WITH CHECK (
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

CREATE POLICY "sns_posts_update" ON sns_posts
  FOR UPDATE USING (
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

CREATE POLICY "sns_posts_delete" ON sns_posts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM profile_positions pp
      JOIN positions pos ON pos.id = pp.position_id
      WHERE pp.profile_id = auth.uid()
        AND (pos.permissions->>'sns_management')::boolean = true
    )
  );

