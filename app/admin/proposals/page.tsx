'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'
import { Lightbulb, Check, X, ThumbsUp, ChevronLeft } from 'lucide-react'

type ProposalStatus = 'pending' | 'approved' | 'rejected'

interface Proposal {
  id: string
  proposer_id: string
  title: string
  description: string
  event_type: string | null
  proposed_date: string | null
  status: ProposalStatus
  admin_comment: string | null
  created_at: string
  proposer_name?: string | null
  vote_count?: number
}

const TYPE_LABELS: Record<string, string> = {
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

export default function AdminProposalsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({})
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      const perms = await getEffectivePermissions(session.user.id)
      if (profile?.role !== 'admin' && !perms.event_management) {
        router.push('/dashboard'); return
      }
      await loadProposals()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadProposals() {
    const { data: props } = await supabase
      .from('event_proposals')
      .select('*, profiles(username)')
      .order('created_at', { ascending: false })

    const { data: votes } = await supabase.from('event_proposal_votes').select('proposal_id')

    const enriched: Proposal[] = (props ?? []).map(p => ({
      ...p,
      proposer_name: (p.profiles as { username: string | null } | null)?.username ?? null,
      vote_count: (votes ?? []).filter(v => v.proposal_id === p.id).length,
    }))
    enriched.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (a.status !== 'pending' && b.status === 'pending') return 1
      return (b.vote_count ?? 0) - (a.vote_count ?? 0)
    })
    setProposals(enriched)
    const comments: Record<string, string> = {}
    enriched.forEach(p => { comments[p.id] = p.admin_comment ?? '' })
    setCommentInputs(comments)
  }

  async function handleReview(id: string, status: 'approved' | 'rejected', proposerId: string) {
    setProcessing(id)
    setError(null)
    const { error: err } = await supabase.from('event_proposals').update({
      status,
      admin_comment: commentInputs[id] || null,
    }).eq('id', id)

    if (!err && status === 'approved') {
      await supabase.rpc('award_points', { p_user_id: proposerId, p_action_key: 'event_proposal_accepted' })
    }

    setProcessing(null)
    if (err) { setError(err.message); return }
    setSuccess(status === 'approved' ? '提案を採用し、ポイントを付与しました！' : '提案を不採用にしました')
    loadProposals()
    setTimeout(() => setSuccess(null), 3000)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#3d6e00', fontFamily: 'Mantou Sans, Arial' }}>読み込み中...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f0f7e8', fontFamily: 'Mantou Sans, Arial Rounded MT Bold, Arial', padding: '24px 16px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => router.push('/admin/events')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3d6e00', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ChevronLeft size={16} /> イベント管理
          </button>
          <Lightbulb size={26} color="#f1c40f" />
          <h1 style={{ margin: 0, fontSize: 24, color: '#3d6e00' }}>イベント提案レビュー</h1>
        </div>

        {error && <div style={{ background: '#fde8e8', border: '2px solid #e74c3c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#c0392b', display: 'flex', alignItems: 'center', gap: 8 }}><X size={16} /> {error}</div>}
        {success && <div style={{ background: '#d4f0a0', border: '2px solid #6aac14', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#3d6e00', display: 'flex', alignItems: 'center', gap: 8 }}><Check size={16} /> {success}</div>}

        {proposals.length === 0 ? (
          <div style={{ background: '#fff', border: '3px solid #c8e6a0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#888' }}>
            <Lightbulb size={40} color="#f1c40f" style={{ marginBottom: 12 }} />
            <p>提案はまだありません</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {proposals.map(p => (
              <div key={p.id} style={{ background: '#fff', border: `3px solid ${p.status === 'pending' ? '#f1c40f' : p.status === 'approved' ? '#6aac14' : '#e74c3c'}33`, borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <strong style={{ fontSize: 16, color: '#3d6e00' }}>{p.title}</strong>
                      {p.event_type && (
                        <span style={{ background: '#6aac1422', color: '#3d6e00', fontSize: 12, borderRadius: 4, padding: '2px 7px', border: '1px solid #6aac14' }}>
                          {TYPE_LABELS[p.event_type] ?? p.event_type}
                        </span>
                      )}
                      <span style={{ background: STATUS_COLORS[p.status] + '22', color: STATUS_COLORS[p.status], fontSize: 12, borderRadius: 4, padding: '2px 7px', border: `1px solid ${STATUS_COLORS[p.status]}`, fontWeight: 'bold' }}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 8px', fontSize: 14, color: '#444', lineHeight: 1.6 }}>{p.description}</p>
                    <div style={{ fontSize: 12, color: '#888', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>提案者: {p.proposer_name ?? '不明'}</span>
                      {p.proposed_date && <span>希望日程: {p.proposed_date}</span>}
                      <span>{fmtDate(p.created_at)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#e8f4ff', borderRadius: 8, padding: '6px 12px', flexShrink: 0 }}>
                    <ThumbsUp size={16} color="#3498db" />
                    <span style={{ fontSize: 16, fontWeight: 'bold', color: '#3498db' }}>{p.vote_count ?? 0}</span>
                    <span style={{ fontSize: 12, color: '#888' }}>票</span>
                  </div>
                </div>

                {p.status === 'pending' && (
                  <div style={{ borderTop: '2px dashed #e8e8e8', paddingTop: 14 }}>
                    <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 6 }}>管理者コメント（任意）</label>
                    <input
                      type="text"
                      value={commentInputs[p.id] ?? ''}
                      onChange={e => setCommentInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="採用/不採用の理由など"
                      style={{ width: '100%', boxSizing: 'border-box', border: '2px solid #c8e6a0', borderRadius: 6, padding: '7px 10px', fontFamily: 'inherit', fontSize: 13, marginBottom: 10 }}
                    />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => handleReview(p.id, 'approved', p.proposer_id)}
                        disabled={processing === p.id}
                        style={{ background: '#6aac14', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: processing === p.id ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 'bold', boxShadow: '0 3px 0 #3d6e00', display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <Check size={14} /> 採用する
                      </button>
                      <button
                        onClick={() => handleReview(p.id, 'rejected', p.proposer_id)}
                        disabled={processing === p.id}
                        style={{ background: '#e74c3c22', color: '#c0392b', border: '2px solid #e74c3c', borderRadius: 6, padding: '8px 20px', cursor: processing === p.id ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <X size={14} /> 不採用にする
                      </button>
                    </div>
                  </div>
                )}

                {p.admin_comment && p.status !== 'pending' && (
                  <div style={{ borderTop: '2px dashed #e8e8e8', paddingTop: 10, marginTop: 4, fontSize: 13, color: '#555', fontStyle: 'italic' }}>
                    管理者コメント: {p.admin_comment}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
