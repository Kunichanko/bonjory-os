# bonjory-os 詳細仕様書 (v2.0)

## 1. プロジェクト概要
ゲーム制作サークル「BONJORY」の教育・進捗管理・コミュニティ形成を一括で行うWebアプリ。
指導要領に基づき、初心者が「小さな任天堂」のメンバーとして成長するためのプラットフォームを提供する。

## 2. ユーザーロール（権限）
| ロール | 権限内容 |
| :--- | :--- |
| **管理者 (Admin)** | 全ユーザーの進捗確認、課題の作成・配信、コース設定、全投稿の管理、公式Xへの書き出し管理 |
| **部員 (Member)** | 自分のコース/段階の確認、月・木・日の進捗報告、他者へのレビュー、タイムライン閲覧 |

## 3. 主要機能

### ① 管理者ダッシュボード (`/admin`)
- **ユーザー管理**: 各部員の「Unity/Blenderコース」や「基礎/応用/実践」のランクをプルダウンで変更。
- **課題配信**: 月曜日に配信する課題（テキスト・参考URL）を作成・配信。
- **モニタリング**: 部員全員の報告状況（未提出・中間・完了）を一覧で把握。

### ② BONJORY タイムライン (`/timeline`)
- **SNS風表示**: 日曜日に提出された作品（動画・画像）を、XやInstagramのように縦スクロールで表示。
- **インタラクション**: タイムライン上で直接「いい点・改善点」のレビューやコメントが可能。
- **ギャラリー**: 自分の過去作をポートフォリオとして一覧表示。

### ③ クラウド成果物管理
- **Supabase Storage**: スクリーンショットや動画ファイルをクラウドに保存。
- **自動プレビュー**: タイムライン上で動画の自動再生やホバー再生に対応。

## 4. データベース構造（拡張案）

### `public.profiles` (既存拡張)
- `id` (uuid), `username` (text), `course` (unity/blender), `stage` (foundation/dev/prod), `is_admin` (boolean)

### `public.tasks` (課題マスタ)
- `id`, `title`, `description`, `target_stage`, `course_type`, `created_at`

### `public.task_submissions` (タイムライン原資)
- `id`, `user_id`, `task_id`, `status` (planned/interim/completed), `media_url`, `self_evaluation`, `created_at`

## 5. UI/UX デザイン方針
- **テーマ**: ゲーム風UI（メインカラー: #6aac14 / ボーダー: #3d6e00）。
- **コンポーネント**: 
  - `.game-card`: 白背景パネル（太ボーダー＋影）。
  - `.game-button`: 押し込み効果のある3Dボタン。
  - `.game-input`: 緑系の枠線を持つ入力フィールド。
- **フォント**: Mantou Sans（Google Fonts）。

## 6. 技術スタック
- **Framework**: Next.js 15+ (App Router)
- **Language**: TypeScript
- **UI**: React 19, Tailwind CSS v4, Lucide React (Icons)
- **Backend**: Supabase (Auth, DB, Storage)