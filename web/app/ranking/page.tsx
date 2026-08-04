'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { PlaceRanking } from '@/lib/types'

type SortKey = 'total_amount' | 'visit_count' | 'avg_amount_per_head'

const SORT_TABS: { key: SortKey; label: string }[] = [
  { key: 'total_amount',        label: '총액순' },
  { key: 'visit_count',         label: '방문순' },
  { key: 'avg_amount_per_head', label: '1인당순' },
]

const YEARS    = ['전체', '2026', '2025']
const MEALS    = ['전체', '점심', '저녁']
const SEOUL_GU = [
  '종로구','중구','용산구','성동구','광진구','동대문구','중랑구','성북구',
  '강북구','도봉구','노원구','은평구','서대문구','마포구','양천구','강서구',
  '구로구','금천구','영등포구','동작구','관악구','서초구','강남구','송파구','강동구',
]

const MEDAL = ['oklch(68% 0.18 85)', 'oklch(62% 0.02 265)', 'oklch(60% 0.12 50)']

function fmt(n: number | null) {
  if (!n) return '-'
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`
  return n.toLocaleString()
}

type DropdownKey = 'sort' | 'year' | 'meal' | 'gu' | null

export default function RankingPage() {
  const router = useRouter()
  const [places,   setPlaces]   = useState<PlaceRanking[]>([])
  const [sortKey,  setSortKey]  = useState<SortKey>('total_amount')
  const [year,     setYear]     = useState('전체')
  const [meal,     setMeal]     = useState('전체')
  const [gu,       setGu]       = useState('전체')
  const [open,     setOpen]     = useState<DropdownKey>(null)
  const [loading,  setLoading]  = useState(true)

  const toggle = (key: DropdownKey) => setOpen(v => v === key ? null : key)

  useEffect(() => {
    setLoading(true)
    const params: Record<string, string | number> = {}
    if (year !== '전체') params.p_year = Number(year)
    if (meal !== '전체') params.p_meal_type = meal

    supabase
      .rpc('place_ranking', params)
      .not('lat', 'is', null)
      .then(({ data, error }) => {
        if (error) { console.error(error); setLoading(false); return }
        let rows = (data as PlaceRanking[]) ?? []
        if (gu !== '전체') rows = rows.filter(p => p.sigungu === gu)
        rows.sort((a, b) => {
          const av = (a[sortKey] ?? 0) as number
          const bv = (b[sortKey] ?? 0) as number
          return bv - av
        })
        setPlaces(rows.slice(0, 100))
        setLoading(false)
      })
  }, [sortKey, year, meal, gu])

  const Dropdown = ({
    id, label, value, options, onChange, clearable = true,
  }: {
    id: DropdownKey; label: string; value: string
    options: string[]; onChange: (v: string) => void; clearable?: boolean
  }) => {
    const active = clearable && value !== '전체'
    return (
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => toggle(id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 11px', borderRadius: 20, fontSize: 13, fontWeight: 700,
            background: active ? 'oklch(52% 0.095 180)' : 'white',
            color: active ? 'white' : 'oklch(30% 0.015 265)',
            border: 'none', cursor: 'pointer',
            boxShadow: active ? 'none' : '0 1px 4px rgba(0,0,0,0.08)',
          }}>
          {active ? value : label}
          {active
            ? <span style={{ fontSize: 10 }} onClick={e => { e.stopPropagation(); onChange('전체'); setOpen(null) }}>✕</span>
            : <span style={{ fontSize: 10 }}>▾</span>
          }
        </button>
        {open === id && (
          <div style={{
            position: 'absolute', top: '110%', left: 0, zIndex: 50,
            background: 'white', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            minWidth: 110, maxHeight: 280, overflowY: 'auto',
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
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'oklch(96.5% 0.005 285)', paddingBottom: 80, boxSizing: 'border-box' }}
      onClick={() => setOpen(null)}>

      {/* 헤더 */}
      <div style={{ padding: '58px 20px 8px', flexShrink: 0 }}>
        <h1 className="serif" style={{ fontSize: 26, fontWeight: 800, color: 'oklch(22% 0.015 265)', margin: '0 0 4px' }}>랭킹</h1>
        <p style={{ fontSize: 13, color: 'oklch(58% 0.012 265)', margin: 0 }}>업무추진비 식당 Top 100</p>
      </div>

      {/* 필터 바 */}
      <div style={{ padding: '0 20px 10px', flexShrink: 0, display: 'flex', gap: 6, flexWrap: 'wrap' }}
        onClick={e => e.stopPropagation()}>
        <Dropdown id="sort" label="정렬" value={SORT_TABS.find(t => t.key === sortKey)!.label}
          options={SORT_TABS.map(t => t.label)}
          onChange={v => setSortKey(SORT_TABS.find(t => t.label === v)!.key)}
          clearable={false} />
        <Dropdown id="year" label="연도" value={year} options={YEARS} onChange={setYear} />
        <Dropdown id="meal" label="식사유형" value={meal} options={MEALS} onChange={setMeal} />
        <Dropdown id="gu"   label="자치구" value={gu}   options={['전체', ...SEOUL_GU]} onChange={setGu} />
      </div>

      {/* 리스트 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'oklch(60% 0.012 265)', fontSize: 14 }}>
            불러오는 중...
          </div>
        )}
        {!loading && places.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'oklch(60% 0.012 265)', fontSize: 14 }}>
            데이터가 없습니다
          </div>
        )}
        {!loading && places.map((place, i) => (
          <div key={place.place_id} onClick={() => router.push(`/place/${place.place_id}`)} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 20px', borderBottom: '1px solid oklch(92% 0.008 285)',
            cursor: 'pointer', background: 'white',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: i < 3 ? MEDAL[i] : 'oklch(93% 0.006 285)',
              color: i < 3 ? 'white' : 'oklch(45% 0.012 265)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 14,
            }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="serif" style={{ fontSize: 15.5, fontWeight: 700, color: 'oklch(22% 0.015 265)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {place.name}
              </div>
              <div style={{ fontSize: 12.5, color: 'oklch(58% 0.012 265)', marginTop: 2 }}>
                {place.sigungu ?? '서울'}
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'oklch(30% 0.015 265)', flexShrink: 0 }}>
              {sortKey === 'total_amount' && `${fmt(place.total_amount)}원`}
              {sortKey === 'visit_count' && `${place.visit_count}회`}
              {sortKey === 'avg_amount_per_head' && (place.avg_amount_per_head ? `${fmt(place.avg_amount_per_head)}원` : '-')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
