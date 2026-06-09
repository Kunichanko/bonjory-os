'use client'

import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'
import Icon from '../../components/Icon'
import { X, Calendar, FileText } from 'lucide-react'

// 笏笏笏 Types 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

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

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'income',  label: '蜿主・逋ｻ骭ｲ',      icon: 'DollarSign' },
  { id: 'expense', label: '謾ｯ蜃ｺ逋ｻ骭ｲ',      icon: 'TrendingDown' },
  { id: 'assets',  label: '雉・肇邂｡逅・,      icon: 'Users' },
  { id: 'planned', label: '謾ｯ蜃ｺ莠亥ｮ壹・逕ｳ隲・, icon: 'ClipboardList' },
  { id: 'history', label: '螻･豁ｴ',          icon: 'ScrollText' },
]

// 蜈ｱ騾壹せ繧ｿ繧､繝ｫ
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

// 笏笏笏 Page 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export default function FinancePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [tab, setTab]         = useState<TabId>('income')

  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>({
    course_management: false, task_management: false, point_settings: false,
    submission_review: false, finance: false, timeline_management: false,
    dm_management: false, announcement_management: false, assignment_management: false, gimmick_management: false,
    dev_management: false,
    news_management: false, ticket_admin: false, debug: false, sns_management: false,
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

  // 笏笏笏 Init 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

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
    if (firstError) setError(`繝・・繧ｿ隱ｭ縺ｿ霎ｼ縺ｿ繧ｨ繝ｩ繝ｼ: ${firstError.message}`)
    setIncomes((inc ?? []) as unknown as FinanceIncome[])
    setExpenses((exp ?? []) as unknown as FinanceExpense[])
    setMembers((mem ?? []) as unknown as FinanceMember[])
    setSources(src ?? [])
    setCategories(cat ?? [])
    setPlanned((pln ?? []) as unknown as FinancePlanned[])
    setAllProfiles(prof ?? [])
  }

  // 笏笏笏 Computed 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

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

  // 笏笏笏 Actions 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

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
    if (!incProfId || !incAmount) { setError('蜿励￠蜿悶▲縺滉ｺｺ縺ｨ驥鷹｡阪・蠢・医〒縺・); return }
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
    if (!expProfId || !expAmount) { setError('謾ｯ謇輔▲縺滉ｺｺ縺ｨ驥鷹｡阪・蠢・医〒縺・); return }
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
    if (!planDetail.trim()) { setError('隧ｳ邏ｰ縺ｯ蠢・医〒縺・); return }
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

  // 笏笏笏 Render 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

  if (loading) return <div style={{ padding: 40, color: '#3d6e00' }}>隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</div>

  const unsettled  = expenses.filter(e => !e.is_settled)
  const settlement = calcSettlement()

  // 蜈･蜉・繝懊ち繝ｳ讓ｪ荳ｦ縺ｳ逕ｨ繝倥Ν繝代・繧ｹ繧ｿ繧､繝ｫ
  const flexRow = { display: 'flex', gap: 8, alignItems: 'flex-start' } as const
  const btnSm   = { width: 'auto', padding: '10px 20px', fontSize: 15, flexShrink: 0 } as const

  return (
    <div style={{ minHeight: '100vh', padding: '56px 24px 48px', maxWidth: 900, margin: '0 auto' }}>
      {/* Back */}
      <button onClick={() => router.push('/dashboard')} style={{ position: 'fixed', top: 20, left: 16, zIndex: 50, background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>竊・/button>

      {/* 邱剰ｳ・肇 */}
      <div className="game-card" style={{ padding: '20px 28px', marginBottom: 20, textAlign: 'center' }}>
        <div style={{ color: C.sub, fontSize: 13, marginBottom: 4 }}>Bonjory 邱剰ｳ・肇</div>
        <div style={{ color: totalAssets >= 0 ? C.accent : C.red, fontSize: 40, fontWeight: 'bold' }}>
          ﾂ･{totalAssets.toLocaleString()}
        </div>
        <div style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>
          蜿主・蜷郁ｨ・ﾂ･{totalIncome.toLocaleString()} ・・豎ｺ邂玲ｸ医∩謾ｯ蜃ｺ ﾂ･{totalSettled.toLocaleString()}
        </div>
      </div>

      {/* 繧ｿ繝・*/}
      <div style={{ display: 'flex', gap: 4, background: '#1a3a00', borderRadius: 12, padding: 4, marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '10px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap',
            background: tab === t.id ? '#6aac14' : 'none',
            color: tab === t.id ? '#fff' : '#a8d870',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}><Icon name={t.icon} size={13}/>{t.label}</button>
        ))}
      </div>

      {error && (
        <div className="game-error" style={{ marginBottom: 12 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', color: C.red, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><X size={15}/></button>
        </div>
      )}

      {/* 笏笏 蜿主・逋ｻ骭ｲ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */}
      {tab === 'income' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 className="game-title" style={{ marginBottom: 16 }}>蜿主・逋ｻ骭ｲ</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="game-label">蜿励￠蜿悶▲縺滉ｺｺ *</label>
                <select className="game-input" value={incProfId} onChange={e => setIncProfId(e.target.value)}>
                  <option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>
                  {members.map(m => <option key={m.profile_id} value={m.profile_id}>{m.profiles?.username}</option>)}
                </select>
              </div>
              <div>
                <label className="game-label">驥鷹｡・(蜀・ *</label>
                <input className="game-input" type="number" placeholder="0" value={incAmount} onChange={e => setIncAmount(e.target.value)} />
              </div>
              <div>
                <label className="game-label">蜿主・蜈・/label>
                <select className="game-input" value={incSource} onChange={e => setIncSource(e.target.value)}>
                  <option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>
                  {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="game-label">蜿怜叙譌･</label>
                <input className="game-input" type="date" value={incDate} onChange={e => setIncDate(e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="game-label">蛯呵・/label>
              <input className="game-input" value={incNote} onChange={e => setIncNote(e.target.value)} placeholder="莉ｻ諢・ />
            </div>
            <button className="game-button" onClick={submitIncome} style={{ width: 'auto', padding: '10px 32px', fontSize: 16 }}>逋ｻ骭ｲ</button>
          </div>

          <div className="game-card" style={{ padding: '16px 24px' }}>
            <div style={{ color: C.text, fontWeight: 'bold', fontSize: 14, marginBottom: 10 }}>蜿主・蜈・ｒ霑ｽ蜉繝ｻ邂｡逅・/div>
            <div style={flexRow}>
              <input className="game-input" style={{ flex: 1, minWidth: 0 }} value={newSource} onChange={e => setNewSource(e.target.value)} placeholder="萓・ 驛ｨ雋ｻ縲√ワ繝・き繧ｽ繝ｳ雉樣≡" onKeyDown={e => e.key === 'Enter' && addSource()} />
              <button className="game-button" onClick={addSource} style={btnSm}>霑ｽ蜉</button>
            </div>
            {sources.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {sources.map(s => <span key={s.id} style={{ background: C.accent, color: '#fff', padding: '2px 10px', borderRadius: 8, fontSize: 12 }}>{s.name}</span>)}
              </div>
            )}
          </div>

          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 className="game-title" style={{ marginBottom: 14 }}>蜿主・螻･豁ｴ</h2>
            {incomes.length === 0
              ? <p style={{ color: C.sub }}>險倬鹸縺後≠繧翫∪縺帙ｓ</p>
              : incomes.map(inc => (
                <Fragment key={inc.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                    <div>
                      <span style={{ color: C.accent, fontWeight: 'bold', fontSize: 16 }}>+ﾂ･{inc.amount.toLocaleString()}</span>
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

      {/* 笏笏 謾ｯ蜃ｺ逋ｻ骭ｲ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */}
      {tab === 'expense' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 className="game-title" style={{ marginBottom: 16 }}>謾ｯ蜃ｺ逋ｻ骭ｲ</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="game-label">謾ｯ謇輔▲縺滉ｺｺ *</label>
                <select className="game-input" value={expProfId} onChange={e => setExpProfId(e.target.value)}>
                  <option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>
                  {members.map(m => <option key={m.profile_id} value={m.profile_id}>{m.profiles?.username}</option>)}
                </select>
              </div>
              <div>
                <label className="game-label">驥鷹｡・(蜀・ *</label>
                <input className="game-input" type="number" placeholder="0" value={expAmount} onChange={e => setExpAmount(e.target.value)} />
              </div>
              <div>
                <label className="game-label">謾ｯ蜃ｺ逕ｨ騾・/label>
                <select className="game-input" value={expCatId} onChange={e => setExpCatId(e.target.value)}>
                  <option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="game-label">謾ｯ謇墓律</label>
                <input className="game-input" type="date" value={expDate} onChange={e => setExpDate(e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="game-label">霑ｽ險・/label>
              <input className="game-input" value={expNote} onChange={e => setExpNote(e.target.value)} placeholder="莉ｻ諢・ />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="game-label">蜷亥酔蜃ｺ雉・・ｼ郁､・焚驕ｸ謚槫庄・・/label>
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
                  <span style={{ color: C.sub, fontSize: 13 }}>莉悶・逋ｻ骭ｲ貂医∩驛ｨ蜩｡縺後＞縺ｾ縺帙ｓ</span>
                )}
              </div>
            </div>
            <button className="game-button" onClick={submitExpense} style={{ width: 'auto', padding: '10px 32px', fontSize: 16 }}>逋ｻ骭ｲ</button>
          </div>

          <div className="game-card" style={{ padding: '16px 24px' }}>
            <div style={{ color: C.text, fontWeight: 'bold', fontSize: 14, marginBottom: 10 }}>謾ｯ蜃ｺ逕ｨ騾斐ｒ霑ｽ蜉繝ｻ邂｡逅・/div>
            <div style={flexRow}>
              <input className="game-input" style={{ flex: 1, minWidth: 0 }} value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="萓・ 莠､騾夊ｲｻ縲∝ｙ蜩∬ｳｼ蜈･" onKeyDown={e => e.key === 'Enter' && addCategory()} />
              <button className="game-button" onClick={addCategory} style={btnSm}>霑ｽ蜉</button>
            </div>
            {categories.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {categories.map(c => <span key={c.id} style={{ background: C.accent, color: '#fff', padding: '2px 10px', borderRadius: 8, fontSize: 12 }}>{c.name}</span>)}
              </div>
            )}
          </div>

          <div className="game-card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 className="game-title" style={{ marginBottom: 0 }}>譛ｪ豎ｺ邂励・謾ｯ蜃ｺ ({unsettled.length}莉ｶ)</h2>
              {checkedIds.length > 0 && (
                <button className="game-button" onClick={() => setShowSettlement(true)} style={{ width: 'auto', padding: '8px 20px', fontSize: 14, background: C.orange, border: `3px solid #b7601a` }}>
                  豎ｺ邂・({checkedIds.length}莉ｶ)
                </button>
              )}
            </div>
            {unsettled.length === 0
              ? <p style={{ color: C.sub }}>譛ｪ豎ｺ邂励・謾ｯ蜃ｺ縺ｯ縺ゅｊ縺ｾ縺帙ｓ</p>
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
                        <span style={{ color: C.red, fontWeight: 'bold', fontSize: 16 }}>-ﾂ･{exp.amount.toLocaleString()}</span>
                        <span style={{ color: C.sub, fontSize: 12 }}>{new Date(exp.paid_at).toLocaleDateString('ja-JP')}</span>
                      </div>
                      <div style={{ color: C.text, fontSize: 13 }}>
                        {exp.profiles?.username}
                        {exp.finance_expense_categories && <span style={{ color: C.sub }}>縲・上{exp.finance_expense_categories.name}</span>}
                        {exp.note && <span style={{ color: C.sub }}>縲・上{exp.note}</span>}
                      </div>
                      {exp.finance_expense_cosponsors.length > 0 && (
                        <div style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>
                          蜷亥酔蜃ｺ雉・・ {exp.finance_expense_cosponsors.map(c => memberName(c.profile_id)).join('縲・)}
                        </div>
                      )}
                    </div>
                  </div>
                </Fragment>
              ))}
          </div>
        </div>
      )}

      {/* 笏笏 雉・肇邂｡逅・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */}
      {tab === 'assets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 className="game-title" style={{ marginBottom: 14 }}>驛ｨ蜩｡繧堤匳骭ｲ</h2>
            <div style={flexRow}>
              <select className="game-input" style={{ flex: 1, minWidth: 0 }} value={addProfId} onChange={e => setAddProfId(e.target.value)}>
                <option value="">驛ｨ蜩｡繧帝∈謚・/option>
                {allProfiles.filter(p => !members.some(m => m.profile_id === p.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.username}</option>
                ))}
              </select>
              <button className="game-button" onClick={addMember} style={btnSm}>霑ｽ蜉</button>
            </div>
          </div>

          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 className="game-title" style={{ marginBottom: 14 }}>逋ｻ骭ｲ貂医∩驛ｨ蜩｡</h2>
            {members.length === 0
              ? <p style={{ color: C.sub }}>逋ｻ骭ｲ縺輔ｌ縺滄Κ蜩｡縺後＞縺ｾ縺帙ｓ</p>
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
                            ﾂ･{balance.toLocaleString()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setExpandedProf(isOpen ? null : m.profile_id)}
                            style={{ background: 'none', border: `1px solid ${C.accent}`, color: C.accent, padding: '4px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                            {isOpen ? '髢峨§繧・ : '螻･豁ｴ'}
                          </button>
                          <button onClick={() => removeMember(m.profile_id)}
                            style={{ background: 'none', border: `1px solid ${C.red}`, color: C.red, padding: '4px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                            蜑企勁
                          </button>
                        </div>
                      </div>
                      {isOpen && (
                        <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: `3px solid ${C.border}` }}>
                          {mInc.length === 0 && mExp.length === 0 && mSettle.length === 0
                            ? <p style={{ color: C.sub, fontSize: 13 }}>螻･豁ｴ縺後≠繧翫∪縺帙ｓ</p>
                            : <>
                              {mInc.map(i => (
                                <div key={i.id} style={{ color: C.accent, fontSize: 13, marginBottom: 3 }}>
                                  ・仰･{i.amount.toLocaleString()} {i.finance_income_sources?.name ?? ''}・・new Date(i.received_at).toLocaleDateString('ja-JP')}・・
                                </div>
                              ))}
                              {mExp.map(e => (
                                <div key={e.id} style={{ color: C.red, fontSize: 13, marginBottom: 3 }}>
                                  竏陳･{e.amount.toLocaleString()} 逶ｴ謗･謾ｯ謇輔＞ {e.finance_expense_categories?.name ?? ''}・・new Date(e.paid_at).toLocaleDateString('ja-JP')}・・
                                </div>
                              ))}
                              {mSettle.map(e => {
                                const share = Math.floor(e.amount / (1 + e.finance_expense_cosponsors.length))
                                return (
                                  <div key={`settle-${e.id}`} style={{ color: C.orange, fontSize: 13, marginBottom: 3 }}>
                                    竏陳･{share.toLocaleString()} 豎ｺ邂冷・{e.profiles?.username}・・e.finance_expense_categories?.name ?? ''}・・
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

      {/* 笏笏 謾ｯ蜃ｺ莠亥ｮ壹・逕ｳ隲・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */}
      {tab === 'planned' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 className="game-title" style={{ marginBottom: 16 }}>謾ｯ蜃ｺ莠亥ｮ壹・逕ｳ隲狗匳骭ｲ</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {(['planned', 'request'] as const).map(t => (
                <button key={t} onClick={() => setPlanType(t)} style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: `2px solid ${C.accent}`, cursor: 'pointer',
                  background: planType === t ? C.accent : '#fff',
                  color: planType === t ? '#fff' : C.accent, fontWeight: 'bold', fontSize: 14,
                }}>
                  {t === 'planned'
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={14}/>謾ｯ蜃ｺ莠亥ｮ・/span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><FileText size={14}/>逕ｳ隲・/span>
                  }
                </button>
              ))}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="game-label">謾ｯ蜃ｺ逕ｨ騾・/label>
              <select className="game-input" value={planCatId} onChange={e => setPlanCatId(e.target.value)}>
                <option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="game-label">隧ｳ邏ｰ *</label>
              <input className="game-input" value={planDetail} onChange={e => setPlanDetail(e.target.value)} placeholder="隧ｳ邏ｰ繧貞・蜉・ />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="game-label">霑ｽ險・/label>
              <input className="game-input" value={planNote} onChange={e => setPlanNote(e.target.value)} placeholder="莉ｻ諢・ />
            </div>
            <button className="game-button" onClick={submitPlanned} style={{ width: 'auto', padding: '10px 32px', fontSize: 16 }}>逋ｻ骭ｲ</button>
          </div>

          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 className="game-title" style={{ marginBottom: 14 }}>荳隕ｧ</h2>
            {planned.filter(p => p.status !== 'paid').length === 0
              ? <p style={{ color: C.sub }}>逋ｻ骭ｲ縺後≠繧翫∪縺帙ｓ</p>
              : planned.filter(p => p.status !== 'paid').map(plan => {
                const isPendingReq = plan.type === 'request' && plan.status === 'pending'
                const badgeColor   = plan.type === 'request'
                  ? (plan.status === 'approved' ? C.blue : C.purple)
                  : C.orange
                const badgeLabel   = plan.type === 'request'
                  ? (plan.status === 'approved' ? '謾ｯ蜃ｺ莠亥ｮ夲ｼ育筏隲区価隱肴ｸ医∩・・ : '逕ｳ隲・)
                  : '謾ｯ蜃ｺ莠亥ｮ・
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
                            逕ｳ隲区価隱・
                          </button>
                        ) : (
                          <button className="game-button"
                            onClick={() => { setConfirmingPlan(plan); setConfirmPlanPayer(''); setConfirmPlanAmt('') }}
                            style={{ width: 'auto', padding: '8px 16px', fontSize: 13, background: C.orange, border: `3px solid #b7601a` }}>
                            謾ｯ謇輔＞遒ｺ螳・
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

      {/* 笏笏 螻･豁ｴ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */}
      {tab === 'history' && (
        <div className="game-card" style={{ padding: '20px 24px' }}>
          <h2 className="game-title" style={{ marginBottom: 14 }}>蜿取髪螻･豁ｴ</h2>
          {(() => {
            const items = [
              ...incomes.map(i => ({ kind: 'income' as const, date: i.received_at, data: i })),
              ...expenses.map(e => ({ kind: 'expense' as const, date: e.paid_at, data: e })),
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            if (items.length === 0) return <p style={{ color: C.sub }}>螻･豁ｴ縺後≠繧翫∪縺帙ｓ</p>
            return items.map(item => (
              <Fragment key={`${item.kind}-${item.data.id}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      {item.kind === 'income'
                        ? <span style={{ background: C.accent, color: '#fff', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 'bold' }}>蜿主・</span>
                        : (item.data as FinanceExpense).is_settled
                          ? <span style={{ background: C.blue, color: '#fff', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 'bold' }}>謾ｯ蜃ｺ・域ｱｺ邂玲ｸ茨ｼ・/span>
                          : <span style={{ background: C.red, color: '#fff', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 'bold' }}>謾ｯ蜃ｺ・域悴豎ｺ邂暦ｼ・/span>
                      }
                    </div>
                    <div>
                      <span style={{ color: item.kind === 'income' ? C.accent : C.red, fontWeight: 'bold', fontSize: 16 }}>
                        {item.kind === 'income' ? '+' : '-'}ﾂ･{item.data.amount.toLocaleString()}
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
                        蜷亥酔蜃ｺ雉・・ {(item.data as FinanceExpense).finance_expense_cosponsors.map(c => memberName(c.profile_id)).join('縲・)}
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

      {/* 笏笏 豎ｺ邂励Δ繝ｼ繝繝ｫ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */}
      {showSettlement && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="game-card" style={{ maxWidth: 480, width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: '24px 28px' }}>
            <h2 className="game-title" style={{ marginBottom: 16 }}>豎ｺ邂礼｢ｺ隱・/h2>
            {Object.keys(settlement).length === 0
              ? <p style={{ color: C.text, marginBottom: 16 }}>蜷亥酔蜃ｺ雉・・↑縺励・謾ｯ蜃ｺ縺ｮ縺ｿ縺ｧ縺吶よｱｺ邂礼｢ｺ螳壹＠縺ｾ縺吶°・・/p>
              : Object.entries(settlement).flatMap(([fromId, toMap]) =>
                  Object.entries(toMap).map(([toId, amount]) => (
                    <div key={`${fromId}-${toId}`} style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}`, color: C.text }}>
                      <span style={{ fontWeight: 'bold' }}>{memberName(fromId)}</span>
                      {' 竊・'}
                      <span style={{ fontWeight: 'bold' }}>{memberName(toId)}</span>
                      {' 縺ｫ '}
                      <span style={{ color: C.red, fontWeight: 'bold', fontSize: 16 }}>ﾂ･{amount.toLocaleString()}</span>
                      {' 謾ｯ謇輔≧'}
                    </div>
                  ))
                )
            }
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="game-button" onClick={confirmSettlement} style={{ width: 'auto', padding: '10px 28px', fontSize: 16 }}>豎ｺ邂礼｢ｺ螳・/button>
              <button onClick={() => setShowSettlement(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `2px solid ${C.border}`, background: '#fff', color: C.text, cursor: 'pointer', fontSize: 15 }}>
                繧ｭ繝｣繝ｳ繧ｻ繝ｫ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 笏笏 謾ｯ謇輔＞遒ｺ螳壹Δ繝ｼ繝繝ｫ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */}
      {confirmingPlan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="game-card" style={{ maxWidth: 400, width: '100%', padding: '24px 28px' }}>
            <h2 className="game-title" style={{ marginBottom: 12 }}>謾ｯ謇輔＞遒ｺ螳・/h2>
            <p style={{ color: C.sub, marginBottom: 16, fontSize: 14 }}>{confirmingPlan.detail}</p>
            <div style={{ marginBottom: 12 }}>
              <label className="game-label">謾ｯ謇輔▲縺滉ｺｺ *</label>
              <select className="game-input" value={confirmPlanPayer} onChange={e => setConfirmPlanPayer(e.target.value)}>
                <option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>
                {members.map(m => <option key={m.profile_id} value={m.profile_id}>{m.profiles?.username}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="game-label">驥鷹｡・(蜀・ *</label>
              <input className="game-input" type="number" placeholder="0" value={confirmPlanAmt} onChange={e => setConfirmPlanAmt(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="game-button" onClick={doConfirmPlanned} style={{ width: 'auto', padding: '10px 24px', fontSize: 15 }}>遒ｺ螳壹＠縺ｦ謾ｯ蜃ｺ逋ｻ骭ｲ</button>
              <button onClick={() => setConfirmingPlan(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `2px solid ${C.border}`, background: '#fff', color: C.text, cursor: 'pointer', fontSize: 15 }}>
                繧ｭ繝｣繝ｳ繧ｻ繝ｫ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

