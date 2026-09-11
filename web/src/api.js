// API를 **직접** 부른다. 예전에는 같은 오리진(`/api/...`)으로 쏘고
// vercel.json rewrites가 bebeggars.duckdns.org로 넘겼다.
//
// **왜 걷어냈나**(2026-09-11): 그 rewrite를 타는 호출이 방문당 여섯 건쯤
// Vercel Edge Requests로 계산된다. 한도를 요청 수로 세는 서비스라
// (2026-09-07 75% 경고) 방문자가 늘수록 그대로 곱해진다. 직접 부르면
// 그 여섯 건이 Vercel을 아예 안 지난다.
//
// 2026-09-07에 같은 검토를 하고 남겨 뒀던 이유는 "서버 CORS가 운영
// 오리진만 허용해서 걷어내면 프리뷰 배포가 깨진다"였다. **그 기록은
// 낡았다** — WebConfig에 프리뷰 패턴이 이미 들어가 있고, 실측으로 확인했다:
//
//   https://beggars-five.vercel.app                         -> ACAO 반환
//   https://beggars-git-<브랜치>-nn98s-projects.vercel.app   -> ACAO 반환
//   https://evil.example.com                                -> 헤더 없음(거부)
//
// 프리플라이트도 확인했다. POST /api/events를 JSON으로 보내면 OPTIONS가
// 한 번 붙지만 `Access-Control-Max-Age: 1800`으로 30분 캐시되고, 그 요청은
// Vercel이 아니라 API 서버로 간다. sendBeacon 경로는 text/plain이라
// 애초에 단순 요청이고 프리플라이트가 없다(analytics.js).
//
// 값은 여기서만 정한다. 예전에는 analytics.js가 같은 상수를 따로 들고
// App.jsx·SurveyCard.jsx는 문자열을 박아 뒀다 — 네 군데가 제각각이면
// 한 곳만 고치는 날 나머지가 조용히 어긋난다.
export const API_BASE = 'https://bebeggars.duckdns.org'

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
