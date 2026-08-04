'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

declare global {
  interface Window {
    naver: any
  }
}

interface MapPlace {
  place_id: number
  name: string
  lat: number
  lng: number
  sigungu: string | null
  total_amount: number
  visit_count: number
}

const SEOUL_GU = [
  '종로구','중구','용산구','성동구','광진구','동대문구','중랑구','성북구',
  '강북구','도봉구','노원구','은평구','서대문구','마포구','양천구','강서구',
  '구로구','금천구','영등포구','동작구','관악구','서초구','강남구','송파구','강동구',
]

const MEAL_TYPES = ['전체', '점심', '저녁']

export default function MapPage() {
  const mapRef   = useRef<HTMLDivElement>(null)
  const naverMap = useRef<any>(null)
  const markers  = useRef<any[]>([])
  const router   = useRouter()

  const [places,    setPlaces]    = useState<MapPlace[]>([])
  const [totalAmt,  setTotalAmt]  = useState<number | null>(null)
  const [filterGu,  setFilterGu]  = useState<string>('전체')
  const [filterMeal,setFilterMeal]= useState<string>('전체')
  const [showGu,    setShowGu]    = useState(false)
  const [showMeal,  setShowMeal]  = useState(false)

  // 데이터 로드
  useEffect(() => {
    supabase
      .from('v_place_ranking')
      .select('place_id, name, lat, lng, sigungu, total_amount, visit_count')
      .not('lat', 'is', null)
      .then(({ data }) => {
        setPlaces((data ?? []) as MapPlace[])
      })

    supabase
      .rpc('get_expense_total')
      .then(({ data }) => {
        if (data) setTotalAmt(Number(data))
      })
  }, [])

  // 지도 초기화
  useEffect(() => {
    if (!mapRef.current) return
    const init = () => {
      if (!window.naver?.maps) return
      naverMap.current = new window.naver.maps.Map(mapRef.current, {
        center: new window.naver.maps.LatLng(37.5665, 126.9780),
        zoom: 12,
        mapTypeId: window.naver.maps.MapTypeId.NORMAL,
      })
    }
    if (window.naver?.maps) {
      init()
    } else {
      const interval = setInterval(() => {
        if (window.naver?.maps) { init(); clearInterval(interval) }
      }, 200)
      return () => clearInterval(interval)
    }
  }, [])

  // 마커 그리기
  useEffect(() => {
    if (!naverMap.current || !window.naver?.maps) return

    markers.current.forEach(m => m.setMap(null))
    markers.current = []

    const filtered = places.filter(p => {
      if (filterGu !== '전체' && p.sigungu !== filterGu) return false
      return true
    })

    filtered.forEach(p => {
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(p.lat, p.lng),
        map: naverMap.current,
        icon: {
          content: `<div style="width:10px;height:10px;border-radius:50%;background:oklch(52% 0.095 180);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);cursor:pointer;"></div>`,
          anchor: new window.naver.maps.Point(5, 5),
        },
      })
      window.naver.maps.Event.addListener(marker, 'click', () => {
        router.push(`/place/${p.place_id}`)
      })
      markers.current.push(marker)
    })
  }, [places, filterGu, router])

  const fmtAmt = (n: number) => {
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`
    if (n >= 10_000) return `${Math.round(n / 10_000)}만원`
    return `${n.toLocaleString()}원`
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* 지도 */}
      <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />

      {/* 상단 배지 + 필터 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '58px 16px 10px', zIndex: 25,
        display: 'flex', flexDirection: 'column', gap: 10, boxSizing: 'border-box',
        pointerEvents: 'none',
      }}>
        {/* 누적 금액 배지 */}
        <div style={{
          background: 'oklch(52% 0.095 180)', borderRadius: 16, height: 48,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
          justifyContent: 'center', padding: '0 14px',
          boxShadow: '0 6px 20px rgba(13,148,136,0.28)', pointerEvents: 'auto',
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>
            2025.07 ~ 현재 누적
          </span>
          <span style={{ fontSize: 15.5, fontWeight: 800, color: 'white', letterSpacing: '-0.3px' }}>
            {totalAmt ? fmtAmt(totalAmt) : '집계 중...'}
          </span>
        </div>

        {/* 필터 칩 */}
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto', position: 'relative' }}>
          {/* 자치구 필터 */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowGu(v => !v); setShowMeal(false) }}
              style={{
                padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                background: filterGu !== '전체' ? 'oklch(52% 0.095 180)' : 'white',
                color: filterGu !== '전체' ? 'white' : 'oklch(30% 0.015 265)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)', cursor: 'pointer',
                border: 'none', flexShrink: 0,
              }}>
              {filterGu === '전체' ? '자치구 ▾' : `${filterGu} ✕`}
            </button>
            {showGu && (
              <div style={{
                position: 'absolute', top: '110%', left: 0, zIndex: 50,
                background: 'white', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                maxHeight: 260, overflowY: 'auto', minWidth: 130,
              }}>
                {['전체', ...SEOUL_GU].map(gu => (
                  <button key={gu} onClick={() => { setFilterGu(gu); setShowGu(false) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '10px 16px', fontSize: 13, fontWeight: filterGu === gu ? 700 : 400,
                      color: filterGu === gu ? 'oklch(52% 0.095 180)' : 'oklch(30% 0.015 265)',
                      background: 'none', border: 'none', cursor: 'pointer',
                    }}>{gu}</button>
                ))}
              </div>
            )}
          </div>

          {/* 식사유형 필터 */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowMeal(v => !v); setShowGu(false) }}
              style={{
                padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                background: filterMeal !== '전체' ? 'oklch(52% 0.095 180)' : 'white',
                color: filterMeal !== '전체' ? 'white' : 'oklch(30% 0.015 265)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)', cursor: 'pointer',
                border: 'none', flexShrink: 0,
              }}>
              {filterMeal === '전체' ? '식사유형 ▾' : `${filterMeal} ✕`}
            </button>
            {showMeal && (
              <div style={{
                position: 'absolute', top: '110%', left: 0, zIndex: 50,
                background: 'white', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                minWidth: 110,
              }}>
                {MEAL_TYPES.map(m => (
                  <button key={m} onClick={() => { setFilterMeal(m); setShowMeal(false) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '10px 16px', fontSize: 13, fontWeight: filterMeal === m ? 700 : 400,
                      color: filterMeal === m ? 'oklch(52% 0.095 180)' : 'oklch(30% 0.015 265)',
                      background: 'none', border: 'none', cursor: 'pointer',
                    }}>{m}</button>
                ))}
              </div>
            )}
          </div>

          <button style={{
            padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
            background: 'white', color: 'oklch(30% 0.015 265)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)', cursor: 'pointer', border: 'none', flexShrink: 0,
          }}>기간 ▾</button>
        </div>
      </div>

      {/* 마커 수 표시 */}
      {places.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 90, right: 16, zIndex: 25,
          background: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: '6px 12px',
          fontSize: 12, fontWeight: 600, color: 'oklch(40% 0.012 265)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          {filterGu === '전체' ? places.length : places.filter(p => p.sigungu === filterGu).length}개 식당
        </div>
      )}
    </div>
  )
}
