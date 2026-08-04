'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface PlaceDetail {
  name: string
  road_address: string | null
  sigungu: string | null
  visit_count: number
  total_amount: number
  avg_amount_per_head: number | null
  lunch_count: number
  dinner_count: number
  other_count: number
  first_visit: string | null
  last_visit: string | null
}

interface VisitEntry {
  used_at: string | null
  dept_name: string | null
  amount: number | null
  head_count: number | null
  meal_type: string | null
  purpose: string | null
  expense_documents: { source_url: string; nid: string } | null
}

function fmt(n: number | null) {
  if (!n) return '-'
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`
  if (n >= 10_000) return `${Math.round(n / 10_000)}만원`
  return `${n.toLocaleString()}원`
}

const MEAL_COLOR: Record<string, string> = {
  '점심': 'oklch(75% 0.12 85)',
  '저녁': 'oklch(60% 0.1 30)',
  '기타': 'oklch(70% 0.02 265)',
}

export default function PlaceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [place, setPlace]   = useState<PlaceDetail | null>(null)
  const [visits, setVisits] = useState<VisitEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('v_place_ranking').select('*').eq('place_id', Number(id)).single(),
      supabase.from('expense_entries')
        .select('used_at, dept_name, amount, head_count, meal_type, purpose, expense_documents(source_url, nid)')
        .eq('place_id', Number(id)).order('used_at', { ascending: false }).limit(50),
    ]).then(([{ data: p }, { data: v }]) => {
      setPlace(p as PlaceDetail)
      setVisits((v ?? []) as VisitEntry[])
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 14, color: 'oklch(60% 0.012 265)' }}>불러오는 중...</div>
  }
  if (!place) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 14, color: 'oklch(60% 0.012 265)' }}>장소를 찾을 수 없습니다</div>
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'white', boxSizing: 'border-box' }}>
      {/* 헤더 */}
      <div style={{ padding: '58px 20px 0', flexShrink: 0 }}>
        <button onClick={() => router.back()} style={{
          width: 36, height: 36, borderRadius: '50%', background: 'oklch(96% 0.006 285)',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="9" height="15" viewBox="0 0 9 15">
            <path d="M8 1L1.5 7.5L8 14" stroke="oklch(30% 0.015 265)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* 콘텐츠 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 32px', boxSizing: 'border-box' }}>
        <h1 className="serif" style={{ fontSize: 23, fontWeight: 800, color: 'oklch(20% 0.015 265)', margin: '0 0 6px' }}>{place.name}</h1>
        <p style={{ fontSize: 13.5, color: 'oklch(55% 0.012 265)', margin: '0 0 20px' }}>{place.road_address ?? place.sigungu}</p>

        {/* 3개 통계 */}
        <div style={{ display: 'flex', padding: '16px 0', borderTop: '1px solid oklch(93% 0.008 285)', borderBottom: '1px solid oklch(93% 0.008 285)', marginBottom: 20 }}>
          {[
            { label: '총 방문', value: `${place.visit_count}회` },
            { label: '총액', value: fmt(place.total_amount) },
            { label: '1인당 평균', value: fmt(place.avg_amount_per_head) },
          ].map(stat => (
            <div key={stat.label} style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'oklch(58% 0.012 265)', marginBottom: 4 }}>{stat.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'oklch(52% 0.095 180)' }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* 점심/저녁 비율 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { label: '점심', count: place.lunch_count },
            { label: '저녁', count: place.dinner_count },
            { label: '기타', count: place.other_count },
          ].map(m => (
            <div key={m.label} style={{
              flex: 1, textAlign: 'center', padding: '8px 0',
              background: 'oklch(96.5% 0.005 285)', borderRadius: 12,
            }}>
              <div style={{ fontSize: 11, color: 'oklch(58% 0.012 265)', marginBottom: 2 }}>{m.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: MEAL_COLOR[m.label] }}>{m.count}회</div>
            </div>
          ))}
        </div>

        {/* 방문 이력 */}
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'oklch(30% 0.015 265)', margin: '0 0 8px' }}>방문 이력</h2>
        {visits.map((v, i) => {
          const sourceUrl = v.expense_documents?.source_url
          return (
            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid oklch(94% 0.008 285)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: 'oklch(40% 0.012 265)', fontWeight: 600 }}>
                  {v.used_at ? v.used_at.slice(0, 10) : '-'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {v.meal_type && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: 'oklch(94% 0.006 285)', color: MEAL_COLOR[v.meal_type] ?? 'oklch(50% 0.012 265)' }}>
                      {v.meal_type}
                    </span>
                  )}
                  {sourceUrl && (
                    <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', color: 'oklch(62% 0.015 265)', textDecoration: 'none' }}
                      title="원문 보기">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M6 2H2a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                        <path d="M8 1h5v5M13 1L7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </a>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'oklch(45% 0.012 265)', marginBottom: 2 }}>{v.dept_name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'oklch(60% 0.012 265)' }}>{v.head_count ? `${v.head_count}명` : ''}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'oklch(30% 0.015 265)' }}>{fmt(v.amount)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
