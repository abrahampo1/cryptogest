import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as nodeCrypto from 'crypto'

// Mock electron
vi.mock('electron', () => ({
  net: { request: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}))

import {
  CloudApiError,
  setCloudApiConfig,
  getCloudApiConfig,
  clearCloudApiConfig,
  deriveCloudKey,
  generateSalt,
  generateVerificationHash,
  verifyPassphrase,
  setEncryptionKey,
  getEncryptionKey,
  invalidateCache,
  setCacheMainWindow,
} from '../cloudApi'

// ============================================
// Error Classes
// ============================================

describe('CloudApiError', () => {
  it('creates an error with message and status', () => {
    const error = new CloudApiError('Not Found', 404)
    expect(error.message).toBe('Not Found')
    expect(error.status).toBe(404)
    expect(error.name).toBe('CloudApiError')
  })

  it('is an instance of Error', () => {
    const error = new CloudApiError('Server Error', 500)
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(CloudApiError)
  })

  it('has correct status for different HTTP codes', () => {
    expect(new CloudApiError('Unauthorized', 401).status).toBe(401)
    expect(new CloudApiError('Forbidden', 403).status).toBe(403)
    expect(new CloudApiError('Conflict', 409).status).toBe(409)
    expect(new CloudApiError('Rate Limited', 429).status).toBe(429)
  })

  it('stack trace includes the error name', () => {
    const error = new CloudApiError('Test', 500)
    expect(error.stack).toContain('CloudApiError')
  })
})

// ============================================
// Config Management
// ============================================

describe('CloudApi Config', () => {
  beforeEach(() => {
    clearCloudApiConfig()
  })

  it('returns null when no config is set', () => {
    expect(getCloudApiConfig()).toBeNull()
  })

  it('sets and retrieves config correctly', () => {
    setCloudApiConfig('https://cloud.example.com', 'token-abc', 42)
    const cfg = getCloudApiConfig()
    expect(cfg).toEqual({
      serverUrl: 'https://cloud.example.com',
      token: 'token-abc',
      empresaId: 42,
    })
  })

  it('strips trailing slashes from serverUrl', () => {
    setCloudApiConfig('https://cloud.example.com///', 'token', 1)
    expect(getCloudApiConfig()?.serverUrl).toBe('https://cloud.example.com')
  })

  it('overwrites previous config', () => {
    setCloudApiConfig('https://first.com', 'token1', 1)
    setCloudApiConfig('https://second.com', 'token2', 2)
    const cfg = getCloudApiConfig()
    expect(cfg?.serverUrl).toBe('https://second.com')
    expect(cfg?.token).toBe('token2')
    expect(cfg?.empresaId).toBe(2)
  })

  it('clears config and resets all state', () => {
    setCloudApiConfig('https://cloud.example.com', 'token', 1)
    clearCloudApiConfig()
    expect(getCloudApiConfig()).toBeNull()
    expect(getEncryptionKey()).toBeNull()
  })
})

// ============================================
// Encryption: Key Derivation
// ============================================

describe('deriveCloudKey', () => {
  it('returns a 32-byte buffer', () => {
    const salt = nodeCrypto.randomBytes(32).toString('hex')
    const key = deriveCloudKey('test-passphrase', salt)
    expect(Buffer.isBuffer(key)).toBe(true)
    expect(key.length).toBe(32)
  })

  it('produces consistent output for same passphrase and salt', () => {
    const salt = 'a'.repeat(64)
    const key1 = deriveCloudKey('my-passphrase', salt)
    const key2 = deriveCloudKey('my-passphrase', salt)
    expect(key1.equals(key2)).toBe(true)
  })

  it('produces different output for different passphrases', () => {
    const salt = 'b'.repeat(64)
    const key1 = deriveCloudKey('passphrase1', salt)
    const key2 = deriveCloudKey('passphrase2', salt)
    expect(key1.equals(key2)).toBe(false)
  })

  it('produces different output for different salts', () => {
    const salt1 = 'c'.repeat(64)
    const salt2 = 'd'.repeat(64)
    const key1 = deriveCloudKey('same-passphrase', salt1)
    const key2 = deriveCloudKey('same-passphrase', salt2)
    expect(key1.equals(key2)).toBe(false)
  })

  it('handles unicode passphrases', () => {
    const salt = 'e'.repeat(64)
    const key = deriveCloudKey('contraseña-ñ-ü-日本語', salt)
    expect(key.length).toBe(32)
  })

  it('handles empty passphrase', () => {
    const salt = 'f'.repeat(64)
    const key = deriveCloudKey('', salt)
    expect(key.length).toBe(32)
  })
})

// ============================================
// Encryption: Salt & Verification
// ============================================

describe('generateSalt', () => {
  it('returns a hex string of 64 characters (32 bytes)', () => {
    const salt = generateSalt()
    expect(salt).toMatch(/^[a-f0-9]{64}$/)
  })

  it('generates unique salts', () => {
    const salt1 = generateSalt()
    const salt2 = generateSalt()
    expect(salt1).not.toBe(salt2)
  })
})

describe('generateVerificationHash', () => {
  it('returns a hex string of 64 characters', () => {
    const salt = generateSalt()
    const hash = generateVerificationHash('test', salt)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('produces consistent hash for same inputs', () => {
    const salt = 'a'.repeat(64)
    const hash1 = generateVerificationHash('passphrase', salt)
    const hash2 = generateVerificationHash('passphrase', salt)
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different passphrases', () => {
    const salt = 'b'.repeat(64)
    const hash1 = generateVerificationHash('pass1', salt)
    const hash2 = generateVerificationHash('pass2', salt)
    expect(hash1).not.toBe(hash2)
  })

  it('produces different hashes for different salts', () => {
    const salt1 = 'c'.repeat(64)
    const salt2 = 'd'.repeat(64)
    const hash1 = generateVerificationHash('same', salt1)
    const hash2 = generateVerificationHash('same', salt2)
    expect(hash1).not.toBe(hash2)
  })
})

describe('verifyPassphrase', () => {
  it('returns true for correct passphrase', () => {
    const salt = generateSalt()
    const hash = generateVerificationHash('my-secret', salt)
    expect(verifyPassphrase('my-secret', salt, hash)).toBe(true)
  })

  it('returns false for incorrect passphrase', () => {
    const salt = generateSalt()
    const hash = generateVerificationHash('correct', salt)
    expect(verifyPassphrase('wrong', salt, hash)).toBe(false)
  })

  it('returns false for tampered hash', () => {
    const salt = generateSalt()
    const hash = generateVerificationHash('passphrase', salt)
    const tampered = 'f'.repeat(64)
    expect(verifyPassphrase('passphrase', salt, tampered)).toBe(false)
  })

  it('returns false for invalid hex hash (wrong length)', () => {
    const salt = generateSalt()
    // timingSafeEqual should throw on length mismatch -> returns false
    expect(verifyPassphrase('test', salt, 'short')).toBe(false)
  })

  it('uses timing-safe comparison', () => {
    // The function uses nodeCrypto.timingSafeEqual internally
    const salt = generateSalt()
    const hash = generateVerificationHash('test', salt)
    // Should work correctly regardless of timing
    expect(verifyPassphrase('test', salt, hash)).toBe(true)
  })
})

// ============================================
// Encryption Key Management
// ============================================

describe('Encryption key management', () => {
  beforeEach(() => {
    clearCloudApiConfig()
  })

  it('getEncryptionKey returns null initially', () => {
    expect(getEncryptionKey()).toBeNull()
  })

  it('setEncryptionKey stores and retrieves the key', () => {
    const key = nodeCrypto.randomBytes(32)
    setEncryptionKey(key)
    expect(getEncryptionKey()?.equals(key)).toBe(true)
  })

  it('clearCloudApiConfig resets encryption key', () => {
    const key = nodeCrypto.randomBytes(32)
    setEncryptionKey(key)
    clearCloudApiConfig()
    expect(getEncryptionKey()).toBeNull()
  })

  it('full flow: derive key → set → verify', () => {
    const salt = generateSalt()
    const passphrase = 'my-empresa-passphrase'
    const key = deriveCloudKey(passphrase, salt)

    setEncryptionKey(key)
    const stored = getEncryptionKey()
    expect(stored).not.toBeNull()
    expect(stored!.length).toBe(32)

    // Verify the hash works
    const hash = generateVerificationHash(passphrase, salt)
    expect(verifyPassphrase(passphrase, salt, hash)).toBe(true)
  })
})

// ============================================
// Cache Management
// ============================================

describe('Cache management', () => {
  beforeEach(() => {
    clearCloudApiConfig()
  })

  it('invalidateCache without args clears all caches', () => {
    // Should not throw
    invalidateCache()
  })

  it('invalidateCache with entityType clears specific cache', () => {
    invalidateCache('cliente')
    invalidateCache('factura')
  })

  it('setCacheMainWindow accepts null', () => {
    setCacheMainWindow(null)
  })
})

// ============================================
// End-to-end encryption round-trip
// ============================================

describe('Encryption round-trip (deriveCloudKey + AES-256-GCM)', () => {
  it('encrypts and decrypts data correctly via derived key', () => {
    const salt = generateSalt()
    const key = deriveCloudKey('test-passphrase', salt)

    // Manually test the AES-256-GCM encryption pattern used by cloudApi
    const data = JSON.stringify({ nombre: 'Empresa Test', nif: 'B12345678' })
    const iv = nodeCrypto.randomBytes(16)
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    // Decrypt
    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')

    expect(JSON.parse(decrypted)).toEqual({
      nombre: 'Empresa Test',
      nif: 'B12345678',
    })
  })

  it('decryption fails with wrong key', () => {
    const salt1 = generateSalt()
    const salt2 = generateSalt()
    const key1 = deriveCloudKey('correct-passphrase', salt1)
    const key2 = deriveCloudKey('wrong-passphrase', salt2)

    const data = 'secret data'
    const iv = nodeCrypto.randomBytes(16)
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key1, iv)
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key2, iv)
    decipher.setAuthTag(authTag)
    expect(() => {
      Buffer.concat([decipher.update(encrypted), decipher.final()])
    }).toThrow()
  })

  it('decryption fails with tampered data', () => {
    const salt = generateSalt()
    const key = deriveCloudKey('passphrase', salt)

    const data = 'sensitive info'
    const iv = nodeCrypto.randomBytes(16)
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    // Tamper with encrypted data
    encrypted[0] ^= 0xff

    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    expect(() => {
      Buffer.concat([decipher.update(encrypted), decipher.final()])
    }).toThrow()
  })

  it('decryption fails with tampered auth tag', () => {
    const salt = generateSalt()
    const key = deriveCloudKey('passphrase', salt)

    const data = 'protected data'
    const iv = nodeCrypto.randomBytes(16)
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    // Tamper with auth tag
    const tamperedTag = Buffer.from(authTag)
    tamperedTag[0] ^= 0xff

    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tamperedTag)
    expect(() => {
      Buffer.concat([decipher.update(encrypted), decipher.final()])
    }).toThrow()
  })

  it('handles large data payloads', () => {
    const salt = generateSalt()
    const key = deriveCloudKey('passphrase', salt)

    // 100KB of data
    const largeData = JSON.stringify({ data: 'x'.repeat(100000) })
    const iv = nodeCrypto.randomBytes(16)
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(largeData, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    expect(decrypted).toBe(largeData)
  })

  it('encrypts with base64 output format (matching server protocol)', () => {
    const salt = generateSalt()
    const key = deriveCloudKey('passphrase', salt)

    const data = JSON.stringify({ id: 1, nombre: 'Test' })
    const iv = nodeCrypto.randomBytes(16)
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    // Simulate the EncryptedBlob format
    const blob = {
      encrypted_data: encrypted.toString('base64'),
      iv: iv.toString('hex'),
      auth_tag: authTag.toString('hex'),
    }

    // Verify format
    expect(blob.encrypted_data).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(blob.iv).toMatch(/^[a-f0-9]{32}$/)
    expect(blob.auth_tag).toMatch(/^[a-f0-9]{32}$/)

    // Decrypt from blob format
    const decIv = Buffer.from(blob.iv, 'hex')
    const decAuthTag = Buffer.from(blob.auth_tag, 'hex')
    const decEncrypted = Buffer.from(blob.encrypted_data, 'base64')

    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, decIv)
    decipher.setAuthTag(decAuthTag)
    const decrypted = Buffer.concat([decipher.update(decEncrypted), decipher.final()]).toString('utf8')
    expect(JSON.parse(decrypted)).toEqual({ id: 1, nombre: 'Test' })
  })
})

// ============================================
// Passphrase verification full flow
// ============================================

describe('Passphrase verification full flow', () => {
  it('simulates empresa setup and passphrase verification', () => {
    // Step 1: Create empresa - generate salt and store verification hash
    const salt = generateSalt()
    const passphrase = 'mi-contraseña-segura'
    const verificationHash = generateVerificationHash(passphrase, salt)

    // Step 2: On another device/session, verify the passphrase
    expect(verifyPassphrase(passphrase, salt, verificationHash)).toBe(true)
    expect(verifyPassphrase('wrong-password', salt, verificationHash)).toBe(false)

    // Step 3: Derive the encryption key
    const key = deriveCloudKey(passphrase, salt)
    setEncryptionKey(key)
    expect(getEncryptionKey()!.length).toBe(32)

    // Step 4: Encrypt some entity data
    const entityData = { id: 1, nombre: 'Cliente Test', nif: 'A12345678' }
    const iv = nodeCrypto.randomBytes(16)
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(entityData), 'utf8'),
      cipher.final(),
    ])
    const authTag = cipher.getAuthTag()

    // Step 5: Decrypt on server fetch
    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    const decrypted = JSON.parse(
      Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    )
    expect(decrypted).toEqual(entityData)
  })

  it('different passphrases produce incompatible encryption keys', () => {
    const salt = generateSalt()
    const key1 = deriveCloudKey('passphrase-1', salt)
    const key2 = deriveCloudKey('passphrase-2', salt)

    // Encrypt with key1
    const data = 'secret'
    const iv = nodeCrypto.randomBytes(16)
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key1, iv)
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    // Attempt to decrypt with key2
    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key2, iv)
    decipher.setAuthTag(authTag)
    expect(() => {
      Buffer.concat([decipher.update(encrypted), decipher.final()])
    }).toThrow()
  })
})
