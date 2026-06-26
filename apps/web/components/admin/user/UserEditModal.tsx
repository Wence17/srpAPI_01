'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { useClipboard } from '@/lib/useClipboard'
import { adminUsersAPI } from '@/lib/adminUsers'
import { adminUserAttributesAPI } from '@/lib/adminUserAttributes'
import { extractApiErrorMessage } from '@/lib/apiError'
import BaseDialog from '@/components/common/BaseDialog'
import UserAttributeForm from '@/components/user/UserAttributeForm'
import Icon from '@/components/icons/Icon'
import type { AdminUser, UserAttributeValuesMap } from '@/lib/types'

interface UserEditModalProps {
  show: boolean
  user: AdminUser | null
  onClose: () => void
  onSuccess: () => void
}

export default function UserEditModal({ show, user, onClose, onSuccess }: UserEditModalProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const { copyToClipboard } = useClipboard()
  const [submitting, setSubmitting] = useState(false)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [form, setForm] = useState({
    email: '',
    password: '',
    username: '',
    notes: '',
    concurrency: 1,
    rpm_limit: 0,
    customAttributes: {} as UserAttributeValuesMap,
  })

  useEffect(() => {
    if (user) {
      setForm({
        email: user.email,
        password: '',
        username: user.username || '',
        notes: user.notes || '',
        concurrency: user.concurrency ?? 1,
        rpm_limit: user.rpm_limit ?? 0,
        customAttributes: {},
      })
      setPasswordCopied(false)
    }
  }, [user])

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*'
    let p = ''
    for (let i = 0; i < 16; i++) p += chars.charAt(Math.floor(Math.random() * chars.length))
    setForm((prev) => ({ ...prev, password: p }))
  }

  const copyPassword = async () => {
    if (form.password && (await copyToClipboard(form.password, t('admin.users.passwordCopied')))) {
      setPasswordCopied(true)
      setTimeout(() => setPasswordCopied(false), 2000)
    }
  }

  const handleUpdateUser = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    if (!form.email.trim()) {
      appStore.showError(t('admin.users.emailRequired'))
      return
    }
    if (form.concurrency < 1) {
      appStore.showError(t('admin.users.concurrencyMin'))
      return
    }
    setSubmitting(true)
    try {
      const data: Record<string, unknown> = {
        email: form.email,
        username: form.username,
        notes: form.notes,
        concurrency: form.concurrency,
        rpm_limit: form.rpm_limit,
      }
      if (form.password.trim()) data.password = form.password.trim()
      await adminUsersAPI.update(typeof user.id === 'number' ? user.id : Number(user.id), data)
      if (Object.keys(form.customAttributes).length > 0) {
        await adminUserAttributesAPI.updateUserAttributeValues(
          typeof user.id === 'number' ? user.id : Number(user.id),
          form.customAttributes,
        )
      }
      appStore.showSuccess(t('admin.users.userUpdated'))
      onSuccess()
      onClose()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error) || t('admin.users.failedToUpdate'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BaseDialog
      show={show}
      title={t('admin.users.editUser')}
      width="normal"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            {t('common.cancel')}
          </button>
          <button type="submit" form="edit-user-form" disabled={submitting} className="btn btn-primary">
            {submitting ? t('admin.users.updating') : t('common.update')}
          </button>
        </div>
      }
    >
      {user ? (
        <form id="edit-user-form" onSubmit={handleUpdateUser} className="space-y-5">
          <div>
            <label className="input-label">{t('admin.users.email')}</label>
            <input
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              type="email"
              className="input"
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
                  className="input pr-10"
                  placeholder={t('admin.users.enterNewPassword')}
                />
                {form.password ? (
                  <button
                    type="button"
                    onClick={copyPassword}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors hover:bg-gray-100 dark:hover:bg-dark-700 ${
                      passwordCopied ? 'text-green-500' : 'text-gray-400'
                    }`}
                  >
                    {passwordCopied ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                        />
                      </svg>
                    )}
                  </button>
                ) : null}
              </div>
              <button type="button" onClick={generatePassword} className="btn btn-secondary px-3">
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
            />
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
          <UserAttributeForm
            userId={typeof user.id === 'number' ? user.id : Number(user.id)}
            value={form.customAttributes}
            onChange={(customAttributes) => setForm((prev) => ({ ...prev, customAttributes }))}
          />
        </form>
      ) : null}
    </BaseDialog>
  )
}
