'use client'

import PageShell from '@/components/PageShell'
import AdminAffiliateRecordsTable from '@/components/AdminAffiliateRecordsTable'

export default function AffiliateTransferRecordsPage() {
  return (
    <PageShell title="Affiliate Transfer Records" description="Affiliate transfer records" path="/admin/affiliates/transfers">
      <AdminAffiliateRecordsTable type="transfers" />
    </PageShell>
  )
}
