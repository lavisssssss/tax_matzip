"""
세금맛집 (tax_matzip) — 게시글 HTML 파서

실제 샘플 5건(2024/2025/2026년, 본청/사업소, 23행)으로 검증된 로직.
주소 분리 23/23, 인원 추출 23/23 성공.

리포에서는 src/page_parser.py 로 배치할 것.
네트워크 의존이 전혀 없으므로 fixture만으로 테스트 가능하다.
"""

import re
from datetime import datetime

from bs4 import BeautifulSoup

# 집행내역 표를 식별하는 헤더 시그니처.
# 2024~2026년 샘플에서 9개 열이 완전히 동일했다.
EXPECTED_HEADER = [
    "연번", "부서명", "사용일시", "사용장소",
    "사용목적", "사용금액(원)", "사용자 및 인원", "결제방법", "비목",
]
HEADER_SIGNATURE = ["연번", "부서명", "사용일시"]

# 괄호 안이 주소인지 판별하는 힌트
ADDR_HINT = re.compile(r"(특별시|광역시|서울|경기|인천|부산|대전|대구|광주|울산|세종|"
                       r"강원|충북|충남|전북|전남|경북|경남|제주|[가-힣]{1,4}[시군구]\s)")

TITLE_RE = re.compile(r"(?P<year>20\d{2})년\s*(?P<month>\d{1,2})월\s*(?P<rest>.*?)\s*업무추진비"
                      r"(?:\s*-\s*(?P<exec_type>.*?))?\s*(?:>|$)")


# ------------------------------------------------------------
# 표 찾기
# ------------------------------------------------------------
def find_entry_table(soup):
    """집행내역 표를 찾는다. 없으면 None (집행내역 없는 달)."""
    for tb in soup.find_all("table"):
        ths = [th.get_text(strip=True) for th in tb.find_all("th")]
        if ths[:3] == HEADER_SIGNATURE:
            return tb, ths
    return None, None


def find_meta_table(soup):
    """담당자/등록일/담당부서/전화번호 표."""
    for tb in soup.find_all("table"):
        ths = [th.get_text(strip=True) for th in tb.find_all("th")]
        if "등록일" in ths and "담당부서" in ths:
            return tb
    return None


def parse_meta(soup):
    """등록일, 담당부서, 전화번호를 뽑는다. 담당자 실명은 수집하지 않는다."""
    out = {"posted_at": None, "charge_dept": None, "tel": None}
    tb = find_meta_table(soup)
    if not tb:
        return out
    for tr in tb.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
        for i in range(0, len(cells) - 1, 2):
            key, val = cells[i], cells[i + 1]
            if key == "등록일":
                out["posted_at"] = to_date(val)
            elif key == "담당부서":
                out["charge_dept"] = val
            elif key == "전화번호":
                out["tel"] = val
    return out


def parse_title(soup):
    """제목에서 연월 / 기관 / 부서 / 집행유형을 뽑는다."""
    t = soup.find("title")
    raw = t.get_text(strip=True) if t else ""
    title = raw.split(">")[0].strip()

    out = {"title": title, "period_year": None, "period_month": None,
           "org_name": None, "dept_name": None, "exec_type": None}

    m = TITLE_RE.search(title)
    if not m:
        return out

    out["period_year"] = int(m.group("year"))
    out["period_month"] = int(m.group("month"))
    if m.group("exec_type"):
        out["exec_type"] = m.group("exec_type").strip()

    rest = (m.group("rest") or "").strip()
    for org in ("서울시본청", "사업소", "자치구", "투자출연기관"):
        if rest.startswith(org):
            out["org_name"] = org
            rest = rest[len(org):].strip()
            break
    out["dept_name"] = rest or None
    return out


# ------------------------------------------------------------
# 셀 값 정규화
# ------------------------------------------------------------
def split_place(s):
    """'참숯골(서울시 중구 무교로 16)' -> ('참숯골', '서울시 중구 무교로 16')

    주소는 항상 '마지막' 괄호쌍에 들어 있다.
    '전설의 우대갈비(서울시청 직영점)(서울시 중구 남대문로9길 40)' 처럼
    상호명 자체에 괄호가 있는 경우가 있으므로 첫 괄호를 쓰면 안 된다.
    """
    if not s:
        return None, None
    s = s.strip()

    depth, start, last = 0, None, None
    for i, ch in enumerate(s):
        if ch == "(":
            if depth == 0:
                start = i
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                last = (start, i)

    if not last:
        return s, None

    inner = s[last[0] + 1:last[1]].strip()
    if not ADDR_HINT.search(inner + " "):
        return s, None            # 주소가 아닌 괄호(지점 설명 등)
    return s[:last[0]].strip(), inner


def to_datetime(s):
    """'2026-07-01 12:03' -> datetime. 시각이 없으면 00:00."""
    if not s:
        return None
    s = str(s).strip()
    s = re.sub(r"[./]", "-", s)
    m = re.search(r"(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?", s)
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    hh = int(m.group(4)) if m.group(4) else 0
    mi = int(m.group(5)) if m.group(5) else 0
    try:
        return datetime(y, mo, d, hh, mi)
    except ValueError:
        return None


def to_date(s):
    dt = to_datetime(s)
    return dt.date() if dt else None


def to_amount(s):
    if s is None:
        return None
    digits = re.sub(r"[^\d]", "", str(s))
    return int(digits) if digits else None


def head_count(s):
    """'과장 외 9명' -> 10 / '직원 5명' -> 5 / '교대근무직원(16명)' -> 16
    '외 N명'은 본인을 포함하지 않은 표현이므로 +1 한다.
    """
    if not s:
        return None
    m = re.search(r"외\s*(\d+)\s*[명인]", s)
    if m:
        return int(m.group(1)) + 1
    m = re.search(r"(\d+)\s*[명인]", s)
    if m:
        return int(m.group(1))
    return None


# ------------------------------------------------------------
# 메인
# ------------------------------------------------------------
def parse_page(html):
    """게시글 HTML -> {'meta': {...}, 'rows': [...]}"""
    soup = BeautifulSoup(html, "lxml")

    meta = parse_title(soup)
    meta.update(parse_meta(soup))

    tb, header = find_entry_table(soup)
    if tb is None:
        meta["status"] = "no_entries"       # 집행내역이 없는 달. 오류가 아니다
        return {"meta": meta, "rows": []}

    meta["status"] = "parsed"
    meta["header_matches_expected"] = (header == EXPECTED_HEADER)

    rows = []
    for idx, tr in enumerate(tb.find_all("tr")[1:]):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all("td")]
        if len(cells) < 9:
            continue

        payload = dict(zip(header, cells))          # 원본 그대로 보관할 값
        place_name, place_address = split_place(cells[3])

        rows.append({
            "row_index": idx,
            "payload": payload,
            "seq": cells[0],
            "dept_name": cells[1] or meta.get("dept_name"),
            "used_at": to_datetime(cells[2]),
            "used_at_text": cells[2],
            "place_raw": cells[3],
            "place_name": place_name,
            "place_address": place_address,
            "purpose": cells[4],
            "amount": to_amount(cells[5]),
            "participants": cells[6],
            "head_count": head_count(cells[6]),
            "payment_method": cells[7],
            "budget_type": cells[8],
        })
    return {"meta": meta, "rows": rows}
