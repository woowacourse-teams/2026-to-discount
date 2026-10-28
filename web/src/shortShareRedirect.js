export async function shortShareRedirect(code, apiBase, request = fetch) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(code)) return { location: '/#share=invalid' }
  try {
    const response = await request(`${apiBase}/api/share-links/${code}`, { signal: AbortSignal.timeout(4000) })
    if (response.status === 404) return { location: '/#share=invalid' }
    if (!response.ok) return {}
    const target = await response.json()
    if (!/^[a-f0-9]{32}$/.test(target.shareId ?? '') || !/^v1_[a-f0-9]{64}$/.test(target.offerKey ?? '')
        || typeof target.brand !== 'string' || !target.brand.trim() || target.brand.length > 120) return {}
    return { location: `/#${new URLSearchParams({ share: target.shareId, brand: target.brand, offer: target.offerKey })}` }
  } catch { return {} }
}
