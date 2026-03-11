import { describe, it, expect } from 'vitest'
import { PREVIEW_EMPRESA, PREVIEW_FACTURACION, PREVIEW_FACTURA } from '../invoicePreviewData'

describe('PREVIEW_EMPRESA', () => {
  it('has all required fields', () => {
    expect(PREVIEW_EMPRESA.nombre).toBeTruthy()
    expect(PREVIEW_EMPRESA.nif).toBeTruthy()
    expect(PREVIEW_EMPRESA.direccion).toBeTruthy()
    expect(PREVIEW_EMPRESA.codigoPostal).toBeTruthy()
    expect(PREVIEW_EMPRESA.ciudad).toBeTruthy()
    expect(PREVIEW_EMPRESA.provincia).toBeTruthy()
    expect(PREVIEW_EMPRESA.telefono).toBeTruthy()
    expect(PREVIEW_EMPRESA.email).toBeTruthy()
    expect(PREVIEW_EMPRESA.web).toBeTruthy()
  })

  it('has a valid NIF format', () => {
    expect(PREVIEW_EMPRESA.nif).toMatch(/^[A-Z]\d{8}$/)
  })
})

describe('PREVIEW_FACTURACION', () => {
  it('has footer text', () => {
    expect(PREVIEW_FACTURACION.piePagina).toBeTruthy()
    expect(typeof PREVIEW_FACTURACION.piePagina).toBe('string')
  })
})

describe('PREVIEW_FACTURA', () => {
  it('has required invoice fields', () => {
    expect(PREVIEW_FACTURA.numero).toBeTruthy()
    expect(PREVIEW_FACTURA.serie).toBe('F')
    expect(PREVIEW_FACTURA.fecha).toBeInstanceOf(Date)
    expect(PREVIEW_FACTURA.fechaVencimiento).toBeInstanceOf(Date)
  })

  it('has a client with all fields', () => {
    expect(PREVIEW_FACTURA.cliente).toBeDefined()
    expect(PREVIEW_FACTURA.cliente!.nombre).toBeTruthy()
    expect(PREVIEW_FACTURA.cliente!.nif).toBeTruthy()
    expect(PREVIEW_FACTURA.cliente!.email).toBeTruthy()
  })

  it('has line items', () => {
    expect(PREVIEW_FACTURA.lineas).toBeDefined()
    expect(PREVIEW_FACTURA.lineas!.length).toBeGreaterThan(0)
  })

  it('each line item has required fields', () => {
    for (const linea of PREVIEW_FACTURA.lineas!) {
      expect(linea.descripcion).toBeTruthy()
      expect(linea.cantidad).toBeGreaterThan(0)
      expect(linea.precioUnit).toBeGreaterThan(0)
      expect(typeof linea.subtotal).toBe('number')
      expect(typeof linea.total).toBe('number')
    }
  })

  it('totals are consistent', () => {
    expect(PREVIEW_FACTURA.subtotal).toBeGreaterThan(0)
    expect(PREVIEW_FACTURA.total).toBeGreaterThan(PREVIEW_FACTURA.subtotal)
    expect(PREVIEW_FACTURA.totalImpuestos).toBeGreaterThan(0)
  })

  it('total equals subtotal + impuestos - retenciones', () => {
    const expected = PREVIEW_FACTURA.subtotal + PREVIEW_FACTURA.totalImpuestos - PREVIEW_FACTURA.totalRetenciones
    expect(PREVIEW_FACTURA.total).toBeCloseTo(expected, 2)
  })

  it('line item totals sum up to invoice subtotal', () => {
    const lineSubtotals = PREVIEW_FACTURA.lineas!.reduce((sum, l) => sum + l.subtotal, 0)
    expect(lineSubtotals).toBeCloseTo(PREVIEW_FACTURA.subtotal, 2)
  })

  it('has valid estado', () => {
    expect(['borrador', 'emitida', 'enviada', 'pagada', 'vencida', 'anulada']).toContain(PREVIEW_FACTURA.estado)
  })
})
