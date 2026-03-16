'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'

type ReportType = 'bug' | 'feature'

export default function ReportsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [reportType, setReportType] = useState<ReportType>('bug')
  const [summary, setSummary] = useState('')
  const [condition, setCondition] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [prediction, setPrediction] = useState('')
  const [targetArea, setTargetArea] = useState('')
  const [implementationIdea, setImplementationIdea] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setUserId(data.user.id)
    })
  }, [router])

  function resetForm() {
    setSummary('')
    setCondition('')
    setErrorMsg('')
    setPrediction('')
    setTargetArea('')
    setImplementationIdea('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    if (!summary.trim()) return
    if (reportType === 'bug' && !condition.trim()) return
    if (reportType === 'feature' && !targetArea.trim()) return

    setSubmitting(true)
    const payload =
      reportType === 'bug'
        ? { user_id: userId, type: 'bug', summary: summary.trim(), condition: condition.trim(), error_msg: errorMsg.trim() || null, prediction: prediction.trim() || null }
        : { user_id: userId, type: 'feature', summary: summary.trim(), target_area: targetArea.trim(), implementation_idea: implementationIdea.trim() || null }

    const { error } = await supabase.from('bug_reports').insert(payload)
    setSubmitting(false)
    if (error) {
      alert('送信に失敗しました: ' + error.message)
      return
    }
    resetForm()
    setToast('報告を受け付けました！承認後にポイントが付与されます。')
    setTimeout(() => setToast(''), 4000)
  }

  return (
    <div style={{ minHeight: '100vh', padding: '80px 16px 40px' }}>
      {/* 戻るボタン */}
      <button
        onClick={() => router.push('/dashboard')}
        style={{
          position: 'fixed', top: 20, left: 16, zIndex: 50,
          background: '#1a3a00', border: '3px solid #6aac14', borderRadius: 12,
          color: '#a8d870', padding: '10px 18px', cursor: 'pointer', fontSize: 13,
          fontWeight: 'bold', boxShadow: '0 4px 0 #0d2000',
        }}
      >
        ← ダッシュボード
      </button>

      {/* トースト */}
      {toast && (
        <div style={{
          position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)',
          background: 'white', border: '3px solid #3d6e00', borderRadius: 10,
          color: '#3d6e00', padding: '12px 24px', zIndex: 200, fontSize: 14,
          fontWeight: 'bold', boxShadow: '0 4px 0 #0d2000',
        }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 540, margin: '0 auto' }}>
        <h1 className="game-title" style={{ textAlign: 'center', marginBottom: 24, color: 'white', fontSize: 28 }}>
          不具合・要望の報告
        </h1>

        <div className="game-card" style={{ padding: 24 }}>
          {/* タイプ選択 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            {(['bug', 'feature'] as ReportType[]).map(t => (
              <button
                key={t}
                onClick={() => { setReportType(t); resetForm() }}
                style={{
                  flex: 1, padding: '10px 0',
                  background: reportType === t ? '#6aac14' : 'white',
                  border: '2px solid #3d6e00', borderRadius: 8,
                  color: reportType === t ? 'white' : '#3d6e00',
                  fontWeight: 'bold', fontSize: 15, cursor: 'pointer',
                }}
              >
                {t === 'bug' ? '🐛 不具合' : '💡 要望'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 共通: 概要 */}
            <div>
              <label className="game-label">概要 <span style={{ color: '#e53e3e' }}>*</span></label>
              <input
                className="game-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                value={summary}
                onChange={e => setSummary(e.target.value)}
                placeholder={reportType === 'bug' ? 'どんな不具合が起きているか' : 'どんな機能を要望するか'}
                required
              />
            </div>

            {reportType === 'bug' && (
              <>
                <div>
                  <label className="game-label">発生条件 <span style={{ color: '#e53e3e' }}>*</span></label>
                  <textarea
                    className="game-input"
                    style={{ width: '100%', boxSizing: 'border-box', minHeight: 80, resize: 'vertical' }}
                    value={condition}
                    onChange={e => setCondition(e.target.value)}
                    placeholder="どういう操作をしたときに起きるか"
                    required
                  />
                </div>
                <div>
                  <label className="game-label">エラーメッセージ <span style={{ color: '#5a8a1a', fontSize: 12 }}>(任意)</span></label>
                  <input
                    className="game-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={errorMsg}
                    onChange={e => setErrorMsg(e.target.value)}
                    placeholder="画面に表示されたエラー文など"
                  />
                </div>
                <div>
                  <label className="game-label">
                    原因の予測{' '}
                    <span style={{ color: '#b8860b', fontSize: 12 }}>★ 加点対象</span>
                    <span style={{ color: '#5a8a1a', fontSize: 12 }}> (任意)</span>
                  </label>
                  <textarea
                    className="game-input"
                    style={{ width: '100%', boxSizing: 'border-box', minHeight: 80, resize: 'vertical' }}
                    value={prediction}
                    onChange={e => setPrediction(e.target.value)}
                    placeholder="なぜ起きているか、推測や仮説を記入"
                  />
                </div>
              </>
            )}

            {reportType === 'feature' && (
              <>
                <div>
                  <label className="game-label">対象箇所 <span style={{ color: '#e53e3e' }}>*</span></label>
                  <input
                    className="game-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={targetArea}
                    onChange={e => setTargetArea(e.target.value)}
                    placeholder="どのページや機能に対する要望か"
                    required
                  />
                </div>
                <div>
                  <label className="game-label">実現案 <span style={{ color: '#5a8a1a', fontSize: 12 }}>(任意)</span></label>
                  <textarea
                    className="game-input"
                    style={{ width: '100%', boxSizing: 'border-box', minHeight: 80, resize: 'vertical' }}
                    value={implementationIdea}
                    onChange={e => setImplementationIdea(e.target.value)}
                    placeholder="どう実現するか、アイデアがあれば"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              className="game-button"
              disabled={submitting}
            >
              {submitting ? '送信中...' : '報告を送信'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
