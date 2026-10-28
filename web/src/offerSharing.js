import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { MEMBERSHIP_LABEL, isBundle } from './filters.js'
import { PLATFORM_BY_KEY, OWN, OWN_LABEL } from './platforms.js'
import { channelOf, membershipOf } from './couponModel.js'

const FIELDS = ['platform', 'amount', 'qualifier', 'rawText', 'minOrderAmount', 'tierMode',
  'conditions', 'expiresAt', 'badge', 'membership', 'firstCome', 'certainty', 'kind']
const TIER_FIELDS = ['minOrder', 'amount', 'percent', 'cap', 'channel', 'expiresAt', 'note', 'membership']
const values = (value, fields) => fields.map((key) => value[key] ?? null)
const keys = new WeakMap()

// offerKey는 같은 플랫폼 칸에 매일 재사용된다. 내용이 바뀐 혜택으로
// 조용히 이동하지 않도록 공유 당시의 금액과 조건까지 식별한다.
export function sharedOfferKey(offer) {
  if (!keys.has(offer)) {
    const parts = [values(offer, FIELDS),
      (offer.tiers ?? []).map((t) => JSON.stringify(values(t, TIER_FIELDS))).sort()]
    if (offer.qualifiers?.length) parts.push([...new Set(offer.qualifiers)].sort())
    const identity = JSON.stringify(parts)
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
  // API 한 오퍼에는 다른 채널과 금액의 구간도 담긴다. 공유 대상은 카드에
  // 표시된 대표 금액과 최소주문에 맞는 구간 하나다. 중복 할인은 합계 자체다.
  const candidates = !isBundle(offer) && offer.tierMode !== 'cumulative'
    ? (offer.tiers ?? []).filter((t) => (t.amount ?? t.cap) === offer.amount) : []
  const selected = candidates.find((t) => t.minOrder === offer.minOrderAmount) ?? candidates[0]
  const row = selected ?? offer
  const platform = PLATFORM_BY_KEY[offer.platform]?.label ?? (offer.platform === OWN ? OWN_LABEL : '')
  const channel = selected?.channel ?? channelOf(offer)
  let benefit = row.percent != null ? `${row.percent}% 할인${row.cap != null ? ` (최대 ${won(row.cap)})` : ''}`
    : offer.amount != null && !isBundle(offer) ? `${won(offer.amount)} 할인` : offer.rawText ?? ''
  if (['최대', '랜덤', '특정메뉴'].includes(offer.qualifier) && !benefit.startsWith(offer.qualifier)) benefit = `${offer.qualifier} ${benefit}`
  const member = membershipOf(offer, selected)
  const membership = member ? MEMBERSHIP_LABEL[offer.platform] ?? '멤버십' : ''
  const min = selected?.minOrder ?? offer.minOrderAmount
  const minimum = min === 0 ? '최소주문 없음' : min > 0 ? `${won(min)} 이상 주문 시` : ''
  const headline = `${platform} ${brand} ${channel ?? ''} ${benefit}${membership ? ` (${membership} 전용)` : ''}`.replace(/\s+/g, ' ').trim()
  return [headline, minimum].filter(Boolean).join('\n')
}

function nativeShareData(data) {
  // URL을 별도 필드로 보내면 메신저가 본문 앞에 붙이기도 한다.
  // 한 텍스트로 전달해 링크를 항상 본문의 마지막 줄에 둔다.
  // title도 함께 보내면 일부 공유 앱은 제목을 본문 앞에 한 번 더 넣는다.
  return { text: [data.text, data.url].filter(Boolean).join('\n') }
}

export function shareMethod(nav, data) {
  try { return typeof nav.share === 'function' && (!nav.canShare || nav.canShare(nativeShareData(data))) ? 'native' : 'copy' }
  catch { return 'copy' }
}

export async function deliverShare(nav, data, method) {
  try {
    if (method === 'native') { await nav.share(nativeShareData(data)); return 'resolved' }
    await nav.clipboard.writeText(data.url)
    return 'copied'
  } catch (error) {
    return method === 'native' && error?.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}
