'use client'

import PageShell from '@/components/PageShell'
import AdminAffiliateRecordsTable from '@/components/AdminAffiliateRecordsTable'

export default function AffiliateRebateRecordsPage() {
  return (
    <PageShell title="Affiliate Rebate Records" description="Affiliate rebate records" path="/admin/affiliates/rebates">
      <AdminAffiliateRecordsTable type="rebates" />
    </PageShell>
  )
}
