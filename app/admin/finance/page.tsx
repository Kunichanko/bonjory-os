'use client'

import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'

// ─── Types ───────────────────────────────────────────────────────────────────

interface IncomeSource { id: string; name: string }
interface ExpenseCategory { id: string; name: string }
interface Profile { id: string; username: string | null }

interface FinanceMember {
  id: string
  profile_id: string
  profiles: { username: string | null }
}

interface FinanceIncome {
  id: string
  profile_id: string
  amount: number
  source_id: string | null
  note: string | null
  received_at: string
  profiles: { username: string | null }
  finance_income_sources: { name: string } | null
}

interface FinanceExpense {
  id: string
  profile_id: string
  amount: number
  category_id: string | null
  note: string | null
  paid_at: string
  is_settled: boolean
  settled_at: string | null
  profiles: { username: string | null }
  finance_expense_categories: { name: string } | null
  finance_expense_cosponsors: { profile_id: string }[]
}

interface FinancePlanned {
  id: string
  type: 'planned' | 'request'
  category_id: string | null
  detail: string
  note: string | null
  status: 'pending' | 'approved' | 'paid'
  expense_id: string | null
  created_at: string
  finance_expense_categories: { name: string } | null
}

type TabId = 'income' | 'expense' | 'assets' | 'planned' | 'history'

const TABS: { id: TabId; label: string }[] = [
  { id: 'income',  label: '💰 収入登録' },
  { id: 'expense', label: '💸 支出登録' },
  { id: 'assets',  label: '👥 資産管理' },
  { id: 'planned', label: '📋 支出予定・申請' },
  { id: 'history', label: '📜 履歴' },
]

// 共通スタイル
const C = {
  text:    '#3d6e00',
  sub:     '#5a8a00',
  border:  '#d4edba',
  accent:  '#6aac14',
  red:     '#c0392b',
  orange:  '#e67e22',
  blue:    '#2980b9',
  purple:  '#8e44ad',
  rowBg:   '#f8fff0',
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [tab, setTab]         = useState<TabId>('income')

  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>({
    course_management: false, task_management: false, point_settings: false,
    submission_review: false, finance: false, timeline_management: false,
    dm_management: false, announcement_management: false, gimmick_management: false,
  })

  const [incomes,     setIncomes]     = useState<FinanceIncome[]>([])
  const [expenses,    setExpenses]    = useState<FinanceExpense[]>([])
  const [members,     setMembers]     = useState<FinanceMember[]>([])
  const [sources,     setSources]     = useState<IncomeSource[]>([])
  const [categories,  setCategories]  = useState<ExpenseCategory[]>([])
  const [planned,     setPlanned]     = useState<FinancePlanned[]>([])
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])

  // Income form
  const [incProfId, setIncProfId] = useState('')
  const [incAmount, setIncAmount] = useState('')
  const [incSource, setIncSource] = useState('')
  const [incNote,   setIncNote]   = useState('')
  const [incDate,   setIncDate]   = useState('')
  const [newSource, setNewSource] = useState('')

  // Expense form
  const [expProfId,     setExpProfId]     = useState('')
  const [expAmount,     setExpAmount]     = useState('')
  const [expCatId,      setExpCatId]      = useState('')
  const [expNote,       setExpNote]       = useState('')
  const [expDate,       setExpDate]       = useState('')
  const [expCosponsors, setExpCosponsors] = useState<string[]>([])
  const [newCat,        setNewCat]        = useState('')

  // Settlement
  const [checkedIds,     setCheckedIds]     = useState<string[]>([])
  const [showSettlement, setShowSettlement] = useState(false)

  // Assets
  const [addProfId,    setAddProfId]    = useState('')
  const [expandedProf, setExpandedProf] = useState<string | null>(null)

  // Planned form
  const [planType,   setPlanType]   = useState<'planned' | 'request'>('planned')
  const [planCatId,  setPlanCatId]  = useState('')
  const [planDetail, setPlanDetail] = useState('')
  const [planNote,   setPlanNote]   = useState('')

  // Confirm planned modal
  const [confirmingPlan,   setConfirmingPlan]   = useState<FinancePlanned | null>(null)
  const [confirmPlanPayer, setConfirmPlanPayer] = useState('')
  const [confirmPlanAmt,   setConfirmPlanAmt]   = useState('')

  // ─── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) { router.replace('/'); return }
      const { data: me } = await supabase.from('profiles').select('role').eq('id', authData.user.id).single()
      if (!me) { router.replace('/'); return }
      const perms = await getEffectivePermissions(authData.user.id)
      setEffectivePerms(perms)
      if (me.role !== 'admin' && !perms.finance) { router.replace('/dashboard'); return }
      await loadData()
      setLoading(false)
    }
    init()
  }, [])

  const loadData = async () => {
    const [
      { data: inc, error: e1 }, { data: exp, error: e2 }, { data: mem, error: e3 },
      { data: src }, { data: cat }, { data: pln }, { data: prof },
    ] = await Promise.all([
      supabase.from('finance_incomes').select('*, profiles!profile_id(username), finance_income_sources(name)').order('received_at', { ascending: false }).limit(100),
      supabase.from('finance_expenses').select('*, profiles!profile_id(username), finance_expense_categories(name), finance_expense_cosponsors(profile_id)').order('paid_at', { ascending: false }),
      supabase.from('finance_members').select('*, profiles(username)').order('created_at'),
      supabase.from('finance_income_sources').select('*').order('name'),
      supabase.from('finance_expense_categories').select('*').order('name'),
      supabase.from('finance_planned_expenses').select('*, finance_expense_categories(name)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, username').order('username'),
    ])
    const firstError = e1 ?? e2 ?? e3
    if (firstError) setError(`データ読み込みエラー: ${firstError.message}`)
    setIncomes((inc ?? []) as unknown as FinanceIncome[])
    setExpenses((exp ?? []) as unknown as FinanceExpense[])
    setMembers((mem ?? []) as unknown as FinanceMember[])
    setSources(src ?? [])
    setCategories(cat ?? [])
    setPlanned((pln ?? []) as unknown as FinancePlanned[])
    setAllProfiles(prof ?? [])
  }

  // ─── Computed ──────────────────────────────────────────────────────────────

  const totalIncome  = incomes.reduce((s, i) => s + i.amount, 0)
  const totalSettled = expenses.filter(e => e.is_settled).reduce((s, e) => s + e.amount, 0)
  const totalAssets  = totalIncome - totalSettled

  const memberName = (pid: string) =>
    members.find(m => m.profile_id === pid)?.profiles?.username
    ?? allProfiles.find(p => p.id === pid)?.username ?? pid

  const calcSettlement = () => {
    const selected = expenses.filter(e => checkedIds.includes(e.id))
    const payments: Record<string, Record<string, number>> = {}
    for (const exp of selected) {
      if (exp.finance_expense_cosponsors.length === 0) continue
      const share = Math.floor(exp.amount / (1 + exp.finance_expense_cosponsors.length))
      for (const cs of exp.finance_expense_cosponsors) {
        if (!payments[cs.profile_id]) payments[cs.profile_id] = {}
        payments[cs.profile_id][exp.profile_id] = (payments[cs.profile_id][exp.profile_id] ?? 0) + share
      }
    }
    return payments
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  const addSource = async () => {
    if (!newSource.trim()) return
    await supabase.from('finance_income_sources').insert({ name: newSource.trim() })
    setNewSource(''); await loadData()
  }

  const addCategory = async () => {
    if (!newCat.trim()) return
    await supabase.from('finance_expense_categories').insert({ name: newCat.trim() })
    setNewCat(''); await loadData()
  }

  const submitIncome = async () => {
    if (!incProfId || !incAmount) { setError('受け取った人と金額は必須です'); return }
    const { data: a } = await supabase.auth.getUser()
    await supabase.from('finance_incomes').insert({
      profile_id: incProfId, amount: parseInt(incAmount),
      source_id: incSource || null, note: incNote || null,
      received_at: incDate ? new Date(incDate).toISOString() : new Date().toISOString(),
      created_by: a.user?.id,
    })
    setIncProfId(''); setIncAmount(''); setIncSource(''); setIncNote(''); setIncDate('')
    setError(null); await loadData()
  }

  const submitExpense = async () => {
    if (!expProfId || !expAmount) { setError('支払った人と金額は必須です'); return }
    const { data: a } = await supabase.auth.getUser()
    const { data: exp } = await supabase.from('finance_expenses').insert({
      profile_id: expProfId, amount: parseInt(expAmount),
      category_id: expCatId || null, note: expNote || null,
      paid_at: expDate ? new Date(expDate).toISOString() : new Date().toISOString(),
      created_by: a.user?.id,
    }).select().single()
    if (exp && expCosponsors.length > 0) {
      await supabase.from('finance_expense_cosponsors').insert(
        expCosponsors.map(pid => ({ expense_id: exp.id, profile_id: pid }))
      )
    }
    setExpProfId(''); setExpAmount(''); setExpCatId(''); setExpNote('')
    setExpDate(''); setExpCosponsors([])
    setError(null); await loadData()
  }

  const confirmSettlement = async () => {
    await supabase.from('finance_expenses')
      .update({ is_settled: true, settled_at: new Date().toISOString() })
      .in('id', checkedIds)
    setCheckedIds([]); setShowSettlement(false); await loadData()
  }

  const addMember = async () => {
    if (!addProfId) return
    await supabase.from('finance_members').insert({ profile_id: addProfId })
    setAddProfId(''); await loadData()
  }

  const removeMember = async (pid: string) => {
    await supabase.from('finance_members').delete().eq('profile_id', pid)
    await loadData()
  }

  const submitPlanned = async () => {
    if (!planDetail.trim()) { setError('詳細は必須です'); return }
    const { data: a } = await supabase.auth.getUser()
    await supabase.from('finance_planned_expenses').insert({
      type: planType, category_id: planCatId || null,
      detail: planDetail.trim(), note: planNote || null,
      status: 'pending', created_by: a.user?.id,
    })
    setPlanCatId(''); setPlanDetail(''); setPlanNote('')
    setError(null); await loadData()
  }

  const approvePlanned = async (id: string) => {
    await supabase.from('finance_planned_expenses').update({ status: 'approved' }).eq('id', id)
    await loadData()
  }

  const doConfirmPlanned = async () => {
    if (!confirmingPlan || !confirmPlanPayer || !confirmPlanAmt) return
    const { data: a } = await supabase.auth.getUser()
    const { data: exp } = await supabase.from('finance_expenses').insert({
      profile_id: confirmPlanPayer, amount: parseInt(confirmPlanAmt),
      category_id: confirmingPlan.category_id || null,
      note: `${confirmingPlan.detail}${confirmingPlan.note ? '\n' + confirmingPlan.note : ''}`,
      paid_at: new Date().toISOString(), created_by: a.user?.id,
    }).select().single()
    if (exp) {
      await supabase.from('finance_planned_expenses')
        .update({ status: 'paid', expense_id: exp.id }).eq('id', confirmingPlan.id)
    }
    setConfirmingPlan(null); setConfirmPlanPayer(''); setConfirmPlanAmt('')
    await loadData()
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ padding: 40, color: '#3d6e00' }}>読み込み中...</div>

  const unsettled  = expenses.filter(e => !e.is_settled)
  const settlement = calcSettlement()

  // 入力+ボタン横並び用ヘルパースタイル
  const flexRow = { display: 'flex', gap: 8, alignItems: 'flex-start' } as const
  const btnSm   = { width: 'auto', padding: '10px 20px', fontSize: 15, flexShrink: 0 } as const

  return (
    <div style={{ minHeight: '100vh', padding: '56px 24px 48px', maxWidth: 900, margin: '0 auto' }}>
      {/* Back */}
      <button onClick={() => router.push('/dashboard')} style={{ position: 'fixed', top: 20, left: 16, zIndex: 50, background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>←</button>

      {/* 総資産 */}
      <div className="game-card" style={{ padding: '20px 28px', marginBottom: 20, textAlign: 'center' }}>
        <div style={{ color: C.sub, fontSize: 13, marginBottom: 4 }}>Bonjory 総資産</div>
        <div style={{ color: totalAssets >= 0 ? C.accent : C.red, fontSize: 40, fontWeight: 'bold' }}>
          ¥{totalAssets.toLocaleString()}
        </div>
        <div style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>
          収入合計 ¥{totalIncome.toLocaleString()} ／ 決算済み支出 ¥{totalSettled.toLocaleString()}
        </div>
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, background: '#1a3a00', borderRadius: 12, padding: 4, marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '10px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap',
            background: tab === t.id ? '#6aac14' : 'none',
            color: tab === t.id ? '#fff' : '#a8d870',
          }}>{t.label}</button>
        ))}
      </div>

      {error && (
        <div className="game-error" style={{ marginBottom: 12 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', color: C.red, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* ── 収入登録 ─────────────────────────────────────────────────────────── */}
      {tab === 'income' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 className="game-title" style={{ marginBottom: 16 }}>収入登録</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="game-label">受け取った人 *</label>
                <select className="game-input" value={incProfId} onChange={e => setIncProfId(e.target.value)}>
                  <option value="">選択してください</option>
                  {members.map(m => <option key={m.profile_id} value={m.profile_id}>{m.profiles?.username}</option>)}
                </select>
              </div>
              <div>
                <label className="game-label">金額 (円) *</label>
                <input className="game-input" type="number" placeholder="0" value={incAmount} onChange={e => setIncAmount(e.target.value)} />
              </div>
              <div>
                <label className="game-label">収入元</label>
                <select className="game-input" value={incSource} onChange={e => setIncSource(e.target.value)}>
                  <option value="">選択してください</option>
                  {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="game-label">受取日</label>
                <input className="game-input" type="date" value={incDate} onChange={e => setIncDate(e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="game-label">備考</label>
              <input className="game-input" value={incNote} onChange={e => setIncNote(e.target.value)} placeholder="任意" />
            </div>
            <button className="game-button" onClick={submitIncome} style={{ width: 'auto', padding: '10px 32px', fontSize: 16 }}>登録</button>
          </div>

          <div className="game-card" style={{ padding: '16px 24px' }}>
            <div style={{ color: C.text, fontWeight: 'bold', fontSize: 14, marginBottom: 10 }}>収入元を追加・管理</div>
            <div style={flexRow}>
              <input className="game-input" style={{ flex: 1, minWidth: 0 }} value={newSource} onChange={e => setNewSource(e.target.value)} placeholder="例: 部費、ハッカソン賞金" onKeyDown={e => e.key === 'Enter' && addSource()} />
              <button className="game-button" onClick={addSource} style={btnSm}>追加</button>
            </div>
            {sources.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {sources.map(s => <span key={s.id} style={{ background: C.accent, color: '#fff', padding: '2px 10px', borderRadius: 8, fontSize: 12 }}>{s.name}</span>)}
              </div>
            )}
          </div>

          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 className="game-title" style={{ marginBottom: 14 }}>収入履歴</h2>
            {incomes.length === 0
              ? <p style={{ color: C.sub }}>記録がありません</p>
              : incomes.map(inc => (
                <Fragment key={inc.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                    <div>
                      <span style={{ color: C.accent, fontWeight: 'bold', fontSize: 16 }}>+¥{inc.amount.toLocaleString()}</span>
                      <span style={{ color: C.text, marginLeft: 12 }}>{inc.profiles?.username}</span>
                      {inc.finance_income_sources && <span style={{ color: C.sub, marginLeft: 8, fontSize: 12 }}>({inc.finance_income_sources.name})</span>}
                      {inc.note && <span style={{ color: C.sub, marginLeft: 8, fontSize: 12 }}>/ {inc.note}</span>}
                    </div>
                    <span style={{ color: C.sub, fontSize: 12 }}>{new Date(inc.received_at).toLocaleDateString('ja-JP')}</span>
                  </div>
                </Fragment>
              ))}
          </div>
        </div>
      )}

      {/* ── 支出登録 ─────────────────────────────────────────────────────────── */}
      {tab === 'expense' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 className="game-title" style={{ marginBottom: 16 }}>支出登録</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="game-label">支払った人 *</label>
                <select className="game-input" value={expProfId} onChange={e => setExpProfId(e.target.value)}>
                  <option value="">選択してください</option>
                  {members.map(m => <option key={m.profile_id} value={m.profile_id}>{m.profiles?.username}</option>)}
                </select>
              </div>
              <div>
                <label className="game-label">金額 (円) *</label>
                <input className="game-input" type="number" placeholder="0" value={expAmount} onChange={e => setExpAmount(e.target.value)} />
              </div>
              <div>
                <label className="game-label">支出用途</label>
                <select className="game-input" value={expCatId} onChange={e => setExpCatId(e.target.value)}>
                  <option value="">選択してください</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="game-label">支払日</label>
                <input className="game-input" type="date" value={expDate} onChange={e => setExpDate(e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="game-label">追記</label>
              <input className="game-input" value={expNote} onChange={e => setExpNote(e.target.value)} placeholder="任意" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="game-label">合同出資者（複数選択可）</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                {members.filter(m => m.profile_id !== expProfId).map(m => (
                  <label key={m.profile_id} style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.text, cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox"
                      checked={expCosponsors.includes(m.profile_id)}
                      onChange={e => setExpCosponsors(prev =>
                        e.target.checked ? [...prev, m.profile_id] : prev.filter(id => id !== m.profile_id)
                      )}
                    />
                    {m.profiles?.username}
                  </label>
                ))}
                {members.filter(m => m.profile_id !== expProfId).length === 0 && (
                  <span style={{ color: C.sub, fontSize: 13 }}>他の登録済み部員がいません</span>
                )}
              </div>
            </div>
            <button className="game-button" onClick={submitExpense} style={{ width: 'auto', padding: '10px 32px', fontSize: 16 }}>登録</button>
          </div>

          <div className="game-card" style={{ padding: '16px 24px' }}>
            <div style={{ color: C.text, fontWeight: 'bold', fontSize: 14, marginBottom: 10 }}>支出用途を追加・管理</div>
            <div style={flexRow}>
              <input className="game-input" style={{ flex: 1, minWidth: 0 }} value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="例: 交通費、備品購入" onKeyDown={e => e.key === 'Enter' && addCategory()} />
              <button className="game-button" onClick={addCategory} style={btnSm}>追加</button>
            </div>
            {categories.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {categories.map(c => <span key={c.id} style={{ background: C.accent, color: '#fff', padding: '2px 10px', borderRadius: 8, fontSize: 12 }}>{c.name}</span>)}
              </div>
            )}
          </div>

          <div className="game-card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 className="game-title" style={{ marginBottom: 0 }}>未決算の支出 ({unsettled.length}件)</h2>
              {checkedIds.length > 0 && (
                <button className="game-button" onClick={() => setShowSettlement(true)} style={{ width: 'auto', padding: '8px 20px', fontSize: 14, background: C.orange, border: `3px solid #b7601a` }}>
                  決算 ({checkedIds.length}件)
                </button>
              )}
            </div>
            {unsettled.length === 0
              ? <p style={{ color: C.sub }}>未決算の支出はありません</p>
              : unsettled.map(exp => (
                <Fragment key={exp.id}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                    <input type="checkbox"
                      checked={checkedIds.includes(exp.id)}
                      onChange={e => setCheckedIds(prev =>
                        e.target.checked ? [...prev, exp.id] : prev.filter(id => id !== exp.id)
                      )}
                      style={{ marginTop: 4, flexShrink: 0 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: C.red, fontWeight: 'bold', fontSize: 16 }}>-¥{exp.amount.toLocaleString()}</span>
                        <span style={{ color: C.sub, fontSize: 12 }}>{new Date(exp.paid_at).toLocaleDateString('ja-JP')}</span>
                      </div>
                      <div style={{ color: C.text, fontSize: 13 }}>
                        {exp.profiles?.username}
                        {exp.finance_expense_categories && <span style={{ color: C.sub }}>　／　{exp.finance_expense_categories.name}</span>}
                        {exp.note && <span style={{ color: C.sub }}>　／　{exp.note}</span>}
                      </div>
                      {exp.finance_expense_cosponsors.length > 0 && (
                        <div style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>
                          合同出資者: {exp.finance_expense_cosponsors.map(c => memberName(c.profile_id)).join('、')}
                        </div>
                      )}
                    </div>
                  </div>
                </Fragment>
              ))}
          </div>
        </div>
      )}

      {/* ── 資産管理 ─────────────────────────────────────────────────────────── */}
      {tab === 'assets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 className="game-title" style={{ marginBottom: 14 }}>部員を登録</h2>
            <div style={flexRow}>
              <select className="game-input" style={{ flex: 1, minWidth: 0 }} value={addProfId} onChange={e => setAddProfId(e.target.value)}>
                <option value="">部員を選択</option>
                {allProfiles.filter(p => !members.some(m => m.profile_id === p.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.username}</option>
                ))}
              </select>
              <button className="game-button" onClick={addMember} style={btnSm}>追加</button>
            </div>
          </div>

          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 className="game-title" style={{ marginBottom: 14 }}>登録済み部員</h2>
            {members.length === 0
              ? <p style={{ color: C.sub }}>登録された部員がいません</p>
              : members.map(m => {
                const mInc     = incomes.filter(i => i.profile_id === m.profile_id)
                const mExp     = expenses.filter(e => e.profile_id === m.profile_id && e.is_settled)
                const mSettle  = expenses.filter(e => e.is_settled && e.finance_expense_cosponsors.some(c => c.profile_id === m.profile_id))
                const settleOut = mSettle.reduce((s, e) => s + Math.floor(e.amount / (1 + e.finance_expense_cosponsors.length)), 0)
                const balance  = mInc.reduce((s, i) => s + i.amount, 0) - mExp.reduce((s, e) => s + e.amount, 0) - settleOut
                const isOpen   = expandedProf === m.profile_id
                return (
                  <Fragment key={m.profile_id}>
                    <div style={{ padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ color: C.text, fontWeight: 'bold', fontSize: 15 }}>{m.profiles?.username}</span>
                          <span style={{ color: balance >= 0 ? C.accent : C.red, marginLeft: 16, fontWeight: 'bold', fontSize: 20 }}>
                            ¥{balance.toLocaleString()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setExpandedProf(isOpen ? null : m.profile_id)}
                            style={{ background: 'none', border: `1px solid ${C.accent}`, color: C.accent, padding: '4px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                            {isOpen ? '閉じる' : '履歴'}
                          </button>
                          <button onClick={() => removeMember(m.profile_id)}
                            style={{ background: 'none', border: `1px solid ${C.red}`, color: C.red, padding: '4px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                            削除
                          </button>
                        </div>
                      </div>
                      {isOpen && (
                        <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: `3px solid ${C.border}` }}>
                          {mInc.length === 0 && mExp.length === 0 && mSettle.length === 0
                            ? <p style={{ color: C.sub, fontSize: 13 }}>履歴がありません</p>
                            : <>
                              {mInc.map(i => (
                                <div key={i.id} style={{ color: C.accent, fontSize: 13, marginBottom: 3 }}>
                                  ＋¥{i.amount.toLocaleString()} {i.finance_income_sources?.name ?? ''}（{new Date(i.received_at).toLocaleDateString('ja-JP')}）
                                </div>
                              ))}
                              {mExp.map(e => (
                                <div key={e.id} style={{ color: C.red, fontSize: 13, marginBottom: 3 }}>
                                  −¥{e.amount.toLocaleString()} 直接支払い {e.finance_expense_categories?.name ?? ''}（{new Date(e.paid_at).toLocaleDateString('ja-JP')}）
                                </div>
                              ))}
                              {mSettle.map(e => {
                                const share = Math.floor(e.amount / (1 + e.finance_expense_cosponsors.length))
                                return (
                                  <div key={`settle-${e.id}`} style={{ color: C.orange, fontSize: 13, marginBottom: 3 }}>
                                    −¥{share.toLocaleString()} 決算→{e.profiles?.username}（{e.finance_expense_categories?.name ?? ''}）
                                  </div>
                                )
                              })}
                            </>
                          }
                        </div>
                      )}
                    </div>
                  </Fragment>
                )
              })}
          </div>
        </div>
      )}

      {/* ── 支出予定・申請 ───────────────────────────────────────────────────── */}
      {tab === 'planned' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 className="game-title" style={{ marginBottom: 16 }}>支出予定・申請登録</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {(['planned', 'request'] as const).map(t => (
                <button key={t} onClick={() => setPlanType(t)} style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: `2px solid ${C.accent}`, cursor: 'pointer',
                  background: planType === t ? C.accent : '#fff',
                  color: planType === t ? '#fff' : C.accent, fontWeight: 'bold', fontSize: 14,
                }}>
                  {t === 'planned' ? '📅 支出予定' : '📝 申請'}
                </button>
              ))}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="game-label">支出用途</label>
              <select className="game-input" value={planCatId} onChange={e => setPlanCatId(e.target.value)}>
                <option value="">選択してください</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="game-label">詳細 *</label>
              <input className="game-input" value={planDetail} onChange={e => setPlanDetail(e.target.value)} placeholder="詳細を入力" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="game-label">追記</label>
              <input className="game-input" value={planNote} onChange={e => setPlanNote(e.target.value)} placeholder="任意" />
            </div>
            <button className="game-button" onClick={submitPlanned} style={{ width: 'auto', padding: '10px 32px', fontSize: 16 }}>登録</button>
          </div>

          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 className="game-title" style={{ marginBottom: 14 }}>一覧</h2>
            {planned.filter(p => p.status !== 'paid').length === 0
              ? <p style={{ color: C.sub }}>登録がありません</p>
              : planned.filter(p => p.status !== 'paid').map(plan => {
                const isPendingReq = plan.type === 'request' && plan.status === 'pending'
                const badgeColor   = plan.type === 'request'
                  ? (plan.status === 'approved' ? C.blue : C.purple)
                  : C.orange
                const badgeLabel   = plan.type === 'request'
                  ? (plan.status === 'approved' ? '支出予定（申請承認済み）' : '申請')
                  : '支出予定'
                return (
                  <Fragment key={plan.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ background: badgeColor, color: '#fff', padding: '2px 10px', borderRadius: 8, fontSize: 11, fontWeight: 'bold' }}>{badgeLabel}</span>
                          {plan.finance_expense_categories && (
                            <span style={{ background: C.rowBg, color: C.text, border: `1px solid ${C.border}`, padding: '2px 10px', borderRadius: 8, fontSize: 11 }}>
                              {plan.finance_expense_categories.name}
                            </span>
                          )}
                        </div>
                        <div style={{ color: C.text, fontSize: 15 }}>{plan.detail}</div>
                        {plan.note && <div style={{ color: C.sub, fontSize: 13, marginTop: 2 }}>{plan.note}</div>}
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        {isPendingReq ? (
                          <button className="game-button" onClick={() => approvePlanned(plan.id)}
                            style={{ width: 'auto', padding: '8px 16px', fontSize: 13, background: C.blue, border: `3px solid #1a6699` }}>
                            申請承認
                          </button>
                        ) : (
                          <button className="game-button"
                            onClick={() => { setConfirmingPlan(plan); setConfirmPlanPayer(''); setConfirmPlanAmt('') }}
                            style={{ width: 'auto', padding: '8px 16px', fontSize: 13, background: C.orange, border: `3px solid #b7601a` }}>
                            支払い確定
                          </button>
                        )}
                      </div>
                    </div>
                  </Fragment>
                )
              })}
          </div>
        </div>
      )}

      {/* ── 履歴 ─────────────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="game-card" style={{ padding: '20px 24px' }}>
          <h2 className="game-title" style={{ marginBottom: 14 }}>収支履歴</h2>
          {(() => {
            const items = [
              ...incomes.map(i => ({ kind: 'income' as const, date: i.received_at, data: i })),
              ...expenses.map(e => ({ kind: 'expense' as const, date: e.paid_at, data: e })),
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            if (items.length === 0) return <p style={{ color: C.sub }}>履歴がありません</p>
            return items.map(item => (
              <Fragment key={`${item.kind}-${item.data.id}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      {item.kind === 'income'
                        ? <span style={{ background: C.accent, color: '#fff', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 'bold' }}>収入</span>
                        : (item.data as FinanceExpense).is_settled
                          ? <span style={{ background: C.blue, color: '#fff', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 'bold' }}>支出（決算済）</span>
                          : <span style={{ background: C.red, color: '#fff', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 'bold' }}>支出（未決算）</span>
                      }
                    </div>
                    <div>
                      <span style={{ color: item.kind === 'income' ? C.accent : C.red, fontWeight: 'bold', fontSize: 16 }}>
                        {item.kind === 'income' ? '+' : '-'}¥{item.data.amount.toLocaleString()}
                      </span>
                      <span style={{ color: C.text, marginLeft: 12 }}>{item.data.profiles?.username}</span>
                      {item.kind === 'income' && (item.data as FinanceIncome).finance_income_sources && (
                        <span style={{ color: C.sub, marginLeft: 8, fontSize: 12 }}>({(item.data as FinanceIncome).finance_income_sources!.name})</span>
                      )}
                      {item.kind === 'expense' && (item.data as FinanceExpense).finance_expense_categories && (
                        <span style={{ color: C.sub, marginLeft: 8, fontSize: 12 }}>({(item.data as FinanceExpense).finance_expense_categories!.name})</span>
                      )}
                    </div>
                    {item.data.note && <div style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>{item.data.note}</div>}
                    {item.kind === 'expense' && (item.data as FinanceExpense).finance_expense_cosponsors.length > 0 && (
                      <div style={{ color: C.sub, fontSize: 12 }}>
                        合同出資者: {(item.data as FinanceExpense).finance_expense_cosponsors.map(c => memberName(c.profile_id)).join('、')}
                      </div>
                    )}
                  </div>
                  <span style={{ color: C.sub, fontSize: 12, flexShrink: 0 }}>{new Date(item.date).toLocaleDateString('ja-JP')}</span>
                </div>
              </Fragment>
            ))
          })()}
        </div>
      )}

      {/* ── 決算モーダル ──────────────────────────────────────────────────────── */}
      {showSettlement && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="game-card" style={{ maxWidth: 480, width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: '24px 28px' }}>
            <h2 className="game-title" style={{ marginBottom: 16 }}>決算確認</h2>
            {Object.keys(settlement).length === 0
              ? <p style={{ color: C.text, marginBottom: 16 }}>合同出資者なしの支出のみです。決算確定しますか？</p>
              : Object.entries(settlement).flatMap(([fromId, toMap]) =>
                  Object.entries(toMap).map(([toId, amount]) => (
                    <div key={`${fromId}-${toId}`} style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}`, color: C.text }}>
                      <span style={{ fontWeight: 'bold' }}>{memberName(fromId)}</span>
                      {' → '}
                      <span style={{ fontWeight: 'bold' }}>{memberName(toId)}</span>
                      {' に '}
                      <span style={{ color: C.red, fontWeight: 'bold', fontSize: 16 }}>¥{amount.toLocaleString()}</span>
                      {' 支払う'}
                    </div>
                  ))
                )
            }
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="game-button" onClick={confirmSettlement} style={{ width: 'auto', padding: '10px 28px', fontSize: 16 }}>決算確定</button>
              <button onClick={() => setShowSettlement(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `2px solid ${C.border}`, background: '#fff', color: C.text, cursor: 'pointer', fontSize: 15 }}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 支払い確定モーダル ────────────────────────────────────────────────── */}
      {confirmingPlan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="game-card" style={{ maxWidth: 400, width: '100%', padding: '24px 28px' }}>
            <h2 className="game-title" style={{ marginBottom: 12 }}>支払い確定</h2>
            <p style={{ color: C.sub, marginBottom: 16, fontSize: 14 }}>{confirmingPlan.detail}</p>
            <div style={{ marginBottom: 12 }}>
              <label className="game-label">支払った人 *</label>
              <select className="game-input" value={confirmPlanPayer} onChange={e => setConfirmPlanPayer(e.target.value)}>
                <option value="">選択してください</option>
                {members.map(m => <option key={m.profile_id} value={m.profile_id}>{m.profiles?.username}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="game-label">金額 (円) *</label>
              <input className="game-input" type="number" placeholder="0" value={confirmPlanAmt} onChange={e => setConfirmPlanAmt(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="game-button" onClick={doConfirmPlanned} style={{ width: 'auto', padding: '10px 24px', fontSize: 15 }}>確定して支出登録</button>
              <button onClick={() => setConfirmingPlan(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `2px solid ${C.border}`, background: '#fff', color: C.text, cursor: 'pointer', fontSize: 15 }}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
