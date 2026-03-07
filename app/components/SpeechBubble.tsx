"use client"

interface SpeechBubbleProps {
  text: string
  fullText: string   // 幅確保用（不可視）
  visible: boolean
  state?: string     // slime state — for Y-sync animation class
}

export default function SpeechBubble({ text, fullText, visible, state = 'idle' }: SpeechBubbleProps) {
  return (
    <div
      className={state === 'jump' || state === 'hop' ? `speech-pos-${state}` : undefined}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 14px)',
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        zIndex: 10,
      }}
    >
      <div style={{
        background: '#ffffff',
        border: '3px solid #3d6e00',
        borderRadius: 14,
        padding: '7px 12px',
        fontSize: 13,
        fontWeight: 'bold',
        color: '#2d5500',
        lineHeight: 1.5,
        textAlign: 'center',
        boxShadow: '0 4px 0 #3d6e00, 0 6px 16px rgba(0,0,0,0.2)',
        position: 'relative',
        whiteSpace: 'nowrap',
      }}>
        {/* 全文を不可視で配置 → 幅を固定 */}
        <span style={{ visibility: 'hidden', whiteSpace: 'pre', display: 'block' }}>
          {fullText || '\u00A0'}
        </span>
        {/* タイピング中のテキストを絶対配置で重ねる */}
        <span style={{
          position: 'absolute',
          top: '7px', left: '12px', right: '12px',
          whiteSpace: 'pre',
          display: 'block',
          textAlign: 'center',
        }}>
          {text}
        </span>

        {/* しっぽ（外枠） */}
        <span style={{
          position: 'absolute',
          bottom: -14, left: '50%',
          transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '11px solid #3d6e00',
          display: 'block',
        }} />
        {/* しっぽ（内塗り） */}
        <span style={{
          position: 'absolute',
          bottom: -8, left: '50%',
          transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '10px solid #ffffff',
          display: 'block',
        }} />
      </div>
    </div>
  )
}
