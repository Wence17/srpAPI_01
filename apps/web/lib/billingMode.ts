export const BILLING_MODE_TOKEN = 'token' as const
export const BILLING_MODE_PER_REQUEST = 'per_request' as const
export const BILLING_MODE_IMAGE = 'image' as const

export type BillingMode =
  | typeof BILLING_MODE_TOKEN
  | typeof BILLING_MODE_PER_REQUEST
  | typeof BILLING_MODE_IMAGE

export function getBillingModeLabel(mode: string | null | undefined, t: (key: string) => string): string {
  switch (mode) {
    case BILLING_MODE_PER_REQUEST:
      return t('admin.usage.billingModePerRequest')
    case BILLING_MODE_IMAGE:
      return t('admin.usage.billingModeImage')
    default:
      return t('admin.usage.billingModeToken')
  }
}

export function getBillingModeBadgeClass(mode: string | null | undefined): string {
  switch (mode) {
    case BILLING_MODE_PER_REQUEST:
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
    case BILLING_MODE_IMAGE:
      return 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'
    default:
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  }
}
