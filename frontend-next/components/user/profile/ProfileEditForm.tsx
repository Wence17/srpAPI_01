'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { userAPI } from '@/lib/user'

interface ProfileEditFormProps {
  initialUsername: string
  embedded?: boolean
}

export default function ProfileEditForm({ initialUsername, embedded = false }: ProfileEditFormProps) {
  const { t } = useI18n()
  const { updateUser } = useAuth()
  const appStore = useApp()

  const [username, setUsername] = useState(initialUsername)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setUsername(initialUsername)
  }, [initialUsername])

  const handleUpdateProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!username.trim()) {
      appStore.showError(t('profile.usernameRequired'))
      return
    }

    setLoading(true)
    try {
      const updatedUser = await userAPI.updateProfile({ username })
      updateUser(updatedUser)
      appStore.showSuccess(t('profile.updateSuccess'))
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      appStore.showError(err.response?.data?.detail || t('profile.updateFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={embedded ? 'space-y-4' : 'card'}>
      {!embedded && (
        <div className="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('profile.editProfile')}</h2>
        </div>
      )}
      <div className={embedded ? '' : 'px-6 py-6'}>
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          {embedded && (
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('profile.editProfile')}</p>
            </div>
          )}
          <div>
            <label htmlFor="username" className="input-label">
              {t('profile.username')}
            </label>
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              type="text"
              className="input"
              placeholder={t('profile.enterUsername')}
            />
          </div>

          <div className="flex justify-end pt-4">
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? t('profile.updating') : t('profile.updateProfile')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
