'use client'

import { useEffect, useState, type ReactNode } from 'react'

interface TablePageLayoutProps {
  actions?: ReactNode
  filters?: ReactNode
  table?: ReactNode
  pagination?: ReactNode
}

export default function TablePageLayout({ actions, filters, table, pagination }: TablePageLayoutProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <div className={`table-page-layout${isMobile ? ' mobile-mode' : ''}`}>
      {actions ? <div className="layout-section-fixed">{actions}</div> : null}
      {filters ? <div className="layout-section-fixed">{filters}</div> : null}
      <div className="layout-section-scrollable">
        <div className="card table-scroll-container">{table}</div>
      </div>
      {pagination ? <div className="layout-section-fixed">{pagination}</div> : null}
    </div>
  )
}
