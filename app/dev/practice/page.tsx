'use client'

// ============================================================
// 開発練習ページ
// Web開発コース課題用：このファイルの contributors 配列に
// 自分のユーザー名を追加して、PRを出す練習をします。
// ============================================================

const contributors: { name: string; date: string; message: string }[] = [
  // ↓ この配列に、以下のフォーマットで自分のエントリーを追加してください ↓
  // { name: 'あなたのユーザー名', date: '2026-08-23', message: 'ひとこと（自由）' },
  { name: 'Kunichanko', date: '2026-08-23', message: 'このページを作りました！' },
]

export default function PracticePage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#1a3a00',
      color: '#a8d870',
      padding: '40px 20px',
      fontFamily: 'monospace',
    }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ color: '#6aac14', fontSize: 28, marginBottom: 8 }}>
          🎮 BONJORY OS - 開発練習ページ
        </h1>
        <p style={{ color: '#7a9a50', marginBottom: 32 }}>
          このページは Web 開発コースの Git/GitHub 練習用です。
          下のリストに自分の名前が表示されていれば、セットアップ成功です！
        </p>

        <h2 style={{ color: '#6aac14', fontSize: 20, marginBottom: 16, borderBottom: '1px solid #3d6e00', paddingBottom: 8 }}>
          Contributors ({contributors.length})
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contributors.map((c, i) => (
            <div key={i} style={{
              background: '#243d00',
              border: '1px solid #3d6e00',
              borderRadius: 8,
              padding: '12px 16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#a8d870', fontWeight: 'bold', fontSize: 16 }}>
                  {c.name}
                </span>
                <span style={{ color: '#5a7a30', fontSize: 12 }}>
                  {c.date}
                </span>
              </div>
              <p style={{ color: '#7a9a50', margin: '4px 0 0', fontSize: 14 }}>
                {c.message}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
