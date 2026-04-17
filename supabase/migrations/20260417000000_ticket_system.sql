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

