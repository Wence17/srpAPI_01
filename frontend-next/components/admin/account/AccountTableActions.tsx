'use client'

import type { ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'
import Icon from '@/components/icons/Icon'

interface AccountTableActionsProps {
  loading?: boolean
  before?: ReactNode
  after?: ReactNode
  beforeCreate?: ReactNode
  afterCreate?: ReactNode
  onRefresh?: () => void
  onCreate?: () => void
}

export default function AccountTableActions({
  loading = false,
  before,
  after,
  beforeCreate,
  afterCreate,
  onRefresh,
  onCreate,
}: AccountTableActionsProps) {
  const { t } = useI18n()

  return (
    <div className="flex flex-wrap items-center gap-3">
      {before}
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="btn btn-secondary"
      >
        <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
      </button>
      {after}
      {beforeCreate}
      <button type="button" onClick={onCreate} className="btn btn-primary">
        {t('admin.accounts.createAccount')}
      </button>
      {afterCreate}
    </div>
  )
}
