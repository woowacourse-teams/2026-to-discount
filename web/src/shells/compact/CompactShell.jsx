// 홈 리뉴얼 시안: 초압축 목록(#241). 버리는 시안이다. 설계: docs/design/241-compact-home-shell.md
import { useEffect, useMemo, useState } from 'react'
import { fetchBanners, fetchBrands } from '../../api.js'
import { CATEGORIES } from '../../filters.js'
import { PlatformBadge } from '../../logos.jsx'
import { openWithNotice, setHubLinks } from '../../offerLink.js'
import { buildRows, checkedAt } from './data.js'
import './compact.css'

// 커스텀 스킴(baemin://, coupangeats://)은 같은 탭에서 열어야 앱으로 간다. CouponCard의 OfferLinkA와 같은 처리.
const linkProps = (href) => {
  const web = typeof href === 'string' && href.startsWith('http')
  return { href, target: web ? '_blank' : undefined, rel: web ? 'noreferrer' : undefined, onClick: (e) => openWithNotice(e, href) }
}

function Row({ row }) {
  return (
    <li className="cp-row">
      <a className="cp-main" {...linkProps(row.href)} aria-label={`${row.label}, 앱으로 이동`}>
        <span className="cp-name">{row.name}</span>
        {row.condition && <span className="cp-cond">{row.condition}{row.conditionMore > 0 && <i>+{row.conditionMore}</i>}</span>}
        <span className="cp-min">{row.min}</span>
        <span className={`cp-amt${row.soldOut ? ' cp-amt--sold' : ''}`}>
          {row.soldOut ? <s>{row.amount}</s> : row.amount}
          {row.soldOut && <em>품절</em>}
        </span>
      </a>
      <span className="cp-apps">
        {row.apps.map((a) => (
          <a key={a.key} {...linkProps(a.href)}>
            <PlatformBadge platformKey={a.platform} brand={row.name} />
          </a>
        ))}
      </span>
    </li>
  )
}

export default function CompactShell({ initial = null }) {
  const [brands, setBrands] = useState(initial?.brands ?? null)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [category, setCategory] = useState(null)

  useEffect(() => {
    if (reloadKey === 0 && initial?.brands) return
    let alive = true
    setError(null)
    setBrands(null)
    fetchBrands()
      .then((v) => { if (alive) setBrands(v) })
      .catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [reloadKey])

  // 쿠팡이츠 허브 링크가 서려면 배너를 받아 setHubLinks를 먼저 불러야 한다(App.jsx와 같은 순서). 실패는 삼킨다.
  useEffect(() => {
    fetchBanners().then(setHubLinks).catch(() => {})
  }, [])

  const rows = useMemo(() => (brands ? buildRows(brands, category) : []), [brands, category])
  const stamp = useMemo(() => (brands ? checkedAt(brands) : null), [brands])

  return (
    <main className="cp">
      {stamp && <p className="cp-stamp">{stamp}</p>}
      <div className="cp-cats" role="group" aria-label="분류">
        <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>전체</button>
        {CATEGORIES.map((c) => (
          <button key={c.key} type="button" aria-pressed={category === c.key} onClick={() => setCategory(category === c.key ? null : c.key)}>{c.label}</button>
        ))}
      </div>
      {error && (
        <div className="load-error" role="alert">
          <p className="load-error__title">할인 정보를 못 불러옴</p>
          <p className="load-error__detail">{error}</p>
          <button type="button" className="load-error__retry" onClick={() => setReloadKey((k) => k + 1)}>다시 시도</button>
        </div>
      )}
      {!error && !brands && <p className="cp-loading" aria-busy="true">불러오는 중</p>}
      {brands && <ul className="cp-list">{rows.map((r) => <Row key={r.key} row={r} />)}</ul>}
    </main>
  )
}
