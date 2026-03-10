import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import i18n from '@/i18n'

const t = i18n.t.bind(i18n)

interface PayrollData {
  nomina: Nomina & { empleado: Empleado & { departamento?: Departamento | null; contratos?: Contrato[] } }
  empresa: {
    nombre: string
    nif: string
    direccion: string
    codigoPostal: string
    ciudad: string
    provincia: string
  }
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
}

export function generatePayrollPdf(data: PayrollData): jsPDF {
  const { nomina, empresa } = data
  const emp = nomina.empleado
  const contrato = emp.contratos?.[0]

  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 15

  // Header
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('RECIBO DE SALARIOS', pageWidth / 2, y, { align: 'center' })
  y += 8

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`Período: ${MONTHS[nomina.mes - 1]} ${nomina.anio}`, pageWidth / 2, y, { align: 'center' })
  y += 10

  // Company info (left)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('EMPRESA', 14, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  y += 5
  doc.text(empresa.nombre, 14, y)
  y += 4
  doc.text(`CIF/NIF: ${empresa.nif}`, 14, y)
  y += 4
  doc.text(`${empresa.direccion}`, 14, y)
  y += 4
  doc.text(`${empresa.codigoPostal} ${empresa.ciudad} (${empresa.provincia})`, 14, y)

  // Employee info (right)
  let ey = y - 17
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('TRABAJADOR', 110, ey)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  ey += 5
  doc.text(`${emp.nombre} ${emp.apellidos}`, 110, ey)
  ey += 4
  doc.text(`NIF: ${emp.nif}`, 110, ey)
  ey += 4
  doc.text(`Nº SS: ${emp.numSeguridadSocial || '-'}`, 110, ey)
  ey += 4
  doc.text(`Grupo Cotización: ${emp.grupoCotizacion}`, 110, ey)
  ey += 4
  doc.text(`Categoría: ${emp.categoriaProfesional || '-'}`, 110, ey)
  if (contrato) {
    ey += 4
    doc.text(`Contrato: ${contrato.tipoContrato}`, 110, ey)
  }
  if (emp.departamento) {
    ey += 4
    doc.text(`Departamento: ${emp.departamento.nombre}`, 110, ey)
  }

  y += 10

  // Separator line
  doc.setDrawColor(200)
  doc.line(14, y, pageWidth - 14, y)
  y += 5

  // DEVENGOS table
  const devengos = (nomina.lineas || []).filter(l => l.tipo === 'devengo')
  const deducciones = (nomina.lineas || []).filter(l => l.tipo === 'deduccion')

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('I. DEVENGOS', 14, y)
  y += 2

  autoTable(doc, {
    startY: y,
    head: [['Concepto', 'Base', 'Importe']],
    body: devengos.map(l => [l.concepto, '', formatCurrency(l.importe)]),
    foot: [['TOTAL DEVENGADO', '', formatCurrency(nomina.totalDevengado)]],
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7 },
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 35, halign: 'right' },
      2: { cellWidth: 35, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // DEDUCCIONES table
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('II. DEDUCCIONES', 14, y)
  y += 2

  autoTable(doc, {
    startY: y,
    head: [['Concepto', 'Base', '%', 'Importe']],
    body: deducciones.map(l => [
      l.concepto,
      formatCurrency(l.base),
      l.porcentaje > 0 ? `${l.porcentaje.toFixed(2)}%` : '',
      formatCurrency(l.importe),
    ]),
    foot: [['TOTAL DEDUCCIONES', '', '', formatCurrency(nomina.totalDeducciones)]],
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7 },
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 35, halign: 'right' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  y = (doc as any).lastAutoTable.finalY + 10

  // LIQUIDO box
  doc.setFillColor(59, 130, 246)
  doc.roundedRect(14, y, pageWidth - 28, 14, 2, 2, 'F')
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('LÍQUIDO A PERCIBIR', 20, y + 9)
  doc.text(formatCurrency(nomina.liquidoPercibir), pageWidth - 20, y + 9, { align: 'right' })
  doc.setTextColor(0, 0, 0)

  y += 22

  // Bases de cotización
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('BASES DE COTIZACIÓN', 14, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.text(`Base CC: ${formatCurrency(nomina.baseCotizacionCC)}`, 14, y)
  doc.text(`Base CP: ${formatCurrency(nomina.baseCotizacionCP)}`, 90, y)
  y += 8

  // Coste empresa
  doc.setFont('helvetica', 'bold')
  doc.text('COSTE EMPRESA SEGURIDAD SOCIAL', 14, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  const costes = [
    `CC: ${formatCurrency(nomina.ccEmpresa)}`,
    `Desempleo: ${formatCurrency(nomina.desempleoEmpresa)}`,
    `FOGASA: ${formatCurrency(nomina.fogasaEmpresa)}`,
    `FP: ${formatCurrency(nomina.fpEmpresa)}`,
    `AT/EP: ${formatCurrency(nomina.atepEmpresa)}`,
  ]
  doc.text(costes.join('  |  '), 14, y)
  y += 4
  doc.setFont('helvetica', 'bold')
  doc.text(`Total Coste SS: ${formatCurrency(nomina.totalCosteSS)}    |    Coste Total Empresa: ${formatCurrency(nomina.costeTotal)}`, 14, y)

  // Footer
  y = doc.internal.pageSize.getHeight() - 20
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(150)
  doc.text('Recibí: ________________________', 14, y)
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, pageWidth - 14, y, { align: 'right' })
  doc.setTextColor(0)

  return doc
}
