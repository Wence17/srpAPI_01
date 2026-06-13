'use client'

interface OAuthProfileAdoptionSectionProps {
  providerName: string
  adoptionRequired: boolean
  suggestedDisplayName: string
  suggestedAvatarUrl: string
  adoptDisplayName: boolean
  adoptAvatar: boolean
  onAdoptDisplayNameChange: (value: boolean) => void
  onAdoptAvatarChange: (value: boolean) => void
  t: (key: string, params?: Record<string, unknown>) => string
}

export default function OAuthProfileAdoptionSection({
  providerName,
  adoptionRequired,
  suggestedDisplayName,
  suggestedAvatarUrl,
  adoptDisplayName,
  adoptAvatar,
  onAdoptDisplayNameChange,
  onAdoptAvatarChange,
  t,
}: OAuthProfileAdoptionSectionProps) {
  if (!adoptionRequired || (!suggestedDisplayName && !suggestedAvatarUrl)) {
    return null
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-600 dark:bg-dark-800/60">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {t('auth.oauthFlow.profileDetailsTitle', { providerName })}
          </p>
          <p className="text-xs text-gray-500 dark:text-dark-400">
            {t('auth.oauthFlow.profileDetailsDescription', { providerName })}
          </p>
        </div>

        {suggestedDisplayName ? (
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-dark-600 dark:bg-dark-900/50">
            <input
              checked={adoptDisplayName}
              onChange={(event) => onAdoptDisplayNameChange(event.target.checked)}
              type="checkbox"
              className="mt-1 h-4 w-4"
            />
            <span className="space-y-1">
              <span className="block font-medium text-gray-900 dark:text-white">
                {t('auth.oauthFlow.useDisplayName')}
              </span>
              <span className="block text-gray-500 dark:text-dark-400">{suggestedDisplayName}</span>
            </span>
          </label>
        ) : null}

        {suggestedAvatarUrl ? (
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-dark-600 dark:bg-dark-900/50">
            <input
              checked={adoptAvatar}
              onChange={(event) => onAdoptAvatarChange(event.target.checked)}
              type="checkbox"
              className="mt-1 h-4 w-4"
            />
            <img
              src={suggestedAvatarUrl}
              alt={t('auth.oauthFlow.avatarAlt', { providerName })}
              className="h-10 w-10 rounded-full border border-gray-200 object-cover dark:border-dark-600"
            />
            <span className="space-y-1">
              <span className="block font-medium text-gray-900 dark:text-white">
                {t('auth.oauthFlow.useAvatar')}
              </span>
              <span className="block break-all text-gray-500 dark:text-dark-400">{suggestedAvatarUrl}</span>
            </span>
          </label>
        ) : null}
      </div>
    </div>
  )
}
