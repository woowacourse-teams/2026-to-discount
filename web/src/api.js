import { resolveApiBase } from './apiBase.js'

// 브라우저와 SSR은 같은 빌드 설정을 사용한다. 상대경로나 /api 프록시로 대체하지 않는다.
export const API_BASE = resolveApiBase(import.meta.env?.VITE_API_BASE_URL, import.meta.env?.VITE_APP_ENV)

export async function fetchBrands() {
  const res = await fetch(`${API_BASE}/api/brands`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

// 오늘 띄울 배너만 내려온다 — 기간 판정은 서버(Asia/Seoul)가 하고 정렬도
// 서버가 끝내 준다. 프론트는 받은 순서대로 돌리기만 한다.
export async function fetchBanners() {
  // index.html이 먼저 보낸 요청이 있으면 그 응답을 한 번만 쓴다. 실패했으면 여기서 다시 부른다.
  const early = typeof window !== 'undefined' ? window.__bannersEarly : null
  if (early) {
    window.__bannersEarly = null
    const got = await early
    if (Array.isArray(got)) return got
  }
  const res = await fetch(`${API_BASE}/api/banners`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

// 설문을 띄울지 서버에 묻는다. 판정이 서버에 있는 이유는 리워드다 —
// 브라우저가 정하면 localStorage를 고쳐 아무나 기프티콘을 받아간다.
export async function fetchSurveyStatus(visitorId) {
  const res = await fetch(`${API_BASE}/api/survey?visitorId=${encodeURIComponent(visitorId)}`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

// 이력 엔드포인트가 아직 없는 서버도 있다. 404, 네트워크 실패는 조용히 null.
export async function fetchHistory(brand, range = '1m') {
  try {
    const res = await fetch(`${API_BASE}/api/brands/${encodeURIComponent(brand)}/history?range=${range}`)
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}
