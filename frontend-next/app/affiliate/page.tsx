'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import PageShell from '@/components/PageShell'
import { userAPI, type AffiliateInvitee, type UserAffiliateDetail } from '@/lib/user'

function formatCurrency(value?: number | null): string {
  return value != null ? `$${value.toFixed(2)}` : '$0.00'
}

function formatNumber(value?: number | null): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value ?? 0)
}

function formatRebateRate(value?: number | null): string {
  if (value == null) return '0'
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toString()
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export default function AffiliatePage() {
  const auth = useAuth()
  const [detail, setDetail] = useState<UserAffiliateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const inviteLink = useMemo(() => {
    if (!detail?.aff_code || typeof window === 'undefined') return ''
    return `${window.location.origin}/register?aff=${encodeURIComponent(detail.aff_code)}`
  }, [detail?.aff_code])

  useEffect(() => {
    let cancelled = false

    async function loadAffiliateData() {
      setLoading(true)
      setError(null)
      try {
        const affiliateDetail = await userAPI.getAffiliateDetail()
        if (cancelled) return
        setDetail(affiliateDetail)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load affiliate details.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadAffiliateData()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleTransfer() {
    if (!detail || detail.aff_quota <= 0) return
    setTransferring(true)
    setStatusMessage(null)

    try {
      const response = await userAPI.transferAffiliateQuota()
      setStatusMessage(`Transferred ${formatCurrency(response.transferred_quota)} to your balance.`)
      const refreshed = await userAPI.getAffiliateDetail()
      setDetail(refreshed)
      await auth.refreshUser()
    } catch (err) {
      setStatusMessage((err as Error)?.message || 'Failed to transfer affiliate quota.')
    } finally {
      setTransferring(false)
    }
  }

  async function copyToClipboard(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setStatusMessage('Copied to clipboard.')
    } catch {
      setStatusMessage('Unable to copy to clipboard.')
    }
  }

  useEffect(() => {
    if (!statusMessage) return

    const timeout = window.setTimeout(() => {
      setStatusMessage(null)
    }, 4000)

    return () => window.clearTimeout(timeout)
  }, [statusMessage])

  return (
    <PageShell title="Affiliate" description="Affiliate referral dashboard for your account." path="/affiliate">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Effective rebate rate</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{detail ? `${formatRebateRate(detail.effective_rebate_rate_percent)}%` : '—'}</p>
              <p className="mt-1 text-xs text-slate-400">Earn more rebate Qo when your invitees recharge.</p>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Invited users</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{detail ? formatNumber(detail.aff_count) : '—'}</p>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Available quota</p>
              <p className="mt-3 text-2xl font-semibold text-emerald-600">{detail ? formatCurrency(detail.aff_quota) : '—'}</p>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Total quota</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{detail ? formatCurrency(detail.aff_history_quota) : '—'}</p>
              {detail?.aff_frozen_quota ? (
                <p className="mt-1 text-xs text-amber-600">Frozen: {formatCurrency(detail.aff_frozen_quota)}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-900">Referral center</h2>
              <p className="text-sm text-slate-600">
                Invite new users and earn rebate quota when they sign up and recharge.
              </p>
            </div>
            <button
              type="button"
              onClick={handleTransfer}
              disabled={!detail || detail.aff_quota <= 0 || transferring}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {transferring ? 'Transferring…' : 'Transfer quota to balance'}
            </button>
          </div>
          {detail && detail.aff_quota <= 0 ? (
            <p className="mt-3 text-sm text-amber-600">You have no available affiliate quota to transfer right now.</p>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Affiliate code</p>
              <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white px-4 py-3">
                <code className="flex-1 truncate text-sm font-semibold text-slate-900">{detail?.aff_code || '—'}</code>
                <button
                  type="button"
                  onClick={() => detail?.aff_code && copyToClipboard(detail.aff_code)}
                  disabled={!detail?.aff_code}
                  className="rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Copy
                </button>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Invite link</p>
              <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white px-4 py-3">
                <code className="flex-1 truncate text-sm text-slate-900">{inviteLink || '—'}</code>
                <button
                  type="button"
                  onClick={() => inviteLink && copyToClipboard(inviteLink)}
                  disabled={!inviteLink}
                  className="rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">How to share</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
              <li>Share your invite link with friends and partners.</li>
              <li>They must sign up using your link and complete a recharge.</li>
              <li>Your rebate rate applies automatically when the invitee pays.</li>
              {detail?.aff_frozen_quota ? <li>Frozen quota will be released according to platform rules.</li> : null}
            </ul>
          </div>

          {statusMessage ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {statusMessage}
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Invitee activity</h2>
          <p className="mt-2 text-sm text-slate-600">
            Track invited users and the rebate each one generated.
          </p>

          {loading ? (
            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
              Loading affiliate data...
            </div>
          ) : error ? (
            <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
              <p className="font-semibold">Unable to load affiliate data</p>
              <p className="mt-2 text-sm">{error}</p>
            </div>
          ) : detail ? (
            <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-200 bg-slate-50">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-100 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Username</th>
                    <th className="px-4 py-3">Total Rebate</th>
                    <th className="px-4 py-3">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {detail.invitees.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                        No invitee activity yet.
                      </td>
                    </tr>
                  ) : (
                    detail.invitees.map((invitee: AffiliateInvitee) => (
                      <tr key={invitee.user_id} className="odd:bg-slate-50">
                        <td className="px-4 py-4">{invitee.email}</td>
                        <td className="px-4 py-4">{invitee.username}</td>
                        <td className="px-4 py-4">{formatCurrency(invitee.total_rebate)}</td>
                        <td className="px-4 py-4">{formatDate(invitee.created_at ?? null)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
              No affiliate data is available.
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
