import { API_BASE } from './api.js'
import { sharedOfferKey } from './offerSharing.js'

export async function createShortShareLink(origin, brand, offer, shareId, request = fetch) {
  const response = await request(`${API_BASE}/api/share-links`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shareId, brand, offerKey: sharedOfferKey(offer) }),
    signal: AbortSignal.timeout(4000),
  })
  if (!response.ok) throw new Error('Short share link unavailable')
  const { code } = await response.json()
  if (!/^[A-Za-z0-9_-]{16}$/.test(code ?? '')) throw new Error('Invalid short code')
  return new URL(`/s/${code}`, origin).href
}
