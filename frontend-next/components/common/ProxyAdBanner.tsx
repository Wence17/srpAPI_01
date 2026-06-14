'use client'

import Icon from '@/components/icons/Icon'
import { useI18n } from '@/lib/i18n'

export default function ProxyAdBanner() {
  const { t } = useI18n()

  return (
    <a
      className="inline-flex max-w-full shrink-0 items-center gap-1 truncate text-xs font-normal text-primary-600 transition-colors hover:underline focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 dark:text-primary-400 dark:focus:ring-offset-dark-800"
      href="https://bestproxy.com/?keyword=a2e8iuol"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="truncate">{t('admin.proxies.ad.inline')}</span>
      <Icon name="externalLink" size="xs" />
    </a>
  )
}
