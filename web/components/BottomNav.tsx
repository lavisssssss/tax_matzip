'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  {
    href: '/',
    label: '지도',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 20 20">
        <path d="M10 2C6.7 2 4 4.7 4 8c0 4.5 6 10 6 10s6-5.5 6-10c0-3.3-2.7-6-6-6z"
          fill="none" stroke={active ? 'oklch(52% 0.095 180)' : 'oklch(65% 0.012 265)'} strokeWidth="1.8" />
        <circle cx="10" cy="8" r="2.2" fill={active ? 'oklch(52% 0.095 180)' : 'oklch(65% 0.012 265)'} />
      </svg>
    ),
  },
  {
    href: '/ranking',
    label: '랭킹',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 20 20">
        <rect x="2" y="11" width="4" height="7" rx="1" fill={active ? 'oklch(52% 0.095 180)' : 'oklch(65% 0.012 265)'} />
        <rect x="8" y="6" width="4" height="12" rx="1" fill={active ? 'oklch(52% 0.095 180)' : 'oklch(65% 0.012 265)'} />
        <rect x="14" y="2" width="4" height="16" rx="1" fill={active ? 'oklch(52% 0.095 180)' : 'oklch(65% 0.012 265)'} />
      </svg>
    ),
  },
  {
    href: '/info',
    label: '정보',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="8" fill="none" stroke={active ? 'oklch(52% 0.095 180)' : 'oklch(65% 0.012 265)'} strokeWidth="1.8" />
        <rect x="9" y="9" width="2" height="5.5" rx="1" fill={active ? 'oklch(52% 0.095 180)' : 'oklch(65% 0.012 265)'} />
        <circle cx="10" cy="6" r="1.2" fill={active ? 'oklch(52% 0.095 180)' : 'oklch(65% 0.012 265)'} />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
      background: 'rgba(255,255,255,0.97)',
      borderTop: '1px solid oklch(90% 0.01 285)',
      display: 'flex', zIndex: 40,
      paddingBottom: 20, boxSizing: 'border-box',
    }}>
      {tabs.map(tab => {
        const active = pathname === tab.href
        return (
          <Link key={tab.href} href={tab.href} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4,
            textDecoration: 'none',
          }}>
            {tab.icon(active)}
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: active ? 'oklch(52% 0.095 180)' : 'oklch(65% 0.012 265)',
            }}>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
