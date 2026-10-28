import { useEffect, useRef, useState } from 'react'
import { track } from './analytics.js'
import { createShareLink, deliverShare, sharedOfferKey, shareText, shareMethod } from './offerSharing.js'
import { initializeShareAttribution, randomShareId } from './shareAttribution.js'

export default function OfferShareButton({ offer, brandName, position, where, className = '', children }) {
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [fallback, setFallback] = useState(null)
  const [nativeSupported, setNativeSupported] = useState(false)
  const accessibleName = `${offer.firstCome ? '선착순 ' : ''}${shareText(brandName, offer).split('\n')[0]}`
  useEffect(() => { setNativeSupported(typeof navigator.share === 'function') }, [])
  const send = async (e, action) => {
    e.stopPropagation()
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setResult(null)
    setFallback(null)
    try {
      const shareId = randomShareId()
      const url = createShareLink(window.location.origin, brandName, offer, shareId)
      const text = shareText(brandName, offer)
      const data = { title: text.split('\n')[0], text, url }
      const method = action === 'copy' ? 'copy' : 'native'
      const attribution = initializeShareAttribution()
      const parentShareId = attribution?.props().shareId
      const props = { shareId, offerKey: sharedOfferKey(offer), brand: brandName,
        platform: offer.platform, position, where, method, action,
        ...(parentShareId ? { parentShareId } : {}) }
      attribution?.rememberOwn(shareId)
      try { track('offer_share_click', props) } catch { /* 계측 실패가 공유를 막지 않는다. */ }
      const outcome = method === 'native' && shareMethod(navigator, data) !== 'native'
        ? 'failed' : await deliverShare(navigator, data, method)
      try { track('offer_share_result', { ...props, result: outcome }) } catch { /* 결과 안내 유지. */ }
      if (outcome === 'copied') setResult('링크 복사 완료')
      if (outcome === 'failed') {
        setResult(method === 'copy' ? '링크 복사 실패' : '공유 실패')
        setFallback(url)
      }
    } catch {
      setResult(action === 'copy' ? '링크 복사 실패' : '공유 실패')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  return (
    <div className={`offer-share ${className}`} onClick={(e) => e.stopPropagation()}>
      {children}
      {nativeSupported && <button type="button" className="offer-share__button" disabled={busy}
        title="공유하기" aria-label={`${accessibleName} 공유하기`} onClick={(e) => send(e, 'share')}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V3m-4 4 4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
        </svg>
      </button>}
      <button type="button" className="offer-share__button" disabled={busy}
        title="링크 복사" aria-label={`${accessibleName} 링크 복사`} onClick={(e) => send(e, 'copy')}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M15 5V3H3v12h2" />
        </svg>
      </button>
      {result && <span role="status" className="offer-share__status">{result}</span>}
      {fallback && <input className="offer-share__url" aria-label="링크 복사" readOnly value={fallback}
        onFocus={(e) => e.target.select()} />}
    </div>
  )
}
