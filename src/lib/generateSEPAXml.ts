// SEPA XML Generator - pain.001.001.03 (Credit Transfer) and pain.008.001.02 (Direct Debit)
// ISO 20022 compliant XML generation using template strings

interface SEPAConfig {
  ordenante: string
  ordenanteIBAN: string
  ordenanteBIC?: string
  ordenanteNIF: string
  idAcreedor?: string // Required for pain.008
}

interface CreditTransferItem {
  id: string
  nombre: string
  iban: string
  bic?: string
  importe: number
  concepto: string
}

interface DirectDebitItem {
  id: string
  nombre: string
  iban: string
  bic?: string
  importe: number
  concepto: string
  mandatoId: string
  mandatoFecha: string // YYYY-MM-DD
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatAmount(amount: number): string {
  return amount.toFixed(2)
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function formatDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '')
}

function generateMsgId(): string {
  const now = new Date()
  const timestamp = now.toISOString().replace(/[-:T.Z]/g, '').substring(0, 14)
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `CRYPTOGEST-${timestamp}-${random}`
}

export function buildPain001Xml(
  config: SEPAConfig,
  items: CreditTransferItem[],
  fechaEjecucion: Date
): { xml: string; referencia: string; importeTotal: number } {
  const msgId = generateMsgId()
  const creationDateTime = formatDateTime(new Date())
  const requestedDate = formatDate(fechaEjecucion)
  const importeTotal = items.reduce((sum, item) => sum + item.importe, 0)
  const numTransactions = items.length

  const pmtInfId = `PMT-${msgId}`

  const transactionsXml = items.map((item, idx) => `
      <CdtTrfTxInf>
        <PmtId>
          <InstrId>INSTR-${idx + 1}</InstrId>
          <EndToEndId>${escapeXml(item.id)}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${formatAmount(item.importe)}</InstdAmt>
        </Amt>${item.bic ? `
        <CdtrAgt>
          <FinInstnId>
            <BIC>${escapeXml(item.bic)}</BIC>
          </FinInstnId>
        </CdtrAgt>` : ''}
        <Cdtr>
          <Nm>${escapeXml(item.nombre)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${escapeXml(item.iban.replace(/\s/g, ''))}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${escapeXml(item.concepto)}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${creationDateTime}</CreDtTm>
      <NbOfTxs>${numTransactions}</NbOfTxs>
      <CtrlSum>${formatAmount(importeTotal)}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(config.ordenante)}</Nm>
        <Id>
          <OrgId>
            <Othr>
              <Id>${escapeXml(config.ordenanteNIF)}</Id>
              <SchmeNm>
                <Cd>TXID</Cd>
              </SchmeNm>
            </Othr>
          </OrgId>
        </Id>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(pmtInfId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${numTransactions}</NbOfTxs>
      <CtrlSum>${formatAmount(importeTotal)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${requestedDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(config.ordenante)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${escapeXml(config.ordenanteIBAN.replace(/\s/g, ''))}</IBAN>
        </Id>
      </DbtrAcct>${config.ordenanteBIC ? `
      <DbtrAgt>
        <FinInstnId>
          <BIC>${escapeXml(config.ordenanteBIC)}</BIC>
        </FinInstnId>
      </DbtrAgt>` : `
      <DbtrAgt>
        <FinInstnId>
          <Othr>
            <Id>NOTPROVIDED</Id>
          </Othr>
        </FinInstnId>
      </DbtrAgt>`}
      <ChrgBr>SLEV</ChrgBr>${transactionsXml}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`

  return { xml, referencia: msgId, importeTotal }
}

export function buildPain008Xml(
  config: SEPAConfig,
  items: DirectDebitItem[],
  fechaEjecucion: Date
): { xml: string; referencia: string; importeTotal: number } {
  if (!config.idAcreedor) {
    throw new Error('ID Acreedor SEPA is required for pain.008')
  }

  const msgId = generateMsgId()
  const creationDateTime = formatDateTime(new Date())
  const requestedDate = formatDate(fechaEjecucion)
  const importeTotal = items.reduce((sum, item) => sum + item.importe, 0)
  const numTransactions = items.length

  const pmtInfId = `DD-${msgId}`

  const transactionsXml = items.map((item, idx) => `
      <DrctDbtTxInf>
        <PmtId>
          <InstrId>INSTR-${idx + 1}</InstrId>
          <EndToEndId>${escapeXml(item.id)}</EndToEndId>
        </PmtId>
        <InstdAmt Ccy="EUR">${formatAmount(item.importe)}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${escapeXml(item.mandatoId)}</MndtId>
            <DtOfSgntr>${escapeXml(item.mandatoFecha)}</DtOfSgntr>
          </MndtRltdInf>
        </DrctDbtTx>${item.bic ? `
        <DbtrAgt>
          <FinInstnId>
            <BIC>${escapeXml(item.bic)}</BIC>
          </FinInstnId>
        </DbtrAgt>` : `
        <DbtrAgt>
          <FinInstnId>
            <Othr>
              <Id>NOTPROVIDED</Id>
            </Othr>
          </FinInstnId>
        </DbtrAgt>`}
        <Dbtr>
          <Nm>${escapeXml(item.nombre)}</Nm>
        </Dbtr>
        <DbtrAcct>
          <Id>
            <IBAN>${escapeXml(item.iban.replace(/\s/g, ''))}</IBAN>
          </Id>
        </DbtrAcct>
        <RmtInf>
          <Ustrd>${escapeXml(item.concepto)}</Ustrd>
        </RmtInf>
      </DrctDbtTxInf>`).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${creationDateTime}</CreDtTm>
      <NbOfTxs>${numTransactions}</NbOfTxs>
      <CtrlSum>${formatAmount(importeTotal)}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(config.ordenante)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(pmtInfId)}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>${numTransactions}</NbOfTxs>
      <CtrlSum>${formatAmount(importeTotal)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
        <LclInstrm>
          <Cd>CORE</Cd>
        </LclInstrm>
        <SeqTp>RCUR</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${requestedDate}</ReqdColltnDt>
      <Cdtr>
        <Nm>${escapeXml(config.ordenante)}</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <IBAN>${escapeXml(config.ordenanteIBAN.replace(/\s/g, ''))}</IBAN>
        </Id>
      </CdtrAcct>${config.ordenanteBIC ? `
      <CdtrAgt>
        <FinInstnId>
          <BIC>${escapeXml(config.ordenanteBIC)}</BIC>
        </FinInstnId>
      </CdtrAgt>` : `
      <CdtrAgt>
        <FinInstnId>
          <Othr>
            <Id>NOTPROVIDED</Id>
          </Othr>
        </FinInstnId>
      </CdtrAgt>`}
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId>
        <Id>
          <PrvtId>
            <Othr>
              <Id>${escapeXml(config.idAcreedor)}</Id>
              <SchmeNm>
                <Prtry>SEPA</Prtry>
              </SchmeNm>
            </Othr>
          </PrvtId>
        </Id>
      </CdtrSchmeId>${transactionsXml}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`

  return { xml, referencia: msgId, importeTotal }
}
