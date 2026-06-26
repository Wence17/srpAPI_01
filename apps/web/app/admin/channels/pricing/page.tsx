'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { getPersistedPageSize } from '@/lib/usePersistedPageSize'
import { useKeyedDebouncedSearch } from '@/lib/useKeyedDebouncedSearch'
import { extractApiErrorMessage } from '@/lib/apiError'
import { formatDateOnly } from '@/lib/format'
import { platformBadgeLightClass, platformTextClass } from '@/lib/platformColors'
import {
  adminChannelsAPI,
  type AccountStatsPricingRule,
  type Channel,
  type ChannelModelPricing,
  type CreateChannelRequest,
  type UpdateChannelRequest,
} from '@/lib/adminChannels'
import { adminGroupsAPI } from '@/lib/adminGroups'
import { adminAccountsAPI } from '@/lib/adminAccounts'
import { adminSettingsAPI } from '@/lib/adminSettings'
import {
  apiIntervalsToForm,
  findModelConflict,
  formIntervalsToAPI,
  mTokToPerToken,
  perTokenToMTok,
  validateIntervals,
  type PricingFormEntry,
} from '@/components/admin/channel/types'
import PricingEntryCard from '@/components/admin/channel/PricingEntryCard'
import AppLayout from '@/components/layout/AppLayout'
import TablePageLayout from '@/components/layout/TablePageLayout'
import DataTable, { type DataTableCellContext } from '@/components/common/DataTable'
import Pagination from '@/components/common/Pagination'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import Select from '@/components/common/Select'
import Toggle from '@/components/common/Toggle'
import Icon from '@/components/icons/Icon'
import PlatformIcon from '@/components/common/PlatformIcon'
import type { Column } from '@/components/common/types'
import type { AdminGroup, GroupPlatform } from '@/lib/types'

interface FormPricingRule {
  name: string
  group_ids: number[]
  account_ids: number[]
  pricing: PricingFormEntry[]
}

interface PlatformSection {
  platform: GroupPlatform
  enabled: boolean
  collapsed: boolean
  group_ids: number[]
  model_mapping: Record<string, string>
  model_pricing: PricingFormEntry[]
  web_search_emulation: boolean
  codex_image_generation_bridge: boolean
  bedrock_cc_compat: boolean
  account_stats_pricing_rules: FormPricingRule[]
}

interface ChannelFormState {
  name: string
  description: string
  status: string
  restrict_models: boolean
  billing_model_source: string
  platforms: PlatformSection[]
  apply_pricing_to_account_stats: boolean
}

interface SimpleAccount {
  id: number
  name: string
  platform: string
}

const PLATFORM_ORDER: GroupPlatform[] = ['anthropic', 'openai', 'gemini', 'antigravity']

const EMPTY_PRICING_ENTRY = (): PricingFormEntry => ({
  models: [],
  billing_mode: 'token',
  input_price: null,
  output_price: null,
  cache_write_price: null,
  cache_read_price: null,
  image_output_price: null,
  per_request_price: null,
  intervals: [],
})

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: string; code?: string }
  return name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED'
}

function createEmptyForm(): ChannelFormState {
  return {
    name: '',
    description: '',
    status: 'active',
    restrict_models: false,
    billing_model_source: 'channel_mapped',
    platforms: [],
    apply_pricing_to_account_stats: false,
  }
}

function addPlatformSection(platforms: PlatformSection[], platform: GroupPlatform): PlatformSection[] {
  return [
    ...platforms,
    {
      platform,
      enabled: true,
      collapsed: false,
      group_ids: [],
      model_mapping: {},
      model_pricing: [],
      web_search_emulation: false,
      codex_image_generation_bridge: false,
      bedrock_cc_compat: false,
      account_stats_pricing_rules: [],
    },
  ]
}

export default function AdminChannelsPricingPage() {
  const { t } = useI18n()
  const appStore = useApp()

  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({ status: '' })
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: getPersistedPageSize(),
    total: 0,
  })
  const [sortState, setSortState] = useState({
    sort_by: 'created_at',
    sort_order: 'desc' as 'asc' | 'desc',
  })

  const [showDialog, setShowDialog] = useState(false)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingChannel, setDeletingChannel] = useState<Channel | null>(null)
  const [activeTab, setActiveTab] = useState('basic')
  const [form, setForm] = useState<ChannelFormState>(createEmptyForm)

  const [allGroups, setAllGroups] = useState<AdminGroup[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [allChannelsForConflict, setAllChannelsForConflict] = useState<Channel[]>([])
  const [webSearchGlobalEnabled, setWebSearchGlobalEnabled] = useState(false)
  const [syncingPlatform, setSyncingPlatform] = useState<string | null>(null)

  const [ruleAccountSearchKeyword, setRuleAccountSearchKeyword] = useState<Record<string, string>>({})
  const [ruleAccountSearchResults, setRuleAccountSearchResults] = useState<
    Record<string, SimpleAccount[]>
  >({})
  const [showRuleAccountDropdown, setShowRuleAccountDropdown] = useState<Record<string, boolean>>({})
  const [ruleAccountNameCache, setRuleAccountNameCache] = useState<Record<number, string>>({})

  const abortControllerRef = useRef<AbortController | null>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ruleAccountSearchRunner = useKeyedDebouncedSearch<SimpleAccount[]>({
    delay: 300,
    search: async (keyword, { key, signal }) => {
      const platform = key.split('-')[0]
      const res = await adminAccountsAPI.list(1, 20, { platform, search: keyword }, { signal })
      return res.items.map((a) => ({ id: a.id, name: a.name, platform: a.platform }))
    },
    onSuccess: (key, result) => {
      setRuleAccountSearchResults((prev) => ({ ...prev, [key]: result }))
    },
    onError: (key) => {
      setRuleAccountSearchResults((prev) => ({ ...prev, [key]: [] }))
    },
  })

  const statusFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.channels.allStatus', 'All Status') },
      { value: 'active', label: t('admin.channels.statusActive', 'Active') },
      { value: 'disabled', label: t('admin.channels.statusDisabled', 'Disabled') },
    ],
    [t],
  )

  const statusEditOptions = useMemo(
    () => [
      { value: 'active', label: t('admin.channels.statusActive', 'Active') },
      { value: 'disabled', label: t('admin.channels.statusDisabled', 'Disabled') },
    ],
    [t],
  )

  const billingModelSourceOptions = useMemo(
    () => [
      {
        value: 'channel_mapped',
        label: t('admin.channels.form.billingModelSourceChannelMapped', 'Bill by channel-mapped model'),
      },
      {
        value: 'requested',
        label: t('admin.channels.form.billingModelSourceRequested', 'Bill by requested model'),
      },
      {
        value: 'upstream',
        label: t('admin.channels.form.billingModelSourceUpstream', 'Bill by final upstream model'),
      },
    ],
    [t],
  )

  const columns = useMemo<Column[]>(
    () => [
      { key: 'name', label: t('admin.channels.columns.name', 'Name'), sortable: true },
      {
        key: 'description',
        label: t('admin.channels.columns.description', 'Description'),
        sortable: false,
      },
      { key: 'status', label: t('admin.channels.columns.status', 'Status'), sortable: true },
      { key: 'group_count', label: t('admin.channels.columns.groups', 'Groups'), sortable: false },
      {
        key: 'pricing_count',
        label: t('admin.channels.columns.pricing', 'Pricing'),
        sortable: false,
      },
      {
        key: 'created_at',
        label: t('admin.channels.columns.createdAt', 'Created'),
        sortable: true,
      },
      { key: 'actions', label: t('admin.channels.columns.actions', 'Actions'), sortable: false },
    ],
    [t],
  )

  const activePlatforms = useMemo(
    () => form.platforms.filter((s) => s.enabled).map((s) => s.platform),
    [form.platforms],
  )

  const groupToChannelMap = useMemo(() => {
    const map = new Map<number, Channel>()
    for (const ch of allChannelsForConflict) {
      if (editingChannel && ch.id === editingChannel.id) continue
      for (const gid of ch.group_ids || []) {
        map.set(gid, ch)
      }
    }
    return map
  }, [allChannelsForConflict, editingChannel])

  const deleteConfirmMessage = useMemo(() => {
    const name = deletingChannel?.name || ''
    return t('admin.channels.deleteConfirm', { name })
  }, [deletingChannel?.name, t])

  const clearAllRuleAccountSearchState = useCallback(() => {
    setRuleAccountSearchKeyword({})
    setRuleAccountSearchResults({})
    setShowRuleAccountDropdown({})
  }, [])

  const getGroupsForPlatform = useCallback(
    (platform: GroupPlatform) => allGroups.filter((g) => g.platform === platform),
    [allGroups],
  )

  const isGroupInOtherChannel = useCallback(
    (groupId: number) => groupToChannelMap.has(groupId),
    [groupToChannelMap],
  )

  const getGroupInOtherChannelLabel = useCallback(
    (groupId: number) => {
      const name = groupToChannelMap.get(groupId)?.name || ''
      return t('admin.channels.form.inOtherChannel', { name })
    },
    [groupToChannelMap, t],
  )

  const getGroupNameById = useCallback(
    (groupId: number) => {
      const group = allGroups.find((g) => g.id === groupId)
      return group ? group.name : `#${groupId}`
    },
    [allGroups],
  )

  const getRuleAccountLabel = useCallback(
    (accountId: number) => {
      const name = ruleAccountNameCache[accountId]
      return name ? `${name} #${accountId}` : `#${accountId}`
    },
    [ruleAccountNameCache],
  )

  const updatePlatformSection = useCallback(
    (sectionIdx: number, updater: (section: PlatformSection) => PlatformSection) => {
      setForm((prev) => ({
        ...prev,
        platforms: prev.platforms.map((section, idx) =>
          idx === sectionIdx ? updater(section) : section,
        ),
      }))
    },
    [],
  )

  const loadWebSearchGlobalState = useCallback(async () => {
    try {
      const cfg = await adminSettingsAPI.getWebSearchEmulationConfig()
      setWebSearchGlobalEnabled(cfg?.enabled === true && (cfg?.providers?.length ?? 0) > 0)
    } catch (err) {
      console.warn('Failed to load web search global state:', err)
      setWebSearchGlobalEnabled(false)
    }
  }, [])

  const loadChannels = useCallback(async () => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setLoading(true)

    try {
      const response = await adminChannelsAPI.list(
        pagination.page,
        pagination.page_size,
        {
          status: filters.status || undefined,
          search: searchQuery || undefined,
          sort_by: sortState.sort_by,
          sort_order: sortState.sort_order,
        },
        { signal: controller.signal },
      )

      if (controller.signal.aborted || abortControllerRef.current !== controller) return
      setChannels(response.items || [])
      setPagination((prev) => ({ ...prev, total: response.total }))
    } catch (error) {
      if (isAbortError(error) || abortControllerRef.current !== controller) return
      appStore.showError(
        extractApiErrorMessage(error, t('admin.channels.loadError', 'Failed to load channels')),
      )
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false)
        abortControllerRef.current = null
      }
    }
  }, [
    appStore,
    filters.status,
    pagination.page,
    pagination.page_size,
    searchQuery,
    sortState.sort_by,
    sortState.sort_order,
    t,
  ])

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true)
    try {
      setAllGroups(await adminGroupsAPI.getAll())
    } catch (error) {
      console.error('Error loading groups:', error)
    } finally {
      setGroupsLoading(false)
    }
  }, [])

  const loadAllChannelsForConflict = useCallback(async () => {
    try {
      const response = await adminChannelsAPI.list(1, 1000)
      setAllChannelsForConflict(response.items || [])
    } catch {
      setAllChannelsForConflict(channels)
    }
  }, [channels])

  const apiToForm = useCallback(
    (channel: Channel, groups: AdminGroup[]): PlatformSection[] => {
      const groupPlatformMap = new Map<number, GroupPlatform>()
      for (const g of groups) {
        groupPlatformMap.set(g.id, g.platform)
      }

      const activePlatformSet = new Set<GroupPlatform>()
      for (const gid of channel.group_ids || []) {
        const p = groupPlatformMap.get(gid)
        if (p) activePlatformSet.add(p)
      }
      for (const p of channel.model_pricing || []) {
        if (p.platform) activePlatformSet.add(p.platform as GroupPlatform)
      }
      for (const p of Object.keys(channel.model_mapping || {})) {
        if (PLATFORM_ORDER.includes(p as GroupPlatform)) activePlatformSet.add(p as GroupPlatform)
      }

      const sections: PlatformSection[] = []
      for (const platform of PLATFORM_ORDER) {
        if (!activePlatformSet.has(platform)) continue

        const groupIds = (channel.group_ids || []).filter(
          (gid) => groupPlatformMap.get(gid) === platform,
        )
        const mapping = (channel.model_mapping || {})[platform] || {}
        const pricing = (channel.model_pricing || [])
          .filter((p) => (p.platform || 'anthropic') === platform)
          .map(
            (p) =>
              ({
                models: p.models || [],
                billing_mode: p.billing_mode,
                input_price: perTokenToMTok(p.input_price),
                output_price: perTokenToMTok(p.output_price),
                cache_write_price: perTokenToMTok(p.cache_write_price),
                cache_read_price: perTokenToMTok(p.cache_read_price),
                image_output_price: perTokenToMTok(p.image_output_price),
                per_request_price: p.per_request_price,
                intervals: apiIntervalsToForm(p.intervals || []),
              }) as PricingFormEntry,
          )

        const fc = channel.features_config
        const wsEmulation = fc?.web_search_emulation as Record<string, boolean> | undefined
        const codexBridge = fc?.codex_image_generation_bridge as Record<string, boolean> | undefined
        const bedrockCompat = fc?.bedrock_cc_compat as Record<string, boolean> | undefined

        sections.push({
          platform,
          enabled: true,
          collapsed: false,
          group_ids: groupIds,
          model_mapping: { ...mapping },
          model_pricing: pricing,
          web_search_emulation: wsEmulation?.[platform] === true,
          codex_image_generation_bridge: codexBridge?.[platform] === true,
          bedrock_cc_compat: bedrockCompat?.[platform] === true,
          account_stats_pricing_rules: [],
        })
      }

      return sections
    },
    [],
  )

  const distributeRulesToPlatforms = useCallback(
    (apiRules: AccountStatsPricingRule[], groups: AdminGroup[], platforms: PlatformSection[]) => {
      const groupPlatformMap = new Map<number, GroupPlatform>()
      for (const g of groups) {
        groupPlatformMap.set(g.id, g.platform)
      }

      const nextPlatforms = platforms.map((section) => ({
        ...section,
        account_stats_pricing_rules: [...section.account_stats_pricing_rules],
      }))

      for (const apiRule of apiRules) {
        const platformSet = new Set<GroupPlatform>()
        for (const gid of apiRule.group_ids || []) {
          const p = groupPlatformMap.get(gid)
          if (p) platformSet.add(p)
        }
        if (platformSet.size === 0 && apiRule.pricing?.length > 0) {
          const p = apiRule.pricing[0].platform as GroupPlatform | undefined
          if (p) platformSet.add(p)
        }
        const targetPlatform = platformSet.size >= 1 ? [...platformSet][0] : null
        if (!targetPlatform) continue

        const sectionIdx = nextPlatforms.findIndex((s) => s.platform === targetPlatform)
        if (sectionIdx < 0) continue

        nextPlatforms[sectionIdx].account_stats_pricing_rules.push({
          name: apiRule.name || '',
          group_ids: [...(apiRule.group_ids || [])],
          account_ids: [...(apiRule.account_ids || [])],
          pricing: (apiRule.pricing || []).map(
            (p) =>
              ({
                models: [...(p.models || [])],
                billing_mode: p.billing_mode,
                input_price: perTokenToMTok(p.input_price),
                output_price: perTokenToMTok(p.output_price),
                cache_write_price: perTokenToMTok(p.cache_write_price),
                cache_read_price: perTokenToMTok(p.cache_read_price),
                image_output_price: perTokenToMTok(p.image_output_price),
                per_request_price: p.per_request_price,
                intervals: apiIntervalsToForm(p.intervals || []),
              }) as PricingFormEntry,
          ),
        })
      }

      return nextPlatforms
    },
    [],
  )

  const populateRuleAccountNameCache = useCallback(async (platforms: PlatformSection[]) => {
    const allAccountIds = new Set<number>()
    for (const section of platforms) {
      for (const rule of section.account_stats_pricing_rules) {
        for (const id of rule.account_ids) {
          allAccountIds.add(id)
        }
      }
    }
    if (allAccountIds.size === 0) return {}

    const ids = [...allAccountIds]
    const results = await Promise.allSettled(ids.map((id) => adminAccountsAPI.getById(id)))
    const cache: Record<number, string> = {}
    for (let i = 0; i < ids.length; i++) {
      const result = results[i]
      if (result.status === 'fulfilled') {
        cache[ids[i]] = result.value.name
      }
    }
    return cache
  }, [])

  const resetForm = useCallback(() => {
    setForm(createEmptyForm())
    setActiveTab('basic')
    ruleAccountSearchRunner.clearAll()
    clearAllRuleAccountSearchState()
    setRuleAccountNameCache({})
  }, [clearAllRuleAccountSearchState, ruleAccountSearchRunner])

  const formToAPI = useCallback(
    (
      formState: ChannelFormState,
      editing: Channel | null,
    ): {
      group_ids: number[]
      model_pricing: ChannelModelPricing[]
      model_mapping: Record<string, Record<string, string>>
      features_config: Record<string, unknown>
    } => {
      const group_ids: number[] = []
      const model_pricing: ChannelModelPricing[] = []
      const model_mapping: Record<string, Record<string, string>> = {}
      const featuresConfig: Record<string, unknown> = editing?.features_config
        ? { ...editing.features_config }
        : {}

      for (const section of formState.platforms) {
        if (!section.enabled) continue
        group_ids.push(...section.group_ids)

        if (Object.keys(section.model_mapping).length > 0) {
          model_mapping[section.platform] = { ...section.model_mapping }
        }

        for (const entry of section.model_pricing) {
          if (entry.models.length === 0) continue
          model_pricing.push({
            platform: section.platform,
            models: entry.models,
            billing_mode: entry.billing_mode,
            input_price: mTokToPerToken(entry.input_price),
            output_price: mTokToPerToken(entry.output_price),
            cache_write_price: mTokToPerToken(entry.cache_write_price),
            cache_read_price: mTokToPerToken(entry.cache_read_price),
            image_output_price: mTokToPerToken(entry.image_output_price),
            per_request_price:
              entry.per_request_price != null && entry.per_request_price !== ''
                ? Number(entry.per_request_price)
                : null,
            intervals: formIntervalsToAPI(entry.intervals || []),
          })
        }
      }

      const wsEmulation: Record<string, boolean> = {}
      for (const section of formState.platforms) {
        if (!section.enabled) continue
        if (section.platform === 'anthropic') {
          wsEmulation[section.platform] = !!section.web_search_emulation
        }
      }
      if (Object.keys(wsEmulation).length > 0) {
        featuresConfig.web_search_emulation = wsEmulation
      } else {
        delete featuresConfig.web_search_emulation
      }

      const codexImageGenerationBridge: Record<string, boolean> = {}
      for (const section of formState.platforms) {
        if (!section.enabled) continue
        if (section.platform === 'openai') {
          codexImageGenerationBridge[section.platform] = !!section.codex_image_generation_bridge
        }
      }
      if (Object.keys(codexImageGenerationBridge).length > 0) {
        featuresConfig.codex_image_generation_bridge = codexImageGenerationBridge
      } else {
        delete featuresConfig.codex_image_generation_bridge
      }

      const bedrockCCCompat: Record<string, boolean> = {}
      for (const section of formState.platforms) {
        if (!section.enabled) continue
        if (section.platform === 'anthropic') {
          bedrockCCCompat[section.platform] = !!section.bedrock_cc_compat
        }
      }
      if (Object.keys(bedrockCCCompat).length > 0) {
        featuresConfig.bedrock_cc_compat = bedrockCCCompat
      } else {
        delete featuresConfig.bedrock_cc_compat
      }

      return { group_ids, model_pricing, model_mapping, features_config: featuresConfig }
    },
    [],
  )

  const accountStatsRulesToAPI = useCallback(
    (formState: ChannelFormState): AccountStatsPricingRule[] => {
      const rules: AccountStatsPricingRule[] = []
      for (const section of formState.platforms) {
        if (!section.enabled) continue
        for (const rule of section.account_stats_pricing_rules) {
          rules.push({
            name: rule.name,
            group_ids: rule.group_ids,
            account_ids: rule.account_ids,
            pricing: rule.pricing
              .filter((p) => p.models.length > 0)
              .map((p) => ({
                platform: section.platform,
                models: p.models,
                billing_mode: p.billing_mode,
                input_price: mTokToPerToken(p.input_price),
                output_price: mTokToPerToken(p.output_price),
                cache_write_price: mTokToPerToken(p.cache_write_price),
                cache_read_price: mTokToPerToken(p.cache_read_price),
                image_output_price: mTokToPerToken(p.image_output_price),
                per_request_price:
                  p.per_request_price != null && p.per_request_price !== ''
                    ? Number(p.per_request_price)
                    : null,
                intervals: formIntervalsToAPI(p.intervals || []),
              })),
          })
        }
      }
      return rules
    },
    [],
  )

  useEffect(() => {
    loadChannels()
  }, [loadChannels])

  useEffect(() => {
    loadGroups()
    loadWebSearchGlobalState()
  }, [loadGroups, loadWebSearchGlobalState])

  useEffect(() => {
    const handleRuleAccountClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.rule-account-search-container')) {
        setShowRuleAccountDropdown({})
      }
    }
    document.addEventListener('click', handleRuleAccountClickOutside)
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      abortControllerRef.current?.abort()
      document.removeEventListener('click', handleRuleAccountClickOutside)
      ruleAccountSearchRunner.clearAll()
      clearAllRuleAccountSearchState()
    }
  }, [clearAllRuleAccountSearchState, ruleAccountSearchRunner])

  const handleSearch = useCallback(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setPagination((prev) => ({ ...prev, page: 1 }))
    }, 300)
  }, [])

  const togglePlatform = useCallback(
    (platform: GroupPlatform) => {
      setForm((prev) => {
        const section = prev.platforms.find((s) => s.platform === platform)
        if (section) {
          const enabled = !section.enabled
          if (!enabled && activeTab === platform) {
            setActiveTab('basic')
          }
          return {
            ...prev,
            platforms: prev.platforms.map((s) =>
              s.platform === platform ? { ...s, enabled } : s,
            ),
          }
        }
        return { ...prev, platforms: addPlatformSection(prev.platforms, platform) }
      })
    },
    [activeTab],
  )

  const toggleGroupInSection = useCallback((sectionIdx: number, groupId: number) => {
    updatePlatformSection(sectionIdx, (section) => {
      const idx = section.group_ids.indexOf(groupId)
      const group_ids =
        idx >= 0
          ? section.group_ids.filter((id) => id !== groupId)
          : [...section.group_ids, groupId]
      return { ...section, group_ids }
    })
  }, [updatePlatformSection])

  const addPricingEntry = useCallback((sectionIdx: number) => {
    updatePlatformSection(sectionIdx, (section) => ({
      ...section,
      model_pricing: [...section.model_pricing, EMPTY_PRICING_ENTRY()],
    }))
  }, [updatePlatformSection])

  const syncLatestModels = useCallback(
    async (sectionIdx: number) => {
      const platform = form.platforms[sectionIdx]?.platform
      if (!platform || syncingPlatform) return
      setSyncingPlatform(platform)
      try {
        const result = await adminChannelsAPI.syncPricingModels(platform)
        const existingModels = new Set<string>()
        for (const entry of form.platforms[sectionIdx].model_pricing) {
          for (const m of entry.models) existingModels.add(m)
        }
        const newModels = result.models.filter((m) => !existingModels.has(m))
        if (newModels.length === 0) {
          appStore.showSuccess(t('admin.channels.form.syncModelsAlreadyUpToDate'))
          return
        }
        updatePlatformSection(sectionIdx, (section) => ({
          ...section,
          model_pricing: [
            ...section.model_pricing,
            { ...EMPTY_PRICING_ENTRY(), models: newModels },
          ],
        }))
        appStore.showSuccess(t('admin.channels.form.syncModelsSuccess', { count: newModels.length }))
      } catch (error) {
        appStore.showError(
          extractApiErrorMessage(error, t('admin.channels.form.syncModelsError')),
        )
      } finally {
        setSyncingPlatform(null)
      }
    },
    [appStore, form.platforms, syncingPlatform, t, updatePlatformSection],
  )

  const addMappingEntry = useCallback((sectionIdx: number) => {
    updatePlatformSection(sectionIdx, (section) => {
      const mapping = { ...section.model_mapping }
      let key = ''
      let i = 1
      while (key === '' || key in mapping) {
        key = `model-${i}`
        i++
      }
      mapping[key] = ''
      return { ...section, model_mapping: mapping }
    })
  }, [updatePlatformSection])

  const removeMappingEntry = useCallback((sectionIdx: number, key: string) => {
    updatePlatformSection(sectionIdx, (section) => {
      const mapping = { ...section.model_mapping }
      delete mapping[key]
      return { ...section, model_mapping: mapping }
    })
  }, [updatePlatformSection])

  const renameMappingKey = useCallback(
    (sectionIdx: number, oldKey: string, newKey: string) => {
      const trimmed = newKey.trim()
      if (!trimmed || trimmed === oldKey) return
      updatePlatformSection(sectionIdx, (section) => {
        if (trimmed in section.model_mapping) return section
        const mapping = { ...section.model_mapping }
        const value = mapping[oldKey]
        delete mapping[oldKey]
        mapping[trimmed] = value
        return { ...section, model_mapping: mapping }
      })
    },
    [updatePlatformSection],
  )

  const addAccountStatsRule = useCallback((sectionIdx: number) => {
    updatePlatformSection(sectionIdx, (section) => ({
      ...section,
      account_stats_pricing_rules: [
        ...section.account_stats_pricing_rules,
        { name: '', group_ids: [], account_ids: [], pricing: [] },
      ],
    }))
  }, [updatePlatformSection])

  const removeAccountStatsRule = useCallback(
    (sectionIdx: number, ruleIndex: number) => {
      updatePlatformSection(sectionIdx, (section) => ({
        ...section,
        account_stats_pricing_rules: section.account_stats_pricing_rules.filter(
          (_, idx) => idx !== ruleIndex,
        ),
      }))
      ruleAccountSearchRunner.clearAll()
      clearAllRuleAccountSearchState()
    },
    [clearAllRuleAccountSearchState, ruleAccountSearchRunner, updatePlatformSection],
  )

  const onRuleAccountSearchInput = useCallback(
    (platform: string, ruleIndex: number) => {
      const key = `${platform}-${ruleIndex}`
      setShowRuleAccountDropdown((prev) => ({ ...prev, [key]: true }))
      ruleAccountSearchRunner.trigger(key, ruleAccountSearchKeyword[key] || '')
    },
    [ruleAccountSearchKeyword, ruleAccountSearchRunner],
  )

  const onRuleAccountSearchFocus = useCallback(
    (platform: string, ruleIndex: number) => {
      const key = `${platform}-${ruleIndex}`
      setShowRuleAccountDropdown((prev) => ({ ...prev, [key]: true }))
      if (!ruleAccountSearchResults[key]?.length) {
        ruleAccountSearchRunner.trigger(key, ruleAccountSearchKeyword[key] || '')
      }
    },
    [ruleAccountSearchKeyword, ruleAccountSearchResults, ruleAccountSearchRunner],
  )

  const selectRuleAccount = useCallback(
    (
      sectionIdx: number,
      ruleIndex: number,
      account: SimpleAccount,
      platform: string,
    ) => {
      updatePlatformSection(sectionIdx, (section) => ({
        ...section,
        account_stats_pricing_rules: section.account_stats_pricing_rules.map((rule, idx) =>
          idx === ruleIndex && !rule.account_ids.includes(account.id)
            ? { ...rule, account_ids: [...rule.account_ids, account.id] }
            : rule,
        ),
      }))
      setRuleAccountNameCache((prev) => ({ ...prev, [account.id]: account.name }))
      const key = `${platform}-${ruleIndex}`
      setRuleAccountSearchKeyword((prev) => ({ ...prev, [key]: '' }))
      setShowRuleAccountDropdown((prev) => ({ ...prev, [key]: false }))
    },
    [updatePlatformSection],
  )

  const removeRuleAccount = useCallback(
    (sectionIdx: number, ruleIndex: number, accountId: number) => {
      updatePlatformSection(sectionIdx, (section) => ({
        ...section,
        account_stats_pricing_rules: section.account_stats_pricing_rules.map((rule, idx) =>
          idx === ruleIndex
            ? { ...rule, account_ids: rule.account_ids.filter((id) => id !== accountId) }
            : rule,
        ),
      }))
    },
    [updatePlatformSection],
  )

  const openCreateDialog = useCallback(async () => {
    setEditingChannel(null)
    resetForm()
    await Promise.all([loadGroups(), loadAllChannelsForConflict()])
    setShowDialog(true)
  }, [loadAllChannelsForConflict, loadGroups, resetForm])

  const openEditDialog = useCallback(
    async (channel: Channel) => {
      setEditingChannel(channel)
      await Promise.all([loadGroups(), loadAllChannelsForConflict()])
      const groups = await adminGroupsAPI.getAll()
      let platforms = apiToForm(channel, groups)
      platforms = distributeRulesToPlatforms(channel.account_stats_pricing_rules || [], groups, platforms)
      const cache = await populateRuleAccountNameCache(platforms)
      setRuleAccountNameCache(cache)
      setForm({
        name: channel.name,
        description: channel.description || '',
        status: channel.status,
        restrict_models: channel.restrict_models || false,
        billing_model_source: channel.billing_model_source || 'channel_mapped',
        platforms,
        apply_pricing_to_account_stats: channel.apply_pricing_to_account_stats || false,
      })
      setActiveTab('basic')
      setShowDialog(true)
    },
    [
      apiToForm,
      distributeRulesToPlatforms,
      loadAllChannelsForConflict,
      loadGroups,
      populateRuleAccountNameCache,
    ],
  )

  const closeDialog = useCallback(() => {
    setShowDialog(false)
    setEditingChannel(null)
    resetForm()
  }, [resetForm])

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (submitting) return
      if (!form.name.trim()) {
        appStore.showError(t('admin.channels.nameRequired', 'Please enter a channel name'))
        return
      }

      for (const section of form.platforms.filter((s) => s.enabled)) {
        if (section.group_ids.length === 0) {
          const platformLabel = t('admin.groups.platforms.' + section.platform, section.platform)
          appStore.showError(
            t('admin.channels.noGroupsSelected', { platform: platformLabel }),
          )
          setActiveTab(section.platform)
          return
        }
        for (const entry of section.model_pricing) {
          if (entry.models.length === 0) {
            const platformLabel = t('admin.groups.platforms.' + section.platform, section.platform)
            appStore.showError(
              t('admin.channels.emptyModelsInPricing', { platform: platformLabel }),
            )
            setActiveTab(section.platform)
            return
          }
        }
      }

      for (const section of form.platforms.filter((s) => s.enabled)) {
        const allModels: string[] = []
        for (const entry of section.model_pricing) {
          allModels.push(...entry.models)
        }
        const pricingConflict = findModelConflict(allModels)
        if (pricingConflict) {
          appStore.showError(
            t('admin.channels.modelConflict', {
              model1: pricingConflict[0],
              model2: pricingConflict[1],
            }),
          )
          setActiveTab(section.platform)
          return
        }
        const mappingKeys = Object.keys(section.model_mapping)
        if (mappingKeys.length > 0) {
          const mappingConflict = findModelConflict(mappingKeys)
          if (mappingConflict) {
            appStore.showError(
              t('admin.channels.mappingConflict', {
                model1: mappingConflict[0],
                model2: mappingConflict[1],
              }),
            )
            setActiveTab(section.platform)
            return
          }
        }
      }

      for (const section of form.platforms.filter((s) => s.enabled)) {
        for (const entry of section.model_pricing) {
          if (entry.models.length === 0) continue
          if (
            (entry.billing_mode === 'per_request' || entry.billing_mode === 'image') &&
            (entry.per_request_price == null || entry.per_request_price === '') &&
            (!entry.intervals || entry.intervals.length === 0)
          ) {
            appStore.showError(
              t(
                'admin.channels.form.perRequestPriceRequired',
                '按次/图片计费模式必须设置默认价格或至少一个计费层级',
              ),
            )
            return
          }
        }
      }

      for (const section of form.platforms.filter((s) => s.enabled)) {
        for (const entry of section.model_pricing) {
          if (!entry.intervals || entry.intervals.length === 0) continue
          const intervalErr = validateIntervals(entry.intervals, entry.billing_mode)
          if (intervalErr) {
            const platformLabel = t('admin.groups.platforms.' + section.platform, section.platform)
            const modelLabel = entry.models.join(', ') || t('admin.channels.form.unnamed')
            appStore.showError(`${platformLabel} - ${modelLabel}: ${intervalErr}`)
            setActiveTab(section.platform)
            return
          }
        }
      }

      const { group_ids, model_pricing, model_mapping, features_config } = formToAPI(
        form,
        editingChannel,
      )

      setSubmitting(true)
      try {
        if (editingChannel) {
          const req: UpdateChannelRequest = {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            status: form.status,
            group_ids,
            model_pricing,
            model_mapping: Object.keys(model_mapping).length > 0 ? model_mapping : {},
            billing_model_source: form.billing_model_source,
            restrict_models: form.restrict_models,
            features_config,
            apply_pricing_to_account_stats: form.apply_pricing_to_account_stats,
            account_stats_pricing_rules: accountStatsRulesToAPI(form),
          }
          await adminChannelsAPI.update(editingChannel.id, req)
          appStore.showSuccess(t('admin.channels.updateSuccess', 'Channel updated'))
        } else {
          const req: CreateChannelRequest = {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            group_ids,
            model_pricing,
            model_mapping: Object.keys(model_mapping).length > 0 ? model_mapping : {},
            billing_model_source: form.billing_model_source,
            restrict_models: form.restrict_models,
            features_config,
            apply_pricing_to_account_stats: form.apply_pricing_to_account_stats,
            account_stats_pricing_rules: accountStatsRulesToAPI(form),
          }
          await adminChannelsAPI.create(req)
          appStore.showSuccess(t('admin.channels.createSuccess', 'Channel created'))
        }
        closeDialog()
        loadChannels()
      } catch (error) {
        appStore.showError(
          extractApiErrorMessage(
            error,
            editingChannel
              ? t('admin.channels.updateError', 'Failed to update channel')
              : t('admin.channels.createError', 'Failed to create channel'),
          ),
        )
      } finally {
        setSubmitting(false)
      }
    },
    [
      accountStatsRulesToAPI,
      appStore,
      closeDialog,
      editingChannel,
      form,
      formToAPI,
      loadChannels,
      submitting,
      t,
    ],
  )

  const toggleChannelStatus = useCallback(
    async (channel: Channel) => {
      const newStatus = channel.status === 'active' ? 'disabled' : 'active'
      try {
        await adminChannelsAPI.update(channel.id, { status: newStatus })
        if (filters.status && filters.status !== newStatus) {
          await loadChannels()
        } else {
          setChannels((prev) =>
            prev.map((row) => (row.id === channel.id ? { ...row, status: newStatus } : row)),
          )
        }
      } catch (error) {
        appStore.showError(t('admin.channels.updateError', 'Failed to update channel'))
        console.error('Error toggling channel status:', error)
      }
    },
    [appStore, filters.status, loadChannels, t],
  )

  const handleDelete = useCallback((channel: Channel) => {
    setDeletingChannel(channel)
    setShowDeleteDialog(true)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deletingChannel) return
    try {
      await adminChannelsAPI.remove(deletingChannel.id)
      appStore.showSuccess(t('admin.channels.deleteSuccess', 'Channel deleted'))
      setShowDeleteDialog(false)
      setDeletingChannel(null)
      loadChannels()
    } catch (error) {
      appStore.showError(
        extractApiErrorMessage(error, t('admin.channels.deleteError', 'Failed to delete channel')),
      )
    }
  }, [appStore, deletingChannel, loadChannels, t])

  const tableCells = useMemo(
    () => ({
      name: ({ value }: DataTableCellContext) => (
        <span className="font-medium text-gray-900 dark:text-white">{value}</span>
      ),
      description: ({ value }: DataTableCellContext) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{value || '-'}</span>
      ),
      status: ({ row }: DataTableCellContext) => (
        <Toggle
          modelValue={(row as Channel).status === 'active'}
          onUpdateModelValue={() => toggleChannelStatus(row as Channel)}
        />
      ),
      group_count: ({ row }: DataTableCellContext) => (
        <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-dark-600 dark:text-gray-300">
          {((row as Channel).group_ids || []).length} {t('admin.channels.groupsUnit', 'groups')}
        </span>
      ),
      pricing_count: ({ row }: DataTableCellContext) => (
        <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-dark-600 dark:text-gray-300">
          {((row as Channel).model_pricing || []).length}{' '}
          {t('admin.channels.pricingUnit', 'pricing rules')}
        </span>
      ),
      created_at: ({ value }: DataTableCellContext) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {formatDateOnly(value)}
        </span>
      ),
      actions: ({ row }: DataTableCellContext) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => openEditDialog(row as Channel)}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-dark-700 dark:hover:text-primary-400"
          >
            <Icon name="edit" size="sm" />
            <span className="text-xs">{t('common.edit', 'Edit')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleDelete(row as Channel)}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          >
            <Icon name="trash" size="sm" />
            <span className="text-xs">{t('common.delete', 'Delete')}</span>
          </button>
        </div>
      ),
    }),
    [handleDelete, openEditDialog, t, toggleChannelStatus],
  )

  const renderPlatformTabContent = (section: PlatformSection, sIdx: number) => {
    if (!section.enabled || activeTab !== section.platform) return null

    return (
      <div key={`tab-${section.platform}`} className="space-y-4">
        <div>
          <label className="input-label text-xs">
            {t('admin.channels.form.groups', 'Associated Groups')}{' '}
            <span className="text-red-500">*</span>
            {section.group_ids.length > 0 ? (
              <span className="ml-1 font-normal text-gray-400">
                (
                {t('admin.channels.form.selectedCount', {
                  count: section.group_ids.length,
                })}
                )
              </span>
            ) : null}
          </label>
          <div className="max-h-40 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-dark-600 dark:bg-dark-900">
            {groupsLoading ? (
              <div className="py-2 text-center text-xs text-gray-500">
                {t('common.loading', 'Loading...')}
              </div>
            ) : getGroupsForPlatform(section.platform).length === 0 ? (
              <div className="py-2 text-center text-xs text-gray-500">
                {t('admin.channels.form.noGroupsAvailable', 'No groups available')}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {getGroupsForPlatform(section.platform).map((group) => (
                  <label
                    key={group.id}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-xs transition-colors hover:bg-gray-50 dark:border-dark-600 dark:hover:bg-dark-700 ${
                      section.group_ids.includes(group.id)
                        ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20'
                        : ''
                    } ${isGroupInOtherChannel(group.id) ? 'opacity-40' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={section.group_ids.includes(group.id)}
                      disabled={isGroupInOtherChannel(group.id)}
                      className="h-3 w-3 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      onChange={() => toggleGroupInSection(sIdx, group.id)}
                    />
                    <span className={`font-medium ${platformTextClass(group.platform)}`}>
                      {group.name}
                    </span>
                    <span
                      className={`rounded-full px-1 py-0 text-[10px] ${platformBadgeLightClass(group.platform)}`}
                    >
                      {group.rate_multiplier}x
                    </span>
                    <span className="text-[10px] text-gray-400">{group.account_count || 0}</span>
                    {isGroupInOtherChannel(group.id) ? (
                      <span className="text-[10px] text-gray-400">
                        {getGroupInOtherChannelLabel(group.id)}
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {section.platform === 'anthropic' && webSearchGlobalEnabled ? (
          <div className="border-t border-gray-200 pt-3 dark:border-dark-600">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.channels.form.webSearchEmulation')}
                </label>
                <p className="mt-0.5 text-[11px] text-red-500 dark:text-red-400">
                  {t('admin.channels.form.webSearchEmulationHint')}
                </p>
              </div>
              <Toggle
                modelValue={section.web_search_emulation}
                onUpdateModelValue={(value) =>
                  updatePlatformSection(sIdx, (s) => ({ ...s, web_search_emulation: value }))
                }
              />
            </div>
          </div>
        ) : null}

        {section.platform === 'openai' ? (
          <div className="border-t border-gray-200 pt-3 dark:border-dark-600">
            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.channels.form.codexImageGenerationBridge')}
                </label>
                <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                  {t('admin.channels.form.codexImageGenerationBridgeHint')}
                </p>
              </div>
              <Toggle
                modelValue={section.codex_image_generation_bridge}
                onUpdateModelValue={(value) =>
                  updatePlatformSection(sIdx, (s) => ({
                    ...s,
                    codex_image_generation_bridge: value,
                  }))
                }
              />
            </div>
          </div>
        ) : null}

        {section.platform === 'anthropic' ? (
          <div className="border-t border-gray-200 pt-3 dark:border-dark-600">
            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.channels.form.bedrockCCCompat')}
                </label>
                <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                  {t('admin.channels.form.bedrockCCCompatHint')}
                </p>
              </div>
              <Toggle
                modelValue={section.bedrock_cc_compat}
                onUpdateModelValue={(value) =>
                  updatePlatformSection(sIdx, (s) => ({ ...s, bedrock_cc_compat: value }))
                }
              />
            </div>
          </div>
        ) : null}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="input-label mb-0 text-xs">
              {t('admin.channels.form.modelMapping', 'Model Mapping')}
            </label>
            <button
              type="button"
              onClick={() => addMappingEntry(sIdx)}
              className="text-xs text-primary-600 hover:text-primary-700"
            >
              + {t('common.add', 'Add')}
            </button>
          </div>
          {Object.keys(section.model_mapping).length === 0 ? (
            <div className="rounded border border-dashed border-gray-300 p-2 text-center text-xs text-gray-400 dark:border-dark-500">
              {t(
                'admin.channels.form.noMappingRules',
                'No mapping rules. Click "Add" to create one.',
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {Object.keys(section.model_mapping).map((srcModel) => (
                <div key={srcModel} className="flex items-center gap-2">
                  <input
                    defaultValue={srcModel}
                    type="text"
                    className={`input flex-1 text-xs ${platformTextClass(section.platform)}`}
                    placeholder={t('admin.channels.form.mappingSource', 'Source model')}
                    onBlur={(event) =>
                      renameMappingKey(sIdx, srcModel, event.target.value)
                    }
                  />
                  <span className="text-xs text-gray-400">→</span>
                  <input
                    value={section.model_mapping[srcModel]}
                    type="text"
                    className={`input flex-1 text-xs ${platformTextClass(section.platform)}`}
                    placeholder={t('admin.channels.form.mappingTarget', 'Target model')}
                    onChange={(event) =>
                      updatePlatformSection(sIdx, (s) => ({
                        ...s,
                        model_mapping: {
                          ...s.model_mapping,
                          [srcModel]: event.target.value,
                        },
                      }))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => removeMappingEntry(sIdx, srcModel)}
                    className="rounded p-0.5 text-gray-400 hover:text-red-500"
                  >
                    <Icon name="trash" size="sm" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="input-label mb-0 text-xs">
              {t('admin.channels.form.modelPricing', 'Model Pricing')}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => syncLatestModels(sIdx)}
                disabled={syncingPlatform === section.platform}
                className="text-xs text-gray-500 hover:text-primary-600 disabled:opacity-50"
              >
                {syncingPlatform === section.platform
                  ? t('admin.channels.form.syncingModels')
                  : t('admin.channels.form.syncLatestModels')}
              </button>
              <button
                type="button"
                onClick={() => addPricingEntry(sIdx)}
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                + {t('common.add', 'Add')}
              </button>
            </div>
          </div>
          {section.model_pricing.length === 0 ? (
            <div className="rounded border border-dashed border-gray-300 p-2 text-center text-xs text-gray-400 dark:border-dark-500">
              {t(
                'admin.channels.form.noPricingRules',
                'No pricing rules yet. Click "Add" to create one.',
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {section.model_pricing.map((entry, idx) => (
                <PricingEntryCard
                  key={idx}
                  entry={entry}
                  platform={section.platform}
                  onUpdate={(updated) =>
                    updatePlatformSection(sIdx, (s) => ({
                      ...s,
                      model_pricing: s.model_pricing.map((item, i) =>
                        i === idx ? updated : item,
                      ),
                    }))
                  }
                  onRemove={() =>
                    updatePlatformSection(sIdx, (s) => ({
                      ...s,
                      model_pricing: s.model_pricing.filter((_, i) => i !== idx),
                    }))
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-dark-700">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('admin.channels.form.accountStatsPricingRules')}
            </h4>
            <button
              type="button"
              onClick={() => addAccountStatsRule(sIdx)}
              className="rounded-lg border border-primary-300 px-3 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:border-primary-600 dark:text-primary-400 dark:hover:bg-primary-900/20"
            >
              + {t('admin.channels.form.addRule')}
            </button>
          </div>

          {section.account_stats_pricing_rules.length === 0 ? (
            <p className="text-xs italic text-gray-400 dark:text-gray-500">
              {t('admin.channels.form.noRulesConfigured')}
            </p>
          ) : null}

          {section.account_stats_pricing_rules.map((rule, ruleIndex) => {
            const searchKey = `${section.platform}-${ruleIndex}`
            return (
              <div
                key={ruleIndex}
                className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-dark-600"
              >
                <div className="flex items-center justify-between">
                  <input
                    value={rule.name}
                    placeholder={t('admin.channels.form.ruleName')}
                    className="bg-transparent text-sm font-medium text-gray-700 placeholder-gray-400 outline-none dark:text-gray-300"
                    onChange={(event) =>
                      updatePlatformSection(sIdx, (s) => ({
                        ...s,
                        account_stats_pricing_rules: s.account_stats_pricing_rules.map(
                          (item, idx) =>
                            idx === ruleIndex ? { ...item, name: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => removeAccountStatsRule(sIdx, ruleIndex)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    {t('common.delete')}
                  </button>
                </div>

                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">
                    {t('admin.channels.form.ruleGroups')}
                  </label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {section.group_ids.map((gid) => (
                      <label
                        key={gid}
                        className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                          rule.group_ids.includes(gid)
                            ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20'
                            : 'border-gray-200 hover:bg-gray-50 dark:border-dark-600 dark:hover:bg-dark-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={rule.group_ids.includes(gid)}
                          className="h-3 w-3 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          onChange={() =>
                            updatePlatformSection(sIdx, (s) => ({
                              ...s,
                              account_stats_pricing_rules: s.account_stats_pricing_rules.map(
                                (item, idx) => {
                                  if (idx !== ruleIndex) return item
                                  const has = item.group_ids.includes(gid)
                                  return {
                                    ...item,
                                    group_ids: has
                                      ? item.group_ids.filter((id) => id !== gid)
                                      : [...item.group_ids, gid],
                                  }
                                },
                              ),
                            }))
                          }
                        />
                        <span className={`font-medium ${platformTextClass(section.platform)}`}>
                          {getGroupNameById(gid)}
                        </span>
                      </label>
                    ))}
                  </div>
                  {section.group_ids.length === 0 ? (
                    <p className="mt-1 text-xs text-gray-400">
                      {t('admin.channels.form.noGroupsInChannel')}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">
                    {t('admin.channels.form.ruleAccounts')}
                  </label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {rule.account_ids.map((accountId) => (
                      <span
                        key={accountId}
                        className="inline-flex items-center gap-1 rounded-md border border-primary-300 bg-primary-50 px-2 py-0.5 text-xs dark:border-primary-700 dark:bg-primary-900/20"
                      >
                        <span className={`font-medium ${platformTextClass(section.platform)}`}>
                          {getRuleAccountLabel(accountId)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeRuleAccount(sIdx, ruleIndex, accountId)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <Icon name="x" size="xs" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="rule-account-search-container relative mt-1">
                    <input
                      value={ruleAccountSearchKeyword[searchKey] || ''}
                      type="text"
                      className="input text-sm"
                      placeholder={t('admin.channels.form.searchAccountPlaceholder')}
                      onChange={(event) => {
                        setRuleAccountSearchKeyword((prev) => ({
                          ...prev,
                          [searchKey]: event.target.value,
                        }))
                        onRuleAccountSearchInput(section.platform, ruleIndex)
                      }}
                      onFocus={() => onRuleAccountSearchFocus(section.platform, ruleIndex)}
                    />
                    {showRuleAccountDropdown[searchKey] &&
                    (ruleAccountSearchResults[searchKey]?.length ?? 0) > 0 ? (
                      <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-white shadow-lg dark:border-dark-600 dark:bg-dark-800">
                        {ruleAccountSearchResults[searchKey]?.map((account) => (
                          <button
                            key={account.id}
                            type="button"
                            disabled={rule.account_ids.includes(account.id)}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-dark-700 ${
                              rule.account_ids.includes(account.id) ? 'opacity-50' : ''
                            }`}
                            onClick={() =>
                              selectRuleAccount(sIdx, ruleIndex, account, section.platform)
                            }
                          >
                            <span className={platformTextClass(account.platform)}>
                              {account.name}
                            </span>
                            <span className="ml-2 text-xs text-gray-400">#{account.id}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {t('admin.channels.form.ruleAccountsHint')}
                  </p>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.channels.form.ruleModelPricing')}
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        updatePlatformSection(sIdx, (s) => ({
                          ...s,
                          account_stats_pricing_rules: s.account_stats_pricing_rules.map(
                            (item, idx) =>
                              idx === ruleIndex
                                ? {
                                    ...item,
                                    pricing: [...item.pricing, EMPTY_PRICING_ENTRY()],
                                  }
                                : item,
                          ),
                        }))
                      }
                      className="text-xs text-primary-600 hover:text-primary-700"
                    >
                      + {t('common.add')}
                    </button>
                  </div>
                  {rule.pricing.length === 0 ? (
                    <div className="rounded border border-dashed border-gray-300 p-2 text-center text-xs text-gray-400 dark:border-dark-500">
                      {t('admin.channels.form.noPricingRules')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rule.pricing.map((entry, pIdx) => (
                        <PricingEntryCard
                          key={pIdx}
                          entry={entry}
                          platform={section.platform}
                          onUpdate={(updated) =>
                            updatePlatformSection(sIdx, (s) => ({
                              ...s,
                              account_stats_pricing_rules: s.account_stats_pricing_rules.map(
                                (item, idx) =>
                                  idx === ruleIndex
                                    ? {
                                        ...item,
                                        pricing: item.pricing.map((p, i) =>
                                          i === pIdx ? updated : p,
                                        ),
                                      }
                                    : item,
                              ),
                            }))
                          }
                          onRemove={() =>
                            updatePlatformSection(sIdx, (s) => ({
                              ...s,
                              account_stats_pricing_rules: s.account_stats_pricing_rules.map(
                                (item, idx) =>
                                  idx === ruleIndex
                                    ? {
                                        ...item,
                                        pricing: item.pricing.filter((_, i) => i !== pIdx),
                                      }
                                    : item,
                              ),
                            }))
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <AppLayout>
      <TablePageLayout
        filters={
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Icon
                  name="search"
                  size="md"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                />
                <input
                  value={searchQuery}
                  type="text"
                  placeholder={t('admin.channels.searchChannels', 'Search channels...')}
                  className="input pl-10"
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                    handleSearch()
                  }}
                />
              </div>
              <Select
                modelValue={filters.status}
                options={statusFilterOptions}
                placeholder={t('admin.channels.allStatus', 'All Status')}
                className="w-40"
                onUpdateModelValue={(value) => {
                  setFilters({ status: String(value ?? '') })
                  setPagination((prev) => ({ ...prev, page: 1 }))
                }}
              />
            </div>
            <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-3 lg:w-auto">
              <button
                type="button"
                onClick={() => loadChannels()}
                disabled={loading}
                className="btn btn-secondary"
                title={t('common.refresh', 'Refresh')}
              >
                <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
              </button>
              <button type="button" onClick={openCreateDialog} className="btn btn-primary">
                <Icon name="plus" size="md" className="mr-2" />
                {t('admin.channels.createChannel', 'Create Channel')}
              </button>
            </div>
          </div>
        }
        table={
          <DataTable
            columns={columns}
            data={channels}
            loading={loading}
            serverSideSort
            defaultSortKey="created_at"
            defaultSortOrder="desc"
            onSort={(key, order) => {
              setSortState({ sort_by: key, sort_order: order })
              setPagination((prev) => ({ ...prev, page: 1 }))
            }}
            cells={tableCells}
            emptySlot={
              <EmptyState
                title={t('admin.channels.noChannelsYet', 'No Channels Yet')}
                description={t(
                  'admin.channels.createFirstChannel',
                  'Create your first channel to manage model pricing',
                )}
                actionText={t('admin.channels.createChannel', 'Create Channel')}
                onAction={openCreateDialog}
              />
            }
          />
        }
        pagination={
          pagination.total > 0 ? (
            <Pagination
              page={pagination.page}
              total={pagination.total}
              pageSize={pagination.page_size}
              onUpdatePage={(page) => setPagination((prev) => ({ ...prev, page }))}
              onUpdatePageSize={(pageSize) =>
                setPagination((prev) => ({ ...prev, page_size: pageSize, page: 1 }))
              }
            />
          ) : null
        }
      />

      <BaseDialog
        show={showDialog}
        title={
          editingChannel
            ? t('admin.channels.editChannel', 'Edit Channel')
            : t('admin.channels.createChannel', 'Create Channel')
        }
        width="extra-wide"
        onClose={closeDialog}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={closeDialog} className="btn btn-secondary">
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              form="channel-form"
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting
                ? t('common.submitting', 'Submitting...')
                : editingChannel
                  ? t('common.update', 'Update')
                  : t('common.create', 'Create')}
            </button>
          </div>
        }
      >
        <div className="channel-dialog-body">
          <div className="-mx-4 flex flex-shrink-0 items-center border-b border-gray-200 px-4 dark:border-dark-700 sm:-mx-6 sm:px-6 -mt-3 sm:-mt-4">
            <button
              type="button"
              onClick={() => setActiveTab('basic')}
              className={`channel-tab ${activeTab === 'basic' ? 'channel-tab-active' : 'channel-tab-inactive'}`}
            >
              {t('admin.channels.form.basicSettings', '基础设置')}
            </button>
            {form.platforms
              .filter((s) => s.enabled)
              .map((section) => (
                <button
                  key={section.platform}
                  type="button"
                  onClick={() => setActiveTab(section.platform)}
                  className={`channel-tab group ${activeTab === section.platform ? 'channel-tab-active' : 'channel-tab-inactive'}`}
                >
                  <span className={platformTextClass(section.platform)}>
                    <PlatformIcon platform={section.platform} size="xs" />
                  </span>
                  <span className={platformTextClass(section.platform)}>
                    {t('admin.groups.platforms.' + section.platform, section.platform)}
                  </span>
                </button>
              ))}
          </div>

          <form id="channel-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto pt-4">
            {activeTab === 'basic' ? (
              <div className="space-y-5">
                <div>
                  <label className="input-label">
                    {t('admin.channels.form.name', 'Name')}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.name}
                    type="text"
                    required
                    className="input"
                    placeholder={t('admin.channels.form.namePlaceholder', 'Enter channel name')}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>

                <div>
                  <label className="input-label">
                    {t('admin.channels.form.description', 'Description')}
                  </label>
                  <textarea
                    value={form.description}
                    rows={2}
                    className="input"
                    placeholder={t(
                      'admin.channels.form.descriptionPlaceholder',
                      'Optional description',
                    )}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                </div>

                {editingChannel ? (
                  <div>
                    <label className="input-label">
                      {t('admin.channels.form.status', 'Status')}
                    </label>
                    <Select
                      modelValue={form.status}
                      options={statusEditOptions}
                      onUpdateModelValue={(value) =>
                        setForm((prev) => ({ ...prev, status: String(value ?? 'active') }))
                      }
                    />
                  </div>
                ) : null}

                <div>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.restrict_models}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, restrict_models: event.target.checked }))
                      }
                    />
                    <span className="input-label mb-0">
                      {t('admin.channels.form.restrictModels', 'Restrict Models')}
                    </span>
                  </label>
                  <p className="ml-6 mt-1 text-xs text-gray-400">
                    {t(
                      'admin.channels.form.restrictModelsHint',
                      'When enabled, only models in the pricing list are allowed. Others will be rejected.',
                    )}
                  </p>
                </div>

                <div>
                  <label className="input-label">
                    {t('admin.channels.form.billingModelSource', 'Billing Basis')}
                  </label>
                  <Select
                    modelValue={form.billing_model_source}
                    options={billingModelSourceOptions}
                    onUpdateModelValue={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        billing_model_source: String(value ?? 'channel_mapped'),
                      }))
                    }
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    {t(
                      'admin.channels.form.billingModelSourceHint',
                      'Controls which model name is used for pricing lookup',
                    )}
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="input-label mb-0">
                    {t('admin.channels.form.platformConfig', '平台配置')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORM_ORDER.map((p) => (
                      <label
                        key={p}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                          activePlatforms.includes(p)
                            ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20'
                            : 'border-gray-200 hover:bg-gray-50 dark:border-dark-600 dark:hover:bg-dark-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={activePlatforms.includes(p)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          onChange={() => togglePlatform(p)}
                        />
                        <span className={platformTextClass(p)}>
                          <PlatformIcon platform={p} size="xs" />
                        </span>
                        <span className={platformTextClass(p)}>
                          {t('admin.groups.platforms.' + p, p)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4 dark:border-dark-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('admin.channels.form.applyPricingToAccountStats')}
                      </label>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {t('admin.channels.form.applyPricingToAccountStatsDesc')}
                      </p>
                    </div>
                    <Toggle
                      modelValue={form.apply_pricing_to_account_stats}
                      onUpdateModelValue={(value) =>
                        setForm((prev) => ({ ...prev, apply_pricing_to_account_stats: value }))
                      }
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {form.platforms.map((section, sIdx) => renderPlatformTabContent(section, sIdx))}
          </form>
        </div>
      </BaseDialog>

      <ConfirmDialog
        show={showDeleteDialog}
        title={t('admin.channels.deleteChannel', 'Delete Channel')}
        message={deleteConfirmMessage}
        confirmText={t('common.delete', 'Delete')}
        cancelText={t('common.cancel', 'Cancel')}
        danger
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </AppLayout>
  )
}
