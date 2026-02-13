import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { app, safeStorage, systemPreferences } from 'electron'

// Configuración de encriptación
const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 16 // 128 bits
const AUTH_TAG_LENGTH = 16 // 128 bits
const SALT_LENGTH = 32
const PBKDF2_ITERATIONS = 100000 // Iteraciones para derivación de clave

// ============================================
// Custom Data Path Configuration
// ============================================

// El archivo de configuración de ruta se guarda en el userData por defecto
// para que siempre sea accesible, incluso si la ruta personalizada no está disponible
const getDefaultDataPath = () => app.getPath('userData')
const getCustomPathConfigFile = () => path.join(getDefaultDataPath(), 'data-path.json')

interface CustomPathConfig {
  customDataPath: string | null
  configuredAt?: string
}

// ============================================
// Multi-Empresa Support
// ============================================

export interface EmpresaInfo {
  id: string
  nombre: string
  dataPath: string | null  // null = {userData}/empresas/{id}/
  creadaEn: string
}

export interface EmpresasConfig {
  empresas: EmpresaInfo[]
  ultimaEmpresaId: string | null
}

let activeEmpresa: EmpresaInfo | null = null

const getEmpresasConfigFile = () => path.join(getDefaultDataPath(), 'empresas.json')

export function getEmpresaDataPath(empresa: EmpresaInfo): string {
  if (empresa.dataPath) {
    return empresa.dataPath
  }
  return path.join(getDefaultDataPath(), 'empresas', empresa.id)
}

export function loadEmpresasConfig(): EmpresasConfig {
  const configFile = getEmpresasConfigFile()
  if (!fs.existsSync(configFile)) {
    return { empresas: [], ultimaEmpresaId: null }
  }
  try {
    const content = fs.readFileSync(configFile, 'utf-8')
    return JSON.parse(content) as EmpresasConfig
  } catch {
    return { empresas: [], ultimaEmpresaId: null }
  }
}

export function saveEmpresasConfig(config: EmpresasConfig): void {
  const defaultPath = getDefaultDataPath()
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true })
  }
  fs.writeFileSync(getEmpresasConfigFile(), JSON.stringify(config, null, 2))
}

export function setActiveEmpresa(empresa: EmpresaInfo | null): void {
  activeEmpresa = empresa
}

export function getActiveEmpresa(): EmpresaInfo | null {
  return activeEmpresa
}

export function createEmpresa(nombre: string, customDataPath?: string): EmpresaInfo {
  const config = loadEmpresasConfig()
  const empresa: EmpresaInfo = {
    id: crypto.randomUUID(),
    nombre,
    dataPath: customDataPath || null,
    creadaEn: new Date().toISOString(),
  }

  // Crear directorio de datos
  const dataDir = getEmpresaDataPath(empresa)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  const attachmentsDir = path.join(dataDir, 'attachments')
  if (!fs.existsSync(attachmentsDir)) {
    fs.mkdirSync(attachmentsDir, { recursive: true })
  }

  config.empresas.push(empresa)
  config.ultimaEmpresaId = empresa.id
  saveEmpresasConfig(config)

  return empresa
}

export function renameEmpresa(id: string, nombre: string): void {
  const config = loadEmpresasConfig()
  const empresa = config.empresas.find(e => e.id === id)
  if (empresa) {
    empresa.nombre = nombre
    saveEmpresasConfig(config)
  }
}

export function deleteEmpresaData(id: string): { success: boolean; error?: string } {
  try {
    const config = loadEmpresasConfig()
    const empresa = config.empresas.find(e => e.id === id)
    if (!empresa) {
      return { success: false, error: 'Empresa no encontrada' }
    }

    // Eliminar directorio de datos si es ruta por defecto (dentro de empresas/)
    if (!empresa.dataPath) {
      const dataDir = getEmpresaDataPath(empresa)
      if (fs.existsSync(dataDir)) {
        fs.rmSync(dataDir, { recursive: true, force: true })
      }
    }

    // Eliminar de la configuración
    config.empresas = config.empresas.filter(e => e.id !== id)
    if (config.ultimaEmpresaId === id) {
      config.ultimaEmpresaId = config.empresas.length > 0 ? config.empresas[0].id : null
    }
    saveEmpresasConfig(config)

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export function updateEmpresaDataPath(id: string, newPath: string | null): void {
  const config = loadEmpresasConfig()
  const empresa = config.empresas.find(e => e.id === id)
  if (empresa) {
    empresa.dataPath = newPath
    saveEmpresasConfig(config)
    // Actualizar activeEmpresa si es la misma
    if (activeEmpresa && activeEmpresa.id === id) {
      activeEmpresa.dataPath = newPath
    }
  }
}

/**
 * Detecta datos legacy (instalación pre-multiempresa) y migra a empresas.json
 */
export function checkAndMigrateLegacy(): { migrated: boolean; config: EmpresasConfig } {
  const config = loadEmpresasConfig()

  // Si ya hay empresas, no migrar
  if (config.empresas.length > 0) {
    return { migrated: false, config }
  }

  // Buscar datos legacy en la ruta actual (custom o default)
  const legacyPath = getCustomDataPath() || getDefaultDataPath()
  const legacyAuth = path.join(legacyPath, 'auth.json')
  const legacyDb = path.join(legacyPath, 'database.db.enc')

  if (fs.existsSync(legacyAuth) || fs.existsSync(legacyDb)) {
    // Crear empresa apuntando a la ruta legacy (NO mover archivos)
    const empresa: EmpresaInfo = {
      id: crypto.randomUUID(),
      nombre: 'Mi Empresa',
      dataPath: legacyPath,  // Apunta directamente a donde están los datos
      creadaEn: new Date().toISOString(),
    }

    config.empresas.push(empresa)
    config.ultimaEmpresaId = empresa.id
    saveEmpresasConfig(config)

    return { migrated: true, config }
  }

  return { migrated: false, config }
}

/**
 * Carga la configuración de ruta personalizada
 */
function loadCustomPathConfig(): CustomPathConfig | null {
  const configFile = getCustomPathConfigFile()
  if (!fs.existsSync(configFile)) {
    return null
  }
  try {
    const content = fs.readFileSync(configFile, 'utf-8')
    return JSON.parse(content) as CustomPathConfig
  } catch {
    return null
  }
}

/**
 * Guarda la configuración de ruta personalizada
 */
function saveCustomPathConfig(config: CustomPathConfig): void {
  const defaultPath = getDefaultDataPath()
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true })
  }
  fs.writeFileSync(getCustomPathConfigFile(), JSON.stringify(config, null, 2))
}

/**
 * Obtiene la ruta de datos personalizada (si está configurada)
 */
export function getCustomDataPath(): string | null {
  const config = loadCustomPathConfig()
  if (config?.customDataPath) {
    // Verificar que la ruta existe y es accesible
    try {
      if (fs.existsSync(config.customDataPath)) {
        return config.customDataPath
      }
    } catch {
      // La ruta no es accesible (USB desconectado, etc.)
    }
  }
  return null
}

/**
 * Establece la ruta de datos personalizada
 */
export function setCustomDataPath(newPath: string | null): { success: boolean; error?: string } {
  try {
    if (newPath) {
      // Verificar que la ruta existe
      if (!fs.existsSync(newPath)) {
        return { success: false, error: 'La ruta especificada no existe' }
      }
      // Verificar que es un directorio
      const stat = fs.statSync(newPath)
      if (!stat.isDirectory()) {
        return { success: false, error: 'La ruta especificada no es un directorio' }
      }
      // Verificar permisos de escritura
      try {
        const testFile = path.join(newPath, '.write-test')
        fs.writeFileSync(testFile, 'test')
        fs.unlinkSync(testFile)
      } catch {
        return { success: false, error: 'No hay permisos de escritura en la ruta especificada' }
      }
    }

    saveCustomPathConfig({
      customDataPath: newPath,
      configuredAt: new Date().toISOString()
    })

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * Obtiene la ruta de datos por defecto del sistema
 */
export function getDefaultPath(): string {
  return getDefaultDataPath()
}

// Rutas de archivos - usa empresa activa, o fallback a ruta legacy
const getDataPath = (): string => {
  if (activeEmpresa) {
    return getEmpresaDataPath(activeEmpresa)
  }
  // Fallback legacy (pre-multiempresa)
  return getCustomDataPath() || getDefaultDataPath()
}
const getAuthFilePath = () => path.join(getDataPath(), 'auth.json')
const getPasskeyFilePath = () => path.join(getDataPath(), 'passkey.enc')
const getDbPath = () => path.join(getDataPath(), 'database.db')
const getEncryptedDbPath = () => path.join(getDataPath(), 'database.db.enc')
const getPrismaDbPath = () => {
  if (app.isPackaged) {
    return path.join(getDataPath(), 'dev.db')
  }
  return path.join(process.cwd(), 'prisma', 'dev.db')
}
const getAttachmentsDir = () => path.join(getDataPath(), 'attachments')

interface AuthConfig {
  salt: string // Base64
  passwordHash: string // Base64 - Hash para verificar contraseña
  verificationSalt: string // Base64 - Salt separado para verificación
  createdAt: string
  lastAccess?: string
  passkeyEnabled?: boolean // Si passkey está habilitado
}

/**
 * Deriva una clave de encriptación desde una contraseña usando PBKDF2
 */
export function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512')
}

/**
 * Genera un hash de verificación de contraseña
 */
function generatePasswordHash(password: string, salt: Buffer): string {
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha512')
  return hash.toString('base64')
}

/**
 * Encripta datos usando AES-256-GCM
 */
export function encrypt(data: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Formato: IV (16 bytes) + AuthTag (16 bytes) + Encrypted Data
  return Buffer.concat([iv, authTag, encrypted])
}

/**
 * Desencripta datos usando AES-256-GCM
 */
export function decrypt(encryptedData: Buffer, key: Buffer): Buffer {
  const iv = encryptedData.subarray(0, IV_LENGTH)
  const authTag = encryptedData.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const data = encryptedData.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(data), decipher.final()])
}

/**
 * Verifica si ya existe una configuración de autenticación
 */
export function isAuthConfigured(): boolean {
  return fs.existsSync(getAuthFilePath())
}

/**
 * Obtiene la configuración de autenticación
 */
export function getAuthConfig(): AuthConfig | null {
  const authPath = getAuthFilePath()
  if (!fs.existsSync(authPath)) {
    return null
  }

  try {
    const content = fs.readFileSync(authPath, 'utf-8')
    return JSON.parse(content) as AuthConfig
  } catch {
    return null
  }
}

/**
 * Guarda la configuración de autenticación
 */
function saveAuthConfig(config: AuthConfig): void {
  const dataPath = getDataPath()
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true })
  }
  fs.writeFileSync(getAuthFilePath(), JSON.stringify(config, null, 2))
}

/**
 * Configura una nueva contraseña (primer uso o cambio de contraseña)
 */
export function setupPassword(password: string): { success: boolean; error?: string } {
  try {
    // Validar contraseña
    if (password.length < 4) {
      return { success: false, error: 'La contraseña debe tener al menos 4 caracteres' }
    }

    // Generar sales aleatorias
    const salt = crypto.randomBytes(SALT_LENGTH)
    const verificationSalt = crypto.randomBytes(SALT_LENGTH)

    // Generar hash de verificación
    const passwordHash = generatePasswordHash(password, verificationSalt)

    // Guardar configuración
    const authConfig: AuthConfig = {
      salt: salt.toString('base64'),
      passwordHash,
      verificationSalt: verificationSalt.toString('base64'),
      createdAt: new Date().toISOString(),
      passkeyEnabled: false
    }

    saveAuthConfig(authConfig)

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * Verifica la contraseña
 */
export function verifyPassword(password: string): boolean {
  const config = getAuthConfig()
  if (!config) {
    return false
  }

  const verificationSalt = Buffer.from(config.verificationSalt, 'base64')
  const expectedHash = config.passwordHash
  const actualHash = generatePasswordHash(password, verificationSalt)

  // Comparación en tiempo constante para prevenir timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expectedHash, 'base64'),
    Buffer.from(actualHash, 'base64')
  )
}

/**
 * Obtiene la clave de encriptación derivada de la contraseña
 */
export function getEncryptionKey(password: string): Buffer | null {
  const config = getAuthConfig()
  if (!config) {
    return null
  }

  const salt = Buffer.from(config.salt, 'base64')
  return deriveKey(password, salt)
}

// ============================================
// Passkey / Biometric Support
// ============================================

/**
 * Verifica si el sistema soporta autenticación biométrica
 */
export function isBiometricSupported(): boolean {
  // En macOS, verificar si Touch ID está disponible
  if (process.platform === 'darwin') {
    return systemPreferences.canPromptTouchID()
  }
  // En otros sistemas, usar safeStorage como fallback
  return safeStorage.isEncryptionAvailable()
}

/**
 * Verifica si el sistema soporta passkeys (safeStorage)
 */
export function isPasskeySupported(): boolean {
  // Requiere tanto safeStorage como biometría
  return safeStorage.isEncryptionAvailable() && isBiometricSupported()
}

/**
 * Verifica si hay un passkey configurado
 */
export function isPasskeyEnabled(): boolean {
  const config = getAuthConfig()
  return config?.passkeyEnabled === true && fs.existsSync(getPasskeyFilePath())
}

/**
 * Configura passkey - guarda la contraseña encriptada con safeStorage del sistema
 * Esto permite usar Touch ID, Face ID, Windows Hello para desbloquear
 */
export function setupPasskey(password: string): { success: boolean; error?: string } {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return { success: false, error: 'Almacenamiento seguro no disponible' }
    }

    if (!isBiometricSupported()) {
      return { success: false, error: 'Autenticación biométrica no disponible en este dispositivo' }
    }

    // Verificar que la contraseña es correcta primero
    if (!verifyPassword(password)) {
      return { success: false, error: 'Contraseña incorrecta' }
    }

    // Encriptar la contraseña con safeStorage (usa keychain del sistema)
    const encryptedPassword = safeStorage.encryptString(password)

    // Guardar el password encriptado
    const dataPath = getDataPath()
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true })
    }
    fs.writeFileSync(getPasskeyFilePath(), encryptedPassword)

    // Actualizar config
    const config = getAuthConfig()
    if (config) {
      config.passkeyEnabled = true
      saveAuthConfig(config)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * Solicita autenticación biométrica (Touch ID en macOS)
 * Esta función es ASYNC porque Touch ID es una operación asíncrona
 */
export async function promptBiometric(reason: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (process.platform === 'darwin') {
      // macOS - usar Touch ID
      if (!systemPreferences.canPromptTouchID()) {
        return { success: false, error: 'Touch ID no disponible' }
      }

      await systemPreferences.promptTouchID(reason)
      return { success: true }
    } else if (process.platform === 'win32') {
      // Windows - por ahora retornamos success, en futuro implementar Windows Hello
      // Windows Hello requiere módulos nativos adicionales
      return { success: true }
    } else {
      // Linux u otros - no hay soporte biométrico nativo en Electron
      return { success: false, error: 'Autenticación biométrica no soportada en esta plataforma' }
    }
  } catch (error) {
    // El usuario canceló o falló la autenticación
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Detectar si el usuario canceló
    if (errorMessage.includes('cancel') || errorMessage.includes('Cancel')) {
      return { success: false, error: 'Autenticación cancelada' }
    }

    return { success: false, error: `Error de autenticación: ${errorMessage}` }
  }
}

/**
 * Obtiene la contraseña usando passkey (requiere autenticación biométrica)
 * Esta función es ASYNC porque requiere autenticación biométrica
 */
export async function unlockWithPasskey(): Promise<{ success: boolean; password?: string; error?: string }> {
  try {
    if (!isPasskeyEnabled()) {
      return { success: false, error: 'Passkey no configurado' }
    }

    if (!safeStorage.isEncryptionAvailable()) {
      return { success: false, error: 'Almacenamiento seguro no disponible' }
    }

    const passkeyPath = getPasskeyFilePath()
    if (!fs.existsSync(passkeyPath)) {
      return { success: false, error: 'Archivo de passkey no encontrado' }
    }

    // PRIMERO: Solicitar autenticación biométrica
    const biometricResult = await promptBiometric('Desbloquear CryptoGest')
    if (!biometricResult.success) {
      return { success: false, error: biometricResult.error || 'Autenticación biométrica fallida' }
    }

    // DESPUÉS: Si la biometría fue exitosa, desencriptar la contraseña
    try {
      const encryptedPassword = fs.readFileSync(passkeyPath)
      const password = safeStorage.decryptString(encryptedPassword)
      return { success: true, password }
    } catch (decryptError) {
      // Error de desencriptación - el passkey está corrupto o fue creado en otro contexto
      // Deshabilitamos el passkey automáticamente para permitir login con contraseña
      console.error('Error al desencriptar passkey, deshabilitando:', decryptError)
      disablePasskey()
      return {
        success: false,
        error: 'Passkey corrupto o inválido. Se ha deshabilitado. Por favor, usa tu contraseña.'
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * Deshabilita passkey
 */
export function disablePasskey(): { success: boolean; error?: string } {
  try {
    const passkeyPath = getPasskeyFilePath()
    if (fs.existsSync(passkeyPath)) {
      fs.unlinkSync(passkeyPath)
    }

    const config = getAuthConfig()
    if (config) {
      config.passkeyEnabled = false
      saveAuthConfig(config)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

// ============================================
// Database Encryption
// ============================================

/**
 * Encripta el archivo de base de datos
 */
export function encryptDatabase(password: string): { success: boolean; error?: string } {
  try {
    const key = getEncryptionKey(password)
    if (!key) {
      return { success: false, error: 'No se pudo derivar la clave de encriptación' }
    }

    // Buscar el archivo de base de datos
    let dbPath = getPrismaDbPath()
    if (!fs.existsSync(dbPath)) {
      dbPath = getDbPath()
    }

    if (!fs.existsSync(dbPath)) {
      // No hay base de datos para encriptar (primera vez)
      return { success: true }
    }

    // Leer y encriptar
    const dbData = fs.readFileSync(dbPath)
    const encryptedData = encrypt(dbData, key)

    // Guardar archivo encriptado
    fs.writeFileSync(getEncryptedDbPath(), encryptedData)

    // Eliminar archivo no encriptado de forma segura
    fs.unlinkSync(dbPath)

    // Actualizar último acceso
    const config = getAuthConfig()
    if (config) {
      config.lastAccess = new Date().toISOString()
      saveAuthConfig(config)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * Desencripta el archivo de base de datos
 */
export function decryptDatabase(password: string): { success: boolean; error?: string } {
  try {
    const encryptedPath = getEncryptedDbPath()

    // Si no existe archivo encriptado, puede ser primera vez o ya está desencriptado
    if (!fs.existsSync(encryptedPath)) {
      return { success: true }
    }

    const key = getEncryptionKey(password)
    if (!key) {
      return { success: false, error: 'No se pudo derivar la clave de encriptación' }
    }

    // Leer y desencriptar
    const encryptedData = fs.readFileSync(encryptedPath)

    try {
      const decryptedData = decrypt(encryptedData, key)

      // Guardar archivo desencriptado en la ubicación de Prisma
      const dbPath = getPrismaDbPath()

      // Asegurar que existe el directorio
      const dbDir = path.dirname(dbPath)
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true })
      }

      fs.writeFileSync(dbPath, decryptedData)

      return { success: true }
    } catch (decryptError) {
      return { success: false, error: 'Contraseña incorrecta o datos corruptos' }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * Cambia la contraseña
 */
export function changePassword(currentPassword: string, newPassword: string): { success: boolean; error?: string } {
  // Verificar contraseña actual
  if (!verifyPassword(currentPassword)) {
    return { success: false, error: 'Contraseña actual incorrecta' }
  }

  // Desencriptar con contraseña actual
  const decryptResult = decryptDatabase(currentPassword)
  if (!decryptResult.success) {
    return decryptResult
  }

  // Si tenía passkey, deshabilitarlo (tendrá que reconfigurarlo)
  if (isPasskeyEnabled()) {
    disablePasskey()
  }

  // Configurar nueva contraseña
  const setupResult = setupPassword(newPassword)
  if (!setupResult.success) {
    return setupResult
  }

  // Encriptar con nueva contraseña
  return encryptDatabase(newPassword)
}

/**
 * Verifica la integridad del sistema de autenticación
 */
export function checkAuthIntegrity(): {
  isConfigured: boolean
  hasEncryptedDb: boolean
  hasDecryptedDb: boolean
  passkeySupported: boolean
  passkeyEnabled: boolean
  biometricAvailable: boolean
} {
  return {
    isConfigured: isAuthConfigured(),
    hasEncryptedDb: fs.existsSync(getEncryptedDbPath()),
    hasDecryptedDb: fs.existsSync(getPrismaDbPath()) || fs.existsSync(getDbPath()),
    passkeySupported: isPasskeySupported(),
    passkeyEnabled: isPasskeyEnabled(),
    biometricAvailable: isBiometricSupported()
  }
}

// ============================================
// File Encryption for Attachments
// ============================================

/**
 * Obtiene el directorio de adjuntos
 */
export function getAttachmentsDirPath(): string {
  const dir = getAttachmentsDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Genera un nombre único para el archivo encriptado
 */
export function generateEncryptedFileName(): string {
  return `${crypto.randomUUID()}.enc`
}

/**
 * Encripta un archivo y lo guarda en el directorio de adjuntos
 */
export function encryptFile(
  fileData: Buffer,
  password: string
): { success: boolean; encryptedFileName?: string; error?: string } {
  try {
    const key = getEncryptionKey(password)
    if (!key) {
      return { success: false, error: 'No se pudo derivar la clave de encriptación' }
    }

    const encryptedData = encrypt(fileData, key)
    const encryptedFileName = generateEncryptedFileName()
    const filePath = path.join(getAttachmentsDirPath(), encryptedFileName)

    fs.writeFileSync(filePath, encryptedData)

    return { success: true, encryptedFileName }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * Desencripta un archivo del directorio de adjuntos
 */
export function decryptFile(
  encryptedFileName: string,
  password: string
): { success: boolean; data?: Buffer; error?: string } {
  try {
    const key = getEncryptionKey(password)
    if (!key) {
      return { success: false, error: 'No se pudo derivar la clave de encriptación' }
    }

    const filePath = path.join(getAttachmentsDirPath(), encryptedFileName)

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Archivo no encontrado' }
    }

    const encryptedData = fs.readFileSync(filePath)
    const decryptedData = decrypt(encryptedData, key)

    return { success: true, data: decryptedData }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * Elimina un archivo encriptado del directorio de adjuntos
 */
export function deleteEncryptedFile(encryptedFileName: string): { success: boolean; error?: string } {
  try {
    const filePath = path.join(getAttachmentsDirPath(), encryptedFileName)

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

// ============================================
// Data Path Migration
// ============================================

/**
 * Copia un directorio recursivamente
 */
function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }

  const entries = fs.readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * Migra todos los datos a una nueva ruta y actualiza la configuración
 * Esta función copia los datos y luego actualiza la ruta de datos
 */
export function migrateDataToPath(newPath: string): { success: boolean; error?: string } {
  try {
    // Verificar la nueva ruta
    if (!fs.existsSync(newPath)) {
      return { success: false, error: 'La ruta especificada no existe' }
    }

    const stat = fs.statSync(newPath)
    if (!stat.isDirectory()) {
      return { success: false, error: 'La ruta especificada no es un directorio' }
    }

    // Verificar permisos de escritura
    try {
      const testFile = path.join(newPath, '.write-test')
      fs.writeFileSync(testFile, 'test')
      fs.unlinkSync(testFile)
    } catch {
      return { success: false, error: 'No hay permisos de escritura en la ruta especificada' }
    }

    const currentPath = getDataPath()
    const targetPath = path.join(newPath, 'CryptoGest-Data')

    // Si la ruta actual es igual a la nueva, no hay nada que hacer
    if (currentPath === targetPath) {
      return { success: true }
    }

    // Crear el directorio de destino
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true })
    }

    // Archivos y carpetas a migrar
    const itemsToMigrate = [
      'auth.json',
      'passkey.enc',
      'database.db.enc',
      'attachments'
    ]

    // Copiar cada archivo/carpeta
    for (const item of itemsToMigrate) {
      const srcPath = path.join(currentPath, item)
      const destPath = path.join(targetPath, item)

      if (fs.existsSync(srcPath)) {
        const itemStat = fs.statSync(srcPath)
        if (itemStat.isDirectory()) {
          copyDirRecursive(srcPath, destPath)
        } else {
          // Asegurar que el directorio padre existe
          const destDir = path.dirname(destPath)
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true })
          }
          fs.copyFileSync(srcPath, destPath)
        }
      }
    }

    // Actualizar la configuración para usar la nueva ruta
    const setResult = setCustomDataPath(targetPath)
    if (!setResult.success) {
      return setResult
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * Restaura la ruta de datos a la ubicación por defecto
 */
export function resetToDefaultPath(): { success: boolean; error?: string } {
  return setCustomDataPath(null)
}

/**
 * Obtiene la ruta de datos actual (exportada para uso externo)
 */
export function getCurrentDataPath(): string {
  return getDataPath()
}

/**
 * Obtiene la ruta de la base de datos de Prisma (exportada para uso externo)
 */
export function getCurrentPrismaDbPath(): string {
  return getPrismaDbPath()
}
