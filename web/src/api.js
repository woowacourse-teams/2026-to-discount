// 로컬이든 배포든 항상 이 주소로 쏜다 — 프록시나 상대경로 대신 백엔드
// 고정 주소를 직접 부른다.
const API_BASE = 'https://bebeggars.duckdns.org'

export async function fetchBrands() {
  const res = await fetch(`${API_BASE}/api/brands`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}
