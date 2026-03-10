import { contextBridge, ipcRenderer } from 'electron'

// Tipos para los datos
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

// API expuesta al renderer
const electronAPI = {
  // Test de conexión
  testDB: () => ipcRenderer.invoke('db:test') as Promise<{ success: boolean; message: string }>,

  // Empresas
  empresa: {
    list: () => ipcRenderer.invoke('empresa:list') as Promise<ApiResponse<any>>,
    create: (data: { nombre: string; customDataPath?: string; tipo?: 'local' | 'cloud'; passphrase?: string }) => ipcRenderer.invoke('empresa:create', data) as Promise<ApiResponse<any>>,
    select: (id: string) => ipcRenderer.invoke('empresa:select', id) as Promise<ApiResponse<any>>,
    rename: (id: string, nombre: string) => ipcRenderer.invoke('empresa:rename', id, nombre) as Promise<ApiResponse<void>>,
    delete: (id: string) => ipcRenderer.invoke('empresa:delete', id) as Promise<ApiResponse<void>>,
    getActive: () => ipcRenderer.invoke('empresa:getActive') as Promise<ApiResponse<any>>,
    getDefaultPath: () => ipcRenderer.invoke('empresa:getDefaultPath') as Promise<ApiResponse<{ path: string }>>,
    detectVolumes: () => ipcRenderer.invoke('empresa:detectVolumes') as Promise<ApiResponse<{ name: string; path: string; available: boolean }[]>>,
    selectDirectory: () => ipcRenderer.invoke('empresa:selectDirectory') as Promise<ApiResponse<{ path: string } | null>>,
    joinCloud: (data: { code: string; passphrase: string }) =>
      ipcRenderer.invoke('empresa:joinCloud', data) as Promise<ApiResponse<any>>,
    listCloud: () => ipcRenderer.invoke('empresa:listCloud') as Promise<ApiResponse<any>>,
    addCloudLocal: (data: { empresaId: number; salt: string; verificationHash: string; role: string; passphrase: string }) =>
      ipcRenderer.invoke('empresa:addCloudLocal', data) as Promise<ApiResponse<any>>,
  },

  // Autenticación
  auth: {
    checkStatus: () => ipcRenderer.invoke('auth:checkStatus') as Promise<ApiResponse<AuthStatus>>,
    setup: (password: string) => ipcRenderer.invoke('auth:setup', password) as Promise<ApiResponse<void>>,
    unlock: (password: string) => ipcRenderer.invoke('auth:unlock', password) as Promise<ApiResponse<void>>,
    unlockCloud: (passphrase: string) => ipcRenderer.invoke('auth:unlockCloud', passphrase) as Promise<ApiResponse<void>>,
    lock: () => ipcRenderer.invoke('auth:lock') as Promise<ApiResponse<void>>,
    changePassword: (currentPassword: string, newPassword: string) =>
      ipcRenderer.invoke('auth:changePassword', currentPassword, newPassword) as Promise<ApiResponse<void>>,
    setupPasskey: (password: string) =>
      ipcRenderer.invoke('auth:setupPasskey', password) as Promise<ApiResponse<void>>,
    unlockWithPasskey: () =>
      ipcRenderer.invoke('auth:unlockWithPasskey') as Promise<ApiResponse<void>>,
    disablePasskey: () =>
      ipcRenderer.invoke('auth:disablePasskey') as Promise<ApiResponse<void>>,
  },

  // Clientes
  clientes: {
    getAll: () => ipcRenderer.invoke('clientes:getAll') as Promise<ApiResponse<any[]>>,
    getById: (id: number) => ipcRenderer.invoke('clientes:getById', id) as Promise<ApiResponse<any>>,
    create: (data: any) => ipcRenderer.invoke('clientes:create', data) as Promise<ApiResponse<any>>,
    update: (id: number, data: any) => ipcRenderer.invoke('clientes:update', id, data) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('clientes:delete', id) as Promise<ApiResponse<void>>,
  },

  // Productos
  productos: {
    getAll: () => ipcRenderer.invoke('productos:getAll') as Promise<ApiResponse<any[]>>,
    getById: (id: number) => ipcRenderer.invoke('productos:getById', id) as Promise<ApiResponse<any>>,
    create: (data: any) => ipcRenderer.invoke('productos:create', data) as Promise<ApiResponse<any>>,
    update: (id: number, data: any) => ipcRenderer.invoke('productos:update', id, data) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('productos:delete', id) as Promise<ApiResponse<void>>,
  },

  // Impuestos
  impuestos: {
    getAll: () => ipcRenderer.invoke('impuestos:getAll') as Promise<ApiResponse<any[]>>,
    getById: (id: number) => ipcRenderer.invoke('impuestos:getById', id) as Promise<ApiResponse<any>>,
    create: (data: any) => ipcRenderer.invoke('impuestos:create', data) as Promise<ApiResponse<any>>,
    update: (id: number, data: any) => ipcRenderer.invoke('impuestos:update', id, data) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('impuestos:delete', id) as Promise<ApiResponse<void>>,
    setDefault: (id: number) => ipcRenderer.invoke('impuestos:setDefault', id) as Promise<ApiResponse<void>>,
  },

  // Facturas
  facturas: {
    getAll: () => ipcRenderer.invoke('facturas:getAll') as Promise<ApiResponse<any[]>>,
    getById: (id: number) => ipcRenderer.invoke('facturas:getById', id) as Promise<ApiResponse<any>>,
    create: (data: any) => ipcRenderer.invoke('facturas:create', data) as Promise<ApiResponse<any>>,
    update: (id: number, data: any) => ipcRenderer.invoke('facturas:update', id, data) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('facturas:delete', id) as Promise<ApiResponse<void>>,
    getNextNumber: (serie?: string) => ipcRenderer.invoke('facturas:getNextNumber', serie) as Promise<ApiResponse<string>>,
    updateEstado: (id: number, estado: string) => ipcRenderer.invoke('facturas:updateEstado', id, estado) as Promise<ApiResponse<any>>,
  },

  // Categorías de Gasto
  categoriasGasto: {
    getAll: () => ipcRenderer.invoke('categoriasGasto:getAll') as Promise<ApiResponse<any[]>>,
    create: (data: any) => ipcRenderer.invoke('categoriasGasto:create', data) as Promise<ApiResponse<any>>,
    update: (id: number, data: any) => ipcRenderer.invoke('categoriasGasto:update', id, data) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('categoriasGasto:delete', id) as Promise<ApiResponse<void>>,
  },

  // Gastos
  gastos: {
    getAll: () => ipcRenderer.invoke('gastos:getAll') as Promise<ApiResponse<any[]>>,
    getById: (id: number) => ipcRenderer.invoke('gastos:getById', id) as Promise<ApiResponse<any>>,
    create: (data: any) => ipcRenderer.invoke('gastos:create', data) as Promise<ApiResponse<any>>,
    update: (id: number, data: any) => ipcRenderer.invoke('gastos:update', id, data) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('gastos:delete', id) as Promise<ApiResponse<void>>,
  },

  // Adjuntos de Gastos
  adjuntos: {
    upload: (gastoId: number, fileData: { data: number[]; nombre: string; tipoMime: string; tamano: number }) =>
      ipcRenderer.invoke('adjuntos:upload', gastoId, fileData) as Promise<ApiResponse<any>>,
    download: (adjuntoId: number) =>
      ipcRenderer.invoke('adjuntos:download', adjuntoId) as Promise<ApiResponse<{ nombre: string; tipoMime: string; data: number[] }>>,
    delete: (adjuntoId: number) =>
      ipcRenderer.invoke('adjuntos:delete', adjuntoId) as Promise<ApiResponse<void>>,
    getByGastoId: (gastoId: number) =>
      ipcRenderer.invoke('adjuntos:getByGastoId', gastoId) as Promise<ApiResponse<any[]>>,
  },

  // Configuración
  config: {
    getAll: () => ipcRenderer.invoke('config:getAll') as Promise<ApiResponse<Record<string, string>>>,
    get: (clave: string) => ipcRenderer.invoke('config:get', clave) as Promise<ApiResponse<string | null>>,
    set: (clave: string, valor: string) => ipcRenderer.invoke('config:set', clave, valor) as Promise<ApiResponse<any>>,
    delete: (clave: string) => ipcRenderer.invoke('config:delete', clave) as Promise<ApiResponse<void>>,
  },

  // Dashboard
  dashboard: {
    getStats: () => ipcRenderer.invoke('dashboard:getStats') as Promise<ApiResponse<DashboardStats>>,
    getRecentActivity: () => ipcRenderer.invoke('dashboard:getRecentActivity') as Promise<ApiResponse<any[]>>,
    getPendingInvoices: () => ipcRenderer.invoke('dashboard:getPendingInvoices') as Promise<ApiResponse<any[]>>,
  },

  // Cuentas Contables
  cuentas: {
    getAll: () => ipcRenderer.invoke('cuentas:getAll') as Promise<ApiResponse<any[]>>,
    getById: (id: number) => ipcRenderer.invoke('cuentas:getById', id) as Promise<ApiResponse<any>>,
    create: (data: any) => ipcRenderer.invoke('cuentas:create', data) as Promise<ApiResponse<any>>,
    update: (id: number, data: any) => ipcRenderer.invoke('cuentas:update', id, data) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('cuentas:delete', id) as Promise<ApiResponse<void>>,
    seedPGC: () => ipcRenderer.invoke('cuentas:seedPGC') as Promise<ApiResponse<any>>,
  },

  // Ejercicios Fiscales
  ejercicios: {
    getAll: () => ipcRenderer.invoke('ejercicios:getAll') as Promise<ApiResponse<any[]>>,
    create: (data: any) => ipcRenderer.invoke('ejercicios:create', data) as Promise<ApiResponse<any>>,
    getOrCreateCurrent: () => ipcRenderer.invoke('ejercicios:getOrCreateCurrent') as Promise<ApiResponse<any>>,
    update: (id: number, data: any) => ipcRenderer.invoke('ejercicios:update', id, data) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('ejercicios:delete', id) as Promise<ApiResponse<void>>,
    getStats: (id: number) => ipcRenderer.invoke('ejercicios:getStats', id) as Promise<ApiResponse<any>>,
  },

  // Asientos Contables
  asientos: {
    getAll: (filters?: any) => ipcRenderer.invoke('asientos:getAll', filters) as Promise<ApiResponse<any[]>>,
    getById: (id: number) => ipcRenderer.invoke('asientos:getById', id) as Promise<ApiResponse<any>>,
    create: (data: any) => ipcRenderer.invoke('asientos:create', data) as Promise<ApiResponse<any>>,
    update: (id: number, data: any) => ipcRenderer.invoke('asientos:update', id, data) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('asientos:delete', id) as Promise<ApiResponse<void>>,
  },

  // Contabilidad (Libros + Auto-generación)
  contabilidad: {
    libroMayor: (params: any) => ipcRenderer.invoke('contabilidad:libroMayor', params) as Promise<ApiResponse<any>>,
    generarAsientoFactura: (facturaId: number) => ipcRenderer.invoke('contabilidad:generarAsientoFactura', facturaId) as Promise<ApiResponse<any>>,
    generarAsientoGasto: (gastoId: number) => ipcRenderer.invoke('contabilidad:generarAsientoGasto', gastoId) as Promise<ApiResponse<any>>,
  },

  // Modelos de Hacienda
  modelos: {
    modelo303: (params: any) => ipcRenderer.invoke('modelos:modelo303', params) as Promise<ApiResponse<any>>,
    modelo111: (params: any) => ipcRenderer.invoke('modelos:modelo111', params) as Promise<ApiResponse<any>>,
    modelo390: (params: any) => ipcRenderer.invoke('modelos:modelo390', params) as Promise<ApiResponse<any>>,
  },

  // Exportar datos a archivo
  export: {
    saveFile: (data: { content: string; defaultFilename: string; filters: Array<{ name: string; extensions: string[] }> }) =>
      ipcRenderer.invoke('export:saveFile', data) as Promise<ApiResponse<{ path: string }>>,
  },

  // Backup/Export/Import
  backup: {
    export: () => ipcRenderer.invoke('backup:export') as Promise<ApiResponse<{ path: string; size: number }>>,
    import: () => ipcRenderer.invoke('backup:import') as Promise<ApiResponse<{ metadata: any; message: string }>>,
    getDataPath: () => ipcRenderer.invoke('backup:getDataPath') as Promise<ApiResponse<{
      dataPath: string;
      dbPath: string;
      attachmentsPath: string;
      dbSize: number;
      attachmentsSize: number;
      attachmentsCount: number;
      customDataPath: string | null;
      defaultDataPath: string;
      isUsingCustomPath: boolean;
    }>>,
    migrate: () => ipcRenderer.invoke('backup:migrate') as Promise<ApiResponse<{ path: string; size: number; message: string }>>,
    resetToDefault: () => ipcRenderer.invoke('backup:resetToDefault') as Promise<ApiResponse<{ path: string; message: string }>>,
  },

  // Cloud Backup
  cloud: {
    configure: (data: { serverUrl: string; token: string }) =>
      ipcRenderer.invoke('cloud:configure', data) as Promise<ApiResponse<any>>,
    getConfig: () =>
      ipcRenderer.invoke('cloud:getConfig') as Promise<ApiResponse<any>>,
    disconnect: () =>
      ipcRenderer.invoke('cloud:disconnect') as Promise<ApiResponse<void>>,
    checkAuth: () =>
      ipcRenderer.invoke('cloud:checkAuth') as Promise<ApiResponse<any>>,
    listBackups: (page?: number) =>
      ipcRenderer.invoke('cloud:listBackups', page) as Promise<ApiResponse<any>>,
    upload: (notes?: string) =>
      ipcRenderer.invoke('cloud:upload', notes) as Promise<ApiResponse<any>>,
    download: (backupId: number) =>
      ipcRenderer.invoke('cloud:download', backupId) as Promise<ApiResponse<any>>,
    import: (backupId: number) =>
      ipcRenderer.invoke('cloud:import', backupId) as Promise<ApiResponse<any>>,
    delete: (backupId: number) =>
      ipcRenderer.invoke('cloud:delete', backupId) as Promise<ApiResponse<void>>,
    plan: () =>
      ipcRenderer.invoke('cloud:plan') as Promise<ApiResponse<any>>,
    licenseCheckout: () =>
      ipcRenderer.invoke('cloud:licenseCheckout') as Promise<ApiResponse<{ checkout_url: string }>>,
    subscriptionCheckout: (plan: string) =>
      ipcRenderer.invoke('cloud:subscriptionCheckout', plan) as Promise<ApiResponse<{ checkout_url?: string; upgraded?: boolean }>>,
    planCheck: () =>
      ipcRenderer.invoke('cloud:planCheck') as Promise<ApiResponse<any>>,
    onUploadProgress: (callback: (percent: number) => void) => {
      ipcRenderer.on('cloud:upload-progress', (_, percent) => callback(percent))
      return () => { ipcRenderer.removeAllListeners('cloud:upload-progress') }
    },
    onDownloadProgress: (callback: (percent: number) => void) => {
      ipcRenderer.on('cloud:download-progress', (_, percent) => callback(percent))
      return () => { ipcRenderer.removeAllListeners('cloud:download-progress') }
    },
    confirmDeviceLink: (data: { token: string; server: string; deviceName?: string }) =>
      ipcRenderer.invoke('cloud:confirmDeviceLink', data) as Promise<ApiResponse<any>>,
    verifyCode: (data: { code: string; server: string; deviceName?: string }) =>
      ipcRenderer.invoke('cloud:verifyCode', data) as Promise<ApiResponse<{ api_token: string; user: { id: number; name: string; email: string } }>>,
    onDeepLinkConnected: (callback: (data: { success: boolean; user?: any; server?: string; error?: string }) => void) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('deep-link:connected', handler)
      return () => { ipcRenderer.removeListener('deep-link:connected', handler) }
    },
    onInviteDeepLink: (callback: (data: { code: string }) => void) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('deep-link:invite', handler)
      return () => { ipcRenderer.removeListener('deep-link:invite', handler) }
    },
  },

  // Cloud Session (program-level)
  cloudSession: {
    get: () => ipcRenderer.invoke('cloudSession:get') as Promise<ApiResponse<{ serverUrl: string; token: string; user: { id: number; name: string; email: string } } | null>>,
    logout: () => ipcRenderer.invoke('cloudSession:logout') as Promise<ApiResponse<void>>,
  },

  // Cloud Empresa Management
  cloudEmpresa: {
    getUsers: () =>
      ipcRenderer.invoke('cloudEmpresa:getUsers') as Promise<ApiResponse<any[]>>,
    inviteUser: (role?: string) =>
      ipcRenderer.invoke('cloudEmpresa:inviteUser', role) as Promise<ApiResponse<{ code: string; role: string; expires_at: string; invite_url?: string }>>,
    removeUser: (userId: number) =>
      ipcRenderer.invoke('cloudEmpresa:removeUser', userId) as Promise<ApiResponse<void>>,
    updateUserRole: (userId: number, role: string) =>
      ipcRenderer.invoke('cloudEmpresa:updateUserRole', userId, role) as Promise<ApiResponse<void>>,
  },

  // Logo
  logo: {
    upload: (fileData: { data: number[]; nombre: string; tipoMime: string }) =>
      ipcRenderer.invoke('logo:upload', fileData) as Promise<ApiResponse<{ path: string }>>,
    read: () =>
      ipcRenderer.invoke('logo:read') as Promise<ApiResponse<{ data: number[]; tipoMime: string }>>,
    delete: () =>
      ipcRenderer.invoke('logo:delete') as Promise<ApiResponse<void>>,
  },

  // Email
  email: {
    saveConfig: (data: { host: string; port: number; secure: boolean; user: string; pass?: string; fromName: string; fromEmail: string }) =>
      ipcRenderer.invoke('email:saveConfig', data) as Promise<ApiResponse<void>>,
    test: () => ipcRenderer.invoke('email:test') as Promise<ApiResponse<void>>,
    send: (data: { to: string; cc?: string; subject: string; body: string; attachmentName?: string; attachmentBase64?: string }) =>
      ipcRenderer.invoke('email:send', data) as Promise<ApiResponse<void>>,
  },

  // Shell
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url) as Promise<ApiResponse<void>>,
  },

  // Auto-updater
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates') as Promise<ApiResponse<void>>,
    downloadUpdate: () => ipcRenderer.invoke('updater:downloadUpdate') as Promise<ApiResponse<void>>,
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall') as Promise<ApiResponse<void>>,
    getVersion: () => ipcRenderer.invoke('updater:getVersion') as Promise<ApiResponse<string>>,
    getReleases: (lang?: string) => ipcRenderer.invoke('updater:getReleases', lang) as Promise<ApiResponse<Array<{ tag: string; name: string; body: string; date: string; prerelease: boolean }>>>,
    onChecking: (callback: () => void) => {
      ipcRenderer.on('updater:checking', callback)
      return () => { ipcRenderer.removeAllListeners('updater:checking') }
    },
    onAvailable: (callback: (info: { version: string; releaseDate?: string }) => void) => {
      ipcRenderer.on('updater:available', (_, info) => callback(info))
      return () => { ipcRenderer.removeAllListeners('updater:available') }
    },
    onNotAvailable: (callback: () => void) => {
      ipcRenderer.on('updater:not-available', callback)
      return () => { ipcRenderer.removeAllListeners('updater:not-available') }
    },
    onDownloadProgress: (callback: (progress: { percent: number }) => void) => {
      ipcRenderer.on('updater:download-progress', (_, p) => callback(p))
      return () => { ipcRenderer.removeAllListeners('updater:download-progress') }
    },
    onDownloaded: (callback: () => void) => {
      ipcRenderer.on('updater:downloaded', callback)
      return () => { ipcRenderer.removeAllListeners('updater:downloaded') }
    },
    onError: (callback: (error: string) => void) => {
      ipcRenderer.on('updater:error', (_, err) => callback(err))
      return () => { ipcRenderer.removeAllListeners('updater:error') }
    },
  },

  // ClassicGes 6 Import
  clasges: {
    selectFolder: () => ipcRenderer.invoke('clasges:selectFolder') as Promise<ApiResponse<{ path: string }>>,
    scan: (dirPath: string) => ipcRenderer.invoke('clasges:scan', dirPath) as Promise<ApiResponse<Record<string, { found: boolean; count: number }>>>,
    preview: (dirPath: string, entity: string) => ipcRenderer.invoke('clasges:preview', dirPath, entity) as Promise<ApiResponse<any[]>>,
    import: (dirPath: string, entities: string[]) => ipcRenderer.invoke('clasges:import', dirPath, entities) as Promise<ApiResponse<Record<string, { imported: number; skipped: number; errors: string[] }>>>,
    onProgress: (callback: (data: { entity: string; current: number; total: number; status: string }) => void) => {
      ipcRenderer.on('clasges:progress', (_, data) => callback(data))
      return () => { ipcRenderer.removeAllListeners('clasges:progress') }
    },
  },

  // Holded Import
  holded: {
    saveApiKey: (apiKey: string) => ipcRenderer.invoke('holded:saveApiKey', apiKey) as Promise<ApiResponse<void>>,
    getApiKey: () => ipcRenderer.invoke('holded:getApiKey') as Promise<ApiResponse<string | null>>,
    deleteApiKey: () => ipcRenderer.invoke('holded:deleteApiKey') as Promise<ApiResponse<void>>,
    testConnection: (apiKey: string) => ipcRenderer.invoke('holded:testConnection', apiKey) as Promise<ApiResponse<{ connected: boolean }>>,
    scan: (apiKey: string) => ipcRenderer.invoke('holded:scan', apiKey) as Promise<ApiResponse<Record<string, { found: boolean; count: number }>>>,
    preview: (apiKey: string, entity: string) => ipcRenderer.invoke('holded:preview', apiKey, entity) as Promise<ApiResponse<any[]>>,
    import: (apiKey: string, entities: string[]) => ipcRenderer.invoke('holded:import', apiKey, entities) as Promise<ApiResponse<Record<string, { imported: number; skipped: number; errors: string[] }>>>,
    onProgress: (callback: (data: { entity: string; current: number; total: number; status: string }) => void) => {
      ipcRenderer.on('holded:progress', (_, data) => callback(data))
      return () => { ipcRenderer.removeAllListeners('holded:progress') }
    },
  },

  // RRHH - Departamentos
  departamentos: {
    getAll: () => ipcRenderer.invoke('departamentos:getAll') as Promise<ApiResponse<any[]>>,
    create: (data: any) => ipcRenderer.invoke('departamentos:create', data) as Promise<ApiResponse<any>>,
    update: (id: number, data: any) => ipcRenderer.invoke('departamentos:update', id, data) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('departamentos:delete', id) as Promise<ApiResponse<void>>,
  },

  // RRHH - Empleados
  empleados: {
    getAll: () => ipcRenderer.invoke('empleados:getAll') as Promise<ApiResponse<any[]>>,
    getById: (id: number) => ipcRenderer.invoke('empleados:getById', id) as Promise<ApiResponse<any>>,
    create: (data: any) => ipcRenderer.invoke('empleados:create', data) as Promise<ApiResponse<any>>,
    update: (id: number, data: any) => ipcRenderer.invoke('empleados:update', id, data) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('empleados:delete', id) as Promise<ApiResponse<void>>,
  },

  // RRHH - Contratos
  contratos: {
    getByEmpleado: (empleadoId: number) => ipcRenderer.invoke('contratos:getByEmpleado', empleadoId) as Promise<ApiResponse<any[]>>,
    create: (data: any) => ipcRenderer.invoke('contratos:create', data) as Promise<ApiResponse<any>>,
    update: (id: number, data: any) => ipcRenderer.invoke('contratos:update', id, data) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('contratos:delete', id) as Promise<ApiResponse<void>>,
  },

  // RRHH - Nóminas
  nominas: {
    getAll: (filters?: any) => ipcRenderer.invoke('nominas:getAll', filters) as Promise<ApiResponse<any[]>>,
    getById: (id: number) => ipcRenderer.invoke('nominas:getById', id) as Promise<ApiResponse<any>>,
    calcular: (data: any) => ipcRenderer.invoke('nominas:calcular', data) as Promise<ApiResponse<any>>,
    create: (data: any) => ipcRenderer.invoke('nominas:create', data) as Promise<ApiResponse<any>>,
    confirmar: (id: number) => ipcRenderer.invoke('nominas:confirmar', id) as Promise<ApiResponse<any>>,
    marcarPagada: (id: number) => ipcRenderer.invoke('nominas:marcarPagada', id) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('nominas:delete', id) as Promise<ApiResponse<void>>,
  },

  // SEPA
  sepa: {
    getLotes: () => ipcRenderer.invoke('sepa:getLotes') as Promise<ApiResponse<any[]>>,
    createLote: (data: any) => ipcRenderer.invoke('sepa:createLote', data) as Promise<ApiResponse<any>>,
    updateEstado: (id: number, estado: string) => ipcRenderer.invoke('sepa:updateEstado', id, estado) as Promise<ApiResponse<any>>,
    deleteLote: (id: number) => ipcRenderer.invoke('sepa:deleteLote', id) as Promise<ApiResponse<void>>,
  },

  // RRHH - Ausencias
  tiposAusencia: {
    getAll: () => ipcRenderer.invoke('tiposAusencia:getAll') as Promise<ApiResponse<any[]>>,
    create: (data: any) => ipcRenderer.invoke('tiposAusencia:create', data) as Promise<ApiResponse<any>>,
    update: (id: number, data: any) => ipcRenderer.invoke('tiposAusencia:update', id, data) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('tiposAusencia:delete', id) as Promise<ApiResponse<void>>,
  },

  ausencias: {
    getAll: (filters?: any) => ipcRenderer.invoke('ausencias:getAll', filters) as Promise<ApiResponse<any[]>>,
    create: (data: any) => ipcRenderer.invoke('ausencias:create', data) as Promise<ApiResponse<any>>,
    updateEstado: (id: number, estado: string) => ipcRenderer.invoke('ausencias:updateEstado', id, estado) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('ausencias:delete', id) as Promise<ApiResponse<void>>,
  },

  // RRHH - Jornada
  jornada: {
    getAll: (filters?: any) => ipcRenderer.invoke('jornada:getAll', filters) as Promise<ApiResponse<any[]>>,
    fichar: (data: { empleadoId: number; tipo: 'entrada' | 'salida' }) => ipcRenderer.invoke('jornada:fichar', data) as Promise<ApiResponse<any>>,
    update: (id: number, data: any) => ipcRenderer.invoke('jornada:update', id, data) as Promise<ApiResponse<any>>,
    delete: (id: number) => ipcRenderer.invoke('jornada:delete', id) as Promise<ApiResponse<void>>,
    resumenMensual: (params: { mes: number; anio: number }) => ipcRenderer.invoke('jornada:resumenMensual', params) as Promise<ApiResponse<any[]>>,
  },

  // Cloud entity sync events
  onEntityUpdated: (callback: (data: { entityType: string }) => void) => {
    ipcRenderer.on('cloud:entity-updated', (_, data) => callback(data))
    return () => { ipcRenderer.removeAllListeners('cloud:entity-updated') }
  },

  // Buzón de Correo
  buzon: {
    addAccount: (data: any) => ipcRenderer.invoke('buzon:addAccount', data) as Promise<ApiResponse<any>>,
    updateAccount: (id: number, data: any) => ipcRenderer.invoke('buzon:updateAccount', id, data) as Promise<ApiResponse<any>>,
    deleteAccount: (id: number) => ipcRenderer.invoke('buzon:deleteAccount', id) as Promise<ApiResponse<void>>,
    listAccounts: () => ipcRenderer.invoke('buzon:listAccounts') as Promise<ApiResponse<any[]>>,
    testConnection: (id: number) => ipcRenderer.invoke('buzon:testConnection', id) as Promise<ApiResponse<void>>,
    syncFolders: (cuentaId: number) => ipcRenderer.invoke('buzon:syncFolders', cuentaId) as Promise<ApiResponse<any[]>>,
    listFolders: (cuentaId: number) => ipcRenderer.invoke('buzon:listFolders', cuentaId) as Promise<ApiResponse<any[]>>,
    syncMessages: (cuentaId: number, carpetaId: number) => ipcRenderer.invoke('buzon:syncMessages', cuentaId, carpetaId) as Promise<ApiResponse<void>>,
    listMessages: (cuentaId: number, carpetaId: number, page?: number, pageSize?: number) =>
      ipcRenderer.invoke('buzon:listMessages', cuentaId, carpetaId, page, pageSize) as Promise<ApiResponse<any>>,
    getMessage: (cuentaId: number, carpetaId: number, uid: number) =>
      ipcRenderer.invoke('buzon:getMessage', cuentaId, carpetaId, uid) as Promise<ApiResponse<any>>,
    downloadAttachment: (cuentaId: number, carpetaId: number, uid: number, attachmentIndex: number) =>
      ipcRenderer.invoke('buzon:downloadAttachment', cuentaId, carpetaId, uid, attachmentIndex) as Promise<ApiResponse<any>>,
    markRead: (cuentaId: number, carpetaId: number, uid: number) =>
      ipcRenderer.invoke('buzon:markRead', cuentaId, carpetaId, uid) as Promise<ApiResponse<void>>,
    markUnread: (cuentaId: number, carpetaId: number, uid: number) =>
      ipcRenderer.invoke('buzon:markUnread', cuentaId, carpetaId, uid) as Promise<ApiResponse<void>>,
    deleteMessage: (cuentaId: number, carpetaId: number, uid: number) =>
      ipcRenderer.invoke('buzon:deleteMessage', cuentaId, carpetaId, uid) as Promise<ApiResponse<void>>,
    moveMessage: (cuentaId: number, carpetaId: number, uid: number, destPath: string) =>
      ipcRenderer.invoke('buzon:moveMessage', cuentaId, carpetaId, uid, destPath) as Promise<ApiResponse<void>>,
    sendEmail: (cuentaId: number, data: any) =>
      ipcRenderer.invoke('buzon:sendEmail', cuentaId, data) as Promise<ApiResponse<void>>,
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
