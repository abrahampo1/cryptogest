import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock i18n before importing the module
vi.mock('@/i18n', () => ({
  default: {
    language: 'es',
    t: (key: string, opts?: any) => {
      const translations: Record<string, string> = {
        'errors:generic': 'Ha ocurrido un error',
        'errors:notFound': 'Registro no encontrado',
        'errors:passwordIncorrect': 'Contraseña incorrecta',
      }
      // If defaultValue is '' and key is not found, return ''
      if (opts?.defaultValue === '' && !translations[key]) {
        return ''
      }
      return translations[key] || key
    },
  },
}))

import { formatCurrency, formatDate, formatDateTime, formatDateLong, translateError } from '../formatting'
import i18n from '@/i18n'

describe('formatCurrency', () => {
  beforeEach(() => {
    (i18n as any).language = 'es'
  })

  it('formats positive amounts in EUR (es locale)', () => {
    const result = formatCurrency(1234.56)
    // Spanish locale uses comma as decimal separator
    expect(result).toContain('1234,56')
    expect(result).toContain('€')
  })

  it('formats zero', () => {
    const result = formatCurrency(0)
    expect(result).toContain('0,00')
    expect(result).toContain('€')
  })

  it('formats negative amounts', () => {
    const result = formatCurrency(-500.00)
    expect(result).toContain('500,00')
    expect(result).toContain('€')
  })

  it('formats large amounts with thousands separators', () => {
    const result = formatCurrency(1000000)
    expect(result).toContain('€')
    // Should contain dots as thousands separators in Spanish locale
    expect(result).toContain('1.000.000,00')
  })

  it('uses en-GB locale when language is en', () => {
    (i18n as any).language = 'en'
    const result = formatCurrency(1234.56)
    expect(result).toContain('€')
    // en-GB formats as €1,234.56
    expect(result).toContain('1,234.56')
  })

  it('uses fr-FR locale when language is fr', () => {
    (i18n as any).language = 'fr'
    const result = formatCurrency(1234.56)
    expect(result).toContain('€')
  })

  it('falls back to es-ES for unknown language', () => {
    (i18n as any).language = 'de'
    const result = formatCurrency(1234.56)
    expect(result).toContain('€')
    // Fallback to es-ES - comma as decimal separator
    expect(result).toContain('1234,56')
  })

  it('always shows 2 decimal places', () => {
    const result = formatCurrency(100)
    expect(result).toContain('100,00')
  })
})

describe('formatDate', () => {
  beforeEach(() => {
    (i18n as any).language = 'es'
  })

  it('formats a Date object', () => {
    const result = formatDate(new Date(2026, 0, 15)) // Jan 15, 2026
    expect(result).toBe('15/01/2026')
  })

  it('formats an ISO string', () => {
    const result = formatDate('2026-06-20T00:00:00.000Z')
    expect(result).toMatch(/20\/06\/2026/)
  })

  it('uses 2-digit day and month', () => {
    const result = formatDate(new Date(2026, 0, 5)) // Jan 5
    expect(result).toMatch(/05\/01\/2026/)
  })

  it('formats date with en-GB locale', () => {
    (i18n as any).language = 'en'
    const result = formatDate(new Date(2026, 0, 15))
    expect(result).toBe('15/01/2026')
  })
})

describe('formatDateTime', () => {
  beforeEach(() => {
    (i18n as any).language = 'es'
  })

  it('includes date and time', () => {
    const date = new Date(2026, 5, 15, 14, 30)
    const result = formatDateTime(date)
    expect(result).toContain('15/06/2026')
    expect(result).toContain('14:30')
  })

  it('formats from string input', () => {
    const result = formatDateTime('2026-03-10T09:15:00')
    expect(result).toContain('10/03/2026')
  })
})

describe('formatDateLong', () => {
  beforeEach(() => {
    (i18n as any).language = 'es'
  })

  it('formats date in long format (Spanish)', () => {
    const result = formatDateLong(new Date(2026, 0, 15))
    // "15 de enero de 2026" in Spanish
    expect(result).toContain('15')
    expect(result).toContain('2026')
    expect(result.toLowerCase()).toContain('enero')
  })

  it('formats date in long format (English)', () => {
    (i18n as any).language = 'en'
    const result = formatDateLong(new Date(2026, 0, 15))
    expect(result).toContain('15')
    expect(result).toContain('2026')
    expect(result.toLowerCase()).toContain('january')
  })

  it('formats date in long format (French)', () => {
    (i18n as any).language = 'fr'
    const result = formatDateLong(new Date(2026, 0, 15))
    expect(result).toContain('15')
    expect(result).toContain('2026')
    expect(result.toLowerCase()).toContain('janvier')
  })
})

describe('translateError', () => {
  it('returns generic error for undefined', () => {
    const result = translateError(undefined)
    expect(result).toBe('Ha ocurrido un error')
  })

  it('returns generic error for empty string', () => {
    const result = translateError('')
    expect(result).toBe('Ha ocurrido un error')
  })

  it('translates known error keys', () => {
    expect(translateError('notFound')).toBe('Registro no encontrado')
    expect(translateError('passwordIncorrect')).toBe('Contraseña incorrecta')
  })

  it('returns raw string for unknown error keys', () => {
    const result = translateError('some_unknown_error_message')
    expect(result).toBe('some_unknown_error_message')
  })
})
