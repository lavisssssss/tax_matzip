-- ============================================================
-- 002_meal_type.sql  — 식사 유형 분류
-- 실행: Supabase 대시보드 > SQL Editor
-- ============================================================

-- expense_entries 에 meal_type 생성 컬럼 추가
-- used_at 시각을 기준으로 자동 계산된다 (저장된 값, 별도 갱신 불필요)
ALTER TABLE expense_entries
    ADD COLUMN IF NOT EXISTS meal_type TEXT
        GENERATED ALWAYS AS (
            CASE
                WHEN used_at IS NULL                                THEN NULL
                WHEN EXTRACT(hour FROM used_at) BETWEEN 11 AND 15  THEN '점심'
                WHEN EXTRACT(hour FROM used_at) BETWEEN 17 AND 21  THEN '저녁'
                ELSE '기타'
            END
        ) STORED;

CREATE INDEX IF NOT EXISTS idx_entry_meal_type ON expense_entries (meal_type);

-- ------------------------------------------------------------
-- 식사 유형별 통계 뷰
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_meal_type_stats AS
SELECT
    meal_type,
    count(*)                                        AS visit_count,
    count(DISTINCT place_id)                        AS place_count,
    sum(amount)                                     AS total_amount,
    round(avg(amount))                              AS avg_amount,
    round(avg(amount / NULLIF(head_count, 0)))      AS avg_per_head
FROM expense_entries
WHERE meal_type IS NOT NULL
GROUP BY meal_type
ORDER BY visit_count DESC;

-- ------------------------------------------------------------
-- v_place_ranking 에 식사 유형 비중 포함
-- CREATE OR REPLACE 는 컬럼 추가/순서 변경을 허용하지 않으므로 DROP 후 재생성
-- ------------------------------------------------------------
DROP VIEW IF EXISTS v_place_ranking;
CREATE VIEW v_place_ranking AS
SELECT
    p.id                                            AS place_id,
    COALESCE(p.matched_name, p.place_name)          AS name,
    p.road_address,
    p.sigungu,
    p.lat,
    p.lng,
    p.category,
    count(*)                                        AS visit_count,
    count(DISTINCT e.dept_name)                     AS dept_count,
    sum(e.amount)                                   AS total_amount,
    round(avg(e.amount))                            AS avg_amount,
    round(avg(e.amount / NULLIF(e.head_count, 0))) AS avg_amount_per_head,
    count(*) FILTER (WHERE e.meal_type = '점심')    AS lunch_count,
    count(*) FILTER (WHERE e.meal_type = '저녁')    AS dinner_count,
    count(*) FILTER (WHERE e.meal_type = '기타')    AS other_count,
    min(e.used_at)                                  AS first_visit,
    max(e.used_at)                                  AS last_visit
FROM expense_entries e
JOIN places p ON p.id = e.place_id
WHERE p.match_status = 'matched'
GROUP BY p.id;
