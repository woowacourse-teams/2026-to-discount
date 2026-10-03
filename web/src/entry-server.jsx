// 홈 서버 렌더(SSR). api/ssr.js가 요청마다 부른다.
//
// 빌드 때 데이터를 박지 않는다 — 데이터가 하루 세 번 바뀌어 낡은 금액이 나간다.
// 요청 시점에 API를 받아 그리고, CDN이 짧게(s-maxage) 들고 있는다.
import { StrictMode } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { Writable } from 'node:stream'
import App from './App.jsx'
import { setHubLinks } from './offerLink.js'
import { API_BASE } from './api.js'

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(2500) })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

// 브랜드가 실패하면 SSR을 포기한다(throw) — 클라이언트가 예전처럼 받아 그린다.
// 배너만 실패하면 빈 배너로 그린다(App과 같은 규칙: 배너는 부가 정보).
export async function loadData() {
  const [brands, banners] = await Promise.all([get('/api/brands'), get('/api/banners').catch(() => [])])
  if (!Array.isArray(brands)) throw new Error('brands 모양이 다르다')
  return { brands, banners: Array.isArray(banners) ? banners : [] }
}

export function render(data) {
  // ponytail: 모듈 전역이라 요청끼리 공유된다. 같은 시각의 같은 API 값이라 괜찮다.
  setHubLinks(data.banners)
  return new Promise((resolve, reject) => {
    let html = ''
    const sink = new Writable({
      write(chunk, _enc, cb) { html += chunk; cb() },
      final(cb) { resolve(html); cb() },
    })
    // onAllReady: lazy 컴포넌트(필터 시트 등)까지 다 그린 뒤 한 번에 넘긴다.
    // renderToString은 Suspense에서 fallback을 내고, 클라이언트가 복구 오류를 찍는다.
    // 트리 모양을 main.jsx와 똑같이 둔다(StrictMode 아래 App과 Analytics 자리 둘).
    // 자식 수가 다르면 useId 값이 갈려 하이드레이션이 어긋난다(카드 상세 id).
    const stream = renderToPipeableStream(<StrictMode><App initial={data} />{null}</StrictMode>, {
      onAllReady() { stream.pipe(sink) },
      onShellError: reject,
      onError: reject,
    })
  })
}
