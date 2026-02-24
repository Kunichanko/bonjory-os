# bonjory-os 仕様書

## プロジェクト概要

ゲームに連動したWebアプリ。ユーザーがサインアップ・ログインし、ダッシュボードで自分のユーザー名を確認できる。将来的にはゲームのスコアやプロフィール管理などの機能拡張を想定している。

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
- 現状: create-next-app のデフォルト（未カスタマイズ）

### `/signup` — サインアップ
- ファイル: `app/signup/page.tsx`
- 機能:
  - ユーザー名・メールアドレス・パスワードの入力
  - `supabase.auth.signUp()` でユーザー作成
  - ユーザー名は `options.data.username` としてメタデータに付与
  - DB トリガー（後述）により `profiles` テーブルへ自動挿入

### `/login` — ログイン
- ファイル: `app/login/page.tsx`
- 機能:
  - メールアドレス・パスワードで認証
  - `supabase.auth.signInWithPassword()` を使用
  - ログイン成功後 `/dashboard` へリダイレクト

### `/dashboard` — ダッシュボード
- ファイル: `app/dashboard/page.tsx`
- 機能:
  - セッション確認（未ログインなら `/login` へリダイレクト）
  - `profiles` テーブルから自分の `username` を取得して表示
  - ログアウトボタン

---

## データベース構造（Supabase）

### `public.profiles` テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | uuid | `auth.users.id` と一致（PK） |
| `created_at` | timestamptz | 作成日時 |
| `email` | text | メールアドレス |
| `username` | text | ユーザーが決めたユーザー名 |

### RLS ポリシー

| ポリシー名 | 操作 | 条件 |
|------------|------|------|
| Users can insert their own profile | INSERT | `auth.uid() = id` |
| Users can read their own profile | SELECT | `auth.uid() = id` |

### DBトリガー

サインアップ時に `auth.users` に行が挿入されると、自動的に `profiles` テーブルへレコードを作成する。

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'username'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

---

## 認証フロー

```
[サインアップ]
  ユーザー入力（username / email / password）
    → supabase.auth.signUp({ options: { data: { username } } })
    → auth.users に挿入
    → DBトリガーが発火 → profiles に挿入

[ログイン]
  ユーザー入力（email / password）
    → supabase.auth.signInWithPassword()
    → セッション確立 → /dashboard へ

[ダッシュボード]
  supabase.auth.getUser() でセッション確認
    → 未ログイン: /login へリダイレクト
    → ログイン済み: profiles テーブルから username 取得 → 表示
```

---

## ディレクトリ構造

```
bonjory-os/
├── app/
│   ├── layout.tsx          # ルートレイアウト（フォント・メタデータ）
│   ├── globals.css         # グローバルCSS・ゲームテーマ定義
│   ├── page.tsx            # トップページ（未カスタマイズ）
│   ├── login/
│   │   └── page.tsx        # ログインページ
│   ├── signup/
│   │   └── page.tsx        # サインアップページ
│   └── dashboard/
│       └── page.tsx        # ダッシュボード
├── lib/
│   └── supabase.ts         # Supabase クライアント初期化
├── public/                 # 静的ファイル
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## UIデザイン方針

- **テーマ**: ゲーム風UI
- **メインカラー**: 黄緑（`#6aac14`）
- **ボーダー / シャドウ**: 濃い緑（`#3d6e00`）で3D感を表現
- **フォント**: Mantou Sans（丸みのある太字）
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
