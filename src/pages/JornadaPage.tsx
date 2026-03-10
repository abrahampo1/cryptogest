import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
import { Loader2, Clock, LogIn, LogOut, Trash2, HelpCircle } from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────

function formatTime(val: Date | string | null | undefined): string {
  if (!val) return '-'
  return new Date(val).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(val: Date | string | null | undefined): string {
  if (!val) return '-'
  return new Date(val).toLocaleDateString('es-ES')
}

function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Component ────────────────────────────────────────────────────────────

export function JornadaPage({ onHelp }: { onHelp?: () => void }) {
  const { t } = useTranslation(['jornada', 'common'])

  // Shared state
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [isLoadingEmpleados, setIsLoadingEmpleados] = useState(true)

  // ── Tab 1: Fichaje ──
  const [fichajeEmpleadoId, setFichajeEmpleadoId] = useState<string>('')
  const [isFichando, setIsFichando] = useState(false)
  const [fichajeError, setFichajeError] = useState<string | null>(null)
  const [registrosHoy, setRegistrosHoy] = useState<RegistroJornada[]>([])
  const [isLoadingHoy, setIsLoadingHoy] = useState(false)

  // ── Tab 2: Historial ──
  const [historialEmpleadoId, setHistorialEmpleadoId] = useState<string>('all')
  const [fechaDesde, setFechaDesde] = useState<string>('')
  const [fechaHasta, setFechaHasta] = useState<string>('')
  const [registros, setRegistros] = useState<RegistroJornada[]>([])
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [registroToDelete, setRegistroToDelete] = useState<RegistroJornada | null>(null)

  // ── Tab 3: Resumen Mensual ──
  const [resumenMes, setResumenMes] = useState<number>(new Date().getMonth() + 1)
  const [resumenAnio, setResumenAnio] = useState<number>(new Date().getFullYear())
  const [resumen, setResumen] = useState<ResumenMensualJornada[]>([])
  const [isLoadingResumen, setIsLoadingResumen] = useState(false)

  // ── Load employees on mount ──
  useEffect(() => {
    loadEmpleados()
  }, [])

  useEffect(() => {
    const unsub = window.electronAPI?.onEntityUpdated?.((data) => {
      if (data.entityType === 'empleado') {
        loadEmpleados(false)
      }
    })
    return () => { unsub?.() }
  }, [])

  const loadEmpleados = async (showLoading = true) => {
    try {
      if (showLoading) setIsLoadingEmpleados(true)
      const response = await window.electronAPI?.empleados.getAll()
      if (response?.success && response.data) {
        setEmpleados(response.data.filter(e => e.activo))
      }
    } catch (error) {
      console.error('Error loading empleados:', error)
    } finally {
      setIsLoadingEmpleados(false)
    }
  }

  // ── Tab 1: Load today's records when employee changes ──
  useEffect(() => {
    if (fichajeEmpleadoId) {
      loadRegistrosHoy()
    } else {
      setRegistrosHoy([])
    }
  }, [fichajeEmpleadoId])

  const loadRegistrosHoy = async () => {
    if (!fichajeEmpleadoId) return
    try {
      setIsLoadingHoy(true)
      const hoy = todayISO()
      const response = await window.electronAPI?.jornada.getAll({
        empleadoId: Number(fichajeEmpleadoId),
        fechaDesde: hoy,
        fechaHasta: hoy,
      })
      if (response?.success && response.data) {
        setRegistrosHoy(response.data)
      }
    } catch (error) {
      console.error('Error loading today records:', error)
    } finally {
      setIsLoadingHoy(false)
    }
  }

  const handleFichar = async (tipo: 'entrada' | 'salida') => {
    if (!fichajeEmpleadoId) return
    try {
      setIsFichando(true)
      setFichajeError(null)
      const response = await window.electronAPI?.jornada.fichar({
        empleadoId: Number(fichajeEmpleadoId),
        tipo,
      })
      if (response?.success) {
        await loadRegistrosHoy()
      } else {
        setFichajeError(response?.error || t('common:unknownError'))
      }
    } catch (error) {
      console.error('Error fichando:', error)
      setFichajeError(t('common:unknownError'))
    } finally {
      setIsFichando(false)
    }
  }

  // Determine current status for selected employee
  const registroActivo = registrosHoy.find(r => r.horaEntrada && !r.horaSalida)

  // ── Tab 2: Load history ──
  const loadHistorial = async () => {
    try {
      setIsLoadingHistorial(true)
      const filters: { empleadoId?: number; fechaDesde?: string; fechaHasta?: string } = {}
      if (historialEmpleadoId && historialEmpleadoId !== 'all') {
        filters.empleadoId = Number(historialEmpleadoId)
      }
      if (fechaDesde) filters.fechaDesde = fechaDesde
      if (fechaHasta) filters.fechaHasta = fechaHasta
      const response = await window.electronAPI?.jornada.getAll(filters)
      if (response?.success && response.data) {
        setRegistros(response.data)
      }
    } catch (error) {
      console.error('Error loading historial:', error)
    } finally {
      setIsLoadingHistorial(false)
    }
  }

  useEffect(() => {
    loadHistorial()
  }, [historialEmpleadoId, fechaDesde, fechaHasta])

  const confirmDelete = (registro: RegistroJornada) => {
    setRegistroToDelete(registro)
    setDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!registroToDelete) return
    try {
      const response = await window.electronAPI?.jornada.delete(registroToDelete.id)
      if (response?.success) {
        await loadHistorial()
        await loadRegistrosHoy()
      }
    } catch (error) {
      console.error('Error deleting registro:', error)
    } finally {
      setDeleteDialogOpen(false)
      setRegistroToDelete(null)
    }
  }

  // ── Tab 3: Load monthly summary ──
  const loadResumen = async () => {
    try {
      setIsLoadingResumen(true)
      const response = await window.electronAPI?.jornada.resumenMensual({
        mes: resumenMes,
        anio: resumenAnio,
      })
      if (response?.success && response.data) {
        setResumen(response.data)
      }
    } catch (error) {
      console.error('Error loading resumen:', error)
    } finally {
      setIsLoadingResumen(false)
    }
  }

  useEffect(() => {
    loadResumen()
  }, [resumenMes, resumenAnio])

  // ── Computed values for resumen totals ──
  const resumenTotals = resumen.reduce(
    (acc, r) => ({
      diasTrabajados: acc.diasTrabajados + r.diasTrabajados,
      totalHoras: acc.totalHoras + r.totalHoras,
      totalHorasExtra: acc.totalHorasExtra + r.totalHorasExtra,
    }),
    { diasTrabajados: 0, totalHoras: 0, totalHorasExtra: 0 }
  )

  // ── Month names for selector ──
  const meses = [
    { value: 1, label: t('months.january', { defaultValue: 'Enero' }) },
    { value: 2, label: t('months.february', { defaultValue: 'Febrero' }) },
    { value: 3, label: t('months.march', { defaultValue: 'Marzo' }) },
    { value: 4, label: t('months.april', { defaultValue: 'Abril' }) },
    { value: 5, label: t('months.may', { defaultValue: 'Mayo' }) },
    { value: 6, label: t('months.june', { defaultValue: 'Junio' }) },
    { value: 7, label: t('months.july', { defaultValue: 'Julio' }) },
    { value: 8, label: t('months.august', { defaultValue: 'Agosto' }) },
    { value: 9, label: t('months.september', { defaultValue: 'Septiembre' }) },
    { value: 10, label: t('months.october', { defaultValue: 'Octubre' }) },
    { value: 11, label: t('months.november', { defaultValue: 'Noviembre' }) },
    { value: 12, label: t('months.december', { defaultValue: 'Diciembre' }) },
  ]

  const currentYear = new Date().getFullYear()
  const anios = Array.from({ length: 6 }, (_, i) => currentYear - 5 + i)

  // ── Loading state ──
  if (isLoadingEmpleados) {
    return (
      <div className="flex h-96 items-center justify-center">
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
            <h1 className="text-xl font-semibold">
              {t('title', { defaultValue: 'Control Horario' })}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('subtitle', { defaultValue: 'Gestiona los fichajes y el control de jornada laboral' })}
            </p>
          </div>
          {onHelp && (
            <button
              onClick={onHelp}
              className="rounded-full p-1.5 hover:bg-accent transition-colors"
              title={t('common:viewHelp')}
            >
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="fichaje" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fichaje">
            <Clock className="mr-1 h-3.5 w-3.5" />
            {t('tabs.fichaje', { defaultValue: 'Fichaje' })}
          </TabsTrigger>
          <TabsTrigger value="historial">
            <LogIn className="mr-1 h-3.5 w-3.5" />
            {t('tabs.historial', { defaultValue: 'Historial' })}
          </TabsTrigger>
          <TabsTrigger value="resumen">
            <LogOut className="mr-1 h-3.5 w-3.5" />
            {t('tabs.resumen', { defaultValue: 'Resumen Mensual' })}
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* Tab 1: Fichaje (Clock In/Out)                                 */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="fichaje" className="space-y-4">
          {/* Employee selector + action buttons */}
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-sm font-medium">
                {t('fichaje.title', { defaultValue: 'Fichar Entrada / Salida' })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* Employee selector */}
              <div className="grid gap-1.5 max-w-sm">
                <Label className="text-xs">
                  {t('fichaje.employee', { defaultValue: 'Empleado' })}
                </Label>
                <Select value={fichajeEmpleadoId} onValueChange={setFichajeEmpleadoId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={t('fichaje.selectEmployee', { defaultValue: 'Seleccionar empleado...' })} />
                  </SelectTrigger>
                  <SelectContent>
                    {empleados.map((emp) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.nombre} {emp.apellidos}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Current status badge */}
              {fichajeEmpleadoId && !isLoadingHoy && registroActivo && (
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="text-sm px-3 py-1">
                    <Clock className="mr-1 h-3.5 w-3.5" />
                    {t('fichaje.clockedSince', { defaultValue: 'Fichado desde' })}{' '}
                    {formatTime(registroActivo.horaEntrada)}
                  </Badge>
                </div>
              )}

              {fichajeEmpleadoId && !isLoadingHoy && !registroActivo && registrosHoy.length > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-sm px-3 py-1">
                    {t('fichaje.alreadyClockedOut', { defaultValue: 'Jornada completada hoy' })}
                  </Badge>
                </div>
              )}

              {/* Action buttons */}
              {fichajeEmpleadoId && (
                <div className="flex gap-3">
                  <Button
                    size="lg"
                    className="bg-green-600 hover:bg-green-700 text-white min-w-[180px]"
                    onClick={() => handleFichar('entrada')}
                    disabled={isFichando || !fichajeEmpleadoId}
                  >
                    {isFichando ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <LogIn className="mr-2 h-5 w-5" />
                    )}
                    {t('fichaje.clockIn', { defaultValue: 'Fichar Entrada' })}
                  </Button>
                  <Button
                    size="lg"
                    className="bg-red-600 hover:bg-red-700 text-white min-w-[180px]"
                    onClick={() => handleFichar('salida')}
                    disabled={isFichando || !fichajeEmpleadoId}
                  >
                    {isFichando ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <LogOut className="mr-2 h-5 w-5" />
                    )}
                    {t('fichaje.clockOut', { defaultValue: 'Fichar Salida' })}
                  </Button>
                </div>
              )}

              {/* Error message */}
              {fichajeError && (
                <p className="text-sm text-red-600">{fichajeError}</p>
              )}
            </CardContent>
          </Card>

          {/* Today's records */}
          {fichajeEmpleadoId && (
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-sm font-medium">
                  {t('fichaje.todayRecords', { defaultValue: 'Registros de hoy' })}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingHoy ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : registrosHoy.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 text-xs">
                          {t('table.entry', { defaultValue: 'Entrada' })}
                        </TableHead>
                        <TableHead className="h-9 text-xs">
                          {t('table.exit', { defaultValue: 'Salida' })}
                        </TableHead>
                        <TableHead className="h-9 text-xs text-right">
                          {t('table.pause', { defaultValue: 'Pausa (min)' })}
                        </TableHead>
                        <TableHead className="h-9 text-xs text-right">
                          {t('table.hoursWorked', { defaultValue: 'Horas Trabajadas' })}
                        </TableHead>
                        <TableHead className="h-9 text-xs text-right">
                          {t('table.overtime', { defaultValue: 'Horas Extra' })}
                        </TableHead>
                        <TableHead className="h-9 text-xs">
                          {t('table.notes', { defaultValue: 'Notas' })}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registrosHoy.map((reg) => (
                        <TableRow key={reg.id}>
                          <TableCell className="py-2 font-mono text-xs">
                            {formatTime(reg.horaEntrada)}
                          </TableCell>
                          <TableCell className="py-2 font-mono text-xs">
                            {reg.horaSalida ? formatTime(reg.horaSalida) : (
                              <Badge variant="success" className="text-[10px]">
                                {t('fichaje.inProgress', { defaultValue: 'En curso' })}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-right tabular-nums text-xs">
                            {reg.pausaMinutos}
                          </TableCell>
                          <TableCell className="py-2 text-right font-mono tabular-nums text-xs">
                            {formatHours(reg.horasTrabajadas)}
                          </TableCell>
                          <TableCell className="py-2 text-right font-mono tabular-nums text-xs">
                            {reg.horasExtra > 0 ? (
                              <Badge variant="destructive" className="text-[10px]">
                                {formatHours(reg.horasExtra)}
                              </Badge>
                            ) : (
                              formatHours(reg.horasExtra)
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground">
                            {reg.notas || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Clock className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {t('fichaje.noRecordsToday', { defaultValue: 'Sin registros hoy' })}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Empty state when no employee selected */}
          {!fichajeEmpleadoId && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Clock className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {t('fichaje.selectEmployeePrompt', { defaultValue: 'Selecciona un empleado para fichar' })}
              </p>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* Tab 2: Historial                                              */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="historial" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-sm font-medium">
                {t('historial.filters', { defaultValue: 'Filtros' })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="grid gap-1.5 min-w-[200px]">
                  <Label className="text-xs">
                    {t('historial.employee', { defaultValue: 'Empleado' })}
                  </Label>
                  <Select value={historialEmpleadoId} onValueChange={setHistorialEmpleadoId}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t('common:all', { defaultValue: 'Todos' })}
                      </SelectItem>
                      {empleados.map((emp) => (
                        <SelectItem key={emp.id} value={String(emp.id)}>
                          {emp.nombre} {emp.apellidos}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">
                    {t('historial.dateFrom', { defaultValue: 'Desde' })}
                  </Label>
                  <Input
                    type="date"
                    className="h-8 text-sm w-40"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">
                    {t('historial.dateTo', { defaultValue: 'Hasta' })}
                  </Label>
                  <Input
                    type="date"
                    className="h-8 text-sm w-40"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Records table */}
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  {t('historial.records', { defaultValue: 'Registros de jornada' })}
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  {registros.length} {t('historial.recordsCount', { defaultValue: 'registros' })}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingHistorial ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : registros.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-9 text-xs">
                        {t('table.employee', { defaultValue: 'Empleado' })}
                      </TableHead>
                      <TableHead className="h-9 text-xs">
                        {t('table.date', { defaultValue: 'Fecha' })}
                      </TableHead>
                      <TableHead className="h-9 text-xs">
                        {t('table.entry', { defaultValue: 'Entrada' })}
                      </TableHead>
                      <TableHead className="h-9 text-xs">
                        {t('table.exit', { defaultValue: 'Salida' })}
                      </TableHead>
                      <TableHead className="h-9 text-xs text-right">
                        {t('table.pause', { defaultValue: 'Pausa' })}
                      </TableHead>
                      <TableHead className="h-9 text-xs text-right">
                        {t('table.hoursWorked', { defaultValue: 'Horas Trabajadas' })}
                      </TableHead>
                      <TableHead className="h-9 text-xs text-right">
                        {t('table.overtime', { defaultValue: 'Horas Extra' })}
                      </TableHead>
                      <TableHead className="h-9 text-xs">
                        {t('table.notes', { defaultValue: 'Notas' })}
                      </TableHead>
                      <TableHead className="h-9 text-xs text-right">
                        {t('common:actions', { defaultValue: 'Acciones' })}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registros.map((reg) => (
                      <TableRow key={reg.id}>
                        <TableCell className="py-2 text-xs font-medium">
                          {reg.empleado
                            ? `${reg.empleado.nombre} ${reg.empleado.apellidos}`
                            : `-`}
                        </TableCell>
                        <TableCell className="py-2 text-xs">
                          {formatDate(reg.fecha)}
                        </TableCell>
                        <TableCell className="py-2 font-mono text-xs">
                          {formatTime(reg.horaEntrada)}
                        </TableCell>
                        <TableCell className="py-2 font-mono text-xs">
                          {formatTime(reg.horaSalida)}
                        </TableCell>
                        <TableCell className="py-2 text-right tabular-nums text-xs">
                          {reg.pausaMinutos} min
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono tabular-nums text-xs">
                          {formatHours(reg.horasTrabajadas)}
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono tabular-nums text-xs">
                          {reg.horasExtra > 0 ? (
                            <Badge variant="destructive" className="text-[10px]">
                              {formatHours(reg.horasExtra)}
                            </Badge>
                          ) : (
                            formatHours(reg.horasExtra)
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground max-w-[150px] truncate">
                          {reg.notas || '-'}
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                            onClick={() => confirmDelete(reg)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {t('historial.noRecords', { defaultValue: 'No hay registros para los filtros seleccionados' })}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* Tab 3: Resumen Mensual                                        */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="resumen" className="space-y-4">
          {/* Month/Year selectors */}
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-sm font-medium">
                {t('resumen.title', { defaultValue: 'Resumen Mensual' })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex items-end gap-3">
                <div className="grid gap-1.5 min-w-[160px]">
                  <Label className="text-xs">
                    {t('resumen.month', { defaultValue: 'Mes' })}
                  </Label>
                  <Select
                    value={String(resumenMes)}
                    onValueChange={(v) => setResumenMes(Number(v))}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {meses.map((m) => (
                        <SelectItem key={m.value} value={String(m.value)}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5 min-w-[120px]">
                  <Label className="text-xs">
                    {t('resumen.year', { defaultValue: 'Anio' })}
                  </Label>
                  <Select
                    value={String(resumenAnio)}
                    onValueChange={(v) => setResumenAnio(Number(v))}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {anios.map((a) => (
                        <SelectItem key={a} value={String(a)}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary table */}
          <Card>
            <CardContent className="p-0">
              {isLoadingResumen ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : resumen.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-9 text-xs">
                        {t('table.employee', { defaultValue: 'Empleado' })}
                      </TableHead>
                      <TableHead className="h-9 text-xs text-right">
                        {t('resumen.daysWorked', { defaultValue: 'Dias Trabajados' })}
                      </TableHead>
                      <TableHead className="h-9 text-xs text-right">
                        {t('resumen.totalHours', { defaultValue: 'Total Horas' })}
                      </TableHead>
                      <TableHead className="h-9 text-xs text-right">
                        {t('resumen.totalOvertime', { defaultValue: 'Total Horas Extra' })}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resumen.map((row) => (
                      <TableRow key={row.empleadoId}>
                        <TableCell className="py-2 text-xs font-medium">
                          {row.nombre}
                        </TableCell>
                        <TableCell className="py-2 text-right tabular-nums text-xs">
                          {row.diasTrabajados}
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono tabular-nums text-xs">
                          {formatHours(row.totalHoras)}
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono tabular-nums text-xs">
                          {row.totalHorasExtra > 0 ? (
                            <Badge variant="destructive" className="text-[10px]">
                              {formatHours(row.totalHorasExtra)}
                            </Badge>
                          ) : (
                            formatHours(row.totalHorasExtra)
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="py-2 text-xs font-semibold">
                        {t('resumen.totals', { defaultValue: 'Totales' })}
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-xs font-semibold">
                        {resumenTotals.diasTrabajados}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono tabular-nums text-xs font-semibold">
                        {formatHours(resumenTotals.totalHoras)}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono tabular-nums text-xs font-semibold">
                        {formatHours(resumenTotals.totalHorasExtra)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {t('resumen.noData', { defaultValue: 'No hay datos para el periodo seleccionado' })}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Delete confirmation dialog ── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              {t('deleteDialog.title', { defaultValue: 'Eliminar registro' })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {t('deleteDialog.description', {
                defaultValue: 'Esta accion eliminara el registro de jornada de forma permanente. Esta seguro?',
              })}
              {registroToDelete?.empleado && (
                <span className="block mt-2 font-medium">
                  {registroToDelete.empleado.nombre} {registroToDelete.empleado.apellidos} - {formatDate(registroToDelete.fecha)}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-sm">
              {t('common:cancel', { defaultValue: 'Cancelar' })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-sm"
            >
              {t('common:delete', { defaultValue: 'Eliminar' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
