import { parseShareLink, sharedOfferKey } from './offerSharing.js'
import { optedOut } from './privacy.js'

const SESSION = 'dk_share_session'
const HISTORY = 'dk_share_history'
const OWN = 'dk_own_shares'
const read = (store, key) => {
  try { return JSON.parse(store?.getItem(key) ?? 'null') } catch { return null }
}
const write = (store, key, value) => {
  try { store?.setItem(key, JSON.stringify(value)) } catch { /* 저장소 실패는 공유를 막지 않는다. */ }
}
export function randomShareId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function createShareAttribution({ local, session, random = randomShareId,
  now = () => new Date().toISOString(), visitorStatus = 'unknown', entrySource = 'direct' }) {
  let active = null
  let currentHash = null
  const sent = new Set()
  const own = new Set(Array.isArray(read(local, OWN)) ? read(local, OWN) : [])
  const valid = (value) => value && typeof value.receivedAt === 'string'
    && parseShareLink(`#${new URLSearchParams({ share: value.shareId, brand: value.brand, offer: value.offerKey })}`)
  return {
    enter(hash) {
      if (hash === currentHash) return
      currentHash = hash
      const target = parseShareLink(hash)
      if (target) {
        active = { ...target, landingId: random(), receivedAt: now(), selfOpen: own.has(target.shareId),
          visitorStatus, entrySource: 'share', attributionType: 'share_session' }
        write(session, SESSION, active)
        if (!active.selfOpen) write(local, HISTORY, active)
      } else {
        const sameSession = read(session, SESSION)
        const history = read(local, HISTORY)
        const continuing = valid(sameSession) ? sameSession
          : active?.attributionType === 'share_session' ? active : null
        active = continuing ? { ...continuing, entrySource, attributionType: 'share_session' }
          : valid(history) ? { ...history, landingId: undefined, selfOpen: false, visitorStatus,
            entrySource, attributionType: 'prior_share' } : null
      }
    },
    rememberOwn(id) {
      own.add(id)
      write(local, OWN, [...own].slice(-100))
    },
    props() {
      return active ? { shareId: active.shareId, landingId: active.landingId,
        sharedOfferKey: active.offerKey, sharedBrand: active.brand, selfOpen: active.selfOpen,
        shareReceivedAt: active.receivedAt, visitorStatus,
        entrySource: active.entrySource, attributionType: active.attributionType } : {}
    },
    selection(offer, brand) {
      if (!active) return {}
      const key = sharedOfferKey(offer)
      return { offerKey: key, selectionRelation: brand !== active.brand ? 'other_brand'
        : key === active.offerKey ? 'shared_offer' : 'same_brand_other_offer' }
    },
    claim(stage, status = '') {
      if (!active?.landingId || active.entrySource !== 'share') return false
      const key = `${active.landingId}:${stage}:${status}`
      if (sent.has(key)) return false
      sent.add(key)
      return true
    },
  }
}

let browser
export function initializeShareAttribution() {
  if (typeof window === 'undefined' || !window.location || optedOut()) return null
  if (!browser) {
    let local, session, visitorStatus = 'unknown', entrySource = 'direct'
    try {
      local = window.localStorage
      visitorStatus = local.getItem('dk_visitor') ? 'returning' : 'new'
    } catch { /* 식별 불가. */ }
    try { session = window.sessionStorage } catch { /* 메모리만 사용. */ }
    try { if (document.referrer) entrySource = new URL(document.referrer).origin === window.location.origin ? 'internal' : 'external' } catch { /* 기본 분류 유지. */ }
    browser = createShareAttribution({ local, session, visitorStatus, entrySource })
  }
  browser.enter(window.location.hash)
  return browser
}

export function shareAnalyticsProps() { return initializeShareAttribution()?.props() ?? {} }
export function offerShareSelection(offer, brand) { return initializeShareAttribution()?.selection(offer, brand) ?? {} }
