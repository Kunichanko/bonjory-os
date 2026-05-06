-- dev_task_progress: 担当者が入力する進捗報告
CREATE TABLE IF NOT EXISTS "public"."dev_task_progress" (
    "id" uuid DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "content" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dev_task_progress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dev_task_progress_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."dev_tasks"("id") ON DELETE CASCADE,
    CONSTRAINT "dev_task_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id")
);

ALTER TABLE "public"."dev_task_progress" OWNER TO "postgres";
ALTER TABLE "public"."dev_task_progress" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."dev_task_progress" TO "anon";
GRANT ALL ON TABLE "public"."dev_task_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."dev_task_progress" TO "service_role";

-- dev_task_feedback: dev_management権限者が入力するフィードバック
CREATE TABLE IF NOT EXISTS "public"."dev_task_feedback" (
    "id" uuid DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "content" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dev_task_feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dev_task_feedback_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."dev_tasks"("id") ON DELETE CASCADE,
    CONSTRAINT "dev_task_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id")
);

ALTER TABLE "public"."dev_task_feedback" OWNER TO "postgres";
ALTER TABLE "public"."dev_task_feedback" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."dev_task_feedback" TO "anon";
GRANT ALL ON TABLE "public"."dev_task_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."dev_task_feedback" TO "service_role";

-- ── 既存テーブルへの追加 RLS ─────────────────────────────────

-- dev_tasks: 担当者が自分のタスクを閲覧できる
CREATE POLICY "assignees_read_dev_tasks"
ON "public"."dev_tasks"
FOR SELECT TO "authenticated"
USING (
    EXISTS (
        SELECT 1 FROM "public"."dev_task_assignees"
        WHERE "dev_task_assignees"."task_id" = "dev_tasks"."id"
          AND "dev_task_assignees"."user_id" = "auth"."uid"()
    )
);

-- dev_task_assignees: 担当者が同じタスクの担当一覧を閲覧できる
CREATE POLICY "assignees_read_own_task_assignees"
ON "public"."dev_task_assignees"
FOR SELECT TO "authenticated"
USING (
    "user_id" = "auth"."uid"()
    OR EXISTS (
        SELECT 1 FROM "public"."dev_task_assignees" a2
        WHERE a2."task_id" = "dev_task_assignees"."task_id"
          AND a2."user_id" = "auth"."uid"()
    )
);

-- ── dev_task_progress RLS ────────────────────────────────────

-- SELECT: admin OR dev_management権限 OR 同タスク担当者
CREATE POLICY "dev_task_progress_select"
ON "public"."dev_task_progress"
FOR SELECT TO "authenticated"
USING (
    (EXISTS (
        SELECT 1 FROM "public"."profiles"
        WHERE "profiles"."id" = "auth"."uid"()
          AND "profiles"."role" = 'admin'
    ))
    OR (EXISTS (
        SELECT 1
        FROM "public"."profile_positions" pp
        JOIN "public"."positions" pos ON pos."id" = pp."position_id"
        WHERE pp."profile_id" = "auth"."uid"()
          AND ((pos."permissions" ->> 'dev_management')::boolean = true)
    ))
    OR (EXISTS (
        SELECT 1 FROM "public"."dev_task_assignees"
        WHERE "dev_task_assignees"."task_id" = "dev_task_progress"."task_id"
          AND "dev_task_assignees"."user_id" = "auth"."uid"()
    ))
);

-- INSERT: 同タスク担当者のみ
CREATE POLICY "dev_task_progress_insert"
ON "public"."dev_task_progress"
FOR INSERT TO "authenticated"
WITH CHECK (
    "user_id" = "auth"."uid"()
    AND EXISTS (
        SELECT 1 FROM "public"."dev_task_assignees"
        WHERE "dev_task_assignees"."task_id" = "dev_task_progress"."task_id"
          AND "dev_task_assignees"."user_id" = "auth"."uid"()
    )
);

-- ── dev_task_feedback RLS ────────────────────────────────────

-- SELECT: admin OR dev_management権限 OR 同タスク担当者
CREATE POLICY "dev_task_feedback_select"
ON "public"."dev_task_feedback"
FOR SELECT TO "authenticated"
USING (
    (EXISTS (
        SELECT 1 FROM "public"."profiles"
        WHERE "profiles"."id" = "auth"."uid"()
          AND "profiles"."role" = 'admin'
    ))
    OR (EXISTS (
        SELECT 1
        FROM "public"."profile_positions" pp
        JOIN "public"."positions" pos ON pos."id" = pp."position_id"
        WHERE pp."profile_id" = "auth"."uid"()
          AND ((pos."permissions" ->> 'dev_management')::boolean = true)
    ))
    OR (EXISTS (
        SELECT 1 FROM "public"."dev_task_assignees"
        WHERE "dev_task_assignees"."task_id" = "dev_task_feedback"."task_id"
          AND "dev_task_assignees"."user_id" = "auth"."uid"()
    ))
);

-- INSERT: admin OR dev_management権限のみ
CREATE POLICY "dev_task_feedback_insert"
ON "public"."dev_task_feedback"
FOR INSERT TO "authenticated"
WITH CHECK (
    "user_id" = "auth"."uid"()
    AND (
        (EXISTS (
            SELECT 1 FROM "public"."profiles"
            WHERE "profiles"."id" = "auth"."uid"()
              AND "profiles"."role" = 'admin'
        ))
        OR (EXISTS (
            SELECT 1
            FROM "public"."profile_positions" pp
            JOIN "public"."positions" pos ON pos."id" = pp."position_id"
            WHERE pp."profile_id" = "auth"."uid"()
              AND ((pos."permissions" ->> 'dev_management')::boolean = true)
        ))
    )
);
