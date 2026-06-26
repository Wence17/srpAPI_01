'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import BaseDialog from '@/components/common/BaseDialog'

interface ConfirmDialogProps {
  show: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  children?: React.ReactNode
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  show,
  title,
  message,
  confirmText,
  cancelText,
  danger = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n()

  const resolvedConfirmText = useMemo(() => confirmText || t('common.confirm'), [confirmText, t])
  const resolvedCancelText = useMemo(() => cancelText || t('common.cancel'), [cancelText, t])

  return (
    <BaseDialog
      show={show}
      title={title}
      width="narrow"
      onClose={onCancel}
      footer={
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-dark-600 dark:bg-dark-700 dark:text-gray-200 dark:hover:bg-dark-600 dark:focus:ring-offset-dark-800"
          >
            {resolvedCancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-dark-800 ${
              danger
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                : 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500'
            }`}
          >
            {resolvedConfirmText}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
        {children}
      </div>
    </BaseDialog>
  )
}
