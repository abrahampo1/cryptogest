import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'

// Mock electron modules before importing
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

// Mock fs to avoid touching real filesystem
const mockFs: Record<string, any> = {}
vi.mock('fs', () => ({
  default: {
    existsSync: (p: string) => p in mockFs,
    readFileSync: (p: string, encoding?: string) => {
      if (!(p in mockFs)) throw new Error(`ENOENT: ${p}`)
      return encoding ? mockFs[p] : Buffer.from(mockFs[p])
    },
    writeFileSync: (p: string, data: any) => { mockFs[p] = typeof data === 'string' ? data : data.toString() },
    mkdirSync: () => {},
    unlinkSync: (p: string) => { delete mockFs[p] },
    rmSync: () => {},
    statSync: () => ({ isDirectory: () => true }),
    readdirSync: () => [],
    copyFileSync: () => {},
  },
}))

import { deriveKey, encrypt, decrypt } from '../crypto'

describe('deriveKey', () => {
  it('derives a 32-byte key from password and salt', () => {
    const salt = crypto.randomBytes(32)
    const key = deriveKey('mypassword', salt)
    expect(key).toBeInstanceOf(Buffer)
    expect(key.length).toBe(32)
  })

  it('produces the same key for the same password and salt', () => {
    const salt = crypto.randomBytes(32)
    const key1 = deriveKey('mypassword', salt)
    const key2 = deriveKey('mypassword', salt)
    expect(key1.equals(key2)).toBe(true)
  })

  it('produces different keys for different passwords', () => {
    const salt = crypto.randomBytes(32)
    const key1 = deriveKey('password1', salt)
    const key2 = deriveKey('password2', salt)
    expect(key1.equals(key2)).toBe(false)
  })

  it('produces different keys for different salts', () => {
    const salt1 = crypto.randomBytes(32)
    const salt2 = crypto.randomBytes(32)
    const key1 = deriveKey('mypassword', salt1)
    const key2 = deriveKey('mypassword', salt2)
    expect(key1.equals(key2)).toBe(false)
  })

  it('handles empty password', () => {
    const salt = crypto.randomBytes(32)
    const key = deriveKey('', salt)
    expect(key.length).toBe(32)
  })

  it('handles unicode password', () => {
    const salt = crypto.randomBytes(32)
    const key = deriveKey('contraseña123🔐', salt)
    expect(key.length).toBe(32)
  })

  it('handles very long password', () => {
    const salt = crypto.randomBytes(32)
    const longPassword = 'a'.repeat(10000)
    const key = deriveKey(longPassword, salt)
    expect(key.length).toBe(32)
  })
})

describe('encrypt / decrypt', () => {
  const key = crypto.randomBytes(32)

  it('encrypts and decrypts data correctly', () => {
    const data = Buffer.from('Hello, World!')
    const encrypted = encrypt(data, key)
    const decrypted = decrypt(encrypted, key)
    expect(decrypted.toString()).toBe('Hello, World!')
  })

  it('encrypted data is different from original', () => {
    const data = Buffer.from('Sensitive data')
    const encrypted = encrypt(data, key)
    expect(encrypted.equals(data)).toBe(false)
  })

  it('encrypted format: IV (16) + AuthTag (16) + data', () => {
    const data = Buffer.from('Test')
    const encrypted = encrypt(data, key)
    // Minimum size: 16 (IV) + 16 (AuthTag) + encrypted data
    expect(encrypted.length).toBeGreaterThanOrEqual(32)
  })

  it('produces different ciphertext each time (random IV)', () => {
    const data = Buffer.from('Same data')
    const enc1 = encrypt(data, key)
    const enc2 = encrypt(data, key)
    expect(enc1.equals(enc2)).toBe(false)
  })

  it('decrypt fails with wrong key', () => {
    const data = Buffer.from('Secret')
    const encrypted = encrypt(data, key)
    const wrongKey = crypto.randomBytes(32)
    expect(() => decrypt(encrypted, wrongKey)).toThrow()
  })

  it('decrypt fails with tampered data', () => {
    const data = Buffer.from('Important data')
    const encrypted = encrypt(data, key)
    // Tamper with encrypted data (modify a byte in the data section)
    const tampered = Buffer.from(encrypted)
    tampered[tampered.length - 1] ^= 0xFF
    expect(() => decrypt(tampered, tampered.length > 32 ? key : key)).toThrow()
  })

  it('handles empty data', () => {
    const data = Buffer.alloc(0)
    const encrypted = encrypt(data, key)
    const decrypted = decrypt(encrypted, key)
    expect(decrypted.length).toBe(0)
  })

  it('handles large data', () => {
    const data = crypto.randomBytes(1024 * 1024) // 1MB
    const encrypted = encrypt(data, key)
    const decrypted = decrypt(encrypted, key)
    expect(decrypted.equals(data)).toBe(true)
  })

  it('handles binary data', () => {
    const data = Buffer.from([0x00, 0xFF, 0x01, 0xFE, 0x80, 0x7F])
    const encrypted = encrypt(data, key)
    const decrypted = decrypt(encrypted, key)
    expect(decrypted.equals(data)).toBe(true)
  })

  it('handles UTF-8 text data', () => {
    const data = Buffer.from('Texto con acentos: ñ á é í ó ú 🔒')
    const encrypted = encrypt(data, key)
    const decrypted = decrypt(encrypted, key)
    expect(decrypted.toString('utf-8')).toBe('Texto con acentos: ñ á é í ó ú 🔒')
  })
})

describe('encrypt/decrypt with derived key', () => {
  it('full flow: derive key, encrypt, decrypt', () => {
    const password = 'my-secure-password'
    const salt = crypto.randomBytes(32)
    const key = deriveKey(password, salt)

    const original = Buffer.from('Database content here')
    const encrypted = encrypt(original, key)

    // Derive the same key again
    const key2 = deriveKey(password, salt)
    const decrypted = decrypt(encrypted, key2)

    expect(decrypted.toString()).toBe('Database content here')
  })

  it('fails decryption with wrong password', () => {
    const salt = crypto.randomBytes(32)
    const key1 = deriveKey('correct-password', salt)
    const key2 = deriveKey('wrong-password', salt)

    const data = Buffer.from('Encrypted content')
    const encrypted = encrypt(data, key1)

    expect(() => decrypt(encrypted, key2)).toThrow()
  })
})
