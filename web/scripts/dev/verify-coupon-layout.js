// Safari 웹 속성 콘솔에서 실행한다. 화면 안에 있는 쿠폰의 실제 글자 배치를 검사한다.
(() => {
  const failures = []
  let checked = 0
  const textBounds = (element) => {
    const node = [...element.childNodes].find((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim())
    if (!node) return null
    const range = document.createRange()
    range.selectNodeContents(node)
    return range.getBoundingClientRect()
  }
  for (const amount of document.querySelectorAll('.cc-amt')) {
    const box = amount.getBoundingClientRect()
    if (box.bottom <= 0 || box.top >= innerHeight || box.right <= 0 || box.left >= innerWidth) continue
    const suffix = amount.querySelector('small')
    if (!suffix) continue
    checked++
    const digits = textBounds(amount.querySelector('s') ?? amount)
    const unit = textBounds(suffix)
    const ticket = amount.closest('.cc-ticket')
    const brand = amount.closest('.cc')?.querySelector('.cc-nm')?.textContent ?? '상세 쿠폰'
    if (!digits || !unit || digits.width <= 0 || unit.width <= 0 || unit.left < digits.right - 1) {
      failures.push(`${brand}: 할인 금액과 단위의 폭이 사라지거나 겹침`)
    }
    const minimum = ticket?.querySelector('.cc-min')
    if (minimum?.textContent.trim() && !(textBounds(minimum)?.width > 0)) {
      failures.push(`${brand}: 최소주문 텍스트 폭 소실`)
    }
  }
  if (!checked) throw new Error('화면 안에 검사할 할인 쿠폰이 없습니다')
  if (failures.length) throw new Error(failures.join('\n'))
  return { checked, result: 'PASS' }
})()
