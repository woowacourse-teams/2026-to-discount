import { useEffect, useState } from 'react'
import { fetchBanners, fetchBrands } from '../../api.js'
import { setHubLinks } from '../../offerLink.js'
import { capturedLabel, endingSoon, newToday } from './data.js'

const EMPTY = '지금 해당하는 쿠폰이 없어요'

export default function NewEndingV2Shell() {
  const [state, setState] = useState({ status: 'loading' })
  const [tries, setTries] = useState(0)

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    // 배너는 허브 링크를 세우는 데만 쓴다. 실패하면 빈 목록.
    const banners = fetchBanners().catch(() => [])
    fetchBrands()
      .then(async (brands) => {
        setHubLinks(await banners)
        if (alive) setState({ status: 'ok', brands })
      })
      .catch(() => { if (alive) setState({ status: 'error' }) })
    return () => { alive = false }
  }, [tries])

  if (state.status === 'error') {
    return (
      <main className="ne2">
        <p className="ne2__fail">목록을 불러오지 못했어요</p>
        <button type="button" className="ne2__retry" onClick={() => setTries((n) => n + 1)}>다시 시도</button>
      </main>
    )
  }

  const ok = state.status === 'ok'
  const stamp = ok ? capturedLabel(state.brands) : null
  const fresh = ok ? newToday(state.brands) : []
  const ending = ok ? endingSoon(state.brands) : []

  return (
    <main className="ne2">
      {stamp && <p className="ne2__stamp">{stamp} 기준</p>}

      <section className="ne2__sec" aria-labelledby="ne2-new">
        <h2 id="ne2-new" className="ne2__title">오늘 새로 생긴 것</h2>
        {!ok ? <div className="ne2__ph ne2__ph--row" aria-busy="true" />
          : fresh.length === 0 ? <p className="ne2__empty">{EMPTY}</p>
            : (
              <ul className="ne2__rail">
                {fresh.map((c) => (
                  <li key={c.key} className="ne2__railitem">
                    <a className="ne2__card" href={c.href} target="_blank" rel="noopener noreferrer">
                      <span className="ne2__app">{c.platform}</span>
                      <span className="ne2__brand">{c.brandName}</span>
                      <span className="ne2__amount">{c.amount}</span>
                      {c.chips.length > 0 && (
                        <span className="ne2__chips">{c.chips.map((t) => <span key={t} className="ne2__chip">{t}</span>)}</span>
                      )}
                      <span className="ne2__min">{c.min}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
      </section>

      <section className="ne2__sec" aria-labelledby="ne2-end">
        <h2 id="ne2-end" className="ne2__title">곧 끝나는 것</h2>
        {!ok ? <div className="ne2__ph ne2__ph--list" aria-busy="true" />
          : ending.length === 0 ? <p className="ne2__empty">{EMPTY} (종료일이 알려진 쿠폰만 모아요)</p>
            : (
              <ul className="ne2__list">
                {ending.map((r) => (
                  <li key={r.key}>
                    <a className="ne2__row" href={r.href} target="_blank" rel="noopener noreferrer">
                      <span className="ne2__until">{r.until}</span>
                      <span className="ne2__rowmain">
                        <span className="ne2__rowbrand">{r.brandName}</span>
                        <span className="ne2__rowsub">{r.platform} · {r.min}</span>
                      </span>
                      <span className="ne2__rowamount">{r.amount}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
      </section>
    </main>
  )
}
