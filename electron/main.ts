import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import nodeCrypto from 'crypto'
import archiver from 'archiver'
import AdmZip from 'adm-zip'
import { PrismaClient } from '@prisma/client'
import * as crypto from './crypto'
import * as cloud from './cloud'
import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { convert as htmlToText } from 'html-to-text'

// Establecer nombre de la aplicación
app.setName('CryptoGest')

// Estado de autenticación
let currentPassword: string | null = null
let isAuthenticated = false
let activeEmpresaId: string | null = null

// Prisma client - se inicializa después de la autenticación
let prisma: PrismaClient | null = null

function createPrismaClient(): PrismaClient {
  const dbPath = crypto.getCurrentPrismaDbPath()
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  console.log('[Prisma] DB path:', dbPath)
  console.log('[Prisma] Dir exists:', fs.existsSync(dir))
  console.log('[Prisma] isPackaged:', app.isPackaged)
  return new PrismaClient({
    datasources: {
      db: {
        url: `file:${dbPath}`
      }
    }
  })
}

// Crear todas las tablas del esquema si no existen (para nuevas empresas)
async function ensureDatabaseTables(db: PrismaClient) {
  // ---- Tablas base (sin dependencias FK externas) ----

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Impuesto" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "nombre" TEXT NOT NULL,
      "porcentaje" REAL NOT NULL,
      "tipo" TEXT NOT NULL DEFAULT 'IVA',
      "activo" INTEGER NOT NULL DEFAULT 1,
      "porDefecto" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Cliente" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "nombre" TEXT NOT NULL,
      "email" TEXT,
      "telefono" TEXT,
      "direccion" TEXT,
      "ciudad" TEXT,
      "codigoPostal" TEXT,
      "provincia" TEXT,
      "pais" TEXT NOT NULL DEFAULT 'España',
      "nif" TEXT,
      "notas" TEXT,
      "activo" INTEGER NOT NULL DEFAULT 1,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Cliente_nif_key" ON "Cliente"("nif")`)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CategoriaGasto" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "nombre" TEXT NOT NULL,
      "color" TEXT NOT NULL DEFAULT '#6B7280',
      "icono" TEXT NOT NULL DEFAULT 'receipt',
      "activo" INTEGER NOT NULL DEFAULT 1,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CategoriaGasto_nombre_key" ON "CategoriaGasto"("nombre")`)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Configuracion" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "clave" TEXT NOT NULL,
      "valor" TEXT NOT NULL,
      "tipo" TEXT NOT NULL DEFAULT 'string',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Configuracion_clave_key" ON "Configuracion"("clave")`)

  // ---- Tablas con dependencias FK ----

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Producto" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "codigo" TEXT,
      "nombre" TEXT NOT NULL,
      "descripcion" TEXT,
      "tipo" TEXT NOT NULL DEFAULT 'servicio',
      "precioBase" REAL NOT NULL,
      "impuestoId" INTEGER,
      "retencionId" INTEGER,
      "activo" INTEGER NOT NULL DEFAULT 1,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Producto_impuestoId_fkey" FOREIGN KEY ("impuestoId") REFERENCES "Impuesto" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "Producto_retencionId_fkey" FOREIGN KEY ("retencionId") REFERENCES "Impuesto" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Producto_codigo_key" ON "Producto"("codigo")`)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Factura" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "numero" TEXT NOT NULL,
      "serie" TEXT NOT NULL DEFAULT 'F',
      "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "fechaVencimiento" DATETIME,
      "clienteId" INTEGER NOT NULL,
      "subtotal" REAL NOT NULL,
      "totalImpuestos" REAL NOT NULL DEFAULT 0,
      "totalRetenciones" REAL NOT NULL DEFAULT 0,
      "total" REAL NOT NULL,
      "estado" TEXT NOT NULL DEFAULT 'borrador',
      "notas" TEXT,
      "formaPago" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Factura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Factura_numero_key" ON "Factura"("numero")`)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LineaFactura" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "facturaId" INTEGER NOT NULL,
      "productoId" INTEGER,
      "descripcion" TEXT NOT NULL,
      "cantidad" REAL NOT NULL DEFAULT 1,
      "precioUnit" REAL NOT NULL,
      "descuento" REAL NOT NULL DEFAULT 0,
      "impuestoId" INTEGER,
      "retencionId" INTEGER,
      "subtotal" REAL NOT NULL,
      "totalImpuesto" REAL NOT NULL DEFAULT 0,
      "totalRetencion" REAL NOT NULL DEFAULT 0,
      "total" REAL NOT NULL,
      CONSTRAINT "LineaFactura_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "LineaFactura_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "LineaFactura_impuestoId_fkey" FOREIGN KEY ("impuestoId") REFERENCES "Impuesto" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "LineaFactura_retencionId_fkey" FOREIGN KEY ("retencionId") REFERENCES "Impuesto" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Gasto" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "descripcion" TEXT NOT NULL,
      "categoriaId" INTEGER,
      "monto" REAL NOT NULL,
      "impuestoIncluido" INTEGER NOT NULL DEFAULT 1,
      "impuestoId" INTEGER,
      "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "proveedor" TEXT,
      "numeroFactura" TEXT,
      "notas" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Gasto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaGasto" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "Gasto_impuestoId_fkey" FOREIGN KEY ("impuestoId") REFERENCES "Impuesto" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AdjuntoGasto" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "gastoId" INTEGER NOT NULL,
      "nombreOriginal" TEXT NOT NULL,
      "nombreEncriptado" TEXT NOT NULL,
      "tipoMime" TEXT NOT NULL,
      "tamano" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AdjuntoGasto_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "AdjuntoGasto_nombreEncriptado_key" ON "AdjuntoGasto"("nombreEncriptado")`)

  // ---- Tablas de contabilidad ----

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CuentaContable" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "codigo" TEXT NOT NULL,
      "nombre" TEXT NOT NULL,
      "tipo" TEXT NOT NULL,
      "grupo" INTEGER NOT NULL,
      "nivel" INTEGER NOT NULL DEFAULT 1,
      "cuentaPadreId" INTEGER,
      "activo" INTEGER NOT NULL DEFAULT 1,
      "esSistema" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CuentaContable_cuentaPadreId_fkey" FOREIGN KEY ("cuentaPadreId") REFERENCES "CuentaContable" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CuentaContable_codigo_key" ON "CuentaContable"("codigo")`)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EjercicioFiscal" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "anio" INTEGER NOT NULL,
      "fechaInicio" DATETIME NOT NULL,
      "fechaFin" DATETIME NOT NULL,
      "estado" TEXT NOT NULL DEFAULT 'abierto',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EjercicioFiscal_anio_key" ON "EjercicioFiscal"("anio")`)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Asiento" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "numero" INTEGER NOT NULL,
      "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "descripcion" TEXT NOT NULL,
      "tipo" TEXT NOT NULL DEFAULT 'manual',
      "documentoRef" TEXT,
      "facturaId" INTEGER,
      "gastoId" INTEGER,
      "ejercicioId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Asiento_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "Asiento_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "Asiento_ejercicioId_fkey" FOREIGN KEY ("ejercicioId") REFERENCES "EjercicioFiscal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LineaAsiento" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "asientoId" INTEGER NOT NULL,
      "cuentaId" INTEGER NOT NULL,
      "debe" REAL NOT NULL DEFAULT 0,
      "haber" REAL NOT NULL DEFAULT 0,
      "concepto" TEXT,
      CONSTRAINT "LineaAsiento_asientoId_fkey" FOREIGN KEY ("asientoId") REFERENCES "Asiento" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "LineaAsiento_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaContable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `)

  // ---- Tablas de buzón de correo ----

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CuentaEmail" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "nombre" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "imapHost" TEXT NOT NULL,
      "imapPort" INTEGER NOT NULL DEFAULT 993,
      "imapSecure" INTEGER NOT NULL DEFAULT 1,
      "imapUser" TEXT NOT NULL,
      "imapPass" TEXT NOT NULL,
      "smtpHost" TEXT NOT NULL,
      "smtpPort" INTEGER NOT NULL DEFAULT 587,
      "smtpSecure" INTEGER NOT NULL DEFAULT 0,
      "smtpUser" TEXT NOT NULL,
      "smtpPass" TEXT NOT NULL,
      "fromName" TEXT NOT NULL DEFAULT '',
      "activo" INTEGER NOT NULL DEFAULT 1,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CarpetaEmail" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "cuentaId" INTEGER NOT NULL,
      "path" TEXT NOT NULL,
      "nombre" TEXT NOT NULL,
      "specialUse" TEXT,
      "totalMessages" INTEGER NOT NULL DEFAULT 0,
      "unseenMessages" INTEGER NOT NULL DEFAULT 0,
      "syncedAt" DATETIME,
      CONSTRAINT "CarpetaEmail_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaEmail" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CarpetaEmail_cuentaId_path_key" ON "CarpetaEmail"("cuentaId", "path")`)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CorreoCache" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "cuentaId" INTEGER NOT NULL,
      "carpetaId" INTEGER NOT NULL,
      "uid" INTEGER NOT NULL,
      "messageId" TEXT,
      "fromAddress" TEXT,
      "fromName" TEXT,
      "toAddress" TEXT,
      "subject" TEXT,
      "fecha" DATETIME,
      "hasAttachments" INTEGER NOT NULL DEFAULT 0,
      "seen" INTEGER NOT NULL DEFAULT 0,
      "flagged" INTEGER NOT NULL DEFAULT 0,
      "size" INTEGER NOT NULL DEFAULT 0,
      "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CorreoCache_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaEmail" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CorreoCache_carpetaId_fkey" FOREIGN KEY ("carpetaId") REFERENCES "CarpetaEmail" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CorreoCache_cuentaId_carpetaId_uid_key" ON "CorreoCache"("cuentaId", "carpetaId", "uid")`)
}

let mainWindow: BrowserWindow | null = null

// ============================================
// Protocol Handler for deep linking (cryptogest://)
// ============================================

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('cryptogest', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('cryptogest')
}

// Pending deep link data — processed after window loads + user authenticates
let pendingDeepLinkData: { token: string; server: string } | null = null
let rendererReady = false

// Windows/Linux: deep link arrives as argument on second-instance
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_, commandLine) => {
    const url = commandLine.find(arg => arg.startsWith('cryptogest://'))
    if (url) parseAndQueueDeepLink(url)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// macOS: deep link arrives as event
app.on('open-url', (event, url) => {
  event.preventDefault()
  parseAndQueueDeepLink(url)
})

function parseAndQueueDeepLink(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'cryptogest:') return

    if (parsed.hostname === 'connect' || parsed.pathname === '//connect') {
      const token = parsed.searchParams.get('token')
      const server = parsed.searchParams.get('server')
      if (token && server) {
        pendingDeepLinkData = { token, server }
        tryProcessDeepLink()
      }
    }
  } catch (e) {
    console.error('Error parsing deep link:', e)
  }
}

async function tryProcessDeepLink() {
  if (!pendingDeepLinkData) return
  if (!rendererReady) return // Wait until renderer has loaded
  if (!isAuthenticated || !prisma) return // Wait until user has unlocked the app

  const data = pendingDeepLinkData
  pendingDeepLinkData = null // Clear before async work to prevent double-processing

  try {
    console.log('[DeepLink] Confirming device link with server:', data.server)
    const response = await cloud.confirmDeviceLink(data.server, data.token)

    // Save config to database
    await prisma!.configuracion.upsert({
      where: { clave: 'cloud_server_url' },
      update: { valor: data.server },
      create: { clave: 'cloud_server_url', valor: data.server },
    })
    await prisma!.configuracion.upsert({
      where: { clave: 'cloud_token' },
      update: { valor: response.api_token },
      create: { clave: 'cloud_token', valor: response.api_token },
    })
    cloud.setCloudConfig(data.server, response.api_token)

    console.log('[DeepLink] Device linked successfully for user:', response.user.email)

    // Notify the renderer that connection succeeded (past tense — it's a result notification)
    if (mainWindow) {
      mainWindow.webContents.send('deep-link:connected', {
        success: true,
        user: response.user,
        server: data.server,
      })
    }
  } catch (error) {
    console.error('[DeepLink] Failed to confirm device link:', error)
    pendingDeepLinkData = null
    if (mainWindow) {
      mainWindow.webContents.send('deep-link:connected', {
        success: false,
        error: String(error),
      })
    }
  }
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, '../assets/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    // Ventana sin marco para pantalla de login más elegante (opcional)
    // frame: false,
    // titleBarStyle: 'hiddenInset',
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    // mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.on('did-finish-load', () => {
    rendererReady = true
    tryProcessDeepLink() // Process any queued deep link now that the page is loaded
  })
}

app.whenReady().then(() => {
  createWindow()

  // Check argv for Windows (first instance opened by deep link)
  const argUrl = process.argv.find(arg => arg.startsWith('cryptogest://'))
  if (argUrl) parseAndQueueDeepLink(argUrl)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Encriptar base de datos al cerrar la aplicación
app.on('before-quit', async () => {
  if (prisma) {
    await prisma.$disconnect()
    prisma = null
  }

  // Encriptar la base de datos si hay contraseña configurada
  if (currentPassword && crypto.isAuthConfigured()) {
    const result = crypto.encryptDatabase(currentPassword)
    if (!result.success) {
      console.error('Error al encriptar base de datos:', result.error)
    }
  }

  currentPassword = null
  isAuthenticated = false
})

// ============================================
// IPC Handlers - Empresas
// ============================================

ipcMain.handle('empresa:list', async () => {
  try {
    const { migrated, config } = crypto.checkAndMigrateLegacy()
    return {
      success: true,
      data: {
        empresas: config.empresas,
        ultimaEmpresaId: config.ultimaEmpresaId,
        needsMigration: migrated,
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empresa:create', async (_, data: { nombre: string; customDataPath?: string }) => {
  try {
    const empresa = crypto.createEmpresa(data.nombre, data.customDataPath)
    return { success: true, data: empresa }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empresa:getDefaultPath', async () => {
  try {
    return { success: true, data: { path: crypto.getDefaultPath() } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empresa:detectVolumes', async () => {
  try {
    const volumes: { name: string; path: string; available: boolean }[] = []

    if (process.platform === 'darwin') {
      const volumesDir = '/Volumes'
      if (fs.existsSync(volumesDir)) {
        const entries = fs.readdirSync(volumesDir)
        for (const name of entries) {
          const volumePath = path.join(volumesDir, name)
          // Filtrar el volumen del sistema
          try {
            const resolved = fs.realpathSync(volumePath)
            if (resolved === '/') continue
          } catch {
            // Si no se puede resolver, verificar nombres conocidos
            if (name === 'Macintosh HD' || name === 'Macintosh HD - Data') continue
          }

          // Verificar permisos de escritura
          let available = false
          try {
            const testFile = path.join(volumePath, `.cryptogest_write_test_${Date.now()}`)
            fs.writeFileSync(testFile, 'test')
            fs.unlinkSync(testFile)
            available = true
          } catch {
            available = false
          }

          volumes.push({ name, path: volumePath, available })
        }
      }
    }

    return { success: true, data: volumes }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empresa:selectDirectory', async () => {
  try {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar carpeta para datos de empresa',
      properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled || !result.filePaths[0]) {
      return { success: true, data: null }
    }

    const selectedPath = result.filePaths[0]

    // Verificar permisos de escritura
    const testFile = path.join(selectedPath, `.cryptogest_write_test_${Date.now()}`)
    try {
      fs.writeFileSync(testFile, 'test')
      fs.unlinkSync(testFile)
    } catch {
      return { success: false, error: 'No se tienen permisos de escritura en la carpeta seleccionada' }
    }

    return { success: true, data: { path: selectedPath } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empresa:select', async (_, id: string) => {
  try {
    // Si hay una empresa autenticada, bloquear primero
    if (isAuthenticated && prisma) {
      await prisma.$disconnect()
      prisma = null
      if (currentPassword && crypto.isAuthConfigured()) {
        crypto.encryptDatabase(currentPassword)
      }
      currentPassword = null
      isAuthenticated = false
    }

    // Buscar empresa
    const config = crypto.loadEmpresasConfig()
    const empresa = config.empresas.find(e => e.id === id)
    if (!empresa) {
      return { success: false, error: 'Empresa no encontrada' }
    }

    // Activar empresa
    crypto.setActiveEmpresa(empresa)
    activeEmpresaId = id

    // Actualizar última empresa
    config.ultimaEmpresaId = id
    crypto.saveEmpresasConfig(config)

    // Obtener estado de auth para esta empresa
    const integrity = crypto.checkAuthIntegrity()
    return {
      success: true,
      data: {
        empresa,
        authStatus: {
          isConfigured: integrity.isConfigured,
          hasEncryptedDb: integrity.hasEncryptedDb,
          isAuthenticated: false,
          passkeySupported: integrity.passkeySupported,
          passkeyEnabled: integrity.passkeyEnabled,
        }
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empresa:rename', async (_, id: string, nombre: string) => {
  try {
    crypto.renameEmpresa(id, nombre)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empresa:delete', async (_, id: string) => {
  try {
    // No permitir eliminar la empresa activa si está autenticada
    if (activeEmpresaId === id && isAuthenticated) {
      return { success: false, error: 'No se puede eliminar la empresa activa. Cambia a otra empresa primero.' }
    }
    const result = crypto.deleteEmpresaData(id)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    // Si era la activa (pero no autenticada), limpiar
    if (activeEmpresaId === id) {
      crypto.setActiveEmpresa(null)
      activeEmpresaId = null
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empresa:getActive', async () => {
  try {
    return { success: true, data: crypto.getActiveEmpresa() }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Autenticación
// ============================================

ipcMain.handle('auth:checkStatus', async () => {
  try {
    const integrity = crypto.checkAuthIntegrity()
    return {
      success: true,
      data: {
        isConfigured: integrity.isConfigured,
        hasEncryptedDb: integrity.hasEncryptedDb,
        isAuthenticated,
        passkeySupported: integrity.passkeySupported,
        passkeyEnabled: integrity.passkeyEnabled
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('auth:setup', async (_, password: string) => {
  try {
    // Configurar contraseña
    const setupResult = crypto.setupPassword(password)
    if (!setupResult.success) {
      return setupResult
    }

    // Guardar contraseña en memoria
    currentPassword = password
    isAuthenticated = true

    // Inicializar Prisma
    prisma = createPrismaClient()
    await prisma.$connect()
    await ensureDatabaseTables(prisma)

    // No encriptar aquí: prisma/dev.db debe permanecer en disco mientras la sesión esté activa.
    // Se encriptará automáticamente en auth:lock o before-quit.

    // Process any pending deep link now that we're authenticated
    tryProcessDeepLink()

    return { success: true }
  } catch (error) {
    const dbPath = crypto.getCurrentPrismaDbPath()
    console.error('[auth:setup] Error:', error)
    console.error('[auth:setup] DB path:', dbPath)
    console.error('[auth:setup] Dir exists:', fs.existsSync(path.dirname(dbPath)))
    return { success: false, error: `${String(error)} [path: ${dbPath}]` }
  }
})

ipcMain.handle('auth:unlock', async (_, password: string) => {
  try {
    // Verificar contraseña
    if (!crypto.verifyPassword(password)) {
      return { success: false, error: 'Contraseña incorrecta' }
    }

    // Desencriptar base de datos
    const decryptResult = crypto.decryptDatabase(password)
    if (!decryptResult.success) {
      return { success: false, error: decryptResult.error || 'Error al desencriptar' }
    }

    // Guardar contraseña en memoria
    currentPassword = password
    isAuthenticated = true

    // Inicializar Prisma
    prisma = createPrismaClient()
    await prisma.$connect()
    await ensureDatabaseTables(prisma)

    // Process any pending deep link now that we're authenticated
    tryProcessDeepLink()

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('auth:lock', async () => {
  try {
    if (prisma) {
      await prisma.$disconnect()
      prisma = null
    }

    // Encriptar base de datos
    if (currentPassword && crypto.isAuthConfigured()) {
      crypto.encryptDatabase(currentPassword)
    }

    currentPassword = null
    isAuthenticated = false

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('auth:changePassword', async (_, currentPwd: string, newPwd: string) => {
  try {
    const result = crypto.changePassword(currentPwd, newPwd)
    if (result.success) {
      currentPassword = newPwd
    }
    return result
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Passkey / Biometría
// ============================================

ipcMain.handle('auth:setupPasskey', async (_, password: string) => {
  try {
    // Verificar que la contraseña es correcta
    if (!crypto.verifyPassword(password)) {
      return { success: false, error: 'Contraseña incorrecta' }
    }

    const result = crypto.setupPasskey(password)
    return result
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('auth:unlockWithPasskey', async () => {
  try {
    // Obtener contraseña del passkey (ahora es async y pide autenticación biométrica)
    const passkeyResult = await crypto.unlockWithPasskey()
    if (!passkeyResult.success || !passkeyResult.password) {
      return { success: false, error: passkeyResult.error || 'Error al obtener passkey' }
    }

    const password = passkeyResult.password

    // Desencriptar base de datos
    const decryptResult = crypto.decryptDatabase(password)
    if (!decryptResult.success) {
      return { success: false, error: decryptResult.error || 'Error al desencriptar' }
    }

    // Guardar contraseña en memoria
    currentPassword = password
    isAuthenticated = true

    // Inicializar Prisma
    prisma = createPrismaClient()
    await prisma.$connect()
    await ensureDatabaseTables(prisma)

    // Process any pending deep link now that we're authenticated
    tryProcessDeepLink()

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('auth:disablePasskey', async () => {
  try {
    const result = crypto.disablePasskey()
    return result
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Middleware para verificar autenticación
function requireAuth() {
  if (!isAuthenticated || !prisma) {
    throw new Error('No autenticado')
  }
  return prisma
}

// ============================================
// IPC Handlers - Base de datos
// ============================================

ipcMain.handle('db:test', async () => {
  try {
    const db = requireAuth()
    await db.$connect()
    return { success: true, message: 'Conexión a base de datos exitosa' }
  } catch (error) {
    return { success: false, message: String(error) }
  }
})

// ============================================
// IPC Handlers - Clientes
// ============================================

ipcMain.handle('clientes:getAll', async () => {
  try {
    const db = requireAuth()
    const clientes = await db.cliente.findMany({
      include: {
        facturas: true
      },
      orderBy: { createdAt: 'desc' }
    })
    return { success: true, data: clientes }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('clientes:getById', async (_, id: number) => {
  try {
    const db = requireAuth()
    const cliente = await db.cliente.findUnique({
      where: { id },
      include: { facturas: true }
    })
    return { success: true, data: cliente }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('clientes:create', async (_, data: {
  nombre: string
  email?: string
  telefono?: string
  direccion?: string
  ciudad?: string
  codigoPostal?: string
  provincia?: string
  pais?: string
  nif?: string
  notas?: string
  activo?: boolean
}) => {
  try {
    const db = requireAuth()
    const cliente = await db.cliente.create({
      data,
      include: { facturas: true }
    })
    return { success: true, data: cliente }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('clientes:update', async (_, id: number, data: {
  nombre?: string
  email?: string
  telefono?: string
  direccion?: string
  ciudad?: string
  codigoPostal?: string
  provincia?: string
  pais?: string
  nif?: string
  notas?: string
  activo?: boolean
}) => {
  try {
    const db = requireAuth()
    const cliente = await db.cliente.update({
      where: { id },
      data,
      include: { facturas: true }
    })
    return { success: true, data: cliente }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('clientes:delete', async (_, id: number) => {
  try {
    const db = requireAuth()
    await db.cliente.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Facturas
// ============================================

ipcMain.handle('facturas:getAll', async () => {
  try {
    const db = requireAuth()
    const facturas = await db.factura.findMany({
      include: {
        cliente: true,
        lineas: {
          include: {
            producto: true,
            impuesto: true,
            retencion: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    return { success: true, data: facturas }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('facturas:getById', async (_, id: number) => {
  try {
    const db = requireAuth()
    const factura = await db.factura.findUnique({
      where: { id },
      include: {
        cliente: true,
        lineas: {
          include: {
            producto: true,
            impuesto: true,
            retencion: true
          }
        }
      }
    })
    return { success: true, data: factura }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('facturas:create', async (_, data: {
  clienteId: number
  serie?: string
  fecha?: Date
  fechaVencimiento?: Date | null
  subtotal: number
  totalImpuestos: number
  total: number
  notas?: string | null
  formaPago?: string | null
  lineas?: Array<{
    productoId?: number | null
    descripcion: string
    cantidad: number
    precioUnit: number
    descuento: number
    impuestoId?: number | null
    subtotal: number
    totalImpuesto: number
    total: number
  }>
}) => {
  try {
    const db = requireAuth()
    const { lineas, ...facturaData } = data

    // Generate invoice number
    const year = new Date().getFullYear()
    const serie = facturaData.serie || 'F'
    const lastFactura = await db.factura.findFirst({
      where: {
        serie,
        numero: {
          startsWith: `${serie}${year}`
        }
      },
      orderBy: { numero: 'desc' }
    })

    let nextNumber = 1
    if (lastFactura) {
      const parts = lastFactura.numero.split('-')
      if (parts.length > 1) {
        nextNumber = parseInt(parts[1]) + 1
      }
    }
    const numero = `${serie}${year}-${String(nextNumber).padStart(4, '0')}`

    const factura = await db.factura.create({
      data: {
        ...facturaData,
        numero,
        lineas: lineas ? {
          create: lineas
        } : undefined
      },
      include: {
        cliente: true,
        lineas: {
          include: {
            producto: true,
            impuesto: true,
            retencion: true
          }
        }
      }
    })
    return { success: true, data: factura }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('facturas:update', async (_, id: number, data: {
  clienteId?: number
  serie?: string
  fecha?: Date
  fechaVencimiento?: Date | null
  subtotal?: number
  totalImpuestos?: number
  total?: number
  notas?: string | null
  formaPago?: string | null
  lineas?: Array<{
    productoId?: number | null
    descripcion: string
    cantidad: number
    precioUnit: number
    descuento: number
    impuestoId?: number | null
    subtotal: number
    totalImpuesto: number
    total: number
  }>
}) => {
  try {
    const db = requireAuth()
    const { lineas, ...facturaData } = data

    // If lineas are provided, delete existing and create new ones
    if (lineas) {
      await db.lineaFactura.deleteMany({ where: { facturaId: id } })
    }

    const factura = await db.factura.update({
      where: { id },
      data: {
        ...facturaData,
        lineas: lineas ? {
          create: lineas
        } : undefined
      },
      include: {
        cliente: true,
        lineas: {
          include: {
            producto: true,
            impuesto: true,
            retencion: true
          }
        }
      }
    })
    return { success: true, data: factura }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('facturas:delete', async (_, id: number) => {
  try {
    const db = requireAuth()
    // Primero eliminar las líneas de factura
    await db.lineaFactura.deleteMany({ where: { facturaId: id } })
    // Luego eliminar la factura
    await db.factura.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('facturas:getNextNumber', async () => {
  try {
    const db = requireAuth()
    const year = new Date().getFullYear()
    const lastFactura = await db.factura.findFirst({
      where: {
        numero: {
          startsWith: String(year)
        }
      },
      orderBy: { numero: 'desc' }
    })

    let nextNumber = 1
    if (lastFactura) {
      const parts = lastFactura.numero.split('-')
      if (parts.length === 2) {
        nextNumber = parseInt(parts[1]) + 1
      }
    }

    const numero = `${year}-${String(nextNumber).padStart(3, '0')}`
    return { success: true, data: numero }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Gastos
// ============================================

ipcMain.handle('gastos:getAll', async () => {
  try {
    const db = requireAuth()
    const gastos = await db.gasto.findMany({
      include: { categoria: true, adjuntos: true, impuesto: true },
      orderBy: { fecha: 'desc' }
    })
    return { success: true, data: gastos }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('gastos:getById', async (_, id: number) => {
  try {
    const db = requireAuth()
    const gasto = await db.gasto.findUnique({
      where: { id },
      include: { categoria: true, adjuntos: true, impuesto: true }
    })
    return { success: true, data: gasto }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('gastos:create', async (_, data: {
  descripcion: string
  categoriaId?: number
  monto: number
  impuestoIncluido?: boolean
  impuestoId?: number | null
  fecha?: Date
  proveedor?: string
  numeroFactura?: string
  notas?: string
}) => {
  try {
    const db = requireAuth()
    const gasto = await db.gasto.create({
      data,
      include: { categoria: true, adjuntos: true, impuesto: true }
    })
    return { success: true, data: gasto }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('gastos:update', async (_, id: number, data: {
  descripcion?: string
  categoriaId?: number
  monto?: number
  impuestoIncluido?: boolean
  impuestoId?: number | null
  fecha?: Date
  proveedor?: string
  numeroFactura?: string
  notas?: string
}) => {
  try {
    const db = requireAuth()
    const gasto = await db.gasto.update({
      where: { id },
      data,
      include: { categoria: true, adjuntos: true, impuesto: true }
    })
    return { success: true, data: gasto }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('gastos:delete', async (_, id: number) => {
  try {
    const db = requireAuth()
    // Primero eliminar los archivos de adjuntos
    const adjuntos = await db.adjuntoGasto.findMany({ where: { gastoId: id } })
    for (const adj of adjuntos) {
      crypto.deleteEncryptedFile(adj.nombreEncriptado)
    }
    await db.gasto.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Adjuntos de Gastos
// ============================================

ipcMain.handle('adjuntos:upload', async (_, gastoId: number, fileData: {
  data: number[]
  nombre: string
  tipoMime: string
  tamano: number
}) => {
  try {
    const db = requireAuth()
    if (!currentPassword) {
      return { success: false, error: 'No autenticado' }
    }

    // Verificar que el gasto existe
    const gasto = await db.gasto.findUnique({ where: { id: gastoId } })
    if (!gasto) {
      return { success: false, error: 'Gasto no encontrado' }
    }

    // Convertir array de números a Buffer
    const buffer = Buffer.from(fileData.data)

    // Encriptar y guardar el archivo
    const encryptResult = crypto.encryptFile(buffer, currentPassword)
    if (!encryptResult.success || !encryptResult.encryptedFileName) {
      return { success: false, error: encryptResult.error || 'Error al encriptar archivo' }
    }

    // Crear registro en la base de datos
    const adjunto = await db.adjuntoGasto.create({
      data: {
        gastoId,
        nombreOriginal: fileData.nombre,
        nombreEncriptado: encryptResult.encryptedFileName,
        tipoMime: fileData.tipoMime,
        tamano: fileData.tamano
      }
    })

    console.log('[adjuntos:upload] Adjunto creado:', adjunto.id, adjunto.nombreOriginal)

    // Forzar checkpoint de SQLite para persistir cambios en disco
    await db.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')

    return { success: true, data: adjunto }
  } catch (error) {
    console.error('[adjuntos:upload] Error:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('adjuntos:download', async (_, adjuntoId: number) => {
  try {
    const db = requireAuth()
    if (!currentPassword) {
      return { success: false, error: 'No autenticado' }
    }

    // Obtener información del adjunto
    const adjunto = await db.adjuntoGasto.findUnique({ where: { id: adjuntoId } })
    if (!adjunto) {
      return { success: false, error: 'Adjunto no encontrado' }
    }

    // Desencriptar archivo
    const decryptResult = crypto.decryptFile(adjunto.nombreEncriptado, currentPassword)
    if (!decryptResult.success || !decryptResult.data) {
      return { success: false, error: decryptResult.error || 'Error al desencriptar archivo' }
    }

    return {
      success: true,
      data: {
        nombre: adjunto.nombreOriginal,
        tipoMime: adjunto.tipoMime,
        data: Array.from(decryptResult.data)
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('adjuntos:delete', async (_, adjuntoId: number) => {
  try {
    const db = requireAuth()

    // Obtener información del adjunto
    const adjunto = await db.adjuntoGasto.findUnique({ where: { id: adjuntoId } })
    if (!adjunto) {
      return { success: false, error: 'Adjunto no encontrado' }
    }

    // Eliminar archivo encriptado
    crypto.deleteEncryptedFile(adjunto.nombreEncriptado)

    // Eliminar registro de la base de datos
    await db.adjuntoGasto.delete({ where: { id: adjuntoId } })

    // Forzar checkpoint de SQLite para persistir cambios en disco
    await db.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('adjuntos:getByGastoId', async (_, gastoId: number) => {
  try {
    const db = requireAuth()
    const adjuntos = await db.adjuntoGasto.findMany({
      where: { gastoId },
      orderBy: { createdAt: 'desc' }
    })
    return { success: true, data: adjuntos }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Configuración
// ============================================

ipcMain.handle('config:getAll', async () => {
  try {
    const db = requireAuth()
    const configs = await db.configuracion.findMany()
    const configMap: Record<string, string> = {}
    configs.forEach((c: { clave: string; valor: string }) => {
      configMap[c.clave] = c.valor
    })
    return { success: true, data: configMap }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('config:get', async (_, clave: string) => {
  try {
    const db = requireAuth()
    const config = await db.configuracion.findUnique({
      where: { clave }
    })
    return { success: true, data: config?.valor || null }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('config:set', async (_, clave: string, valor: string) => {
  try {
    const db = requireAuth()
    const config = await db.configuracion.upsert({
      where: { clave },
      update: { valor },
      create: { clave, valor }
    })
    return { success: true, data: config }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('config:delete', async (_, clave: string) => {
  try {
    const db = requireAuth()
    await db.configuracion.delete({ where: { clave } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Dashboard Stats
// ============================================

ipcMain.handle('dashboard:getStats', async () => {
  try {
    const db = requireAuth()
    const [
      clientesCount,
      facturasTotal,
      facturasPendientes,
      gastosTotal,
      facturasCount,
      gastosCount
    ] = await Promise.all([
      db.cliente.count({ where: { activo: true } }),
      db.factura.aggregate({
        _sum: { total: true },
        where: { estado: 'pagada' }
      }),
      db.factura.aggregate({
        _sum: { total: true },
        _count: true,
        where: { estado: { in: ['emitida', 'borrador'] } }
      }),
      db.gasto.aggregate({
        _sum: { monto: true }
      }),
      db.factura.count(),
      db.gasto.count()
    ])

    const ingresos = facturasTotal._sum.total || 0
    const gastos = gastosTotal._sum.monto || 0

    return {
      success: true,
      data: {
        clientesActivos: clientesCount,
        ingresosTotales: ingresos,
        facturasPendientesCount: facturasPendientes._count || 0,
        facturasPendientesTotal: facturasPendientes._sum.total || 0,
        gastosTotales: gastos,
        balanceNeto: ingresos - gastos,
        facturasEmitidas: facturasCount,
        gastosRegistrados: gastosCount
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('dashboard:getRecentActivity', async () => {
  try {
    const db = requireAuth()
    const [facturas, gastos, clientes] = await Promise.all([
      db.factura.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { cliente: true }
      }),
      db.gasto.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' }
      }),
      db.cliente.findMany({
        take: 3,
        orderBy: { createdAt: 'desc' }
      })
    ])

    const activities = [
      ...facturas.map((f: { id: number; numero: string; cliente?: { nombre: string } | null; total: number; createdAt: Date }) => ({
        id: f.id,
        tipo: 'factura' as const,
        descripcion: `Factura #${f.numero} - ${f.cliente?.nombre}`,
        monto: f.total,
        fecha: f.createdAt
      })),
      ...gastos.map((g: { id: number; descripcion: string; monto: number; createdAt: Date }) => ({
        id: g.id,
        tipo: 'gasto' as const,
        descripcion: g.descripcion,
        monto: g.monto,
        fecha: g.createdAt
      })),
      ...clientes.map((c: { id: number; nombre: string; createdAt: Date }) => ({
        id: c.id,
        tipo: 'cliente' as const,
        descripcion: `Nuevo cliente: ${c.nombre}`,
        fecha: c.createdAt
      }))
    ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 10)

    return { success: true, data: activities }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('dashboard:getPendingInvoices', async () => {
  try {
    const db = requireAuth()
    const facturas = await db.factura.findMany({
      where: { estado: { in: ['emitida', 'borrador'] } },
      include: { cliente: true },
      orderBy: { fechaVencimiento: 'asc' },
      take: 10
    })
    return { success: true, data: facturas }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Productos
// ============================================

ipcMain.handle('productos:getAll', async () => {
  try {
    const db = requireAuth()
    const productos = await db.producto.findMany({
      include: { impuesto: true, retencion: true },
      orderBy: { nombre: 'asc' }
    })
    return { success: true, data: productos }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('productos:getById', async (_, id: number) => {
  try {
    const db = requireAuth()
    const producto = await db.producto.findUnique({
      where: { id },
      include: { impuesto: true, retencion: true }
    })
    return { success: true, data: producto }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('productos:create', async (_, data: any) => {
  try {
    const db = requireAuth()
    const producto = await db.producto.create({
      data,
      include: { impuesto: true, retencion: true }
    })
    return { success: true, data: producto }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('productos:update', async (_, id: number, data: any) => {
  try {
    const db = requireAuth()
    const producto = await db.producto.update({
      where: { id },
      data,
      include: { impuesto: true, retencion: true }
    })
    return { success: true, data: producto }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('productos:delete', async (_, id: number) => {
  try {
    const db = requireAuth()
    await db.producto.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Impuestos
// ============================================

ipcMain.handle('impuestos:getAll', async () => {
  try {
    const db = requireAuth()
    const impuestos = await db.impuesto.findMany({
      orderBy: { porcentaje: 'desc' }
    })
    return { success: true, data: impuestos }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('impuestos:getById', async (_, id: number) => {
  try {
    const db = requireAuth()
    const impuesto = await db.impuesto.findUnique({ where: { id } })
    return { success: true, data: impuesto }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('impuestos:create', async (_, data: any) => {
  try {
    const db = requireAuth()
    const impuesto = await db.impuesto.create({ data })
    return { success: true, data: impuesto }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('impuestos:update', async (_, id: number, data: any) => {
  try {
    const db = requireAuth()
    const impuesto = await db.impuesto.update({ where: { id }, data })
    return { success: true, data: impuesto }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('impuestos:delete', async (_, id: number) => {
  try {
    const db = requireAuth()
    await db.impuesto.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('impuestos:setDefault', async (_, id: number) => {
  try {
    const db = requireAuth()
    await db.impuesto.updateMany({ data: { porDefecto: false } })
    await db.impuesto.update({ where: { id }, data: { porDefecto: true } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Categorías de Gasto
// ============================================

ipcMain.handle('categoriasGasto:getAll', async () => {
  try {
    const db = requireAuth()
    const categorias = await db.categoriaGasto.findMany({
      orderBy: { nombre: 'asc' }
    })
    return { success: true, data: categorias }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('categoriasGasto:create', async (_, data: any) => {
  try {
    const db = requireAuth()
    const categoria = await db.categoriaGasto.create({ data })
    return { success: true, data: categoria }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('categoriasGasto:update', async (_, id: number, data: any) => {
  try {
    const db = requireAuth()
    const categoria = await db.categoriaGasto.update({ where: { id }, data })
    return { success: true, data: categoria }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('categoriasGasto:delete', async (_, id: number) => {
  try {
    const db = requireAuth()
    await db.categoriaGasto.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Facturas (actualizado)
// ============================================

ipcMain.handle('facturas:updateEstado', async (_, id: number, estado: string) => {
  try {
    const db = requireAuth()
    const factura = await db.factura.update({
      where: { id },
      data: { estado },
      include: { cliente: true, lineas: true }
    })
    return { success: true, data: factura }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Backup/Export/Import
// ============================================

// Obtener rutas de datos usando crypto.ts (soporta rutas personalizadas)
const getDataPath = () => crypto.getCurrentDataPath()
const getDbPath = () => crypto.getCurrentPrismaDbPath()
const getAttachmentsPath = () => path.join(getDataPath(), 'attachments')

// Exportar todos los datos a un archivo ZIP
ipcMain.handle('backup:export', async () => {
  try {
    // Mostrar diálogo para seleccionar ubicación
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Exportar copia de seguridad',
      defaultPath: `cryptogest-backup-${new Date().toISOString().split('T')[0]}.zip`,
      filters: [{ name: 'Archivo ZIP', extensions: ['zip'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Operación cancelada' }
    }

    const exportPath = result.filePath

    // Forzar checkpoint de SQLite antes de exportar
    if (prisma) {
      await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')
    }

    // Crear archivo ZIP
    const output = fs.createWriteStream(exportPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    return new Promise((resolve) => {
      output.on('close', () => {
        resolve({
          success: true,
          data: {
            path: exportPath,
            size: archive.pointer()
          }
        })
      })

      archive.on('error', (err) => {
        resolve({ success: false, error: String(err) })
      })

      archive.pipe(output)

      // Añadir base de datos
      const dbPath = getDbPath()
      if (fs.existsSync(dbPath)) {
        archive.file(dbPath, { name: 'database/dev.db' })
      }

      // Añadir archivos WAL y SHM si existen
      const walPath = dbPath + '-wal'
      const shmPath = dbPath + '-shm'
      if (fs.existsSync(walPath)) {
        archive.file(walPath, { name: 'database/dev.db-wal' })
      }
      if (fs.existsSync(shmPath)) {
        archive.file(shmPath, { name: 'database/dev.db-shm' })
      }

      // Añadir carpeta de adjuntos
      const attachmentsDir = getAttachmentsPath()
      if (fs.existsSync(attachmentsDir)) {
        archive.directory(attachmentsDir, 'attachments')
      }

      // Añadir metadatos
      const metadata = {
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        platform: process.platform
      }
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' })

      archive.finalize()
    })
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Importar datos desde un archivo ZIP (usado en pantalla de Auth)
ipcMain.handle('backup:import', async () => {
  try {
    // Mostrar diálogo para seleccionar archivo
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Importar copia de seguridad',
      filters: [{ name: 'Archivo ZIP', extensions: ['zip'] }],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Operación cancelada' }
    }

    const importPath = result.filePaths[0]

    // Verificar que es un archivo ZIP válido de CryptoGest
    const zip = new AdmZip(importPath)
    const entries = zip.getEntries()

    const hasDatabase = entries.some(e => e.entryName === 'database/dev.db')
    const hasMetadata = entries.some(e => e.entryName === 'metadata.json')

    if (!hasDatabase) {
      return { success: false, error: 'El archivo no contiene una base de datos válida de CryptoGest' }
    }

    // Leer metadatos si existen
    let metadata = null
    if (hasMetadata) {
      const metadataEntry = zip.getEntry('metadata.json')
      if (metadataEntry) {
        metadata = JSON.parse(metadataEntry.getData().toString('utf8'))
      }
    }

    // Cerrar conexión de Prisma si está activa
    if (prisma) {
      await prisma.$disconnect()
      prisma = null
    }
    isAuthenticated = false
    currentPassword = null

    // Extraer base de datos
    const dbDir = path.dirname(getDbPath())
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    // Eliminar archivos de base de datos existentes
    const existingDbPath = getDbPath()
    if (fs.existsSync(existingDbPath)) fs.unlinkSync(existingDbPath)
    if (fs.existsSync(existingDbPath + '-wal')) fs.unlinkSync(existingDbPath + '-wal')
    if (fs.existsSync(existingDbPath + '-shm')) fs.unlinkSync(existingDbPath + '-shm')

    // Extraer database
    const dbEntry = zip.getEntry('database/dev.db')
    if (dbEntry) {
      fs.writeFileSync(getDbPath(), dbEntry.getData())
    }

    // Extraer WAL y SHM si existen
    const walEntry = zip.getEntry('database/dev.db-wal')
    if (walEntry) {
      fs.writeFileSync(getDbPath() + '-wal', walEntry.getData())
    }
    const shmEntry = zip.getEntry('database/dev.db-shm')
    if (shmEntry) {
      fs.writeFileSync(getDbPath() + '-shm', shmEntry.getData())
    }

    // Extraer adjuntos
    const attachmentsDir = getAttachmentsPath()
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true })
    }

    // Limpiar adjuntos existentes
    if (fs.existsSync(attachmentsDir)) {
      const existingFiles = fs.readdirSync(attachmentsDir)
      for (const file of existingFiles) {
        fs.unlinkSync(path.join(attachmentsDir, file))
      }
    }

    // Extraer nuevos adjuntos
    for (const entry of entries) {
      if (entry.entryName.startsWith('attachments/') && !entry.isDirectory) {
        const fileName = path.basename(entry.entryName)
        fs.writeFileSync(path.join(attachmentsDir, fileName), entry.getData())
      }
    }

    return {
      success: true,
      data: {
        metadata,
        message: 'Importación completada. Por favor, inicia sesión con tus credenciales.'
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Obtener información de la ruta de datos actual
ipcMain.handle('backup:getDataPath', async () => {
  try {
    const dataPath = getDataPath()
    const dbPath = getDbPath()
    const attachmentsPath = getAttachmentsPath()
    const customDataPath = crypto.getCustomDataPath()
    const defaultDataPath = crypto.getDefaultPath()

    let dbSize = 0
    let attachmentsSize = 0
    let attachmentsCount = 0

    if (fs.existsSync(dbPath)) {
      dbSize = fs.statSync(dbPath).size
    }

    if (fs.existsSync(attachmentsPath)) {
      const files = fs.readdirSync(attachmentsPath)
      attachmentsCount = files.length
      for (const file of files) {
        attachmentsSize += fs.statSync(path.join(attachmentsPath, file)).size
      }
    }

    return {
      success: true,
      data: {
        dataPath,
        dbPath,
        attachmentsPath,
        dbSize,
        attachmentsSize,
        attachmentsCount,
        customDataPath,
        defaultDataPath,
        isUsingCustomPath: customDataPath !== null
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Migrar datos a una nueva ubicación y cambiar la ruta de datos
ipcMain.handle('backup:migrate', async () => {
  try {
    // Mostrar diálogo para seleccionar carpeta destino
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Seleccionar nueva ubicación para los datos',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Seleccionar carpeta'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Operación cancelada' }
    }

    const destinationFolder = result.filePaths[0]
    const cryptogestFolder = path.join(destinationFolder, 'CryptoGest-Data')

    // Verificar que no exista ya una carpeta CryptoGest-Data con datos
    if (fs.existsSync(cryptogestFolder)) {
      const existingFiles = fs.readdirSync(cryptogestFolder)
      if (existingFiles.length > 0) {
        return {
          success: false,
          error: 'La carpeta CryptoGest-Data ya existe y contiene archivos. Selecciona otra ubicación o elimina la carpeta existente.'
        }
      }
    }

    // Forzar checkpoint de SQLite antes de migrar
    if (prisma) {
      await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')
      await prisma.$disconnect()
      prisma = null
    }
    isAuthenticated = false
    currentPassword = null

    // Usar la función de migración de crypto.ts que copia datos y cambia la ruta
    const migrateResult = crypto.migrateDataToPath(destinationFolder)
    if (!migrateResult.success) {
      return migrateResult
    }

    // Actualizar dataPath de la empresa activa en empresas.json
    if (activeEmpresaId) {
      crypto.updateEmpresaDataPath(activeEmpresaId, cryptogestFolder)
    }

    // Calcular tamaño total migrado
    let totalSize = 0
    const countSize = (dir: string) => {
      if (fs.existsSync(dir)) {
        const items = fs.readdirSync(dir)
        for (const item of items) {
          const itemPath = path.join(dir, item)
          const stat = fs.statSync(itemPath)
          if (stat.isFile()) {
            totalSize += stat.size
          } else if (stat.isDirectory()) {
            countSize(itemPath)
          }
        }
      }
    }
    countSize(cryptogestFolder)

    return {
      success: true,
      data: {
        path: cryptogestFolder,
        size: totalSize,
        message: `Datos migrados correctamente. La aplicación ahora usará: ${cryptogestFolder}`
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Restaurar a la ruta de datos por defecto
ipcMain.handle('backup:resetToDefault', async () => {
  try {
    // Desconectar Prisma si está conectado
    if (prisma) {
      await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')
      await prisma.$disconnect()
      prisma = null
    }
    isAuthenticated = false
    currentPassword = null

    // Restaurar a la ruta por defecto
    const result = crypto.resetToDefaultPath()
    if (!result.success) {
      return result
    }

    // Actualizar dataPath de la empresa activa en empresas.json
    if (activeEmpresaId) {
      crypto.updateEmpresaDataPath(activeEmpresaId, null)
    }

    return {
      success: true,
      data: {
        path: crypto.getDefaultPath(),
        message: 'Ruta de datos restaurada a la ubicación por defecto. Por favor, reinicia la aplicación.'
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Cloud Backup
// ============================================

// Configure cloud connection (save to Configuracion + verify token)
ipcMain.handle('cloud:configure', async (_, data: { serverUrl: string; token: string }) => {
  try {
    const db = requireAuth()

    // Set config in cloud module
    cloud.setCloudConfig(data.serverUrl, data.token)

    // Verify token by calling auth check
    let user: cloud.CloudUser
    try {
      const authResult = await cloud.checkAuth()
      user = authResult.user
    } catch (err) {
      cloud.clearCloudConfig()
      if (err instanceof cloud.CloudAuthError) {
        return { success: false, error: 'Token inválido o expirado' }
      }
      if (err instanceof cloud.CloudNetworkError) {
        return { success: false, error: 'No se puede conectar con el servidor: ' + (err as Error).message }
      }
      return { success: false, error: String(err) }
    }

    // Save to Configuracion table
    await db.configuracion.upsert({
      where: { clave: 'cloud_server_url' },
      update: { valor: data.serverUrl },
      create: { clave: 'cloud_server_url', valor: data.serverUrl },
    })
    await db.configuracion.upsert({
      where: { clave: 'cloud_token' },
      update: { valor: data.token },
      create: { clave: 'cloud_token', valor: data.token },
    })

    return { success: true, data: { user } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Get cloud config from DB
ipcMain.handle('cloud:getConfig', async () => {
  try {
    const db = requireAuth()

    const serverUrlConfig = await db.configuracion.findUnique({ where: { clave: 'cloud_server_url' } })
    const tokenConfig = await db.configuracion.findUnique({ where: { clave: 'cloud_token' } })

    // Check locally persisted license (perpetual, independent of connection)
    const licenseConfig = await db.configuracion.findUnique({ where: { clave: 'cloud_license_granted' } })
    const license: cloud.CloudLicense = licenseConfig
      ? { has_license: true, purchased_at: licenseConfig.valor }
      : { has_license: false, purchased_at: null }

    if (!serverUrlConfig || !tokenConfig) {
      // Not connected, but may still have a perpetual license
      return { success: true, data: license.has_license ? { license } : null }
    }

    // Re-initialize cloud module config
    cloud.setCloudConfig(serverUrlConfig.valor, tokenConfig.valor)

    // Optionally verify token (non-blocking, we return config even if check fails)
    let user: cloud.CloudUser | undefined
    try {
      const authResult = await cloud.checkAuth()
      user = authResult.user
    } catch {
      // Token may be expired, return config without user
    }

    return {
      success: true,
      data: {
        serverUrl: serverUrlConfig.valor,
        token: tokenConfig.valor,
        user,
        license,
      },
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Disconnect cloud (clear config)
ipcMain.handle('cloud:disconnect', async () => {
  try {
    const db = requireAuth()

    cloud.clearCloudConfig()

    // Remove from DB
    try { await db.configuracion.delete({ where: { clave: 'cloud_server_url' } }) } catch { /* may not exist */ }
    try { await db.configuracion.delete({ where: { clave: 'cloud_token' } }) } catch { /* may not exist */ }

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Check auth status
ipcMain.handle('cloud:checkAuth', async () => {
  try {
    requireAuth()
    const result = await cloud.checkAuth()
    return { success: true, data: { user: result.user } }
  } catch (error) {
    if (error instanceof cloud.CloudAuthError) {
      return { success: false, error: 'Token inválido o expirado' }
    }
    return { success: false, error: String(error) }
  }
})

// List backups
ipcMain.handle('cloud:listBackups', async (_, page?: number) => {
  try {
    requireAuth()
    const result = await cloud.listBackups(page || 1)
    return { success: true, data: { backups: result.data, meta: result.meta } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Upload backup to cloud (E2E encrypted with master password)
ipcMain.handle('cloud:upload', async (_, notes?: string) => {
  try {
    requireAuth()
    if (!currentPassword) {
      return { success: false, error: 'No hay contraseña maestra disponible' }
    }

    // 1. Force SQLite WAL checkpoint
    if (prisma) {
      await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')
    }

    // 2. Create temp ZIP using same logic as backup:export
    const tempDir = os.tmpdir()
    const tempZipPath = path.join(tempDir, `cryptogest-cloud-${nodeCrypto.randomUUID()}.zip`)
    const backupFilename = `cryptogest-backup-${new Date().toISOString().split('T')[0]}.zip.enc`

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(tempZipPath)
      const archive = archiver('zip', { zlib: { level: 9 } })

      output.on('close', () => resolve())
      archive.on('error', (err) => reject(err))

      archive.pipe(output)

      const dbPath = getDbPath()
      if (fs.existsSync(dbPath)) {
        archive.file(dbPath, { name: 'database/dev.db' })
      }

      const walPath = dbPath + '-wal'
      const shmPath = dbPath + '-shm'
      if (fs.existsSync(walPath)) {
        archive.file(walPath, { name: 'database/dev.db-wal' })
      }
      if (fs.existsSync(shmPath)) {
        archive.file(shmPath, { name: 'database/dev.db-shm' })
      }

      const attachmentsDir = getAttachmentsPath()
      if (fs.existsSync(attachmentsDir)) {
        archive.directory(attachmentsDir, 'attachments')
      }

      const metadata = {
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        platform: process.platform,
      }
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' })

      archive.finalize()
    })

    // 3. E2E Encrypt: read ZIP, encrypt with master password, write encrypted file
    // Format: salt(32) + iv(16) + authTag(16) + ciphertext
    const zipData = fs.readFileSync(tempZipPath)
    try { fs.unlinkSync(tempZipPath) } catch { /* ignore */ }

    const salt = nodeCrypto.randomBytes(32)
    const key = crypto.deriveKey(currentPassword, salt)
    const encryptedPayload = crypto.encrypt(zipData, key) // iv(16) + authTag(16) + ciphertext
    const encryptedData = Buffer.concat([salt, encryptedPayload])

    const tempEncPath = path.join(tempDir, `cryptogest-cloud-${nodeCrypto.randomUUID()}.enc`)
    fs.writeFileSync(tempEncPath, encryptedData)

    // 4. Build encryption metadata (describes the format for informational purposes)
    const encryptionMetadata = {
      algorithm: 'AES-256-GCM',
      key_derivation: {
        function: 'PBKDF2',
        hash: 'SHA-512',
        iterations: 100000,
      },
      format: 'salt(32)+iv(16)+authTag(16)+ciphertext',
      e2e: true,
      client_version: '1.0.0',
      encrypted_at: new Date().toISOString(),
    }

    // 5. Upload with progress events
    const cloudBackup = await cloud.uploadBackup(
      tempEncPath,
      backupFilename,
      encryptionMetadata,
      notes,
      (percent) => {
        if (mainWindow) {
          mainWindow.webContents.send('cloud:upload-progress', percent)
        }
      },
    )

    // 6. Clean up temp file
    try { fs.unlinkSync(tempEncPath) } catch { /* ignore */ }

    return { success: true, data: cloudBackup }
  } catch (error) {
    if (error instanceof cloud.CloudQuotaError) {
      return { success: false, error: 'Cuota de almacenamiento excedida. Mejora tu plan o elimina backups antiguos.' }
    }
    return { success: false, error: String(error) }
  }
})

// Download backup from cloud (decrypt E2E before saving)
ipcMain.handle('cloud:download', async (_, backupId: number) => {
  try {
    requireAuth()
    if (!currentPassword) {
      return { success: false, error: 'No hay contraseña maestra disponible' }
    }

    // Get backup info for filename
    const backup = await cloud.getBackup(backupId)

    // Show save dialog — offer .zip since we decrypt before saving
    const defaultName = (backup.original_filename || `cloud-backup-${backupId}.zip.enc`).replace(/\.enc$/, '')
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Guardar backup descargado',
      defaultPath: defaultName,
      filters: [{ name: 'Archivo ZIP', extensions: ['zip'] }],
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Operación cancelada' }
    }

    // Download encrypted file to temp
    const tempDir = os.tmpdir()
    const tempEncPath = path.join(tempDir, `cryptogest-dl-${nodeCrypto.randomUUID()}.enc`)

    await cloud.downloadBackup(backupId, tempEncPath, (percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('cloud:download-progress', percent)
      }
    })

    // Decrypt: salt(32) + iv(16) + authTag(16) + ciphertext
    try {
      const encryptedData = fs.readFileSync(tempEncPath)
      try { fs.unlinkSync(tempEncPath) } catch { /* ignore */ }

      const salt = encryptedData.subarray(0, 32)
      const encryptedPayload = encryptedData.subarray(32) // iv + authTag + ciphertext

      const key = crypto.deriveKey(currentPassword, salt)
      const zipData = crypto.decrypt(encryptedPayload, key)

      fs.writeFileSync(result.filePath, zipData)
    } catch {
      try { fs.unlinkSync(tempEncPath) } catch { /* ignore */ }
      try { fs.unlinkSync(result.filePath) } catch { /* ignore */ }
      return { success: false, error: 'Error al descifrar el backup. ¿La contraseña maestra ha cambiado desde que se subió?' }
    }

    return { success: true, data: { path: result.filePath } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Import backup directly from cloud (download + decrypt E2E + restore)
ipcMain.handle('cloud:import', async (_, backupId: number) => {
  try {
    requireAuth()
    if (!currentPassword) {
      return { success: false, error: 'No hay contraseña maestra disponible' }
    }

    // Download encrypted file to temp
    const tempDir = os.tmpdir()
    const tempEncPath = path.join(tempDir, `cryptogest-import-${nodeCrypto.randomUUID()}.enc`)

    await cloud.downloadBackup(backupId, tempEncPath, (percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('cloud:download-progress', percent)
      }
    })

    // Decrypt: salt(32) + iv(16) + authTag(16) + ciphertext → ZIP
    let zipData: Buffer
    try {
      const encryptedData = fs.readFileSync(tempEncPath)
      try { fs.unlinkSync(tempEncPath) } catch { /* ignore */ }

      const salt = encryptedData.subarray(0, 32)
      const encryptedPayload = encryptedData.subarray(32)

      const key = crypto.deriveKey(currentPassword, salt)
      zipData = crypto.decrypt(encryptedPayload, key)
    } catch {
      try { fs.unlinkSync(tempEncPath) } catch { /* ignore */ }
      return { success: false, error: 'Error al descifrar el backup. ¿La contraseña maestra ha cambiado desde que se subió?' }
    }

    // Write decrypted ZIP to temp and validate
    const tempZipPath = path.join(tempDir, `cryptogest-import-${nodeCrypto.randomUUID()}.zip`)
    fs.writeFileSync(tempZipPath, zipData)

    const zip = new AdmZip(tempZipPath)
    const entries = zip.getEntries()
    const hasDatabase = entries.some(e => e.entryName === 'database/dev.db')

    if (!hasDatabase) {
      try { fs.unlinkSync(tempZipPath) } catch { /* ignore */ }
      return { success: false, error: 'El backup descifrado no contiene una base de datos válida de CryptoGest' }
    }

    // Read metadata if exists
    let metadata = null
    const hasMetadata = entries.some(e => e.entryName === 'metadata.json')
    if (hasMetadata) {
      const metadataEntry = zip.getEntry('metadata.json')
      if (metadataEntry) {
        metadata = JSON.parse(metadataEntry.getData().toString('utf8'))
      }
    }

    // Disconnect Prisma
    if (prisma) {
      await prisma.$disconnect()
      prisma = null
    }
    isAuthenticated = false
    currentPassword = null

    // Extract database
    const dbDir = path.dirname(getDbPath())
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    const existingDbPath = getDbPath()
    if (fs.existsSync(existingDbPath)) fs.unlinkSync(existingDbPath)
    if (fs.existsSync(existingDbPath + '-wal')) fs.unlinkSync(existingDbPath + '-wal')
    if (fs.existsSync(existingDbPath + '-shm')) fs.unlinkSync(existingDbPath + '-shm')

    const dbEntry = zip.getEntry('database/dev.db')
    if (dbEntry) {
      fs.writeFileSync(getDbPath(), dbEntry.getData())
    }

    const walEntry = zip.getEntry('database/dev.db-wal')
    if (walEntry) {
      fs.writeFileSync(getDbPath() + '-wal', walEntry.getData())
    }
    const shmEntry = zip.getEntry('database/dev.db-shm')
    if (shmEntry) {
      fs.writeFileSync(getDbPath() + '-shm', shmEntry.getData())
    }

    // Extract attachments
    const attachmentsDir = getAttachmentsPath()
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true })
    }

    if (fs.existsSync(attachmentsDir)) {
      const existingFiles = fs.readdirSync(attachmentsDir)
      for (const file of existingFiles) {
        fs.unlinkSync(path.join(attachmentsDir, file))
      }
    }

    for (const entry of entries) {
      if (entry.entryName.startsWith('attachments/') && !entry.isDirectory) {
        const fileName = path.basename(entry.entryName)
        fs.writeFileSync(path.join(attachmentsDir, fileName), entry.getData())
      }
    }

    // Clean up
    try { fs.unlinkSync(tempZipPath) } catch { /* ignore */ }

    return {
      success: true,
      data: {
        metadata,
        message: 'Importación desde la nube completada. Por favor, inicia sesión con tus credenciales.',
      },
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Delete backup from cloud
ipcMain.handle('cloud:delete', async (_, backupId: number) => {
  try {
    requireAuth()
    await cloud.deleteBackup(backupId)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Get plan and usage info
ipcMain.handle('cloud:plan', async () => {
  try {
    const db = requireAuth()
    const result = await cloud.getAccountPlan()

    // Persist license locally when granted (perpetual, never revoked)
    if (result.license?.has_license) {
      await db.configuracion.upsert({
        where: { clave: 'cloud_license_granted' },
        update: { valor: result.license.purchased_at || new Date().toISOString() },
        create: { clave: 'cloud_license_granted', valor: result.license.purchased_at || new Date().toISOString() },
      })
    }

    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Create license checkout session and open in browser
ipcMain.handle('cloud:licenseCheckout', async () => {
  try {
    requireAuth()
    const result = await cloud.createLicenseCheckout()
    await shell.openExternal(result.checkout_url)
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Device Link (deep link auto-config)
// ============================================

ipcMain.handle('cloud:confirmDeviceLink', async (_, data: { token: string; server: string; deviceName?: string }) => {
  try {
    const response = await cloud.confirmDeviceLink(data.server, data.token, data.deviceName)

    // Save config to database if authenticated
    if (isAuthenticated && prisma) {
      await prisma.configuracion.upsert({
        where: { clave: 'cloud_server_url' },
        update: { valor: data.server },
        create: { clave: 'cloud_server_url', valor: data.server },
      })
      await prisma.configuracion.upsert({
        where: { clave: 'cloud_token' },
        update: { valor: response.api_token },
        create: { clave: 'cloud_token', valor: response.api_token },
      })
      cloud.setCloudConfig(data.server, response.api_token)
    }

    return { success: true, data: response }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('cloud:verifyCode', async (_, data: { code: string; server: string; deviceName?: string }) => {
  try {
    requireAuth()
    const response = await cloud.verifyDeviceCode(data.server, data.code, data.deviceName)

    // Save config to database
    if (isAuthenticated && prisma) {
      await prisma.configuracion.upsert({
        where: { clave: 'cloud_server_url' },
        update: { valor: data.server },
        create: { clave: 'cloud_server_url', valor: data.server },
      })
      await prisma.configuracion.upsert({
        where: { clave: 'cloud_token' },
        update: { valor: response.api_token },
        create: { clave: 'cloud_token', valor: response.api_token },
      })
      cloud.setCloudConfig(data.server, response.api_token)
    }

    return { success: true, data: response }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Shell
// ============================================

ipcMain.handle('shell:openExternal', async (_, url: string) => {
  try {
    // Only allow http/https URLs
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { success: false, error: 'Solo se permiten URLs http/https' }
    }
    await shell.openExternal(url)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Logo de Empresa
// ============================================

ipcMain.handle('logo:upload', async (_, fileData: { data: number[]; nombre: string; tipoMime: string }) => {
  try {
    requireAuth()
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg']
    if (!validTypes.includes(fileData.tipoMime)) {
      return { success: false, error: 'Formato no soportado. Usa PNG o JPG.' }
    }
    const buffer = Buffer.from(fileData.data)
    const logoPath = path.join(getDataPath(), 'logo.png')
    fs.writeFileSync(logoPath, buffer)
    return { success: true, data: { path: 'logo.png' } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('logo:read', async () => {
  try {
    requireAuth()
    const logoPath = path.join(getDataPath(), 'logo.png')
    if (!fs.existsSync(logoPath)) {
      return { success: false, error: 'No hay logo configurado' }
    }
    const buffer = fs.readFileSync(logoPath)
    return { success: true, data: { data: Array.from(buffer), tipoMime: 'image/png' } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('logo:delete', async () => {
  try {
    const db = requireAuth()
    const logoPath = path.join(getDataPath(), 'logo.png')
    if (fs.existsSync(logoPath)) {
      fs.unlinkSync(logoPath)
    }
    // Also remove config key if exists
    await db.configuracion.deleteMany({ where: { clave: 'facturacion.logoPath' } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Cuentas Contables (PGC)
// ============================================

const PGC_CUENTAS = [
  // Grupo 1 - Financiación Básica
  { codigo: "100", nombre: "Capital social", tipo: "patrimonio_neto", grupo: 1, nivel: 1 },
  { codigo: "112", nombre: "Reserva legal", tipo: "patrimonio_neto", grupo: 1, nivel: 1 },
  { codigo: "113", nombre: "Reservas voluntarias", tipo: "patrimonio_neto", grupo: 1, nivel: 1 },
  { codigo: "129", nombre: "Resultado del ejercicio", tipo: "patrimonio_neto", grupo: 1, nivel: 1 },
  { codigo: "170", nombre: "Deudas a largo plazo con entidades de crédito", tipo: "pasivo", grupo: 1, nivel: 1 },
  // Grupo 2 - Inmovilizado
  { codigo: "210", nombre: "Terrenos y bienes naturales", tipo: "activo", grupo: 2, nivel: 1 },
  { codigo: "211", nombre: "Construcciones", tipo: "activo", grupo: 2, nivel: 1 },
  { codigo: "213", nombre: "Maquinaria", tipo: "activo", grupo: 2, nivel: 1 },
  { codigo: "216", nombre: "Mobiliario", tipo: "activo", grupo: 2, nivel: 1 },
  { codigo: "217", nombre: "Equipos para procesos de información", tipo: "activo", grupo: 2, nivel: 1 },
  { codigo: "218", nombre: "Elementos de transporte", tipo: "activo", grupo: 2, nivel: 1 },
  { codigo: "281", nombre: "Amortización acumulada del inmovilizado material", tipo: "activo", grupo: 2, nivel: 1 },
  // Grupo 3 - Existencias
  { codigo: "300", nombre: "Mercaderías", tipo: "activo", grupo: 3, nivel: 1 },
  { codigo: "310", nombre: "Materias primas", tipo: "activo", grupo: 3, nivel: 1 },
  // Grupo 4 - Acreedores y deudores
  { codigo: "400", nombre: "Proveedores", tipo: "pasivo", grupo: 4, nivel: 1 },
  { codigo: "410", nombre: "Acreedores por prestaciones de servicios", tipo: "pasivo", grupo: 4, nivel: 1 },
  { codigo: "430", nombre: "Clientes", tipo: "activo", grupo: 4, nivel: 1 },
  { codigo: "440", nombre: "Deudores", tipo: "activo", grupo: 4, nivel: 1 },
  { codigo: "465", nombre: "Remuneraciones pendientes de pago", tipo: "pasivo", grupo: 4, nivel: 1 },
  { codigo: "472", nombre: "Hacienda Pública, IVA soportado", tipo: "activo", grupo: 4, nivel: 1 },
  { codigo: "473", nombre: "Hacienda Pública, retenciones y pagos a cuenta", tipo: "activo", grupo: 4, nivel: 1 },
  { codigo: "475", nombre: "Hacienda Pública, acreedora por conceptos fiscales", tipo: "pasivo", grupo: 4, nivel: 1 },
  { codigo: "4750", nombre: "Hacienda Pública, acreedora por IVA", tipo: "pasivo", grupo: 4, nivel: 2 },
  { codigo: "4751", nombre: "Hacienda Pública, acreedora por retenciones practicadas", tipo: "pasivo", grupo: 4, nivel: 2 },
  { codigo: "476", nombre: "Organismos de la Seguridad Social, acreedores", tipo: "pasivo", grupo: 4, nivel: 1 },
  { codigo: "477", nombre: "Hacienda Pública, IVA repercutido", tipo: "pasivo", grupo: 4, nivel: 1 },
  // Grupo 5 - Cuentas financieras
  { codigo: "520", nombre: "Deudas a corto plazo con entidades de crédito", tipo: "pasivo", grupo: 5, nivel: 1 },
  { codigo: "570", nombre: "Caja, euros", tipo: "activo", grupo: 5, nivel: 1 },
  { codigo: "572", nombre: "Bancos e instituciones de crédito c/c vista, euros", tipo: "activo", grupo: 5, nivel: 1 },
  // Grupo 6 - Compras y gastos
  { codigo: "600", nombre: "Compras de mercaderías", tipo: "gasto", grupo: 6, nivel: 1 },
  { codigo: "601", nombre: "Compras de materias primas", tipo: "gasto", grupo: 6, nivel: 1 },
  { codigo: "621", nombre: "Arrendamientos y cánones", tipo: "gasto", grupo: 6, nivel: 1 },
  { codigo: "622", nombre: "Reparaciones y conservación", tipo: "gasto", grupo: 6, nivel: 1 },
  { codigo: "623", nombre: "Servicios de profesionales independientes", tipo: "gasto", grupo: 6, nivel: 1 },
  { codigo: "624", nombre: "Transportes", tipo: "gasto", grupo: 6, nivel: 1 },
  { codigo: "625", nombre: "Primas de seguros", tipo: "gasto", grupo: 6, nivel: 1 },
  { codigo: "626", nombre: "Servicios bancarios y similares", tipo: "gasto", grupo: 6, nivel: 1 },
  { codigo: "627", nombre: "Publicidad, propaganda y relaciones públicas", tipo: "gasto", grupo: 6, nivel: 1 },
  { codigo: "628", nombre: "Suministros", tipo: "gasto", grupo: 6, nivel: 1 },
  { codigo: "629", nombre: "Otros servicios", tipo: "gasto", grupo: 6, nivel: 1 },
  { codigo: "640", nombre: "Sueldos y salarios", tipo: "gasto", grupo: 6, nivel: 1 },
  { codigo: "642", nombre: "Seguridad Social a cargo de la empresa", tipo: "gasto", grupo: 6, nivel: 1 },
  { codigo: "681", nombre: "Amortización del inmovilizado material", tipo: "gasto", grupo: 6, nivel: 1 },
  // Grupo 7 - Ventas e ingresos
  { codigo: "700", nombre: "Ventas de mercaderías", tipo: "ingreso", grupo: 7, nivel: 1 },
  { codigo: "705", nombre: "Prestaciones de servicios", tipo: "ingreso", grupo: 7, nivel: 1 },
  { codigo: "708", nombre: "Devoluciones de ventas y operaciones similares", tipo: "ingreso", grupo: 7, nivel: 1 },
  { codigo: "759", nombre: "Ingresos por servicios diversos", tipo: "ingreso", grupo: 7, nivel: 1 },
]

ipcMain.handle('cuentas:getAll', async () => {
  try {
    const db = requireAuth()
    const cuentas = await db.cuentaContable.findMany({
      include: { cuentaPadre: true, subcuentas: true },
      orderBy: { codigo: 'asc' }
    })
    return { success: true, data: cuentas }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('cuentas:getById', async (_, id: number) => {
  try {
    const db = requireAuth()
    const cuenta = await db.cuentaContable.findUnique({
      where: { id },
      include: { cuentaPadre: true, subcuentas: true }
    })
    return { success: true, data: cuenta }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('cuentas:create', async (_, data: any) => {
  try {
    const db = requireAuth()
    const cuenta = await db.cuentaContable.create({
      data: { ...data, esSistema: false },
      include: { cuentaPadre: true, subcuentas: true }
    })
    return { success: true, data: cuenta }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('cuentas:update', async (_, id: number, data: any) => {
  try {
    const db = requireAuth()
    const cuenta = await db.cuentaContable.update({
      where: { id },
      data,
      include: { cuentaPadre: true, subcuentas: true }
    })
    return { success: true, data: cuenta }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('cuentas:delete', async (_, id: number) => {
  try {
    const db = requireAuth()
    const cuenta = await db.cuentaContable.findUnique({ where: { id } })
    if (!cuenta) return { success: false, error: 'Cuenta no encontrada' }
    if (cuenta.esSistema) return { success: false, error: 'No se puede eliminar una cuenta del sistema' }
    const movimientos = await db.lineaAsiento.count({ where: { cuentaId: id } })
    if (movimientos > 0) return { success: false, error: 'No se puede eliminar una cuenta con movimientos contables' }
    await db.cuentaContable.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('cuentas:seedPGC', async () => {
  try {
    const db = requireAuth()
    const existingCount = await db.cuentaContable.count()
    if (existingCount > 0) {
      return { success: true, data: { seeded: false, message: 'PGC ya inicializado' } }
    }

    for (const cuenta of PGC_CUENTAS) {
      await db.cuentaContable.create({
        data: { ...cuenta, esSistema: true, activo: true }
      })
    }

    // Establecer relaciones padre-hijo para cuentas de nivel >= 2
    const allCuentas = await db.cuentaContable.findMany()
    for (const cuenta of allCuentas) {
      if (cuenta.nivel >= 2 && cuenta.codigo.length > 3) {
        const parentCode = cuenta.codigo.slice(0, 3)
        const parent = allCuentas.find((c: any) => c.codigo === parentCode)
        if (parent) {
          await db.cuentaContable.update({
            where: { id: cuenta.id },
            data: { cuentaPadreId: parent.id }
          })
        }
      }
    }

    return { success: true, data: { seeded: true, count: PGC_CUENTAS.length } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Ejercicios Fiscales
// ============================================

ipcMain.handle('ejercicios:getAll', async () => {
  try {
    const db = requireAuth()
    const ejercicios = await db.ejercicioFiscal.findMany({
      orderBy: { anio: 'desc' }
    })
    return { success: true, data: ejercicios }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('ejercicios:create', async (_, data: { anio: number }) => {
  try {
    const db = requireAuth()
    const ejercicio = await db.ejercicioFiscal.create({
      data: {
        anio: data.anio,
        fechaInicio: new Date(data.anio, 0, 1),
        fechaFin: new Date(data.anio, 11, 31),
        estado: 'abierto'
      }
    })
    return { success: true, data: ejercicio }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('ejercicios:getOrCreateCurrent', async () => {
  try {
    const db = requireAuth()
    const currentYear = new Date().getFullYear()
    let ejercicio = await db.ejercicioFiscal.findUnique({ where: { anio: currentYear } })
    if (!ejercicio) {
      ejercicio = await db.ejercicioFiscal.create({
        data: {
          anio: currentYear,
          fechaInicio: new Date(currentYear, 0, 1),
          fechaFin: new Date(currentYear, 11, 31),
          estado: 'abierto'
        }
      })
    }
    return { success: true, data: ejercicio }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('ejercicios:update', async (_, id: number, data: { estado: string }) => {
  try {
    const db = requireAuth()
    const ejercicio = await db.ejercicioFiscal.update({
      where: { id },
      data: { estado: data.estado }
    })
    return { success: true, data: ejercicio }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('ejercicios:delete', async (_, id: number) => {
  try {
    const db = requireAuth()
    // Verificar que no tenga asientos
    const asientosCount = await db.asiento.count({ where: { ejercicioId: id } })
    if (asientosCount > 0) {
      return { success: false, error: `No se puede eliminar: tiene ${asientosCount} asiento(s) asociado(s)` }
    }
    await db.ejercicioFiscal.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('ejercicios:getStats', async (_, id: number) => {
  try {
    const db = requireAuth()
    const ejercicio = await db.ejercicioFiscal.findUnique({ where: { id } })
    if (!ejercicio) {
      return { success: false, error: 'Ejercicio no encontrado' }
    }

    const asientos = await db.asiento.findMany({
      where: { ejercicioId: id },
      include: { lineas: true }
    })

    const totalAsientos = asientos.length
    let totalDebe = 0
    let totalHaber = 0
    const asientosPorTipo: Record<string, number> = {}

    for (const asiento of asientos) {
      const tipo = asiento.tipo
      asientosPorTipo[tipo] = (asientosPorTipo[tipo] || 0) + 1
      for (const linea of asiento.lineas) {
        totalDebe += linea.debe
        totalHaber += linea.haber
      }
    }

    // Facturas del periodo
    const facturas = await db.factura.findMany({
      where: {
        fecha: {
          gte: ejercicio.fechaInicio,
          lte: ejercicio.fechaFin
        }
      }
    })

    const totalFacturado = facturas.reduce((sum: number, f: any) => sum + f.total, 0)
    const facturasPagadas = facturas.filter((f: any) => f.estado === 'pagada').length
    const facturasPendientes = facturas.filter((f: any) => f.estado === 'emitida' || f.estado === 'vencida').length

    // Gastos del periodo
    const gastos = await db.gasto.findMany({
      where: {
        fecha: {
          gte: ejercicio.fechaInicio,
          lte: ejercicio.fechaFin
        }
      }
    })

    const totalGastos = gastos.reduce((sum: number, g: any) => sum + g.monto, 0)

    return {
      success: true,
      data: {
        ejercicio,
        totalAsientos,
        totalDebe: Math.round(totalDebe * 100) / 100,
        totalHaber: Math.round(totalHaber * 100) / 100,
        asientosPorTipo,
        totalFacturado: Math.round(totalFacturado * 100) / 100,
        facturasPagadas,
        facturasPendientes,
        totalFacturas: facturas.length,
        totalGastos: Math.round(totalGastos * 100) / 100,
        numGastos: gastos.length,
        resultado: Math.round((totalFacturado - totalGastos) * 100) / 100
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Asientos Contables
// ============================================

ipcMain.handle('asientos:getAll', async (_, filters?: {
  ejercicioId?: number
  tipo?: string
  fechaDesde?: string
  fechaHasta?: string
}) => {
  try {
    const db = requireAuth()
    const where: any = {}
    if (filters?.ejercicioId) where.ejercicioId = filters.ejercicioId
    if (filters?.tipo) where.tipo = filters.tipo
    if (filters?.fechaDesde || filters?.fechaHasta) {
      where.fecha = {}
      if (filters.fechaDesde) where.fecha.gte = new Date(filters.fechaDesde)
      if (filters.fechaHasta) where.fecha.lte = new Date(filters.fechaHasta)
    }
    const asientos = await db.asiento.findMany({
      where,
      include: {
        lineas: { include: { cuenta: true } },
        ejercicio: true,
        factura: true,
        gasto: true,
      },
      orderBy: [{ fecha: 'asc' }, { numero: 'asc' }]
    })
    return { success: true, data: asientos }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('asientos:getById', async (_, id: number) => {
  try {
    const db = requireAuth()
    const asiento = await db.asiento.findUnique({
      where: { id },
      include: {
        lineas: { include: { cuenta: true } },
        ejercicio: true,
        factura: { include: { cliente: true } },
        gasto: { include: { categoria: true } },
      }
    })
    return { success: true, data: asiento }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('asientos:create', async (_, data: {
  fecha: string
  descripcion: string
  tipo?: string
  documentoRef?: string
  facturaId?: number
  gastoId?: number
  ejercicioId: number
  lineas: Array<{ cuentaId: number; debe: number; haber: number; concepto?: string }>
}) => {
  try {
    const db = requireAuth()
    const { lineas, ...asientoData } = data

    // Validar partida doble
    const totalDebe = lineas.reduce((sum, l) => sum + l.debe, 0)
    const totalHaber = lineas.reduce((sum, l) => sum + l.haber, 0)
    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      return { success: false, error: `El asiento no cuadra. Debe: ${totalDebe.toFixed(2)}, Haber: ${totalHaber.toFixed(2)}` }
    }

    // Auto-numerar dentro del ejercicio
    const lastAsiento = await db.asiento.findFirst({
      where: { ejercicioId: data.ejercicioId },
      orderBy: { numero: 'desc' }
    })
    const nextNumero = (lastAsiento?.numero || 0) + 1

    const asiento = await db.asiento.create({
      data: {
        ...asientoData,
        fecha: new Date(asientoData.fecha),
        numero: nextNumero,
        lineas: { create: lineas }
      },
      include: {
        lineas: { include: { cuenta: true } },
        ejercicio: true,
      }
    })
    return { success: true, data: asiento }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('asientos:update', async (_, id: number, data: {
  fecha?: string
  descripcion?: string
  documentoRef?: string
  lineas?: Array<{ cuentaId: number; debe: number; haber: number; concepto?: string }>
}) => {
  try {
    const db = requireAuth()
    const { lineas, ...asientoData } = data
    const updateData: any = { ...asientoData }
    if (asientoData.fecha) updateData.fecha = new Date(asientoData.fecha)

    if (lineas) {
      const totalDebe = lineas.reduce((sum, l) => sum + l.debe, 0)
      const totalHaber = lineas.reduce((sum, l) => sum + l.haber, 0)
      if (Math.abs(totalDebe - totalHaber) > 0.01) {
        return { success: false, error: `El asiento no cuadra. Debe: ${totalDebe.toFixed(2)}, Haber: ${totalHaber.toFixed(2)}` }
      }
      await db.lineaAsiento.deleteMany({ where: { asientoId: id } })
      updateData.lineas = { create: lineas }
    }

    const asiento = await db.asiento.update({
      where: { id },
      data: updateData,
      include: {
        lineas: { include: { cuenta: true } },
        ejercicio: true,
      }
    })
    return { success: true, data: asiento }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('asientos:delete', async (_, id: number) => {
  try {
    const db = requireAuth()
    const asiento = await db.asiento.findUnique({ where: { id } })
    if (!asiento) return { success: false, error: 'Asiento no encontrado' }
    if (asiento.tipo === 'factura' || asiento.tipo === 'gasto') {
      return { success: false, error: 'No se puede eliminar un asiento generado automáticamente' }
    }
    await db.lineaAsiento.deleteMany({ where: { asientoId: id } })
    await db.asiento.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Contabilidad (Libros + Auto-generación)
// ============================================

ipcMain.handle('contabilidad:libroMayor', async (_, params: {
  cuentaId: number
  ejercicioId: number
  fechaDesde?: string
  fechaHasta?: string
}) => {
  try {
    const db = requireAuth()
    const where: any = {
      cuentaId: params.cuentaId,
      asiento: { ejercicioId: params.ejercicioId }
    }
    if (params.fechaDesde || params.fechaHasta) {
      where.asiento.fecha = {}
      if (params.fechaDesde) where.asiento.fecha.gte = new Date(params.fechaDesde)
      if (params.fechaHasta) where.asiento.fecha.lte = new Date(params.fechaHasta)
    }
    const lineas = await db.lineaAsiento.findMany({
      where,
      include: { asiento: true, cuenta: true },
      orderBy: { asiento: { fecha: 'asc' } }
    })
    let saldo = 0
    const movimientos = lineas.map((linea: any) => {
      saldo += linea.debe - linea.haber
      return { ...linea, saldo }
    })
    const cuenta = await db.cuentaContable.findUnique({ where: { id: params.cuentaId } })
    return {
      success: true,
      data: {
        cuenta,
        movimientos,
        totalDebe: lineas.reduce((sum: number, l: any) => sum + l.debe, 0),
        totalHaber: lineas.reduce((sum: number, l: any) => sum + l.haber, 0),
        saldoFinal: saldo
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('contabilidad:generarAsientoFactura', async (_, facturaId: number) => {
  try {
    const db = requireAuth()
    const factura = await db.factura.findUnique({
      where: { id: facturaId },
      include: { lineas: { include: { impuesto: true, retencion: true } }, cliente: true }
    })
    if (!factura) return { success: false, error: 'Factura no encontrada' }

    const year = new Date(factura.fecha).getFullYear()
    let ejercicio = await db.ejercicioFiscal.findUnique({ where: { anio: year } })
    if (!ejercicio) {
      ejercicio = await db.ejercicioFiscal.create({
        data: { anio: year, fechaInicio: new Date(year, 0, 1), fechaFin: new Date(year, 11, 31) }
      })
    }

    const existing = await db.asiento.findFirst({ where: { facturaId } })
    if (existing) return { success: false, error: 'Ya existe un asiento para esta factura' }

    const cuenta430 = await db.cuentaContable.findFirst({ where: { codigo: '430' } })
    const cuenta700 = await db.cuentaContable.findFirst({ where: { codigo: '700' } })
    const cuenta705 = await db.cuentaContable.findFirst({ where: { codigo: '705' } })
    const cuenta477 = await db.cuentaContable.findFirst({ where: { codigo: '477' } })
    const cuenta4751 = await db.cuentaContable.findFirst({ where: { codigo: '4751' } })

    if (!cuenta430 || !cuenta477) {
      return { success: false, error: 'Faltan cuentas contables necesarias (430, 477). Inicializa el PGC primero.' }
    }

    // IVA desde impuesto de cada línea, IRPF desde retención de cada línea
    let totalIVA = 0
    let totalIRPF = 0
    for (const linea of factura.lineas || []) {
      if (linea.impuesto && linea.impuesto.tipo === 'IVA') {
        totalIVA += linea.totalImpuesto
      }
      if (linea.retencion) {
        totalIRPF += linea.totalRetencion
      }
    }
    totalIVA = Math.round(totalIVA * 100) / 100
    totalIRPF = Math.round(totalIRPF * 100) / 100

    const lineas: Array<{ cuentaId: number; debe: number; haber: number; concepto: string }> = []

    // DEBE 430 (Clientes) = total factura (lo que realmente cobra)
    lineas.push({
      cuentaId: cuenta430.id,
      debe: Math.round(factura.total * 100) / 100,
      haber: 0,
      concepto: `Factura ${factura.numero} - ${factura.cliente?.nombre || ''}`
    })

    // HABER 700/705 (Ventas) = subtotal (base imponible)
    const cuentaVentas = cuenta705 || cuenta700
    if (cuentaVentas) {
      lineas.push({
        cuentaId: cuentaVentas.id,
        debe: 0,
        haber: Math.round(factura.subtotal * 100) / 100,
        concepto: `Base factura ${factura.numero}`
      })
    }

    // HABER 477 (IVA Repercutido) = solo la parte de IVA
    if (totalIVA > 0) {
      lineas.push({
        cuentaId: cuenta477.id,
        debe: 0,
        haber: totalIVA,
        concepto: `IVA repercutido factura ${factura.numero}`
      })
    }

    // HABER 4751 (HP acreedora por retenciones) = IRPF que retiene el cliente
    // En facturas emitidas, la retención reduce lo que cobramos pero generamos una obligación de Hacienda
    if (totalIRPF > 0 && cuenta4751) {
      lineas.push({
        cuentaId: cuenta4751.id,
        debe: totalIRPF,
        haber: 0,
        concepto: `IRPF retenido factura ${factura.numero}`
      })
    }

    const lastAsiento = await db.asiento.findFirst({
      where: { ejercicioId: ejercicio.id },
      orderBy: { numero: 'desc' }
    })

    const asiento = await db.asiento.create({
      data: {
        numero: (lastAsiento?.numero || 0) + 1,
        fecha: new Date(factura.fecha),
        descripcion: `Factura ${factura.numero} - ${factura.cliente?.nombre || ''}`,
        tipo: 'factura',
        documentoRef: factura.numero,
        facturaId: factura.id,
        ejercicioId: ejercicio.id,
        lineas: { create: lineas }
      },
      include: { lineas: { include: { cuenta: true } }, ejercicio: true }
    })
    return { success: true, data: asiento }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('contabilidad:generarAsientoGasto', async (_, gastoId: number) => {
  try {
    const db = requireAuth()
    const gasto = await db.gasto.findUnique({
      where: { id: gastoId },
      include: { categoria: true, impuesto: true }
    })
    if (!gasto) return { success: false, error: 'Gasto no encontrado' }

    const year = new Date(gasto.fecha).getFullYear()
    let ejercicio = await db.ejercicioFiscal.findUnique({ where: { anio: year } })
    if (!ejercicio) {
      ejercicio = await db.ejercicioFiscal.create({
        data: { anio: year, fechaInicio: new Date(year, 0, 1), fechaFin: new Date(year, 11, 31) }
      })
    }

    const existing = await db.asiento.findFirst({ where: { gastoId } })
    if (existing) return { success: false, error: 'Ya existe un asiento para este gasto' }

    const cuenta472 = await db.cuentaContable.findFirst({ where: { codigo: '472' } })
    const cuenta410 = await db.cuentaContable.findFirst({ where: { codigo: '410' } })
    const cuenta629 = await db.cuentaContable.findFirst({ where: { codigo: '629' } })

    if (!cuenta472 || !cuenta410 || !cuenta629) {
      return { success: false, error: 'Faltan cuentas contables necesarias. Inicializa el PGC primero.' }
    }

    // Mapeo categoría -> cuenta contable del grupo 6
    const categoriaMap: Record<string, string> = {
      'Alquiler': '621', 'Material de oficina': '629', 'Software y tecnología': '629',
      'Transporte': '624', 'Suministros': '628', 'Comunicaciones': '629',
      'Seguros': '625', 'Servicios profesionales': '623', 'Publicidad': '627',
      'Formación': '629', 'Reparaciones': '622', 'Compras': '600',
    }
    const categoriaNombre = gasto.categoria?.nombre || ''
    const codigoGasto = categoriaMap[categoriaNombre] || '629'
    const cuentaGasto = await db.cuentaContable.findFirst({ where: { codigo: codigoGasto } }) || cuenta629

    // Usar el impuesto real del gasto (o 21% IVA por defecto si no tiene)
    const porcentajeImpuesto = gasto.impuesto ? gasto.impuesto.porcentaje : 21
    const tipoImpuesto = gasto.impuesto ? gasto.impuesto.tipo : 'IVA'

    let baseImponible: number
    let impuestoAmount: number
    if (gasto.impuestoIncluido) {
      baseImponible = gasto.monto / (1 + porcentajeImpuesto / 100)
      impuestoAmount = gasto.monto - baseImponible
    } else {
      baseImponible = gasto.monto
      impuestoAmount = gasto.monto * (porcentajeImpuesto / 100)
    }

    baseImponible = Math.round(baseImponible * 100) / 100
    impuestoAmount = Math.round(impuestoAmount * 100) / 100
    const total = Math.round((baseImponible + impuestoAmount) * 100) / 100

    const lineas: Array<{ cuentaId: number; debe: number; haber: number; concepto: string }> = []

    // Gasto (DEBE grupo 6)
    lineas.push({
      cuentaId: cuentaGasto.id,
      debe: baseImponible,
      haber: 0,
      concepto: gasto.descripcion
    })

    // IVA soportado (DEBE 472) - solo si es tipo IVA y hay importe
    if (impuestoAmount > 0 && tipoImpuesto === 'IVA') {
      lineas.push({
        cuentaId: cuenta472.id,
        debe: impuestoAmount,
        haber: 0,
        concepto: `IVA soportado ${porcentajeImpuesto}% - ${gasto.descripcion}`
      })
    }

    // IRPF retenido en gastos (DEBE 473 - HP retenciones a cuenta)
    // Cuando pagamos a un proveedor que nos retiene IRPF, nosotros tenemos un activo (473)
    if (tipoImpuesto === 'IRPF' && impuestoAmount > 0) {
      const cuenta473 = await db.cuentaContable.findFirst({ where: { codigo: '473' } })
      if (cuenta473) {
        lineas.push({
          cuentaId: cuenta473.id,
          debe: impuestoAmount,
          haber: 0,
          concepto: `IRPF retenido ${porcentajeImpuesto}% - ${gasto.descripcion}`
        })
      }
    }

    // Acreedor (HABER 410)
    const totalPagar = tipoImpuesto === 'IVA' ? total : (baseImponible - impuestoAmount)
    lineas.push({
      cuentaId: cuenta410.id,
      debe: 0,
      haber: Math.round(totalPagar * 100) / 100,
      concepto: `${gasto.proveedor || 'Proveedor'} - ${gasto.descripcion}`
    })

    const lastAsiento = await db.asiento.findFirst({
      where: { ejercicioId: ejercicio.id },
      orderBy: { numero: 'desc' }
    })

    const asiento = await db.asiento.create({
      data: {
        numero: (lastAsiento?.numero || 0) + 1,
        fecha: new Date(gasto.fecha),
        descripcion: `Gasto: ${gasto.descripcion}`,
        tipo: 'gasto',
        documentoRef: gasto.numeroFactura || undefined,
        gastoId: gasto.id,
        ejercicioId: ejercicio.id,
        lineas: { create: lineas }
      },
      include: { lineas: { include: { cuenta: true } }, ejercicio: true }
    })
    return { success: true, data: asiento }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Modelos de Hacienda
// ============================================

ipcMain.handle('modelos:modelo303', async (_, params: { ejercicioId: number; trimestre: number }) => {
  try {
    const db = requireAuth()
    const ejercicio = await db.ejercicioFiscal.findUnique({ where: { id: params.ejercicioId } })
    if (!ejercicio) return { success: false, error: 'Ejercicio no encontrado' }

    const year = ejercicio.anio
    const startMonth = (params.trimestre - 1) * 3
    const fechaDesde = new Date(year, startMonth, 1)
    const fechaHasta = new Date(year, startMonth + 3, 0, 23, 59, 59)

    // Desglose IVA devengado por tipo desde facturas emitidas (excluir borrador y anulada)
    const facturas = await db.factura.findMany({
      where: { fecha: { gte: fechaDesde, lte: fechaHasta }, estado: { notIn: ['anulada', 'borrador'] } },
      include: { lineas: { include: { impuesto: true, retencion: true } } }
    })
    const desgloseDevengado: Record<string, { base: number; cuota: number }> = {}
    for (const factura of facturas) {
      for (const linea of factura.lineas || []) {
        if (linea.impuesto && linea.impuesto.tipo === 'IVA' && linea.impuesto.porcentaje > 0) {
          const key = `${linea.impuesto.porcentaje}%`
          if (!desgloseDevengado[key]) desgloseDevengado[key] = { base: 0, cuota: 0 }
          desgloseDevengado[key].base += linea.subtotal
          desgloseDevengado[key].cuota += linea.totalImpuesto
        }
      }
    }
    // Redondear desglose devengado
    for (const key of Object.keys(desgloseDevengado)) {
      desgloseDevengado[key].base = Math.round(desgloseDevengado[key].base * 100) / 100
      desgloseDevengado[key].cuota = Math.round(desgloseDevengado[key].cuota * 100) / 100
    }

    // Desglose IVA deducible por tipo desde gastos con impuesto
    const gastos = await db.gasto.findMany({
      where: { fecha: { gte: fechaDesde, lte: fechaHasta } },
      include: { impuesto: true }
    })
    const desgloseDeducible: Record<string, { base: number; cuota: number }> = {}
    for (const gasto of gastos) {
      if (gasto.impuesto && gasto.impuesto.tipo === 'IVA' && gasto.impuesto.porcentaje > 0) {
        const porcentaje = gasto.impuesto.porcentaje
        const key = `${porcentaje}%`
        if (!desgloseDeducible[key]) desgloseDeducible[key] = { base: 0, cuota: 0 }
        let base: number, cuota: number
        if (gasto.impuestoIncluido) {
          base = gasto.monto / (1 + porcentaje / 100)
          cuota = gasto.monto - base
        } else {
          base = gasto.monto
          cuota = gasto.monto * (porcentaje / 100)
        }
        desgloseDeducible[key].base += base
        desgloseDeducible[key].cuota += cuota
      }
    }
    // Redondear desglose deducible
    for (const key of Object.keys(desgloseDeducible)) {
      desgloseDeducible[key].base = Math.round(desgloseDeducible[key].base * 100) / 100
      desgloseDeducible[key].cuota = Math.round(desgloseDeducible[key].cuota * 100) / 100
    }

    // Calcular totales directamente desde los desgloses (no depender de asientos contables)
    const devengado = Math.round(Object.values(desgloseDevengado).reduce((sum, d) => sum + d.cuota, 0) * 100) / 100
    const deducible = Math.round(Object.values(desgloseDeducible).reduce((sum, d) => sum + d.cuota, 0) * 100) / 100
    const resultado = Math.round((devengado - deducible) * 100) / 100

    return {
      success: true,
      data: {
        trimestre: params.trimestre,
        anio: year,
        periodo: `${params.trimestre}T ${year}`,
        fechaDesde: fechaDesde.toISOString(),
        fechaHasta: fechaHasta.toISOString(),
        ivaDevengado: devengado,
        ivaDeducible: deducible,
        resultado,
        aIngresar: resultado > 0 ? resultado : 0,
        aCompensar: resultado < 0 ? Math.abs(resultado) : 0,
        desgloseDevengado,
        desgloseDeducible,
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('modelos:modelo111', async (_, params: { ejercicioId: number; trimestre: number }) => {
  try {
    const db = requireAuth()
    const ejercicio = await db.ejercicioFiscal.findUnique({ where: { id: params.ejercicioId } })
    if (!ejercicio) return { success: false, error: 'Ejercicio no encontrado' }

    const year = ejercicio.anio
    const startMonth = (params.trimestre - 1) * 3
    const fechaDesde = new Date(year, startMonth, 1)
    const fechaHasta = new Date(year, startMonth + 3, 0, 23, 59, 59)

    // Retenciones IRPF desde el campo retencion de las líneas de factura
    const facturas = await db.factura.findMany({
      where: {
        fecha: { gte: fechaDesde, lte: fechaHasta },
        estado: { notIn: ['anulada', 'borrador'] }
      },
      include: { lineas: { include: { retencion: true } } }
    })
    let retencionesFacturas = 0
    let numPerceptores = 0
    let baseRetenciones = 0
    const perceptores = new Set<number>()
    for (const factura of facturas) {
      let tieneIRPF = false
      for (const linea of factura.lineas || []) {
        if (linea.retencion && linea.retencion.tipo === 'IRPF') {
          retencionesFacturas += linea.totalRetencion
          baseRetenciones += linea.subtotal
          tieneIRPF = true
        }
      }
      if (tieneIRPF) perceptores.add(factura.clienteId)
    }
    numPerceptores = perceptores.size

    // Calcular directamente desde facturas (no depender de asientos contables)
    const totalRetenciones = Math.round(retencionesFacturas * 100) / 100

    return {
      success: true,
      data: {
        trimestre: params.trimestre,
        anio: year,
        periodo: `${params.trimestre}T ${year}`,
        totalRetenciones,
        numPerceptores,
        baseRetenciones: Math.round(baseRetenciones * 100) / 100,
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('modelos:modelo390', async (_, params: { ejercicioId: number }) => {
  try {
    const db = requireAuth()
    const ejercicio = await db.ejercicioFiscal.findUnique({ where: { id: params.ejercicioId } })
    if (!ejercicio) return { success: false, error: 'Ejercicio no encontrado' }

    const trimestres = []
    for (let t = 1; t <= 4; t++) {
      const startMonth = (t - 1) * 3
      const fechaDesde = new Date(ejercicio.anio, startMonth, 1)
      const fechaHasta = new Date(ejercicio.anio, startMonth + 3, 0, 23, 59, 59)

      // IVA Devengado: directamente desde facturas emitidas
      const facturasTrim = await db.factura.findMany({
        where: { fecha: { gte: fechaDesde, lte: fechaHasta }, estado: { notIn: ['anulada', 'borrador'] } },
        include: { lineas: { include: { impuesto: true, retencion: true } } }
      })
      let devengado = 0
      for (const factura of facturasTrim) {
        for (const linea of factura.lineas || []) {
          if (linea.impuesto && linea.impuesto.tipo === 'IVA' && linea.impuesto.porcentaje > 0) {
            devengado += linea.totalImpuesto
          }
        }
      }
      devengado = Math.round(devengado * 100) / 100

      // IVA Deducible: directamente desde gastos con IVA
      const gastosTrim = await db.gasto.findMany({
        where: { fecha: { gte: fechaDesde, lte: fechaHasta } },
        include: { impuesto: true }
      })
      let deducible = 0
      for (const gasto of gastosTrim) {
        if (gasto.impuesto && gasto.impuesto.tipo === 'IVA' && gasto.impuesto.porcentaje > 0) {
          const porcentaje = gasto.impuesto.porcentaje
          if (gasto.impuestoIncluido) {
            deducible += gasto.monto - gasto.monto / (1 + porcentaje / 100)
          } else {
            deducible += gasto.monto * (porcentaje / 100)
          }
        }
      }
      deducible = Math.round(deducible * 100) / 100

      trimestres.push({
        trimestre: t,
        devengado,
        deducible,
        resultado: Math.round((devengado - deducible) * 100) / 100
      })
    }

    const totalDevengado = Math.round(trimestres.reduce((sum, t) => sum + t.devengado, 0) * 100) / 100
    const totalDeducible = Math.round(trimestres.reduce((sum, t) => sum + t.deducible, 0) * 100) / 100

    return {
      success: true,
      data: {
        anio: ejercicio.anio,
        trimestres,
        totalDevengado,
        totalDeducible,
        resultado: Math.round((totalDevengado - totalDeducible) * 100) / 100,
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Exportar datos a archivo (CSV, Excel, JSON)
ipcMain.handle('export:saveFile', async (_, data: { content: string; defaultFilename: string; filters: Array<{ name: string; extensions: string[] }> }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Exportar datos',
      defaultPath: data.defaultFilename,
      filters: data.filters,
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Operación cancelada' }
    }

    const isBinary = data.defaultFilename.endsWith('.xlsx') || data.defaultFilename.endsWith('.pdf')
    const encoding = isBinary ? 'base64' : 'utf-8'
    if (encoding === 'base64') {
      fs.writeFileSync(result.filePath, Buffer.from(data.content, 'base64'))
    } else {
      fs.writeFileSync(result.filePath, data.content, 'utf-8')
    }

    return { success: true, data: { path: result.filePath } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================================
// Email SMTP handlers
// ============================================================

ipcMain.handle('email:saveConfig', async (_, data: {
  host: string
  port: number
  secure: boolean
  user: string
  pass?: string
  fromName: string
  fromEmail: string
}) => {
  try {
    requireAuth()
    await prisma!.$executeRawUnsafe(`INSERT OR REPLACE INTO Configuracion (clave, valor) VALUES ('email.host', ?)`, data.host)
    await prisma!.$executeRawUnsafe(`INSERT OR REPLACE INTO Configuracion (clave, valor) VALUES ('email.port', ?)`, String(data.port))
    await prisma!.$executeRawUnsafe(`INSERT OR REPLACE INTO Configuracion (clave, valor) VALUES ('email.secure', ?)`, String(data.secure))
    await prisma!.$executeRawUnsafe(`INSERT OR REPLACE INTO Configuracion (clave, valor) VALUES ('email.user', ?)`, data.user)
    await prisma!.$executeRawUnsafe(`INSERT OR REPLACE INTO Configuracion (clave, valor) VALUES ('email.fromName', ?)`, data.fromName)
    await prisma!.$executeRawUnsafe(`INSERT OR REPLACE INTO Configuracion (clave, valor) VALUES ('email.fromEmail', ?)`, data.fromEmail)

    // Encrypt password with safeStorage if provided
    if (data.pass) {
      const encrypted = safeStorage.encryptString(data.pass).toString('base64')
      await prisma!.$executeRawUnsafe(`INSERT OR REPLACE INTO Configuracion (clave, valor) VALUES ('email.pass', ?)`, encrypted)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('email:test', async () => {
  try {
    requireAuth()
    const rows = await prisma!.$queryRawUnsafe<{ clave: string; valor: string }[]>(
      `SELECT clave, valor FROM Configuracion WHERE clave LIKE 'email.%'`
    )
    const cfg: Record<string, string> = {}
    for (const row of rows) cfg[row.clave] = row.valor

    if (!cfg['email.host'] || !cfg['email.user'] || !cfg['email.pass']) {
      return { success: false, error: 'Configuración SMTP incompleta. Guarda la configuración primero.' }
    }

    const decryptedPass = safeStorage.decryptString(Buffer.from(cfg['email.pass'], 'base64'))

    const transporter = nodemailer.createTransport({
      host: cfg['email.host'],
      port: parseInt(cfg['email.port'] || '587'),
      secure: cfg['email.secure'] === 'true',
      auth: {
        user: cfg['email.user'],
        pass: decryptedPass,
      },
    })

    await transporter.verify()
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('email:send', async (_, data: {
  to: string
  cc?: string
  subject: string
  body: string
  attachmentName?: string
  attachmentBase64?: string
}) => {
  try {
    requireAuth()
    const rows = await prisma!.$queryRawUnsafe<{ clave: string; valor: string }[]>(
      `SELECT clave, valor FROM Configuracion WHERE clave LIKE 'email.%'`
    )
    const cfg: Record<string, string> = {}
    for (const row of rows) cfg[row.clave] = row.valor

    if (!cfg['email.host'] || !cfg['email.user'] || !cfg['email.pass']) {
      return { success: false, error: 'Configuración SMTP no encontrada. Ve a Configuración > Email.' }
    }

    const decryptedPass = safeStorage.decryptString(Buffer.from(cfg['email.pass'], 'base64'))

    const transporter = nodemailer.createTransport({
      host: cfg['email.host'],
      port: parseInt(cfg['email.port'] || '587'),
      secure: cfg['email.secure'] === 'true',
      auth: {
        user: cfg['email.user'],
        pass: decryptedPass,
      },
    })

    const fromName = cfg['email.fromName'] || ''
    const fromEmail = cfg['email.fromEmail'] || cfg['email.user']
    const from = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail

    // Check license and branding preference
    const brandingRows = await prisma!.$queryRawUnsafe<{ clave: string; valor: string }[]>(
      `SELECT clave, valor FROM Configuracion WHERE clave IN ('cloud_license_granted', 'email.hideBranding')`
    )
    const brandingCfg: Record<string, string> = {}
    for (const row of brandingRows) brandingCfg[row.clave] = row.valor
    const hasLicense = !!brandingCfg['cloud_license_granted']
    const hideBranding = hasLicense && brandingCfg['email.hideBranding'] === 'true'

    let emailBody = data.body
    let emailHtml: string | undefined
    if (!hideBranding) {
      const footer = '\n\n--\nEnviado gracias a CryptoGest — https://cryptogest.app'
      emailBody = data.body + footer
      const bodyHtml = data.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
      emailHtml = bodyHtml + '<br><br><hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"><p style="font-size:12px;color:#9ca3af">Enviado gracias a <a href="https://cryptogest.app" style="color:#3b82f6;text-decoration:none">CryptoGest</a></p>'
    }

    const mailOptions: nodemailer.SendMailOptions = {
      from,
      to: data.to,
      cc: data.cc || undefined,
      subject: data.subject,
      text: emailBody,
      html: emailHtml,
    }

    if (data.attachmentBase64 && data.attachmentName) {
      mailOptions.attachments = [{
        filename: data.attachmentName,
        content: Buffer.from(data.attachmentBase64, 'base64'),
      }]
    }

    await transporter.sendMail(mailOptions)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Buzón de Correo
// ============================================

function createImapConnection(account: { imapHost: string; imapPort: number; imapSecure: number; imapUser: string; imapPass: string }): ImapFlow {
  const decryptedPass = safeStorage.decryptString(Buffer.from(account.imapPass, 'base64'))
  return new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure === 1,
    auth: {
      user: account.imapUser,
      pass: decryptedPass,
    },
    logger: false,
  })
}

function createAccountTransporter(account: { smtpHost: string; smtpPort: number; smtpSecure: number; smtpUser: string; smtpPass: string }) {
  const decryptedPass = safeStorage.decryptString(Buffer.from(account.smtpPass, 'base64'))
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure === 1,
    auth: {
      user: account.smtpUser,
      pass: decryptedPass,
    },
  })
}

function checkHasAttachments(bodyStructure: any): boolean {
  if (!bodyStructure) return false
  if (bodyStructure.disposition === 'attachment') return true
  if (bodyStructure.childNodes) {
    return bodyStructure.childNodes.some((child: any) => checkHasAttachments(child))
  }
  return false
}

// --- Cuentas ---

ipcMain.handle('buzon:addAccount', async (_, data: {
  nombre: string; email: string;
  imapHost: string; imapPort: number; imapSecure: boolean; imapUser: string; imapPass: string;
  smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string; smtpPass: string;
  fromName: string;
}) => {
  try {
    requireAuth()
    const encImapPass = safeStorage.encryptString(data.imapPass).toString('base64')
    const encSmtpPass = safeStorage.encryptString(data.smtpPass).toString('base64')
    await prisma!.$executeRawUnsafe(
      `INSERT INTO "CuentaEmail" ("nombre","email","imapHost","imapPort","imapSecure","imapUser","imapPass","smtpHost","smtpPort","smtpSecure","smtpUser","smtpPass","fromName") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      data.nombre, data.email,
      data.imapHost, data.imapPort, data.imapSecure ? 1 : 0, data.imapUser, encImapPass,
      data.smtpHost, data.smtpPort, data.smtpSecure ? 1 : 0, data.smtpUser, encSmtpPass,
      data.fromName || ''
    )
    const rows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CuentaEmail" ORDER BY "id" DESC LIMIT 1`)
    return { success: true, data: rows[0] }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('buzon:updateAccount', async (_, id: number, data: {
  nombre: string; email: string;
  imapHost: string; imapPort: number; imapSecure: boolean; imapUser: string; imapPass?: string;
  smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string; smtpPass?: string;
  fromName: string;
}) => {
  try {
    requireAuth()
    let query = `UPDATE "CuentaEmail" SET "nombre"=?,"email"=?,"imapHost"=?,"imapPort"=?,"imapSecure"=?,"imapUser"=?,"smtpHost"=?,"smtpPort"=?,"smtpSecure"=?,"smtpUser"=?,"fromName"=?,"updatedAt"=CURRENT_TIMESTAMP`
    const params: any[] = [
      data.nombre, data.email,
      data.imapHost, data.imapPort, data.imapSecure ? 1 : 0, data.imapUser,
      data.smtpHost, data.smtpPort, data.smtpSecure ? 1 : 0, data.smtpUser,
      data.fromName || ''
    ]
    if (data.imapPass) {
      query += `,"imapPass"=?`
      params.push(safeStorage.encryptString(data.imapPass).toString('base64'))
    }
    if (data.smtpPass) {
      query += `,"smtpPass"=?`
      params.push(safeStorage.encryptString(data.smtpPass).toString('base64'))
    }
    query += ` WHERE "id"=?`
    params.push(id)
    await prisma!.$executeRawUnsafe(query, ...params)
    const rows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CuentaEmail" WHERE "id"=?`, id)
    return { success: true, data: rows[0] }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('buzon:deleteAccount', async (_, id: number) => {
  try {
    requireAuth()
    await prisma!.$executeRawUnsafe(`DELETE FROM "CuentaEmail" WHERE "id"=?`, id)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('buzon:listAccounts', async () => {
  try {
    requireAuth()
    const rows = await prisma!.$queryRawUnsafe<any[]>(`SELECT "id","nombre","email","imapHost","imapPort","imapSecure","imapUser","smtpHost","smtpPort","smtpSecure","smtpUser","fromName","activo","createdAt","updatedAt" FROM "CuentaEmail" ORDER BY "nombre"`)
    return { success: true, data: rows }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('buzon:testConnection', async (_, id: number) => {
  try {
    requireAuth()
    const rows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CuentaEmail" WHERE "id"=?`, id)
    if (!rows.length) return { success: false, error: 'Cuenta no encontrada' }
    const account = rows[0]

    // Test IMAP
    const imap = createImapConnection(account)
    await imap.connect()
    await imap.logout()

    // Test SMTP
    const transporter = createAccountTransporter(account)
    await transporter.verify()

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// --- Carpetas ---

ipcMain.handle('buzon:syncFolders', async (_, cuentaId: number) => {
  try {
    requireAuth()
    const rows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CuentaEmail" WHERE "id"=?`, cuentaId)
    if (!rows.length) return { success: false, error: 'Cuenta no encontrada' }

    const imap = createImapConnection(rows[0])
    await imap.connect()

    const folders = await imap.list()
    await imap.logout()

    // Upsert folders
    for (const folder of folders) {
      const specialUse = folder.specialUse || null
      const existing = await prisma!.$queryRawUnsafe<any[]>(
        `SELECT "id" FROM "CarpetaEmail" WHERE "cuentaId"=? AND "path"=?`, cuentaId, folder.path
      )
      if (existing.length > 0) {
        await prisma!.$executeRawUnsafe(
          `UPDATE "CarpetaEmail" SET "nombre"=?,"specialUse"=?,"syncedAt"=CURRENT_TIMESTAMP WHERE "id"=?`,
          folder.name, specialUse, existing[0].id
        )
      } else {
        await prisma!.$executeRawUnsafe(
          `INSERT INTO "CarpetaEmail" ("cuentaId","path","nombre","specialUse","syncedAt") VALUES (?,?,?,?,CURRENT_TIMESTAMP)`,
          cuentaId, folder.path, folder.name, specialUse
        )
      }
    }

    // Remove folders that no longer exist on server
    const serverPaths = folders.map(f => f.path)
    const dbFolders = await prisma!.$queryRawUnsafe<any[]>(
      `SELECT "id","path" FROM "CarpetaEmail" WHERE "cuentaId"=?`, cuentaId
    )
    for (const dbFolder of dbFolders) {
      if (!serverPaths.includes(dbFolder.path)) {
        await prisma!.$executeRawUnsafe(`DELETE FROM "CarpetaEmail" WHERE "id"=?`, dbFolder.id)
      }
    }

    const updatedFolders = await prisma!.$queryRawUnsafe<any[]>(
      `SELECT * FROM "CarpetaEmail" WHERE "cuentaId"=? ORDER BY "specialUse" IS NULL, "nombre"`, cuentaId
    )
    return { success: true, data: updatedFolders }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('buzon:listFolders', async (_, cuentaId: number) => {
  try {
    requireAuth()
    const rows = await prisma!.$queryRawUnsafe<any[]>(
      `SELECT * FROM "CarpetaEmail" WHERE "cuentaId"=? ORDER BY "specialUse" IS NULL, "nombre"`, cuentaId
    )
    return { success: true, data: rows }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// --- Mensajes ---

ipcMain.handle('buzon:syncMessages', async (_, cuentaId: number, carpetaId: number) => {
  try {
    requireAuth()
    const accountRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CuentaEmail" WHERE "id"=?`, cuentaId)
    if (!accountRows.length) return { success: false, error: 'Cuenta no encontrada' }
    const folderRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CarpetaEmail" WHERE "id"=?`, carpetaId)
    if (!folderRows.length) return { success: false, error: 'Carpeta no encontrada' }

    const imap = createImapConnection(accountRows[0])
    await imap.connect()

    const lock = await imap.getMailboxLock(folderRows[0].path)
    try {
      // Update folder stats
      const status = imap.mailbox
      if (status) {
        await prisma!.$executeRawUnsafe(
          `UPDATE "CarpetaEmail" SET "totalMessages"=?,"unseenMessages"=?,"syncedAt"=CURRENT_TIMESTAMP WHERE "id"=?`,
          status.exists || 0, status.unseen || 0, carpetaId
        )
      }

      // Get highest synced UID to only fetch new messages
      const maxUidRows = await prisma!.$queryRawUnsafe<any[]>(
        `SELECT MAX("uid") as maxUid FROM "CorreoCache" WHERE "cuentaId"=? AND "carpetaId"=?`, cuentaId, carpetaId
      )
      const maxUid = maxUidRows[0]?.maxUid || 0
      const range = maxUid > 0 ? `${maxUid + 1}:*` : '1:*'

      let synced = 0
      for await (const msg of imap.fetch(range, {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        size: true,
      })) {
        if (msg.uid <= maxUid) continue // Skip already-synced
        const env = msg.envelope
        const fromAddr = env.from?.[0]?.address || ''
        const fromName = env.from?.[0]?.name || ''
        const toAddr = env.to?.map((t: any) => t.address).join(', ') || ''
        const subject = env.subject || ''
        const messageId = env.messageId || ''
        const fecha = env.date ? new Date(env.date).toISOString() : new Date().toISOString()
        const seen = msg.flags?.has('\\Seen') ? 1 : 0
        const flagged = msg.flags?.has('\\Flagged') ? 1 : 0
        const hasAttachments = checkHasAttachments(msg.bodyStructure) ? 1 : 0

        await prisma!.$executeRawUnsafe(
          `INSERT OR IGNORE INTO "CorreoCache" ("cuentaId","carpetaId","uid","messageId","fromAddress","fromName","toAddress","subject","fecha","hasAttachments","seen","flagged","size") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          cuentaId, carpetaId, msg.uid, messageId, fromAddr, fromName, toAddr, subject, fecha, hasAttachments, seen, flagged, msg.size || 0
        )
        synced++
      }

      // Also update flags for recently synced messages (last 100)
      const recentRows = await prisma!.$queryRawUnsafe<any[]>(
        `SELECT "uid" FROM "CorreoCache" WHERE "cuentaId"=? AND "carpetaId"=? ORDER BY "uid" DESC LIMIT 100`, cuentaId, carpetaId
      )
      if (recentRows.length > 0) {
        const minRecentUid = recentRows[recentRows.length - 1].uid
        const maxRecentUid = recentRows[0].uid
        for await (const msg of imap.fetch(`${minRecentUid}:${maxRecentUid}`, { uid: true, flags: true })) {
          const seen = msg.flags?.has('\\Seen') ? 1 : 0
          const flagged = msg.flags?.has('\\Flagged') ? 1 : 0
          await prisma!.$executeRawUnsafe(
            `UPDATE "CorreoCache" SET "seen"=?,"flagged"=? WHERE "cuentaId"=? AND "carpetaId"=? AND "uid"=?`,
            seen, flagged, cuentaId, carpetaId, msg.uid
          )
        }
      }
    } finally {
      lock.release()
    }

    await imap.logout()
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('buzon:listMessages', async (_, cuentaId: number, carpetaId: number, page: number = 1, pageSize: number = 50) => {
  try {
    requireAuth()
    const offset = (page - 1) * pageSize
    const rows = await prisma!.$queryRawUnsafe<any[]>(
      `SELECT * FROM "CorreoCache" WHERE "cuentaId"=? AND "carpetaId"=? ORDER BY "fecha" DESC LIMIT ? OFFSET ?`,
      cuentaId, carpetaId, pageSize, offset
    )
    const countRows = await prisma!.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as total FROM "CorreoCache" WHERE "cuentaId"=? AND "carpetaId"=?`, cuentaId, carpetaId
    )
    const total = Number(countRows[0]?.total || 0)
    return { success: true, data: { messages: rows, total, page, pageSize } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('buzon:getMessage', async (_, cuentaId: number, carpetaId: number, uid: number) => {
  try {
    requireAuth()
    const accountRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CuentaEmail" WHERE "id"=?`, cuentaId)
    if (!accountRows.length) return { success: false, error: 'Cuenta no encontrada' }
    const folderRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CarpetaEmail" WHERE "id"=?`, carpetaId)
    if (!folderRows.length) return { success: false, error: 'Carpeta no encontrada' }

    const imap = createImapConnection(accountRows[0])
    await imap.connect()

    const lock = await imap.getMailboxLock(folderRows[0].path)
    let result: any = null
    try {
      const download = await imap.download(String(uid), undefined, { uid: true })
      if (download?.content) {
        const parsed = await simpleParser(download.content)

        // Mark as seen
        await imap.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })

        const attachments = (parsed.attachments || []).map((att, idx) => ({
          index: idx,
          filename: att.filename || `attachment_${idx}`,
          contentType: att.contentType,
          size: att.size,
        }))

        result = {
          uid,
          messageId: parsed.messageId || '',
          from: parsed.from?.value || [],
          to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.flatMap((t: any) => t.value) : parsed.to.value) : [],
          cc: parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc.flatMap((c: any) => c.value) : parsed.cc.value) : [],
          subject: parsed.subject || '',
          date: parsed.date?.toISOString() || '',
          html: parsed.html || '',
          text: parsed.text || '',
          attachments,
        }
      }

      // Update cache seen flag
      await prisma!.$executeRawUnsafe(
        `UPDATE "CorreoCache" SET "seen"=1 WHERE "cuentaId"=? AND "carpetaId"=? AND "uid"=?`,
        cuentaId, carpetaId, uid
      )
    } finally {
      lock.release()
    }

    await imap.logout()
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('buzon:downloadAttachment', async (_, cuentaId: number, carpetaId: number, uid: number, attachmentIndex: number) => {
  try {
    requireAuth()
    const accountRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CuentaEmail" WHERE "id"=?`, cuentaId)
    if (!accountRows.length) return { success: false, error: 'Cuenta no encontrada' }
    const folderRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CarpetaEmail" WHERE "id"=?`, carpetaId)
    if (!folderRows.length) return { success: false, error: 'Carpeta no encontrada' }

    const imap = createImapConnection(accountRows[0])
    await imap.connect()

    const lock = await imap.getMailboxLock(folderRows[0].path)
    let attachmentData: { filename: string; contentType: string; data: number[] } | null = null
    try {
      const download = await imap.download(String(uid), undefined, { uid: true })
      if (download?.content) {
        const parsed = await simpleParser(download.content)
        const att = parsed.attachments?.[attachmentIndex]
        if (att) {
          // Ask user where to save
          const result = await dialog.showSaveDialog(mainWindow!, {
            defaultPath: att.filename || 'attachment',
          })
          if (!result.canceled && result.filePath) {
            fs.writeFileSync(result.filePath, att.content)
            attachmentData = {
              filename: att.filename || 'attachment',
              contentType: att.contentType,
              data: Array.from(att.content),
            }
          }
        }
      }
    } finally {
      lock.release()
    }

    await imap.logout()
    return { success: true, data: attachmentData }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// --- Acciones ---

ipcMain.handle('buzon:markRead', async (_, cuentaId: number, carpetaId: number, uid: number) => {
  try {
    requireAuth()
    const accountRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CuentaEmail" WHERE "id"=?`, cuentaId)
    if (!accountRows.length) return { success: false, error: 'Cuenta no encontrada' }
    const folderRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CarpetaEmail" WHERE "id"=?`, carpetaId)
    if (!folderRows.length) return { success: false, error: 'Carpeta no encontrada' }

    const imap = createImapConnection(accountRows[0])
    await imap.connect()
    const lock = await imap.getMailboxLock(folderRows[0].path)
    try {
      await imap.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
    } finally {
      lock.release()
    }
    await imap.logout()

    await prisma!.$executeRawUnsafe(
      `UPDATE "CorreoCache" SET "seen"=1 WHERE "cuentaId"=? AND "carpetaId"=? AND "uid"=?`,
      cuentaId, carpetaId, uid
    )
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('buzon:markUnread', async (_, cuentaId: number, carpetaId: number, uid: number) => {
  try {
    requireAuth()
    const accountRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CuentaEmail" WHERE "id"=?`, cuentaId)
    if (!accountRows.length) return { success: false, error: 'Cuenta no encontrada' }
    const folderRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CarpetaEmail" WHERE "id"=?`, carpetaId)
    if (!folderRows.length) return { success: false, error: 'Carpeta no encontrada' }

    const imap = createImapConnection(accountRows[0])
    await imap.connect()
    const lock = await imap.getMailboxLock(folderRows[0].path)
    try {
      await imap.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true })
    } finally {
      lock.release()
    }
    await imap.logout()

    await prisma!.$executeRawUnsafe(
      `UPDATE "CorreoCache" SET "seen"=0 WHERE "cuentaId"=? AND "carpetaId"=? AND "uid"=?`,
      cuentaId, carpetaId, uid
    )
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('buzon:deleteMessage', async (_, cuentaId: number, carpetaId: number, uid: number) => {
  try {
    requireAuth()
    const accountRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CuentaEmail" WHERE "id"=?`, cuentaId)
    if (!accountRows.length) return { success: false, error: 'Cuenta no encontrada' }
    const folderRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CarpetaEmail" WHERE "id"=?`, carpetaId)
    if (!folderRows.length) return { success: false, error: 'Carpeta no encontrada' }

    const imap = createImapConnection(accountRows[0])
    await imap.connect()
    const lock = await imap.getMailboxLock(folderRows[0].path)
    try {
      await imap.messageFlagsAdd(String(uid), ['\\Deleted'], { uid: true })
      await imap.messageDelete(String(uid), { uid: true })
    } finally {
      lock.release()
    }
    await imap.logout()

    await prisma!.$executeRawUnsafe(
      `DELETE FROM "CorreoCache" WHERE "cuentaId"=? AND "carpetaId"=? AND "uid"=?`,
      cuentaId, carpetaId, uid
    )
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('buzon:moveMessage', async (_, cuentaId: number, carpetaId: number, uid: number, destPath: string) => {
  try {
    requireAuth()
    const accountRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CuentaEmail" WHERE "id"=?`, cuentaId)
    if (!accountRows.length) return { success: false, error: 'Cuenta no encontrada' }
    const folderRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CarpetaEmail" WHERE "id"=?`, carpetaId)
    if (!folderRows.length) return { success: false, error: 'Carpeta no encontrada' }

    const imap = createImapConnection(accountRows[0])
    await imap.connect()
    const lock = await imap.getMailboxLock(folderRows[0].path)
    try {
      await imap.messageMove(String(uid), destPath, { uid: true })
    } finally {
      lock.release()
    }
    await imap.logout()

    // Remove from source folder cache
    await prisma!.$executeRawUnsafe(
      `DELETE FROM "CorreoCache" WHERE "cuentaId"=? AND "carpetaId"=? AND "uid"=?`,
      cuentaId, carpetaId, uid
    )
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// --- Envío ---

ipcMain.handle('buzon:sendEmail', async (_, cuentaId: number, data: {
  to: string; cc?: string; subject: string;
  html: string; text: string;
  inReplyTo?: string; references?: string;
  attachments?: Array<{ filename: string; data: number[] }>;
}) => {
  try {
    requireAuth()
    const accountRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CuentaEmail" WHERE "id"=?`, cuentaId)
    if (!accountRows.length) return { success: false, error: 'Cuenta no encontrada' }

    const account = accountRows[0]
    const transporter = createAccountTransporter(account)

    const fromName = account.fromName || account.nombre
    const from = fromName ? `"${fromName}" <${account.email}>` : account.email

    const mailOptions: nodemailer.SendMailOptions = {
      from,
      to: data.to,
      cc: data.cc || undefined,
      subject: data.subject,
      text: data.text || htmlToText(data.html || ''),
      html: data.html || undefined,
      inReplyTo: data.inReplyTo || undefined,
      references: data.references || undefined,
    }

    if (data.attachments?.length) {
      mailOptions.attachments = data.attachments.map(att => ({
        filename: att.filename,
        content: Buffer.from(att.data),
      }))
    }

    await transporter.sendMail(mailOptions)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})
