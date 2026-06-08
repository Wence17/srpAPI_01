'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { adminRiskControlAPI, type ContentModerationConfig, type ContentModerationRuntimeStatus } from '@/lib/adminRiskControl'

function formatDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export default function RiskControlPage() {
  const [config, setConfig] = useState<ContentModerationConfig | null>(null)
  const [status, setStatus] = useState<ContentModerationRuntimeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const [configData, statusData] = await Promise.all([
          adminRiskControlAPI.getConfig(),
          adminRiskControlAPI.getStatus(),
        ])

        if (cancelled) return
        setConfig(configData)
        setStatus(statusData)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load risk control data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [])

  const toggleEnabled = () => {
    if (!config) return
    setConfig({ ...config, enabled: !config.enabled })
    setSuccess(null)
  }

  const toggleRecordNonHits = () => {
    if (!config) return
    setConfig({ ...config, record_non_hits: !config.record_non_hits })
    setSuccess(null)
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const updated = await adminRiskControlAPI.updateConfig({
        enabled: config.enabled,
        record_non_hits: config.record_non_hits,
      })
      setConfig(updated)
      setSuccess('Risk control configuration saved.')
    } catch (err) {
      setError((err as Error)?.message || 'Unable to save risk control settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell title="Risk Control" description="Manage risk control rules" path="/admin/risk-control">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Risk control</h2>
              <p className="mt-2 text-sm text-slate-600">
                Monitor content moderation status and update the configuration for risk control rules.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {config ? (
                <button
                  type="button"
                  onClick={toggleEnabled}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${config.enabled ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                >
                  {config.enabled ? 'Enabled' : 'Disabled'}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading risk control data...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Failed to load risk control data</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : config && status ? (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm text-slate-500">Current moderation mode</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{config.mode}</p>
                <p className="mt-3 text-sm text-slate-600">API key status: {config.api_key_configured ? 'Configured' : 'Not configured'}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm text-slate-500">Runtime health</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-sm text-slate-500">Active workers</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">{status.active_workers}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-sm text-slate-500">Queue length</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">{status.queue_length}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-slate-500">Auto ban</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{config.auto_ban_enabled ? 'Enabled' : 'Disabled'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Record non-hits</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{config.record_non_hits ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Blocked keywords</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{config.blocked_keywords.length}</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Last cleaned</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate(status.last_cleanup_at)}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Deleted hits</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">{status.last_cleanup_deleted_hit}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Deleted non-hits</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">{status.last_cleanup_deleted_non_hit}</p>
                </div>
              </div>
            </div>

            {error ? null : success ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-700">
                <p className="font-semibold">{success}</p>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">Update your risk control settings and save them to the backend.</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={toggleRecordNonHits}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                >
                  Toggle non-hit recording
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save configuration'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PageShell>
  )
}
