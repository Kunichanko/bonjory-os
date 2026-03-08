"use client"

import { useState, useEffect, useRef } from 'react'
import SpeechBubble from './SpeechBubble'

type SlimeState = 'idle' | 'jump' | 'hop' | 'walk-right' | 'walk-left' | 'wiggle' | 'stretch' | 'look' | 'poke'

const DURATIONS: Record<SlimeState, number> = {
  idle:         0,
  jump:         2000,
  hop:          1500,
  'walk-right': 1700,
  'walk-left':  1700,
  wiggle:       1600,
  stretch:      1800,
  look:         2200,
  poke:         700,
}

const WALK_STEP = 22  // 1回の歩行で移動するpx
const MAX_POS   = 60  // 最大移動量

// posXに応じてwalkの偏りを調整（端に近いほど戻りやすくなる）
function pickNext(posX: number): SlimeState {
  const r = Math.random()
  // 端に偏っている場合はwalkで戻る確率を上げる
  const rightBias = posX > 30 ? 0.15 : 0   // 右端→左に戻りやすく
  const leftBias  = posX < -30 ? 0.15 : 0  // 左端→右に戻りやすく

  if (r < 0.22) return 'jump'
  if (r < 0.38) return 'hop'
  if (r < 0.38 + 0.12 + leftBias)  return 'walk-right'
  if (r < 0.38 + 0.12 + leftBias + 0.12 + rightBias) return 'walk-left'
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
  const [state, setState]   = useState<SlimeState>('idle')
  const [posX, setPosX]     = useState(0)
  const timer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pokeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const posXRef   = useRef(0)  // scheduleNext クロージャ内で最新posXを参照するため

  // posX が変わったら ref も更新
  useEffect(() => { posXRef.current = posX }, [posX])

  function scheduleNext() {
    const pause = 4000 + Math.random() * 5000
    timer.current = setTimeout(() => {
      const next = pickNext(posXRef.current)
      setState(next)
      timer.current = setTimeout(() => {
        // 歩行後は位置を更新してからidleへ（React batching で一度に再描画）
        if (next === 'walk-right') {
          setPosX(x => Math.min(x + WALK_STEP, MAX_POS))
        } else if (next === 'walk-left') {
          setPosX(x => Math.max(x - WALK_STEP, -MAX_POS))
        }
        setState('idle')
        scheduleNext()
      }, DURATIONS[next])
    }, pause)
  }

  function handleClick() {
    if (state !== 'idle') return
    setState('poke')
    pokeTimer.current = setTimeout(() => setState('idle'), DURATIONS.poke)
  }

  useEffect(() => {
    scheduleNext()
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (pokeTimer.current) clearTimeout(pokeTimer.current)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div onClick={handleClick} style={{
      position: 'relative', width: size, margin: '0 auto 16px',
      transform: `translateX(${posX}px)`,
      transition: state === 'idle' ? 'none' : undefined,
      cursor: state === 'idle' ? 'pointer' : 'default',
    }}>
      <SpeechBubble text={speechText} fullText={speechFullText} visible={speechVisible} state={state} />
      {/* walk 時: X移動をコンテナに担当させ、img+shadow を一緒に動かす */}
      {(state === 'walk-right' || state === 'walk-left') ? (
        <div className={`slime-walk-x-${state === 'walk-right' ? 'right' : 'left'}`}
          style={{ position: 'relative', width: size, height: size }}>
          <img
            src="/icons/Handlime_icon.png"
            alt="slime"
            className="slime-walk-squeeze"
            style={{ width: size, height: size, objectFit: 'contain', display: 'block', transformOrigin: 'center bottom' }}
          />
          <div className={`slime-shadow slime-shadow-${state}`} style={{ width: size * 0.62, height: 8 }} />
        </div>
      ) : (
        <>
          <img
            src="/icons/Handlime_icon.png"
            alt="slime"
            className={`slime-${state}`}
            style={{ width: size, height: size, objectFit: 'contain', display: 'block', transformOrigin: 'center bottom' }}
          />
          <div className={`slime-shadow slime-shadow-${state}`} style={{ width: size * 0.62, height: 8 }} />
        </>
      )}
    </div>
  )
}
