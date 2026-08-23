# Bonjory OS - 実験用データベースセットアップガイド

本番DBを汚さずに開発・テストするための、実験用Supabaseプロジェクトのセットアップ手順です。

## 前提条件

- [Supabase](https://supabase.com) アカウント
- 新規Supabaseプロジェクト（テスト用に作成）

## セットアップ手順

### 1. Supabaseプロジェクトの作成

1. [Supabase Dashboard](https://supabase.com/dashboard) にログイン
2. 「New Project」からテスト用プロジェクトを作成
3. リージョンは任意（日本から使う場合は `Northeast Asia (Tokyo)` 推奨）

### 2. ストレージバケットの作成

SQL Editor で以下を実行する **前に**、Supabase Dashboard > Storage から以下のバケットを作成してください：

| バケット名 | Public |
|---|---|
| `media` | Yes |
| `thumbnails` | Yes |

### 3. スキーマの適用

1. Supabase Dashboard > **SQL Editor** を開く
2. `full_schema.sql` の内容を **全て** コピー＆ペースト
3. 「Run」で実行

> **注意**: `full_schema.sql` にはエクステンションの作成（`pg_graphql`, `pgcrypto` 等）が含まれています。
> Supabaseのマネージドプロジェクトでは一部が既にインストール済みのため、エラーが出ても `already exists` であれば問題ありません。

### 4. Auth トリガーの確認

スキーマ内に以下のトリガーが含まれています：

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

このトリガーにより、ユーザーがサインアップすると自動的に `profiles` テーブルにレコードが作成されます。

### 5. 環境変数の設定

テスト用プロジェクトの `.env.local` を作成（本番の値を **絶対に使わないこと**）：

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# プッシュ通知（テスト用に新しく生成すること）
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:your-email@example.com

# Gemini API（SNS文章生成に使用）
GEMINI_API_KEY=your_gemini_api_key

# Cron認証
CRON_SECRET=your_cron_secret
```

VAPID鍵の生成:
```bash
node -e "const wp=require('web-push'); console.log(JSON.stringify(wp.generateVAPIDKeys(), null, 2))"
```

### 6. テスト用管理者ユーザーの作成

1. アプリにサインアップ（`handle_new_user` トリガーで `profiles` に自動登録される）
2. SQL Editor で管理者に昇格：

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your-test-email@example.com';
```

## ファイル構成

```
supabase/
├── setup/
│   ├── README.md          ← このファイル
│   └── full_schema.sql    ← 一発セットアップ用SQL（全マイグレーション統合）
├── migrations/            ← 個別マイグレーションファイル（差分管理用）
│   ├── 20260407053907_remote_schema.sql      ← ベーススキーマ
│   ├── 20260417000000_ticket_system.sql
│   ├── 20260421000000_add_resubmit_fields.sql
│   ├── 20260501000000_add_is_public_to_tasks.sql
│   ├── 20260504000000_task_courses.sql
│   ├── 20260504000001_ai_task_themes.sql
│   ├── 20260609000000_sns_management.sql
│   ├── 20260609000001_sns_scheduled_notifications.sql
│   ├── 20260617000000_add_x_consent_to_task_assignments.sql
│   ├── 20260618000000_sns_text_presets.sql
│   ├── 20260618000001_sns_images.sql
│   ├── 20260618000002_sns_images_external_source.sql
│   ├── 20260719000000_activity_tracking.sql
│   └── 20260720000000_task_folders.sql
└── config.toml
```

## 注意事項

- **本番のAPIキーを実験用プロジェクトに使い回さないこと**
- `full_schema.sql` はマイグレーションファイルの統合版です。新しいマイグレーションが追加された場合は再生成が必要です
- テストデータの投入は各自で行ってください（`supabase_data/backup/` 内のJSONを参考にできます）
