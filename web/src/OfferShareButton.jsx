import { useEffect, useRef, useState } from 'react'
import { track } from './analytics.js'
import { deliverShare, sharedOfferKey, shareText, shareMethod } from './offerSharing.js'
import { createShortShareLink } from './shortShareLink.js'
import { initializeShareAttribution, randomShareId } from './shareAttribution.js'

export default function OfferShareButton({ offer, brandName, position, where, className = '' }) {
  const preparedRef = useRef(null)
  const prepare = () => {
    if (preparedRef.current) return preparedRef.current
    const prepared = { shareId: randomShareId(), url: null }
    prepared.promise = createShortShareLink(window.location.origin, brandName, offer, prepared.shareId)
      .then((url) => { prepared.url = url; return url })
    // 포인터가 지나가기만 한 경우에도 거부된 Promise가 전역 오류가 되지 않는다.
    prepared.promise.catch(() => { if (preparedRef.current === prepared) preparedRef.current = null })
    preparedRef.current = prepared
    return prepared
  }
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [fallback, setFallback] = useState(null)
  const [nativeSupported, setNativeSupported] = useState(false)
  const accessibleName = `${offer.firstCome ? '선착순 ' : ''}${shareText(brandName, offer).split('\n')[0]}`
  useEffect(() => { preparedRef.current = null }, [offer, brandName])
  useEffect(() => { setNativeSupported(typeof navigator.share === 'function') }, [])
  const send = async (e) => {
    e.stopPropagation()
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setResult(null)
    setFallback(null)
    let props
    try {
      const prepared = prepare()
      const shareId = prepared.shareId
      const method = 'native'
      const attribution = initializeShareAttribution()
      const parentShareId = attribution?.props().shareId
      props = { shareId, offerKey: sharedOfferKey(offer), brand: brandName,
        platform: offer.platform, position, where, method, action: 'share',
        ...(parentShareId ? { parentShareId } : {}) }
      attribution?.rememberOwn(shareId)
      try { track('offer_share_click', props) } catch { /* 계측 실패가 공유를 막지 않는다. */ }
      const url = prepared.url ?? await prepared.promise
      const data = { text: shareText(brandName, offer), url }
      const outcome = method === 'native' && shareMethod(navigator, data) !== 'native'
        ? 'failed' : await deliverShare(navigator, data, method)
      try { track('offer_share_result', { ...props, result: outcome }) } catch { /* 결과 안내 유지. */ }
      if (outcome !== 'failed') preparedRef.current = null
      if (outcome === 'failed') {
        setResult('공유 실패')
        setFallback(url)
      }
    } catch {
      if (props) {
        try { track('offer_share_result', { ...props, result: 'failed' }) } catch { /* 안내 유지. */ }
      }
      setResult('공유 실패')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  return (
    <div className={`offer-share ${className}`} onClick={(e) => e.stopPropagation()}>
      {nativeSupported && <button type="button" className="offer-share__button" disabled={busy}
        title="공유하기" aria-label={`${accessibleName} 공유하기`} onPointerDown={prepare} onFocus={prepare} onClick={send}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="5" r="3" />
          <circle cx="18" cy="19" r="3" />
        </svg>
      </button>}
      {result && <span role="status" className="offer-share__status">{result}</span>}
      {fallback && <input className="offer-share__url" aria-label="공유 링크" readOnly value={fallback}
        onFocus={(e) => e.target.select()} />}
    </div>
  )
}
