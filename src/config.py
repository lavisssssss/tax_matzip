"""
세금맛집 공통 설정
"""

import os
from dotenv import load_dotenv

load_dotenv()

# 정보소통광장 크롤 딜레이 — 절대 줄이지 않는다 (공식 권고: Crawl-delay 20)
DELAY_SEC = 20

SUPABASE_DSN = os.environ.get("SUPABASE_DSN")
KAKAO_REST_KEY = os.environ.get("KAKAO_REST_KEY")
NEXT_PUBLIC_NAVER_CLIENT_ID = os.environ.get("NEXT_PUBLIC_NAVER_CLIENT_ID")

BASE_URL = "https://opengov.seoul.go.kr"
