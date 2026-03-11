import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory filesystem
let mockFs: Record<string, string | Buffer> = {}

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
      if (encoding === 'utf-8') {
        const val = mockFs[p]
        return typeof val === 'string' ? val : val.toString('utf-8')
      }
      const val = mockFs[p]
      return typeof val === 'string' ? Buffer.from(val) : val
    },
    writeFileSync: (p: string, data: any) => {
      mockFs[p] = typeof data === 'string' ? data : (Buffer.isBuffer(data) ? data : Buffer.from(data))
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
  setupPassword,
  verifyPassword,
  getEncryptionKey,
  deriveKey,
  encrypt,
  decrypt,
  isAuthConfigured,
  getAuthConfig,
  setActiveEmpresa,
  changePassword,
  createEmpresa,
  renameEmpresa,
  deleteEmpresaData,
  updateEmpresaDataPath,
  loadEmpresasConfig,
  getActiveEmpresa,
  createCloudEmpresa,
  updateEmpresaCloudConfig,
} from '../crypto'

describe('Password setup and verification', () => {
  beforeEach(() => {
    mockFs = {}
    setActiveEmpresa(null)
  })

  it('sets up a password and creates auth config', () => {
    const result = setupPassword('mypassword123')
    expect(result.success).toBe(true)
    expect(isAuthConfigured()).toBe(true)
  })

  it('rejects password shorter than 4 characters', () => {
    const result = setupPassword('abc')
    expect(result.success).toBe(false)
    expect(result.error).toBe('passwordMinLength')
  })

  it('verifies correct password', () => {
    setupPassword('testpass')
    expect(verifyPassword('testpass')).toBe(true)
  })

  it('rejects incorrect password', () => {
    setupPassword('testpass')
    expect(verifyPassword('wrongpass')).toBe(false)
  })

  it('verifyPassword returns false when no auth configured', () => {
    expect(verifyPassword('anypass')).toBe(false)
  })

  it('getAuthConfig returns valid config after setup', () => {
    setupPassword('testpass')
    const config = getAuthConfig()
    expect(config).not.toBeNull()
    expect(config!.salt).toBeDefined()
    expect(config!.passwordHash).toBeDefined()
    expect(config!.verificationSalt).toBeDefined()
    expect(config!.createdAt).toBeDefined()
  })
})

describe('Encryption key derivation', () => {
  beforeEach(() => {
    mockFs = {}
    setActiveEmpresa(null)
  })

  it('getEncryptionKey returns null when no auth configured', () => {
    expect(getEncryptionKey('anypass')).toBeNull()
  })

  it('getEncryptionKey returns a 32-byte buffer after setup', () => {
    setupPassword('testpass')
    const key = getEncryptionKey('testpass')
    expect(key).not.toBeNull()
    expect(key!.length).toBe(32)
  })

  it('getEncryptionKey returns same key for same password', () => {
    setupPassword('testpass')
    const key1 = getEncryptionKey('testpass')
    const key2 = getEncryptionKey('testpass')
    expect(key1!.equals(key2!)).toBe(true)
  })
})

describe('Full encrypt/decrypt flow with auth', () => {
  beforeEach(() => {
    mockFs = {}
    setActiveEmpresa(null)
  })

  it('encrypts and decrypts data using auth-derived key', () => {
    setupPassword('mypassword')
    const key = getEncryptionKey('mypassword')!
    const original = Buffer.from('Secret data for empresa')
    const encrypted = encrypt(original, key)
    const decrypted = decrypt(encrypted, key)
    expect(decrypted.toString()).toBe('Secret data for empresa')
  })
})

describe('createEmpresa', () => {
  beforeEach(() => {
    mockFs = {}
    setActiveEmpresa(null)
  })

  it('creates a new empresa with default data path', () => {
    const empresa = createEmpresa('Mi Empresa S.L.')
    expect(empresa.id).toBe('test-uuid-1234')
    expect(empresa.nombre).toBe('Mi Empresa S.L.')
    expect(empresa.dataPath).toBeNull()
    expect(empresa.creadaEn).toBeDefined()
  })

  it('creates a new empresa with custom data path', () => {
    const empresa = createEmpresa('Test Corp', '/custom/dir')
    // path.join uses OS-specific separators
    expect(empresa.dataPath).toContain('custom')
    expect(empresa.dataPath).toContain('dir')
    expect(empresa.dataPath).toContain('Test Corp')
  })

  it('sanitizes empresa name in custom path', () => {
    const empresa = createEmpresa('Test <Corp> "2026"', '/custom/dir')
    // Special chars should be replaced with _
    expect(empresa.dataPath).not.toContain('<')
    expect(empresa.dataPath).not.toContain('>')
    expect(empresa.dataPath).not.toContain('"')
  })

  it('adds empresa to config and sets as ultima', () => {
    createEmpresa('First Corp')
    const config = loadEmpresasConfig()
    expect(config.empresas).toHaveLength(1)
    expect(config.ultimaEmpresaId).toBe('test-uuid-1234')
  })
})

describe('createCloudEmpresa', () => {
  beforeEach(() => {
    mockFs = {}
    setActiveEmpresa(null)
  })

  it('creates a cloud empresa with correct tipo', () => {
    const cloudConfig = {
      empresaId: 1,
      userId: 1,
      role: 'admin',
      salt: 'abc123',
      verificationHash: 'hash123',
    }
    const empresa = createCloudEmpresa('Cloud Corp', cloudConfig)
    expect(empresa.tipo).toBe('cloud')
    expect(empresa.cloudConfig).toEqual(cloudConfig)
    expect(empresa.dataPath).toBeNull()
  })
})

describe('renameEmpresa', () => {
  beforeEach(() => {
    mockFs = {}
    setActiveEmpresa(null)
  })

  it('renames an existing empresa', () => {
    createEmpresa('Old Name')
    renameEmpresa('test-uuid-1234', 'New Name')
    const config = loadEmpresasConfig()
    expect(config.empresas[0].nombre).toBe('New Name')
  })

  it('does nothing for non-existent empresa', () => {
    createEmpresa('Test')
    renameEmpresa('non-existent-id', 'New Name')
    const config = loadEmpresasConfig()
    expect(config.empresas[0].nombre).toBe('Test')
  })
})

describe('deleteEmpresaData', () => {
  beforeEach(() => {
    mockFs = {}
    setActiveEmpresa(null)
  })

  it('deletes an existing empresa', () => {
    createEmpresa('To Delete')
    const result = deleteEmpresaData('test-uuid-1234')
    expect(result.success).toBe(true)
    const config = loadEmpresasConfig()
    expect(config.empresas).toHaveLength(0)
    expect(config.ultimaEmpresaId).toBeNull()
  })

  it('returns error for non-existent empresa', () => {
    const result = deleteEmpresaData('non-existent')
    expect(result.success).toBe(false)
    expect(result.error).toBe('notFound')
  })
})

describe('updateEmpresaDataPath', () => {
  beforeEach(() => {
    mockFs = {}
    setActiveEmpresa(null)
  })

  it('updates data path for existing empresa', () => {
    createEmpresa('Test Corp')
    updateEmpresaDataPath('test-uuid-1234', '/new/path')
    const config = loadEmpresasConfig()
    expect(config.empresas[0].dataPath).toBe('/new/path')
  })

  it('updates active empresa path if it matches', () => {
    const empresa = createEmpresa('Active Corp')
    setActiveEmpresa(empresa)
    updateEmpresaDataPath('test-uuid-1234', '/updated/path')
    expect(getActiveEmpresa()!.dataPath).toBe('/updated/path')
  })
})

describe('updateEmpresaCloudConfig', () => {
  beforeEach(() => {
    mockFs = {}
    setActiveEmpresa(null)
  })

  it('updates cloud config for cloud empresa', () => {
    const cloudConfig = {
      empresaId: 1,
      userId: 1,
      role: 'admin',
      salt: 'abc',
      verificationHash: 'hash',
    }
    createCloudEmpresa('Cloud Corp', cloudConfig)
    const newConfig = { ...cloudConfig, role: 'editor' }
    updateEmpresaCloudConfig('test-uuid-1234', newConfig)
    const loaded = loadEmpresasConfig()
    expect(loaded.empresas[0].cloudConfig!.role).toBe('editor')
  })

  it('does not update config for local empresa', () => {
    createEmpresa('Local Corp')
    const cloudConfig = {
      empresaId: 1,
      userId: 1,
      role: 'admin',
      salt: 'abc',
      verificationHash: 'hash',
    }
    updateEmpresaCloudConfig('test-uuid-1234', cloudConfig)
    const loaded = loadEmpresasConfig()
    // Local empresa should not get cloudConfig since tipo is not 'cloud'
    expect(loaded.empresas[0].cloudConfig).toBeUndefined()
  })
})

describe('changePassword', () => {
  beforeEach(() => {
    mockFs = {}
    setActiveEmpresa(null)
  })

  it('rejects when current password is wrong', () => {
    setupPassword('original')
    const result = changePassword('wrongpass', 'newpass')
    expect(result.success).toBe(false)
    expect(result.error).toBe('passwordIncorrect')
  })

  it('changes password successfully', () => {
    setupPassword('original')
    const result = changePassword('original', 'newpassword')
    expect(result.success).toBe(true)
    // Old password should no longer work
    expect(verifyPassword('original')).toBe(false)
    // New password should work
    expect(verifyPassword('newpassword')).toBe(true)
  })
})
