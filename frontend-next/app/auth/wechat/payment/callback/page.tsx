import PageShell from '@/components/PageShell'

export default function WeChatPaymentCallbackPage() {
  return (
    <PageShell title='WeChat Payment Callback' description='WeChat payment callback' path='/auth/wechat/payment/callback'>
      <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          This page is a migrated placeholder for the /auth/wechat/payment/callback route. The next step is to port the original UI and backend API integration.
        </p>
      </div>
    </PageShell>
  )
}
