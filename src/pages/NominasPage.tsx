import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { formatCurrency } from "@/lib/formatting"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
  Loader2,
  Plus,
  Eye,
  Check,
  CreditCard,
  FileDown,
  Trash2,
  Calculator,
  Banknote,
  HelpCircle,
} from "lucide-react"
import { generatePayrollPdf } from "@/lib/generatePayrollPdf"

// ── Types ────────────────────────────────────────────────────────────────

interface Empleado {
  id: number
  nombre: string
  apellidos: string
  nif: string
  grupoConvenio?: string
  salarioBase?: number
  irpfPorcentaje?: number
}

interface NominaDevengo {
  salarioBase: number
  prorrataPagas: number
  complementos: number
  horasExtra: number
  otrosDevengos: number
}

interface NominaDeduccion {
  contingenciasComunes: number
  desempleoTrabajador: number
  formacionProfesional: number
  irpf: number
}

interface NominaCostesEmpresa {
  contingenciasComunesEmpresa: number
  desempleoEmpresa: number
  fogasa: number
  formacionProfesionalEmpresa: number
  atEp: number
}

interface Nomina {
  id: number
  empleadoId: number
  empleado?: Empleado
  mes: number
  anio: number
  devengos: NominaDevengo
  deducciones: NominaDeduccion
  costesEmpresa?: NominaCostesEmpresa
  totalDevengado: number
  totalDeducciones: number
  liquido: number
  estado: "borrador" | "confirmada" | "pagada"
  createdAt: string
  updatedAt: string
}

interface CalculoResult {
  devengos: NominaDevengo
  deducciones: NominaDeduccion
  costesEmpresa: NominaCostesEmpresa
  totalDevengado: number
  totalDeducciones: number
  liquido: number
}

// ── Status config ────────────────────────────────────────────────────────

const estadoConfig: Record<string, { labelKey: string; color: string }> = {
  borrador: { labelKey: "estadoBorrador", color: "bg-amber-50 text-amber-700" },
  confirmada: { labelKey: "estadoConfirmada", color: "bg-blue-50 text-blue-700" },
  pagada: { labelKey: "estadoPagada", color: "bg-green-50 text-green-700" },
}

// ── Months helper ────────────────────────────────────────────────────────

const MESES = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
]

// ── Component ────────────────────────────────────────────────────────────

export function NominasPage({ onHelp }: { onHelp?: () => void }) {
  const { t } = useTranslation(["nominas", "common"])

  // ── Data state ──
  const [nominas, setNominas] = useState<Nomina[]>([])
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // ── Filter state ──
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const [filterAnio, setFilterAnio] = useState<string>(String(currentYear))
  const [filterMes, setFilterMes] = useState<string>("todos")
  const [filterEmpleado, setFilterEmpleado] = useState<string>("todos")
  const [filterEstado, setFilterEstado] = useState<string>("todos")

  // ── Dialog state ──
  const [isGenerateOpen, setIsGenerateOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [nominaToDelete, setNominaToDelete] = useState<Nomina | null>(null)
  const [selectedNomina, setSelectedNomina] = useState<Nomina | null>(null)

  // ── Generate form state ──
  const [genEmpleadoId, setGenEmpleadoId] = useState<string>("")
  const [genMes, setGenMes] = useState<string>(String(currentMonth))
  const [genAnio, setGenAnio] = useState<string>(String(currentYear))
  const [genComplementos, setGenComplementos] = useState<string>("")
  const [genHorasExtra, setGenHorasExtra] = useState<string>("")
  const [genOtrosDevengos, setGenOtrosDevengos] = useState<string>("")
  const [calculo, setCalculo] = useState<CalculoResult | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Currency formatter ──
  const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" })

  // ── Data loading ──
  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const unsub = window.electronAPI?.onEntityUpdated?.((data) => {
      if (["nomina", "empleado"].includes(data.entityType)) {
        loadData(false)
      }
    })
    return () => {
      unsub?.()
    }
  }, [])

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true)
      const [nominasRes, empleadosRes] = await Promise.all([
        window.electronAPI?.nominas.getAll(),
        window.electronAPI?.empleados.getAll(),
      ])
      if (nominasRes?.success) setNominas(nominasRes.data || [])
      if (empleadosRes?.success) setEmpleados(empleadosRes.data || [])
    } catch (err) {
      console.error("Error loading nominas data:", err)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Filtering ──
  const filteredNominas = nominas.filter((n) => {
    const matchAnio = filterAnio === "todos" || n.anio === parseInt(filterAnio)
    const matchMes = filterMes === "todos" || n.mes === parseInt(filterMes)
    const matchEmpleado =
      filterEmpleado === "todos" || String(n.empleadoId) === filterEmpleado
    const matchEstado = filterEstado === "todos" || n.estado === filterEstado
    return matchAnio && matchMes && matchEmpleado && matchEstado
  })

  // ── Year options (5 years back + 1 forward) ──
  const yearOptions: number[] = []
  for (let y = currentYear + 1; y >= currentYear - 5; y--) {
    yearOptions.push(y)
  }

  // ── Stats ──
  const totalLiquido = filteredNominas.reduce((acc, n) => acc + n.liquido, 0)
  const totalDevengado = filteredNominas.reduce((acc, n) => acc + n.totalDevengado, 0)
  const totalDeducciones = filteredNominas.reduce((acc, n) => acc + n.totalDeducciones, 0)

  // ── Helpers ──
  const getEmpleadoNombre = (nomina: Nomina) => {
    const emp = nomina.empleado || empleados.find((e) => e.id === nomina.empleadoId)
    if (!emp) return "-"
    return `${emp.nombre} ${emp.apellidos}`
  }

  const getMesLabel = (mes: number) => {
    return MESES.find((m) => m.value === mes)?.label || String(mes)
  }

  // ── Generate dialog ──
  const handleOpenGenerate = () => {
    setGenEmpleadoId("")
    setGenMes(String(currentMonth))
    setGenAnio(String(currentYear))
    setGenComplementos("")
    setGenHorasExtra("")
    setGenOtrosDevengos("")
    setCalculo(null)
    setError(null)
    setIsGenerateOpen(true)
  }

  const handleCalcular = async () => {
    if (!genEmpleadoId) return

    setIsCalculating(true)
    setError(null)
    setCalculo(null)
    try {
      const data = {
        empleadoId: parseInt(genEmpleadoId),
        mes: parseInt(genMes),
        anio: parseInt(genAnio),
        complementos: genComplementos ? parseFloat(genComplementos) : undefined,
        horasExtraImporte: genHorasExtra ? parseFloat(genHorasExtra) : undefined,
        otrosDevengos: genOtrosDevengos ? parseFloat(genOtrosDevengos) : undefined,
      }
      const res = await window.electronAPI?.nominas.calcular(data)
      if (res?.success) {
        setCalculo(res.data)
      } else {
        setError(res?.error || t("errorCalculating"))
      }
    } catch (err) {
      console.error("Error calculating nomina:", err)
      setError(String(err))
    } finally {
      setIsCalculating(false)
    }
  }

  const handleGuardarNomina = async () => {
    if (!genEmpleadoId || !calculo) return

    setIsSaving(true)
    setError(null)
    try {
      const data = {
        empleadoId: parseInt(genEmpleadoId),
        mes: parseInt(genMes),
        anio: parseInt(genAnio),
        complementos: genComplementos ? parseFloat(genComplementos) : undefined,
        horasExtraImporte: genHorasExtra ? parseFloat(genHorasExtra) : undefined,
        otrosDevengos: genOtrosDevengos ? parseFloat(genOtrosDevengos) : undefined,
      }
      const res = await window.electronAPI?.nominas.create(data)
      if (res?.success) {
        await loadData()
        setIsGenerateOpen(false)
      } else {
        setError(res?.error || t("errorCreating"))
      }
    } catch (err) {
      console.error("Error creating nomina:", err)
      setError(String(err))
    } finally {
      setIsSaving(false)
    }
  }

  // ── Actions ──
  const handleViewDetail = (nomina: Nomina) => {
    setSelectedNomina(nomina)
    setIsDetailOpen(true)
  }

  const handleConfirmar = async (nomina: Nomina) => {
    try {
      const res = await window.electronAPI?.nominas.confirmar(nomina.id)
      if (res?.success) {
        await loadData()
      }
    } catch (err) {
      console.error("Error confirming nomina:", err)
    }
  }

  const handleMarcarPagada = async (nomina: Nomina) => {
    try {
      const res = await window.electronAPI?.nominas.marcarPagada(nomina.id)
      if (res?.success) {
        await loadData()
      }
    } catch (err) {
      console.error("Error marking nomina as paid:", err)
    }
  }

  const handleDownloadPdf = async (nomina: Nomina) => {
    try {
      await generatePayrollPdf(nomina)
    } catch (err) {
      console.error("Error generating payroll PDF:", err)
    }
  }

  const handleDelete = async () => {
    if (!nominaToDelete) return
    try {
      const res = await window.electronAPI?.nominas.delete(nominaToDelete.id)
      if (res?.success) {
        await loadData()
      }
    } catch (err) {
      console.error("Error deleting nomina:", err)
    } finally {
      setDeleteDialogOpen(false)
      setNominaToDelete(null)
    }
  }

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          {onHelp && (
            <button
              onClick={onHelp}
              className="rounded-full p-1.5 hover:bg-accent transition-colors"
              title={t("common:viewHelp")}
            >
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <Button size="sm" onClick={handleOpenGenerate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("nuevaNomina")}
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t("totalDevengado")}</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatCurrency(totalDevengado)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("nominaCount", { count: filteredNominas.length })}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t("totalDeducciones")}</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatCurrency(totalDeducciones)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t("totalLiquido")}</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatCurrency(totalLiquido)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters + Table ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-medium">
              {t("listTitle")}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t("ofTotal", {
                  filtered: filteredNominas.length,
                  total: nominas.length,
                })}
              </span>
            </CardTitle>
          </div>

          <div className="flex flex-wrap items-end gap-3 pt-2">
            {/* Year filter */}
            <div className="grid gap-1">
              <Label className="text-[10px] text-muted-foreground">{t("anio")}</Label>
              <Select value={filterAnio} onValueChange={setFilterAnio}>
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">{t("common:all")}</SelectItem>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Month filter */}
            <div className="grid gap-1">
              <Label className="text-[10px] text-muted-foreground">{t("mes")}</Label>
              <Select value={filterMes} onValueChange={setFilterMes}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">{t("common:all")}</SelectItem>
                  {MESES.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Employee filter */}
            <div className="grid gap-1">
              <Label className="text-[10px] text-muted-foreground">
                {t("empleado")}
              </Label>
              <Select value={filterEmpleado} onValueChange={setFilterEmpleado}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder={t("common:all")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">{t("common:all")}</SelectItem>
                  {empleados.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.nombre} {e.apellidos}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Estado filter */}
            <div className="grid gap-1">
              <Label className="text-[10px] text-muted-foreground">
                {t("estado")}
              </Label>
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">{t("common:all")}</SelectItem>
                  <SelectItem value="borrador">{t("estadoBorrador")}</SelectItem>
                  <SelectItem value="confirmada">{t("estadoConfirmada")}</SelectItem>
                  <SelectItem value="pagada">{t("estadoPagada")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 text-xs font-medium">
                  {t("empleado")}
                </TableHead>
                <TableHead className="h-8 text-xs font-medium">
                  {t("mesAnio")}
                </TableHead>
                <TableHead className="h-8 text-xs font-medium text-right">
                  {t("totalDevengado")}
                </TableHead>
                <TableHead className="h-8 text-xs font-medium text-right">
                  {t("totalDeducciones")}
                </TableHead>
                <TableHead className="h-8 text-xs font-medium text-right">
                  {t("liquido")}
                </TableHead>
                <TableHead className="h-8 text-xs font-medium">
                  {t("estado")}
                </TableHead>
                <TableHead className="h-8 text-xs font-medium text-center w-36">
                  {t("common:actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredNominas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Banknote className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">{t("noNominas")}</p>
                      <p className="text-xs">{t("createFirst")}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredNominas.map((nomina) => {
                  const config =
                    estadoConfig[nomina.estado] || estadoConfig.borrador
                  return (
                    <TableRow
                      key={nomina.id}
                      className="cursor-pointer"
                      onClick={() => handleViewDetail(nomina)}
                    >
                      <TableCell className="py-2 text-xs">
                        {getEmpleadoNombre(nomina)}
                      </TableCell>
                      <TableCell className="py-2 text-xs">
                        {getMesLabel(nomina.mes)} {nomina.anio}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <span className="text-xs font-medium tabular-nums">
                          {formatCurrency(nomina.totalDevengado)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <span className="text-xs font-medium tabular-nums text-red-600">
                          -{formatCurrency(nomina.totalDeducciones)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <span className="text-xs font-semibold tabular-nums">
                          {formatCurrency(nomina.liquido)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${config.color}`}
                        >
                          {t(config.labelKey)}
                        </span>
                      </TableCell>
                      <TableCell
                        className="py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleViewDetail(nomina)}
                            title={t("verDetalle")}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          {nomina.estado === "borrador" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700"
                              onClick={() => handleConfirmar(nomina)}
                              title={t("confirmar")}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          )}
                          {nomina.estado === "confirmada" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                              onClick={() => handleMarcarPagada(nomina)}
                              title={t("marcarPagada")}
                            >
                              <CreditCard className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleDownloadPdf(nomina)}
                            title={t("descargarPdf")}
                          >
                            <FileDown className="h-3 w-3" />
                          </Button>
                          {nomina.estado === "borrador" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                              onClick={() => {
                                setNominaToDelete(nomina)
                                setDeleteDialogOpen(true)
                              }}
                              title={t("eliminar")}
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
        </CardContent>
      </Card>

      {/* ── Generate Payroll Dialog ── */}
      <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              {t("nuevaNomina")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Employee selector */}
            <div className="grid gap-1.5">
              <Label className="text-xs">{t("empleado")}</Label>
              <Select value={genEmpleadoId} onValueChange={setGenEmpleadoId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={t("seleccionarEmpleado")} />
                </SelectTrigger>
                <SelectContent>
                  {empleados.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.nombre} {e.apellidos}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Month & Year */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("mes")}</Label>
                <Select value={genMes} onValueChange={setGenMes}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m) => (
                      <SelectItem key={m.value} value={String(m.value)}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("anio")}</Label>
                <Select value={genAnio} onValueChange={setGenAnio}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Optional fields */}
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("complementos")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  className="h-9 text-sm"
                  value={genComplementos}
                  onChange={(e) => setGenComplementos(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("horasExtra")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  className="h-9 text-sm"
                  value={genHorasExtra}
                  onChange={(e) => setGenHorasExtra(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("otrosDevengos")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  className="h-9 text-sm"
                  value={genOtrosDevengos}
                  onChange={(e) => setGenOtrosDevengos(e.target.value)}
                />
              </div>
            </div>

            {/* Calculate button */}
            <Button
              className="w-full"
              onClick={handleCalcular}
              disabled={!genEmpleadoId || isCalculating}
            >
              {isCalculating ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Calculator className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t("calcular")}
            </Button>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>
            )}

            {/* Calculation preview */}
            {calculo && (
              <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                {/* Devengos section */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {t("devengos")}
                  </h4>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{t("salarioBase")}</span>
                      <span className="tabular-nums">{eur.format(calculo.devengos.salarioBase)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>{t("prorrataPagas")}</span>
                      <span className="tabular-nums">{eur.format(calculo.devengos.prorrataPagas)}</span>
                    </div>
                    {calculo.devengos.complementos > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>{t("complementos")}</span>
                        <span className="tabular-nums">{eur.format(calculo.devengos.complementos)}</span>
                      </div>
                    )}
                    {calculo.devengos.horasExtra > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>{t("horasExtra")}</span>
                        <span className="tabular-nums">{eur.format(calculo.devengos.horasExtra)}</span>
                      </div>
                    )}
                    {calculo.devengos.otrosDevengos > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>{t("otrosDevengos")}</span>
                        <span className="tabular-nums">{eur.format(calculo.devengos.otrosDevengos)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t" />

                {/* Deducciones section */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {t("deducciones")}
                  </h4>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{t("contingenciasComunes")} (4,70%)</span>
                      <span className="tabular-nums text-red-600">
                        -{eur.format(calculo.deducciones.contingenciasComunes)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>{t("desempleo")}</span>
                      <span className="tabular-nums text-red-600">
                        -{eur.format(calculo.deducciones.desempleoTrabajador)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>{t("formacionProfesional")} (0,10%)</span>
                      <span className="tabular-nums text-red-600">
                        -{eur.format(calculo.deducciones.formacionProfesional)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>{t("irpf")}</span>
                      <span className="tabular-nums text-red-600">
                        -{eur.format(calculo.deducciones.irpf)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t" />

                {/* Summary */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm font-medium">
                    <span>{t("totalDevengado")}</span>
                    <span className="tabular-nums">{eur.format(calculo.totalDevengado)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span>{t("totalDeducciones")}</span>
                    <span className="tabular-nums text-red-600">
                      -{eur.format(calculo.totalDeducciones)}
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-bold border-t pt-1.5">
                    <span>{t("liquido")}</span>
                    <span className="tabular-nums text-green-700">
                      {eur.format(calculo.liquido)}
                    </span>
                  </div>
                </div>

                <div className="border-t" />

                {/* Employer costs */}
                {calculo.costesEmpresa && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      {t("costesEmpresa")}
                    </h4>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{t("ccEmpresa")}</span>
                        <span className="tabular-nums">
                          {eur.format(calculo.costesEmpresa.contingenciasComunesEmpresa)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{t("desempleoEmpresa")}</span>
                        <span className="tabular-nums">
                          {eur.format(calculo.costesEmpresa.desempleoEmpresa)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{t("fogasa")}</span>
                        <span className="tabular-nums">
                          {eur.format(calculo.costesEmpresa.fogasa)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{t("fpEmpresa")}</span>
                        <span className="tabular-nums">
                          {eur.format(calculo.costesEmpresa.formacionProfesionalEmpresa)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{t("atEp")}</span>
                        <span className="tabular-nums">
                          {eur.format(calculo.costesEmpresa.atEp)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsGenerateOpen(false)}
            >
              {t("common:cancel")}
            </Button>
            <Button
              onClick={handleGuardarNomina}
              disabled={!calculo || isSaving}
            >
              {isSaving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Banknote className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t("guardarNomina")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail Dialog ── */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <DialogTitle className="flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                {t("detalleNomina")}
              </DialogTitle>
              {selectedNomina && (
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    estadoConfig[selectedNomina.estado]?.color
                  }`}
                >
                  {t(estadoConfig[selectedNomina.estado]?.labelKey)}
                </span>
              )}
            </div>
          </DialogHeader>

          {selectedNomina && (
            <div className="space-y-4">
              {/* Employee & period info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{t("empleado")}</p>
                  <p className="font-medium">{getEmpleadoNombre(selectedNomina)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("periodo")}</p>
                  <p className="font-medium">
                    {getMesLabel(selectedNomina.mes)} {selectedNomina.anio}
                  </p>
                </div>
              </div>

              {/* Devengos */}
              <div className="border rounded-lg p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {t("devengos")}
                </h4>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{t("salarioBase")}</span>
                    <span className="tabular-nums">
                      {eur.format(selectedNomina.devengos.salarioBase)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{t("prorrataPagas")}</span>
                    <span className="tabular-nums">
                      {eur.format(selectedNomina.devengos.prorrataPagas)}
                    </span>
                  </div>
                  {selectedNomina.devengos.complementos > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>{t("complementos")}</span>
                      <span className="tabular-nums">
                        {eur.format(selectedNomina.devengos.complementos)}
                      </span>
                    </div>
                  )}
                  {selectedNomina.devengos.horasExtra > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>{t("horasExtra")}</span>
                      <span className="tabular-nums">
                        {eur.format(selectedNomina.devengos.horasExtra)}
                      </span>
                    </div>
                  )}
                  {selectedNomina.devengos.otrosDevengos > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>{t("otrosDevengos")}</span>
                      <span className="tabular-nums">
                        {eur.format(selectedNomina.devengos.otrosDevengos)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Deducciones */}
              <div className="border rounded-lg p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {t("deducciones")}
                </h4>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{t("contingenciasComunes")} (4,70%)</span>
                    <span className="tabular-nums text-red-600">
                      -{eur.format(selectedNomina.deducciones.contingenciasComunes)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{t("desempleo")}</span>
                    <span className="tabular-nums text-red-600">
                      -{eur.format(selectedNomina.deducciones.desempleoTrabajador)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{t("formacionProfesional")} (0,10%)</span>
                    <span className="tabular-nums text-red-600">
                      -{eur.format(selectedNomina.deducciones.formacionProfesional)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{t("irpf")}</span>
                    <span className="tabular-nums text-red-600">
                      -{eur.format(selectedNomina.deducciones.irpf)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="border rounded-lg p-3 bg-muted/30">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm font-medium">
                    <span>{t("totalDevengado")}</span>
                    <span className="tabular-nums">
                      {eur.format(selectedNomina.totalDevengado)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span>{t("totalDeducciones")}</span>
                    <span className="tabular-nums text-red-600">
                      -{eur.format(selectedNomina.totalDeducciones)}
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-bold border-t pt-1.5">
                    <span>{t("liquido")}</span>
                    <span className="tabular-nums text-green-700">
                      {eur.format(selectedNomina.liquido)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Employer costs */}
              {selectedNomina.costesEmpresa && (
                <div className="border rounded-lg p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {t("costesEmpresa")}
                  </h4>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{t("ccEmpresa")}</span>
                      <span className="tabular-nums">
                        {eur.format(selectedNomina.costesEmpresa.contingenciasComunesEmpresa)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{t("desempleoEmpresa")}</span>
                      <span className="tabular-nums">
                        {eur.format(selectedNomina.costesEmpresa.desempleoEmpresa)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{t("fogasa")}</span>
                      <span className="tabular-nums">
                        {eur.format(selectedNomina.costesEmpresa.fogasa)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{t("fpEmpresa")}</span>
                      <span className="tabular-nums">
                        {eur.format(selectedNomina.costesEmpresa.formacionProfesionalEmpresa)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{t("atEp")}</span>
                      <span className="tabular-nums">
                        {eur.format(selectedNomina.costesEmpresa.atEp)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Detail dialog actions */}
              <div className="flex justify-end gap-2 border-t pt-3">
                {selectedNomina.estado === "borrador" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      handleConfirmar(selectedNomina)
                      setIsDetailOpen(false)
                    }}
                  >
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    {t("confirmar")}
                  </Button>
                )}
                {selectedNomina.estado === "confirmada" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      handleMarcarPagada(selectedNomina)
                      setIsDetailOpen(false)
                    }}
                  >
                    <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                    {t("marcarPagada")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadPdf(selectedNomina)}
                >
                  <FileDown className="mr-1.5 h-3.5 w-3.5" />
                  {t("descargarPdf")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmarEliminar")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmarEliminarDesc", {
                empleado: nominaToDelete
                  ? getEmpleadoNombre(nominaToDelete)
                  : "",
                periodo: nominaToDelete
                  ? `${getMesLabel(nominaToDelete.mes)} ${nominaToDelete.anio}`
                  : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("eliminar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
