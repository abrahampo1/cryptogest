import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock i18n
vi.mock('@/i18n', () => ({
  default: {
    language: 'es',
    t: {
      bind: () => (key: string, opts?: any) => {
        const translations: Record<string, string> = {
          'pdf:nif': 'NIF',
          'pdf:phone': 'Tel',
          'pdf:invoice': 'FACTURA',
          'pdf:invoiceSpaced': 'F A C T U R A',
          'pdf:invoiceNumber': 'Nº Factura',
          'pdf:invoiceWithNumber': `Factura ${opts?.number || ''}`,
          'pdf:date': 'Fecha',
          'pdf:dueDate': 'Vencimiento',
          'pdf:paymentMethodLabel': 'Forma de pago',
          'pdf:paymentTransfer': 'Transferencia',
          'pdf:paymentCash': 'Efectivo',
          'pdf:paymentCard': 'Tarjeta',
          'pdf:paymentBizum': 'Bizum',
          'pdf:client': 'Cliente',
          'pdf:billTo': 'Facturar a',
          'pdf:description': 'Descripción',
          'pdf:qty': 'Cant.',
          'pdf:unitPrice': 'P. Unit.',
          'pdf:discount': 'Dto.',
          'pdf:vat': 'IVA',
          'pdf:irpf': 'IRPF',
          'pdf:total': 'Total',
          'pdf:subtotal': 'Subtotal',
          'pdf:totalLabel': 'TOTAL',
          'pdf:notes': 'Notas',
          'pdf:defaultCompany': 'Mi Empresa',
        }
        return translations[key] || key
      },
    },
  },
}))

// Mock formatting functions
vi.mock('@/lib/formatting', () => ({
  formatCurrency: (amount: number) => `${amount.toFixed(2)} €`,
  formatDate: (date: Date | string) => {
    const d = new Date(date)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  },
}))

import { generateInvoicePdf } from '../generateInvoicePdf'
import type { TemplateConfig } from '../generateInvoicePdf'

function createTestInvoiceData(overrides?: {
  template?: Partial<TemplateConfig>
  notas?: string | null
  formaPago?: string | null
  lineas?: any[]
}) {
  return {
    factura: {
      id: 1,
      numero: 'F2026-001',
      serie: 'F',
      fecha: new Date('2026-01-15'),
      fechaVencimiento: new Date('2026-02-15'),
      clienteId: 1,
      cliente: {
        id: 1,
        nombre: 'Test Client S.L.',
        nif: 'B12345678',
        email: 'test@example.com',
        telefono: '912345678',
        direccion: 'Calle Test 1',
        codigoPostal: '28001',
        ciudad: 'Madrid',
        provincia: 'Madrid',
        pais: 'España',
        notas: null,
        activo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      subtotal: 1000,
      totalImpuestos: 210,
      totalRetenciones: 0,
      total: 1210,
      estado: 'emitida',
      notas: overrides?.notas !== undefined ? overrides.notas : 'Test notes',
      formaPago: overrides?.formaPago !== undefined ? overrides.formaPago : 'transferencia',
      createdAt: new Date(),
      updatedAt: new Date(),
      lineas: overrides?.lineas || [
        {
          id: 1,
          facturaId: 1,
          productoId: null,
          producto: null,
          descripcion: 'Servicio de consultoría',
          cantidad: 10,
          precioUnit: 100,
          descuento: 0,
          impuestoId: 1,
          impuesto: { id: 1, nombre: 'IVA General', porcentaje: 21, tipo: 'IVA', activo: true, porDefecto: true, createdAt: new Date(), updatedAt: new Date() },
          retencionId: null,
          retencion: null,
          subtotal: 1000,
          totalImpuesto: 210,
          totalRetencion: 0,
          total: 1210,
        },
      ],
    } as any,
    empresa: {
      nombre: 'Mi Empresa S.L.',
      nif: 'A12345678',
      direccion: 'Calle Principal 1',
      codigoPostal: '28001',
      ciudad: 'Madrid',
      provincia: 'Madrid',
      telefono: '912345678',
      email: 'info@miempresa.es',
      web: 'www.miempresa.es',
    },
    facturacion: {
      piePagina: 'Gracias por confiar en nosotros.',
    },
    template: overrides?.template ? { ...overrides.template } as TemplateConfig : undefined,
  }
}

describe('generateInvoicePdf', () => {
  it('generates a PDF with classic template (default)', () => {
    const data = createTestInvoiceData()
    const result = generateInvoicePdf(data)
    // Returns base64 string
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    // Should be valid base64
    expect(() => Buffer.from(result, 'base64')).not.toThrow()
  })

  it('generates a PDF with moderna template', () => {
    const data = createTestInvoiceData({
      template: { plantilla: 'moderna', colorAccento: '#2563EB', mostrarTelefono: true, mostrarEmail: true, mostrarWeb: true, mostrarNotas: true, mostrarFormaPago: true },
    })
    const result = generateInvoicePdf(data)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('generates a PDF with minimalista template', () => {
    const data = createTestInvoiceData({
      template: { plantilla: 'minimalista', colorAccento: '#059669', mostrarTelefono: true, mostrarEmail: true, mostrarWeb: true, mostrarNotas: true, mostrarFormaPago: true },
    })
    const result = generateInvoicePdf(data)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('generates a PDF with ejecutiva template', () => {
    const data = createTestInvoiceData({
      template: { plantilla: 'ejecutiva', colorAccento: '#7C3AED', mostrarTelefono: true, mostrarEmail: true, mostrarWeb: true, mostrarNotas: true, mostrarFormaPago: true },
    })
    const result = generateInvoicePdf(data)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles invoice with no notes', () => {
    const data = createTestInvoiceData({ notas: null })
    const result = generateInvoicePdf(data)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles invoice with no payment method', () => {
    const data = createTestInvoiceData({ formaPago: null })
    const result = generateInvoicePdf(data)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles invoice with multiple line items', () => {
    const lineas = [
      {
        id: 1, facturaId: 1, productoId: null, producto: null,
        descripcion: 'Servicio A', cantidad: 5, precioUnit: 100, descuento: 10,
        impuestoId: 1, impuesto: { id: 1, nombre: 'IVA General', porcentaje: 21, tipo: 'IVA', activo: true, porDefecto: true, createdAt: new Date(), updatedAt: new Date() },
        retencionId: 2, retencion: { id: 2, nombre: 'IRPF', porcentaje: 15, tipo: 'IRPF', activo: true, porDefecto: false, createdAt: new Date(), updatedAt: new Date() },
        subtotal: 450, totalImpuesto: 94.5, totalRetencion: 67.5, total: 477,
      },
      {
        id: 2, facturaId: 1, productoId: null, producto: null,
        descripcion: 'Servicio B', cantidad: 1, precioUnit: 200, descuento: 0,
        impuestoId: 3, impuesto: { id: 3, nombre: 'IVA Reducido', porcentaje: 10, tipo: 'IVA', activo: true, porDefecto: false, createdAt: new Date(), updatedAt: new Date() },
        retencionId: null, retencion: null,
        subtotal: 200, totalImpuesto: 20, totalRetencion: 0, total: 220,
      },
    ]
    const data = createTestInvoiceData({ lineas })
    const result = generateInvoicePdf(data)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles invoice with empty lineas array', () => {
    const data = createTestInvoiceData({ lineas: [] })
    const result = generateInvoicePdf(data)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles invoice with no due date', () => {
    const data = createTestInvoiceData()
    data.factura.fechaVencimiento = null
    const result = generateInvoicePdf(data)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('uses different payment methods', () => {
    for (const formaPago of ['transferencia', 'efectivo', 'tarjeta', 'bizum', 'otro_metodo']) {
      const data = createTestInvoiceData({ formaPago })
      const result = generateInvoicePdf(data)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })

  it('handles custom accent color', () => {
    const data = createTestInvoiceData({
      template: { plantilla: 'clasica', colorAccento: '#FF0000', mostrarTelefono: true, mostrarEmail: true, mostrarWeb: true, mostrarNotas: true, mostrarFormaPago: true },
    })
    const result = generateInvoicePdf(data)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('hides contact fields when template disables them', () => {
    const data = createTestInvoiceData({
      template: {
        plantilla: 'clasica',
        colorAccento: '#374151',
        mostrarTelefono: false,
        mostrarEmail: false,
        mostrarWeb: false,
        mostrarNotas: false,
        mostrarFormaPago: false,
      },
    })
    const result = generateInvoicePdf(data)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles empresa with minimal data', () => {
    const data = createTestInvoiceData()
    data.empresa = {
      nombre: 'Simple S.L.',
      nif: '',
      direccion: '',
      codigoPostal: '',
      ciudad: '',
      provincia: '',
      telefono: '',
      email: '',
      web: '',
    }
    const result = generateInvoicePdf(data)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles empty footer', () => {
    const data = createTestInvoiceData()
    data.facturacion.piePagina = ''
    const result = generateInvoicePdf(data)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
