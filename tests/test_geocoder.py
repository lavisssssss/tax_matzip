"""
geocoder 주소 정제 회귀 테스트 — 네트워크 불필요.

카카오 API 호출부(geocode, search_address, search_keyword)는 테스트하지 않는다.
정제 함수들(address_candidates, normalize_sido, strip_tail, clean_place_name, extract_gu)만 대상.
"""

import pytest
from src.geocoder import (
    address_candidates,
    normalize_sido,
    strip_tail,
    road_core_only,
    clean_place_name,
    extract_gu,
    lookup_key,
)


# ------------------------------------------------------------------ #
# normalize_sido
# ------------------------------------------------------------------ #
@pytest.mark.parametrize("raw,expected", [
    ("서울시 중구 무교로 16",        "서울특별시 중구 무교로 16"),
    ("서울 광진구 광나루로 516",      "서울특별시 광진구 광나루로 516"),
    ("서울특별시 강남구 테헤란로 1",   "서울특별시 강남구 테헤란로 1"),
    ("서초구 매헌로 17",             "서울특별시 서초구 매헌로 17"),
    ("경기 고양시 일산서구 대화동 2600", "경기 고양시 일산서구 대화동 2600"),
])
def test_normalize_sido(raw, expected):
    assert normalize_sido(raw) == expected


# ------------------------------------------------------------------ #
# strip_tail
# ------------------------------------------------------------------ #
@pytest.mark.parametrize("raw,expected", [
    # 층수 제거 — 핵심 케이스
    ("서울특별시 중구 서소문로 11길 19 LL층",   "서울특별시 중구 서소문로 11길 19"),
    ("서울특별시 종로구 윤보선길 16-1, 1층",    "서울특별시 종로구 윤보선길 16-1"),
    ("서울특별시 중구 세종대로 135, 지하1층",   "서울특별시 중구 세종대로 135"),
    # 끝 괄호 제거
    ("서울특별시 서초구 매헌로 17(양재동)",     "서울특별시 서초구 매헌로 17"),
    # 쉼표 뒤 제거
    ("서울특별시 종로구 윤보선길 16-1, 1층 입구", "서울특별시 종로구 윤보선길 16-1"),
    # 건물명 — road_core_only 에서 처리하므로 strip_tail은 건들지 않는다
    ("서울특별시 광진구 광나루로 516 하이웨이마트", "서울특별시 광진구 광나루로 516 하이웨이마트"),
])
def test_strip_tail(raw, expected):
    assert strip_tail(raw) == expected


# ------------------------------------------------------------------ #
# road_core_only — 건물명 제거
# ------------------------------------------------------------------ #
def test_road_core_only_building_name():
    assert road_core_only("서울특별시 광진구 광나루로 516 하이웨이마트") == \
           "서울특별시 광진구 광나루로 516"


def test_road_core_only_no_change_when_clean():
    addr = "서울특별시 중구 서소문로 11길 19"
    assert road_core_only(addr) == addr


# ------------------------------------------------------------------ #
# address_candidates — 핵심: 서소문로 11길 19가 11로 잘리면 안 된다
# ------------------------------------------------------------------ #
def test_candidates_soesomunro_not_cut():
    """'서소문로 11길 19 LL층' → 두 번째 후보가 '서소문로 11길 19' 이어야 한다.
    '서소문로 11' 로 잘리면 안 된다."""
    cands = address_candidates("서울시 중구 서소문로 11길 19 LL층")
    assert len(cands) >= 2
    assert cands[0] == "서울특별시 중구 서소문로 11길 19 LL층"
    assert cands[1] == "서울특별시 중구 서소문로 11길 19"
    # '서소문로 11' 로 잘린 후보가 없어야 한다
    for c in cands:
        assert "서소문로 11" not in c or "서소문로 11길" in c, \
            f"'서소문로 11' 에서 잘렸다: {c!r}"


def test_candidates_seochugu_prepends_sido():
    """시도가 없는 주소에 '서울특별시'가 붙어야 한다."""
    cands = address_candidates("서초구 매헌로 17")
    assert cands[0].startswith("서울특별시")
    assert "서초구 매헌로 17" in cands[0]


def test_candidates_yunboseongi_comma():
    """쉼표 뒤 층수가 제거되어야 한다."""
    cands = address_candidates("서울시 종로구 윤보선길 16-1, 1층")
    assert "1층" not in cands[-1]
    assert "윤보선길 16-1" in cands[-1]


def test_candidates_highway_mart():
    """건물명(하이웨이마트)이 제거된 후보가 포함되어야 한다."""
    cands = address_candidates("서울 광진구 광나루로 516 하이웨이마트")
    cleaned = [c for c in cands if "하이웨이마트" not in c]
    assert cleaned, "건물명이 제거된 후보가 없다"
    assert any("광나루로 516" in c for c in cleaned)


def test_candidates_gyeonggi_no_modification():
    """서울 밖 주소는 시도 변환 없이 그대로 나와야 한다."""
    cands = address_candidates("경기 고양시 일산서구 대화동 2600")
    assert cands[0].startswith("경기")


def test_candidates_deduplication():
    """정제 결과가 동일한 값이 중복으로 나오면 안 된다."""
    cands = address_candidates("서초구 매헌로 17")
    assert len(cands) == len(set(cands)), "중복 후보가 있다"


# ------------------------------------------------------------------ #
# clean_place_name
# ------------------------------------------------------------------ #
@pytest.mark.parametrize("raw,expected", [
    ("㈜이마트 양재점",        "이마트 양재점"),
    ("(주)스타벅스 강남점",    "스타벅스 강남점"),
    ("전설의 우대갈비(서울시청 직영점)", "전설의 우대갈비"),
    ("참숯골",                 "참숯골"),
    (None,                     None),
    ("",                       None),
])
def test_clean_place_name(raw, expected):
    result = clean_place_name(raw)
    assert result == expected


# ------------------------------------------------------------------ #
# extract_gu
# ------------------------------------------------------------------ #
@pytest.mark.parametrize("addr,expected_gu", [
    ("서울특별시 중구 서소문로 11길 19",    "중구"),
    ("서울특별시 서초구 매헌로 17",         "서초구"),
    ("경기 고양시 일산서구 대화동",         None),   # 서울 밖
    (None,                                  None),
])
def test_extract_gu(addr, expected_gu):
    assert extract_gu(addr) == expected_gu


# ------------------------------------------------------------------ #
# lookup_key
# ------------------------------------------------------------------ #
def test_lookup_key_ignores_spaces():
    k1 = lookup_key("참 숯 골", "서울 중구 무교로 16")
    k2 = lookup_key("참숯골",   "서울중구무교로16")
    assert k1 == k2


def test_lookup_key_distinct():
    k1 = lookup_key("참숯골", "서울 중구 무교로 16")
    k2 = lookup_key("참숯골", "서울 강남구 테헤란로 1")
    assert k1 != k2
