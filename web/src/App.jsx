import { Suspense, lazy, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { API_BASE, fetchBanners, fetchBrands, fetchSurveyStatus } from './api.js'
import { setFilterContext, track } from './analytics.js'
import EventBanner from './EventBanner.jsx'
import BrandSuggestions from './BrandSuggestions.jsx'
import { PLATFORMS } from './logos.jsx'
import TopBarA from './TopBarA.jsx'
const FilterSheet = lazy(() => import('./FilterSheet.jsx'))
import { useBrandAutocomplete } from './useBrandAutocomplete.js'
import { CATEGORIES, applyFilters, defaultFilters, includesFrom, isDefaultFilters, primarySort, sortSignature, displayBestAmount } from './filters.js'
const SurveyDock = lazy(() => import('./SurveyDock.jsx'))
const HiddenBrandsSheet = lazy(() => import('./HiddenBrandsSheet.jsx'))
const HideBrandAsk = lazy(() => import('./HideBrandAsk.jsx'))
const CouponCard = lazy(() => import('./CouponCard.jsx'))
import { applyHidden, hideBrand, readHidden, revivedNames, setRule, showBrand } from './hiddenBrands.js'
import { captureRects, playShift, readCards } from './cardShift.js'

// 카드가 사라지는 시간(App.css의 brand-card-leave와 같은 값)과, 그 뒤 남은 카드가
// 움직이기까지 쉬는 시간. 사라지는 건 접히듯 말고 뿅 하고 빠지게 짧게, 그다음
// 한 박자 쉬고 밀어 올린다(2026-09-25 사용자).
const LEAVE_MS = 100
const SHIFT_PAUSE_MS = 400
import SurveyCard from './SurveyCard.jsx'
import { getStoredCode, markAnswered, shouldShow as surveyShouldShow } from './surveyDismiss.js'
import { getAnalyticsContext } from './analytics-context.js'
import PushNotificationSetting from './PushNotificationSetting.jsx'
import BrandCard, { brandCardId } from './BrandCard.jsx'
import BrandGridSkeleton from './BrandGridSkeleton.jsx'
import { setHubLinks } from './offerLink.js'
import SiteFooter from './SiteFooter.jsx'

// 서버 렌더에서는 layout effect가 돌지 않고 경고만 남긴다. 서버에선 그냥 effect로 둔다.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

// 한 번에 그리는 브랜드 카드 수. 화면에 두 줄쯤 들어간다.
const BRAND_PAGE = 12
// 타이머로 바로 채우는 몫. 360px 화면 세 장 남짓이다. 그 뒤는 스크롤이 가까워질 때 채운다.
const FIRST_FILL = 24

function analyticsFilterContext(filters) {
  return {
    fCategory: filters.categories.size === 0 ? 'all' : [...filters.categories].sort().join('+'),
    fPlatforms: filters.platforms.size,
    fSearch: filters.search.trim() !== '' || undefined,
    fSort: sortSignature(filters.sorts),
  }
}

// 주소에서 브랜드 이름을 읽는다 — /brand/열정국밥.
//
// 이 주소는 크롤러용 정적 페이지가 이미 쓰고 있던 것이다. 예전에는 그
// 정적 HTML이 앱과 아무 상관 없는 쌍둥이라, 검색으로 들어온 사람이
// JavaScript도 없는 막다른 페이지에 떨어졌다. 브랜드마다 URL이 둘(앱은
// /#이름, 크롤러는 /brand/이름.html)이었던 셈이고, 그 구조가 doorway
// page로 읽힌다.
//
// 같은 주소에서 앱이 뜨게 해 하나로 합친다. 새 화면을 만들지 않고 검색
// 필터를 그 브랜드로 채워 여는 것으로 충분하다 — 카드도 앱 링크도 계측도
// 홈과 같은 코드를 쓰고, 검색어를 지우면 전체 목록으로 이어져 막다른
// 길이 아니다.
//
// 라우터 라이브러리는 안 넣는다. 경로가 "/"와 "/brand/*" 둘뿐이라
// pathname 한 줄이면 갈린다.
export function brandFromPath(pathname) {
  const m = /^\/brand\/([^/]+?)(?:\.html)?\/?$/.exec(pathname)
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    // 인코딩이 깨진 주소는 브랜드가 아니라 오타다. 홈처럼 연다.
    return null
  }
}

function routeFilters() {
  const brand = typeof window === 'undefined'
    ? null
    : brandFromPath(window.location.pathname)
  return brand ? { ...defaultFilters(), search: brand } : defaultFilters()
}

// initial은 서버 렌더(SSR, api/ssr.js)가 요청 시점에 받은 데이터다. 있으면 첫 화면을 그걸로
// 그리고 같은 값을 다시 부르지 않는다. 첫 렌더는 서버와 같아야 하므로 브라우저에만 있는 값
// (localStorage, 시각, 화면 폭)은 전부 effect에서 읽는다.
export default function App({ initial = null }) {
  const [brands, setBrands] = useState(initial?.brands ?? null)
  // null은 아직 못 받음(자리만 잡는다), []는 받았는데 0건.
  const [banners, setBanners] = useState(initial?.banners ?? null)
  const [error, setError] = useState(null)
  // 설문을 띄울지. 서버가 "대상이다"라고 답할 때만 켠다 — 기본은 안 그린다.
  const [surveyOn, setSurveyOn] = useState(false)
  // 발급된 기프티콘 번호. 카드가 아니라 여기에 둔다 — 카드는 필터가 바뀔 때마다
  // 새로 마운트되는 상자(brand-grid) 안에 있어서, 카드가 들고 있으면 분류 한 번에
  // 번호가 날아간다. 연락처를 안 받으므로 그러면 다시 줄 방법이 없다.
  // 진행 중이던 답까지 지켜주진 않는다(그리드 안이라 필터를 바꾸면 그것도
  // 새로 마운트된다) — 다만 그건 다시 고르면 그만이라 코드만큼 무겁지 않다.
  // 이미 받은 코드가 있으면 처음부터 채워 둔다 — 응답 화면으로 곧장
  // 열리진 않는다(그건 아래 트리거 알약이 한다). 새로 발급된 코드는
  // SurveyCard가 열려 있는 채로 onCode로 이 값을 바꾸므로, 그 경우는
  // 이미 화면이 카드 위에 있다 — 여기서 따로 열 필요가 없다.
  const [surveyCode, setSurveyCode] = useState(() => getStoredCode())

  // 서버에 적힌 내 코드를 가져와 화면과 저장본을 맞춘다. visitorId까지 지운
  // 사람은 서버도 누군지 못 가린다 — 그 경우는 확인요청이 유일한 길이라
  // 코드 화면에 안내를 같이 띄운다(SurveyCard).
  async function syncCodeFromServer() {
    const { visitorId } = getAnalyticsContext()
    if (!visitorId) return
    try {
      const res = await fetch(`${API_BASE}/api/survey/code?visitorId=${encodeURIComponent(visitorId)}`)
      const body = await res.json()
      if (body.code && body.code !== getStoredCode()) {
        markAnswered(body.code)
        setSurveyCode(body.code)
      }
    } catch {
      // 못 가져오면 저장본을 그대로 쓴다 — 네트워크 때문에 화면이 빌 이유는 없다.
    }
  }
  // 트리거 알약을 눌렀는지. 그리드 맨 앞칸에 카드를 놓을지를 이걸로 정한다.
  const [surveyOpen, setSurveyOpen] = useState(false)

  useEffect(() => {
    // 이미 코드를 받은 사람에게는 알약이 계속 뜬다 — "링크 다시
    // 확인하기"로 문구만 바뀐다(SurveyDock). 재고·자격을 다시 안
    // 묻는다 — 이미 확정된 결과라 물어볼 이유가 없다. 예전엔 답하면
    // 알약이 영구히 사라져서, 연락처를 안 받는 이 서비스에서 링크를
    // 놓치면 다시 볼 길이 없었다.
    if (getStoredCode()) {
      setSurveyOn(true)
      // 서버가 정본이다. localStorage 사본이 낡을 수 있다 — 2026-09-02에
      // 서버가 발급 기록을 잃고 같은 링크를 다음 사람에게 다시 내준 적이
      // 있어(중복 발급), 그때 먼저 받은 사람 브라우저에는 남의 것이 된
      // 링크가 남아 있다. 서버 값이 다르면 그쪽으로 덮는다.
      syncCodeFromServer()
      return
    }
    // 개발자 콘솔에서 이 브라우저만 강제로 띄우는 문. 서버 대상 판정도
    // 안 묻는다 — 재고·조건과 무관하게 화면만 보고 싶을 때 쓴다.
    //   localStorage.setItem('dk_survey_force', '1')
    // 끌 때: localStorage.removeItem('dk_survey_force')
    // 다른 사용자에겐 아무 영향 없다 — localStorage는 이 브라우저 안에만 있다.
    if (localStorage.getItem('dk_survey_force') === '1') {
      setSurveyOn(true)
      return
    }
    // 두 번 닫았거나 최근에 닫았으면 서버에 묻지도 않는다.
    if (!surveyShouldShow()) return
    let alive = true
    const { visitorId } = getAnalyticsContext()
    fetchSurveyStatus(visitorId)
      .then((s) => { if (alive) setSurveyOn(Boolean(s.eligible)) })
      // 못 물어보면 안 띄운다. 설문이 안 뜨는 것은 사용자에게 아무 손해가 없다.
      .catch(() => {})
    return () => { alive = false }
  }, [])
  // 앱·분류·정렬·검색을 한 덩어리로 든다. 시트가 draft를 만들어 통째로
  // 돌려주므로 낱개 상태로 쪼개 두면 "적용" 한 번에 여러 setState가 나가
  // 중간 상태로 한 번 더 그려진다.
  const [filters, setFilters] = useState(routeFilters)
  // 필터 시트(옛 B안을 A 바에 병합, 2026-09-16). 시트가 draft를 만들어
  // 통째로 돌려주므로 "적용" 한 번에 setFilters 한 번이다.
  const [sheetOpen, setSheetOpen] = useState(false)
  const applyFromSheet = (draft) => {
    setFilters(draft)
    setSheetOpen(false)
    track('filters_apply', {
      platforms: draft.platforms.size,
      categories: draft.categories.size,
      sort: sortSignature(draft.sorts),
      random: draft.includeRandom,
      menu: draft.includeMenu,
      min5k: draft.minAmount5k,
    })
  }
  // /brand/<이름>으로 들어왔을 때만 값이 있다. 검색으로 들어온 사람에게
  // 전체 목록으로 나가는 길을 눈에 보이게 두려는 것이다 — 검색어를 지우고
  // 엔터까지 쳐야 전체가 나오는데(입력 초안과 확정 필터가 갈려 있다),
  // 그걸 모르면 브랜드 하나만 보고 나간다. 크롤러에게도 이 페이지가
  // 막다른 곳이 아니라는 표시가 된다.
  const [routeBrand] = useState(() => (
    typeof window === 'undefined' ? null : brandFromPath(window.location.pathname)
  ))

  const { search } = filters
  const [dev, setDev] = useState(false)
  // 서버 렌더링 첫 화면은 늘 운영 카드다(하이드레이션 일치). 마운트 뒤 주소에 ?home=a가 있으면 쿠폰 카드로 바꾼다. 반반 배정은 5단계.
  const [homeA, setHomeA] = useState(false)
    useEffect(() => {
    try { const q = new URLSearchParams(window.location.search); if (q.get('home') === 'a') startTransition(() => setHomeA(true)) } catch { /* 주소를 못 읽으면 운영 카드 */ }
  }, [])
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { startTransition(() => setDev(Boolean(getAnalyticsContext().dev))) }, [])
  const setSearch = (v) => setFilters((f) => ({ ...f, search: typeof v === 'function' ? v(f.search) : v }))


  // 새벽(00~07시) 안내. 수집이 00:01에 돌아 그 사이 값이 지난주 것일 수 있다 — 화면에 그렇다고
  // 말해 둔다. 시각은 1분마다 다시 본다(열어 둔 채 07시를 넘기면 사라져야 한다).
  // 서버 시계는 UTC라 첫 렌더에 쓰면 하이드레이션이 어긋난다. 브라우저에서 곧바로 다시 본다.
  const [isNight, setIsNight] = useState(false)
  useEffect(() => {
    startTransition(() => setIsNight(new Date().getHours() < 7))
    const id = setInterval(() => setIsNight(new Date().getHours() < 7), 60_000)
    return () => clearInterval(id)
  }, [])

  // "맨 위로" 버튼은 한참 내려갔을 때만 — 조금 내려간 상태에선 방해다.
  const [scrolledFar, setScrolledFar] = useState(false)
  useEffect(() => {
    const onScroll = () => {
      setScrolledFar(window.scrollY > 400)
      // 고무줄 스크롤 차단(html/body의 overscroll-behavior:none, App.css)은
      // 흔들 때 타이틀바가 같이 밀리는 걸 막지만, 그 값 그대로 두면 당겨서
      // 새로고침(pull-to-refresh)도 같이 막힌다. 맨 위(scrollY 0)일 때만
      // 풀어준다 — 그 지점에서만 아래로 당기는 제스처가 새로고침 의도이고,
      // 스크롤이 이미 내려간 상태의 흔들림 방지는 그대로 유지된다.
      // documentElement가 아니라 body에 건다 — html(루트)이 auto일 때만
      // "뷰포트 오버스크롤 값은 body를 따른다"는 전파 규칙이 적용된다.
      // (App.css에서 html에는 이제 규칙을 안 준다.)
      document.body.style.overscrollBehaviorY = window.scrollY <= 0 ? 'auto' : 'none'
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // 타이틀바는 position:fixed다 — sticky는 문서에 붙어 있어서 오버스크롤이나
  // 스크롤 지연에 함께 밀렸다. 흐름에서 빠진 높이는 스페이서가 대신 차지하고,
  // 그 높이는 바를 실측해 따라간다.
  const titleBarRef = useRef(null)
  useIsoLayoutEffect(() => {
    const el = titleBarRef.current
    if (!el) return
    // 높이는 React 상태가 아니라 CSS 변수로 넘긴다. 서버 렌더 HTML은 JS 전까지 바를 흐름 안에
    // 두고(base.css :root:not([data-bar])), 여기서 높이와 data-bar를 같은 프레임에 넣어 fixed로
    // 바꾼다. 바가 빠진 자리를 스페이서가 같은 높이로 받으므로 아래가 움직이지 않는다.
    const setBarHeight = (h) => {
      document.documentElement.style.setProperty('--bar-h', `${h}px`)
      document.documentElement.dataset.bar = '1'
    }
    const ro = new ResizeObserver(([entry]) => setBarHeight(entry.target.getBoundingClientRect().height))
    ro.observe(el)
    setBarHeight(el.getBoundingClientRect().height)
    return () => ro.disconnect()
  }, [])

  const isFiltered = !isDefaultFilters(filters)
  const resetFilters = () => {
    setFilters(defaultFilters())
    track('filters_reset')
  }
  // 첫 화면: 브랜드 경로(/brand/<이름>)면 전체 목록으로 나가고, 아니면
  // 필터·검색을 풀고 맨 위로. 시트가 열려 있으면 닫는다.
  const goHome = () => {
    track('home_click')
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.location.assign('/')
      return
    }
    setSheetOpen(false)
    setFilters(defaultFilters())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // URL 해시(#brand-이름)로 카드 하나를 콕 집어 공유할 수 있게 한다.
  // 해시가 바뀌면(같은 페이지 안에서 다른 링크로 다시 들어와도) 다시
  // 반영한다 — 새로고침 없이 링크만 바꿔도 그 카드로 스크롤돼야 한다.
  const [linkedBrand, setLinkedBrand] = useState(null)
  useEffect(() => {
    const applyHash = () => {
      const raw = window.location.hash.slice(1)
      setLinkedBrand(raw ? decodeURIComponent(raw) : null)
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])

  // reloadKey를 올리면 다시 부른다 — 실패 화면의 "다시 시도" 버튼용.
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    if (reloadKey === 0 && initial?.brands) return
    let alive = true
    setError(null)
    setBrands(null)
    fetchBrands()
      .then((v) => { if (alive) setBrands(v) })
      .catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [reloadKey])

  // 배너 실패는 삼킨다. 카드 그리드와 달리 배너는 부가 정보라, 못 불러왔다는
  // 사실을 화면에 띄울 이유가 없다 — 빈 목록과 같게 다룬다.
  useEffect(() => {
    // SSR이 실어 준 배너는 main.jsx가 하이드레이션 전에 허브 주소까지 반영했다.
    if (initial?.banners) return
    // 배너를 받으면 허브 주소도 같이 갱신한다 — 브랜드별 링크가 없는
    // 칩이 그 주소로 간다(setHubLinks 주석 참고).
    fetchBanners()
      .then((got) => { setHubLinks(got); setBanners(got) })
      .catch(() => setBanners([]))
  }, [])


  // category는 API가 brands.yml에서 읽어 내려준다. 분류가 없는 브랜드는
  // null이라 "전체"에서만 보인다. 검색은 항상 같이 적용된다.
  // 플랫폼 토글은 카드를 거르는 게 아니라 그 앱의 오퍼를 켜고 끈다.
  // 전에는 "켜진 앱 오퍼가 하나라도 있으면 카드를 통째로 남긴다"라서,
  // 배민을 꺼도 배민 칩이 그대로 붙어 있었다 — 끈 앱 금액이 화면에
  // 남아 있으면 토글이 무슨 일을 했는지 알 수 없다.
  //
  // 오퍼를 걷어내고 나서 남는 게 없는 카드는 뺀다. 그 브랜드에서 볼
  // 것이 하나도 없는데 이름만 남기면 빈 카드가 격자를 채운다.
  // 입력 중인 문자열이 아니라 사용자가 확정한 검색만 센다. 원문은 보내지
  // 않고 길이만 남겨, 검색 행동은 분석하되 자유 입력 개인정보는 수집하지 않는다.
  const submitSearch = (raw, submitMethod) => {
    const query = raw.trim()
    // 검색을 확정하면 켜둔 분류를 푼다.
    //
    // 둘을 AND로 걸면 치킨을 켜둔 채 "피자"를 친 사람에게 0건이 나간다.
    // 실측(2026-08-24~25): 분류가 걸린 채 들어온 검색 13건이 예외 없이
    // 0건이었다. 검색은 "이걸 찾아 달라"는 말이라 다른 조건이 이기면
    // 안 된다.
    //
    // 조용히 무시하지 않고 상태에서 실제로 지운다. 그래야 검색창의 분류
    // 칩도 같이 사라져서, 화면이 말하는 것과 걸린 조건이 어긋나지 않는다.
    const nextFilters = query === ''
      ? { ...filters, search: query }
      : { ...filters, search: query, categories: new Set() }
    setFilters(nextFilters)
    if (query === '') return

    // 상태 반영 뒤 effect를 기다리면 이 이벤트만 이전 검색 맥락을 가진다.
    // 제출로 확정한 조건을 먼저 알려 같은 이벤트에도 최신 fSearch를 싣는다.
    setFilterContext(analyticsFilterContext(nextFilters))
    track('brand_search_submitted', {
      inputLength: query.length,
      resultCount: brands
        ? applyFilters(brands, nextFilters).length
        : undefined,
      submitMethod,
    })
  }

  // 조건이 하나라도 바뀌면 이 값이 바뀌고, 그러면 카드 격자가 새로
  // 마운트돼 등장 애니메이션이 다시 걸린다. 정렬만 바꿔도 순서가 통째로
  // 달라지므로 분류와 똑같이 "새 목록"으로 다룬다.
  // 링크를 누른 순간 어떤 조건이 걸려 있었는지가 "분류를 설정한 사람이
  // 실제로 이동까지 하는가"의 답이다. A안과 같은 키를 쓴다 — 이름이
  // 다르면 두 안을 나란히 못 놓는다.
  useEffect(() => {
    setFilterContext(analyticsFilterContext(filters))
  }, [filters])

  const gridKey = [
    [...filters.categories].sort().join('|'),
    [...filters.platforms].sort().join('|'),
    sortSignature(filters.sorts),
    filters.search.trim(),
  ].join('/')

  // 조건이 바뀌면 목록 자체가 갈리므로 보던 위치는 의미가 없다. 맨 위로
  // 올려 새 목록을 처음부터 보게 한다 — 첫 렌더에는 건너뛴다(들어오자마자
  // 스크롤이 튀면 안 된다).
  const firstGrid = useRef(true)
  useEffect(() => {
    if (firstGrid.current) {
      firstGrid.current = false
      return
    }
    window.scrollTo(0, 0)
  }, [gridKey])

  // 필터·정렬 규칙은 filters.js가 단일 출처다(시트·메뉴바와 같은 규칙).
  // 싫은 브랜드는 목록에서 걷어낸다. 브라우저에만 남는다(hiddenBrands.js).
  const [hidden, setHidden] = useState({})
  // startTransition: 하이드레이션이 덜 끝난 Suspense(필터 시트 등)에 급한 갱신이 닿으면
  // React가 그 경계를 버리고 다시 그린다(#421). 브라우저 값 반영은 급하지 않다.
  useEffect(() => { startTransition(() => setHidden(readHidden())) }, [])
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const bestOf = useCallback(
    (b) => displayBestAmount(b.offers, includesFrom(filters)), [filters])
  // 바로 숨기지 않는다. 어떻게 숨길지 물어본 뒤에 숨긴다.
  const [asking, setAsking] = useState(null)
  const onHide = useCallback((name, amount) => setAsking({ name, amount }), [])
  // 카드 memo가 먹게 참조를 고정한다. 렌더마다 새 객체나 함수를 넘기면 memo가 소용없다.
  const include = useMemo(() => includesFrom(filters), [filters])
  const clearLinked = useCallback(() => setLinkedBrand(null), [])
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

  const visibleBrands = useMemo(
    () => (brands ? applyHidden(applyFilters(brands, filters), hidden, bestOf) : brands),
    [brands, filters, hidden, bestOf],
  )

  // 숨겼는데 할인이 그때보다 커져서 다시 보이게 된 브랜드. 화면이 그 사실을 알린다.
  const revived = useMemo(
    () => (brands ? revivedNames(brands, hidden, bestOf) : []),
    [brands, hidden, bestOf],
  )

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


  // A안은 조건을 바에 전부 펼쳐 두고, B안은 바텀시트에 감춘다. 바 아래는
  // 두 안이 완전히 같다 — 카드도 배너도 계측도 하나의 코드를 쓴다. 갈라진
  // 브랜치로 두면 공통 부분을 고칠 때마다 두 번 하고, 한쪽을 빠뜨린다.

  return (
    <>
      {/* ?dev=1이 이 브라우저에 박혀 있으면 화면 귀퉁이에 표시한다 —
          안 그러면 개발 트래픽인지 실제 이용 화면인지 화면만 봐서는
          구분이 안 된다. 2026-09-02에 이걸 몰라서 테스트 흔적을 실사용
          방문으로 착각한 사고가 있었다(원장·PostHog는 이미 걸러내지만,
          "지금 이 화면이 안 잡힌다"는 눈으로 바로 확인돼야 한다). */}
      {dev && <span className="dev-badge">dev</span>}

      {/* 배너가 0건이거나 호출이 실패하면 아무것도 그리지 않는다(EventBanner가
          null을 돌려준다). 카드 그리드의 "불러오기 실패"와 다르게 다룬다 —
          배너는 부가 정보라서 실패가 화면을 어지럽히면 안 된다. */}
      {/* 시트는 서버 렌더에 넣지 않는다(닫혀 있어 첫 화면에 안 보인다). 넣으면 지연 로드 청크가
          오기 전 그 Suspense가 탈수 상태로 남고, 그사이 App이 한 번만 다시 그려져도 React가
          경계를 버리고 다시 그리며 #421을 던진다(프리뷰 실측). */}
      {mounted && <Suspense fallback={null}>
      <FilterSheet
        open={sheetOpen}
        filters={filters}
        onApply={applyFromSheet}
        onClose={() => setSheetOpen(false)}
      />
      </Suspense>}

      {/* 고정된 바가 문서 흐름에서 빠진 만큼을 대신 차지하는 자리. 높이는
          바를 실측해서 넣는다(폰트 로딩·줄바꿈으로 바뀔 수 있다). */}
      <div className="title-bar-spacer" aria-hidden="true" />

      {/* A/B 실험 종료(2026-09-15): 한 줄 바 + 분류 캐러셀(a안)로 통일.
          결론은 docs/HANDOFF-20260914.md §4 — b(시트)는 내렸다. */}
      <TopBarA
        barRef={titleBarRef}
        filters={filters}
        setFilters={setFilters}
        search={search}
        onSearchSubmit={submitSearch}
        brands={brands}
        isFiltered={isFiltered}
        resetFilters={resetFilters}
        sheetOpen={sheetOpen}
        onOpenSheet={() => { setSheetOpen(true); track('filter_sheet_open') }}
        onHome={goHome}
      />

      {/* 배너는 바 아래에 둔다. 흐름 맨 위에 두면 fixed인 타이틀바가
          그 자리를 덮어 스크롤하기 전에는 안 보였다. */}
      {/* 배너를 받기 전에는 그 높이만큼 자리를 잡아 둔다. 늦게 끼어들면 아래 목록이 통째로 밀린다
          (2026-09-30 브랜드 페이지 CLS 0.9). 받았는데 0건이면 자리를 거둔다. */}
      {banners == null ? <div className="banner-slot banner-slot--pending" aria-hidden="true" /> : <EventBanner banners={banners} />}
      <PushNotificationSetting />
    <main>
      {/* 빠른 필터. 시트를 열지 않고 자주 쓰는 정렬 둘만 배너와 카드 사이에 둔다: 할인금액
          높은순, 최소주문 낮은순. 랜덤쿠폰 토글은 2026-09-21에 여기서 뺐다(사용자) — 뽑기
          값은 사람마다 달라 자주 켤 것이 아니다. 시트에는 그대로 있다. 시트의 같은 값과 한
          상태(filters)를 공유하므로 어느 쪽에서 바꿔도 같다. */}
      {brands && (
        <div className="quick-bar">
        <div className="quick-bar__sorts" role="group" aria-label="빠른 필터">
          {[['amount', 'desc', '할인금액 높은순'], ['minOrder', 'asc', '최소주문 낮은순']].map(([key, dir, label]) => {
            const first = primarySort(filters)
            const on = first.key === key && first.dir === dir
            return (
              <button
                key={key}
                type="button"
                className={`quick-bar__chip${on ? ' quick-bar__chip--on' : ''}`}
                aria-pressed={on}
                onClick={() => {
                  // 정렬은 하나다. 켜져 있는 것을 다시 누르면 기본(할인액 높은 순)으로.
                  const next = on ? [{ key: 'amount', dir: 'desc' }] : [{ key, dir }]
                  setFilters((f) => ({ ...f, sorts: next }))
                  track('quick_filter', { key, dir, on: !on })
                }}
              >
                {label}
              </button>
            )
          })}
          {/* 5천원 이상만(2026-10-03, 사용자). 시트의 같은 칸과 한 상태다. 기본은 켜짐. */}
          <button
            type="button"
            className={`quick-bar__chip${filters.minAmount5k ? ' quick-bar__chip--on' : ''}`}
            aria-pressed={filters.minAmount5k}
            onClick={() => {
              setFilters((f) => ({ ...f, minAmount5k: !f.minAmount5k }))
              track('quick_filter', { key: 'min5k', on: !filters.minAmount5k })
            }}
          >
            5천원 이상만
          </button>
        </div>
        {/* 숨긴 목록은 정렬과 다른 일이라 오른쪽에 따로 선다. 떠 있는 알약으로 두었더니
            하단 배너와 겹쳤다(2026-09-24 사용자). 숨긴 것이 없으면 안 그린다. */}
        {Object.keys(hidden).length > 0 && (
          <button
            type="button"
            className="quick-bar__hidden"
            aria-expanded={hiddenOpen}
            onClick={() => { setHiddenOpen((v) => !v); if (!hiddenOpen) track('hidden_open') }}
          >
            숨긴 목록
            <span className="quick-bar__hidden-count">{Object.keys(hidden).length}</span>
            {revived.length > 0 && <span className="quick-bar__hidden-dot" aria-hidden="true" />}
          </button>
        )}
        </div>
      )}

      {asking && (
        <Suspense fallback={null}>
        <HideBrandAsk
          brand={asking.name}
          amount={asking.amount}
          onChoose={onHideChoose}
          onCancel={() => setAsking(null)}
        />
        </Suspense>
      )}

      {/* 목록은 정렬바 바로 아래, 흐름 안에서 열린다. 화면 아래에 띄우면 하단 배너와
          겹치고 카드 위를 덮어 무엇이 사라졌는지 안 보인다(2026-09-24 사용자). */}
      {Object.keys(hidden).length > 0 && (
        <Suspense fallback={null}>
        <HiddenBrandsSheet
          hidden={hidden}
          revived={revived}
          open={hiddenOpen}
          onClose={() => setHiddenOpen(false)}
          onShow={(name) => setHidden((prev) => {
            const next = showBrand(prev, name)
            // 다 되살리면 펼침을 끈다. 안 끄면 다음에 하나 숨겼을 때 누르지도
            // 않은 목록이 펼쳐진 채로 뜬다(2026-09-25 사용자).
            if (Object.keys(next).length === 0) setHiddenOpen(false)
            return next
          })}
          onRule={(name, rule) => setHidden((prev) => setRule(prev, name, rule))}
        />
        </Suspense>
      )}

      {error && (
        <div className="load-error" role="alert">
          <p className="load-error__title">할인 정보를 불러오지 못했습니다.</p>
          <p className="load-error__detail">{error}</p>
          <button
            type="button"
            className="load-error__retry"
            onClick={() => { setReloadKey((k) => k + 1); track('brands_retry') }}
          >
            다시 시도
          </button>
        </div>
      )}
      {/* 빈 화면에 글자 한 줄 대신 들어올 카드 모양을 미리 깔아둔다 —
          도착했을 때 레이아웃이 튀지 않는다. */}
      {!error && !brands && <BrandGridSkeleton />}

      {/* 0건일 때는 "없다"로 끝내지 않는다. 무엇이 걸려서 없는지와,
          거기서 빠져나가는 길을 같이 준다 — 실측에서 검색 제출의 절반이
          0건이었고, 그 화면에서 할 수 있는 일이 없었다. */}
      {visibleBrands && visibleBrands.length === 0 && (
        <div className="msg">
          {search.trim() ? (
            <>
              <p>&quot;{search}&quot;와 이름이 겹치는 브랜드가 없습니다.</p>
              {filters.platforms.size < PLATFORMS.length && (
                <p>
                  지금 {filters.platforms.size}개 앱만 켜져 있습니다.
                  <button type="button" className="msg__action"
                    onClick={() => setFilters((f) => ({
                      ...f, platforms: new Set(PLATFORMS.map((x) => x.key)),
                    }))}>
                    전체 앱에서 다시 찾기
                  </button>
                </p>
              )}
              <button type="button" className="msg__action"
                onClick={() => setSearch('')}>
                검색어 지우기
              </button>
            </>
          ) : (
            <p>이 분류엔 브랜드가 없습니다.</p>
          )}
        </div>
      )}

      {/* 그 브랜드만 보고 있는 동안에만 띄운다. 검색어를 바꿨거나 지웠으면
          이미 목록을 보고 있으니 사라진다. 진짜 <a>라서 크롤러도 따라간다 —
          이 페이지에서 나가는 길이 있다는 표시다. */}
      {routeBrand && filters.search === routeBrand && (
        <a className="route-back" href="/">← 전체 브랜드 보기</a>
      )}

      {visibleBrands && visibleBrands.length > 0 && (
        // key를 필터 키로 걸어 분류를 바꿀 때마다 이 상자를 새로 마운트한다
        // — 안 그러면 카드들이 자리를 지킨 채 내용만 뚝 바뀌어(리스트
        // diff) 다른 브랜드로 순간이동한 것처럼 튄다. 새로 마운트되면
        // fade-in 애니메이션이 다시 걸려 "갈아치웠다"가 아니라 "다음
        // 목록이 떠올랐다"로 읽힌다.
        <div className="brand-grid" key={gridKey} ref={gridRef}>
          {/* 브랜드 카드와 같은 칸에 놓는다 — 요청대로 맨 앞칸. 필터를
              바꾸면 그리드 전체가 새로 마운트되니 이 카드도 같이 날아가지만,
              발급된 코드는 App이 들고 있어(surveyCode) 다시 열면 그대로
              보인다 — 잃는 건 아직 안 고른 진행 중 선택뿐이다. */}
          {surveyOn && surveyOpen && (
            <SurveyCard
              visitorId={getAnalyticsContext().visitorId}
              code={surveyCode}
              onCode={setSurveyCode}
              onClose={() => {
                setSurveyOpen(false)
                // 이미 코드를 받은 사람은 알약으로 접힐 뿐이다 — "링크 다시
                // 확인하기"가 계속 있어야 한다. 아직 못 받은 사람(질문 중,
                // 또는 재고 없음 화면)만 세션에서 완전히 내린다.
                if (!surveyCode) setSurveyOn(false)
              }}
            />
          )}
          {visibleBrands.slice(0, shown).map((b, index) => {
            const props = { leaving: leaving === b.name, onHide, include, brand: b, position: index + 1,
              highlighted: linkedBrand === brandCardId(b.name), onInteract: clearLinked }
            return homeA
              ? <Suspense key={b.name} fallback={<BrandCard {...props} />}><CouponCard {...props} /></Suspense>
              : <BrandCard key={b.name} {...props} />
          })}
        </div>
      )}
      {/* 목록 끝 표지. 화면 아래 1,500px 안에 들어오면 카드를 한 묶음 더 그린다. */}
      {visibleBrands && shown < visibleBrands.length && <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />}

      {surveyOn && (
        <Suspense fallback={null}>
        <SurveyDock open={surveyOpen} answered={Boolean(surveyCode)}
                    onOpen={() => setSurveyOpen(true)}
                    onDismiss={() => setSurveyOn(false)} />
        </Suspense>
      )}

      <SiteFooter />

      {/* 새벽 안내 — 맨 위로 버튼 맞은편(왼쪽 아래), 하단 배너 위. */}
      {isNight && (
        <div className="night-notice" role="status">새벽엔 데이터 최신화가 진행돼요.<br />정보가 틀릴 수 있으니 잠시만 기다려주세요!</div>
      )}

      {/* 한참 내려간 뒤 맨 위로 돌아가는 길. */}
      {scrolledFar && (
        <button
          type="button"
          className="to-top-btn"
          onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); track('scroll_to_top') }}
          aria-label="맨 위로"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}
    </main>
    </>
  )
}
