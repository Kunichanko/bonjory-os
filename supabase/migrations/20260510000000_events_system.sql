-- イベント本体
CREATE TABLE events (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title                   text NOT NULL,
  description             text,
  description_is_markdown boolean DEFAULT false,
  event_type              text NOT NULL CHECK (event_type IN ('bontest', 'presentation', 'workshop', 'other')),
  status                  text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'open', 'judging', 'closed')),
  starts_at               timestamptz NOT NULL,
  ends_at                 timestamptz NOT NULL,
  submission_deadline     timestamptz,
  theme                   text,
  target_course           text CHECK (target_course IN ('Unity', 'Blender', 'Web')),
  max_submissions         integer DEFAULT 1,
  allow_anonymous         boolean DEFAULT false,
  allow_public_vote       boolean DEFAULT false,
  cover_image_url         text,
  created_by              uuid REFERENCES auth.users(id),
  created_at              timestamptz DEFAULT now()
);

-- 応募作品
CREATE TABLE event_submissions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  title         text NOT NULL,
  description   text,
  media_url     text,
  image_urls    text[],
  is_anonymous  boolean DEFAULT false,
  submitted_at  timestamptz DEFAULT now(),
  rank          integer,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- 審査スコア（BONTEST用）
CREATE TABLE event_scores (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id     uuid NOT NULL REFERENCES event_submissions(id) ON DELETE CASCADE,
  judge_id          uuid NOT NULL REFERENCES auth.users(id),
  creativity_score  integer CHECK (creativity_score BETWEEN 0 AND 10),
  technique_score   integer CHECK (technique_score BETWEEN 0 AND 10),
  theme_score       integer CHECK (theme_score BETWEEN 0 AND 10),
  comment           text,
  scored_at         timestamptz DEFAULT now(),
  UNIQUE(submission_id, judge_id)
);

-- 人気投票
CREATE TABLE event_votes (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES event_submissions(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  voted_at      timestamptz DEFAULT now(),
  UNIQUE(submission_id, user_id)
);

-- イベント提案
CREATE TABLE event_proposals (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  proposer_id    uuid NOT NULL REFERENCES auth.users(id),
  title          text NOT NULL,
  description    text NOT NULL,
  event_type     text CHECK (event_type IN ('bontest', 'presentation', 'workshop', 'other')),
  proposed_date  text,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_comment  text,
  created_at     timestamptz DEFAULT now()
);

-- 提案への賛成票
CREATE TABLE event_proposal_votes (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES event_proposals(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  voted_at    timestamptz DEFAULT now(),
  UNIQUE(proposal_id, user_id)
);

-- RLS有効化
ALTER TABLE events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_submissions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_votes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_proposals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_proposal_votes  ENABLE ROW LEVEL SECURITY;

-- events: 認証済みユーザーは draft 以外を読み取り可、書き込みは権限チェック済み（ページ側）
CREATE POLICY "auth_read_events"
  ON events FOR SELECT TO authenticated
  USING (status <> 'draft' OR created_by = auth.uid() OR (
    SELECT role FROM public.profiles WHERE id = auth.uid()
  ) = 'admin');

CREATE POLICY "auth_write_events"
  ON events FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- event_submissions: 自分の応募は常に可、他人のは open 以降
CREATE POLICY "auth_read_event_submissions"
  ON event_submissions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND e.status IN ('open', 'judging', 'closed')
    )
  );

CREATE POLICY "auth_write_own_event_submissions"
  ON event_submissions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "auth_update_own_event_submissions"
  ON event_submissions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (
    SELECT role FROM public.profiles WHERE id = auth.uid()
  ) = 'admin');

CREATE POLICY "auth_delete_own_event_submissions"
  ON event_submissions FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (
    SELECT role FROM public.profiles WHERE id = auth.uid()
  ) = 'admin');

-- event_scores: 全員読み取り可、書き込みは認証済みのみ（ページ側で権限チェック）
CREATE POLICY "auth_read_event_scores"
  ON event_scores FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_write_event_scores"
  ON event_scores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- event_votes: 全員読み取り、自分の投票は書き込み・削除可
CREATE POLICY "auth_read_event_votes"
  ON event_votes FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_own_event_vote"
  ON event_votes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "auth_delete_own_event_vote"
  ON event_votes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- event_proposals: 全員読み取り・作成可、更新は管理者のみ
CREATE POLICY "auth_read_event_proposals"
  ON event_proposals FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_event_proposal"
  ON event_proposals FOR INSERT TO authenticated
  WITH CHECK (proposer_id = auth.uid());

CREATE POLICY "auth_update_event_proposals"
  ON event_proposals FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- event_proposal_votes: 全員読み取り、自分の投票は書き込み・削除可
CREATE POLICY "auth_read_event_proposal_votes"
  ON event_proposal_votes FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_own_proposal_vote"
  ON event_proposal_votes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "auth_delete_own_proposal_vote"
  ON event_proposal_votes FOR DELETE TO authenticated
  USING (user_id = auth.uid());
