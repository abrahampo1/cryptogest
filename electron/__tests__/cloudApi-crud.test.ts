import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as nodeCrypto from 'crypto'

// ============================================
// Mock net.request to intercept all HTTP calls
// ============================================

// Use vi.hoisted so mockNetRequest is available when vi.mock factory runs
const { mockNetRequest } = vi.hoisted(() => {
  return { mockNetRequest: vi.fn() }
})

const requestLog: Array<{ method: string; url: string; body?: any }> = []
let serverResponseQueue: Array<{ statusCode: number; body: any }> = []
let encKey: Buffer | null = null

function queueResponse(body: any, statusCode = 200) {
  serverResponseQueue.push({ statusCode, body })
}

function queueEncryptedEntityResponse(entities: any[]) {
  // Encrypt each entity the same way the real server would store them
  const serverEntities = entities.map((entity) => {
    const iv = nodeCrypto.randomBytes(16)
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', encKey!, iv)
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(entity), 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return {
      entity_uuid: entity._uuid || nodeCrypto.randomUUID(),
      entity_type: entity._entityType || 'test',
      encrypted_data: encrypted.toString('base64'),
      iv: iv.toString('hex'),
      auth_tag: authTag.toString('hex'),
      updated_at: new Date().toISOString(),
    }
  })
  queueResponse({ data: serverEntities })
}

function queueEmptyResponse() {
  queueResponse({ data: [] })
}

// POST/PUT/DELETE success response
function queueOkResponse() {
  queueResponse({ success: true })
}

vi.mock('electron', () => ({
  net: { request: mockNetRequest },
  BrowserWindow: { getAllWindows: () => [] },
}))

function setupMockNetRequest() {
  mockNetRequest.mockImplementation((options: any) => {
    const handlers: Record<string, Function[]> = {}

    const req = {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(() => {
        const queued = serverResponseQueue.shift()
        if (!queued) {
          // Default: return empty success
          const resHandlers: Record<string, Function[]> = {}
          const response = {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            on: (event: string, handler: Function) => {
              if (!resHandlers[event]) resHandlers[event] = []
              resHandlers[event].push(handler)
              return response
            },
          }
          if (handlers['response']) handlers['response'].forEach(h => h(response))
          const body = JSON.stringify({ data: [] })
          if (resHandlers['data']) resHandlers['data'].forEach(h => h(Buffer.from(body)))
          if (resHandlers['end']) resHandlers['end'].forEach(h => h())
          return
        }

        const resHandlers: Record<string, Function[]> = {}
        const response = {
          statusCode: queued.statusCode,
          headers: { 'content-type': 'application/json' },
          on: (event: string, handler: Function) => {
            if (!resHandlers[event]) resHandlers[event] = []
            resHandlers[event].push(handler)
            return response
          },
        }
        if (handlers['response']) handlers['response'].forEach(h => h(response))
        const body = JSON.stringify(queued.body)
        if (resHandlers['data']) resHandlers['data'].forEach(h => h(Buffer.from(body)))
        if (resHandlers['end']) resHandlers['end'].forEach(h => h())
      }),
      abort: vi.fn(),
      on: (event: string, handler: Function) => {
        if (!handlers[event]) handlers[event] = []
        handlers[event].push(handler)
        return req
      },
    }

    // Capture the request
    requestLog.push({
      method: options.method,
      url: options.url,
    })

    return req
  })
}

import {
  setCloudApiConfig,
  clearCloudApiConfig,
  deriveCloudKey,
  setEncryptionKey,
  invalidateCache,
  empleados,
  departamentos,
  contratos,
  clientes,
  productos,
  impuestos,
  facturas,
  configuracion,
  gastos,
  categoriasGasto,
  ejercicios,
  asientos,
  nominas,
  tiposAusencia,
  ausencias,
  jornada,
  sepa,
  dashboard,
  __test__,
} from '../cloudApi'

const { resetState } = __test__

// ============================================
// Setup / Teardown
// ============================================

beforeEach(() => {
  resetState()
  clearCloudApiConfig()
  requestLog.length = 0
  serverResponseQueue = []
  mockNetRequest.mockClear()
  setupMockNetRequest()

  // Setup config and encryption key
  setCloudApiConfig('https://test-server.com', 'test-token-123', 1)
  const salt = nodeCrypto.randomBytes(32).toString('hex')
  encKey = deriveCloudKey('test-passphrase', salt)
  setEncryptionKey(encKey)
})

afterEach(() => {
  clearCloudApiConfig()
})

// ============================================
// Helper: build encrypted single-entity GET response
// ============================================
function queueEncryptedEntityGet(entity: any) {
  const iv = nodeCrypto.randomBytes(16)
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', encKey!, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(entity), 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  queueResponse({
    entity_uuid: entity._uuid,
    entity_type: 'test',
    encrypted_data: encrypted.toString('base64'),
    iv: iv.toString('hex'),
    auth_tag: authTag.toString('hex'),
    updated_at: new Date().toISOString(),
  })
}

// ============================================
// createEntity (via facades)
// ============================================
describe('Entity CRUD via Facades', () => {

  describe('departamentos', () => {
    it('create returns entity with expected fields', async () => {
      // POST create
      queueOkResponse()
      const result = await departamentos.create({ nombre: 'Ingeniería' })
      expect(result).toMatchObject({
        nombre: 'Ingeniería',
        activo: true,
      })
      expect(result.id).toBe(1)
      expect(result._uuid).toBeDefined()
      expect(result.createdAt).toBeDefined()
    })

    it('getAll returns departments with employee count', async () => {
      // First call: departamentos getAll -> fetch from server
      const dept1 = { id: 1, _uuid: 'uuid-d1', nombre: 'Ingeniería', activo: true }
      const dept2 = { id: 2, _uuid: 'uuid-d2', nombre: 'Marketing', activo: true }
      queueEncryptedEntityResponse([dept1, dept2])
      // Second call: empleados getAll -> fetch from server
      const emp1 = { id: 1, _uuid: 'uuid-e1', nombre: 'Juan', departamentoId: 1, activo: true }
      queueEncryptedEntityResponse([emp1])

      const result = await departamentos.getAll()
      expect(result).toHaveLength(2)
      // Sorted alphabetically
      expect(result[0].nombre).toBe('Ingeniería')
      expect(result[0]._count.empleados).toBe(1)
      expect(result[1].nombre).toBe('Marketing')
      expect(result[1]._count.empleados).toBe(0)
    })

    it('update modifies entity via updateEntity', async () => {
      // First, create to register the ID
      queueOkResponse()
      const created = await departamentos.create({ nombre: 'Ventas' })

      // updateEntity: cache not populated, so it calls getEntity(uuid) to fetch current
      queueEncryptedEntityGet(created) // GET current entity
      queueOkResponse() // PUT updated entity
      const updated = await departamentos.update(created.id, { nombre: 'Ventas 2.0' })
      expect(updated.nombre).toBe('Ventas 2.0')
      expect(updated.id).toBe(created.id)
    })

    it('delete removes entity', async () => {
      queueOkResponse()
      const created = await departamentos.create({ nombre: 'Temp' })

      queueOkResponse()
      await expect(departamentos.delete(created.id)).resolves.toBeUndefined()
    })
  })

  describe('empleados', () => {
    it('create sets default fields', async () => {
      // POST create
      queueOkResponse()
      // After create, tries to fetch departamentos
      queueEncryptedEntityResponse([])

      const result = await empleados.create({ nombre: 'Juan', apellidos: 'García', email: 'juan@test.com' })
      expect(result).toMatchObject({
        nombre: 'Juan',
        apellidos: 'García',
        activo: true,
        pais: 'España',
        grupoCotizacion: 1,
        porcentajeIRPF: 0,
        diasVacacionesAnuales: 30,
      })
      expect(result.id).toBe(1)
      expect(result.departamento).toBeNull()
      expect(result.contratos).toEqual([])
    })

    it('create resolves departamento relation', async () => {
      // First create a department (to set up cache)
      queueOkResponse()
      const dept = await departamentos.create({ nombre: 'IT' })

      // Now create employee with departamentoId
      queueOkResponse()
      // empleados.create fetches departamentos -> will use cached
      // But cache may not be populated for departamentos from create alone
      // So it fetches from server
      const deptForServer = { id: dept.id, _uuid: dept._uuid, nombre: 'IT', activo: true }
      queueEncryptedEntityResponse([deptForServer])

      const result = await empleados.create({ nombre: 'Ana', apellidos: 'López', departamentoId: dept.id })
      expect(result.departamento).toBeTruthy()
      expect(result.departamento.nombre).toBe('IT')
    })

    it('getAll resolves departamento and contratos relations', async () => {
      const emp = { id: 1, _uuid: 'uuid-e1', nombre: 'Juan', apellidos: 'García', departamentoId: 1, activo: true }
      const dept = { id: 1, _uuid: 'uuid-d1', nombre: 'IT', activo: true }
      const contrato = { id: 1, _uuid: 'uuid-c1', empleadoId: 1, activo: true, tipoContrato: 'indefinido', fechaInicio: '2024-01-01' }

      queueEncryptedEntityResponse([emp])
      queueEncryptedEntityResponse([dept])
      queueEncryptedEntityResponse([contrato])

      const result = await empleados.getAll()
      expect(result).toHaveLength(1)
      expect(result[0].departamento).toBeTruthy()
      expect(result[0].departamento.nombre).toBe('IT')
      expect(result[0].contratos).toHaveLength(1)
    })

    it('getAll handles empty related entities gracefully', async () => {
      const emp = { id: 1, _uuid: 'uuid-e1', nombre: 'Solo', apellidos: 'Test', activo: true }
      queueEncryptedEntityResponse([emp])
      queueEmptyResponse() // departamentos
      queueEmptyResponse() // contratos

      const result = await empleados.getAll()
      expect(result).toHaveLength(1)
      expect(result[0].departamento).toBeNull()
      expect(result[0].contratos).toEqual([])
    })

    it('delete cascades to related entities', async () => {
      // Create empleado
      queueOkResponse()
      queueEncryptedEntityResponse([]) // departamentos fetch during create
      const emp = await empleados.create({ nombre: 'Borrar', apellidos: 'Test' })

      // delete: fetches contratos, nominas, ausencias, jornadas
      queueEncryptedEntityResponse([]) // contratos
      queueEncryptedEntityResponse([]) // nominas
      queueEncryptedEntityResponse([]) // ausencias
      queueEncryptedEntityResponse([]) // registroJornada
      queueOkResponse() // DELETE empleado

      await expect(empleados.delete(emp.id)).resolves.toBeUndefined()
    })

    it('delete cascades and deletes related contratos', async () => {
      queueOkResponse()
      queueEncryptedEntityResponse([]) // departamentos for create
      const emp = await empleados.create({ nombre: 'Con', apellidos: 'Contrato' })

      // Create a contrato for this empleado
      queueOkResponse()
      const contrato = await contratos.create({ empleadoId: emp.id, salarioBrutoAnual: 30000 })

      // Now delete empleado
      const contratoData = { id: contrato.id, _uuid: contrato._uuid, empleadoId: emp.id, activo: true }
      queueEncryptedEntityResponse([contratoData]) // contratos
      queueEncryptedEntityResponse([]) // nominas
      queueEncryptedEntityResponse([]) // ausencias
      queueEncryptedEntityResponse([]) // registroJornada
      queueOkResponse() // DELETE contrato
      queueOkResponse() // DELETE empleado

      await expect(empleados.delete(emp.id)).resolves.toBeUndefined()
    })
  })

  describe('contratos', () => {
    it('create sets default values', async () => {
      // Register an employee first to have a valid empleadoId mapping
      queueOkResponse()
      queueEncryptedEntityResponse([]) // departamentos
      const emp = await empleados.create({ nombre: 'Test', apellidos: 'Worker' })

      queueOkResponse()
      const result = await contratos.create({ empleadoId: emp.id, salarioBrutoAnual: 30000 })
      expect(result).toMatchObject({
        activo: true,
        tipoContrato: 'indefinido',
        jornada: 'completa',
        horasSemanales: 40,
        numPagasExtra: 2,
        pagasProrrateadas: false,
        porcentajeATEP: 1.50,
      })
    })

    it('getByEmpleado filters correctly', async () => {
      const c1 = { id: 1, _uuid: 'uuid-c1', empleadoId: 1, activo: true, fechaInicio: '2024-01-01' }
      const c2 = { id: 2, _uuid: 'uuid-c2', empleadoId: 2, activo: true, fechaInicio: '2024-06-01' }
      const c3 = { id: 3, _uuid: 'uuid-c3', empleadoId: 1, activo: true, fechaInicio: '2023-01-01' }

      queueEncryptedEntityResponse([c1, c2, c3])
      const result = await contratos.getByEmpleado(1)
      expect(result).toHaveLength(2)
      // Sorted by fechaInicio desc
      expect(result[0].id).toBe(1) // 2024-01-01
      expect(result[1].id).toBe(3) // 2023-01-01
    })
  })

  describe('clientes', () => {
    it('create sets default activo and pais', async () => {
      queueOkResponse()
      const result = await clientes.create({ nombre: 'Acme Corp', nif: 'B12345678' })
      expect(result.activo).toBe(true)
      expect(result.pais).toBe('España')
      expect(result.facturas).toEqual([])
    })

    it('getAll resolves facturas relation', async () => {
      const cliente = { id: 1, _uuid: 'uuid-cl1', nombre: 'Acme', activo: true }
      const factura = { id: 1, _uuid: 'uuid-f1', clienteId: 1, numero: 'F-0001', total: 100 }

      queueEncryptedEntityResponse([cliente])
      queueEncryptedEntityResponse([factura])

      const result = await clientes.getAll()
      expect(result).toHaveLength(1)
      expect(result[0].facturas).toHaveLength(1)
      expect(result[0].facturas[0].numero).toBe('F-0001')
    })

    it('getAll marks activo as true when undefined', async () => {
      const cliente = { id: 1, _uuid: 'uuid-cl1', nombre: 'Test' } // no activo field
      queueEncryptedEntityResponse([cliente])
      queueEncryptedEntityResponse([]) // facturas

      const result = await clientes.getAll()
      expect(result[0].activo).toBe(true)
    })
  })

  describe('productos', () => {
    it('create sets default activo', async () => {
      queueOkResponse()
      const result = await productos.create({ nombre: 'Widget', precio: 9.99 })
      expect(result.activo).toBe(true)
    })

    it('getAll resolves impuesto and retencion', async () => {
      const prod = { id: 1, _uuid: 'uuid-p1', nombre: 'Widget', impuestoId: 1, retencionId: 2 }
      const imp1 = { id: 1, _uuid: 'uuid-i1', nombre: 'IVA 21%', porcentaje: 21 }
      const imp2 = { id: 2, _uuid: 'uuid-i2', nombre: 'IRPF 15%', porcentaje: 15 }

      queueEncryptedEntityResponse([prod])
      queueEncryptedEntityResponse([imp1, imp2])

      const result = await productos.getAll()
      expect(result).toHaveLength(1)
      expect(result[0].impuesto.nombre).toBe('IVA 21%')
      expect(result[0].retencion.nombre).toBe('IRPF 15%')
    })

    it('getAll sorts alphabetically', async () => {
      const p1 = { id: 1, _uuid: 'uuid-p1', nombre: 'Zebra' }
      const p2 = { id: 2, _uuid: 'uuid-p2', nombre: 'Apple' }
      queueEncryptedEntityResponse([p1, p2])
      queueEncryptedEntityResponse([]) // impuestos

      const result = await productos.getAll()
      expect(result[0].nombre).toBe('Apple')
      expect(result[1].nombre).toBe('Zebra')
    })
  })

  describe('impuestos', () => {
    it('create sets default activo and porDefecto', async () => {
      queueOkResponse()
      const result = await impuestos.create({ nombre: 'IVA 21%', porcentaje: 21 })
      expect(result.activo).toBe(true)
      expect(result.porDefecto).toBe(false)
    })

    it('setDefault unsets all other defaults and sets the specified one', async () => {
      // Create two impuestos
      queueOkResponse()
      const imp1 = await impuestos.create({ nombre: 'IVA 21%', porcentaje: 21, porDefecto: true })
      queueOkResponse()
      const imp2 = await impuestos.create({ nombre: 'IVA 10%', porcentaje: 10 })

      // setDefault(imp2.id): getAllEntities('impuesto') returns both
      const imp1Data = { ...imp1, porDefecto: true }
      const imp2Data = { ...imp2 }
      queueEncryptedEntityResponse([imp1Data, imp2Data])
      // Update imp1 to porDefecto: false
      queueOkResponse()
      // Update imp2 to porDefecto: true
      queueOkResponse()

      await impuestos.setDefault(imp2.id)
    })
  })

  describe('facturas', () => {
    it('create also creates lineas', async () => {
      // Factura create
      queueOkResponse()
      // Linea 1 create
      queueOkResponse()
      // Linea 2 create
      queueOkResponse()

      const result = await facturas.create({
        clienteId: 1,
        fecha: '2024-01-15',
        numero: 'F-0001',
        total: 242,
        lineas: [
          { descripcion: 'Item 1', cantidad: 1, precioUnitario: 100 },
          { descripcion: 'Item 2', cantidad: 2, precioUnitario: 71 },
        ],
      })
      expect(result.estado).toBe('borrador')
      expect(result.serie).toBe('F')
    })

    it('getNextNumber calculates next from existing', async () => {
      const f1 = { id: 1, _uuid: 'uuid-f1', serie: 'F', numero: 'F-0003' }
      const f2 = { id: 2, _uuid: 'uuid-f2', serie: 'F', numero: 'F-0001' }
      const f3 = { id: 3, _uuid: 'uuid-f3', serie: 'R', numero: 'R-0010' }

      queueEncryptedEntityResponse([f1, f2, f3])
      const result = await facturas.getNextNumber('F')
      expect(result).toBe('F-0004')
    })

    it('getNextNumber returns F-0001 when no facturas exist', async () => {
      queueEncryptedEntityResponse([])
      const result = await facturas.getNextNumber()
      expect(result).toBe('F-0001')
    })

    it('getNextNumber uses default serie F', async () => {
      queueEncryptedEntityResponse([])
      const result = await facturas.getNextNumber()
      expect(result).toBe('F-0001')
    })

    it('delete cascades to lineas', async () => {
      queueOkResponse()
      const factura = await facturas.create({
        clienteId: 1,
        fecha: '2024-01-15',
        total: 100,
        lineas: [],
      })

      // delete: fetch lineaFactura
      const linea = { id: 1, _uuid: 'uuid-lf1', facturaId: factura.id, descripcion: 'Item' }
      queueEncryptedEntityResponse([linea])
      // DELETE linea
      queueOkResponse()
      // DELETE factura
      queueOkResponse()

      // Need to register the linea's ID mapping for deleteEntity to work
      __test__.registerEntity('lineaFactura', linea.id, linea._uuid)

      await expect(facturas.delete(factura.id)).resolves.toBeUndefined()
    })

    it('update replaces lineas', async () => {
      // Create factura
      queueOkResponse()
      const factura = await facturas.create({ clienteId: 1, fecha: '2024-01-15', total: 100, lineas: [] })

      // updateEntity: cache not populated -> getEntity fetches current from server
      queueEncryptedEntityGet(factura) // GET current factura
      // PUT updated factura
      queueOkResponse()
      // Fetch existing lineas
      const oldLinea = { id: 10, _uuid: 'uuid-ol1', facturaId: factura.id, descripcion: 'Old' }
      queueEncryptedEntityResponse([oldLinea])
      // Register old linea so delete works
      __test__.registerEntity('lineaFactura', 10, 'uuid-ol1')
      // DELETE old linea
      queueOkResponse()
      // CREATE new linea
      queueOkResponse()

      const updated = await facturas.update(factura.id, {
        total: 200,
        lineas: [{ descripcion: 'New Item', cantidad: 1, precioUnitario: 200 }],
      })
      expect(updated.total).toBe(200)
    })

    it('updateEstado changes the estado field', async () => {
      queueOkResponse()
      const factura = await facturas.create({ clienteId: 1, fecha: '2024-01-15', total: 100, lineas: [] })

      // updateEntity: cache not populated -> getEntity fetches current from server
      queueEncryptedEntityGet(factura) // GET current factura
      queueOkResponse() // PUT
      const updated = await facturas.updateEstado(factura.id, 'emitida')
      expect(updated.estado).toBe('emitida')
    })
  })

  describe('categoriasGasto', () => {
    it('create sets default activo', async () => {
      queueOkResponse()
      const result = await categoriasGasto.create({ nombre: 'Oficina' })
      expect(result.activo).toBe(true)
      expect(result.nombre).toBe('Oficina')
    })
  })

  describe('gastos', () => {
    it('create sets default impuestoIncluido', async () => {
      queueOkResponse()
      const result = await gastos.create({ descripcion: 'Material', monto: 50, fecha: '2024-01-15' })
      expect(result.impuestoIncluido).toBe(true)
    })

    it('delete cascades to adjuntos', async () => {
      queueOkResponse()
      const gasto = await gastos.create({ descripcion: 'Test', monto: 10, fecha: '2024-01-15' })

      // delete: fetch adjuntoGasto
      const adj = { id: 1, _uuid: 'uuid-adj1', gastoId: gasto.id }
      queueEncryptedEntityResponse([adj])
      __test__.registerEntity('adjuntoGasto', 1, 'uuid-adj1')
      // DELETE adjunto
      queueOkResponse()
      // DELETE gasto
      queueOkResponse()

      await expect(gastos.delete(gasto.id)).resolves.toBeUndefined()
    })
  })

  describe('configuracion', () => {
    it('set creates new config entry', async () => {
      // set: getAllEntities (empty) then create
      queueEncryptedEntityResponse([])
      queueOkResponse()

      const result = await configuracion.set('theme', 'dark')
      expect(result.clave).toBe('theme')
      expect(result.valor).toBe('dark')
    })

    it('set updates existing config entry', async () => {
      // Create initial
      queueEncryptedEntityResponse([])
      queueOkResponse()
      await configuracion.set('theme', 'dark')

      // Update: getAllEntities returns existing entry (from cache)
      // The cache should already have the entity from the create
      invalidateCache('configuracion')

      const existing = { id: 1, _uuid: 'uuid-cfg1', clave: 'theme', valor: 'dark' }
      queueEncryptedEntityResponse([existing])
      __test__.registerEntity('configuracion', 1, 'uuid-cfg1')
      // update
      queueOkResponse()

      const result = await configuracion.set('theme', 'light')
      expect(result.valor).toBe('light')
    })

    it('get returns value for existing key', async () => {
      const cfg = { id: 1, _uuid: 'uuid-cfg1', clave: 'language', valor: 'es' }
      queueEncryptedEntityResponse([cfg])

      const result = await configuracion.get('language')
      expect(result).toBe('es')
    })

    it('get returns null for missing key', async () => {
      queueEncryptedEntityResponse([])
      const result = await configuracion.get('nonexistent')
      expect(result).toBeNull()
    })

    it('getAll returns key-value map', async () => {
      const configs = [
        { id: 1, _uuid: 'uuid-c1', clave: 'theme', valor: 'dark' },
        { id: 2, _uuid: 'uuid-c2', clave: 'language', valor: 'es' },
      ]
      queueEncryptedEntityResponse(configs)

      const result = await configuracion.getAll()
      expect(result).toEqual({ theme: 'dark', language: 'es' })
    })

    it('delete removes config entry', async () => {
      const cfg = { id: 1, _uuid: 'uuid-cfg1', clave: 'theme', valor: 'dark' }
      queueEncryptedEntityResponse([cfg])
      __test__.registerEntity('configuracion', 1, 'uuid-cfg1')
      queueOkResponse()

      await expect(configuracion.delete('theme')).resolves.toBeUndefined()
    })

    it('delete does nothing for missing key', async () => {
      queueEncryptedEntityResponse([])
      await expect(configuracion.delete('nonexistent')).resolves.toBeUndefined()
    })
  })

  describe('ejercicios', () => {
    it('create generates date range from anio', async () => {
      queueOkResponse()
      const result = await ejercicios.create({ anio: 2024 })
      expect(result).toMatchObject({
        anio: 2024,
        estado: 'abierto',
      })
      expect(result.fechaInicio).toContain('2024-01-01')
      expect(result.fechaFin).toContain('2024-12-31')
    })

    it('getAll sorts by anio descending', async () => {
      const ej1 = { id: 1, _uuid: 'uuid-ej1', anio: 2023 }
      const ej2 = { id: 2, _uuid: 'uuid-ej2', anio: 2025 }
      const ej3 = { id: 3, _uuid: 'uuid-ej3', anio: 2024 }
      queueEncryptedEntityResponse([ej1, ej2, ej3])

      const result = await ejercicios.getAll()
      expect(result[0].anio).toBe(2025)
      expect(result[1].anio).toBe(2024)
      expect(result[2].anio).toBe(2023)
    })

    it('getOrCreateCurrent returns existing for current year', async () => {
      const currentYear = new Date().getFullYear()
      const ej = { id: 1, _uuid: 'uuid-ej1', anio: currentYear }
      queueEncryptedEntityResponse([ej])

      const result = await ejercicios.getOrCreateCurrent()
      expect(result.anio).toBe(currentYear)
    })

    it('getOrCreateCurrent creates new if not found', async () => {
      queueEncryptedEntityResponse([]) // no matching year
      queueOkResponse() // create

      const result = await ejercicios.getOrCreateCurrent()
      expect(result.anio).toBe(new Date().getFullYear())
    })
  })

  describe('nominas', () => {
    it('create sets estado to borrador', async () => {
      queueOkResponse() // create nomina
      // fetch empleados for response
      const emp = { id: 1, _uuid: 'uuid-e1', nombre: 'Test', apellidos: 'User', nif: '12345678A' }
      queueEncryptedEntityResponse([emp])

      const result = await nominas.create({
        empleadoId: 1,
        mes: 3,
        anio: 2024,
        salarioBruto: 2500,
        salarioNeto: 2000,
        lineas: [],
      })
      expect(result.estado).toBe('borrador')
      expect(result.empleado).toBeTruthy()
      expect(result.empleado.nombre).toBe('Test')
    })

    it('create also creates lineas', async () => {
      queueOkResponse() // create nomina
      queueOkResponse() // create linea 1
      queueOkResponse() // create linea 2
      const emp = { id: 1, _uuid: 'uuid-e1', nombre: 'Test', apellidos: 'User' }
      queueEncryptedEntityResponse([emp])

      const result = await nominas.create({
        empleadoId: 1,
        mes: 3,
        anio: 2024,
        lineas: [
          { concepto: 'Salario base', importe: 2500, orden: 1 },
          { concepto: 'IRPF', importe: -375, orden: 2 },
        ],
      })
      expect(result.lineas).toHaveLength(2)
    })

    it('getAll filters by empleadoId', async () => {
      const n1 = { id: 1, _uuid: 'uuid-n1', empleadoId: 1, mes: 1, anio: 2024 }
      const n2 = { id: 2, _uuid: 'uuid-n2', empleadoId: 2, mes: 1, anio: 2024 }
      queueEncryptedEntityResponse([n1, n2])
      queueEncryptedEntityResponse([]) // empleados
      queueEncryptedEntityResponse([]) // lineaNomina

      const result = await nominas.getAll({ empleadoId: 1 })
      expect(result).toHaveLength(1)
      expect(result[0].empleadoId).toBe(1)
    })

    it('confirmar sets estado to confirmada', async () => {
      queueOkResponse() // create nomina
      queueEncryptedEntityResponse([]) // empleados fetch during create
      const nomina = await nominas.create({ empleadoId: 1, mes: 1, anio: 2024, lineas: [] })

      // confirmar -> updateEntity: cache not populated -> getEntity fetches current
      queueEncryptedEntityGet(nomina) // GET current nomina
      queueOkResponse() // PUT
      const result = await nominas.confirmar(nomina.id)
      expect(result.estado).toBe('confirmada')
    })
  })

  describe('tiposAusencia', () => {
    it('create sets all defaults', async () => {
      queueOkResponse()
      const result = await tiposAusencia.create({ nombre: 'Vacaciones', codigo: 'VAC' })
      expect(result).toMatchObject({
        nombre: 'Vacaciones',
        codigo: 'VAC',
        descontaSalario: false,
        requiereAprobacion: true,
        color: '#3B82F6',
        activo: true,
      })
    })
  })

  describe('sepa', () => {
    it('getLotes returns sorted by fecha descending', async () => {
      const l1 = { id: 1, _uuid: 'uuid-l1', fechaCreacion: '2024-01-01' }
      const l2 = { id: 2, _uuid: 'uuid-l2', fechaCreacion: '2024-06-01' }
      queueEncryptedEntityResponse([l1, l2])

      const result = await sepa.getLotes()
      expect(result[0].id).toBe(2) // most recent first
    })
  })
})

// ============================================
// Dashboard
// ============================================
describe('Dashboard', () => {
  it('getStats computes correct stats', async () => {
    const clientes = [
      { id: 1, _uuid: 'uuid-c1', activo: true },
      { id: 2, _uuid: 'uuid-c2', activo: false },
      { id: 3, _uuid: 'uuid-c3' }, // activo defaults to true (not false)
    ]
    const facturas = [
      { id: 1, _uuid: 'uuid-f1', estado: 'pagada', total: 1000 },
      { id: 2, _uuid: 'uuid-f2', estado: 'emitida', total: 500 },
      { id: 3, _uuid: 'uuid-f3', estado: 'borrador', total: 200 },
    ]
    const gastos = [
      { id: 1, _uuid: 'uuid-g1', monto: 300 },
      { id: 2, _uuid: 'uuid-g2', monto: 100 },
    ]

    queueEncryptedEntityResponse(clientes)
    queueEncryptedEntityResponse(facturas)
    queueEncryptedEntityResponse(gastos)

    const stats = await dashboard.getStats()
    expect(stats.clientesActivos).toBe(2)
    expect(stats.ingresosTotales).toBe(1000)
    expect(stats.facturasPendientesCount).toBe(2)
    expect(stats.facturasPendientesTotal).toBe(700)
    expect(stats.gastosTotales).toBe(400)
    expect(stats.balanceNeto).toBe(600)
    expect(stats.facturasEmitidas).toBe(3)
    expect(stats.gastosRegistrados).toBe(2)
  })

  it('getStats handles empty data', async () => {
    queueEncryptedEntityResponse([])
    queueEncryptedEntityResponse([])
    queueEncryptedEntityResponse([])

    const stats = await dashboard.getStats()
    expect(stats.clientesActivos).toBe(0)
    expect(stats.ingresosTotales).toBe(0)
    expect(stats.balanceNeto).toBe(0)
  })
})

// ============================================
// Entity CRUD error handling
// ============================================
describe('Entity CRUD Error Handling', () => {
  it('updateEntity throws when entity not found', async () => {
    // Calling update for non-existent entity
    await expect(departamentos.update(999, { nombre: 'Test' }))
      .rejects.toThrow('Entity not found: departamento#999')
  })

  it('deleteEntity throws when entity not found', async () => {
    await expect(departamentos.delete(999))
      .rejects.toThrow('Entity not found: departamento#999')
  })

  it('server error propagates correctly', async () => {
    queueResponse({ message: 'Internal Server Error' }, 500)

    await expect(departamentos.create({ nombre: 'Test' }))
      .rejects.toThrow('Internal Server Error')
  })

  it('auth error propagates correctly', async () => {
    queueResponse({ message: 'Unauthorized' }, 401)

    await expect(departamentos.create({ nombre: 'Test' }))
      .rejects.toThrow('Unauthorized')
  })
})

// ============================================
// Multiple creates maintain unique IDs
// ============================================
describe('ID uniqueness across creates', () => {
  it('sequential creates produce unique IDs', async () => {
    const ids = new Set<number>()
    for (let i = 0; i < 10; i++) {
      queueOkResponse()
      const result = await departamentos.create({ nombre: `Dept ${i}` })
      expect(ids.has(result.id)).toBe(false)
      ids.add(result.id)
    }
    expect(ids.size).toBe(10)
  })

  it('creates across entity types maintain separate counters', async () => {
    queueOkResponse()
    const dept = await departamentos.create({ nombre: 'IT' })
    queueOkResponse()
    queueEncryptedEntityResponse([]) // departamentos fetch during empleado create
    const emp = await empleados.create({ nombre: 'Juan', apellidos: 'Test' })
    queueOkResponse()
    const cat = await categoriasGasto.create({ nombre: 'Office' })

    // Each entity type starts at 1
    expect(dept.id).toBe(1)
    expect(emp.id).toBe(1)
    expect(cat.id).toBe(1)
  })
})

// ============================================
// Cache behavior during CRUD
// ============================================
describe('Cache behavior', () => {
  it('getAll populates cache, second call uses cache', async () => {
    const dept = { id: 1, _uuid: 'uuid-d1', nombre: 'IT' }
    queueEncryptedEntityResponse([dept])
    // Also need to queue for empleados since getAll calls it
    queueEncryptedEntityResponse([])

    await departamentos.getAll()

    // Second call should use cache (no new server requests)
    const initialRequestCount = requestLog.length
    // Queue sync response (background sync will fire)
    queueResponse({ data: [], deleted: [] })
    // Also need empleados again
    queueEncryptedEntityResponse([])

    const result = await departamentos.getAll()
    expect(result).toHaveLength(1)
    expect(result[0].nombre).toBe('IT')
  })

  it('create updates cache optimistically', async () => {
    // First, populate cache
    queueEncryptedEntityResponse([])
    queueEncryptedEntityResponse([]) // empleados for getAll

    await departamentos.getAll()

    // Create new department
    queueOkResponse()
    await departamentos.create({ nombre: 'Sales' })

    // getAll should return the new department from cache
    // Background sync
    queueResponse({ data: [], deleted: [] })
    queueEncryptedEntityResponse([]) // empleados

    const result = await departamentos.getAll()
    expect(result.some(d => d.nombre === 'Sales')).toBe(true)
  })

  it('invalidateCache forces re-fetch', async () => {
    const dept = { id: 1, _uuid: 'uuid-d1', nombre: 'Old Name' }
    queueEncryptedEntityResponse([dept])
    queueEncryptedEntityResponse([]) // empleados

    await departamentos.getAll()

    // Invalidate
    invalidateCache('departamento')

    // Now getAll should fetch from server again
    const updatedDept = { id: 1, _uuid: 'uuid-d1', nombre: 'New Name' }
    queueEncryptedEntityResponse([updatedDept])
    queueEncryptedEntityResponse([]) // empleados

    const result = await departamentos.getAll()
    expect(result[0].nombre).toBe('New Name')
  })
})
