-- ============================================================
-- 세금맛집 (tax_matzip) — Supabase / PostgreSQL 스키마
--
-- 서울시 간부 공무원이 업무추진비로 다녀간 식당 지도
-- 원본: 서울 정보소통광장 (https://opengov.seoul.go.kr/expense/list)
--
-- ※ 실제 게시글 5건(2024/2025/2026, 본청·사업소·자치구)과 목록 페이지를
--   직접 확인해 확정한 구조. 집행내역은 게시글 본문 HTML 표에 9열 고정으로 들어 있다:
--   연번 / 부서명 / 사용일시 / 사용장소 / 사용목적 / 사용금액(원) /
--   사용자 및 인원 / 결제방법 / 비목
--
-- 수집 범위: 2024 ~ 2026년 (3개년)
--
-- 실행: Supabase 대시보드 > SQL Editor
-- 파일 위치: db/001_schema.sql
-- 이후 변경은 이 파일을 고치지 말고 db/002_*.sql 로 추가할 것
-- ============================================================

-- ------------------------------------------------------------
-- 0) 월 단위 수집 작업 큐
--    이 사이트 목록은 '연도+월' 드롭다운으로 조회한다.
--    평면 페이지네이션을 쓰면 새 글이 올라올 때마다 목록이 밀려 누락·중복이 생기므로,
--    월을 작업 단위로 삼는다. 36개 행(3년 × 12개월)이 전부다.
-- ------------------------------------------------------------
create table if not exists crawl_months (
    id           bigserial primary key,
    period_year  int not null,
    period_month int not null,
    total_count  int,        -- 목록 1페이지 첫 행의 연번 = 그 달의 총 건수
    listed_count int default 0,
    status       text not null default 'pending',  -- pending / listed / done / failed
    last_error   text,
    updated_at   timestamptz default now(),
    unique (period_year, period_month)
);

comment on table crawl_months is
    '세금맛집: 월 단위 수집 큐. 최신 월부터 과거 순으로 처리한다';

insert into crawl_months (period_year, period_month)
select y, m from generate_series(2024, 2026) y, generate_series(1, 12) m
on conflict do nothing;


-- ------------------------------------------------------------
-- 1) 게시글 (수집 단위)
--    글 1건 = 특정 부서의 특정 연월 업무추진비
-- ------------------------------------------------------------
create table if not exists expense_documents (
    id            bigserial primary key,
    nid           text not null unique,      -- 글 번호(URL 끝 숫자). 중복수집 방지 키
    source_url    text not null,
    title         text,
    org_name      text,        -- 서울시본청 / 사업소 / 소방재난본부(소방서) / 자치구 등
    dept_name     text,
    exec_type     text,        -- 기관운영 / 시책추진 / 부서운영 / 전체 (복합 가능)
    period_year   int,
    period_month  int,
    posted_at     date,        -- 등록일. 대상월보다 8개월 이상 늦는 사례가 있다
    charge_dept   text,
    tel           text,

    content_hash  text,        -- 본문 표 해시. 수정 재게시 감지용
    parse_status  text not null default 'pending',
                               -- pending / parsed / no_entries / failed
    parse_error   text,
    header_ok     boolean,     -- 표준 9열과 일치했는가. false면 사람이 확인
    row_count     int default 0,
    crawled_at    timestamptz default now(),
    parsed_at     timestamptz
);

comment on column expense_documents.parse_status is
    'no_entries = 그 달 집행내역이 없는 정상 케이스. 오류가 아니다';

create index if not exists idx_doc_status on expense_documents (parse_status);
create index if not exists idx_doc_period on expense_documents (period_year desc, period_month desc);
create index if not exists idx_doc_dept   on expense_documents (dept_name);


-- ------------------------------------------------------------
-- 2) 원본 행 (표를 손대지 않고 그대로 보관)
--    정규화 규칙만 고쳐 재크롤링 없이 재정규화하기 위한 안전장치.
-- ------------------------------------------------------------
create table if not exists expense_raw_rows (
    id          bigserial primary key,
    document_id bigint not null references expense_documents(id) on delete cascade,
    row_index   int not null,
    payload     jsonb not null,   -- {"사용장소":"참숯골(서울시 중구 무교로 16)", ...}
    unique (document_id, row_index)
);

create index if not exists idx_raw_doc on expense_raw_rows (document_id);


-- ------------------------------------------------------------
-- 3) 장소 마스터
--    사용장소 칸에 '상호명(주소)' 형태로 주소가 함께 적혀 있으므로
--    상호명 검색이 아니라 주소 기반으로 좌표를 얻는다 (정확도가 훨씬 높다).
-- ------------------------------------------------------------
create table if not exists places (
    id              bigserial primary key,
    place_name      text not null,
    place_address   text,
    lookup_key      text not null unique,   -- 상호명+주소 정규화값. 중복 조회 방지

    matched_name    text,
    road_address    text,
    jibun_address   text,
    sido            text,
    sigungu         text,        -- 자치구 필터
    lat             double precision,
    lng             double precision,
    category        text,

    match_status    text default 'pending',  -- pending / matched / ambiguous / not_found
    match_source    text,                    -- address / keyword / manual
    candidate_count int default 0,
    updated_at      timestamptz default now()
);

comment on column places.match_status is
    '후보가 여러 개면 억지로 고르지 말고 ambiguous로 남긴다';

create index if not exists idx_places_status  on places (match_status);
create index if not exists idx_places_sigungu on places (sigungu);


-- ------------------------------------------------------------
-- 4) 정규화 내역 (화면이 실제로 쓰는 테이블)
-- ------------------------------------------------------------
create table if not exists expense_entries (
    id            bigserial primary key,
    document_id   bigint not null references expense_documents(id) on delete cascade,
    raw_row_id    bigint references expense_raw_rows(id) on delete cascade,

    used_at       timestamp,     -- 사용일시. 분 단위까지 공개된다
    used_at_text  text,
    dept_name     text,
    place_raw     text,          -- '상호명(주소)' 원문
    place_name    text,
    place_address text,
    place_id      bigint references places(id),
    purpose       text,
    amount        numeric(14,0),
    participants  text,          -- '사용자 및 인원' 원문. 화면에도 이 값을 그대로 쓴다
    head_count    int,           -- '외 N명'은 +1
    payment_method text,         -- 카드 / 제로페이
    budget_type    text,         -- 기관 / 시책 / 부서

    created_at    timestamptz default now(),
    unique (raw_row_id)
);

comment on column expense_entries.head_count is
    '"과장 외 9명" = 10명. 외 N명은 본인 미포함 표현이므로 +1';

create index if not exists idx_entry_used_at on expense_entries (used_at desc);
create index if not exists idx_entry_place   on expense_entries (place_id);
create index if not exists idx_entry_dept    on expense_entries (dept_name);
create index if not exists idx_entry_amount  on expense_entries (amount desc);


-- ------------------------------------------------------------
-- 5) 맛집 랭킹 뷰
-- ------------------------------------------------------------
create or replace view v_place_ranking as
select
    p.id                                           as place_id,
    coalesce(p.matched_name, p.place_name)         as name,
    p.road_address,
    p.sigungu,
    p.lat,
    p.lng,
    p.category,
    count(*)                                       as visit_count,
    count(distinct e.dept_name)                    as dept_count,
    sum(e.amount)                                  as total_amount,
    round(avg(e.amount))                           as avg_amount,
    round(avg(e.amount / nullif(e.head_count, 0))) as avg_amount_per_head,
    min(e.used_at)                                 as first_visit,
    max(e.used_at)                                 as last_visit
from expense_entries e
join places p on p.id = e.place_id
where p.match_status = 'matched'
group by p.id;


-- ------------------------------------------------------------
-- 6) 진행 상황 뷰
-- ------------------------------------------------------------
create or replace view v_crawl_progress as
select
    m.period_year,
    m.period_month,
    m.status,
    m.total_count,
    count(d.id) filter (where d.parse_status = 'parsed')     as parsed,
    count(d.id) filter (where d.parse_status = 'no_entries') as no_entries,
    count(d.id) filter (where d.parse_status = 'pending')    as pending,
    count(d.id) filter (where d.parse_status = 'failed')     as failed
from crawl_months m
left join expense_documents d
       on d.period_year = m.period_year and d.period_month = m.period_month
group by m.id
order by m.period_year desc, m.period_month desc;

create or replace view v_geocode_progress as
select match_status,
       count(*) as place_count,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from places
group by match_status;


-- ------------------------------------------------------------
-- 7) 부가 분석 뷰 — 사용일시에 시각이 있어 가능한 것들
-- ------------------------------------------------------------
create or replace view v_offhours_usage as
select
    e.id, e.used_at, e.dept_name, e.place_name, e.amount, e.purpose,
    extract(dow from e.used_at) in (0, 6) as is_weekend,
    extract(hour from e.used_at) >= 21    as is_late_night
from expense_entries e
where e.used_at is not null
  and (extract(dow from e.used_at) in (0, 6) or extract(hour from e.used_at) >= 21);

comment on view v_offhours_usage is
    '주말·심야 사용 내역. 화면에서 단정적으로 표현하지 말 것 — 정당한 사유가 있는 경우가 많다';
