import { describe, it, expect, vi } from 'vitest'

// Mock i18n
vi.mock('@/i18n', () => ({
  default: {
    language: 'es',
    t: {
      bind: () => (key: string) => key,
    },
  },
}))

import { generatePayrollPdf } from '../generatePayrollPdf'

function createTestPayrollData(overrides?: {
  lineas?: any[]
  departamento?: { nombre: string } | null
  contratos?: any[]
  totalDevengado?: number
  totalDeducciones?: number
  liquidoPercibir?: number
}) {
  return {
    nomina: {
      id: 1,
      mes: 3,
      anio: 2026,
      totalDevengado: overrides?.totalDevengado ?? 2500.00,
      totalDeducciones: overrides?.totalDeducciones ?? 500.00,
      liquidoPercibir: overrides?.liquidoPercibir ?? 2000.00,
      baseCotizacionCC: 2500.00,
      baseCotizacionCP: 2500.00,
      ccEmpresa: 590.00,
      desempleoEmpresa: 137.50,
      fogasaEmpresa: 5.00,
      fpEmpresa: 15.00,
      atepEmpresa: 25.00,
      totalCosteSS: 772.50,
      costeTotal: 3272.50,
      lineas: overrides?.lineas ?? [
        { tipo: 'devengo', concepto: 'Salario base', importe: 2000.00, base: 0, porcentaje: 0 },
        { tipo: 'devengo', concepto: 'Plus convenio', importe: 500.00, base: 0, porcentaje: 0 },
        { tipo: 'deduccion', concepto: 'Contingencias comunes', importe: 118.75, base: 2500.00, porcentaje: 4.75 },
        { tipo: 'deduccion', concepto: 'Desempleo', importe: 38.75, base: 2500.00, porcentaje: 1.55 },
        { tipo: 'deduccion', concepto: 'IRPF', importe: 342.50, base: 2500.00, porcentaje: 13.70 },
      ],
      empleado: {
        id: 1,
        nombre: 'Juan',
        apellidos: 'García López',
        nif: '12345678A',
        numSeguridadSocial: '281234567890',
        grupoCotizacion: '1',
        categoriaProfesional: 'Ingeniero',
        departamento: overrides?.departamento !== undefined ? overrides.departamento : { nombre: 'Desarrollo' },
        contratos: overrides?.contratos ?? [
          { tipoContrato: 'Indefinido' },
        ],
      },
    },
    empresa: {
      nombre: 'Empresa Test S.L.',
      nif: 'B12345678',
      direccion: 'Calle Principal 1',
      codigoPostal: '28001',
      ciudad: 'Madrid',
      provincia: 'Madrid',
    },
  }
}

describe('generatePayrollPdf', () => {
  it('generates a valid jsPDF document', () => {
    const data = createTestPayrollData()
    const doc = generatePayrollPdf(data)
    expect(doc).toBeDefined()
    // jsPDF has an output method
    expect(typeof doc.output).toBe('function')
  })

  it('generates a PDF with content (non-empty output)', () => {
    const data = createTestPayrollData()
    const doc = generatePayrollPdf(data)
    const output = doc.output('arraybuffer')
    expect(output.byteLength).toBeGreaterThan(0)
  })

  it('handles employee with no department', () => {
    const data = createTestPayrollData({ departamento: null })
    const doc = generatePayrollPdf(data)
    expect(doc).toBeDefined()
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(0)
  })

  it('handles employee with no contracts', () => {
    const data = createTestPayrollData({ contratos: [] })
    const doc = generatePayrollPdf(data)
    expect(doc).toBeDefined()
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(0)
  })

  it('handles empty lineas array', () => {
    const data = createTestPayrollData({ lineas: [] })
    const doc = generatePayrollPdf(data)
    expect(doc).toBeDefined()
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(0)
  })

  it('handles only devengos (no deducciones)', () => {
    const data = createTestPayrollData({
      lineas: [
        { tipo: 'devengo', concepto: 'Salario base', importe: 2000.00, base: 0, porcentaje: 0 },
      ],
    })
    const doc = generatePayrollPdf(data)
    expect(doc).toBeDefined()
  })

  it('handles only deducciones (no devengos)', () => {
    const data = createTestPayrollData({
      lineas: [
        { tipo: 'deduccion', concepto: 'IRPF', importe: 300, base: 2000, porcentaje: 15 },
      ],
    })
    const doc = generatePayrollPdf(data)
    expect(doc).toBeDefined()
  })

  it('handles employee without numSeguridadSocial', () => {
    const data = createTestPayrollData()
    data.nomina.empleado.numSeguridadSocial = ''
    const doc = generatePayrollPdf(data)
    expect(doc).toBeDefined()
  })

  it('handles employee without categoriaProfesional', () => {
    const data = createTestPayrollData()
    data.nomina.empleado.categoriaProfesional = ''
    const doc = generatePayrollPdf(data)
    expect(doc).toBeDefined()
  })

  it('generates for different months', () => {
    for (const mes of [1, 6, 12]) {
      const data = createTestPayrollData()
      data.nomina.mes = mes
      const doc = generatePayrollPdf(data)
      expect(doc).toBeDefined()
      expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(0)
    }
  })

  it('handles zero amounts', () => {
    const data = createTestPayrollData({
      totalDevengado: 0,
      totalDeducciones: 0,
      liquidoPercibir: 0,
    })
    const doc = generatePayrollPdf(data)
    expect(doc).toBeDefined()
  })

  it('handles large amounts', () => {
    const data = createTestPayrollData({
      totalDevengado: 999999.99,
      totalDeducciones: 250000.50,
      liquidoPercibir: 749999.49,
    })
    const doc = generatePayrollPdf(data)
    expect(doc).toBeDefined()
  })

  it('handles deduction with zero porcentaje', () => {
    const data = createTestPayrollData({
      lineas: [
        { tipo: 'devengo', concepto: 'Salario', importe: 1000, base: 0, porcentaje: 0 },
        { tipo: 'deduccion', concepto: 'Anticipo', importe: 200, base: 0, porcentaje: 0 },
      ],
    })
    const doc = generatePayrollPdf(data)
    expect(doc).toBeDefined()
  })

  it('handles many line items', () => {
    const lineas = []
    for (let i = 0; i < 20; i++) {
      lineas.push({
        tipo: i < 10 ? 'devengo' : 'deduccion',
        concepto: `Concepto ${i + 1}`,
        importe: 100 + i,
        base: i < 10 ? 0 : 1000,
        porcentaje: i < 10 ? 0 : 5 + i,
      })
    }
    const data = createTestPayrollData({ lineas })
    const doc = generatePayrollPdf(data)
    expect(doc).toBeDefined()
  })
})
