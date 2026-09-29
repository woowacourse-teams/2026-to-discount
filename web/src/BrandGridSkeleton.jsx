
// 데이터가 오기 전 자리를 지키는 카드 모양. 실제 카드와 같은 그리드라
// 도착 순간 레이아웃이 튀지 않는다.
export default function BrandGridSkeleton() {
  return (
    <div className="brand-grid" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="brand-card brand-card--skeleton">
          <div className="skeleton-head">
            <span className="skeleton-box skeleton-box--logo" />
            <span className="skeleton-box skeleton-box--name" />
          </div>
          <div className="skeleton-offers">
            {Array.from({ length: 4 }, (_, j) => (
              <span key={j} className="skeleton-box skeleton-box--offer" />
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">할인 정보를 불러오는 중입니다.</span>
    </div>
  )
}
