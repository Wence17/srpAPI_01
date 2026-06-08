'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { adminSettingsAPI, type AdminSystemSettings } from '@/lib/adminSettings'

function booleanLabel(value: boolean | undefined) {
  return value ? 'Enabled' : 'Disabled'
}

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<AdminSystemSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      setLoading(true)
      setError(null)

      try {
        const data = await adminSettingsAPI.getSettings()
        if (cancelled) return
        setSettings(data)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load system settings.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSettings()
    return () => {
      cancelled = true
    }
  }, [])

  const handleToggle = (key: keyof AdminSystemSettings) => {
    setSettings((current) => ({
      ...current,
      [key]: !current[key],
    }))
    setSuccess(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const updated = await adminSettingsAPI.updateSettings(settings)
      setSettings(updated)
      setSuccess('Settings saved successfully.')
    } catch (err) {
      setError((err as Error)?.message || 'Unable to save system settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell title="System Settings" description="Manage system configuration" path="/admin/settings">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">System settings</h2>
              <p className="mt-2 text-sm text-slate-600">
                Configure core system behavior for payment, channels, affiliates, and risk control.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading system settings...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <label className="block text-sm font-medium text-slate-700">Site name</label>
                <input
                  value={settings.site_name ?? ''}
                  onChange={(event) => setSettings((current) => ({ ...current, site_name: event.target.value }))}
                  placeholder="Sub2API"
                  className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
                />
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-700">Feature flags</p>
                <div className="mt-4 space-y-3">
                  {[
                    ['payment_enabled', 'Payment'],
                    ['risk_control_enabled', 'Risk control'],
                    ['available_channels_enabled', 'Available channels'],
                    ['affiliates_enabled', 'Affiliate program'],
                    ['channel_monitor_enabled', 'Channel monitor'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleToggle(key)}
                      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm shadow-sm hover:bg-slate-100"
                    >
                      <span>{label}</span>
                      <span className="text-slate-600">{booleanLabel(settings[key])}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error ? (
              <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
                <p className="font-semibold">Unable to save settings</p>
                <p className="mt-2 text-sm">{error}</p>
              </div>
            ) : success ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-700">
                <p className="font-semibold">{success}</p>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">Update the system settings above and save your changes.</p>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-full bg-brand-500 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
