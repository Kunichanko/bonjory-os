'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { getEffectivePermissions } from '@/lib/permissions'

// ─── 型定義 ────────────────────────────────────────────────

type TabId = 'report' | 'list'

type Severity = '致命的' | '重大' | '重要' | '軽微'
type Priority = '高' | '中' | '低'
type OS = 'Windows' | 'Mac'

interface DebugReport {
  id: string
  created_at: string
  title: string
  severity: Severity
  priority: Priority
  reporter_name: string
  report_date: string
  steps: string
  expected: string
  actual: string
  repro_rate: number
  screenshot_urls: string[]
  video_url: string | null
  console_log: string | null
  os: OS
  device_name: string | null
  manufacturer: string | null
  reporter_id: string | null
  folder_id: string | null
}

// ─── 重要度・優先度バッジ色 ──────────────────────────────────

const SEVERITY_COLOR: Record<Severity, string> = {
  '致命的': '#d32f2f',
  '重大':   '#f57c00',
  '重要':   '#f9a825',
  '軽微':   '#757575',
}

const PRIORITY_COLOR: Record<Priority, string> = {
  '高': '#c62828',
  '中': '#1565c0',
  '低': '#2e7d32',
}

// ─── ユーティリティ ──────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(d: string): string {
  return d.replace(/-/g, '/')
}

// ─── メインコンポーネント ───────────────────────────────────

export default function DebugPage() {
  const router = useRouter()
  const [tab, setTab] = useState<TabId>('report')
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  // 報告フォーム state
  const [title, setTitle]             = useState('')
  const [severity, setSeverity]       = useState<Severity>('重要')
  const [priority, setPriority]       = useState<Priority>('中')
  const [reporterName, setReporterName] = useState('')
  const [reportDate, setReportDate]   = useState(today())
  const [steps, setSteps]             = useState('')
  const [expected, setExpected]       = useState('')
  const [actual, setActual]           = useState('')
  const [reproRate, setReproRate]     = useState<number | ''>('')
  const [screenshots, setScreenshots] = useState<(File | null)[]>([null, null, null])
  const [videoFile, setVideoFile]     = useState<File | null>(null)
  const [consoleLog, setConsoleLog]   = useState('')
  const [os, setOs]                   = useState<OS>('Windows')
  const [deviceName, setDeviceName]   = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [submitting, setSubmitting]   = useState(false)

  // 確認タブ state
  const [reports, setReports]         = useState<DebugReport[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [selected, setSelected]       = useState<DebugReport | null>(null)
  const [deleting, setDeleting]       = useState(false)

  // ファイル input refs
  const ssRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]
  const videoRef = useRef<HTMLInputElement>(null)

  // ─── 初期化 ─────────────────────────────────────────────

  useEffect(() => {
    let mounted = true
    async function init() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData?.user) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', authData.user.id).single()

      const isAdmin = profile?.role === 'admin'
      if (!isAdmin) {
        const perms = await getEffectivePermissions(authData.user.id)
        if (!perms.debug) { router.replace('/dashboard'); return }
      }

      if (mounted) {
        setUserId(authData.user.id)
        setLoading(false)
      }
    }
    init()
    return () => { mounted = false }
  }, [router])

  // ─── 確認タブ: レポート取得 ──────────────────────────────

  useEffect(() => {
    if (tab !== 'list') return
    setListLoading(true)
    supabase
      .from('debug_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setReports((data ?? []) as DebugReport[])
        setListLoading(false)
      })
  }, [tab])

  // ─── Mac選択時にメーカー自動入力 ─────────────────────────

  function handleOsChange(value: OS) {
    setOs(value)
    if (value === 'Mac') setManufacturer('Apple')
    else if (manufacturer === 'Apple') setManufacturer('')
  }

  // ─── スクリーンショット変更 ──────────────────────────────

  function handleScreenshotChange(index: number, file: File | null) {
    setScreenshots(prev => { const next = [...prev]; next[index] = file; return next })
  }

  // ─── トースト ────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // ─── フォームリセット ────────────────────────────────────

  function resetForm() {
    setTitle(''); setSeverity('重要'); setPriority('中')
    setReporterName(''); setReportDate(today())
    setSteps(''); setExpected(''); setActual(''); setReproRate('')
    setScreenshots([null, null, null]); setVideoFile(null)
    setConsoleLog(''); setOs('Windows'); setDeviceName(''); setManufacturer('')
    ssRefs.forEach(r => { if (r.current) r.current.value = '' })
    if (videoRef.current) videoRef.current.value = ''
  }

  // ─── 送信処理 ────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title || !reporterName || !steps || !expected || !actual || reproRate === '') {
      showToast('必須項目を入力してください')
      return
    }
    setSubmitting(true)

    const reportId = crypto.randomUUID()

    // スクリーンショットアップロード
    const screenshotUrls: string[] = []
    for (let i = 0; i < screenshots.length; i++) {
      const f = screenshots[i]
      if (!f) continue
      const ext = f.name.split('.').pop() ?? 'png'
      const path = `debug/${reportId}/ss-${i}.${ext}`
      const { data: upData, error: upErr } = await supabase.storage
        .from('media').upload(path, f, { upsert: true })
      if (!upErr && upData) {
        const { data: urlData } = supabase.storage.from('media').getPublicUrl(upData.path)
        screenshotUrls.push(urlData.publicUrl)
      }
    }

    // 動画アップロード
    let videoUrl: string | null = null
    if (videoFile) {
      const ext = videoFile.name.split('.').pop() ?? 'mp4'
      const path = `debug/${reportId}/video.${ext}`
      const { data: upData, error: upErr } = await supabase.storage
        .from('media').upload(path, videoFile, { upsert: true })
      if (!upErr && upData) {
        const { data: urlData } = supabase.storage.from('media').getPublicUrl(upData.path)
        videoUrl = urlData.publicUrl
      }
    }

    // DB INSERT
    const { error: insErr } = await supabase.from('debug_reports').insert({
      id: reportId,
      title, severity, priority,
      reporter_name: reporterName,
      report_date: reportDate,
      steps, expected, actual,
      repro_rate: Number(reproRate),
      screenshot_urls: screenshotUrls,
      video_url: videoUrl,
      console_log: consoleLog || null,
      os,
      device_name: deviceName || null,
      manufacturer: manufacturer || null,
      reporter_id: userId,
      folder_id: null,
    })

    setSubmitting(false)
    if (insErr) {
      showToast('送信に失敗しました: ' + insErr.message)
    } else {
      resetForm()
      showToast('報告を送信しました')
      setTab('list')
    }
  }

  // ─── 削除処理 ────────────────────────────────────────────

  async function handleDelete(report: DebugReport) {
    if (!confirm('この報告を削除しますか？')) return
    setDeleting(true)

    // ストレージファイル削除
    const paths: string[] = []
    report.screenshot_urls.forEach(url => {
      const match = url.match(/\/storage\/v1\/object\/public\/media\/(.+)/)
      if (match) paths.push(match[1])
    })
    if (report.video_url) {
      const match = report.video_url.match(/\/storage\/v1\/object\/public\/media\/(.+)/)
      if (match) paths.push(match[1])
    }
    if (paths.length > 0) {
      await supabase.storage.from('media').remove(paths)
    }

    const { error } = await supabase.from('debug_reports').delete().eq('id', report.id)
    setDeleting(false)
    if (error) {
      showToast('削除に失敗しました: ' + error.message)
    } else {
      setReports(prev => prev.filter(r => r.id !== report.id))
      setSelected(null)
      showToast('報告を削除しました')
    }
  }

  // ─── ローディング ────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#3d6e00', fontSize: 18, fontWeight: 'bold' }}>読み込み中...</span>
      </div>
    )
  }

  // ─── UI ──────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', padding: '80px 16px 40px' }}>

      {/* トースト */}
      {toast && (
        <div style={{
          position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)',
          background: 'white', border: '3px solid #3d6e00', borderRadius: 10,
          color: '#3d6e00', padding: '10px 24px', fontWeight: 'bold',
          fontSize: 14, zIndex: 9999, pointerEvents: 'none',
          boxShadow: '0 4px 0 #0d2000',
        }}>
          {toast}
        </div>
      )}

      {/* ← ダッシュボード */}
      <button
        onClick={() => router.push('/dashboard')}
        style={{
          position: 'fixed', top: 20, left: 16, zIndex: 50,
          background: '#1a3a00', border: '3px solid #6aac14', borderRadius: 12,
          color: '#a8d870', fontSize: 13, fontWeight: 'bold',
          padding: '10px 18px', cursor: 'pointer',
          boxShadow: '0 4px 0 #0d2000',
        }}
      >
        ← ダッシュボード
      </button>

      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* タイトル */}
        <h1 className="game-title" style={{ textAlign: 'center', marginBottom: 20, fontSize: 28, color: 'white' }}>
          🐞 デバッグ報告
        </h1>

        {/* タブバー */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {(['report', 'list'] as TabId[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '10px 0',
              background: tab === t ? '#6aac14' : 'white',
              border: '2px solid #3d6e00', borderRadius: 8,
              color: tab === t ? 'white' : '#3d6e00',
              fontSize: 15, fontWeight: 'bold', cursor: 'pointer',
              transition: 'background 0.15s',
            }}>
              {t === 'report' ? '📝 報告' : '📋 確認'}
            </button>
          ))}
        </div>

        {/* ─── 報告タブ ─────────────────────────────────── */}
        {tab === 'report' && (
          <form onSubmit={handleSubmit}>

            {/* 概要セクション */}
            <Section title="概要">
              <Field label="タイトル *">
                <input className="game-input" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="不具合の概要を簡潔に" style={{ width: '100%' }} />
              </Field>
              <Row>
                <Field label="重要度 *">
                  <select className="game-input" value={severity} onChange={e => setSeverity(e.target.value as Severity)} style={{ width: '100%' }}>
                    {(['致命的','重大','重要','軽微'] as Severity[]).map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="優先度 *">
                  <select className="game-input" value={priority} onChange={e => setPriority(e.target.value as Priority)} style={{ width: '100%' }}>
                    {(['高','中','低'] as Priority[]).map(p => <option key={p}>{p}</option>)}
                  </select>
                </Field>
              </Row>
              <Row>
                <Field label="報告者名 *">
                  <input className="game-input" value={reporterName} onChange={e => setReporterName(e.target.value)}
                    placeholder="氏名" style={{ width: '100%' }} />
                </Field>
                <Field label="報告日">
                  <input className="game-input" type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
                    style={{ width: '100%' }} />
                </Field>
              </Row>
            </Section>

            {/* 手順セクション */}
            <Section title="手順">
              <Field label="再現手順 *">
                <textarea className="game-input" value={steps} onChange={e => setSteps(e.target.value)}
                  placeholder={'1. 〜を開く\n2. 〜をクリックする\n3. 〜が発生する'}
                  rows={4} style={{ width: '100%', resize: 'vertical' }} />
              </Field>
              <Field label="期待される結果 *">
                <textarea className="game-input" value={expected} onChange={e => setExpected(e.target.value)}
                  placeholder="本来どうなるべきか" rows={2} style={{ width: '100%', resize: 'vertical' }} />
              </Field>
              <Field label="実際の結果 *">
                <textarea className="game-input" value={actual} onChange={e => setActual(e.target.value)}
                  placeholder="実際に何が起きたか" rows={2} style={{ width: '100%', resize: 'vertical' }} />
              </Field>
              <Field label="再現度 *">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input className="game-input" type="number" min={0} max={100}
                    value={reproRate} onChange={e => setReproRate(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0〜100" style={{ width: 100 }} />
                  <span style={{ color: '#3d6e00', fontWeight: 'bold', fontSize: 16 }}>%</span>
                </div>
              </Field>

              {/* スクリーンショット */}
              <div>
                <label className="game-label">スクリーンショット（最大3枚）</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {([0, 1, 2] as const).map(i => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: '#6aac14', fontSize: 13, fontWeight: 'bold', minWidth: 30 }}>#{i + 1}</span>
                      <input ref={ssRefs[i]} type="file" accept="image/*"
                        onChange={e => handleScreenshotChange(i, e.target.files?.[0] ?? null)}
                        style={{ color: '#2d5500', fontSize: 13 }} />
                      {screenshots[i] && (
                        <button type="button" onClick={() => {
                          handleScreenshotChange(i, null)
                          if (ssRefs[i].current) ssRefs[i].current.value = ''
                        }} style={{
                          background: 'none', border: '1px solid #3d6e00', borderRadius: 6,
                          color: '#3d6e00', cursor: 'pointer', fontSize: 12, padding: '2px 8px',
                        }}>✕ 削除</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 動画 */}
              <div>
                <label className="game-label">動画（1本まで）</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input ref={videoRef} type="file" accept="video/*"
                    onChange={e => setVideoFile(e.target.files?.[0] ?? null)}
                    style={{ color: '#2d5500', fontSize: 13 }} />
                  {videoFile && (
                    <button type="button" onClick={() => {
                      setVideoFile(null)
                      if (videoRef.current) videoRef.current.value = ''
                    }} style={{
                      background: 'none', border: '1px solid #3d6e00', borderRadius: 6,
                      color: '#3d6e00', cursor: 'pointer', fontSize: 12, padding: '2px 8px',
                    }}>✕ 削除</button>
                  )}
                </div>
              </div>

              <Field label="コンソールログ（任意）">
                <textarea className="game-input" value={consoleLog} onChange={e => setConsoleLog(e.target.value)}
                  placeholder="エラーログやコンソール出力を貼り付けてください"
                  rows={3} style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
              </Field>
            </Section>

            {/* 機種セクション */}
            <Section title="機種">
              <Row>
                <Field label="OS *">
                  <select className="game-input" value={os} onChange={e => handleOsChange(e.target.value as OS)} style={{ width: '100%' }}>
                    <option>Windows</option>
                    <option>Mac</option>
                  </select>
                </Field>
                <Field label="メーカー">
                  <input className="game-input" value={manufacturer} onChange={e => setManufacturer(e.target.value)}
                    disabled={os === 'Mac'} placeholder="例: Lenovo, Dell"
                    style={{ width: '100%', opacity: os === 'Mac' ? 0.7 : 1 }} />
                </Field>
              </Row>
              <Field label="製品名（任意）">
                <input className="game-input" value={deviceName} onChange={e => setDeviceName(e.target.value)}
                  placeholder="例: ThinkPad X1 Carbon, MacBook Air M2" style={{ width: '100%' }} />
              </Field>
            </Section>

            {/* 注意事項 */}
            <div className="game-card" style={{ padding: '14px 20px', marginBottom: 24 }}>
              <p style={{ color: '#3d6e00', fontWeight: 'bold', margin: '0 0 8px', fontSize: 14 }}>⚠️ 注意事項</p>
              <ul style={{ color: '#2d5500', fontSize: 13, margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                <li>客観的に表記すること</li>
                <li>1つにつき、1の不具合を報告すること</li>
                <li>結論から書き、簡潔に</li>
              </ul>
            </div>

            {/* 送信ボタン */}
            <button type="submit" disabled={submitting} className="game-button" style={{
              width: '100%', padding: '14px 0', fontSize: 16, fontWeight: 'bold',
            }}>
              {submitting ? '送信中...' : '🐞 報告を送信する'}
            </button>
          </form>
        )}

        {/* ─── 確認タブ ─────────────────────────────────── */}
        {tab === 'list' && (
          <div>
            {listLoading ? (
              <p style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>読み込み中...</p>
            ) : reports.length === 0 ? (
              <p style={{ color: 'white', textAlign: 'center', marginTop: 40, fontWeight: 'bold' }}>報告はまだありません</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {reports.map(r => (
                  <button key={r.id} onClick={() => setSelected(r)} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', background: 'white',
                    border: '3px solid #3d6e00', borderRadius: 12,
                    padding: '12px 16px', cursor: 'pointer',
                    textAlign: 'left', transition: 'border-color 0.15s',
                    boxShadow: '0 4px 0 #3d6e00',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#6aac14')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#3d6e00')}
                  >
                    {/* 重要度バッジ */}
                    <span style={{
                      background: SEVERITY_COLOR[r.severity as Severity],
                      color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 'bold',
                      padding: '3px 8px', whiteSpace: 'nowrap', minWidth: 44, textAlign: 'center',
                    }}>
                      {r.severity}
                    </span>
                    {/* タイトル */}
                    <span style={{ color: '#1a3a00', fontWeight: 'bold', fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title}
                    </span>
                    {/* 優先度 */}
                    <span style={{
                      background: PRIORITY_COLOR[r.priority as Priority],
                      color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 'bold',
                      padding: '3px 8px', whiteSpace: 'nowrap',
                    }}>
                      優先度:{r.priority}
                    </span>
                    {/* 報告者名 */}
                    <span style={{ color: '#3d6e00', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' }}>{r.reporter_name}</span>
                    {/* 報告日 */}
                    <span style={{ color: '#6aac14', fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(r.report_date)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── 詳細オーバーレイ ──────────────────────────────── */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            zIndex: 200, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '20px 16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="game-card"
            style={{ width: '100%', maxWidth: 720, padding: '28px 24px' }}
          >
            {/* ヘッダー */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <h2 className="game-title" style={{ fontSize: 20, margin: 0, flex: 1, paddingRight: 12 }}>
                {selected.title}
              </h2>
              <button onClick={() => setSelected(null)} style={{
                background: 'none', border: 'none', color: '#3d6e00', fontSize: 24, cursor: 'pointer', lineHeight: 1,
              }}>×</button>
            </div>

            {/* バッジ行 */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <Badge color={SEVERITY_COLOR[selected.severity as Severity]} label={`重要度: ${selected.severity}`} />
              <Badge color={PRIORITY_COLOR[selected.priority as Priority]} label={`優先度: ${selected.priority}`} />
              <Badge color="#2e7d32" label={`OS: ${selected.os}`} />
              <Badge color="#37474f" label={`再現度: ${selected.repro_rate}%`} />
            </div>

            {/* メタ情報 */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20, color: '#3d6e00', fontSize: 13 }}>
              <span>報告者: <strong style={{ color: '#1a3a00' }}>{selected.reporter_name}</strong></span>
              <span>報告日: <strong style={{ color: '#1a3a00' }}>{formatDate(selected.report_date)}</strong></span>
              {selected.manufacturer && <span>メーカー: <strong style={{ color: '#1a3a00' }}>{selected.manufacturer}</strong></span>}
              {selected.device_name && <span>製品名: <strong style={{ color: '#1a3a00' }}>{selected.device_name}</strong></span>}
            </div>

            <DetailSection title="再現手順">
              <pre style={{ color: '#2d5500', whiteSpace: 'pre-wrap', margin: 0, fontSize: 13, lineHeight: 1.7 }}>{selected.steps}</pre>
            </DetailSection>
            <DetailSection title="期待される結果">
              <p style={{ color: '#2d5500', margin: 0, fontSize: 13, lineHeight: 1.7 }}>{selected.expected}</p>
            </DetailSection>
            <DetailSection title="実際の結果">
              <p style={{ color: '#2d5500', margin: 0, fontSize: 13, lineHeight: 1.7 }}>{selected.actual}</p>
            </DetailSection>

            {selected.console_log && (
              <DetailSection title="コンソールログ">
                <pre style={{ color: '#2d5500', whiteSpace: 'pre-wrap', margin: 0, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6 }}>{selected.console_log}</pre>
              </DetailSection>
            )}

            {/* スクリーンショット */}
            {selected.screenshot_urls.length > 0 && (
              <DetailSection title={`スクリーンショット (${selected.screenshot_urls.length}枚)`}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {selected.screenshot_urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt={`screenshot-${i + 1}`}
                        style={{ height: 120, borderRadius: 8, border: '2px solid #3d6e00', objectFit: 'cover', cursor: 'pointer' }} />
                    </a>
                  ))}
                </div>
              </DetailSection>
            )}

            {/* 動画 */}
            {selected.video_url && (
              <DetailSection title="動画">
                <video src={selected.video_url} controls style={{ width: '100%', borderRadius: 8, maxHeight: 360 }} />
              </DetailSection>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              {selected.reporter_id === userId && (
                <button onClick={() => handleDelete(selected)} disabled={deleting} style={{
                  flex: 1, padding: '12px 0', fontSize: 15, fontWeight: 'bold', cursor: 'pointer',
                  background: 'none', border: '2px solid #c0392b', borderRadius: 10,
                  color: '#c0392b', opacity: deleting ? 0.6 : 1,
                }}>
                  {deleting ? '削除中...' : '🗑 削除'}
                </button>
              )}
              <button onClick={() => setSelected(null)} className="game-button" style={{
                flex: 2, padding: '12px 0', fontSize: 15, fontWeight: 'bold',
              }}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 小コンポーネント ────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="game-card" style={{ padding: '20px', marginBottom: 20 }}>
      <h2 className="game-title" style={{ fontSize: 16, margin: '0 0 16px', borderBottom: '2px solid #3d6e00', paddingBottom: 8 }}>
        {title}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1 }}>
      <label className="game-label">{label}</label>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {children}
    </div>
  )
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      background: color, color: '#fff', borderRadius: 6,
      fontSize: 12, fontWeight: 'bold', padding: '3px 10px',
    }}>
      {label}
    </span>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p className="game-label" style={{ marginBottom: 6 }}>{title}</p>
      <div style={{ background: '#f8fff0', borderRadius: 8, padding: '10px 14px', border: '2px solid #3d6e00' }}>
        {children}
      </div>
    </div>
  )
}
