// CDP로 배너 n번째 장을 띄운 뒤 찍는다. 사용: node shot.mjs <dotIndex> <out.png> [width]
import { writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
const [idx, out, width = '360'] = process.argv.slice(2)
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const port = 9333
const p = spawn(edge, ['--headless=new','--disable-gpu','--hide-scrollbars','--disable-web-security',
  `--user-data-dir=${process.env.TMP}/edgeprof2`, `--remote-debugging-port=${port}`,
  `--window-size=${width},420`, '--user-agent=Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
let targets
for (let i = 0; i < 30; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break } catch { await sleep(300) } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise(r => { ws.send(JSON.stringify({ id: ++id, method, params })); pending.set(id, r) })
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: +width, height: 420, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: 'http://localhost:4179/?dev=1' })
await sleep(3500)
await send('Runtime.evaluate', { expression: `document.querySelectorAll('.banner__dot')[${idx}]?.click(); window.scrollTo(0,0)` })
await sleep(900)
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.data, 'base64'))
ws.close(); p.kill(); process.exit(0)
