'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { userAPI } from '@/lib/user'
import { extractApiErrorMessage } from '@/lib/apiError'
import type { User } from '@/lib/types'

interface ProfileAvatarCardProps {
  user: User | null
  embedded?: boolean
}

const targetAvatarUploadBytes = 20 * 1024
const avatarScaleSteps = [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36]
const avatarQualitySteps = [0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36]

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('avatar_read_failed'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataURL: string, readFailedMessage: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(readFailedMessage))
    image.src = dataURL
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number, compressFailedMessage: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(compressFailedMessage))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

export default function ProfileAvatarCard({ user, embedded = false }: ProfileAvatarCardProps) {
  const { t } = useI18n()
  const { updateUser } = useAuth()
  const appStore = useApp()

  const [avatarDraft, setAvatarDraft] = useState('')
  const [avatarSaving, setAvatarSaving] = useState(false)

  const displayName = useMemo(
    () => user?.username?.trim() || user?.email?.trim() || t('profile.user'),
    [user, t],
  )
  const avatarInitial = useMemo(() => displayName.charAt(0).toUpperCase() || 'U', [displayName])
  const avatarPreviewUrl = avatarDraft.trim() || user?.avatar_url?.trim() || ''

  useEffect(() => {
    setAvatarDraft('')
  }, [user?.avatar_url])

  const normalizeUploadedAvatar = (value: string): string | null => {
    const normalized = value.trim()
    if (!normalized) {
      return null
    }
    if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(normalized)) {
      appStore.showError(t('profile.avatar.uploadRequired'))
      return null
    }
    return normalized
  }

  const compressAvatarFile = async (file: File): Promise<File> => {
    const sourceDataURL = await readFileAsDataURL(file)
    const image = await loadImage(sourceDataURL, t('profile.avatar.readFailed'))
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error(t('profile.avatar.compressFailed'))
    }

    for (const scale of avatarScaleSteps) {
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      canvas.width = width
      canvas.height = height
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(image, 0, 0, width, height)

      for (const quality of avatarQualitySteps) {
        const blob = await canvasToBlob(canvas, 'image/webp', quality, t('profile.avatar.compressFailed'))
        if (blob.size <= targetAvatarUploadBytes) {
          const fileName = file.name.replace(/\.[^.]+$/, '') || 'avatar'
          return new File([blob], `${fileName}.webp`, { type: 'image/webp' })
        }
      }
    }

    throw new Error(t('profile.avatar.compressTooLarge'))
  }

  const prepareAvatarUpload = async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/')) {
      throw new Error(t('profile.avatar.invalidType'))
    }
    if (file.type === 'image/gif') {
      if (file.size > targetAvatarUploadBytes) {
        throw new Error(t('profile.avatar.gifTooLarge'))
      }
      return file
    }
    if (file.size <= targetAvatarUploadBytes) {
      return file
    }
    return compressAvatarFile(file)
  }

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    input.value = ''
    if (!file) {
      return
    }

    try {
      const preparedFile = await prepareAvatarUpload(file)
      const dataURL = await readFileAsDataURL(preparedFile)
      const normalized = normalizeUploadedAvatar(dataURL)
      if (!normalized) {
        return
      }
      setAvatarDraft(normalized)
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error, t('common.error')))
    }
  }

  const handleAvatarSave = async () => {
    const normalized = normalizeUploadedAvatar(avatarDraft)
    if (!normalized) {
      return
    }

    setAvatarSaving(true)
    try {
      const updated = await userAPI.updateProfile({ avatar_url: normalized })
      updateUser(updated)
      setAvatarDraft(updated.avatar_url?.trim() || '')
      appStore.showSuccess(t('profile.avatar.saveSuccess'))
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setAvatarSaving(false)
    }
  }

  const handleAvatarDelete = async () => {
    if (avatarSaving) {
      return
    }
    if (!avatarDraft.trim() && !user?.avatar_url?.trim()) {
      appStore.showError(t('profile.avatar.emptyDeleteHint'))
      return
    }

    setAvatarSaving(true)
    try {
      const updated = await userAPI.updateProfile({ avatar_url: '' })
      updateUser(updated)
      setAvatarDraft('')
      appStore.showSuccess(t('profile.avatar.deleteSuccess'))
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setAvatarSaving(false)
    }
  }

  return (
    <div className={embedded ? 'space-y-4' : 'card'}>
      {!embedded && (
        <div className="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('profile.avatar.title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('profile.avatar.description')}</p>
        </div>
      )}

      <div className={embedded ? 'space-y-3' : 'flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-start'}>
        <div
          className={
            embedded
              ? 'flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 text-xl font-bold text-white shadow-lg shadow-primary-500/20'
              : 'flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 text-3xl font-bold text-white shadow-lg shadow-primary-500/20'
          }
        >
          {avatarPreviewUrl ? (
            <img
              data-testid="profile-avatar-preview"
              src={avatarPreviewUrl}
              alt={displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            <span>{avatarInitial}</span>
          )}
        </div>

        <div className={embedded ? 'space-y-3' : 'min-w-0 flex-1 space-y-4'}>
          <div className="space-y-1">
            {embedded ? (
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('profile.avatar.title')}</p>
            ) : (
              <p className="text-sm font-medium text-gray-900 dark:text-white">{displayName}</p>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.avatar.uploadHint')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="btn btn-secondary btn-sm cursor-pointer">
              <input
                data-testid="profile-avatar-file-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
              {t('profile.avatar.uploadAction')}
            </label>

            <button
              data-testid="profile-avatar-save"
              type="button"
              className="btn btn-primary btn-sm"
              disabled={avatarSaving || !avatarDraft}
              onClick={handleAvatarSave}
            >
              {t('common.save')}
            </button>

            <button
              data-testid="profile-avatar-delete"
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={avatarSaving}
              onClick={handleAvatarDelete}
            >
              {t('common.delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
