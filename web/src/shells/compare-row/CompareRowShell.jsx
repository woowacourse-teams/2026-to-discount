// 홈 리뉴얼 시안: 브랜드 비교표(#233). 버리는 시안이라 병합하지 않는다.
import { useEffect, useMemo, useState } from 'react'
import { BrandLogo, PlatformBadge } from '../../logos.jsx'
import { PLATFORMS } from '../../platforms.js'
import { openWithNotice } from '../../offerLink.js'
import { CATEGORIES } from '../../filters.js'
import { buildRows, loadCompareRows } from './data.js'
import './compare-row.css'

function Cell({ cell }) {
  if (!cell.offer) return <div className="crow-cell crow-cell--none" aria-label="없음">-</div>
  const body = (
    <>
      <span className="crow-amount">{cell.amountText}</span>
      <span className="crow-min">{cell.min == null ? '최소주문 미확인' : cell.min === '최소주문 없음' ? cell.min : `${cell.min}원↑`}</span>
      {cell.chips.length > 0 && (
        <span className="crow-chips">{cell.chips.map((c, i) => <span key={i} className="crow-chip">{c.text}</span>)}</span>
      )}
    </>
  )
  const cls = `crow-cell${cell.isTop ? ' crow-cell--top' : ''}`
  if (!cell.href) return <div className={cls}>{body}</div>
  const web = cell.href.startsWith('http')
  return (
    <a className={cls} href={cell.href} target={web ? '_blank' : undefined} rel={web ? 'noopener noreferrer' : undefined}
      onClick={(e) => openWithNotice(e, cell.href)}>{body}</a>
  )
}

export default function CompareRowShell() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [cat, setCat] = useState(null)
  useEffect(() => { loadCompareRows().then(setData, () => setError(true)) }, [])
  const view = useMemo(() => data && (cat ? buildRows(data.brands, new Set([cat])) : data), [data, cat])

  return (
    <div className="crow">
      <header className="crow-head">
        <h1 className="crow-title">앱별 할인 비교</h1>
        {view?.stamp && <span className="crow-stamp">{view.stamp} 기준</span>}
      </header>
      <nav className="crow-cats">
        <button type="button" className={`crow-cat${cat ? '' : ' crow-cat--on'}`} onClick={() => setCat(null)}>전체</button>
        {CATEGORIES.map((c) => (
          <button key={c.key} type="button" className={`crow-cat${cat === c.key ? ' crow-cat--on' : ''}`} onClick={() => setCat(c.key)}>{c.label}</button>
        ))}
      </nav>
      <div className="crow-table" role="table">
        <div className="crow-row crow-row--head" role="row">
          <div className="crow-brand" />
          {PLATFORMS.map((p) => (
            <div key={p.key} className="crow-app"><PlatformBadge platformKey={p.key} /><span>{p.label}</span></div>
          ))}
        </div>
        {error && <p className="crow-empty">불러오기 실패</p>}
        {view?.rows.map((r) => (
          <div key={r.name} className="crow-row" role="row">
            <div className="crow-brand">
              <BrandLogo name={r.name} size={28} />
              <span className="crow-name">{r.shortName}</span>
              {r.stamp && <span className="crow-rowstamp">{r.stamp}</span>}
            </div>
            {r.cells.map((c) => <Cell key={c.platform} cell={c} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
