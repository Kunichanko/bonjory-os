-- 統計管理: ユーザー行動トラッキング（activity_sessions / activity_events）

CREATE OR REPLACE FUNCTION "public"."has_stats_management"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM public.profile_positions pp
    JOIN public.positions pos ON pos.id = pp.position_id
    WHERE pp.profile_id = auth.uid()
      AND (pos.permissions->>'stats_management')::boolean = true
  );
$$;

GRANT ALL ON FUNCTION "public"."has_stats_management"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_stats_management"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_stats_management"() TO "service_role";

-- 1訪問 = 1セッション（id はクライアント側で生成）
CREATE TABLE IF NOT EXISTS activity_sessions (
  id         uuid        PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  username   text,
  started_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_sessions_started_at_idx ON activity_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS activity_sessions_user_id_idx ON activity_sessions (user_id);

-- 1操作 = 1イベント（セッション開始からの経過秒数 + ラベル）
CREATE TABLE IF NOT EXISTS activity_events (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id      uuid        NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE,
  elapsed_seconds int         NOT NULL CHECK (elapsed_seconds BETWEEN 0 AND 300),
  label           text        NOT NULL CHECK (char_length(label) <= 200),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_events_session_idx ON activity_events (session_id, elapsed_seconds);

ALTER TABLE activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

-- 部員は自分のセッション・イベントのみ INSERT 可（UPDATE/DELETE は不可）
CREATE POLICY "activity_sessions_insert_own" ON activity_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "activity_sessions_select_admin" ON activity_sessions
  FOR SELECT USING (public.has_stats_management());

CREATE POLICY "activity_events_insert_own" ON activity_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM activity_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "activity_events_select_admin" ON activity_events
  FOR SELECT USING (public.has_stats_management());

-- 保持期間を超えた古いセッションを削除（イベントは CASCADE）
CREATE OR REPLACE FUNCTION "public"."prune_activity_sessions"(keep_days int) RETURNS void
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  DELETE FROM public.activity_sessions
  WHERE started_at < now() - make_interval(days => keep_days);
$$;

REVOKE ALL ON FUNCTION "public"."prune_activity_sessions"(int) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_activity_sessions"(int) TO "service_role";
