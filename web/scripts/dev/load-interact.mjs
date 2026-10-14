// 저사양 폰 상호작용 부하: CPU 4배 감속, 360px로 열고 카드 펼치기, 필터 열고 닫기, 검색 입력, 목록 끝까지 스크롤을
// 차례로 해 시나리오별 긴 작업(tbt, maxLong), 이벤트 지연, 힙, DOM 수를 한 줄 JSON으로 낸다.
// 사용: node scripts/dev/load-interact.mjs <주소> [포트]. 보호된 프리뷰는 VERCEL_BYPASS_FILE. 2026-10-14 기록 참고.
// 사용: node ix.mjs <url> <port>  -> 상호작용별 긴 작업/이벤트 지연/힙 JSON
import { spawn } from 'node:child_process'
const [url, port = '9370'] = process.argv.slice(2)
const p = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', `--user-data-dir=${process.env.TMP}/edgeprof-ix${port}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
let targets
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some(t => t.type === 'page')) break } catch { } await sleep(300) }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise(r => { ws.send(JSON.stringify({ id: ++id, method, params })); pending.set(id, r) })
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
await send('Runtime.enable'); await send('Page.enable'); await send('Performance.enable')
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Network.enable'); if (process.env.VERCEL_BYPASS_FILE && url.includes('-git-')) await send('Network.setExtraHTTPHeaders', { headers: { 'x-vercel-protection-bypass': (await import('node:fs')).readFileSync(process.env.VERCEL_BYPASS_FILE, 'utf8').trim() } })
await send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 HeadlessChrome' })
await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 2, mobile: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__lt=[];window.__ev=[];new PerformanceObserver(l=>l.getEntries().forEach(e=>__lt.push(e.duration))).observe({type:'longtask',buffered:true});new PerformanceObserver(l=>l.getEntries().forEach(e=>__ev.push(e.duration))).observe({type:'event',durationThreshold:16,buffered:true})` })
await send('Page.navigate', { url }); await sleep(6000)
await send('Emulation.setCPUThrottlingRate', { rate: 4 })
const heap = async () => Math.round((await send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize').value / 1e6 * 10) / 10
const center = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`)
const click = async (sel) => { const c = await center(sel); if (!c) return false; await sleep(200)
  const c2 = await center(sel); for (const t of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type: t, x: c2[0], y: c2[1], button: 'left', clickCount: 1 }); return true }
const out = { heap0: await heap(), cards: await ev(`document.querySelectorAll('article').length`) }
async function step(name, fn) {
  await ev(`__lt.length=0;__ev.length=0`); await fn(); await sleep(1200)
  out[name] = JSON.parse(await ev(`JSON.stringify({tbt:Math.round(__lt.reduce((s,d)=>s+Math.max(0,d-50),0)),long:__lt.length,maxLong:Math.round(Math.max(0,...__lt)),maxEv:Math.round(Math.max(0,...__ev))})`))
}
await step('expandCard', async () => { out.expandOk = await click('.brand-card__expand, .cc-x button, button[aria-expanded=false]:not([aria-label])') })
await step('filterOpen', async () => { out.filterOk = await click('[aria-label="필터 열기"]') })
await step('filterClose', async () => { await click('.sheet__close') })
await step('search', async () => { if (!await click('input[type=search]')) return; for (const ch of '치킨') await send('Input.dispatchKeyEvent', { type: 'char', text: ch }), await sleep(250) })
await ev(`(()=>{const i=document.querySelector('input[type=search]');i&&(i.blur())})()`)
await step('scrollToEnd', async () => { for (let i = 0; i < 40; i++) { await ev('window.scrollTo(0,document.documentElement.scrollHeight)'); await sleep(500) } })
out.cardsEnd = await ev(`document.querySelectorAll('article').length`); out.heapEnd = await heap(); out.domNodes = await ev(`document.getElementsByTagName('*').length`)
console.log(JSON.stringify(out)); ws.close(); p.kill(); process.exit(0)
