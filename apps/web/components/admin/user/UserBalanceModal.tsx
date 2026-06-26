'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminUsersAPI } from '@/lib/adminUsers'
import { extractApiErrorMessage } from '@/lib/apiError'
import BaseDialog from '@/components/common/BaseDialog'
import type { AdminUser } from '@/lib/types'

interface UserBalanceModalProps {
  show: boolean
  user: AdminUser | null
  operation: 'add' | 'subtract'
  onClose: () => void
  onSuccess: () => void
}

function formatBalance(value: number): string {
  if (value === 0) return '0.00'
  const formatted = value.toFixed(8).replace(/\.?0+$/, '')
  const parts = formatted.split('.')
  if (parts.length === 1) return `${formatted}.00`
  if (parts[1].length === 1) return `${formatted}0`
  return formatted
}

export default function UserBalanceModal({
  show,
  user,
  operation,
  onClose,
  onSuccess,
}: UserBalanceModalProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ amount: 0, notes: '' })

  useEffect(() => {
    if (show) {
      setForm({ amount: 0, notes: '' })
    }
  }, [show])

  const fillAllBalance = () => {
    if (user) {
      setForm((prev) => ({ ...prev, amount: user.balance ?? 0 }))
    }
  }

  const calculateNewBalance = () => {
    if (!user) return 0
    const balance = user.balance ?? 0
    const result = operation === 'add' ? balance + form.amount : balance - form.amount
    return Math.abs(result) < 1e-10 ? 0 : result
  }

  const handleBalanceSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    if (!form.amount || form.amount <= 0) {
      appStore.showError(t('admin.users.amountRequired'))
      return
    }
    if (operation === 'subtract' && form.amount > (user.balance ?? 0)) {
      appStore.showError(t('admin.users.insufficientBalance'))
      return
    }
    setSubmitting(true)
    try {
      await adminUsersAPI.updateBalance(
        typeof user.id === 'number' ? user.id : Number(user.id),
        form.amount,
        operation,
        form.notes,
      )
      appStore.showSuccess(t('common.success'))
      onSuccess()
      onClose()
    } catch (error) {
      console.error('Failed to update balance:', error)
      appStore.showError(extractApiErrorMessage(error) || t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BaseDialog
      show={show}
      title={operation === 'add' ? t('admin.users.deposit') : t('admin.users.withdraw')}
      width="narrow"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="balance-form"
            disabled={submitting || !form.amount}
            className={`btn ${operation === 'add' ? 'bg-emerald-600 text-white' : 'btn-danger'}`}
          >
            {submitting ? t('common.saving') : t('common.confirm')}
          </button>
        </div>
      }
    >
      {user ? (
        <form id="balance-form" onSubmit={handleBalanceSubmit} className="space-y-5">
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-4 dark:bg-dark-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
              <span className="text-lg font-medium text-primary-700">
                {user.email.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">{user.email}</p>
              <p className="text-sm text-gray-500">
                {t('admin.users.currentBalance')}: ${formatBalance(user.balance ?? 0)}
              </p>
            </div>
          </div>
          <div>
            <label className="input-label">
              {operation === 'add' ? t('admin.users.depositAmount') : t('admin.users.withdrawAmount')}
            </label>
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 font-medium text-gray-500">$</div>
                <input
                  value={form.amount || ''}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, amount: Number(e.target.value) || 0 }))
                  }
                  type="number"
                  step="any"
                  min={0}
                  required
                  className="input pl-8"
                />
              </div>
              {operation === 'subtract' ? (
                <button type="button" onClick={fillAllBalance} className="btn btn-secondary whitespace-nowrap">
                  {t('admin.users.withdrawAll')}
                </button>
              ) : null}
            </div>
          </div>
          <div>
            <label className="input-label">{t('admin.users.notes')}</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={3}
              className="input"
            />
          </div>
          {form.amount > 0 ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">{t('admin.users.newBalance')}:</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  ${formatBalance(calculateNewBalance())}
                </span>
              </div>
            </div>
          ) : null}
        </form>
      ) : null}
    </BaseDialog>
  )
}
