'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import userChannelsAPI, { type UserAvailableChannel } from '@/lib/channels'
import userGroupsAPI from '@/lib/groups'
import { extractApiErrorMessage } from '@/lib/apiError'
import AppLayout from '@/components/layout/AppLayout'
import TablePageLayout from '@/components/layout/TablePageLayout'
import Icon from '@/components/icons/Icon'
import AvailableChannelsTable from '@/components/channels/AvailableChannelsTable'

export default function AvailableChannelsPage() {
  const { t } = useI18n()
  const appStore = useApp()

  const [channels, setChannels] = useState<UserAvailableChannel[]>([])
  const [userGroupRates, setUserGroupRates] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const columnLabels = useMemo(
    () => ({
      name: t('availableChannels.columns.name'),
      description: t('availableChannels.columns.description'),
      platform: t('availableChannels.columns.platform'),
      groups: t('availableChannels.columns.groups'),
      supportedModels: t('availableChannels.columns.supportedModels'),
    }),
    [t],
  )

  /**
   * 搜索过滤：
   * - 命中渠道名/描述 → 整个渠道（所有 platforms）都保留
   * - 否则按 platform/group/model 维度在 sections 里过滤，保留有匹配的 section
   * - 所有 sections 都不匹配时，渠道本身被过滤掉
   */
  const filteredChannels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return channels
    return channels
      .map((ch) => {
        const nameHit = ch.name.toLowerCase().includes(q)
        const descHit = (ch.description || '').toLowerCase().includes(q)
        if (nameHit || descHit) return ch
        const matchingSections = ch.platforms.filter(
          (p) =>
            p.platform.toLowerCase().includes(q) ||
            p.groups.some((g) => g.name.toLowerCase().includes(q)) ||
            p.supported_models.some((m) => m.name.toLowerCase().includes(q)),
        )
        if (matchingSections.length === 0) return null
        return { ...ch, platforms: matchingSections }
      })
      .filter((ch): ch is UserAvailableChannel => ch !== null)
  }, [channels, searchQuery])

  const loadChannels = useCallback(async () => {
    setLoading(true)
    try {
      // 渠道列表和用户专属倍率并发拉取。专属倍率失败不阻塞渠道展示——
      // 失败时只是无法渲染专属倍率角标，降级为仅显示默认倍率。
      const [list, rates] = await Promise.all([
        userChannelsAPI.getAvailable(),
        userGroupsAPI.getUserGroupRates().catch((err: unknown) => {
          console.error('Failed to load user group rates:', err)
          return {} as Record<number, number>
        }),
      ])
      setChannels(list)
      setUserGroupRates(rates)
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    } finally {
      setLoading(false)
    }
  }, [appStore, t])

  useEffect(() => {
    void loadChannels()
  }, [loadChannels])

  return (
    <AppLayout>
      <TablePageLayout
        filters={
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-80">
                <Icon
                  name="search"
                  size="md"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  type="text"
                  placeholder={t('availableChannels.searchPlaceholder')}
                  className="input pl-10"
                />
              </div>
            </div>

            <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-3 lg:w-auto">
              <button
                type="button"
                onClick={() => void loadChannels()}
                disabled={loading}
                className="btn btn-secondary"
                title={t('common.refresh', 'Refresh')}
              >
                <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        }
        table={
          <AvailableChannelsTable
            columns={columnLabels}
            rows={filteredChannels}
            loading={loading}
            userGroupRates={userGroupRates}
            pricingKeyPrefix="availableChannels.pricing"
            noPricingLabel={t('availableChannels.noPricing')}
            noModelsLabel={t('availableChannels.noModels')}
            emptyLabel={t('availableChannels.empty')}
          />
        }
      />
    </AppLayout>
  )
}
