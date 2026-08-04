'use client'
import { useEffect, useRef, useState, useCallback, useReducer } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { PlaceRanking } from '@/lib/types'

declare global { interface Window { naver: any } }

const SEOUL_GU = [
  '종로구','중구','용산구','성동구','광진구','동대문구','중랑구','성북구',
  '강북구','도봉구','노원구','은평구','서대문구','마포구','양천구','강서구',
  '구로구','금천구','영등포구','동작구','관악구','서초구','강남구','송파구','강동구',
]
const YEARS      = ['전체', '2026', '2025']
const MEAL_TYPES = ['전체', '점심', '저녁']
const DURATION   = 520

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3)

function buildLabel(year: string, gu: string, meal: string) {
  const period = year !== '전체' ? `${year}년도` : '전체기간'
  const region = gu   !== '전체' ? gu           : '서울시 기준'
  const mealStr = meal !== '전체' ? ` ${meal}식사` : ''
  return `${period} ${region}${mealStr} 업무추진비는`
}

function fmtAmt(n: number) {
  return Math.round(n).toLocaleString('ko-KR')
}

type DropKey = 'year' | 'gu' | 'meal' | null

export default function MapPage() {
  const mapRef   = useRef<HTMLDivElement>(null)
  const naverMap = useRef<any>(null)
  const markers  = useRef<any[]>([])
  const router   = useRouter()

  const [allPlaces,  setAllPlaces]  = useState<PlaceRanking[]>([])
  const [filterYear, setFilterYear] = useState('전체')
  const [filterGu,   setFilterGu]   = useState('전체')
  const [filterMeal, setFilterMeal] = useState('전체')
  const [open,       setOpen]       = useState<DropKey>(null)

  // ── 금액 카운트업 애니메이션 (인스턴스 변수 기반) ──────────
  const displayAmtRef  = useRef(0)
  const rafRef         = useRef<number | null>(null)
  const animStartRef   = useRef(0)
  const animFromRef    = useRef(0)
  const animToRef      = useRef(0)
  const [, tick]       = useReducer(x => x + 1, 0)   // forceUpdate

  const animateTo = useCallback((target: number) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    const from = displayAmtRef.current
    animFromRef.current  = from
    animToRef.current    = target
    animStartRef.current = performance.now()

    const step = (now: number) => {
      const p      = Math.min((now - animStartRef.current) / DURATION, 1)
      const eased  = easeOutCubic(p)
      displayAmtRef.current = Math.round(animFromRef.current + (animToRef.current - animFromRef.current) * eased)
      tick()
      if (p < 1) { rafRef.current = requestAnimationFrame(step) }
      else       { displayAmtRef.current = target; tick(); rafRef.current = null }
    }
    rafRef.current = requestAnimationFrame(step)
  }, [tick])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // ── 문구 페이드 전환 ───────────────────────────────────────
  const [labelText,    setLabelText]    = useState(buildLabel('전체', '전체', '전체'))
  const [labelVisible, setLabelVisible] = useState(true)
  const isFirstRender                   = useRef(true)
  const pendingLabel                    = useRef(labelText)

  const updateLabel = useCallback((next: string) => {
    pendingLabel.current = next
    setLabelVisible(false)
    setTimeout(() => { setLabelText(pendingLabel.current); setLabelVisible(true) }, 250)
  }, [])

  const filteredPlaces = filterGu === '전체'
    ? allPlaces
    : allPlaces.filter(p => p.sigungu === filterGu)

  // 마지막으로 서버에서 확인된 실제 총액
  const prevTotalRef = useRef(0)

  // 마커용 장소 데이터 — 연도·식사유형만 서버 필터, 자치구는 client-side
  useEffect(() => {
    const params: Record<string, string | number> = {}
    if (filterYear !== '전체') params.p_year = Number(filterYear)
    if (filterMeal !== '전체') params.p_meal_type = filterMeal
    supabase
      .rpc('place_ranking', params)
      .not('lat', 'is', null)
      .limit(10000)
      .then(({ data }) => setAllPlaces((data ?? []) as PlaceRanking[]))
  }, [filterYear, filterMeal])

  // 총액 배지 — 세 필터 모두 서버에서 정확히 합산
  useEffect(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    displayAmtRef.current = prevTotalRef.current
    tick()

    const params: Record<string, string | number> = {}
    if (filterYear !== '전체') params.p_year     = Number(filterYear)
    if (filterMeal !== '전체') params.p_meal_type = filterMeal
    if (filterGu   !== '전체') params.p_sigungu   = filterGu
    supabase.rpc('get_filtered_total', params).then(({ data }) => {
      if (data !== null) {
        prevTotalRef.current = Number(data)
        animateTo(Number(data))
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterYear, filterMeal, filterGu])

  // 필터 변경 → 문구 갱신
  useEffect(() => {
    const next = buildLabel(filterYear, filterGu, filterMeal)
    if (isFirstRender.current) { setLabelText(next); isFirstRender.current = false; return }
    if (next !== labelText) updateLabel(next)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterYear, filterGu, filterMeal])

  // ── 지도 초기화 (스크립트 동적 로딩 후 초기화) ───────────
  useEffect(() => {
    if (!mapRef.current) return

    const initMap = () => {
      if (!mapRef.current) return
      naverMap.current = new window.naver.maps.Map(mapRef.current, {
        center: new window.naver.maps.LatLng(37.5665, 126.9780),
        zoom: 12,
        mapTypeId: window.naver.maps.MapTypeId.NORMAL,
      })
    }

    if (window.naver?.maps) {
      initMap()
      return
    }

    const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID
    const script = document.createElement('script')
    script.src = `https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&ncpKeyType=ncp`
    script.async = true
    script.onload = () => initMap()
    document.head.appendChild(script)

    return () => {
      document.head.removeChild(script)
    }
  }, [])

  // ── 마커 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!naverMap.current || !window.naver?.maps) return
    markers.current.forEach(m => m.setMap(null))
    markers.current = []
    filteredPlaces.forEach(p => {
      if (!p.lat || !p.lng) return
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(p.lat, p.lng),
        map: naverMap.current,
        icon: {
          content: `<div style="width:10px;height:10px;border-radius:50%;background:oklch(52% 0.095 180);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);cursor:pointer;"></div>`,
          anchor: new window.naver.maps.Point(5, 5),
        },
      })
      window.naver.maps.Event.addListener(marker, 'click', () => router.push(`/place/${p.place_id}`))
      markers.current.push(marker)
    })
  }, [filteredPlaces, router])

  // ── 드롭다운 컴포넌트 ──────────────────────────────────────
  const Dropdown = ({
    id, label, value, options, onChange,
  }: { id: DropKey; label: string; value: string; options: string[]; onChange: (v: string) => void }) => {
    const active = value !== '전체'
    return (
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={e => { e.stopPropagation(); setOpen(v => v === id ? null : id) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
            background: active ? 'oklch(52% 0.095 180)' : 'white',
            color: active ? 'white' : 'oklch(30% 0.015 265)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)', cursor: 'pointer', border: 'none',
          }}>
          {active ? value : label}
          {active
            ? <span style={{ fontSize: 10 }} onClick={e => { e.stopPropagation(); onChange('전체'); setOpen(null) }}>✕</span>
            : <span style={{ fontSize: 10 }}>▾</span>}
        </button>
        {open === id && (
          <div style={{
            position: 'absolute', top: '110%', left: 0, zIndex: 50,
            background: 'white', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            minWidth: 110, maxHeight: 260, overflowY: 'auto',
          }}>
            {options.map(opt => (
              <button key={opt} onClick={() => { onChange(opt); setOpen(null) }} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 16px', fontSize: 13,
                fontWeight: value === opt ? 700 : 400,
                color: value === opt ? 'oklch(52% 0.095 180)' : 'oklch(30% 0.015 265)',
                background: 'none', border: 'none', cursor: 'pointer',
              }}>{opt}</button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}
      onClick={() => setOpen(null)}>

      {/* 지도 */}
      <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />

      {/* 상단 오버레이 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '58px 16px 10px', zIndex: 25,
        display: 'flex', flexDirection: 'column', gap: 10, boxSizing: 'border-box',
        pointerEvents: 'none',
      }}>

        {/* 요약 바 */}
        <div style={{
          height: 48, borderRadius: 16, padding: '0 14px',
          boxSizing: 'border-box', overflow: 'hidden',
          background: 'oklch(52% 0.095 180)',
          boxShadow: '0 6px 20px rgba(13,148,136,0.28)',
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'flex-start',
          pointerEvents: 'auto',
        }}>
          {/* 문구 — 페이드+슬라이드 */}
          <span style={{
            fontSize: 10.5, fontWeight: 600, lineHeight: 1.25,
            color: 'rgba(255,255,255,0.82)', whiteSpace: 'nowrap',
            opacity: labelVisible ? 1 : 0,
            transform: labelVisible ? 'translateY(0)' : 'translateY(-5px)',
            transition: 'opacity 0.25s ease, transform 0.25s ease',
          }}>
            {labelText}
          </span>
          {/* 금액 — 카운트업 */}
          <span style={{
            fontSize: 15.5, fontWeight: 800, lineHeight: 1.3,
            letterSpacing: '-0.3px', color: 'white', whiteSpace: 'nowrap',
          }}>
            총 {fmtAmt(displayAmtRef.current)}원입니다
          </span>
        </div>

        {/* 필터 칩 */}
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}
          onClick={e => e.stopPropagation()}>
          <Dropdown id="year" label="연도"    value={filterYear} options={YEARS}                 onChange={setFilterYear} />
          <Dropdown id="gu"   label="자치구"  value={filterGu}   options={['전체', ...SEOUL_GU]} onChange={setFilterGu}   />
          <Dropdown id="meal" label="식사유형" value={filterMeal} options={MEAL_TYPES}            onChange={setFilterMeal} />
        </div>
      </div>

      {/* 마커 수 */}
      {filteredPlaces.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 90, right: 16, zIndex: 25,
          background: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: '6px 12px',
          fontSize: 12, fontWeight: 600, color: 'oklch(40% 0.012 265)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          {filteredPlaces.length}개 식당
        </div>
      )}
    </div>
  )
}
