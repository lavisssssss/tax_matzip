import type { Metadata, Viewport } from 'next'
import { Noto_Sans_KR, Hahmlet } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import BottomNav from '@/components/BottomNav'

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const hahmlet = Hahmlet({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-hahmlet',
})

export const metadata: Metadata = {
  title: '세금맛집',
  description: '서울시 간부 공무원이 업무추진비로 다녀간 식당 지도',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${notoSansKr.className} ${hahmlet.variable}`}>
        <Script
          src={`https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${process.env.NEXT_PUBLIC_NAVER_CLIENT_ID}`}
          strategy="beforeInteractive"
        />
        <div className="phone">
          {children}
          <BottomNav />
        </div>
      </body>
    </html>
  )
}
