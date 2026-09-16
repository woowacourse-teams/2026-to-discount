import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'; const port=9337
const p=spawn(edge,['--headless=new','--disable-gpu','--disable-web-security',`--user-data-dir=${process.env.TMP}/edgeprof6`,`--remote-debugging-port=${port}`,'--window-size=420,900','about:blank'],{stdio:'ignore'})
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); let targets
for(let i=0;i<30;i++){try{targets=await (await fetch(`http://127.0.0.1:${port}/json`)).json();break}catch{await sleep(300)}}
const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r)
let id=0; const pend=new Map(); ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id)}}
const send=(method,params={})=>new Promise(r=>{ws.send(JSON.stringify({id:++id,method,params}));pend.set(id,r)})
await send('Emulation.setDeviceMetricsOverride',{width:420,height:900,deviceScaleFactor:1,mobile:true})
await send('Page.navigate',{url:'http://localhost:4179/?dev=1'}); await sleep(4000)
const r=await send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
  const q=s=>document.querySelector(s);
  // 첫 카드를 펼친다(구간 격자 포함)
  q('.brand-card .brand-card__expand')?.click();
  const cards=[...document.querySelectorAll('.brand-card')].slice(0,3).map(c=>c.outerHTML);
  q('.filter-sheet-btn')?.click();
  const out={bar:q('.title-bar')?.outerHTML, banner:q('.banner-slot')?.outerHTML, cards, sheet:q('.sheet')?.outerHTML, scrim:q('.sheet-scrim')?.outerHTML,
    css:[...document.styleSheets].map(s=>{try{return [...s.cssRules].map(r=>r.cssText).join(String.fromCharCode(10))}catch{return ''}}).join(String.fromCharCode(10)),
    dev:q('.dev-badge')?.outerHTML};
  return JSON.stringify(out)})()`})
if(!r.result||r.result.value===undefined){console.log(JSON.stringify(r).slice(0,800));process.exit(1)}
writeFileSync(`${process.env.TMP}/dom.json`, r.result.value)
ws.close(); p.kill(); process.exit(0)
