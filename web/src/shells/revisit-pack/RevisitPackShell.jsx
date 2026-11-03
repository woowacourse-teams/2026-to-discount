import { useEffect, useMemo, useState } from 'react'
import { fetchBanners, fetchBrands } from '../../api.js'
import { setHubLinks } from '../../offerLink.js'
import { AlertCard, BrandPill, ListCard, NewCard } from './Cards.jsx'
import { agoText, cardOf, isStale, listOf, myBrands, newOffers, overallCaptured, readSaved, writeSaved } from './data.js'
import './revisit-pack.css'

export default function RevisitPackShell() {
  const [brands, setBrands] = useState(null)
  const [error, setError] = useState(false)
  const [saved, setSaved] = useState([])
  const [now] = useState(() => Date.now())

  useEffect(() => {
    // 이 화면은 쿠폰 카드 CSS를 안 쓴다. 다만 App을 뺀 번들에서 이 조각이 사라지면
    // scripts/ssr-template.mjs가 coupon-card-*.css를 못 찾아 빌드가 깨진다. 조각이 남게만 한다.
    import('../../styles/coupon-card.css')
    setSaved(readSaved())
    fetchBanners().then(setHubLinks).catch(() => {})
    fetchBrands().then(setBrands).catch(() => setError(true))
  }, [])

  const toggleSave = (name) => {
    setSaved((cur) => {
      const next = cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]
      writeSaved(next)
      return next
    })
  }

  const view = useMemo(() => {
    if (!brands) return null
    const mine = myBrands(brands, saved)
    return {
      mine: { filled: mine.filled, cards: mine.brands.map(cardOf) },
      fresh: newOffers(brands).map((item) => ({ item, card: cardOf(item.brand) })),
      list: listOf(brands).map(cardOf),
      captured: overallCaptured(brands),
    }
  }, [brands, saved])

  const ago = view && agoText(view.captured, now)

  return (
    <main className="rp">
      <header className="rp-top">
        <h1 className="rp-top__title">배달앱 할인모음</h1>
        {ago && <span className={`rp-ago${isStale(view.captured, now) ? ' rp-ago--stale' : ''}`}>{ago} 갱신</span>}
      </header>
      {error && <p className="rp-error">불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>}
      {!view && !error && <p className="rp-loading">불러오는 중</p>}
      {view && (
        <>
          {view.mine.cards.length > 0 && (
            <section className="rp-sec">
              <h2 className="rp-sec__title">{view.mine.filled ? '요즘 많이 보는 브랜드' : '내 브랜드'}</h2>
              <div className="rp-row">
                {view.mine.cards.map((c) => <BrandPill key={c.name} card={c} now={now} />)}
              </div>
            </section>
          )}
          {view.fresh.length > 0 && (
            <section className="rp-sec">
              <h2 className="rp-sec__title">어제 이후 새로 생긴 것</h2>
              <div className="rp-news">
                {view.fresh.map(({ item, card }) => <NewCard key={item.brand.name} item={item} card={card} now={now} />)}
              </div>
            </section>
          )}
          <section className="rp-sec">
            {view.list.map((c) => <ListCard key={c.name} card={c} saved={saved.includes(c.name)} onToggleSave={toggleSave} now={now} />)}
            <AlertCard />
          </section>
        </>
      )}
    </main>
  )
}
