import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { MEMBERSHIP_LABEL, isBundle } from './filters.js'
import { PLATFORM_BY_KEY, OWN, OWN_LABEL } from './platforms.js'

const FIELDS = ['platform', 'amount', 'qualifier', 'rawText', 'minOrderAmount', 'tierMode',
  'conditions', 'expiresAt', 'badge', 'membership', 'firstCome', 'certainty', 'kind']
const TIER_FIELDS = ['minOrder', 'amount', 'percent', 'cap', 'channel', 'expiresAt', 'note', 'membership']
const values = (value, fields) => fields.map((key) => value[key] ?? null)
const keys = new WeakMap()

// offerKey는 같은 플랫폼 칸에 매일 재사용된다. 내용이 바뀐 혜택으로
// 조용히 이동하지 않도록 공유 당시의 금액과 조건까지 식별한다.
export function sharedOfferKey(offer) {
  if (!keys.has(offer)) {
    const identity = JSON.stringify([values(offer, FIELDS),
      (offer.tiers ?? []).map((t) => JSON.stringify(values(t, TIER_FIELDS))).sort()])
    keys.set(offer, `v1_${bytesToHex(sha256(new TextEncoder().encode(identity)))}`)
  }
  return keys.get(offer)
}

const ID = /^[a-f0-9]{32}$/
const KEY = /^v1_[a-f0-9]{64}$/
export function parseShareLink(hash) {
  if (!hash?.startsWith('#share=')) return null
  const p = new URLSearchParams(hash.slice(1))
  if (['share', 'brand', 'offer'].some((key) => p.getAll(key).length !== 1)) return null
  const shareId = p.get('share'), brand = p.get('brand'), offerKey = p.get('offer')
  if (!ID.test(shareId) || !KEY.test(offerKey) || !brand?.trim() || brand.length > 120) return null
  return { shareId, brand, offerKey }
}

export function createShareLink(origin, brand, offer, shareId) {
  if (!ID.test(shareId)) throw new Error('Invalid share ID')
  const url = new URL('/', origin)
  url.hash = new URLSearchParams({ share: shareId, brand, offer: sharedOfferKey(offer) }).toString()
  return url.href
}

export function resolveSharedOffer(brands, target, today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })) {
  const brand = brands.find((b) => b.name === target.brand)
  const offer = brand?.offers.find((o) => sharedOfferKey(o) === target.offerKey)
  if (!offer) return { status: 'not_found' }
  if (offer.expiresAt && offer.expiresAt < today) return { status: 'expired' }
  return { status: 'available', brand, offer, key: target.offerKey }
}

export function shareText(brand, offer) {
  const won = (n) => `${n.toLocaleString('ko-KR')}원`
  const platform = PLATFORM_BY_KEY[offer.platform]?.label ?? (offer.platform === OWN ? OWN_LABEL : '')
  let benefit = offer.amount != null && !isBundle(offer) ? `${won(offer.amount)} 할인` : offer.rawText ?? ''
  if (['최대', '랜덤', '특정메뉴'].includes(offer.qualifier) && !benefit.startsWith(offer.qualifier)) benefit = `${offer.qualifier} ${benefit}`
  const membership = offer.membership && offer.membership !== 'none' ? MEMBERSHIP_LABEL[offer.platform] : null
  const minimum = offer.minOrderAmount > 0 ? `${won(offer.minOrderAmount)} 이상 주문 시` : null
  // 구간에만 적용되는 멤버십이나 채널 조건도 공유 메시지에서 빠뜨리지 않는다.
  const tierConditions = (offer.tiers ?? []).map((t) => {
    const parts = [t.percent != null ? `${t.percent}% 할인` : t.amount != null ? won(t.amount) : null,
      t.cap != null ? `최대 ${won(t.cap)}` : null,
      t.minOrder != null ? `${won(t.minOrder)} 이상` : null, t.channel,
      t.membership && t.membership !== 'none' ? MEMBERSHIP_LABEL[offer.platform] ?? t.membership : null,
      t.note, t.soldOut ? '품절' : null, t.expiresAt ? `~${t.expiresAt}` : null]
    return parts.filter(Boolean).join(' / ')
  })
  const details = [membership, offer.badge, offer.conditions, offer.firstCome ? '선착순' : null, offer.soldOut ? '품절' : null,
    ...((offer.tiers?.length > 1 || offer.tiers?.some((t) => t.channel || t.membership || t.note || t.percent != null || t.expiresAt)) ? tierConditions : []),
    offer.expiresAt ? `~${offer.expiresAt}` : null]
  return [`${brand} ${platform} ${benefit}`.replace(/\s+/g, ' ').trim(), minimum,
    ...new Set(details.filter(Boolean))].filter(Boolean).join('\n')
}

export function shareMethod(nav, data) {
  try { return typeof nav.share === 'function' && (!nav.canShare || nav.canShare(data)) ? 'native' : 'copy' }
  catch { return 'copy' }
}

export async function deliverShare(nav, data, method) {
  try {
    if (method === 'native') { await nav.share(data); return 'resolved' }
    await nav.clipboard.writeText(data.url)
    return 'copied'
  } catch (error) {
    return method === 'native' && error?.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}
