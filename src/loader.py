"""
세금맛집 — Supabase 적재 (Phase 2)

원칙:
- expense_raw_rows.payload 에 원본 행을 통째로 저장한 뒤 정규화한다
- 정규화 실패 행도 원본은 반드시 적재한다 (조용히 버리지 않는다)
- 같은 nid 를 두 번 넣어도 멱등성이 보장된다 (upsert)
"""

import json
import re
import hashlib

import psycopg2
import psycopg2.extras

from . import config


def get_conn():
    return psycopg2.connect(config.SUPABASE_DSN)


def make_lookup_key(place_name, place_address):
    """상호명+주소 공백 제거 → 중복 조회 방지 캐시 키."""
    raw = (place_name or "") + (place_address or "")
    return re.sub(r"\s+", "", raw) or None


def upsert_listing_stub(conn, nid, source_url, title, posted_at, period_year, period_month):
    """목록 수집 단계: 게시글 스텁만 삽입한다. 이미 있으면 건너뛴다."""
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into expense_documents
                (nid, source_url, title, posted_at, period_year, period_month,
                 parse_status, crawled_at)
            values (%s, %s, %s, %s, %s, %s, 'pending', now())
            on conflict (nid) do nothing
            """,
            (nid, source_url, title, posted_at, period_year, period_month),
        )


def load_document(conn, nid, source_url, parse_result):
    """
    게시글 1건 (page_parser.parse_page 결과)을 DB에 적재한다.
    반환: document_id (int)
    """
    meta = parse_result["meta"]
    rows = parse_result["rows"]
    content_hash = hashlib.md5(
        json.dumps(rows, default=str, ensure_ascii=False).encode()
    ).hexdigest()

    with conn.cursor() as cur:
        # ── 1) expense_documents ──────────────────────────────
        cur.execute(
            """
            insert into expense_documents
                (nid, source_url, title, org_name, dept_name, exec_type,
                 period_year, period_month, posted_at, charge_dept, tel,
                 content_hash, parse_status, header_ok, row_count,
                 crawled_at, parsed_at)
            values
                (%(nid)s, %(source_url)s, %(title)s, %(org_name)s,
                 %(dept_name)s, %(exec_type)s,
                 %(period_year)s, %(period_month)s, %(posted_at)s,
                 %(charge_dept)s, %(tel)s,
                 %(content_hash)s, %(parse_status)s, %(header_ok)s,
                 %(row_count)s, now(), now())
            on conflict (nid) do update set
                title        = excluded.title,
                org_name     = excluded.org_name,
                dept_name    = excluded.dept_name,
                exec_type    = excluded.exec_type,
                period_year  = coalesce(excluded.period_year,  expense_documents.period_year),
                period_month = coalesce(excluded.period_month, expense_documents.period_month),
                posted_at    = coalesce(excluded.posted_at,    expense_documents.posted_at),
                charge_dept  = excluded.charge_dept,
                tel          = excluded.tel,
                content_hash = excluded.content_hash,
                parse_status = excluded.parse_status,
                header_ok    = excluded.header_ok,
                row_count    = excluded.row_count,
                parsed_at    = excluded.parsed_at
            returning id
            """,
            {
                "nid": nid,
                "source_url": source_url,
                "title": meta.get("title"),
                "org_name": meta.get("org_name"),
                "dept_name": meta.get("dept_name"),
                "exec_type": meta.get("exec_type"),
                "period_year": meta.get("period_year"),
                "period_month": meta.get("period_month"),
                "posted_at": meta.get("posted_at"),
                "charge_dept": meta.get("charge_dept"),
                "tel": meta.get("tel"),
                "content_hash": content_hash,
                "parse_status": meta.get("status", "parsed"),
                "header_ok": meta.get("header_matches_expected"),
                "row_count": len(rows),
            },
        )
        doc_id = cur.fetchone()[0]

        # ── 2) 행별 적재 ───────────────────────────────────────
        for row in rows:
            # 2a) expense_raw_rows
            cur.execute(
                """
                insert into expense_raw_rows (document_id, row_index, payload)
                values (%s, %s, %s)
                on conflict (document_id, row_index) do update set
                    payload = excluded.payload
                returning id
                """,
                (
                    doc_id,
                    row["row_index"],
                    json.dumps(row["payload"], ensure_ascii=False),
                ),
            )
            raw_row_id = cur.fetchone()[0]

            # 2b) places (lookup_key 기반 캐시)
            place_id = None
            lookup_key = make_lookup_key(row.get("place_name"), row.get("place_address"))
            if lookup_key:
                cur.execute(
                    """
                    insert into places (place_name, place_address, lookup_key)
                    values (%s, %s, %s)
                    on conflict (lookup_key) do nothing
                    returning id
                    """,
                    (row.get("place_name"), row.get("place_address"), lookup_key),
                )
                result = cur.fetchone()
                if result:
                    place_id = result[0]
                else:
                    cur.execute(
                        "select id from places where lookup_key = %s", (lookup_key,)
                    )
                    place_id = cur.fetchone()[0]

            # 2c) expense_entries
            cur.execute(
                """
                insert into expense_entries
                    (document_id, raw_row_id, used_at, used_at_text, dept_name,
                     place_raw, place_name, place_address, place_id,
                     purpose, amount, participants, head_count,
                     payment_method, budget_type)
                values
                    (%(document_id)s, %(raw_row_id)s, %(used_at)s, %(used_at_text)s,
                     %(dept_name)s, %(place_raw)s, %(place_name)s, %(place_address)s,
                     %(place_id)s, %(purpose)s, %(amount)s, %(participants)s,
                     %(head_count)s, %(payment_method)s, %(budget_type)s)
                on conflict (raw_row_id) do update set
                    used_at         = excluded.used_at,
                    dept_name       = excluded.dept_name,
                    place_raw       = excluded.place_raw,
                    place_name      = excluded.place_name,
                    place_address   = excluded.place_address,
                    place_id        = excluded.place_id,
                    purpose         = excluded.purpose,
                    amount          = excluded.amount,
                    participants    = excluded.participants,
                    head_count      = excluded.head_count,
                    payment_method  = excluded.payment_method,
                    budget_type     = excluded.budget_type
                """,
                {
                    "document_id": doc_id,
                    "raw_row_id": raw_row_id,
                    "used_at": row.get("used_at"),
                    "used_at_text": row.get("used_at_text"),
                    "dept_name": row.get("dept_name"),
                    "place_raw": row.get("place_raw"),
                    "place_name": row.get("place_name"),
                    "place_address": row.get("place_address"),
                    "place_id": place_id,
                    "purpose": row.get("purpose"),
                    "amount": row.get("amount"),
                    "participants": row.get("participants"),
                    "head_count": row.get("head_count"),
                    "payment_method": row.get("payment_method"),
                    "budget_type": row.get("budget_type"),
                },
            )

    conn.commit()
    return doc_id


def renormalize(conn):
    """
    expense_raw_rows 의 payload 를 읽어 expense_entries 를 재계산한다.
    원본(payload)은 건드리지 않는다.
    """
    from .page_parser import split_place, to_datetime, to_amount, head_count

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            select r.id as raw_row_id, r.document_id, r.row_index, r.payload,
                   d.dept_name as doc_dept
            from expense_raw_rows r
            join expense_documents d on d.id = r.document_id
            order by r.document_id, r.row_index
            """
        )
        rows = cur.fetchall()

    updated = 0
    with conn.cursor() as cur:
        for r in rows:
            p = r["payload"]
            place_name, place_address = split_place(p.get("사용장소", ""))
            lookup_key = make_lookup_key(place_name, place_address)

            place_id = None
            if lookup_key:
                cur.execute(
                    "select id from places where lookup_key = %s", (lookup_key,)
                )
                res = cur.fetchone()
                place_id = res[0] if res else None

            cur.execute(
                """
                insert into expense_entries
                    (document_id, raw_row_id, used_at, used_at_text, dept_name,
                     place_raw, place_name, place_address, place_id,
                     purpose, amount, participants, head_count,
                     payment_method, budget_type)
                values
                    (%(document_id)s, %(raw_row_id)s, %(used_at)s, %(used_at_text)s,
                     %(dept_name)s, %(place_raw)s, %(place_name)s, %(place_address)s,
                     %(place_id)s, %(purpose)s, %(amount)s, %(participants)s,
                     %(head_count)s, %(payment_method)s, %(budget_type)s)
                on conflict (raw_row_id) do update set
                    used_at         = excluded.used_at,
                    dept_name       = excluded.dept_name,
                    place_raw       = excluded.place_raw,
                    place_name      = excluded.place_name,
                    place_address   = excluded.place_address,
                    place_id        = excluded.place_id,
                    purpose         = excluded.purpose,
                    amount          = excluded.amount,
                    participants    = excluded.participants,
                    head_count      = excluded.head_count,
                    payment_method  = excluded.payment_method,
                    budget_type     = excluded.budget_type
                """,
                {
                    "document_id": r["document_id"],
                    "raw_row_id": r["raw_row_id"],
                    "used_at": to_datetime(p.get("사용일시")),
                    "used_at_text": p.get("사용일시"),
                    "dept_name": p.get("부서명") or r["doc_dept"],
                    "place_raw": p.get("사용장소"),
                    "place_name": place_name,
                    "place_address": place_address,
                    "place_id": place_id,
                    "purpose": p.get("사용목적"),
                    "amount": to_amount(p.get("사용금액(원)")),
                    "participants": p.get("사용자 및 인원"),
                    "head_count": head_count(p.get("사용자 및 인원")),
                    "payment_method": p.get("결제방법"),
                    "budget_type": p.get("비목"),
                },
            )
            updated += 1

    conn.commit()
    return updated
