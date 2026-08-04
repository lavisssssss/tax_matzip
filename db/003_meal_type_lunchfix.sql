-- ============================================================
-- 003_meal_type_lunchfix.sql  — 점심 시간 상한 13시 → 15시로 변경
-- 실행: Supabase 대시보드 > SQL Editor
-- ============================================================

-- meal_type 컬럼을 참조하는 뷰도 함께 제거
DROP VIEW IF EXISTS v_meal_type_stats;
DROP VIEW IF EXISTS v_place_ranking;
DROP INDEX IF EXISTS idx_entry_meal_type;

ALTER TABLE expense_entries DROP COLUMN IF EXISTS meal_type;

ALTER TABLE expense_entries
    ADD COLUMN meal_type TEXT
        GENERATED ALWAYS AS (
            CASE
                WHEN used_at IS NULL                                THEN NULL
                WHEN EXTRACT(hour FROM used_at) BETWEEN 11 AND 15  THEN '점심'
                WHEN EXTRACT(hour FROM used_at) BETWEEN 17 AND 21  THEN '저녁'
                ELSE '기타'
            END
        ) STORED;

CREATE INDEX idx_entry_meal_type ON expense_entries (meal_type);

-- 뷰 재생성
CREATE VIEW v_meal_type_stats AS
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
