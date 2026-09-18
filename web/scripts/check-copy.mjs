// 사용자에게 보이는 문구 검사(mono/docs/COPY-STYLE.md). JSX 텍스트에서 개발자 말투를 잡는다.
// 걸리는 것: 평서형 "…다."로 끝나는 텍스트(안내문은 "…요", "…세요", "…니다"로 쓴다), 수집기 단어.
// 주석({/* */}, //)과 코드 문자열이 아닌 JSX 텍스트 노드만 본다.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// "미확인"은 카드의 정식 라벨(최소주문 미확인)이고 "수집"은 고지문에 쓴다 — 여기선 안 본다.
const FORBIDDEN = ['대조', '표기', '파서', '관측', '판독', '추정', '실측', '정정']
const files = readdirSync('src').filter((f) => f.endsWith('.jsx')).map((f) => join('src', f))
const problems = []
for (const file of files) {
  const src = readFileSync(file, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
  // JSX 텍스트: ">" 와 "<" 사이의 글자. 표현식({…})은 건너뛴다.
  for (const m of src.matchAll(/>([^<>{}]*[가-힣][^<>{}]*)</g)) {
    const text = m[1].replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (/(?<!니)다\.?$/.test(text)) problems.push(`${file}: 평서형 문장 — "${text}"`)
    const bad = FORBIDDEN.filter((w) => text.includes(w))
    if (bad.length) problems.push(`${file}: 개발자 말 ${bad.join(',')} — "${text}"`)
  }
}
if (problems.length) {
  console.error('사용자 문구 규칙(COPY-STYLE) 위반:')
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}
console.log('copy: PASS')
