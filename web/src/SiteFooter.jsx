// 바닥글은 금액 안내 한 줄과 링크 한 줄만 둔다(2026-10-13, docs/design/47).
// 비영리·수집 방식·상표는 /about, 통계·쿠키·보관 기간은 /privacy(public/ 아래 정적 페이지)로 옮겼다.
// 금액 안내는 가격 가까이에 숨기지 않고 남긴다 — 소비자가 확인일 기준임을 알아야 한다.
// 개인정보처리방침 링크는 관례대로 다른 링크보다 굵게 둔다.
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        금액은 <strong>확인일 기준</strong>이며 지역·매장·회원 등급·시간대에 따라 다를 수 있습니다.
        브랜드를 눌러 조건을 확인하고, <strong>주문 전에 각 앱에서 실제 금액을 다시 확인하세요.</strong>
      </p>
      <nav className="site-footer__links" aria-label="사이트 정보">
        <a href="/about">서비스 소개</a>
        <a href="/privacy"><strong>개인정보처리방침</strong></a>
        <a href="/about#contact">문의</a>
      </nav>
    </footer>
  )
}
