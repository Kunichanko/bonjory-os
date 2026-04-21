"use client"

import Image from "next/image"
import Link from "next/link"
import SlimeIcon from "./components/SlimeIcon"

export default function Home() {
  return (
    <div style={{ fontFamily: "'Mantou Sans', 'Arial Rounded MT Bold', Arial, sans-serif" }}>

      {/* ナビゲーションバー */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: '#2a4d00',
        borderBottom: '3px solid #6aac14',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 32px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}>
        <span style={{ color: '#d4f08a', fontSize: 22, fontWeight: 900, letterSpacing: 2 }}>
          BONJORY
        </span>
        <Link href="/login">
          <button style={{
            background: '#6aac14', color: 'white', border: '3px solid #3d6e00',
            borderRadius: 12, padding: '8px 24px', fontSize: 15, fontWeight: 'bold',
            cursor: 'pointer', boxShadow: '0 4px 0 #3d6e00',
            fontFamily: 'inherit', letterSpacing: 0.5,
          }}>
            ログイン
          </button>
        </Link>
      </nav>

      {/* ヒーローセクション */}
      <section style={{
        minHeight: '100vh', background: '#f0ead6',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        paddingTop: 80, paddingBottom: 60, paddingLeft: 24, paddingRight: 24,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* 背景デコレーション */}
        <div style={{
          position: 'absolute', top: 24, right: 24,
          width: 80, height: 80, background: '#2a4d00',
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
          opacity: 0.15,
        }} />
        <div style={{
          position: 'absolute', bottom: 40, left: 32,
          width: 50, height: 50, background: '#3d6e00',
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
          opacity: 0.2,
        }} />
        <div style={{
          position: 'absolute', top: 100, left: 20,
          display: 'grid', gridTemplateColumns: 'repeat(4, 8px)', gap: 6, opacity: 0.12,
        }}>
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#3d6e00' }} />
          ))}
        </div>
        <div style={{
          position: 'absolute', bottom: 80, right: 20,
          display: 'grid', gridTemplateColumns: 'repeat(4, 8px)', gap: 6, opacity: 0.12,
        }}>
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#3d6e00' }} />
          ))}
        </div>

        {/* キャッチコピー */}
        <h1 style={{
          fontSize: 'clamp(28px, 6vw, 56px)', fontWeight: 900, color: '#2a4d00',
          textAlign: 'center', lineHeight: 1.2, marginBottom: 8,
          textShadow: '0 2px 0 rgba(0,0,0,0.08)',
        }}>
          その手で、<br />世界を歩こう。
        </h1>
        <p style={{ color: '#4e8a00', fontSize: 16, fontWeight: 'bold', marginBottom: 32, letterSpacing: 1 }}>
          3DパズルアクションゲームHandlime
        </p>

        {/* Handlimeタイトル画像 */}
        <div style={{ marginBottom: 24, position: 'relative' }}>
          <Image
            src="/icons/Handlime_title.png"
            alt="Handlime"
            width={420}
            height={180}
            style={{ objectFit: 'contain', maxWidth: '90vw', height: 'auto', filter: 'drop-shadow(0 4px 12px rgba(42,77,0,0.3))' }}
            priority
          />
        </div>

        {/* スライムアイコン */}
        <div style={{ marginBottom: 36 }}>
          <SlimeIcon size={100} />
        </div>

        {/* CTAボタン */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a href="#handlime">
            <button style={{
              background: '#f0ead6', color: '#2a4d00', border: '4px solid #3d6e00',
              borderRadius: 14, padding: '14px 32px', fontSize: 17, fontWeight: 'bold',
              cursor: 'pointer', boxShadow: '0 5px 0 #3d6e00', fontFamily: 'inherit',
              transition: 'transform 0.1s, box-shadow 0.1s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(2px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 3px 0 #3d6e00' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 5px 0 #3d6e00' }}
            >
              ゲームを見る
            </button>
          </a>
          <Link href="/login">
            <button className="game-button" style={{ width: 'auto', padding: '14px 32px', fontSize: 17 }}>
              ログインする
            </button>
          </Link>
        </div>
      </section>

      {/* Handlime紹介セクション */}
      <section id="handlime" style={{
        background: '#ddeecb', padding: '80px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{ maxWidth: 800, width: '100%' }}>
          {/* 特徴ボックス */}
          <div style={{
            background: '#b8d9a0', border: '3px solid #4e8a00', borderRadius: 16,
            padding: '24px 28px', marginBottom: 48,
            boxShadow: '0 4px 0 #3d6e00',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ color: '#2a4d00', fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
                  ✦ あなたの手が、そのまま主人公に！
                </p>
                <p style={{ color: '#2a4d00', fontSize: 15, lineHeight: 1.8, margin: 0 }}>
                  あなたの手の形をマネする不思議なスライムを動かして進む、今までにないゲーム体験。<br />
                  初めて触れるのに、なぜか動かし方がわかる。<br />
                  そんな直感的な操作が魅力です！
                </p>
              </div>
              <div style={{
                width: 90, height: 90, borderRadius: '50%',
                background: '#2a4d00', overflow: 'hidden', flexShrink: 0,
                border: '3px solid #3d6e00', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Image
                  src="/icons/Handlime_icon.png"
                  alt="Handlime icon"
                  width={90}
                  height={90}
                  style={{ objectFit: 'cover' }}
                />
              </div>
            </div>
          </div>

          {/* ステージ紹介（プレースホルダー） */}
          <h2 style={{
            fontSize: 22, fontWeight: 900, color: '#2a4d00',
            borderBottom: '3px solid #4e8a00', paddingBottom: 8, marginBottom: 28,
          }}>
            ステージ紹介
          </h2>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16,
          }}>
            {['草原', 'サイバービル', '鉱山', 'ライブステージ'].map((stage) => (
              <div key={stage} style={{
                background: '#c8e6a8', border: '3px solid #4e8a00', borderRadius: 12,
                padding: 16, textAlign: 'center', boxShadow: '0 4px 0 #3d6e00',
              }}>
                <div style={{
                  width: '100%', paddingTop: '60%', background: '#a8c888', borderRadius: 8,
                  marginBottom: 10, border: '2px solid #3d6e00', position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#4e8a00', fontSize: 11, fontWeight: 'bold',
                  }}>
                    画像追加予定
                  </span>
                </div>
                <p style={{ color: '#2a4d00', fontWeight: 'bold', fontSize: 15, margin: 0 }}>
                  {stage}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BONJORY-OS紹介セクション */}
      <section style={{
        background: 'linear-gradient(135deg, #2a4d00 0%, #3d6e00 50%, #2a4d00 100%)',
        padding: '80px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{ maxWidth: 600, width: '100%', textAlign: 'center' }}>
          <h2 style={{
            fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900, color: '#d4f08a',
            marginBottom: 16, letterSpacing: 2,
            textShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}>
            BONJORY-OS
          </h2>
          <p style={{ color: '#a8d870', fontSize: 17, lineHeight: 1.8, marginBottom: 12 }}>
            BONJORYのゲーム部メンバー向けクラブ管理システムです。
          </p>
          <p style={{ color: '#8dc832', fontSize: 15, lineHeight: 1.7, marginBottom: 40 }}>
            タスク管理・進捗確認・ニュース配信・DMなど、<br />
            部活動をサポートする機能を一つにまとめました。
          </p>

          <Link href="/login">
            <button className="game-button" style={{
              width: 'auto', padding: '16px 48px', fontSize: 18, letterSpacing: 1,
              background: '#6aac14',
            }}>
              ログインして使う
            </button>
          </Link>
        </div>
      </section>

      {/* フッター */}
      <footer style={{
        background: '#f0ead6', borderTop: '3px solid #4e8a00',
        padding: '24px', textAlign: 'center',
        color: '#4e8a00', fontSize: 14, fontWeight: 'bold',
      }}>
        © 2025 BONJORY
      </footer>
    </div>
  )
}
