// 홈 목록 훅: 해시 딥링크, 숨기기 애니메이션, 카드 나눠 그리기. App.jsx에서 뺐다(#456).
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { track } from './analytics.js'
import { captureRects, playShift, readCards } from './cardShift.js'
import { hideBrand } from './hiddenBrands.js'
import { brandCardId } from './cardId.js'

// 카드가 사라지는 시간(App.css의 brand-card-leave와 같은 값)과, 그 뒤 남은 카드가
// 움직이기까지 쉬는 시간. 사라지는 건 접히듯 말고 뿅 하고 빠지게 짧게, 그다음
// 한 박자 쉬고 밀어 올린다(2026-09-25 사용자).
const LEAVE_MS = 100
const SHIFT_PAUSE_MS = 400

// 한 번에 그리는 브랜드 카드 수. 화면에 두 줄쯤 들어간다.
const BRAND_PAGE = 12
// 타이머로 바로 채우는 몫. 360px 화면 세 장 남짓이다. 그 뒤는 스크롤이 가까워질 때 채운다.
const FIRST_FILL = 24

// '#brand-이름' 해시만 카드 id로 본다. 깨진 퍼센트 인코딩은 없는 것으로 친다.
export function linkedFromHash(hash) {
  const raw = hash.slice(1)
  try { return raw.startsWith('brand-') ? decodeURIComponent(raw) : null }
  catch { return null }
}

export function useLinkedBrandHash() {
  // URL 해시(#brand-이름)로 카드 하나를 콕 집어 공유할 수 있게 한다.
  // 해시가 바뀌면(같은 페이지 안에서 다른 링크로 다시 들어와도) 다시
  // 반영한다 — 새로고침 없이 링크만 바꿔도 그 카드로 스크롤돼야 한다.
  const [linkedBrand, setLinkedBrand] = useState(null)
  useEffect(() => {
    const applyHash = () => setLinkedBrand(linkedFromHash(window.location.hash))
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])
  return [linkedBrand, setLinkedBrand]
}

export function useHideAnimation(setAsking, setHidden) {
  // 카드가 쪼그라들어 사라진 뒤에 목록에서 뺀다. 바로 빼면 아래 카드들이
  // 순간이동해서 무엇이 사라졌는지 눈이 못 따라간다.
  const gridRef = useRef(null)
  const [leaving, setLeaving] = useState(null)
  const onHideChoose = useCallback((rule) => {
    setAsking((ask) => {
      if (!ask) return null
      const quick = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      track('brand_hide', { brand: ask.name, rule })
      const commit = () => {
        const first = captureRects(readCards(gridRef.current))
        // flushSync로 지금 당장 그리게 한다. requestAnimationFrame에 맡기면 React가
        // 아직 안 그린 옛 목록을 다시 재서 움직인 카드가 하나도 없다고 나온다
        // (2026-09-24 실측: 카드는 사라지는데 나머지가 안 미끄러졌다).
        flushSync(() => {
          setLeaving(null)
          setHidden((prev) => hideBrand(prev, ask.name, { amount: ask.amount, rule }))
        })
        playShift(gridRef.current, first, quick ? 0 : 260)
      }
      // 카드가 끝까지 사라지고, 한 박자 쉰 뒤에 남은 카드가 제자리를 찾는다.
      // 사라지는 것과 밀려 올라오는 것이 겹치면 한꺼번에 움직여 어수선하다.
      if (quick) commit()
      else { setLeaving(ask.name); window.setTimeout(commit, LEAVE_MS + SHIFT_PAUSE_MS) }
      return null
    })
  }, [])
  return { gridRef, leaving, onHideChoose }
}

export function useIncrementalRender(visibleBrands, gridKey, linkedBrand) {
  // 카드를 나눠 그린다.
  //
  // 브랜드가 50개를 넘고 카드마다 오퍼 칩·로고·펼침 상태가 붙는다. 전부
  // 한 번에 그리면 첫 화면에 안 보이는 것까지 만드느라 진입이 늦어진다.
  // 화면에 두 줄쯤 들어가므로 열두 장이면 첫 화면이 채워진다.
  const [shown, setShown] = useState(BRAND_PAGE)

  // 분류를 바꾸면 처음부터 다시 센다 — 앞 목록에서 많이 펼쳐 놨다고
  // 새 목록까지 그만큼 그릴 이유가 없다.
  useEffect(() => { setShown(BRAND_PAGE) }, [gridKey])

  // 딥링크(#brand-이름)로 들어온 브랜드가 아직 안 그려졌으면 스크롤이
  // 갈 곳이 없다. 그 자리까지는 펼쳐 둔다.
  useEffect(() => {
    if (!linkedBrand || !visibleBrands) return
    const at = visibleBrands.findIndex((b) => brandCardId(b.name) === linkedBrand)
    if (at >= 0) setShown((n) => Math.max(n, at + 1))
  }, [linkedBrand, visibleBrands])

  // 첫 화면을 그린 뒤, 한가할 때 나머지를 묶음으로 채운다.
  //
  // 스크롤에 묶는 방식을 두 번 시도했다가 접었다. IntersectionObserver는
  // 관찰 지점이 화면에 걸쳐 있는 동안 콜백이 되풀이돼 목록이 통째로
  // 그려졌고, 스크롤 이벤트로 바꾸니 로드 중 앱이 스스로 부르는
  // scrollTo에도 반응해 같은 일이 났다. 거리 잠금을 걸었더니 이번에는
  // 렌더가 멈췄다(2026-09-01, 셋 다 실측).
  //
  // 지연의 목적은 첫 화면을 빨리 그리는 것이지 끝까지 안 그리는 것이
  // 아니다. requestIdleCallback은 브라우저가 한가할 때만 부르므로 첫
  // 화면과 상호작용을 안 막고, 스크롤과 얽히지 않아 되풀이가 없다.
  // 다 채우면 스스로 멈춘다.
  // requestIdleCallback을 쓰다 접었다. 한가한 틈이 안 오면 영영 안 불려
  // 목록이 첫 묶음에서 멈춘다 — 실측에서 12장에 멈춘 채 끝났다. 타이머는
  // 반드시 돈다. 한 묶음씩이라 한 번에 몰아 그리지 않는 목적은 그대로다.
  //
  // 2026-10-02: 처음부터 끝까지 타이머로 채우니 화면이 뜬 뒤 약 3초 동안 메인 스레드가 묶였다
  // (총 차단 시간, 실제 속도 제한 측정). 첫 화면 몫(FIRST_FILL장)까지만 타이머로 채우고, 그다음은
  // 목록 끝 표지가 화면 아래 1,500px 안에 들어올 때 한 묶음씩 더한다.
  // 2026-09-01 실패 셋을 피하는 방법:
  // - 콜백 되풀이: 관찰을 shown이 바뀔 때마다 새로 세우고, 콜백은 한 번 쓰면 끊는다(once).
  // - scrollTo 반응: 스크롤 이벤트를 쓰지 않는다.
  // - 렌더 멈춤: 거리 잠금 대신 관찰이 shown마다 다시 서므로 표지가 여전히 보이면 다음 묶음이 온다.
  const sentinelRef = useRef(null)
  useEffect(() => {
    if (!visibleBrands || shown >= visibleBrands.length) return
    if (shown < FIRST_FILL || typeof IntersectionObserver === 'undefined') {
      const id = window.setTimeout(() => setShown((n) => n + BRAND_PAGE), 150)
      return () => window.clearTimeout(id)
    }
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      setShown((n) => n + BRAND_PAGE)
    }, { rootMargin: '0px 0px 1500px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visibleBrands, shown])
  return { shown, sentinelRef }
}
