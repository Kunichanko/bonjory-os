'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'

const C = {
  bg:     '#1a3a00',
  border: '#3d6e00',
  accent: '#6aac14',
  text:   '#a8d870',
  card:   '#ffffff',
  dark:   '#3d6e00',
}

// ─── ステップ定義 ────────────────────────────────────────────

const STEPS = [
  {
    title: 'Bonjory OS へようこそ！',
    illustration: (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <img src="/icons/Handlime_icon.png" alt="slime" style={{ width: 80, height: 80, objectFit: 'contain', display: 'block', margin: '0 auto' }} />
        <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700, color: C.dark }}>
          ゲーム制作サークル 「BONJORY」管理システム
        </div>
      </div>
    ),
    body: (
      <p style={{ color: C.dark, lineHeight: 1.8, margin: 0 }}>
        Bonjory OS はゲーム製作サークル「BONJORY」の活動を一括管理するシステムです。
        課題の提出・タイムラインの共有・部員同士のコミュニケーション・
        ポイント管理など、クラブ活動に必要な機能がそろっています。
        <br /><br />
        次のページからシステムの機能を紹介します！
      </p>
    ),
  },
  {
    title: '週次スケジュール',
    illustration: (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, padding: '8px 0' }}>
        {[
          { day: '月', label: '課題開始', emoji: '📋', color: '#e8f5e9' },
          { day: '木', label: '中間報告', emoji: '🔥', color: '#fff8e1' },
          { day: '日', label: '最終提出', emoji: '✅', color: '#e3f2fd' },
        ].map((item, i) => (
          <div key={item.day} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              background: item.color,
              border: `2px solid ${C.border}`,
              borderRadius: 12,
              padding: '12px 16px',
              textAlign: 'center',
              minWidth: 80,
            }}>
              <div style={{ fontSize: 24 }}>{item.emoji}</div>
              <div style={{ fontWeight: 700, color: C.dark, fontSize: 18 }}>{item.day}</div>
              <div style={{ fontSize: 11, color: C.dark, marginTop: 2 }}>{item.label}</div>
            </div>
            {i < 2 && (
              <div style={{ fontSize: 22, color: C.accent, padding: '0 8px', fontWeight: 700 }}>→</div>
            )}
          </div>
        ))}
      </div>
    ),
    body: (
      <div style={{ color: C.dark, lineHeight: 1.8 }}>
        <p style={{ margin: '0 0 8px' }}>毎週の流れは3ステップです：</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li><strong>月曜日</strong>：今週の課題が配信されます。制作計画を入力しましょう。</li>
          <li><strong>木曜日</strong>：進捗と日曜までの修正計画を中間報告しましょう。</li>
          <li><strong>日曜日</strong>：完成した作品の動画・画像と自己評価を投稿しましょう。</li>
        </ul>
      </div>
    ),
  },
  {
    title: 'ダッシュボードの機能',
    illustration: (
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', padding: '8px 0' }}>
        {[
          { icon: '📋', label: '今週の課題', desc: '制作計画・中間報告・最終提出' },
          { icon: '🌐', label: 'タイムライン', desc: '全部員の作品を閲覧・コメント' },
          { icon: '📚', label: '過去の課題', desc: '自分の提出履歴を振り返り' },
        ].map(item => (
          <div key={item.label} style={{
            border: `2px solid ${C.border}`,
            borderRadius: 10,
            padding: '10px 14px',
            textAlign: 'center',
            background: '#f8fff0',
            flex: '1 1 120px',
          }}>
            <div style={{ fontSize: 28 }}>{item.icon}</div>
            <div style={{ fontWeight: 700, color: C.dark, fontSize: 13, marginTop: 4 }}>{item.label}</div>
            <div style={{ fontSize: 11, color: '#5a8a00', marginTop: 2 }}>{item.desc}</div>
          </div>
        ))}
      </div>
    ),
    body: (
      <p style={{ color: C.dark, lineHeight: 1.8, margin: 0 }}>
        ダッシュボードの左サイドバーからビューを切り替えられます。
        タイムラインでは他の部員の作品を見てコメントすることもできます。
        管理者向けの機能（課題作成・部員管理など）はサイドバー下部に表示されます。
      </p>
    ),
  },
  {
    title: 'ポイントシステム',
    illustration: (
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', padding: '8px 0' }}>
        <div style={{
          border: `2px solid #f9a825`,
          borderRadius: 12,
          padding: '12px 20px',
          textAlign: 'center',
          background: '#fffde7',
          flex: 1,
        }}>
          <div style={{ fontSize: 32 }}>⭐</div>
          <div style={{ fontWeight: 700, color: '#f57f17', fontSize: 14, marginTop: 4 }}>トータルポイント</div>
          <div style={{ fontSize: 11, color: '#7f6000', marginTop: 2 }}>課題提出・活動参加で獲得</div>
        </div>
        <div style={{
          border: `2px solid #0288d1`,
          borderRadius: 12,
          padding: '12px 20px',
          textAlign: 'center',
          background: '#e1f5fe',
          flex: 1,
        }}>
          <div style={{ fontSize: 32 }}>❄️</div>
          <div style={{ fontWeight: 700, color: '#01579b', fontSize: 14, marginTop: 4 }}>クールポイント</div>
          <div style={{ fontSize: 11, color: '#01579b', marginTop: 2 }}>特に優れた作品で獲得</div>
        </div>
      </div>
    ),
    body: (
      <p style={{ color: C.dark, lineHeight: 1.8, margin: 0 }}>
        課題を提出したり活動に参加するとポイントが貯まります。
        ポイントに応じてランクが上がり、ダッシュボードのプロフィールカードに表示されます。
        クールポイントは管理者から特別に贈られる称号ポイントです。
      </p>
    ),
  },
  {
    title: 'DM機能',
    illustration: (
      <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <div style={{
          background: '#f8fff0',
          border: `2px solid ${C.border}`,
          borderRadius: 12,
          padding: '10px 20px',
          maxWidth: 260,
          width: '100%',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 20 }}>👤</span>
            <div>
              <div style={{ fontWeight: 700, color: C.dark, fontSize: 13 }}>部員</div>
              <div style={{ fontSize: 12, color: '#5a8a00' }}>「相談があります！」</div>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 20, color: C.accent }}>↓</div>
        <div style={{
          background: '#e8f5e9',
          border: `2px solid #388e3c`,
          borderRadius: 12,
          padding: '10px 20px',
          maxWidth: 260,
          width: '100%',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 20 }}>🛡️</span>
            <div>
              <div style={{ fontWeight: 700, color: '#1b5e20', fontSize: 13 }}>DM管理者</div>
              <div style={{ fontSize: 12, color: '#388e3c' }}>受信して返信</div>
            </div>
          </div>
        </div>
      </div>
    ),
    body: (
      <p style={{ color: C.dark, lineHeight: 1.8, margin: 0 }}>
        ダッシュボードのサイドバーにある「DM」からメッセージを送ることができます。
        部員はDM管理権限を持つメンバー（役員・管理者）にのみ送信できます。
        相談・質問・連絡などに活用してください。
      </p>
    ),
  },
]

const COURSES = [
  { value: 'Unity',   label: 'Unityコース',   emoji: '🎮', desc: 'Unity を使ったゲーム制作を学ぶ' },
  { value: 'Blender', label: 'Blenderコース', emoji: '🎨', desc: 'Blender を使った3DCG制作を学ぶ' },
  { value: 'Web',     label: 'Web開発コース', emoji: '🌐', desc: 'HTML/CSS/JS などWeb技術をAIコーディングで学ぶ' },
]

// ─── Page ───────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalSteps = STEPS.length + 1 // ステップ + コース選択

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }
      const { data: profile } = await supabase.from('profiles').select('course').eq('id', user.id).single()
      if (profile?.course) { router.replace('/dashboard'); return }
      setUserId(user.id)
    }
    init()
  }, [])

  const handleFinish = async () => {
    if (!selectedCourse || !userId) return
    setSaving(true)
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/complete-onboarding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ course: selectedCourse }),
    })
    if (!res.ok) {
      setError('コースの設定に失敗しました。もう一度お試しください。')
      setSaving(false)
      return
    }
    router.push('/dashboard')
  }

  const isCourseStep = step === STEPS.length
  const current = isCourseStep ? null : STEPS[step]

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div className="game-card" style={{ width: '100%', maxWidth: 520, padding: '36px 32px' }}>

        {/* ステップインジケーター */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 24 : 8,
                height: 8,
                borderRadius: 4,
                background: i === step ? C.accent : i < step ? C.border : '#d4edba',
                transition: 'all 0.3s',
              }}
            />
          ))}
        </div>

        {/* コンテンツ */}
        {!isCourseStep && current ? (
          <>
            <h2 style={{ color: C.dark, textAlign: 'center', fontSize: 22, fontWeight: 700, marginBottom: 20 }}>
              {current.title}
            </h2>
            {current.illustration}
            <div style={{ marginTop: 16 }}>{current.body}</div>
          </>
        ) : (
          <>
            <h2 style={{ color: C.dark, textAlign: 'center', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              コースを選択してください
            </h2>
            <p style={{ color: '#5a8a00', textAlign: 'center', fontSize: 13, marginBottom: 20 }}>
              あとで管理者に変更してもらうことができます
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {COURSES.map(c => (
                <button
                  key={c.value}
                  onClick={() => setSelectedCourse(c.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '16px 20px',
                    border: `2px solid ${selectedCourse === c.value ? C.accent : C.border}`,
                    borderRadius: 12,
                    background: selectedCourse === c.value ? '#f0fce0' : '#f8fff0',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: 36 }}>{c.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 700, color: C.dark, fontSize: 16 }}>{c.label}</div>
                    <div style={{ fontSize: 13, color: '#5a8a00', marginTop: 2 }}>{c.desc}</div>
                  </div>
                  {selectedCourse === c.value && (
                    <span style={{ marginLeft: 'auto', color: C.accent, fontSize: 20 }}>✓</span>
                  )}
                </button>
              ))}
            </div>
            {error && <div className="game-error" style={{ marginTop: 12 }}>{error}</div>}
          </>
        )}

        {/* ナビゲーションボタン */}
        <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
          {step > 0 && (
            <button
              className="game-button"
              onClick={() => setStep(s => s - 1)}
              style={{ flex: 1, background: '#e8f5d4', color: C.dark, border: `1px solid ${C.border}` }}
            >
              ← 前へ
            </button>
          )}
          {!isCourseStep ? (
            <button
              className="game-button"
              onClick={() => setStep(s => s + 1)}
              style={{ flex: 1 }}
            >
              {step === STEPS.length - 1 ? 'コース選択へ →' : '次へ →'}
            </button>
          ) : (
            <button
              className="game-button"
              onClick={handleFinish}
              disabled={!selectedCourse || saving}
              style={{ flex: 1, opacity: !selectedCourse ? 0.5 : 1 }}
            >
              {saving ? '設定中…' : 'はじめる 🚀'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
