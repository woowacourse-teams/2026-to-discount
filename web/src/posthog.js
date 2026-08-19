import posthog from 'posthog-js'
import { getAnalyticsContext } from './analytics-context.js'
import { optedOut } from './privacy.js'

export const POSTHOG_CONNECTION_TEST_EVENT = 'posthog_sdk_connection_test'

const CONNECTION_TEST_KEY = 'dk_posthog_connection_test'

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
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
        capture_pageview: false,
        capture_pageleave: false,
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
        advanced_disable_feature_flags: true,
        capture_exceptions: false,
        capture_performance: false,
        disableDeviceModel: true,
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

  function captureProductSignal(event, props = {}) {
    try {
      if (!initialized || isOptedOut()) return false
      if (typeof event !== 'string' || event.trim() === '') return false

      const context = getContext()
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

  function captureConnectionTest() {
    try {
      const context = getContext()
      const params = new URLSearchParams(getLocation().search)
      if (!context.dev || params.get('dev') !== '1' || params.get('posthog_test') !== '1') {
        return false
      }

      const store = getSessionStore()
      if (store.getItem(CONNECTION_TEST_KEY) === '1') return false

      const captured = captureProductSignal(POSTHOG_CONNECTION_TEST_EVENT, {
        source: 'sdk_connection_test',
      })
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

  return { initPostHog, captureProductSignal, captureConnectionTest }
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
export const capturePostHogConnectionTest = adapter.captureConnectionTest
