-- ============================================================================
-- BONJORY OS - Full Database Schema
-- ============================================================================
-- このファイルは全マイグレーションを統合した一発セットアップ用SQLです。
-- Supabase の SQL Editor に貼り付けて実行してください。
--
-- 生成日: 2026-08-23
-- ソース: supabase/migrations/ 内の全14ファイル
-- ============================================================================


-- ============================================================================
-- [1/14] Base Schema (20260407053907_remote_schema.sql)
-- ============================================================================




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."announcement_type" AS ENUM (
    'recurring',
    'scheduled',
    'personal',
    'link',
    'immediate'
);


ALTER TYPE "public"."announcement_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_points_to_user"("target_user_id" "uuid", "amount" integer) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  update profiles
  set cool_points = cool_points + amount,
      total_points = total_points + amount
  where id = target_user_id;
$$;


ALTER FUNCTION "public"."add_points_to_user"("target_user_id" "uuid", "amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_points"("p_user_id" "uuid", "p_action_key" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE v_base int; v_mult numeric; v_final int;
BEGIN
  SELECT base_points INTO v_base FROM public.point_settings WHERE action_key = p_action_key;
  IF v_base IS NULL OR v_base = 0 THEN RETURN 0; END IF;
  SELECT COALESCE(MAX(multiplier),1) INTO v_mult FROM public.point_multiplier_events WHERE now() BETWEEN starts_at AND ends_at;
  v_final := GREATEST(ROUND(v_base * v_mult)::int, 0);
  UPDATE public.profiles SET total_points = COALESCE(total_points,0)+v_final, cool_points = COALESCE(cool_points,0)+v_final WHERE id = p_user_id;
  RETURN v_final;
END; $$;


ALTER FUNCTION "public"."award_points"("p_user_id" "uuid", "p_action_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dm_managers"() RETURNS TABLE("id" "uuid", "username" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT DISTINCT p.id, p.username
  FROM public.profiles p
  WHERE p.role = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.profile_positions pp
      JOIN public.positions pos ON pos.id = pp.position_id
      WHERE pp.profile_id = p.id
        AND (pos.permissions->>'dm_management')::boolean = true
    )
$$;


ALTER FUNCTION "public"."get_dm_managers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'username'
  );
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_announcement_management"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM public.profile_positions pp
    JOIN public.positions p ON p.id = pp.position_id
    WHERE pp.profile_id = auth.uid()
      AND (p.permissions->>'announcement_management')::boolean = true
  );
$$;


ALTER FUNCTION "public"."has_announcement_management"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_finance"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'admin'
        OR EXISTS (
          SELECT 1 FROM public.profile_positions pp
          JOIN public.positions pos ON pos.id = pp.position_id
          WHERE pp.profile_id = p.id
            AND (pos.permissions->>'finance')::boolean = true
        )
      )
  )
$$;


ALTER FUNCTION "public"."has_finance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_gimmick_permission"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  OR EXISTS (
    SELECT 1 FROM public.profile_positions pp
    JOIN public.positions pos ON pos.id = pp.position_id
    WHERE pp.profile_id = auth.uid() AND (pos.permissions->>'gimmick_management')::boolean = true
  )
$$;


ALTER FUNCTION "public"."has_gimmick_permission"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_cool_points"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.profiles SET cool_points = 0;
END; $$;


ALTER FUNCTION "public"."reset_cool_points"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_dm_conversation_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE dm_conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_dm_conversation_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid",
    "type" "public"."announcement_type" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "url" "text",
    "scheduled_at" timestamp with time zone,
    "day_of_week" smallint,
    "time_of_day" time without time zone,
    "target_user_ids" "uuid"[],
    "is_active" boolean DEFAULT true NOT NULL,
    "sent_at" timestamp with time zone,
    "last_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "announcements_type_check" CHECK (("type" = ANY (ARRAY['recurring'::"public"."announcement_type", 'scheduled'::"public"."announcement_type", 'personal'::"public"."announcement_type", 'link'::"public"."announcement_type", 'immediate'::"public"."announcement_type"])))
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bon_topic_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "content" "text",
    "is_markdown" boolean DEFAULT false,
    "image_url" "text",
    "link_url" "text",
    "link_label" "text",
    "task_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "bon_topic_blocks_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'image'::"text", 'link'::"text", 'assignment'::"text"])))
);


ALTER TABLE "public"."bon_topic_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bon_topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "title_color" "text" DEFAULT '#ffffff'::"text",
    "thumbnail_url" "text",
    "thumbnail_aspect_ratio" double precision DEFAULT 1.0,
    "target_courses" "text"[] DEFAULT '{}'::"text"[],
    "is_published" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bon_topics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bug_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "condition" "text",
    "error_msg" "text",
    "prediction" "text",
    "target_area" "text",
    "implementation_idea" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "awarded_points" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bug_reports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "bug_reports_type_check" CHECK (("type" = ANY (ARRAY['bug'::"text", 'feature'::"text"])))
);


ALTER TABLE "public"."bug_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."course_initial_tasks" (
    "course" "text" NOT NULL,
    "task_id" "uuid"
);


ALTER TABLE "public"."course_initial_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dev_task_assignees" (
    "task_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."dev_task_assignees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dev_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "summary" "text" NOT NULL,
    "detail" "text",
    "deadline" "date",
    "report_id" "uuid",
    "status" "text" DEFAULT 'todo'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dev_tasks_status_check" CHECK (("status" = ANY (ARRAY['todo'::"text", 'in_progress'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."dev_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid" NOT NULL,
    "manager_id" "uuid" NOT NULL,
    "request_type_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dm_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dm_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_reads" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dm_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_request_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dm_request_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_expense_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."finance_expense_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_expense_cosponsors" (
    "expense_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL
);


ALTER TABLE "public"."finance_expense_cosponsors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "amount" integer NOT NULL,
    "category_id" "uuid",
    "note" "text",
    "paid_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_settled" boolean DEFAULT false NOT NULL,
    "settled_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."finance_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_income_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."finance_income_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_incomes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "amount" integer NOT NULL,
    "source_id" "uuid",
    "note" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."finance_incomes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."finance_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_planned_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "category_id" "uuid",
    "detail" "text" NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expense_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "finance_planned_expenses_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'paid'::"text"]))),
    CONSTRAINT "finance_planned_expenses_type_check" CHECK (("type" = ANY (ARRAY['planned'::"text", 'request'::"text"])))
);


ALTER TABLE "public"."finance_planned_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gimmick_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "block_interval_min_sec" integer DEFAULT 10,
    "block_interval_max_sec" integer DEFAULT 30,
    "sakura_enabled" boolean DEFAULT false NOT NULL,
    CONSTRAINT "gimmick_settings_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."gimmick_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "announcement_id" "uuid",
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."notification_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid",
    "user_id" "uuid",
    "plan_text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."point_multiplier_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" NOT NULL,
    "multiplier" numeric DEFAULT 2 NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."point_multiplier_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."point_settings" (
    "action_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "base_points" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."point_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "position_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profile_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    "username" "text",
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "course" "text",
    "stage" "text",
    "total_points" integer DEFAULT 0,
    "cool_points" integer DEFAULT 0,
    "auto_assign_enabled" boolean DEFAULT false,
    "withdrawn_at" timestamp with time zone,
    "confirmed_withdrawn_at" timestamp with time zone,
    "weekly_task_requested_at" timestamp with time zone,
    CONSTRAINT "profiles_course_check" CHECK (("course" = ANY (ARRAY['Unity'::"text", 'Blender'::"text", 'Web'::"text"]))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"]))),
    CONSTRAINT "profiles_stage_check" CHECK (("stage" = ANY (ARRAY['Foundation'::"text", 'Development'::"text", 'Production'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rank_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "min_points" integer DEFAULT 0 NOT NULL,
    "color" "text" DEFAULT '#888888'::"text",
    "rank_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."rank_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reserved_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "trigger_assignment_id" "uuid",
    "activate_at" "date" NOT NULL,
    "type" "text" DEFAULT 'reserved'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "reserved_assignments_type_check" CHECK (("type" = ANY (ARRAY['reserved'::"text", 'auto'::"text"])))
);


ALTER TABLE "public"."reserved_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."speech_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" DEFAULT '新しいブロック'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."speech_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."speech_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "block_id" "uuid",
    "text" "text" DEFAULT ''::"text" NOT NULL,
    "type_speed_ms" integer DEFAULT 50,
    "display_ms" integer DEFAULT 2500,
    "sort_order" integer DEFAULT 0
);


ALTER TABLE "public"."speech_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid",
    "user_id" "uuid",
    "status" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "plan_text" "text",
    "media_url" "text",
    "self_evaluation" "text",
    "retrospective" "text",
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "midterm_progress" "text",
    "midterm_correction" "text",
    "is_anonymous" boolean DEFAULT false,
    "thumbnail_url" "text",
    "is_assigned" boolean DEFAULT true,
    "hidden_in_timeline" boolean DEFAULT false,
    "force_past_timeline" boolean DEFAULT false,
    "deadline_at" timestamp with time zone,
    "submission_comment" "text",
    "course_request" "text",
    "image_urls" "text"[],
    "assignment_role" "text" DEFAULT 'sub'::"text",
    "force_current_timeline" boolean DEFAULT false,
    CONSTRAINT "task_assignments_status_check" CHECK (("status" = ANY (ARRAY['assigned'::"text", 'in_progress'::"text", 'submitted'::"text"])))
);


ALTER TABLE "public"."task_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "target_course" "text",
    "target_stage" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "description_is_markdown" boolean DEFAULT false,
    "progress_number" numeric,
    "allow_image_attachment" boolean DEFAULT true NOT NULL,
    "deadline_days" integer DEFAULT 7 NOT NULL,
    "task_type" "text" DEFAULT 'weekly'::"text" NOT NULL,
    CONSTRAINT "tasks_target_course_check" CHECK (("target_course" = ANY (ARRAY['Unity'::"text", 'Blender'::"text", 'Web'::"text"]))),
    CONSTRAINT "tasks_target_stage_check" CHECK (("target_stage" = ANY (ARRAY['Foundation'::"text", 'Development'::"text", 'Production'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."timeline_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."timeline_comments" OWNER TO "postgres";


ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bon_topic_blocks"
    ADD CONSTRAINT "bon_topic_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bon_topics"
    ADD CONSTRAINT "bon_topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bug_reports"
    ADD CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_initial_tasks"
    ADD CONSTRAINT "course_initial_tasks_pkey" PRIMARY KEY ("course");



ALTER TABLE ONLY "public"."dev_task_assignees"
    ADD CONSTRAINT "dev_task_assignees_pkey" PRIMARY KEY ("task_id", "user_id");



ALTER TABLE ONLY "public"."dev_tasks"
    ADD CONSTRAINT "dev_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_reads"
    ADD CONSTRAINT "dm_reads_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."dm_request_types"
    ADD CONSTRAINT "dm_request_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_expense_categories"
    ADD CONSTRAINT "finance_expense_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_expense_cosponsors"
    ADD CONSTRAINT "finance_expense_cosponsors_pkey" PRIMARY KEY ("expense_id", "profile_id");



ALTER TABLE ONLY "public"."finance_expenses"
    ADD CONSTRAINT "finance_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_income_sources"
    ADD CONSTRAINT "finance_income_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_incomes"
    ADD CONSTRAINT "finance_incomes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_members"
    ADD CONSTRAINT "finance_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_members"
    ADD CONSTRAINT "finance_members_profile_id_key" UNIQUE ("profile_id");



ALTER TABLE ONLY "public"."finance_planned_expenses"
    ADD CONSTRAINT "finance_planned_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gimmick_settings"
    ADD CONSTRAINT "gimmick_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_task_id_user_id_key" UNIQUE ("task_id", "user_id");



ALTER TABLE ONLY "public"."point_multiplier_events"
    ADD CONSTRAINT "point_multiplier_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."point_settings"
    ADD CONSTRAINT "point_settings_pkey" PRIMARY KEY ("action_key");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_positions"
    ADD CONSTRAINT "profile_positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_positions"
    ADD CONSTRAINT "profile_positions_profile_id_position_id_key" UNIQUE ("profile_id", "position_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."rank_settings"
    ADD CONSTRAINT "rank_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reserved_assignments"
    ADD CONSTRAINT "reserved_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reserved_assignments"
    ADD CONSTRAINT "reserved_assignments_user_id_task_id_key" UNIQUE ("user_id", "task_id");



ALTER TABLE ONLY "public"."speech_blocks"
    ADD CONSTRAINT "speech_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."speech_lines"
    ADD CONSTRAINT "speech_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_assignments"
    ADD CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_assignments"
    ADD CONSTRAINT "task_assignments_task_id_user_id_key" UNIQUE ("task_id", "user_id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."timeline_comments"
    ADD CONSTRAINT "timeline_comments_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_ann_scheduled" ON "public"."announcements" USING "btree" ("scheduled_at") WHERE ("sent_at" IS NULL);



CREATE INDEX "idx_ann_type_active" ON "public"."announcements" USING "btree" ("type", "is_active");



CREATE OR REPLACE TRIGGER "trg_dm_message_inserted" AFTER INSERT ON "public"."dm_messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_dm_conversation_updated_at"();



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bon_topic_blocks"
    ADD CONSTRAINT "bon_topic_blocks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id");



ALTER TABLE ONLY "public"."bon_topic_blocks"
    ADD CONSTRAINT "bon_topic_blocks_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."bon_topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bug_reports"
    ADD CONSTRAINT "bug_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."course_initial_tasks"
    ADD CONSTRAINT "course_initial_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dev_task_assignees"
    ADD CONSTRAINT "dev_task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."dev_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dev_task_assignees"
    ADD CONSTRAINT "dev_task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."dev_tasks"
    ADD CONSTRAINT "dev_tasks_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."bug_reports"("id");



ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_request_type_id_fkey" FOREIGN KEY ("request_type_id") REFERENCES "public"."dm_request_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_reads"
    ADD CONSTRAINT "dm_reads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_reads"
    ADD CONSTRAINT "dm_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_expense_cosponsors"
    ADD CONSTRAINT "finance_expense_cosponsors_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."finance_expenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_expense_cosponsors"
    ADD CONSTRAINT "finance_expense_cosponsors_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."finance_expenses"
    ADD CONSTRAINT "finance_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."finance_expense_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_expenses"
    ADD CONSTRAINT "finance_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."finance_expenses"
    ADD CONSTRAINT "finance_expenses_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."finance_incomes"
    ADD CONSTRAINT "finance_incomes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."finance_incomes"
    ADD CONSTRAINT "finance_incomes_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."finance_incomes"
    ADD CONSTRAINT "finance_incomes_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."finance_income_sources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_members"
    ADD CONSTRAINT "finance_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_planned_expenses"
    ADD CONSTRAINT "finance_planned_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."finance_expense_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_planned_expenses"
    ADD CONSTRAINT "finance_planned_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."finance_planned_expenses"
    ADD CONSTRAINT "finance_planned_expenses_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."finance_expenses"("id");



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profile_positions"
    ADD CONSTRAINT "profile_positions_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profile_positions"
    ADD CONSTRAINT "profile_positions_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_positions"
    ADD CONSTRAINT "profile_positions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reserved_assignments"
    ADD CONSTRAINT "reserved_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."reserved_assignments"
    ADD CONSTRAINT "reserved_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reserved_assignments"
    ADD CONSTRAINT "reserved_assignments_trigger_assignment_id_fkey" FOREIGN KEY ("trigger_assignment_id") REFERENCES "public"."task_assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reserved_assignments"
    ADD CONSTRAINT "reserved_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."speech_lines"
    ADD CONSTRAINT "speech_lines_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "public"."speech_blocks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_assignments"
    ADD CONSTRAINT "task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_assignments"
    ADD CONSTRAINT "task_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."timeline_comments"
    ADD CONSTRAINT "timeline_comments_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."task_assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."timeline_comments"
    ADD CONSTRAINT "timeline_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Admins can insert tasks" ON "public"."tasks" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "Admins can manage all assignments" ON "public"."task_assignments" USING (("public"."get_my_role"() = 'admin'::"text")) WITH CHECK (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "Admins can read all plans" ON "public"."plans" FOR SELECT USING (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "Admins can read all profiles" ON "public"."profiles" FOR SELECT USING (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE USING (("public"."get_my_role"() = 'admin'::"text")) WITH CHECK (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "Admins can update tasks" ON "public"."tasks" FOR UPDATE USING (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "Authenticated users can read tasks" ON "public"."tasks" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can manage own plans" ON "public"."plans" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own assignments" ON "public"."task_assignments" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own assignments" ON "public"."task_assignments" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "admin_all_reserved" ON "public"."reserved_assignments" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."profile_positions" "pp"
     JOIN "public"."positions" "pos" ON (("pos"."id" = "pp"."position_id")))
  WHERE (("pp"."profile_id" = "auth"."uid"()) AND ((("pos"."permissions" ->> 'assignment_management'::"text"))::boolean = true))))));



CREATE POLICY "admin_manage_positions" ON "public"."positions" USING (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "admin_manage_profile_positions" ON "public"."profile_positions" USING (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "admin_update_bug_reports" ON "public"."bug_reports" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."profile_positions" "pp"
     JOIN "public"."positions" "pos" ON (("pos"."id" = "pp"."position_id")))
  WHERE (("pp"."profile_id" = "auth"."uid"()) AND ((("pos"."permissions" ->> 'dev_management'::"text"))::boolean = true))))));



CREATE POLICY "admin_write_mult" ON "public"."point_multiplier_events" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "admin_write_ps" ON "public"."point_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "admin_write_ranks" ON "public"."rank_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "all_auth_insert_bug_reports" ON "public"."bug_reports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "all_auth_read_bug_reports" ON "public"."bug_reports" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "all_auth_read_profile_positions" ON "public"."profile_positions" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ann_delete" ON "public"."announcements" FOR DELETE USING ("public"."has_announcement_management"());



CREATE POLICY "ann_insert" ON "public"."announcements" FOR INSERT WITH CHECK ("public"."has_announcement_management"());



CREATE POLICY "ann_select" ON "public"."announcements" FOR SELECT USING ("public"."has_announcement_management"());



CREATE POLICY "ann_update" ON "public"."announcements" FOR UPDATE USING ("public"."has_announcement_management"());



ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "auth all bon_topic_blocks" ON "public"."bon_topic_blocks" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth all bon_topics" ON "public"."bon_topics" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "auth read bon_topic_blocks" ON "public"."bon_topic_blocks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "auth read bon_topics" ON "public"."bon_topics" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "auth_read_comments" ON "public"."timeline_comments" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_read_dm_request_types" ON "public"."dm_request_types" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "auth_read_mult" ON "public"."point_multiplier_events" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_read_positions" ON "public"."positions" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "auth_read_ps" ON "public"."point_settings" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "auth_read_ranks" ON "public"."rank_settings" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."bon_topic_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bon_topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bug_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_initial_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dev_manage_all_assignees" ON "public"."dev_task_assignees" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."profile_positions" "pp"
     JOIN "public"."positions" "pos" ON (("pos"."id" = "pp"."position_id")))
  WHERE (("pp"."profile_id" = "auth"."uid"()) AND ((("pos"."permissions" ->> 'dev_management'::"text"))::boolean = true))))));



CREATE POLICY "dev_manage_all_dev_tasks" ON "public"."dev_tasks" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."profile_positions" "pp"
     JOIN "public"."positions" "pos" ON (("pos"."id" = "pp"."position_id")))
  WHERE (("pp"."profile_id" = "auth"."uid"()) AND ((("pos"."permissions" ->> 'dev_management'::"text"))::boolean = true))))));



ALTER TABLE "public"."dev_task_assignees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dev_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dm_conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dm_manager_manage_types" ON "public"."dm_request_types" USING ((("public"."get_my_role"() = 'admin'::"text") OR (EXISTS ( SELECT 1
   FROM ("public"."profile_positions" "pp"
     JOIN "public"."positions" "p" ON (("p"."id" = "pp"."position_id")))
  WHERE (("pp"."profile_id" = "auth"."uid"()) AND ((("p"."permissions" ->> 'dm_management'::"text"))::boolean = true))))));



ALTER TABLE "public"."dm_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dm_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dm_request_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance_all" ON "public"."finance_expense_categories" USING ("public"."has_finance"()) WITH CHECK ("public"."has_finance"());



CREATE POLICY "finance_all" ON "public"."finance_expense_cosponsors" USING ("public"."has_finance"()) WITH CHECK ("public"."has_finance"());



CREATE POLICY "finance_all" ON "public"."finance_expenses" USING ("public"."has_finance"()) WITH CHECK ("public"."has_finance"());



CREATE POLICY "finance_all" ON "public"."finance_income_sources" USING ("public"."has_finance"()) WITH CHECK ("public"."has_finance"());



CREATE POLICY "finance_all" ON "public"."finance_incomes" USING ("public"."has_finance"()) WITH CHECK ("public"."has_finance"());



CREATE POLICY "finance_all" ON "public"."finance_members" USING ("public"."has_finance"()) WITH CHECK ("public"."has_finance"());



CREATE POLICY "finance_all" ON "public"."finance_planned_expenses" USING ("public"."has_finance"()) WITH CHECK ("public"."has_finance"());



ALTER TABLE "public"."finance_expense_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_expense_cosponsors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_income_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_incomes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_planned_expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gimmick_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gimmick_write_blocks" ON "public"."speech_blocks" TO "authenticated" USING ("public"."has_gimmick_permission"()) WITH CHECK ("public"."has_gimmick_permission"());



CREATE POLICY "gimmick_write_lines" ON "public"."speech_lines" TO "authenticated" USING ("public"."has_gimmick_permission"()) WITH CHECK ("public"."has_gimmick_permission"());



CREATE POLICY "gimmick_write_settings" ON "public"."gimmick_settings" TO "authenticated" USING ("public"."has_gimmick_permission"()) WITH CHECK ("public"."has_gimmick_permission"());



CREATE POLICY "member_create_conversation" ON "public"."dm_conversations" FOR INSERT WITH CHECK (("auth"."uid"() = "member_id"));



ALTER TABLE "public"."notification_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own_insert_comments" ON "public"."timeline_comments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own_reads" ON "public"."dm_reads" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own_subscription_delete" ON "public"."push_subscriptions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own_subscription_insert" ON "public"."push_subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own_subscription_select" ON "public"."push_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "participants_read_conversation" ON "public"."dm_conversations" FOR SELECT USING ((("auth"."uid"() = "member_id") OR ("auth"."uid"() = "manager_id")));



CREATE POLICY "participants_read_messages" ON "public"."dm_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."dm_conversations" "c"
  WHERE (("c"."id" = "dm_messages"."conversation_id") AND (("c"."member_id" = "auth"."uid"()) OR ("c"."manager_id" = "auth"."uid"()))))));



CREATE POLICY "participants_send_messages" ON "public"."dm_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."dm_conversations" "c"
  WHERE (("c"."id" = "dm_messages"."conversation_id") AND (("c"."member_id" = "auth"."uid"()) OR ("c"."manager_id" = "auth"."uid"())))))));



ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."point_multiplier_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."point_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rank_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read_course_initial_tasks" ON "public"."course_initial_tasks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "read_gimmick_settings" ON "public"."gimmick_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "read_own_or_admin" ON "public"."profile_positions" FOR SELECT USING ((("auth"."uid"() = "profile_id") OR ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "read_speech_blocks" ON "public"."speech_blocks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "read_speech_lines" ON "public"."speech_lines" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."reserved_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."speech_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."speech_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "submitted_visible_to_all" ON "public"."task_assignments" FOR SELECT USING ((("status" = 'submitted'::"text") OR ("auth"."uid"() = "user_id")));



ALTER TABLE "public"."task_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."timeline_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_read_own_notif_logs" ON "public"."notification_logs" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") AND ("deleted_at" IS NULL)));



CREATE POLICY "users_update_own_notif_logs" ON "public"."notification_logs" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "write_course_initial_tasks" ON "public"."course_initial_tasks" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."profile_positions" "pp"
     JOIN "public"."positions" "pos" ON (("pos"."id" = "pp"."position_id")))
  WHERE (("pp"."profile_id" = "auth"."uid"()) AND ((("pos"."permissions" ->> 'task_management'::"text"))::boolean = true)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."profile_positions" "pp"
     JOIN "public"."positions" "pos" ON (("pos"."id" = "pp"."position_id")))
  WHERE (("pp"."profile_id" = "auth"."uid"()) AND ((("pos"."permissions" ->> 'task_management'::"text"))::boolean = true))))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."add_points_to_user"("target_user_id" "uuid", "amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."add_points_to_user"("target_user_id" "uuid", "amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_points_to_user"("target_user_id" "uuid", "amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."award_points"("p_user_id" "uuid", "p_action_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."award_points"("p_user_id" "uuid", "p_action_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_points"("p_user_id" "uuid", "p_action_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dm_managers"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_dm_managers"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dm_managers"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_announcement_management"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_announcement_management"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_announcement_management"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_finance"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_finance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_finance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_gimmick_permission"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_gimmick_permission"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_gimmick_permission"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_cool_points"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_cool_points"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_cool_points"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_dm_conversation_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_dm_conversation_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_dm_conversation_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."bon_topic_blocks" TO "anon";
GRANT ALL ON TABLE "public"."bon_topic_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."bon_topic_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."bon_topics" TO "anon";
GRANT ALL ON TABLE "public"."bon_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."bon_topics" TO "service_role";



GRANT ALL ON TABLE "public"."bug_reports" TO "anon";
GRANT ALL ON TABLE "public"."bug_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."bug_reports" TO "service_role";



GRANT ALL ON TABLE "public"."course_initial_tasks" TO "anon";
GRANT ALL ON TABLE "public"."course_initial_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."course_initial_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."dev_task_assignees" TO "anon";
GRANT ALL ON TABLE "public"."dev_task_assignees" TO "authenticated";
GRANT ALL ON TABLE "public"."dev_task_assignees" TO "service_role";



GRANT ALL ON TABLE "public"."dev_tasks" TO "anon";
GRANT ALL ON TABLE "public"."dev_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."dev_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."dm_conversations" TO "anon";
GRANT ALL ON TABLE "public"."dm_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."dm_messages" TO "anon";
GRANT ALL ON TABLE "public"."dm_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_messages" TO "service_role";



GRANT ALL ON TABLE "public"."dm_reads" TO "anon";
GRANT ALL ON TABLE "public"."dm_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_reads" TO "service_role";



GRANT ALL ON TABLE "public"."dm_request_types" TO "anon";
GRANT ALL ON TABLE "public"."dm_request_types" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_request_types" TO "service_role";



GRANT ALL ON TABLE "public"."finance_expense_categories" TO "anon";
GRANT ALL ON TABLE "public"."finance_expense_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_expense_categories" TO "service_role";



GRANT ALL ON TABLE "public"."finance_expense_cosponsors" TO "anon";
GRANT ALL ON TABLE "public"."finance_expense_cosponsors" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_expense_cosponsors" TO "service_role";



GRANT ALL ON TABLE "public"."finance_expenses" TO "anon";
GRANT ALL ON TABLE "public"."finance_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."finance_income_sources" TO "anon";
GRANT ALL ON TABLE "public"."finance_income_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_income_sources" TO "service_role";



GRANT ALL ON TABLE "public"."finance_incomes" TO "anon";
GRANT ALL ON TABLE "public"."finance_incomes" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_incomes" TO "service_role";



GRANT ALL ON TABLE "public"."finance_members" TO "anon";
GRANT ALL ON TABLE "public"."finance_members" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_members" TO "service_role";



GRANT ALL ON TABLE "public"."finance_planned_expenses" TO "anon";
GRANT ALL ON TABLE "public"."finance_planned_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_planned_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."gimmick_settings" TO "anon";
GRANT ALL ON TABLE "public"."gimmick_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."gimmick_settings" TO "service_role";



GRANT ALL ON TABLE "public"."notification_logs" TO "anon";
GRANT ALL ON TABLE "public"."notification_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_logs" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."point_multiplier_events" TO "anon";
GRANT ALL ON TABLE "public"."point_multiplier_events" TO "authenticated";
GRANT ALL ON TABLE "public"."point_multiplier_events" TO "service_role";



GRANT ALL ON TABLE "public"."point_settings" TO "anon";
GRANT ALL ON TABLE "public"."point_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."point_settings" TO "service_role";



GRANT ALL ON TABLE "public"."positions" TO "anon";
GRANT ALL ON TABLE "public"."positions" TO "authenticated";
GRANT ALL ON TABLE "public"."positions" TO "service_role";



GRANT ALL ON TABLE "public"."profile_positions" TO "anon";
GRANT ALL ON TABLE "public"."profile_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_positions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."rank_settings" TO "anon";
GRANT ALL ON TABLE "public"."rank_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."rank_settings" TO "service_role";



GRANT ALL ON TABLE "public"."reserved_assignments" TO "anon";
GRANT ALL ON TABLE "public"."reserved_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."reserved_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."speech_blocks" TO "anon";
GRANT ALL ON TABLE "public"."speech_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."speech_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."speech_lines" TO "anon";
GRANT ALL ON TABLE "public"."speech_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."speech_lines" TO "service_role";



GRANT ALL ON TABLE "public"."task_assignments" TO "anon";
GRANT ALL ON TABLE "public"."task_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."task_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."timeline_comments" TO "anon";
GRANT ALL ON TABLE "public"."timeline_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."timeline_comments" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "Public read media"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'media'::text));



  create policy "Users can update their own images"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'media'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));



  create policy "Users can upload their own images"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'media'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));



  create policy "auth update bon-topics"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'media'::text) AND (((storage.foldername(name))[1] = 'bon-topics'::text) OR ((storage.foldername(name))[1] = 'bon-topics-blocks'::text))));



  create policy "auth upload bon-topics"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'media'::text) AND ((storage.foldername(name))[1] = 'bon-topics'::text)));



  create policy "auth upload bon-topics-blocks"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'media'::text) AND ((storage.foldername(name))[1] = 'bon-topics-blocks'::text)));



  create policy "auth_read_media"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'media'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "auth_read_thumbnails"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'thumbnails'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "own_update_thumbnails"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'thumbnails'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "own_upload_media"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "own_upload_thumbnails"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'thumbnails'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));




-- ============================================================================
-- Migration: 20260417000000_ticket_system.sql
-- ============================================================================

-- ─── ticket_types (master) ────────────────────────────────────────────────────

CREATE TABLE "public"."ticket_types" (
  "id"          uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "label"       text NOT NULL,
  "color_start" text NOT NULL DEFAULT '#6aac14',
  "color_end"   text NOT NULL DEFAULT '#3d6e00',
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ticket_types_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."ticket_types" OWNER TO "postgres";

-- Everyone can read ticket_types; only service role / admin functions can write
ALTER TABLE "public"."ticket_types" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_types_select_authenticated"
  ON "public"."ticket_types"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "ticket_types_insert_admin"
  ON "public"."ticket_types"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profile_positions pp
      JOIN public.positions pos ON pos.id = pp.position_id
      WHERE pp.profile_id = auth.uid()
        AND (pos.permissions->>'ticket_admin')::boolean = true
    )
  );

CREATE POLICY "ticket_types_update_admin"
  ON "public"."ticket_types"
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profile_positions pp
      JOIN public.positions pos ON pos.id = pp.position_id
      WHERE pp.profile_id = auth.uid()
        AND (pos.permissions->>'ticket_admin')::boolean = true
    )
  );

CREATE POLICY "ticket_types_delete_admin"
  ON "public"."ticket_types"
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profile_positions pp
      JOIN public.positions pos ON pos.id = pp.position_id
      WHERE pp.profile_id = auth.uid()
        AND (pos.permissions->>'ticket_admin')::boolean = true
    )
  );

-- ─── tickets (transaction) ────────────────────────────────────────────────────

CREATE TABLE "public"."tickets" (
  "id"         uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "user_id"    uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "type_id"    uuid NOT NULL REFERENCES "public"."ticket_types"("id") ON DELETE CASCADE,
  "issued_at"  timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."tickets" OWNER TO "postgres";

CREATE INDEX "tickets_user_id_idx"    ON "public"."tickets" ("user_id");
CREATE INDEX "tickets_expires_at_idx" ON "public"."tickets" ("expires_at");

ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;

-- Users can read their own tickets
CREATE POLICY "tickets_select_own"
  ON "public"."tickets"
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own tickets
CREATE POLICY "tickets_insert_own"
  ON "public"."tickets"
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own tickets (used by admins via service role or future revoke feature)
CREATE POLICY "tickets_delete_own"
  ON "public"."tickets"
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ─── Admin read-all policy (via security definer function) ────────────────────

CREATE OR REPLACE FUNCTION "public"."get_active_tickets_for_admin"()
RETURNS TABLE (
  ticket_id   uuid,
  user_id     uuid,
  username    text,
  label       text,
  color_start text,
  color_end   text,
  issued_at   timestamptz,
  expires_at  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    t.id        AS ticket_id,
    t.user_id,
    p.username,
    tt.label,
    tt.color_start,
    tt.color_end,
    t.issued_at,
    t.expires_at
  FROM public.tickets t
  JOIN public.profiles     p  ON p.id  = t.user_id
  JOIN public.ticket_types tt ON tt.id = t.type_id
  WHERE t.expires_at >= now()
  ORDER BY t.issued_at DESC;
$$;

ALTER FUNCTION "public"."get_active_tickets_for_admin"() OWNER TO "postgres";

-- ─── Seed: default ticket types ───────────────────────────────────────────────


-- ============================================================================
-- Migration: 20260421000000_add_resubmit_fields.sql
-- ============================================================================

ALTER TABLE task_assignments
  ADD COLUMN IF NOT EXISTS resubmit_requested boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS previous_submission jsonb DEFAULT NULL;

-- ============================================================================
-- Migration: 20260501000000_add_is_public_to_tasks.sql
-- ============================================================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- ============================================================================
-- Migration: 20260504000000_task_courses.sql
-- ============================================================================

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

-- ============================================================================
-- Migration: 20260504000001_ai_task_themes.sql
-- ============================================================================

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

-- ============================================================================
-- Migration: 20260609000000_sns_management.sql
-- ============================================================================

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


-- ============================================================================
-- Migration: 20260609000001_sns_scheduled_notifications.sql
-- ============================================================================

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

-- ============================================================================
-- Migration: 20260617000000_add_x_consent_to_task_assignments.sql
-- ============================================================================

ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS x_consent boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS x_username text;

-- ============================================================================
-- Migration: 20260618000000_sns_text_presets.sql
-- ============================================================================

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

-- ============================================================================
-- Migration: 20260618000001_sns_images.sql
-- ============================================================================

-- SNS管理: 画像管理（共有ライブラリ + 投稿への画像添付）

CREATE OR REPLACE FUNCTION "public"."has_sns_management"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM public.profile_positions pp
    JOIN public.positions pos ON pos.id = pp.position_id
    WHERE pp.profile_id = auth.uid()
      AND (pos.permissions->>'sns_management')::boolean = true
  );
$$;

GRANT ALL ON FUNCTION "public"."has_sns_management"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_sns_management"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_sns_management"() TO "service_role";

CREATE TABLE IF NOT EXISTS sns_images (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id      uuid        REFERENCES sns_posts(id) ON DELETE CASCADE,
  storage_path text        NOT NULL,
  file_name    text        NOT NULL,
  uploaded_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE sns_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sns_images_all" ON sns_images
  FOR ALL USING (public.has_sns_management())
  WITH CHECK (public.has_sns_management());

-- 共有画像ライブラリ・投稿への画像添付用に media バケットの sns-images/ 配下を
-- sns_management 権限保有者であれば誰でもアップロード・削除できるようにする
CREATE POLICY "sns_management upload sns-images"
  ON "storage"."objects"
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = 'sns-images'
    AND public.has_sns_management()
  );

CREATE POLICY "sns_management delete sns-images"
  ON "storage"."objects"
  AS PERMISSIVE FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = 'sns-images'
    AND public.has_sns_management()
  );

-- ============================================================================
-- Migration: 20260618000002_sns_images_external_source.sql
-- ============================================================================

-- SNS画像: タイムライン提出物（サムネ・提出画像）を直接URL参照で添付できるようにする

ALTER TABLE sns_images
  ADD COLUMN IF NOT EXISTS image_url text;

UPDATE sns_images
  SET image_url = 'https://wrfcupvheechjarjjsoo.supabase.co/storage/v1/object/public/media/' || storage_path
  WHERE image_url IS NULL AND storage_path IS NOT NULL;

ALTER TABLE sns_images
  ALTER COLUMN storage_path DROP NOT NULL,
  ALTER COLUMN image_url SET NOT NULL;

-- ============================================================================
-- Migration: 20260719000000_activity_tracking.sql
-- ============================================================================

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

-- ============================================================================
-- Migration: 20260720000000_task_folders.sql
-- ============================================================================

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
