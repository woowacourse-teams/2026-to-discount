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
        // 페이지 이동은 SDK가 표준 $pageview/$pageleave로 맡는다. 도메인
        // 행동은 analytics.js의 명시적 track()만 capture해 의미상 중복을 막는다.
        capture_pageview: context.dev ? false : 'history_change',
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
        // 계정·개인 단위 분석은 하지 않는다. 재방문 분석은 이벤트의
        // visit_count 속성으로만 수행한다.
        person_profiles: 'never',
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
