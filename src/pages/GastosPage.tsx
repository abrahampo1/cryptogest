import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
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
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  ChevronDown,
  FileText,
  Paperclip,
  Download,
  X,
  Upload,
  File,
  Image as ImageIcon,
  Eye,
  FileImage,
  HelpCircle,
} from "lucide-react"
import { ImportarGastosDialog } from "@/components/ImportarGastosDialog"

interface AdjuntoGasto {
  id: number
  gastoId: number
  nombreOriginal: string
  nombreEncriptado: string
  tipoMime: string
  tamano: number
  createdAt: string
}

interface CategoriaGasto {
  id: number
  nombre: string
  color: string
  icono: string
  activo: boolean
}

interface Impuesto {
  id: number
  nombre: string
  porcentaje: number
  tipo: string
  activo: boolean
  porDefecto: boolean
}

interface Gasto {
  id: number
  descripcion: string
  categoriaId?: number | null
  categoria?: CategoriaGasto | null
  monto: number
  impuestoIncluido: boolean
  impuestoId?: number | null
  impuesto?: Impuesto | null
  fecha: string
  proveedor?: string | null
  numeroFactura?: string | null
  notas?: string | null
  adjuntos?: AdjuntoGasto[]
  createdAt: string
  updatedAt: string
}

const defaultCategories = [
  { nombre: "Alquiler", color: "#3B82F6", icono: "building" },
  { nombre: "Material", color: "#F97316", icono: "shopping-bag" },
  { nombre: "Software", color: "#8B5CF6", icono: "laptop" },
  { nombre: "Transporte", color: "#22C55E", icono: "car" },
  { nombre: "Suministros", color: "#EAB308", icono: "lightbulb" },
  { nombre: "Comunicaciones", color: "#EC4899", icono: "phone" },
  { nombre: "Otros", color: "#6B7280", icono: "receipt" },
]

const emptyFormData = {
  descripcion: "",
  categoriaId: "",
  monto: "",
  impuestoIncluido: true,
  impuestoId: "",
  fecha: new Date().toISOString().split("T")[0],
  proveedor: "",
  numeroFactura: "",
  notas: "",
}

export function GastosPage({ onHelp }: { onHelp?: () => void }) {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([])
  const [impuestos, setImpuestos] = useState<Impuesto[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterCategoria, setFilterCategoria] = useState<string>("todas")
  const [filterMes, setFilterMes] = useState<string>("todos")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [gastoToDelete, setGastoToDelete] = useState<Gasto | null>(null)
  const [editingGasto, setEditingGasto] = useState<Gasto | null>(null)
  const [selectedGasto, setSelectedGasto] = useState<Gasto | null>(null)
  const [formData, setFormData] = useState(emptyFormData)
  const [error, setError] = useState<string | null>(null)
  const [isUploadingFile, setIsUploadingFile] = useState(false)
  const [isDeletingAdjunto, setIsDeletingAdjunto] = useState<number | null>(null)
  const [adjuntoError, setAdjuntoError] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<{ url: string; nombre: string; tipo: string } | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState<number | null>(null)
  const [isImportOpen, setIsImportOpen] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const [gastosRes, categoriasRes, impuestosRes] = await Promise.all([
        window.electronAPI?.gastos.getAll(),
        window.electronAPI?.categoriasGasto.getAll(),
        window.electronAPI?.impuestos.getAll(),
      ])

      if (gastosRes?.success) setGastos(gastosRes.data || [])
      if (impuestosRes?.success) setImpuestos(impuestosRes.data || [])

      if (categoriasRes?.success && categoriasRes.data && categoriasRes.data.length > 0) {
        setCategorias(categoriasRes.data)
      } else {
        await createDefaultCategories()
      }
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const createDefaultCategories = async () => {
    try {
      for (const cat of defaultCategories) {
        await window.electronAPI?.categoriasGasto.create(cat)
      }
      const res = await window.electronAPI?.categoriasGasto.getAll()
      if (res?.success) setCategorias(res.data || [])
    } catch (error) {
      console.error("Error creating default categories:", error)
    }
  }

  const meses = [
    { value: "todos", label: "Todos los meses" },
    { value: "01", label: "Enero" },
    { value: "02", label: "Febrero" },
    { value: "03", label: "Marzo" },
    { value: "04", label: "Abril" },
    { value: "05", label: "Mayo" },
    { value: "06", label: "Junio" },
    { value: "07", label: "Julio" },
    { value: "08", label: "Agosto" },
    { value: "09", label: "Septiembre" },
    { value: "10", label: "Octubre" },
    { value: "11", label: "Noviembre" },
    { value: "12", label: "Diciembre" },
  ]

  const filteredGastos = gastos.filter((gasto) => {
    const matchesSearch =
      gasto.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
      gasto.proveedor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      gasto.numeroFactura?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategoria =
      filterCategoria === "todas" || String(gasto.categoriaId) === filterCategoria
    const matchesMes =
      filterMes === "todos" || new Date(gasto.fecha).toISOString().slice(5, 7) === filterMes
    return matchesSearch && matchesCategoria && matchesMes
  })

  const gastosPorCategoria = categorias.map((cat) => ({
    ...cat,
    total: gastos
      .filter((g) => g.categoriaId === cat.id)
      .reduce((acc, g) => acc + g.monto, 0),
    count: gastos.filter((g) => g.categoriaId === cat.id).length,
  }))

  const totalGastos = gastos.reduce((acc, g) => acc + g.monto, 0)
  const totalFiltrado = filteredGastos.reduce((acc, g) => acc + g.monto, 0)

  const gastosMesActual = gastos.filter((g) => {
    const fecha = new Date(g.fecha)
    const now = new Date()
    return fecha.getMonth() === now.getMonth() && fecha.getFullYear() === now.getFullYear()
  }).reduce((acc, g) => acc + g.monto, 0)

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

  const handleOpenDialog = (gasto?: Gasto) => {
    setError(null)
    if (gasto) {
      setEditingGasto(gasto)
      setFormData({
        descripcion: gasto.descripcion,
        categoriaId: gasto.categoriaId ? String(gasto.categoriaId) : "",
        monto: String(gasto.monto),
        impuestoIncluido: gasto.impuestoIncluido,
        impuestoId: gasto.impuestoId ? String(gasto.impuestoId) : "",
        fecha: new Date(gasto.fecha).toISOString().split("T")[0],
        proveedor: gasto.proveedor || "",
        numeroFactura: gasto.numeroFactura || "",
        notas: gasto.notas || "",
      })
    } else {
      setEditingGasto(null)
      const defaultImpuesto = impuestos.find(i => i.porDefecto && i.tipo === 'IVA')
      setFormData({
        ...emptyFormData,
        impuestoId: defaultImpuesto ? String(defaultImpuesto.id) : "",
      })
    }
    setIsDialogOpen(true)
  }

  const handleViewDetail = (gasto: Gasto) => {
    setSelectedGasto(gasto)
    setIsDetailOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.descripcion.trim() || !formData.monto) return

    setIsSaving(true)
    setError(null)
    try {
      const gastoData = {
        descripcion: formData.descripcion,
        categoriaId: formData.categoriaId ? parseInt(formData.categoriaId) : undefined,
        monto: parseFloat(formData.monto),
        impuestoIncluido: formData.impuestoIncluido,
        impuestoId: formData.impuestoId ? parseInt(formData.impuestoId) : null,
        fecha: new Date(formData.fecha),
        proveedor: formData.proveedor || undefined,
        numeroFactura: formData.numeroFactura || undefined,
        notas: formData.notas || undefined,
      }

      if (editingGasto) {
        const response = await window.electronAPI?.gastos.update(editingGasto.id, gastoData)
        if (response?.success) {
          await loadData()
          setIsDialogOpen(false)
        } else {
          setError(response?.error || 'Error al actualizar el gasto')
        }
      } else {
        const response = await window.electronAPI?.gastos.create(gastoData)
        if (response?.success) {
          await loadData()
          setIsDialogOpen(false)
        } else {
          setError(response?.error || 'Error al crear el gasto')
        }
      }
    } catch (err) {
      console.error("Error saving gasto:", err)
      setError(String(err))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!gastoToDelete) return

    try {
      const response = await window.electronAPI?.gastos.delete(gastoToDelete.id)
      if (response?.success) {
        await loadData()
      }
    } catch (error) {
      console.error("Error deleting gasto:", error)
    } finally {
      setDeleteDialogOpen(false)
      setGastoToDelete(null)
    }
  }

  const confirmDelete = (gasto: Gasto) => {
    setGastoToDelete(gasto)
    setDeleteDialogOpen(true)
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !selectedGasto) return

    // Validar tamaño (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setAdjuntoError("El archivo no puede superar 10MB")
      return
    }

    setIsUploadingFile(true)
    setAdjuntoError(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const data = Array.from(new Uint8Array(arrayBuffer))

      const response = await window.electronAPI?.adjuntos.upload(selectedGasto.id, {
        data,
        nombre: file.name,
        tipoMime: file.type,
        tamano: file.size,
      })

      if (response?.success) {
        // Recargar datos para actualizar adjuntos
        await loadData()
        // Actualizar selectedGasto con los nuevos adjuntos
        const updatedGasto = await window.electronAPI?.gastos.getById(selectedGasto.id)
        if (updatedGasto?.success) {
          setSelectedGasto(updatedGasto.data)
        }
      } else {
        setAdjuntoError(response?.error || "Error al subir archivo")
      }
    } catch (err) {
      setAdjuntoError(String(err))
    } finally {
      setIsUploadingFile(false)
      // Limpiar input
      event.target.value = ""
    }
  }

  const handleDownloadAdjunto = async (adjunto: AdjuntoGasto) => {
    try {
      const response = await window.electronAPI?.adjuntos.download(adjunto.id)
      if (response?.success && response.data) {
        const { nombre, tipoMime, data } = response.data
        const blob = new Blob([new Uint8Array(data)], { type: tipoMime })
        const url = URL.createObjectURL(blob)

        // Crear link temporal para descargar
        const link = document.createElement("a")
        link.href = url
        link.download = nombre
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      } else {
        setAdjuntoError(response?.error || "Error al descargar archivo")
      }
    } catch (err) {
      setAdjuntoError(String(err))
    }
  }

  const handleDeleteAdjunto = async (adjuntoId: number) => {
    if (!selectedGasto) return

    setIsDeletingAdjunto(adjuntoId)
    try {
      const response = await window.electronAPI?.adjuntos.delete(adjuntoId)
      if (response?.success) {
        await loadData()
        // Actualizar selectedGasto
        const updatedGasto = await window.electronAPI?.gastos.getById(selectedGasto.id)
        if (updatedGasto?.success) {
          setSelectedGasto(updatedGasto.data)
        }
      } else {
        setAdjuntoError(response?.error || "Error al eliminar archivo")
      }
    } catch (err) {
      setAdjuntoError(String(err))
    } finally {
      setIsDeletingAdjunto(null)
    }
  }

  const arrayToBase64 = (bytes: number[]): string => {
    // Convertir array a base64 de forma segura para archivos grandes
    const uint8Array = new Uint8Array(bytes)
    let binary = ""
    const chunkSize = 8192
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    return btoa(binary)
  }

  const handlePreviewAdjunto = async (adjunto: AdjuntoGasto) => {
    // Solo previsualizar imágenes y PDFs
    if (!adjunto.tipoMime.startsWith("image/") && adjunto.tipoMime !== "application/pdf") {
      // Para otros tipos, descargar directamente
      handleDownloadAdjunto(adjunto)
      return
    }

    setIsLoadingPreview(adjunto.id)
    try {
      const response = await window.electronAPI?.adjuntos.download(adjunto.id)
      if (response?.success && response.data) {
        const { nombre, tipoMime, data } = response.data
        // Usar Blob URL para mejor rendimiento con archivos grandes
        const uint8Array = new Uint8Array(data)
        const blob = new Blob([uint8Array], { type: tipoMime })
        const blobUrl = URL.createObjectURL(blob)
        setPreviewData({ url: blobUrl, nombre, tipo: tipoMime })
      } else {
        setAdjuntoError(response?.error || "Error al cargar previsualización")
      }
    } catch (err) {
      setAdjuntoError(String(err))
    } finally {
      setIsLoadingPreview(null)
    }
  }

  const closePreview = () => {
    // Revocar el Blob URL para liberar memoria
    if (previewData?.url.startsWith('blob:')) {
      URL.revokeObjectURL(previewData.url)
    }
    setPreviewData(null)
  }

  const canPreview = (tipoMime: string) => {
    return tipoMime.startsWith("image/") || tipoMime === "application/pdf"
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (tipoMime: string) => {
    if (tipoMime.startsWith("image/")) return <ImageIcon className="h-4 w-4" />
    return <File className="h-4 w-4" />
  }

  const getCategoriaColor = (categoriaId?: number | null) => {
    if (!categoriaId) return "#6B7280"
    const cat = categorias.find((c) => c.id === categoriaId)
    return cat?.color || "#6B7280"
  }

  const getCategoriaNombre = (categoriaId?: number | null) => {
    if (!categoriaId) return "Sin categoría"
    const cat = categorias.find((c) => c.id === categoriaId)
    return cat?.nombre || "Sin categoría"
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl font-semibold">Gastos</h1>
            <p className="text-sm text-muted-foreground">
              Control y seguimiento de gastos empresariales
            </p>
          </div>
          {onHelp && (
            <button onClick={onHelp} className="rounded-full p-1.5 hover:bg-accent transition-colors" title="Ver ayuda">
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setIsImportOpen(true)}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Importar CSV
          </Button>
          <Button size="sm" onClick={() => handleOpenDialog()}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nuevo Gasto
          </Button>
        </div>
      </div>

      {/* Stats compactos */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Acumulado</p>
            <p className="text-lg font-semibold tabular-nums">{formatCurrency(totalGastos)}</p>
            <p className="text-xs text-muted-foreground">{gastos.length} registros</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Mes Actual</p>
            <p className="text-lg font-semibold tabular-nums">{formatCurrency(gastosMesActual)}</p>
            <p className="text-xs text-muted-foreground">
              {gastos.filter((g) => {
                const fecha = new Date(g.fecha)
                const now = new Date()
                return fecha.getMonth() === now.getMonth() && fecha.getFullYear() === now.getFullYear()
              }).length} gastos
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Filtrado</p>
            <p className="text-lg font-semibold tabular-nums">{formatCurrency(totalFiltrado)}</p>
            <p className="text-xs text-muted-foreground">{filteredGastos.length} resultados</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Categorías</p>
            <p className="text-lg font-semibold tabular-nums">{categorias.filter(c => c.activo).length}</p>
            <p className="text-xs text-muted-foreground">activas</p>
          </CardContent>
        </Card>
      </div>

      {/* Desglose por categoría - Compacto */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Distribución por Categoría</CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {gastosPorCategoria.filter(c => c.activo).map((cat) => {
              const percentage = totalGastos > 0 ? (cat.total / totalGastos) * 100 : 0
              return (
                <div
                  key={cat.id}
                  className="flex items-center gap-2 rounded border p-2"
                >
                  <div
                    className="h-8 w-1 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate">{cat.nombre}</span>
                      <span className="text-xs text-muted-foreground ml-1">{cat.count}</span>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{formatCurrency(cat.total)}</p>
                    <div className="mt-1 h-1 rounded-full bg-muted">
                      <div
                        className="h-1 rounded-full transition-all"
                        style={{ width: `${percentage}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filtros y tabla */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-medium">
              Registro de Gastos
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {filteredGastos.length} de {gastos.length}
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
              <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las categorías</SelectItem>
                  {categorias.filter(c => c.activo).map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        {cat.nombre}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterMes} onValueChange={setFilterMes}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Mes" />
                </SelectTrigger>
                <SelectContent>
                  {meses.map((mes) => (
                    <SelectItem key={mes.value} value={mes.value}>
                      {mes.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 text-xs font-medium">Fecha</TableHead>
                <TableHead className="h-8 text-xs font-medium">Descripción</TableHead>
                <TableHead className="h-8 text-xs font-medium">Categoría</TableHead>
                <TableHead className="h-8 text-xs font-medium">Proveedor</TableHead>
                <TableHead className="h-8 text-xs font-medium">Nº Factura</TableHead>
                <TableHead className="h-8 text-xs font-medium text-right">Importe</TableHead>
                <TableHead className="h-8 text-xs font-medium text-center w-20">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGastos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <FileText className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">No hay gastos registrados</p>
                      <p className="text-xs">
                        {searchTerm || filterCategoria !== "todas" || filterMes !== "todos"
                          ? "Prueba ajustando los filtros"
                          : "Registra tu primer gasto"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredGastos.map((gasto) => (
                  <TableRow
                    key={gasto.id}
                    className="cursor-pointer"
                    onClick={() => handleViewDetail(gasto)}
                  >
                    <TableCell className="py-2 text-xs tabular-nums">
                      {formatDate(gasto.fecha)}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-6 w-0.5 rounded-full"
                          style={{ backgroundColor: getCategoriaColor(gasto.categoriaId) }}
                        />
                        <span className="text-xs font-medium">{gasto.descripcion}</span>
                        {gasto.adjuntos && gasto.adjuntos.length > 0 && (
                          <span className="flex items-center gap-0.5 text-muted-foreground" title={`${gasto.adjuntos.length} adjunto(s)`}>
                            <Paperclip className="h-3 w-3" />
                            <span className="text-[10px]">{gasto.adjuntos.length}</span>
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {gasto.categoria?.nombre || getCategoriaNombre(gasto.categoriaId)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {gasto.proveedor || "-"}
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground font-mono">
                      {gasto.numeroFactura || "-"}
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <span className="text-xs font-medium tabular-nums">
                        {formatCurrency(gasto.monto)}
                      </span>
                      {gasto.impuesto && !gasto.impuestoIncluido && (
                        <span className="ml-1 text-[10px] text-muted-foreground">+{gasto.impuesto.nombre}</span>
                      )}
                      {!gasto.impuesto && !gasto.impuestoIncluido && (
                        <span className="ml-1 text-[10px] text-muted-foreground">+IVA</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleOpenDialog(gasto)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          onClick={() => confirmDelete(gasto)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Totales de la tabla */}
          {filteredGastos.length > 0 && (
            <div className="border-t bg-muted/30 px-4 py-2">
              <div className="flex justify-end gap-8 text-xs">
                <span className="text-muted-foreground">
                  {filteredGastos.length} gasto{filteredGastos.length !== 1 ? "s" : ""}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingGasto ? "Editar Gasto" : "Nuevo Gasto"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="descripcion" className="text-xs">Descripción *</Label>
              <Input
                id="descripcion"
                className="h-8 text-sm"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Descripción del gasto"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="categoria" className="text-xs">Categoría</Label>
                <Select
                  value={formData.categoriaId}
                  onValueChange={(value) => setFormData({ ...formData, categoriaId: value })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    {formData.categoriaId
                      ? <span className="truncate">{categorias.find(c => c.id === Number(formData.categoriaId))?.nombre}</span>
                      : <SelectValue placeholder="Seleccionar" />}
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.filter(c => c.activo).map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          {cat.nombre}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="monto" className="text-xs">Importe *</Label>
                <Input
                  id="monto"
                  type="number"
                  step="0.01"
                  className="h-8 text-sm tabular-nums"
                  value={formData.monto}
                  onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Impuesto</Label>
                <Select
                  value={formData.impuestoId}
                  onValueChange={(value) => setFormData({ ...formData, impuestoId: value })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    {formData.impuestoId
                      ? <span className="truncate">{(() => { const imp = impuestos.find(i => i.id === Number(formData.impuestoId)); return imp ? `${imp.nombre} (${imp.porcentaje}%)` : "" })()}</span>
                      : <SelectValue placeholder="Sin impuesto" />}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin impuesto</SelectItem>
                    {impuestos
                      .filter(i => i.activo)
                      .map((imp) => (
                        <SelectItem key={imp.id} value={String(imp.id)}>
                          {imp.nombre} ({imp.porcentaje}%)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">&nbsp;</Label>
                <div className="flex items-center gap-2 h-8">
                  <Switch
                    id="impuestoIncluido"
                    checked={formData.impuestoIncluido}
                    onCheckedChange={(checked) => setFormData({ ...formData, impuestoIncluido: checked })}
                  />
                  <Label htmlFor="impuestoIncluido" className="text-xs">
                    {(() => {
                      const imp = impuestos.find(i => String(i.id) === formData.impuestoId)
                      return imp ? `${imp.nombre} incluido` : "Impuesto incluido"
                    })()}
                  </Label>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="fecha" className="text-xs">Fecha</Label>
                <Input
                  id="fecha"
                  type="date"
                  className="h-8 text-sm"
                  value={formData.fecha}
                  onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="proveedor" className="text-xs">Proveedor</Label>
                <Input
                  id="proveedor"
                  className="h-8 text-sm"
                  value={formData.proveedor}
                  onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })}
                  placeholder="Nombre"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="numeroFactura" className="text-xs">Nº Factura Proveedor</Label>
              <Input
                id="numeroFactura"
                className="h-8 text-sm font-mono"
                value={formData.numeroFactura}
                onChange={(e) => setFormData({ ...formData, numeroFactura: e.target.value })}
                placeholder="Referencia de factura"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="notas" className="text-xs">Notas</Label>
              <Textarea
                id="notas"
                className="text-sm min-h-[60px]"
                value={formData.notas}
                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                placeholder="Observaciones adicionales..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSaving || !formData.descripcion.trim() || !formData.monto}
            >
              {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {editingGasto ? "Guardar" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de detalle */}
      <Dialog open={isDetailOpen} onOpenChange={(open) => {
        setIsDetailOpen(open)
        if (!open) {
          setAdjuntoError(null)
          closePreview()
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Detalle del Gasto</DialogTitle>
          </DialogHeader>
          {selectedGasto && (
            <div className="space-y-3 py-2">
              <div className="flex items-start gap-2">
                <div
                  className="mt-0.5 h-10 w-1 rounded-full"
                  style={{ backgroundColor: getCategoriaColor(selectedGasto.categoriaId) }}
                />
                <div>
                  <p className="font-medium">{selectedGasto.descripcion}</p>
                  <Badge variant="outline" className="mt-1 text-[10px]">
                    {selectedGasto.categoria?.nombre || getCategoriaNombre(selectedGasto.categoriaId)}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Importe</p>
                  <p className="font-semibold tabular-nums">{formatCurrency(selectedGasto.monto)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {selectedGasto.impuesto
                      ? `${selectedGasto.impuesto.nombre} (${selectedGasto.impuesto.porcentaje}%) ${selectedGasto.impuestoIncluido ? "incluido" : "no incluido"}`
                      : "Sin impuesto"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fecha</p>
                  <p className="font-medium tabular-nums">{formatDate(selectedGasto.fecha)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Proveedor</p>
                  <p className="font-medium">{selectedGasto.proveedor || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Nº Factura</p>
                  <p className="font-mono text-sm">{selectedGasto.numeroFactura || "-"}</p>
                </div>
              </div>

              {selectedGasto.notas && (
                <div>
                  <p className="text-xs text-muted-foreground">Notas</p>
                  <p className="text-sm whitespace-pre-wrap">{selectedGasto.notas}</p>
                </div>
              )}

              {/* Sección de Adjuntos */}
              <div className="border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" />
                    Documentos Adjuntos
                    {selectedGasto.adjuntos && selectedGasto.adjuntos.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {selectedGasto.adjuntos.length}
                      </Badge>
                    )}
                  </span>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                      disabled={isUploadingFile}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      disabled={isUploadingFile}
                      asChild
                    >
                      <span>
                        {isUploadingFile ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Upload className="mr-1 h-3 w-3" />
                        )}
                        Adjuntar
                      </span>
                    </Button>
                  </label>
                </div>

                {adjuntoError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-2 py-1.5 rounded text-xs mb-2">
                    {adjuntoError}
                  </div>
                )}

                {/* Lista de adjuntos */}
                {selectedGasto.adjuntos && selectedGasto.adjuntos.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedGasto.adjuntos.map((adjunto) => (
                      <div
                        key={adjunto.id}
                        className="flex items-center gap-2 p-2 rounded border bg-muted/30 hover:bg-muted/50 group cursor-pointer"
                        onClick={() => handlePreviewAdjunto(adjunto)}
                      >
                        <div className="text-muted-foreground">
                          {isLoadingPreview === adjunto.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            getFileIcon(adjunto.tipoMime)
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{adjunto.nombreOriginal}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatFileSize(adjunto.tamano)} · {canPreview(adjunto.tipoMime) ? "Click para ver" : "Click para descargar"}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          {canPreview(adjunto.tipoMime) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handlePreviewAdjunto(adjunto)}
                              title="Previsualizar"
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleDownloadAdjunto(adjunto)}
                            title="Descargar"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                            onClick={() => handleDeleteAdjunto(adjunto.id)}
                            disabled={isDeletingAdjunto === adjunto.id}
                            title="Eliminar"
                          >
                            {isDeletingAdjunto === adjunto.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <Paperclip className="h-6 w-6 mx-auto mb-1 opacity-30" />
                    <p className="text-xs">Sin documentos adjuntos</p>
                    <p className="text-[10px]">Los archivos se encriptan automáticamente</p>
                  </div>
                )}

                {/* Indicador de previsualización activa */}
                {previewData && (
                  <div className="mt-3 p-3 border rounded-lg bg-blue-50 border-blue-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-blue-600" />
                        <span className="text-xs font-medium text-blue-700">
                          Previsualizando: {previewData.nombre}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={closePreview}
                      >
                        Cerrar vista
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsDetailOpen(false)}>
              Cerrar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setIsDetailOpen(false)
                if (selectedGasto) handleOpenDialog(selectedGasto)
              }}
            >
              <Pencil className="mr-1.5 h-3 w-3" />
              Editar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Eliminar gasto</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Se eliminará permanentemente el gasto "{gastoToDelete?.descripcion}".
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

      {/* Dialog de previsualización de archivo */}
      <Dialog open={!!previewData} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          <div className="flex items-center justify-between pl-4 pr-12 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-3 min-w-0">
              {previewData?.tipo.startsWith("image/") ? (
                <ImageIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              ) : (
                <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{previewData?.nombre}</p>
                <p className="text-xs text-muted-foreground">Documento encriptado</p>
              </div>
            </div>
            {previewData && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => {
                  const link = document.createElement("a")
                  link.href = previewData.url
                  link.download = previewData.nombre
                  link.click()
                }}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Descargar
              </Button>
            )}
          </div>
          <div className="flex items-center justify-center bg-muted/10 overflow-auto" style={{ minHeight: "400px", maxHeight: "calc(90vh - 60px)" }}>
            {previewData?.tipo.startsWith("image/") ? (
              <img
                src={previewData.url}
                alt={previewData.nombre}
                className="max-w-full max-h-[calc(90vh-80px)] object-contain"
              />
            ) : previewData?.tipo === "application/pdf" ? (
              <div className="w-full h-[calc(90vh-80px)] flex flex-col">
                <iframe
                  src={previewData.url}
                  title={previewData.nombre}
                  className="w-full flex-1 border-0"
                  style={{ minHeight: "500px" }}
                />
                <div className="p-3 bg-muted/30 border-t text-center">
                  <p className="text-xs text-muted-foreground mb-2">
                    Si el PDF no se muestra correctamente, puedes abrirlo en una nueva ventana
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newWindow = window.open()
                      if (newWindow) {
                        newWindow.document.write(`
                          <html>
                            <head><title>${previewData.nombre}</title></head>
                            <body style="margin:0;padding:0;">
                              <iframe src="${previewData.url}" style="width:100%;height:100vh;border:none;"></iframe>
                            </body>
                          </html>
                        `)
                      }
                    }}
                  >
                    Abrir en nueva ventana
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Importar CSV Dialog */}
      <ImportarGastosDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        categorias={categorias}
        impuestos={impuestos}
        onImportComplete={loadData}
      />
    </div>
  )
}
