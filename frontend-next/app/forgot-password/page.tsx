import PageShell from '@/components/PageShell'

export default function ForgotPasswordPage() {
  return (
    <PageShell title='Forgot Password' description='Request password reset' path='/forgot-password'>
      <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          This page is a migrated placeholder for the /forgot-password route. The next step is to port the original UI and backend API integration.
        </p>
      </div>
    </PageShell>
  )
}
