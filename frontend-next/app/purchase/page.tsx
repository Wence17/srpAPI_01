import PageShell from '@/components/PageShell'

export default function PurchaseSubscriptionPage() {
  return (
    <PageShell title='Purchase Subscription' description='Purchase or upgrade subscription' path='/purchase'>
      <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          This page is a migrated placeholder for the /purchase route. The next step is to port the original UI and backend API integration.
        </p>
      </div>
    </PageShell>
  )
}
