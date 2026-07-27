import { useEffect, useState } from 'react'
import { fetchBrands } from './api.js'

const PLATFORMS = [
  { key: 'baemin', label: '배민' },
  { key: 'coupangeats', label: '쿠팡이츠' },
  { key: 'ddangyo', label: '땡겨요' },
  { key: 'yogiyo', label: '요기요' },
]

function Cell({ offer }) {
  if (!offer) return <td className="empty">·</td>
  const held = offer.status === 'held'
  const amount = offer.amount != null ? `${offer.amount.toLocaleString()}원` : offer.rawText
  return (
    <td className={held ? 'held' : 'confirmed'}>
      {offer.qualifier === '최대' && <span className="badge">최대</span>}
      {amount}
    </td>
  )
}

export default function App() {
  const [brands, setBrands] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchBrands().then(setBrands).catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="msg">불러오기 실패: {error}</p>
  if (!brands) return <p className="msg">불러오는 중…</p>

  return (
    <main>
      <h1>배달앱 브랜드 할인 비교</h1>
      <p className="sub">같은 브랜드를 어느 앱에서 시키는 게 이득인지 한눈에</p>
      <table>
        <thead>
          <tr>
            <th>브랜드</th>
            {PLATFORMS.map((p) => <th key={p.key}>{p.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {brands.map((b) => {
            const byPlatform = Object.fromEntries(b.offers.map((o) => [o.platform, o]))
            return (
              <tr key={b.name}>
                <td className="brand">{b.name}</td>
                {PLATFORMS.map((p) => <Cell key={p.key} offer={byPlatform[p.key]} />)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
