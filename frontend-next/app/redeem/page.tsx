import PageShell from '@/components/PageShell'

export default function RedeemPage() {
  return (
    <PageShell title="Redeem Code" description="Redeem promo or voucher codes for your account." path="/redeem">
      <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          This page is part of the migrated user flow. Add the redeem form and voucher redemption handling in the next step.
        </p>
        <div className="rounded-3xl bg-slate-50 p-5 text-slate-700">
          <p className="font-semibold">Next migration task:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
            <li>Port the redeem input form from the Vue implementation.</li>
            <li>Connect to the backend voucher redemption endpoint.</li>
            <li>Show success/error states and updated user balances.</li>
          </ul>
        </div>
      </div>
    </PageShell>
  )
}
