-- 연도·식사유형 필터가 가능한 랭킹 함수
-- Supabase SQL Editor에서 실행 후: grant execute on function place_ranking to anon;

create or replace function place_ranking(
    p_year      int  default null,
    p_meal_type text default null
)
returns table(
    place_id          bigint,
    name              text,
    road_address      text,
    sigungu           text,
    lat               double precision,
    lng               double precision,
    category          text,
    visit_count       bigint,
    total_amount      numeric,
    avg_amount_per_head numeric,
    lunch_count       bigint,
    dinner_count      bigint,
    other_count       bigint,
    first_visit       timestamp,
    last_visit        timestamp
) language sql stable as $$
    select
        p.id                                                       as place_id,
        coalesce(p.matched_name, p.place_name)                     as name,
        p.road_address,
        p.sigungu,
        p.lat,
        p.lng,
        p.category,
        count(*)                                                   as visit_count,
        sum(e.amount)                                              as total_amount,
        round(avg(e.amount / nullif(e.head_count, 0)))             as avg_amount_per_head,
        count(*) filter (where e.meal_type = '점심')              as lunch_count,
        count(*) filter (where e.meal_type = '저녁')              as dinner_count,
        count(*) filter (where e.meal_type = '기타')              as other_count,
        min(e.used_at)                                             as first_visit,
        max(e.used_at)                                             as last_visit
    from expense_entries e
    join places p on p.id = e.place_id
    where p.match_status = 'matched'
      and (p_year      is null or extract(year from e.used_at) = p_year)
      and (p_meal_type is null or e.meal_type = p_meal_type)
    group by p.id
    having count(*) > 0
$$;

grant execute on function place_ranking(int, text) to anon;
