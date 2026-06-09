-- SNS予約投稿通知

ALTER TABLE sns_posts
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS notified_at    timestamptz;

-- 予約投稿通知を受け取る部員
CREATE TABLE IF NOT EXISTS sns_notification_recipients (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE sns_notification_recipients ENABLE ROW LEVEL SECURITY;

-- admin のみ全操作可能
CREATE POLICY "sns_notification_recipients_admin" ON sns_notification_recipients
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- sns_management 権限者は参照のみ
CREATE POLICY "sns_notification_recipients_select" ON sns_notification_recipients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profile_positions pp
      JOIN positions pos ON pos.id = pp.position_id
      WHERE pp.profile_id = auth.uid()
        AND (pos.permissions->>'sns_management')::boolean = true
    )
  );
