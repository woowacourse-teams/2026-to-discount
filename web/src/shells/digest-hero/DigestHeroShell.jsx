// 홈 리뉴얼 시안 digest-hero(#282): 요약 3칸 → 오늘 최고 할인 한 장 → 목록. 병합하지 않는 시안.
import { useEffect, useMemo, useState } from 'react'
import { fetchBanners, fetchBrands } from '../../api.js'
import { openWithNotice, setHubLinks } from '../../offerLink.js'
import { BrandLogo } from '../../logos.jsx'
import { buildDigestHero, capturedLabel, kstDay } from './data.js'
import './digest-hero.css'

const won = (n) => (n == null ? '-' : `${n.toLocaleString('ko-KR')}원`)

function GoButton({ main, className }) {
  const { href } = main
  if (!href) return <span className={`${className} dh-go--off`} aria-disabled="true">쿠폰 받으러 가기</span>
  return (
    <a className={className} href={href} onClick={(e) => openWithNotice(e, href)}>
      쿠폰 받으러 가기
    </a>
  )
}

function Chips({ chips }) {
  return chips.map((c) => <span key={`${c.kind}-${c.text}`} className="dh-chip">{c.text}</span>)
}

function Conditions({ main, time }) {
  return (
    <p className="dh-cond">
      <span>{main.minText}</span>
      <Chips chips={main.chips} />
      {main.note && <span className="dh-note">{main.note}</span>}
      {time && <span className="dh-time">{time} 기준</span>}
    </p>
  )
}

function Hero({ hero, time }) {
  return (
    <section className="dh-hero" aria-label="오늘 최고 할인">
      <p className="dh-hero__head">오늘 최고 할인</p>
      <div className="dh-hero__brand">
        <BrandLogo name={hero.logoName} size={36} />
        <strong>{hero.shortName}</strong>
        <span className="dh-app">{hero.main.platformLabel}</span>
      </div>
      <p className="dh-hero__amount">{hero.main.amount}<small> 할인</small></p>
      <Conditions main={hero.main} time={time} />
      <GoButton main={hero.main} className="dh-go" />
    </section>
  )
}

function AppCell({ cell }) {
  let body
  if (cell.state === 'none') body = <span className="dh-none">-</span>
  else {
    const amount = cell.amount || '금액 미확인'
    body = (
      <>
        <span className={cell.state === 'unknown' ? 'dh-unknown' : 'dh-amt'}>{cell.soldOut ? `${amount} 품절` : amount}</span>
        {cell.chips.map((c) => <em key={c.kind} className="dh-q">{c.text}</em>)}
      </>
    )
  }
  return (
    <li className="dh-app-cell">
      <span className="dh-app-cell__label">{cell.label}</span>
      {body}
    </li>
  )
}

function Row({ row, time }) {
  return (
    <li className="dh-row">
      <div className="dh-row__top">
        <BrandLogo name={row.logoName} size={32} />
        <strong className="dh-row__name">{row.shortName}</strong>
        <span className="dh-row__best">{row.main.amount}</span>
        <GoButton main={row.main} className="dh-row__go" />
      </div>
      <ul className="dh-apps">{row.apps.map((c) => <AppCell key={c.key} cell={c} />)}</ul>
      <Conditions main={row.main} time={time} />
    </li>
  )
}

function Skeleton() {
  return (
    <div aria-busy="true">
      <div className="dh-summary dh-skel" />
      <div className="dh-hero dh-skel dh-skel--hero" />
    </div>
  )
}

export default function DigestHeroShell({ initial }) {
  const [brands, setBrands] = useState(initial?.brands ?? null)
  const [failed, setFailed] = useState(false)
  const [tries, setTries] = useState(0)
  // 오늘은 브라우저에서만 안다. 첫 렌더는 날짜 없이 HH:mm만 그려 하이드레이션이 맞게 한다.
  const [today, setToday] = useState(null)

  useEffect(() => { setToday(kstDay(new Date())) }, [])
  useEffect(() => { fetchBanners().then(setHubLinks).catch(() => {}) }, [])
  useEffect(() => {
    if (tries === 0 && initial?.brands) return undefined
    let alive = true
    setFailed(false)
    fetchBrands().then((got) => { if (alive) setBrands(got) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [tries, initial])

  const { summary, hero, rows } = useMemo(() => buildDigestHero(brands), [brands])
  const label = (row) => capturedLabel(row.capturedAt, today)

  if (failed && !brands) {
    return (
      <main className="dh">
        <p className="dh-state">불러오지 못했어요</p>
        <button type="button" className="dh-retry" onClick={() => setTries((n) => n + 1)}>다시 시도</button>
      </main>
    )
  }
  if (!brands) return <main className="dh"><Skeleton /></main>

  return (
    <main className="dh">
      <dl className="dh-summary">
        <div><dt>오늘 할인</dt><dd>{summary ? `${summary.count}곳` : '0곳'}</dd></div>
        <div><dt>최고 금액</dt><dd>{won(summary?.best)}</dd></div>
        <div><dt>새로 생김</dt><dd>{summary ? `${summary.fresh}곳` : '0곳'}</dd></div>
      </dl>
      {!hero && <p className="dh-state">오늘 표시할 할인이 없어요</p>}
      {hero && <Hero hero={hero} time={label(hero)} />}
      {rows.length > 0 && (
        <ul className="dh-list">
          {rows.map((r) => <Row key={r.name} row={r} time={label(r)} />)}
        </ul>
      )}
    </main>
  )
}
