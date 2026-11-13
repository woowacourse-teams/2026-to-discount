// 바닥글은 안내 한 줄과 링크 버튼 셋(구분선으로 나뉨, 너비 100%)만 둔다(2026-10-13 docs/design/47, 2026-11-11 모양 변경).
// 비영리·수집 방식·상표는 /about, 통계·쿠키·보관 기간은 /privacy(public/ 아래 정적 페이지)로 옮겼다.
// 금액 안내는 가격 가까이에 숨기지 않고 남긴다. 개인정보처리방침 링크는 관례대로 다른 링크보다 굵게 둔다.
// 홈 시안(shells/my-brands-v2)도 이 바닥글을 그대로 쓴다(A/B에서 새로 그리지 않는 영역).
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>지역별, 매장별 오차가 존재해요. <strong>자세히</strong>를 눌러 조건을 확인하고, 각 앱에서 실제 금액을 확인해 주세요!</p>
      <nav className="site-footer__links" aria-label="사이트 정보">
        <a href="/about">서비스 소개</a>
        <a href="/privacy"><strong>개인정보처리방침</strong></a>
        <a href="mailto:jkllhgb@gmail.com">문의/연락처</a>
      </nav>
    </footer>
  )
}
