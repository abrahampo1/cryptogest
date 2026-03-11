import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPain001Xml, buildPain008Xml } from '../generateSEPAXml'

// Helper to create a basic SEPA config
function createConfig(overrides?: Partial<{
  ordenante: string
  ordenanteIBAN: string
  ordenanteBIC: string
  ordenanteNIF: string
  idAcreedor: string
}>) {
  return {
    ordenante: 'Empresa Test S.L.',
    ordenanteIBAN: 'ES91 2100 0418 4502 0005 1332',
    ordenanteBIC: 'CAIXESBBXXX',
    ordenanteNIF: 'B12345678',
    ...overrides,
  }
}

function createCreditTransferItem(overrides?: Partial<{
  id: string
  nombre: string
  iban: string
  bic: string
  importe: number
  concepto: string
}>) {
  return {
    id: 'TX-001',
    nombre: 'Proveedor Test',
    iban: 'ES79 2100 0813 6101 2345 6789',
    importe: 1500.50,
    concepto: 'Pago factura F2026-001',
    ...overrides,
  }
}

function createDirectDebitItem(overrides?: Partial<{
  id: string
  nombre: string
  iban: string
  bic: string
  importe: number
  concepto: string
  mandatoId: string
  mandatoFecha: string
}>) {
  return {
    id: 'DD-001',
    nombre: 'Cliente Deudor',
    iban: 'ES79 2100 0813 6101 2345 6789',
    importe: 250.00,
    concepto: 'Cuota mensual',
    mandatoId: 'MND-001',
    mandatoFecha: '2025-01-15',
    ...overrides,
  }
}

describe('buildPain001Xml (Credit Transfer)', () => {
  const fecha = new Date('2026-03-15')

  it('generates valid XML with correct namespace', () => {
    const config = createConfig()
    const items = [createCreditTransferItem()]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(result.xml).toContain('urn:iso:std:iso:20022:tech:xsd:pain.001.001.03')
    expect(result.xml).toContain('<CstmrCdtTrfInitn>')
  })

  it('returns referencia and importeTotal', () => {
    const config = createConfig()
    const items = [createCreditTransferItem({ importe: 100 }), createCreditTransferItem({ id: 'TX-002', importe: 200 })]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.referencia).toMatch(/^CRYPTOGEST-\d{14}-[A-Z0-9]{6}$/)
    expect(result.importeTotal).toBe(300)
  })

  it('includes correct number of transactions', () => {
    const config = createConfig()
    const items = [
      createCreditTransferItem({ id: 'TX-001' }),
      createCreditTransferItem({ id: 'TX-002' }),
      createCreditTransferItem({ id: 'TX-003' }),
    ]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('<NbOfTxs>3</NbOfTxs>')
  })

  it('formats amounts with two decimals', () => {
    const config = createConfig()
    const items = [createCreditTransferItem({ importe: 1500.5 })]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('1500.50')
  })

  it('includes payment method TRF', () => {
    const config = createConfig()
    const items = [createCreditTransferItem()]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('<PmtMtd>TRF</PmtMtd>')
  })

  it('includes SEPA service level', () => {
    const config = createConfig()
    const items = [createCreditTransferItem()]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('<SvcLvl>')
    expect(result.xml).toContain('<Cd>SEPA</Cd>')
  })

  it('includes debtor (ordenante) information', () => {
    const config = createConfig()
    const items = [createCreditTransferItem()]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('<Nm>Empresa Test S.L.</Nm>')
    expect(result.xml).toContain('<IBAN>ES9121000418450200051332</IBAN>')
    expect(result.xml).toContain('<BIC>CAIXESBBXXX</BIC>')
  })

  it('strips spaces from IBAN', () => {
    const config = createConfig({ ordenanteIBAN: 'ES91 2100 0418 4502 0005 1332' })
    const items = [createCreditTransferItem({ iban: 'ES79 2100 0813 6101 2345 6789' })]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('<IBAN>ES9121000418450200051332</IBAN>')
    expect(result.xml).toContain('<IBAN>ES7921000813610123456789</IBAN>')
  })

  it('includes creditor BIC when provided', () => {
    const config = createConfig()
    const items = [createCreditTransferItem({ bic: 'BBVAESMMXXX' })]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('<CdtrAgt>')
    expect(result.xml).toContain('<BIC>BBVAESMMXXX</BIC>')
  })

  it('omits creditor BIC section when not provided', () => {
    const config = createConfig()
    const items = [createCreditTransferItem()]
    // Item doesn't have bic field
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).not.toContain('<CdtrAgt>')
  })

  it('uses NOTPROVIDED when ordenante BIC is missing', () => {
    const config = createConfig({ ordenanteBIC: undefined })
    const items = [createCreditTransferItem()]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('<Id>NOTPROVIDED</Id>')
  })

  it('includes execution date', () => {
    const config = createConfig()
    const items = [createCreditTransferItem()]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('<ReqdExctnDt>2026-03-15</ReqdExctnDt>')
  })

  it('includes ordenante NIF with TXID scheme', () => {
    const config = createConfig({ ordenanteNIF: 'B99887766' })
    const items = [createCreditTransferItem()]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('<Id>B99887766</Id>')
    expect(result.xml).toContain('<Cd>TXID</Cd>')
  })

  it('includes remittance info (concepto)', () => {
    const config = createConfig()
    const items = [createCreditTransferItem({ concepto: 'Pago servicio mensual' })]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('<Ustrd>Pago servicio mensual</Ustrd>')
  })

  it('escapes XML special characters', () => {
    const config = createConfig({ ordenante: 'Empresa & "Test" <S.L.>' })
    const items = [createCreditTransferItem({ nombre: "O'Brien & Sons", concepto: 'Pago <especial>' })]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('Empresa &amp; &quot;Test&quot; &lt;S.L.&gt;')
    expect(result.xml).toContain("O&apos;Brien &amp; Sons")
    expect(result.xml).toContain('Pago &lt;especial&gt;')
  })

  it('generates sequential instruction IDs', () => {
    const config = createConfig()
    const items = [
      createCreditTransferItem({ id: 'TX-001' }),
      createCreditTransferItem({ id: 'TX-002' }),
    ]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('<InstrId>INSTR-1</InstrId>')
    expect(result.xml).toContain('<InstrId>INSTR-2</InstrId>')
  })

  it('includes charge bearer SLEV', () => {
    const config = createConfig()
    const items = [createCreditTransferItem()]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.xml).toContain('<ChrgBr>SLEV</ChrgBr>')
  })

  it('calculates correct control sum for multiple items', () => {
    const config = createConfig()
    const items = [
      createCreditTransferItem({ importe: 100.50 }),
      createCreditTransferItem({ id: 'TX-002', importe: 200.75 }),
      createCreditTransferItem({ id: 'TX-003', importe: 50.25 }),
    ]
    const result = buildPain001Xml(config, items, fecha)

    expect(result.importeTotal).toBe(351.50)
    expect(result.xml).toContain('<CtrlSum>351.50</CtrlSum>')
  })
})

describe('buildPain008Xml (Direct Debit)', () => {
  const fecha = new Date('2026-04-01')

  it('generates valid XML with correct namespace', () => {
    const config = createConfig({ idAcreedor: 'ES12345B12345678' })
    const items = [createDirectDebitItem()]
    const result = buildPain008Xml(config, items, fecha)

    expect(result.xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(result.xml).toContain('urn:iso:std:iso:20022:tech:xsd:pain.008.001.02')
    expect(result.xml).toContain('<CstmrDrctDbtInitn>')
  })

  it('throws when idAcreedor is missing', () => {
    const config = createConfig()
    const items = [createDirectDebitItem()]

    expect(() => buildPain008Xml(config, items, fecha)).toThrow('ID Acreedor SEPA is required for pain.008')
  })

  it('returns referencia and importeTotal', () => {
    const config = createConfig({ idAcreedor: 'ES12345B12345678' })
    const items = [
      createDirectDebitItem({ importe: 100 }),
      createDirectDebitItem({ id: 'DD-002', importe: 150 }),
    ]
    const result = buildPain008Xml(config, items, fecha)

    expect(result.referencia).toMatch(/^CRYPTOGEST-\d{14}-[A-Z0-9]{6}$/)
    expect(result.importeTotal).toBe(250)
  })

  it('includes payment method DD', () => {
    const config = createConfig({ idAcreedor: 'ES12345B12345678' })
    const items = [createDirectDebitItem()]
    const result = buildPain008Xml(config, items, fecha)

    expect(result.xml).toContain('<PmtMtd>DD</PmtMtd>')
  })

  it('includes CORE local instrument and RCUR sequence type', () => {
    const config = createConfig({ idAcreedor: 'ES12345B12345678' })
    const items = [createDirectDebitItem()]
    const result = buildPain008Xml(config, items, fecha)

    expect(result.xml).toContain('<Cd>CORE</Cd>')
    expect(result.xml).toContain('<SeqTp>RCUR</SeqTp>')
  })

  it('includes creditor scheme ID (idAcreedor)', () => {
    const config = createConfig({ idAcreedor: 'ES98765B99887766' })
    const items = [createDirectDebitItem()]
    const result = buildPain008Xml(config, items, fecha)

    expect(result.xml).toContain('<CdtrSchmeId>')
    expect(result.xml).toContain('<Id>ES98765B99887766</Id>')
    expect(result.xml).toContain('<Prtry>SEPA</Prtry>')
  })

  it('includes mandate information', () => {
    const config = createConfig({ idAcreedor: 'ES12345B12345678' })
    const items = [createDirectDebitItem({ mandatoId: 'MND-2026-001', mandatoFecha: '2026-01-01' })]
    const result = buildPain008Xml(config, items, fecha)

    expect(result.xml).toContain('<MndtId>MND-2026-001</MndtId>')
    expect(result.xml).toContain('<DtOfSgntr>2026-01-01</DtOfSgntr>')
  })

  it('includes collection date', () => {
    const config = createConfig({ idAcreedor: 'ES12345B12345678' })
    const items = [createDirectDebitItem()]
    const result = buildPain008Xml(config, items, fecha)

    expect(result.xml).toContain('<ReqdColltnDt>2026-04-01</ReqdColltnDt>')
  })

  it('includes debtor BIC when provided', () => {
    const config = createConfig({ idAcreedor: 'ES12345B12345678' })
    const items = [createDirectDebitItem({ bic: 'BBVAESMMXXX' })]
    const result = buildPain008Xml(config, items, fecha)

    expect(result.xml).toContain('<DbtrAgt>')
    expect(result.xml).toContain('<BIC>BBVAESMMXXX</BIC>')
  })

  it('uses NOTPROVIDED when debtor BIC is missing', () => {
    const config = createConfig({ idAcreedor: 'ES12345B12345678' })
    const items = [createDirectDebitItem()] // no bic
    const result = buildPain008Xml(config, items, fecha)

    // Should contain NOTPROVIDED for the debtor agent
    expect(result.xml).toContain('<Id>NOTPROVIDED</Id>')
  })

  it('uses NOTPROVIDED when creditor (ordenante) BIC is missing', () => {
    const config = createConfig({ idAcreedor: 'ES12345B12345678', ordenanteBIC: undefined })
    const items = [createDirectDebitItem()]
    const result = buildPain008Xml(config, items, fecha)

    // CdtrAgt should also get NOTPROVIDED
    expect(result.xml).toContain('<CdtrAgt>')
    expect(result.xml).toContain('<Id>NOTPROVIDED</Id>')
  })

  it('escapes special characters in direct debit items', () => {
    const config = createConfig({ idAcreedor: 'ES12345B12345678' })
    const items = [createDirectDebitItem({ nombre: 'Cliente & Asociados', concepto: 'Cuota "premium"' })]
    const result = buildPain008Xml(config, items, fecha)

    expect(result.xml).toContain('Cliente &amp; Asociados')
    expect(result.xml).toContain('Cuota &quot;premium&quot;')
  })

  it('strips spaces from debtor IBAN', () => {
    const config = createConfig({ idAcreedor: 'ES12345B12345678' })
    const items = [createDirectDebitItem({ iban: 'ES79 2100 0813 6101 2345 6789' })]
    const result = buildPain008Xml(config, items, fecha)

    expect(result.xml).toContain('<IBAN>ES7921000813610123456789</IBAN>')
  })

  it('calculates correct control sum for multiple items', () => {
    const config = createConfig({ idAcreedor: 'ES12345B12345678' })
    const items = [
      createDirectDebitItem({ importe: 50.25 }),
      createDirectDebitItem({ id: 'DD-002', importe: 75.75 }),
    ]
    const result = buildPain008Xml(config, items, fecha)

    expect(result.importeTotal).toBe(126)
    expect(result.xml).toContain('<CtrlSum>126.00</CtrlSum>')
  })

  it('generates sequential instruction IDs', () => {
    const config = createConfig({ idAcreedor: 'ES12345B12345678' })
    const items = [
      createDirectDebitItem({ id: 'DD-001' }),
      createDirectDebitItem({ id: 'DD-002' }),
      createDirectDebitItem({ id: 'DD-003' }),
    ]
    const result = buildPain008Xml(config, items, fecha)

    expect(result.xml).toContain('<InstrId>INSTR-1</InstrId>')
    expect(result.xml).toContain('<InstrId>INSTR-2</InstrId>')
    expect(result.xml).toContain('<InstrId>INSTR-3</InstrId>')
  })
})
