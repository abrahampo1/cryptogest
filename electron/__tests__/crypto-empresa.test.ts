import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory filesystem
let mockFs: Record<string, string> = {}

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-cryptogest',
    isPackaged: false,
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  systemPreferences: {
    canPromptTouchID: () => false,
  },
}))

vi.mock('fs', () => ({
  default: {
    existsSync: (p: string) => p in mockFs,
    readFileSync: (p: string, encoding?: string) => {
      if (!(p in mockFs)) throw new Error(`ENOENT: ${p}`)
      return encoding === 'utf-8' ? mockFs[p] : Buffer.from(mockFs[p])
    },
    writeFileSync: (p: string, data: any) => {
      mockFs[p] = typeof data === 'string' ? data : data.toString()
    },
    mkdirSync: () => {},
    unlinkSync: (p: string) => { delete mockFs[p] },
    rmSync: () => {},
    statSync: () => ({ isDirectory: () => true }),
    readdirSync: () => [],
    copyFileSync: () => {},
  },
}))

vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto')
  return {
    default: {
      ...actual,
      randomUUID: () => 'test-uuid-1234',
    },
  }
})

import {
  loadEmpresasConfig,
  saveEmpresasConfig,
  getEmpresaDataPath,
  setActiveEmpresa,
  getActiveEmpresa,
  isCloudEmpresa,
  isAuthConfigured,
  getAuthConfig,
  loadCloudSession,
  saveCloudSession,
  clearCloudSession,
} from '../crypto'

import type { EmpresaInfo, EmpresasConfig, CloudSession } from '../crypto'

describe('EmpresasConfig management', () => {
  beforeEach(() => {
    mockFs = {}
    setActiveEmpresa(null)
  })

  it('returns empty config when no file exists', () => {
    const config = loadEmpresasConfig()
    expect(config.empresas).toEqual([])
    expect(config.ultimaEmpresaId).toBeNull()
  })

  it('saves and loads config', () => {
    const config: EmpresasConfig = {
      empresas: [
        {
          id: 'emp-1',
          nombre: 'Test S.L.',
          dataPath: null,
          creadaEn: '2026-01-01T00:00:00.000Z',
        },
      ],
      ultimaEmpresaId: 'emp-1',
    }
    saveEmpresasConfig(config)
    const loaded = loadEmpresasConfig()
    expect(loaded.empresas).toHaveLength(1)
    expect(loaded.empresas[0].nombre).toBe('Test S.L.')
    expect(loaded.ultimaEmpresaId).toBe('emp-1')
  })

  it('defaults tipo to "local" for older configs', () => {
    const config: EmpresasConfig = {
      empresas: [
        {
          id: 'emp-1',
          nombre: 'Old Config',
          dataPath: null,
          creadaEn: '2026-01-01',
        },
      ],
      ultimaEmpresaId: 'emp-1',
    }
    saveEmpresasConfig(config)
    const loaded = loadEmpresasConfig()
    expect(loaded.empresas[0].tipo).toBe('local')
  })

  it('returns empty config on parse error', () => {
    // Write invalid JSON
    const configPath = '/tmp/test-cryptogest/empresas.json'
    mockFs[configPath] = '{invalid json'
    const config = loadEmpresasConfig()
    expect(config.empresas).toEqual([])
  })
})

describe('getEmpresaDataPath', () => {
  it('returns custom dataPath if set', () => {
    const empresa: EmpresaInfo = {
      id: 'emp-1',
      nombre: 'Test',
      dataPath: '/custom/path',
      creadaEn: '2026-01-01',
    }
    expect(getEmpresaDataPath(empresa)).toBe('/custom/path')
  })

  it('returns default path under userData if dataPath is null', () => {
    const empresa: EmpresaInfo = {
      id: 'emp-1',
      nombre: 'Test',
      dataPath: null,
      creadaEn: '2026-01-01',
    }
    const result = getEmpresaDataPath(empresa)
    expect(result).toContain('empresas')
    expect(result).toContain('emp-1')
  })
})

describe('activeEmpresa', () => {
  beforeEach(() => {
    setActiveEmpresa(null)
  })

  it('starts as null', () => {
    expect(getActiveEmpresa()).toBeNull()
  })

  it('can be set and retrieved', () => {
    const empresa: EmpresaInfo = {
      id: 'emp-1',
      nombre: 'Active Corp',
      dataPath: null,
      creadaEn: '2026-01-01',
    }
    setActiveEmpresa(empresa)
    expect(getActiveEmpresa()).toEqual(empresa)
  })

  it('can be cleared', () => {
    setActiveEmpresa({ id: 'emp-1', nombre: 'Test', dataPath: null, creadaEn: '' })
    setActiveEmpresa(null)
    expect(getActiveEmpresa()).toBeNull()
  })
})

describe('isCloudEmpresa', () => {
  it('returns true for cloud tipo', () => {
    const empresa: EmpresaInfo = {
      id: 'emp-1',
      nombre: 'Cloud Corp',
      dataPath: null,
      creadaEn: '2026-01-01',
      tipo: 'cloud',
    }
    expect(isCloudEmpresa(empresa)).toBe(true)
  })

  it('returns false for local tipo', () => {
    const empresa: EmpresaInfo = {
      id: 'emp-1',
      nombre: 'Local Corp',
      dataPath: null,
      creadaEn: '2026-01-01',
      tipo: 'local',
    }
    expect(isCloudEmpresa(empresa)).toBe(false)
  })

  it('returns false when tipo is undefined', () => {
    const empresa: EmpresaInfo = {
      id: 'emp-1',
      nombre: 'Unknown',
      dataPath: null,
      creadaEn: '2026-01-01',
    }
    expect(isCloudEmpresa(empresa)).toBe(false)
  })
})

describe('Auth configuration', () => {
  beforeEach(() => {
    mockFs = {}
    setActiveEmpresa(null)
  })

  it('isAuthConfigured returns false when no auth file', () => {
    expect(isAuthConfigured()).toBe(false)
  })

  it('getAuthConfig returns null when no auth file', () => {
    expect(getAuthConfig()).toBeNull()
  })
})

describe('CloudSession', () => {
  beforeEach(() => {
    mockFs = {}
  })

  it('returns null when no session file exists', () => {
    expect(loadCloudSession()).toBeNull()
  })

  it('saves and loads cloud session', () => {
    const session: CloudSession = {
      serverUrl: 'https://cloud.example.com',
      token: 'abc123',
      user: { id: 1, name: 'Test User', email: 'test@example.com' },
    }
    saveCloudSession(session)
    const loaded = loadCloudSession()
    expect(loaded).not.toBeNull()
    expect(loaded!.serverUrl).toBe('https://cloud.example.com')
    expect(loaded!.token).toBe('abc123')
    expect(loaded!.user.email).toBe('test@example.com')
  })

  it('clears cloud session', () => {
    const session: CloudSession = {
      serverUrl: 'https://cloud.example.com',
      token: 'abc123',
      user: { id: 1, name: 'Test User', email: 'test@example.com' },
    }
    saveCloudSession(session)
    expect(loadCloudSession()).not.toBeNull()
    clearCloudSession()
    expect(loadCloudSession()).toBeNull()
  })

  it('returns null on corrupted session file', () => {
    const sessionPath = '/tmp/test-cryptogest/cloud-session.json'
    mockFs[sessionPath] = 'not valid json {'
    expect(loadCloudSession()).toBeNull()
  })
})
