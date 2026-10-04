// 메인 화면 A/B 쿠폰 카드 쪽 행사 한 줄(설계 4단계): 위 배너 캐러셀 대신 목록 4번째 자리에 브랜드 줄과 같은 폭의
// 노란 한 줄. 여러 장이면 4초마다 다음 장으로 바뀐다(손을 올리거나 움직임 줄이기 설정이면 멈춘다).
// 계측은 위 배너와 같은 이벤트와 속성(banner_impression, banner_click, bannerProps)이고 position만 'list'다.
import { useEffect, useRef, useState } from 'react'
import { track } from './analytics.js'
import { bannerProps } from './bannerAnalytics.js'
import { bannerTag } from './bannerTag.js'
import { BrandLogo, platformIconSrc } from './logos.jsx'
import './styles/event-strip.css'

const ROTATE_MS = 4000

export default function EventStrip({ banners }) {
  const list = (banners ?? []).filter((b) => b.url)
  const [i, setI] = useState(0)
  const [hold, setHold] = useState(false)
  const ref = useRef(null)
  const seen = useRef(new Set())
  const b = list.length ? list[i % list.length] : null

  useEffect(() => {
    if (list.length < 2 || hold) return undefined
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const t = setInterval(() => setI((n) => n + 1), ROTATE_MS)
    return () => clearInterval(t)
  }, [list.length, hold])

  // 화면에 절반 이상 들어온 장만 노출로 센다(위 배너와 같은 규칙). 같은 장은 한 번.
  useEffect(() => {
    const el = ref.current
    if (!el || !b || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || seen.current.has(b.id)) return
      seen.current.add(b.id)
      track('banner_impression', { ...bannerProps(b), position: 'list', slot: (i % list.length) + 1 })
    }, { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [b?.id])

  if (!b) return null
  const tag = bannerTag(b)
  const name = b.brand ?? (b.brands?.length ? b.brands.join(', ') : '')
  const external = b.url.startsWith('http')
  return (
    <a ref={ref} className="event-strip" href={b.url} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}
       onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}
       onClick={() => track('banner_click', { ...bannerProps(b), position: 'list', slot: (i % list.length) + 1, external })}>
      <span className="event-strip__logo">
        {name ? <BrandLogo name={b.brand ?? b.brands[0]} size={36} /> : <img src={platformIconSrc(b.platform)} alt="" width="36" height="36" />}
      </span>
      <span className="event-strip__text">
        <span className="event-strip__top">
          {tag && <span className={`event-strip__tag event-strip__tag--${tag.kind}`}>{tag.label}</span>}
          <span className="event-strip__name">{name}{b.period ? <small>{b.period}</small> : null}</span>
        </span>
        <span className="event-strip__amt">{b.amount}</span>
      </span>
      {list.length > 1 && <span className="event-strip__count" aria-hidden="true">{(i % list.length) + 1}/{list.length}</span>}
      <svg className="event-strip__go" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </a>
  )
}
