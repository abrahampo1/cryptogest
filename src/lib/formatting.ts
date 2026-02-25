import i18n from '@/i18n'

const localeMap: Record<string, string> = {
  es: 'es-ES',
  en: 'en-GB',
  fr: 'fr-FR',
}

function getLocale(): string {
  return localeMap[i18n.language] || 'es-ES'
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(getLocale(), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(getLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleDateString(getLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateLong(date: Date | string): string {
  return new Date(date).toLocaleDateString(getLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Translates a backend error string. Tries the errors namespace first,
 * then returns the raw string as fallback (for untranslated or system errors).
 */
export function translateError(error: string | undefined, params?: Record<string, string | number>): string {
  if (!error) return i18n.t('errors:generic')
  const translated = i18n.t(`errors:${error}`, { ...params, defaultValue: '' })
  if (translated) return translated
  return error
}
