// 저사양 폰 흉내 부하 측정: CPU를 N배 느리게 하고 360px 새 방문으로 연 뒤, 정해진 시간 동안
// 긴 작업(TBT 근사), 레이아웃 이동(CLS), 최대 콘텐츠 표시(LCP), 예외 수를 잰다.
// Lighthouse 시뮬레이션은 같은 주소도 TBT가 0.6~3.5초로 흔들려(2026-10-14) 실제 브라우저 관측으로 잰다.
//
//   node scripts/dev/load-tbt.mjs <주소> [주소 ...] [--runs 5] [--cpu 4] [--wait 9000]
//
// 주소를 여럿 주면 회차마다 번갈아 연다(같은 시간대 비교). 결과는 주소별 중앙값과 회차별 값.
// 보호된 Vercel 프리뷰는 환경변수 VERCEL_BYPASS_FILE(우회 값이 든 파일 경로)을 주면 헤더로 붙인다. 값은 출력하지 않는다.
// 분석이 개발 트래픽으로 거르도록 주소에 ?dev=1을 붙여 쓴다.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : Number(args.splice(i, 2)[1]) }
const runs = opt('--runs', 5); const cpu = opt('--cpu', 4); const wait = opt('--wait', 9000)
// 합격 기준(CI web-perf). 주면 넘는 주소가 있을 때 종료 코드 1. 예외는 하나라도 있으면 실패(하이드레이션 실패 #421 같은 것).
const maxTbt = opt('--max-tbt', Infinity); const maxCls = opt('--max-cls', Infinity)
const urls = args
if (!urls.length) { console.error('주소를 하나 이상 주세요'); process.exit(2) }
const bypass = process.env.VERCEL_BYPASS_FILE ? readFileSync(process.env.VERCEL_BYPASS_FILE, 'utf8').trim() : null
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function measure(url, port) {
  const p = spawn(EDGE, ['--headless=new', '--disable-gpu', ...(process.env.CI ? ['--no-sandbox'] : []), `--user-data-dir=${process.env.TMP || '/tmp'}/load-tbt-${port}`,
    `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' })
  try {
    let targets = []
    for (let i = 0; i < 50 && !targets.some(t => t.type === 'page'); i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json() } catch { /* 아직 안 떴다 */ }
      await sleep(300)
    }
    const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
    await new Promise(r => { ws.onopen = r })
    let id = 0; let errors = 0; const pending = new Map()
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) }
      if (m.method === 'Runtime.exceptionThrown') errors++
    }
    const send = (method, params = {}) => new Promise(r => { ws.send(JSON.stringify({ id: ++id, method, params })); pending.set(id, r) })
    await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable')
    await send('Network.clearBrowserCookies'); await send('Network.setCacheDisabled', { cacheDisabled: true })
    if (bypass && url.includes('.vercel.app') && url.includes('-git-')) await send('Network.setExtraHTTPHeaders', { headers: { 'x-vercel-protection-bypass': bypass } })
    // HeadlessChrome이 들어 있어 GA4, Vercel Analytics로는 안 나간다(main.jsx quiet).
    await send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 HeadlessChrome' })
    await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 2, mobile: true })
    await send('Emulation.setCPUThrottlingRate', { rate: cpu })
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__lt=[];window.__cls=0;window.__lcp=0;'
      + "new PerformanceObserver(l=>l.getEntries().forEach(e=>__lt.push(e.duration))).observe({type:'longtask',buffered:true});"
      + "new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)__cls+=e.value})).observe({type:'layout-shift',buffered:true});"
      + "new PerformanceObserver(l=>l.getEntries().forEach(e=>{__lcp=e.startTime})).observe({type:'largest-contentful-paint',buffered:true})" })
    await send('Page.navigate', { url })
    await sleep(wait)
    const r = await send('Runtime.evaluate', { returnByValue: true, expression: 'JSON.stringify({tbt:Math.round(__lt.reduce((s,d)=>s+Math.max(0,d-50),0)),'
      + "cls:+__cls.toFixed(3),lcp:Math.round(__lcp)})" })
    ws.close()
    return { ...JSON.parse(r.result.value), errors }
  } finally { p.kill() }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const out = new Map(urls.map(u => [u, []]))
let port = 9400
for (let n = 0; n < runs; n++) for (const u of urls) { out.get(u).push(await measure(u, ++port)); await sleep(500) }
for (const [u, rs] of out) {
  console.log(`${u}\n  TBT 중앙값 ${median(rs.map(r => r.tbt))}ms  CLS 최대 ${Math.max(...rs.map(r => r.cls))}  LCP 중앙값 ${median(rs.map(r => r.lcp))}ms  예외 ${rs.map(r => r.errors).join(',')}`)
  console.log(`  회차 TBT ${rs.map(r => r.tbt).join(',')}`)
}
const fails = [...out].flatMap(([u, rs]) => [
  ...(median(rs.map(r => r.tbt)) > maxTbt ? [`${u}: TBT 중앙값 ${median(rs.map(r => r.tbt))}ms > ${maxTbt}ms`] : []),
  ...(Math.max(...rs.map(r => r.cls)) > maxCls ? [`${u}: CLS ${Math.max(...rs.map(r => r.cls))} > ${maxCls}`] : []),
  ...(rs.some(r => r.errors) && (maxTbt !== Infinity || maxCls !== Infinity) ? [`${u}: 페이지 예외 ${rs.map(r => r.errors).join(',')}`] : []),
])
if (fails.length) { console.log(`\n실패:\n- ${fails.join('\n- ')}`); process.exit(1) }
