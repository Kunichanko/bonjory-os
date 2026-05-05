'use client'
import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { getEffectivePermissions } from '@/lib/permissions'
import { Wrench, ClipboardList, Inbox, Bug, Lightbulb, BookOpen, GitBranch, Database, Bot, GraduationCap, Map } from 'lucide-react'

type Tab = 'workflow' | 'todo' | 'reports'
type TaskStatus = 'todo' | 'in_progress' | 'done'
type ReportStatus = 'pending' | 'approved' | 'rejected'
type ReportFilter = 'all' | ReportStatus

interface Profile { id: string; username: string }
interface BugReport {
  id: string
  user_id: string
  type: 'bug' | 'feature'
  summary: string
  condition: string | null
  error_msg: string | null
  prediction: string | null
  target_area: string | null
  implementation_idea: string | null
  status: ReportStatus
  awarded_points: number | null
  created_at: string
  profiles: { username: string } | null
}
interface DevTask {
  id: string
  summary: string
  detail: string | null
  deadline: string | null
  report_id: string | null
  status: TaskStatus
  created_at: string
  dev_task_assignees: { user_id: string }[]
  bug_reports: { summary: string } | null
}

const STATUS_LABELS: Record<TaskStatus, string> = { todo: 'ToDo', in_progress: '進行中', done: '完了' }
const STATUS_COLORS: Record<TaskStatus, { bg: string; text: string }> = {
  todo:        { bg: '#3d6e00', text: 'white' },
  in_progress: { bg: '#b8860b', text: 'white' },
  done:        { bg: '#999',    text: 'white' },
}
const REPORT_STATUS_LABELS: Record<ReportStatus, string> = { pending: '未処理', approved: '承認済', rejected: '却下' }
const REPORT_STATUS_COLORS: Record<ReportStatus, { bg: string; text: string }> = {
  pending:  { bg: '#b8860b', text: 'white' },
  approved: { bg: '#3d6e00', text: 'white' },
  rejected: { bg: '#999',    text: 'white' },
}

export default function DevManagePage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('todo')
  const [loading, setLoading] = useState(true)

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [reports, setReports] = useState<BugReport[]>([])

  // ToDo
  const [tasks, setTasks] = useState<DevTask[]>([])
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [newSummary, setNewSummary] = useState('')
  const [newDetail, setNewDetail] = useState('')
  const [newDeadline, setNewDeadline] = useState('')
  const [newAssignees, setNewAssignees] = useState<string[]>([])
  const [newReportId, setNewReportId] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  // 報告一覧
  const [expandedReport, setExpandedReport] = useState<string | null>(null)
  const [reportFilter, setReportFilter] = useState<ReportFilter>('all')
  const [pointInputs, setPointInputs] = useState<Record<string, string>>({})
  const [processingReport, setProcessingReport] = useState<string | null>(null)

  // 開発ガイド アコーディオン
  const [openSection, setOpenSection] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const isAdmin = profile?.role === 'admin'
      if (!isAdmin) {
        const perms = await getEffectivePermissions(user.id)
        if (!perms.dev_management) { router.push('/dashboard'); return }
      }

      const [profilesRes, reportsRes, tasksRes] = await Promise.all([
        supabase.from('profiles').select('id, username').order('username'),
        supabase.from('bug_reports').select('*, profiles(username)').order('created_at', { ascending: false }),
        supabase.from('dev_tasks').select('*, dev_task_assignees(user_id), bug_reports(summary)').order('created_at', { ascending: false }),
      ])

      setProfiles(profilesRes.data ?? [])
      setReports((reportsRes.data ?? []) as BugReport[])
      setTasks((tasksRes.data ?? []) as DevTask[])
      setLoading(false)
    }
    init()
  }, [router])

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newSummary.trim()) return
    setAddingTask(true)

    const { data: task, error } = await supabase
      .from('dev_tasks')
      .insert({ summary: newSummary.trim(), detail: newDetail.trim() || null, deadline: newDeadline || null, report_id: newReportId || null })
      .select('*, dev_task_assignees(user_id), bug_reports(summary)')
      .single()

    if (error || !task) { alert('追加に失敗しました: ' + error?.message); setAddingTask(false); return }

    if (newAssignees.length > 0) {
      await supabase.from('dev_task_assignees').insert(newAssignees.map(uid => ({ task_id: task.id, user_id: uid })))
      task.dev_task_assignees = newAssignees.map(uid => ({ user_id: uid }))
    }

    setTasks(prev => [task as DevTask, ...prev])
    setNewSummary(''); setNewDetail(''); setNewDeadline(''); setNewAssignees([]); setNewReportId('')
    setAddingTask(false)
  }

  async function cycleTaskStatus(task: DevTask) {
    const next: TaskStatus = task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'todo'
    await supabase.from('dev_tasks').update({ status: next }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
  }

  async function handleApprove(report: BugReport) {
    const pts = parseInt(pointInputs[report.id] ?? '0')
    if (isNaN(pts) || pts < 0) { alert('正しいポイント数を入力してください'); return }
    setProcessingReport(report.id)

    if (pts > 0) {
      const { error: rpcErr } = await supabase.rpc('add_points_to_user', { target_user_id: report.user_id, amount: pts })
      if (rpcErr) { alert('ポイント付与に失敗しました: ' + rpcErr.message); setProcessingReport(null); return }
    }
    const { error } = await supabase.from('bug_reports').update({ status: 'approved', awarded_points: pts }).eq('id', report.id)
    if (error) { alert('承認に失敗しました: ' + error.message); setProcessingReport(null); return }

    setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'approved', awarded_points: pts } : r))
    setProcessingReport(null)
  }

  async function handleReject(report: BugReport) {
    if (!confirm('この報告を却下しますか？')) return
    setProcessingReport(report.id)
    const { error } = await supabase.from('bug_reports').update({ status: 'rejected' }).eq('id', report.id)
    if (error) { alert('却下に失敗しました: ' + error.message); setProcessingReport(null); return }
    setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'rejected' } : r))
    setProcessingReport(null)
  }

  function toggleAssignee(uid: string) {
    setNewAssignees(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])
  }

  const filteredReports = reportFilter === 'all' ? reports : reports.filter(r => r.status === reportFilter)

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#3d6e00', fontWeight: 'bold' }}>読み込み中...</p>
    </div>
  )

  // ── 開発ガイド ヘルパー ──
  const codeBlock = (code: string) => (
    <pre style={{
      background: '#1a2e00', color: '#a8d870', borderRadius: 10,
      padding: '12px 14px', fontSize: 12, fontFamily: 'monospace',
      overflowX: 'auto', margin: '10px 0', whiteSpace: 'pre',
      border: '2px solid #3d6e00', lineHeight: 1.6,
    }}><code>{code}</code></pre>
  )
  const secHead = (text: string) => (
    <p style={{ color: '#3d6e00', fontWeight: 'bold', marginTop: 16, marginBottom: 6, fontSize: 14 }}>{text}</p>
  )
  const tipBox = (text: string) => (
    <div style={{ background: '#f0fae0', border: '2px solid #6aac14', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#2d5500', marginTop: 10 }}>
      💡 {text}
    </div>
  )
  const warnBox = (text: string) => (
    <div style={{ background: '#fffbe6', border: '2px solid #b8860b', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#7a5a00', marginTop: 10 }}>
      ⚠️ {text}
    </div>
  )
  function WorkflowSection({ sectionKey, icon, title, children }: {
    sectionKey: string; icon: React.ReactNode; title: string; children: React.ReactNode
  }) {
    const isOpen = openSection === sectionKey
    return (
      <div className="game-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          onClick={() => setOpenSection(isOpen ? null : sectionKey)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }}
        >
          <span style={{ color: '#6aac14', flexShrink: 0 }}>{icon}</span>
          <span style={{ color: '#2d5500', flex: 1, fontSize: 15, fontWeight: 'bold' }}>{title}</span>
          <span style={{ color: '#3d6e00', fontSize: 14, display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
        {isOpen && (
          <div style={{ padding: '0 18px 18px', borderTop: '2px solid #e8f5d0' }}>
            {children}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', padding: '80px 16px 40px' }}>
      {/* 戻るボタン */}
      <a href="/dashboard" style={{ textDecoration: 'none' }}>
        <button style={{
          position: 'fixed', top: 20, left: 16, zIndex: 50,
          background: '#1a3a00', border: '3px solid #6aac14', borderRadius: 12,
          color: '#a8d870', fontSize: 13, fontWeight: 'bold',
          padding: '10px 18px', cursor: 'pointer',
          boxShadow: '0 4px 0 #0d2000',
        }}>
          ← ダッシュボード
        </button>
      </a>

      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 className="game-title" style={{ textAlign: 'center', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}><Wrench size={24}/>開発者管理</h1>

        {/* タブ */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {(['workflow', 'todo', 'reports'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '10px 0',
                background: tab === t ? '#3d6e00' : 'white',
                border: '3px solid #3d6e00', borderRadius: 12,
                color: tab === t ? 'white' : '#3d6e00',
                fontWeight: 'bold', fontSize: 13, cursor: 'pointer',
                boxShadow: tab === t ? '0 4px 0 #0d2000' : '0 4px 0 #3d6e00',
              }}
            >
              {t === 'workflow'
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><BookOpen size={14}/>開発ガイド</span>
                : t === 'todo'
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ClipboardList size={14}/>To Do</span>
                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Inbox size={14}/>報告一覧</span>
              }
            </button>
          ))}
        </div>

        {/* ── 開発ガイド ── */}
        {tab === 'workflow' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ color: '#5a8a1a', fontSize: 13, textAlign: 'center', marginBottom: 4 }}>
              各セクションをタップして展開 — <strong>dev_management 権限者限定</strong>
            </p>

            {/* ① Git 連携 */}
            <WorkflowSection sectionKey="git" icon={<GitBranch size={18}/>} title="① Git 連携 — セットアップ〜プッシュ">
              {secHead('初回セットアップ（新しい PC に入れるとき）')}
              {codeBlock(`# リポジトリをクローン
git clone https://github.com/Kunichanko/bonjory-os.git
cd bonjory-os

# 依存関係をインストール
npm install

# 環境変数ファイルを作成（チームリーダーから値をもらうこと）
cp .env.local.example .env.local`)}

              {secHead('毎日の作業フロー（黄金ルール）')}
              {codeBlock(`# ① 作業前: 最新コードを取り込む
git pull origin main

# ② ファイルを編集する（コードを書く）

# ③ 変更を確認する
git status
git diff

# ④ ステージング（変更ファイルを選んで追加）
git add app/admin/dev/page.tsx
# まとめて追加したい場合
git add -A

# ⑤ コミット
git commit -m "feat: 開発ガイドタブを追加"

# ⑥ プッシュ
git push origin main`)}

              {tipBox('コミットメッセージは "何をしたか" より "なぜしたか" を書くと後で読み返しやすい。例: "fix: ログイン後のリダイレクト先を /dashboard に修正"')}
              {warnBox('push する前に必ず git pull を実行すること。他のメンバーの変更と衝突（コンフリクト）が起きる原因になる。')}
            </WorkflowSection>

            {/* ② ブランチ戦略 */}
            <WorkflowSection sectionKey="branch" icon={<GitBranch size={18}/>} title="② ブランチ戦略 — 安全な並行開発">
              {secHead('ブランチ命名規則')}
              {codeBlock(`# 機能追加
git checkout -b feature/workflow-guide-tab

# バグ修正
git checkout -b fix/login-redirect-bug

# 緊急修正
git checkout -b hotfix/dashboard-crash

# 命名パターン: <種別>/<kebab-case-の説明>`)}

              {secHead('ブランチを使った開発フロー')}
              {codeBlock(`# 1. main から最新を取り込む
git checkout main
git pull origin main

# 2. 新しいブランチを切る
git checkout -b feature/my-new-feature

# 3. 開発・コミット
git add .
git commit -m "feat: 新機能を追加"

# 4. リモートに送る
git push origin feature/my-new-feature

# 5. GitHub で Pull Request を作成してレビューを依頼`)}

              {secHead('コンフリクト（衝突）が起きたとき')}
              {codeBlock(`# まず最新の main を取り込む
git checkout main && git pull

# 自分のブランチに取り込む
git checkout feature/my-new-feature
git merge main

# <<<<<<, =======, >>>>>>> の箇所を手動で解決してから
git add .
git commit -m "merge: main との衝突を解消"`)}

              {tipBox('小さいコミットを頻繁にするとコンフリクトが起きても解決が簡単になる。1 機能 = 1 コミットを心がけよう。')}
            </WorkflowSection>

            {/* ③ AI エージェント */}
            <WorkflowSection sectionKey="ai" icon={<Bot size={18}/>} title="③ AI エージェント活用 — Claude / Gemini">
              {secHead('Claude Code の基本的な使い方')}
              <p style={{ color: '#2d5500', fontSize: 13, marginTop: 10, lineHeight: 1.7 }}>
                Claude Code は「コードの読み書きができる AI」として機能する。ターミナルで起動するとプロジェクト全体のファイルを読んだ上でコードを生成・修正できる。
              </p>
              {codeBlock(`# Claude Code をインストール（グローバル）
npm install -g @anthropic-ai/claude-code

# プロジェクトディレクトリで起動
cd bonjory-os
claude`)}

              {secHead('効果的なプロンプトの書き方')}
              {codeBlock(`# ❌ 曖昧すぎる
"ダッシュボードを直して"

# ✅ 具体的に: ファイル・現象・期待動作を含める
"app/dashboard/page.tsx の useEffect 内で、
ログアウト済みでも /dashboard にアクセスできる
バグがある。supabase.auth.getUser() でセッション
確認後、未ログインなら /login へリダイレクト
するよう修正してほしい。"`)}

              {secHead('AI にデータベース操作を依頼するときの必須テンプレート')}
              {codeBlock(`以下の情報を必ず含めてAIに伝える:

テーブル名: [例: profiles, bug_reports]
操作したいこと: [例: status が pending のものだけを取得]
既存のクエリ例:
  supabase.from('profiles').select('id, username').order('username')

Supabase の RLS が有効なので、
認証ユーザーのみアクセス可能にすること。
結果を TypeScript の型で受け取りたいので、
interface も一緒に提案してほしい。`)}

              {secHead('Gemini との使い分け')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {([
                  ['Claude Code', 'コード生成・バグ修正・ファイル直接編集'],
                  ['Gemini', 'ドキュメント生成、アーキテクチャ相談、日本語テキスト整形'],
                  ['共通', 'SQL クエリ設計・型定義・エラーメッセージの解説'],
                ] as [string, string][]).map(([tool, desc]) => (
                  <div key={tool} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                    <span style={{ color: '#6aac14', fontWeight: 'bold', minWidth: 90, flexShrink: 0 }}>{tool}</span>
                    <span style={{ color: '#2d5500' }}>{desc}</span>
                  </div>
                ))}
              </div>
              {tipBox('AI が生成したコードは必ず動作確認してからコミットすること。「動いた」と「正しい」は別物。')}
            </WorkflowSection>

            {/* ④ データベース操作 */}
            <WorkflowSection sectionKey="db" icon={<Database size={18}/>} title="④ データベース操作 — Supabase SQL">
              {secHead('基本的なクエリパターン（TypeScript）')}
              {codeBlock(`// SELECT — 全件取得
const { data, error } = await supabase
  .from('profiles')
  .select('id, username, role')
  .order('username')

// SELECT — 条件付き
const { data: pending } = await supabase
  .from('bug_reports')
  .select('*, profiles(username)')
  .eq('status', 'pending')
  .order('created_at', { ascending: false })

// INSERT
const { data: task, error } = await supabase
  .from('dev_tasks')
  .insert({ summary: 'タスク名', detail: '詳細' })
  .select()
  .single()

// UPDATE
await supabase
  .from('dev_tasks')
  .update({ status: 'done' })
  .eq('id', taskId)

// DELETE（慎重に！）
await supabase
  .from('dev_tasks')
  .delete()
  .eq('id', taskId)`)}

              {secHead('AI に SQL 相談するときの必須ルール')}
              {warnBox('Supabase の変更は本番 DB に直接反映される。AI に操作を依頼するときは必ず SQL を一緒に提示し、実行前にレビューすること。')}
              {codeBlock(`-- AI への相談例（このSQL を貼り付けてから質問する）

-- 現在のテーブル構造
-- profiles: id(uuid), username(text), role(text), course(text)
-- bug_reports: id(uuid), user_id(uuid FK→profiles.id),
--              type(text), summary(text), status(text)

-- やりたいこと:
-- bug_reports に priority カラム(integer, デフォルト0)を追加したい
-- AI へ: このテーブルにカラムを追加する SQL と、
-- Next.js から参照する TypeScript 型の変更を教えてほしい`)}

              {secHead('マイグレーションのワークフロー')}
              {codeBlock(`-- Supabase ダッシュボード → SQL Editor で実行

-- 1. カラム追加
ALTER TABLE public.bug_reports
  ADD COLUMN priority integer NOT NULL DEFAULT 0;

-- 2. インデックス追加（検索が遅いとき）
CREATE INDEX idx_bug_reports_status
  ON public.bug_reports(status);

-- 3. RLS ポリシー確認（追加後に必ず確認）
SELECT * FROM pg_policies
  WHERE tablename = 'bug_reports';`)}

              {secHead('RPC（サーバーサイド関数）の呼び出し')}
              {codeBlock(`// Supabase RPC を TypeScript から呼ぶ
const { error } = await supabase.rpc(
  'add_points_to_user',
  { target_user_id: userId, amount: 100 }
)
// RPC は Supabase ダッシュボード → Database → Functions で定義`)}
            </WorkflowSection>

            {/* ⑤ アーキテクチャ */}
            <WorkflowSection sectionKey="arch" icon={<Map size={18}/>} title="⑤ アーキテクチャ理解 — プロジェクト全体像">
              {secHead('技術スタック')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {([
                  ['Next.js 16', 'App Router（/app ディレクトリ）。全ページ "use client" で CSR'],
                  ['React 19', 'useState / useEffect / Fragment を多用'],
                  ['TypeScript', '厳密型付け。interface で Supabase 行型を定義'],
                  ['Supabase', '認証 + PostgreSQL DB + RLS（行レベルセキュリティ）+ Storage'],
                  ['Tailwind v4', '.game-card / .game-button 等のカスタムクラスでゲーム UI'],
                  ['lucide-react', 'アイコンライブラリ。全ページで統一して使用'],
                ] as [string, string][]).map(([tech, desc]) => (
                  <div key={tech} style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'flex-start' }}>
                    <span style={{ color: '#6aac14', fontWeight: 'bold', minWidth: 100, flexShrink: 0 }}>{tech}</span>
                    <span style={{ color: '#2d5500', lineHeight: 1.5 }}>{desc}</span>
                  </div>
                ))}
              </div>

              {secHead('重要ファイル一覧')}
              {codeBlock(`app/
  layout.tsx          # ルートレイアウト（フォント・グローバル CSS）
  globals.css         # .game-card / .game-button 等のカスタムクラス
  admin/dev/page.tsx  # このページ（開発者管理）
  admin/positions/    # 権限ポジション管理

lib/
  supabase.ts         # Supabase クライアント（シングルトン）
  permissions.ts      # 権限キー定義 + getEffectivePermissions()

supabase/migrations/  # DB スキーマ変更履歴
SPEC.md               # DB テーブル仕様・RLS ポリシー一覧
GUIDELINE.md          # 部活の教育理念・週間サイクル定義`)}

              {secHead('権限システムの仕組み')}
              <p style={{ color: '#2d5500', fontSize: 13, marginTop: 8, lineHeight: 1.7 }}>
                全管理ページの useEffect 内で下記のパターンを使う。role === 'admin' なら全権限あり。それ以外は positions テーブル（役職）に紐付いた permissions JSON で OR 判定する。
              </p>
              {codeBlock(`const perms = await getEffectivePermissions(user.id)
if (!perms.dev_management) {
  router.push('/dashboard')
  return
}
// ← ここから先が保護されたコンテンツ`)}

              {secHead('新規ページを作成するときの手順')}
              {codeBlock(`1. app/<path>/page.tsx を作成
2. 先頭に 'use client' を記述
3. useEffect で認証チェック + 権限チェック
4. lib/permissions.ts の FEATURE_LIST に追加
   → 管理者ダッシュボードに自動表示される`)}
            </WorkflowSection>

            {/* ⑥ 学習ロードマップ */}
            <WorkflowSection sectionKey="roadmap" icon={<GraduationCap size={18}/>} title="⑥ 学習ロードマップ — 入門からプロへ">
              {([
                {
                  level: 'Lv.1 入門', color: '#6aac14',
                  goal: '環境構築して画面が表示できる',
                  items: [
                    'git clone → npm install → npm run dev が動く',
                    'Supabase ダッシュボードにログインできる',
                    '既存ページのテキストを 1 か所変えてコミットできる',
                    'TypeScript の基本型（string, number, boolean, interface）を理解する',
                  ],
                },
                {
                  level: 'Lv.2 初級', color: '#b8860b',
                  goal: '既存パターンを真似て機能を追加できる',
                  items: [
                    'useState / useEffect の動きを理解する',
                    'supabase.from().select() でデータを取得・表示できる',
                    'フォームを作って INSERT できる',
                    'ブランチを切って PR を出せる',
                  ],
                },
                {
                  level: 'Lv.3 中級', color: '#3d6e00',
                  goal: '自分でページを設計・実装できる',
                  items: [
                    'RLS ポリシーを読み書きできる',
                    'getEffectivePermissions を使った権限チェックを実装できる',
                    'Supabase RPC を自分で作れる',
                    'コンポーネント分割のタイミングが判断できる',
                  ],
                },
                {
                  level: 'Lv.4 上級', color: '#2d5500',
                  goal: 'チームの技術的意思決定ができる',
                  items: [
                    'N+1 クエリ等のパフォーマンス問題を検知・修正できる',
                    'AI エージェントへのプロンプトを設計できる',
                    '新機能の DB 設計（マイグレーション含む）ができる',
                    'コードレビューで本質的なフィードバックができる',
                  ],
                },
              ]).map(({ level, color, goal, items }) => (
                <div key={level} style={{ marginTop: 14, borderLeft: `4px solid ${color}`, paddingLeft: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ background: color, color: 'white', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 'bold' }}>{level}</span>
                    <span style={{ color: '#2d5500', fontSize: 13, fontWeight: 'bold' }}>{goal}</span>
                  </div>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {items.map(item => (
                      <li key={item} style={{ color: '#3d6e00', fontSize: 13, marginBottom: 3 }}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {tipBox('毎日少しずつ読み込むより、「動くものを作る」→「なぜ動くか理解する」のサイクルが最速。詰まったら AI に聞く前にエラーメッセージをそのまま Google 検索してみよう。')}
            </WorkflowSection>
          </div>
        )}

        {/* ── To Do 管理 ── */}
        {tab === 'todo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* タスク追加フォーム */}
            <div className="game-card" style={{ padding: 20 }}>
              <p style={{ color: '#3d6e00', fontWeight: 'bold', marginBottom: 14, fontSize: 15 }}>タスク追加</p>
              <form onSubmit={handleAddTask} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label className="game-label">概要 <span style={{ color: '#e53e3e' }}>*</span></label>
                  <input className="game-input" style={{ width: '100%', boxSizing: 'border-box' }} value={newSummary} onChange={e => setNewSummary(e.target.value)} placeholder="タスクの概要" required />
                </div>
                <div>
                  <label className="game-label">詳細 <span style={{ color: '#5a8a1a', fontSize: 12 }}>(任意)</span></label>
                  <textarea className="game-input" style={{ width: '100%', boxSizing: 'border-box', minHeight: 60, resize: 'vertical' }} value={newDetail} onChange={e => setNewDetail(e.target.value)} placeholder="詳しい説明" />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label className="game-label">実装期限 <span style={{ color: '#5a8a1a', fontSize: 12 }}>(任意)</span></label>
                    <input className="game-input" type="date" style={{ width: '100%', boxSizing: 'border-box' }} value={newDeadline} onChange={e => setNewDeadline(e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="game-label">紐付け報告 <span style={{ color: '#5a8a1a', fontSize: 12 }}>(任意)</span></label>
                    <select className="game-input" style={{ width: '100%', boxSizing: 'border-box' }} value={newReportId} onChange={e => setNewReportId(e.target.value)}>
                      <option value="">なし</option>
                      {reports.filter(r => r.status !== 'rejected').map(r => (
                        <option key={r.id} value={r.id}>[{r.type === 'bug' ? '不具合' : '要望'}] {r.summary.slice(0, 30)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="game-label">担当者 <span style={{ color: '#5a8a1a', fontSize: 12 }}>(複数選択可)</span></label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {profiles.map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#3d6e00', cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={newAssignees.includes(p.id)} onChange={() => toggleAssignee(p.id)} style={{ accentColor: '#6aac14' }} />
                        {p.username}
                      </label>
                    ))}
                  </div>
                </div>
                <button type="submit" className="game-button" disabled={addingTask}>
                  {addingTask ? '追加中...' : '追加'}
                </button>
              </form>
            </div>

            {/* タスクリスト */}
            {tasks.length === 0 && <p style={{ color: '#3d6e00', textAlign: 'center', fontWeight: 'bold' }}>タスクはありません</p>}
            {tasks.map(task => {
              const assigneeNames = task.dev_task_assignees.map(a => profiles.find(p => p.id === a.user_id)?.username ?? '').filter(Boolean)
              const isOpen = expandedTask === task.id
              const sc = STATUS_COLORS[task.status]
              return (
                <Fragment key={task.id}>
                  <div className="game-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div
                      onClick={() => setExpandedTask(isOpen ? null : task.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}
                    >
                      <span style={{ background: sc.bg, color: sc.text, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {STATUS_LABELS[task.status]}
                      </span>
                      <span style={{ color: '#2d5500', flex: 1, fontSize: 14 }}>{task.summary}</span>
                      {task.deadline && <span style={{ color: '#5a8a1a', fontSize: 12, whiteSpace: 'nowrap' }}>{task.deadline}</span>}
                      {assigneeNames.length > 0 && <span style={{ color: '#3d6e00', fontSize: 12 }}>{assigneeNames.join(', ')}</span>}
                      <span style={{ color: '#3d6e00', fontSize: 14 }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                    {isOpen && (
                      <div style={{ padding: '0 16px 16px', borderTop: '2px solid #e8f5d0' }}>
                        {task.detail && <p style={{ color: '#3d6e00', marginTop: 12, fontSize: 14 }}>{task.detail}</p>}
                        {task.bug_reports && (
                          <p style={{ color: '#5a8a1a', fontSize: 13, marginTop: 8 }}>
                            紐付け報告: {task.bug_reports.summary}
                          </p>
                        )}
                        <div style={{ marginTop: 12 }}>
                          <button
                            onClick={() => cycleTaskStatus(task)}
                            style={{
                              background: 'white', border: '2px solid #3d6e00', borderRadius: 8,
                              color: '#3d6e00', padding: '6px 14px', cursor: 'pointer', fontSize: 13,
                              fontWeight: 'bold',
                            }}
                          >
                            ステータス変更 → {STATUS_LABELS[task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'todo']}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </Fragment>
              )
            })}
          </div>
        )}

        {/* ── 報告一覧 ── */}
        {tab === 'reports' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* フィルタ */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['all', 'pending', 'approved', 'rejected'] as ReportFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setReportFilter(f)}
                  style={{
                    padding: '6px 16px',
                    background: reportFilter === f ? '#3d6e00' : 'white',
                    border: '2px solid #3d6e00', borderRadius: 8,
                    color: reportFilter === f ? 'white' : '#3d6e00',
                    fontWeight: 'bold', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {f === 'all' ? '全件' : REPORT_STATUS_LABELS[f as ReportStatus]}
                </button>
              ))}
            </div>

            {filteredReports.length === 0 && <p style={{ color: '#3d6e00', textAlign: 'center', fontWeight: 'bold' }}>報告はありません</p>}
            {filteredReports.map(report => {
              const isOpen = expandedReport === report.id
              const processing = processingReport === report.id
              const sc = REPORT_STATUS_COLORS[report.status]
              return (
                <Fragment key={report.id}>
                  <div className="game-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div
                      onClick={() => setExpandedReport(isOpen ? null : report.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}
                    >
                      <span style={{ background: '#e8f5d0', border: '1px solid #3d6e00', borderRadius: 6, padding: '2px 8px', fontSize: 12, color: '#3d6e00', whiteSpace: 'nowrap' }}>
                        {report.type === 'bug'
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Bug size={11}/>不具合</span>
                          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lightbulb size={11}/>要望</span>
                        }
                      </span>
                      <span style={{ color: '#2d5500', flex: 1, fontSize: 14 }}>{report.summary}</span>
                      <span style={{ color: '#5a8a1a', fontSize: 12, whiteSpace: 'nowrap' }}>{report.profiles?.username}</span>
                      <span style={{ background: sc.bg, color: sc.text, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {REPORT_STATUS_LABELS[report.status]}
                      </span>
                      <span style={{ color: '#3d6e00', fontSize: 14 }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                    {isOpen && (
                      <div style={{ padding: '0 16px 16px', borderTop: '2px solid #e8f5d0' }}>
                        <p style={{ color: '#5a8a1a', fontSize: 12, marginTop: 10 }}>
                          {new Date(report.created_at).toLocaleString('ja-JP')} — {report.profiles?.username}
                        </p>
                        {report.type === 'bug' && (
                          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {report.condition && <div><span style={{ color: '#3d6e00', fontSize: 13, fontWeight: 'bold' }}>発生条件: </span><span style={{ color: '#2d5500', fontSize: 13 }}>{report.condition}</span></div>}
                            {report.error_msg && <div><span style={{ color: '#3d6e00', fontSize: 13, fontWeight: 'bold' }}>エラーメッセージ: </span><span style={{ color: '#2d5500', fontSize: 13 }}>{report.error_msg}</span></div>}
                            {report.prediction && <div><span style={{ color: '#b8860b', fontSize: 13, fontWeight: 'bold' }}>★ 原因の予測: </span><span style={{ color: '#2d5500', fontSize: 13 }}>{report.prediction}</span></div>}
                          </div>
                        )}
                        {report.type === 'feature' && (
                          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {report.target_area && <div><span style={{ color: '#3d6e00', fontSize: 13, fontWeight: 'bold' }}>対象箇所: </span><span style={{ color: '#2d5500', fontSize: 13 }}>{report.target_area}</span></div>}
                            {report.implementation_idea && <div><span style={{ color: '#3d6e00', fontSize: 13, fontWeight: 'bold' }}>実現案: </span><span style={{ color: '#2d5500', fontSize: 13 }}>{report.implementation_idea}</span></div>}
                          </div>
                        )}
                        {report.status === 'pending' && (
                          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input
                              className="game-input"
                              type="number"
                              min="0"
                              style={{ width: 100, boxSizing: 'border-box' }}
                              placeholder="ポイント数"
                              value={pointInputs[report.id] ?? ''}
                              onChange={e => setPointInputs(prev => ({ ...prev, [report.id]: e.target.value }))}
                            />
                            <button
                              onClick={() => handleApprove(report)}
                              disabled={processing}
                              style={{ background: '#3d6e00', border: '2px solid #3d6e00', borderRadius: 8, color: 'white', padding: '8px 18px', fontWeight: 'bold', cursor: 'pointer', opacity: processing ? 0.6 : 1 }}
                            >
                              承認
                            </button>
                            <button
                              onClick={() => handleReject(report)}
                              disabled={processing}
                              style={{ background: 'white', border: '2px solid #c0392b', borderRadius: 8, color: '#c0392b', padding: '8px 18px', fontWeight: 'bold', cursor: 'pointer', opacity: processing ? 0.6 : 1 }}
                            >
                              却下
                            </button>
                          </div>
                        )}
                        {report.status === 'approved' && report.awarded_points != null && (
                          <p style={{ color: '#3d6e00', marginTop: 12, fontSize: 13, fontWeight: 'bold' }}>付与ポイント: {report.awarded_points}pt</p>
                        )}
                      </div>
                    )}
                  </div>
                </Fragment>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
