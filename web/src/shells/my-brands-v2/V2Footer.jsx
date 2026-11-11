// 홈 시안(my-brands-v2)의 바닥글. 안내 한 줄, 그 아래 구분선으로 나뉜 버튼 셋(너비 100%). 문의/연락처는 이메일 링크다.
export default function V2Footer() {
  return (
    <footer className="site-footer v2-footer">
      <p>지역별, 매장별 오차가 존재해요. <strong>자세히</strong>를 눌러 조건을 확인하고, 각 앱에서 실제 금액을 확인해 주세요!</p>
      <nav className="v2-footer__links" aria-label="사이트 정보">
        <a href="/about">서비스 소개</a>
        <a href="/privacy"><strong>개인정보처리방침</strong></a>
        <a href="mailto:jkllhgb@gmail.com">문의/연락처</a>
      </nav>
    </footer>
  )
}
