import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrandLogo } from '../../logos.jsx'
import { openWithNotice } from '../../offerLink.js'
import { useBackClose } from '../../backClose.js'
import { categoryTiles, kstStamp, loadHome, newestCaptured, rowsOf } from './data.js'

// 링크 속성. 커스텀 스킴(baemin://)은 새 탭에서 열면 앱이 안 열려 target을 주지 않는다(OfferChip과 같다).
function linkProps(href) {
  const web = href.startsWith('http')
  return {
    href,
    target: web ? '_blank' : undefined,
    rel: web ? 'noopener noreferrer' : undefined,
    onClick: (e) => openWithNotice(e, href),
  }
}

function Stamp({ iso }) {
  const t = kstStamp(iso)
  return t ? <span className="cg-stamp">{t} 기준</span> : null
}

function Terms({ platform, minOrder, chips }) {
  const parts = [platform, minOrder, ...chips.slice(0, 2)].filter(Boolean)
  return parts.length ? <p className="cg-terms">{parts.join(' · ')}</p> : null
}

function Tile({ tile, onPick }) {
  return (
    <li className="cg-tile">
      <button type="button" className="cg-tile__main" onClick={() => onPick(tile.key)}>
        <span className="cg-tile__top">
          <span className="cg-tile__label">{tile.label}</span>
          {tile.brandName && <BrandLogo name={tile.brandName} size={36} />}
        </span>
        {tile.amount ? (
          <>
            <span className="cg-amount">{tile.amount}</span>
            <span className="cg-brand">{tile.brandName}</span>
            <Terms platform={tile.platform} minOrder={tile.minOrder} chips={tile.chips} />
          </>
        ) : (
          <span className="cg-amount cg-amount--none">-</span>
        )}
        <span className="cg-tile__foot">
          <span className="cg-count">{tile.count}곳</span>
          <Stamp iso={tile.capturedAt} />
        </span>
      </button>
      {tile.href && <a className="cg-go" {...linkProps(tile.href)}>쿠폰 받으러 가기</a>}
    </li>
  )
}

function Row({ row }) {
  const body = (
    <>
      <BrandLogo name={row.name} size={40} />
      <span className="cg-row__body">
        <span className="cg-row__name">{row.name}</span>
        {row.amount ? <span className="cg-amount">{row.amount}</span> : <span className="cg-amount cg-amount--none">-</span>}
        {row.amount && <Terms platform={row.platform} minOrder={row.minOrder} chips={row.chips} />}
        <Stamp iso={row.capturedAt} />
      </span>
    </>
  )
  return (
    <li className="cg-row">
      {row.href ? <a className="cg-row__link" {...linkProps(row.href)}>{body}</a> : <div className="cg-row__link">{body}</div>}
    </li>
  )
}

function Skeleton() {
  return (
    <ul className="cg-grid" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => <li key={i} className="cg-tile cg-tile--skeleton" />)}
    </ul>
  )
}

export default function CategoryGridShell() {
  const [brands, setBrands] = useState(null)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState(null)

  const load = useCallback(() => {
    setError(false)
    setBrands(null)
    loadHome().then(setBrands).catch(() => setError(true))
  }, [])
  useEffect(load, [load])

  const close = useCallback(() => setSelected(null), [])
  useBackClose(selected != null, close)

  const tiles = useMemo(() => (brands ? categoryTiles(brands) : []), [brands])
  const rows = useMemo(() => (brands && selected ? rowsOf(brands, selected) : []), [brands, selected])
  const stamp = kstStamp(newestCaptured(tiles))
  const current = tiles.find((t) => t.key === selected)

  return (
    <main className="cg">
      {selected && brands ? (
        <>
          <header className="cg-head">
            <button type="button" className="cg-back" onClick={close}>← 카테고리</button>
            <h1 className="cg-title">{current?.label}</h1>
            <span className="cg-count">{rows.length}곳</span>
          </header>
          {rows.length === 0
            ? <p className="cg-empty">지금 받을 수 있는 쿠폰이 없어요</p>
            : <ul className="cg-list">{rows.map((r) => <Row key={r.name} row={r} />)}</ul>}
        </>
      ) : (
        <>
          <header className="cg-head">
            <h1 className="cg-title">배달앱 할인 모아보기</h1>
            {stamp && <span className="cg-stamp">{stamp} 기준</span>}
          </header>
          {error && (
            <div className="cg-error" role="alert">
              <p>불러오지 못했어요</p>
              <button type="button" onClick={load}>다시 시도</button>
            </div>
          )}
          {!error && !brands && <Skeleton />}
          {brands && (tiles.length === 0
            ? <p className="cg-empty">지금 받을 수 있는 쿠폰이 없어요</p>
            : <ul className="cg-grid">{tiles.map((t) => <Tile key={t.key} tile={t} onPick={setSelected} />)}</ul>)}
        </>
      )}
    </main>
  )
}
