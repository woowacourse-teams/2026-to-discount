import { useEffect, useState } from 'react'
import { BrandLogo } from '../../logos.jsx'
import { openWithNotice } from '../../offerLink.js'
import { capturedLabel, loadHome } from './data.js'
import './toss.css'

export default function TossShell() {
  const [home, setHome] = useState(null)
  const [failed, setFailed] = useState(false)
  const [tries, setTries] = useState(0)

  useEffect(() => {
    let alive = true
    setFailed(false)
    setHome(null)
    loadHome(tries === 0 ? window.__SSR__ : null)
      .then((v) => { if (alive) setHome(v) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [tries])

  const rows = home?.rows ?? []
  const label = home ? capturedLabel(home.capturedAt) : null

  return (
    <div className="toss">
      <header className="toss-top">
        <h1>오늘 받을 수 있는 할인</h1>
        <p>앱별 쿠폰을 한눈에 비교해요</p>
        {label && <p className="toss-top__time">{label}</p>}
      </header>

      <h2 className="toss-listheader">할인 큰 순</h2>

      <section className="toss-card">
        {failed && (
          <div className="toss-empty">
            <p>불러오지 못했어요</p>
            <button type="button" className="toss-textbtn" onClick={() => setTries((n) => n + 1)}>다시 시도</button>
          </div>
        )}
        {!failed && !home && [0, 1, 2, 3, 4].map((i) => <div key={i} className="toss-skel" aria-hidden="true" />)}
        {home && rows.length === 0 && <div className="toss-empty"><p>지금 받을 수 있는 할인이 없어요</p></div>}
        {rows.map((r) => (
          <a key={r.name} className="toss-row" href={r.href} onClick={(e) => openWithNotice(e, r.href)}>
            <span className="toss-row__logo"><BrandLogo name={r.name} size={40} /></span>
            <span className="toss-row__mid">
              <span className="toss-row__name">{r.name}</span>
              <span className="toss-row__sub">{r.platformLabel} · {r.minText}</span>
            </span>
            <span className="toss-row__end">
              <span className="toss-row__amount">{r.amountText}</span>
              {r.chips.length > 0 && <span className="toss-row__chips">{r.chips.slice(0, 2).join(' · ')}</span>}
            </span>
          </a>
        ))}
      </section>

      {rows[0] && (
        <div className="toss-cta">
          <a className="toss-cta__btn" href={rows[0].href} onClick={(e) => openWithNotice(e, rows[0].href)}>
            가장 큰 할인 받으러 가기
          </a>
        </div>
      )}
    </div>
  )
}
