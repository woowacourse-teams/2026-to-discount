// 빌드 결과에 크롤러가 읽을 본문을 심는다.
//
// 왜 필요한가 — 이 앱은 CSR SPA라 배포된 index.html이 1.1KB짜리
// `<div id="root"></div>` 하나다. 크롤러가 받는 HTML에 브랜드 이름이
// 한 글자도 없어서, 검색으로는 서비스 이름("오늘의할인")을 이미 아는
// 사람만 찾아온다. 정작 유입이 될 말("교촌치킨 할인")에는 걸릴 근거가
// 없다.
//
// 왜 SSR이 아닌가 — Vite에는 프리렌더 API가 없고, 공식 안내는
// entry-server를 만들어 client/server를 따로 빌드하는 것이다. 그런데
// 이 앱은 서버에서 안 돈다: variant.js가 모듈 로드 시점에 localStorage를
// 읽고 analytics.js가 window.matchMedia를 부른다. 그걸 다 걷어내는 값보다
// 여기서 HTML을 직접 찍는 값이 싸다.
//
// 사용자에게는 안 보인다 — React가 createRoot().render()로 #root를
// 통째로 갈아끼운다. 심어둔 HTML은 크롤러와 첫 페인트까지만 산다.
// 내용이 같으므로 클로킹이 아니다.
//
// API가 죽어 있으면 심지 않고 그냥 넘어간다. 배포를 막을 일이 아니다.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const SITE = process.env.SITE_ORIGIN ?? 'https://beggars-five.vercel.app'
const API = process.env.BRANDS_API ?? 'https://bebeggars.duckdns.org/api/brands'

const PLATFORM_LABEL = {
  baemin: '배달의민족',
  coupangeats: '쿠팡이츠',
  ddangyo: '땡겨요',
  yogiyo: '요기요',
}

const CATEGORY_LABEL = {
  chicken: '치킨', pizza: '피자', fastfood: '패스트푸드', snack: '분식',
  cafe: '카페', convenience: '편의점', korean: '한식', chinese: '중식',
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`

// 오퍼 한 줄. 금액을 못 읽은 오퍼(rawText만 있는 것)는 싣지 않는다 —
// 검색 결과에 "확인 필요"만 늘어놔 봐야 누른 사람이 속는다.
function offerLine(o) {
  if (o.amount == null) return null
  const app = PLATFORM_LABEL[o.platform] ?? o.platform
  const bits = [`${app} ${won(o.amount)}`]
  if (o.qualifier) bits.push(`(${o.qualifier})`)
  if (o.minOrderAmount != null) bits.push(`· ${won(o.minOrderAmount)} 이상`)
  if (o.expiresAt) bits.push(`· ${o.expiresAt}까지`)
  return bits.join(' ')
}

function brandBlock(b) {
  const lines = (b.offers ?? []).map(offerLine).filter(Boolean)
  if (lines.length === 0) return null
  const cat = CATEGORY_LABEL[b.category]
  return [
    '      <li>',
    `        <h3>${esc(b.name)}${cat ? ` <span>${esc(cat)}</span>` : ''}</h3>`,
    '        <ul>',
    ...lines.map((l) => `          <li>${esc(l)}</li>`),
    '        </ul>',
    '      </li>',
  ].join('\n')
}

// 심어둔 본문은 JS가 붙기 전까지 화면에 그대로 보인다. 손대지 않으면
// 스타일 없는 날것 목록이 잠깐 떴다가 사라져 고장 난 것처럼 읽힌다.
//
// 감추지는 않는다. 숨긴 텍스트는 검색엔진이 싫어하고, 무엇보다 이건
// 진짜 내용이다. 실측에서 세션 58%가 3.8초 만에 아무것도 안 누르고
// 나갔는데, 그중 일부는 데이터가 도착하기 전에 나간 것으로 보인다.
// 첫 페인트에 진짜 목록이 떠 있는 편이 스켈레톤보다 낫다.
const BOOT_STYLE = `
    <style id="prerender-style">
      #root > header, #root > main, #root > footer {
        max-width: 720px; margin: 0 auto; padding: 0 1rem;
        font-family: Pretendard, system-ui, sans-serif; color: #171717;
      }
      #root > header h1 { font-size: 1.35rem; margin: 1.25rem 0 .35rem; }
      #root > header p { margin: 0 0 1rem; color: #666; font-size: .9rem; }
      #root > main h2 { font-size: 1rem; color: #666; margin: 0 0 .75rem; }
      #root > main > ul { list-style: none; margin: 0; padding: 0; }
      #root > main > ul > li {
        border: 1px solid #eaeaea; border-radius: 12px;
        padding: .85rem 1rem; margin-bottom: .6rem;
      }
      #root > main h3 { font-size: 1rem; margin: 0 0 .4rem; }
      #root > main h3 span { font-size: .78rem; color: #888; font-weight: 500; }
      #root > main ul ul { list-style: none; margin: 0; padding: 0; }
      #root > main ul ul li { font-size: .88rem; color: #444; line-height: 1.7; }
      #root > footer { margin: 1.5rem auto 2rem; font-size: .75rem; color: #999; }
    </style>`

function bodyHtml(brands, today) {
  const blocks = brands.map(brandBlock).filter(Boolean)
  const names = brands.map((b) => b.name)
  return [
    '    <header>',
    '      <h1>오늘의 배달앱 브랜드 할인 한눈에 비교</h1>',
    `      <p>배달의민족·쿠팡이츠·요기요·땡겨요 네 앱의 브랜드 할인 쿠폰을 한 화면에서 견줍니다. ${today} 기준 ${blocks.length}개 브랜드.</p>`,
    '    </header>',
    '    <main>',
    '      <h2>브랜드별 할인</h2>',
    '      <ul>',
    ...blocks,
    '      </ul>',
    '    </main>',
    '    <footer>',
    `      <p>수록 브랜드: ${esc(names.join(', '))}</p>`,
    '      <p>개인이 만든 비영리 정보 제공 페이지입니다. 각 앱의 공식 서비스가 아니며 제휴 관계가 없습니다. 금액은 확인일 기준이며 주문 전에 각 앱에서 다시 확인하세요.</p>',
    '    </footer>',
  ].join('\n')
}

// 검색 결과에 뜨는 한 줄. 브랜드 몇 개를 앞세워 "여기 그 브랜드가 있다"를
// 보이게 한다 — 이름만 적으면 이미 서비스를 아는 사람에게만 걸린다.
function description(brands, today) {
  const head = brands.slice(0, 6).map((b) => b.name).join(', ')
  return `배달의민족·쿠팡이츠·요기요·땡겨요 브랜드 할인 쿠폰을 한 화면에서 비교합니다. ${today} 기준 ${brands.length}개 브랜드 — ${head} 등.`
}

function metaTags(brands, today) {
  const desc = description(brands, today)
  const keywords = [
    '배달 할인', '배달앱 쿠폰', '배민 할인', '쿠팡이츠 할인', '요기요 할인', '땡겨요 할인',
    ...brands.slice(0, 30).map((b) => `${b.name} 할인`),
  ].join(', ')
  return [
    `    <link rel="canonical" href="${SITE}/" />`,
    `    <meta name="keywords" content="${esc(keywords)}" />`,
    '    <meta property="og:type" content="website" />',
    '    <meta property="og:site_name" content="오늘의할인" />',
    '    <meta property="og:title" content="오늘의할인 - 배달앱 브랜드 할인 한눈에" />',
    `    <meta property="og:description" content="${esc(desc)}" />`,
    `    <meta property="og:url" content="${SITE}/" />`,
    '    <meta property="og:locale" content="ko_KR" />',
    '    <meta name="twitter:card" content="summary" />',
    '    <meta name="twitter:title" content="오늘의할인 - 배달앱 브랜드 할인 한눈에" />',
    `    <meta name="twitter:description" content="${esc(desc)}" />`,
  ].join('\n')
}

async function fetchBrands() {
  const timeout = AbortSignal.timeout(15000)
  const res = await fetch(API, { signal: timeout })
  if (!res.ok) throw new Error(`API ${res.status}`)
  const data = await res.json()
  const list = Array.isArray(data) ? data : data.brands
  if (!Array.isArray(list)) throw new Error('모양이 예상과 다르다')
  return list
}

async function main() {
  let brands
  try {
    brands = await fetchBrands()
  } catch (e) {
    // 배포를 막지 않는다. 본문이 없는 예전 상태로 나갈 뿐이다.
    console.warn(`[prerender] 건너뜀 — 브랜드를 못 받았다: ${e.message}`)
    return
  }
  // 할인이 큰 브랜드를 앞에 둔다. 검색 결과 미리보기와 목록 첫머리에
  // 무엇이 오는지가 클릭을 가른다.
  brands.sort((a, b) => (b.maxConfirmedAmount ?? 0) - (a.maxConfirmedAmount ?? 0))

  const today = new Date().toISOString().slice(0, 10)
  const indexPath = new URL('index.html', `file://${DIST}`)
  let html = await readFile(indexPath, 'utf8')

  const body = bodyHtml(brands, today)
  html = html.replace('<div id="root"></div>', `<div id="root">\n${body}\n    </div>`)
  html = html.replace('  </head>', `${metaTags(brands, today)}${BOOT_STYLE}\n  </head>`)
  // 예전 정적 설명은 브랜드가 안 들어간 문장이라 갈아 끼운다.
  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${esc(description(brands, today))}" />`,
  )
  await writeFile(indexPath, html)

  await writeFile(new URL('robots.txt', `file://${DIST}`),
    ['User-agent: *', 'Allow: /', '', `Sitemap: ${SITE}/sitemap.xml`, ''].join('\n'))

  // 할인이 매일 바뀌는 것이 이 페이지의 값이다. lastmod를 실제 빌드일로
  // 채워 재크롤 빈도를 올린다.
  await writeFile(new URL('sitemap.xml', `file://${DIST}`), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${SITE}/</loc>`,
    `    <lastmod>${today}</lastmod>`,
    '    <changefreq>daily</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
    '</urlset>',
    '',
  ].join('\n'))

  const withOffers = brands.filter((b) => (b.offers ?? []).some((o) => o.amount != null))
  console.log(`[prerender] 브랜드 ${withOffers.length}개를 본문에 심었다 (${today})`)
}

await mkdir(DIST, { recursive: true })
await main()
