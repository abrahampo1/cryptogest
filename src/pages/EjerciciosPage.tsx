import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Calendar,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Loader2,
  TrendingUp,
  TrendingDown,
  FileText,
  Receipt,
  BookOpen,
  BarChart3,
  AlertCircle,
  HelpCircle,
} from "lucide-react"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(amount)

const formatDate = (date: Date | string) =>
  new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })

export function EjerciciosPage({ onHelp }: { onHelp?: () => void }) {
  const [ejercicios, setEjercicios] = useState<EjercicioFiscal[]>([])
  const [selectedStats, setSelectedStats] = useState<EjercicioStats | null>(null)
  const [selectedEjercicioId, setSelectedEjercicioId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingStats, setLoadingStats] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()))
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<EjercicioFiscal | null>(null)
  const [toggleTarget, setToggleTarget] = useState<EjercicioFiscal | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    loadEjercicios()
  }, [])

  useEffect(() => {
    if (selectedEjercicioId) {
      loadStats(selectedEjercicioId)
    } else {
      setSelectedStats(null)
    }
  }, [selectedEjercicioId])

  const loadEjercicios = async () => {
    try {
      setLoading(true)
      // Asegurar que existe el ejercicio actual
      await window.electronAPI?.ejercicios.getOrCreateCurrent()
      const result = await window.electronAPI?.ejercicios.getAll()
      if (result?.success && result.data) {
        setEjercicios(result.data)
        // Seleccionar el ejercicio actual por defecto
        const currentYear = new Date().getFullYear()
        const current = result.data.find((e: EjercicioFiscal) => e.anio === currentYear)
        if (current && !selectedEjercicioId) {
          setSelectedEjercicioId(current.id)
        }
      }
    } catch (err) {
      console.error("Error cargando ejercicios:", err)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async (id: number) => {
    try {
      setLoadingStats(true)
      const result = await window.electronAPI?.ejercicios.getStats(id)
      if (result?.success && result.data) {
        setSelectedStats(result.data)
      }
    } catch (err) {
      console.error("Error cargando estadísticas:", err)
    } finally {
      setLoadingStats(false)
    }
  }

  const handleCreate = async () => {
    const anio = parseInt(newYear)
    if (isNaN(anio) || anio < 2000 || anio > 2100) {
      setError("Año no válido")
      return
    }
    if (ejercicios.some((e) => e.anio === anio)) {
      setError("Ya existe un ejercicio para ese año")
      return
    }
    try {
      setSaving(true)
      setError("")
      const result = await window.electronAPI?.ejercicios.create({ anio })
      if (result?.success) {
        setShowCreateDialog(false)
        await loadEjercicios()
        if (result.data) {
          setSelectedEjercicioId(result.data.id)
        }
      } else {
        setError(result?.error || "Error al crear ejercicio")
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleEstado = async () => {
    if (!toggleTarget) return
    const newEstado = toggleTarget.estado === "abierto" ? "cerrado" : "abierto"
    try {
      const result = await window.electronAPI?.ejercicios.update(toggleTarget.id, { estado: newEstado })
      if (result?.success) {
        await loadEjercicios()
        if (selectedEjercicioId === toggleTarget.id) {
          loadStats(toggleTarget.id)
        }
      }
    } catch (err) {
      console.error("Error al cambiar estado:", err)
    } finally {
      setToggleTarget(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const result = await window.electronAPI?.ejercicios.delete(deleteTarget.id)
      if (result?.success) {
        if (selectedEjercicioId === deleteTarget.id) {
          setSelectedEjercicioId(null)
          setSelectedStats(null)
        }
        await loadEjercicios()
      } else {
        alert(result?.error || "Error al eliminar")
      }
    } catch (err) {
      console.error("Error al eliminar:", err)
    } finally {
      setDeleteTarget(null)
    }
  }

  // Generar opciones de año para crear
  const currentYear = new Date().getFullYear()
  const yearOptions: number[] = []
  for (let y = currentYear + 1; y >= currentYear - 10; y--) {
    if (!ejercicios.some((e) => e.anio === y)) {
      yearOptions.push(y)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl font-semibold">Ejercicios Fiscales</h1>
            <p className="text-sm text-muted-foreground">
              Gestión de períodos contables anuales
            </p>
          </div>
          {onHelp && (
            <button onClick={onHelp} className="rounded-full p-1.5 hover:bg-accent transition-colors" title="Ver ayuda">
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => {
          setNewYear(String(yearOptions[0] || currentYear))
          setError("")
          setShowCreateDialog(true)
        }}>
          <Plus className="h-3.5 w-3.5" />
          Nuevo Ejercicio
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Lista de ejercicios */}
        <div className="col-span-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Ejercicios
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : ejercicios.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No hay ejercicios fiscales
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Año</TableHead>
                      <TableHead className="text-xs">Período</TableHead>
                      <TableHead className="text-xs">Estado</TableHead>
                      <TableHead className="text-xs text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ejercicios.map((ej) => (
                      <TableRow
                        key={ej.id}
                        className={`cursor-pointer ${selectedEjercicioId === ej.id ? "bg-muted" : ""}`}
                        onClick={() => setSelectedEjercicioId(ej.id)}
                      >
                        <TableCell className="text-sm font-medium">{ej.anio}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(ej.fechaInicio)} - {formatDate(ej.fechaFin)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={ej.estado === "abierto" ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {ej.estado === "abierto" ? "Abierto" : "Cerrado"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              title={ej.estado === "abierto" ? "Cerrar ejercicio" : "Reabrir ejercicio"}
                              onClick={(e) => {
                                e.stopPropagation()
                                setToggleTarget(ej)
                              }}
                            >
                              {ej.estado === "abierto" ? (
                                <Lock className="h-3.5 w-3.5" />
                              ) : (
                                <Unlock className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              title="Eliminar ejercicio"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteTarget(ej)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Panel de detalle / estadísticas */}
        <div className="col-span-7 space-y-4">
          {!selectedEjercicioId ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BarChart3 className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground">
                  Selecciona un ejercicio para ver sus estadísticas
                </p>
              </CardContent>
            </Card>
          ) : loadingStats ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : selectedStats ? (
            <>
              {/* Resumen general */}
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="rounded-md bg-blue-500/10 p-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                      </div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Facturado</span>
                    </div>
                    <p className="text-lg font-bold">{formatCurrency(selectedStats.totalFacturado)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedStats.totalFacturas} factura(s)
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="rounded-md bg-red-500/10 p-1.5">
                        <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                      </div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Gastos</span>
                    </div>
                    <p className="text-lg font-bold">{formatCurrency(selectedStats.totalGastos)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedStats.numGastos} gasto(s)
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`rounded-md p-1.5 ${selectedStats.resultado >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                        {selectedStats.resultado >= 0 ? (
                          <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Resultado</span>
                    </div>
                    <p className={`text-lg font-bold ${selectedStats.resultado >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(selectedStats.resultado)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedStats.resultado >= 0 ? "Beneficio" : "Pérdida"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Detalle facturas y contabilidad */}
              <div className="grid grid-cols-2 gap-3">
                {/* Facturas */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5" />
                      Facturación
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total facturas</span>
                      <span className="font-medium">{selectedStats.totalFacturas}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Pagadas</span>
                      <Badge variant="default" className="text-[10px]">{selectedStats.facturasPagadas}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Pendientes / Vencidas</span>
                      <Badge variant={selectedStats.facturasPendientes > 0 ? "destructive" : "secondary"} className="text-[10px]">
                        {selectedStats.facturasPendientes}
                      </Badge>
                    </div>
                    <div className="border-t pt-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total facturado</span>
                      <span className="font-bold">{formatCurrency(selectedStats.totalFacturado)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Contabilidad */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs flex items-center gap-2">
                      <BookOpen className="h-3.5 w-3.5" />
                      Contabilidad
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total asientos</span>
                      <span className="font-medium">{selectedStats.totalAsientos}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total Debe</span>
                      <span className="font-medium">{formatCurrency(selectedStats.totalDebe)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total Haber</span>
                      <span className="font-medium">{formatCurrency(selectedStats.totalHaber)}</span>
                    </div>
                    {selectedStats.totalAsientos > 0 && (
                      <div className="border-t pt-2">
                        <p className="text-[10px] text-muted-foreground mb-1">Por tipo:</p>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(selectedStats.asientosPorTipo).map(([tipo, count]: [string, number]) => (
                            <Badge key={tipo} variant="outline" className="text-[10px]">
                              {tipo}: {count}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Gastos detalle */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs flex items-center gap-2">
                    <Receipt className="h-3.5 w-3.5" />
                    Gastos del Ejercicio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Nº de gastos</p>
                      <p className="text-sm font-medium">{selectedStats.numGastos}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Total gastos</p>
                      <p className="text-sm font-medium">{formatCurrency(selectedStats.totalGastos)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Media por gasto</p>
                      <p className="text-sm font-medium">
                        {selectedStats.numGastos > 0
                          ? formatCurrency(selectedStats.totalGastos / selectedStats.numGastos)
                          : formatCurrency(0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Estado del ejercicio */}
              {selectedStats.ejercicio.estado === "cerrado" && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="p-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Este ejercicio está cerrado. No se pueden crear ni modificar asientos contables.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Dialog Crear Ejercicio */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-sm">Nuevo Ejercicio Fiscal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Año</label>
              <Select value={newYear} onValueChange={setNewYear}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md bg-muted p-2 space-y-1">
              <p className="text-[10px] text-muted-foreground">Se creará el ejercicio con:</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Inicio:</span>
                <span>01/01/{newYear}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Fin:</span>
                <span>31/12/{newYear}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Estado:</span>
                <Badge variant="default" className="text-[10px]">Abierto</Badge>
              </div>
            </div>
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Crear Ejercicio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog Cambiar Estado */}
      <AlertDialog open={!!toggleTarget} onOpenChange={() => setToggleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              {toggleTarget?.estado === "abierto" ? "Cerrar" : "Reabrir"} Ejercicio {toggleTarget?.anio}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {toggleTarget?.estado === "abierto"
                ? "Al cerrar el ejercicio, no se podrán crear ni modificar asientos contables de este período. ¿Desea continuar?"
                : "Al reabrir el ejercicio, se podrán volver a crear y modificar asientos contables. ¿Desea continuar?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="text-xs" onClick={handleToggleEstado}>
              {toggleTarget?.estado === "abierto" ? "Cerrar Ejercicio" : "Reabrir Ejercicio"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog Eliminar */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Eliminar Ejercicio {deleteTarget?.anio}</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Se eliminará el ejercicio fiscal. Solo es posible eliminar ejercicios sin asientos asociados. ¿Desea continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
