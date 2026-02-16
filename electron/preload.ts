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
    create: (data: { nombre: string; customDataPath?: string }) => ipcRenderer.invoke('empresa:create', data) as Promise<ApiResponse<any>>,
    select: (id: string) => ipcRenderer.invoke('empresa:select', id) as Promise<ApiResponse<any>>,
    rename: (id: string, nombre: string) => ipcRenderer.invoke('empresa:rename', id, nombre) as Promise<ApiResponse<void>>,
    delete: (id: string) => ipcRenderer.invoke('empresa:delete', id) as Promise<ApiResponse<void>>,
    getActive: () => ipcRenderer.invoke('empresa:getActive') as Promise<ApiResponse<any>>,
    getDefaultPath: () => ipcRenderer.invoke('empresa:getDefaultPath') as Promise<ApiResponse<{ path: string }>>,
    detectVolumes: () => ipcRenderer.invoke('empresa:detectVolumes') as Promise<ApiResponse<{ name: string; path: string; available: boolean }[]>>,
    selectDirectory: () => ipcRenderer.invoke('empresa:selectDirectory') as Promise<ApiResponse<{ path: string } | null>>,
  },

  // Autenticación
  auth: {
    checkStatus: () => ipcRenderer.invoke('auth:checkStatus') as Promise<ApiResponse<AuthStatus>>,
    setup: (password: string) => ipcRenderer.invoke('auth:setup', password) as Promise<ApiResponse<void>>,
    unlock: (password: string) => ipcRenderer.invoke('auth:unlock', password) as Promise<ApiResponse<void>>,
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
    onUploadProgress: (callback: (percent: number) => void) => {
      ipcRenderer.on('cloud:upload-progress', (_, percent) => callback(percent))
      return () => { ipcRenderer.removeAllListeners('cloud:upload-progress') }
    },
    onDownloadProgress: (callback: (percent: number) => void) => {
      ipcRenderer.on('cloud:download-progress', (_, percent) => callback(percent))
      return () => { ipcRenderer.removeAllListeners('cloud:download-progress') }
    },
    confirmDeviceLink: (data: { token: string; server: string }) =>
      ipcRenderer.invoke('cloud:confirmDeviceLink', data) as Promise<ApiResponse<any>>,
    onDeepLinkConnected: (callback: (data: { success: boolean; user?: any; server?: string; error?: string }) => void) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('deep-link:connected', handler)
      return () => { ipcRenderer.removeListener('deep-link:connected', handler) }
    },
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

  // Shell
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url) as Promise<ApiResponse<void>>,
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
