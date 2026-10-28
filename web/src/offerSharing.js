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

export function shareText(brand, offer, { year = Number(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 4)) } = {}) {
  const won = (n) => `${n.toLocaleString('ko-KR')}원`
  const minimum = (n) => n === 0 ? '최소주문 없음' : n > 0 ? `${won(n)} 이상 주문 시` : ''
  const until = (date) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '')
    return m ? `${Number(m[1]) === year ? '' : `${m[1]}년 `}${Number(m[2])}월 ${Number(m[3])}일까지` : date ?? ''
  }
  const member = (value) => value && value !== 'none' ? MEMBERSHIP_LABEL[offer.platform] ?? value : ''
  const benefit = (value) => {
    let text = value.percent != null ? `${value.percent}% 할인${value.cap != null ? ` (최대 ${won(value.cap)})` : ''}`
      : value.amount != null && !isBundle(offer) ? `${won(value.amount)} 할인` : offer.rawText ?? ''
    if (['최대', '랜덤', '특정메뉴'].includes(offer.qualifier) && !text.startsWith(offer.qualifier)) text = `${offer.qualifier} ${text}`
    return text
  }
  const platform = PLATFORM_BY_KEY[offer.platform]?.label ?? (offer.platform === OWN ? OWN_LABEL : '')
  const tiers = offer.tiers ?? []
  const expanded = !isBundle(offer) && offer.tierMode !== 'cumulative'
    && (tiers.length > 1 || tiers.some((t) => t.channel || t.membership || t.note || t.percent != null || t.expiresAt))
  const rows = expanded ? tiers : [offer]
  const minOf = (t) => t === offer ? offer.minOrderAmount
    : t.minOrder ?? (t.amount === offer.amount ? offer.minOrderAmount : null)
  const memOf = (t) => member(t.membership && t.membership !== 'none' ? t.membership : offer.membership)
  const commonMin = rows.every((t) => minOf(t) === minOf(rows[0])) ? minOf(rows[0]) : null
  const commonMember = rows.every((t) => memOf(t) === memOf(rows[0])) ? memOf(rows[0]) : ''
  // 구간을 본문으로 표시할 때 대표 금액을 다시 나열하지 않는다.
  const lines = rows.map((t) => {
    const terms = [commonMin == null ? minimum(minOf(t)) : '',
      !commonMember ? memOf(t) : '', t.note && t.note !== offer.conditions ? t.note : '',
      t.expiresAt && t.expiresAt !== offer.expiresAt ? until(t.expiresAt) : '',
      t.soldOut ? '품절' : ''].filter(Boolean)
    return `${t.channel ? `${t.channel} ` : ''}${benefit(t)}${terms.length ? ` (${terms.join(', ')})` : ''}`
  })
  lines[0] = `${brand} ${platform} ${lines[0]}`.replace(/\s+/g, ' ').trim()
  const expiryBadge = /^~\s*(\d{1,2})[/.](\d{1,2})$/.exec(offer.badge ?? '')
  const expiry = /^(\d{4})-(\d{2})-(\d{2})$/.exec(offer.expiresAt ?? '')
  const redundantDate = expiryBadge && expiry && Number(expiryBadge[1]) === Number(expiry[2]) && Number(expiryBadge[2]) === Number(expiry[3])
  const redundantMember = commonMember && (offer.badge ?? '').replace(/전용|쿠폰|\s/g, '') === commonMember.replace(/전용|쿠폰|\s/g, '')
  const details = [minimum(commonMin), commonMember,
    !redundantDate && !redundantMember ? offer.badge : '', offer.conditions,
    offer.firstCome && ![...lines, offer.badge, offer.conditions].some((v) => v?.includes('선착순')) ? '선착순' : '',
    offer.soldOut && !rows.some((t) => t.soldOut) ? '품절' : '', until(offer.expiresAt)]
  // 중복 할인은 대표 합계와 계산 조건을 유지한다. 개별 쿠폰을 택일 할인처럼 나열하지 않는다.
  if (offer.tierMode === 'cumulative' && tiers.some((t) => t.channel || t.membership || t.note)) {
    for (const t of tiers) details.push([t.channel, benefit(t), minimum(t.minOrder), member(t.membership), t.note,
      t.expiresAt && t.expiresAt !== offer.expiresAt ? until(t.expiresAt) : ''].filter(Boolean).join(' '))
  }
  return [...new Set([...lines, ...details].filter(Boolean))].join('\n')
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
