import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from './analytics.js'
import { parseShareLink, resolveSharedOffer } from './offerSharing.js'
import { initializeShareAttribution } from './shareAttribution.js'

export function useSharedOffer(brands, onUnavailable) {
  const [target, setTarget] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [notice, setNotice] = useState(null)
  const lastHash = useRef(null)
  useEffect(() => {
    const sync = () => {
      // 시트를 닫는 뒤로 가기도 popstate를 낸다. 주소가 그대로면 새 유입이 아니다.
      if (lastHash.current === window.location.hash) return
      lastHash.current = window.location.hash
      const next = parseShareLink(window.location.hash)
      setTarget(next)
      setDismissed(false)
      setNotice(null)
      if (!next && window.location.hash.startsWith('#share=')) {
        setNotice('혜택을 찾을 수 없음')
        onUnavailable()
      }
      if (next && initializeShareAttribution()?.claim('landing')) {
        try { track('offer_share_landing', { brand: next.brand, offerKey: next.offerKey }) } catch { /* 이동 유지. */ }
      }
    }
    sync()
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [onUnavailable])
  const resolved = target && brands ? resolveSharedOffer(brands, target) : null
  const status = resolved?.status
  useEffect(() => {
    if (!resolved || status === 'available') return
    if (initializeShareAttribution()?.claim('target', status)) {
      try { track('offer_share_target_view', { targetStatus: status, offerKey: target.offerKey, brand: target.brand }) } catch { /* 안내 유지. */ }
    }
    setNotice(status === 'expired' ? '종료된 혜택' : '혜택을 찾을 수 없음')
    setTarget(null)
    onUnavailable()
  }, [target, brands, status, onUnavailable])
  const onVisible = useCallback(() => {
    if (target && initializeShareAttribution()?.claim('target', 'available')) {
      try { track('offer_share_target_view', { targetStatus: 'available', offerKey: target.offerKey, brand: target.brand }) } catch { /* 표시 유지. */ }
    }
  }, [target])
  return { shared: !dismissed && status === 'available' ? resolved : null, notice, onVisible,
    dismiss: useCallback(() => setDismissed(true), []) }
}
