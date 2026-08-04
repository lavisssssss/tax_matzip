"""
listing 회귀 테스트 — 네트워크 불필요, fixture만 사용.

list_page.html: 2026년 7월 필터 기준, 총 34건, 1페이지(15개 표시), 다음 페이지 있음.
"""

import pytest
from pathlib import Path
from src.listing import parse_list_page, list_url, month_range, page_count, ITEMS_PER_PAGE

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def list_result():
    html = (FIXTURES / "list_page.html").read_text(encoding="utf-8")
    return parse_list_page(html)


# ------------------------------------------------------------------ #
# 목록 파싱
# ------------------------------------------------------------------ #
def test_total_count(list_result):
    assert list_result["total"] == 34


def test_items_on_first_page(list_result):
    assert len(list_result["items"]) == 15


def test_has_next(list_result):
    assert list_result["has_next"] is True


def test_item_fields(list_result):
    for item in list_result["items"]:
        assert "nid" in item
        assert "source_url" in item
        assert "title" in item
        assert "seq" in item
        assert "posted_at" in item


def test_nid_is_numeric_string(list_result):
    for item in list_result["items"]:
        assert item["nid"].isdigit(), f"nid가 숫자가 아님: {item['nid']}"


def test_source_url_format(list_result):
    for item in list_result["items"]:
        assert item["source_url"].startswith("https://opengov.seoul.go.kr/expense/")


def test_seq_descending(list_result):
    seqs = [item["seq"] for item in list_result["items"] if item["seq"] is not None]
    assert seqs == sorted(seqs, reverse=True), "연번이 내림차순이어야 한다"


# ------------------------------------------------------------------ #
# URL 빌더
# ------------------------------------------------------------------ #
def test_list_url_basic():
    import re
    url = list_url(2026, 7)
    assert "ym[year]=2026" in url
    assert "ym[month]=7" in url
    assert f"items_per_page={ITEMS_PER_PAGE}" in url
    assert not re.search(r"[?&]page=", url), "page=1 이면 page 파라미터를 붙이지 않는다"


def test_list_url_with_page():
    url = list_url(2025, 1, page=2)
    assert "ym[year]=2025" in url
    assert "ym[month]=1" in url
    assert "page=2" in url


def test_list_url_no_percent_encoding():
    url = list_url(2026, 7)
    assert "%5B" not in url, "대괄호가 percent-encode 되면 안 된다"
    assert "[" in url
    assert "]" in url


# ------------------------------------------------------------------ #
# month_range
# ------------------------------------------------------------------ #
def test_month_range_order():
    months = list(month_range([2025, 2026]))
    assert months[0] == (2026, 12), "최신 달부터 시작해야 한다"
    assert months[-1] == (2025, 7), "2025-07이 가장 오래된 수집 대상이다"
    assert (2025, 6) not in months, "2025-06 이전은 포함되지 않아야 한다"


# ------------------------------------------------------------------ #
# page_count
# ------------------------------------------------------------------ #
@pytest.mark.parametrize("total,expected_pages", [
    (50, 1),
    (51, 2),
    (100, 2),
    (34, 1),
    (0, 1),
    (None, 1),
])
def test_page_count(total, expected_pages):
    assert page_count(total) == expected_pages
