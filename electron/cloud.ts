import { net } from 'electron'
import * as fs from 'fs'
import * as crypto from 'crypto'

// Uses Electron's `net` module (Chromium networking stack) instead of Node.js
// `https`. This properly handles certificate chains, AIA fetching, and the OS
// certificate store — avoiding "unable to verify the first certificate" errors.

// ============================================
// Types
// ============================================

export interface CloudBackup {
  id: number
  original_filename: string
  size_bytes: number
  checksum_sha256: string
  encryption_metadata: Record<string, any>
  notes: string | null
  uploaded_at: string
  created_at: string
}

export interface CloudPlan {
  name: string
  slug: string
  max_backups: number
  max_storage_bytes: number
}

export interface CloudUsage {
  backup_count: number
  max_backups: number
  unlimited_backups: boolean
  backups_remaining: number | null
  storage_used_bytes: number
  max_storage_bytes: number
  storage_remaining_bytes: number
}

export interface CloudUser {
  id: number
  name: string
  email: string
}

export interface CloudLicense {
  has_license: boolean
  purchased_at: string | null
}

interface PaginationMeta {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

// ============================================
// Error Classes
// ============================================

export class CloudAuthError extends Error {
  constructor(message = 'No autenticado o token inválido') {
    super(message)
    this.name = 'CloudAuthError'
  }
}

export class CloudQuotaError extends Error {
  constructor(message = 'Cuota excedida') {
    super(message)
    this.name = 'CloudQuotaError'
  }
}

export class CloudValidationError extends Error {
  public errors: Record<string, string[]>
  constructor(message = 'Error de validación', errors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'CloudValidationError'
    this.errors = errors
  }
}

export class CloudRateLimitError extends Error {
  constructor(message = 'Demasiadas peticiones, espera un momento') {
    super(message)
    this.name = 'CloudRateLimitError'
  }
}

export class CloudNetworkError extends Error {
  constructor(message = 'Error de conexión con el servidor') {
    super(message)
    this.name = 'CloudNetworkError'
  }
}

// ============================================
// Config
// ============================================

let cloudServerUrl: string | null = null
let cloudToken: string | null = null

export function setCloudConfig(serverUrl: string, token: string): void {
  // Normalize URL: remove trailing slash
  cloudServerUrl = serverUrl.replace(/\/+$/, '')
  cloudToken = token
}

export function getCloudConfig(): { serverUrl: string; token: string } | null {
  if (!cloudServerUrl || !cloudToken) return null
  return { serverUrl: cloudServerUrl, token: cloudToken }
}

export function clearCloudConfig(): void {
  cloudServerUrl = null
  cloudToken = null
}

// ============================================
// HTTP Helpers
// ============================================

function getBaseUrl(): string {
  if (!cloudServerUrl) throw new CloudAuthError('Servidor cloud no configurado')
  return cloudServerUrl
}

function getToken(): string {
  if (!cloudToken) throw new CloudAuthError('Token no configurado')
  return cloudToken
}

interface RequestOptions {
  method: string
  path: string
  headers?: Record<string, string>
  body?: string | Buffer
  timeout?: number
}

function mapStatusToError(status: number, errorMessage: string, errors: Record<string, string[]> = {}): Error {
  switch (status) {
    case 401: return new CloudAuthError(errorMessage)
    case 403: return new CloudQuotaError(errorMessage)
    case 422: return new CloudValidationError(errorMessage, errors)
    case 429: return new CloudRateLimitError(errorMessage)
    default: return new Error(errorMessage)
  }
}

function parseErrorBody(body: string, status: number): { message: string; errors: Record<string, string[]> } {
  let message = `Error HTTP ${status}`
  let errors: Record<string, string[]> = {}
  try {
    const parsed = JSON.parse(body)
    message = parsed.message || message
    errors = parsed.errors || {}
  } catch {
    // body is not JSON
  }
  return { message, errors }
}

function makeRequest<T>(options: RequestOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    const baseUrl = getBaseUrl()
    const fullUrl = `${baseUrl}${options.path}`

    const req = net.request({
      method: options.method,
      url: fullUrl,
    })

    // Set headers
    req.setHeader('Accept', 'application/json')
    req.setHeader('Authorization', `Bearer ${getToken()}`)
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        req.setHeader(key, value)
      }
    }

    // Manual timeout
    const timeoutMs = options.timeout || 30000
    const timer = setTimeout(() => {
      req.abort()
      reject(new CloudNetworkError('Tiempo de espera agotado'))
    }, timeoutMs)

    req.on('response', (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        clearTimeout(timer)
        const body = Buffer.concat(chunks).toString('utf8')
        const status = res.statusCode

        if (status >= 200 && status < 300) {
          try {
            resolve(JSON.parse(body) as T)
          } catch {
            resolve(body as unknown as T)
          }
          return
        }

        const { message, errors } = parseErrorBody(body, status)
        reject(mapStatusToError(status, message, errors))
      })
    })

    req.on('error', (err) => {
      clearTimeout(timer)
      reject(new CloudNetworkError(err.message))
    })

    if (options.body) {
      req.write(options.body)
    }

    req.end()
  })
}

// ============================================
// SHA-256 Checksum
// ============================================

export function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// ============================================
// Auth
// ============================================

export async function checkAuth(): Promise<{ authenticated: boolean; user: CloudUser }> {
  const result = await makeRequest<{ authenticated: boolean; user: CloudUser }>({
    method: 'POST',
    path: '/api/v1/auth/check',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return result
}

// ============================================
// Backups
// ============================================

export async function listBackups(page = 1): Promise<{ data: CloudBackup[]; meta: PaginationMeta }> {
  // Laravel paginate() returns { data: [...], current_page, last_page, per_page, total, ... }
  const result = await makeRequest<any>({
    method: 'GET',
    path: `/api/v1/backups?page=${page}`,
  })
  return {
    data: result.data,
    meta: {
      current_page: result.current_page,
      last_page: result.last_page,
      per_page: result.per_page,
      total: result.total,
    },
  }
}

export async function getBackup(id: number): Promise<CloudBackup> {
  return await makeRequest<CloudBackup>({
    method: 'GET',
    path: `/api/v1/backups/${id}`,
  })
}

export async function deleteBackup(id: number): Promise<void> {
  await makeRequest<any>({
    method: 'DELETE',
    path: `/api/v1/backups/${id}`,
  })
}

export async function uploadBackup(
  filePath: string,
  originalFilename: string,
  encryptionMetadata: object,
  notes?: string,
  onProgress?: (percent: number) => void,
): Promise<CloudBackup> {
  const baseUrl = getBaseUrl()
  const token = getToken()

  if (onProgress) onProgress(5)

  const boundary = `----CryptoGest${crypto.randomUUID().replace(/-/g, '')}`
  const checksum = await computeSha256(filePath)

  if (onProgress) onProgress(15)

  // Build multipart fields
  const fields: Array<{ name: string; value: string }> = [
    { name: 'original_filename', value: originalFilename },
    { name: 'checksum_sha256', value: checksum },
    { name: 'encryption_metadata', value: JSON.stringify(encryptionMetadata) },
  ]
  if (notes) {
    fields.push({ name: 'notes', value: notes })
  }

  // Build pre-file part
  let prePart = ''
  for (const field of fields) {
    prePart += `--${boundary}\r\n`
    prePart += `Content-Disposition: form-data; name="${field.name}"\r\n\r\n`
    prePart += `${field.value}\r\n`
  }

  // File part header
  prePart += `--${boundary}\r\n`
  prePart += `Content-Disposition: form-data; name="file"; filename="${originalFilename}"\r\n`
  prePart += `Content-Type: application/zip\r\n\r\n`

  const prePartBuf = Buffer.from(prePart, 'utf8')
  const postPartBuf = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')

  // Read the entire file into memory and build the full multipart body.
  // Electron's net.request (Chromium) does not support streaming multiple
  // write() calls reliably — it needs the complete body upfront.
  const fileData = fs.readFileSync(filePath)

  if (onProgress) onProgress(30)

  const body = Buffer.concat([prePartBuf, fileData, postPartBuf])

  if (onProgress) onProgress(40)

  return new Promise((resolve, reject) => {
    const req = net.request({
      method: 'POST',
      url: `${baseUrl}/api/v1/backups`,
    })

    req.setHeader('Accept', 'application/json')
    req.setHeader('Authorization', `Bearer ${token}`)
    req.setHeader('Content-Type', `multipart/form-data; boundary=${boundary}`)

    // 5 min timeout for uploads
    const timer = setTimeout(() => {
      req.abort()
      reject(new CloudNetworkError('Tiempo de espera agotado durante la subida'))
    }, 300000)

    req.on('response', (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        clearTimeout(timer)
        const respBody = Buffer.concat(chunks).toString('utf8')
        const status = res.statusCode

        if (status >= 200 && status < 300) {
          if (onProgress) onProgress(100)
          try {
            resolve(JSON.parse(respBody) as CloudBackup)
          } catch {
            reject(new Error('Respuesta inválida del servidor'))
          }
          return
        }

        const { message, errors } = parseErrorBody(respBody, status)
        reject(mapStatusToError(status, message, errors))
      })
    })

    req.on('error', (err) => {
      clearTimeout(timer)
      reject(new CloudNetworkError(err.message))
    })

    if (onProgress) onProgress(50)
    req.end(body)
  })
}

export async function downloadBackup(
  id: number,
  destPath: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const baseUrl = getBaseUrl()
  const token = getToken()

  return new Promise((resolve, reject) => {
    const req = net.request({
      method: 'GET',
      url: `${baseUrl}/api/v1/backups/${id}/download`,
    })

    req.setHeader('Authorization', `Bearer ${token}`)

    // 5 min timeout for downloads
    const timer = setTimeout(() => {
      req.abort()
      try { fs.unlinkSync(destPath) } catch { /* ignore */ }
      reject(new CloudNetworkError('Tiempo de espera agotado durante la descarga'))
    }, 300000)

    req.on('response', (res) => {
      const status = res.statusCode

      // Handle error responses (JSON body)
      if (status >= 400) {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          clearTimeout(timer)
          const body = Buffer.concat(chunks).toString('utf8')
          let errorMessage = `Error HTTP ${status}`
          try {
            const errorBody = JSON.parse(body)
            errorMessage = errorBody.message || errorMessage
          } catch {
            // not JSON
          }
          switch (status) {
            case 401: reject(new CloudAuthError(errorMessage)); break
            case 404: reject(new Error('Backup no encontrado')); break
            case 429: reject(new CloudRateLimitError(errorMessage)); break
            default: reject(new Error(errorMessage))
          }
        })
        return
      }

      // Success — stream to file (manually, since net response has no pipe())
      const totalBytes = parseInt(res.headers['content-length'] as string || '0', 10)
      let receivedBytes = 0
      const fileStream = fs.createWriteStream(destPath)

      res.on('data', (chunk: Buffer) => {
        fileStream.write(chunk)
        receivedBytes += chunk.length
        if (onProgress && totalBytes > 0) {
          const percent = Math.round((receivedBytes / totalBytes) * 100)
          onProgress(Math.min(percent, 100))
        }
      })

      res.on('end', () => {
        clearTimeout(timer)
        fileStream.end(() => resolve())
      })

      fileStream.on('error', (err) => {
        clearTimeout(timer)
        try { fs.unlinkSync(destPath) } catch { /* ignore */ }
        reject(new CloudNetworkError(`Error escribiendo archivo: ${err.message}`))
      })
    })

    req.on('error', (err) => {
      clearTimeout(timer)
      try { fs.unlinkSync(destPath) } catch { /* ignore */ }
      reject(new CloudNetworkError(err.message))
    })

    req.end()
  })
}

// ============================================
// Account
// ============================================

export async function getAccountPlan(): Promise<{ plan: CloudPlan; usage: CloudUsage; license: CloudLicense }> {
  return await makeRequest<{ plan: CloudPlan; usage: CloudUsage; license: CloudLicense }>({
    method: 'GET',
    path: '/api/v1/account/plan',
  })
}

export async function createLicenseCheckout(): Promise<{ checkout_url: string }> {
  return await makeRequest<{ checkout_url: string }>({
    method: 'POST',
    path: '/api/v1/license/checkout',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}

// ============================================
// Device Linking (no auth token required)
// ============================================

export async function verifyDeviceCode(
  serverUrl: string,
  code: string,
  deviceName?: string,
): Promise<{ api_token: string; user: CloudUser }> {
  const url = `${serverUrl.replace(/\/+$/, '')}/api/v1/device-link/verify-code`

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      code: code.toUpperCase(),
      device_name: deviceName || 'CryptoGest Desktop',
    })

    const req = net.request({
      method: 'POST',
      url,
    })

    req.setHeader('Accept', 'application/json')
    req.setHeader('Content-Type', 'application/json')

    const timer = setTimeout(() => {
      req.abort()
      reject(new CloudNetworkError('Tiempo de espera agotado'))
    }, 30000)

    req.on('response', (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        clearTimeout(timer)
        const respBody = Buffer.concat(chunks).toString('utf8')
        const status = res.statusCode

        if (status >= 200 && status < 300) {
          try {
            resolve(JSON.parse(respBody))
          } catch {
            reject(new Error('Respuesta inválida del servidor'))
          }
          return
        }

        const { message, errors } = parseErrorBody(respBody, status)
        reject(mapStatusToError(status, message, errors))
      })
    })

    req.on('error', (err) => {
      clearTimeout(timer)
      reject(new CloudNetworkError(err.message))
    })

    req.write(body)
    req.end()
  })
}

export async function confirmDeviceLink(
  serverUrl: string,
  linkToken: string,
  deviceName?: string,
): Promise<{ api_token: string; user: CloudUser }> {
  const url = `${serverUrl.replace(/\/+$/, '')}/api/v1/device-link/confirm`

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      token: linkToken,
      device_name: deviceName || 'CryptoGest Desktop',
    })

    const req = net.request({
      method: 'POST',
      url,
    })

    req.setHeader('Accept', 'application/json')
    req.setHeader('Content-Type', 'application/json')

    const timer = setTimeout(() => {
      req.abort()
      reject(new CloudNetworkError('Tiempo de espera agotado'))
    }, 30000)

    req.on('response', (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        clearTimeout(timer)
        const respBody = Buffer.concat(chunks).toString('utf8')
        const status = res.statusCode

        if (status >= 200 && status < 300) {
          try {
            resolve(JSON.parse(respBody))
          } catch {
            reject(new Error('Respuesta inválida del servidor'))
          }
          return
        }

        const { message, errors } = parseErrorBody(respBody, status)
        reject(mapStatusToError(status, message, errors))
      })
    })

    req.on('error', (err) => {
      clearTimeout(timer)
      reject(new CloudNetworkError(err.message))
    })

    req.write(body)
    req.end()
  })
}
