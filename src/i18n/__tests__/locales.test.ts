import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const LOCALES_DIR = path.resolve(__dirname, '../locales')
const LANGUAGES = ['es', 'en', 'fr']
const NAMESPACES = [
  'common', 'sidebar', 'auth', 'dashboard', 'clientes', 'productos',
  'facturas', 'gastos', 'ejercicios', 'contabilidad', 'modelos',
  'configuracion', 'cloud', 'buzon', 'manual', 'pdf', 'errors',
]

// Namespaces that are fully translated across all languages
const FULLY_TRANSLATED_NAMESPACES = [
  'common', 'sidebar', 'auth', 'dashboard', 'clientes', 'productos',
  'facturas', 'gastos', 'ejercicios', 'contabilidad', 'modelos',
  'configuracion', 'buzon', 'pdf', 'errors',
]

function loadJson(lang: string, ns: string): Record<string, any> {
  const filePath = path.join(LOCALES_DIR, lang, `${ns}.json`)
  const content = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(content)
}

function getAllKeys(obj: Record<string, any>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getAllKeys(value, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys.sort()
}

describe('i18n locale files', () => {
  it('all languages have all namespace files', () => {
    for (const lang of LANGUAGES) {
      for (const ns of NAMESPACES) {
        const filePath = path.join(LOCALES_DIR, lang, `${ns}.json`)
        expect(fs.existsSync(filePath), `Missing ${lang}/${ns}.json`).toBe(true)
      }
    }
  })

  it('all locale files are valid JSON', () => {
    for (const lang of LANGUAGES) {
      for (const ns of NAMESPACES) {
        expect(() => loadJson(lang, ns)).not.toThrow()
      }
    }
  })

  it('all locale files are non-empty objects', () => {
    for (const lang of LANGUAGES) {
      for (const ns of NAMESPACES) {
        const data = loadJson(lang, ns)
        expect(typeof data).toBe('object')
        expect(Object.keys(data).length, `${lang}/${ns}.json is empty`).toBeGreaterThan(0)
      }
    }
  })

  describe('key consistency between languages (fully translated namespaces)', () => {
    for (const ns of FULLY_TRANSLATED_NAMESPACES) {
      it(`${ns}: en and fr have the same keys as es (reference)`, () => {
        const esKeys = getAllKeys(loadJson('es', ns))
        const enKeys = getAllKeys(loadJson('en', ns))
        const frKeys = getAllKeys(loadJson('fr', ns))

        const missingInEn = esKeys.filter(k => !enKeys.includes(k))
        expect(missingInEn, `Keys in es/${ns}.json missing from en/${ns}.json: ${missingInEn.join(', ')}`).toEqual([])

        const missingInFr = esKeys.filter(k => !frKeys.includes(k))
        expect(missingInFr, `Keys in es/${ns}.json missing from fr/${ns}.json: ${missingInFr.join(', ')}`).toEqual([])
      })
    }
  })

  describe('partially translated namespaces have base keys', () => {
    const PARTIAL_NAMESPACES = ['cloud', 'manual']

    for (const ns of PARTIAL_NAMESPACES) {
      it(`${ns}: en and fr files exist and are non-empty`, () => {
        for (const lang of ['en', 'fr']) {
          const data = loadJson(lang, ns)
          expect(Object.keys(data).length).toBeGreaterThan(0)
        }
      })
    }
  })

  describe('no empty translation values', () => {
    for (const lang of LANGUAGES) {
      it(`${lang}: no empty string values`, () => {
        const emptyKeys: string[] = []
        for (const ns of NAMESPACES) {
          const data = loadJson(lang, ns)
          const keys = getAllKeys(data)
          for (const key of keys) {
            const value = key.split('.').reduce((obj: any, k) => obj?.[k], data)
            if (value === '') {
              emptyKeys.push(`${ns}:${key}`)
            }
          }
        }
        expect(emptyKeys, `Empty values in ${lang}: ${emptyKeys.join(', ')}`).toEqual([])
      })
    }
  })
})
