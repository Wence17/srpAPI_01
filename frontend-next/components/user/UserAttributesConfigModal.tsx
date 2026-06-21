'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminUserAttributesAPI } from '@/lib/adminUserAttributes'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import Icon from '@/components/icons/Icon'
import Select from '@/components/common/Select'
import { extractApiErrorMessage } from '@/lib/apiError'
import type {
  UserAttributeDefinition,
  UserAttributeOption,
  UserAttributeType,
} from '@/lib/types'

const attributeTypes: UserAttributeType[] = [
  'text',
  'textarea',
  'number',
  'email',
  'url',
  'date',
  'select',
  'multi_select',
]

interface UserAttributesConfigModalProps {
  show: boolean
  onClose: () => void
}

interface AttributeFormState {
  key: string
  name: string
  type: UserAttributeType
  description: string
  placeholder: string
  required: boolean
  enabled: boolean
  options: UserAttributeOption[]
}

const emptyForm = (): AttributeFormState => ({
  key: '',
  name: '',
  type: 'text',
  description: '',
  placeholder: '',
  required: false,
  enabled: true,
  options: [],
})

export default function UserAttributesConfigModal({ show, onClose }: UserAttributesConfigModalProps) {
  const { t } = useI18n()
  const appStore = useApp()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [attributes, setAttributes] = useState<UserAttributeDefinition[]>([])
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingAttribute, setEditingAttribute] = useState<UserAttributeDefinition | null>(null)
  const [deletingAttribute, setDeletingAttribute] = useState<UserAttributeDefinition | null>(null)
  const [form, setForm] = useState<AttributeFormState>(emptyForm)

  const loadAttributes = useCallback(async () => {
    setLoading(true)
    try {
      const defs = await adminUserAttributesAPI.listDefinitions()
      setAttributes(defs)
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error) || t('admin.users.attributes.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [appStore, t])

  useEffect(() => {
    if (show) void loadAttributes()
  }, [show, loadAttributes])

  const openCreateModal = () => {
    setEditingAttribute(null)
    setForm(emptyForm())
    setShowEditModal(true)
  }

  const openEditModal = (attr: UserAttributeDefinition) => {
    setEditingAttribute(attr)
    setForm({
      key: attr.key,
      name: attr.name,
      type: attr.type,
      description: attr.description || '',
      placeholder: attr.placeholder || '',
      required: attr.required,
      enabled: attr.enabled,
      options: attr.options ? attr.options.map((opt) => ({ ...opt })) : [],
    })
    setShowEditModal(true)
  }

  const closeEditModal = () => {
    setShowEditModal(false)
    setEditingAttribute(null)
  }

  const addOption = () => {
    setForm((prev) => ({ ...prev, options: [...prev.options, { value: '', label: '' }] }))
  }

  const removeOption = (index: number) => {
    setForm((prev) => ({ ...prev, options: prev.options.filter((_, i) => i !== index) }))
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.key.trim()) {
      appStore.showError(t('admin.users.attributes.keyRequired'))
      return
    }
    if (!form.name.trim()) {
      appStore.showError(t('admin.users.attributes.nameRequired'))
      return
    }
    if ((form.type === 'select' || form.type === 'multi_select') && form.options.length === 0) {
      appStore.showError(t('admin.users.attributes.optionsRequired'))
      return
    }

    setSaving(true)
    try {
      const data = {
        key: form.key,
        name: form.name,
        type: form.type,
        description: form.description || undefined,
        placeholder: form.placeholder || undefined,
        required: form.required,
        enabled: form.enabled,
        options:
          form.type === 'select' || form.type === 'multi_select' ? form.options : undefined,
      }

      if (editingAttribute) {
        await adminUserAttributesAPI.updateDefinition(editingAttribute.id, data)
        appStore.showSuccess(t('admin.users.attributes.updated'))
      } else {
        await adminUserAttributesAPI.createDefinition(data)
        appStore.showSuccess(t('admin.users.attributes.created'))
      }

      closeEditModal()
      void loadAttributes()
    } catch (error) {
      const msg = editingAttribute
        ? t('admin.users.attributes.failedToUpdate')
        : t('admin.users.attributes.failedToCreate')
      appStore.showError(extractApiErrorMessage(error) || msg)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = (attr: UserAttributeDefinition) => {
    setDeletingAttribute(attr)
    setShowDeleteDialog(true)
  }

  const handleDelete = async () => {
    if (!deletingAttribute) return
    try {
      await adminUserAttributesAPI.deleteDefinition(deletingAttribute.id)
      appStore.showSuccess(t('admin.users.attributes.deleted'))
      setShowDeleteDialog(false)
      setDeletingAttribute(null)
      void loadAttributes()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error) || t('admin.users.attributes.failedToDelete'))
    }
  }

  return (
    <>
      <BaseDialog
        show={show}
        title={t('admin.users.attributes.title')}
        width="wide"
        onClose={onClose}
        footer={
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              {t('common.close')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-dark-400">
              {t('admin.users.attributes.description')}
            </p>
            <button type="button" onClick={openCreateModal} className="btn btn-primary btn-sm">
              <Icon name="plus" size="sm" className="mr-1.5" strokeWidth={2} />
              {t('admin.users.attributes.addAttribute')}
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <svg className="h-8 w-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          ) : attributes.length === 0 ? (
            <div className="py-12 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth="1"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
              </svg>
              <p className="mt-2 text-sm text-gray-500 dark:text-dark-400">
                {t('admin.users.attributes.noAttributes')}
              </p>
              <p className="text-xs text-gray-400 dark:text-dark-500">
                {t('admin.users.attributes.noAttributesHint')}
              </p>
            </div>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {attributes.map((attr) => (
                <div
                  key={attr.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-dark-600 dark:bg-dark-800"
                >
                  <div
                    className="cursor-move text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    title={t('admin.users.attributes.dragToReorder')}
                  >
                    <Icon name="menu" size="md" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">{attr.name}</span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500 dark:bg-dark-700 dark:text-dark-400">
                        {attr.key}
                      </span>
                      {attr.required ? (
                        <span className="badge badge-danger text-xs">
                          {t('admin.users.attributes.required')}
                        </span>
                      ) : null}
                      {!attr.enabled ? (
                        <span className="badge badge-gray text-xs">{t('common.disabled')}</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-dark-400">
                      <span className="badge badge-gray">
                        {t(`admin.users.attributes.types.${attr.type}`)}
                      </span>
                      {attr.description ? <span className="truncate">{attr.description}</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(attr)}
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-dark-700 dark:hover:text-primary-400"
                      title={t('common.edit')}
                    >
                      <Icon name="edit" size="sm" />
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDelete(attr)}
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      title={t('common.delete')}
                    >
                      <Icon name="trash" size="sm" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </BaseDialog>

      <BaseDialog
        show={showEditModal}
        title={
          editingAttribute
            ? t('admin.users.attributes.editAttribute')
            : t('admin.users.attributes.addAttribute')
        }
        width="normal"
        onClose={closeEditModal}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={closeEditModal} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button type="submit" form="attribute-form" disabled={saving} className="btn btn-primary">
              {saving ? t('common.saving') : editingAttribute ? t('common.update') : t('common.create')}
            </button>
          </div>
        }
      >
        <form id="attribute-form" onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="input-label">{t('admin.users.attributes.key')}</label>
            <input
              value={form.key}
              onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value }))}
              type="text"
              required
              pattern="^[a-zA-Z][a-zA-Z0-9_]*$"
              className="input font-mono"
              placeholder={t('admin.users.attributes.keyHint')}
              disabled={!!editingAttribute}
            />
            <p className="input-hint">{t('admin.users.attributes.keyHint')}</p>
          </div>
          <div>
            <label className="input-label">{t('admin.users.attributes.name')}</label>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              type="text"
              required
              className="input"
              placeholder={t('admin.users.attributes.nameHint')}
            />
          </div>
          <div>
            <label className="input-label">{t('admin.users.attributes.type')}</label>
            <Select
              modelValue={form.type}
              options={attributeTypes.map((type) => ({
                value: type,
                label: t(`admin.users.attributes.types.${type}`),
              }))}
              onUpdateModelValue={(val) =>
                setForm((prev) => ({ ...prev, type: (val as UserAttributeType) || 'text' }))
              }
            />
          </div>
          {form.type === 'select' || form.type === 'multi_select' ? (
            <div className="space-y-2">
              <label className="input-label">{t('admin.users.attributes.options')}</label>
              {form.options.map((option, index) => (
                <div key={`option-${index}`} className="flex items-center gap-2">
                  <input
                    value={option.value}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        options: prev.options.map((opt, i) =>
                          i === index ? { ...opt, value: e.target.value } : opt,
                        ),
                      }))
                    }
                    type="text"
                    className="input flex-1 font-mono text-sm"
                    placeholder={t('admin.users.attributes.optionValue')}
                    required
                  />
                  <input
                    value={option.label}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        options: prev.options.map((opt, i) =>
                          i === index ? { ...opt, label: e.target.value } : opt,
                        ),
                      }))
                    }
                    type="text"
                    className="input flex-1 text-sm"
                    placeholder={t('admin.users.attributes.optionLabel')}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(index)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Icon name="x" size="sm" strokeWidth={2} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addOption} className="btn btn-secondary btn-sm">
                <Icon name="plus" size="sm" className="mr-1" strokeWidth={2} />
                {t('admin.users.attributes.addOption')}
              </button>
            </div>
          ) : null}
          <div>
            <label className="input-label">{t('admin.users.attributes.fieldDescription')}</label>
            <input
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              type="text"
              className="input"
              placeholder={t('admin.users.attributes.fieldDescriptionHint')}
            />
          </div>
          <div>
            <label className="input-label">{t('admin.users.attributes.placeholder')}</label>
            <input
              value={form.placeholder}
              onChange={(e) => setForm((prev) => ({ ...prev, placeholder: e.target.value }))}
              type="text"
              className="input"
              placeholder={t('admin.users.attributes.placeholderHint')}
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2">
              <input
                checked={form.required}
                onChange={(e) => setForm((prev) => ({ ...prev, required: e.target.checked }))}
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {t('admin.users.attributes.required')}
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                checked={form.enabled}
                onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {t('admin.users.attributes.enabled')}
              </span>
            </label>
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        show={showDeleteDialog}
        title={t('admin.users.attributes.deleteAttribute')}
        message={t('admin.users.attributes.deleteConfirm', { name: deletingAttribute?.name ?? '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </>
  )
}
