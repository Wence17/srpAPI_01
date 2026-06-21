'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminUserAttributesAPI } from '@/lib/adminUserAttributes'
import Select from '@/components/common/Select'
import type { UserAttributeDefinition, UserAttributeValuesMap } from '@/lib/types'

interface UserAttributeFormProps {
  userId?: number
  value: UserAttributeValuesMap
  onChange: (value: UserAttributeValuesMap) => void
}

export default function UserAttributeForm({ userId, value, onChange }: UserAttributeFormProps) {
  const [loading, setLoading] = useState(false)
  const [attributes, setAttributes] = useState<UserAttributeDefinition[]>([])
  const [localValues, setLocalValues] = useState<UserAttributeValuesMap>({})

  const emitChange = useCallback(
    (next: UserAttributeValuesMap) => {
      setLocalValues(next)
      onChange(next)
    },
    [onChange],
  )

  useEffect(() => {
    let cancelled = false
    async function loadAttributes() {
      setLoading(true)
      try {
        const defs = await adminUserAttributesAPI.listEnabledDefinitions()
        if (!cancelled) setAttributes(defs)
      } catch (error) {
        console.error('Failed to load attributes:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadAttributes()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (value && Object.keys(value).length > 0) {
      setLocalValues({ ...value })
    }
  }, [value])

  useEffect(() => {
    if (!userId) {
      setLocalValues({})
      return
    }
    let cancelled = false
    async function loadUserValues() {
      try {
        const values = await adminUserAttributesAPI.getUserAttributeValues(userId!)
        if (cancelled) return
        const valuesMap: UserAttributeValuesMap = {}
        values.forEach((v) => {
          valuesMap[v.attribute_id] = v.value
        })
        emitChange(valuesMap)
      } catch (error) {
        console.error('Failed to load user attribute values:', error)
      }
    }
    void loadUserValues()
    return () => {
      cancelled = true
    }
  }, [userId, emitChange])

  const isOptionSelected = (attrId: number, optionValue: string): boolean => {
    const val = localValues[attrId]
    if (!val) return false
    try {
      const arr = JSON.parse(val)
      return Array.isArray(arr) && arr.includes(optionValue)
    } catch {
      return false
    }
  }

  const toggleMultiSelectOption = (attrId: number, optionValue: string) => {
    let arr: string[] = []
    const val = localValues[attrId]
    if (val) {
      try {
        arr = JSON.parse(val)
        if (!Array.isArray(arr)) arr = []
      } catch {
        arr = []
      }
    }

    const index = arr.indexOf(optionValue)
    if (index > -1) {
      arr.splice(index, 1)
    } else {
      arr.push(optionValue)
    }

    emitChange({ ...localValues, [attrId]: JSON.stringify(arr) })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <svg className="h-5 w-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    )
  }

  if (attributes.length === 0) return null

  return (
    <div className="space-y-4">
      {attributes.map((attr) => (
        <div key={attr.id}>
          <label className="input-label">
            {attr.name}
            {attr.required ? <span className="text-red-500">*</span> : null}
          </label>

          {attr.type === 'text' || attr.type === 'email' || attr.type === 'url' ? (
            <input
              value={localValues[attr.id] ?? ''}
              type={attr.type === 'text' ? 'text' : attr.type}
              required={attr.required}
              placeholder={attr.placeholder}
              className="input"
              onChange={(e) => emitChange({ ...localValues, [attr.id]: e.target.value })}
            />
          ) : null}

          {attr.type === 'number' ? (
            <input
              value={localValues[attr.id] ?? ''}
              type="number"
              required={attr.required}
              placeholder={attr.placeholder}
              min={attr.validation?.min}
              max={attr.validation?.max}
              className="input"
              onChange={(e) => emitChange({ ...localValues, [attr.id]: e.target.value })}
            />
          ) : null}

          {attr.type === 'date' ? (
            <input
              value={localValues[attr.id] ?? ''}
              type="date"
              required={attr.required}
              className="input"
              onChange={(e) => emitChange({ ...localValues, [attr.id]: e.target.value })}
            />
          ) : null}

          {attr.type === 'textarea' ? (
            <textarea
              value={localValues[attr.id] ?? ''}
              required={attr.required}
              placeholder={attr.placeholder}
              rows={3}
              className="input"
              onChange={(e) => emitChange({ ...localValues, [attr.id]: e.target.value })}
            />
          ) : null}

          {attr.type === 'select' ? (
            <Select
              modelValue={localValues[attr.id] ?? ''}
              options={attr.options || []}
              onUpdateModelValue={(val) =>
                emitChange({ ...localValues, [attr.id]: String(val ?? '') })
              }
            />
          ) : null}

          {attr.type === 'multi_select' ? (
            <div className="space-y-2">
              {(attr.options || []).map((opt) => (
                <label key={opt.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    value={opt.value}
                    checked={isOptionSelected(attr.id, opt.value)}
                    onChange={() => toggleMultiSelectOption(attr.id, opt.value)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>
          ) : null}

          {attr.description ? <p className="input-hint">{attr.description}</p> : null}
        </div>
      ))}
    </div>
  )
}
