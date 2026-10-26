// iOS 배치 검사(2026-10-15). ios-shot의 local 모드가 빌드한 index.html <head> 맨 앞에 넣는다. 운영 빌드에는 없다.
// 사진만으로는 같은 깨짐이 되풀이됐다(넘김이 둘째 장으로 열림, 금액과 "원 할인" 겹침, 표 칩 넘침).
// 실제 iOS 사파리 안에서 구조를 재서 러너(localhost:8099)로 보내고, 화면 아래에도 적어 사진에 남긴다.
// ?css=<CSS> 를 주면 앱보다 먼저 스타일을 넣는다. 고칠 후보 여럿을 한 번의 실행에서 주소만 바꿔 견준다.
// ?sheet=<브랜드> 면 그 카드의 "자세히" 시트를 열어 표 칩까지 잰다(접힌 화면에는 표가 없다).
// ?tab=<n> 이면 분류 바의 n번째 버튼(0이 전체)을 누르고, ?scroll=end 면 목록 끝까지 내린 뒤 잰다(#146).
// 문구가 아니라 위치로 고른다. 눌린 버튼 글자는 사람이 사진에서 읽으라고 보고에만 남긴다.
(function () {
  const q = new URLSearchParams(location.search)
  // 개발 빌드의 "DEV" 띠(position: fixed, 오른쪽 밖으로 삐져나감)가 iOS에서 가로 넘침 78px를 만들었다. 운영 사용자에게는 없다
  const css = '.dev-badge{display:none!important}' + (q.get('css') || '')
  if (css) {
    const st = document.createElement('style')
    st.textContent = css
    // 문서보다 먼저 돌면(엣지 CDP 주입) 붙일 자리가 아직 없다. 그때는 문서가 생긴 뒤 붙인다
    const add = () => (document.head || document.documentElement).appendChild(st)
    if (document.head || document.documentElement) add()
    else document.addEventListener('readystatechange', add, { once: true })
  }
  const rectOf = (node) => {
    const r = document.createRange()
    r.selectNodeContents(node)
    return r.getBoundingClientRect()
  }
  const cross = (a, b) => a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1
  // 시트는 카드 밖(포털)에 그려진다. 시트 이름표("<브랜드> 할인 자세히")에서 브랜드를 읽는다
  const brandOf = (el) => el.closest('[data-brand]')?.dataset.brand
    || el.closest('.cc-sheet')?.getAttribute('aria-label')?.replace(/ 할인 자세히$/, '') || '?'

  function measure(scene, sceneFails) {
    const fails = [...sceneFails]
    const over = document.documentElement.scrollWidth - innerWidth
    if (over > 1) {
      // 넘치는 요소 중 조상이 안 넘치는 것(가장 바깥)만 짚는다
      // 스크롤하거나 자르는 상자 안에서 넘친 것(카테고리 탭 등)은 페이지를 넓히지 않는다. 그런 조상이 없는 것만 짚는다
      const clipped = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== 'visible') return true } return false }
      const wide = [...document.body.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1
        && !clipped(e) && !(e.parentElement && e.parentElement.getBoundingClientRect().right > innerWidth + 1))
      const name = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '')
      fails.push(`page: 가로 넘침 ${over}px (${wide.slice(0, 4).map((e) => `${name(e)} 오른쪽 ${Math.round(e.getBoundingClientRect().right)}`).join(', ')})`)
    }
    const grid = document.querySelector('.brand-grid')
    const gw = grid ? grid.getBoundingClientRect().width : innerWidth
    if (!document.querySelector('article[data-brand]')) fails.push('카드가 0장이다(데이터나 화면이 안 떴다)')
    // 첫 화면 카드만 본다(content-visibility로 화면 밖 카드는 아직 안 그렸다)
    const cards = [...document.querySelectorAll('article[data-brand]')].filter((a) => a.getBoundingClientRect().top < innerHeight)
    for (const a of cards) {
      const w = a.getBoundingClientRect().width
      if (w < gw * 0.5) fails.push(`${brandOf(a)}: 카드 폭 ${Math.round(w)}px(목록 ${Math.round(gw)}px)`)
    }
    const carousels = []
    for (const c of document.querySelectorAll('.cc-carousel')) {
      if (c.getBoundingClientRect().top > innerHeight) continue
      const dots = [...c.parentElement.querySelectorAll('.cc-dots i')]
      const dot = dots.findIndex((i) => i.classList.contains('on'))
      // 화면 가운데에서 실제로 눌리는 장(배치 기준). 그림이 다른 장을 보여 주면 사진과 이 값이 어긋난다
      const cr = c.getBoundingClientRect()
      const hit = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2)
      const slides = [...c.children]
      const hitIdx = slides.findIndex((sl) => sl.contains(hit))
      carousels.push({ brand: brandOf(c), scrollLeft: Math.round(c.scrollLeft), width: Math.round(c.clientWidth), dot, hitIdx,
        display: getComputedStyle(c).display, overflowX: getComputedStyle(c).overflowX,
        slideLeft: slides.map((sl) => Math.round(sl.getBoundingClientRect().left - cr.left)) })
      // 가운데에서 다른 장이 눌리면(hitIdx > 0) 그것도 실패. -1(가운데가 화면 밖이거나 다른 것이 덮음)은 판정하지 않는다
      // 장 폭이 무너지면(iOS가 컨테이너 폭을 0으로 읽음) 장들이 한 자리에 겹친다(2026-10-16 장 위치 [0, 0])
      // 넘김 자체가 크기 0이면(숨겨짐) 장 폭 비교가 아무것도 못 잡는다(CodeRabbit)
      if (cr.width < 1 || cr.height < 1) fails.push(`${brandOf(c)}: 넘김의 크기가 0이다(${Math.round(cr.width)}x${Math.round(cr.height)})`)
      const narrow = slides.filter((sl) => sl.getBoundingClientRect().width < cr.width * 0.5).length
      if (narrow) fails.push(`${brandOf(c)}: 넘김 장 ${narrow}개의 폭이 무너졌다(넘김 폭 ${Math.round(cr.width)}px)`)
      if (c.scrollLeft > 2 || dot > 0 || hitIdx > 0) fails.push(`${brandOf(c)}: 넘김이 첫 장이 아니다(scrollLeft ${Math.round(c.scrollLeft)}, 점 ${dot + 1}, 가운데 장 ${hitIdx + 1})`)
    }
    // ?expect=carousel: 시험 데이터는 넘김 카드가 맨 위다. 없으면 검사가 헛돈 것이라 실패로 친다
    if (q.get('expect') === 'carousel' && carousels.length === 0) fails.push('첫 화면에 넘김 카드가 없다(검사 대상 없음)')
    const inView = (el) => {
      const r = el.getBoundingClientRect()
      return r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0
    }
    const textsOf = (el) => [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim())
    const couponText = { amounts: 0, minimums: 0 }
    for (const amt of document.querySelectorAll('.cc-amt')) {
      if (!inView(amt.closest('.cc-ticket') || amt)) continue
      const small = amt.querySelector('small')
      const text = textsOf(amt.querySelector('s') || amt)[0]
      if (!small) continue
      couponText.amounts++
      const digits = text && rectOf(text)
      const unit = rectOf(small)
      if (!digits || digits.width <= 0) fails.push(`${brandOf(amt)}: 금액 텍스트 폭이 0이다`)
      if (unit.width <= 0) fails.push(`${brandOf(amt)}: 할인 단위 텍스트 폭이 0이다`)
      if (digits && cross(digits, unit)) fails.push(`${brandOf(amt)}: 금액 "${text.textContent.trim()}"과 "${small.textContent}"가 겹친다`)
    }
    for (const min of document.querySelectorAll('.cc-min')) {
      if (!inView(min.closest('.cc-ticket') || min)) continue
      couponText.minimums++
      const texts = textsOf(min)
      if (!texts.length || texts.some((text) => rectOf(text).width <= 0)) fails.push(`${brandOf(min)}: 최소주문 텍스트 폭이 0이다`)
    }
    if (q.get('expect') === 'coupon-text') {
      if (!couponText.amounts) fails.push('쿠폰 금액과 단위가 없다(검사 대상 없음)')
      if (!couponText.minimums) fails.push('최소주문 문구가 없다(검사 대상 없음)')
    }
    if (q.get('sheet') && !document.querySelector('.cc-sheet .cc-t-chips')) fails.push(`${q.get('sheet')}: 상세 시트의 표를 못 열었다(검사 대상 없음)`)
    for (const chips of document.querySelectorAll('.cc-t-chips')) {
      const cell = chips.getBoundingClientRect()
      for (const ch of chips.children) {
        const r = ch.getBoundingClientRect()
        if (r.right > cell.right + 1) fails.push(`${brandOf(chips)}: 표 칩 "${ch.textContent}"이 칸을 ${Math.round(r.right - cell.right)}px 넘는다`)
      }
    }
    const vv = window.visualViewport
    // 첫 방문에서만 깨졌다(2026-10-16). 그 순간의 스타일, 글꼴, 시각을 남긴다
    const diag = { sheets: document.styleSheets.length, fonts: document.fonts ? document.fonts.status : null,
      cardsAt: cardsAt == null ? null : cardsAt - t0, measuredAt: Date.now() - t0 }
    return { url: location.href, scene, w: innerWidth, vv: vv ? { x: Math.round(vv.offsetLeft), scale: vv.scale } : null, ua: navigator.userAgent, carousels, diag, fails }
  }

  function report(res) {
    const box = document.createElement('pre')
    box.style.cssText = 'position:fixed;left:4px;right:4px;bottom:90px;z-index:2147483647;margin:0;padding:6px 8px;font:11px/1.35 monospace;white-space:pre-wrap;border-radius:6px;color:#fff;background:' + (res.fails.length ? 'rgba(190,20,20,.92)' : 'rgba(20,120,40,.92)')
    box.textContent = (res.fails.length ? 'LAYOUT FAIL\n' + res.fails.join('\n') : 'LAYOUT OK ' + JSON.stringify(res.carousels))
      + (res.scene ? '\n' + JSON.stringify(res.scene) : '')
    document.body.appendChild(box)
    fetch('http://localhost:8099/report', { method: 'POST', body: JSON.stringify(res) }).catch(() => {})
  }

  // 카드가 뜰 때까지(최대 15초) 기다렸다가 잰다. 고정 9초는 첫 방문(사파리, 가짜 API, 글꼴이 다 처음)에 카드가
  // 아직 없어 "카드 0장"으로 실패했다(2026-10-16 PR #86 검사). load 이벤트에는 기대지 않는다(첫 탭만 보고했다).
  // ?sheet=<브랜드> 면 카드가 뜬 1초 뒤 그 카드의 "자세히" 시트를 연다.
  const t0 = Date.now()
  let cardsAt = null
  const ready = (cb) => {
    if (document.querySelector('article[data-brand]') || Date.now() - t0 > 15000) { cardsAt = Date.now(); cb() }
    else setTimeout(() => ready(cb), 300)
  }
  const names = () => [...document.querySelectorAll('article[data-brand]')].map((a) => a.dataset.brand).join('|')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  async function pressTab(n, scene, fails) {
    // 오퍼가 적은 분류 탭은 숨긴다(#178). 고정 데이터에서는 버튼 수가 n보다 적을 수 있어, 있는 마지막 분류 버튼을 누른다
    // (0은 전체라 분류가 하나도 없으면 실패한다). 2026-10-26 4번째 버튼이 없어 이 장면이 "전환 안 됨"으로 실패했다.
    const items = document.querySelectorAll('.menu-bar__item')
    const btn = items[Math.min(n, items.length - 1)]
    const before = names()
    if (btn) btn.click()
    await sleep(1000)
    scene.tab = { index: n, pressedIndex: btn ? [...items].indexOf(btn) : null, pressedText: btn ? btn.textContent.trim() : null }
    if (!btn || btn === items[0] || btn.getAttribute('aria-pressed') !== 'true' || !document.querySelector('article[data-brand]') || names() === before) {
      fails.push('다른 카테고리 장면이 전환되지 않았다(검사 대상 없음)')
    }
  }

  // 목록은 끝 표지가 가까워질 때 한 묶음씩 늘어난다. 높이가 5번 연속 그대로일 때까지 내린다(최대 15초)
  async function scrollEnd(scene, fails) {
    const el = document.documentElement
    let last = -1, same = 0, steps = 0
    const end = Date.now() + 15000
    while (same < 5 && Date.now() < end) {
      scrollTo(0, el.scrollHeight)
      await sleep(150)
      steps++
      same = el.scrollHeight === last ? same + 1 : 0
      last = el.scrollHeight
    }
    scene.scroll = { y: Math.round(scrollY), height: el.scrollHeight, steps }
    if (same < 5 || scrollY + innerHeight < el.scrollHeight - 2) fails.push('맨 아래까지 못 갔다')
    if (el.scrollHeight <= innerHeight) fails.push('내릴 것이 없다(목록이 한 화면보다 짧다)')
  }

  ready(async () => {
    const scene = {}, fails = []
    if (q.get('sheet')) {
      setTimeout(() => {
        const card = document.querySelector(`article[data-brand="${q.get('sheet')}"]`)
        const hint = card && card.querySelector('.cc-hint')
        if (hint) hint.click()
      }, 1000)
    }
    try {
      if (q.get('tab')) await pressTab(Number(q.get('tab')), scene, fails)
      if (q.get('scroll') === 'end') await scrollEnd(scene, fails)
    } catch (e) { fails.push('장면 동작 오류: ' + e.message) }
    setTimeout(() => {
      let res
      try { res = measure(Object.keys(scene).length ? scene : undefined, fails) } catch (e) { res = { url: location.href, fails: ['검사 오류: ' + e.message] } }
      report(res)
    }, 3000)
  })
})()
