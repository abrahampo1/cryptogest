import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// Mock electron
vi.mock('electron', () => ({
  net: {
    request: vi.fn(),
  },
}))

// Mock crypto module (for loadCloudSession)
vi.mock('../crypto', () => ({
  loadCloudSession: vi.fn(() => null),
}))

import {
  CloudAuthError,
  CloudQuotaError,
  CloudValidationError,
  CloudRateLimitError,
  CloudNetworkError,
  setCloudConfig,
  getCloudConfig,
  clearCloudConfig,
  initFromSession,
  computeSha256,
  checkAuth,
  listBackups,
  getBackup,
  deleteBackup,
  getAccountPlan,
  createLicenseCheckout,
  createSubscriptionCheckout,
} from '../cloud'

import { loadCloudSession } from '../crypto'
import { net } from 'electron'

// ============================================
// Error Classes
// ============================================

describe('CloudAuthError', () => {
  it('creates with default message', () => {
    const error = new CloudAuthError()
    expect(error.message).toBe('No autenticado o token inválido')
    expect(error.name).toBe('CloudAuthError')
    expect(error).toBeInstanceOf(Error)
  })

  it('creates with custom message', () => {
    const error = new CloudAuthError('Token expired')
    expect(error.message).toBe('Token expired')
  })
})

describe('CloudQuotaError', () => {
  it('creates with default message', () => {
    const error = new CloudQuotaError()
    expect(error.message).toBe('Cuota excedida')
    expect(error.name).toBe('CloudQuotaError')
    expect(error).toBeInstanceOf(Error)
  })

  it('creates with custom message', () => {
    const error = new CloudQuotaError('Storage full')
    expect(error.message).toBe('Storage full')
  })
})

describe('CloudValidationError', () => {
  it('creates with default message and empty errors', () => {
    const error = new CloudValidationError()
    expect(error.message).toBe('Error de validación')
    expect(error.name).toBe('CloudValidationError')
    expect(error.errors).toEqual({})
    expect(error).toBeInstanceOf(Error)
  })

  it('creates with custom message and field errors', () => {
    const fieldErrors = { email: ['Invalid format'], name: ['Required'] }
    const error = new CloudValidationError('Validation failed', fieldErrors)
    expect(error.message).toBe('Validation failed')
    expect(error.errors).toEqual(fieldErrors)
  })
})

describe('CloudRateLimitError', () => {
  it('creates with default message', () => {
    const error = new CloudRateLimitError()
    expect(error.message).toBe('Demasiadas peticiones, espera un momento')
    expect(error.name).toBe('CloudRateLimitError')
    expect(error).toBeInstanceOf(Error)
  })
})

describe('CloudNetworkError', () => {
  it('creates with default message', () => {
    const error = new CloudNetworkError()
    expect(error.message).toBe('Error de conexión con el servidor')
    expect(error.name).toBe('CloudNetworkError')
    expect(error).toBeInstanceOf(Error)
  })

  it('creates with custom message', () => {
    const error = new CloudNetworkError('ECONNREFUSED')
    expect(error.message).toBe('ECONNREFUSED')
  })
})

// ============================================
// Config management
// ============================================

describe('Cloud Config', () => {
  beforeEach(() => {
    clearCloudConfig()
  })

  it('returns null when no config set', () => {
    expect(getCloudConfig()).toBeNull()
  })

  it('sets and retrieves config', () => {
    setCloudConfig('https://cloud.example.com', 'my-token')
    const cfg = getCloudConfig()
    expect(cfg).toEqual({
      serverUrl: 'https://cloud.example.com',
      token: 'my-token',
    })
  })

  it('strips trailing slashes from serverUrl', () => {
    setCloudConfig('https://cloud.example.com///', 'token')
    const cfg = getCloudConfig()
    expect(cfg?.serverUrl).toBe('https://cloud.example.com')
  })

  it('clears config', () => {
    setCloudConfig('https://cloud.example.com', 'token')
    clearCloudConfig()
    expect(getCloudConfig()).toBeNull()
  })

  it('initFromSession loads config from persisted session', () => {
    vi.mocked(loadCloudSession).mockReturnValueOnce({
      serverUrl: 'https://persisted.example.com',
      token: 'persisted-token',
      user: { id: 1, name: 'Test', email: 'test@test.com' },
    })

    initFromSession()
    const cfg = getCloudConfig()
    expect(cfg?.serverUrl).toBe('https://persisted.example.com')
    expect(cfg?.token).toBe('persisted-token')
  })

  it('initFromSession does nothing when no session', () => {
    vi.mocked(loadCloudSession).mockReturnValueOnce(null)
    clearCloudConfig()
    initFromSession()
    expect(getCloudConfig()).toBeNull()
  })
})

// ============================================
// computeSha256
// ============================================

describe('computeSha256', () => {
  let tmpFile: string

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `test-sha256-${Date.now()}.txt`)
  })

  afterEach(() => {
    try { fs.unlinkSync(tmpFile) } catch { /* ignore */ }
  })

  it('computes correct SHA-256 hash for known content', async () => {
    fs.writeFileSync(tmpFile, 'hello world')
    const hash = await computeSha256(tmpFile)
    // SHA-256 of "hello world"
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
  })

  it('computes correct hash for empty file', async () => {
    fs.writeFileSync(tmpFile, '')
    const hash = await computeSha256(tmpFile)
    // SHA-256 of empty string
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('produces hex string of correct length', async () => {
    fs.writeFileSync(tmpFile, 'test data 123')
    const hash = await computeSha256(tmpFile)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects for non-existent file', async () => {
    await expect(computeSha256('/nonexistent/file.txt')).rejects.toThrow()
  })
})

// ============================================
// API functions (mocked net.request)
// ============================================

function createMockRequest(responseStatus: number, responseBody: any, errorEvent?: string) {
  const handlers: Record<string, Function> = {}
  const mockReq = {
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    abort: vi.fn(),
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler
    }),
  }

  // Simulate response after req.end() is called
  const originalEnd = mockReq.end
  mockReq.end = vi.fn((..._args: any[]) => {
    if (errorEvent) {
      setTimeout(() => handlers['error']?.(new Error(errorEvent)), 0)
    } else {
      setTimeout(() => {
        const resHandlers: Record<string, Function> = {}
        const mockRes = {
          statusCode: responseStatus,
          headers: {},
          on: vi.fn((event: string, handler: Function) => {
            resHandlers[event] = handler
          }),
        }
        handlers['response']?.(mockRes)
        // Emit data then end
        setTimeout(() => {
          const body = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)
          resHandlers['data']?.(Buffer.from(body))
          resHandlers['end']?.()
        }, 0)
      }, 0)
    }
  }) as any

  vi.mocked(net.request).mockReturnValue(mockReq as any)
  return mockReq
}

describe('API functions with mocked network', () => {
  beforeEach(() => {
    clearCloudConfig()
    setCloudConfig('https://api.example.com', 'test-token-123')
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    clearCloudConfig()
    vi.useRealTimers()
  })

  describe('checkAuth', () => {
    it('returns user info on success', async () => {
      createMockRequest(200, {
        authenticated: true,
        user: { id: 1, name: 'Test User', email: 'test@test.com' },
      })

      const result = await checkAuth()
      expect(result.authenticated).toBe(true)
      expect(result.user.name).toBe('Test User')
    })

    it('throws CloudAuthError on 401', async () => {
      createMockRequest(401, { message: 'Unauthenticated' })

      await expect(checkAuth()).rejects.toThrow(CloudAuthError)
    })

    it('throws CloudNetworkError on connection failure', async () => {
      createMockRequest(0, '', 'ECONNREFUSED')

      await expect(checkAuth()).rejects.toThrow(CloudNetworkError)
    })

    it('throws when no config set', async () => {
      clearCloudConfig()
      await expect(checkAuth()).rejects.toThrow(CloudAuthError)
    })
  })

  describe('listBackups', () => {
    it('returns paginated backup list', async () => {
      createMockRequest(200, {
        data: [
          { id: 1, original_filename: 'backup1.zip', size_bytes: 1024 },
          { id: 2, original_filename: 'backup2.zip', size_bytes: 2048 },
        ],
        current_page: 1,
        last_page: 3,
        per_page: 10,
        total: 25,
      })

      const result = await listBackups(1)
      expect(result.data).toHaveLength(2)
      expect(result.meta.current_page).toBe(1)
      expect(result.meta.last_page).toBe(3)
      expect(result.meta.total).toBe(25)
    })
  })

  describe('getBackup', () => {
    it('returns a single backup', async () => {
      createMockRequest(200, {
        id: 5,
        original_filename: 'test.zip',
        size_bytes: 4096,
        checksum_sha256: 'abc123',
      })

      const result = await getBackup(5)
      expect(result.id).toBe(5)
      expect(result.original_filename).toBe('test.zip')
    })
  })

  describe('deleteBackup', () => {
    it('completes without error on 200', async () => {
      createMockRequest(200, { message: 'Deleted' })
      await expect(deleteBackup(5)).resolves.toBeUndefined()
    })

    it('throws on 403 quota error', async () => {
      createMockRequest(403, { message: 'Forbidden' })
      await expect(deleteBackup(5)).rejects.toThrow(CloudQuotaError)
    })
  })

  describe('getAccountPlan', () => {
    it('returns plan, usage, and license info', async () => {
      createMockRequest(200, {
        plan: { name: 'Pro', slug: 'pro', max_backups: 100 },
        usage: { backup_count: 5, storage_used_bytes: 50000 },
        license: { has_license: true, purchased_at: '2025-01-01' },
      })

      const result = await getAccountPlan()
      expect(result.plan.name).toBe('Pro')
      expect(result.usage.backup_count).toBe(5)
      expect(result.license.has_license).toBe(true)
    })
  })

  describe('createLicenseCheckout', () => {
    it('returns checkout URL', async () => {
      createMockRequest(200, { checkout_url: 'https://stripe.com/checkout/123' })

      const result = await createLicenseCheckout()
      expect(result.checkout_url).toBe('https://stripe.com/checkout/123')
    })
  })

  describe('createSubscriptionCheckout', () => {
    it('returns checkout URL for plan upgrade', async () => {
      createMockRequest(200, { checkout_url: 'https://stripe.com/checkout/456' })

      const result = await createSubscriptionCheckout('pro')
      expect(result.checkout_url).toBe('https://stripe.com/checkout/456')
    })

    it('returns upgraded response for free plan downgrade', async () => {
      createMockRequest(200, {
        upgraded: true,
        plan: { name: 'Free', slug: 'free' },
      })

      const result = await createSubscriptionCheckout('free')
      expect(result.upgraded).toBe(true)
    })
  })

  describe('HTTP error mapping', () => {
    it('maps 401 to CloudAuthError', async () => {
      createMockRequest(401, { message: 'Token invalid' })
      await expect(checkAuth()).rejects.toThrow(CloudAuthError)
    })

    it('maps 403 to CloudQuotaError', async () => {
      createMockRequest(403, { message: 'Quota exceeded' })
      await expect(checkAuth()).rejects.toThrow(CloudQuotaError)
    })

    it('maps 422 to CloudValidationError', async () => {
      createMockRequest(422, {
        message: 'Validation failed',
        errors: { name: ['Required'] },
      })
      try {
        await checkAuth()
      } catch (e: any) {
        expect(e).toBeInstanceOf(CloudValidationError)
        expect(e.errors).toEqual({ name: ['Required'] })
      }
    })

    it('maps 429 to CloudRateLimitError', async () => {
      createMockRequest(429, { message: 'Too many requests' })
      await expect(checkAuth()).rejects.toThrow(CloudRateLimitError)
    })

    it('maps 500 to generic Error', async () => {
      createMockRequest(500, { message: 'Internal server error' })
      await expect(checkAuth()).rejects.toThrow('Internal server error')
    })

    it('handles non-JSON error body gracefully', async () => {
      createMockRequest(500, 'Internal Server Error')
      await expect(checkAuth()).rejects.toThrow()
    })
  })

  describe('request headers', () => {
    it('sets Authorization and Accept headers', async () => {
      const mockReq = createMockRequest(200, { authenticated: true, user: {} })

      await checkAuth()

      expect(mockReq.setHeader).toHaveBeenCalledWith('Accept', 'application/json')
      expect(mockReq.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer test-token-123')
    })
  })
})
