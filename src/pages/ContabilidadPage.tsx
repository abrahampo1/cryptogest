import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  Lock,
  BookOpen,
  Calendar,
  List,
  FileText,
  Receipt,
  X,
} from "lucide-react"

// ── Local types for form data ──────────────────────────────────────────

interface LineaAsientoForm {
  cuentaId: string
  debe: string
  haber: string
  concepto: string
}

const emptyLineaForm: LineaAsientoForm = {
  cuentaId: "",
  debe: "0",
  haber: "0",
  concepto: "",
}

const tipoCuentaConfig: Record<string, { label: string; color: string }> = {
  activo: { label: "Activo", color: "bg-blue-50 text-blue-700" },
  pasivo: { label: "Pasivo", color: "bg-red-50 text-red-700" },
  patrimonio_neto: { label: "Patrimonio Neto", color: "bg-purple-50 text-purple-700" },
  ingreso: { label: "Ingreso", color: "bg-green-50 text-green-700" },
  gasto: { label: "Gasto", color: "bg-orange-50 text-orange-700" },
}

const grupoConfig: Record<number, { label: string; color: string }> = {
  1: { label: "1 - Financiación básica", color: "bg-indigo-50 text-indigo-700" },
  2: { label: "2 - Inmovilizado", color: "bg-cyan-50 text-cyan-700" },
  3: { label: "3 - Existencias", color: "bg-amber-50 text-amber-700" },
  4: { label: "4 - Acreedores y deudores", color: "bg-rose-50 text-rose-700" },
  5: { label: "5 - Cuentas financieras", color: "bg-teal-50 text-teal-700" },
  6: { label: "6 - Compras y gastos", color: "bg-orange-50 text-orange-700" },
  7: { label: "7 - Ventas e ingresos", color: "bg-emerald-50 text-emerald-700" },
}

const tipoAsientoConfig: Record<string, { label: string; color: string }> = {
  manual: { label: "Manual", color: "bg-slate-100 text-slate-600" },
  factura: { label: "Factura", color: "bg-blue-50 text-blue-700" },
  gasto: { label: "Gasto", color: "bg-orange-50 text-orange-700" },
}

// ── Helpers ─────────────────────────────────────────────────────────────

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

// ── Component ───────────────────────────────────────────────────────────

export function ContabilidadPage() {
  // ── Shared state ──────────────────────────────────────────────────────
  const [cuentas, setCuentas] = useState<CuentaContable[]>([])
  const [ejercicios, setEjercicios] = useState<EjercicioFiscal[]>([])
  const [asientos, setAsientos] = useState<Asiento[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Plan de Cuentas state ─────────────────────────────────────────────
  const [cuentaSearch, setCuentaSearch] = useState("")
  const [cuentaFilterGrupo, setCuentaFilterGrupo] = useState<string>("todos")
  const [isCuentaDialogOpen, setIsCuentaDialogOpen] = useState(false)
  const [editingCuenta, setEditingCuenta] = useState<CuentaContable | null>(null)
  const [deleteCuentaDialogOpen, setDeleteCuentaDialogOpen] = useState(false)
  const [cuentaToDelete, setCuentaToDelete] = useState<CuentaContable | null>(null)
  const [cuentaForm, setCuentaForm] = useState({
    codigo: "",
    nombre: "",
    tipo: "activo",
    grupo: "1",
    nivel: "1",
    cuentaPadreId: "",
    activo: true,
  })

  // ── Asientos state ────────────────────────────────────────────────────
  const [selectedEjercicioId, setSelectedEjercicioId] = useState<string>("")
  const [isAsientoDialogOpen, setIsAsientoDialogOpen] = useState(false)
  const [editingAsiento, setEditingAsiento] = useState<Asiento | null>(null)
  const [deleteAsientoDialogOpen, setDeleteAsientoDialogOpen] = useState(false)
  const [asientoToDelete, setAsientoToDelete] = useState<Asiento | null>(null)
  const [asientoForm, setAsientoForm] = useState({
    fecha: new Date().toISOString().split("T")[0],
    descripcion: "",
    tipo: "manual",
    documentoRef: "",
  })
  const [lineasForm, setLineasForm] = useState<LineaAsientoForm[]>([{ ...emptyLineaForm }])

  // ── Generar desde Factura / Gasto ─────────────────────────────────────
  const [isFacturaDialogOpen, setIsFacturaDialogOpen] = useState(false)
  const [isGastoDialogOpen, setIsGastoDialogOpen] = useState(false)
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [gastos, setGastos] = useState<any[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  // ── Libro Diario state ────────────────────────────────────────────────
  const [diarioEjercicioId, setDiarioEjercicioId] = useState<string>("")
  const [diarioFechaDesde, setDiarioFechaDesde] = useState("")
  const [diarioFechaHasta, setDiarioFechaHasta] = useState("")
  const [diarioAsientos, setDiarioAsientos] = useState<Asiento[]>([])
  const [isDiarioLoading, setIsDiarioLoading] = useState(false)

  // ── Libro Mayor state ─────────────────────────────────────────────────
  const [mayorCuentaId, setMayorCuentaId] = useState<string>("")
  const [mayorEjercicioId, setMayorEjercicioId] = useState<string>("")
  const [mayorFechaDesde, setMayorFechaDesde] = useState("")
  const [mayorFechaHasta, setMayorFechaHasta] = useState("")
  const [mayorData, setMayorData] = useState<LibroMayorData | null>(null)
  const [isMayorLoading, setIsMayorLoading] = useState(false)

  // ── Load initial data ─────────────────────────────────────────────────

  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    try {
      setIsLoading(true)

      // Seed PGC (idempotent) then load cuentas
      await window.electronAPI?.cuentas.seedPGC()

      const [cuentasRes, ejerciciosRes] = await Promise.all([
        window.electronAPI?.cuentas.getAll(),
        window.electronAPI?.ejercicios.getAll(),
      ])

      if (cuentasRes?.success) setCuentas(cuentasRes.data || [])

      if (ejerciciosRes?.success && ejerciciosRes.data) {
        setEjercicios(ejerciciosRes.data)
      }

      // Ensure current year ejercicio exists
      const currentRes = await window.electronAPI?.ejercicios.getOrCreateCurrent()
      if (currentRes?.success && currentRes.data) {
        // Refresh ejercicios list
        const ejRes = await window.electronAPI?.ejercicios.getAll()
        if (ejRes?.success) {
          setEjercicios(ejRes.data || [])
        }
        setSelectedEjercicioId(String(currentRes.data.id))
        setDiarioEjercicioId(String(currentRes.data.id))
        setMayorEjercicioId(String(currentRes.data.id))
      }
    } catch (err) {
      console.error("Error loading contabilidad data:", err)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Load asientos when ejercicio changes ──────────────────────────────

  useEffect(() => {
    if (selectedEjercicioId) {
      loadAsientos()
    }
  }, [selectedEjercicioId])

  const loadAsientos = async () => {
    if (!selectedEjercicioId) return
    try {
      const res = await window.electronAPI?.asientos.getAll({
        ejercicioId: parseInt(selectedEjercicioId),
      })
      if (res?.success) setAsientos(res.data || [])
    } catch (err) {
      console.error("Error loading asientos:", err)
    }
  }

  const loadCuentas = async () => {
    try {
      const res = await window.electronAPI?.cuentas.getAll()
      if (res?.success) setCuentas(res.data || [])
    } catch (err) {
      console.error("Error loading cuentas:", err)
    }
  }

  // ── Plan de Cuentas handlers ──────────────────────────────────────────

  const filteredCuentas = cuentas.filter((cuenta) => {
    const matchesSearch =
      cuenta.codigo.toLowerCase().includes(cuentaSearch.toLowerCase()) ||
      cuenta.nombre.toLowerCase().includes(cuentaSearch.toLowerCase())
    const matchesGrupo =
      cuentaFilterGrupo === "todos" || String(cuenta.grupo) === cuentaFilterGrupo
    return matchesSearch && matchesGrupo
  })

  const handleOpenCuentaDialog = (cuenta?: CuentaContable) => {
    setError(null)
    if (cuenta) {
      setEditingCuenta(cuenta)
      setCuentaForm({
        codigo: cuenta.codigo,
        nombre: cuenta.nombre,
        tipo: cuenta.tipo,
        grupo: String(cuenta.grupo),
        nivel: String(cuenta.nivel),
        cuentaPadreId: cuenta.cuentaPadreId ? String(cuenta.cuentaPadreId) : "",
        activo: cuenta.activo,
      })
    } else {
      setEditingCuenta(null)
      setCuentaForm({
        codigo: "",
        nombre: "",
        tipo: "activo",
        grupo: "1",
        nivel: "1",
        cuentaPadreId: "",
        activo: true,
      })
    }
    setIsCuentaDialogOpen(true)
  }

  const handleSubmitCuenta = async () => {
    if (!cuentaForm.codigo.trim() || !cuentaForm.nombre.trim()) return

    setIsSaving(true)
    setError(null)
    try {
      const data = {
        codigo: cuentaForm.codigo,
        nombre: cuentaForm.nombre,
        tipo: cuentaForm.tipo,
        grupo: parseInt(cuentaForm.grupo),
        nivel: parseInt(cuentaForm.nivel),
        cuentaPadreId: cuentaForm.cuentaPadreId ? parseInt(cuentaForm.cuentaPadreId) : null,
        activo: cuentaForm.activo,
      }

      if (editingCuenta) {
        // For esSistema accounts, only allow nombre and activo changes
        const updateData = editingCuenta.esSistema
          ? { nombre: data.nombre, activo: data.activo }
          : data
        const res = await window.electronAPI?.cuentas.update(editingCuenta.id, updateData)
        if (res?.success) {
          await loadCuentas()
          setIsCuentaDialogOpen(false)
        } else {
          setError(res?.error || "Error al actualizar la cuenta")
        }
      } else {
        const res = await window.electronAPI?.cuentas.create(data)
        if (res?.success) {
          await loadCuentas()
          setIsCuentaDialogOpen(false)
        } else {
          setError(res?.error || "Error al crear la cuenta")
        }
      }
    } catch (err) {
      console.error("Error saving cuenta:", err)
      setError(String(err))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteCuenta = async () => {
    if (!cuentaToDelete) return
    try {
      const res = await window.electronAPI?.cuentas.delete(cuentaToDelete.id)
      if (res?.success) {
        await loadCuentas()
      }
    } catch (err) {
      console.error("Error deleting cuenta:", err)
    } finally {
      setDeleteCuentaDialogOpen(false)
      setCuentaToDelete(null)
    }
  }

  const confirmDeleteCuenta = (cuenta: CuentaContable) => {
    setCuentaToDelete(cuenta)
    setDeleteCuentaDialogOpen(true)
  }

  // ── Asientos handlers ─────────────────────────────────────────────────

  const handleOpenAsientoDialog = async (asiento?: Asiento) => {
    setError(null)
    if (asiento) {
      setEditingAsiento(asiento)
      setAsientoForm({
        fecha: new Date(asiento.fecha).toISOString().split("T")[0],
        descripcion: asiento.descripcion,
        tipo: asiento.tipo,
        documentoRef: asiento.documentoRef || "",
      })
      setLineasForm(
        asiento.lineas?.map((l: any) => ({
          cuentaId: String(l.cuentaId),
          debe: String(l.debe),
          haber: String(l.haber),
          concepto: l.concepto || "",
        })) || [{ ...emptyLineaForm }]
      )
    } else {
      setEditingAsiento(null)
      setAsientoForm({
        fecha: new Date().toISOString().split("T")[0],
        descripcion: "",
        tipo: "manual",
        documentoRef: "",
      })
      setLineasForm([{ ...emptyLineaForm }, { ...emptyLineaForm }])
    }
    setIsAsientoDialogOpen(true)
  }

  const handleAddLinea = () => {
    setLineasForm([...lineasForm, { ...emptyLineaForm }])
  }

  const handleRemoveLinea = (index: number) => {
    if (lineasForm.length > 1) {
      setLineasForm(lineasForm.filter((_, i) => i !== index))
    }
  }

  const handleLineaChange = (index: number, field: keyof LineaAsientoForm, value: string) => {
    const newLineas = [...lineasForm]
    newLineas[index] = { ...newLineas[index], [field]: value }
    setLineasForm(newLineas)
  }

  const totalDebe = lineasForm.reduce((sum, l) => sum + (parseFloat(l.debe) || 0), 0)
  const totalHaber = lineasForm.reduce((sum, l) => sum + (parseFloat(l.haber) || 0), 0)
  const diferencia = Math.abs(totalDebe - totalHaber)
  const isBalanced = diferencia < 0.01

  const handleSubmitAsiento = async () => {
    if (!asientoForm.descripcion.trim() || !isBalanced) return
    if (!selectedEjercicioId) return

    setIsSaving(true)
    setError(null)
    try {
      const data = {
        fecha: new Date(asientoForm.fecha),
        descripcion: asientoForm.descripcion,
        tipo: asientoForm.tipo,
        documentoRef: asientoForm.documentoRef || null,
        ejercicioId: parseInt(selectedEjercicioId),
        lineas: lineasForm
          .filter((l) => l.cuentaId)
          .map((l) => ({
            cuentaId: parseInt(l.cuentaId),
            debe: parseFloat(l.debe) || 0,
            haber: parseFloat(l.haber) || 0,
            concepto: l.concepto || null,
          })),
      }

      if (editingAsiento) {
        const res = await window.electronAPI?.asientos.update(editingAsiento.id, data)
        if (res?.success) {
          await loadAsientos()
          setIsAsientoDialogOpen(false)
        } else {
          setError(res?.error || "Error al actualizar el asiento")
        }
      } else {
        const res = await window.electronAPI?.asientos.create(data)
        if (res?.success) {
          await loadAsientos()
          setIsAsientoDialogOpen(false)
        } else {
          setError(res?.error || "Error al crear el asiento")
        }
      }
    } catch (err) {
      console.error("Error saving asiento:", err)
      setError(String(err))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteAsiento = async () => {
    if (!asientoToDelete) return
    try {
      const res = await window.electronAPI?.asientos.delete(asientoToDelete.id)
      if (res?.success) {
        await loadAsientos()
      }
    } catch (err) {
      console.error("Error deleting asiento:", err)
    } finally {
      setDeleteAsientoDialogOpen(false)
      setAsientoToDelete(null)
    }
  }

  const confirmDeleteAsiento = (asiento: Asiento) => {
    setAsientoToDelete(asiento)
    setDeleteAsientoDialogOpen(true)
  }

  // ── Generar desde Factura / Gasto ─────────────────────────────────────

  const handleOpenFacturaDialog = async () => {
    try {
      const res = await window.electronAPI?.facturas.getAll()
      if (res?.success) {
        // Filter facturas that don't already have an asiento
        const facturasConAsiento = new Set(
          asientos.filter((a) => a.facturaId).map((a) => a.facturaId)
        )
        setFacturas((res.data || []).filter((f: Factura) => !facturasConAsiento.has(f.id)))
      }
    } catch (err) {
      console.error("Error loading facturas:", err)
    }
    setIsFacturaDialogOpen(true)
  }

  const handleOpenGastoDialog = async () => {
    try {
      const res = await window.electronAPI?.gastos.getAll()
      if (res?.success) {
        // Filter gastos that don't already have an asiento
        const gastosConAsiento = new Set(
          asientos.filter((a) => a.gastoId).map((a) => a.gastoId)
        )
        setGastos((res.data || []).filter((g: any) => !gastosConAsiento.has(g.id)))
      }
    } catch (err) {
      console.error("Error loading gastos:", err)
    }
    setIsGastoDialogOpen(true)
  }

  const handleGenerarDesdeFactura = async (facturaId: number) => {
    setIsGenerating(true)
    try {
      const res = await window.electronAPI?.contabilidad.generarAsientoFactura(facturaId)
      if (res?.success) {
        await loadAsientos()
        setIsFacturaDialogOpen(false)
      } else {
        setError(res?.error || "Error al generar asiento desde factura")
      }
    } catch (err) {
      console.error("Error generating asiento from factura:", err)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerarDesdeGasto = async (gastoId: number) => {
    setIsGenerating(true)
    try {
      const res = await window.electronAPI?.contabilidad.generarAsientoGasto(gastoId)
      if (res?.success) {
        await loadAsientos()
        setIsGastoDialogOpen(false)
      } else {
        setError(res?.error || "Error al generar asiento desde gasto")
      }
    } catch (err) {
      console.error("Error generating asiento from gasto:", err)
    } finally {
      setIsGenerating(false)
    }
  }

  // ── Libro Diario handlers ─────────────────────────────────────────────

  const loadLibroDiario = async () => {
    if (!diarioEjercicioId) return
    setIsDiarioLoading(true)
    try {
      const filters: any = { ejercicioId: parseInt(diarioEjercicioId) }
      if (diarioFechaDesde) filters.fechaDesde = diarioFechaDesde
      if (diarioFechaHasta) filters.fechaHasta = diarioFechaHasta

      const res = await window.electronAPI?.asientos.getAll(filters)
      if (res?.success) {
        setDiarioAsientos(res.data || [])
      }
    } catch (err) {
      console.error("Error loading libro diario:", err)
    } finally {
      setIsDiarioLoading(false)
    }
  }

  useEffect(() => {
    if (diarioEjercicioId) {
      loadLibroDiario()
    }
  }, [diarioEjercicioId, diarioFechaDesde, diarioFechaHasta])

  // ── Libro Mayor handlers ──────────────────────────────────────────────

  const loadLibroMayor = async () => {
    if (!mayorCuentaId || !mayorEjercicioId) return
    setIsMayorLoading(true)
    try {
      const params: any = {
        cuentaId: parseInt(mayorCuentaId),
        ejercicioId: parseInt(mayorEjercicioId),
      }
      if (mayorFechaDesde) params.fechaDesde = mayorFechaDesde
      if (mayorFechaHasta) params.fechaHasta = mayorFechaHasta

      const res = await window.electronAPI?.contabilidad.libroMayor(params)
      if (res?.success) {
        setMayorData(res.data || null)
      }
    } catch (err) {
      console.error("Error loading libro mayor:", err)
    } finally {
      setIsMayorLoading(false)
    }
  }

  useEffect(() => {
    if (mayorCuentaId && mayorEjercicioId) {
      loadLibroMayor()
    } else {
      setMayorData(null)
    }
  }, [mayorCuentaId, mayorEjercicioId, mayorFechaDesde, mayorFechaHasta])

  // ── Asiento helpers ───────────────────────────────────────────────────

  const getAsientoTotalDebe = (asiento: any) =>
    asiento.lineas?.reduce((sum: number, l: any) => sum + l.debe, 0) || 0

  const getAsientoTotalHaber = (asiento: any) =>
    asiento.lineas?.reduce((sum: number, l: any) => sum + l.haber, 0) || 0

  // ── Diario flattened lines ────────────────────────────────────────────

  const diarioLines: {
    asientoId: number
    asientoNumero: number
    fecha: Date | string
    cuentaCodigo: string
    cuentaNombre: string
    concepto: string
    debe: number
    haber: number
    isFirstOfGroup: boolean
  }[] = []

  diarioAsientos.forEach((asiento: any) => {
    asiento.lineas?.forEach((linea: any, lineaIndex: number) => {
      diarioLines.push({
        asientoId: asiento.id,
        asientoNumero: asiento.numero,
        fecha: asiento.fecha,
        cuentaCodigo: linea.cuenta?.codigo || "",
        cuentaNombre: linea.cuenta?.nombre || "",
        concepto: linea.concepto || asiento.descripcion,
        debe: linea.debe,
        haber: linea.haber,
        isFirstOfGroup: lineaIndex === 0,
      })
    })
  })

  const diarioTotalDebe = diarioLines.reduce((sum, l) => sum + l.debe, 0)
  const diarioTotalHaber = diarioLines.reduce((sum, l) => sum + l.haber, 0)

  // ── Loading state ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h1 className="text-xl font-semibold">Contabilidad</h1>
          <p className="text-sm text-muted-foreground">
            Plan de cuentas, asientos contables y libros oficiales
          </p>
        </div>
      </div>

      <Tabs defaultValue="plan-cuentas" className="space-y-4">
        <TabsList className="h-8">
          <TabsTrigger value="plan-cuentas" className="text-xs h-7 px-3">
            <List className="mr-1.5 h-3.5 w-3.5" />
            Plan de Cuentas
          </TabsTrigger>
          <TabsTrigger value="asientos" className="text-xs h-7 px-3">
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Asientos
          </TabsTrigger>
          <TabsTrigger value="libro-diario" className="text-xs h-7 px-3">
            <BookOpen className="mr-1.5 h-3.5 w-3.5" />
            Libro Diario
          </TabsTrigger>
          <TabsTrigger value="libro-mayor" className="text-xs h-7 px-3">
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            Libro Mayor
          </TabsTrigger>
        </TabsList>

        {/* ================================================================
            TAB 1: PLAN DE CUENTAS
            ================================================================ */}
        <TabsContent value="plan-cuentas">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-sm font-medium">
                  Plan General Contable
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {filteredCuentas.length} de {cuentas.length}
                  </span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar..."
                      className="h-8 w-48 pl-7 text-xs"
                      value={cuentaSearch}
                      onChange={(e) => setCuentaSearch(e.target.value)}
                    />
                  </div>
                  <Select value={cuentaFilterGrupo} onValueChange={setCuentaFilterGrupo}>
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue placeholder="Grupo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los grupos</SelectItem>
                      {[1, 2, 3, 4, 5, 6, 7].map((g) => (
                        <SelectItem key={g} value={String(g)}>
                          Grupo {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={() => handleOpenCuentaDialog()}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Nueva Cuenta
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs">Codigo</TableHead>
                    <TableHead className="h-9 text-xs">Nombre</TableHead>
                    <TableHead className="h-9 text-xs">Tipo</TableHead>
                    <TableHead className="h-9 text-xs">Grupo</TableHead>
                    <TableHead className="h-9 text-xs text-center">Estado</TableHead>
                    <TableHead className="h-9 text-xs text-center w-20">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCuentas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <List className="h-8 w-8 mb-2 opacity-50" />
                          <p className="text-sm">No hay cuentas registradas</p>
                          <p className="text-xs">
                            {cuentaSearch || cuentaFilterGrupo !== "todos"
                              ? "Prueba ajustando los filtros"
                              : "El plan de cuentas se cargara automaticamente"}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCuentas.map((cuenta) => {
                      const tipoConf = tipoCuentaConfig[cuenta.tipo] || {
                        label: cuenta.tipo,
                        color: "bg-slate-100 text-slate-600",
                      }
                      const grupoConf = grupoConfig[cuenta.grupo]
                      return (
                        <TableRow key={cuenta.id} className={!cuenta.activo ? "opacity-60" : ""}>
                          <TableCell className="py-2">
                            <span className="font-mono text-xs font-medium">{cuenta.codigo}</span>
                          </TableCell>
                          <TableCell
                            className="py-2 text-xs"
                            style={{
                              paddingLeft:
                                cuenta.nivel > 1 ? cuenta.nivel * 16 + "px" : undefined,
                            }}
                          >
                            <div className="flex items-center gap-1.5">
                              {cuenta.esSistema && (
                                <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              )}
                              <span>{cuenta.nombre}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${tipoConf.color}`}
                            >
                              {tipoConf.label}
                            </span>
                          </TableCell>
                          <TableCell className="py-2">
                            {grupoConf && (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${grupoConf.color}`}
                              >
                                Grupo {cuenta.grupo}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-center">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded ${
                                cuenta.activo
                                  ? "bg-green-50 text-green-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {cuenta.activo ? "Activa" : "Inactiva"}
                            </span>
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex justify-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleOpenCuentaDialog(cuenta)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              {cuenta.esSistema ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground cursor-not-allowed"
                                  disabled
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                                  onClick={() => confirmDeleteCuenta(cuenta)}
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

              {filteredCuentas.length > 0 && (
                <div className="border-t bg-muted/30 px-4 py-2">
                  <div className="flex justify-end gap-8 text-xs">
                    <span className="text-muted-foreground">
                      {filteredCuentas.length} cuenta{filteredCuentas.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB 2: ASIENTOS
            ================================================================ */}
        <TabsContent value="asientos" className="space-y-4">
          {/* Ejercicio selector + actions */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Ejercicio:</Label>
              <Select value={selectedEjercicioId} onValueChange={setSelectedEjercicioId}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {ejercicios.map((ej) => (
                    <SelectItem key={ej.id} value={String(ej.id)}>
                      {ej.anio} ({ej.estado})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleOpenFacturaDialog}>
                <Receipt className="mr-1.5 h-3.5 w-3.5" />
                Desde Factura
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenGastoDialog}>
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Desde Gasto
              </Button>
              <Button size="sm" onClick={() => handleOpenAsientoDialog()}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Nuevo Asiento
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Asientos Contables
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {asientos.length} asiento{asientos.length !== 1 ? "s" : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs">N.º</TableHead>
                    <TableHead className="h-9 text-xs">Fecha</TableHead>
                    <TableHead className="h-9 text-xs">Descripcion</TableHead>
                    <TableHead className="h-9 text-xs">Tipo</TableHead>
                    <TableHead className="h-9 text-xs text-right">Debe</TableHead>
                    <TableHead className="h-9 text-xs text-right">Haber</TableHead>
                    <TableHead className="h-9 text-xs text-center w-20">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {asientos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <FileText className="h-8 w-8 mb-2 opacity-50" />
                          <p className="text-sm">No hay asientos registrados</p>
                          <p className="text-xs">Crea tu primer asiento contable</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    asientos.map((asiento) => {
                      const tipoConf = tipoAsientoConfig[asiento.tipo] || tipoAsientoConfig.manual
                      return (
                        <TableRow key={asiento.id}>
                          <TableCell className="py-2">
                            <span className="font-mono text-xs font-medium">{asiento.numero}</span>
                          </TableCell>
                          <TableCell className="py-2 text-xs tabular-nums">
                            {formatDate(asiento.fecha)}
                          </TableCell>
                          <TableCell className="py-2 text-xs">
                            {asiento.descripcion}
                            {asiento.documentoRef && (
                              <span className="ml-1.5 text-muted-foreground font-mono">
                                [{asiento.documentoRef}]
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${tipoConf.color}`}
                            >
                              {tipoConf.label}
                            </span>
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <span className="text-xs font-medium tabular-nums">
                              {formatCurrency(getAsientoTotalDebe(asiento))}
                            </span>
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <span className="text-xs font-medium tabular-nums">
                              {formatCurrency(getAsientoTotalHaber(asiento))}
                            </span>
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex justify-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleOpenAsientoDialog(asiento)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              {asiento.tipo === "manual" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                                  onClick={() => confirmDeleteAsiento(asiento)}
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

              {asientos.length > 0 && (
                <div className="border-t bg-muted/30 px-4 py-2">
                  <div className="flex justify-end gap-8 text-xs">
                    <span className="text-muted-foreground">
                      {asientos.length} asiento{asientos.length !== 1 ? "s" : ""}
                    </span>
                    <span className="font-medium">
                      Debe:{" "}
                      <span className="tabular-nums">
                        {formatCurrency(asientos.reduce((s, a) => s + getAsientoTotalDebe(a), 0))}
                      </span>
                    </span>
                    <span className="font-medium">
                      Haber:{" "}
                      <span className="tabular-nums">
                        {formatCurrency(asientos.reduce((s, a) => s + getAsientoTotalHaber(a), 0))}
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB 3: LIBRO DIARIO
            ================================================================ */}
        <TabsContent value="libro-diario" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Filtros del Libro Diario</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Ejercicio</Label>
                  <Select value={diarioEjercicioId} onValueChange={setDiarioEjercicioId}>
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {ejercicios.map((ej) => (
                        <SelectItem key={ej.id} value={String(ej.id)}>
                          {ej.anio}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Fecha desde</Label>
                  <Input
                    type="date"
                    className="h-8 text-sm w-40"
                    value={diarioFechaDesde}
                    onChange={(e) => setDiarioFechaDesde(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Fecha hasta</Label>
                  <Input
                    type="date"
                    className="h-8 text-sm w-40"
                    value={diarioFechaHasta}
                    onChange={(e) => setDiarioFechaHasta(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Libro Diario
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {diarioAsientos.length} asiento{diarioAsientos.length !== 1 ? "s" : ""} / {diarioLines.length} apunte{diarioLines.length !== 1 ? "s" : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isDiarioLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-9 text-xs">Fecha</TableHead>
                      <TableHead className="h-9 text-xs">Asiento N.º</TableHead>
                      <TableHead className="h-9 text-xs">Cuenta</TableHead>
                      <TableHead className="h-9 text-xs">Concepto</TableHead>
                      <TableHead className="h-9 text-xs text-right">Debe</TableHead>
                      <TableHead className="h-9 text-xs text-right">Haber</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diarioLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <BookOpen className="h-8 w-8 mb-2 opacity-50" />
                            <p className="text-sm">Sin movimientos en el libro diario</p>
                            <p className="text-xs">Selecciona un ejercicio con asientos registrados</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      diarioLines.map((line, idx) => (
                        <TableRow
                          key={`${line.asientoId}-${idx}`}
                          className={line.isFirstOfGroup && idx > 0 ? "border-t-2" : ""}
                        >
                          <TableCell className="py-2 text-xs tabular-nums">
                            {line.isFirstOfGroup ? formatDate(line.fecha) : ""}
                          </TableCell>
                          <TableCell className="py-2">
                            {line.isFirstOfGroup && (
                              <span className="font-mono text-xs font-medium">
                                {line.asientoNumero}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-xs">
                            <span className="font-mono">{line.cuentaCodigo}</span>
                            {line.cuentaNombre && (
                              <span className="ml-1.5 text-muted-foreground">
                                {line.cuentaNombre}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground">
                            {line.concepto}
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <span className="text-xs tabular-nums">
                              {line.debe > 0 ? formatCurrency(line.debe) : ""}
                            </span>
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <span className="text-xs tabular-nums">
                              {line.haber > 0 ? formatCurrency(line.haber) : ""}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}

              {diarioLines.length > 0 && (
                <div className="border-t bg-muted/30 px-4 py-2">
                  <div className="flex justify-end gap-8 text-xs">
                    <span className="font-medium">
                      Total Debe:{" "}
                      <span className="tabular-nums">{formatCurrency(diarioTotalDebe)}</span>
                    </span>
                    <span className="font-medium">
                      Total Haber:{" "}
                      <span className="tabular-nums">{formatCurrency(diarioTotalHaber)}</span>
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB 4: LIBRO MAYOR
            ================================================================ */}
        <TabsContent value="libro-mayor" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Filtros del Libro Mayor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Cuenta</Label>
                  <Select value={mayorCuentaId} onValueChange={setMayorCuentaId}>
                    <SelectTrigger className="h-8 w-64 text-xs">
                      <SelectValue placeholder="Seleccionar cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      {cuentas
                        .filter((c) => c.activo)
                        .map((cuenta) => (
                          <SelectItem key={cuenta.id} value={String(cuenta.id)}>
                            {cuenta.codigo} - {cuenta.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Ejercicio</Label>
                  <Select value={mayorEjercicioId} onValueChange={setMayorEjercicioId}>
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {ejercicios.map((ej) => (
                        <SelectItem key={ej.id} value={String(ej.id)}>
                          {ej.anio}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Fecha desde</Label>
                  <Input
                    type="date"
                    className="h-8 text-sm w-40"
                    value={mayorFechaDesde}
                    onChange={(e) => setMayorFechaDesde(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Fecha hasta</Label>
                  <Input
                    type="date"
                    className="h-8 text-sm w-40"
                    value={mayorFechaHasta}
                    onChange={(e) => setMayorFechaHasta(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Libro Mayor
                {mayorData && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {mayorData.cuenta.codigo} - {mayorData.cuenta.nombre} ({mayorData.movimientos.length} movimiento{mayorData.movimientos.length !== 1 ? "s" : ""})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isMayorLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !mayorCuentaId || !mayorData ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Calendar className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">
                    {!mayorCuentaId
                      ? "Selecciona una cuenta para ver el libro mayor"
                      : "Sin movimientos para la cuenta seleccionada"}
                  </p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 text-xs">Fecha</TableHead>
                        <TableHead className="h-9 text-xs">Asiento N.º</TableHead>
                        <TableHead className="h-9 text-xs">Concepto</TableHead>
                        <TableHead className="h-9 text-xs text-right">Debe</TableHead>
                        <TableHead className="h-9 text-xs text-right">Haber</TableHead>
                        <TableHead className="h-9 text-xs text-right">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mayorData.movimientos.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-32 text-center">
                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                              <Calendar className="h-8 w-8 mb-2 opacity-50" />
                              <p className="text-sm">Sin movimientos</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        mayorData.movimientos.map((mov: any, idx: number) => (
                          <TableRow key={`${mov.id}-${idx}`}>
                            <TableCell className="py-2 text-xs tabular-nums">
                              {mov.asientoId
                                ? formatDate(
                                    asientos.find((a) => a.id === mov.asientoId)?.fecha ||
                                      new Date()
                                  )
                                : ""}
                            </TableCell>
                            <TableCell className="py-2">
                              <span className="font-mono text-xs">
                                {asientos.find((a) => a.id === mov.asientoId)?.numero || mov.asientoId}
                              </span>
                            </TableCell>
                            <TableCell className="py-2 text-xs text-muted-foreground">
                              {mov.concepto || ""}
                            </TableCell>
                            <TableCell className="py-2 text-right">
                              <span className="text-xs tabular-nums">
                                {mov.debe > 0 ? formatCurrency(mov.debe) : ""}
                              </span>
                            </TableCell>
                            <TableCell className="py-2 text-right">
                              <span className="text-xs tabular-nums">
                                {mov.haber > 0 ? formatCurrency(mov.haber) : ""}
                              </span>
                            </TableCell>
                            <TableCell className="py-2 text-right">
                              <span
                                className={`text-xs font-medium tabular-nums ${
                                  mov.saldo >= 0 ? "text-green-600" : "text-red-600"
                                }`}
                              >
                                {formatCurrency(mov.saldo)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  {/* Summary card */}
                  {mayorData.movimientos.length > 0 && (
                    <div className="border-t p-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-3 rounded bg-muted/30">
                          <p className="text-xs text-muted-foreground">Total Debe</p>
                          <p className="text-sm font-semibold tabular-nums">
                            {formatCurrency(mayorData.totalDebe)}
                          </p>
                        </div>
                        <div className="text-center p-3 rounded bg-muted/30">
                          <p className="text-xs text-muted-foreground">Total Haber</p>
                          <p className="text-sm font-semibold tabular-nums">
                            {formatCurrency(mayorData.totalHaber)}
                          </p>
                        </div>
                        <div className="text-center p-3 rounded bg-muted/30">
                          <p className="text-xs text-muted-foreground">Saldo Final</p>
                          <p
                            className={`text-sm font-semibold tabular-nums ${
                              mayorData.saldoFinal >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {formatCurrency(mayorData.saldoFinal)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ================================================================
          DIALOGS
          ================================================================ */}

      {/* ── Cuenta Create/Edit Dialog ────────────────────────────────────── */}
      <Dialog open={isCuentaDialogOpen} onOpenChange={setIsCuentaDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingCuenta ? "Editar Cuenta" : "Nueva Cuenta Contable"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            {editingCuenta?.esSistema && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded text-xs flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 flex-shrink-0" />
                Cuenta del sistema. Solo puedes modificar el nombre y el estado.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Codigo *</Label>
                <Input
                  className="h-8 text-sm font-mono"
                  value={cuentaForm.codigo}
                  onChange={(e) => setCuentaForm({ ...cuentaForm, codigo: e.target.value })}
                  placeholder="100"
                  disabled={editingCuenta?.esSistema}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Nivel</Label>
                <Input
                  className="h-8 text-sm"
                  type="number"
                  min="1"
                  max="9"
                  value={cuentaForm.nivel}
                  onChange={(e) => setCuentaForm({ ...cuentaForm, nivel: e.target.value })}
                  disabled={editingCuenta?.esSistema}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Nombre *</Label>
              <Input
                className="h-8 text-sm"
                value={cuentaForm.nombre}
                onChange={(e) => setCuentaForm({ ...cuentaForm, nombre: e.target.value })}
                placeholder="Nombre de la cuenta"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Tipo *</Label>
                <Select
                  value={cuentaForm.tipo}
                  onValueChange={(v) => setCuentaForm({ ...cuentaForm, tipo: v })}
                >
                  <SelectTrigger className="h-8 text-sm" disabled={!!editingCuenta?.esSistema}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="pasivo">Pasivo</SelectItem>
                    <SelectItem value="patrimonio_neto">Patrimonio Neto</SelectItem>
                    <SelectItem value="ingreso">Ingreso</SelectItem>
                    <SelectItem value="gasto">Gasto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Grupo *</Label>
                <Select
                  value={cuentaForm.grupo}
                  onValueChange={(v) => setCuentaForm({ ...cuentaForm, grupo: v })}
                >
                  <SelectTrigger className="h-8 text-sm" disabled={!!editingCuenta?.esSistema}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7].map((g) => (
                      <SelectItem key={g} value={String(g)}>
                        Grupo {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Cuenta Padre (opcional)</Label>
              <Select
                value={cuentaForm.cuentaPadreId}
                onValueChange={(v) => setCuentaForm({ ...cuentaForm, cuentaPadreId: v })}
              >
                <SelectTrigger className="h-8 text-sm" disabled={!!editingCuenta?.esSistema}>
                  <SelectValue placeholder="Sin cuenta padre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin cuenta padre</SelectItem>
                  {cuentas
                    .filter((c) => c.id !== editingCuenta?.id)
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.codigo} - {c.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="cuenta-activo"
                checked={cuentaForm.activo}
                onCheckedChange={(checked) => setCuentaForm({ ...cuentaForm, activo: checked })}
              />
              <Label htmlFor="cuenta-activo" className="text-xs">
                Activa
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsCuentaDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitCuenta}
              disabled={isSaving || !cuentaForm.codigo.trim() || !cuentaForm.nombre.trim()}
            >
              {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {editingCuenta ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Cuenta Dialog ─────────────────────────────────────────── */}
      <AlertDialog open={deleteCuentaDialogOpen} onOpenChange={setDeleteCuentaDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Eliminar cuenta contable</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Se eliminara permanentemente la cuenta "{cuentaToDelete?.codigo} - {cuentaToDelete?.nombre}".
              Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-sm">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCuenta}
              className="h-8 text-sm bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Asiento Create/Edit Dialog ───────────────────────────────────── */}
      <Dialog open={isAsientoDialogOpen} onOpenChange={setIsAsientoDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingAsiento
                ? `Editar Asiento #${editingAsiento.numero}`
                : "Nuevo Asiento Contable"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            {/* Top fields */}
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Fecha *</Label>
                <Input
                  type="date"
                  className="h-8 text-sm"
                  value={asientoForm.fecha}
                  onChange={(e) => setAsientoForm({ ...asientoForm, fecha: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select
                  value={asientoForm.tipo}
                  onValueChange={(v) => setAsientoForm({ ...asientoForm, tipo: v })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Ref. Documento</Label>
                <Input
                  className="h-8 text-sm"
                  value={asientoForm.documentoRef}
                  onChange={(e) =>
                    setAsientoForm({ ...asientoForm, documentoRef: e.target.value })
                  }
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Descripcion *</Label>
              <Input
                className="h-8 text-sm"
                value={asientoForm.descripcion}
                onChange={(e) =>
                  setAsientoForm({ ...asientoForm, descripcion: e.target.value })
                }
                placeholder="Concepto del asiento"
              />
            </div>

            {/* Lines section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Lineas del Asiento</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleAddLinea}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Anadir Linea
                </Button>
              </div>

              <div className="space-y-2">
                {lineasForm.map((linea, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-12 gap-2 items-end p-2 border rounded bg-muted/30"
                  >
                    <div className="col-span-4">
                      <Label className="text-[10px] text-muted-foreground">Cuenta</Label>
                      <Select
                        value={linea.cuentaId}
                        onValueChange={(v) => handleLineaChange(index, "cuentaId", v)}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Seleccionar cuenta..." />
                        </SelectTrigger>
                        <SelectContent>
                          {cuentas
                            .filter((c) => c.activo)
                            .map((cuenta) => (
                              <SelectItem key={cuenta.id} value={String(cuenta.id)}>
                                {cuenta.codigo} - {cuenta.nombre}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Debe</Label>
                      <Input
                        className="h-7 text-xs tabular-nums"
                        type="number"
                        step="0.01"
                        min="0"
                        value={linea.debe}
                        onChange={(e) => handleLineaChange(index, "debe", e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Haber</Label>
                      <Input
                        className="h-7 text-xs tabular-nums"
                        type="number"
                        step="0.01"
                        min="0"
                        value={linea.haber}
                        onChange={(e) => handleLineaChange(index, "haber", e.target.value)}
                      />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-[10px] text-muted-foreground">Concepto</Label>
                      <Input
                        className="h-7 text-xs"
                        value={linea.concepto}
                        onChange={(e) => handleLineaChange(index, "concepto", e.target.value)}
                        placeholder="Opcional"
                      />
                    </div>
                    <div className="col-span-1 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveLinea(index)}
                        disabled={lineasForm.length === 1}
                        className="h-7 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals footer */}
              <div
                className={`flex justify-end gap-6 p-2 rounded border text-xs font-medium ${
                  isBalanced
                    ? "bg-green-50 border-green-200 text-green-700"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                <span>
                  Debe: <span className="tabular-nums">{formatCurrency(totalDebe)}</span>
                </span>
                <span>
                  Haber: <span className="tabular-nums">{formatCurrency(totalHaber)}</span>
                </span>
                <span>
                  Diferencia: <span className="tabular-nums">{formatCurrency(diferencia)}</span>
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsAsientoDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitAsiento}
              disabled={
                isSaving ||
                !asientoForm.descripcion.trim() ||
                !isBalanced ||
                lineasForm.every((l) => !l.cuentaId)
              }
            >
              {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {editingAsiento ? "Guardar" : "Crear Asiento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Asiento Dialog ────────────────────────────────────────── */}
      <AlertDialog open={deleteAsientoDialogOpen} onOpenChange={setDeleteAsientoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Eliminar asiento contable</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Se eliminara permanentemente el asiento #{asientoToDelete?.numero} "
              {asientoToDelete?.descripcion}".
              Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-sm">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAsiento}
              className="h-8 text-sm bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Generar desde Factura Dialog ──────────────────────────────────── */}
      <Dialog open={isFacturaDialogOpen} onOpenChange={setIsFacturaDialogOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Generar Asiento desde Factura
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {facturas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Receipt className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No hay facturas pendientes de contabilizar</p>
                <p className="text-xs">Todas las facturas ya tienen asiento asociado</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  Selecciona una factura para generar su asiento contable automaticamente.
                </p>
                {facturas.map((factura) => (
                  <div
                    key={factura.id}
                    className="flex items-center justify-between p-3 border rounded hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => !isGenerating && handleGenerarDesdeFactura(factura.id)}
                  >
                    <div>
                      <p className="text-xs font-medium">
                        <span className="font-mono">{factura.numero}</span>
                        <span className="ml-2 text-muted-foreground">
                          {factura.cliente?.nombre}
                        </span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDate(factura.fecha)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium tabular-nums">
                        {formatCurrency(factura.total)}
                      </p>
                      {isGenerating && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground inline" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsFacturaDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Generar desde Gasto Dialog ───────────────────────────────────── */}
      <Dialog open={isGastoDialogOpen} onOpenChange={setIsGastoDialogOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Generar Asiento desde Gasto
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {gastos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No hay gastos pendientes de contabilizar</p>
                <p className="text-xs">Todos los gastos ya tienen asiento asociado</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  Selecciona un gasto para generar su asiento contable automaticamente.
                </p>
                {gastos.map((gasto) => (
                  <div
                    key={gasto.id}
                    className="flex items-center justify-between p-3 border rounded hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => !isGenerating && handleGenerarDesdeGasto(gasto.id)}
                  >
                    <div>
                      <p className="text-xs font-medium">{gasto.descripcion}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDate(gasto.fecha)}
                        {gasto.proveedor && ` - ${gasto.proveedor}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium tabular-nums">
                        {formatCurrency(gasto.monto)}
                      </p>
                      {isGenerating && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground inline" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsGastoDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
