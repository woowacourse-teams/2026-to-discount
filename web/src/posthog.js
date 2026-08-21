import posthog from 'posthog-js'
import { getAnalyticsContext } from './analytics-context.js'
import { optedOut } from './privacy.js'

export const POSTHOG_CONNECTION_TEST_EVENT = 'posthog_sdk_connection_test'

const CONNECTION_TEST_KEY = 'dk_posthog_connection_test'

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function put(target, key, value) {
  if (value !== undefined && value !== null) target[key] = value
}

/**
 * 표시가 안 붙은 개발 트래픽으로 보이는지. 서버 쪽
 * `PostHogEventMapper.looksLikeDeveloper()`와 같은 규칙이다.
 *
 * <p>서버 릴레이만 이 표시를 붙이고 있어서, 클라이언트가 직접 보내는
 * 이벤트에는 안 붙었다 — SDK가 돌기 시작한 2026-08-21부터 같은 사람의
 * 이벤트가 경로에 따라 표시가 있다 없다 했다.
 *
 * <p>기준을 바꿀 때는 세 곳을 함께 고친다: 여기, 서버 매퍼,
 * `scripts/ab_report.sh`. 한 곳만 고치면 도구마다 다른 숫자가 나온다.
 * 배경은 api/docs/traffic-analytics.md에 있다.
 */
function looksLikeDeveloper(envelope) {
  if (envelope.device !== 'desktop') return false
  const width = Number.parseInt(String(envelope.viewport ?? '').split('x')[0], 10)
  // 폭을 못 읽었으면 모르는 것이지 좁은 것이 아니다 — 모르는 것을 개발
  // 트래픽으로 몰면 실사용자가 조용히 빠진다.
  return Number.isFinite(width) && width > 0 && width < 400
}

function captureTimestamp(value) {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export function createPostHogAdapter({
  client,
  getEnvironment,
  isOptedOut,
  getContext,
  getLocation,
  getSessionStore,
  warn = () => {},
}) {
  let initialized = false

  function initPostHog() {
    if (initialized) return true

    try {
      if (isOptedOut()) return false

      const environment = getEnvironment() ?? {}
      const key = clean(environment.VITE_POSTHOG_KEY)
      const host = clean(environment.VITE_POSTHOG_HOST)
      if (!key || !host) return false

      const context = getContext()
      if (!context.visitorId || !context.sessionId) return false

      client.init(key, {
        api_host: host,
        bootstrap: {
          distinctID: context.visitorId,
          isIdentifiedID: false,
        },
        persistence: 'localStorage',
        // SDK 자동 pageview는 끈다. 우리도 page_view를 쏘는데 SDK가 스스로
        // 쏘는 것은 우리 eventId를 모른다 — $insert_id가 달라 중복 제거가
        // 안 걸리고 같은 방문이 두 번 찍힌다(2026-08-21 실측, 하나는 URL
        // 속성이 붙고 하나는 안 붙은 채로).
        //
        // 우리 page_view만 $pageview로 보내면 id가 하나로 통일돼, 서버
        // 릴레이가 같은 이벤트를 보내도 PostHog가 합쳐준다.
        //
        // 라우터가 없고 pushState도 안 쓴다 — history_change가 지금 잡을
        // 것이 없다. 나중에 URL로 화면이 갈리면(필터 공유 링크, 브랜드
        // 상세 경로) 그때 track('page_view')를 직접 쏜다.
        capture_pageview: false,
        capture_pageleave: context.dev ? false : true,
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
        advanced_disable_feature_flags: true,
        capture_exceptions: false,
        // 세션 리플레이는 켜지 않지만, Web Vitals는 독립적으로 수집한다.
        capture_performance: context.dev ? false : { web_vitals: true },
        // SDK 기본 기기·브라우저 속성과 Android 기기 모델 수집을 허용한다.
        disableDeviceModel: false,
        respect_dnt: true,
        // 서버 릴레이와 클라이언트가 같은 이벤트를 둘 다 보낸다($insert_id가
        // 같아 PostHog가 하나로 합친다). 둘 중 어느 쪽이 먼저 닿을지는
        // 정해져 있지 않으므로, person 처리 방침이 서로 달라선 안 된다.
        //
        // 'never'는 $process_person_profile: false를 실어 보낸다. 서버는
        // 그 값을 안 붙여 프로필을 만든다 — 엇갈리면 어떤 이벤트에서는
        // 프로필이 생기고 어떤 이벤트에서는 안 생겨 리텐션이 들쭉날쭉해진다.
        // 서버 쪽에 맞춰 여기서도 프로필을 만든다.
        //
        // 계정은 여전히 안 만든다. distinct_id는 브라우저가 만든 난수
        // (visitorId)라 개인 식별자가 아니다.
        person_profiles: 'always',
      })
      initialized = true
      return true
    } catch (error) {
      warn('PostHog SDK를 초기화하지 못했습니다.', error)
      return false
    }
  }

  function captureSignal(event, props, allowDev) {
    try {
      if (!initialized || isOptedOut()) return false
      if (typeof event !== 'string' || event.trim() === '') return false

      const context = getContext()
      if (context.dev && !allowDev) return false
      client.capture(event, {
        ...props,
        source_session_id: context.sessionId,
        visit_count: context.visitCount,
        ...(context.dev ? { dev: true } : {}),
      })
      return true
    } catch (error) {
      warn('PostHog 이벤트를 전송하지 못했습니다.', error)
      return false
    }
  }

  function captureProductSignal(event, props = {}) {
    return captureSignal(event, props, false)
  }

  function captureAnalyticsEvent(envelope) {
    try {
      if (!initialized || isOptedOut()) return false
      if (!envelope || typeof envelope !== 'object' || envelope.dev === true) return false

      const event = clean(envelope.event)
      const eventId = clean(envelope.eventId)
      if (!event || !eventId) return false
      const properties = (
        envelope.props && typeof envelope.props === 'object' && !Array.isArray(envelope.props)
      ) ? { ...envelope.props } : {}
      properties.$insert_id = eventId
      put(properties, 'source_session_id', envelope.sessionId)
      put(properties, 'visit_count', envelope.visitCount)
      put(properties, 'path', envelope.path)
      put(properties, 'referrer', envelope.referrer)
      put(properties, 'device', envelope.device)
      // 서버 매퍼(PostHogEventMapper)도 같은 이름으로 넘긴다. 여기서
      // 빠지면 PostHog에서 A/B를 못 가른다 — 원장에는 남지만 퍼널·리텐션이
      // 두 안을 구분하지 못한다.
      put(properties, 'variant', envelope.variant)
      if (looksLikeDeveloper(envelope)) properties.dev_suspect = true
      put(properties, 'viewport', envelope.viewport)
      put(properties, 'dwell_ms', envelope.dwellMs)

      const options = { uuid: eventId }
      const timestamp = captureTimestamp(envelope.clientTs)
      if (timestamp) options.timestamp = timestamp
      if (event === 'page_exit') {
        options.send_instantly = true
        options.transport = 'sendBeacon'
      }

      // 첫 page_view는 SDK가 늦게 준비돼도 analytics.js 대기 큐에서 꺼내
      // 표준 $pageview로 보낸다. API 원장과 같은 eventId·발생 시각을 유지한다.
      const captureEvent = event === 'page_view' ? '$pageview' : event
      client.capture(captureEvent, properties, options)
      return true
    } catch (error) {
      warn('PostHog analytics 이벤트를 전송하지 못했습니다.', error)
      return false
    }
  }

  function captureConnectionTest() {
    try {
      const context = getContext()
      const params = new URLSearchParams(getLocation().search)
      if (!context.dev || params.get('dev') !== '1' || params.get('posthog_test') !== '1') {
        return false
      }

      const store = getSessionStore()
      if (store.getItem(CONNECTION_TEST_KEY) === '1') return false

      // dev 방문에서 허용하는 유일한 SDK 전용 신호다. 공개
      // captureProductSignal()의 dev 차단을 우회하지 못하게 내부에서만 연다.
      const captured = captureSignal(POSTHOG_CONNECTION_TEST_EVENT, {
        source: 'sdk_connection_test',
      }, true)
      if (!captured) return false

      try {
        store.setItem(CONNECTION_TEST_KEY, '1')
      } catch {
        // capture는 끝났다. 저장소가 막혀도 사용자 기능에는 영향을 주지 않는다.
      }
      return true
    } catch {
      return false
    }
  }

  return { initPostHog, captureProductSignal, captureAnalyticsEvent, captureConnectionTest }
}

const adapter = createPostHogAdapter({
  client: posthog,
  getEnvironment: () => import.meta.env ?? {},
  isOptedOut: optedOut,
  getContext: getAnalyticsContext,
  getLocation: () => location,
  getSessionStore: () => sessionStorage,
  warn: (...args) => {
    if (import.meta.env?.DEV) console.warn(...args)
  },
})

export const initPostHog = adapter.initPostHog
export const captureProductSignal = adapter.captureProductSignal
export const captureAnalyticsEvent = adapter.captureAnalyticsEvent
export const capturePostHogConnectionTest = adapter.captureConnectionTest
