"""
세금맛집 CLI.

사용법:
  python -m src.cli list                  # 36개월 목록 수집
  python -m src.cli fetch [--limit N]     # 게시글 본문 수집 + 적재
  python -m src.cli geocode [--limit N]   # 카카오로 좌표 붙이기
  python -m src.cli renormalize           # 원본 보존, 정규화만 재실행
  python -m src.cli status                # 진행 상황
"""

import argparse
import sys
from pathlib import Path


def cmd_status(args):
    from .loader import get_conn
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("""
            select
                coalesce(sum(row_count), 0)   as total_rows,
                coalesce(sum(amount_sum), 0)   as total_amount,
                count(*) filter (where parse_status = 'parsed')     as parsed_docs,
                count(*) filter (where parse_status = 'no_entries') as no_entries_docs,
                count(*) filter (where parse_status = 'pending')    as pending_docs,
                count(*) filter (where parse_status = 'failed')     as failed_docs
            from (
                select d.parse_status, d.row_count,
                       (select sum(e.amount) from expense_entries e where e.document_id = d.id) as amount_sum
                from expense_documents d
            ) sub
        """)
        row = cur.fetchone()
        total_rows, total_amount, parsed, no_entries, pending, failed = row

        cur.execute("select count(*) from places where match_status = 'matched'")
        matched_places = cur.fetchone()[0]
        cur.execute("select count(*) from places")
        total_places = cur.fetchone()[0]

    conn.close()

    print("─" * 40)
    print(f"게시글:  parsed={parsed}  no_entries={no_entries}  pending={pending}  failed={failed}")
    print(f"집행 행: {total_rows:,}행  /  합계 {total_amount:,}원")
    print(f"장소:    {matched_places}/{total_places} 매칭됨")
    print("─" * 40)


def cmd_renormalize(args):
    from .loader import get_conn, renormalize
    conn = get_conn()
    updated = renormalize(conn)
    conn.close()
    print(f"재정규화 완료: {updated}행")


def cmd_load_fixtures(args):
    """fixture HTML 5건을 Supabase에 적재한다 (개발·검증용)."""
    from .page_parser import parse_page
    from .loader import get_conn, load_document

    fixtures_dir = Path(__file__).parent.parent / "tests" / "fixtures"
    samples = sorted(fixtures_dir.glob("sample*.html"))
    if not samples:
        print("fixtures 가 없습니다.")
        sys.exit(1)

    conn = get_conn()
    total_rows = 0
    total_amount = 0

    for path in samples:
        html = path.read_text(encoding="utf-8")
        result = parse_page(html)
        nid = path.stem          # sample1, sample2, …
        source_url = f"https://opengov.seoul.go.kr/expense/{nid}"

        doc_id = load_document(conn, nid, source_url, result)
        rows = result["rows"]
        amount = sum(r["amount"] or 0 for r in rows)
        total_rows += len(rows)
        total_amount += amount
        print(f"  {path.name}: {len(rows)}행 / {amount:,}원  → doc_id={doc_id}")

    conn.close()
    print(f"\n합계: {total_rows}행 / {total_amount:,}원")
    print("완료 기준: 23행 / 2,589,710원")


def cmd_list(args):
    from .fetcher import get_with_retry
    from .listing import list_url, parse_list_page, month_range, page_count
    from .loader import get_conn, upsert_listing_stub

    year_filter  = args.year
    month_filter = args.month

    conn = get_conn()
    try:
        for year, month in month_range():
            if year_filter  and year  != year_filter:
                continue
            if month_filter and month != month_filter:
                continue

            with conn.cursor() as cur:
                cur.execute(
                    "select status from crawl_months where period_year = %s and period_month = %s",
                    (year, month),
                )
                row = cur.fetchone()
            if row and row[0] in ("listed", "done"):
                print(f"{year}-{month:02d}: 이미 수집됨, 건너뜀")
                continue

            print(f"{year}-{month:02d}: 수집 중 ...", flush=True)
            try:
                url = list_url(year, month, page=1)
                html = get_with_retry(url)
                result = parse_list_page(html)
                total = result["total"]
                items = list(result["items"])

                pages = page_count(total) if total else 1
                for p in range(2, pages + 1):
                    html = get_with_retry(list_url(year, month, page=p))
                    items.extend(parse_list_page(html)["items"])

                for item in items:
                    upsert_listing_stub(
                        conn,
                        nid=item["nid"],
                        source_url=item["source_url"],
                        title=item["title"],
                        posted_at=item["posted_at"],
                        period_year=year,
                        period_month=month,
                    )

                with conn.cursor() as cur:
                    cur.execute(
                        """
                        update crawl_months set
                            total_count  = %s,
                            listed_count = %s,
                            status       = 'listed',
                            updated_at   = now()
                        where period_year = %s and period_month = %s
                        """,
                        (total, len(items), year, month),
                    )
                conn.commit()
                print(f"  → {len(items)}건 등록 (총 {total}건)")

            except Exception as e:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        update crawl_months set
                            status     = 'failed',
                            last_error = %s,
                            updated_at = now()
                        where period_year = %s and period_month = %s
                        """,
                        (str(e)[:500], year, month),
                    )
                conn.commit()
                print(f"  오류: {e}")
    finally:
        conn.close()


def cmd_fetch(args):
    from .fetcher import get_with_retry
    from .page_parser import parse_page
    from .loader import get_conn, load_document

    limit = args.limit
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                select id, nid, source_url
                from expense_documents
                where parse_status = 'pending'
                  and (period_year > 2025
                       or (period_year = 2025 and period_month >= 7))
                order by period_year desc, period_month desc, id
                """
                + (f" limit {limit}" if limit else "")
            )
            docs = cur.fetchall()

        print(f"대기 중인 문서: {len(docs)}건")

        for i, (doc_id, nid, source_url) in enumerate(docs, 1):
            print(f"[{i}/{len(docs)}] {nid}: {source_url}", flush=True)
            try:
                html = get_with_retry(source_url)
                result = parse_page(html)
                load_document(conn, nid, source_url, result)
                status = result["meta"].get("status", "?")
                n_rows = len(result["rows"])
                print(f"  → {status}  {n_rows}행")
            except Exception as e:
                with conn.cursor() as cur2:
                    cur2.execute(
                        """
                        update expense_documents set
                            parse_status = 'failed',
                            parse_error  = %s
                        where nid = %s
                        """,
                        (str(e)[:500], nid),
                    )
                conn.commit()
                print(f"  오류 (failed 로 기록): {e}")
    finally:
        conn.close()


def cmd_geocode(args):
    from .loader import get_conn
    from .geocoder import geocode

    limit = args.limit
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            """
            select id, place_name, place_address
            from places
            where match_status = 'pending'
            order by id
            limit %s
            """,
            (limit,),
        )
        rows = cur.fetchall()

    if not rows:
        print("지오코딩 대기 중인 장소가 없습니다.")
        conn.close()
        return

    print(f"지오코딩 시작: {len(rows)}건")
    matched = ambiguous = not_found = 0

    for i, (place_id, place_name, place_address) in enumerate(rows, 1):
        result = geocode(place_name, place_address)
        status = result["match_status"]

        with conn.cursor() as cur:
            cur.execute(
                """
                update places set
                    matched_name    = %(matched_name)s,
                    road_address    = %(road_address)s,
                    jibun_address   = %(jibun_address)s,
                    sido            = %(sido)s,
                    sigungu         = %(sigungu)s,
                    lat             = %(lat)s,
                    lng             = %(lng)s,
                    category        = %(category)s,
                    match_status    = %(match_status)s,
                    match_source    = %(match_source)s,
                    candidate_count = %(candidate_count)s,
                    updated_at      = now()
                where id = %(id)s
                """,
                {**result, "id": place_id},
            )
        conn.commit()

        if status == "matched":
            matched += 1
        elif status == "ambiguous":
            ambiguous += 1
        else:
            not_found += 1

        if i % 50 == 0 or i == len(rows):
            print(f"  [{i}/{len(rows)}] matched={matched} ambiguous={ambiguous} not_found={not_found}")

    conn.close()
    print(f"\n완료: matched={matched}  ambiguous={ambiguous}  not_found={not_found}")


def main():
    parser = argparse.ArgumentParser(prog="python -m src.cli")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("status",       help="진행 상황")
    sub.add_parser("renormalize",  help="원본 보존, 정규화만 재실행")
    sub.add_parser("load-fixtures",help="fixture 5건 적재 (개발용)")
    p_fetch = sub.add_parser("fetch", help="게시글 본문 수집 + 적재")
    p_fetch.add_argument("--limit", type=int, default=None)
    p_list = sub.add_parser("list",  help="36개월 목록 수집")
    p_list.add_argument("--year",  type=int, default=None, help="특정 연도만 (예: 2026)")
    p_list.add_argument("--month", type=int, default=None, help="특정 월만 (예: 7)")
    p_geo = sub.add_parser("geocode", help="카카오로 좌표 붙이기")
    p_geo.add_argument("--limit", type=int, default=100)

    args = parser.parse_args()

    dispatch = {
        "status":        cmd_status,
        "renormalize":   cmd_renormalize,
        "load-fixtures": cmd_load_fixtures,
        "list":          cmd_list,
        "fetch":         cmd_fetch,
        "geocode":       cmd_geocode,
    }

    if args.command in dispatch:
        dispatch[args.command](args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
