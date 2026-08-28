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

// 브랜드 이름을 상세 페이지로 잇는다.
//
// 크롤러는 링크를 타고 다니며 페이지를 찾는다. 여기에 링크가 없던 동안
// 브랜드 상세 110여 장은 sitemap.xml로만 발견됐고, 홈이 쌓은 신뢰가
// 그쪽으로 흐르지 않았다(실측 2026-08-28: 홈 프리렌더 본문의 <a> 0개).
//
// 링크가 404가 될 일은 없다. 이 함수는 금액을 읽은 오퍼가 하나도 없으면
// null을 돌려주고, 상세 페이지를 만드는 `listed`도 같은 조건으로 거른다 —
// 블록이 그려졌다는 것 자체가 그 브랜드에 페이지가 있다는 뜻이다.
//
// 상대 경로를 쓴다. 프리뷰 배포는 도메인이 매번 달라서 절대 주소를 박으면
// 프리뷰에서 운영 사이트로 튄다. canonical·sitemap은 절대 주소가 필요하지만
// 내부 링크는 상대여도 검색엔진이 똑같이 따라간다.
//
// 화면은 안 변한다 — 하이드레이션되면 React가 이 자리를 통째로 덮는다.
function brandBlock(b) {
  const lines = (b.offers ?? []).map(offerLine).filter(Boolean)
  if (lines.length === 0) return null
  const cat = CATEGORY_LABEL[b.category]
  const href = `/brand/${encodeURIComponent(slugOf(b.name))}.html`
  return [
    '      <li>',
    `        <h3><a href="${href}">${esc(b.name)}</a>${cat ? ` <span>${esc(cat)}</span>` : ''}</h3>`,
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
      /* 셀렉터를 전부 .seo 아래로 묶는다.
         한때 #root > main 같은 요소 셀렉터로 썼다가, 앱이 렌더한 <main>에
         margin:0이 걸려 가운데 정렬이 죽었다. 심어둔 HTML에만 붙는
         클래스를 쓰면 앱 스타일과 겹칠 길이 없다. */
      .seo {
        max-width: 720px;
        margin: 0 auto;
        padding: 0 1rem;
        font-family: Pretendard, system-ui, sans-serif;
        color: #171717;
      }
      .seo h1 { font-size: 1.35rem; margin: 1.25rem 0 .35rem; }
      .seo h2 { font-size: 1rem; color: #666; margin: 1.25rem 0 .75rem; }
      .seo h3 { font-size: 1rem; margin: 0 0 .4rem; }
      .seo h3 span { font-size: .78rem; color: #888; font-weight: 500; }
      .seo p { margin: 0 0 .6rem; color: #666; font-size: .9rem; line-height: 1.6; }
      .seo ul { list-style: none; margin: 0; padding: 0; }
      .seo > ul > li, .seo section {
        border: 1px solid #eaeaea;
        border-radius: 12px;
        padding: .85rem 1rem;
        margin-bottom: .6rem;
      }
      .seo li { font-size: .88rem; color: #444; line-height: 1.7; }
      .seo dl { margin: 0; font-size: .88rem; line-height: 1.7; }
      .seo dt { color: #888; float: left; clear: left; width: 7.5rem; }
      .seo dd { margin: 0 0 0 7.5rem; color: #333; }
      .seo footer, .seo.footer { font-size: .75rem; color: #999; }
      .seo a { color: #1f6c9f; }
      /* 홈의 브랜드 이름만 링크 색을 뺀다.
         이 자리는 하이드레이션 전 0.5초 동안 사람 눈에 스친다. 브랜드
         108개가 전부 파란 밑줄로 깔리면 링크팜처럼 읽힌다. 크롤러는
         색이 아니라 <a>가 있는지만 보므로 링크로서의 값은 그대로다.
         브랜드 상세 페이지의 링크(형제 브랜드·홈 복귀)는 사람이 실제로
         누르는 것이라 그대로 둔다 — 거기엔 h3 안에 링크가 없다. */
      .seo h3 a { color: inherit; text-decoration: none; }
    </style>`

function bodyHtml(brands, today) {
  const blocks = brands.map(brandBlock).filter(Boolean)
  const names = brands.map((b) => b.name)
  return [
    '    <header class="seo">',
    '      <h1>오늘의 배달앱 브랜드 할인 한눈에 비교</h1>',
    `      <p>배달의민족·쿠팡이츠·요기요·땡겨요 네 앱의 브랜드 할인 쿠폰을 한 화면에서 견줍니다. ${today} 기준 ${blocks.length}개 브랜드.</p>`,
    '    </header>',
    '    <main class="seo">',
    '      <h2>브랜드별 할인</h2>',
    '      <ul>',
    ...blocks,
    '      </ul>',
    '    </main>',
    '    <footer class="seo">',
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

// 브랜드 하나짜리 페이지의 주소. 한글을 그대로 둔다 — 주소창에 브랜드
// 이름이 보이는 편이 검색 결과에서도 읽힌다. 파일 이름에 못 쓰는 글자만
// 하이픈으로 바꾼다("아구듬뿍&알곤마니" 같은 이름이 실제로 있다).
function slugOf(name) {
  return name.replace(/[^가-힣a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand'
}

// 구간이 있으면 줄로 편다. 얇은 페이지 100여 개를 만들면 저품질로
// 묶이므로, 원장이 들고 있는 조건을 아끼지 않고 다 적는다.
function tierLines(o) {
  if (!Array.isArray(o.tiers) || o.tiers.length === 0) return []
  return o.tiers.map((t) => {
    const bits = []
    if (t.minOrder != null) bits.push(`${won(t.minOrder)} 이상 주문 시`)
    if (t.amount != null) bits.push(won(t.amount))
    if (t.percent != null) bits.push(`${t.percent}%`)
    if (t.cap != null) bits.push(`최대 ${won(t.cap)}`)
    if (t.channel) bits.push(t.channel)
    if (t.soldOut) bits.push('품절')
    if (t.expiresAt) bits.push(`${t.expiresAt}까지`)
    return bits.join(' · ')
  })
}

function offerSection(o) {
  const app = PLATFORM_LABEL[o.platform] ?? o.platform
  const rows = []
  if (o.amount != null) rows.push(['할인 금액', won(o.amount) + (o.qualifier ? ` (${o.qualifier})` : '')])
  if (o.minOrderAmount != null) rows.push(['최소 주문 금액', won(o.minOrderAmount)])
  if (o.expiresAt) rows.push(['사용 기한', o.expiresAt])
  if (o.badge) rows.push(['받는 방법', o.badge])
  if (o.conditions) rows.push(['조건', o.conditions])
  if (o.soldOut) rows.push(['상태', '품절'])
  if (o.capturedAt) rows.push(['확인일', String(o.capturedAt).slice(0, 10)])
  const tiers = tierLines(o)
  return [
    `      <section>`,
    `        <h3>${esc(app)}</h3>`,
    '        <dl>',
    ...rows.flatMap(([k, v]) => [
      `          <dt>${esc(k)}</dt>`,
      `          <dd>${esc(v)}</dd>`,
    ]),
    '        </dl>',
    ...(tiers.length
      ? ['        <p>주문 금액별 할인</p>', '        <ul>',
         ...tiers.map((t) => `          <li>${esc(t)}</li>`), '        </ul>']
      : []),
    '      </section>',
  ].join('\n')
}

function brandPage(b, siblings, today) {
  const offers = (b.offers ?? []).filter((o) => o.amount != null)
  const cat = CATEGORY_LABEL[b.category]
  const apps = offers.map((o) => PLATFORM_LABEL[o.platform] ?? o.platform)
  const best = Math.max(...offers.map((o) => o.amount))
  const title = `${b.name} 배달 할인 쿠폰 정리 (${today} 기준)`
  const desc = `${b.name}${cat ? ` ${cat}` : ''} 배달 할인 — ${apps.join('·')}에서 확인한 쿠폰을 한자리에 모았습니다. 최대 ${won(best)}. 최소 주문 금액과 사용 기한까지 적어 뒀습니다.`
  const url = `${SITE}/brand/${encodeURIComponent(slugOf(b.name))}.html`
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="오늘의할인" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:locale" content="ko_KR" />
    <meta name="twitter:card" content="summary" />
${BOOT_STYLE}
  </head>
  <body>
    <div id="page">
      <header class="seo">
        <h1>${esc(b.name)} 배달 할인 쿠폰</h1>
        <p>${esc(desc)}</p>
        <p><a href="${SITE}/#${encodeURIComponent(b.name)}">네 앱 전체를 한 화면에서 비교하기 →</a></p>
      </header>
      <main class="seo">
        <h2>앱별 할인</h2>
${offers.map(offerSection).join('\n')}
        <h2>보는 법</h2>
        <p>같은 브랜드라도 앱마다 할인 금액과 최소 주문 금액이 다릅니다. 표시된 금액은 확인일 기준이며, 선착순 쿠폰은 시간대에 따라 소진될 수 있습니다. 주문 전에 각 앱에서 실제 금액을 다시 확인하세요.</p>
        <h2>같은 분류의 다른 브랜드</h2>
        <ul>
${siblings.map((n) => `          <li><a href="${SITE}/brand/${encodeURIComponent(slugOf(n))}.html">${esc(n)} 할인</a></li>`).join('\n')}
        </ul>
      </main>
      <footer class="seo footer">
        <p>${today} 기준. 개인이 만든 비영리 정보 제공 페이지입니다. 배달의민족·쿠팡이츠·요기요·땡겨요의 공식 서비스가 아니며 제휴 관계가 없습니다.</p>
        <p><a href="${SITE}/">오늘의할인 홈</a></p>
      </footer>
    </div>
  </body>
</html>
`
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
  // 브랜드 하나짜리 페이지. "교촌치킨 할인"처럼 브랜드 이름이 들어간
  // 검색어를 잡는 자리다 — 첫 화면 하나로는 그 말에 걸릴 근거가 없다.
  const listed = brands.filter((b) => (b.offers ?? []).some((o) => o.amount != null))
  const byCategory = new Map()
  for (const b of listed) {
    const k = b.category ?? '기타'
    if (!byCategory.has(k)) byCategory.set(k, [])
    byCategory.get(k).push(b.name)
  }
  await mkdir(new URL('brand/', `file://${DIST}`), { recursive: true })
  for (const b of listed) {
    const siblings = (byCategory.get(b.category ?? '기타') ?? [])
      .filter((n) => n !== b.name).slice(0, 12)
    await writeFile(
      new URL(`brand/${slugOf(b.name)}.html`, `file://${DIST}`),
      brandPage(b, siblings, today),
    )
  }

  const urls = [
    ['/', '1.0', 'daily'],
    ...listed.map((b) => [`/brand/${encodeURIComponent(slugOf(b.name))}.html`, '0.7', 'daily']),
  ]
  await writeFile(new URL('sitemap.xml', `file://${DIST}`), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.flatMap(([loc, pri, freq]) => [
      '  <url>',
      `    <loc>${SITE}${loc}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `    <changefreq>${freq}</changefreq>`,
      `    <priority>${pri}</priority>`,
      '  </url>',
    ]),
    '</urlset>',
    '',
  ].join('\n'))

  console.log(`[prerender] 본문 ${listed.length}개 + 브랜드 페이지 ${listed.length}장 (${today})`)
}

await mkdir(DIST, { recursive: true })
await main()
