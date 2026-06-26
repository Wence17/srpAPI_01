'use client'

import { useI18n } from '@/lib/i18n'

type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl'
type SpinnerColor = 'primary' | 'secondary' | 'white' | 'gray'

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-[3px]',
  xl: 'w-16 h-16 border-4',
}

const colorClasses: Record<SpinnerColor, string> = {
  primary: 'text-primary-500',
  secondary: 'text-gray-500 dark:text-dark-400',
  white: 'text-white',
  gray: 'text-gray-400 dark:text-dark-500',
}

interface LoadingSpinnerProps {
  size?: SpinnerSize
  color?: SpinnerColor
}

export default function LoadingSpinner({ size = 'md', color = 'primary' }: LoadingSpinnerProps) {
  const { t } = useI18n()

  return (
    <div
      className={`spinner inline-block rounded-full border-solid border-current border-r-transparent ${sizeClasses[size]} ${colorClasses[color]}`}
      role="status"
      aria-label={t('common.loading')}
    >
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  )
}
