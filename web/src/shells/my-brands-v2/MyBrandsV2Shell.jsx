import App from '../../App.jsx'
import V2Card from './V2Card.jsx'
import './my-brands-v2.css'

// 홈 시안 my-brands-v2(#291). 운영 홈(App.jsx)을 그대로 쓰고 카드 한 장(V2Card)과 스타일만 바꿔 끼운다.
// 상단 바, 필터, 정렬, 숨기기와 숨긴 목록, 공유 링크 진입, 배너, 설문, 푸터, 노출 기록, 목록 나눠 그리기는 모두 App.jsx의 것이라
// 운영과 같고, 운영이 고쳐지면 이 시안도 같이 고쳐진다(A/B 비교가 카드 모양만 가르도록).
export default function MyBrandsV2Shell({ initial = null }) {
  return <App initial={initial} Card={V2Card} mainClassName="v2" />
}
