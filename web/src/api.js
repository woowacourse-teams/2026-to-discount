// 로컬이든 배포든 항상 이 주소로 쏜다 — 프록시나 상대경로 대신 백엔드
// 고정 주소를 직접 부른다.
const API_BASE = 'https://bebeggars.duckdns.org'

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
