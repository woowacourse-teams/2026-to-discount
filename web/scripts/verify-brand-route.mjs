// /brand/<이름> 주소를 브랜드로 푸는 규칙을 고정한다.
//
// 이 주소는 크롤러용 정적 페이지가 쓰던 것이고, 이제 앱도 같은 주소를
// 받는다. 규칙이 어긋나면 검색으로 들어온 사람이 홈만 보게 되고(브랜드가
// 안 잡힘), 그러면 정적 HTML과 앱 화면이 달라져 예전의 "쌍둥이 페이지"
// 문제로 되돌아간다.
//
// 앱을 통째로 불러올 수 없어(App.jsx가 CSS와 로고를 import한다) 규칙만
// 여기 옮겨 적지 않고, 실제 함수를 정규식째 읽어 와서 검증한다 —
// 베껴 적으면 원본이 바뀌어도 이 검사가 통과해 버린다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const src = await readFile(
  fileURLToPath(new URL('../src/App.jsx', import.meta.url)), 'utf8')

const start = src.indexOf('export function brandFromPath')
assert.notEqual(start, -1, 'brandFromPath를 못 찾았다 — 이름이 바뀌었나')
const body = src.slice(start, src.indexOf('\n}', start) + 2)
const brandFromPath = new Function(`${body.replace('export ', '')}; return brandFromPath`)()

const 열정국밥 = encodeURIComponent('열정국밥')

// 새 주소가 기본이다.
assert.equal(brandFromPath(`/brand/${열정국밥}`), '열정국밥')
// 끝에 슬래시가 붙어도 같은 페이지다 — 폴더 주소라 브라우저가 붙이기도 한다.
assert.equal(brandFromPath(`/brand/${열정국밥}/`), '열정국밥')
// 옛 주소도 받는다. vercel.json이 301로 넘기지만, 리다이렉트가 걸리기 전
// 이미 색인된 주소로 들어오는 경우가 있어 앱 쪽에서도 알아들어야 한다.
assert.equal(brandFromPath(`/brand/${열정국밥}.html`), '열정국밥')
// 하이픈이 든 이름(파일명에 못 쓰는 글자를 바꾼 것)도 그대로 돌려준다.
assert.equal(brandFromPath('/brand/%EC%95%84%EA%B5%AC-%EC%95%8C%EA%B3%A4'), '아구-알곤')

// 홈과 그 밖의 주소는 브랜드가 아니다.
assert.equal(brandFromPath('/'), null)
assert.equal(brandFromPath('/brand'), null)
assert.equal(brandFromPath('/brand/'), null)
// 하위 경로가 더 붙으면 브랜드 페이지가 아니다.
assert.equal(brandFromPath(`/brand/${열정국밥}/extra`), null)
// 인코딩이 깨진 주소는 오타지 브랜드가 아니다 — 던지지 말고 홈으로.
assert.equal(brandFromPath('/brand/%E0%A4%A'), null)

console.log('brand route parsing: PASS')
