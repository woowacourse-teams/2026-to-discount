import { Component } from 'react'
import { reportError } from './telemetry.js'

// 최상위 에러 바운더리(2026-10-14). 렌더 중 예외 하나로 화면 전체가 하얘지지 않게, App의 불러오기 실패 화면과
// 같은 마크업·문구를 그린다(새 문구 없음). 자식이 하나라 useId 값을 바꾸지 않지만, 서버(entry-server.jsx)도 같은 모양으로 감싼다.
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    reportError('boundary', error, info?.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="load-error" role="alert">
        <p className="load-error__title">할인 정보를 못 불러옴</p>
        <button type="button" className="load-error__retry" onClick={() => location.reload()}>
          다시 시도
        </button>
      </div>
    )
  }
}
