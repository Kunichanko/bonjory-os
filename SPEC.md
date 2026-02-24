# bonjory-os 仕様書

## プロジェクト概要

ゲーム制作部（bonjory）の活動管理Webアプリ。管理者が部員にコース・ステージを設定し、課題をアサイン。部員は週間サイクル（課題→制作計画→中間報告→最終提出）に沿って活動を記録する。将来的に Gemini API による課題カスタム提案も予定。

---

## 技術スタック

| 項目 | 採用技術 |
|------|----------|
| フレームワーク | Next.js 16（App Router） |
| UIライブラリ | React 19 |
| 言語 | TypeScript |
| スタイリング | Tailwind CSS v4 |
| バックエンド / 認証 / DB | Supabase |
| フォント | Mantou Sans（Google Fonts） |

---

## ページ構成

### `/` — トップページ
- ファイル: `app/page.tsx`
- 現状: 未カスタマイズ

### `/signup` — サインアップ
- ファイル: `app/signup/page.tsx`
- 機能:
  - ユーザー名・メールアドレス・パスワードの入力
  - `supabase.auth.signUp({ options: { data: { username } } })` でユーザー作成
  - DB トリガーにより `profiles` テーブルへ自動挿入

### `/login` — ログイン
- ファイル: `app/login/page.tsx`
- 機能:
  - メールアドレス・パスワードで認証
  - `supabase.auth.signInWithPassword()` を使用
  - ログイン成功後 `/dashboard` へリダイレクト

### `/dashboard` — 部員ダッシュボード
- ファイル: `app/dashboard/page.tsx`
- 機能:
  - セッション確認（未ログインなら `/login` へリダイレクト）
  - 自分のユーザー名・コース・ステージをバッジ表示
  - 週間サイクルタイムライン（月→木→日、今日の曜日をハイライト）
  - アサインされた課題の一覧表示（`task_assignments` テーブルから取得）
  - 課題ごとの制作計画入力（保存時 status → `in_progress`）
  - 最終提出フォーム（動画/画像URL・自己評価・計画の振り返り、提出時 status → `submitted`）
  - ログアウトボタン

### `/admin` — 部員管理
- ファイル: `app/admin/page.tsx`
- アクセス制限: `role = 'admin'` のみ（それ以外は `/dashboard` へリダイレクト）
- 機能:
  - 全部員一覧テーブル（ユーザー名・コース・ステージ・課題状況）
  - コース / ステージのドロップダウン即時変更
  - 「アサイン」ボタンで展開パネルを表示:
    - アサイン済み課題 + ステータスバッジ表示
    - 部員のコースでフィルタされた課題ドロップダウンで追加/削除
  - 課題管理ページへのナビボタン

### `/admin/tasks` — 課題管理
- ファイル: `app/admin/tasks/page.tsx`
- アクセス制限: `role = 'admin'` のみ
- 機能:
  - 課題作成フォーム（タイトル・説明・対象コース・対象ステージ）
  - 課題一覧（コース/ステージタグ・有効/停止トグル）
  - 部員管理ページへのナビボタン

---

## データベース構造（Supabase）

### `public.profiles` テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | uuid | `auth.users.id` と一致（PK） |
| `created_at` | timestamptz | 作成日時 |
| `email` | text | メールアドレス |
| `username` | text | ユーザー名 |
| `role` | text | `'admin'` または `'member'`（デフォルト: `'member'`） |
| `course` | text | `'Unity'` または `'Blender'`（nullable） |
| `stage` | text | `'Foundation'` / `'Development'` / `'Production'`（nullable） |

### `public.tasks` テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | uuid | PK |
| `title` | text | 課題タイトル |
| `description` | text | 課題の説明（nullable） |
| `target_course` | text | 対象コース（nullable = 全コース） |
| `target_stage` | text | 対象ステージ（nullable = 全ステージ） |
| `created_by` | uuid | 作成者（FK → auth.users） |
| `created_at` | timestamptz | 作成日時 |
| `is_active` | boolean | アクティブ状態（デフォルト: true） |

### `public.task_assignments` テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | uuid | PK |
| `task_id` | uuid | FK → tasks.id（CASCADE DELETE） |
| `user_id` | uuid | FK → auth.users |
| `status` | text | `'assigned'` / `'in_progress'` / `'submitted'` |
| `plan_text` | text | 制作計画（月曜入力） |
| `media_url` | text | 提出動画/画像URL |
| `self_evaluation` | text | 自己評価 |
| `retrospective` | text | 計画の振り返り |
| `submitted_at` | timestamptz | 提出日時 |
| `created_at` | timestamptz | 作成日時 |
| `updated_at` | timestamptz | 更新日時 |

※ `(task_id, user_id)` に UNIQUE 制約

### `public.plans` テーブル
- 旧仕様の制作計画テーブル（`task_assignments` に統合されたため非推奨）

---

## RLS ポリシー一覧

### profiles
| ポリシー名 | 操作 | 条件 |
|------------|------|------|
| Users can insert their own profile | INSERT | `auth.uid() = id` |
| Users can read their own profile | SELECT | `auth.uid() = id` |
| Admins can read all profiles | SELECT | `get_my_role() = 'admin'` |
| Admins can update all profiles | UPDATE | `get_my_role() = 'admin'` |

### tasks
| ポリシー名 | 操作 | 条件 |
|------------|------|------|
| Authenticated users can read tasks | SELECT | `auth.uid() IS NOT NULL` |
| Admins can insert tasks | INSERT | `get_my_role() = 'admin'` |
| Admins can update tasks | UPDATE | `get_my_role() = 'admin'` |

### task_assignments
| ポリシー名 | 操作 | 条件 |
|------------|------|------|
| Users can view own assignments | SELECT | `auth.uid() = user_id` |
| Users can update own assignments | UPDATE | `auth.uid() = user_id` |
| Admins can manage all assignments | ALL | `get_my_role() = 'admin'` |

### ヘルパー関数
```sql
-- RLS 内で再帰を防ぐための SECURITY DEFINER 関数
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;
```

---

## DBトリガー

サインアップ時に `auth.users` に行が挿入されると `profiles` テーブルへ自動挿入。

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'username');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

---

## 週間活動サイクル

GUIDELINE.md に基づく週間フロー：

| 曜日 | フェーズ | 部員の行動 |
|------|---------|-----------|
| 月〜水 | 課題開始 | アサインされた課題を確認し、制作計画を入力（status → `in_progress`） |
| 木〜土 | 中間報告 | 進捗と修正計画を報告 |
| 日 | 最終提出 | 動画/画像URL・自己評価・振り返りを入力して提出（status → `submitted`） |

---

## 認証フロー

```
[サインアップ]
  入力（username / email / password）
    → supabase.auth.signUp({ options: { data: { username } } })
    → auth.users に挿入
    → DBトリガー発火 → profiles に挿入

[ログイン]
  入力（email / password）
    → supabase.auth.signInWithPassword()
    → セッション確立 → /dashboard へ

[ダッシュボード]
  supabase.auth.getUser() でセッション確認
    → 未ログイン: /login へ
    → ログイン済み: profiles + task_assignments を取得 → 表示

[管理画面]
  getUser() → profiles で role 確認
    → role != 'admin': /dashboard へ
    → role = 'admin': 管理機能を表示
```

---

## ディレクトリ構造

```
bonjory-os/
├── app/
│   ├── layout.tsx              # ルートレイアウト
│   ├── globals.css             # グローバルCSS・ゲームテーマ定義
│   ├── page.tsx                # トップページ（未カスタマイズ）
│   ├── login/
│   │   └── page.tsx            # ログイン
│   ├── signup/
│   │   └── page.tsx            # サインアップ
│   ├── dashboard/
│   │   └── page.tsx            # 部員ダッシュボード
│   └── admin/
│       ├── page.tsx            # 部員管理
│       └── tasks/
│           └── page.tsx        # 課題管理
├── lib/
│   └── supabase.ts             # Supabase クライアント初期化
├── public/
├── SPEC.md                     # 本仕様書
├── GUIDELINE.md                # 指導要領
├── next.config.ts
└── package.json
```

---

## UIデザイン方針

- **テーマ**: ゲーム風UI
- **メインカラー**: 黄緑（`#6aac14`）
- **ボーダー / シャドウ**: 濃い緑（`#3d6e00`）で3D感を表現
- **フォント**: Mantou Sans（Google Fonts より読み込み）
- **共通CSSクラス**（`globals.css` で定義）:
  - `.game-card` — 白背景パネル（太ボーダー＋影）
  - `.game-button` — 押し込み効果のあるボタン
  - `.game-input` — 緑系インプットフィールド
  - `.game-label` / `.game-error` / `.game-success`

---

## 環境変数（`.env.local`）

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 開発サーバー起動

```bash
npm run dev
# → http://localhost:3000
```

---

## 今後の予定

- Gemini API による部員のコース・ステージに応じた課題カスタム提案
- 中間報告専用フォームの実装
- タイムライン（提出物の一覧・他部員レビュー）の実装
