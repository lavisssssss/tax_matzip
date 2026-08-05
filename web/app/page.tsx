'use client'
import { useEffect, useRef, useState, useCallback, useReducer, useMemo } from 'react'
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
const PEEK_H     = 152   // 핸들(28) + 헤더(52) + 첫 카드 일부(72)
const SS_KEY     = 'tmz_map_state'

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3)

type Bounds = { swLat: number; swLng: number; neLat: number; neLng: number }

function buildLabel(year: string, gu: string, meal: string) {
  const period  = year !== '전체' ? `${year}년도`  : '전체기간'
  const region  = gu   !== '전체' ? gu             : '서울시 기준'
  const mealStr = meal !== '전체' ? ` ${meal}식사` : ''
  return `${period} ${region}${mealStr} 업무추진비는`
}

function fmtAmt(n: number) { return Math.round(n).toLocaleString('ko-KR') }

function fmt(n: number | null) {
  if (!n) return '-'
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`
  if (n >= 10_000)      return `${Math.round(n / 10_000)}만원`
  return `${n.toLocaleString()}원`
}

function markerSize(visits: number) { return 26 + Math.min(visits - 1, 15) * 2 }
function markerFont(size: number)   { return Math.max(10, Math.round(size * 0.38)) }
function markerHtml(visits: number) {
  const sz = markerSize(visits), fs = markerFont(sz)
  return (
    `<div style="width:${sz}px;height:${sz}px;border-radius:50%;` +
    `background:oklch(52% 0.095 180);border:2px solid white;` +
    `box-shadow:0 1px 4px rgba(0,0,0,0.3);cursor:pointer;` +
    `display:flex;align-items:center;justify-content:center;box-sizing:border-box;">` +
    `<span style="font-size:${fs}px;font-weight:700;color:white;` +
    `line-height:1;pointer-events:none;user-select:none;">${visits}</span></div>`
  )
}

type DropKey = 'year' | 'gu' | 'meal' | null

export default function MapPage() {
  const mapRef    = useRef<HTMLDivElement>(null)
  const sheetRef  = useRef<HTMLDivElement>(null)
  const naverMap  = useRef<any>(null)
  const markers   = useRef<any[]>([])
  const router    = useRouter()

  // 드래그 추적 (렌더 불필요 → ref)
  const dragStartY  = useRef<number | null>(null)
  const didDrag     = useRef(false)

  // 복원용 지도 상태
  const savedMapState = useRef<{ lat: number; lng: number; zoom: number } | null>(null)

  // ── 필터 상태 ──────────────────────────────────────────────
  const [allPlaces,   setAllPlaces]   = useState<PlaceRanking[]>([])
  const [filterYear,  setFilterYear]  = useState('전체')
  const [filterGu,    setFilterGu]    = useState('전체')
  const [filterMeal,  setFilterMeal]  = useState('전체')
  const [open,        setOpen]        = useState<DropKey>(null)
  const [sheetOpen,   setSheetOpen]   = useState(false)
  const [mapMoved,    setMapMoved]    = useState(false)
  const [boundsFilter, setBoundsFilter] = useState<Bounds | null>(null)

  // ── 금액 카운트업 ───────────────────────────────────────────
  const displayAmtRef = useRef(0)
  const rafRef        = useRef<number | null>(null)
  const animStartRef  = useRef(0)
  const animFromRef   = useRef(0)
  const animToRef     = useRef(0)
  const [, tick]      = useReducer(x => x + 1, 0)

  const animateTo = useCallback((target: number) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    const from = displayAmtRef.current
    animFromRef.current = from; animToRef.current = target
    animStartRef.current = performance.now()
    const step = (now: number) => {
      const p = Math.min((now - animStartRef.current) / DURATION, 1)
      displayAmtRef.current = Math.round(from + (target - from) * easeOutCubic(p))
      tick()
      if (p < 1) { rafRef.current = requestAnimationFrame(step) }
      else       { displayAmtRef.current = target; tick(); rafRef.current = null }
    }
    rafRef.current = requestAnimationFrame(step)
  }, [tick])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // ── 문구 페이드 ─────────────────────────────────────────────
  const [labelText,    setLabelText]    = useState(buildLabel('전체','전체','전체'))
  const [labelVisible, setLabelVisible] = useState(true)
  const isFirstRender                   = useRef(true)
  const pendingLabel                    = useRef(labelText)

  const updateLabel = useCallback((next: string) => {
    pendingLabel.current = next
    setLabelVisible(false)
    setTimeout(() => { setLabelText(pendingLabel.current); setLabelVisible(true) }, 250)
  }, [])

  // ── sessionStorage 복원 (가장 먼저 실행) ─────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem(SS_KEY)
    if (!raw) return
    sessionStorage.removeItem(SS_KEY)
    try {
      const s = JSON.parse(raw)
      if (s.filterYear)    setFilterYear(s.filterYear)
      if (s.filterGu)      setFilterGu(s.filterGu)
      if (s.filterMeal)    setFilterMeal(s.filterMeal)
      if (s.sheetOpen)     setSheetOpen(s.sheetOpen)
      if (s.boundsFilter)  setBoundsFilter(s.boundsFilter)
      if (s.centerLat && s.centerLng && s.zoom) {
        savedMapState.current = { lat: s.centerLat, lng: s.centerLng, zoom: s.zoom }
      }
    } catch { /* 손상된 값 무시 */ }
  }, [])

  // ── 장소 클릭 → 상태 저장 후 이동 ───────────────────────────
  // ref로 감싸서 마커 클로저가 항상 최신 상태를 캡처하게 한다
  const navStateRef = useRef({ filterYear, filterGu, filterMeal, sheetOpen, boundsFilter })
  useEffect(() => {
    navStateRef.current = { filterYear, filterGu, filterMeal, sheetOpen, boundsFilter }
  }, [filterYear, filterGu, filterMeal, sheetOpen, boundsFilter])

  const goToPlace = useCallback((placeId: number) => {
    if (naverMap.current) {
      const center = naverMap.current.getCenter()
      const zoom   = naverMap.current.getZoom()
      sessionStorage.setItem(SS_KEY, JSON.stringify({
        ...navStateRef.current,
        centerLat: center.lat(),
        centerLng: center.lng(),
        zoom,
      }))
    }
    router.push(`/place/${placeId}`)
  }, [router])

  const goToPlaceRef = useRef(goToPlace)
  useEffect(() => { goToPlaceRef.current = goToPlace }, [goToPlace])

  // ── 파생 상태 ────────────────────────────────────────────────
  const filteredPlaces = useMemo(() =>
    filterGu === '전체' ? allPlaces : allPlaces.filter(p => p.sigungu === filterGu),
    [allPlaces, filterGu],
  )

  const sheetPlaces = useMemo(() =>
    boundsFilter
      ? filteredPlaces.filter(p =>
          p.lat !== null && p.lng !== null &&
          p.lat >= boundsFilter.swLat && p.lat <= boundsFilter.neLat &&
          p.lng >= boundsFilter.swLng && p.lng <= boundsFilter.neLng
        )
      : filteredPlaces,
    [filteredPlaces, boundsFilter],
  )

  const applyBoundsFilter = useCallback(() => {
    if (!naverMap.current) return
    const b = naverMap.current.getBounds()
    const sw = b.getSW(), ne = b.getNE()
    setBoundsFilter({ swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() })
    setMapMoved(false)
  }, [])

  const prevTotalRef = useRef(0)

  // ── 데이터 페치 ──────────────────────────────────────────────
  useEffect(() => {
    const params: Record<string, string | number> = {}
    if (filterYear !== '전체') params.p_year     = Number(filterYear)
    if (filterMeal !== '전체') params.p_meal_type = filterMeal
    supabase.rpc('place_ranking', params).not('lat','is',null).limit(10000)
      .then(({ data }) => setAllPlaces((data ?? []) as PlaceRanking[]))
  }, [filterYear, filterMeal])

  // 서버 총액 — bounds 모드가 아닐 때만 동작
  useEffect(() => {
    if (boundsFilter) return
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    displayAmtRef.current = prevTotalRef.current; tick()
    const params: Record<string, string | number> = {}
    if (filterYear !== '전체') params.p_year     = Number(filterYear)
    if (filterMeal !== '전체') params.p_meal_type = filterMeal
    if (filterGu   !== '전체') params.p_sigungu   = filterGu
    supabase.rpc('get_filtered_total', params).then(({ data }) => {
      if (data !== null) { prevTotalRef.current = Number(data); animateTo(Number(data)) }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterYear, filterMeal, filterGu, boundsFilter])

  // bounds 모드 총액 — 뷰포트 안 장소의 total_amount 합산 (클라이언트)
  useEffect(() => {
    if (!boundsFilter) return
    const total = sheetPlaces.reduce((s, p) => s + (p.total_amount || 0), 0)
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    displayAmtRef.current = prevTotalRef.current; tick()
    prevTotalRef.current = total
    animateTo(total)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsFilter, sheetPlaces])

  useEffect(() => {
    const next = boundsFilter ? '현 지도상 업무추진비는' : buildLabel(filterYear, filterGu, filterMeal)
    if (isFirstRender.current) { setLabelText(next); isFirstRender.current = false; return }
    if (next !== labelText) updateLabel(next)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterYear, filterGu, filterMeal, boundsFilter])

  // ── 지도 초기화 ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return
    const initMap = () => {
      if (!mapRef.current) return
      const s = savedMapState.current
      naverMap.current = new window.naver.maps.Map(mapRef.current, {
        center: new window.naver.maps.LatLng(
          s?.lat ?? 37.5665,
          s?.lng ?? 126.9780,
        ),
        zoom:       s?.zoom ?? 12,
        mapTypeId:  window.naver.maps.MapTypeId.NORMAL,
      })
      window.naver.maps.Event.addListener(naverMap.current, 'idle', () => setMapMoved(true))
    }
    if (window.naver?.maps) { initMap(); return }
    const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID
    const script = document.createElement('script')
    script.src = `https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&ncpKeyType=ncp`
    script.async = true
    script.onload = () => initMap()
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  // ── 마커 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!naverMap.current || !window.naver?.maps) return
    markers.current.forEach(m => m.setMap(null))
    markers.current = []
    filteredPlaces.forEach(p => {
      if (!p.lat || !p.lng) return
      const sz = markerSize(p.visit_count)
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(p.lat, p.lng),
        map: naverMap.current,
        icon: { content: markerHtml(p.visit_count), anchor: new window.naver.maps.Point(Math.round(sz/2), Math.round(sz/2)) },
      })
      window.naver.maps.Event.addListener(marker, 'click', () => goToPlaceRef.current(p.place_id))
      markers.current.push(marker)
    })
  }, [filteredPlaces])

  // ── 핸들 드래그 ──────────────────────────────────────────────
  const onDragStart = (clientY: number) => {
    dragStartY.current = clientY
    didDrag.current    = false
  }
  const onDragMove = (clientY: number) => {
    if (dragStartY.current === null || !sheetRef.current) return
    const delta = clientY - dragStartY.current
    if (Math.abs(delta) > 4) didDrag.current = true
    const base    = sheetOpen ? 0 : (sheetRef.current.offsetHeight - PEEK_H)
    const clamped = Math.max(0, Math.min(sheetRef.current.offsetHeight - PEEK_H, base + delta))
    sheetRef.current.style.transition = 'none'
    sheetRef.current.style.transform  = `translateY(${clamped}px)`
  }
  const onDragEnd = (clientY: number) => {
    if (dragStartY.current === null || !sheetRef.current) return
    const delta = clientY - dragStartY.current
    if (Math.abs(delta) >= 40) setSheetOpen(delta < 0)
    // CSS 변수로 전환 복원
    sheetRef.current.style.transition = ''
    sheetRef.current.style.transform  = ''
    dragStartY.current = null
  }

  // ── 드롭다운 ─────────────────────────────────────────────────
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

  const regionLabel = boundsFilter
    ? `현 지도 ${sheetPlaces.length}곳`
    : filterGu !== '전체'
      ? `${filterGu} ${sheetPlaces.length}곳`
      : `서울시 전체 ${sheetPlaces.length}곳`

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
          height: 48, borderRadius: 16, padding: '0 14px', boxSizing: 'border-box',
          overflow: 'hidden', background: 'oklch(52% 0.095 180)',
          boxShadow: '0 6px 20px rgba(13,148,136,0.28)',
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'flex-start', pointerEvents: 'auto',
        }}>
          <span style={{
            fontSize: 10.5, fontWeight: 600, lineHeight: 1.25,
            color: 'rgba(255,255,255,0.82)', whiteSpace: 'nowrap',
            opacity: labelVisible ? 1 : 0,
            transform: labelVisible ? 'translateY(0)' : 'translateY(-5px)',
            transition: 'opacity 0.25s ease, transform 0.25s ease',
          }}>{labelText}</span>
          <span style={{
            fontSize: 15.5, fontWeight: 800, lineHeight: 1.3,
            letterSpacing: '-0.3px', color: 'white', whiteSpace: 'nowrap',
          }}>총 {fmtAmt(displayAmtRef.current)}원입니다</span>
        </div>

        {/* 필터 칩 */}
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}
          onClick={e => e.stopPropagation()}>
          <Dropdown id="year" label="연도"    value={filterYear} options={YEARS}                 onChange={setFilterYear} />
          <Dropdown id="gu"   label="자치구"  value={filterGu}   options={['전체',...SEOUL_GU]} onChange={setFilterGu}   />
          <Dropdown id="meal" label="식사유형" value={filterMeal} options={MEAL_TYPES}            onChange={setFilterMeal} />
        </div>
      </div>

      {/* 현 지도에서 조회 버튼 */}
      {mapMoved && (
        <button onClick={() => { applyBoundsFilter(); setOpen(null) }} style={{
          position: 'absolute', bottom: 80 + PEEK_H + 16, left: '50%',
          transform: 'translateX(-50%)', zIndex: 31,
          padding: '10px 18px', borderRadius: 24,
          background: 'oklch(22% 0.015 265)', color: 'white',
          fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.22)', whiteSpace: 'nowrap',
        }}>현 지도에서 조회</button>
      )}

      {/* ── 바텀시트 ──────────────────────────────────────────── */}
      <div
        ref={sheetRef}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', bottom: 80, left: 0, right: 0, height: '70%',
          zIndex: 30,
          transform: sheetOpen ? 'translateY(0)' : `translateY(calc(100% - ${PEEK_H}px))`,
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          borderRadius: '20px 20px 0 0', background: 'white',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.10)',
          display: 'flex', flexDirection: 'column',
        }}>

        {/* 드래그 핸들 — touch + mouse 모두 처리 */}
        <div
          onTouchStart={e => onDragStart(e.touches[0].clientY)}
          onTouchMove={e  => onDragMove(e.touches[0].clientY)}
          onTouchEnd={e   => onDragEnd(e.changedTouches[0].clientY)}
          onMouseDown={e  => onDragStart(e.clientY)}
          onMouseMove={e  => { if (dragStartY.current !== null) onDragMove(e.clientY) }}
          onMouseUp={e    => onDragEnd(e.clientY)}
          onClick={() => { if (!didDrag.current) setSheetOpen(v => !v) }}
          style={{
            height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, cursor: 'grab', touchAction: 'none',
          }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'oklch(85% 0.01 285)' }} />
        </div>

        {/* 헤더 — flex-shrink:0 */}
        <div style={{ padding: '0 16px 12px', flexShrink: 0, borderBottom: '1px solid oklch(93% 0.008 285)' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'oklch(22% 0.015 265)' }}>
            {regionLabel}
          </span>
        </div>

        {/* 스크롤 목록 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {sheetPlaces.map((p, i) => (
            <div key={p.place_id} onClick={() => goToPlace(p.place_id)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 16px', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: 'oklch(52% 0.095 180)',
                  width: 22, flexShrink: 0, textAlign: 'right',
                }}>{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600, color: 'oklch(22% 0.015 265)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: 'oklch(58% 0.012 265)', marginTop: 1 }}>
                    {p.sigungu} · {p.visit_count}회
                  </div>
                </div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right', marginLeft: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(30% 0.015 265)' }}>
                  {fmt(p.total_amount)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
