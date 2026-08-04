export default function InfoPage() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'oklch(96.5% 0.005 285)', paddingBottom: 80, boxSizing: 'border-box' }}>
      <div style={{ padding: '58px 20px 8px', flexShrink: 0 }}>
        <h1 className="serif" style={{ fontSize: 26, fontWeight: 800, color: 'oklch(22% 0.015 265)', margin: 0 }}>정보</h1>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 32px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'oklch(52% 0.095 180)', margin: '0 0 8px' }}>
            이 서비스는 무엇인가요?
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'oklch(35% 0.015 265)', margin: 0 }}>
            서울시 4급 이상 간부 공무원이 업무추진비로 결제한 식당 내역을 지도로 보여드려요.
            공무원들도 자주 찾는 식당 기록을 투명하게 공개합니다.
          </p>
        </div>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'oklch(52% 0.095 180)', margin: '0 0 8px' }}>
            데이터 출처
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'oklch(35% 0.015 265)', margin: '0 0 6px' }}>· 서울시 정보소통광장 업무추진비 공개 내역</p>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'oklch(35% 0.015 265)', margin: '0 0 6px' }}>· 대상: 4급 이상 간부 (본청·사업소)</p>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'oklch(35% 0.015 265)', margin: 0 }}>· 수집 기간: 2025년 7월 ~ 2026년</p>
        </div>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'oklch(52% 0.095 180)', margin: '0 0 8px' }}>
            유의사항
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'oklch(35% 0.015 265)', margin: 0 }}>
            이 서비스는 공개된 행정 자료를 기반으로 하며, 특정 공무원이나 기관을 비난하는 목적이 없습니다.
            주말·심야 사용도 정당한 사유가 있을 수 있습니다.
          </p>
        </div>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'oklch(52% 0.095 180)', margin: '0 0 8px' }}>
            정정·삭제 요청
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'oklch(35% 0.015 265)', margin: 0 }}>
            본인과 관련된 정보의 정정·삭제를 원하시면 아래로 연락주세요.
          </p>
          <a href="mailto:lavis0515@gmail.com" style={{ fontSize: 14, color: 'oklch(52% 0.095 180)', fontWeight: 600 }}>
            lavis0515@gmail.com
          </a>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'oklch(65% 0.012 265)', letterSpacing: '0.3px', textAlign: 'center' }}>
          비영리 개인 프로젝트
        </p>
      </div>
    </div>
  )
}
