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
