import PageShell from '@/components/PageShell'

export default function ChannelStatusPage() {
  return (
    <PageShell title='Channel Status' description='View channel status' path='/monitor'>
      <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          This page is a migrated placeholder for the /monitor route. The next step is to port the original UI and backend API integration.
        </p>
      </div>
    </PageShell>
  )
}
