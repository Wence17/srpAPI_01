'use client'

import { useI18n } from '@/lib/i18n'
import Icon from '@/components/icons/Icon'
import PlatformIcon from '@/components/common/PlatformIcon'
import GroupBadge from '@/components/keys/GroupBadge'
import SupportedModelChip from './SupportedModelChip'
import type {
  UserAvailableChannel,
  UserAvailableGroup,
  UserChannelPlatformSection,
} from '@/lib/channels'
import type { GroupPlatform, SubscriptionType } from '@/lib/types'
import { platformBadgeClass } from '@/lib/platformColors'

interface AvailableChannelsTableProps {
  columns: {
    name: string
    description: string
    platform: string
    groups: string
    supportedModels: string
  }
  rows: UserAvailableChannel[]
  loading: boolean
  pricingKeyPrefix: string
  noPricingLabel: string
  noModelsLabel: string
  emptyLabel: string
  /** 用户专属倍率（group_id → multiplier）；无专属时由 GroupBadge 仅显示默认倍率。 */
  userGroupRates: Record<number, number>
}

function exclusiveGroups(section: UserChannelPlatformSection): UserAvailableGroup[] {
  return section.groups.filter((g) => g.is_exclusive)
}

function publicGroups(section: UserChannelPlatformSection): UserAvailableGroup[] {
  return section.groups.filter((g) => !g.is_exclusive)
}

export default function AvailableChannelsTable({
  columns,
  rows,
  loading,
  pricingKeyPrefix,
  noPricingLabel,
  noModelsLabel,
  emptyLabel,
  userGroupRates,
}: AvailableChannelsTableProps) {
  const { t } = useI18n()

  return (
    <div className="card overflow-hidden">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50 text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-dark-700 dark:bg-dark-800/50 dark:text-gray-400">
            <th className="w-[180px] px-4 py-3 text-center">{columns.name}</th>
            <th className="w-[200px] px-4 py-3 text-left">{columns.description}</th>
            <th className="w-[140px] px-4 py-3 text-left">{columns.platform}</th>
            <th className="px-4 py-3 text-left">{columns.groups}</th>
            <th className="px-4 py-3 text-left">{columns.supportedModels}</th>
          </tr>
        </thead>
        {loading ? (
          <tbody>
            <tr>
              <td colSpan={5} className="py-10 text-center">
                <Icon name="refresh" size="lg" className="inline-block animate-spin text-gray-400" />
              </td>
            </tr>
          </tbody>
        ) : rows.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={5} className="py-12 text-center">
                <Icon name="inbox" size="xl" className="mx-auto mb-3 h-12 w-12 text-gray-400" />
                <p className="text-sm text-gray-500 dark:text-gray-400">{emptyLabel}</p>
              </td>
            </tr>
          </tbody>
        ) : (
          rows.map((channel, chIdx) => (
            <tbody
              key={`${channel.name}-${chIdx}`}
              className="border-b-2 border-gray-200 last:border-b-0 dark:border-dark-600"
            >
              {channel.platforms.map((section, secIdx) => (
                <tr
                  key={`${channel.name}-${section.platform}`}
                  className={`transition-colors hover:bg-gray-50/40 dark:hover:bg-dark-800/40${
                    secIdx > 0 ? ' border-t border-gray-100/70 dark:border-dark-700/50' : ''
                  }`}
                >
                  {secIdx === 0 ? (
                    <td
                      rowSpan={channel.platforms.length}
                      className="px-4 py-3 text-center align-middle font-medium text-gray-900 dark:text-white"
                    >
                      {channel.name}
                    </td>
                  ) : null}

                  {secIdx === 0 ? (
                    <td
                      rowSpan={channel.platforms.length}
                      className="px-4 py-3 align-middle text-xs text-gray-500 dark:text-gray-400"
                    >
                      {channel.description ? channel.description : <span className="text-gray-400">-</span>}
                    </td>
                  ) : null}

                  <td className="align-top px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase ${platformBadgeClass(section.platform)}`}
                    >
                      <PlatformIcon platform={section.platform as GroupPlatform} size="xs" />
                      {section.platform}
                    </span>
                  </td>

                  <td className="align-top px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      {exclusiveGroups(section).length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase text-purple-600 dark:text-purple-400"
                            title={t('availableChannels.exclusiveTooltip')}
                          >
                            <Icon name="shield" size="xs" className="h-3 w-3" />
                            {t('availableChannels.exclusive')}
                          </span>
                          {exclusiveGroups(section).map((g) => (
                            <GroupBadge
                              key={`ex-${g.id}`}
                              name={g.name}
                              platform={g.platform as GroupPlatform}
                              subscriptionType={(g.subscription_type || 'standard') as SubscriptionType}
                              rateMultiplier={g.rate_multiplier}
                              userRateMultiplier={userGroupRates[g.id] ?? null}
                              alwaysShowRate
                            />
                          ))}
                        </div>
                      ) : null}
                      {publicGroups(section).length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase text-gray-500 dark:text-gray-400"
                            title={t('availableChannels.publicTooltip')}
                          >
                            <Icon name="globe" size="xs" className="h-3 w-3" />
                            {t('availableChannels.public')}
                          </span>
                          {publicGroups(section).map((g) => (
                            <GroupBadge
                              key={`pub-${g.id}`}
                              name={g.name}
                              platform={g.platform as GroupPlatform}
                              subscriptionType={(g.subscription_type || 'standard') as SubscriptionType}
                              rateMultiplier={g.rate_multiplier}
                              userRateMultiplier={userGroupRates[g.id] ?? null}
                              alwaysShowRate
                            />
                          ))}
                        </div>
                      ) : null}
                      {section.groups.length === 0 ? (
                        <span className="text-xs text-gray-400">-</span>
                      ) : null}
                    </div>
                  </td>

                  <td className="align-top px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {section.supported_models.map((m) => (
                        <SupportedModelChip
                          key={`${section.platform}-${m.name}`}
                          model={m}
                          pricingKeyPrefix={pricingKeyPrefix}
                          noPricingLabel={noPricingLabel}
                          showPlatform={false}
                          platformHint={section.platform}
                        />
                      ))}
                      {section.supported_models.length === 0 ? (
                        <span className="text-xs text-gray-400">{noModelsLabel}</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          ))
        )}
      </table>
    </div>
  )
}
