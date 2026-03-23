"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'

interface Member {
  id: string
  username: string | null
  email: string | null
  course: string | null
  stage: string | null
  withdrawn_at?: string | null
}

const COURSE_LABEL: Record<string, string> = {
  Unity: 'Unity', Blender: 'Blender', Web: 'Web',
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)
}

export default function TokkyuuPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [activeMembers, setActiveMembers] = useState<Member[]>([])
  const [pendingMembers, setPendingMembers] = useState<Member[]>([])
  const [processing, setProcessing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 確認ダイアログ state
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'withdraw' | 'restore' | 'confirm'
    member: Member
  } | null>(null)

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData?.user) { router.replace('/login'); return }

        const { data: me } = await supabase
          .from('profiles').select('role').eq('id', authData.user.id).single()
        if (me?.role !== 'admin') { router.replace('/dashboard'); return }

        const [activeRes, pendingRes] = await Promise.all([
          supabase.from('profiles')
            .select('id, username, email, course, stage')
            .is('withdrawn_at', null)
            .is('confirmed_withdrawn_at', null)
            .order('created_at', { ascending: true }),
          supabase.from('profiles')
            .select('id, username, email, course, stage, withdrawn_at')
            .not('withdrawn_at', 'is', null)
            .is('confirmed_withdrawn_at', null)
            .order('withdrawn_at', { ascending: true }),
        ])

        if (mounted) {
          setActiveMembers((activeRes.data ?? []) as Member[])
          setPendingMembers((pendingRes.data ?? []) as Member[])
        }
      } catch {
        router.replace('/dashboard')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    init()
    return () => { mounted = false }
  }, [router])

  async function handleWithdraw(member: Member) {
    setProcessing(member.id)
    setError(null)
    const { error: err } = await supabase
      .from('profiles')
      .update({ withdrawn_at: new Date().toISOString() })
      .eq('id', member.id)
    if (err) {
      setError(err.message)
    } else {
      setActiveMembers(prev => prev.filter(m => m.id !== member.id))
      setPendingMembers(prev => [...prev, { ...member, withdrawn_at: new Date().toISOString() }])
    }
    setProcessing(null)
    setConfirmDialog(null)
  }

  async function handleRestore(member: Member) {
    setProcessing(member.id)
    setError(null)
    const { error: err } = await supabase
      .from('profiles')
      .update({ withdrawn_at: null })
      .eq('id', member.id)
    if (err) {
      setError(err.message)
    } else {
      setPendingMembers(prev => prev.filter(m => m.id !== member.id))
      setActiveMembers(prev => [...prev, { id: member.id, username: member.username, email: member.email, course: member.course, stage: member.stage }])
    }
    setProcessing(null)
    setConfirmDialog(null)
  }

  async function handleConfirmWithdrawal(member: Member) {
    setProcessing(member.id)
    setError(null)
    const { error: err } = await supabase
      .from('profiles')
      .update({ confirmed_withdrawn_at: new Date().toISOString() })
      .eq('id', member.id)
    if (err) {
      setError(err.message)
    } else {
      setPendingMembers(prev => prev.filter(m => m.id !== member.id))
    }
    setProcessing(null)
    setConfirmDialog(null)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>Loading...</p>
      </div>
    )
  }

  const cardStyle: React.CSSProperties = {
    background: '#fff8f8',
    border: '3px solid #c0392b',
    borderRadius: 16,
    boxShadow: '0 4px 0 #7a0000',
    padding: '20px 24px',
    marginBottom: 24,
  }

  return (
    <div style={{ minHeight: '100vh', padding: '32px 16px 48px', maxWidth: 800, margin: '0 auto' }}>

      {/* 戻るボタン */}
      <a href="/dashboard">
        <button style={{
          position: 'fixed', top: 20, left: 16, zIndex: 50,
          background: '#3a0000', border: '3px solid #c0392b', borderRadius: 12,
          color: '#ffaaaa', fontSize: 13, fontWeight: 'bold',
          padding: '10px 18px', cursor: 'pointer',
          boxShadow: '0 4px 0 #1a0000',
        }}>
          ← ダッシュボード
        </button>
      </a>

      {/* ヘッダー */}
      <div style={{ ...cardStyle, background: '#2a0000', marginTop: 48 }}>
        <h1 style={{ color: '#ffaaaa', fontSize: 28, fontWeight: 'bold', margin: 0 }}>🚨 特級管理</h1>
        <p style={{ color: '#c0392b', marginTop: 6, fontSize: 13, margin: '6px 0 0' }}>
          この画面の操作は取り消せないものを含みます。慎重に行ってください。
        </p>
      </div>

      {error && (
        <div style={{ background: '#fdecea', border: '2px solid #c0392b', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#c0392b', fontSize: 14 }}>
          エラー: {error}
        </div>
      )}

      {/* ── アクティブ部員 ── */}
      <div style={cardStyle}>
        <h2 style={{ color: '#7a0000', fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>
          👥 現役部員 ({activeMembers.length}人)
        </h2>
        {activeMembers.length === 0 ? (
          <p style={{ color: '#999', fontSize: 14 }}>部員がいません</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f5b7b1' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: '#7a0000' }}>氏名</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: '#7a0000' }}>メール</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: '#7a0000' }}>コース</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {activeMembers.map((m, idx) => (
                  <tr key={m.id} style={{ borderBottom: idx < activeMembers.length - 1 ? '1px solid #fde8e8' : 'none', opacity: processing === m.id ? 0.5 : 1 }}>
                    <td style={{ padding: '8px 10px', color: '#2d0000', fontWeight: 'bold' }}>{m.username ?? '(未設定)'}</td>
                    <td style={{ padding: '8px 10px', color: '#555' }}>{m.email ?? '—'}</td>
                    <td style={{ padding: '8px 10px', color: '#555' }}>{m.course ? COURSE_LABEL[m.course] ?? m.course : '—'}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                      <button
                        onClick={() => setConfirmDialog({ type: 'withdraw', member: m })}
                        disabled={processing === m.id}
                        style={{
                          background: 'none', border: '2px solid #c0392b', borderRadius: 6,
                          color: '#c0392b', fontSize: 12, fontWeight: 'bold',
                          padding: '4px 12px', cursor: 'pointer',
                        }}
                      >
                        退部
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 退部保留中 ── */}
      {pendingMembers.length > 0 && (
        <div style={cardStyle}>
          <h2 style={{ color: '#7a0000', fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>
            ⏳ 退部保留中 ({pendingMembers.length}人)
          </h2>
          <p style={{ color: '#c0392b', fontSize: 12, marginBottom: 16 }}>
            退部から3日以内は「復帰」が可能です。3日経過後に「退部確定」が押せるようになります。
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingMembers.map(m => {
              const days = daysSince(m.withdrawn_at!)
              const canConfirm = days >= 3
              const daysDisplay = days < 1
                ? `${Math.floor(days * 24)}時間前`
                : `${Math.floor(days)}日前`
              return (
                <div key={m.id} style={{
                  border: '1px solid #f5b7b1', borderRadius: 10, padding: '12px 14px',
                  background: '#fff0f0', opacity: processing === m.id ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <p style={{ margin: 0, fontWeight: 'bold', color: '#2d0000', fontSize: 14 }}>{m.username ?? '(未設定)'}</p>
                    <p style={{ margin: '2px 0 0', color: '#888', fontSize: 12 }}>{m.email ?? '—'} · {daysDisplay}に退部</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => !canConfirm && setConfirmDialog({ type: 'restore', member: m })}
                      disabled={processing === m.id || canConfirm}
                      style={{
                        border: '2px solid #3d6e00', borderRadius: 6,
                        background: canConfirm ? '#eee' : '#e8ffd4',
                        color: canConfirm ? '#aaa' : '#1a6e00',
                        fontSize: 12, fontWeight: 'bold',
                        padding: '4px 12px', cursor: canConfirm ? 'not-allowed' : 'pointer',
                      }}
                    >
                      復帰
                    </button>
                    <button
                      onClick={() => canConfirm && setConfirmDialog({ type: 'confirm', member: m })}
                      disabled={!canConfirm || processing === m.id}
                      style={{
                        border: `2px solid ${canConfirm ? '#c0392b' : '#ccc'}`,
                        borderRadius: 6,
                        background: canConfirm ? '#c0392b' : '#f0f0f0',
                        color: canConfirm ? '#fff' : '#aaa',
                        fontSize: 12, fontWeight: 'bold',
                        padding: '4px 12px', cursor: canConfirm ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {canConfirm ? '退部確定' : `退部確定（残${Math.max(0, Math.ceil(3 - days))}日）`}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 確認ダイアログ ── */}
      {confirmDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: '28px 24px',
            maxWidth: 400, width: '100%',
            border: confirmDialog.type === 'confirm' ? '3px solid #c0392b' : '2px solid #ccc',
          }}>
            {confirmDialog.type === 'withdraw' && (
              <>
                <h3 style={{ color: '#c0392b', marginBottom: 12 }}>退部しますか？</h3>
                <p style={{ color: '#333', fontSize: 14, marginBottom: 4 }}>
                  <strong>{confirmDialog.member.username ?? '(未設定)'}</strong> を退部させます。
                </p>
                <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
                  3日以内であれば復帰できます。管理画面への表示は即時非表示になります。
                </p>
              </>
            )}
            {confirmDialog.type === 'restore' && (
              <>
                <h3 style={{ color: '#1a6e00', marginBottom: 12 }}>復帰させますか？</h3>
                <p style={{ color: '#333', fontSize: 14, marginBottom: 20 }}>
                  <strong>{confirmDialog.member.username ?? '(未設定)'}</strong> を現役部員に戻します。
                </p>
              </>
            )}
            {confirmDialog.type === 'confirm' && (
              <>
                <h3 style={{ color: '#c0392b', marginBottom: 12 }}>⚠️ 退部を確定しますか？</h3>
                <p style={{ color: '#333', fontSize: 14, marginBottom: 4 }}>
                  <strong>{confirmDialog.member.username ?? '(未設定)'}</strong> の退部を確定します。
                </p>
                <p style={{ color: '#c0392b', fontSize: 13, fontWeight: 'bold', marginBottom: 20 }}>
                  この操作は取り消すことができません。
                </p>
              </>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDialog(null)}
                style={{ padding: '8px 20px', border: '2px solid #ccc', borderRadius: 8, background: '#fff', color: '#555', cursor: 'pointer', fontSize: 14 }}
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (confirmDialog.type === 'withdraw') handleWithdraw(confirmDialog.member)
                  else if (confirmDialog.type === 'restore') handleRestore(confirmDialog.member)
                  else handleConfirmWithdrawal(confirmDialog.member)
                }}
                style={{
                  padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 'bold',
                  background: confirmDialog.type === 'restore' ? '#1a6e00' : '#c0392b',
                  border: 'none', color: '#fff',
                }}
              >
                {confirmDialog.type === 'withdraw' ? '退部する' : confirmDialog.type === 'restore' ? '復帰させる' : '確定する'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
