import { useEffect, useMemo, useState } from 'react'
import { fetchBanners, fetchBrands } from '../../api.js'
import { openWithNotice, setHubLinks } from '../../offerLink.js'
import { shortBrandName } from '../../couponModel.js'
import { BrandLogo, PlatformBadge } from '../../logos.jsx'
import {
  CATEGORIES, DEFAULT_ORDER_AMOUNT, ORDER_AMOUNTS, PLATFORMS, capturedLabel, overallCaptured, rowsOf,
} from './data.js'
import './savings-compare.css'

// 시안(#269, 병합하지 않음): 주문 금액을 고르면 앱별로 그 금액에서 실제로 받는 할인을 나란히 둔다.
const PAGE = 20
const wonText = (n) => `${n.toLocaleString('ko-KR')}원`

function Cell({ cell, brandName }) {
  if (cell.state === 'none') {
    return <span className="sc-cell sc-cell--none" aria-label={`${brandName} ${cell.label} 오퍼 없음`}>-</span>
  }
  const web = cell.href.startsWith('http')
  const label = [brandName, cell.label, cell.amountText, cell.minText, cell.state === 'best' ? '가장 큰 할인' : null]
    .filter(Boolean).join(' ')
  return (
    <a className={`sc-cell sc-cell--${cell.state}`} href={cell.href}
       target={web ? '_blank' : undefined} rel={web ? 'noreferrer' : undefined}
       aria-label={label}
       onClick={(e) => openWithNotice(e, cell.href)}>
      <span className="sc-amt">{cell.soldOut ? <s>{cell.amountText}</s> : cell.amountText}</span>
      <span className="sc-min">{cell.soldOut ? '품절' : cell.minText}</span>
      {cell.chips.length > 0 && (
        <span className="sc-chips">
          {cell.chips.map((c) => <span key={c.kind + c.text} className="sc-chip">{c.text}</span>)}
        </span>
      )}
    </a>
  )
}

function Row({ row }) {
  const time = capturedLabel(row.capturedAt)
  return (
    <li className="sc-row">
      <div className="sc-row__head">
        <BrandLogo name={row.name} size={28} />
        <span className="sc-row__name">{shortBrandName(row.brand)}</span>
        {time && <span className="sc-row__time">{time} 기준</span>}
      </div>
      <div className="sc-cells">
        {row.cells.map((c) => <Cell key={c.platform} cell={{ ...c, label: PLATFORMS.find((p) => p.key === c.platform).label }} brandName={row.name} />)}
      </div>
    </li>
  )
}

export default function SavingsCompareShell({ initial = null }) {
  const [brands, setBrands] = useState(initial?.brands ?? null)
  const [failed, setFailed] = useState(false)
  const [order, setOrder] = useState(DEFAULT_ORDER_AMOUNT)
  const [category, setCategory] = useState(null)
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    fetchBrands().then(setBrands).catch(() => { if (!initial?.brands) setFailed(true) })
    // 허브 링크가 비면 쿠팡이츠가 아닌 앱의 링크 폴백이 앱 홈으로 떨어진다(App.jsx와 같은 일).
    fetchBanners().then(setHubLinks).catch(() => {})
  }, [initial])

  const rows = useMemo(
    () => (brands ? rowsOf(brands, order, new Set(category ? [category] : [])) : null),
    [brands, order, category],
  )
  const captured = useMemo(() => (brands ? capturedLabel(overallCaptured(brands)) : null), [brands])

  return (
    <main className="sc">
      <header className="sc-top">
        <h1 className="sc-title">주문 금액별 앱 할인 비교</h1>
        {captured && <p className="sc-asof">{captured} 기준</p>}
      </header>

      <div className="sc-sticky">
        <div className="sc-chips-row" role="group" aria-label="주문 금액">
          {ORDER_AMOUNTS.map((n) => (
            <button key={n} type="button" className={`sc-pill${n === order ? ' is-on' : ''}`}
                    aria-pressed={n === order} onClick={() => { setOrder(n); setShown(PAGE) }}>
              {wonText(n)}
            </button>
          ))}
        </div>
        <div className="sc-chips-row sc-chips-row--cat" role="group" aria-label="분류">
          {CATEGORIES.map(({ key, label }) => (
            <button key={key} type="button" className={`sc-pill sc-pill--cat${key === category ? ' is-on' : ''}`}
                    aria-pressed={key === category} onClick={() => { setCategory(key === category ? null : key); setShown(PAGE) }}>
              {label}
            </button>
          ))}
        </div>
        <div className="sc-apps" aria-hidden="true">
          {PLATFORMS.map((p) => <span key={p.key} className="sc-apps__i"><PlatformBadge platformKey={p.key} /></span>)}
        </div>
      </div>

      {failed && <p className="sc-msg">목록을 불러오지 못했어요. 새로고침해 주세요.</p>}
      {!rows && !failed && <p className="sc-msg">불러오는 중이에요.</p>}
      {rows && rows.length === 0 && <p className="sc-msg">보여드릴 브랜드가 없어요.</p>}
      {rows && (
        <ul className="sc-list">
          {rows.slice(0, shown).map((r) => <Row key={r.name} row={r} />)}
        </ul>
      )}
      {rows && rows.length > shown && (
        <button type="button" className="sc-more" onClick={() => setShown(shown + PAGE)}>더 보기</button>
      )}
    </main>
  )
}
