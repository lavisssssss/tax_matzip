"""
세금맛집 (tax_matzip) — 지오코더

좌표 획득은 카카오, 화면 표시는 네이버 Dynamic Map.
두 서비스 모두 WGS84(위경도)를 쓰므로 좌표를 그대로 넘겨도 된다.
(카카오 REST 응답의 x = 경도(lng), y = 위도(lat) 순서에 주의)

전략:
  1) 주소 검색 (/v2/local/search/address)  — 정확도 최상
     주소를 단계적으로 단순화하며 재시도한다
  2) 실패 시 키워드 검색 (/v2/local/search/keyword) — 상호명으로 찾기
     자치구명을 붙여 검색 범위를 좁힌다
  3) 그래도 실패 → not_found / 후보 여러 개 → ambiguous

리포에서는 src/geocoder.py 로 배치할 것.
정제 함수들은 네트워크 없이 테스트할 수 있게 분리해 두었다.
"""

import os
import re
import time

import requests

KAKAO_REST_KEY = os.environ.get("KAKAO_REST_KEY")
ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"

HEADERS = {"Authorization": f"KakaoAK {KAKAO_REST_KEY}"}

# 카카오 로컬 API는 여유 있는 편이지만 예의상 간격을 둔다 (정보소통광장과 무관)
API_DELAY = 0.2

SEOUL_GU = [
    "종로구", "중구", "용산구", "성동구", "광진구", "동대문구", "중랑구", "성북구",
    "강북구", "도봉구", "노원구", "은평구", "서대문구", "마포구", "양천구", "강서구",
    "구로구", "금천구", "영등포구", "동작구", "관악구", "서초구", "강남구", "송파구",
    "강동구",
]


# ============================================================
# 주소 정제 — 네트워크 불필요, 단위 테스트 대상
# ============================================================
# 실제 데이터에서 확인된 꼬리들:
#   '서울시 중구 서소문로 11길 19 LL층'
#   '서울시 종로구 윤보선길 16-1, 1층'
#   '서울 광진구 광나루로 516 하이웨이마트'
#   '서초구 매헌로 17'                     (시도 생략)

TAIL_PATTERNS = [
    # '19 LL층' / '16-1, 1층' / '135, 지하1층' 등. 앞에 공백이나 쉼표가 반드시 있어야
    # 번지 숫자의 일부를 잘라먹지 않는다.
    r"(?:,|\s)\s*(?:지하\s*)?[A-Za-z]{0,2}\s*\d*\s*층.*$",
    r"\s*\(.*?\)\s*$",                         # 끝에 붙은 괄호
    r",.*$",                                   # 쉼표 뒤 상세주소
]

# 도로명 주소의 핵심부만 남긴다.
# '서소문로 11길 19' 처럼 '로 N길 M' 형태를 '서소문로 11' 로 잘라먹지 않도록
# 긴 형태를 먼저 매칭한다.
ROAD_CORE = re.compile(
    r"^(?P<head>.*?[가-힣]+구\s+"
    r"(?:[가-힣0-9]+로\s*\d+길|[가-힣0-9]+(?:로|길))"
    r"\s*\d+(?:-\d+)?)"
)


def normalize_sido(addr):
    """'서울시' / '서울' -> '서울특별시', 시도가 없으면 붙여준다."""
    a = addr.strip()
    a = re.sub(r"^서울시\s+", "서울특별시 ", a)
    a = re.sub(r"^서울\s+", "서울특별시 ", a)
    if not a.startswith(("서울특별시", "경기", "인천", "부산", "대구", "광주",
                         "대전", "울산", "세종", "강원", "충", "전", "경", "제주")):
        # '서초구 매헌로 17' 처럼 구부터 시작하는 경우
        if any(a.startswith(g) for g in SEOUL_GU):
            a = "서울특별시 " + a
    return a


def strip_tail(addr):
    """층수·건물명·쉼표 뒤 상세주소를 잘라낸다."""
    a = addr.strip()
    for pat in TAIL_PATTERNS:
        a = re.sub(pat, "", a).strip()
    return a


def road_core_only(addr):
    """'서울특별시 광진구 광나루로 516 하이웨이마트' -> '서울특별시 광진구 광나루로 516'"""
    m = ROAD_CORE.match(addr)
    return m.group("head").strip() if m else addr


def address_candidates(raw_address):
    """단순한 것부터가 아니라 '원문에 가까운 것부터' 시도한다.
    앞쪽이 실패해야 더 과감하게 잘라낸다."""
    if not raw_address:
        return []
    base = normalize_sido(raw_address)
    cands = [
        base,
        strip_tail(base),
        road_core_only(strip_tail(base)),
    ]
    out, seen = [], set()
    for c in cands:
        c = re.sub(r"\s+", " ", c).strip()
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def extract_gu(addr):
    """주소에서 자치구명을 뽑는다. 키워드 검색 범위를 좁히는 데 쓴다."""
    if not addr:
        return None
    for g in SEOUL_GU:
        if g in addr:
            return g
    return None


def clean_place_name(name):
    """'㈜이마트 양재점' -> '이마트 양재점' / 괄호 설명 제거"""
    if not name:
        return None
    n = re.sub(r"^\(?주\)?식?회?사?\s*", "", name.strip())
    n = n.replace("㈜", "").replace("(주)", "")
    n = re.sub(r"\(.*?\)", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def lookup_key(place_name, place_address):
    """places 테이블의 캐시 키. 같은 가게를 두 번 조회하지 않기 위한 값."""
    n = re.sub(r"\s+", "", (place_name or ""))
    a = re.sub(r"\s+", "", (place_address or ""))
    return f"{n}|{a}"


# ============================================================
# 카카오 호출
# ============================================================
def _get(url, params):
    resp = requests.get(url, headers=HEADERS, params=params, timeout=10)
    time.sleep(API_DELAY)
    if resp.status_code == 429:
        time.sleep(3)
        resp = requests.get(url, headers=HEADERS, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


def search_address(query):
    return _get(ADDRESS_URL, {"query": query, "size": 5}).get("documents", [])


def search_keyword(query, gu=None):
    params = {"query": query, "size": 5}
    if gu:
        params["query"] = f"{gu} {query}"
    # 음식점(FD6) / 카페(CE7) 로 좁히면 정확도가 오르지만,
    # 마트·편의점 사용 사례도 있으므로 카테고리 제한은 걸지 않는다
    return _get(KEYWORD_URL, {**params}).get("documents", [])


# ============================================================
# 메인
# ============================================================
def geocode(place_name, place_address):
    """-> dict (places 테이블에 그대로 넣을 수 있는 형태)"""
    result = {
        "matched_name": None,
        "road_address": None,
        "jibun_address": None,
        "sido": None,
        "sigungu": None,
        "lat": None,
        "lng": None,
        "category": None,
        "match_status": "not_found",
        "match_source": None,
        "candidate_count": 0,
    }

    # --- 1단계: 주소 검색 ---
    for cand in address_candidates(place_address):
        docs = search_address(cand)
        if not docs:
            continue
        if len(docs) > 1:
            result["candidate_count"] = len(docs)
        d = docs[0]
        road = d.get("road_address") or {}
        jibun = d.get("address") or {}
        result.update({
            "road_address": road.get("address_name"),
            "jibun_address": jibun.get("address_name"),
            "sido": road.get("region_1depth_name") or jibun.get("region_1depth_name"),
            "sigungu": road.get("region_2depth_name") or jibun.get("region_2depth_name"),
            "lng": float(d["x"]),       # 카카오는 x가 경도
            "lat": float(d["y"]),       # y가 위도
            "match_status": "matched",
            "match_source": "address",
        })
        return result

    # --- 2단계: 상호명 키워드 검색 ---
    name = clean_place_name(place_name)
    if name:
        gu = extract_gu(place_address)
        docs = search_keyword(name, gu)
        if docs:
            result["candidate_count"] = len(docs)
            d = docs[0]
            result.update({
                "matched_name": d.get("place_name"),
                "road_address": d.get("road_address_name") or None,
                "jibun_address": d.get("address_name") or None,
                "sigungu": extract_gu(d.get("road_address_name") or d.get("address_name") or ""),
                "lng": float(d["x"]),
                "lat": float(d["y"]),
                "category": d.get("category_group_name") or d.get("category_name"),
                "match_source": "keyword",
            })
            # 자치구를 지정했는데도 후보가 여러 개면 사람이 확인해야 한다
            result["match_status"] = "matched" if len(docs) == 1 else "ambiguous"
            return result

    return result
