-- ═══════════════════════════════════════════════════════
-- BON-TOPICS ニュース機能 マイグレーション
-- ═══════════════════════════════════════════════════════

-- ── ニュース記事テーブル ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.news_articles (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                   text NOT NULL,
  title_color             text NOT NULL DEFAULT '#1a1a1a',
  thumbnail_url           text,
  thumbnail_aspect_ratio  float,      -- クロップ後のアスペクト比 (width/height)
  is_published            boolean NOT NULL DEFAULT false,
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ── ニュース記事ブロックテーブル ──────────────────────────
-- type: 'text' | 'image' | 'link' | 'task'
-- content (jsonb) スキーマ:
--   text  → { content: string, is_markdown: boolean }
--   image → { url: string }
--   link  → { url: string, label: string }
--   task  → { task_id: string, task_title: string }
CREATE TABLE IF NOT EXISTS public.news_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  uuid NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('text', 'image', 'link', 'task')),
  sort_order  integer NOT NULL DEFAULT 0,
  content     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── ニュース課題予約テーブル ──────────────────────────────
-- 各ユーザーが課題ブロックから予約できる課題（1つだけ）
CREATE TABLE IF NOT EXISTS public.news_task_reservations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id     uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  task_title  text NOT NULL,
  article_id  uuid REFERENCES public.news_articles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── インデックス ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS news_articles_created_at_idx
  ON public.news_articles(created_at DESC);

CREATE INDEX IF NOT EXISTS news_articles_published_idx
  ON public.news_articles(is_published, created_at DESC);

CREATE INDEX IF NOT EXISTS news_blocks_article_id_idx
  ON public.news_blocks(article_id, sort_order);

-- ── RLS ───────────────────────────────────────────────────
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_blocks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_task_reservations ENABLE ROW LEVEL SECURITY;

-- 公開済みニュースは全認証ユーザーが読める
CREATE POLICY "news_articles_select" ON public.news_articles
  FOR SELECT TO authenticated
  USING (is_published = true);

-- 管理者は全記事を読める（Supabase Dashboard で service_role 経由でも対応）
CREATE POLICY "news_articles_admin_select" ON public.news_articles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "news_articles_insert" ON public.news_articles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "news_articles_update" ON public.news_articles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "news_articles_delete" ON public.news_articles
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ブロックは公開済み記事のものを読める
CREATE POLICY "news_blocks_select" ON public.news_blocks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.news_articles
      WHERE news_articles.id = article_id
        AND (news_articles.is_published = true
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
          ))
    )
  );

CREATE POLICY "news_blocks_admin_write" ON public.news_blocks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- 予約は自分のものだけ操作可能
CREATE POLICY "reservations_select" ON public.news_task_reservations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "reservations_insert" ON public.news_task_reservations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "reservations_update" ON public.news_task_reservations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "reservations_delete" ON public.news_task_reservations
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── Supabase Storage バケット ──────────────────────────────
-- ※ Supabase Dashboard の Storage 画面または以下のコマンドで作成してください:
--
--   INSERT INTO storage.buckets (id, name, public)
--   VALUES ('news-images', 'news-images', true)
--   ON CONFLICT (id) DO NOTHING;
--
--   CREATE POLICY "news_images_public_read" ON storage.objects
--     FOR SELECT TO public USING (bucket_id = 'news-images');
--
--   CREATE POLICY "news_images_auth_upload" ON storage.objects
--     FOR INSERT TO authenticated WITH CHECK (bucket_id = 'news-images');
--
--   CREATE POLICY "news_images_auth_delete" ON storage.objects
--     FOR DELETE TO authenticated USING (bucket_id = 'news-images');
