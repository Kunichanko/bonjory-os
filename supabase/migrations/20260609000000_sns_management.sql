-- SNS管理: サンプルツイートと投稿リスト

CREATE TABLE IF NOT EXISTS sns_sample_tweets (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  content    text        NOT NULL,
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

-- BONJORYの過去ツイートのサンプルデータ
INSERT INTO sns_sample_tweets (content) VALUES
('🎮 今週のBONJORY活動報告！
Unityコースのメンバーがついにシェーダー課題を完成させました✨
次のステージも全力で頑張っていきましょ〜！

#ゲーム制作 #BONJORY'),
('新しい課題テーマが追加されました！📋
今回はBlenderコースのメンバー向けにキャラクターモデリングにチャレンジ🔥
締め切りは日曜日なのでみんな頑張ろう〜！
#3DCG #Blender #BONJORY'),
('【BON-TOPICS更新🗞️】
Unreal Engine 5の新機能について詳しく解説した記事を公開しました！
ぜひ読んでみてね📖✨
#UE5 #ゲーム開発 #BONJORY'),
('メンバーの作品が完成しました〜🎉🎉
クオリティ高くて感動...！
BONJORYはこれからもみんなの成長を全力サポートするよ💪
#ゲーム制作 #BONJORY'),
('今月のポイントランキング発表〜！🏆
1位のメンバーは圧倒的なスコアで首位キープ！
みんなもどんどんタスクをこなして上位を目指そう💯
#BONJORY #がんばろう');
