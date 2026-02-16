import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface EmpresaConfig {
  nombre: string
  nif: string
  direccion: string
  codigoPostal: string
  ciudad: string
  provincia: string
  telefono: string
  email: string
  web: string
}

interface FacturacionConfig {
  piePagina: string
}

export interface TemplateConfig {
  plantilla: 'clasica' | 'moderna' | 'minimalista' | 'ejecutiva'
  colorAccento: string
  logoBase64?: string
  mostrarTelefono: boolean
  mostrarEmail: boolean
  mostrarWeb: boolean
  mostrarNotas: boolean
  mostrarFormaPago: boolean
}

interface InvoiceData {
  factura: Factura
  empresa: EmpresaConfig
  facturacion: FacturacionConfig
  template?: TemplateConfig
}

const DEFAULT_TEMPLATE: TemplateConfig = {
  plantilla: 'clasica',
  colorAccento: '#374151',
  mostrarTelefono: true,
  mostrarEmail: true,
  mostrarWeb: true,
  mostrarNotas: true,
  mostrarFormaPago: true,
}

// ===== Helpers =====

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

function accentTint(hex: string, factor: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  return [
    Math.round(r + (255 - r) * factor),
    Math.round(g + (255 - g) * factor),
    Math.round(b + (255 - b) * factor),
  ]
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount)

const formatDate = (date: Date | string): string =>
  new Date(date).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

const formaPagoLabels: Record<string, string> = {
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  bizum: 'Bizum',
}

function getEmpresaContactLines(empresa: EmpresaConfig, template: TemplateConfig): string[] {
  const lines: string[] = []
  if (empresa.nif) lines.push(`NIF: ${empresa.nif}`)
  if (empresa.direccion) lines.push(empresa.direccion)
  const cityLine = [empresa.codigoPostal, empresa.ciudad, empresa.provincia].filter(Boolean).join(', ')
  if (cityLine) lines.push(cityLine)
  if (template.mostrarTelefono && empresa.telefono) lines.push(`Tel: ${empresa.telefono}`)
  if (template.mostrarEmail && empresa.email) lines.push(empresa.email)
  if (template.mostrarWeb && empresa.web) lines.push(empresa.web)
  return lines
}

function getClienteLines(factura: Factura): string[] {
  const lines: string[] = []
  if (factura.cliente?.nif) lines.push(`NIF: ${factura.cliente.nif}`)
  if (factura.cliente?.direccion) lines.push(factura.cliente.direccion)
  const cityLine = [factura.cliente?.codigoPostal, factura.cliente?.ciudad, factura.cliente?.provincia].filter(Boolean).join(', ')
  if (cityLine) lines.push(cityLine)
  if (factura.cliente?.email) lines.push(factura.cliente.email)
  return lines
}

function getFacturaDetails(factura: Factura, template: TemplateConfig): [string, string][] {
  const details: [string, string][] = [
    ['N\u00ba:', factura.numero],
    ['Fecha:', formatDate(factura.fecha)],
  ]
  if (factura.fechaVencimiento) {
    details.push(['Vencimiento:', formatDate(factura.fechaVencimiento)])
  }
  if (template.mostrarFormaPago && factura.formaPago) {
    details.push(['F. Pago:', formaPagoLabels[factura.formaPago] || factura.formaPago])
  }
  return details
}

function getTableData(factura: Factura) {
  const headers = [['Descripci\u00f3n', 'Cant.', 'P. Unitario', 'Dto.', 'IVA', 'IRPF', 'Total']]
  const body = (factura.lineas || []).map((linea) => {
    const impuestoPct = linea.impuesto ? `${linea.impuesto.porcentaje}%` : '-'
    const retencionPct = linea.retencion ? `${linea.retencion.porcentaje}%` : '-'
    const descuento = linea.descuento > 0 ? `${linea.descuento}%` : '-'
    return [
      linea.descripcion,
      String(linea.cantidad),
      formatCurrency(linea.precioUnit),
      descuento,
      impuestoPct,
      retencionPct,
      formatCurrency(linea.total),
    ]
  })
  return { headers, body }
}

function getTaxBreakdowns(factura: Factura) {
  const ivaBreakdown = new Map<number, { base: number; cuota: number }>()
  const irpfBreakdown = new Map<number, { base: number; cuota: number }>()

  ;(factura.lineas || []).forEach((linea) => {
    if (linea.impuesto) {
      const pct = linea.impuesto.porcentaje
      const existing = ivaBreakdown.get(pct) || { base: 0, cuota: 0 }
      existing.base += linea.subtotal
      existing.cuota += linea.totalImpuesto
      ivaBreakdown.set(pct, existing)
    }
    if (linea.retencion) {
      const pct = linea.retencion.porcentaje
      const existing = irpfBreakdown.get(pct) || { base: 0, cuota: 0 }
      existing.base += linea.subtotal
      existing.cuota += linea.totalRetencion
      irpfBreakdown.set(pct, existing)
    }
  })

  return { ivaBreakdown, irpfBreakdown }
}

function renderTotalsBlock(
  doc: jsPDF,
  factura: Factura,
  y: number,
  margin: number,
  pageWidth: number,
  accentColor: [number, number, number],
  font: string,
): number {
  const { ivaBreakdown, irpfBreakdown } = getTaxBreakdowns(factura)
  const totalsX = pageWidth - margin - 70
  const valuesX = pageWidth - margin

  doc.setFontSize(8)
  doc.setFont(font, 'normal')

  doc.text('Subtotal:', totalsX, y)
  doc.text(formatCurrency(factura.subtotal), valuesX, y, { align: 'right' })
  y += 5

  ivaBreakdown.forEach((data, pct) => {
    doc.text(`IVA ${pct}%:`, totalsX, y)
    doc.text(`+${formatCurrency(data.cuota)}`, valuesX, y, { align: 'right' })
    y += 4
  })

  irpfBreakdown.forEach((data, pct) => {
    doc.setTextColor(200, 100, 0)
    doc.text(`IRPF ${pct}%:`, totalsX, y)
    doc.text(`-${formatCurrency(data.cuota)}`, valuesX, y, { align: 'right' })
    doc.setTextColor(0, 0, 0)
    y += 4
  })

  y += 1
  doc.setDrawColor(...accentColor)
  doc.setLineWidth(0.4)
  doc.line(totalsX, y, valuesX, y)
  y += 5

  doc.setFontSize(11)
  doc.setFont(font, 'bold')
  doc.text('TOTAL:', totalsX, y)
  doc.text(formatCurrency(factura.total), valuesX, y, { align: 'right' })

  return y + 10
}

function renderNotesBlock(
  doc: jsPDF,
  factura: Factura,
  y: number,
  margin: number,
  contentWidth: number,
  template: TemplateConfig,
  font: string,
): number {
  if (!template.mostrarNotas || !factura.notas) return y

  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage()
    y = margin
  }

  doc.setFontSize(7.5)
  doc.setFont(font, 'bold')
  doc.setTextColor(100, 100, 100)
  doc.text('NOTAS', margin, y)
  doc.setTextColor(0, 0, 0)
  y += 4

  doc.setFont(font, 'normal')
  doc.setFontSize(8)
  const notasLines = doc.splitTextToSize(factura.notas, contentWidth)
  doc.text(notasLines, margin, y)
  y += notasLines.length * 3.5 + 4

  return y
}

function renderFooter(
  doc: jsPDF,
  facturacion: FacturacionConfig,
  margin: number,
  pageWidth: number,
  contentWidth: number,
  font: string,
) {
  if (!facturacion.piePagina) return

  const pageHeight = doc.internal.pageSize.getHeight()
  const totalPages = doc.getNumberOfPages()

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setFont(font, 'normal')
    doc.setTextColor(130, 130, 130)
    const footerLines = doc.splitTextToSize(facturacion.piePagina, contentWidth)
    const footerY = pageHeight - margin
    doc.text(footerLines, pageWidth / 2, footerY, { align: 'center' })
    doc.setTextColor(0, 0, 0)
  }
}

function addLogo(doc: jsPDF, logoBase64: string, x: number, y: number, maxW: number, maxH: number) {
  try {
    const props = doc.getImageProperties(logoBase64)
    const ratio = props.width / props.height
    let w = maxW
    let h = w / ratio
    if (h > maxH) {
      h = maxH
      w = h * ratio
    }
    doc.addImage(logoBase64, 'PNG', x, y, w, h)
  } catch {
    // Logo could not be loaded, silently skip
  }
}

const TABLE_COLUMN_STYLES = {
  0: { cellWidth: 'auto' as const },
  1: { halign: 'center' as const, cellWidth: 14 },
  2: { halign: 'right' as const, cellWidth: 24 },
  3: { halign: 'center' as const, cellWidth: 14 },
  4: { halign: 'center' as const, cellWidth: 14 },
  5: { halign: 'center' as const, cellWidth: 14 },
  6: { halign: 'right' as const, cellWidth: 24 },
}

// ===== Template Renderers =====

function renderClasica(doc: jsPDF, data: InvoiceData, template: TemplateConfig) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  const accent = hexToRgb(template.colorAccento)
  let y = margin
  const logoSize = 10

  // Logo + Company name
  if (template.logoBase64) {
    addLogo(doc, template.logoBase64, margin, y, logoSize, logoSize)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(data.empresa.nombre || 'Mi Empresa', margin + logoSize + 3, y + 6)
    y += logoSize + 3
  } else {
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(data.empresa.nombre || 'Mi Empresa', margin, y + 6)
    y += 12
  }

  // Invoice title
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('FACTURA', pageWidth - margin, margin + 6, { align: 'right' })

  // Empresa details
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  const empresaLines = getEmpresaContactLines(data.empresa, template)
  empresaLines.forEach((line) => {
    doc.text(line, margin, y)
    y += 3.5
  })

  // Factura details (right column)
  const facturaInfoStartY = margin + 12
  let fy = facturaInfoStartY
  doc.setFontSize(9)
  const rightCol = pageWidth - margin

  getFacturaDetails(data.factura, template).forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal')
    doc.text(label, rightCol - 45, fy)
    doc.setFont('helvetica', 'bold')
    doc.text(value, rightCol, fy, { align: 'right' })
    fy += 4
  })

  y = Math.max(y, fy) + 6

  // Divider
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  // Client
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 100, 100)
  doc.text('CLIENTE', margin, y)
  doc.setTextColor(0, 0, 0)
  y += 4

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(data.factura.cliente?.nombre || '', margin, y)
  y += 4

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  getClienteLines(data.factura).forEach((line) => {
    doc.text(line, margin, y)
    y += 3.5
  })
  y += 6

  // Table
  const { headers, body } = getTableData(data.factura)
  autoTable(doc, {
    startY: y,
    head: headers,
    body,
    theme: 'striped',
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2.5, font: 'helvetica' },
    headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: TABLE_COLUMN_STYLES,
    alternateRowStyles: { fillColor: [248, 249, 250] },
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // Totals
  y = renderTotalsBlock(doc, data.factura, y, margin, pageWidth, accent, 'helvetica')

  // Notes
  y = renderNotesBlock(doc, data.factura, y, margin, contentWidth, template, 'helvetica')

  // Footer
  renderFooter(doc, data.facturacion, margin, pageWidth, contentWidth, 'helvetica')
}

function renderModerna(doc: jsPDF, data: InvoiceData, template: TemplateConfig) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  const accent = hexToRgb(template.colorAccento)
  const tint = accentTint(template.colorAccento, 0.9)
  let y = 0

  const logoSize = 10

  // Top accent bar
  doc.setFillColor(...accent)
  doc.rect(0, 0, pageWidth, 8, 'F')
  y = 16

  // Logo + Company name
  if (template.logoBase64) {
    addLogo(doc, template.logoBase64, margin, y, logoSize, logoSize)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(data.empresa.nombre || 'Mi Empresa', margin + logoSize + 3, y + 5)
    y += logoSize + 3
  } else {
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(data.empresa.nombre || 'Mi Empresa', margin, y + 5)
    y += 10
  }

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  const empresaLines = getEmpresaContactLines(data.empresa, template)
  empresaLines.forEach((line) => {
    doc.text(line, margin, y)
    y += 3.5
  })

  y += 4

  // Invoice number in colored box
  const boxW = 70
  const boxH = 12
  const boxX = pageWidth - margin - boxW
  doc.setFillColor(...accent)
  doc.roundedRect(boxX, 14, boxW, boxH, 2, 2, 'F')
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(`FACTURA ${data.factura.numero}`, boxX + boxW / 2, 14 + boxH / 2 + 1, { align: 'center' })
  doc.setTextColor(0, 0, 0)

  // Factura details below box
  let fy = 14 + boxH + 4
  doc.setFontSize(8)
  const facturaDetails = getFacturaDetails(data.factura, template)
  facturaDetails.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal')
    doc.text(label, boxX, fy)
    doc.setFont('helvetica', 'bold')
    doc.text(value, boxX + boxW, fy, { align: 'right' })
    fy += 4
  })

  y = Math.max(y, fy) + 4

  // Client in gray box
  doc.setFillColor(245, 245, 245)
  const clientStartY = y
  const clientLines = getClienteLines(data.factura)
  const clientBoxH = 12 + clientLines.length * 3.5 + 4
  doc.roundedRect(margin, y, contentWidth, clientBoxH, 2, 2, 'F')
  y += 5

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 100, 100)
  doc.text('FACTURAR A:', margin + 4, y)
  doc.setTextColor(0, 0, 0)
  y += 4

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(data.factura.cliente?.nombre || '', margin + 4, y)
  y += 4

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  clientLines.forEach((line) => {
    doc.text(line, margin + 4, y)
    y += 3.5
  })

  y = clientStartY + clientBoxH + 6

  // Table with grid theme
  const { headers, body } = getTableData(data.factura)
  autoTable(doc, {
    startY: y,
    head: headers,
    body,
    theme: 'grid',
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2.5, font: 'helvetica', lineColor: [220, 220, 220], lineWidth: 0.3 },
    headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: TABLE_COLUMN_STYLES,
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // Totals in accent tint box
  const { ivaBreakdown, irpfBreakdown } = getTaxBreakdowns(data.factura)
  const totalsBoxW = 85
  const totalsBoxX = pageWidth - margin - totalsBoxW
  const totalsLines = 2 + ivaBreakdown.size + irpfBreakdown.size
  const totalsBoxH = totalsLines * 5 + 16
  doc.setFillColor(...tint)
  doc.roundedRect(totalsBoxX - 4, y - 4, totalsBoxW + 4, totalsBoxH, 2, 2, 'F')

  y = renderTotalsBlock(doc, data.factura, y, margin, pageWidth, accent, 'helvetica')

  // Notes
  y = renderNotesBlock(doc, data.factura, y, margin, contentWidth, template, 'helvetica')

  // Footer
  renderFooter(doc, data.facturacion, margin, pageWidth, contentWidth, 'helvetica')
}

function renderMinimalista(doc: jsPDF, data: InvoiceData, template: TemplateConfig) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  const accent = hexToRgb(template.colorAccento)
  let y = margin + 5

  const logoSize = 10

  // Logo
  if (template.logoBase64) {
    addLogo(doc, template.logoBase64, margin, y, logoSize, logoSize)
    doc.setFontSize(12)
    doc.setFont('courier', 'bold')
    doc.text(data.empresa.nombre || 'Mi Empresa', margin + logoSize + 3, y + 5)
    y += logoSize + 3
  } else {
    doc.setFontSize(12)
    doc.setFont('courier', 'bold')
    doc.text(data.empresa.nombre || 'Mi Empresa', margin, y + 4)
    y += 10
  }

  // "FACTURA" right-aligned, uppercase, spaced
  doc.setFontSize(11)
  doc.setFont('courier', 'normal')
  doc.text('F A C T U R A', pageWidth - margin, margin + 9, { align: 'right' })

  // Empresa details
  doc.setFontSize(7.5)
  doc.setFont('courier', 'normal')
  const empresaLines = getEmpresaContactLines(data.empresa, template)
  empresaLines.forEach((line) => {
    doc.text(line, margin, y)
    y += 3.5
  })

  y += 6

  // Factura details, simple two-column
  doc.setFontSize(8)
  const facturaDetails = getFacturaDetails(data.factura, template)
  facturaDetails.forEach(([label, value]) => {
    doc.setFont('courier', 'normal')
    doc.text(label, margin, y)
    doc.setFont('courier', 'bold')
    doc.text(value, margin + 30, y)
    y += 4
  })

  y += 6

  // Thin hairline
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.15)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  // Client
  doc.setFontSize(7)
  doc.setFont('courier', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text('CLIENTE', margin, y)
  doc.setTextColor(0, 0, 0)
  y += 4

  doc.setFont('courier', 'bold')
  doc.setFontSize(9)
  doc.text(data.factura.cliente?.nombre || '', margin, y)
  y += 4

  doc.setFontSize(7.5)
  doc.setFont('courier', 'normal')
  getClienteLines(data.factura).forEach((line) => {
    doc.text(line, margin, y)
    y += 3.5
  })

  y += 8

  // Table - plain, no colors
  const { headers, body } = getTableData(data.factura)
  autoTable(doc, {
    startY: y,
    head: headers,
    body,
    theme: 'plain',
    margin: { left: margin, right: margin },
    styles: { fontSize: 7.5, cellPadding: 2.5, font: 'courier', textColor: [30, 30, 30] },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [80, 80, 80],
      fontStyle: 'bold',
      fontSize: 7,
      lineWidth: { bottom: 0.2 },
      lineColor: [150, 150, 150],
    },
    columnStyles: TABLE_COLUMN_STYLES,
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // Hairline before totals
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.15)
  doc.line(pageWidth - margin - 75, y - 2, pageWidth - margin, y - 2)

  // Totals
  y = renderTotalsBlock(doc, data.factura, y, margin, pageWidth, accent, 'courier')

  // Notes
  y = renderNotesBlock(doc, data.factura, y, margin, contentWidth, template, 'courier')

  // Footer
  renderFooter(doc, data.facturacion, margin, pageWidth, contentWidth, 'courier')
}

function renderEjecutiva(doc: jsPDF, data: InvoiceData, template: TemplateConfig) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const sidebarW = 12
  const margin = 15
  const contentLeft = margin + sidebarW + 2
  const contentWidth = pageWidth - contentLeft - margin
  const accent = hexToRgb(template.colorAccento)
  const tint = accentTint(template.colorAccento, 0.92)

  // Left sidebar accent bar
  doc.setFillColor(...accent)
  doc.rect(0, 0, sidebarW, pageHeight, 'F')

  let y = margin + 2
  const logoSize = 10

  // Logo + Company
  if (template.logoBase64) {
    addLogo(doc, template.logoBase64, contentLeft, y, logoSize, logoSize)
    doc.setFontSize(14)
    doc.setFont('times', 'bold')
    doc.text(data.empresa.nombre || 'Mi Empresa', contentLeft + logoSize + 3, y + 5)
    y += logoSize + 3
  } else {
    doc.setFontSize(14)
    doc.setFont('times', 'bold')
    doc.text(data.empresa.nombre || 'Mi Empresa', contentLeft, y + 6)
    y += 12
  }

  // FACTURA title
  doc.setFontSize(16)
  doc.setFont('times', 'bold')
  doc.text('FACTURA', pageWidth - margin, margin + 8, { align: 'right' })

  // Empresa details
  doc.setFontSize(8)
  doc.setFont('times', 'normal')
  const empresaLines = getEmpresaContactLines(data.empresa, template)
  empresaLines.forEach((line) => {
    doc.text(line, contentLeft, y)
    y += 3.5
  })

  // Factura details (right)
  const facturaInfoStartY = margin + 14
  let fy = facturaInfoStartY
  doc.setFontSize(9)
  const rightCol = pageWidth - margin

  getFacturaDetails(data.factura, template).forEach(([label, value]) => {
    doc.setFont('times', 'normal')
    doc.text(label, rightCol - 45, fy)
    doc.setFont('times', 'bold')
    doc.text(value, rightCol, fy, { align: 'right' })
    fy += 4
  })

  y = Math.max(y, fy) + 6

  // Client with left accent border
  const clientStartY = y
  doc.setFillColor(...tint)
  const clientLines = getClienteLines(data.factura)
  const clientBoxH = 10 + clientLines.length * 3.5 + 4
  doc.rect(contentLeft, y, contentWidth, clientBoxH, 'F')

  // Accent left border on client box
  doc.setFillColor(...accent)
  doc.rect(contentLeft, y, 2, clientBoxH, 'F')

  y += 5
  doc.setFontSize(7)
  doc.setFont('times', 'bold')
  doc.setTextColor(100, 100, 100)
  doc.text('CLIENTE', contentLeft + 6, y)
  doc.setTextColor(0, 0, 0)
  y += 4

  doc.setFont('times', 'bold')
  doc.setFontSize(10)
  doc.text(data.factura.cliente?.nombre || '', contentLeft + 6, y)
  y += 4

  doc.setFontSize(8)
  doc.setFont('times', 'normal')
  clientLines.forEach((line) => {
    doc.text(line, contentLeft + 6, y)
    y += 3.5
  })

  y = clientStartY + clientBoxH + 6

  // Table
  const { headers, body } = getTableData(data.factura)
  autoTable(doc, {
    startY: y,
    head: headers,
    body,
    theme: 'striped',
    margin: { left: contentLeft, right: margin },
    styles: { fontSize: 8, cellPadding: 2.5, font: 'times' },
    headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 'auto' as const },
      1: { halign: 'center' as const, cellWidth: 14 },
      2: { halign: 'right' as const, cellWidth: 24 },
      3: { halign: 'center' as const, cellWidth: 14 },
      4: { halign: 'center' as const, cellWidth: 14 },
      5: { halign: 'center' as const, cellWidth: 14 },
      6: { halign: 'right' as const, cellWidth: 24 },
    },
    alternateRowStyles: { fillColor: [248, 249, 250] },
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // TOTAL with accent background
  const { ivaBreakdown, irpfBreakdown } = getTaxBreakdowns(data.factura)
  const totalsBoxW = 85
  const totalsX = pageWidth - margin - totalsBoxW
  const valuesX = pageWidth - margin

  doc.setFontSize(8)
  doc.setFont('times', 'normal')
  doc.text('Subtotal:', totalsX, y)
  doc.text(formatCurrency(data.factura.subtotal), valuesX, y, { align: 'right' })
  y += 5

  ivaBreakdown.forEach((taxData, pct) => {
    doc.text(`IVA ${pct}%:`, totalsX, y)
    doc.text(`+${formatCurrency(taxData.cuota)}`, valuesX, y, { align: 'right' })
    y += 4
  })

  irpfBreakdown.forEach((taxData, pct) => {
    doc.setTextColor(200, 100, 0)
    doc.text(`IRPF ${pct}%:`, totalsX, y)
    doc.text(`-${formatCurrency(taxData.cuota)}`, valuesX, y, { align: 'right' })
    doc.setTextColor(0, 0, 0)
    y += 4
  })

  y += 2
  // Total row with accent background
  doc.setFillColor(...accent)
  doc.roundedRect(totalsX - 4, y - 1, totalsBoxW + 4, 10, 1, 1, 'F')
  doc.setFontSize(11)
  doc.setFont('times', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL:', totalsX, y + 6)
  doc.text(formatCurrency(data.factura.total), valuesX, y + 6, { align: 'right' })
  doc.setTextColor(0, 0, 0)

  y += 18

  // Notes
  y = renderNotesBlock(doc, data.factura, y, contentLeft, contentWidth, template, 'times')

  // Footer
  renderFooter(doc, data.facturacion, margin, pageWidth, contentWidth, 'times')

  // Redraw sidebar on all pages
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFillColor(...accent)
    doc.rect(0, 0, sidebarW, pageHeight, 'F')
  }
}

// ===== Main Export =====

export function generateInvoicePdf(invoiceData: InvoiceData): string {
  const template = { ...DEFAULT_TEMPLATE, ...(invoiceData.template || {}) }
  const doc = new jsPDF('p', 'mm', 'a4')

  switch (template.plantilla) {
    case 'moderna':
      renderModerna(doc, invoiceData, template)
      break
    case 'minimalista':
      renderMinimalista(doc, invoiceData, template)
      break
    case 'ejecutiva':
      renderEjecutiva(doc, invoiceData, template)
      break
    case 'clasica':
    default:
      renderClasica(doc, invoiceData, template)
      break
  }

  return doc.output('datauristring').split(',')[1]
}
