/// <reference types="vite/client" />

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

interface AuthStatus {
  isConfigured: boolean
  hasEncryptedDb: boolean
  isAuthenticated: boolean
  passkeySupported: boolean
  passkeyEnabled: boolean
}

interface EmpresaInfo {
  id: string
  nombre: string
  dataPath: string | null
  creadaEn: string
}

interface EmpresaListResult {
  empresas: EmpresaInfo[]
  ultimaEmpresaId: string | null
  needsMigration: boolean
}

interface EmpresaSelectResult {
  empresa: EmpresaInfo
  authStatus: AuthStatus
}

interface Cliente {
  id: number
  nombre: string
  email?: string | null
  telefono?: string | null
  direccion?: string | null
  ciudad?: string | null
  codigoPostal?: string | null
  provincia?: string | null
  pais: string
  nif?: string | null
  notas?: string | null
  activo: boolean
  createdAt: Date
  updatedAt: Date
  facturas?: Factura[]
}

interface Producto {
  id: number
  codigo?: string | null
  nombre: string
  descripcion?: string | null
  tipo: string
  precioBase: number
  impuestoId?: number | null
  impuesto?: Impuesto | null
  retencionId?: number | null
  retencion?: Impuesto | null
  activo: boolean
  createdAt: Date
  updatedAt: Date
}

interface Impuesto {
  id: number
  nombre: string
  porcentaje: number
  tipo: string
  activo: boolean
  porDefecto: boolean
  createdAt: Date
  updatedAt: Date
}

interface Factura {
  id: number
  numero: string
  serie: string
  fecha: Date
  fechaVencimiento?: Date | null
  clienteId: number
  cliente?: Cliente
  subtotal: number
  totalImpuestos: number
  totalRetenciones: number
  total: number
  estado: string
  notas?: string | null
  formaPago?: string | null
  createdAt: Date
  updatedAt: Date
  lineas?: LineaFactura[]
}

interface LineaFactura {
  id: number
  facturaId: number
  productoId?: number | null
  producto?: Producto | null
  descripcion: string
  cantidad: number
  precioUnit: number
  descuento: number
  impuestoId?: number | null
  impuesto?: Impuesto | null
  retencionId?: number | null
  retencion?: Impuesto | null
  subtotal: number
  totalImpuesto: number
  totalRetencion: number
  total: number
}

interface CategoriaGasto {
  id: number
  nombre: string
  color: string
  icono: string
  activo: boolean
  createdAt: Date
  updatedAt: Date
}

interface AdjuntoGasto {
  id: number
  gastoId: number
  nombreOriginal: string
  nombreEncriptado: string
  tipoMime: string
  tamano: number
  createdAt: Date
}

interface Gasto {
  id: number
  descripcion: string
  categoriaId?: number | null
  categoria?: CategoriaGasto | null
  monto: number
  impuestoIncluido: boolean
  impuestoId?: number | null
  impuesto?: Impuesto | null
  fecha: Date
  proveedor?: string | null
  numeroFactura?: string | null
  notas?: string | null
  createdAt: Date
  updatedAt: Date
  adjuntos?: AdjuntoGasto[]
}

interface CuentaContable {
  id: number
  codigo: string
  nombre: string
  tipo: string
  grupo: number
  nivel: number
  cuentaPadreId?: number | null
  cuentaPadre?: CuentaContable | null
  subcuentas?: CuentaContable[]
  activo: boolean
  esSistema: boolean
  createdAt: Date
  updatedAt: Date
}

interface EjercicioFiscal {
  id: number
  anio: number
  fechaInicio: Date
  fechaFin: Date
  estado: string
  createdAt: Date
  updatedAt: Date
}

interface LineaAsiento {
  id: number
  asientoId: number
  cuentaId: number
  cuenta?: CuentaContable
  debe: number
  haber: number
  concepto?: string | null
}

interface Asiento {
  id: number
  numero: number
  fecha: Date
  descripcion: string
  tipo: string
  documentoRef?: string | null
  facturaId?: number | null
  factura?: Factura | null
  gastoId?: number | null
  gasto?: Gasto | null
  ejercicioId: number
  ejercicio?: EjercicioFiscal
  createdAt: Date
  updatedAt: Date
  lineas?: LineaAsiento[]
}

interface LibroMayorData {
  cuenta: CuentaContable
  movimientos: (LineaAsiento & { saldo: number })[]
  totalDebe: number
  totalHaber: number
  saldoFinal: number
}

interface Modelo303Data {
  trimestre: number
  anio: number
  periodo: string
  fechaDesde: string
  fechaHasta: string
  ivaDevengado: number
  ivaDeducible: number
  resultado: number
  aIngresar: number
  aCompensar: number
  desgloseDevengado: Record<string, { base: number; cuota: number }>
  desgloseDeducible: Record<string, { base: number; cuota: number }>
}

interface Modelo111Data {
  trimestre: number
  anio: number
  periodo: string
  totalRetenciones: number
  numPerceptores: number
  baseRetenciones: number
}

interface Modelo390Data {
  anio: number
  trimestres: Array<{
    trimestre: number
    devengado: number
    deducible: number
    resultado: number
  }>
  totalDevengado: number
  totalDeducible: number
  resultado: number
}

interface EjercicioStats {
  ejercicio: EjercicioFiscal
  totalAsientos: number
  totalDebe: number
  totalHaber: number
  asientosPorTipo: Record<string, number>
  totalFacturado: number
  facturasPagadas: number
  facturasPendientes: number
  totalFacturas: number
  totalGastos: number
  numGastos: number
  resultado: number
}

interface DashboardStats {
  clientesActivos: number
  ingresosTotales: number
  facturasPendientesCount: number
  facturasPendientesTotal: number
  gastosTotales: number
  balanceNeto: number
  facturasEmitidas: number
  gastosRegistrados: number
}

interface RecentActivity {
  id: number
  tipo: 'factura' | 'gasto' | 'cliente' | 'producto'
  descripcion: string
  monto?: number
  fecha: Date
}

// Buzón de correo types
interface CuentaEmail {
  id: number
  nombre: string
  email: string
  imapHost: string
  imapPort: number
  imapSecure: number
  imapUser: string
  smtpHost: string
  smtpPort: number
  smtpSecure: number
  smtpUser: string
  fromName: string
  activo: number
  createdAt: string
  updatedAt: string
}

interface CarpetaEmail {
  id: number
  cuentaId: number
  path: string
  nombre: string
  specialUse: string | null
  totalMessages: number
  unseenMessages: number
  syncedAt: string | null
}

interface CorreoCache {
  id: number
  cuentaId: number
  carpetaId: number
  uid: number
  messageId: string | null
  fromAddress: string | null
  fromName: string | null
  toAddress: string | null
  subject: string | null
  fecha: string | null
  hasAttachments: number
  seen: number
  flagged: number
  size: number
  syncedAt: string
}

interface CorreoCompleto {
  uid: number
  messageId: string
  from: Array<{ address: string; name: string }>
  to: Array<{ address: string; name: string }>
  cc: Array<{ address: string; name: string }>
  subject: string
  date: string
  html: string
  text: string
  attachments: Array<{ index: number; filename: string; contentType: string; size: number }>
}

interface CorreoListResult {
  messages: CorreoCache[]
  total: number
  page: number
  pageSize: number
}

interface BuzonSendData {
  to: string
  cc?: string
  subject: string
  html: string
  text: string
  inReplyTo?: string
  references?: string
  attachments?: Array<{ filename: string; data: number[] }>
}

// Cloud types
interface CloudBackup {
  id: number
  original_filename: string
  size_bytes: number
  checksum_sha256: string
  encryption_metadata: Record<string, any>
  notes: string | null
  uploaded_at: string
  created_at: string
}

interface CloudPlan {
  name: string
  slug: string
  max_backups: number
  max_storage_bytes: number
}

interface CloudUsage {
  backup_count: number
  max_backups: number
  unlimited_backups: boolean
  backups_remaining: number | null
  storage_used_bytes: number
  max_storage_bytes: number
  storage_remaining_bytes: number
}

interface CloudUser {
  id: number
  name: string
  email: string
}

interface CloudLicense {
  has_license: boolean
  purchased_at: string | null
}

interface ElectronAPI {
  testDB: () => Promise<{ success: boolean; message: string }>

  empresa: {
    list: () => Promise<ApiResponse<EmpresaListResult>>
    create: (data: { nombre: string; customDataPath?: string }) => Promise<ApiResponse<EmpresaInfo>>
    select: (id: string) => Promise<ApiResponse<EmpresaSelectResult>>
    rename: (id: string, nombre: string) => Promise<ApiResponse<void>>
    delete: (id: string) => Promise<ApiResponse<void>>
    getActive: () => Promise<ApiResponse<EmpresaInfo | null>>
    getDefaultPath: () => Promise<ApiResponse<{ path: string }>>
    detectVolumes: () => Promise<ApiResponse<{ name: string; path: string; available: boolean }[]>>
    selectDirectory: () => Promise<ApiResponse<{ path: string } | null>>
  }

  auth: {
    checkStatus: () => Promise<ApiResponse<AuthStatus>>
    setup: (password: string) => Promise<ApiResponse<void>>
    unlock: (password: string) => Promise<ApiResponse<void>>
    lock: () => Promise<ApiResponse<void>>
    changePassword: (currentPassword: string, newPassword: string) => Promise<ApiResponse<void>>
    setupPasskey: (password: string) => Promise<ApiResponse<void>>
    unlockWithPasskey: () => Promise<ApiResponse<void>>
    disablePasskey: () => Promise<ApiResponse<void>>
  }

  clientes: {
    getAll: () => Promise<ApiResponse<Cliente[]>>
    getById: (id: number) => Promise<ApiResponse<Cliente>>
    create: (data: Partial<Cliente>) => Promise<ApiResponse<Cliente>>
    update: (id: number, data: Partial<Cliente>) => Promise<ApiResponse<Cliente>>
    delete: (id: number) => Promise<ApiResponse<void>>
  }

  productos: {
    getAll: () => Promise<ApiResponse<Producto[]>>
    getById: (id: number) => Promise<ApiResponse<Producto>>
    create: (data: Partial<Producto>) => Promise<ApiResponse<Producto>>
    update: (id: number, data: Partial<Producto>) => Promise<ApiResponse<Producto>>
    delete: (id: number) => Promise<ApiResponse<void>>
  }

  impuestos: {
    getAll: () => Promise<ApiResponse<Impuesto[]>>
    getById: (id: number) => Promise<ApiResponse<Impuesto>>
    create: (data: Partial<Impuesto>) => Promise<ApiResponse<Impuesto>>
    update: (id: number, data: Partial<Impuesto>) => Promise<ApiResponse<Impuesto>>
    delete: (id: number) => Promise<ApiResponse<void>>
    setDefault: (id: number) => Promise<ApiResponse<void>>
  }

  facturas: {
    getAll: () => Promise<ApiResponse<Factura[]>>
    getById: (id: number) => Promise<ApiResponse<Factura>>
    create: (data: any) => Promise<ApiResponse<Factura>>
    update: (id: number, data: Partial<Factura>) => Promise<ApiResponse<Factura>>
    delete: (id: number) => Promise<ApiResponse<void>>
    getNextNumber: (serie?: string) => Promise<ApiResponse<string>>
    updateEstado: (id: number, estado: string) => Promise<ApiResponse<Factura>>
  }

  categoriasGasto: {
    getAll: () => Promise<ApiResponse<CategoriaGasto[]>>
    create: (data: Partial<CategoriaGasto>) => Promise<ApiResponse<CategoriaGasto>>
    update: (id: number, data: Partial<CategoriaGasto>) => Promise<ApiResponse<CategoriaGasto>>
    delete: (id: number) => Promise<ApiResponse<void>>
  }

  gastos: {
    getAll: () => Promise<ApiResponse<Gasto[]>>
    getById: (id: number) => Promise<ApiResponse<Gasto>>
    create: (data: Partial<Gasto>) => Promise<ApiResponse<Gasto>>
    update: (id: number, data: Partial<Gasto>) => Promise<ApiResponse<Gasto>>
    delete: (id: number) => Promise<ApiResponse<void>>
  }

  config: {
    getAll: () => Promise<ApiResponse<Record<string, string>>>
    get: (clave: string) => Promise<ApiResponse<string | null>>
    set: (clave: string, valor: string) => Promise<ApiResponse<any>>
    delete: (clave: string) => Promise<ApiResponse<void>>
  }

  dashboard: {
    getStats: () => Promise<ApiResponse<DashboardStats>>
    getRecentActivity: () => Promise<ApiResponse<RecentActivity[]>>
    getPendingInvoices: () => Promise<ApiResponse<Factura[]>>
  }

  adjuntos: {
    upload: (gastoId: number, fileData: { data: number[]; nombre: string; tipoMime: string; tamano: number }) => Promise<ApiResponse<AdjuntoGasto>>
    download: (adjuntoId: number) => Promise<ApiResponse<{ nombre: string; tipoMime: string; data: number[] }>>
    delete: (adjuntoId: number) => Promise<ApiResponse<void>>
    getByGastoId: (gastoId: number) => Promise<ApiResponse<AdjuntoGasto[]>>
  }

  cuentas: {
    getAll: () => Promise<ApiResponse<CuentaContable[]>>
    getById: (id: number) => Promise<ApiResponse<CuentaContable>>
    create: (data: any) => Promise<ApiResponse<CuentaContable>>
    update: (id: number, data: any) => Promise<ApiResponse<CuentaContable>>
    delete: (id: number) => Promise<ApiResponse<void>>
    seedPGC: () => Promise<ApiResponse<{ seeded: boolean; count?: number; message?: string }>>
  }

  ejercicios: {
    getAll: () => Promise<ApiResponse<EjercicioFiscal[]>>
    create: (data: { anio: number }) => Promise<ApiResponse<EjercicioFiscal>>
    getOrCreateCurrent: () => Promise<ApiResponse<EjercicioFiscal>>
    update: (id: number, data: { estado: string }) => Promise<ApiResponse<EjercicioFiscal>>
    delete: (id: number) => Promise<ApiResponse<void>>
    getStats: (id: number) => Promise<ApiResponse<EjercicioStats>>
  }

  asientos: {
    getAll: (filters?: { ejercicioId?: number; tipo?: string; fechaDesde?: string; fechaHasta?: string }) => Promise<ApiResponse<Asiento[]>>
    getById: (id: number) => Promise<ApiResponse<Asiento>>
    create: (data: any) => Promise<ApiResponse<Asiento>>
    update: (id: number, data: any) => Promise<ApiResponse<Asiento>>
    delete: (id: number) => Promise<ApiResponse<void>>
  }

  contabilidad: {
    libroMayor: (params: { cuentaId: number; ejercicioId: number; fechaDesde?: string; fechaHasta?: string }) => Promise<ApiResponse<LibroMayorData>>
    generarAsientoFactura: (facturaId: number) => Promise<ApiResponse<Asiento>>
    generarAsientoGasto: (gastoId: number) => Promise<ApiResponse<Asiento>>
  }

  modelos: {
    modelo303: (params: { ejercicioId: number; trimestre: number }) => Promise<ApiResponse<Modelo303Data>>
    modelo111: (params: { ejercicioId: number; trimestre: number }) => Promise<ApiResponse<Modelo111Data>>
    modelo390: (params: { ejercicioId: number }) => Promise<ApiResponse<Modelo390Data>>
  }

  export: {
    saveFile: (data: { content: string; defaultFilename: string; filters: Array<{ name: string; extensions: string[] }> }) => Promise<ApiResponse<{ path: string }>>
  }

  backup: {
    export: () => Promise<ApiResponse<{ path: string; size: number }>>
    import: () => Promise<ApiResponse<{ metadata: any; message: string }>>
    getDataPath: () => Promise<ApiResponse<{
      dataPath: string
      dbPath: string
      attachmentsPath: string
      dbSize: number
      attachmentsSize: number
      attachmentsCount: number
      customDataPath: string | null
      defaultDataPath: string
      isUsingCustomPath: boolean
    }>>
    migrate: () => Promise<ApiResponse<{ path: string; size: number; message: string }>>
    resetToDefault: () => Promise<ApiResponse<{ path: string; message: string }>>
  }

  cloud: {
    configure: (data: { serverUrl: string; token: string }) => Promise<ApiResponse<{ user: CloudUser }>>
    getConfig: () => Promise<ApiResponse<{ serverUrl?: string; token?: string; user?: CloudUser; license?: CloudLicense } | null>>
    disconnect: () => Promise<ApiResponse<void>>
    checkAuth: () => Promise<ApiResponse<{ user: CloudUser }>>
    listBackups: (page?: number) => Promise<ApiResponse<{ backups: CloudBackup[]; meta: { current_page: number; last_page: number; total: number } }>>
    upload: (notes?: string) => Promise<ApiResponse<CloudBackup>>
    download: (backupId: number) => Promise<ApiResponse<{ path: string }>>
    import: (backupId: number) => Promise<ApiResponse<{ message: string }>>
    delete: (backupId: number) => Promise<ApiResponse<void>>
    plan: () => Promise<ApiResponse<{ plan: CloudPlan; usage: CloudUsage; license: CloudLicense }>>
    licenseCheckout: () => Promise<ApiResponse<{ checkout_url: string }>>
    onUploadProgress: (callback: (percent: number) => void) => () => void
    onDownloadProgress: (callback: (percent: number) => void) => () => void
    confirmDeviceLink: (data: { token: string; server: string; deviceName?: string }) => Promise<ApiResponse<any>>
    verifyCode: (data: { code: string; server: string; deviceName?: string }) => Promise<ApiResponse<{ api_token: string; user: CloudUser }>>
    onDeepLinkConnected: (callback: (data: { success: boolean; user?: CloudUser; server?: string; error?: string }) => void) => () => void
  }

  logo: {
    upload: (fileData: { data: number[]; nombre: string; tipoMime: string }) => Promise<ApiResponse<{ path: string }>>
    read: () => Promise<ApiResponse<{ data: number[]; tipoMime: string }>>
    delete: () => Promise<ApiResponse<void>>
  }

  email: {
    saveConfig: (data: { host: string; port: number; secure: boolean; user: string; pass?: string; fromName: string; fromEmail: string }) => Promise<ApiResponse<void>>
    test: () => Promise<ApiResponse<void>>
    send: (data: { to: string; cc?: string; subject: string; body: string; attachmentName?: string; attachmentBase64?: string }) => Promise<ApiResponse<void>>
  }

  shell: {
    openExternal: (url: string) => Promise<ApiResponse<void>>
  }

  buzon: {
    addAccount: (data: any) => Promise<ApiResponse<CuentaEmail>>
    updateAccount: (id: number, data: any) => Promise<ApiResponse<CuentaEmail>>
    deleteAccount: (id: number) => Promise<ApiResponse<void>>
    listAccounts: () => Promise<ApiResponse<CuentaEmail[]>>
    testConnection: (id: number) => Promise<ApiResponse<void>>
    syncFolders: (cuentaId: number) => Promise<ApiResponse<CarpetaEmail[]>>
    listFolders: (cuentaId: number) => Promise<ApiResponse<CarpetaEmail[]>>
    syncMessages: (cuentaId: number, carpetaId: number) => Promise<ApiResponse<void>>
    listMessages: (cuentaId: number, carpetaId: number, page?: number, pageSize?: number) => Promise<ApiResponse<CorreoListResult>>
    getMessage: (cuentaId: number, carpetaId: number, uid: number) => Promise<ApiResponse<CorreoCompleto>>
    downloadAttachment: (cuentaId: number, carpetaId: number, uid: number, attachmentIndex: number) => Promise<ApiResponse<any>>
    markRead: (cuentaId: number, carpetaId: number, uid: number) => Promise<ApiResponse<void>>
    markUnread: (cuentaId: number, carpetaId: number, uid: number) => Promise<ApiResponse<void>>
    deleteMessage: (cuentaId: number, carpetaId: number, uid: number) => Promise<ApiResponse<void>>
    moveMessage: (cuentaId: number, carpetaId: number, uid: number, destPath: string) => Promise<ApiResponse<void>>
    sendEmail: (cuentaId: number, data: BuzonSendData) => Promise<ApiResponse<void>>
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
