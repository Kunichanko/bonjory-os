"use client"

import { useState, useEffect, useRef } from 'react'
import SpeechBubble from './SpeechBubble'

type SlimeState = 'idle' | 'jump' | 'hop' | 'walk-right' | 'walk-left' | 'wiggle' | 'stretch' | 'look'

const DURATIONS: Record<SlimeState, number> = {
  idle:         0,
  jump:         2000,
  hop:          1500,
  'walk-right': 1700,
  'walk-left':  1700,
  wiggle:       1600,
  stretch:      1800,
  look:         2200,
}

// 次のアクションをランダムに選ぶ
function pickNext(): SlimeState {
  const r = Math.random()
  if (r < 0.25) return 'jump'
  if (r < 0.42) return 'hop'
  if (r < 0.54) return 'walk-right'
  if (r < 0.66) return 'walk-left'
  if (r < 0.76) return 'wiggle'
  if (r < 0.88) return 'stretch'
  return 'look'
}

export default function SlimeIcon({
  size = 80,
  speechText = '',
  speechFullText = '',
  speechVisible = false,
}: {
  size?: number
  speechText?: string
  speechFullText?: string
  speechVisible?: boolean
}) {
  const [state, setState] = useState<SlimeState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleNext() {
    // アイドル後、4〜9秒のランダムな間隔でアクション
    const pause = 4000 + Math.random() * 5000
    timer.current = setTimeout(() => {
      const next = pickNext()
      setState(next)
      // アニメーション終了後にidleに戻って次をスケジュール
      timer.current = setTimeout(() => {
        setState('idle')
        scheduleNext()
      }, DURATIONS[next])
    }, pause)
  }

  useEffect(() => {
    scheduleNext()
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'relative', width: size, margin: '0 auto 16px' }}>
      <SpeechBubble text={speechText} fullText={speechFullText} visible={speechVisible} state={state} />
      <img
        src="/icons/Handlime_icon.png"
        alt="slime"
        className={`slime-${state}`}
        style={{
          width: size, height: size,
          objectFit: 'contain',
          display: 'block',
          transformOrigin: 'center bottom',
        }}
      />
      <div
        className={`slime-shadow slime-shadow-${state}`}
        style={{ width: size * 0.62, height: 8 }}
      />
    </div>
  )
}
