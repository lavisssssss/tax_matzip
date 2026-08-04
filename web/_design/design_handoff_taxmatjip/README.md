# Handoff: 세금맛집 (TaxMatjip) — 모바일 UI

## Overview
서울시 4급 이상 간부 공무원이 업무추진비로 결제한 식당 데이터를 지도·목록·랭킹으로 보여주는 모바일 웹/앱 서비스. 톤은 "감시"가 아니라 "공무원들이 자주 가는 집을 알려주는 실용 맛집 앱". 로그인·회원가입·리뷰·별점 없음 (읽기 전용 서비스).

기준 뷰포트: **390 × 844 (iPhone 14/15)**. 한글 UI, 금액은 천단위 콤마.

## About the Design Files
번들에 포함된 파일은 **HTML로 만든 디자인 레퍼런스**입니다 — 의도한 화면과 동작을 보여주는 프로토타입이며, 그대로 복사해 쓰는 프로덕션 코드가 아닙니다. 목표는 이 HTML 디자인을 **대상 코드베이스의 기존 환경(React / Next.js / React Native / SwiftUI 등)과 기존 패턴·라이브러리로 재현**하는 것입니다. 아직 코드베이스가 없다면 프로젝트에 적합한 프레임워크를 선택해 구현하세요.

- `TaxMatjip.dc.html` — 전체 프로토타입 (마크업 + 로직 클래스 + 더미 데이터). 브라우저에서 바로 열립니다.
- `ios-frame.jsx` — 프리뷰용 iPhone 베젤/상태바 목업. **실제 제품에는 필요 없습니다** (스크린샷용 프레임).

## Fidelity
**High-fidelity.** 색상·타이포·간격·인터랙션이 최종안 수준입니다. 픽셀 단위로 재현하되, 대상 코드베이스에 디자인 시스템이 있으면 동등한 토큰으로 매핑하세요.

## Screens / Views

### 0. 인트로 (Onboarding)
- **Purpose**: 서비스 성격 소개 후 지도로 진입. 최초 1회 노출.
- **Layout**: 390×844, 세로 중앙 정렬, 좌우 padding 36px. 배경 `linear-gradient(180deg, oklch(95% 0.035 45) 0%, oklch(97% 0.012 75) 60%)`.
- **Components**
  - 앱 마크: 84×84, radius 22px, bg `oklch(56% 0.19 35)`, shadow `0 16px 30px rgba(196,72,45,0.28)`. 안에 "세" — Hahmlet 800 / 34px / white.
  - 제목 "세금맛집": Hahmlet 800 / 30px / `oklch(22% 0.02 50)` / letter-spacing -0.5px / margin-bottom 10px.
  - 리드 "서울시 업무추진비 기반 식당 검색 사이트": 15.5px / 600 / `oklch(40% 0.02 50)`.
  - 서브 "공무원들이 자주 찾는 식당을 지도로 알려드려요": 14px / `oklch(55% 0.02 50)` / margin-bottom 40px.
  - CTA 버튼 "지도에서 둘러보기": width 100% (max 260px) × 54px, radius 27px, bg accent, white 16px/700.
  - 크레딧 "Made by ohsun": 12.5px / `oklch(65% 0.015 50)` / letter-spacing 0.3px.

### 1. 지도 (메인 탭)
- **Purpose**: 지역 내 식당을 마커로 탐색.
- **Layout**: 전체화면 지도 레이어 + 상단 검색/필터 오버레이 + 하단 드래그 바텀시트 + 우하단 현위치 버튼 + 하단 탭바.
- **Components**
  - 지도 레이어(프로토타입은 플레이스홀더): 실제로는 네이버/카카오 지도 SDK. 상단 캡션 `— 지도 SDK 연동 영역 —` 은 구현 시 제거.
  - 마커: 원형, 지름 = `26 + min(visits,15) × 2` px (38~56px), bg accent, `border: 3px solid #fff`, shadow `0 4px 10px rgba(0,0,0,0.25)`, 가운데 방문 횟수 white 700/13px. 좌표는 마커 중심 기준(margin -size/2).
  - 검색바: 높이 48px, radius 16px, white, shadow `0 6px 20px rgba(0,0,0,0.12)`, 좌측 돋보기 아이콘 18px, placeholder "식당 이름으로 검색". 입력값은 상호명 부분일치 필터.
  - 필터 칩 행(가로 스크롤, gap 8px): `자치구 ▾ / 기간 ▾ / 식사유형 ▾ / 방문인원 ▾`. 칩 = padding 8/14, radius 20, 13px 600. 비활성 white + `oklch(30% 0.02 50)`, 활성/열림 accent bg + white. 값 선택 시 칩 라벨이 선택값으로 바뀜.
  - **자치구**: 세로 드롭다운 패널 (white, radius 16, shadow `0 12px 28px rgba(0,0,0,0.16)`, max-height 320 스크롤). 행 = padding 11/16, 14px, 선택 행은 bg `oklch(94% 0.035 35)` + accent 텍스트 + 체크 아이콘. 옵션: 전체 + 서울 25개 자치구.
  - **기간**: 전체 / 2026 / 2025 (가로 칩). **식사유형**: 전체 / 점심 / 저녁 (방문 시각 15시 기준). **방문인원**: 전체 / 4명 이상 / 6명 이상 / 10명 이상 — 해당 식당의 방문 이력 중 최대 인원이 기준 이상이면 노출(단체 회식 장소 탐색용).
  - 현위치 버튼: 48×48 원형 white, shadow `0 6px 16px rgba(0,0,0,0.18)`, 우측 16px / 바텀시트 접힌 상단에서 16px 위(bottom 206px). 탭 시 0.6s pulse.
  - 바텀시트: 아래 §2.
  - 탭바: 아래 §5.

### 2. 바텀시트 (접힘 ↔ 펼침 목록)
- **Geometry**: 고정 높이 594px, `top: 170px`, `border-radius: 24px 24px 0 0`, white, shadow `0 -8px 24px rgba(0,0,0,0.12)`. 펼침 = `translateY(0)`, 접힘 = `translateY(484px)` (노출 높이 110px). 전환 `transform .32s cubic-bezier(.22,1,.36,1)`; 드래그 중에는 transition none.
- **Drag**: 핸들 영역 pointerdown → window pointermove로 0~484 clamp → pointerup 시 484/2 기준 스냅. 핸들 바 40×5, radius 3, `oklch(88% 0.012 60)`.
- **접힌 상태**: "이 지역 N곳" 17px/700 만 노출 (N = 현재 필터 결과 수).
- **펼친 상태**
  - 정렬 토글(칩 3개): 방문 많은 순 · 1인당 비싼 순 · 최근 순. 활성 = accent bg + white, 비활성 = 투명 + `oklch(45% 0.02 50)`. 하단 1px 구분선 `oklch(92% 0.012 60)`.
  - 카드 리스트(스크롤, padding 10/16/24): 카드 = radius 16, padding 14, margin-bottom 10, bg `oklch(98% 0.008 75)`, border 1.5px transparent.
    - 1행: 상호명 Hahmlet 700/16.5px + 자치구 pill (12px, bg `oklch(94% 0.01 60)`, radius 10).
    - 2행: 부서 태그 최대 2개 (11.5px, bg `oklch(97% 0.008 75)`, border `oklch(90% 0.014 60)`, radius 10) + `+N` + `· 최근 사용목적`.
    - 3행 좌: `방문 12회 · 최대 10명` / `최근 7월 1일` (12.5px, `oklch(50% 0.02 50)`).
    - 3행 우: `1인당 23,000원` 17px/800 `oklch(30% 0.02 50)` + 비교 배지 `평균 대비 +12%` (11px/600, radius 8). 평균 이상 = bg `oklch(94% 0.035 35)` / text accent, 평균 미만 = bg `oklch(93% 0.03 165)` / text `oklch(50% 0.1 165)`.
  - **마커 → 카드 포커스**: 마커 탭 시 시트 펼침 + 360ms 후 리스트 `scrollTop = card.offsetTop - 12`, 해당 카드 1.4초간 하이라이트(bg `oklch(94% 0.035 35)`, border accent, transition .3s).

### 3. 식당 상세
- **Purpose**: 방문 이력 전체와 원문 근거 확인.
- **Layout**: 상단 뒤로가기(36×36 원형 `oklch(96% 0.01 60)`) → 스크롤 본문 → 하단 고정 버튼 영역.
- **Components**
  - 상호명 Hahmlet 800/23px, 주소 13.5px `oklch(55% 0.015 50)`.
  - 요약 3분할(상하 1px 구분선, padding 16 0): 총 방문 / 총액 / 1인당 평균. 라벨 12px `oklch(58% 0.015 50)`, 값 18px/800 — 금액 두 개는 accent 색.
  - "방문 이력" 타임라인 (최근 3건 노출 + "더보기"로 전체 확장):
    - 1행: `2026.07.22 · 18:30` 14px/700 + 금액 `284,000원 · 6명` 15px/800 accent.
    - 2행: `경제정책실 · 저녁 · 실국 간담회` 13px `oklch(52% 0.02 50)` + 우측 **원문 링크 배지**(11.5px/600, accent 텍스트, bg `oklch(94% 0.035 35)`, radius 10, 외부링크 아이콘, `target="_blank"`) → 정보공개 원문 URL.
  - 하단 고정: "네이버 지도로 열기" 52px, radius 14, accent bg, white 15.5px/700 → `https://map.naver.com/v5/search/{상호명}` 새 창.

### 4. 랭킹
- 헤더: "랭킹" Hahmlet 800/26px, 부제 `2026년 연간 · N곳` 13px.
- **자치구 드롭다운**: pill 버튼(white, border `oklch(90% 0.014 60)`, radius 20, 13px/600, caret) → 아래 패널(width 200, 지도 드롭다운과 동일 스타일). 옵션은 전체 + 데이터가 존재하는 자치구.
- 탭 3개(균등 분할, 13px/700, 활성 accent + 하단 2.5px accent 보더): `많이 간 곳` / `1인당 비싼 곳` / `부서 여러 곳`.
- 리스트 행(padding 14/20, 하단 1px 구분선): 순위 뱃지 32×32 원형 — 1위 accent, 2·3위 `oklch(60% 0.14 45)`, 그 외 `oklch(92% 0.01 60)` + `oklch(45% 0.02 50)` 텍스트 / 상호명 Hahmlet 700/15.5px + 자치구 12.5px / 우측 지표 15px/800 (탭에 따라 `12회`, `35,000원`, `3개 부서`). 행 탭 → 상세.

### 5. 하단 탭바 (지도 / 랭킹 / 정보)
- 높이 80px (하단 safe area 20px 포함), bg `rgba(255,255,255,0.97)`, 상단 1px `oklch(90% 0.014 60)`, z-index 40.
- 아이콘 20px + 라벨 11px/600. 활성 accent, 비활성 `oklch(62% 0.015 50)`. 아이콘: 핀 / 막대 3개 / 원+i.

### 6. 정보
- 헤더 "정보" Hahmlet 800/26px. 섹션 제목 14px/700 accent, 본문 14px/1.7 `oklch(35% 0.02 50)`, 섹션 간 gap 22px.
- 섹션: 이 서비스는 무엇인가요 / 데이터 출처(정보공개청구·서울시 업무추진비 공개내역·대상 4급 이상, 간담회비·부서운영비) / 데이터 기준(2026.01~07, 매월 갱신) / 유의사항(데모 데이터 안내).

## Interactions & Behavior
- 인트로 CTA → 지도. 탭바로 지도/랭킹/정보 이동(탭 전환 시 열린 필터 닫힘).
- 필터 칩 탭 = 해당 카테고리 열기/닫기(단일 오픈). 옵션 선택 시 즉시 필터 적용 + 패널 닫힘. 필터는 AND 결합, 검색어와도 AND.
- 바텀시트: 드래그(포인터) + 스냅 애니메이션. 마커 탭 → 펼침 + 카드 스크롤/하이라이트.
- 상세: 뒤로가기로 직전 탭 복귀, "더보기"로 이력 전체 노출, 원문/네이버 링크는 새 탭.
- 애니메이션: 시트 `.32s cubic-bezier(.22,1,.36,1)`, 카드 하이라이트 `.3s`, 현위치 pulse `.6s ease-out`.
- 로딩/에러/빈 상태는 프로토타입 범위 밖 — 구현 시 "조건에 맞는 식당이 없어요" 빈 상태 추가 권장.

## State Management
```
screen: 'onboarding' | 'map' | 'ranking' | 'info'
detailId: number | null          // 값이 있으면 상세가 최상위 뷰
detailHistoryExpanded: boolean
sheetExpanded / dragging / dragDelta   // 바텀시트
search: string
filterGu / filterYear / filterMeal / filterPeople  // 기본값 '전체'
openFilter: 'gu' | 'year' | 'meal' | 'people' | null
sortMode: 'visits' | 'avg' | 'recent'
rankTab: 'visits' | 'avg' | 'depts'
rankGu: string, rankGuOpen: boolean
selectedId: number | null        // 마커 탭 하이라이트
locPulse: boolean
```
데이터 요구: 식당 목록(id, 상호명, 자치구, 주소, 좌표, 방문 횟수, 1인당 평균, 최근 방문일, 부서 목록, 최대 인원)과 식당별 방문 이력(일자, 시각, 부서, 금액, 인원, 사용목적, 원문 URL). 프로토타입은 12곳 더미 데이터를 로직 파일 상단 `BASE_RESTAURANTS`에 정의.

파생값: 식사유형(시각 < 15:00 = 점심), 금액 비교 배지(전체 1인당 평균 대비 %), 최대 인원, 총액(1인당 평균 × 평균 인원 × 방문 횟수 — 실서비스에서는 실제 합계 사용).

## Design Tokens
| 용도 | 값 |
| --- | --- |
| Accent (금액·강조·활성) | `oklch(56% 0.19 35)` ≈ `#C4482D` |
| Accent soft | `oklch(94% 0.035 35)` |
| 평균 미만(저렴) | `oklch(50% 0.1 165)` / soft `oklch(93% 0.03 165)` |
| 앱 배경 | `oklch(97% 0.012 75)` |
| 카드 배경 | `oklch(98% 0.008 75)` / 흰색 표면 `#fff` |
| 본문 텍스트 | `oklch(22% 0.02 50)` / 보조 `oklch(50% 0.02 50)` / 흐림 `oklch(62% 0.015 50)` |
| 구분선·보더 | `oklch(90–93% 0.012–0.014 60)` |
| Radius | 카드 16 / 시트 24(상단) / 칩 20 · 16 · 14 / 버튼 27 · 14 |
| Spacing | 4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 22 |
| Shadow | 검색바 `0 6px 20px rgba(0,0,0,.12)` · 드롭다운 `0 12px 28px rgba(0,0,0,.16)` · 시트 `0 -8px 24px rgba(0,0,0,.12)` |
| Type scale | 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 15 / 15.5 / 16.5 / 17 / 18 / 22–23 / 26 / 30 |
| 본문 폰트 | **Noto Sans KR** 400/500/600/700/800 (Google Fonts) |
| 제목·상호명 폰트 | **Hahmlet** 500–800 (Google Fonts) |

## Assets
외부 이미지 없음. 아이콘은 모두 인라인 SVG(돋보기, 핀, 막대 그래프, 정보, 체크, caret, 외부링크, 뒤로가기)로 원본 마크업에 포함. 지도 타일은 미포함 — 네이버/카카오 지도 SDK 연동 필요. 폰트는 Google Fonts CDN.

## Files
- `TaxMatjip.dc.html` — 전체 프로토타입(모든 화면·상태·더미 데이터). 상단 `<helmet>`에 폰트/전역 리셋, 이어서 화면 마크업, 하단 `<script>`에 데이터와 로직 클래스.
- `ios-frame.jsx` — 프리뷰용 iPhone 프레임(구현 불필요).
