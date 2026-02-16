import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  X,
  Ban,
  Send,
  Download,
  Filter,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Mail,
  FileSearch,
} from "lucide-react"
import * as XLSX from "xlsx"
import { generateInvoicePdf, TemplateConfig } from "@/lib/generateInvoicePdf"
import { SendEmailDialog } from "@/components/SendEmailDialog"

interface LineaFormData {
  productoId?: number
  descripcion: string
  cantidad: number
  precioUnit: number
  descuento: number
  impuestoId?: number
  retencionId?: number
}

const emptyLinea: LineaFormData = {
  descripcion: "",
  cantidad: 1,
  precioUnit: 0,
  descuento: 0,
}

const estadoConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  borrador: { label: "Borrador", color: "bg-slate-100 text-slate-600", icon: FileText },
  emitida: { label: "Emitida", color: "bg-blue-50 text-blue-700", icon: Send },
  pagada: { label: "Pagada", color: "bg-green-50 text-green-700", icon: CheckCircle },
  vencida: { label: "Vencida", color: "bg-red-50 text-red-700", icon: AlertCircle },
  anulada: { label: "Anulada", color: "bg-slate-100 text-slate-500", icon: Ban },
}

export function FacturasPage({ onHelp }: { onHelp?: () => void }) {
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [impuestos, setImpuestos] = useState<Impuesto[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterEstado, setFilterEstado] = useState<string>("todas")
  const [filterClienteId, setFilterClienteId] = useState<string>("todos")
  const [filterFechaDesde, setFilterFechaDesde] = useState("")
  const [filterFechaHasta, setFilterFechaHasta] = useState("")
  const [filterImporteMin, setFilterImporteMin] = useState("")
  const [filterImporteMax, setFilterImporteMax] = useState("")
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [facturaToDelete, setFacturaToDelete] = useState<Factura | null>(null)
  const [editingFactura, setEditingFactura] = useState<Factura | null>(null)
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [emitirDialogOpen, setEmitirDialogOpen] = useState(false)
  const [pagarDialogOpen, setPagarDialogOpen] = useState(false)
  const [facturaToEmitir, setFacturaToEmitir] = useState<Factura | null>(null)
  const [facturaToMarcarPagada, setFacturaToMarcarPagada] = useState<Factura | null>(null)

  // PDF preview state
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewNumero, setPdfPreviewNumero] = useState("")

  // Email dialog state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [emailAttachmentName, setEmailAttachmentName] = useState("")
  const [emailAttachmentBase64, setEmailAttachmentBase64] = useState("")
  const [emailDefaultRecipient, setEmailDefaultRecipient] = useState("")
  const [emailDefaultSubject, setEmailDefaultSubject] = useState("")
  const [emailDefaultBody, setEmailDefaultBody] = useState("")

  const [formData, setFormData] = useState({
    clienteId: "",
    serie: "F",
    fecha: new Date().toISOString().split("T")[0],
    fechaVencimiento: "",
    notas: "",
    formaPago: "",
  })
  const [lineas, setLineas] = useState<LineaFormData[]>([{ ...emptyLinea }])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const [facturasRes, clientesRes, productosRes, impuestosRes] = await Promise.all([
        window.electronAPI?.facturas.getAll(),
        window.electronAPI?.clientes.getAll(),
        window.electronAPI?.productos.getAll(),
        window.electronAPI?.impuestos.getAll(),
      ])

      if (facturasRes?.success) setFacturas(facturasRes.data || [])
      if (clientesRes?.success) setClientes(clientesRes.data?.filter(c => c.activo) || [])
      if (productosRes?.success) setProductos(productosRes.data?.filter(p => p.activo) || [])
      if (impuestosRes?.success) setImpuestos(impuestosRes.data?.filter(i => i.activo) || [])
    } catch (err) {
      console.error("Error loading data:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const activeFiltersCount = [
    filterClienteId !== "todos",
    filterFechaDesde,
    filterFechaHasta,
    filterImporteMin,
    filterImporteMax,
  ].filter(Boolean).length

  const clearAdvancedFilters = () => {
    setFilterClienteId("todos")
    setFilterFechaDesde("")
    setFilterFechaHasta("")
    setFilterImporteMin("")
    setFilterImporteMax("")
  }

  const filteredFacturas = facturas.filter((factura) => {
    const matchesSearch =
      factura.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      factura.cliente?.nombre.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesEstado = filterEstado === "todas" || factura.estado === filterEstado
    const matchesCliente = filterClienteId === "todos" || factura.clienteId === Number(filterClienteId)
    const facturaDate = new Date(factura.fecha)
    const matchesFechaDesde = !filterFechaDesde || facturaDate >= new Date(filterFechaDesde)
    const matchesFechaHasta = !filterFechaHasta || facturaDate <= new Date(filterFechaHasta + "T23:59:59")
    const matchesImporteMin = !filterImporteMin || factura.total >= parseFloat(filterImporteMin)
    const matchesImporteMax = !filterImporteMax || factura.total <= parseFloat(filterImporteMax)
    return matchesSearch && matchesEstado && matchesCliente && matchesFechaDesde && matchesFechaHasta && matchesImporteMin && matchesImporteMax
  })

  const stats = {
    total: facturas.reduce((acc, f) => acc + f.total, 0),
    pendiente: facturas.filter((f) => f.estado === "emitida").reduce((acc, f) => acc + f.total, 0),
    pagado: facturas.filter((f) => f.estado === "pagada").reduce((acc, f) => acc + f.total, 0),
    vencido: facturas.filter((f) => f.estado === "vencida").reduce((acc, f) => acc + f.total, 0),
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(amount)

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  const calculateLineTotal = (linea: LineaFormData) => {
    const subtotal = linea.cantidad * linea.precioUnit * (1 - linea.descuento / 100)
    const impuesto = impuestos.find(i => i.id === linea.impuestoId)
    const retencion = impuestos.find(i => i.id === linea.retencionId)
    const impuestoAmount = impuesto ? subtotal * (impuesto.porcentaje / 100) : 0
    const retencionAmount = retencion ? subtotal * (retencion.porcentaje / 100) : 0
    return { subtotal, impuestoAmount, retencionAmount, total: subtotal + impuestoAmount - retencionAmount }
  }

  const calculateTotals = () => {
    let subtotal = 0
    let totalImpuestos = 0
    let totalRetenciones = 0

    lineas.forEach(linea => {
      const calc = calculateLineTotal(linea)
      subtotal += calc.subtotal
      totalImpuestos += calc.impuestoAmount
      totalRetenciones += calc.retencionAmount
    })

    return { subtotal, totalImpuestos, totalRetenciones, total: subtotal + totalImpuestos - totalRetenciones }
  }

  const handleOpenDialog = async (factura?: Factura) => {
    setError(null)
    if (factura) {
      setEditingFactura(factura)
      setFormData({
        clienteId: String(factura.clienteId),
        serie: factura.serie,
        fecha: new Date(factura.fecha).toISOString().split("T")[0],
        fechaVencimiento: factura.fechaVencimiento
          ? new Date(factura.fechaVencimiento).toISOString().split("T")[0]
          : "",
        notas: factura.notas || "",
        formaPago: factura.formaPago || "",
      })
      setLineas(factura.lineas?.map(l => ({
        productoId: l.productoId || undefined,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnit: l.precioUnit,
        descuento: l.descuento,
        impuestoId: l.impuestoId || undefined,
        retencionId: l.retencionId || undefined,
      })) || [{ ...emptyLinea }])
    } else {
      setEditingFactura(null)
      setFormData({
        clienteId: "",
        serie: "F",
        fecha: new Date().toISOString().split("T")[0],
        fechaVencimiento: "",
        notas: "",
        formaPago: "",
      })
      setLineas([{ ...emptyLinea }])
    }
    setIsDialogOpen(true)
  }

  const handleViewDetail = (factura: Factura) => {
    setSelectedFactura(factura)
    setIsDetailOpen(true)
  }

  const handleAddLinea = () => {
    setLineas([...lineas, { ...emptyLinea }])
  }

  const handleRemoveLinea = (index: number) => {
    if (lineas.length > 1) {
      setLineas(lineas.filter((_, i) => i !== index))
    }
  }

  const handleLineaChange = (index: number, field: keyof LineaFormData, value: any) => {
    const newLineas = [...lineas]
    newLineas[index] = { ...newLineas[index], [field]: value }

    if (field === "productoId" && value) {
      const producto = productos.find(p => p.id === Number(value))
      if (producto) {
        newLineas[index].descripcion = producto.nombre
        newLineas[index].precioUnit = producto.precioBase
        if (producto.impuestoId) {
          newLineas[index].impuestoId = producto.impuestoId
        }
        if (producto.retencionId) {
          newLineas[index].retencionId = producto.retencionId
        }
      }
    }

    setLineas(newLineas)
  }

  const handleSubmit = async () => {
    if (!formData.clienteId || lineas.every(l => !l.descripcion)) return

    setIsSaving(true)
    setError(null)
    try {
      const totals = calculateTotals()
      const facturaData = {
        clienteId: parseInt(formData.clienteId),
        serie: formData.serie,
        fecha: new Date(formData.fecha),
        fechaVencimiento: formData.fechaVencimiento ? new Date(formData.fechaVencimiento) : null,
        subtotal: totals.subtotal,
        totalImpuestos: totals.totalImpuestos,
        totalRetenciones: totals.totalRetenciones,
        total: totals.total,
        notas: formData.notas || null,
        formaPago: formData.formaPago || null,
        lineas: lineas.filter(l => l.descripcion).map(l => {
          const calc = calculateLineTotal(l)
          return {
            productoId: l.productoId || null,
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            precioUnit: l.precioUnit,
            descuento: l.descuento,
            impuestoId: l.impuestoId || null,
            retencionId: l.retencionId || null,
            subtotal: calc.subtotal,
            totalImpuesto: calc.impuestoAmount,
            totalRetencion: calc.retencionAmount,
            total: calc.total,
          }
        }),
      }

      if (editingFactura) {
        const response = await window.electronAPI?.facturas.update(editingFactura.id, facturaData)
        if (response?.success) {
          await loadData()
          setIsDialogOpen(false)
        } else {
          setError(response?.error || 'Error al actualizar la factura')
        }
      } else {
        const response = await window.electronAPI?.facturas.create(facturaData)
        if (response?.success) {
          await loadData()
          setIsDialogOpen(false)
        } else {
          setError(response?.error || 'Error al crear la factura')
        }
      }
    } catch (err) {
      console.error("Error saving factura:", err)
      setError(String(err))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!facturaToDelete) return

    try {
      const response = await window.electronAPI?.facturas.delete(facturaToDelete.id)
      if (response?.success) {
        await loadData()
      }
    } catch (err) {
      console.error("Error deleting factura:", err)
    } finally {
      setDeleteDialogOpen(false)
      setFacturaToDelete(null)
    }
  }

  const handleChangeEstado = async (facturaId: number, newEstado: string) => {
    try {
      const response = await window.electronAPI?.facturas.updateEstado(facturaId, newEstado)
      if (response?.success) {
        await loadData()
      }
    } catch (err) {
      console.error("Error updating estado:", err)
    }
  }

  const confirmDelete = (factura: Factura) => {
    setFacturaToDelete(factura)
    setDeleteDialogOpen(true)
  }

  const confirmEmitir = (factura: Factura) => {
    setFacturaToEmitir(factura)
    setEmitirDialogOpen(true)
  }

  const confirmMarcarPagada = (factura: Factura) => {
    setFacturaToMarcarPagada(factura)
    setPagarDialogOpen(true)
  }

  const handleEmitir = async () => {
    if (!facturaToEmitir) return
    await handleChangeEstado(facturaToEmitir.id, "emitida")
    setEmitirDialogOpen(false)
    setFacturaToEmitir(null)
  }

  const handleMarcarPagada = async () => {
    if (!facturaToMarcarPagada) return
    await handleChangeEstado(facturaToMarcarPagada.id, "pagada")
    setPagarDialogOpen(false)
    setFacturaToMarcarPagada(null)
  }

  const getExportData = () =>
    filteredFacturas.map((f) => ({
      Numero: f.numero,
      Cliente: f.cliente?.nombre || "",
      NIF: f.cliente?.nif || "",
      Fecha: formatDate(f.fecha),
      Vencimiento: f.fechaVencimiento ? formatDate(f.fechaVencimiento) : "",
      Estado: estadoConfig[f.estado]?.label || f.estado,
      Subtotal: f.subtotal,
      IVA: f.totalImpuestos,
      IRPF: f.totalRetenciones,
      Total: f.total,
      FormaPago: f.formaPago || "",
      Notas: f.notas || "",
    }))

  const handleExportCSV = async () => {
    const rows = getExportData()
    if (rows.length === 0) return
    const headers = Object.keys(rows[0])
    const csvLines = [
      headers.join(";"),
      ...rows.map((row) =>
        headers.map((h) => {
          const val = String(row[h as keyof typeof row] ?? "")
          return val.includes(";") || val.includes('"') || val.includes("\n")
            ? `"${val.replace(/"/g, '""')}"`
            : val
        }).join(";")
      ),
    ]
    const content = "\uFEFF" + csvLines.join("\n")
    await window.electronAPI?.export.saveFile({
      content,
      defaultFilename: `facturas-${new Date().toISOString().split("T")[0]}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    })
  }

  const handleExportExcel = async () => {
    const rows = getExportData()
    if (rows.length === 0) return
    const ws = XLSX.utils.json_to_sheet(rows)
    const colWidths = Object.keys(rows[0]).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key as keyof typeof r] ?? "").length)).toString().length + 4,
    }))
    ws["!cols"] = colWidths
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Facturas")
    const xlsxData = XLSX.write(wb, { type: "base64", bookType: "xlsx" })
    await window.electronAPI?.export.saveFile({
      content: xlsxData,
      defaultFilename: `facturas-${new Date().toISOString().split("T")[0]}.xlsx`,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    })
  }

  const handleExportJSON = async () => {
    const rows = getExportData()
    if (rows.length === 0) return
    const content = JSON.stringify(rows, null, 2)
    await window.electronAPI?.export.saveFile({
      content,
      defaultFilename: `facturas-${new Date().toISOString().split("T")[0]}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    })
  }

  const handleGeneratePdf = async (factura: Factura) => {
    try {
      // Get full factura with relations
      const facturaRes = await window.electronAPI?.facturas.getById(factura.id)
      if (!facturaRes?.success || !facturaRes.data) return

      // Get empresa config
      const configRes = await window.electronAPI?.config.getAll()
      const cfg = configRes?.success ? configRes.data || {} : {}

      const empresa = {
        nombre: cfg['empresa.nombre'] || '',
        nif: cfg['empresa.nif'] || '',
        direccion: cfg['empresa.direccion'] || '',
        codigoPostal: cfg['empresa.codigoPostal'] || '',
        ciudad: cfg['empresa.ciudad'] || '',
        provincia: cfg['empresa.provincia'] || '',
        telefono: cfg['empresa.telefono'] || '',
        email: cfg['empresa.email'] || '',
        web: cfg['empresa.web'] || '',
      }

      const facturacion = {
        piePagina: cfg['facturacion.piePagina'] || '',
      }

      // Build template config
      const template: TemplateConfig = {
        plantilla: (cfg['facturacion.plantilla'] as TemplateConfig['plantilla']) || 'clasica',
        colorAccento: cfg['facturacion.colorAccento'] || '#374151',
        mostrarTelefono: cfg['facturacion.mostrarTelefono'] !== 'false',
        mostrarEmail: cfg['facturacion.mostrarEmail'] !== 'false',
        mostrarWeb: cfg['facturacion.mostrarWeb'] !== 'false',
        mostrarNotas: cfg['facturacion.mostrarNotas'] !== 'false',
        mostrarFormaPago: cfg['facturacion.mostrarFormaPago'] !== 'false',
      }

      // Try to load logo
      try {
        const logoRes = await window.electronAPI?.logo.read()
        if (logoRes?.success && logoRes.data) {
          const bytes = new Uint8Array(logoRes.data.data)
          let binary = ''
          bytes.forEach(b => { binary += String.fromCharCode(b) })
          template.logoBase64 = `data:${logoRes.data.tipoMime};base64,${btoa(binary)}`
        }
      } catch {
        // No logo, continue without it
      }

      const pdfBase64 = generateInvoicePdf({
        factura: facturaRes.data,
        empresa,
        facturacion,
        template,
      })

      await window.electronAPI?.export.saveFile({
        content: pdfBase64,
        defaultFilename: `Factura-${factura.numero}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
    } catch (err) {
      console.error('Error generating PDF:', err)
    }
  }

  const handleSendEmail = async (factura: Factura) => {
    try {
      // Get full factura with relations
      const facturaRes = await window.electronAPI?.facturas.getById(factura.id)
      if (!facturaRes?.success || !facturaRes.data) return
      const fullFactura = facturaRes.data

      // Get empresa config
      const configRes = await window.electronAPI?.config.getAll()
      const cfg = configRes?.success ? configRes.data || {} : {}

      const empresa = {
        nombre: cfg['empresa.nombre'] || '',
        nif: cfg['empresa.nif'] || '',
        direccion: cfg['empresa.direccion'] || '',
        codigoPostal: cfg['empresa.codigoPostal'] || '',
        ciudad: cfg['empresa.ciudad'] || '',
        provincia: cfg['empresa.provincia'] || '',
        telefono: cfg['empresa.telefono'] || '',
        email: cfg['empresa.email'] || '',
        web: cfg['empresa.web'] || '',
      }

      const facturacion = {
        piePagina: cfg['facturacion.piePagina'] || '',
      }

      const template: TemplateConfig = {
        plantilla: (cfg['facturacion.plantilla'] as TemplateConfig['plantilla']) || 'clasica',
        colorAccento: cfg['facturacion.colorAccento'] || '#374151',
        mostrarTelefono: cfg['facturacion.mostrarTelefono'] !== 'false',
        mostrarEmail: cfg['facturacion.mostrarEmail'] !== 'false',
        mostrarWeb: cfg['facturacion.mostrarWeb'] !== 'false',
        mostrarNotas: cfg['facturacion.mostrarNotas'] !== 'false',
        mostrarFormaPago: cfg['facturacion.mostrarFormaPago'] !== 'false',
      }

      try {
        const logoRes = await window.electronAPI?.logo.read()
        if (logoRes?.success && logoRes.data) {
          const bytes = new Uint8Array(logoRes.data.data)
          let binary = ''
          bytes.forEach(b => { binary += String.fromCharCode(b) })
          template.logoBase64 = `data:${logoRes.data.tipoMime};base64,${btoa(binary)}`
        }
      } catch {
        // No logo
      }

      const pdfBase64 = generateInvoicePdf({
        factura: fullFactura,
        empresa,
        facturacion,
        template,
      })

      const clienteEmail = fullFactura.cliente?.email || ''
      const empresaNombre = empresa.nombre || 'Nuestra empresa'

      setEmailAttachmentName(`Factura-${factura.numero}.pdf`)
      setEmailAttachmentBase64(pdfBase64)
      setEmailDefaultRecipient(clienteEmail)
      setEmailDefaultSubject(`Factura ${factura.numero} - ${empresaNombre}`)
      setEmailDefaultBody(
        `Estimado/a ${fullFactura.cliente?.nombre || 'cliente'},\n\n` +
        `Adjunto encontrará la factura ${factura.numero} por importe de ${formatCurrency(factura.total)}.\n\n` +
        `Quedamos a su disposición para cualquier consulta.\n\n` +
        `Un cordial saludo,\n${empresaNombre}`
      )
      setEmailDialogOpen(true)
    } catch (err) {
      console.error('Error preparing email:', err)
    }
  }

  const handlePreviewPdf = async (factura: Factura) => {
    try {
      const facturaRes = await window.electronAPI?.facturas.getById(factura.id)
      if (!facturaRes?.success || !facturaRes.data) return

      const configRes = await window.electronAPI?.config.getAll()
      const cfg = configRes?.success ? configRes.data || {} : {}

      const empresa = {
        nombre: cfg['empresa.nombre'] || '',
        nif: cfg['empresa.nif'] || '',
        direccion: cfg['empresa.direccion'] || '',
        codigoPostal: cfg['empresa.codigoPostal'] || '',
        ciudad: cfg['empresa.ciudad'] || '',
        provincia: cfg['empresa.provincia'] || '',
        telefono: cfg['empresa.telefono'] || '',
        email: cfg['empresa.email'] || '',
        web: cfg['empresa.web'] || '',
      }

      const facturacion = {
        piePagina: cfg['facturacion.piePagina'] || '',
      }

      const template: TemplateConfig = {
        plantilla: (cfg['facturacion.plantilla'] as TemplateConfig['plantilla']) || 'clasica',
        colorAccento: cfg['facturacion.colorAccento'] || '#374151',
        mostrarTelefono: cfg['facturacion.mostrarTelefono'] !== 'false',
        mostrarEmail: cfg['facturacion.mostrarEmail'] !== 'false',
        mostrarWeb: cfg['facturacion.mostrarWeb'] !== 'false',
        mostrarNotas: cfg['facturacion.mostrarNotas'] !== 'false',
        mostrarFormaPago: cfg['facturacion.mostrarFormaPago'] !== 'false',
      }

      try {
        const logoRes = await window.electronAPI?.logo.read()
        if (logoRes?.success && logoRes.data) {
          const bytes = new Uint8Array(logoRes.data.data)
          let binary = ''
          bytes.forEach(b => { binary += String.fromCharCode(b) })
          template.logoBase64 = `data:${logoRes.data.tipoMime};base64,${btoa(binary)}`
        }
      } catch {
        // No logo
      }

      const pdfBase64 = generateInvoicePdf({
        factura: facturaRes.data,
        empresa,
        facturacion,
        template,
      })

      const binaryString = atob(pdfBase64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)

      setPdfPreviewUrl(url)
      setPdfPreviewNumero(factura.numero)
    } catch (err) {
      console.error('Error generating PDF preview:', err)
    }
  }

  const handleClosePreview = () => {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl)
    }
    setPdfPreviewUrl(null)
    setPdfPreviewNumero("")
  }

  const handleDownloadFromPreview = () => {
    if (!pdfPreviewUrl) return
    const a = document.createElement('a')
    a.href = pdfPreviewUrl
    a.download = `Factura-${pdfPreviewNumero}.pdf`
    a.click()
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const totals = calculateTotals()
  const totalFiltrado = filteredFacturas.reduce((acc, f) => acc + f.total, 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl font-semibold">Facturación</h1>
            <p className="text-sm text-muted-foreground">
              Gestión de facturas y cobros
            </p>
          </div>
          {onHelp && (
            <button onClick={onHelp} className="rounded-full p-1.5 hover:bg-accent transition-colors" title="Ver ayuda">
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <Button size="sm" onClick={() => handleOpenDialog()}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nueva Factura
        </Button>
      </div>

      {/* Stats compactos */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Facturación Total</p>
            <p className="text-lg font-semibold tabular-nums">{formatCurrency(stats.total)}</p>
            <p className="text-xs text-muted-foreground">{facturas.length} facturas</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Pendiente de Cobro</p>
            <p className="text-lg font-semibold tabular-nums text-blue-600">{formatCurrency(stats.pendiente)}</p>
            <p className="text-xs text-muted-foreground">
              {facturas.filter(f => f.estado === 'emitida').length} emitidas
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Cobrado</p>
            <p className="text-lg font-semibold tabular-nums text-green-600">{formatCurrency(stats.pagado)}</p>
            <p className="text-xs text-muted-foreground">
              {facturas.filter(f => f.estado === 'pagada').length} pagadas
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Vencido</p>
            <p className="text-lg font-semibold tabular-nums text-red-600">{formatCurrency(stats.vencido)}</p>
            <p className="text-xs text-muted-foreground">
              {facturas.filter(f => f.estado === 'vencida').length} vencidas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros y tabla */}
      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-medium">
              Listado de Facturas
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {filteredFacturas.length} de {facturas.length}
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  className="h-8 w-48 pl-7 text-xs"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todos los estados</SelectItem>
                  <SelectItem value="borrador">Borrador</SelectItem>
                  <SelectItem value="emitida">Emitida</SelectItem>
                  <SelectItem value="pagada">Pagada</SelectItem>
                  <SelectItem value="vencida">Vencida</SelectItem>
                  <SelectItem value="anulada">Anulada</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              >
                <Filter className="h-3.5 w-3.5" />
                Filtros
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px] min-w-4 justify-center">
                    {activeFiltersCount}
                  </Badge>
                )}
                {showAdvancedFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" disabled={filteredFacturas.length === 0}>
                    <Download className="h-3.5 w-3.5" />
                    Exportar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportCSV} className="text-xs">
                    <FileText className="mr-2 h-3.5 w-3.5" />
                    Exportar CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportExcel} className="text-xs">
                    <FileText className="mr-2 h-3.5 w-3.5" />
                    Exportar Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportJSON} className="text-xs">
                    <FileText className="mr-2 h-3.5 w-3.5" />
                    Exportar JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Filtros avanzados */}
          {showAdvancedFilters && (
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
              <div className="grid gap-1">
                <Label className="text-[10px] text-muted-foreground">Cliente</Label>
                <Select value={filterClienteId} onValueChange={setFilterClienteId}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los clientes</SelectItem>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px] text-muted-foreground">Fecha desde</Label>
                <Input
                  type="date"
                  className="h-8 w-36 text-xs"
                  value={filterFechaDesde}
                  onChange={(e) => setFilterFechaDesde(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px] text-muted-foreground">Fecha hasta</Label>
                <Input
                  type="date"
                  className="h-8 w-36 text-xs"
                  value={filterFechaHasta}
                  onChange={(e) => setFilterFechaHasta(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px] text-muted-foreground">Importe mín.</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  className="h-8 w-24 text-xs"
                  value={filterImporteMin}
                  onChange={(e) => setFilterImporteMin(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px] text-muted-foreground">Importe máx.</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  className="h-8 w-24 text-xs"
                  value={filterImporteMax}
                  onChange={(e) => setFilterImporteMax(e.target.value)}
                />
              </div>
              {activeFiltersCount > 0 && (
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={clearAdvancedFilters}>
                  <X className="h-3 w-3" />
                  Limpiar
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 text-xs font-medium">Nº Factura</TableHead>
                <TableHead className="h-8 text-xs font-medium">Cliente</TableHead>
                <TableHead className="h-8 text-xs font-medium">Fecha</TableHead>
                <TableHead className="h-8 text-xs font-medium">Vencimiento</TableHead>
                <TableHead className="h-8 text-xs font-medium">Estado</TableHead>
                <TableHead className="h-8 text-xs font-medium text-right">Importe</TableHead>
                <TableHead className="h-8 text-xs font-medium text-center w-28">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFacturas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <FileText className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">No hay facturas registradas</p>
                      <p className="text-xs">
                        {searchTerm || filterEstado !== "todas"
                          ? "Prueba ajustando los filtros"
                          : "Crea tu primera factura"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredFacturas.map((factura) => {
                  const config = estadoConfig[factura.estado] || estadoConfig.borrador
                  return (
                    <TableRow
                      key={factura.id}
                      className="cursor-pointer"
                      onClick={() => handleViewDetail(factura)}
                    >
                      <TableCell className="py-2">
                        <span className="font-mono text-xs font-medium">{factura.numero}</span>
                      </TableCell>
                      <TableCell className="py-2 text-xs">
                        {factura.cliente?.nombre || "-"}
                      </TableCell>
                      <TableCell className="py-2 text-xs tabular-nums">
                        {formatDate(factura.fecha)}
                      </TableCell>
                      <TableCell className="py-2 text-xs tabular-nums text-muted-foreground">
                        {factura.fechaVencimiento ? formatDate(factura.fechaVencimiento) : "-"}
                      </TableCell>
                      <TableCell className="py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${config.color}`}>
                          {config.label}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <span className="text-xs font-medium tabular-nums">
                          {formatCurrency(factura.total)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleViewDetail(factura)}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          {factura.estado !== "borrador" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handlePreviewPdf(factura)}
                                title="Previsualizar PDF"
                              >
                                <FileSearch className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleGeneratePdf(factura)}
                                title="Descargar PDF"
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleSendEmail(factura)}
                                title="Enviar por email"
                              >
                                <Mail className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {factura.estado === "borrador" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleOpenDialog(factura)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-blue-600"
                                onClick={() => confirmEmitir(factura)}
                                title="Emitir"
                              >
                                <Send className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {factura.estado === "emitida" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-green-600"
                              onClick={() => confirmMarcarPagada(factura)}
                              title="Marcar pagada"
                            >
                              <CheckCircle className="h-3 w-3" />
                            </Button>
                          )}
                          {(factura.estado === "borrador" || factura.estado === "anulada") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-600"
                              onClick={() => confirmDelete(factura)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {/* Totales de la tabla */}
          {filteredFacturas.length > 0 && (
            <div className="border-t bg-muted/30 px-4 py-2">
              <div className="flex justify-end gap-8 text-xs">
                <span className="text-muted-foreground">
                  {filteredFacturas.length} factura{filteredFacturas.length !== 1 ? "s" : ""}
                </span>
                <span className="font-medium">
                  Total: <span className="tabular-nums">{formatCurrency(totalFiltrado)}</span>
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de creación/edición */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingFactura ? `Editar Factura #${editingFactura.numero}` : "Nueva Factura"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            {/* Datos generales */}
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Cliente *</Label>
                <Select
                  value={formData.clienteId}
                  onValueChange={(value) => setFormData({ ...formData, clienteId: value })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    {formData.clienteId
                      ? <span className="truncate">{clientes.find(c => c.id === Number(formData.clienteId))?.nombre}</span>
                      : <SelectValue placeholder="Seleccionar cliente" />}
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((cliente) => (
                      <SelectItem key={cliente.id} value={String(cliente.id)}>
                        {cliente.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Fecha *</Label>
                <Input
                  type="date"
                  className="h-8 text-sm"
                  value={formData.fecha}
                  onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Vencimiento</Label>
                <Input
                  type="date"
                  className="h-8 text-sm"
                  value={formData.fechaVencimiento}
                  onChange={(e) => setFormData({ ...formData, fechaVencimiento: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Serie</Label>
                <Input
                  className="h-8 text-sm"
                  value={formData.serie}
                  onChange={(e) => setFormData({ ...formData, serie: e.target.value })}
                  placeholder="F"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Forma de Pago</Label>
                <Select
                  value={formData.formaPago}
                  onValueChange={(value) => setFormData({ ...formData, formaPago: value })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                    <SelectItem value="bizum">Bizum</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Líneas de factura */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Líneas de Factura</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddLinea}>
                  <Plus className="mr-1 h-3 w-3" />
                  Añadir
                </Button>
              </div>

              <div className="space-y-2">
                {lineas.map((linea, index) => (
                  <div key={index} className="flex gap-2 items-end p-2 border rounded bg-muted/30">
                    <div className="w-40 shrink-0">
                      <Label className="text-[10px] text-muted-foreground">Producto</Label>
                      <Select
                        value={linea.productoId ? String(linea.productoId) : ""}
                        onValueChange={(value) => handleLineaChange(index, "productoId", value ? Number(value) : undefined)}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          {linea.productoId
                            ? <span className="truncate">{productos.find(p => p.id === linea.productoId)?.nombre}</span>
                            : <SelectValue placeholder="Seleccionar..." />}
                        </SelectTrigger>
                        <SelectContent>
                          {productos.map((producto) => (
                            <SelectItem key={producto.id} value={String(producto.id)}>
                              {producto.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 min-w-0">
                      <Label className="text-[10px] text-muted-foreground">Descripción *</Label>
                      <Input
                        className="h-7 text-xs"
                        value={linea.descripcion}
                        onChange={(e) => handleLineaChange(index, "descripcion", e.target.value)}
                      />
                    </div>
                    <div className="w-16 shrink-0">
                      <Label className="text-[10px] text-muted-foreground">Cant.</Label>
                      <Input
                        className="h-7 text-xs tabular-nums"
                        type="number"
                        min="1"
                        value={linea.cantidad}
                        onChange={(e) => handleLineaChange(index, "cantidad", parseFloat(e.target.value) || 1)}
                      />
                    </div>
                    <div className="w-24 shrink-0">
                      <Label className="text-[10px] text-muted-foreground">Precio</Label>
                      <Input
                        className="h-7 text-xs tabular-nums"
                        type="number"
                        step="0.01"
                        value={linea.precioUnit}
                        onChange={(e) => handleLineaChange(index, "precioUnit", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="w-28 shrink-0">
                      <Label className="text-[10px] text-muted-foreground">IVA</Label>
                      <Select
                        value={linea.impuestoId ? String(linea.impuestoId) : ""}
                        onValueChange={(value) => handleLineaChange(index, "impuestoId", value ? Number(value) : undefined)}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          {linea.impuestoId
                            ? <span className="truncate">{(() => { const imp = impuestos.find(i => i.id === linea.impuestoId); return imp ? `${imp.nombre} (${imp.porcentaje}%)` : "" })()}</span>
                            : <SelectValue placeholder="Sin IVA" />}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Sin IVA</SelectItem>
                          {impuestos.filter(i => i.tipo === "IVA").map((imp) => (
                            <SelectItem key={imp.id} value={String(imp.id)}>
                              {imp.nombre} ({imp.porcentaje}%)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-28 shrink-0">
                      <Label className="text-[10px] text-muted-foreground">IRPF</Label>
                      <Select
                        value={linea.retencionId ? String(linea.retencionId) : ""}
                        onValueChange={(value) => handleLineaChange(index, "retencionId", value ? Number(value) : undefined)}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          {linea.retencionId
                            ? <span className="truncate">{(() => { const ret = impuestos.find(i => i.id === linea.retencionId); return ret ? `${ret.nombre} (${ret.porcentaje}%)` : "" })()}</span>
                            : <SelectValue placeholder="Sin ret." />}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Sin ret.</SelectItem>
                          {impuestos.filter(i => i.tipo === "IRPF").map((imp) => (
                            <SelectItem key={imp.id} value={String(imp.id)}>
                              {imp.nombre} ({imp.porcentaje}%)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24 shrink-0 text-right">
                      <Label className="text-[10px] text-muted-foreground">Total</Label>
                      <p className="h-7 flex items-center justify-end text-xs font-medium tabular-nums">
                        {formatCurrency(calculateLineTotal(linea).total)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveLinea(index)}
                        disabled={lineas.length === 1}
                        className="h-7 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totales */}
            <div className="flex justify-end">
              <div className="w-56 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="tabular-nums">{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IVA:</span>
                  <span className="tabular-nums">+{formatCurrency(totals.totalImpuestos)}</span>
                </div>
                {totals.totalRetenciones > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>IRPF:</span>
                    <span className="tabular-nums">-{formatCurrency(totals.totalRetenciones)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Total:</span>
                  <span className="tabular-nums">{formatCurrency(totals.total)}</span>
                </div>
              </div>
            </div>

            {/* Notas */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Notas</Label>
              <Textarea
                className="text-sm min-h-[50px]"
                value={formData.notas}
                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                placeholder="Observaciones..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={isSaving || !formData.clienteId}>
              {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {editingFactura ? "Guardar" : "Crear Factura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de detalle */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Factura {selectedFactura?.numero}
              </DialogTitle>
              {selectedFactura && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${estadoConfig[selectedFactura.estado]?.color}`}>
                  {estadoConfig[selectedFactura.estado]?.label}
                </span>
              )}
            </div>
          </DialogHeader>

          {selectedFactura && (
            <div className="space-y-4 py-2">
              {/* Datos generales */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="font-medium">{selectedFactura.cliente?.nombre}</p>
                  {selectedFactura.cliente?.nif && (
                    <p className="text-xs text-muted-foreground">NIF: {selectedFactura.cliente.nif}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Fechas</p>
                  <p className="font-medium">Emisión: {formatDate(selectedFactura.fecha)}</p>
                  {selectedFactura.fechaVencimiento && (
                    <p className="text-xs text-muted-foreground">
                      Vencimiento: {formatDate(selectedFactura.fechaVencimiento)}
                    </p>
                  )}
                </div>
              </div>

              {/* Líneas */}
              <div className="border rounded">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-8 text-xs">Descripción</TableHead>
                      <TableHead className="h-8 text-xs text-center">Cant.</TableHead>
                      <TableHead className="h-8 text-xs text-right">Precio</TableHead>
                      <TableHead className="h-8 text-xs text-right">IVA</TableHead>
                      <TableHead className="h-8 text-xs text-right">IRPF</TableHead>
                      <TableHead className="h-8 text-xs text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedFactura.lineas?.map((linea) => (
                      <TableRow key={linea.id}>
                        <TableCell className="py-2 text-xs">{linea.descripcion}</TableCell>
                        <TableCell className="py-2 text-xs text-center tabular-nums">{linea.cantidad}</TableCell>
                        <TableCell className="py-2 text-xs text-right tabular-nums">{formatCurrency(linea.precioUnit)}</TableCell>
                        <TableCell className="py-2 text-xs text-right">
                          {linea.impuesto ? `${linea.impuesto.porcentaje}%` : "-"}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-right text-orange-600">
                          {linea.retencion ? `${linea.retencion.porcentaje}%` : "-"}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-right font-medium tabular-nums">
                          {formatCurrency(linea.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totales */}
              <div className="flex justify-end">
                <div className="w-48 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="tabular-nums">{formatCurrency(selectedFactura.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IVA:</span>
                    <span className="tabular-nums">+{formatCurrency(selectedFactura.totalImpuestos)}</span>
                  </div>
                  {selectedFactura.totalRetenciones > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>IRPF:</span>
                      <span className="tabular-nums">-{formatCurrency(selectedFactura.totalRetenciones)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Total:</span>
                    <span className="tabular-nums">{formatCurrency(selectedFactura.total)}</span>
                  </div>
                </div>
              </div>

              {/* Notas */}
              {selectedFactura.notas && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notas</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 p-2 rounded">{selectedFactura.notas}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {selectedFactura && selectedFactura.estado !== "borrador" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreviewPdf(selectedFactura)}
                >
                  <FileSearch className="mr-1.5 h-3 w-3" />
                  Previsualizar PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleGeneratePdf(selectedFactura)}
                >
                  <Download className="mr-1.5 h-3 w-3" />
                  Descargar PDF
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => setIsDetailOpen(false)}>
              Cerrar
            </Button>
            {selectedFactura?.estado === "borrador" && (
              <Button
                size="sm"
                onClick={() => {
                  setIsDetailOpen(false)
                  handleOpenDialog(selectedFactura)
                }}
              >
                <Pencil className="mr-1.5 h-3 w-3" />
                Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Eliminar factura</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Se eliminará permanentemente la factura #{facturaToDelete?.numero}.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-sm">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="h-8 text-sm bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmación de emitir factura */}
      <AlertDialog open={emitirDialogOpen} onOpenChange={setEmitirDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4 text-blue-600" />
              Emitir factura
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              ¿Confirmas la emisión de la factura <strong>#{facturaToEmitir?.numero}</strong> por importe de{" "}
              <strong>{facturaToEmitir ? formatCurrency(facturaToEmitir.total) : ""}</strong>?
              <br /><br />
              Una vez emitida, la factura no podrá ser editada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-sm">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEmitir}
              className="h-8 text-sm bg-blue-600 hover:bg-blue-700"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Emitir Factura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmación de marcar como pagada */}
      <AlertDialog open={pagarDialogOpen} onOpenChange={setPagarDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Registrar cobro
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              ¿Confirmas el cobro de la factura <strong>#{facturaToMarcarPagada?.numero}</strong> por importe de{" "}
              <strong>{facturaToMarcarPagada ? formatCurrency(facturaToMarcarPagada.total) : ""}</strong>?
              <br /><br />
              La factura quedará marcada como pagada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-sm">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarcarPagada}
              className="h-8 text-sm bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
              Confirmar Cobro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de previsualización de PDF */}
      <Dialog open={!!pdfPreviewUrl} onOpenChange={(open) => { if (!open) handleClosePreview() }}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Previsualización - Factura {pdfPreviewNumero}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {pdfPreviewUrl && (
              <iframe
                src={pdfPreviewUrl}
                className="w-full h-full rounded border"
                title={`PDF Factura ${pdfPreviewNumero}`}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={handleClosePreview}>
              Cerrar
            </Button>
            <Button size="sm" onClick={handleDownloadFromPreview}>
              <Download className="mr-1.5 h-3 w-3" />
              Descargar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <SendEmailDialog
        open={emailDialogOpen}
        onClose={() => setEmailDialogOpen(false)}
        attachmentName={emailAttachmentName}
        attachmentBase64={emailAttachmentBase64}
        defaultRecipient={emailDefaultRecipient}
        defaultSubject={emailDefaultSubject}
        defaultBody={emailDefaultBody}
      />
    </div>
  )
}
