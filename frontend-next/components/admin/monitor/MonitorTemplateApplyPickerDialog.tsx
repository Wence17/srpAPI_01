'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { extractApiErrorMessage } from '@/lib/apiError'
import { adminChannelMonitorTemplateAPI } from '@/lib/adminChannelMonitorTemplate'
import type { AssociatedMonitorBrief } from '@/lib/adminChannelMonitorTemplate'
import BaseDialog from '@/components/common/BaseDialog'

interface MonitorTemplateApplyPickerDialogProps {
  show: boolean
  templateId: number | null
  templateName: string
  onClose: () => void
  onApplied: (affected: number) => void
}

export default function MonitorTemplateApplyPickerDialog({
  show,
  templateId,
  templateName,
  onClose,
  onApplied,
}: MonitorTemplateApplyPickerDialogProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [monitors, setMonitors] = useState<AssociatedMonitorBrief[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  useEffect(() => {
    if (!show || templateId == null) return

    const id: number = templateId
    let cancelled = false

    async function fetchMonitors() {
      setLoading(true)
      setMonitors([])
      setSelectedIds([])
      try {
        const { items } = await adminChannelMonitorTemplateAPI.listAssociatedMonitors(id)
        if (cancelled) return
        setMonitors(items)
        setSelectedIds(items.map((m) => m.id))
      } catch (error) {
        if (cancelled) return
        appStore.showError(extractApiErrorMessage(error, t('common.error')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchMonitors()
    return () => {
      cancelled = true
    }
  }, [show, templateId, appStore, t])

  const toggle = (id: number) => {
    setSelectedIds((prev) => {
      const idx = prev.indexOf(id)
      if (idx >= 0) {
        const next = [...prev]
        next.splice(idx, 1)
        return next
      }
      return [...prev, id]
    })
  }

  const selectAll = () => {
    setSelectedIds(monitors.map((m) => m.id))
  }

  const selectNone = () => {
    setSelectedIds([])
  }

  const handleApply = async () => {
    if (templateId == null || selectedIds.length === 0 || submitting) return
    setSubmitting(true)
    try {
      const { affected } = await adminChannelMonitorTemplateAPI.apply(templateId, [...selectedIds])
      appStore.showSuccess(t('admin.channelMonitor.template.applySuccess', { n: affected }))
      onApplied(affected)
      onClose()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BaseDialog
      show={show}
      title={t('admin.channelMonitor.template.applyPickerTitle', { name: templateName })}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || selectedIds.length === 0}
            onClick={handleApply}
          >
            {submitting
              ? t('common.submitting')
              : t('admin.channelMonitor.template.applyPickerConfirm', { n: selectedIds.length })}
          </button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        {t('admin.channelMonitor.template.applyPickerHint')}
      </p>

      {loading ? (
        <div className="py-6 text-center text-sm text-gray-400">{t('common.loading')}</div>
      ) : monitors.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-400">
          {t('admin.channelMonitor.template.applyPickerEmpty')}
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center gap-3 text-xs">
            <button
              type="button"
              className="text-primary-600 hover:underline dark:text-primary-400"
              onClick={selectAll}
            >
              {t('common.selectAll')}
            </button>
            <button
              type="button"
              className="text-gray-500 hover:underline dark:text-gray-400"
              onClick={selectNone}
            >
              {t('admin.channelMonitor.template.selectNone')}
            </button>
            <span className="ml-auto text-gray-500 dark:text-gray-400">
              {t('admin.channelMonitor.template.selectedCount', {
                n: selectedIds.length,
                total: monitors.length,
              })}
            </span>
          </div>

          <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 dark:divide-dark-700 dark:border-dark-700">
            {monitors.map((monitor) => (
              <li
                key={monitor.id}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-dark-800"
                onClick={() => toggle(monitor.id)}
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(monitor.id)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => toggle(monitor.id)}
                />
                <span className="font-medium text-gray-900 dark:text-white">{monitor.name}</span>
                <span className="text-xs text-gray-400">{monitor.provider}</span>
                {monitor.provider === 'openai' ? (
                  <span className="text-xs text-gray-400">{monitor.api_mode}</span>
                ) : null}
                {!monitor.enabled ? (
                  <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-dark-700 dark:text-gray-400">
                    {t('admin.channelMonitor.onlyDisabled').replace(/^仅|^Only /, '')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </BaseDialog>
  )
}
