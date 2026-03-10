import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  CalendarOff,
  HelpCircle,
} from 'lucide-react'

// ── Helpers ─────────────────────────────────────────────────────────────

function calcDiasNaturales(start: string, end: string): number {
  if (!start || !end) return 0
  const s = new Date(start)
  const e = new Date(end)
  if (e < s) return 0
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

function calcDiasHabiles(start: string, end: string): number {
  if (!start || !end) return 0
  const s = new Date(start)
  const e = new Date(end)
  if (e < s) return 0
  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    const day = cur.getDay()
    if (day !== 0 && day !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString()
}

// ── Default absence types seed data ─────────────────────────────────────

const DEFAULT_TIPOS = [
  { nombre: 'Vacaciones', codigo: 'VAC', color: '#3B82F6', descontaSalario: false, requiereAprobacion: true },
  { nombre: 'Baja por IT', codigo: 'BAJA_IT', color: '#EF4444', descontaSalario: true, requiereAprobacion: false },
  { nombre: 'Permiso Retribuido', codigo: 'PERM_R', color: '#10B981', descontaSalario: false, requiereAprobacion: true },
  { nombre: 'Permiso No Retribuido', codigo: 'PERM_NR', color: '#F59E0B', descontaSalario: true, requiereAprobacion: true },
  { nombre: 'Maternidad/Paternidad', codigo: 'MATPAT', color: '#8B5CF6', descontaSalario: false, requiereAprobacion: false },
]

// ── Component ───────────────────────────────────────────────────────────

export function AusenciasPage({ onHelp }: { onHelp?: () => void }) {
  const { t } = useTranslation(['ausencias', 'common'])

  // ── Shared state ────────────────────────────────────────────────────
  const [ausencias, setAusencias] = useState<Ausencia[]>([])
  const [tiposAusencia, setTiposAusencia] = useState<TipoAusencia[]>([])
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // ── Calendar state ──────────────────────────────────────────────────
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear] = useState(new Date().getFullYear())

  // ── Solicitudes filter state ────────────────────────────────────────
  const [filterEmpleado, setFilterEmpleado] = useState<string>('all')
  const [filterEstado, setFilterEstado] = useState<string>('all')
  const [filterFechaDesde, setFilterFechaDesde] = useState('')
  const [filterFechaHasta, setFilterFechaHasta] = useState('')

  // ── Ausencia create dialog ──────────────────────────────────────────
  const [isAusenciaDialogOpen, setIsAusenciaDialogOpen] = useState(false)
  const [ausenciaForm, setAusenciaForm] = useState({
    empleadoId: '',
    tipoAusenciaId: '',
    fechaInicio: '',
    fechaFin: '',
    notas: '',
  })

  // ── Tipo ausencia create/edit dialog ────────────────────────────────
  const [isTipoDialogOpen, setIsTipoDialogOpen] = useState(false)
  const [editingTipo, setEditingTipo] = useState<TipoAusencia | null>(null)
  const [tipoForm, setTipoForm] = useState({
    nombre: '',
    codigo: '',
    color: '#3B82F6',
    descontaSalario: false,
    requiereAprobacion: true,
    activo: true,
  })

  // ── Delete dialog ───────────────────────────────────────────────────
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'ausencia' | 'tipo'; id: number; label: string } | null>(null)

  // ── Data loading ────────────────────────────────────────────────────

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    const unsub = window.electronAPI?.onEntityUpdated?.((data) => {
      if (['ausencia', 'tipoAusencia', 'empleado'].includes(data.entityType)) {
        loadAll(false)
      }
    })
    return () => { unsub?.() }
  }, [])

  const loadAll = async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true)
      const [ausRes, tiposRes, empRes] = await Promise.all([
        window.electronAPI?.ausencias.getAll(),
        window.electronAPI?.tiposAusencia.getAll(),
        window.electronAPI?.empleados.getAll(),
      ])
      if (ausRes?.success && ausRes.data) setAusencias(ausRes.data)
      if (tiposRes?.success && tiposRes.data) setTiposAusencia(tiposRes.data)
      if (empRes?.success && empRes.data) setEmpleados(empRes.data)
    } catch (error) {
      console.error('Error loading ausencias data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Computed: auto-calc days on form change ─────────────────────────

  const formDiasNaturales = useMemo(
    () => calcDiasNaturales(ausenciaForm.fechaInicio, ausenciaForm.fechaFin),
    [ausenciaForm.fechaInicio, ausenciaForm.fechaFin],
  )

  const formDiasHabiles = useMemo(
    () => calcDiasHabiles(ausenciaForm.fechaInicio, ausenciaForm.fechaFin),
    [ausenciaForm.fechaInicio, ausenciaForm.fechaFin],
  )

  // ── Solicitudes filter ──────────────────────────────────────────────

  const filteredAusencias = useMemo(() => {
    return ausencias.filter((a) => {
      if (filterEmpleado !== 'all' && String(a.empleadoId) !== filterEmpleado) return false
      if (filterEstado !== 'all' && a.estado !== filterEstado) return false
      if (filterFechaDesde) {
        const start = new Date(filterFechaDesde)
        if (new Date(a.fechaInicio) < start) return false
      }
      if (filterFechaHasta) {
        const end = new Date(filterFechaHasta)
        if (new Date(a.fechaFin) > end) return false
      }
      return true
    })
  }, [ausencias, filterEmpleado, filterEstado, filterFechaDesde, filterFechaHasta])

  // ── Calendar helpers ────────────────────────────────────────────────

  const calendarGrid = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1)
    const lastDay = new Date(calYear, calMonth + 1, 0)
    const daysInMonth = lastDay.getDate()

    // Monday = 0, Sunday = 6
    let startDow = firstDay.getDay() - 1
    if (startDow < 0) startDow = 6

    const cells: Array<{ day: number | null; date: string | null }> = []

    // Empty cells before month start
    for (let i = 0; i < startDow; i++) {
      cells.push({ day: null, date: null })
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ day: d, date: dateStr })
    }

    // Pad to complete weeks
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, date: null })
    }

    return cells
  }, [calMonth, calYear])

  // Map of date -> array of absences that cover that date
  const absencesByDate = useMemo(() => {
    const map = new Map<string, Array<{ ausencia: Ausencia; color: string }>>()

    for (const a of ausencias) {
      if (a.estado === 'rechazada' || a.estado === 'cancelada') continue
      const tipo = tiposAusencia.find((t) => t.id === a.tipoAusenciaId)
      const color = tipo?.color || '#94a3b8'
      const start = new Date(a.fechaInicio)
      const end = new Date(a.fechaFin)
      const cur = new Date(start)
      while (cur <= end) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push({ ausencia: a, color })
        cur.setDate(cur.getDate() + 1)
      }
    }

    return map
  }, [ausencias, tiposAusencia])

  const calMonthLabel = useMemo(() => {
    const d = new Date(calYear, calMonth, 1)
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }, [calMonth, calYear])

  const dayHeaders = useMemo(() => {
    // Mon..Sun short names using locale
    const labels: string[] = []
    for (let i = 1; i <= 7; i++) {
      const d = new Date(2024, 0, i) // 2024-01-01 is a Monday
      labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }))
    }
    return labels
  }, [])

  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11)
      setCalYear(calYear - 1)
    } else {
      setCalMonth(calMonth - 1)
    }
  }

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0)
      setCalYear(calYear + 1)
    } else {
      setCalMonth(calMonth + 1)
    }
  }

  // ── Ausencia CRUD ───────────────────────────────────────────────────

  const handleOpenAusenciaDialog = () => {
    setAusenciaForm({
      empleadoId: '',
      tipoAusenciaId: '',
      fechaInicio: '',
      fechaFin: '',
      notas: '',
    })
    setIsAusenciaDialogOpen(true)
  }

  const handleCreateAusencia = async () => {
    if (!ausenciaForm.empleadoId || !ausenciaForm.tipoAusenciaId || !ausenciaForm.fechaInicio || !ausenciaForm.fechaFin) return

    setIsSaving(true)
    try {
      const response = await window.electronAPI?.ausencias.create({
        empleadoId: Number(ausenciaForm.empleadoId),
        tipoAusenciaId: Number(ausenciaForm.tipoAusenciaId),
        fechaInicio: ausenciaForm.fechaInicio,
        fechaFin: ausenciaForm.fechaFin,
        diasNaturales: formDiasNaturales,
        diasHabiles: formDiasHabiles,
        notas: ausenciaForm.notas || null,
        estado: 'pendiente',
      })
      if (response?.success) {
        await loadAll(false)
        setIsAusenciaDialogOpen(false)
      }
    } catch (error) {
      console.error('Error creating ausencia:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateEstado = async (id: number, estado: string) => {
    try {
      const response = await window.electronAPI?.ausencias.updateEstado(id, estado)
      if (response?.success) {
        await loadAll(false)
      }
    } catch (error) {
      console.error('Error updating ausencia estado:', error)
    }
  }

  const handleDeleteAusencia = async (id: number) => {
    try {
      const response = await window.electronAPI?.ausencias.delete(id)
      if (response?.success) {
        await loadAll(false)
      }
    } catch (error) {
      console.error('Error deleting ausencia:', error)
    }
  }

  // ── Tipo Ausencia CRUD ──────────────────────────────────────────────

  const handleOpenTipoDialog = (tipo?: TipoAusencia) => {
    if (tipo) {
      setEditingTipo(tipo)
      setTipoForm({
        nombre: tipo.nombre,
        codigo: tipo.codigo,
        color: tipo.color,
        descontaSalario: tipo.descontaSalario,
        requiereAprobacion: tipo.requiereAprobacion,
        activo: tipo.activo,
      })
    } else {
      setEditingTipo(null)
      setTipoForm({
        nombre: '',
        codigo: '',
        color: '#3B82F6',
        descontaSalario: false,
        requiereAprobacion: true,
        activo: true,
      })
    }
    setIsTipoDialogOpen(true)
  }

  const handleSubmitTipo = async () => {
    if (!tipoForm.nombre.trim() || !tipoForm.codigo.trim()) return

    setIsSaving(true)
    try {
      if (editingTipo) {
        const response = await window.electronAPI?.tiposAusencia.update(editingTipo.id, tipoForm)
        if (response?.success) {
          await loadAll(false)
          setIsTipoDialogOpen(false)
        }
      } else {
        const response = await window.electronAPI?.tiposAusencia.create(tipoForm)
        if (response?.success) {
          await loadAll(false)
          setIsTipoDialogOpen(false)
        }
      }
    } catch (error) {
      console.error('Error saving tipo ausencia:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteTipo = async (id: number) => {
    try {
      const response = await window.electronAPI?.tiposAusencia.delete(id)
      if (response?.success) {
        await loadAll(false)
      }
    } catch (error) {
      console.error('Error deleting tipo ausencia:', error)
    }
  }

  const handleSeedDefaults = async () => {
    setIsSaving(true)
    try {
      for (const tipo of DEFAULT_TIPOS) {
        const exists = tiposAusencia.find((t) => t.codigo === tipo.codigo)
        if (!exists) {
          await window.electronAPI?.tiposAusencia.create({
            ...tipo,
            activo: true,
          })
        }
      }
      await loadAll(false)
    } catch (error) {
      console.error('Error seeding default tipos:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // ── Delete confirmation ─────────────────────────────────────────────

  const confirmDelete = (type: 'ausencia' | 'tipo', id: number, label: string) => {
    setDeleteTarget({ type, id, label })
    setDeleteDialogOpen(true)
  }

  const executeDelete = async () => {
    if (!deleteTarget) return
    if (deleteTarget.type === 'ausencia') {
      await handleDeleteAusencia(deleteTarget.id)
    } else {
      await handleDeleteTipo(deleteTarget.id)
    }
    setDeleteDialogOpen(false)
    setDeleteTarget(null)
  }

  // ── Estado badge variant ────────────────────────────────────────────

  const getEstadoBadgeVariant = (estado: string): 'warning' | 'success' | 'destructive' | 'secondary' => {
    switch (estado) {
      case 'pendiente': return 'warning'
      case 'aprobada': return 'success'
      case 'rechazada': return 'destructive'
      case 'cancelada': return 'secondary'
      default: return 'secondary'
    }
  }

  // ── Employee name helper ────────────────────────────────────────────

  const getEmpleadoName = (ausencia: Ausencia): string => {
    if (ausencia.empleado) {
      return `${ausencia.empleado.nombre} ${ausencia.empleado.apellidos}`
    }
    const emp = empleados.find((e) => e.id === ausencia.empleadoId)
    return emp ? `${emp.nombre} ${emp.apellidos}` : `#${ausencia.empleadoId}`
  }

  const getTipoName = (ausencia: Ausencia): string => {
    if (ausencia.tipoAusencia) return ausencia.tipoAusencia.nombre
    const tipo = tiposAusencia.find((t) => t.id === ausencia.tipoAusenciaId)
    return tipo?.nombre || `#${ausencia.tipoAusenciaId}`
  }

  // ── Loading state ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl font-semibold">{t('title')}</h1>
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
      <Tabs defaultValue="calendario">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="calendario">{t('tabs.calendario')}</TabsTrigger>
          <TabsTrigger value="solicitudes">
            {t('tabs.solicitudes')}
            {ausencias.length > 0 && (
              <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded-full">{ausencias.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="tipos">{t('tabs.tipos')}</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════
            Tab 1: Calendario
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="calendario">
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handlePrevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-sm font-medium capitalize">{calMonthLabel}</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleNextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {dayHeaders.map((label) => (
                  <div key={label} className="text-center text-xs font-medium text-muted-foreground py-1">
                    {label}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {calendarGrid.map((cell, idx) => {
                  if (cell.day === null) {
                    return <div key={`empty-${idx}`} className="h-14" />
                  }

                  const entries = cell.date ? absencesByDate.get(cell.date) || [] : []
                  const isToday =
                    cell.date ===
                    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`

                  return (
                    <div
                      key={cell.date}
                      className={`relative h-14 rounded-md border p-1 text-xs transition-colors ${
                        isToday ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'
                      }`}
                    >
                      <span className={`font-medium ${isToday ? 'text-primary' : 'text-foreground'}`}>
                        {cell.day}
                      </span>
                      {entries.length > 0 && (
                        <div className="mt-0.5 flex flex-col gap-0.5 overflow-hidden">
                          {entries.slice(0, 2).map((entry, i) => (
                            <div
                              key={`${entry.ausencia.id}-${i}`}
                              className="h-1.5 rounded-full"
                              style={{ backgroundColor: entry.color }}
                              title={`${getEmpleadoName(entry.ausencia)} - ${getTipoName(entry.ausencia)}`}
                            />
                          ))}
                          {entries.length > 2 && (
                            <span className="text-[9px] text-muted-foreground leading-none">
                              +{entries.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Legend */}
              {tiposAusencia.filter((t) => t.activo).length > 0 && (
                <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t">
                  {tiposAusencia
                    .filter((t) => t.activo)
                    .map((tipo) => (
                      <div key={tipo.id} className="flex items-center gap-1.5 text-xs">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: tipo.color }}
                        />
                        <span className="text-muted-foreground">{tipo.nombre}</span>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            Tab 2: Solicitudes
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="solicitudes">
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{t('tabs.solicitudes')}</CardTitle>
                <Button size="sm" onClick={handleOpenAusenciaDialog}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t('new')}
                </Button>
              </div>
            </CardHeader>

            {/* Filters */}
            <div className="px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={filterEmpleado} onValueChange={setFilterEmpleado}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder={t('empleado')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common:all')}</SelectItem>
                    {empleados
                      .filter((e) => e.activo)
                      .map((emp) => (
                        <SelectItem key={emp.id} value={String(emp.id)}>
                          {emp.nombre} {emp.apellidos}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <Select value={filterEstado} onValueChange={setFilterEstado}>
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue placeholder={t('estado')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common:all')}</SelectItem>
                    <SelectItem value="pendiente">{t('estados.pendiente')}</SelectItem>
                    <SelectItem value="aprobada">{t('estados.aprobada')}</SelectItem>
                    <SelectItem value="rechazada">{t('estados.rechazada')}</SelectItem>
                    <SelectItem value="cancelada">{t('estados.cancelada')}</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-1.5">
                  <Input
                    type="date"
                    className="h-8 w-36 text-xs"
                    value={filterFechaDesde}
                    onChange={(e) => setFilterFechaDesde(e.target.value)}
                    placeholder={t('fechaInicio')}
                  />
                  <span className="text-xs text-muted-foreground">-</span>
                  <Input
                    type="date"
                    className="h-8 w-36 text-xs"
                    value={filterFechaHasta}
                    onChange={(e) => setFilterFechaHasta(e.target.value)}
                    placeholder={t('fechaFin')}
                  />
                </div>
              </div>
            </div>

            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs">{t('empleado')}</TableHead>
                    <TableHead className="h-9 text-xs">{t('tipo')}</TableHead>
                    <TableHead className="h-9 text-xs">{t('fechaInicio')}</TableHead>
                    <TableHead className="h-9 text-xs">{t('fechaFin')}</TableHead>
                    <TableHead className="h-9 text-xs text-center">{t('diasNaturales')}</TableHead>
                    <TableHead className="h-9 text-xs text-center">{t('diasHabiles')}</TableHead>
                    <TableHead className="h-9 text-xs text-center">{t('estado')}</TableHead>
                    <TableHead className="h-9 text-xs text-right">{t('common:actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAusencias.map((ausencia) => (
                    <TableRow key={ausencia.id}>
                      <TableCell className="py-2 text-sm">
                        {getEmpleadoName(ausencia)}
                      </TableCell>
                      <TableCell className="py-2 text-sm">
                        <div className="flex items-center gap-1.5">
                          {ausencia.tipoAusencia && (
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: ausencia.tipoAusencia.color }}
                            />
                          )}
                          {getTipoName(ausencia)}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-xs">{formatDate(ausencia.fechaInicio)}</TableCell>
                      <TableCell className="py-2 text-xs">{formatDate(ausencia.fechaFin)}</TableCell>
                      <TableCell className="py-2 text-xs text-center tabular-nums">
                        {ausencia.diasNaturales}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-center tabular-nums">
                        {ausencia.diasHabiles}
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <Badge variant={getEstadoBadgeVariant(ausencia.estado)}>
                          {t(`estados.${ausencia.estado}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {ausencia.estado === 'pendiente' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                                onClick={() => handleUpdateEstado(ausencia.id, 'aprobada')}
                                title={t('aprobar')}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                                onClick={() => handleUpdateEstado(ausencia.id, 'rechazada')}
                                title={t('rechazar')}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                            onClick={() => confirmDelete('ausencia', ausencia.id, getEmpleadoName(ausencia))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredAusencias.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CalendarOff className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {t('noAusencias')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            Tab 3: Tipos de Ausencia
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="tipos">
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{t('tiposAusencia.title')}</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleSeedDefaults} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    {t('tiposAusencia.seedDefaults')}
                  </Button>
                  <Button size="sm" onClick={() => handleOpenTipoDialog()}>
                    <Plus className="mr-1 h-4 w-4" />
                    {t('tiposAusencia.new')}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs">{t('tiposAusencia.nombre')}</TableHead>
                    <TableHead className="h-9 text-xs">{t('tiposAusencia.codigo')}</TableHead>
                    <TableHead className="h-9 text-xs text-center">{t('tiposAusencia.color')}</TableHead>
                    <TableHead className="h-9 text-xs text-center">{t('tiposAusencia.descontaSalario')}</TableHead>
                    <TableHead className="h-9 text-xs text-center">{t('tiposAusencia.requiereAprobacion')}</TableHead>
                    <TableHead className="h-9 text-xs text-center">{t('tiposAusencia.activo')}</TableHead>
                    <TableHead className="h-9 text-xs text-right">{t('common:actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tiposAusencia.map((tipo) => (
                    <TableRow key={tipo.id} className={!tipo.activo ? 'opacity-60' : ''}>
                      <TableCell className="py-2 font-medium">{tipo.nombre}</TableCell>
                      <TableCell className="py-2 font-mono text-xs">{tipo.codigo}</TableCell>
                      <TableCell className="py-2 text-center">
                        <div className="flex justify-center">
                          <div
                            className="w-4 h-4 rounded-full border"
                            style={{ backgroundColor: tipo.color }}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-center text-xs">
                        {tipo.descontaSalario ? t('common:yes') : t('common:no')}
                      </TableCell>
                      <TableCell className="py-2 text-center text-xs">
                        {tipo.requiereAprobacion ? t('common:yes') : t('common:no')}
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            tipo.activo
                              ? 'bg-green-50 text-green-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {tipo.activo ? t('common:active') : t('common:inactive')}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleOpenTipoDialog(tipo)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                            onClick={() => confirmDelete('tipo', tipo.id, tipo.nombre)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {tiposAusencia.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t('tiposAusencia.noTipos')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════════
          Dialog: Nueva Ausencia
      ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={isAusenciaDialogOpen} onOpenChange={setIsAusenciaDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{t('new')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Empleado */}
            <div className="grid gap-1.5">
              <Label className="text-xs">{t('empleado')}</Label>
              <Select
                value={ausenciaForm.empleadoId}
                onValueChange={(v) => setAusenciaForm({ ...ausenciaForm, empleadoId: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={t('empleado')} />
                </SelectTrigger>
                <SelectContent>
                  {empleados
                    .filter((e) => e.activo)
                    .map((emp) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.nombre} {emp.apellidos}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo */}
            <div className="grid gap-1.5">
              <Label className="text-xs">{t('tipo')}</Label>
              <Select
                value={ausenciaForm.tipoAusenciaId}
                onValueChange={(v) => setAusenciaForm({ ...ausenciaForm, tipoAusenciaId: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={t('tipo')} />
                </SelectTrigger>
                <SelectContent>
                  {tiposAusencia
                    .filter((t) => t.activo)
                    .map((tipo) => (
                      <SelectItem key={tipo.id} value={String(tipo.id)}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: tipo.color }}
                          />
                          {tipo.nombre}
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('fechaInicio')}</Label>
                <Input
                  type="date"
                  className="h-8 text-sm"
                  value={ausenciaForm.fechaInicio}
                  onChange={(e) => setAusenciaForm({ ...ausenciaForm, fechaInicio: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('fechaFin')}</Label>
                <Input
                  type="date"
                  className="h-8 text-sm"
                  value={ausenciaForm.fechaFin}
                  min={ausenciaForm.fechaInicio}
                  onChange={(e) => setAusenciaForm({ ...ausenciaForm, fechaFin: e.target.value })}
                />
              </div>
            </div>

            {/* Auto-calculated days */}
            {ausenciaForm.fechaInicio && ausenciaForm.fechaFin && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-2 text-center">
                  <div className="text-lg font-semibold tabular-nums">{formDiasNaturales}</div>
                  <div className="text-xs text-muted-foreground">{t('diasNaturales')}</div>
                </div>
                <div className="rounded-md border p-2 text-center">
                  <div className="text-lg font-semibold tabular-nums">{formDiasHabiles}</div>
                  <div className="text-xs text-muted-foreground">{t('diasHabiles')}</div>
                </div>
              </div>
            )}

            {/* Notas */}
            <div className="grid gap-1.5">
              <Label className="text-xs">{t('notas')}</Label>
              <Textarea
                className="text-sm resize-none"
                rows={2}
                value={ausenciaForm.notas}
                onChange={(e) => setAusenciaForm({ ...ausenciaForm, notas: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsAusenciaDialogOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleCreateAusencia}
              disabled={
                isSaving ||
                !ausenciaForm.empleadoId ||
                !ausenciaForm.tipoAusenciaId ||
                !ausenciaForm.fechaInicio ||
                !ausenciaForm.fechaFin ||
                formDiasNaturales <= 0
              }
            >
              {isSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {t('common:create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════
          Dialog: Crear/Editar Tipo de Ausencia
      ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={isTipoDialogOpen} onOpenChange={setIsTipoDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingTipo ? t('tiposAusencia.edit') : t('tiposAusencia.new')}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('tiposAusencia.nombre')}</Label>
                <Input
                  className="h-8 text-sm"
                  value={tipoForm.nombre}
                  onChange={(e) => setTipoForm({ ...tipoForm, nombre: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('tiposAusencia.codigo')}</Label>
                <Input
                  className="h-8 text-sm"
                  value={tipoForm.codigo}
                  onChange={(e) => setTipoForm({ ...tipoForm, codigo: e.target.value.toUpperCase() })}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">{t('tiposAusencia.color')}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-8 w-12 rounded border cursor-pointer"
                  value={tipoForm.color}
                  onChange={(e) => setTipoForm({ ...tipoForm, color: e.target.value })}
                />
                <Input
                  className="h-8 text-sm flex-1"
                  value={tipoForm.color}
                  onChange={(e) => setTipoForm({ ...tipoForm, color: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="descontaSalario"
                  checked={tipoForm.descontaSalario}
                  onCheckedChange={(checked) => setTipoForm({ ...tipoForm, descontaSalario: checked })}
                />
                <Label htmlFor="descontaSalario" className="text-xs">
                  {t('tiposAusencia.descontaSalario')}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="requiereAprobacion"
                  checked={tipoForm.requiereAprobacion}
                  onCheckedChange={(checked) => setTipoForm({ ...tipoForm, requiereAprobacion: checked })}
                />
                <Label htmlFor="requiereAprobacion" className="text-xs">
                  {t('tiposAusencia.requiereAprobacion')}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="activo"
                  checked={tipoForm.activo}
                  onCheckedChange={(checked) => setTipoForm({ ...tipoForm, activo: checked })}
                />
                <Label htmlFor="activo" className="text-xs">
                  {t('tiposAusencia.activo')}
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsTipoDialogOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitTipo}
              disabled={isSaving || !tipoForm.nombre.trim() || !tipoForm.codigo.trim()}
            >
              {isSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {editingTipo ? t('common:save') : t('common:create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════
          Delete Confirmation
      ═══════════════════════════════════════════════════════════════ */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">{t('common:delete')}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {deleteTarget?.type === 'tipo'
                ? t('tiposAusencia.deleteConfirm')
                : `${t('common:delete')} - ${deleteTarget?.label}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-sm">{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDelete}
              className="bg-red-600 hover:bg-red-700 text-sm"
            >
              {t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
