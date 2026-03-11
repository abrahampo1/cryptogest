import { net, BrowserWindow } from 'electron'
import * as nodeCrypto from 'crypto'

// ============================================
// Types
// ============================================

interface CloudConfig {
  serverUrl: string
  token: string
  empresaId: number
}

interface EncryptedBlob {
  encrypted_data: string  // base64
  iv: string              // hex
  auth_tag: string        // hex
}

interface ServerEntity {
  entity_uuid: string
  entity_type?: string
  encrypted_data: string
  iv: string
  auth_tag: string
  updated_at: string
}

interface ServerFile {
  file_uuid: string
  entity_uuid: string
  encrypted_data?: string
  iv?: string
  auth_tag?: string
  encrypted_metadata: string
  metadata_iv: string
  metadata_auth_tag: string
  created_at: string
}

export interface CloudEmpresaInfo {
  id: number
  nombre_encrypted: string
  salt: string
  verification_hash: string
  role: string
  created_at: string
  updated_at: string
}

export interface CloudEmpresaUser {
  id: number
  name: string
  email: string
  role: string
  joined_at: string
}

export interface CloudInvitation {
  code: string
  role: string
  expires_at: string
}

// ============================================
// Error Classes (reuse same hierarchy as cloud.ts)
// ============================================

class CloudApiAuthError extends Error {
  constructor(message = 'Not authenticated or invalid token') {
    super(message)
    this.name = 'CloudApiAuthError'
  }
}

export class CloudApiError extends Error {
  public status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'CloudApiError'
    this.status = status
  }
}

class CloudApiNetworkError extends Error {
  constructor(message = 'Network error connecting to cloud server') {
    super(message)
    this.name = 'CloudApiNetworkError'
  }
}

// ============================================
// Module State
// ============================================

let config: CloudConfig | null = null
let encryptionKey: Buffer | null = null

// In-memory ID mapping: entityType -> Map<localNumericId, uuid>
const idMaps = new Map<string, Map<number, string>>()
// Reverse map: entityType -> Map<uuid, localNumericId>
const reverseIdMaps = new Map<string, Map<string, number>>()
// Auto-increment counters per entity type
const idCounters = new Map<string, number>()

// ============================================
// Entity Cache
// ============================================

interface EntityCache {
  entities: any[]
  lastSyncAt: string
  populated: boolean
}

const entityCaches = new Map<string, EntityCache>()
const syncInProgress = new Set<string>()
let _mainWindow: BrowserWindow | null = null
let fullRefreshTimer: ReturnType<typeof setInterval> | null = null

const FULL_REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export function setCacheMainWindow(win: BrowserWindow | null): void {
  _mainWindow = win
  if (win) {
    // Start periodic full refresh timer
    if (fullRefreshTimer) clearInterval(fullRefreshTimer)
    fullRefreshTimer = setInterval(() => {
      invalidateCache()
    }, FULL_REFRESH_INTERVAL_MS)
  } else {
    if (fullRefreshTimer) {
      clearInterval(fullRefreshTimer)
      fullRefreshTimer = null
    }
  }
}

export function invalidateCache(entityType?: string): void {
  if (entityType) {
    entityCaches.delete(entityType)
  } else {
    entityCaches.clear()
  }
}

function getCacheForType(entityType: string): EntityCache | undefined {
  return entityCaches.get(entityType)
}

function setCacheForType(entityType: string, entities: any[]): void {
  entityCaches.set(entityType, {
    entities,
    lastSyncAt: new Date().toISOString(),
    populated: true,
  })
}

function updateCacheEntity(entityType: string, entity: any): void {
  const cache = entityCaches.get(entityType)
  if (!cache || !cache.populated) return
  // Match by _uuid first, fallback to id to prevent duplicates
  let idx = cache.entities.findIndex((e: any) => e._uuid && e._uuid === entity._uuid)
  if (idx < 0 && entity.id != null) {
    idx = cache.entities.findIndex((e: any) => e.id === entity.id)
  }
  if (idx >= 0) {
    cache.entities[idx] = entity
  } else {
    cache.entities.push(entity)
  }
}

function removeCacheEntity(entityType: string, uuid: string): void {
  const cache = entityCaches.get(entityType)
  if (!cache || !cache.populated) return
  cache.entities = cache.entities.filter((e: any) => e._uuid !== uuid)
}

async function triggerBackgroundSync(entityType: string): Promise<void> {
  if (!config) return
  if (syncInProgress.has(entityType)) return

  const cache = entityCaches.get(entityType)
  if (!cache || !cache.populated) return

  syncInProgress.add(entityType)
  try {
    const cfg = requireConfig()
    const result = await makeRequest<{ data: ServerEntity[]; deleted?: string[] }>({
      method: 'GET',
      path: `/api/v1/empresas/${cfg.empresaId}/entities/sync?since=${encodeURIComponent(cache.lastSyncAt)}&type=${encodeURIComponent(entityType)}`,
    })

    let hasChanges = false

    // Apply updated entities (filter by entity_type for safety)
    if (result.data && result.data.length > 0) {
      for (const serverEntity of result.data) {
        // Skip entities that don't match the requested type
        if (serverEntity.entity_type && serverEntity.entity_type !== entityType) continue

        const decrypted = decryptEntity({
          encrypted_data: serverEntity.encrypted_data,
          iv: serverEntity.iv,
          auth_tag: serverEntity.auth_tag,
        })
        decrypted._uuid = serverEntity.entity_uuid

        // Re-register ID mapping
        if (decrypted.id) {
          registerEntity(entityType, decrypted.id, decrypted._uuid)
        }

        updateCacheEntity(entityType, decrypted)
      }
      hasChanges = true
    }

    // Apply deletions (only for UUIDs that belong to this entity type's ID maps)
    if (result.deleted && result.deleted.length > 0) {
      for (const deletedUuid of result.deleted) {
        // Clean up ID maps
        const reverseMap = getReverseIdMap(entityType)
        const localId = reverseMap.get(deletedUuid)
        if (localId !== undefined) {
          getIdMap(entityType).delete(localId)
          reverseMap.delete(deletedUuid)
          removeCacheEntity(entityType, deletedUuid)
        }
        // If UUID is not in our reverse map, it belongs to another entity type — skip
      }
      hasChanges = true
    }

    // Update lastSyncAt
    cache.lastSyncAt = new Date().toISOString()

    // Notify renderer if changes
    if (hasChanges && _mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('cloud:entity-updated', { entityType })
    }
  } catch {
    // Silently fail background sync — next navigation will retry
  } finally {
    syncInProgress.delete(entityType)
  }
}

// ============================================
// Configuration
// ============================================

export function setCloudApiConfig(serverUrl: string, token: string, empresaId: number): void {
  config = {
    serverUrl: serverUrl.replace(/\/+$/, ''),
    token,
    empresaId,
  }
}

export function getCloudApiConfig(): CloudConfig | null {
  return config
}

export function clearCloudApiConfig(): void {
  config = null
  encryptionKey = null
  idMaps.clear()
  reverseIdMaps.clear()
  idCounters.clear()
  entityCaches.clear()
  syncInProgress.clear()
  if (fullRefreshTimer) {
    clearInterval(fullRefreshTimer)
    fullRefreshTimer = null
  }
}

// ============================================
// Encryption
// ============================================

const PBKDF2_ITERATIONS = 100000
const KEY_LENGTH = 32
const IV_LENGTH = 16
const ALGORITHM = 'aes-256-gcm'

export function deriveCloudKey(passphrase: string, saltHex: string): Buffer {
  const salt = Buffer.from(saltHex, 'hex')
  return nodeCrypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512')
}

export function generateSalt(): string {
  return nodeCrypto.randomBytes(32).toString('hex')
}

export function generateVerificationHash(passphrase: string, saltHex: string): string {
  const key = deriveCloudKey(passphrase, saltHex)
  // Hash the derived key to create a verification hash
  return nodeCrypto.createHash('sha256').update(key).digest('hex')
}

export function verifyPassphrase(passphrase: string, saltHex: string, expectedHash: string): boolean {
  const hash = generateVerificationHash(passphrase, saltHex)
  try {
    return nodeCrypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'))
  } catch {
    return false
  }
}

export function setEncryptionKey(key: Buffer): void {
  encryptionKey = key
}

export function getEncryptionKey(): Buffer | null {
  return encryptionKey
}

function requireKey(): Buffer {
  if (!encryptionKey) throw new Error('Encryption key not set. Enter passphrase first.')
  return encryptionKey
}

function encryptData(data: string): EncryptedBlob {
  const key = requireKey()
  const iv = nodeCrypto.randomBytes(IV_LENGTH)
  const cipher = nodeCrypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    encrypted_data: encrypted.toString('base64'),
    iv: iv.toString('hex'),
    auth_tag: authTag.toString('hex'),
  }
}

function decryptData(blob: EncryptedBlob): string {
  const key = requireKey()
  const iv = Buffer.from(blob.iv, 'hex')
  const authTag = Buffer.from(blob.auth_tag, 'hex')
  const encrypted = Buffer.from(blob.encrypted_data, 'base64')

  const decipher = nodeCrypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

function encryptEntity(data: object): EncryptedBlob {
  return encryptData(JSON.stringify(data))
}

function decryptEntity(blob: EncryptedBlob): any {
  const json = decryptData(blob)
  return JSON.parse(json)
}

function encryptBinary(data: Buffer): EncryptedBlob {
  const key = requireKey()
  const iv = nodeCrypto.randomBytes(IV_LENGTH)
  const cipher = nodeCrypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    encrypted_data: encrypted.toString('base64'),
    iv: iv.toString('hex'),
    auth_tag: authTag.toString('hex'),
  }
}

function decryptBinary(blob: EncryptedBlob): Buffer {
  const key = requireKey()
  const iv = Buffer.from(blob.iv, 'hex')
  const authTag = Buffer.from(blob.auth_tag, 'hex')
  const encrypted = Buffer.from(blob.encrypted_data, 'base64')

  const decipher = nodeCrypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

// ============================================
// HTTP Helpers
// ============================================

function requireConfig(): CloudConfig {
  if (!config) throw new CloudApiAuthError('Cloud API not configured')
  return config
}

interface RequestOptions {
  method: string
  path: string
  headers?: Record<string, string>
  body?: string | Buffer
  timeout?: number
}

function makeRequest<T>(options: RequestOptions): Promise<T> {
  const cfg = requireConfig()

  return new Promise((resolve, reject) => {
    const fullUrl = `${cfg.serverUrl}${options.path}`

    const req = net.request({
      method: options.method,
      url: fullUrl,
    })

    req.setHeader('Accept', 'application/json')
    req.setHeader('Authorization', `Bearer ${cfg.token}`)
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        req.setHeader(key, value)
      }
    }

    const timeoutMs = options.timeout || 30000
    const timer = setTimeout(() => {
      req.abort()
      reject(new CloudApiNetworkError('Request timed out'))
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

        let message = `HTTP error ${status}`
        try {
          const parsed = JSON.parse(body)
          message = parsed.message || message
        } catch { /* not JSON */ }

        if (status === 401) reject(new CloudApiAuthError(message))
        else reject(new CloudApiError(message, status))
      })
    })

    req.on('error', (err) => {
      clearTimeout(timer)
      reject(new CloudApiNetworkError(err.message))
    })

    if (options.body) {
      req.write(Buffer.from(options.body, 'utf8'))
    }
    req.end()
  })
}

// ============================================
// ID Management
// ============================================

function getIdMap(entityType: string): Map<number, string> {
  if (!idMaps.has(entityType)) {
    idMaps.set(entityType, new Map())
  }
  return idMaps.get(entityType)!
}

function getReverseIdMap(entityType: string): Map<string, number> {
  if (!reverseIdMaps.has(entityType)) {
    reverseIdMaps.set(entityType, new Map())
  }
  return reverseIdMaps.get(entityType)!
}

function registerEntity(entityType: string, localId: number, uuid: string): void {
  getIdMap(entityType).set(localId, uuid)
  getReverseIdMap(entityType).set(uuid, localId)
  const current = idCounters.get(entityType) || 0
  if (localId >= current) {
    idCounters.set(entityType, localId + 1)
  }
}

function getNextId(entityType: string): number {
  const current = idCounters.get(entityType) || 1
  idCounters.set(entityType, current + 1)
  return current
}

function getUuidById(entityType: string, localId: number): string | undefined {
  return getIdMap(entityType).get(localId)
}

function buildIdMapsFromEntities(entityType: string, entities: any[]): void {
  // Preserve counter minimum from existing state to prevent ID collisions
  const previousCounter = idCounters.get(entityType) || 1

  // Rebuild maps from server entities
  const newIdMap = new Map<number, string>()
  const newReverseMap = new Map<string, number>()
  let maxId = 0

  for (const entity of entities) {
    if (entity.id != null && entity._uuid) {
      newIdMap.set(entity.id, entity._uuid)
      newReverseMap.set(entity._uuid, entity.id)
      if (entity.id > maxId) maxId = entity.id
    }
  }

  idMaps.set(entityType, newIdMap)
  reverseIdMaps.set(entityType, newReverseMap)
  // Counter must be at least max(previous, maxFromEntities) + 1
  idCounters.set(entityType, Math.max(previousCounter, maxId + 1))
}

// ============================================
// Generic Entity CRUD
// ============================================

async function fetchAllEntitiesFromServer(entityType: string): Promise<any[]> {
  const cfg = requireConfig()
  const result = await makeRequest<any>({
    method: 'GET',
    path: `/api/v1/empresas/${cfg.empresaId}/entities?type=${encodeURIComponent(entityType)}`,
  })

  const serverEntities: ServerEntity[] = Array.isArray(result?.data) ? result.data
    : Array.isArray(result) ? result : []

  const entities = serverEntities.map((serverEntity) => {
    const decrypted = decryptEntity({
      encrypted_data: serverEntity.encrypted_data,
      iv: serverEntity.iv,
      auth_tag: serverEntity.auth_tag,
    })
    // Preserve the UUID mapping
    decrypted._uuid = serverEntity.entity_uuid
    return decrypted
  })

  // Rebuild ID maps from decrypted entities
  buildIdMapsFromEntities(entityType, entities)

  // Update cache
  setCacheForType(entityType, entities)

  return entities
}

async function getAllEntities(entityType: string): Promise<any[]> {
  const cached = getCacheForType(entityType)

  if (cached && cached.populated) {
    // Return cached data immediately, trigger background sync
    triggerBackgroundSync(entityType)
    return [...cached.entities]
  }

  // No cache — full fetch
  return fetchAllEntitiesFromServer(entityType)
}

async function getEntity(_entityType: string, uuid: string): Promise<any> {
  const cfg = requireConfig()
  const serverEntity = await makeRequest<ServerEntity>({
    method: 'GET',
    path: `/api/v1/empresas/${cfg.empresaId}/entities/${encodeURIComponent(uuid)}`,
  })

  const decrypted = decryptEntity({
    encrypted_data: serverEntity.encrypted_data,
    iv: serverEntity.iv,
    auth_tag: serverEntity.auth_tag,
  })
  decrypted._uuid = serverEntity.entity_uuid
  return decrypted
}

async function createEntity(entityType: string, data: any): Promise<any> {
  const cfg = requireConfig()
  const uuid = nodeCrypto.randomUUID()

  // Assign a local numeric ID
  const localId = getNextId(entityType)
  const entityData = { ...data, id: localId, _uuid: uuid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  const blob = encryptEntity(entityData)

  await makeRequest<any>({
    method: 'POST',
    path: `/api/v1/empresas/${cfg.empresaId}/entities`,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entity_type: entityType,
      entity_uuid: uuid,
      ...blob,
    }),
  })

  registerEntity(entityType, localId, uuid)

  // Optimistic cache update (only if cache is already populated to avoid replacing existing data)
  updateCacheEntity(entityType, entityData)

  return entityData
}

async function updateEntity(entityType: string, localId: number, data: any): Promise<any> {
  const cfg = requireConfig()
  const uuid = getUuidById(entityType, localId)
  if (!uuid) throw new Error(`Entity not found: ${entityType}#${localId}`)

  // Fetch current data from cache first, fallback to server
  const cache = getCacheForType(entityType)
  let current: any
  if (cache && cache.populated) {
    current = cache.entities.find((e: any) => e._uuid === uuid)
  }
  if (!current) {
    current = await getEntity(entityType, uuid)
  }
  const updated = { ...current, ...data, id: localId, _uuid: uuid, updatedAt: new Date().toISOString() }
  const blob = encryptEntity(updated)

  await makeRequest<any>({
    method: 'PUT',
    path: `/api/v1/empresas/${cfg.empresaId}/entities/${encodeURIComponent(uuid)}`,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blob),
  })

  // Optimistic cache update
  updateCacheEntity(entityType, updated)

  return updated
}

async function deleteEntity(entityType: string, localId: number): Promise<void> {
  const cfg = requireConfig()
  const uuid = getUuidById(entityType, localId)
  if (!uuid) throw new Error(`Entity not found: ${entityType}#${localId}`)

  await makeRequest<any>({
    method: 'DELETE',
    path: `/api/v1/empresas/${cfg.empresaId}/entities/${encodeURIComponent(uuid)}`,
  })

  getIdMap(entityType).delete(localId)
  getReverseIdMap(entityType).delete(uuid)

  // Optimistic cache update
  removeCacheEntity(entityType, uuid)
}

// ============================================
// Batch Create (for imports)
// ============================================

export async function batchCreateEntities(
  entityType: string,
  dataArray: any[],
  onProgress?: (current: number, total: number) => void
): Promise<any[]> {
  const cfg = requireConfig()
  const CHUNK_SIZE = 50
  const allCreated: any[] = []

  for (let i = 0; i < dataArray.length; i += CHUNK_SIZE) {
    const chunk = dataArray.slice(i, i + CHUNK_SIZE)

    const encryptedEntities = chunk.map((data) => {
      const uuid = nodeCrypto.randomUUID()
      const localId = getNextId(entityType)
      const entityData = { ...data, id: localId, _uuid: uuid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      const blob = encryptEntity(entityData)

      registerEntity(entityType, localId, uuid)
      allCreated.push(entityData)

      return {
        entity_type: entityType,
        entity_uuid: uuid,
        ...blob,
      }
    })

    await makeRequest<any>({
      method: 'POST',
      path: `/api/v1/empresas/${cfg.empresaId}/entities/batch`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entities: encryptedEntities }),
      timeout: 60000,
    })

    if (onProgress) {
      onProgress(Math.min(i + CHUNK_SIZE, dataArray.length), dataArray.length)
    }
  }

  // Update cache with all created entities
  const cache = getCacheForType(entityType)
  if (cache && cache.populated) {
    cache.entities.push(...allCreated)
  }

  return allCreated
}

// ============================================
// Typed Entity Wrappers (match Prisma return formats)
// ============================================

// Helper to resolve related entities client-side
export async function resolveRelations(entities: any[], relations: { field: string; type: string; idField: string }[]): Promise<any[]> {
  const caches = new Map<string, Map<number, any>>()

  for (const rel of relations) {
    if (!caches.has(rel.type)) {
      const all = await getAllEntities(rel.type)
      const map = new Map<number, any>()
      for (const e of all) map.set(e.id, e)
      caches.set(rel.type, map)
    }
  }

  return entities.map(entity => {
    const result = { ...entity }
    for (const rel of relations) {
      const relId = entity[rel.idField]
      if (relId != null) {
        result[rel.field] = caches.get(rel.type)?.get(relId) || null
      }
    }
    return result
  })
}

export const clientes = {
  getAll: async (): Promise<any[]> => {
    const all = await getAllEntities('cliente')
    // Include facturas relation (like Prisma does)
    const facturas = await getAllEntities('factura')
    return all.map(c => ({
      ...c,
      activo: c.activo ?? true,
      facturas: facturas.filter((f: any) => f.clienteId === c.id),
    }))
  },
  getById: async (id: number): Promise<any> => {
    const uuid = getUuidById('cliente', id)
    if (!uuid) {
      // Try fetching all to rebuild maps
      await getAllEntities('cliente')
      const retryUuid = getUuidById('cliente', id)
      if (!retryUuid) throw new Error('Cliente not found')
    }
    const finalUuid = getUuidById('cliente', id)!
    const cliente = await getEntity('cliente', finalUuid)
    const facturas = await getAllEntities('factura')
    const clienteFacturas = facturas.filter((f: any) => f.clienteId === id)
    // Resolve lineas for each factura
    const lineas = await getAllEntities('lineaFactura')
    const productos = await getAllEntities('producto')
    const prodMap = new Map(productos.map((p: any) => [p.id, p]))
    return {
      ...cliente,
      activo: cliente.activo ?? true,
      facturas: clienteFacturas.map((f: any) => ({
        ...f,
        lineas: lineas
          .filter((l: any) => l.facturaId === f.id)
          .map((l: any) => ({ ...l, producto: l.productoId ? prodMap.get(l.productoId) || null : null })),
      })).sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()),
    }
  },
  create: async (data: any): Promise<any> => {
    const entity = await createEntity('cliente', { ...data, activo: data.activo ?? true, pais: data.pais || 'España' })
    return { ...entity, facturas: [] }
  },
  update: async (id: number, data: any): Promise<any> => {
    const updated = await updateEntity('cliente', id, data)
    const facturas = await getAllEntities('factura')
    return { ...updated, facturas: facturas.filter((f: any) => f.clienteId === id) }
  },
  delete: async (id: number): Promise<void> => {
    await deleteEntity('cliente', id)
  },
}

export const productos = {
  getAll: async (): Promise<any[]> => {
    const all = await getAllEntities('producto')
    const impuestos = await getAllEntities('impuesto')
    const impMap = new Map(impuestos.map((i: any) => [i.id, i]))
    return all.map(p => ({
      ...p,
      activo: p.activo ?? true,
      impuesto: p.impuestoId ? impMap.get(p.impuestoId) || null : null,
      retencion: p.retencionId ? impMap.get(p.retencionId) || null : null,
    })).sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || ''))
  },
  getById: async (id: number): Promise<any> => {
    const uuid = getUuidById('producto', id)
    if (!uuid) { await getAllEntities('producto') }
    const finalUuid = getUuidById('producto', id)
    if (!finalUuid) throw new Error('Producto not found')
    const producto = await getEntity('producto', finalUuid)
    const impuestos = await getAllEntities('impuesto')
    const impMap = new Map(impuestos.map((i: any) => [i.id, i]))
    return {
      ...producto,
      impuesto: producto.impuestoId ? impMap.get(producto.impuestoId) || null : null,
      retencion: producto.retencionId ? impMap.get(producto.retencionId) || null : null,
    }
  },
  create: async (data: any): Promise<any> => {
    return await createEntity('producto', { ...data, activo: data.activo ?? true })
  },
  update: async (id: number, data: any): Promise<any> => {
    return await updateEntity('producto', id, data)
  },
  delete: async (id: number): Promise<void> => {
    await deleteEntity('producto', id)
  },
}

export const impuestos = {
  getAll: async (): Promise<any[]> => {
    const all = await getAllEntities('impuesto')
    return all.sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || ''))
  },
  getById: async (id: number): Promise<any> => {
    const uuid = getUuidById('impuesto', id)
    if (!uuid) { await getAllEntities('impuesto') }
    const finalUuid = getUuidById('impuesto', id)
    if (!finalUuid) throw new Error('Impuesto not found')
    return await getEntity('impuesto', finalUuid)
  },
  create: async (data: any): Promise<any> => {
    return await createEntity('impuesto', { ...data, activo: data.activo ?? true, porDefecto: data.porDefecto ?? false })
  },
  update: async (id: number, data: any): Promise<any> => {
    return await updateEntity('impuesto', id, data)
  },
  delete: async (id: number): Promise<void> => {
    await deleteEntity('impuesto', id)
  },
  setDefault: async (id: number): Promise<void> => {
    // Unset all defaults, then set the specified one
    const all = await getAllEntities('impuesto')
    for (const imp of all) {
      if (imp.porDefecto && imp.id !== id) {
        await updateEntity('impuesto', imp.id, { porDefecto: false })
      }
    }
    await updateEntity('impuesto', id, { porDefecto: true })
  },
}

export const facturas = {
  getAll: async (): Promise<any[]> => {
    const all = await getAllEntities('factura')
    const clientes = await getAllEntities('cliente')
    const lineas = await getAllEntities('lineaFactura')
    const impuestos = await getAllEntities('impuesto')
    const clienteMap = new Map(clientes.map((c: any) => [c.id, c]))
    const impMap = new Map(impuestos.map((i: any) => [i.id, i]))
    return all.map(f => ({
      ...f,
      cliente: f.clienteId ? clienteMap.get(f.clienteId) || null : null,
      lineas: lineas
        .filter((l: any) => l.facturaId === f.id)
        .map((l: any) => ({
          ...l,
          impuesto: l.impuestoId ? impMap.get(l.impuestoId) || null : null,
          retencion: l.retencionId ? impMap.get(l.retencionId) || null : null,
        })),
    })).sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
  },
  getById: async (id: number): Promise<any> => {
    const uuid = getUuidById('factura', id)
    if (!uuid) { await getAllEntities('factura') }
    const finalUuid = getUuidById('factura', id)
    if (!finalUuid) throw new Error('Factura not found')
    const factura = await getEntity('factura', finalUuid)
    const clientes = await getAllEntities('cliente')
    const lineas = await getAllEntities('lineaFactura')
    const impuestos = await getAllEntities('impuesto')
    const productos = await getAllEntities('producto')
    const clienteMap = new Map(clientes.map((c: any) => [c.id, c]))
    const impMap = new Map(impuestos.map((i: any) => [i.id, i]))
    const prodMap = new Map(productos.map((p: any) => [p.id, p]))
    return {
      ...factura,
      cliente: factura.clienteId ? clienteMap.get(factura.clienteId) || null : null,
      lineas: lineas
        .filter((l: any) => l.facturaId === id)
        .map((l: any) => ({
          ...l,
          producto: l.productoId ? prodMap.get(l.productoId) || null : null,
          impuesto: l.impuestoId ? impMap.get(l.impuestoId) || null : null,
          retencion: l.retencionId ? impMap.get(l.retencionId) || null : null,
        })),
    }
  },
  create: async (data: any): Promise<any> => {
    const { lineas, ...facturaData } = data
    const factura = await createEntity('factura', {
      ...facturaData,
      estado: facturaData.estado || 'borrador',
      serie: facturaData.serie || 'F',
    })
    // Create lineas
    if (lineas && Array.isArray(lineas)) {
      for (const linea of lineas) {
        await createEntity('lineaFactura', { ...linea, facturaId: factura.id })
      }
    }
    return factura
  },
  update: async (id: number, data: any): Promise<any> => {
    const { lineas, ...facturaData } = data
    const updated = await updateEntity('factura', id, facturaData)
    // Replace lineas: delete old, create new
    if (lineas && Array.isArray(lineas)) {
      const existingLineas = await getAllEntities('lineaFactura')
      const oldLineas = existingLineas.filter((l: any) => l.facturaId === id)
      for (const old of oldLineas) {
        await deleteEntity('lineaFactura', old.id)
      }
      for (const linea of lineas) {
        await createEntity('lineaFactura', { ...linea, facturaId: id })
      }
    }
    return updated
  },
  delete: async (id: number): Promise<void> => {
    // Delete lineas first
    const lineas = await getAllEntities('lineaFactura')
    const facturaLineas = lineas.filter((l: any) => l.facturaId === id)
    for (const l of facturaLineas) {
      await deleteEntity('lineaFactura', l.id)
    }
    await deleteEntity('factura', id)
  },
  getNextNumber: async (serie?: string): Promise<string> => {
    const s = serie || 'F'
    const facturas = await getAllEntities('factura')
    const serieFacturas = facturas.filter((f: any) => f.serie === s)
    const maxNum = serieFacturas.reduce((max: number, f: any) => {
      const match = f.numero?.match(/(\d+)$/)
      const num = match ? parseInt(match[1], 10) : 0
      return num > max ? num : max
    }, 0)
    const next = maxNum + 1
    return `${s}-${String(next).padStart(4, '0')}`
  },
  updateEstado: async (id: number, estado: string): Promise<any> => {
    return await updateEntity('factura', id, { estado })
  },
}

export const categoriasGasto = {
  getAll: async (): Promise<any[]> => {
    return await getAllEntities('categoriaGasto')
  },
  create: async (data: any): Promise<any> => {
    return await createEntity('categoriaGasto', { ...data, activo: data.activo ?? true })
  },
  update: async (id: number, data: any): Promise<any> => {
    return await updateEntity('categoriaGasto', id, data)
  },
  delete: async (id: number): Promise<void> => {
    await deleteEntity('categoriaGasto', id)
  },
}

export const gastos = {
  getAll: async (): Promise<any[]> => {
    const all = await getAllEntities('gasto')
    const categorias = await getAllEntities('categoriaGasto')
    const impuestos = await getAllEntities('impuesto')
    const adjuntos = await getAllEntities('adjuntoGasto')
    const catMap = new Map(categorias.map((c: any) => [c.id, c]))
    const impMap = new Map(impuestos.map((i: any) => [i.id, i]))
    return all.map(g => ({
      ...g,
      categoria: g.categoriaId ? catMap.get(g.categoriaId) || null : null,
      impuesto: g.impuestoId ? impMap.get(g.impuestoId) || null : null,
      adjuntos: adjuntos.filter((a: any) => a.gastoId === g.id),
    })).sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
  },
  getById: async (id: number): Promise<any> => {
    const uuid = getUuidById('gasto', id)
    if (!uuid) { await getAllEntities('gasto') }
    const finalUuid = getUuidById('gasto', id)
    if (!finalUuid) throw new Error('Gasto not found')
    const gasto = await getEntity('gasto', finalUuid)
    const categorias = await getAllEntities('categoriaGasto')
    const impuestos = await getAllEntities('impuesto')
    const adjuntos = await getAllEntities('adjuntoGasto')
    const catMap = new Map(categorias.map((c: any) => [c.id, c]))
    const impMap = new Map(impuestos.map((i: any) => [i.id, i]))
    return {
      ...gasto,
      categoria: gasto.categoriaId ? catMap.get(gasto.categoriaId) || null : null,
      impuesto: gasto.impuestoId ? impMap.get(gasto.impuestoId) || null : null,
      adjuntos: adjuntos.filter((a: any) => a.gastoId === id),
    }
  },
  create: async (data: any): Promise<any> => {
    return await createEntity('gasto', { ...data, impuestoIncluido: data.impuestoIncluido ?? true })
  },
  update: async (id: number, data: any): Promise<any> => {
    return await updateEntity('gasto', id, data)
  },
  delete: async (id: number): Promise<void> => {
    // Delete adjuntos first
    const adjuntos = await getAllEntities('adjuntoGasto')
    const gastoAdjuntos = adjuntos.filter((a: any) => a.gastoId === id)
    for (const a of gastoAdjuntos) {
      await deleteEntity('adjuntoGasto', a.id)
    }
    await deleteEntity('gasto', id)
  },
}

export const adjuntos = {
  upload: async (gastoId: number, fileData: { data: number[]; nombre: string; tipoMime: string; tamano: number }): Promise<any> => {
    const cfg = requireConfig()
    const fileBuffer = Buffer.from(fileData.data)
    const fileBlob = encryptBinary(fileBuffer)
    const metadataBlob = encryptEntity({
      nombreOriginal: fileData.nombre,
      tipoMime: fileData.tipoMime,
      tamano: fileData.tamano,
    })

    const gastoUuid = getUuidById('gasto', gastoId) || `gasto-${gastoId}`
    const fileUuid = nodeCrypto.randomUUID()

    await makeRequest<any>({
      method: 'POST',
      path: `/api/v1/empresas/${cfg.empresaId}/files`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_uuid: gastoUuid,
        file_uuid: fileUuid,
        encrypted_data: fileBlob.encrypted_data,
        iv: fileBlob.iv,
        auth_tag: fileBlob.auth_tag,
        encrypted_metadata: metadataBlob.encrypted_data,
        metadata_iv: metadataBlob.iv,
        metadata_auth_tag: metadataBlob.auth_tag,
      }),
    })

    // Also create an adjuntoGasto entity for tracking
    const adjunto = await createEntity('adjuntoGasto', {
      gastoId,
      nombreOriginal: fileData.nombre,
      nombreEncriptado: fileUuid,
      tipoMime: fileData.tipoMime,
      tamano: fileData.tamano,
    })
    return adjunto
  },
  download: async (adjuntoId: number): Promise<{ nombre: string; tipoMime: string; data: number[] }> => {
    const cfg = requireConfig()
    const uuid = getUuidById('adjuntoGasto', adjuntoId)
    if (!uuid) { await getAllEntities('adjuntoGasto') }
    const finalUuid = getUuidById('adjuntoGasto', adjuntoId)
    if (!finalUuid) throw new Error('Adjunto not found')
    const adjunto = await getEntity('adjuntoGasto', finalUuid)

    const fileData = await makeRequest<ServerFile>({
      method: 'GET',
      path: `/api/v1/empresas/${cfg.empresaId}/files/${encodeURIComponent(adjunto.nombreEncriptado)}`,
      timeout: 120000,
    })

    const decryptedData = decryptBinary({
      encrypted_data: fileData.encrypted_data!,
      iv: fileData.iv!,
      auth_tag: fileData.auth_tag!,
    })

    return {
      nombre: adjunto.nombreOriginal,
      tipoMime: adjunto.tipoMime,
      data: Array.from(decryptedData),
    }
  },
  delete: async (adjuntoId: number): Promise<void> => {
    const cfg = requireConfig()
    const uuid = getUuidById('adjuntoGasto', adjuntoId)
    if (!uuid) { await getAllEntities('adjuntoGasto') }
    const finalUuid = getUuidById('adjuntoGasto', adjuntoId)
    if (!finalUuid) throw new Error('Adjunto not found')
    const adjunto = await getEntity('adjuntoGasto', finalUuid)

    // Delete server file
    try {
      await makeRequest<any>({
        method: 'DELETE',
        path: `/api/v1/empresas/${cfg.empresaId}/files/${encodeURIComponent(adjunto.nombreEncriptado)}`,
      })
    } catch { /* file may not exist on server */ }

    // Delete adjuntoGasto entity
    await deleteEntity('adjuntoGasto', adjuntoId)
  },
  getByGastoId: async (gastoId: number): Promise<any[]> => {
    const all = await getAllEntities('adjuntoGasto')
    return all.filter((a: any) => a.gastoId === gastoId)
  },
}

export const configuracion = {
  getAll: async (): Promise<Record<string, string>> => {
    const all = await getAllEntities('configuracion')
    const result: Record<string, string> = {}
    for (const c of all) {
      result[c.clave] = c.valor
    }
    return result
  },
  get: async (clave: string): Promise<string | null> => {
    const all = await getAllEntities('configuracion')
    const found = all.find((c: any) => c.clave === clave)
    return found ? found.valor : null
  },
  set: async (clave: string, valor: string): Promise<any> => {
    const all = await getAllEntities('configuracion')
    const existing = all.find((c: any) => c.clave === clave)
    if (existing) {
      return await updateEntity('configuracion', existing.id, { clave, valor })
    } else {
      return await createEntity('configuracion', { clave, valor, tipo: 'string' })
    }
  },
  delete: async (clave: string): Promise<void> => {
    const all = await getAllEntities('configuracion')
    const existing = all.find((c: any) => c.clave === clave)
    if (existing) {
      await deleteEntity('configuracion', existing.id)
    }
  },
}

export const cuentas = {
  getAll: async (): Promise<any[]> => {
    const all = await getAllEntities('cuentaContable')
    const cuentaMap = new Map(all.map((c: any) => [c.id, c]))
    return all.map(c => ({
      ...c,
      cuentaPadre: c.cuentaPadreId ? cuentaMap.get(c.cuentaPadreId) || null : null,
      subcuentas: all.filter((s: any) => s.cuentaPadreId === c.id),
    })).sort((a: any, b: any) => (a.codigo || '').localeCompare(b.codigo || ''))
  },
  getById: async (id: number): Promise<any> => {
    const uuid = getUuidById('cuentaContable', id)
    if (!uuid) { await getAllEntities('cuentaContable') }
    const finalUuid = getUuidById('cuentaContable', id)
    if (!finalUuid) throw new Error('Cuenta not found')
    return await getEntity('cuentaContable', finalUuid)
  },
  create: async (data: any): Promise<any> => {
    return await createEntity('cuentaContable', { ...data, activo: data.activo ?? true, esSistema: data.esSistema ?? false })
  },
  update: async (id: number, data: any): Promise<any> => {
    return await updateEntity('cuentaContable', id, data)
  },
  delete: async (id: number): Promise<void> => {
    await deleteEntity('cuentaContable', id)
  },
  seedPGC: async (): Promise<{ seeded: boolean; count?: number; message?: string }> => {
    // For cloud, PGC seeding would need to create all account entities
    // This is a simplified version - the full PGC can be imported later
    const existing = await getAllEntities('cuentaContable')
    if (existing.length > 0) {
      return { seeded: false, message: 'Already has accounts' }
    }
    return { seeded: false, message: 'PGC seeding not available for cloud empresas. Import from local empresa instead.' }
  },
}

export const ejercicios = {
  getAll: async (): Promise<any[]> => {
    const all = await getAllEntities('ejercicioFiscal')
    return all.sort((a: any, b: any) => b.anio - a.anio)
  },
  create: async (data: { anio: number }): Promise<any> => {
    return await createEntity('ejercicioFiscal', {
      anio: data.anio,
      fechaInicio: `${data.anio}-01-01T00:00:00.000Z`,
      fechaFin: `${data.anio}-12-31T23:59:59.999Z`,
      estado: 'abierto',
    })
  },
  getOrCreateCurrent: async (): Promise<any> => {
    const currentYear = new Date().getFullYear()
    const all = await getAllEntities('ejercicioFiscal')
    const found = all.find((e: any) => e.anio === currentYear)
    if (found) return found
    return await ejercicios.create({ anio: currentYear })
  },
  update: async (id: number, data: any): Promise<any> => {
    return await updateEntity('ejercicioFiscal', id, data)
  },
  delete: async (id: number): Promise<void> => {
    await deleteEntity('ejercicioFiscal', id)
  },
  getStats: async (id: number): Promise<any> => {
    const uuid = getUuidById('ejercicioFiscal', id)
    if (!uuid) { await getAllEntities('ejercicioFiscal') }
    const finalUuid = getUuidById('ejercicioFiscal', id)
    if (!finalUuid) throw new Error('Ejercicio not found')
    const ejercicio = await getEntity('ejercicioFiscal', finalUuid)

    const asientos = await getAllEntities('asiento')
    const lineas = await getAllEntities('lineaAsiento')
    const facturas = await getAllEntities('factura')
    const gastosList = await getAllEntities('gasto')

    const ejAsientos = asientos.filter((a: any) => a.ejercicioId === id)
    const ejLineas = lineas.filter((l: any) => ejAsientos.some((a: any) => a.id === l.asientoId))

    const fechaInicio = new Date(ejercicio.fechaInicio)
    const fechaFin = new Date(ejercicio.fechaFin)
    const ejFacturas = facturas.filter((f: any) => {
      const fecha = new Date(f.fecha)
      return fecha >= fechaInicio && fecha <= fechaFin
    })
    const ejGastos = gastosList.filter((g: any) => {
      const fecha = new Date(g.fecha)
      return fecha >= fechaInicio && fecha <= fechaFin
    })

    const totalDebe = ejLineas.reduce((sum: number, l: any) => sum + (l.debe || 0), 0)
    const totalHaber = ejLineas.reduce((sum: number, l: any) => sum + (l.haber || 0), 0)
    const asientosPorTipo: Record<string, number> = {}
    for (const a of ejAsientos) {
      asientosPorTipo[a.tipo] = (asientosPorTipo[a.tipo] || 0) + 1
    }
    const totalFacturado = ejFacturas.reduce((sum: number, f: any) => sum + (f.total || 0), 0)
    const facturasPagadas = ejFacturas.filter((f: any) => f.estado === 'pagada').reduce((sum: number, f: any) => sum + (f.total || 0), 0)
    const facturasPendientes = ejFacturas.filter((f: any) => f.estado !== 'pagada').reduce((sum: number, f: any) => sum + (f.total || 0), 0)
    const totalGastos = ejGastos.reduce((sum: number, g: any) => sum + (g.monto || 0), 0)

    return {
      ejercicio,
      totalAsientos: ejAsientos.length,
      totalDebe,
      totalHaber,
      asientosPorTipo,
      totalFacturado,
      facturasPagadas,
      facturasPendientes,
      totalFacturas: ejFacturas.length,
      totalGastos,
      numGastos: ejGastos.length,
      resultado: totalFacturado - totalGastos,
    }
  },
}

export const asientos = {
  getAll: async (filters?: { ejercicioId?: number; tipo?: string; fechaDesde?: string; fechaHasta?: string }): Promise<any[]> => {
    const all = await getAllEntities('asiento')
    const lineas = await getAllEntities('lineaAsiento')
    const cuentasList = await getAllEntities('cuentaContable')
    const cuentaMap = new Map(cuentasList.map((c: any) => [c.id, c]))

    let filtered = all
    if (filters?.ejercicioId) filtered = filtered.filter((a: any) => a.ejercicioId === filters.ejercicioId)
    if (filters?.tipo) filtered = filtered.filter((a: any) => a.tipo === filters.tipo)
    if (filters?.fechaDesde) filtered = filtered.filter((a: any) => new Date(a.fecha) >= new Date(filters.fechaDesde!))
    if (filters?.fechaHasta) filtered = filtered.filter((a: any) => new Date(a.fecha) <= new Date(filters.fechaHasta!))

    return filtered.map(a => ({
      ...a,
      lineas: lineas
        .filter((l: any) => l.asientoId === a.id)
        .map((l: any) => ({ ...l, cuenta: l.cuentaId ? cuentaMap.get(l.cuentaId) || null : null })),
    })).sort((a: any, b: any) => a.numero - b.numero)
  },
  getById: async (id: number): Promise<any> => {
    const uuid = getUuidById('asiento', id)
    if (!uuid) { await getAllEntities('asiento') }
    const finalUuid = getUuidById('asiento', id)
    if (!finalUuid) throw new Error('Asiento not found')
    const asiento = await getEntity('asiento', finalUuid)
    const lineas = await getAllEntities('lineaAsiento')
    const cuentasList = await getAllEntities('cuentaContable')
    const cuentaMap = new Map(cuentasList.map((c: any) => [c.id, c]))
    return {
      ...asiento,
      lineas: lineas
        .filter((l: any) => l.asientoId === id)
        .map((l: any) => ({ ...l, cuenta: l.cuentaId ? cuentaMap.get(l.cuentaId) || null : null })),
    }
  },
  create: async (data: any): Promise<any> => {
    const { lineas, ...asientoData } = data
    const asiento = await createEntity('asiento', asientoData)
    if (lineas && Array.isArray(lineas)) {
      for (const linea of lineas) {
        await createEntity('lineaAsiento', { ...linea, asientoId: asiento.id })
      }
    }
    return asiento
  },
  update: async (id: number, data: any): Promise<any> => {
    const { lineas, ...asientoData } = data
    const updated = await updateEntity('asiento', id, asientoData)
    if (lineas && Array.isArray(lineas)) {
      const existingLineas = await getAllEntities('lineaAsiento')
      const oldLineas = existingLineas.filter((l: any) => l.asientoId === id)
      for (const old of oldLineas) {
        await deleteEntity('lineaAsiento', old.id)
      }
      for (const linea of lineas) {
        await createEntity('lineaAsiento', { ...linea, asientoId: id })
      }
    }
    return updated
  },
  delete: async (id: number): Promise<void> => {
    const lineas = await getAllEntities('lineaAsiento')
    const asientoLineas = lineas.filter((l: any) => l.asientoId === id)
    for (const l of asientoLineas) {
      await deleteEntity('lineaAsiento', l.id)
    }
    await deleteEntity('asiento', id)
  },
}

export const contabilidad = {
  libroMayor: async (params: { cuentaId: number; ejercicioId: number; fechaDesde?: string; fechaHasta?: string }): Promise<any> => {
    const cuenta = await cuentas.getById(params.cuentaId)
    const asientosList = await asientos.getAll({ ejercicioId: params.ejercicioId })
    const lineas: any[] = []

    for (const a of asientosList) {
      const fecha = new Date(a.fecha)
      if (params.fechaDesde && fecha < new Date(params.fechaDesde)) continue
      if (params.fechaHasta && fecha > new Date(params.fechaHasta)) continue
      for (const l of (a.lineas || [])) {
        if (l.cuentaId === params.cuentaId) {
          lineas.push({ ...l, asiento: a })
        }
      }
    }

    let saldo = 0
    const movimientos = lineas.map(l => {
      saldo += (l.debe || 0) - (l.haber || 0)
      return { ...l, saldo }
    })

    return {
      cuenta,
      movimientos,
      totalDebe: movimientos.reduce((s: number, m: any) => s + (m.debe || 0), 0),
      totalHaber: movimientos.reduce((s: number, m: any) => s + (m.haber || 0), 0),
      saldoFinal: saldo,
    }
  },
  generarAsientoFactura: async (facturaId: number): Promise<any> => {
    // Simplified - generates a basic accounting entry from invoice
    const factura = await facturas.getById(facturaId)
    if (!factura) throw new Error('Factura not found')
    const ejercicio = await ejercicios.getOrCreateCurrent()
    const allAsientos = await getAllEntities('asiento')
    const ejAsientos = allAsientos.filter((a: any) => a.ejercicioId === ejercicio.id)
    const nextNum = ejAsientos.length > 0 ? Math.max(...ejAsientos.map((a: any) => a.numero)) + 1 : 1

    return await asientos.create({
      numero: nextNum,
      fecha: factura.fecha,
      descripcion: `Factura ${factura.numero} - ${factura.cliente?.nombre || ''}`,
      tipo: 'factura',
      documentoRef: factura.numero,
      facturaId: factura.id,
      ejercicioId: ejercicio.id,
      lineas: [
        { cuentaId: null, debe: factura.total, haber: 0, concepto: 'Cobro factura' },
        { cuentaId: null, debe: 0, haber: factura.subtotal, concepto: 'Venta' },
        ...(factura.totalImpuestos > 0 ? [{ cuentaId: null, debe: 0, haber: factura.totalImpuestos, concepto: 'IVA repercutido' }] : []),
      ],
    })
  },
  generarAsientoGasto: async (gastoId: number): Promise<any> => {
    const gasto = await gastos.getById(gastoId)
    if (!gasto) throw new Error('Gasto not found')
    const ejercicio = await ejercicios.getOrCreateCurrent()
    const allAsientos = await getAllEntities('asiento')
    const ejAsientos = allAsientos.filter((a: any) => a.ejercicioId === ejercicio.id)
    const nextNum = ejAsientos.length > 0 ? Math.max(...ejAsientos.map((a: any) => a.numero)) + 1 : 1

    return await asientos.create({
      numero: nextNum,
      fecha: gasto.fecha,
      descripcion: `Gasto: ${gasto.descripcion}`,
      tipo: 'gasto',
      gastoId: gasto.id,
      ejercicioId: ejercicio.id,
      lineas: [
        { cuentaId: null, debe: gasto.monto, haber: 0, concepto: gasto.descripcion },
        { cuentaId: null, debe: 0, haber: gasto.monto, concepto: 'Pago gasto' },
      ],
    })
  },
}

export const modelos = {
  modelo303: async (params: { ejercicioId: number; trimestre: number }): Promise<any> => {
    const ejercicio = await ejercicios.getAll().then(all => all.find((e: any) => e.id === params.ejercicioId))
    if (!ejercicio) throw new Error('Ejercicio not found')

    const trimestre = params.trimestre
    const anio = ejercicio.anio
    const mesInicio = (trimestre - 1) * 3
    const fechaDesde = `${anio}-${String(mesInicio + 1).padStart(2, '0')}-01`
    const mesFin = mesInicio + 3
    const lastDay = mesFin === 12 ? 31 : new Date(anio, mesFin, 0).getDate()
    const fechaHasta = `${anio}-${String(mesFin).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const allFacturas = await getAllEntities('factura')
    const allGastos = await getAllEntities('gasto')
    const allImpuestos = await getAllEntities('impuesto')
    const impMap = new Map(allImpuestos.map((i: any) => [i.id, i]))

    const periodFacturas = allFacturas.filter((f: any) => {
      const d = new Date(f.fecha)
      return d >= new Date(fechaDesde) && d <= new Date(fechaHasta + 'T23:59:59')
    })
    const periodGastos = allGastos.filter((g: any) => {
      const d = new Date(g.fecha)
      return d >= new Date(fechaDesde) && d <= new Date(fechaHasta + 'T23:59:59')
    })

    const ivaDevengado = periodFacturas.reduce((s: number, f: any) => s + (f.totalImpuestos || 0), 0)
    const ivaDeducible = periodGastos.reduce((s: number, g: any) => {
      if (g.impuestoId && g.impuestoIncluido) {
        const imp = impMap.get(g.impuestoId)
        if (imp && imp.tipo === 'IVA') {
          return s + (g.monto * imp.porcentaje / (100 + imp.porcentaje))
        }
      }
      return s
    }, 0)

    const resultado = ivaDevengado - ivaDeducible

    return {
      trimestre,
      anio,
      periodo: `${trimestre}T ${anio}`,
      fechaDesde,
      fechaHasta,
      ivaDevengado,
      ivaDeducible,
      resultado,
      aIngresar: resultado > 0 ? resultado : 0,
      aCompensar: resultado < 0 ? Math.abs(resultado) : 0,
      desgloseDevengado: {},
      desgloseDeducible: {},
    }
  },
  modelo111: async (params: { ejercicioId: number; trimestre: number }): Promise<any> => {
    const ejercicio = await ejercicios.getAll().then(all => all.find((e: any) => e.id === params.ejercicioId))
    if (!ejercicio) throw new Error('Ejercicio not found')

    const trimestre = params.trimestre
    const anio = ejercicio.anio

    // Simplified model 111
    return {
      trimestre,
      anio,
      periodo: `${trimestre}T ${anio}`,
      totalRetenciones: 0,
      numPerceptores: 0,
      baseRetenciones: 0,
    }
  },
  modelo390: async (params: { ejercicioId: number }): Promise<any> => {
    const ejercicio = await ejercicios.getAll().then(all => all.find((e: any) => e.id === params.ejercicioId))
    if (!ejercicio) throw new Error('Ejercicio not found')

    const trimestres = []
    let totalDevengado = 0
    let totalDeducible = 0

    for (let t = 1; t <= 4; t++) {
      const data = await modelos.modelo303({ ejercicioId: params.ejercicioId, trimestre: t })
      trimestres.push({
        trimestre: t,
        devengado: data.ivaDevengado,
        deducible: data.ivaDeducible,
        resultado: data.resultado,
      })
      totalDevengado += data.ivaDevengado
      totalDeducible += data.ivaDeducible
    }

    return {
      anio: ejercicio.anio,
      trimestres,
      totalDevengado,
      totalDeducible,
      resultado: totalDevengado - totalDeducible,
    }
  },
}

// ============================================
// Dashboard (computed client-side)
// ============================================

export const dashboard = {
  getStats: async (): Promise<any> => {
    const [clientesList, facturasList, gastosList] = await Promise.all([
      getAllEntities('cliente'),
      getAllEntities('factura'),
      getAllEntities('gasto'),
    ])

    const clientesActivos = clientesList.filter((c: any) => c.activo !== false).length
    const facturasPagadas = facturasList.filter((f: any) => f.estado === 'pagada')
    const facturasPendientes = facturasList.filter((f: any) => f.estado === 'emitida' || f.estado === 'borrador')
    const ingresos = facturasPagadas.reduce((s: number, f: any) => s + (f.total || 0), 0)
    const gastosTotal = gastosList.reduce((s: number, g: any) => s + (g.monto || 0), 0)

    return {
      clientesActivos,
      ingresosTotales: ingresos,
      facturasPendientesCount: facturasPendientes.length,
      facturasPendientesTotal: facturasPendientes.reduce((s: number, f: any) => s + (f.total || 0), 0),
      gastosTotales: gastosTotal,
      balanceNeto: ingresos - gastosTotal,
      facturasEmitidas: facturasList.length,
      gastosRegistrados: gastosList.length,
    }
  },
  getRecentActivity: async (): Promise<any[]> => {
    const [facturasList, gastosList, clientesList] = await Promise.all([
      getAllEntities('factura'),
      getAllEntities('gasto'),
      getAllEntities('cliente'),
    ])
    const clienteMap = new Map(clientesList.map((c: any) => [c.id, c]))

    const activities = [
      ...facturasList.slice(-5).map((f: any) => ({
        id: f.id,
        tipo: 'factura' as const,
        descripcion: `Factura #${f.numero} - ${clienteMap.get(f.clienteId)?.nombre || ''}`,
        monto: f.total,
        fecha: f.createdAt,
      })),
      ...gastosList.slice(-5).map((g: any) => ({
        id: g.id,
        tipo: 'gasto' as const,
        descripcion: g.descripcion,
        monto: g.monto,
        fecha: g.createdAt,
      })),
      ...clientesList.slice(-3).map((c: any) => ({
        id: c.id,
        tipo: 'cliente' as const,
        descripcion: `Nuevo cliente: ${c.nombre}`,
        fecha: c.createdAt,
      })),
    ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 10)

    return activities
  },
  getPendingInvoices: async (): Promise<any[]> => {
    const facturasList = await getAllEntities('factura')
    const clientesList = await getAllEntities('cliente')
    const clienteMap = new Map(clientesList.map((c: any) => [c.id, c]))

    return facturasList
      .filter((f: any) => f.estado === 'emitida' || f.estado === 'borrador')
      .map((f: any) => ({ ...f, cliente: clienteMap.get(f.clienteId) || null }))
      .sort((a: any, b: any) => {
        const aDate = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : Infinity
        const bDate = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : Infinity
        return aDate - bDate
      })
      .slice(0, 10)
  },
}

// ============================================
// Logo (stored as encrypted file on server)
// ============================================

export const logo = {
  upload: async (fileData: { data: number[]; nombre: string; tipoMime: string }): Promise<{ path: string }> => {
    const cfg = requireConfig()
    const fileBuffer = Buffer.from(fileData.data)
    const fileBlob = encryptBinary(fileBuffer)
    const metadataBlob = encryptEntity({
      nombre: fileData.nombre,
      tipoMime: fileData.tipoMime,
    })

    // Delete existing logo first
    try {
      await makeRequest<any>({
        method: 'DELETE',
        path: `/api/v1/empresas/${cfg.empresaId}/files/empresa-logo`,
      })
    } catch { /* may not exist */ }

    await makeRequest<any>({
      method: 'POST',
      path: `/api/v1/empresas/${cfg.empresaId}/files`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_uuid: 'empresa-config',
        file_uuid: 'empresa-logo',
        encrypted_data: fileBlob.encrypted_data,
        iv: fileBlob.iv,
        auth_tag: fileBlob.auth_tag,
        encrypted_metadata: metadataBlob.encrypted_data,
        metadata_iv: metadataBlob.iv,
        metadata_auth_tag: metadataBlob.auth_tag,
      }),
    })

    return { path: 'cloud://empresa-logo' }
  },
  read: async (): Promise<{ data: number[]; tipoMime: string } | null> => {
    const cfg = requireConfig()
    try {
      const fileData = await makeRequest<ServerFile>({
        method: 'GET',
        path: `/api/v1/empresas/${cfg.empresaId}/files/empresa-logo`,
      })

      const decryptedData = decryptBinary({
        encrypted_data: fileData.encrypted_data!,
        iv: fileData.iv!,
        auth_tag: fileData.auth_tag!,
      })

      const metadata = decryptEntity({
        encrypted_data: fileData.encrypted_metadata,
        iv: fileData.metadata_iv,
        auth_tag: fileData.metadata_auth_tag,
      })

      return {
        data: Array.from(decryptedData),
        tipoMime: metadata.tipoMime || 'image/png',
      }
    } catch {
      return null
    }
  },
  delete: async (): Promise<void> => {
    const cfg = requireConfig()
    try {
      await makeRequest<any>({
        method: 'DELETE',
        path: `/api/v1/empresas/${cfg.empresaId}/files/empresa-logo`,
      })
    } catch { /* may not exist */ }
  },
}

// ============================================
// RRHH: Departamentos
// ============================================

export const departamentos = {
  getAll: async (): Promise<any[]> => {
    const all = await getAllEntities('departamento')
    let empleadosList: any[] = []
    try { empleadosList = await getAllEntities('empleado') } catch { /* non-critical */ }
    return all.map(d => ({
      ...d,
      activo: d.activo ?? true,
      _count: { empleados: empleadosList.filter((e: any) => e.departamentoId === d.id).length },
    })).sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || ''))
  },
  create: async (data: any): Promise<any> => {
    return await createEntity('departamento', { nombre: data.nombre, activo: data.activo ?? true })
  },
  update: async (id: number, data: any): Promise<any> => {
    return await updateEntity('departamento', id, data)
  },
  delete: async (id: number): Promise<void> => {
    await deleteEntity('departamento', id)
  },
}

// ============================================
// RRHH: Empleados
// ============================================

export const empleados = {
  getAll: async (): Promise<any[]> => {
    const all = await getAllEntities('empleado')
    let deptos: any[] = []
    let contratos: any[] = []
    try { deptos = await getAllEntities('departamento') } catch { /* non-critical */ }
    try { contratos = await getAllEntities('contrato') } catch { /* non-critical */ }
    const deptoMap = new Map(deptos.map((d: any) => [d.id, d]))
    return all.map(e => ({
      ...e,
      activo: e.activo ?? true,
      departamento: e.departamentoId ? deptoMap.get(e.departamentoId) || null : null,
      contratos: contratos.filter((c: any) => c.empleadoId === e.id && c.activo).slice(0, 1),
    })).sort((a: any, b: any) => (a.apellidos || '').localeCompare(b.apellidos || '') || (a.nombre || '').localeCompare(b.nombre || ''))
  },
  getById: async (id: number): Promise<any> => {
    const uuid = getUuidById('empleado', id)
    if (!uuid) { await getAllEntities('empleado') }
    const finalUuid = getUuidById('empleado', id)
    if (!finalUuid) throw new Error('Empleado not found')
    const empleado = await getEntity('empleado', finalUuid)
    let deptos: any[] = [], contratos: any[] = [], nominas: any[] = [], ausencias: any[] = [], tiposAusencia: any[] = []
    try { deptos = await getAllEntities('departamento') } catch { /* */ }
    try { contratos = await getAllEntities('contrato') } catch { /* */ }
    try { nominas = await getAllEntities('nomina') } catch { /* */ }
    try { ausencias = await getAllEntities('ausencia') } catch { /* */ }
    try { tiposAusencia = await getAllEntities('tipoAusencia') } catch { /* */ }
    const tipoMap = new Map(tiposAusencia.map((t: any) => [t.id, t]))
    const deptoMap = new Map(deptos.map((d: any) => [d.id, d]))
    return {
      ...empleado,
      departamento: empleado.departamentoId ? deptoMap.get(empleado.departamentoId) || null : null,
      contratos: contratos.filter((c: any) => c.empleadoId === id).sort((a: any, b: any) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime()),
      nominas: nominas.filter((n: any) => n.empleadoId === id).sort((a: any, b: any) => b.anio - a.anio || b.mes - a.mes).slice(0, 12),
      ausencias: ausencias.filter((a: any) => a.empleadoId === id).map((a: any) => ({ ...a, tipoAusencia: tipoMap.get(a.tipoAusenciaId) || null })).sort((a: any, b: any) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime()).slice(0, 10),
    }
  },
  create: async (data: any): Promise<any> => {
    const entity = await createEntity('empleado', {
      ...data, activo: data.activo ?? true, pais: data.pais || 'España',
      grupoCotizacion: data.grupoCotizacion || 1, porcentajeIRPF: data.porcentajeIRPF || 0,
      diasVacacionesAnuales: data.diasVacacionesAnuales || 30,
      fechaAlta: data.fechaAlta || new Date().toISOString(),
    })
    try {
      const deptos = await getAllEntities('departamento')
      const deptoMap = new Map(deptos.map((d: any) => [d.id, d]))
      return { ...entity, departamento: entity.departamentoId ? deptoMap.get(entity.departamentoId) || null : null, contratos: [] }
    } catch {
      return { ...entity, departamento: null, contratos: [] }
    }
  },
  update: async (id: number, data: any): Promise<any> => {
    const updated = await updateEntity('empleado', id, data)
    try {
      const deptos = await getAllEntities('departamento')
      const deptoMap = new Map(deptos.map((d: any) => [d.id, d]))
      return { ...updated, departamento: updated.departamentoId ? deptoMap.get(updated.departamentoId) || null : null }
    } catch {
      return { ...updated, departamento: null }
    }
  },
  delete: async (id: number): Promise<void> => {
    // Also delete related contratos, nominas, ausencias, jornada
    const contratos = await getAllEntities('contrato')
    const nominas = await getAllEntities('nomina')
    const ausencias = await getAllEntities('ausencia')
    const jornadas = await getAllEntities('registroJornada')
    for (const c of contratos.filter((c: any) => c.empleadoId === id)) await deleteEntity('contrato', c.id)
    for (const n of nominas.filter((n: any) => n.empleadoId === id)) await deleteEntity('nomina', n.id)
    for (const a of ausencias.filter((a: any) => a.empleadoId === id)) await deleteEntity('ausencia', a.id)
    for (const j of jornadas.filter((j: any) => j.empleadoId === id)) await deleteEntity('registroJornada', j.id)
    await deleteEntity('empleado', id)
  },
}

// ============================================
// RRHH: Contratos
// ============================================

export const contratos = {
  getByEmpleado: async (empleadoId: number): Promise<any[]> => {
    const all = await getAllEntities('contrato')
    return all.filter((c: any) => c.empleadoId === empleadoId).sort((a: any, b: any) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime())
  },
  create: async (data: any): Promise<any> => {
    return await createEntity('contrato', {
      ...data, activo: data.activo ?? true, tipoContrato: data.tipoContrato || 'indefinido',
      jornada: data.jornada || 'completa', horasSemanales: data.horasSemanales || 40,
      numPagasExtra: data.numPagasExtra ?? 2, pagasProrrateadas: data.pagasProrrateadas ?? false,
      porcentajeATEP: data.porcentajeATEP ?? 1.50,
    })
  },
  update: async (id: number, data: any): Promise<any> => {
    return await updateEntity('contrato', id, data)
  },
  delete: async (id: number): Promise<void> => {
    await deleteEntity('contrato', id)
  },
}

// ============================================
// RRHH: Nóminas
// ============================================

export const nominas = {
  getAll: async (filters?: { empleadoId?: number; mes?: number; anio?: number; estado?: string }): Promise<any[]> => {
    const all = await getAllEntities('nomina')
    const empleadosAll = await getAllEntities('empleado')
    const lineasAll = await getAllEntities('lineaNomina')
    const empMap = new Map(empleadosAll.map((e: any) => [e.id, { id: e.id, nombre: e.nombre, apellidos: e.apellidos, nif: e.nif }]))
    let filtered = all
    if (filters?.empleadoId) filtered = filtered.filter((n: any) => n.empleadoId === filters.empleadoId)
    if (filters?.mes) filtered = filtered.filter((n: any) => n.mes === filters.mes)
    if (filters?.anio) filtered = filtered.filter((n: any) => n.anio === filters.anio)
    if (filters?.estado) filtered = filtered.filter((n: any) => n.estado === filters.estado)
    return filtered.map(n => ({
      ...n,
      empleado: empMap.get(n.empleadoId) || null,
      lineas: lineasAll.filter((l: any) => l.nominaId === n.id).sort((a: any, b: any) => (a.orden || 0) - (b.orden || 0)),
    })).sort((a: any, b: any) => b.anio - a.anio || b.mes - a.mes)
  },
  getById: async (id: number): Promise<any> => {
    const uuid = getUuidById('nomina', id)
    if (!uuid) { await getAllEntities('nomina') }
    const finalUuid = getUuidById('nomina', id)
    if (!finalUuid) throw new Error('Nomina not found')
    const nomina = await getEntity('nomina', finalUuid)
    const empleadosAll = await getAllEntities('empleado')
    const lineasAll = await getAllEntities('lineaNomina')
    const emp = empleadosAll.find((e: any) => e.id === nomina.empleadoId)
    return {
      ...nomina,
      empleado: emp || null,
      lineas: lineasAll.filter((l: any) => l.nominaId === id).sort((a: any, b: any) => (a.orden || 0) - (b.orden || 0)),
    }
  },
  create: async (data: any): Promise<any> => {
    const lineas = data.lineas || []
    const nominaData = { ...data, estado: 'borrador' }
    delete nominaData.lineas
    const nomina = await createEntity('nomina', nominaData)
    // Create lineas
    for (const l of lineas) {
      await createEntity('lineaNomina', { ...l, nominaId: nomina.id })
    }
    const empleadosAll = await getAllEntities('empleado')
    const emp = empleadosAll.find((e: any) => e.id === nomina.empleadoId)
    return { ...nomina, empleado: emp || null, lineas }
  },
  confirmar: async (id: number): Promise<any> => {
    return await updateEntity('nomina', id, { estado: 'confirmada' })
  },
  marcarPagada: async (id: number): Promise<any> => {
    return await updateEntity('nomina', id, { estado: 'pagada', fechaPago: new Date().toISOString() })
  },
  delete: async (id: number): Promise<void> => {
    // Delete related lineas first
    const lineasAll = await getAllEntities('lineaNomina')
    for (const l of lineasAll.filter((l: any) => l.nominaId === id)) {
      await deleteEntity('lineaNomina', l.id)
    }
    await deleteEntity('nomina', id)
  },
}

// ============================================
// RRHH: SEPA
// ============================================

export const sepa = {
  getLotes: async (): Promise<any[]> => {
    const all = await getAllEntities('loteSEPA')
    return all.sort((a: any, b: any) => new Date(b.fechaCreacion || b.createdAt).getTime() - new Date(a.fechaCreacion || a.createdAt).getTime())
  },
  createLote: async (data: any): Promise<any> => {
    return await createEntity('loteSEPA', data)
  },
  updateEstado: async (id: number, estado: string): Promise<any> => {
    return await updateEntity('loteSEPA', id, { estado })
  },
  deleteLote: async (id: number): Promise<void> => {
    await deleteEntity('loteSEPA', id)
  },
}

// ============================================
// RRHH: Tipos de Ausencia
// ============================================

export const tiposAusencia = {
  getAll: async (): Promise<any[]> => {
    const all = await getAllEntities('tipoAusencia')
    return all.sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || ''))
  },
  create: async (data: any): Promise<any> => {
    return await createEntity('tipoAusencia', {
      nombre: data.nombre, codigo: data.codigo,
      descontaSalario: data.descontaSalario ?? false,
      requiereAprobacion: data.requiereAprobacion ?? true,
      color: data.color || '#3B82F6', activo: data.activo ?? true,
    })
  },
  update: async (id: number, data: any): Promise<any> => {
    return await updateEntity('tipoAusencia', id, data)
  },
  delete: async (id: number): Promise<void> => {
    await deleteEntity('tipoAusencia', id)
  },
}

// ============================================
// RRHH: Ausencias
// ============================================

export const ausencias = {
  getAll: async (filters?: { empleadoId?: number; estado?: string; fechaDesde?: string; fechaHasta?: string }): Promise<any[]> => {
    const all = await getAllEntities('ausencia')
    const empleadosAll = await getAllEntities('empleado')
    const tiposAll = await getAllEntities('tipoAusencia')
    const empMap = new Map(empleadosAll.map((e: any) => [e.id, { id: e.id, nombre: e.nombre, apellidos: e.apellidos }]))
    const tipoMap = new Map(tiposAll.map((t: any) => [t.id, t]))
    let filtered = all
    if (filters?.empleadoId) filtered = filtered.filter((a: any) => a.empleadoId === filters.empleadoId)
    if (filters?.estado) filtered = filtered.filter((a: any) => a.estado === filters.estado)
    if (filters?.fechaDesde) filtered = filtered.filter((a: any) => new Date(a.fechaInicio) >= new Date(filters.fechaDesde!))
    if (filters?.fechaHasta) filtered = filtered.filter((a: any) => new Date(a.fechaInicio) <= new Date(filters.fechaHasta!))
    return filtered.map(a => ({
      ...a,
      empleado: empMap.get(a.empleadoId) || null,
      tipoAusencia: tipoMap.get(a.tipoAusenciaId) || null,
    })).sort((a: any, b: any) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime())
  },
  create: async (data: any): Promise<any> => {
    const ausencia = await createEntity('ausencia', {
      ...data, estado: data.estado || 'pendiente',
    })
    const empleadosAll = await getAllEntities('empleado')
    const tiposAll = await getAllEntities('tipoAusencia')
    const emp = empleadosAll.find((e: any) => e.id === ausencia.empleadoId)
    const tipo = tiposAll.find((t: any) => t.id === ausencia.tipoAusenciaId)
    return { ...ausencia, empleado: emp ? { id: emp.id, nombre: emp.nombre, apellidos: emp.apellidos } : null, tipoAusencia: tipo || null }
  },
  updateEstado: async (id: number, estado: string): Promise<any> => {
    const updated = await updateEntity('ausencia', id, { estado })
    const empleadosAll = await getAllEntities('empleado')
    const tiposAll = await getAllEntities('tipoAusencia')
    const emp = empleadosAll.find((e: any) => e.id === updated.empleadoId)
    const tipo = tiposAll.find((t: any) => t.id === updated.tipoAusenciaId)
    return { ...updated, empleado: emp ? { id: emp.id, nombre: emp.nombre, apellidos: emp.apellidos } : null, tipoAusencia: tipo || null }
  },
  delete: async (id: number): Promise<void> => {
    await deleteEntity('ausencia', id)
  },
}

// ============================================
// RRHH: Control de Jornada
// ============================================

export const jornada = {
  getAll: async (filters?: { empleadoId?: number; fechaDesde?: string; fechaHasta?: string }): Promise<any[]> => {
    const all = await getAllEntities('registroJornada')
    const empleadosAll = await getAllEntities('empleado')
    const empMap = new Map(empleadosAll.map((e: any) => [e.id, { id: e.id, nombre: e.nombre, apellidos: e.apellidos }]))
    let filtered = all
    if (filters?.empleadoId) filtered = filtered.filter((r: any) => r.empleadoId === filters.empleadoId)
    if (filters?.fechaDesde) filtered = filtered.filter((r: any) => new Date(r.fecha) >= new Date(filters.fechaDesde!))
    if (filters?.fechaHasta) filtered = filtered.filter((r: any) => new Date(r.fecha) <= new Date(filters.fechaHasta!))
    return filtered.map(r => ({
      ...r,
      empleado: empMap.get(r.empleadoId) || null,
    })).sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
  },
  fichar: async (data: { empleadoId: number; tipo: 'entrada' | 'salida' }): Promise<any> => {
    const all = await getAllEntities('registroJornada')
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    let registro = all.find((r: any) => r.empleadoId === data.empleadoId && (r.fecha || '').startsWith(todayStr))

    if (data.tipo === 'entrada') {
      if (registro) {
        return await updateEntity('registroJornada', registro.id, { horaEntrada: now.toISOString() })
      } else {
        return await createEntity('registroJornada', { empleadoId: data.empleadoId, fecha: todayStr, horaEntrada: now.toISOString(), horasTrabajadas: 0, horasExtra: 0, pausaMinutos: 0 })
      }
    } else {
      if (!registro) throw new Error('noEntryToday')
      const horaEntrada = registro.horaEntrada ? new Date(registro.horaEntrada) : null
      let horasTrabajadas = 0
      if (horaEntrada) {
        horasTrabajadas = Math.round(((now.getTime() - horaEntrada.getTime()) / 3600000 - (registro.pausaMinutos || 0) / 60) * 100) / 100
      }
      const horasExtra = Math.max(0, Math.round((horasTrabajadas - 8) * 100) / 100)
      return await updateEntity('registroJornada', registro.id, { horaSalida: now.toISOString(), horasTrabajadas, horasExtra })
    }
  },
  update: async (id: number, data: any): Promise<any> => {
    return await updateEntity('registroJornada', id, data)
  },
  delete: async (id: number): Promise<void> => {
    await deleteEntity('registroJornada', id)
  },
  resumenMensual: async (params: { mes: number; anio: number }): Promise<any[]> => {
    const empleadosAll = await getAllEntities('empleado')
    const registrosAll = await getAllEntities('registroJornada')
    const activos = empleadosAll.filter((e: any) => e.activo !== false)
    const fechaDesde = new Date(params.anio, params.mes - 1, 1)
    const fechaHasta = new Date(params.anio, params.mes, 0, 23, 59, 59)
    const registrosMes = registrosAll.filter((r: any) => {
      const f = new Date(r.fecha)
      return f >= fechaDesde && f <= fechaHasta
    })
    return activos.map((emp: any) => {
      const regs = registrosMes.filter((r: any) => r.empleadoId === emp.id)
      const totalHoras = regs.reduce((s: number, r: any) => s + (r.horasTrabajadas || 0), 0)
      const totalExtra = regs.reduce((s: number, r: any) => s + (r.horasExtra || 0), 0)
      return {
        empleadoId: emp.id, nombre: `${emp.apellidos}, ${emp.nombre}`,
        diasTrabajados: regs.filter((r: any) => (r.horasTrabajadas || 0) > 0).length,
        totalHoras: Math.round(totalHoras * 100) / 100,
        totalHorasExtra: Math.round(totalExtra * 100) / 100,
      }
    }).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre))
  },
}

// ============================================
// Empresa Management
// ============================================

export const empresaCloud = {
  list: async (): Promise<CloudEmpresaInfo[]> => {
    requireConfig()
    const result = await makeRequest<{ data: CloudEmpresaInfo[] }>({
      method: 'GET',
      path: '/api/v1/empresas',
    })
    return result.data
  },
  create: async (data: { nombre_encrypted: string; salt: string; verification_hash: string }): Promise<CloudEmpresaInfo> => {
    return await makeRequest<CloudEmpresaInfo>({
      method: 'POST',
      path: '/api/v1/empresas',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },
  delete: async (empresaId: number): Promise<void> => {
    await makeRequest<any>({
      method: 'DELETE',
      path: `/api/v1/empresas/${empresaId}`,
    })
  },
  join: async (code: string): Promise<CloudEmpresaInfo> => {
    return await makeRequest<CloudEmpresaInfo>({
      method: 'POST',
      path: '/api/v1/empresas/join',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.toUpperCase() }),
    })
  },
  getUsers: async (empresaId: number): Promise<CloudEmpresaUser[]> => {
    const result = await makeRequest<{ data: CloudEmpresaUser[] }>({
      method: 'GET',
      path: `/api/v1/empresas/${empresaId}/users`,
    })
    return result.data
  },
  inviteUser: async (empresaId: number, role?: string): Promise<CloudInvitation> => {
    return await makeRequest<CloudInvitation>({
      method: 'POST',
      path: `/api/v1/empresas/${empresaId}/users/invite`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: role || 'editor' }),
    })
  },
  removeUser: async (empresaId: number, userId: number): Promise<void> => {
    await makeRequest<any>({
      method: 'DELETE',
      path: `/api/v1/empresas/${empresaId}/users/${userId}`,
    })
  },
  updateUserRole: async (empresaId: number, userId: number, role: string): Promise<void> => {
    await makeRequest<any>({
      method: 'PUT',
      path: `/api/v1/empresas/${empresaId}/users/${userId}/role`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
  },
}

// ============================================
// Test-only exports (internal functions for unit testing)
// ============================================
export const __test__ = {
  getNextId,
  registerEntity,
  buildIdMapsFromEntities,
  getIdMap,
  getReverseIdMap,
  getCacheForType,
  setCacheForType,
  updateCacheEntity,
  removeCacheEntity,
  getUuidById,
  get idCounters() { return idCounters },
  get entityCaches() { return entityCaches },
  resetState() {
    idMaps.clear()
    reverseIdMaps.clear()
    idCounters.clear()
    entityCaches.clear()
  },
}
