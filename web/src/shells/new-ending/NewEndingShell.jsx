// 시안 new-ending(#236). 병합하지 않는 껍데기. 문구는 설계 §8 초안.
import { useCallback, useEffect, useState } from 'react'
import { loadNewEnding } from './data.js'
import { shortBrandName } from '../../couponModel.js'
import { COUPANGEATS_HINT, openWithNotice } from '../../offerLink.js'
import { BrandLogo, PlatformBadge } from '../../logos.jsx'
import './new-ending.css'

const kst = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString()

function checkedText(iso) {
  const k = kst(iso)
  const today = kst(new Date().toISOString()).slice(0, 10) === k.slice(0, 10)
  const hm = k.slice(11, 16)
  return `마지막 확인 ${today ? '오늘' : k.slice(5, 10).replace('-', '.')} ${hm}`
}

function Card({ card, ending }) {
  const { brand, offer, href, amount, min, chips, note, endsLabel } = card
  const web = href.startsWith('http')
  return (
    <a className="ne-card" href={href} target={web ? '_blank' : undefined} rel={web ? 'noreferrer' : undefined}
      onClick={(e) => openWithNotice(e, href, { offerPrompt: true })}>
      {ending && <span className="ne-ends">{endsLabel}</span>}
      <span className="ne-brand">
        <BrandLogo name={brand.name} size={40} />
        <span className="ne-name">{shortBrandName(brand)}</span>
      </span>
      <span className="ne-app"><PlatformBadge platformKey={offer.platform} /></span>
      <strong className="ne-amount">{amount}</strong>
      <span className="ne-min">{min}</span>
      {chips.length > 0 && <span className="ne-chips">{chips.map((c) => <span key={c.kind + c.text} className="ne-chip">{c.text}</span>)}</span>}
      {note && <span className="ne-note" title={note}>{note}</span>}
      {offer.platform === 'coupangeats' && <span className="ne-hint">{COUPANGEATS_HINT}</span>}
    </a>
  )
}

function Row({ title, cards, empty, ending }) {
  return (
    <section className="ne-row">
      <h2 className="ne-row__title">{title} <span className="ne-count">{cards.length}</span></h2>
      {cards.length === 0
        ? <p className="ne-empty">{empty}</p>
        : <div className="ne-track">{cards.map((c) => <Card key={c.key} card={c} ending={ending} />)}</div>}
    </section>
  )
}

export default function NewEndingShell() {
  const [state, setState] = useState({ status: 'loading' })
  const load = useCallback(() => {
    setState({ status: 'loading' })
    loadNewEnding()
      .then((data) => setState(data.counts.offers > 0 ? { status: 'ok', data } : { status: 'error' }))
      .catch(() => setState({ status: 'error' }))
  }, [])
  useEffect(load, [load])

  if (state.status === 'loading') return <main className="ne" aria-busy="true" />
  if (state.status === 'error') {
    return (
      <main className="ne ne--error">
        <p>불러오지 못했어요</p>
        <button type="button" className="ne-retry" onClick={load}>다시 시도</button>
      </main>
    )
  }
  const { fresh, ending, lastChecked, counts } = state.data
  return (
    <main className="ne">
      <header className="ne-head">
        <h1 className="ne-title">오늘의 할인</h1>
        {lastChecked && <span className="ne-checked">{checkedText(lastChecked)}</span>}
      </header>
      <Row title="새로 생김" cards={fresh} empty="새로 생긴 할인이 아직 없어요" />
      <Row title="곧 끝남" cards={ending} ending
        empty={`종료일이 알려진 할인 ${counts.withExpiry}개 중 곧 끝나는 것이 없어요`} />
    </main>
  )
}
