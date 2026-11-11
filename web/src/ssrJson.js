// 서버가 window.__SSR__로 싣는 JSON. null 칸은 싣지 않는다(실린 데이터 약 20% 감소, 2026-10-06).
// 단, offer.isNew의 null은 "이력 없음 = 신규 아님"이라는 값이다. filters.js isUpdated가 칸이 있느냐('isNew' in offer)로
// 판정하므로 지우면 브라우저가 옛 응답으로 보고 날짜 규칙으로 신규를 다시 가려, 오늘 처음 본 오퍼의 브랜드가 맨 위로 올라가
// 서버 HTML과 순서가 달라진다(React #418/#423/#425, 2026-11-11 11시부터 KFC 1+1).
export const ssrJson = (data) => JSON.stringify(data, (k, v) => (v === null && k !== 'isNew' ? undefined : v)).replace(/</g, '\\u003c')
