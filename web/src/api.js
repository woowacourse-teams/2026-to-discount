// 같은 오리진으로 쏜다. 실제 백엔드는 다른 호스트(bebeggars.duckdns.org)에
// 있지만 배포는 vercel.json rewrites가, 개발은 vite 프록시가 /api를 그쪽으로
// 넘긴다. 브라우저 입장에선 동일 출처라 CORS 프리플라이트가 아예 안 생긴다 —
// sendBeacon이 text/plain으로만 갈 수 있던 제약도 여기서 나온 것이었다.
const API_BASE = ''

export async function fetchBrands() {
  const res = await fetch(`${API_BASE}/api/brands`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

// 오늘 띄울 배너만 내려온다 — 기간 판정은 서버(Asia/Seoul)가 하고 정렬도
// 서버가 끝내 준다. 프론트는 받은 순서대로 돌리기만 한다.
export async function fetchBanners() {
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
