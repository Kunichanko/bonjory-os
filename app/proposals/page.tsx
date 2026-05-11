'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'
import { Lightbulb, ThumbsUp, Check, X, Send, ChevronLeft } from 'lucide-react'

type ProposalStatus = 'pending' | 'approved' | 'rejected'
type ProposalType = 'bontest' | 'presentation' | 'workshop' | 'other'

interface Proposal {
  id: string
  proposer_id: string
  title: string
  description: string
  event_type: ProposalType | null
  proposed_date: string | null
  status: ProposalStatus
  admin_comment: string | null
  created_at: string
  proposer_name?: string | null
  vote_count?: number
  has_my_vote?: boolean
}

const TYPE_LABELS: Record<ProposalType, string> = {
  bontest: 'BONTEST',
  presentation: '作品発表会',
  workshop: 'ワークショップ',
  other: 'その他',
}

const STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: '審査中',
  approved: '採用',
  rejected: '不採用',
}

const STATUS_COLORS: Record<ProposalStatus, string> = {
  pending: '#e67e22',
  approved: '#6aac14',
  rejected: '#e74c3c',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function ProposalsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [myUserId, setMyUserId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // form
  const [showForm, setShowForm] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formType, setFormType] = useState<ProposalType>('bontest')
  const [formDate, setFormDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [voting, setVoting] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setMyUserId(session.user.id)
      await loadProposals(session.user.id)
      setLoading(false)
    }
    init()
  }, [router])

  async function loadProposals(userId: string) {
    const { data: props } = await supabase
      .from('event_proposals')
      .select('*, profiles(username)')
      .order('created_at', { ascending: false })

    const { data: votes } = await supabase.from('event_proposal_votes').select('proposal_id, user_id')

    const enriched: Proposal[] = (props ?? []).map(p => ({
      ...p,
      proposer_name: (p.profiles as { username: string | null } | null)?.username ?? null,
      vote_count: (votes ?? []).filter(v => v.proposal_id === p.id).length,
      has_my_vote: (votes ?? []).some(v => v.proposal_id === p.id && v.user_id === userId),
    }))
    enriched.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
    setProposals(enriched)
  }

  async function handleSubmit() {
    if (!formTitle.trim()) { setError('タイトルを入力してください'); return }
    if (!formDescription.trim()) { setError('説明を入力してください'); return }
    setSubmitting(true)
    setError(null)
    const { error: err } = await supabase.from('event_proposals').insert({
      proposer_id: myUserId,
      title: formTitle.trim(),
      description: formDescription.trim(),
      event_type: formType,
      proposed_date: formDate.trim() || null,
    })
    setSubmitting(false)
    if (err) { setError(err.message); return }
    setSuccess('提案を送信しました！')
    setShowForm(false)
    setFormTitle(''); setFormDescription(''); setFormDate('')
    loadProposals(myUserId)
    setTimeout(() => setSuccess(null), 3000)
  }

  async function handleVote(proposalId: string, hasMyVote: boolean) {
    setVoting(proposalId)
    if (hasMyVote) {
      await supabase.from('event_proposal_votes').delete().eq('proposal_id', proposalId).eq('user_id', myUserId)
    } else {
      await supabase.from('event_proposal_votes').insert({ proposal_id: proposalId, user_id: myUserId })
    }
    setVoting(null)
    loadProposals(myUserId)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#3d6e00', fontFamily: 'Mantou Sans, Arial' }}>読み込み中...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f0f7e8', fontFamily: 'Mantou Sans, Arial Rounded MT Bold, Arial', padding: '24px 16px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/events')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3d6e00', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ChevronLeft size={16} /> イベント一覧
          </button>
          <Lightbulb size={26} color="#f1c40f" />
          <h1 style={{ margin: 0, fontSize: 24, color: '#3d6e00' }}>イベント提案</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{ marginLeft: 'auto', background: '#6aac14', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 14, fontWeight: 'bold', boxShadow: '0 3px 0 #3d6e00' }}
          >
            <Lightbulb size={15} /> 提案する
          </button>
        </div>

        <p style={{ fontSize: 14, color: '#555', marginBottom: 20, lineHeight: 1.7 }}>
          やってみたいイベントのアイデアを提案しましょう！いいね！が多いほど採用されやすくなります。
          採用されるとポイントがもらえます 🎉
        </p>

        {/* メッセージ */}
        {error && <div style={{ background: '#fde8e8', border: '2px solid #e74c3c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#c0392b', display: 'flex', alignItems: 'center', gap: 8 }}><X size={16} /> {error}</div>}
        {success && <div style={{ background: '#d4f0a0', border: '2px solid #6aac14', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#3d6e00', display: 'flex', alignItems: 'center', gap: 8 }}><Check size={16} /> {success}</div>}

        {/* 提案フォーム */}
        {showForm && (
          <div style={{ background: '#fff', border: '3px solid #6aac14', borderRadius: 12, padding: 24, marginBottom: 24 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#3d6e00', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Send size={16} /> 新しい提案を送る
            </h2>

            <div style={{ marginBottom: 14 }}>
              <label className="game-label">イベントタイトル *</label>
              <input className="game-input" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="例: 春のBONTEST" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="game-label">イベント種別</label>
              <select className="game-input" value={formType} onChange={e => setFormType(e.target.value as ProposalType)} style={{ width: '100%' }}>
                <option value="bontest">BONTEST</option>
                <option value="presentation">作品発表会</option>
                <option value="workshop">ワークショップ</option>
                <option value="other">その他</option>
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="game-label">説明・アイデア *</label>
              <textarea
                className="game-input"
                rows={4}
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="どんなイベントをやりたいか、テーマや概要を教えてください"
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="game-label">希望開催時期（任意）</label>
              <input className="game-input" value={formDate} onChange={e => setFormDate(e.target.value)} placeholder="例: 7月ごろ、夏休み中" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ background: '#e8e8e8', color: '#555', border: 'none', borderRadius: 8, padding: '9px 20px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
                キャンセル
              </button>
              <button onClick={handleSubmit} disabled={submitting} style={{ background: submitting ? '#aaa' : '#6aac14', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 24px', cursor: submitting ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 'bold', boxShadow: submitting ? 'none' : '0 3px 0 #3d6e00', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Send size={14} /> {submitting ? '送信中...' : '提案を送る'}
              </button>
            </div>
          </div>
        )}

        {/* 提案一覧 */}
        {proposals.length === 0 ? (
          <div style={{ background: '#fff', border: '3px solid #c8e6a0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#888' }}>
            <Lightbulb size={40} color="#f1c40f" style={{ marginBottom: 12 }} />
            <p>まだ提案がありません。最初に提案してみましょう！</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {proposals.map(p => (
              <div key={p.id} style={{ background: '#fff', border: `3px solid ${STATUS_COLORS[p.status]}33`, borderRadius: 12, padding: 20, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {/* いいねボタン */}
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={() => p.proposer_id !== myUserId && handleVote(p.id, p.has_my_vote ?? false)}
                    disabled={voting === p.id || p.proposer_id === myUserId || p.status !== 'pending'}
                    title={p.proposer_id === myUserId ? '自分の提案には投票できません' : ''}
                    style={{
                      background: p.has_my_vote ? '#3498db' : '#e8f4ff',
                      color: p.has_my_vote ? '#fff' : '#3498db',
                      border: '2px solid #3498db',
                      borderRadius: 8, padding: '8px 12px',
                      cursor: (voting === p.id || p.proposer_id === myUserId || p.status !== 'pending') ? 'default' : 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      opacity: p.proposer_id === myUserId ? 0.5 : 1,
                    }}
                  >
                    <ThumbsUp size={18} />
                    <span style={{ fontSize: 15, fontWeight: 'bold' }}>{p.vote_count ?? 0}</span>
                  </button>
                </div>

                {/* 内容 */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <strong style={{ fontSize: 16, color: '#3d6e00' }}>{p.title}</strong>
                    {p.event_type && (
                      <span style={{ background: '#6aac1422', color: '#3d6e00', fontSize: 11, borderRadius: 4, padding: '2px 7px', border: '1px solid #6aac14' }}>
                        {TYPE_LABELS[p.event_type]}
                      </span>
                    )}
                    <span style={{ background: STATUS_COLORS[p.status] + '22', color: STATUS_COLORS[p.status], fontSize: 11, borderRadius: 4, padding: '2px 7px', border: `1px solid ${STATUS_COLORS[p.status]}`, fontWeight: 'bold' }}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </div>

                  <p style={{ margin: '0 0 8px', fontSize: 14, color: '#444', lineHeight: 1.6 }}>{p.description}</p>

                  <div style={{ fontSize: 12, color: '#888', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>提案者: {p.proposer_id === myUserId ? '自分' : (p.proposer_name ?? '不明')}</span>
                    {p.proposed_date && <span>希望時期: {p.proposed_date}</span>}
                    <span>{fmtDate(p.created_at)}</span>
                  </div>

                  {p.admin_comment && (
                    <div style={{ marginTop: 10, background: p.status === 'approved' ? '#d4f0a0' : '#fde8e8', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: p.status === 'approved' ? '#3d6e00' : '#c0392b' }}>
                      管理者コメント: {p.admin_comment}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
