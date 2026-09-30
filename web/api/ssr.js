// 홈("/") 서버 렌더. vercel.json rewrite가 "/"를 여기로 보낸다.
//
// 요청 시점의 API 데이터로 첫 화면(배너 + 카드 12장)을 HTML에 넣고, 같은 데이터를
// window.__SSR__로 실어 브라우저가 hydrateRoot로 이어받는다. JS를 기다리지 않고
// 배너 금액이 첫 페인트에 뜬다(LCP).
//
// 실패하면(API 장애, 렌더 오류) 사전 렌더링 HTML을 그대로 보낸다 — 예전 CSR과 같다.
import { loadData, render } from '../dist-server/entry-server.js'
import template from '../dist-server/template.js'

const ROOT_OPEN = '<div id="root">'
// 고정 바가 비운 자리(.title-bar-spacer)의 높이. 첫 페인트 전에 재서 CSS 변수로 넣는다.
// 하이드레이션 뒤에는 App.jsx가 같은 변수를 계속 갱신한다.
const BAR_SCRIPT = "(function(){var b=document.querySelector('.title-bar');if(b)document.documentElement.style.setProperty('--bar-h',b.getBoundingClientRect().height+'px')})();"

export function inject(html, appHtml, data) {
  const start = html.indexOf(ROOT_OPEN)
  const end = html.lastIndexOf('</div>', html.indexOf('</body>'))
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  const out = html.slice(0, start)
    + `${ROOT_OPEN}${appHtml}</div>\n    <script>${BAR_SCRIPT}window.__SSR__=${json}</script>`
    + html.slice(end + '</div>'.length)
  return out
    // 배너는 이미 실려 있다. 먼저 보내던 fetch는 필요 없다.
    .replace(/<script>[^<]*__bannersEarly[^<]*<\/script>/, '')
    // main.jsx의 markVariantOnRoot와 같은 값. JS 전 첫 페인트도 같은 바 스타일로 그린다.
    .replace('<html lang="ko">', '<html lang="ko" data-variant="a">')
}

export default async function handler(req, res) {
  let body = template
  try {
    const data = await loadData()
    body = inject(template, await render(data), data)
    res.setHeader('x-ssr', '1')
    // CDN이 60초 들고, 그 뒤 10분까지는 낡은 걸 주면서 뒤에서 새로 그린다.
    // 데이터는 하루 세 번 바뀌므로 최대 ~11분 늦는다. 실패한 응답은 CDN에 안 둔다.
    res.setHeader('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600')
  } catch (e) {
    console.error('[ssr] 실패, 사전 렌더링으로 대신한다:', e?.message)
    res.setHeader('x-ssr', '0')
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // 브라우저는 들고 있지 않는다.
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
  res.status(200).send(body)
}
