'use client'

import PageShell from '@/components/PageShell'
import AdminAffiliateRecordsTable from '@/components/AdminAffiliateRecordsTable'

export default function AffiliateInviteRecordsPage() {
  return (
    <PageShell title="Affiliate Invite Records" description="Affiliate invite records" path="/admin/affiliates/invites">
      <AdminAffiliateRecordsTable type="invites" />
    </PageShell>
  )
}
