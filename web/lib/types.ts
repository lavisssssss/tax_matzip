export interface PlaceRanking {
  place_id: number
  name: string
  road_address: string | null
  sigungu: string | null
  lat: number | null
  lng: number | null
  visit_count: number
  dept_count: number
  total_amount: number
  avg_amount: number
  avg_amount_per_head: number | null
  lunch_count: number
  dinner_count: number
  other_count: number
  first_visit: string | null
  last_visit: string | null
}
