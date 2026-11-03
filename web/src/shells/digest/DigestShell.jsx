// 홈 리뉴얼 시안 "오늘 요약판(digest)" 껍데기(#259). 버리는 시안이라 병합하지 않는다.
// 컴포넌트는 filters.js, couponModel.js를 직접 부르지 않는다. 값은 data.js 한 곳에서 받는다.
import { useEffect, useMemo, useState } from 'react'
import { fetchBanners, fetchBrands } from '../../api.js'
import { openWithNotice, setHubLinks } from '../../offerLink.js'
import { digestOf } from './data.js'
import './digest.css'

const TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
})

// "갱신 M월 D일 HH:mm"(한국 시각). 시각을 모르면 빈 칸으로 두지 않고 그렇다고 적는다.
function stamp(capturedAt) {
  const t = capturedAt ? Date.parse(capturedAt) : NaN
  if (!Number.isFinite(t)) return '갱신 시각 알 수 없음'
  const p = Object.fromEntries(TIME.formatToParts(new Date(t)).map((x) => [x.type, x.value]))
  const hour = p.hour === '24' ? '00' : p.hour
  return `갱신 ${p.month}월 ${p.day}일 ${hour}:${p.minute}`
}

const TILE_NAMES = { today: '오늘 할인', top: '최고 금액', fresh: '새로 생김' }

function Go({ href, className, children, ...rest }) {
  const web = href.startsWith('http')
  return (
    <a className={className} href={href} {...rest}
       target={web ? '_blank' : undefined} rel={web ? 'noreferrer' : undefined}
       onClick={(e) => openWithNotice(e, href)}>
      {children}
    </a>
  )
}

function Tile({ id, big, active, onPick }) {
  return (
    <button type="button" className={`dg-tile${active ? ' dg-tile--on' : ''}`} aria-pressed={active} onClick={() => onPick(id)}>
      <b className="dg-tile__num">{big}</b>
      <span className="dg-tile__name">{TILE_NAMES[id]}</span>
    </button>
  )
}

function Card({ card }) {
  const { best } = card
  return (
    <li className={`dg-card${card.highlight ? ' dg-card--top' : ''}`}>
      <div className="dg-card__head">
        <span className="dg-card__name">{card.name}</span>
        <span className="dg-card__app">{best.platformLabel}</span>
      </div>
      <div className="dg-card__amt">
        {best.soldOut ? <s>{best.amountText}</s> : best.amountText}
        {best.soldOut && <em className="dg-soldout">품절</em>}
      </div>
      <div className="dg-card__cond">
        {best.chips.map((c) => <span key={`${c.kind}:${c.text}`} className="dg-chip">{c.text}</span>)}
        <span className="dg-min">{best.minText}</span>
      </div>
      <div className="dg-card__foot">
        <ul className="dg-cells">
          {card.cells.map((c) => (
            <li key={c.platform}>
              {c.href
                ? <Go href={c.href} className="dg-cell" aria-label={`${card.name} ${c.label} ${c.amountText}`}>
                    <small>{c.label}</small>
                    {c.soldOut ? <s>{c.amountText}</s> : <span>{c.amountText}</span>}
                  </Go>
                : <span className="dg-cell dg-cell--none" aria-label={`${card.name} ${c.label} 오퍼 없음`}>
                    <small>{c.label}</small>
                    <span>-</span>
                  </span>}
            </li>
          ))}
        </ul>
        <Go href={best.href} className="dg-go">쿠폰 받으러 가기</Go>
      </div>
    </li>
  )
}

export default function DigestShell() {
  const [brands, setBrands] = useState(null)
  const [failed, setFailed] = useState(false)
  const [hubReady, setHubReady] = useState(false)
  const [selection, setSelection] = useState(null)

  useEffect(() => {
    let live = true
    fetchBrands().then((b) => { if (live) setBrands(b) }).catch(() => { if (live) setFailed(true) })
    // 쿠팡이츠 허브 링크는 배너에서 온다. 못 받아도 목록은 그린다.
    fetchBanners().then((b) => { setHubLinks(b); if (live) setHubReady(true) }).catch(() => {})
    return () => { live = false }
  }, [])

  // 칸 숫자는 선택과 무관하게 같은 값이라 선택이 바뀔 때만 목록을 다시 만든다. hubReady는 링크를 다시 풀기 위한 의존성.
  const view = useMemo(() => (brands ? digestOf(brands, selection) : null), [brands, selection, hubReady]) // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (id) => setSelection((cur) => (cur === id ? null : id))

  return (
    <div className="dg">
      <header className="dg-head">
        <span className="dg-head__title">오늘의 배달앱 할인</span>
        <span className="dg-head__time">{view ? stamp(view.capturedAt) : '불러오는 중'}</span>
      </header>
      {failed && <p className="dg-msg" role="alert">할인 정보를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>}
      {!failed && !view && <p className="dg-msg">불러오는 중</p>}
      {view && (
        <>
          <div className="dg-tiles">
            <Tile id="today" big={`${view.tiles.today.count}곳`} active={selection === 'today'} onPick={pick} />
            <Tile id="top" big={view.tiles.top.amount != null ? `${view.tiles.top.amount.toLocaleString('ko-KR')}원` : '-'} active={selection === 'top'} onPick={pick} />
            <Tile id="fresh" big={`${view.tiles.fresh.count}곳`} active={selection === 'fresh'} onPick={pick} />
          </div>
          {selection && <p className="dg-basis">지금 보는 기준: {TILE_NAMES[selection]} · {view.cards.length}곳</p>}
          {view.cards.length === 0
            ? <p className="dg-msg">조건에 맞는 할인이 없어요.</p>
            : <ul className="dg-list">{view.cards.map((c) => <Card key={c.name} card={c} />)}</ul>}
        </>
      )}
    </div>
  )
}
