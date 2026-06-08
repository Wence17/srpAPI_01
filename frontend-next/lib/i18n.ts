export function getLocale(): string {
  if (typeof window === 'undefined') {
    return 'en-US'
  }

  return navigator.language || navigator.languages?.[0] || 'en-US'
}
