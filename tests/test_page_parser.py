"""
page_parser 회귀 테스트 — 네트워크 불필요, fixture만 사용.

샘플 5건 기준:
  sample1: 6행  / 1,137,000원  (2026년 본청)
  sample2: 3행  /   391,630원  (2025년 사업소)
  sample3: 0행  —  no_entries  (2025년 사업소, 집행 없음)
  sample4: 10행 /   669,100원  (2024년 본청)
  sample5: 4행  /   391,980원  (2024년 사업소)
  합계  : 23행 / 2,589,710원
"""

import pytest
from pathlib import Path
from src.page_parser import parse_page, split_place, head_count, to_amount

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


# ------------------------------------------------------------------ #
# fixture 로드
# ------------------------------------------------------------------ #
@pytest.fixture(scope="module")
def results():
    return {i: parse_page(load(f"sample{i}.html")) for i in range(1, 6)}


# ------------------------------------------------------------------ #
# 전체 합계
# ------------------------------------------------------------------ #
def test_total_rows(results):
    total = sum(len(r["rows"]) for r in results.values())
    assert total == 23


def test_total_amount(results):
    total = sum(
        row["amount"]
        for r in results.values()
        for row in r["rows"]
        if row["amount"] is not None
    )
    assert total == 2_589_710


# ------------------------------------------------------------------ #
# 샘플별 행 수
# ------------------------------------------------------------------ #
@pytest.mark.parametrize("sample,expected_rows", [
    (1, 6),
    (2, 3),
    (3, 0),
    (4, 10),
    (5, 4),
])
def test_per_sample_row_count(results, sample, expected_rows):
    assert len(results[sample]["rows"]) == expected_rows


# ------------------------------------------------------------------ #
# parse_status
# ------------------------------------------------------------------ #
def test_sample3_no_entries(results):
    assert results[3]["meta"]["status"] == "no_entries"


@pytest.mark.parametrize("sample", [1, 2, 4, 5])
def test_parsed_samples_have_status_parsed(results, sample):
    assert results[sample]["meta"]["status"] == "parsed"


@pytest.mark.parametrize("sample", [1, 2, 4, 5])
def test_header_matches_expected(results, sample):
    assert results[sample]["meta"]["header_matches_expected"] is True


# ------------------------------------------------------------------ #
# split_place — 마지막 괄호쌍 규칙
# ------------------------------------------------------------------ #
@pytest.mark.parametrize("raw,expected_name,expected_addr", [
    (
        "참숯골(서울시 중구 무교로 16)",
        "참숯골",
        "서울시 중구 무교로 16",
    ),
    (
        "전설의 우대갈비(서울시청 직영점)(서울시 중구 남대문로9길 40)",
        "전설의 우대갈비(서울시청 직영점)",
        "서울시 중구 남대문로9길 40",
    ),
    (
        "고가풍경(경기 고양시 일산서구 대화동 2600)",
        "고가풍경",
        "경기 고양시 일산서구 대화동 2600",
    ),
    (
        "주소없는식당",
        "주소없는식당",
        None,
    ),
])
def test_split_place(raw, expected_name, expected_addr):
    name, addr = split_place(raw)
    assert name == expected_name
    assert addr == expected_addr


# ------------------------------------------------------------------ #
# head_count — '외 N명'은 +1, '인' 표기, 괄호 안 숫자
# ------------------------------------------------------------------ #
@pytest.mark.parametrize("s,expected", [
    ("재난상황관리과장 외 9명", 10),
    ("하광태 외 4인", 5),
    ("연구기획과 직원 5명", 5),
    ("재난안전상황실 교대근무직원(16명)", 16),
    ("", None),
    (None, None),
])
def test_head_count(s, expected):
    assert head_count(s) == expected


# ------------------------------------------------------------------ #
# 각 행에 필수 필드가 있는지
# ------------------------------------------------------------------ #
REQUIRED_FIELDS = {"dept_name", "used_at", "place_raw", "amount", "payment_method", "budget_type"}


@pytest.mark.parametrize("sample", [1, 2, 4, 5])
def test_row_fields_present(results, sample):
    for row in results[sample]["rows"]:
        for field in REQUIRED_FIELDS:
            assert field in row, f"sample{sample} 누락 필드: {field}"


@pytest.mark.parametrize("sample", [1, 2, 4, 5])
def test_amounts_are_positive(results, sample):
    for row in results[sample]["rows"]:
        if row["amount"] is not None:
            assert row["amount"] > 0


@pytest.mark.parametrize("sample", [1, 2, 4, 5])
def test_used_at_is_datetime(results, sample):
    from datetime import datetime
    for row in results[sample]["rows"]:
        assert isinstance(row["used_at"], datetime), f"sample{sample} used_at 타입 오류: {row['used_at']!r}"
