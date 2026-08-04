"""
세금맛집 (tax_matzip) — 목록 페이지 파서 / URL 빌더

실제 목록 페이지(LIST.html, 2026년 7월 필터 적용본)로 확인한 구조.

핵심: 이 사이트의 목록은 '연도 + 월'을 골라서 조회한다.
     따라서 전체 목록을 페이지 번호로 훑지 말고, 월 단위로 나눠서 수집한다.

     장점:
       - 새 글이 올라와도 이미 수집한 달의 목록은 변하지 않는다
         (평면 페이지네이션은 새 글이 생기면 목록이 밀려서 누락·중복이 생긴다)
       - 월 하나가 작업 단위가 되어 중단/재개가 깔끔하다
       - 첫 페이지의 연번 최댓값 = 그 달의 총 건수. 진행률을 정확히 알 수 있다

리포에서는 src/listing.py 로 배치할 것.
"""

import re

BASE = "https://opengov.seoul.go.kr"
LIST_PATH = "/expense/list"

# 목록은 기본 15개씩 보여주지만 50개까지 늘릴 수 있다.
# 요청 횟수가 1/3로 줄어드는 셈이라 반드시 50을 쓴다.
ITEMS_PER_PAGE = 50

# 수집 범위: 2025-07 이후만
TARGET_YEARS = [2026, 2025]
START_YEAR, START_MONTH = 2025, 7   # 이 달 미만은 건너뛴다


def list_url(year, month, page=1, items_per_page=ITEMS_PER_PAGE):
    """월 단위 목록 URL.

    파라미터명에 대괄호가 포함된다: ym[year], ym[month]
    urlencode 를 쓰면 대괄호가 percent-encode 되므로 문자열로 직접 조립한다.
    """
    parts = [
        f"ym[year]={year}",
        f"ym[month]={month}",
        f"items_per_page={items_per_page}",
    ]
    if page and page > 1:
        parts.append(f"page={page}")
    return f"{BASE}{LIST_PATH}?{'&'.join(parts)}"


def month_range(years=TARGET_YEARS):
    """수집 대상 (연, 월) 조합. 최신부터 과거 순. START_YEAR_MONTH 미만은 건너뛴다."""
    for y in sorted(years, reverse=True):
        for m in range(12, 0, -1):
            if y < START_YEAR or (y == START_YEAR and m < START_MONTH):
                continue
            yield y, m


NID_RE = re.compile(r"/expense/(\d+)")


def parse_list_page(html):
    """목록 HTML -> {'items': [...], 'total': int|None, 'has_next': bool}

    목록 행 구조:
      <tr>
        <td class="data-num">34</td>
        <td class="data-title"><a href="/expense/36654894">제목</a></td>
        <td class="data-date">2026-08-02</td>
        <td class="date-hit">8</td>
      </tr>
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")
    items = []

    for tr in soup.find_all("tr"):
        a = tr.select_one("td.data-title a[href]")
        if not a:
            continue
        m = NID_RE.search(a["href"])
        if not m:
            continue

        num_td = tr.select_one("td.data-num")
        date_td = tr.select_one("td.data-date")

        items.append({
            "nid": m.group(1),
            "source_url": f"{BASE}/expense/{m.group(1)}",
            "title": a.get_text(" ", strip=True),
            "seq": int(num_td.get_text(strip=True)) if num_td and num_td.get_text(strip=True).isdigit() else None,
            "posted_at": date_td.get_text(strip=True) if date_td else None,
        })

    # 연번은 내림차순이다. 1페이지 첫 행의 연번이 그 달의 총 건수.
    total = items[0]["seq"] if items and items[0]["seq"] else None

    has_next = any(
        "page=" in (a.get("href") or "")
        for a in soup.find_all("a", href=True)
    )

    return {"items": items, "total": total, "has_next": has_next}


def page_count(total, items_per_page=ITEMS_PER_PAGE):
    """총 건수로 필요한 페이지 수를 계산한다."""
    if not total:
        return 1
    return (total + items_per_page - 1) // items_per_page
