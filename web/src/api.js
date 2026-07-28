// 개발 중엔 비워두면 vite proxy(localhost:8080)를 그대로 탄다. 배포판은
// VITE_API_BASE_URL로 실제 백엔드 주소를 준다 — 정적 프론트가 백엔드와
// 다른 오리진에 떠서 상대경로로는 못 닿기 때문.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export async function fetchBrands() {
  const res = await fetch(`${API_BASE}/api/brands`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}
