'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import {
  adminTlsFingerprintProfilesAPI,
  type TLSFingerprintProfile,
} from '@/lib/adminTlsFingerprintProfiles'
import { extractApiErrorMessage } from '@/lib/apiError'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import Icon from '@/components/icons/Icon'

interface TLSFingerprintProfilesModalProps {
  show: boolean
  onClose: () => void
}

const defaultFieldInputs = {
  cipher_suites: '',
  curves: '',
  point_formats: '',
  signature_algorithms: '',
  alpn_protocols: '',
  supported_versions: '',
  key_share_groups: '',
  psk_modes: '',
  extensions: '',
}

function parseNumericArray(input: string): number[] {
  if (!input.trim()) return []
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) =>
      s.startsWith('0x') || s.startsWith('0X') ? parseInt(s, 16) : parseInt(s, 10),
    )
    .filter((n) => !isNaN(n))
}

function parseStringArray(input: string): string[] {
  if (!input.trim()) return []
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function formatHex(n: number): string {
  return `0x${n.toString(16).padStart(4, '0')}`
}

function formatNumericArray(arr: number[] | null | undefined): string {
  return (arr ?? []).map(formatHex).join(', ')
}

function formatPlainNumericArray(arr: number[] | null | undefined): string {
  return (arr ?? []).join(', ')
}

export default function TLSFingerprintProfilesModal({ show, onClose }: TLSFingerprintProfilesModalProps) {
  const { t } = useI18n()
  const appStore = useApp()

  const [profiles, setProfiles] = useState<TLSFingerprintProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingProfile, setEditingProfile] = useState<TLSFingerprintProfile | null>(null)
  const [deletingProfile, setDeletingProfile] = useState<TLSFingerprintProfile | null>(null)
  const [yamlInput, setYamlInput] = useState('')
  const [fieldInputs, setFieldInputs] = useState(defaultFieldInputs)
  const [form, setForm] = useState({
    name: '',
    description: null as string | null,
    enable_grease: false,
  })

  const loadProfiles = useCallback(async () => {
    setLoading(true)
    try {
      setProfiles(await adminTlsFingerprintProfilesAPI.list())
    } catch (error) {
      appStore.showError(t('admin.tlsFingerprintProfiles.loadFailed'))
      console.error('Error loading TLS fingerprint profiles:', error)
    } finally {
      setLoading(false)
    }
  }, [appStore, t])

  useEffect(() => {
    if (show) void loadProfiles()
  }, [show, loadProfiles])

  const resetForm = () => {
    setForm({ name: '', description: null, enable_grease: false })
    setFieldInputs(defaultFieldInputs)
    setYamlInput('')
  }

  const parseYamlInput = () => {
    const text = yamlInput.trim()
    if (!text) return

    const lines = text.split('\n')
    let foundName = false
    const nextFields = { ...defaultFieldInputs }
    const nextForm = { name: form.name, description: form.description, enable_grease: form.enable_grease }

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const match = trimmed.match(/^(\w+):\s*(.+)$/)
      if (!match) continue

      const [, key, rawValue] = match
      const value = rawValue.trim()

      switch (key) {
        case 'name': {
          const unquoted = value.replace(/^["']|["']$/g, '')
          if (unquoted) {
            nextForm.name = unquoted
            foundName = true
          }
          break
        }
        case 'enable_grease':
          nextForm.enable_grease = value === 'true'
          break
        case 'cipher_suites':
        case 'curves':
        case 'point_formats':
        case 'signature_algorithms':
        case 'supported_versions':
        case 'key_share_groups':
        case 'psk_modes':
        case 'extensions': {
          const arrMatch = value.match(/^\[(.*)?\]$/)
          if (arrMatch) {
            nextFields[key as keyof typeof nextFields] = (arrMatch[1] || '')
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
              .join(', ')
          }
          break
        }
        case 'alpn_protocols': {
          const arrMatch = value.match(/^\[(.*)?\]$/)
          if (arrMatch) {
            nextFields.alpn_protocols = (arrMatch[1] || '')
              .split(',')
              .map((s) => s.trim().replace(/^["']|["']$/g, ''))
              .filter((s) => s.length > 0)
              .join(', ')
          }
          break
        }
      }
    }

    setForm(nextForm)
    setFieldInputs(nextFields)

    if (foundName) {
      appStore.showSuccess(t('admin.tlsFingerprintProfiles.form.yamlParsed'))
    } else {
      appStore.showError(t('admin.tlsFingerprintProfiles.form.yamlParseFailed'))
    }
  }

  const closeFormModal = () => {
    setShowCreateModal(false)
    setShowEditModal(false)
    setEditingProfile(null)
    resetForm()
  }

  const handleEdit = (profile: TLSFingerprintProfile) => {
    setEditingProfile(profile)
    setForm({
      name: profile.name,
      description: profile.description,
      enable_grease: profile.enable_grease,
    })
    setFieldInputs({
      cipher_suites: formatNumericArray(profile.cipher_suites),
      curves: formatPlainNumericArray(profile.curves),
      point_formats: formatPlainNumericArray(profile.point_formats),
      signature_algorithms: formatNumericArray(profile.signature_algorithms),
      alpn_protocols: (profile.alpn_protocols ?? []).join(', '),
      supported_versions: formatNumericArray(profile.supported_versions),
      key_share_groups: formatPlainNumericArray(profile.key_share_groups),
      psk_modes: formatPlainNumericArray(profile.psk_modes),
      extensions: formatNumericArray(profile.extensions),
    })
    setShowEditModal(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      appStore.showError(`${t('admin.tlsFingerprintProfiles.form.name')} ${t('common.required')}`)
      return
    }

    setSubmitting(true)
    try {
      const data = {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        enable_grease: form.enable_grease,
        cipher_suites: parseNumericArray(fieldInputs.cipher_suites),
        curves: parseNumericArray(fieldInputs.curves),
        point_formats: parseNumericArray(fieldInputs.point_formats),
        signature_algorithms: parseNumericArray(fieldInputs.signature_algorithms),
        alpn_protocols: parseStringArray(fieldInputs.alpn_protocols),
        supported_versions: parseNumericArray(fieldInputs.supported_versions),
        key_share_groups: parseNumericArray(fieldInputs.key_share_groups),
        psk_modes: parseNumericArray(fieldInputs.psk_modes),
        extensions: parseNumericArray(fieldInputs.extensions),
      }

      if (showEditModal && editingProfile) {
        await adminTlsFingerprintProfilesAPI.update(editingProfile.id, data)
        appStore.showSuccess(t('admin.tlsFingerprintProfiles.updateSuccess'))
      } else {
        await adminTlsFingerprintProfilesAPI.create(data)
        appStore.showSuccess(t('admin.tlsFingerprintProfiles.createSuccess'))
      }

      closeFormModal()
      void loadProfiles()
    } catch (error: unknown) {
      appStore.showError(
        extractApiErrorMessage(error, t('admin.tlsFingerprintProfiles.saveFailed')),
      )
      console.error('Error saving TLS fingerprint profile:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!deletingProfile) return
    try {
      await adminTlsFingerprintProfilesAPI.delete(deletingProfile.id)
      appStore.showSuccess(t('admin.tlsFingerprintProfiles.deleteSuccess'))
      setShowDeleteDialog(false)
      setDeletingProfile(null)
      void loadProfiles()
    } catch (error: unknown) {
      appStore.showError(
        extractApiErrorMessage(error, t('admin.tlsFingerprintProfiles.deleteFailed')),
      )
      console.error('Error deleting TLS fingerprint profile:', error)
    }
  }

  return (
    <BaseDialog
      show={show}
      title={t('admin.tlsFingerprintProfiles.title')}
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
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('admin.tlsFingerprintProfiles.description')}
          </p>
          <button type="button" onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm">
            <Icon name="plus" size="sm" className="mr-1" />
            {t('admin.tlsFingerprintProfiles.createProfile')}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Icon name="refresh" size="lg" className="animate-spin text-gray-400" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-dark-700">
              <Icon name="shield" size="lg" className="text-gray-400" />
            </div>
            <h4 className="mb-1 text-sm font-medium text-gray-900 dark:text-white">
              {t('admin.tlsFingerprintProfiles.noProfiles')}
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('admin.tlsFingerprintProfiles.createFirstProfile')}
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-auto rounded-lg border border-gray-200 dark:border-dark-600">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-700">
              <thead className="sticky top-0 bg-gray-50 dark:bg-dark-700">
                <tr>
                  {[
                    t('admin.tlsFingerprintProfiles.columns.name'),
                    t('admin.tlsFingerprintProfiles.columns.description'),
                    t('admin.tlsFingerprintProfiles.columns.grease'),
                    t('admin.tlsFingerprintProfiles.columns.alpn'),
                    t('admin.tlsFingerprintProfiles.columns.actions'),
                  ].map((label) => (
                    <th
                      key={label}
                      className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-700 dark:bg-dark-800">
                {profiles.map((profile) => (
                  <tr key={profile.id} className="hover:bg-gray-50 dark:hover:bg-dark-700">
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{profile.name}</div>
                    </td>
                    <td className="px-3 py-2">
                      {profile.description ? (
                        <div className="max-w-xs truncate text-sm text-gray-500 dark:text-gray-400">
                          {profile.description}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 dark:text-gray-600">—</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Icon
                        name={profile.enable_grease ? 'check' : 'lock'}
                        size="sm"
                        className={profile.enable_grease ? 'text-green-500' : 'text-gray-400'}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {profile.alpn_protocols?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {profile.alpn_protocols.slice(0, 3).map((proto) => (
                            <span key={proto} className="badge badge-primary text-xs">
                              {proto}
                            </span>
                          ))}
                          {profile.alpn_protocols.length > 3 ? (
                            <span className="text-xs text-gray-500">
                              +{profile.alpn_protocols.length - 3}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 dark:text-gray-600">—</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(profile)}
                          className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400"
                          title={t('common.edit')}
                        >
                          <Icon name="edit" size="sm" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingProfile(profile)
                            setShowDeleteDialog(true)
                          }}
                          className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                          title={t('common.delete')}
                        >
                          <Icon name="trash" size="sm" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BaseDialog
        show={showCreateModal || showEditModal}
        title={
          showEditModal
            ? t('admin.tlsFingerprintProfiles.editProfile')
            : t('admin.tlsFingerprintProfiles.createProfile')
        }
        width="wide"
        zIndex={60}
        onClose={closeFormModal}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={closeFormModal} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? (
                <Icon name="refresh" size="sm" className="mr-1 animate-spin" />
              ) : null}
              {showEditModal ? t('common.update') : t('common.create')}
            </button>
          </div>
        }
      >
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="input-label">{t('admin.tlsFingerprintProfiles.form.pasteYaml')}</label>
            <textarea
              rows={4}
              className="input font-mono text-xs"
              value={yamlInput}
              placeholder={t('admin.tlsFingerprintProfiles.form.pasteYamlPlaceholder')}
              onChange={(e) => setYamlInput(e.target.value)}
              onPaste={() => setTimeout(() => parseYamlInput(), 50)}
            />
            <div className="mt-1 flex items-center gap-2">
              <button type="button" onClick={parseYamlInput} className="btn btn-secondary btn-sm">
                {t('admin.tlsFingerprintProfiles.form.parseYaml')}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('admin.tlsFingerprintProfiles.form.pasteYamlHint')}{' '}
                <a
                  href="https://tls.sub2api.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 underline hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  {t('admin.tlsFingerprintProfiles.form.openCollector')}
                </a>
              </p>
            </div>
          </div>

          <hr className="border-gray-200 dark:border-dark-600" />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">{t('admin.tlsFingerprintProfiles.form.name')}</label>
              <input
                type="text"
                required
                className="input"
                value={form.name}
                placeholder={t('admin.tlsFingerprintProfiles.form.namePlaceholder')}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="input-label">{t('admin.tlsFingerprintProfiles.form.description')}</label>
              <input
                type="text"
                className="input"
                value={form.description || ''}
                placeholder={t('admin.tlsFingerprintProfiles.form.descriptionPlaceholder')}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value || null }))
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, enable_grease: !prev.enable_grease }))}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                form.enable_grease ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  form.enable_grease ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('admin.tlsFingerprintProfiles.form.enableGrease')}
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('admin.tlsFingerprintProfiles.form.enableGreaseHint')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {(
              [
                ['cipher_suites', t('admin.tlsFingerprintProfiles.form.cipherSuites'), '0x1301, 0x1302, 0xc02c', t('admin.tlsFingerprintProfiles.form.cipherSuitesHint')],
                ['curves', t('admin.tlsFingerprintProfiles.form.curves'), '29, 23, 24', t('admin.tlsFingerprintProfiles.form.curvesHint')],
                ['signature_algorithms', t('admin.tlsFingerprintProfiles.form.signatureAlgorithms'), '0x0403, 0x0804, 0x0401', ''],
                ['supported_versions', t('admin.tlsFingerprintProfiles.form.supportedVersions'), '0x0304, 0x0303', ''],
                ['key_share_groups', t('admin.tlsFingerprintProfiles.form.keyShareGroups'), '29, 23', ''],
                ['extensions', t('admin.tlsFingerprintProfiles.form.extensions'), '0x0000, 0x0005, 0x000a', ''],
                ['point_formats', t('admin.tlsFingerprintProfiles.form.pointFormats'), '0', ''],
                ['psk_modes', t('admin.tlsFingerprintProfiles.form.pskModes'), '1', ''],
              ] as const
            ).map(([key, label, placeholder, hint]) => (
              <div key={key}>
                <label className="input-label text-xs">{label}</label>
                <textarea
                  rows={2}
                  className="input font-mono text-xs"
                  value={fieldInputs[key]}
                  placeholder={placeholder}
                  onChange={(e) =>
                    setFieldInputs((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
                {hint ? <p className="input-hint text-xs">{hint}</p> : null}
              </div>
            ))}
          </div>

          <div>
            <label className="input-label text-xs">
              {t('admin.tlsFingerprintProfiles.form.alpnProtocols')}
            </label>
            <textarea
              rows={2}
              className="input font-mono text-xs"
              value={fieldInputs.alpn_protocols}
              placeholder="h2, http/1.1"
              onChange={(e) =>
                setFieldInputs((prev) => ({ ...prev, alpn_protocols: e.target.value }))
              }
            />
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        show={showDeleteDialog}
        title={t('admin.tlsFingerprintProfiles.deleteProfile')}
        message={t('admin.tlsFingerprintProfiles.deleteConfirmMessage', {
          name: deletingProfile?.name ?? '',
        })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </BaseDialog>
  )
}
