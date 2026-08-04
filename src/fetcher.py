"""
세금맛집 — HTTP 요청. 20초 지연이 이 모듈 한 곳에만 존재한다.
정보소통광장 전용. 카카오·네이버 API는 이 모듈을 쓰지 않는다.
"""

import time
import requests
from .config import DELAY_SEC

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "tax_matzip/0.1 (personal non-commercial research)"})


def get(url: str) -> str:
    """URL을 가져오고 DELAY_SEC 동안 기다린다."""
    resp = SESSION.get(url, timeout=30)
    resp.raise_for_status()
    html = resp.text
    time.sleep(DELAY_SEC)
    return html


def get_with_retry(url: str, max_retries: int = 3) -> str:
    """실패 시 지수 백오프로 재시도한다. 각 시도 후 항상 DELAY_SEC 이상 대기."""
    last_err = None
    for attempt in range(max_retries):
        try:
            resp = SESSION.get(url, timeout=30)
            resp.raise_for_status()
            html = resp.text
            time.sleep(DELAY_SEC)
            return html
        except Exception as e:
            last_err = e
            if attempt < max_retries - 1:
                wait = DELAY_SEC * (2 ** attempt)   # 20초, 40초
                print(f"    [{attempt + 1}/{max_retries}] 오류, {wait}초 후 재시도: {e}")
                time.sleep(wait)
    raise last_err
