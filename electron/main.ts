import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, net } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import nodeCrypto from 'crypto'
import { spawn } from 'child_process'
import archiver from 'archiver'
import AdmZip from 'adm-zip'
import { PrismaClient } from '@prisma/client'
import * as crypto from './crypto'
import * as cloud from './cloud'
import * as cloudApi from './cloudApi'
import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { convert as htmlToText } from 'html-to-text'
import { autoUpdater } from 'electron-updater'
import { DBFFile } from 'dbffile'

// GPU crash workaround: Chromium GPU process can crash on certain Windows GPU drivers.
// Use ANGLE with D3D11 backend and allow software fallback to prevent repeated GPU crashes.
app.commandLine.appendSwitch('use-angle', 'd3d11')
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('gpu-fallback-to-software-rasterizer')

// Establecer nombre de la aplicación
app.setName('CryptoGest')

// Estado de autenticación
let currentPassword: string | null = null
let isAuthenticated = false
let activeEmpresaId: string | null = null
let isCloudMode = false  // true when active empresa is cloud type

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

  // ---- Tablas RRHH ----

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Departamento" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "nombre" TEXT NOT NULL,
      "activo" INTEGER NOT NULL DEFAULT 1,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Departamento_nombre_key" ON "Departamento"("nombre")`)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Empleado" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "nombre" TEXT NOT NULL,
      "apellidos" TEXT NOT NULL,
      "nif" TEXT NOT NULL,
      "numSeguridadSocial" TEXT,
      "fechaNacimiento" DATETIME,
      "genero" TEXT,
      "estadoCivil" TEXT,
      "email" TEXT,
      "telefono" TEXT,
      "direccion" TEXT,
      "codigoPostal" TEXT,
      "ciudad" TEXT,
      "provincia" TEXT,
      "pais" TEXT NOT NULL DEFAULT 'España',
      "iban" TEXT,
      "categoriaProfesional" TEXT,
      "grupoCotizacion" INTEGER NOT NULL DEFAULT 1,
      "departamentoId" INTEGER,
      "codigoCNAE" TEXT,
      "fechaAlta" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "fechaBaja" DATETIME,
      "motivoBaja" TEXT,
      "porcentajeIRPF" REAL NOT NULL DEFAULT 0,
      "diasVacacionesAnuales" INTEGER NOT NULL DEFAULT 30,
      "activo" INTEGER NOT NULL DEFAULT 1,
      "notas" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Empleado_departamentoId_fkey" FOREIGN KEY ("departamentoId") REFERENCES "Departamento" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Empleado_nif_key" ON "Empleado"("nif")`)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Contrato" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "empleadoId" INTEGER NOT NULL,
      "tipoContrato" TEXT NOT NULL DEFAULT 'indefinido',
      "fechaInicio" DATETIME NOT NULL,
      "fechaFin" DATETIME,
      "jornada" TEXT NOT NULL DEFAULT 'completa',
      "horasSemanales" REAL NOT NULL DEFAULT 40,
      "salarioBrutoAnual" REAL NOT NULL,
      "salarioBrutoMensual" REAL NOT NULL,
      "numPagasExtra" INTEGER NOT NULL DEFAULT 2,
      "pagasProrrateadas" INTEGER NOT NULL DEFAULT 0,
      "convenioColectivo" TEXT,
      "codigoContrato" TEXT,
      "porcentajeATEP" REAL NOT NULL DEFAULT 1.50,
      "activo" INTEGER NOT NULL DEFAULT 1,
      "notas" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Contrato_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Nomina" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "empleadoId" INTEGER NOT NULL,
      "mes" INTEGER NOT NULL,
      "anio" INTEGER NOT NULL,
      "salarioBase" REAL NOT NULL,
      "prorrataPagasExtra" REAL NOT NULL DEFAULT 0,
      "complementos" REAL NOT NULL DEFAULT 0,
      "horasExtraImporte" REAL NOT NULL DEFAULT 0,
      "otrosDevengos" REAL NOT NULL DEFAULT 0,
      "totalDevengado" REAL NOT NULL,
      "baseCotizacionCC" REAL NOT NULL,
      "baseCotizacionCP" REAL NOT NULL,
      "ccTrabajador" REAL NOT NULL,
      "desempleoTrabajador" REAL NOT NULL,
      "fpTrabajador" REAL NOT NULL,
      "irpfImporte" REAL NOT NULL,
      "porcentajeIRPF" REAL NOT NULL,
      "totalDeducciones" REAL NOT NULL,
      "liquidoPercibir" REAL NOT NULL,
      "ccEmpresa" REAL NOT NULL,
      "desempleoEmpresa" REAL NOT NULL,
      "fogasaEmpresa" REAL NOT NULL,
      "fpEmpresa" REAL NOT NULL,
      "atepEmpresa" REAL NOT NULL,
      "totalCosteSS" REAL NOT NULL,
      "costeTotal" REAL NOT NULL,
      "estado" TEXT NOT NULL DEFAULT 'borrador',
      "fechaPago" DATETIME,
      "notas" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Nomina_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Nomina_empleadoId_mes_anio_key" ON "Nomina"("empleadoId", "mes", "anio")`)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LineaNomina" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "nominaId" INTEGER NOT NULL,
      "tipo" TEXT NOT NULL,
      "concepto" TEXT NOT NULL,
      "base" REAL NOT NULL DEFAULT 0,
      "porcentaje" REAL NOT NULL DEFAULT 0,
      "importe" REAL NOT NULL,
      "orden" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "LineaNomina_nominaId_fkey" FOREIGN KEY ("nominaId") REFERENCES "Nomina" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LoteSEPA" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "tipo" TEXT NOT NULL,
      "referencia" TEXT NOT NULL,
      "fechaCreacion" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "fechaEjecucion" DATETIME NOT NULL,
      "ordenante" TEXT NOT NULL,
      "ordenanteIBAN" TEXT NOT NULL,
      "ordenanteBIC" TEXT,
      "ordenanteNIF" TEXT NOT NULL,
      "idAcreedor" TEXT,
      "numOperaciones" INTEGER NOT NULL,
      "importeTotal" REAL NOT NULL,
      "estado" TEXT NOT NULL DEFAULT 'generado',
      "xmlContent" TEXT NOT NULL,
      "notas" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "LoteSEPA_referencia_key" ON "LoteSEPA"("referencia")`)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TipoAusencia" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "nombre" TEXT NOT NULL,
      "codigo" TEXT NOT NULL,
      "descontaSalario" INTEGER NOT NULL DEFAULT 0,
      "requiereAprobacion" INTEGER NOT NULL DEFAULT 1,
      "color" TEXT NOT NULL DEFAULT '#3B82F6',
      "activo" INTEGER NOT NULL DEFAULT 1,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TipoAusencia_nombre_key" ON "TipoAusencia"("nombre")`)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TipoAusencia_codigo_key" ON "TipoAusencia"("codigo")`)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Ausencia" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "empleadoId" INTEGER NOT NULL,
      "tipoAusenciaId" INTEGER NOT NULL,
      "fechaInicio" DATETIME NOT NULL,
      "fechaFin" DATETIME NOT NULL,
      "diasNaturales" INTEGER NOT NULL,
      "diasHabiles" INTEGER NOT NULL,
      "estado" TEXT NOT NULL DEFAULT 'pendiente',
      "notas" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Ausencia_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Ausencia_tipoAusenciaId_fkey" FOREIGN KEY ("tipoAusenciaId") REFERENCES "TipoAusencia" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RegistroJornada" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "empleadoId" INTEGER NOT NULL,
      "fecha" DATETIME NOT NULL,
      "horaEntrada" DATETIME,
      "horaSalida" DATETIME,
      "pausaMinutos" INTEGER NOT NULL DEFAULT 0,
      "horasTrabajadas" REAL NOT NULL DEFAULT 0,
      "horasExtra" REAL NOT NULL DEFAULT 0,
      "tipoHorasExtra" TEXT,
      "notas" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "RegistroJornada_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "RegistroJornada_empleadoId_fecha_key" ON "RegistroJornada"("empleadoId", "fecha")`)

  // Add nominaId to Asiento if not exists
  try { await db.$executeRawUnsafe(`ALTER TABLE "Asiento" ADD COLUMN "nominaId" INTEGER REFERENCES "Nomina"("id")`) } catch {}
  try { await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Asiento_nominaId_key" ON "Asiento"("nominaId")`) } catch {}

  // Add SEPA fields to Cliente if not exists
  try { await db.$executeRawUnsafe(`ALTER TABLE "Cliente" ADD COLUMN "iban" TEXT`) } catch {}
  try { await db.$executeRawUnsafe(`ALTER TABLE "Cliente" ADD COLUMN "mandatoSEPA" TEXT`) } catch {}
  try { await db.$executeRawUnsafe(`ALTER TABLE "Cliente" ADD COLUMN "mandatoSEPAFecha" DATETIME`) } catch {}
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
let pendingDeepLinkData: { type: 'connect'; token: string; server: string } | { type: 'invite'; code: string } | null = null
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

    const hostname = parsed.hostname || parsed.pathname?.replace(/^\/\//, '')

    if (hostname === 'connect') {
      const token = parsed.searchParams.get('token')
      const server = parsed.searchParams.get('server')
      if (token && server) {
        pendingDeepLinkData = { type: 'connect', token, server }
        tryProcessDeepLink()
      }
    } else if (hostname === 'invite') {
      const code = parsed.searchParams.get('code')
      if (code) {
        pendingDeepLinkData = { type: 'invite', code }
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

  const data = pendingDeepLinkData
  pendingDeepLinkData = null // Clear before async work to prevent double-processing

  if (data.type === 'invite') {
    console.log('[DeepLink] Invite deep link received, code:', data.code)
    if (mainWindow) {
      mainWindow.webContents.send('deep-link:invite', { code: data.code })
    }
    return
  }

  try {
    console.log('[DeepLink] Confirming device link with server:', data.server)
    const response = await cloud.confirmDeviceLink(data.server, data.token)

    // Set cloud config in memory
    cloud.setCloudConfig(data.server, response.api_token)

    // Save session to disk (program-level)
    crypto.saveCloudSession({
      serverUrl: data.server,
      token: response.api_token,
      user: response.user,
    })

    console.log('[DeepLink] Device linked successfully for user:', response.user.email)

    // Notify the renderer that connection succeeded
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

  // Connect mainWindow to cloudApi for cache sync notifications
  cloudApi.setCacheMainWindow(mainWindow)
  mainWindow.on('closed', () => {
    cloudApi.setCacheMainWindow(null)
  })
}

app.whenReady().then(() => {
  // Initialize cloud config from persisted session
  cloud.initFromSession()

  createWindow()

  // --- Auto-updater configuration ---
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('updater:checking')
  })
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:available', { version: info.version, releaseDate: info.releaseDate })
  })
  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('updater:not-available')
  })
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:download-progress', { percent: progress.percent })
  })
  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('updater:downloaded')
  })
  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('updater:error', err?.message || 'Unknown error')
  })

  // Check for updates on startup (silent — errors are expected in dev)
  autoUpdater.checkForUpdates().catch(() => {})

  // IPC handlers for updater
  ipcMain.handle('updater:checkForUpdates', async () => {
    try {
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error checking for updates' }
    }
  })
  ipcMain.handle('updater:downloadUpdate', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error downloading update' }
    }
  })
  ipcMain.handle('updater:quitAndInstall', () => {
    autoUpdater.quitAndInstall()
    return { success: true }
  })
  ipcMain.handle('updater:getVersion', () => {
    return { success: true, data: app.getVersion() }
  })
  ipcMain.handle('updater:getReleases', async (_event: any, targetLang?: string) => {
    try {
      const resp = await net.fetch('https://api.github.com/repos/abrahampo1/cryptogest/releases?per_page=10')
      if (!resp.ok) return { success: true, data: [] }
      const data = await resp.json()
      let releases = data.map((r: any) => ({
        tag: r.tag_name,
        name: r.name,
        body: r.body,
        date: r.published_at,
        prerelease: r.prerelease,
      }))
      // Auto-translate if target language is not Spanish (releases are written in ES)
      if (targetLang && targetLang !== 'es') {
        const translateText = async (text: string, tl: string): Promise<string> => {
          try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=es&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`
            const r = await net.fetch(url)
            if (!r.ok) return text
            const json = await r.json()
            return (json[0] as any[]).map((s: any) => s[0]).join('')
          } catch { return text }
        }
        releases = await Promise.all(releases.map(async (rel: any) => ({
          ...rel,
          name: rel.name ? await translateText(rel.name, targetLang) : rel.name,
          body: rel.body ? await translateText(rel.body, targetLang) : rel.body,
        })))
      }
      return { success: true, data: releases }
    } catch {
      return { success: true, data: [] }
    }
  })

  // ============================================
  // IPC Handlers - Cloud Session (program-level)
  // ============================================

  ipcMain.handle('cloudSession:get', async () => {
    try {
      const session = crypto.loadCloudSession()
      if (!session) return { success: true, data: null }
      // Verify token is still valid
      cloud.setCloudConfig(session.serverUrl, session.token)
      try {
        const authResult = await cloud.checkAuth()
        // Update user info if changed
        const updatedSession: crypto.CloudSession = {
          ...session,
          user: authResult.user,
        }
        if (JSON.stringify(updatedSession.user) !== JSON.stringify(session.user)) {
          crypto.saveCloudSession(updatedSession)
        }
        return { success: true, data: updatedSession }
      } catch {
        // Token may be expired — still return session but mark as unverified
        return { success: true, data: session }
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('cloudSession:logout', async () => {
    try {
      crypto.clearCloudSession()
      cloud.clearCloudConfig()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

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

  // Encriptar la base de datos si hay contraseña configurada (local only)
  if (!isCloudMode && currentPassword && crypto.isAuthConfigured()) {
    const result = crypto.encryptDatabase(currentPassword)
    if (!result.success) {
      console.error('Error al encriptar base de datos:', result.error)
    }
  }

  if (isCloudMode) {
    cloudApi.clearCloudApiConfig()
  }

  currentPassword = null
  isAuthenticated = false
  isCloudMode = false
})

// ============================================
// IPC Handlers - Empresas
// ============================================

ipcMain.handle('empresa:list', async () => {
  try {
    const { migrated, config } = crypto.checkAndMigrateLegacy()

    // Filter cloud empresas based on session & server validity
    const hasCloudEmpresas = config.empresas.some(e => e.tipo === 'cloud')
    let returnEmpresas = config.empresas
    if (hasCloudEmpresas) {
      const session = crypto.loadCloudSession()
      if (!session) {
        // No cloud session: hide cloud empresas (can't use them anyway)
        returnEmpresas = config.empresas.filter(e => e.tipo !== 'cloud')
      } else {
        // Cloud session active: validate against server, clean orphans
        try {
          // Save existing config to restore after listing (don't break active cloud session)
          const previousConfig = cloudApi.getCloudApiConfig()
          cloudApi.setCloudApiConfig(session.serverUrl, session.token, 0)
          const serverEmpresas = await cloudApi.empresaCloud.list()
          if (previousConfig) {
            // Restore previous cloud config (user has an active cloud empresa)
            cloudApi.setCloudApiConfig(previousConfig.serverUrl, previousConfig.token, previousConfig.empresaId)
          } else {
            cloudApi.clearCloudApiConfig()
          }
          const validIds = new Set(serverEmpresas.map((e: any) => e.id))
          returnEmpresas = config.empresas.filter(e => {
            if (e.tipo !== 'cloud') return true
            return e.cloudConfig?.empresaId != null && validIds.has(e.cloudConfig.empresaId)
          })
          // Persist cleanup of orphaned entries
          if (returnEmpresas.length !== config.empresas.length) {
            config.empresas = returnEmpresas
            crypto.saveEmpresasConfig(config)
          }
        } catch {
          // API error: return all as-is (best-effort)
        }
      }
    }

    return {
      success: true,
      data: {
        empresas: returnEmpresas,
        ultimaEmpresaId: config.ultimaEmpresaId,
        needsMigration: migrated,
      }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empresa:create', async (_, data: { nombre: string; customDataPath?: string; tipo?: 'local' | 'cloud'; passphrase?: string }) => {
  try {
    if (data.tipo === 'cloud') {
      if (!data.passphrase) {
        return { success: false, error: 'Missing passphrase' }
      }
      // Read token from program-level session
      const session = crypto.loadCloudSession()
      if (!session) {
        return { success: false, error: 'No cloud session' }
      }
      // Create cloud empresa
      const salt = cloudApi.generateSalt()
      const verificationHash = cloudApi.generateVerificationHash(data.passphrase, salt)

      // Save existing config to restore after creation
      const previousConfig = cloudApi.getCloudApiConfig()
      // Configure cloud API temporarily to create empresa
      cloudApi.setCloudApiConfig(session.serverUrl, session.token, 0)
      const key = cloudApi.deriveCloudKey(data.passphrase, salt)
      cloudApi.setEncryptionKey(key)

      // Verify cloud auth
      const authCheck = await cloud.checkAuth()

      // Create empresa on server
      const serverEmpresa = await cloudApi.empresaCloud.create({
        nombre_encrypted: data.nombre,
        salt,
        verification_hash: verificationHash,
      })

      // Update config with real empresa ID so seeding targets the correct empresa
      cloudApi.setCloudApiConfig(session.serverUrl, session.token, serverEmpresa.id)

      // Seed default data (non-blocking: if seeding fails, empresa is still created)
      try {
        // Default impuestos
        const defaultImpuestos = [
          { nombre: 'IVA General', porcentaje: 21, tipo: 'IVA', porDefecto: true },
          { nombre: 'IVA Reducido', porcentaje: 10, tipo: 'IVA', porDefecto: false },
          { nombre: 'IVA Super Reducido', porcentaje: 4, tipo: 'IVA', porDefecto: false },
          { nombre: 'Exento de IVA', porcentaje: 0, tipo: 'IVA', porDefecto: false },
          { nombre: 'IRPF General', porcentaje: 15, tipo: 'IRPF', porDefecto: false },
          { nombre: 'IRPF Reducido', porcentaje: 7, tipo: 'IRPF', porDefecto: false },
        ]
        await Promise.all(defaultImpuestos.map((imp) => cloudApi.impuestos.create(imp)))

        // Default categorias de gasto
        const defaultCategorias = [
          { nombre: 'Alquiler', color: '#3B82F6', icono: 'building' },
          { nombre: 'Material', color: '#F97316', icono: 'shopping-bag' },
          { nombre: 'Software', color: '#8B5CF6', icono: 'laptop' },
          { nombre: 'Transporte', color: '#22C55E', icono: 'car' },
          { nombre: 'Suministros', color: '#EAB308', icono: 'lightbulb' },
          { nombre: 'Comunicaciones', color: '#EC4899', icono: 'phone' },
          { nombre: 'Otros', color: '#6B7280', icono: 'receipt' },
        ]
        await Promise.all(defaultCategorias.map((cat) => cloudApi.categoriasGasto.create(cat)))

        // Default plan contable (PGC)
        await cloudApi.cuentas.seedPGC()

        // Default configuracion: empresa name
        await cloudApi.configuracion.set('empresa_nombre', data.nombre)
      } catch (seedError) {
        console.error('Failed to seed default data for cloud empresa:', seedError)
      }

      // Save locally
      const empresa = crypto.createCloudEmpresa(data.nombre, {
        empresaId: serverEmpresa.id,
        userId: authCheck.user.id,
        role: 'owner',
        salt,
        verificationHash,
      })

      if (previousConfig) cloudApi.setCloudApiConfig(previousConfig.serverUrl, previousConfig.token, previousConfig.empresaId)
      else cloudApi.clearCloudApiConfig()
      return { success: true, data: empresa }
    }
    const empresa = crypto.createEmpresa(data.nombre, data.customDataPath)
    return { success: true, data: empresa }
  } catch (error) {
    // Detect plan quota exceeded (403) and signal upgrade needed
    if (error instanceof cloudApi.CloudApiError && error.status === 403) {
      try {
        const planData = await cloud.getAccountPlan()
        const currentSlug = planData.plan.slug
        const hasSubscription = currentSlug !== 'free'
        const targetPlan = hasSubscription ? 'enterprise' : 'pro'
        return {
          success: false,
          error: error.message,
          upgrade_required: true,
          has_subscription: hasSubscription,
          current_plan: currentSlug,
          target_plan: targetPlan,
        }
      } catch {
        // Fallback if plan fetch fails
        return { success: false, error: error.message, upgrade_required: true, target_plan: 'pro' }
      }
    }
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
      return { success: false, error: 'permissionDenied' }
    }

    return { success: true, data: { path: selectedPath } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empresa:select', async (_, id: string) => {
  try {
    // Si hay una empresa autenticada, bloquear primero
    if (isAuthenticated) {
      if (prisma) {
        await prisma.$disconnect()
        prisma = null
      }
      if (!isCloudMode && currentPassword && crypto.isAuthConfigured()) {
        crypto.encryptDatabase(currentPassword)
      }
      if (isCloudMode) {
        cloudApi.clearCloudApiConfig()
      }
      currentPassword = null
      isAuthenticated = false
      isCloudMode = false
    }

    // Buscar empresa
    const config = crypto.loadEmpresasConfig()
    const empresa = config.empresas.find(e => e.id === id)
    if (!empresa) {
      return { success: false, error: 'notFound' }
    }

    // Activar empresa
    crypto.setActiveEmpresa(empresa)
    activeEmpresaId = id

    // Actualizar última empresa
    config.ultimaEmpresaId = id
    crypto.saveEmpresasConfig(config)

    if (empresa.tipo === 'cloud') {
      // Cloud empresa: auth is handled via passphrase, not local password
      return {
        success: true,
        data: {
          empresa,
          isCloud: true,
          authStatus: {
            isConfigured: true,
            hasEncryptedDb: false,
            isAuthenticated: false,
            passkeySupported: false,
            passkeyEnabled: false,
          }
        }
      }
    }

    // Local empresa: obtener estado de auth
    const integrity = crypto.checkAuthIntegrity()
    return {
      success: true,
      data: {
        empresa,
        isCloud: false,
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
      return { success: false, error: 'cannotDeleteActiveCompany' }
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

ipcMain.handle('empresa:joinCloud', async (_, data: { code: string; passphrase: string }) => {
  try {
    // Read token from program-level session
    const session = crypto.loadCloudSession()
    if (!session) {
      return { success: false, error: 'No cloud session' }
    }
    // Save existing config to restore after operation
    const previousConfig = cloudApi.getCloudApiConfig()
    cloud.setCloudConfig(session.serverUrl, session.token)
    cloudApi.setCloudApiConfig(session.serverUrl, session.token, 0)
    const serverEmpresa = await cloudApi.empresaCloud.join(data.code)
    if (!cloudApi.verifyPassphrase(data.passphrase, serverEmpresa.salt, serverEmpresa.verification_hash)) {
      if (previousConfig) cloudApi.setCloudApiConfig(previousConfig.serverUrl, previousConfig.token, previousConfig.empresaId)
      else cloudApi.clearCloudApiConfig()
      return { success: false, error: 'passwordIncorrect' }
    }
    const authCheck = await cloud.checkAuth()
    const empresa = crypto.createCloudEmpresa(
      `Cloud Empresa #${serverEmpresa.id}`,
      {
        empresaId: serverEmpresa.id,
        userId: authCheck.user.id,
        role: serverEmpresa.role,
        salt: serverEmpresa.salt,
        verificationHash: serverEmpresa.verification_hash,
      }
    )
    if (previousConfig) cloudApi.setCloudApiConfig(previousConfig.serverUrl, previousConfig.token, previousConfig.empresaId)
    else cloudApi.clearCloudApiConfig()
    return { success: true, data: empresa }
  } catch (error) {
    if (!isCloudMode) cloudApi.clearCloudApiConfig()
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empresa:listCloud', async () => {
  try {
    const session = crypto.loadCloudSession()
    if (!session) {
      return { success: false, error: 'No cloud session' }
    }
    // Save existing config to restore after listing
    const previousConfig = cloudApi.getCloudApiConfig()
    cloudApi.setCloudApiConfig(session.serverUrl, session.token, 0)
    const empresas = await cloudApi.empresaCloud.list()
    if (previousConfig) {
      cloudApi.setCloudApiConfig(previousConfig.serverUrl, previousConfig.token, previousConfig.empresaId)
    } else {
      cloudApi.clearCloudApiConfig()
    }
    return { success: true, data: empresas }
  } catch (error) {
    if (!isCloudMode) cloudApi.clearCloudApiConfig()
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empresa:addCloudLocal', async (_, data: { empresaId: number; salt: string; verificationHash: string; role: string; passphrase: string }) => {
  try {
    // Verify passphrase locally (no network needed)
    if (!cloudApi.verifyPassphrase(data.passphrase, data.salt, data.verificationHash)) {
      return { success: false, error: 'passwordIncorrect' }
    }
    // Get userId from cloud session
    const session = crypto.loadCloudSession()
    if (!session) {
      return { success: false, error: 'No cloud session' }
    }
    cloud.setCloudConfig(session.serverUrl, session.token)
    const authCheck = await cloud.checkAuth()
    // Create local empresa entry
    const empresa = crypto.createCloudEmpresa(
      `Cloud Empresa #${data.empresaId}`,
      {
        empresaId: data.empresaId,
        userId: authCheck.user.id,
        role: data.role,
        salt: data.salt,
        verificationHash: data.verificationHash,
      }
    )
    return { success: true, data: empresa }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Cloud Empresa Management
// ============================================

ipcMain.handle('cloudEmpresa:getUsers', async () => {
  try {
    const empresa = crypto.getActiveEmpresa()
    if (!isCloudMode || !empresa?.cloudConfig) return { success: false, error: 'Not in cloud mode' }
    const users = await cloudApi.empresaCloud.getUsers(empresa.cloudConfig.empresaId)
    return { success: true, data: users }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('cloudEmpresa:inviteUser', async (_, role?: string) => {
  try {
    const empresa = crypto.getActiveEmpresa()
    if (!isCloudMode || !empresa?.cloudConfig) return { success: false, error: 'Not in cloud mode' }
    const invitation = await cloudApi.empresaCloud.inviteUser(empresa.cloudConfig.empresaId, role)
    return { success: true, data: invitation }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('cloudEmpresa:removeUser', async (_, userId: number) => {
  try {
    const empresa = crypto.getActiveEmpresa()
    if (!isCloudMode || !empresa?.cloudConfig) return { success: false, error: 'Not in cloud mode' }
    await cloudApi.empresaCloud.removeUser(empresa.cloudConfig.empresaId, userId)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('cloudEmpresa:updateUserRole', async (_, userId: number, role: string) => {
  try {
    const empresa = crypto.getActiveEmpresa()
    if (!isCloudMode || !empresa?.cloudConfig) return { success: false, error: 'Not in cloud mode' }
    await cloudApi.empresaCloud.updateUserRole(empresa.cloudConfig.empresaId, userId, role)
    return { success: true }
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
      return { success: false, error: 'passwordIncorrect' }
    }

    // Desencriptar base de datos
    const decryptResult = crypto.decryptDatabase(password)
    if (!decryptResult.success) {
      return { success: false, error: decryptResult.error || 'decryptionError' }
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

    // Encriptar base de datos (only for local empresas)
    if (!isCloudMode && currentPassword && crypto.isAuthConfigured()) {
      crypto.encryptDatabase(currentPassword)
    }

    if (isCloudMode) {
      cloudApi.clearCloudApiConfig()
    }

    currentPassword = null
    isAuthenticated = false
    isCloudMode = false

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Cloud empresa passphrase authentication
ipcMain.handle('auth:unlockCloud', async (_, passphrase: string) => {
  try {
    const activeEmpresa = crypto.getActiveEmpresa()
    if (!activeEmpresa || activeEmpresa.tipo !== 'cloud' || !activeEmpresa.cloudConfig) {
      return { success: false, error: 'Not a cloud empresa' }
    }

    const cc = activeEmpresa.cloudConfig

    // Read token from program-level session
    const session = crypto.loadCloudSession()
    if (!session) {
      return { success: false, error: 'No cloud session' }
    }

    if (cc.verificationHash) {
      // Verify passphrase locally using stored verificationHash (fast, no network needed)
      if (!cloudApi.verifyPassphrase(passphrase, cc.salt, cc.verificationHash)) {
        return { success: false, error: 'passwordIncorrect' }
      }
    } else {
      // Backward compat: old config without verificationHash, verify via server
      cloudApi.setCloudApiConfig(session.serverUrl, session.token, cc.empresaId)
      try {
        const empresas = await cloudApi.empresaCloud.list()
        const serverEmpresa = empresas.find((e: any) => e.id === cc.empresaId)
        if (!serverEmpresa) {
          cloudApi.clearCloudApiConfig()
          return { success: false, error: 'Empresa not found on server' }
        }
        if (!cloudApi.verifyPassphrase(passphrase, serverEmpresa.salt, serverEmpresa.verification_hash)) {
          cloudApi.clearCloudApiConfig()
          return { success: false, error: 'passwordIncorrect' }
        }
        // Backfill verificationHash locally for future logins
        cc.verificationHash = serverEmpresa.verification_hash
        crypto.updateEmpresaCloudConfig(activeEmpresa.id, cc)
      } catch (err) {
        cloudApi.clearCloudApiConfig()
        return { success: false, error: String(err) }
      }
    }

    // Configure cloud API using session token
    cloudApi.setCloudApiConfig(session.serverUrl, session.token, cc.empresaId)

    // Derive key and set it
    const key = cloudApi.deriveCloudKey(passphrase, cc.salt)
    cloudApi.setEncryptionKey(key)

    isAuthenticated = true
    isCloudMode = true

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
      return { success: false, error: 'passwordIncorrect' }
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
      return { success: false, error: passkeyResult.error || 'decryptionError' }
    }

    const password = passkeyResult.password

    // Desencriptar base de datos
    const decryptResult = crypto.decryptDatabase(password)
    if (!decryptResult.success) {
      return { success: false, error: decryptResult.error || 'decryptionError' }
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
function requireAuth(): PrismaClient {
  if (!isAuthenticated || !prisma) {
    throw new Error('notAuthenticated')
  }
  return prisma
}

function requireAuthOrCloud(): { mode: 'local'; db: PrismaClient } | { mode: 'cloud' } {
  if (!isAuthenticated) {
    throw new Error('notAuthenticated')
  }
  if (isCloudMode) {
    return { mode: 'cloud' }
  }
  if (!prisma) {
    throw new Error('notAuthenticated')
  }
  return { mode: 'local', db: prisma }
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const clientes = await cloudApi.clientes.getAll()
      return { success: true, data: clientes }
    }
    const clientes = await ctx.db.cliente.findMany({
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const cliente = await cloudApi.clientes.getById(id)
      return { success: true, data: cliente }
    }
    const cliente = await ctx.db.cliente.findUnique({
      where: { id },
      include: {
        facturas: {
          include: { lineas: { include: { producto: true } } },
          orderBy: { fecha: 'desc' }
        }
      }
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const cliente = await cloudApi.clientes.create(data)
      return { success: true, data: cliente }
    }
    const cliente = await ctx.db.cliente.create({
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const cliente = await cloudApi.clientes.update(id, data)
      return { success: true, data: cliente }
    }
    const cliente = await ctx.db.cliente.update({
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.clientes.delete(id)
      return { success: true }
    }
    await ctx.db.cliente.delete({ where: { id } })
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.facturas.getAll()
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.facturas.getById(id)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.facturas.create(data)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.facturas.update(id, data)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.facturas.delete(id)
      return { success: true }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.facturas.getNextNumber()
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.gastos.getAll()
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.gastos.getById(id)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.gastos.create(data)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.gastos.update(id, data)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.gastos.delete(id)
      return { success: true }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.adjuntos.upload(gastoId, fileData)
      return { success: true, data: result }
    }
    const db = ctx.db
    if (!currentPassword) {
      return { success: false, error: 'notAuthenticated' }
    }

    // Verificar que el gasto existe
    const gasto = await db.gasto.findUnique({ where: { id: gastoId } })
    if (!gasto) {
      return { success: false, error: 'notFound' }
    }

    // Convertir array de números a Buffer
    const buffer = Buffer.from(fileData.data)

    // Encriptar y guardar el archivo
    const encryptResult = crypto.encryptFile(buffer, currentPassword)
    if (!encryptResult.success || !encryptResult.encryptedFileName) {
      return { success: false, error: encryptResult.error || 'encryptionError' }
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.adjuntos.download(adjuntoId)
      return { success: true, data: result }
    }
    const db = ctx.db
    if (!currentPassword) {
      return { success: false, error: 'notAuthenticated' }
    }

    // Obtener información del adjunto
    const adjunto = await db.adjuntoGasto.findUnique({ where: { id: adjuntoId } })
    if (!adjunto) {
      return { success: false, error: 'notFound' }
    }

    // Desencriptar archivo
    const decryptResult = crypto.decryptFile(adjunto.nombreEncriptado, currentPassword)
    if (!decryptResult.success || !decryptResult.data) {
      return { success: false, error: decryptResult.error || 'decryptionError' }
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.adjuntos.delete(adjuntoId)
      return { success: true }
    }
    const db = ctx.db

    // Obtener información del adjunto
    const adjunto = await db.adjuntoGasto.findUnique({ where: { id: adjuntoId } })
    if (!adjunto) {
      return { success: false, error: 'notFound' }
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.adjuntos.getByGastoId(gastoId)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.configuracion.getAll()
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.configuracion.get(clave)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.configuracion.set(clave, valor)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.configuracion.delete(clave)
      return { success: true }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.dashboard.getStats()
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.dashboard.getRecentActivity()
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.dashboard.getPendingInvoices()
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.productos.getAll()
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.productos.getById(id)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.productos.create(data)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.productos.update(id, data)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.productos.delete(id)
      return { success: true }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.impuestos.getAll()
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.impuestos.getById(id)
      return { success: true, data: result }
    }
    const db = ctx.db
    const impuesto = await db.impuesto.findUnique({ where: { id } })
    return { success: true, data: impuesto }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('impuestos:create', async (_, data: any) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.impuestos.create(data)
      return { success: true, data: result }
    }
    const db = ctx.db
    const impuesto = await db.impuesto.create({ data })
    return { success: true, data: impuesto }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('impuestos:update', async (_, id: number, data: any) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.impuestos.update(id, data)
      return { success: true, data: result }
    }
    const db = ctx.db
    const impuesto = await db.impuesto.update({ where: { id }, data })
    return { success: true, data: impuesto }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('impuestos:delete', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.impuestos.delete(id)
      return { success: true }
    }
    const db = ctx.db
    await db.impuesto.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('impuestos:setDefault', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.impuestos.setDefault(id)
      return { success: true }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.categoriasGasto.getAll()
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.categoriasGasto.create(data)
      return { success: true, data: result }
    }
    const db = ctx.db
    const categoria = await db.categoriaGasto.create({ data })
    return { success: true, data: categoria }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('categoriasGasto:update', async (_, id: number, data: any) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.categoriasGasto.update(id, data)
      return { success: true, data: result }
    }
    const db = ctx.db
    const categoria = await db.categoriaGasto.update({ where: { id }, data })
    return { success: true, data: categoria }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('categoriasGasto:delete', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.categoriasGasto.delete(id)
      return { success: true }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.facturas.updateEstado(id, estado)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    if (isCloudMode) return { success: false, error: 'Not available for cloud empresas' }
    // Mostrar diálogo para seleccionar ubicación
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Exportar copia de seguridad',
      defaultPath: `cryptogest-backup-${new Date().toISOString().split('T')[0]}.zip`,
      filters: [{ name: 'Archivo ZIP', extensions: ['zip'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'operationCancelled' }
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
    if (isCloudMode) return { success: false, error: 'Not available for cloud empresas' }
    // Mostrar diálogo para seleccionar archivo
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Importar copia de seguridad',
      filters: [{ name: 'Archivo ZIP', extensions: ['zip'] }],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'operationCancelled' }
    }

    const importPath = result.filePaths[0]

    // Verificar que es un archivo ZIP válido de CryptoGest
    const zip = new AdmZip(importPath)
    const entries = zip.getEntries()

    const hasDatabase = entries.some(e => e.entryName === 'database/dev.db')
    const hasMetadata = entries.some(e => e.entryName === 'metadata.json')

    if (!hasDatabase) {
      return { success: false, error: 'invalidDatabase' }
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
    if (isCloudMode) return { success: false, error: 'Not available for cloud empresas' }
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
    if (isCloudMode) return { success: false, error: 'Not available for cloud empresas' }
    // Mostrar diálogo para seleccionar carpeta destino
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Seleccionar nueva ubicación para los datos',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Seleccionar carpeta'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'operationCancelled' }
    }

    const destinationFolder = result.filePaths[0]
    const cryptogestFolder = path.join(destinationFolder, 'CryptoGest-Data')

    // Verificar que no exista ya una carpeta CryptoGest-Data con datos
    if (fs.existsSync(cryptogestFolder)) {
      const existingFiles = fs.readdirSync(cryptogestFolder)
      if (existingFiles.length > 0) {
        return {
          success: false,
          error: 'folderAlreadyExists'
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
    if (isCloudMode) return { success: false, error: 'Not available for cloud empresas' }
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

// Configure cloud connection (save to session file + verify token)
ipcMain.handle('cloud:configure', async (_, data: { serverUrl: string; token: string }) => {
  try {
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
        return { success: false, error: 'tokenInvalid' }
      }
      if (err instanceof cloud.CloudNetworkError) {
        return { success: false, error: 'connectionError' }
      }
      return { success: false, error: String(err) }
    }

    // Save to program-level session file
    crypto.saveCloudSession({
      serverUrl: data.serverUrl,
      token: data.token,
      user,
    })

    return { success: true, data: { user } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Get cloud config from session file
ipcMain.handle('cloud:getConfig', async () => {
  try {
    // Read from program-level session
    const session = crypto.loadCloudSession()

    // Check locally persisted license (perpetual, independent of connection)
    let license: cloud.CloudLicense = { has_license: false, purchased_at: null }
    if (isAuthenticated && prisma) {
      try {
        const licenseConfig = await prisma.configuracion.findUnique({ where: { clave: 'cloud_license_granted' } })
        if (licenseConfig) {
          license = { has_license: true, purchased_at: licenseConfig.valor }
        }
      } catch { /* DB may not be available */ }
    }

    if (!session) {
      return { success: true, data: license.has_license ? { license } : null }
    }

    // Re-initialize cloud module config
    cloud.setCloudConfig(session.serverUrl, session.token)

    // Optionally verify token (non-blocking, we return config even if check fails)
    let user: cloud.CloudUser | undefined = session.user
    try {
      const authResult = await cloud.checkAuth()
      user = authResult.user
    } catch {
      // Token may be expired, return config without user
    }

    return {
      success: true,
      data: {
        serverUrl: session.serverUrl,
        token: session.token,
        user,
        license,
      },
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Disconnect cloud (clear session)
ipcMain.handle('cloud:disconnect', async () => {
  try {
    cloud.clearCloudConfig()
    crypto.clearCloudSession()

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
      return { success: false, error: 'tokenInvalid' }
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
      return { success: false, error: 'masterPasswordNotAvailable' }
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
      return { success: false, error: 'storageQuotaExceeded' }
    }
    return { success: false, error: String(error) }
  }
})

// Download backup from cloud (decrypt E2E before saving)
ipcMain.handle('cloud:download', async (_, backupId: number) => {
  try {
    requireAuth()
    if (!currentPassword) {
      return { success: false, error: 'masterPasswordNotAvailable' }
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
      return { success: false, error: 'operationCancelled' }
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
      return { success: false, error: 'backupDecryptError' }
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
      return { success: false, error: 'masterPasswordNotAvailable' }
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
      return { success: false, error: 'backupDecryptError' }
    }

    // Write decrypted ZIP to temp and validate
    const tempZipPath = path.join(tempDir, `cryptogest-import-${nodeCrypto.randomUUID()}.zip`)
    fs.writeFileSync(tempZipPath, zipData)

    const zip = new AdmZip(tempZipPath)
    const entries = zip.getEntries()
    const hasDatabase = entries.some(e => e.entryName === 'database/dev.db')

    if (!hasDatabase) {
      try { fs.unlinkSync(tempZipPath) } catch { /* ignore */ }
      return { success: false, error: 'invalidBackupDatabase' }
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

// Get plan info (lightweight, no local DB required — for empresa selector)
ipcMain.handle('cloud:planCheck', async () => {
  try {
    const session = crypto.loadCloudSession()
    if (!session) {
      return { success: false, error: 'No cloud session' }
    }
    cloud.setCloudConfig(session.serverUrl, session.token)
    const result = await cloud.getAccountPlan()
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

// Create subscription checkout or upgrade plan
ipcMain.handle('cloud:subscriptionCheckout', async (_, plan: string) => {
  try {
    // Only need cloud session, not local empresa auth
    const session = crypto.loadCloudSession()
    if (!session) {
      return { success: false, error: 'No cloud session' }
    }
    cloud.setCloudConfig(session.serverUrl, session.token)

    const result = await cloud.createSubscriptionCheckout(plan)

    // If it returned a checkout URL, open it in the browser
    if (result.checkout_url) {
      await shell.openExternal(result.checkout_url)
    }

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

    // Save to program-level session
    cloud.setCloudConfig(data.server, response.api_token)
    crypto.saveCloudSession({
      serverUrl: data.server,
      token: response.api_token,
      user: response.user,
    })

    return { success: true, data: response }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('cloud:verifyCode', async (_, data: { code: string; server: string; deviceName?: string }) => {
  try {
    const response = await cloud.verifyDeviceCode(data.server, data.code, data.deviceName)

    // Set cloud config in memory and save to session file
    cloud.setCloudConfig(data.server, response.api_token)
    crypto.saveCloudSession({
      serverUrl: data.server,
      token: response.api_token,
      user: response.user,
    })

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
      return { success: false, error: 'invalidUrl' }
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.logo.upload(fileData)
      return { success: true, data: result }
    }
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg']
    if (!validTypes.includes(fileData.tipoMime)) {
      return { success: false, error: 'unsupportedFormat' }
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.logo.read()
      return { success: true, data: result }
    }
    const logoPath = path.join(getDataPath(), 'logo.png')
    if (!fs.existsSync(logoPath)) {
      return { success: false, error: 'noLogoConfigured' }
    }
    const buffer = fs.readFileSync(logoPath)
    return { success: true, data: { data: Array.from(buffer), tipoMime: 'image/png' } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('logo:delete', async () => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.logo.delete()
      return { success: true }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.cuentas.getAll()
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.cuentas.getById(id)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.cuentas.create(data)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.cuentas.update(id, data)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.cuentas.delete(id)
      return { success: true }
    }
    const db = ctx.db
    const cuenta = await db.cuentaContable.findUnique({ where: { id } })
    if (!cuenta) return { success: false, error: 'notFound' }
    if (cuenta.esSistema) return { success: false, error: 'cannotDeleteSystemAccount' }
    const movimientos = await db.lineaAsiento.count({ where: { cuentaId: id } })
    if (movimientos > 0) return { success: false, error: 'cannotDeleteAccountWithMovements' }
    await db.cuentaContable.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('cuentas:seedPGC', async () => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.cuentas.seedPGC()
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.ejercicios.getAll()
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.ejercicios.create(data)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.ejercicios.getOrCreateCurrent()
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.ejercicios.update(id, data)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.ejercicios.delete(id)
      return { success: true }
    }
    const db = ctx.db
    // Verificar que no tenga asientos
    const asientosCount = await db.asiento.count({ where: { ejercicioId: id } })
    if (asientosCount > 0) {
      return { success: false, error: 'hasAssociatedEntries' }
    }
    await db.ejercicioFiscal.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('ejercicios:getStats', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.ejercicios.getStats(id)
      return { success: true, data: result }
    }
    const db = ctx.db
    const ejercicio = await db.ejercicioFiscal.findUnique({ where: { id } })
    if (!ejercicio) {
      return { success: false, error: 'notFound' }
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.asientos.getAll(filters)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.asientos.getById(id)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.asientos.create(data)
      return { success: true, data: result }
    }
    const db = ctx.db
    const { lineas, ...asientoData } = data

    // Validar partida doble
    const totalDebe = lineas.reduce((sum, l) => sum + l.debe, 0)
    const totalHaber = lineas.reduce((sum, l) => sum + l.haber, 0)
    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      return { success: false, error: 'entryUnbalanced' }
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.asientos.update(id, data)
      return { success: true, data: result }
    }
    const db = ctx.db
    const { lineas, ...asientoData } = data
    const updateData: any = { ...asientoData }
    if (asientoData.fecha) updateData.fecha = new Date(asientoData.fecha)

    if (lineas) {
      const totalDebe = lineas.reduce((sum, l) => sum + l.debe, 0)
      const totalHaber = lineas.reduce((sum, l) => sum + l.haber, 0)
      if (Math.abs(totalDebe - totalHaber) > 0.01) {
        return { success: false, error: 'entryUnbalanced' }
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.asientos.delete(id)
      return { success: true }
    }
    const db = ctx.db
    const asiento = await db.asiento.findUnique({ where: { id } })
    if (!asiento) return { success: false, error: 'notFound' }
    if (asiento.tipo === 'factura' || asiento.tipo === 'gasto') {
      return { success: false, error: 'cannotDeleteAutoEntry' }
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.contabilidad.libroMayor(params)
      return { success: true, data: result }
    }
    const db = ctx.db
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.contabilidad.generarAsientoFactura(facturaId)
      return { success: true, data: result }
    }
    const db = ctx.db
    const factura = await db.factura.findUnique({
      where: { id: facturaId },
      include: { lineas: { include: { impuesto: true, retencion: true } }, cliente: true }
    })
    if (!factura) return { success: false, error: 'notFound' }

    const year = new Date(factura.fecha).getFullYear()
    let ejercicio = await db.ejercicioFiscal.findUnique({ where: { anio: year } })
    if (!ejercicio) {
      ejercicio = await db.ejercicioFiscal.create({
        data: { anio: year, fechaInicio: new Date(year, 0, 1), fechaFin: new Date(year, 11, 31) }
      })
    }

    const existing = await db.asiento.findFirst({ where: { facturaId } })
    if (existing) return { success: false, error: 'invoiceEntryExists' }

    const cuenta430 = await db.cuentaContable.findFirst({ where: { codigo: '430' } })
    const cuenta700 = await db.cuentaContable.findFirst({ where: { codigo: '700' } })
    const cuenta705 = await db.cuentaContable.findFirst({ where: { codigo: '705' } })
    const cuenta477 = await db.cuentaContable.findFirst({ where: { codigo: '477' } })
    const cuenta4751 = await db.cuentaContable.findFirst({ where: { codigo: '4751' } })

    if (!cuenta430 || !cuenta477) {
      return { success: false, error: 'missingInvoiceAccounts' }
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.contabilidad.generarAsientoGasto(gastoId)
      return { success: true, data: result }
    }
    const db = ctx.db
    const gasto = await db.gasto.findUnique({
      where: { id: gastoId },
      include: { categoria: true, impuesto: true }
    })
    if (!gasto) return { success: false, error: 'notFound' }

    const year = new Date(gasto.fecha).getFullYear()
    let ejercicio = await db.ejercicioFiscal.findUnique({ where: { anio: year } })
    if (!ejercicio) {
      ejercicio = await db.ejercicioFiscal.create({
        data: { anio: year, fechaInicio: new Date(year, 0, 1), fechaFin: new Date(year, 11, 31) }
      })
    }

    const existing = await db.asiento.findFirst({ where: { gastoId } })
    if (existing) return { success: false, error: 'expenseEntryExists' }

    const cuenta472 = await db.cuentaContable.findFirst({ where: { codigo: '472' } })
    const cuenta410 = await db.cuentaContable.findFirst({ where: { codigo: '410' } })
    const cuenta629 = await db.cuentaContable.findFirst({ where: { codigo: '629' } })

    if (!cuenta472 || !cuenta410 || !cuenta629) {
      return { success: false, error: 'missingAccounts' }
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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.modelos.modelo303(params)
      return { success: true, data: result }
    }
    const db = ctx.db
    const ejercicio = await db.ejercicioFiscal.findUnique({ where: { id: params.ejercicioId } })
    if (!ejercicio) return { success: false, error: 'notFound' }

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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.modelos.modelo111(params)
      return { success: true, data: result }
    }
    const db = ctx.db
    const ejercicio = await db.ejercicioFiscal.findUnique({ where: { id: params.ejercicioId } })
    if (!ejercicio) return { success: false, error: 'notFound' }

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
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const result = await cloudApi.modelos.modelo390(params)
      return { success: true, data: result }
    }
    const db = ctx.db
    const ejercicio = await db.ejercicioFiscal.findUnique({ where: { id: params.ejercicioId } })
    if (!ejercicio) return { success: false, error: 'notFound' }

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
      return { success: false, error: 'operationCancelled' }
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
      return { success: false, error: 'smtpIncomplete' }
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
      return { success: false, error: 'smtpNotFound' }
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
    if (!rows.length) return { success: false, error: 'notFound' }
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
    if (!rows.length) return { success: false, error: 'notFound' }

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
    if (!accountRows.length) return { success: false, error: 'notFound' }
    const folderRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CarpetaEmail" WHERE "id"=?`, carpetaId)
    if (!folderRows.length) return { success: false, error: 'notFound' }

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
    if (!accountRows.length) return { success: false, error: 'notFound' }
    const folderRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CarpetaEmail" WHERE "id"=?`, carpetaId)
    if (!folderRows.length) return { success: false, error: 'notFound' }

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
    if (!accountRows.length) return { success: false, error: 'notFound' }
    const folderRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CarpetaEmail" WHERE "id"=?`, carpetaId)
    if (!folderRows.length) return { success: false, error: 'notFound' }

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
    if (!accountRows.length) return { success: false, error: 'notFound' }
    const folderRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CarpetaEmail" WHERE "id"=?`, carpetaId)
    if (!folderRows.length) return { success: false, error: 'notFound' }

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
    if (!accountRows.length) return { success: false, error: 'notFound' }
    const folderRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CarpetaEmail" WHERE "id"=?`, carpetaId)
    if (!folderRows.length) return { success: false, error: 'notFound' }

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
    if (!accountRows.length) return { success: false, error: 'notFound' }
    const folderRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CarpetaEmail" WHERE "id"=?`, carpetaId)
    if (!folderRows.length) return { success: false, error: 'notFound' }

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
    if (!accountRows.length) return { success: false, error: 'notFound' }
    const folderRows = await prisma!.$queryRawUnsafe<any[]>(`SELECT * FROM "CarpetaEmail" WHERE "id"=?`, carpetaId)
    if (!folderRows.length) return { success: false, error: 'notFound' }

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
    if (!accountRows.length) return { success: false, error: 'notFound' }

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

// ============================================
// IPC Handlers - ClassicGes 6 Import
// ============================================

// Decode CP1252/Latin1 buffer to proper UTF-8 string
function decodeDbfString(val: any): string {
  if (val == null) return ''
  if (Buffer.isBuffer(val)) {
    return val.toString('latin1').trim()
  }
  return String(val).trim()
}

// Parse DBF date field (Date object or YYYYMMDD string) to JS Date
function parseDbfDate(val: any): Date | null {
  if (val instanceof Date) return val
  if (!val) return null
  const s = String(val).replace(/[^0-9]/g, '')
  if (s.length === 8) {
    const y = parseInt(s.substring(0, 4))
    const m = parseInt(s.substring(4, 6)) - 1
    const d = parseInt(s.substring(6, 8))
    const date = new Date(y, m, d)
    if (!isNaN(date.getTime())) return date
  }
  return null
}

// Safe number from DBF field
function dbfNumber(val: any): number {
  if (val == null) return 0
  const n = parseFloat(String(val))
  return isNaN(n) ? 0 : n
}

// Try to open a DBF file case-insensitively
async function openDbfFile(dirPath: string, baseName: string): Promise<DBFFile | null> {
  const candidates = [
    baseName,
    baseName.toLowerCase(),
    baseName.toUpperCase(),
    baseName.charAt(0).toUpperCase() + baseName.slice(1).toLowerCase(),
  ]
  for (const name of candidates) {
    const fullPath = path.join(dirPath, name)
    if (fs.existsSync(fullPath)) {
      return await DBFFile.open(fullPath, { encoding: 'latin1' })
    }
  }
  return null
}

// Select ClassicGes data folder
ipcMain.handle('clasges:selectFolder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Seleccionar carpeta de datos ClassicGes 6',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'operationCancelled' }
    }
    return { success: true, data: { path: result.filePaths[0] } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Scan ClassicGes data folder for DBF files
ipcMain.handle('clasges:scan', async (_, dirPath: string) => {
  try {
    const files: Record<string, { found: boolean; count: number }> = {}
    const dbfFiles: Record<string, string> = {
      clientes: 'clientes.dbf',
      productos: 'articulo.dbf',
      facturas: 'factura.dbf',
      lineasFactura: 'factural.dbf',
      gastos: 'gastos.dbf',
      categorias: 'tipgast.dbf',
    }

    for (const [key, fileName] of Object.entries(dbfFiles)) {
      const dbf = await openDbfFile(dirPath, fileName)
      if (dbf) {
        files[key] = { found: true, count: dbf.recordCount }
      } else {
        files[key] = { found: false, count: 0 }
      }
    }

    return { success: true, data: files }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Preview first N records from a ClassicGes DBF file
ipcMain.handle('clasges:preview', async (_, dirPath: string, entity: string) => {
  try {
    const fileMap: Record<string, string> = {
      clientes: 'clientes.dbf',
      productos: 'articulo.dbf',
      facturas: 'factura.dbf',
      gastos: 'gastos.dbf',
      categorias: 'tipgast.dbf',
    }

    const fileName = fileMap[entity]
    if (!fileName) return { success: false, error: 'Unknown entity' }

    const dbf = await openDbfFile(dirPath, fileName)
    if (!dbf) return { success: false, error: `File ${fileName} not found` }

    const records: any[] = []
    let count = 0
    for await (const record of dbf) {
      if (count >= 10) break
      // Decode string fields
      const decoded: Record<string, any> = {}
      for (const [k, v] of Object.entries(record)) {
        decoded[k] = typeof v === 'string' ? decodeDbfString(v) : v
      }
      records.push(decoded)
      count++
    }

    return { success: true, data: records }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Import data from ClassicGes 6
ipcMain.handle('clasges:import', async (_, dirPath: string, entities: string[]) => {
  try {
    const ctx = requireAuthOrCloud()
    const isCloud = ctx.mode === 'cloud'
    const db = isCloud ? null : ctx.db
    const results: Record<string, { imported: number; skipped: number; errors: string[] }> = {}

    // Helper to send progress to renderer
    const sendProgress = (entity: string, current: number, total: number, status: string) => {
      mainWindow?.webContents.send('clasges:progress', { entity, current, total, status })
    }

    // 1. Import expense categories
    if (entities.includes('categorias')) {
      const catResult = { imported: 0, skipped: 0, errors: [] as string[] }
      const dbf = await openDbfFile(dirPath, 'tipgast.dbf')
      if (dbf) {
        const allRecords: any[] = []
        for await (const r of dbf) allRecords.push(r)
        sendProgress('categorias', 0, allRecords.length, 'importing')

        if (isCloud) {
          const existingCats = await cloudApi.categoriasGasto.getAll()
          const existingNames = new Set(existingCats.map((c: any) => c.nombre))
          const toCreate: any[] = []

          for (const r of allRecords) {
            const nombre = decodeDbfString(r.NOMBRE || r.nombre)
            if (!nombre || existingNames.has(nombre)) { catResult.skipped++; continue }
            existingNames.add(nombre)
            toCreate.push({ nombre })
          }

          if (toCreate.length > 0) {
            await cloudApi.batchCreateEntities('categoriaGasto', toCreate, (cur, tot) => {
              sendProgress('categorias', cur, tot, 'importing')
            })
            catResult.imported = toCreate.length
          }
        } else {
          for (let i = 0; i < allRecords.length; i++) {
            try {
              const r = allRecords[i]
              const nombre = decodeDbfString(r.NOMBRE || r.nombre)
              if (!nombre) { catResult.skipped++; continue }

              const existing = await db!.categoriaGasto.findFirst({ where: { nombre } })
              if (existing) { catResult.skipped++; continue }

              await db!.categoriaGasto.create({ data: { nombre } })
              catResult.imported++
            } catch (e: any) {
              if (e.code === 'P2002') catResult.skipped++
              else catResult.errors.push(String(e))
            }
            sendProgress('categorias', i + 1, allRecords.length, 'importing')
          }
        }
      }
      results.categorias = catResult
      sendProgress('categorias', catResult.imported + catResult.skipped, catResult.imported + catResult.skipped, 'done')
    }

    // 2. Import clients
    if (entities.includes('clientes')) {
      const cliResult = { imported: 0, skipped: 0, errors: [] as string[] }
      const dbf = await openDbfFile(dirPath, 'clientes.dbf')
      if (dbf) {
        const allRecords: any[] = []
        for await (const r of dbf) allRecords.push(r)
        sendProgress('clientes', 0, allRecords.length, 'importing')

        if (isCloud) {
          const existingClients = await cloudApi.clientes.getAll()
          const existingNifs = new Set(existingClients.filter((c: any) => c.nif).map((c: any) => c.nif))
          const toCreate: any[] = []

          for (const r of allRecords) {
            const nombre = decodeDbfString(r.NOMBRE || r.nombre)
            if (!nombre) { cliResult.skipped++; continue }
            const nif = decodeDbfString(r.CIF || r.cif) || null
            if (nif && existingNifs.has(nif)) { cliResult.skipped++; continue }
            if (nif) existingNifs.add(nif)
            const baja = r.BAJA || r.baja
            toCreate.push({
              nombre,
              email: decodeDbfString(r.EMAIL || r.email) || null,
              telefono: decodeDbfString(r.TELEFONO || r.telefono) || null,
              direccion: decodeDbfString(r.DIRECCION || r.direccion) || null,
              ciudad: decodeDbfString(r.LOCALIDAD || r.localidad) || null,
              provincia: decodeDbfString(r.PROVINCIA || r.provincia) || null,
              codigoPostal: decodeDbfString(r.POSTAL || r.postal) || null,
              pais: decodeDbfString(r.PAIS || r.pais) || 'España',
              nif,
              activo: baja ? !baja : true,
            })
          }

          if (toCreate.length > 0) {
            await cloudApi.batchCreateEntities('cliente', toCreate, (cur, tot) => {
              sendProgress('clientes', cur, tot, 'importing')
            })
            cliResult.imported = toCreate.length
          }
        } else {
          for (let i = 0; i < allRecords.length; i++) {
            try {
              const r = allRecords[i]
              const nombre = decodeDbfString(r.NOMBRE || r.nombre)
              if (!nombre) { cliResult.skipped++; continue }

              const nif = decodeDbfString(r.CIF || r.cif) || null
              if (nif) {
                const existing = await db!.cliente.findFirst({ where: { nif } })
                if (existing) { cliResult.skipped++; continue }
              }

              const baja = r.BAJA || r.baja
              await db!.cliente.create({
                data: {
                  nombre,
                  email: decodeDbfString(r.EMAIL || r.email) || null,
                  telefono: decodeDbfString(r.TELEFONO || r.telefono) || null,
                  direccion: decodeDbfString(r.DIRECCION || r.direccion) || null,
                  ciudad: decodeDbfString(r.LOCALIDAD || r.localidad) || null,
                  provincia: decodeDbfString(r.PROVINCIA || r.provincia) || null,
                  codigoPostal: decodeDbfString(r.POSTAL || r.postal) || null,
                  pais: decodeDbfString(r.PAIS || r.pais) || 'España',
                  nif,
                  activo: baja ? !baja : true,
                }
              })
              cliResult.imported++
            } catch (e: any) {
              if (e.code === 'P2002') cliResult.skipped++
              else cliResult.errors.push(String(e))
            }
            sendProgress('clientes', i + 1, allRecords.length, 'importing')
          }
        }
      }
      results.clientes = cliResult
      sendProgress('clientes', cliResult.imported + cliResult.skipped, cliResult.imported + cliResult.skipped, 'done')
    }

    // 3. Import products
    if (entities.includes('productos')) {
      const prodResult = { imported: 0, skipped: 0, errors: [] as string[] }
      const dbf = await openDbfFile(dirPath, 'articulo.dbf')
      if (dbf) {
        const allRecords: any[] = []
        for await (const r of dbf) allRecords.push(r)
        sendProgress('productos', 0, allRecords.length, 'importing')

        if (isCloud) {
          const existingProds = await cloudApi.productos.getAll()
          const existingCodigos = new Set(existingProds.filter((p: any) => p.codigo).map((p: any) => p.codigo))
          const toCreate: any[] = []

          for (const r of allRecords) {
            const nombre = decodeDbfString(r.NOMBRE || r.nombre)
            if (!nombre) { prodResult.skipped++; continue }
            const codigo = decodeDbfString(r.CODIGO || r.codigo) || null
            if (codigo && existingCodigos.has(codigo)) { prodResult.skipped++; continue }
            if (codigo) existingCodigos.add(codigo)
            const servicio = r.SERVICIO || r.servicio
            const baja = r.BAJA || r.baja
            toCreate.push({
              codigo,
              nombre,
              descripcion: decodeDbfString(r.DESCRIP || r.descrip) || null,
              tipo: servicio ? 'servicio' : 'producto',
              precioBase: dbfNumber(r.PVP1 || r.pvp1),
              activo: baja ? !baja : true,
            })
          }

          if (toCreate.length > 0) {
            await cloudApi.batchCreateEntities('producto', toCreate, (cur, tot) => {
              sendProgress('productos', cur, tot, 'importing')
            })
            prodResult.imported = toCreate.length
          }
        } else {
          for (let i = 0; i < allRecords.length; i++) {
            try {
              const r = allRecords[i]
              const nombre = decodeDbfString(r.NOMBRE || r.nombre)
              if (!nombre) { prodResult.skipped++; continue }

              const codigo = decodeDbfString(r.CODIGO || r.codigo) || null
              if (codigo) {
                const existing = await db!.producto.findFirst({ where: { codigo } })
                if (existing) { prodResult.skipped++; continue }
              }

              const servicio = r.SERVICIO || r.servicio
              const baja = r.BAJA || r.baja
              await db!.producto.create({
                data: {
                  codigo,
                  nombre,
                  descripcion: decodeDbfString(r.DESCRIP || r.descrip) || null,
                  tipo: servicio ? 'servicio' : 'producto',
                  precioBase: dbfNumber(r.PVP1 || r.pvp1),
                  activo: baja ? !baja : true,
                }
              })
              prodResult.imported++
            } catch (e: any) {
              if (e.code === 'P2002') prodResult.skipped++
              else prodResult.errors.push(String(e))
            }
            sendProgress('productos', i + 1, allRecords.length, 'importing')
          }
        }
      }
      results.productos = prodResult
      sendProgress('productos', prodResult.imported + prodResult.skipped, prodResult.imported + prodResult.skipped, 'done')
    }

    // 4. Import invoices (headers + lines)
    if (entities.includes('facturas')) {
      const facResult = { imported: 0, skipped: 0, errors: [] as string[] }
      const dbfFac = await openDbfFile(dirPath, 'factura.dbf')
      const dbfLines = await openDbfFile(dirPath, 'factural.dbf')

      if (dbfFac) {
        // Load all invoice lines grouped by multiple keys for reliable matching
        const linesBySN = new Map<string, any[]>()   // SERIE+NUMERO key
        const linesByCLAFAC = new Map<string, any[]>() // CLAFAC fallback key
        if (dbfLines) {
          for await (const lr of dbfLines) {
            const lSerie = decodeDbfString(lr.SERIE || lr.serie)
            const lNumero = decodeDbfString(lr.NUMERO || lr.numero)
            if (lSerie || lNumero) {
              const snKey = `${lSerie}${lNumero}`
              if (!linesBySN.has(snKey)) linesBySN.set(snKey, [])
              linesBySN.get(snKey)!.push(lr)
            }
            const clafac = String(lr.CLAFAC || lr.clafac || '').trim()
            if (clafac) {
              if (!linesByCLAFAC.has(clafac)) linesByCLAFAC.set(clafac, [])
              linesByCLAFAC.get(clafac)!.push(lr)
            }
          }
        }

        const allRecords: any[] = []
        for await (const r of dbfFac) allRecords.push(r)
        sendProgress('facturas', 0, allRecords.length, 'importing')

        if (isCloud) {
          const existingFacturas = await cloudApi.facturas.getAll()
          const existingNumeros = new Set(existingFacturas.map((f: any) => f.numero))
          const existingClientes = await cloudApi.clientes.getAll()
          const impuestos = await cloudApi.impuestos.getAll()

          // Helper to find or create cloud client
          const clienteCache = new Map<string, number>()
          for (const c of existingClientes) {
            if (c.nif) clienteCache.set(`nif:${c.nif}`, c.id)
            clienteCache.set(`name:${c.nombre}`, c.id)
          }

          const findOrCreateCliente = async (nif: string | null, nombre: string | null): Promise<number> => {
            if (nif && clienteCache.has(`nif:${nif}`)) return clienteCache.get(`nif:${nif}`)!
            if (nombre && clienteCache.has(`name:${nombre}`)) return clienteCache.get(`name:${nombre}`)!

            const newCli = await cloudApi.clientes.create({
              nombre: nombre || 'Cliente importado',
              nif,
              activo: true,
              pais: 'España',
            })
            if (nif) clienteCache.set(`nif:${nif}`, newCli.id)
            clienteCache.set(`name:${newCli.nombre}`, newCli.id)
            return newCli.id
          }

          for (let i = 0; i < allRecords.length; i++) {
            try {
              const r = allRecords[i]
              const serie = decodeDbfString(r.SERIE || r.serie) || 'F'
              const numero = decodeDbfString(r.NUMERO || r.numero)
              if (!numero) { facResult.skipped++; continue }

              const fullNumero = `${serie}${numero}`
              if (existingNumeros.has(fullNumero)) { facResult.skipped++; continue }
              existingNumeros.add(fullNumero)

              const clientNif = decodeDbfString(r.CIFCLI || r.cifcli)
              const clientName = decodeDbfString(r.NOMCLI || r.nomcli)
              const clienteId = await findOrCreateCliente(clientNif, clientName || 'Cliente ClassicGes')

              const fecha = (parseDbfDate(r.FECHA || r.fecha) || new Date()).toISOString()
              const fechaVencimiento = parseDbfDate(r.FECHAVALOR || r.fechavalor)?.toISOString() || null
              const cobrado = dbfNumber(r.COBRADO || r.cobrado)
              const total = dbfNumber(r.IMPORTE || r.importe)
              let estado = 'emitida'
              if (cobrado >= total && total > 0) estado = 'pagada'

              // Build lines for this invoice
              const snKey = `${serie}${numero}`
              let rawLines: any[] = linesBySN.get(snKey) || []
              if (rawLines.length === 0) {
                const clessionKey = String(r.CLESSION || r.clession || '').trim()
                const codigoKey = String(r.CODIGO || r.codigo || '').trim()
                for (const fk of [clessionKey, codigoKey, snKey].filter(k => k !== '')) {
                  if (linesByCLAFAC.has(fk)) { rawLines = linesByCLAFAC.get(fk)!; break }
                }
              }

              const lineasData = rawLines.map(lr => {
                const descripcion = decodeDbfString(lr.LINDESC || lr.lindesc) || 'Línea importada'
                const cantidad = dbfNumber(lr.CANTIDAD || lr.cantidad) || 1
                const precioUnit = dbfNumber(lr.PRECIO || lr.precio)
                const descuento = dbfNumber(lr.DTO || lr.dto)
                const ivaPercent = dbfNumber(lr.IVA || lr.iva)
                let impuestoId: number | null = null
                if (ivaPercent > 0) {
                  const match = impuestos.find((imp: any) => imp.tipo === 'IVA' && Math.abs(imp.porcentaje - ivaPercent) < 0.01)
                  if (match) impuestoId = match.id
                }
                const subtotal = cantidad * precioUnit * (1 - descuento / 100)
                const totalImpuesto = impuestoId ? subtotal * ivaPercent / 100 : 0
                return { descripcion, cantidad, precioUnit, descuento, impuestoId, subtotal, totalImpuesto, totalRetencion: 0, total: subtotal + totalImpuesto }
              })

              // Create factura via cloudApi (creates header entity)
              const factura = await cloudApi.facturas.create({
                numero: fullNumero,
                serie,
                fecha,
                fechaVencimiento,
                clienteId,
                subtotal: dbfNumber(r.BIMPO || r.bimpo),
                totalImpuestos: dbfNumber(r.ITEIVA || r.iteiva),
                totalRetenciones: dbfNumber(r.RETENCION || r.retencion),
                total,
                estado,
                lineas: lineasData,
              })

              // Create line entities separately
              if (lineasData.length > 0) {
                await cloudApi.batchCreateEntities('lineaFactura', lineasData.map(l => ({ ...l, facturaId: factura.id })))
              }

              facResult.imported++
            } catch (e: any) {
              facResult.errors.push(String(e))
            }
            sendProgress('facturas', i + 1, allRecords.length, 'importing')
          }
        } else {
          // Get all impuestos for matching
          const impuestos = await db!.impuesto.findMany({ where: { activo: true } })

          for (let i = 0; i < allRecords.length; i++) {
            try {
              const r = allRecords[i]
              const serie = decodeDbfString(r.SERIE || r.serie) || 'F'
              const numero = decodeDbfString(r.NUMERO || r.numero)
              if (!numero) { facResult.skipped++; continue }

              const fullNumero = `${serie}${numero}`

              // Skip duplicate invoices
              const existing = await db!.factura.findFirst({ where: { numero: fullNumero } })
              if (existing) { facResult.skipped++; continue }

              // Find or create client
              let clienteId: number
              const clientNif = decodeDbfString(r.CIFCLI || r.cifcli)
              const clientName = decodeDbfString(r.NOMCLI || r.nomcli)

              if (clientNif) {
                const existingClient = await db!.cliente.findFirst({ where: { nif: clientNif } })
                if (existingClient) {
                  clienteId = existingClient.id
                } else {
                  const newClient = await db!.cliente.create({
                    data: { nombre: clientName || 'Cliente importado', nif: clientNif }
                  })
                  clienteId = newClient.id
                }
              } else if (clientName) {
                const existingClient = await db!.cliente.findFirst({ where: { nombre: clientName } })
                if (existingClient) {
                  clienteId = existingClient.id
                } else {
                  const newClient = await db!.cliente.create({
                    data: { nombre: clientName }
                  })
                  clienteId = newClient.id
                }
              } else {
                let generic = await db!.cliente.findFirst({ where: { nombre: 'Cliente ClassicGes' } })
                if (!generic) {
                  generic = await db!.cliente.create({ data: { nombre: 'Cliente ClassicGes' } })
                }
                clienteId = generic.id
              }

              const fecha = parseDbfDate(r.FECHA || r.fecha) || new Date()
              const fechaVencimiento = parseDbfDate(r.FECHAVALOR || r.fechavalor) || null

              const cobrado = dbfNumber(r.COBRADO || r.cobrado)
              const total = dbfNumber(r.IMPORTE || r.importe)
              let estado = 'emitida'
              if (cobrado >= total && total > 0) estado = 'pagada'

              const factura = await db!.factura.create({
                data: {
                  numero: fullNumero,
                  serie,
                  fecha,
                  fechaVencimiento,
                  clienteId,
                  subtotal: dbfNumber(r.BIMPO || r.bimpo),
                  totalImpuestos: dbfNumber(r.ITEIVA || r.iteiva),
                  totalRetenciones: dbfNumber(r.RETENCION || r.retencion),
                  total,
                  estado,
                }
              })

              // Import invoice lines
              const snKey = `${serie}${numero}`
              let lines: any[] = linesBySN.get(snKey) || []

              if (lines.length === 0) {
                const clessionKey = String(r.CLESSION || r.clession || '').trim()
                const codigoKey = String(r.CODIGO || r.codigo || '').trim()
                for (const fk of [clessionKey, codigoKey, snKey].filter(k => k !== '')) {
                  if (linesByCLAFAC.has(fk)) {
                    lines = linesByCLAFAC.get(fk)!
                    break
                  }
                }
              }

              for (const lr of lines) {
                try {
                  const descripcion = decodeDbfString(lr.LINDESC || lr.lindesc) || 'Línea importada'
                  const cantidad = dbfNumber(lr.CANTIDAD || lr.cantidad) || 1
                  const precioUnit = dbfNumber(lr.PRECIO || lr.precio)
                  const descuento = dbfNumber(lr.DTO || lr.dto)
                  const ivaPercent = dbfNumber(lr.IVA || lr.iva)

                  let impuestoId: number | null = null
                  if (ivaPercent > 0) {
                    const match = impuestos.find(imp => imp.tipo === 'IVA' && Math.abs(imp.porcentaje - ivaPercent) < 0.01)
                    if (match) impuestoId = match.id
                  }

                  const subtotal = cantidad * precioUnit * (1 - descuento / 100)
                  const totalImpuesto = impuestoId ? subtotal * ivaPercent / 100 : 0
                  const lineTotal = subtotal + totalImpuesto

                  await db!.lineaFactura.create({
                    data: {
                      facturaId: factura.id,
                      descripcion,
                      cantidad,
                      precioUnit,
                      descuento,
                      impuestoId,
                      subtotal,
                      totalImpuesto,
                      totalRetencion: 0,
                      total: lineTotal,
                    }
                  })
                } catch {
                  // Don't fail the whole invoice for a line error
                }
              }

              facResult.imported++
            } catch (e: any) {
              if (e.code === 'P2002') facResult.skipped++
              else facResult.errors.push(String(e))
            }
            sendProgress('facturas', i + 1, allRecords.length, 'importing')
          }
        }
      }
      results.facturas = facResult
      sendProgress('facturas', facResult.imported + facResult.skipped, facResult.imported + facResult.skipped, 'done')
    }

    // 5. Import expenses
    if (entities.includes('gastos')) {
      const gasResult = { imported: 0, skipped: 0, errors: [] as string[] }
      const dbf = await openDbfFile(dirPath, 'gastos.dbf')
      if (dbf) {
        const allRecords: any[] = []
        for await (const r of dbf) allRecords.push(r)
        sendProgress('gastos', 0, allRecords.length, 'importing')

        if (isCloud) {
          const existingCats = await cloudApi.categoriasGasto.getAll()
          // Build category mapping from tipgast
          const catMap = new Map<string, number>()
          const dbfTipg = await openDbfFile(dirPath, 'tipgast.dbf')
          if (dbfTipg) {
            let idx = 0
            for await (const tr of dbfTipg) {
              const tipNombre = decodeDbfString(tr.NOMBRE || tr.nombre)
              const tipKey = String(tr.CLATIPG || tr.clatipg || tr.CODIGO || tr.codigo || idx).trim()
              const matchedCat = existingCats.find((c: any) => c.nombre === tipNombre)
              if (matchedCat && tipKey) {
                catMap.set(tipKey, matchedCat.id)
              }
              idx++
            }
          }

          const toCreate: any[] = []
          for (const r of allRecords) {
            const descripcion = decodeDbfString(r.DESCRIP || r.descrip)
            if (!descripcion) { gasResult.skipped++; continue }
            const catKey = String(r.CLATIPG || r.clatipg || '').trim()
            const categoriaId = catMap.get(catKey) || null
            toCreate.push({
              descripcion,
              monto: dbfNumber(r.IMPORTE || r.importe),
              fecha: (parseDbfDate(r.FECHA || r.fecha) || new Date()).toISOString(),
              proveedor: decodeDbfString(r.NOMPRO || r.nompro) || null,
              numeroFactura: decodeDbfString(r.NUMFACPROV || r.numfacprov) || null,
              categoriaId,
            })
          }

          if (toCreate.length > 0) {
            await cloudApi.batchCreateEntities('gasto', toCreate, (cur, tot) => {
              sendProgress('gastos', cur, tot, 'importing')
            })
            gasResult.imported = toCreate.length
          }
        } else {
          // Build category mapping from tipgast
          const catMap = new Map<string, number>()
          const allCats = await db!.categoriaGasto.findMany()
          const dbfTipg = await openDbfFile(dirPath, 'tipgast.dbf')
          if (dbfTipg) {
            let idx = 0
            for await (const tr of dbfTipg) {
              const tipNombre = decodeDbfString(tr.NOMBRE || tr.nombre)
              const tipKey = String(tr.CLATIPG || tr.clatipg || tr.CODIGO || tr.codigo || idx).trim()
              const matchedCat = allCats.find(c => c.nombre === tipNombre)
              if (matchedCat && tipKey) {
                catMap.set(tipKey, matchedCat.id)
              }
              idx++
            }
          }

          for (let i = 0; i < allRecords.length; i++) {
            try {
              const r = allRecords[i]
              const descripcion = decodeDbfString(r.DESCRIP || r.descrip)
              if (!descripcion) { gasResult.skipped++; continue }

              const catKey = String(r.CLATIPG || r.clatipg || '').trim()
              const categoriaId = catMap.get(catKey) || null

              await db!.gasto.create({
                data: {
                  descripcion,
                  monto: dbfNumber(r.IMPORTE || r.importe),
                  fecha: parseDbfDate(r.FECHA || r.fecha) || new Date(),
                  proveedor: decodeDbfString(r.NOMPRO || r.nompro) || null,
                  numeroFactura: decodeDbfString(r.NUMFACPROV || r.numfacprov) || null,
                  categoriaId,
                }
              })
              gasResult.imported++
            } catch (e: any) {
              gasResult.errors.push(String(e))
            }
            sendProgress('gastos', i + 1, allRecords.length, 'importing')
          }
        }
      }
      results.gastos = gasResult
      sendProgress('gastos', gasResult.imported + gasResult.skipped, gasResult.imported + gasResult.skipped, 'done')
    }

    // Invalidate all caches after import
    if (isCloud) {
      cloudApi.invalidateCache()
    }

    return { success: true, data: results }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// Holded API Import
// ============================================

const HOLDED_BASE = 'https://api.holded.com/api/invoicing/v1'

async function holdedGet(apiKey: string, path: string): Promise<any> {
  const url = `${HOLDED_BASE}${path}`
  const res = await fetch(url, { headers: { key: apiKey, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Holded API ${res.status}: ${res.statusText}`)
  return res.json()
}

async function holdedGetAll(apiKey: string, endpoint: string): Promise<any[]> {
  const all: any[] = []
  let page = 1
  while (true) {
    const data = await holdedGet(apiKey, `${endpoint}?page=${page}`)
    if (!Array.isArray(data) || data.length === 0) break
    all.push(...data)
    page++
  }
  return all
}

function holdedSafeString(val: any): string | null {
  if (val == null || val === '') return null
  return String(val).trim() || null
}

function holdedSafeNumber(val: any): number {
  const n = parseFloat(String(val))
  return isNaN(n) ? 0 : n
}

function holdedDate(val: any): Date {
  if (!val) return new Date()
  const n = Number(val)
  if (isNaN(n) || n <= 0) return new Date()
  return new Date(n * 1000)
}

// Save Holded API key (encrypted)
ipcMain.handle('holded:saveApiKey', async (_, apiKey: string) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.configuracion.set('holded.apiKey', apiKey)
      return { success: true }
    }
    const db = ctx.db
    const encrypted = safeStorage.encryptString(apiKey).toString('base64')
    await db.$executeRawUnsafe(
      `INSERT OR REPLACE INTO Configuracion (clave, valor) VALUES ('holded.apiKey', ?)`,
      encrypted
    )
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Get Holded API key (decrypted)
ipcMain.handle('holded:getApiKey', async () => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const val = await cloudApi.configuracion.get('holded.apiKey')
      return { success: true, data: val }
    }
    const db = ctx.db
    const rows: any[] = await db.$queryRawUnsafe(
      `SELECT valor FROM Configuracion WHERE clave = 'holded.apiKey'`
    )
    if (rows.length === 0) return { success: true, data: null }
    const decrypted = safeStorage.decryptString(Buffer.from(rows[0].valor, 'base64'))
    return { success: true, data: decrypted }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Delete Holded API key
ipcMain.handle('holded:deleteApiKey', async () => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.configuracion.delete('holded.apiKey')
      return { success: true }
    }
    const db = ctx.db
    await db.$executeRawUnsafe(`DELETE FROM Configuracion WHERE clave = 'holded.apiKey'`)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Test Holded API connection
ipcMain.handle('holded:testConnection', async (_, apiKey: string) => {
  try {
    await holdedGet(apiKey, '/contacts?page=1')
    return { success: true, data: { connected: true } }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Scan Holded data (count all entities)
ipcMain.handle('holded:scan', async (_, apiKey: string) => {
  try {
    const endpoints: Record<string, string> = {
      clientes: '/contacts',
      productos: '/products',
      facturas: '/documents/invoice',
      gastos: '/documents/purchase',
    }
    const result: Record<string, { found: boolean; count: number }> = {}
    for (const [key, endpoint] of Object.entries(endpoints)) {
      try {
        const data = await holdedGetAll(apiKey, endpoint)
        result[key] = { found: data.length > 0, count: data.length }
      } catch {
        result[key] = { found: false, count: 0 }
      }
    }
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Preview first 10 records from Holded
ipcMain.handle('holded:preview', async (_, apiKey: string, entity: string) => {
  try {
    const endpointMap: Record<string, string> = {
      clientes: '/contacts',
      productos: '/products',
      facturas: '/documents/invoice',
      gastos: '/documents/purchase',
    }
    const endpoint = endpointMap[entity]
    if (!endpoint) return { success: false, error: 'Unknown entity' }

    const page1 = await holdedGet(apiKey, `${endpoint}?page=1`)
    if (!Array.isArray(page1)) return { success: true, data: [] }

    const preview = page1.slice(0, 10).map((item: any) => {
      if (entity === 'clientes') {
        return {
          nombre: item.name || item.tradeName || '',
          nif: item.code || '',
          email: item.email || '',
          telefono: item.mobile || item.phone || '',
          ciudad: item.billAddress?.city || '',
          pais: item.billAddress?.country || '',
        }
      } else if (entity === 'productos') {
        return {
          nombre: item.name || '',
          codigo: item.sku || item.id || '',
          descripcion: (item.desc || '').substring(0, 80),
          tipo: ['service', 'digital'].includes(item.kind) ? 'servicio' : 'producto',
          precio: holdedSafeNumber(item.price),
          impuesto: item.tax != null ? `${holdedSafeNumber(item.tax)}%` : '',
        }
      } else if (entity === 'facturas') {
        return {
          numero: item.docNumber || '',
          fecha: item.date ? holdedDate(item.date).toLocaleDateString() : '',
          cliente: item.contactName || '',
          subtotal: holdedSafeNumber(item.subtotal),
          impuestos: holdedSafeNumber(item.tax),
          total: holdedSafeNumber(item.total),
        }
      } else {
        return {
          numero: item.docNumber || '',
          fecha: item.date ? holdedDate(item.date).toLocaleDateString() : '',
          proveedor: item.contactName || '',
          total: holdedSafeNumber(item.total),
          descripcion: Array.isArray(item.products) ? item.products.map((p: any) => p.name || '').join(', ').substring(0, 80) : '',
          estado: item.status != null ? String(item.status) : '',
        }
      }
    })

    return { success: true, data: preview }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Import data from Holded
ipcMain.handle('holded:import', async (_, apiKey: string, entities: string[]) => {
  try {
    const ctx = requireAuthOrCloud()
    const isCloud = ctx.mode === 'cloud'
    const db = isCloud ? null : ctx.db
    const results: Record<string, { imported: number; skipped: number; errors: string[] }> = {}

    const sendProgress = (entity: string, current: number, total: number, status: string) => {
      mainWindow?.webContents.send('holded:progress', { entity, current, total, status })
    }

    // Get all impuestos for matching
    const impuestos = isCloud
      ? await cloudApi.impuestos.getAll()
      : await db!.impuesto.findMany({ where: { activo: true } })

    // 1. Import clients
    if (entities.includes('clientes')) {
      const cliResult = { imported: 0, skipped: 0, errors: [] as string[] }
      const contacts = await holdedGetAll(apiKey, '/contacts')
      sendProgress('clientes', 0, contacts.length, 'importing')

      if (isCloud) {
        const existingClients = await cloudApi.clientes.getAll()
        const existingNifs = new Set(existingClients.filter((c: any) => c.nif).map((c: any) => c.nif))
        const toCreate: any[] = []

        for (const c of contacts) {
          const nombre = holdedSafeString(c.name || c.tradeName)
          if (!nombre) { cliResult.skipped++; continue }
          const nif = holdedSafeString(c.code)
          if (nif && existingNifs.has(nif)) { cliResult.skipped++; continue }
          if (nif) existingNifs.add(nif)
          const addr = c.billAddress || {}
          toCreate.push({
            nombre,
            nif,
            email: holdedSafeString(c.email),
            telefono: holdedSafeString(c.mobile || c.phone),
            direccion: holdedSafeString(addr.address),
            ciudad: holdedSafeString(addr.city),
            codigoPostal: holdedSafeString(addr.postalCode),
            provincia: holdedSafeString(addr.province),
            pais: holdedSafeString(addr.country) || 'España',
            activo: true,
          })
        }

        if (toCreate.length > 0) {
          await cloudApi.batchCreateEntities('cliente', toCreate, (cur, tot) => {
            sendProgress('clientes', cur, tot, 'importing')
          })
          cliResult.imported = toCreate.length
        }
      } else {
        for (let i = 0; i < contacts.length; i++) {
          try {
            const c = contacts[i]
            const nombre = holdedSafeString(c.name || c.tradeName)
            if (!nombre) { cliResult.skipped++; continue }

            const nif = holdedSafeString(c.code)
            if (nif) {
              const existing = await db!.cliente.findFirst({ where: { nif } })
              if (existing) { cliResult.skipped++; continue }
            }

            const addr = c.billAddress || {}
            await db!.cliente.create({
              data: {
                nombre,
                nif,
                email: holdedSafeString(c.email),
                telefono: holdedSafeString(c.mobile || c.phone),
                direccion: holdedSafeString(addr.address),
                ciudad: holdedSafeString(addr.city),
                codigoPostal: holdedSafeString(addr.postalCode),
                provincia: holdedSafeString(addr.province),
                pais: holdedSafeString(addr.country) || 'España',
                activo: true,
              }
            })
            cliResult.imported++
          } catch (e: any) {
            if (e.code === 'P2002') cliResult.skipped++
            else cliResult.errors.push(String(e))
          }
          sendProgress('clientes', i + 1, contacts.length, 'importing')
        }
      }
      results.clientes = cliResult
      sendProgress('clientes', contacts.length, contacts.length, 'done')
    }

    // 2. Import products
    if (entities.includes('productos')) {
      const prodResult = { imported: 0, skipped: 0, errors: [] as string[] }
      const products = await holdedGetAll(apiKey, '/products')
      sendProgress('productos', 0, products.length, 'importing')

      if (isCloud) {
        const existingProds = await cloudApi.productos.getAll()
        const existingCodigos = new Set(existingProds.filter((p: any) => p.codigo).map((p: any) => p.codigo))
        const toCreate: any[] = []

        for (const p of products) {
          const nombre = holdedSafeString(p.name)
          if (!nombre) { prodResult.skipped++; continue }
          const codigo = holdedSafeString(p.sku) || holdedSafeString(p.id)
          if (codigo && existingCodigos.has(codigo)) { prodResult.skipped++; continue }
          if (codigo) existingCodigos.add(codigo)

          const tipo = ['service', 'digital'].includes(p.kind) ? 'servicio' : 'producto'
          const taxPercent = holdedSafeNumber(p.tax)
          let impuestoId: number | null = null
          if (taxPercent > 0) {
            const match = impuestos.find((imp: any) => imp.tipo === 'IVA' && Math.abs(imp.porcentaje - taxPercent) < 0.01)
            if (match) impuestoId = match.id
          }

          toCreate.push({ codigo, nombre, descripcion: holdedSafeString(p.desc), tipo, precioBase: holdedSafeNumber(p.price), impuestoId, activo: true })
        }

        if (toCreate.length > 0) {
          await cloudApi.batchCreateEntities('producto', toCreate, (cur, tot) => {
            sendProgress('productos', cur, tot, 'importing')
          })
          prodResult.imported = toCreate.length
        }
      } else {
        for (let i = 0; i < products.length; i++) {
          try {
            const p = products[i]
            const nombre = holdedSafeString(p.name)
            if (!nombre) { prodResult.skipped++; continue }

            const codigo = holdedSafeString(p.sku) || holdedSafeString(p.id)
            if (codigo) {
              const existing = await db!.producto.findFirst({ where: { codigo } })
              if (existing) { prodResult.skipped++; continue }
            }

            const tipo = ['service', 'digital'].includes(p.kind) ? 'servicio' : 'producto'
            const taxPercent = holdedSafeNumber(p.tax)
            let impuestoId: number | null = null
            if (taxPercent > 0) {
              const match = impuestos.find((imp: any) => imp.tipo === 'IVA' && Math.abs(imp.porcentaje - taxPercent) < 0.01)
              if (match) impuestoId = match.id
            }

            await db!.producto.create({
              data: { codigo, nombre, descripcion: holdedSafeString(p.desc), tipo, precioBase: holdedSafeNumber(p.price), impuestoId, activo: true }
            })
            prodResult.imported++
          } catch (e: any) {
            if (e.code === 'P2002') prodResult.skipped++
            else prodResult.errors.push(String(e))
          }
          sendProgress('productos', i + 1, products.length, 'importing')
        }
      }
      results.productos = prodResult
      sendProgress('productos', products.length, products.length, 'done')
    }

    // 3. Import invoices
    if (entities.includes('facturas')) {
      const facResult = { imported: 0, skipped: 0, errors: [] as string[] }
      const invoices = await holdedGetAll(apiKey, '/documents/invoice')
      sendProgress('facturas', 0, invoices.length, 'importing')

      if (isCloud) {
        const existingFacturas = await cloudApi.facturas.getAll()
        const existingNumeros = new Set(existingFacturas.map((f: any) => f.numero))
        const existingClientes = await cloudApi.clientes.getAll()
        const clienteCache = new Map<string, number>()
        for (const c of existingClientes) {
          clienteCache.set(`name:${c.nombre}`, c.id)
        }

        for (let i = 0; i < invoices.length; i++) {
          try {
            const inv = invoices[i]
            const docNumber = holdedSafeString(inv.docNumber)
            if (!docNumber) { facResult.skipped++; continue }

            const numero = `H${docNumber}`
            if (existingNumeros.has(numero)) { facResult.skipped++; continue }
            existingNumeros.add(numero)

            // Find or create client
            let clienteId: number
            const contactName = holdedSafeString(inv.contactName)
            if (contactName && clienteCache.has(`name:${contactName}`)) {
              clienteId = clienteCache.get(`name:${contactName}`)!
            } else {
              const newCli = await cloudApi.clientes.create({ nombre: contactName || 'Cliente Holded', activo: true, pais: 'España' })
              clienteCache.set(`name:${newCli.nombre}`, newCli.id)
              clienteId = newCli.id
            }

            const statusMap: Record<number, string> = { 0: 'borrador', 1: 'emitida', 2: 'pagada', 3: 'anulada' }
            const estado = statusMap[Number(inv.status)] || 'emitida'

            // Build lines data
            const lineasData = Array.isArray(inv.products) ? inv.products.map((line: any) => {
              const descripcion = holdedSafeString(line.name) || 'Línea importada'
              const cantidad = holdedSafeNumber(line.units) || 1
              const precioUnit = holdedSafeNumber(line.price)
              const descuento = holdedSafeNumber(line.discount)
              const lineTaxPercent = holdedSafeNumber(line.tax)
              let lineImpuestoId: number | null = null
              if (lineTaxPercent > 0) {
                const match = impuestos.find((imp: any) => imp.tipo === 'IVA' && Math.abs(imp.porcentaje - lineTaxPercent) < 0.01)
                if (match) lineImpuestoId = match.id
              }
              const subtotal = cantidad * precioUnit * (1 - descuento / 100)
              const totalImpuesto = lineImpuestoId ? subtotal * lineTaxPercent / 100 : 0
              return { descripcion, cantidad, precioUnit, descuento, impuestoId: lineImpuestoId, subtotal, totalImpuesto, totalRetencion: 0, total: subtotal + totalImpuesto }
            }) : []

            const factura = await cloudApi.facturas.create({
              numero, serie: 'H', fecha: holdedDate(inv.date).toISOString(), clienteId,
              subtotal: holdedSafeNumber(inv.subtotal), totalImpuestos: holdedSafeNumber(inv.tax),
              totalRetenciones: 0, total: holdedSafeNumber(inv.total), estado, lineas: lineasData,
            })

            if (lineasData.length > 0) {
              await cloudApi.batchCreateEntities('lineaFactura', lineasData.map((l: any) => ({ ...l, facturaId: factura.id })))
            }

            facResult.imported++
          } catch (e: any) {
            facResult.errors.push(String(e))
          }
          sendProgress('facturas', i + 1, invoices.length, 'importing')
        }
      } else {
        for (let i = 0; i < invoices.length; i++) {
          try {
            const inv = invoices[i]
            const docNumber = holdedSafeString(inv.docNumber)
            if (!docNumber) { facResult.skipped++; continue }

            const numero = `H${docNumber}`
            const existing = await db!.factura.findFirst({ where: { numero } })
            if (existing) { facResult.skipped++; continue }

            let clienteId: number
            const contactName = holdedSafeString(inv.contactName)
            if (contactName) {
              const existingClient = await db!.cliente.findFirst({ where: { nombre: contactName } })
              if (existingClient) {
                clienteId = existingClient.id
              } else {
                const newClient = await db!.cliente.create({ data: { nombre: contactName } })
                clienteId = newClient.id
              }
            } else {
              let generic = await db!.cliente.findFirst({ where: { nombre: 'Cliente Holded' } })
              if (!generic) {
                generic = await db!.cliente.create({ data: { nombre: 'Cliente Holded' } })
              }
              clienteId = generic.id
            }

            const statusMap: Record<number, string> = { 0: 'borrador', 1: 'emitida', 2: 'pagada', 3: 'anulada' }
            const estado = statusMap[Number(inv.status)] || 'emitida'

            const factura = await db!.factura.create({
              data: {
                numero, serie: 'H', fecha: holdedDate(inv.date), clienteId,
                subtotal: holdedSafeNumber(inv.subtotal), totalImpuestos: holdedSafeNumber(inv.tax),
                totalRetenciones: 0, total: holdedSafeNumber(inv.total), estado,
              }
            })

            if (Array.isArray(inv.products)) {
              for (const line of inv.products) {
                try {
                  const descripcion = holdedSafeString(line.name) || 'Línea importada'
                  const cantidad = holdedSafeNumber(line.units) || 1
                  const precioUnit = holdedSafeNumber(line.price)
                  const descuento = holdedSafeNumber(line.discount)
                  const lineTaxPercent = holdedSafeNumber(line.tax)

                  let lineImpuestoId: number | null = null
                  if (lineTaxPercent > 0) {
                    const match = impuestos.find((imp: any) => imp.tipo === 'IVA' && Math.abs(imp.porcentaje - lineTaxPercent) < 0.01)
                    if (match) lineImpuestoId = match.id
                  }

                  const subtotal = cantidad * precioUnit * (1 - descuento / 100)
                  const totalImpuesto = lineImpuestoId ? subtotal * lineTaxPercent / 100 : 0
                  const lineTotal = subtotal + totalImpuesto

                  await db!.lineaFactura.create({
                    data: {
                      facturaId: factura.id, descripcion, cantidad, precioUnit, descuento,
                      impuestoId: lineImpuestoId, subtotal, totalImpuesto, totalRetencion: 0, total: lineTotal,
                    }
                  })
                } catch {
                  // Don't fail the whole invoice for a line error
                }
              }
            }

            facResult.imported++
          } catch (e: any) {
            if (e.code === 'P2002') facResult.skipped++
            else facResult.errors.push(String(e))
          }
          sendProgress('facturas', i + 1, invoices.length, 'importing')
        }
      }
      results.facturas = facResult
      sendProgress('facturas', invoices.length, invoices.length, 'done')
    }

    // 4. Import expenses (purchases)
    if (entities.includes('gastos')) {
      const gasResult = { imported: 0, skipped: 0, errors: [] as string[] }
      const purchases = await holdedGetAll(apiKey, '/documents/purchase')
      sendProgress('gastos', 0, purchases.length, 'importing')

      if (isCloud) {
        // Find or create "Holded" category
        const existingCats = await cloudApi.categoriasGasto.getAll()
        let holdedCat = existingCats.find((c: any) => c.nombre === 'Holded')
        if (!holdedCat) {
          holdedCat = await cloudApi.categoriasGasto.create({ nombre: 'Holded', color: '#0ea5e9', icono: 'cloud' })
        }

        const existingGastos = await cloudApi.gastos.getAll()
        const existingKeys = new Set(existingGastos.filter((g: any) => g.numeroFactura).map((g: any) => `${g.numeroFactura}|${g.proveedor || ''}`))
        const toCreate: any[] = []

        for (const pur of purchases) {
          const docNumber = holdedSafeString(pur.docNumber) || ''
          const proveedor = holdedSafeString(pur.contactName) || null
          if (docNumber && existingKeys.has(`${docNumber}|${proveedor || ''}`)) { gasResult.skipped++; continue }

          const descripcion = Array.isArray(pur.products)
            ? pur.products.map((p: any) => p.name || '').filter(Boolean).join(', ') || 'Gasto importado de Holded'
            : 'Gasto importado de Holded'

          toCreate.push({
            descripcion: descripcion.substring(0, 500),
            categoriaId: holdedCat.id,
            monto: holdedSafeNumber(pur.total),
            impuestoIncluido: true,
            fecha: holdedDate(pur.date).toISOString(),
            proveedor,
            numeroFactura: docNumber || null,
          })
        }

        if (toCreate.length > 0) {
          await cloudApi.batchCreateEntities('gasto', toCreate, (cur, tot) => {
            sendProgress('gastos', cur, tot, 'importing')
          })
          gasResult.imported = toCreate.length
        }
      } else {
        let holdedCat = await db!.categoriaGasto.findFirst({ where: { nombre: 'Holded' } })
        if (!holdedCat) {
          holdedCat = await db!.categoriaGasto.create({
            data: { nombre: 'Holded', color: '#0ea5e9', icono: 'cloud' }
          })
        }

        for (let i = 0; i < purchases.length; i++) {
          try {
            const pur = purchases[i]
            const docNumber = holdedSafeString(pur.docNumber) || ''
            const proveedor = holdedSafeString(pur.contactName) || null

            if (docNumber) {
              const existing = await db!.gasto.findFirst({
                where: { numeroFactura: docNumber, proveedor: proveedor || undefined }
              })
              if (existing) { gasResult.skipped++; continue }
            }

            const descripcion = Array.isArray(pur.products)
              ? pur.products.map((p: any) => p.name || '').filter(Boolean).join(', ') || 'Gasto importado de Holded'
              : 'Gasto importado de Holded'

            await db!.gasto.create({
              data: {
                descripcion: descripcion.substring(0, 500),
                categoriaId: holdedCat.id,
                monto: holdedSafeNumber(pur.total),
                impuestoIncluido: true,
                fecha: holdedDate(pur.date),
                proveedor,
                numeroFactura: docNumber || null,
              }
            })
            gasResult.imported++
          } catch (e: any) {
            if (e.code === 'P2002') gasResult.skipped++
            else gasResult.errors.push(String(e))
          }
          sendProgress('gastos', i + 1, purchases.length, 'importing')
        }
      }
      results.gastos = gasResult
      sendProgress('gastos', purchases.length, purchases.length, 'done')
    }

    // Invalidate all caches after import
    if (isCloud) {
      cloudApi.invalidateCache()
    }

    return { success: true, data: results }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - RRHH: Departamentos
// ============================================

ipcMain.handle('departamentos:getAll', async () => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const data = await cloudApi.departamentos.getAll()
      return { success: true, data }
    }
    const db = ctx.db
    const departamentos = await db.departamento.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { empleados: true } } }
    })
    return { success: true, data: departamentos }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('departamentos:create', async (_, data: any) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const departamento = await cloudApi.departamentos.create(data)
      return { success: true, data: departamento }
    }
    const db = ctx.db
    const departamento = await db.departamento.create({ data: { nombre: data.nombre, activo: data.activo ?? true } })
    return { success: true, data: departamento }
  } catch (error: any) {
    if (error.code === 'P2002') return { success: false, error: 'duplicateName' }
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('departamentos:update', async (_, id: number, data: any) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const departamento = await cloudApi.departamentos.update(id, data)
      return { success: true, data: departamento }
    }
    const db = ctx.db
    const departamento = await db.departamento.update({ where: { id }, data: { nombre: data.nombre, activo: data.activo } })
    return { success: true, data: departamento }
  } catch (error: any) {
    if (error.code === 'P2002') return { success: false, error: 'duplicateName' }
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('departamentos:delete', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.departamentos.delete(id)
      return { success: true }
    }
    const db = ctx.db
    await db.departamento.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - RRHH: Empleados
// ============================================

ipcMain.handle('empleados:getAll', async () => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const data = await cloudApi.empleados.getAll()
      return { success: true, data }
    }
    const db = ctx.db
    const empleados = await db.empleado.findMany({
      orderBy: [{ apellidos: 'asc' }, { nombre: 'asc' }],
      include: { departamento: true, contratos: { where: { activo: true }, take: 1 } }
    })
    return { success: true, data: empleados }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empleados:getById', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const empleado = await cloudApi.empleados.getById(id)
      return { success: true, data: empleado }
    }
    const db = ctx.db
    const empleado = await db.empleado.findUnique({
      where: { id },
      include: { departamento: true, contratos: { orderBy: { fechaInicio: 'desc' } }, nominas: { orderBy: [{ anio: 'desc' }, { mes: 'desc' }], take: 12 }, ausencias: { include: { tipoAusencia: true }, orderBy: { fechaInicio: 'desc' }, take: 10 } }
    })
    if (!empleado) return { success: false, error: 'notFound' }
    return { success: true, data: empleado }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empleados:create', async (_, data: any) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const empleado = await cloudApi.empleados.create(data)
      return { success: true, data: empleado }
    }
    const db = ctx.db
    const empleado = await db.empleado.create({
      data: {
        nombre: data.nombre, apellidos: data.apellidos, nif: data.nif,
        numSeguridadSocial: data.numSeguridadSocial || null,
        fechaNacimiento: data.fechaNacimiento ? new Date(data.fechaNacimiento) : null,
        genero: data.genero || null, estadoCivil: data.estadoCivil || null,
        email: data.email || null, telefono: data.telefono || null,
        direccion: data.direccion || null, codigoPostal: data.codigoPostal || null,
        ciudad: data.ciudad || null, provincia: data.provincia || null,
        pais: data.pais || 'España', iban: data.iban || null,
        categoriaProfesional: data.categoriaProfesional || null,
        grupoCotizacion: data.grupoCotizacion || 1,
        departamentoId: data.departamentoId || null,
        codigoCNAE: data.codigoCNAE || null,
        fechaAlta: data.fechaAlta ? new Date(data.fechaAlta) : new Date(),
        porcentajeIRPF: data.porcentajeIRPF || 0,
        diasVacacionesAnuales: data.diasVacacionesAnuales || 30,
        activo: data.activo ?? true, notas: data.notas || null,
      },
      include: { departamento: true }
    })
    return { success: true, data: empleado }
  } catch (error: any) {
    if (error.code === 'P2002') return { success: false, error: 'duplicateNif' }
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empleados:update', async (_, id: number, data: any) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const empleado = await cloudApi.empleados.update(id, data)
      return { success: true, data: empleado }
    }
    const db = ctx.db
    const empleado = await db.empleado.update({
      where: { id },
      data: {
        nombre: data.nombre, apellidos: data.apellidos, nif: data.nif,
        numSeguridadSocial: data.numSeguridadSocial, email: data.email,
        fechaNacimiento: data.fechaNacimiento ? new Date(data.fechaNacimiento) : undefined,
        genero: data.genero, estadoCivil: data.estadoCivil,
        telefono: data.telefono, direccion: data.direccion,
        codigoPostal: data.codigoPostal, ciudad: data.ciudad,
        provincia: data.provincia, pais: data.pais, iban: data.iban,
        categoriaProfesional: data.categoriaProfesional,
        grupoCotizacion: data.grupoCotizacion,
        departamentoId: data.departamentoId,
        codigoCNAE: data.codigoCNAE,
        fechaAlta: data.fechaAlta ? new Date(data.fechaAlta) : undefined,
        fechaBaja: data.fechaBaja ? new Date(data.fechaBaja) : data.fechaBaja === null ? null : undefined,
        motivoBaja: data.motivoBaja, porcentajeIRPF: data.porcentajeIRPF,
        diasVacacionesAnuales: data.diasVacacionesAnuales,
        activo: data.activo, notas: data.notas,
      },
      include: { departamento: true }
    })
    return { success: true, data: empleado }
  } catch (error: any) {
    if (error.code === 'P2002') return { success: false, error: 'duplicateNif' }
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('empleados:delete', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.empleados.delete(id)
      return { success: true }
    }
    const db = ctx.db
    await db.empleado.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - RRHH: Contratos
// ============================================

ipcMain.handle('contratos:getByEmpleado', async (_, empleadoId: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const data = await cloudApi.contratos.getByEmpleado(empleadoId)
      return { success: true, data }
    }
    const db = ctx.db
    const contratos = await db.contrato.findMany({ where: { empleadoId }, orderBy: { fechaInicio: 'desc' } })
    return { success: true, data: contratos }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('contratos:create', async (_, data: any) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const contrato = await cloudApi.contratos.create(data)
      return { success: true, data: contrato }
    }
    const db = ctx.db
    const contrato = await db.contrato.create({
      data: {
        empleadoId: data.empleadoId, tipoContrato: data.tipoContrato || 'indefinido',
        fechaInicio: new Date(data.fechaInicio),
        fechaFin: data.fechaFin ? new Date(data.fechaFin) : null,
        jornada: data.jornada || 'completa', horasSemanales: data.horasSemanales || 40,
        salarioBrutoAnual: data.salarioBrutoAnual, salarioBrutoMensual: data.salarioBrutoMensual,
        numPagasExtra: data.numPagasExtra ?? 2, pagasProrrateadas: data.pagasProrrateadas ?? false,
        convenioColectivo: data.convenioColectivo || null,
        codigoContrato: data.codigoContrato || null,
        porcentajeATEP: data.porcentajeATEP ?? 1.50,
        activo: data.activo ?? true, notas: data.notas || null,
      }
    })
    return { success: true, data: contrato }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('contratos:update', async (_, id: number, data: any) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const contrato = await cloudApi.contratos.update(id, data)
      return { success: true, data: contrato }
    }
    const db = ctx.db
    const contrato = await db.contrato.update({
      where: { id },
      data: {
        tipoContrato: data.tipoContrato,
        fechaInicio: data.fechaInicio ? new Date(data.fechaInicio) : undefined,
        fechaFin: data.fechaFin ? new Date(data.fechaFin) : data.fechaFin === null ? null : undefined,
        jornada: data.jornada, horasSemanales: data.horasSemanales,
        salarioBrutoAnual: data.salarioBrutoAnual, salarioBrutoMensual: data.salarioBrutoMensual,
        numPagasExtra: data.numPagasExtra, pagasProrrateadas: data.pagasProrrateadas,
        convenioColectivo: data.convenioColectivo, codigoContrato: data.codigoContrato,
        porcentajeATEP: data.porcentajeATEP, activo: data.activo, notas: data.notas,
      }
    })
    return { success: true, data: contrato }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('contratos:delete', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.contratos.delete(id)
      return { success: true }
    }
    const db = ctx.db
    await db.contrato.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// Helper: Payroll calculation
// ============================================

interface PayrollInput {
  empleadoId: number
  mes: number
  anio: number
  complementos?: number
  horasExtraImporte?: number
  otrosDevengos?: number
}

async function calculatePayroll(input: PayrollInput, ctx: { mode: 'local'; db: PrismaClient } | { mode: 'cloud' }) {
  let empleado: any, contrato: any
  if (ctx.mode === 'cloud') {
    const empleadosAll = await cloudApi.empleados.getAll()
    empleado = empleadosAll.find((e: any) => e.id === input.empleadoId)
    if (!empleado) throw new Error('empleadoNotFound')
    const contratosAll = await cloudApi.contratos.getByEmpleado(input.empleadoId)
    contrato = contratosAll.find((c: any) => c.activo)
  } else {
    empleado = await ctx.db.empleado.findUnique({ where: { id: input.empleadoId } })
    if (!empleado) throw new Error('empleadoNotFound')
    contrato = await ctx.db.contrato.findFirst({ where: { empleadoId: input.empleadoId, activo: true }, orderBy: { fechaInicio: 'desc' } })
  }
  if (!contrato) throw new Error('noActiveContract')

  const salarioBase = contrato.salarioBrutoMensual
  const prorrataPagasExtra = contrato.pagasProrrateadas ? (contrato.salarioBrutoAnual / 12 - contrato.salarioBrutoMensual) : 0
  const complementos = input.complementos || 0
  const horasExtraImporte = input.horasExtraImporte || 0
  const otrosDevengos = input.otrosDevengos || 0
  const totalDevengado = salarioBase + prorrataPagasExtra + complementos + horasExtraImporte + otrosDevengos
  const baseCotizacionCC = salarioBase + complementos + prorrataPagasExtra
  const baseCotizacionCP = baseCotizacionCC + horasExtraImporte
  const isTemporary = contrato.tipoContrato === 'temporal'
  const ccTrab = Math.round(baseCotizacionCC * 0.047 * 100) / 100
  const desempleoTrab = Math.round(baseCotizacionCP * (isTemporary ? 0.016 : 0.0155) * 100) / 100
  const fpTrab = Math.round(baseCotizacionCP * 0.001 * 100) / 100
  const irpfImporte = Math.round(totalDevengado * ((empleado.porcentajeIRPF || 0) / 100) * 100) / 100
  const totalDeducciones = Math.round((ccTrab + desempleoTrab + fpTrab + irpfImporte) * 100) / 100
  const liquidoPercibir = Math.round((totalDevengado - totalDeducciones) * 100) / 100
  const ccEmp = Math.round(baseCotizacionCC * 0.236 * 100) / 100
  const desempleoEmp = Math.round(baseCotizacionCP * (isTemporary ? 0.067 : 0.055) * 100) / 100
  const fogasaEmp = Math.round(baseCotizacionCP * 0.002 * 100) / 100
  const fpEmp = Math.round(baseCotizacionCP * 0.006 * 100) / 100
  const atepEmp = Math.round(baseCotizacionCP * ((contrato.porcentajeATEP || 1.5) / 100) * 100) / 100
  const totalCosteSS = Math.round((ccEmp + desempleoEmp + fogasaEmp + fpEmp + atepEmp) * 100) / 100
  const costeTotal = Math.round((totalDevengado + totalCosteSS) * 100) / 100

  const lineas = [
    { tipo: 'devengo', concepto: 'Salario base', base: salarioBase, porcentaje: 0, importe: salarioBase, orden: 1 },
    ...(prorrataPagasExtra > 0 ? [{ tipo: 'devengo', concepto: 'Prorrata pagas extra', base: prorrataPagasExtra, porcentaje: 0, importe: prorrataPagasExtra, orden: 2 }] : []),
    ...(complementos > 0 ? [{ tipo: 'devengo', concepto: 'Complementos', base: complementos, porcentaje: 0, importe: complementos, orden: 3 }] : []),
    ...(horasExtraImporte > 0 ? [{ tipo: 'devengo', concepto: 'Horas extra', base: horasExtraImporte, porcentaje: 0, importe: horasExtraImporte, orden: 4 }] : []),
    ...(otrosDevengos > 0 ? [{ tipo: 'devengo', concepto: 'Otros devengos', base: otrosDevengos, porcentaje: 0, importe: otrosDevengos, orden: 5 }] : []),
    { tipo: 'deduccion', concepto: 'Contingencias comunes', base: baseCotizacionCC, porcentaje: 4.70, importe: ccTrab, orden: 10 },
    { tipo: 'deduccion', concepto: 'Desempleo', base: baseCotizacionCP, porcentaje: isTemporary ? 1.60 : 1.55, importe: desempleoTrab, orden: 11 },
    { tipo: 'deduccion', concepto: 'Formación profesional', base: baseCotizacionCP, porcentaje: 0.10, importe: fpTrab, orden: 12 },
    { tipo: 'deduccion', concepto: 'IRPF', base: totalDevengado, porcentaje: empleado.porcentajeIRPF || 0, importe: irpfImporte, orden: 13 },
  ]

  // Frontend format (nested, for display)
  const frontend = {
    devengos: { salarioBase, prorrataPagas: prorrataPagasExtra, complementos, horasExtra: horasExtraImporte, otrosDevengos },
    deducciones: { contingenciasComunes: ccTrab, desempleoTrabajador: desempleoTrab, formacionProfesional: fpTrab, irpf: irpfImporte },
    costesEmpresa: { contingenciasComunesEmpresa: ccEmp, desempleoEmpresa: desempleoEmp, fogasa: fogasaEmp, formacionProfesionalEmpresa: fpEmp, atEp: atepEmp },
    totalDevengado, totalDeducciones, liquido: liquidoPercibir,
  }

  // DB format (flat, for storage)
  const db = {
    empleadoId: input.empleadoId, mes: input.mes, anio: input.anio,
    salarioBase, prorrataPagasExtra, complementos, horasExtraImporte, otrosDevengos,
    totalDevengado, baseCotizacionCC, baseCotizacionCP,
    ccTrabajador: ccTrab, desempleoTrabajador: desempleoTrab, fpTrabajador: fpTrab,
    irpfImporte, porcentajeIRPF: empleado.porcentajeIRPF || 0, totalDeducciones,
    liquidoPercibir, ccEmpresa: ccEmp, desempleoEmpresa: desempleoEmp,
    fogasaEmpresa: fogasaEmp, fpEmpresa: fpEmp, atepEmpresa: atepEmp,
    totalCosteSS, costeTotal, lineas,
  }

  return { frontend, db }
}

// Helper: Transform DB nomina to frontend format
function transformNomina(n: any): any {
  return {
    ...n,
    devengos: {
      salarioBase: n.salarioBase || 0,
      prorrataPagas: n.prorrataPagasExtra || 0,
      complementos: n.complementos || 0,
      horasExtra: n.horasExtraImporte || 0,
      otrosDevengos: n.otrosDevengos || 0,
    },
    deducciones: {
      contingenciasComunes: n.ccTrabajador || 0,
      desempleoTrabajador: n.desempleoTrabajador || 0,
      formacionProfesional: n.fpTrabajador || 0,
      irpf: n.irpfImporte || 0,
    },
    costesEmpresa: {
      contingenciasComunesEmpresa: n.ccEmpresa || 0,
      desempleoEmpresa: n.desempleoEmpresa || 0,
      fogasa: n.fogasaEmpresa || 0,
      formacionProfesionalEmpresa: n.fpEmpresa || 0,
      atEp: n.atepEmpresa || 0,
    },
    liquido: n.liquidoPercibir || 0,
  }
}

// ============================================
// IPC Handlers - RRHH: Nóminas
// ============================================

ipcMain.handle('nominas:getAll', async (_, filters?: { empleadoId?: number; mes?: number; anio?: number; estado?: string }) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const data = await cloudApi.nominas.getAll(filters)
      return { success: true, data: data.map(transformNomina) }
    }
    const db = ctx.db
    const where: any = {}
    if (filters?.empleadoId) where.empleadoId = filters.empleadoId
    if (filters?.mes) where.mes = filters.mes
    if (filters?.anio) where.anio = filters.anio
    if (filters?.estado) where.estado = filters.estado
    const nominas = await db.nomina.findMany({
      where, orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      include: { empleado: { select: { id: true, nombre: true, apellidos: true, nif: true } }, lineas: { orderBy: { orden: 'asc' } } }
    })
    return { success: true, data: nominas.map(transformNomina) }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('nominas:getById', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const nomina = await cloudApi.nominas.getById(id)
      return { success: true, data: transformNomina(nomina) }
    }
    const db = ctx.db
    const nomina = await db.nomina.findUnique({
      where: { id },
      include: { empleado: { include: { departamento: true, contratos: { where: { activo: true }, take: 1 } } }, lineas: { orderBy: { orden: 'asc' } }, asiento: true }
    })
    if (!nomina) return { success: false, error: 'notFound' }
    return { success: true, data: transformNomina(nomina) }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('nominas:calcular', async (_, data: PayrollInput) => {
  try {
    const ctx = requireAuthOrCloud()
    const result = await calculatePayroll(data, ctx)
    return { success: true, data: result.frontend }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('nominas:create', async (_, data: any) => {
  try {
    const ctx = requireAuthOrCloud()

    // Auto-calculate payroll from basic params
    const result = await calculatePayroll({
      empleadoId: data.empleadoId,
      mes: data.mes,
      anio: data.anio,
      complementos: data.complementos,
      horasExtraImporte: data.horasExtraImporte,
      otrosDevengos: data.otrosDevengos,
    }, ctx)
    const calc = result.db

    if (ctx.mode === 'cloud') {
      const nomina = await cloudApi.nominas.create({ ...calc, notas: data.notas || null })
      return { success: true, data: nomina }
    }
    const db = ctx.db
    const nomina = await db.nomina.create({
      data: {
        empleadoId: calc.empleadoId, mes: calc.mes, anio: calc.anio,
        salarioBase: calc.salarioBase, prorrataPagasExtra: calc.prorrataPagasExtra,
        complementos: calc.complementos, horasExtraImporte: calc.horasExtraImporte,
        otrosDevengos: calc.otrosDevengos, totalDevengado: calc.totalDevengado,
        baseCotizacionCC: calc.baseCotizacionCC, baseCotizacionCP: calc.baseCotizacionCP,
        ccTrabajador: calc.ccTrabajador, desempleoTrabajador: calc.desempleoTrabajador,
        fpTrabajador: calc.fpTrabajador, irpfImporte: calc.irpfImporte,
        porcentajeIRPF: calc.porcentajeIRPF, totalDeducciones: calc.totalDeducciones,
        liquidoPercibir: calc.liquidoPercibir, ccEmpresa: calc.ccEmpresa,
        desempleoEmpresa: calc.desempleoEmpresa, fogasaEmpresa: calc.fogasaEmpresa,
        fpEmpresa: calc.fpEmpresa, atepEmpresa: calc.atepEmpresa,
        totalCosteSS: calc.totalCosteSS, costeTotal: calc.costeTotal,
        estado: 'borrador', notas: data.notas || null,
        lineas: { create: calc.lineas }
      },
      include: { empleado: true, lineas: { orderBy: { orden: 'asc' } } }
    })
    return { success: true, data: nomina }
  } catch (error: any) {
    if (error.code === 'P2002') return { success: false, error: 'duplicateNomina' }
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('nominas:confirmar', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const nomina = await cloudApi.nominas.confirmar(id)
      return { success: true, data: nomina }
    }
    const db = ctx.db

    const nomina = await db.nomina.findUnique({ where: { id }, include: { empleado: true, asiento: true } })
    if (!nomina) return { success: false, error: 'notFound' }
    if (nomina.estado !== 'borrador') return { success: false, error: 'alreadyConfirmed' }
    if (nomina.asiento) return { success: false, error: 'asientoAlreadyExists' }

    const year = nomina.anio
    let ejercicio = await db.ejercicioFiscal.findFirst({ where: { anio: year } })
    if (!ejercicio) {
      ejercicio = await db.ejercicioFiscal.create({
        data: { anio: year, fechaInicio: new Date(year, 0, 1), fechaFin: new Date(year, 11, 31, 23, 59, 59) }
      })
    }

    const cuenta640 = await db.cuentaContable.findFirst({ where: { codigo: '640' } })
    const cuenta642 = await db.cuentaContable.findFirst({ where: { codigo: '642' } })
    const cuenta4751 = await db.cuentaContable.findFirst({ where: { codigo: '4751' } })
    const cuenta476 = await db.cuentaContable.findFirst({ where: { codigo: '476' } })
    const cuenta465 = await db.cuentaContable.findFirst({ where: { codigo: '465' } })

    if (!cuenta640 || !cuenta642 || !cuenta4751 || !cuenta476 || !cuenta465) {
      return { success: false, error: 'missingAccounts' }
    }

    const totalSSWorker = Math.round((nomina.ccTrabajador + nomina.desempleoTrabajador + nomina.fpTrabajador) * 100) / 100
    const totalSSAll = Math.round((totalSSWorker + nomina.totalCosteSS) * 100) / 100

    const lineas = [
      { cuentaId: cuenta640.id, debe: nomina.totalDevengado, haber: 0, concepto: `Sueldos y salarios - ${nomina.empleado.nombre} ${nomina.empleado.apellidos}` },
      { cuentaId: cuenta642.id, debe: nomina.totalCosteSS, haber: 0, concepto: `SS empresa - ${nomina.empleado.nombre} ${nomina.empleado.apellidos}` },
      { cuentaId: cuenta4751.id, debe: 0, haber: nomina.irpfImporte, concepto: `Retención IRPF ${nomina.porcentajeIRPF}%` },
      { cuentaId: cuenta476.id, debe: 0, haber: totalSSAll, concepto: 'Org. SS acreedores' },
      { cuentaId: cuenta465.id, debe: 0, haber: nomina.liquidoPercibir, concepto: 'Remuneraciones pendientes de pago' },
    ]

    const lastAsiento = await db.asiento.findFirst({ where: { ejercicioId: ejercicio.id }, orderBy: { numero: 'desc' } })
    const monthStr = String(nomina.mes).padStart(2, '0')

    const asiento = await db.asiento.create({
      data: {
        numero: (lastAsiento?.numero || 0) + 1,
        fecha: new Date(nomina.anio, nomina.mes - 1, 28),
        descripcion: `Nómina ${monthStr}/${nomina.anio} - ${nomina.empleado.nombre} ${nomina.empleado.apellidos}`,
        tipo: 'nomina', documentoRef: `NOM-${monthStr}/${nomina.anio}`,
        nominaId: nomina.id, ejercicioId: ejercicio.id,
        lineas: { create: lineas }
      },
      include: { lineas: { include: { cuenta: true } }, ejercicio: true }
    })

    await db.nomina.update({ where: { id }, data: { estado: 'confirmada' } })
    return { success: true, data: asiento }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('nominas:marcarPagada', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const nomina = await cloudApi.nominas.marcarPagada(id)
      return { success: true, data: nomina }
    }
    const db = ctx.db
    const nomina = await db.nomina.update({ where: { id }, data: { estado: 'pagada', fechaPago: new Date() } })
    return { success: true, data: nomina }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('nominas:delete', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.nominas.delete(id)
      return { success: true }
    }
    const db = ctx.db
    const nomina = await db.nomina.findUnique({ where: { id }, include: { asiento: true } })
    if (!nomina) return { success: false, error: 'notFound' }
    if (nomina.estado !== 'borrador') return { success: false, error: 'cannotDeleteConfirmed' }
    await db.nomina.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - SEPA
// ============================================

ipcMain.handle('sepa:getLotes', async () => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const data = await cloudApi.sepa.getLotes()
      return { success: true, data }
    }
    const db = ctx.db
    const lotes = await db.loteSEPA.findMany({ orderBy: { fechaCreacion: 'desc' } })
    return { success: true, data: lotes }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('sepa:createLote', async (_, data: any) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const lote = await cloudApi.sepa.createLote(data)
      return { success: true, data: lote }
    }
    const db = ctx.db
    const lote = await db.loteSEPA.create({
      data: {
        tipo: data.tipo, referencia: data.referencia,
        fechaEjecucion: new Date(data.fechaEjecucion),
        ordenante: data.ordenante, ordenanteIBAN: data.ordenanteIBAN,
        ordenanteBIC: data.ordenanteBIC || null, ordenanteNIF: data.ordenanteNIF,
        idAcreedor: data.idAcreedor || null, numOperaciones: data.numOperaciones,
        importeTotal: data.importeTotal, xmlContent: data.xmlContent,
        notas: data.notas || null,
      }
    })
    return { success: true, data: lote }
  } catch (error: any) {
    if (error.code === 'P2002') return { success: false, error: 'duplicateReference' }
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('sepa:updateEstado', async (_, id: number, estado: string) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const lote = await cloudApi.sepa.updateEstado(id, estado)
      return { success: true, data: lote }
    }
    const db = ctx.db
    const lote = await db.loteSEPA.update({ where: { id }, data: { estado } })
    return { success: true, data: lote }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('sepa:deleteLote', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.sepa.deleteLote(id)
      return { success: true }
    }
    const db = ctx.db
    await db.loteSEPA.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - RRHH: Ausencias
// ============================================

ipcMain.handle('tiposAusencia:getAll', async () => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const data = await cloudApi.tiposAusencia.getAll()
      return { success: true, data }
    }
    const db = ctx.db
    const tipos = await db.tipoAusencia.findMany({ orderBy: { nombre: 'asc' } })
    return { success: true, data: tipos }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('tiposAusencia:create', async (_, data: any) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const tipo = await cloudApi.tiposAusencia.create(data)
      return { success: true, data: tipo }
    }
    const db = ctx.db
    const tipo = await db.tipoAusencia.create({
      data: {
        nombre: data.nombre, codigo: data.codigo,
        descontaSalario: data.descontaSalario ?? false,
        requiereAprobacion: data.requiereAprobacion ?? true,
        color: data.color || '#3B82F6', activo: data.activo ?? true,
      }
    })
    return { success: true, data: tipo }
  } catch (error: any) {
    if (error.code === 'P2002') return { success: false, error: 'duplicateName' }
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('tiposAusencia:update', async (_, id: number, data: any) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const tipo = await cloudApi.tiposAusencia.update(id, data)
      return { success: true, data: tipo }
    }
    const db = ctx.db
    const tipo = await db.tipoAusencia.update({
      where: { id },
      data: { nombre: data.nombre, codigo: data.codigo, descontaSalario: data.descontaSalario, requiereAprobacion: data.requiereAprobacion, color: data.color, activo: data.activo }
    })
    return { success: true, data: tipo }
  } catch (error: any) {
    if (error.code === 'P2002') return { success: false, error: 'duplicateName' }
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('tiposAusencia:delete', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.tiposAusencia.delete(id)
      return { success: true }
    }
    const db = ctx.db
    await db.tipoAusencia.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('ausencias:getAll', async (_, filters?: { empleadoId?: number; estado?: string; fechaDesde?: string; fechaHasta?: string }) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const data = await cloudApi.ausencias.getAll(filters)
      return { success: true, data }
    }
    const db = ctx.db
    const where: any = {}
    if (filters?.empleadoId) where.empleadoId = filters.empleadoId
    if (filters?.estado) where.estado = filters.estado
    if (filters?.fechaDesde || filters?.fechaHasta) {
      where.fechaInicio = {}
      if (filters?.fechaDesde) where.fechaInicio.gte = new Date(filters.fechaDesde)
      if (filters?.fechaHasta) where.fechaInicio.lte = new Date(filters.fechaHasta)
    }
    const ausencias = await db.ausencia.findMany({
      where, orderBy: { fechaInicio: 'desc' },
      include: { empleado: { select: { id: true, nombre: true, apellidos: true } }, tipoAusencia: true }
    })
    return { success: true, data: ausencias }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('ausencias:create', async (_, data: any) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const ausencia = await cloudApi.ausencias.create(data)
      return { success: true, data: ausencia }
    }
    const db = ctx.db
    const ausencia = await db.ausencia.create({
      data: {
        empleadoId: data.empleadoId, tipoAusenciaId: data.tipoAusenciaId,
        fechaInicio: new Date(data.fechaInicio), fechaFin: new Date(data.fechaFin),
        diasNaturales: data.diasNaturales, diasHabiles: data.diasHabiles,
        estado: data.estado || 'pendiente', notas: data.notas || null,
      },
      include: { empleado: { select: { id: true, nombre: true, apellidos: true } }, tipoAusencia: true }
    })
    return { success: true, data: ausencia }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('ausencias:updateEstado', async (_, id: number, estado: string) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const ausencia = await cloudApi.ausencias.updateEstado(id, estado)
      return { success: true, data: ausencia }
    }
    const db = ctx.db
    const ausencia = await db.ausencia.update({
      where: { id }, data: { estado },
      include: { empleado: { select: { id: true, nombre: true, apellidos: true } }, tipoAusencia: true }
    })
    return { success: true, data: ausencia }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('ausencias:delete', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.ausencias.delete(id)
      return { success: true }
    }
    const db = ctx.db
    await db.ausencia.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - RRHH: Control de Jornada
// ============================================

ipcMain.handle('jornada:getAll', async (_, filters?: { empleadoId?: number; fechaDesde?: string; fechaHasta?: string }) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const data = await cloudApi.jornada.getAll(filters)
      return { success: true, data }
    }
    const db = ctx.db
    const where: any = {}
    if (filters?.empleadoId) where.empleadoId = filters.empleadoId
    if (filters?.fechaDesde || filters?.fechaHasta) {
      where.fecha = {}
      if (filters?.fechaDesde) where.fecha.gte = new Date(filters.fechaDesde)
      if (filters?.fechaHasta) where.fecha.lte = new Date(filters.fechaHasta)
    }
    const registros = await db.registroJornada.findMany({
      where, orderBy: [{ fecha: 'desc' }],
      include: { empleado: { select: { id: true, nombre: true, apellidos: true } } }
    })
    return { success: true, data: registros }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('jornada:fichar', async (_, data: { empleadoId: number; tipo: 'entrada' | 'salida' }) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const registro = await cloudApi.jornada.fichar(data)
      return { success: true, data: registro }
    }
    const db = ctx.db
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    let registro = await db.registroJornada.findFirst({ where: { empleadoId: data.empleadoId, fecha: today } })

    if (data.tipo === 'entrada') {
      if (registro) {
        registro = await db.registroJornada.update({ where: { id: registro.id }, data: { horaEntrada: now } })
      } else {
        registro = await db.registroJornada.create({ data: { empleadoId: data.empleadoId, fecha: today, horaEntrada: now } })
      }
    } else {
      if (!registro) return { success: false, error: 'noEntryToday' }
      const horaEntrada = registro.horaEntrada ? new Date(registro.horaEntrada) : null
      let horasTrabajadas = 0
      if (horaEntrada) {
        horasTrabajadas = Math.round(((now.getTime() - horaEntrada.getTime()) / 3600000 - (registro.pausaMinutos || 0) / 60) * 100) / 100
      }
      const horasExtra = Math.max(0, Math.round((horasTrabajadas - 8) * 100) / 100)
      registro = await db.registroJornada.update({ where: { id: registro.id }, data: { horaSalida: now, horasTrabajadas, horasExtra } })
    }
    return { success: true, data: registro }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('jornada:update', async (_, id: number, data: any) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const registro = await cloudApi.jornada.update(id, data)
      return { success: true, data: registro }
    }
    const db = ctx.db
    const registro = await db.registroJornada.update({
      where: { id },
      data: {
        horaEntrada: data.horaEntrada ? new Date(data.horaEntrada) : undefined,
        horaSalida: data.horaSalida ? new Date(data.horaSalida) : undefined,
        pausaMinutos: data.pausaMinutos, horasTrabajadas: data.horasTrabajadas,
        horasExtra: data.horasExtra, tipoHorasExtra: data.tipoHorasExtra, notas: data.notas,
      }
    })
    return { success: true, data: registro }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('jornada:delete', async (_, id: number) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      await cloudApi.jornada.delete(id)
      return { success: true }
    }
    const db = ctx.db
    await db.registroJornada.delete({ where: { id } })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('jornada:resumenMensual', async (_, params: { mes: number; anio: number }) => {
  try {
    const ctx = requireAuthOrCloud()
    if (ctx.mode === 'cloud') {
      const data = await cloudApi.jornada.resumenMensual(params)
      return { success: true, data }
    }
    const db = ctx.db
    const fechaDesde = new Date(params.anio, params.mes - 1, 1)
    const fechaHasta = new Date(params.anio, params.mes, 0, 23, 59, 59)

    const empleados = await db.empleado.findMany({ where: { activo: true }, orderBy: [{ apellidos: 'asc' }, { nombre: 'asc' }] })
    const registros = await db.registroJornada.findMany({ where: { fecha: { gte: fechaDesde, lte: fechaHasta } } })

    const resumen = empleados.map(emp => {
      const regs = registros.filter(r => r.empleadoId === emp.id)
      const totalHoras = regs.reduce((s, r) => s + r.horasTrabajadas, 0)
      const totalExtra = regs.reduce((s, r) => s + r.horasExtra, 0)
      return {
        empleadoId: emp.id, nombre: `${emp.apellidos}, ${emp.nombre}`,
        diasTrabajados: regs.filter(r => r.horasTrabajadas > 0).length,
        totalHoras: Math.round(totalHoras * 100) / 100,
        totalHorasExtra: Math.round(totalExtra * 100) / 100,
      }
    })
    return { success: true, data: resumen }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================
// IPC Handlers - Test Runner
// ============================================

ipcMain.handle('testing:run', async () => {
  try {
    const projectRoot = app.isPackaged
      ? path.join(process.resourcesPath, '..')
      : path.join(__dirname, '..')

    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'

    return new Promise<any>((resolve) => {
      const child = spawn(npxCmd, ['vitest', 'run', '--reporter=verbose'], {
        cwd: projectRoot,
        shell: false,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      })

      let stdout = ''
      let stderr = ''
      let passCount = 0
      let failCount = 0
      let skipCount = 0
      const startTime = Date.now()

      // Strip ANSI escape sequences for reliable regex matching
      const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '')

      const sendOutput = (line: string) => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.webContents.send('testing:output', line)

        // Parse vitest verbose output for progress (strip ANSI first)
        const clean = stripAnsi(line)
        if (/^\s*[✓✔√]\s/.test(clean)) {
          passCount++
          mainWindow.webContents.send('testing:progress', { passed: passCount, failed: failCount, skipped: skipCount })
        } else if (/^\s*[✗✘×]\s/.test(clean)) {
          failCount++
          mainWindow.webContents.send('testing:progress', { passed: passCount, failed: failCount, skipped: skipCount })
        } else if (/^\s*[-⊘○]\s/.test(clean)) {
          skipCount++
          mainWindow.webContents.send('testing:progress', { passed: passCount, failed: failCount, skipped: skipCount })
        }
      }

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        stdout += text
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.trim()) sendOutput(line)
        }
      })

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        stderr += text
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.trim()) sendOutput(line)
        }
      })

      child.on('close', (code) => {
        // Compute elapsed time directly (most reliable)
        const elapsedMs = Date.now() - startTime
        const elapsed = elapsedMs >= 1000
          ? `${(elapsedMs / 1000).toFixed(2)}s`
          : `${elapsedMs}ms`

        // Also try to parse vitest's own Duration from stdout+stderr as fallback
        const cleanOutput = stripAnsi(stdout + '\n' + stderr)
        const durationMatch = cleanOutput.match(/Duration\s+([\d.]+\s*(?:ms|s|m))/i)

        const duration = elapsed || durationMatch?.[1] || null

        // Parse vitest summary counts as fallback when line-by-line counting missed results
        const passedSummary = cleanOutput.match(/(\d+)\s+passed/i)
        const failedSummary = cleanOutput.match(/(\d+)\s+failed/i)
        const skippedSummary = cleanOutput.match(/(\d+)\s+skipped/i)
        const finalPassed = passCount || (passedSummary ? parseInt(passedSummary[1], 10) : 0)
        const finalFailed = failCount || (failedSummary ? parseInt(failedSummary[1], 10) : 0)
        const finalSkipped = skipCount || (skippedSummary ? parseInt(skippedSummary[1], 10) : 0)

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('testing:complete', {
            exitCode: code,
            passed: finalPassed,
            failed: finalFailed,
            skipped: finalSkipped,
            duration,
          })
        }

        resolve({
          success: true,
          data: {
            exitCode: code,
            passed: finalPassed,
            failed: finalFailed,
            skipped: finalSkipped,
            duration,
          }
        })
      })

      child.on('error', (err) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('testing:output', `[ERROR] ${err.message}`)
          mainWindow.webContents.send('testing:complete', {
            exitCode: 1,
            passed: passCount,
            failed: failCount,
            skipped: skipCount,
            duration: null,
          })
        }
        resolve({ success: false, error: err.message })
      })
    })
  } catch (error) {
    return { success: false, error: String(error) }
  }
})
