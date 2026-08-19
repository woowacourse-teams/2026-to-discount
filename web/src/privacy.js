// 브라우저의 명시적인 추적 거부 신호는 모든 분석 도구가 같은 기준으로 쓴다.
export function optedOut() {
  return (
    navigator.globalPrivacyControl === true ||
    navigator.doNotTrack === '1' ||
    window.doNotTrack === '1'
  )
}
