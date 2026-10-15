// iOS 배치 검사(2026-10-15). ios-shot의 local 모드가 빌드한 index.html <head> 맨 앞에 넣는다. 운영 빌드에는 없다.
// 사진만으로는 같은 깨짐이 되풀이됐다(넘김이 둘째 장으로 열림, 금액과 "원 할인" 겹침, 표 칩 넘침).
// 실제 iOS 사파리 안에서 구조를 재서 러너(localhost:8099)로 보내고, 화면 아래에도 적어 사진에 남긴다.
// ?css=<CSS> 를 주면 앱보다 먼저 스타일을 넣는다. 고칠 후보 여럿을 한 번의 실행에서 주소만 바꿔 견준다.
(function () {
  const q = new URLSearchParams(location.search)
  const css = q.get('css')
  if (css) {
    const st = document.createElement('style')
    st.textContent = css
    (document.head || document.documentElement).appendChild(st)
  }
  const rectOf = (node) => {
    const r = document.createRange()
    r.selectNodeContents(node)
    return r.getBoundingClientRect()
  }
  const cross = (a, b) => a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1
  const brandOf = (el) => el.closest('[data-brand]')?.dataset.brand || '?'

  function measure() {
    const fails = []
    const over = document.documentElement.scrollWidth - innerWidth
    if (over > 1) fails.push(`page: 가로 넘침 ${over}px`)
    const grid = document.querySelector('.brand-grid')
    const gw = grid ? grid.getBoundingClientRect().width : innerWidth
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
      carousels.push({ brand: brandOf(c), scrollLeft: Math.round(c.scrollLeft), width: Math.round(c.clientWidth), dot })
      if (c.scrollLeft > 2 || dot > 0) fails.push(`${brandOf(c)}: 넘김이 첫 장이 아니다(scrollLeft ${Math.round(c.scrollLeft)}, 점 ${dot + 1})`)
    }
    for (const amt of document.querySelectorAll('.cc-amt')) {
      if (amt.getBoundingClientRect().top > innerHeight) continue
      const small = amt.querySelector('small')
      const text = [...amt.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
      if (small && text && cross(rectOf(text), small.getBoundingClientRect())) fails.push(`${brandOf(amt)}: 금액 "${text.textContent.trim()}"과 "${small.textContent}"가 겹친다`)
    }
    for (const chips of document.querySelectorAll('.cc-t-chips')) {
      const cell = chips.getBoundingClientRect()
      for (const ch of chips.children) {
        const r = ch.getBoundingClientRect()
        if (r.right > cell.right + 1) fails.push(`${brandOf(chips)}: 표 칩 "${ch.textContent}"이 칸을 ${Math.round(r.right - cell.right)}px 넘는다`)
      }
    }
    return { url: location.href, w: innerWidth, ua: navigator.userAgent, carousels, fails }
  }

  function report(res) {
    const box = document.createElement('pre')
    box.style.cssText = 'position:fixed;left:4px;right:4px;bottom:90px;z-index:2147483647;margin:0;padding:6px 8px;font:11px/1.35 monospace;white-space:pre-wrap;border-radius:6px;color:#fff;background:' + (res.fails.length ? 'rgba(190,20,20,.92)' : 'rgba(20,120,40,.92)')
    box.textContent = res.fails.length ? 'LAYOUT FAIL\n' + res.fails.join('\n') : 'LAYOUT OK ' + JSON.stringify(res.carousels)
    document.body.appendChild(box)
    fetch('http://localhost:8099/report', { method: 'POST', body: JSON.stringify(res) }).catch(() => {})
  }

  addEventListener('load', () => {
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve()
    fonts.then(() => setTimeout(() => report(measure()), 3000))
  })
})()
