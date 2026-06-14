'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminUsersAPI } from '@/lib/adminUsers'
import { extractApiErrorMessage } from '@/lib/apiError'
import BaseDialog from '@/components/common/BaseDialog'
import Icon from '@/components/icons/Icon'

interface UserCreateModalProps {
  show: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function UserCreateModal({ show, onClose, onSuccess }: UserCreateModalProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    email: '',
    password: '',
    username: '',
    notes: '',
    balance: '',
    concurrency: 1,
    rpm_limit: 0,
  })

  useEffect(() => {
    if (show) {
      setForm({
        email: '',
        password: '',
        username: '',
        notes: '',
        balance: '',
        concurrency: 1,
        rpm_limit: 0,
      })
    }
  }, [show])

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*'
    let p = ''
    for (let i = 0; i < 16; i++) p += chars.charAt(Math.floor(Math.random() * chars.length))
    setForm((prev) => ({ ...prev, password: p }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    try {
      const { balance: rawBalance, ...rest } = form
      const balance = String(rawBalance).trim()
      const payload: typeof rest & { balance?: number } = { ...rest }
      if (balance !== '') {
        payload.balance = Number(balance)
      }
      await adminUsersAPI.create(payload)
      appStore.showSuccess(t('admin.users.userCreated'))
      onSuccess()
      onClose()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error) || t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <BaseDialog
      show={show}
      title={t('admin.users.createUser')}
      width="normal"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            {t('common.cancel')}
          </button>
          <button type="submit" form="create-user-form" disabled={loading} className="btn btn-primary">
            {loading ? t('admin.users.creating') : t('common.create')}
          </button>
        </div>
      }
    >
      <form id="create-user-form" onSubmit={submit} className="space-y-5">
        <div>
          <label className="input-label">{t('admin.users.email')}</label>
          <input
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            type="email"
            required
            className="input"
            placeholder={t('admin.users.enterEmail')}
          />
        </div>
        <div>
          <label className="input-label">{t('admin.users.password')}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                type="text"
                required
                className="input pr-10"
                placeholder={t('admin.users.enterPassword')}
              />
            </div>
            <button type="button" onClick={generateRandomPassword} className="btn btn-secondary px-3">
              <Icon name="refresh" size="md" />
            </button>
          </div>
        </div>
        <div>
          <label className="input-label">{t('admin.users.username')}</label>
          <input
            value={form.username}
            onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
            type="text"
            className="input"
            placeholder={t('admin.users.enterUsername')}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="input-label">{t('admin.users.columns.balance')}</label>
            <input
              value={form.balance}
              onChange={(e) => setForm((prev) => ({ ...prev, balance: e.target.value }))}
              type="number"
              step="any"
              className="input"
            />
          </div>
          <div>
            <label className="input-label">{t('admin.users.columns.concurrency')}</label>
            <input
              value={form.concurrency}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, concurrency: Number(e.target.value) || 0 }))
              }
              type="number"
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="input-label">{t('admin.users.form.rpmLimit')}</label>
          <input
            value={form.rpm_limit}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, rpm_limit: Number(e.target.value) || 0 }))
            }
            type="number"
            min={0}
            step={1}
            className="input"
            placeholder={t('admin.users.form.rpmLimitPlaceholder')}
          />
          <p className="input-hint">{t('admin.users.form.rpmLimitHint')}</p>
        </div>
      </form>
    </BaseDialog>
  )
}
