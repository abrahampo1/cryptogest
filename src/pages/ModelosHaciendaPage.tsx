import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { translateError } from "@/lib/formatting"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Loader2,
  Calculator,
  FileText,
  Info,
  AlertCircle,
  HelpCircle,
} from "lucide-react"
import { formatCurrency } from "@/lib/formatting"

interface EjercicioFiscal {
  id: number
  anio: number
  estado: string
}

interface Modelo303Data {
  trimestre: number
  anio: number
  periodo: string
  ivaDevengado: number
  ivaDeducible: number
  resultado: number
  aIngresar: number
  aCompensar: number
  desgloseDevengado: Record<string, { base: number; cuota: number }>
  desgloseDeducible: Record<string, { base: number; cuota: number }>
}

interface Modelo111Data {
  trimestre: number
  anio: number
  periodo: string
  totalRetenciones: number
  numPerceptores: number
  baseRetenciones: number
}

interface Modelo390Data {
  anio: number
  trimestres: Array<{
    trimestre: number
    devengado: number
    deducible: number
    resultado: number
  }>
  totalDevengado: number
  totalDeducible: number
  resultado: number
}

const trimestreKeys = ["q1", "q2", "q3", "q4"] as const

export function ModelosHaciendaPage({ onHelp }: { onHelp?: () => void }) {
  const { t } = useTranslation(['modelos', 'common'])

  const [ejercicios, setEjercicios] = useState<EjercicioFiscal[]>([])
  const [selectedEjercicioId, setSelectedEjercicioId] = useState<string>("")
  const [isLoadingEjercicios, setIsLoadingEjercicios] = useState(true)

  // Modelo 303 state
  const [trimestre303, setTrimestre303] = useState<string>("1")
  const [modelo303Data, setModelo303Data] = useState<Modelo303Data | null>(null)
  const [isLoading303, setIsLoading303] = useState(false)
  const [error303, setError303] = useState<string | null>(null)

  // Modelo 111 state
  const [trimestre111, setTrimestre111] = useState<string>("1")
  const [modelo111Data, setModelo111Data] = useState<Modelo111Data | null>(null)
  const [isLoading111, setIsLoading111] = useState(false)
  const [error111, setError111] = useState<string | null>(null)

  // Modelo 390 state
  const [modelo390Data, setModelo390Data] = useState<Modelo390Data | null>(null)
  const [isLoading390, setIsLoading390] = useState(false)
  const [error390, setError390] = useState<string | null>(null)

  useEffect(() => {
    loadEjercicios()
  }, [])

  // Re-load when cloud entities update in background
  useEffect(() => {
    const unsub = window.electronAPI?.onEntityUpdated?.((data) => {
      if (['factura', 'gasto', 'impuesto'].includes(data.entityType)) {
        loadEjercicios()
      }
    })
    return () => { unsub?.() }
  }, [])

  const loadEjercicios = async () => {
    setIsLoadingEjercicios(true)
    try {
      // Asegurar que existe el ejercicio actual
      await window.electronAPI?.ejercicios.getOrCreateCurrent()

      const res = await window.electronAPI?.ejercicios.getAll()
      if (res?.success && res.data) {
        const sorted = [...res.data].sort((a, b) => b.anio - a.anio)
        setEjercicios(sorted)
        if (sorted.length > 0) {
          setSelectedEjercicioId(String(sorted[0].id))
        }
      }
    } catch (err) {
      console.error("Error cargando ejercicios:", err)
    } finally {
      setIsLoadingEjercicios(false)
    }
  }

  const handleCalcular303 = async () => {
    if (!selectedEjercicioId) return

    setIsLoading303(true)
    setError303(null)
    setModelo303Data(null)

    try {
      const res = await window.electronAPI?.modelos.modelo303({
        ejercicioId: parseInt(selectedEjercicioId),
        trimestre: parseInt(trimestre303),
      })

      if (res?.success && res.data) {
        setModelo303Data(res.data)
      } else {
        setError303(res?.error ? translateError(res.error) : t('modelo303.errorCalculating'))
      }
    } catch (err) {
      console.error("Error calculando Modelo 303:", err)
      setError303(String(err))
    } finally {
      setIsLoading303(false)
    }
  }

  const handleCalcular111 = async () => {
    if (!selectedEjercicioId) return

    setIsLoading111(true)
    setError111(null)
    setModelo111Data(null)

    try {
      const res = await window.electronAPI?.modelos.modelo111({
        ejercicioId: parseInt(selectedEjercicioId),
        trimestre: parseInt(trimestre111),
      })

      if (res?.success && res.data) {
        setModelo111Data(res.data)
      } else {
        setError111(res?.error ? translateError(res.error) : t('modelo111.errorCalculating'))
      }
    } catch (err) {
      console.error("Error calculando Modelo 111:", err)
      setError111(String(err))
    } finally {
      setIsLoading111(false)
    }
  }

  const handleCalcular390 = async () => {
    if (!selectedEjercicioId) return

    setIsLoading390(true)
    setError390(null)
    setModelo390Data(null)

    try {
      const res = await window.electronAPI?.modelos.modelo390({
        ejercicioId: parseInt(selectedEjercicioId),
      })

      if (res?.success && res.data) {
        setModelo390Data(res.data)
      } else {
        setError390(res?.error ? translateError(res.error) : t('modelo390.errorCalculating'))
      }
    } catch (err) {
      console.error("Error calculando Modelo 390:", err)
      setError390(String(err))
    } finally {
      setIsLoading390(false)
    }
  }

  const selectedEjercicio = ejercicios.find(
    (e) => String(e.id) === selectedEjercicioId
  )

  if (isLoadingEjercicios) {
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
            <h1 className="text-xl font-semibold">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('subtitle')}
            </p>
          </div>
          {onHelp && (
            <button onClick={onHelp} className="rounded-full p-1.5 hover:bg-accent transition-colors" title={t('common:viewHelp')}>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Selector de Ejercicio Fiscal */}
      <div className="flex items-end gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">{t('fiscalYear')}</Label>
          <Select
            value={selectedEjercicioId}
            onValueChange={(value) => {
              setSelectedEjercicioId(value)
              setModelo303Data(null)
              setModelo111Data(null)
              setModelo390Data(null)
              setError303(null)
              setError111(null)
              setError390(null)
            }}
          >
            <SelectTrigger className="h-8 w-44 text-sm">
              <SelectValue placeholder={t('selectExercise')} />
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
        {selectedEjercicio && (
          <span className="text-xs text-muted-foreground pb-1.5">
            {t('statusLabel', { status: selectedEjercicio.estado })}
          </span>
        )}
      </div>

      {/* Tabs de Modelos */}
      <Tabs defaultValue="modelo303" className="space-y-4">
        <TabsList className="h-8">
          <TabsTrigger value="modelo303" className="text-xs h-7 px-3">
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            {t('modelo303.title')}
          </TabsTrigger>
          <TabsTrigger value="modelo111" className="text-xs h-7 px-3">
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            {t('modelo111.title')}
          </TabsTrigger>
          <TabsTrigger value="modelo390" className="text-xs h-7 px-3">
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            {t('modelo390.title')}
          </TabsTrigger>
        </TabsList>

        {/* ==================== MODELO 303 ==================== */}
        <TabsContent value="modelo303" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {t('modelo303.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t('quarter')}</Label>
                  <Select
                    value={trimestre303}
                    onValueChange={(value) => {
                      setTrimestre303(value)
                      setModelo303Data(null)
                      setError303(null)
                    }}
                  >
                    <SelectTrigger className="h-8 w-28 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {trimestreKeys.map((key, idx) => (
                        <SelectItem key={idx + 1} value={String(idx + 1)}>
                          {t(key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  onClick={handleCalcular303}
                  disabled={isLoading303 || !selectedEjercicioId}
                >
                  {isLoading303 ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Calculator className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t('calculate')}
                </Button>
              </div>

              {error303 && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error303}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resultados Modelo 303 */}
          {modelo303Data && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t('modelo303.resultTitle', { period: modelo303Data.periodo })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* IVA Devengado */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {t('modelo303.accruedSection')}
                  </h3>
                  <div className="border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-9 text-xs">{t('taxType')}</TableHead>
                          <TableHead className="h-9 text-xs text-right">
                            {t('taxBase')}
                          </TableHead>
                          <TableHead className="h-9 text-xs text-right">
                            {t('modelo303.quota')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(modelo303Data.desgloseDevengado).map(
                          ([tipo, { base, cuota }]) => (
                            <TableRow key={tipo}>
                              <TableCell className="py-2 text-sm">
                                {tipo}
                              </TableCell>
                              <TableCell className="py-2 text-sm text-right tabular-nums">
                                {formatCurrency(base)}
                              </TableCell>
                              <TableCell className="py-2 text-sm text-right tabular-nums">
                                {formatCurrency(cuota)}
                              </TableCell>
                            </TableRow>
                          )
                        )}
                        <TableRow className="bg-muted/30 font-semibold">
                          <TableCell className="py-2 text-sm font-semibold">
                            {t('modelo303.totalAccrued')}
                          </TableCell>
                          <TableCell className="py-2 text-sm text-right tabular-nums font-semibold">
                            {formatCurrency(
                              Object.values(modelo303Data.desgloseDevengado).reduce(
                                (acc, { base }) => acc + base,
                                0
                              )
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-sm text-right tabular-nums font-semibold">
                            {formatCurrency(modelo303Data.ivaDevengado)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <Separator />

                {/* IVA Deducible */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {t('modelo303.deductibleSection')}
                  </h3>
                  <div className="border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-9 text-xs">{t('taxType')}</TableHead>
                          <TableHead className="h-9 text-xs text-right">
                            {t('taxBase')}
                          </TableHead>
                          <TableHead className="h-9 text-xs text-right">
                            {t('modelo303.quota')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {modelo303Data.desgloseDeducible && Object.entries(modelo303Data.desgloseDeducible).length > 0 ? (
                          <>
                            {Object.entries(modelo303Data.desgloseDeducible).map(
                              ([tipo, { base, cuota }]) => (
                                <TableRow key={tipo}>
                                  <TableCell className="py-2 text-sm">
                                    {tipo}
                                  </TableCell>
                                  <TableCell className="py-2 text-sm text-right tabular-nums">
                                    {formatCurrency(base)}
                                  </TableCell>
                                  <TableCell className="py-2 text-sm text-right tabular-nums">
                                    {formatCurrency(cuota)}
                                  </TableCell>
                                </TableRow>
                              )
                            )}
                            <TableRow className="bg-muted/30 font-semibold">
                              <TableCell className="py-2 text-sm font-semibold">
                                {t('modelo303.totalDeductible')}
                              </TableCell>
                              <TableCell className="py-2 text-sm text-right tabular-nums font-semibold">
                                {formatCurrency(
                                  Object.values(modelo303Data.desgloseDeducible).reduce(
                                    (acc, { base }) => acc + base,
                                    0
                                  )
                                )}
                              </TableCell>
                              <TableCell className="py-2 text-sm text-right tabular-nums font-semibold">
                                {formatCurrency(modelo303Data.ivaDeducible)}
                              </TableCell>
                            </TableRow>
                          </>
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="py-3 text-center text-xs text-muted-foreground">
                              {t('modelo303.noDeductible')}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <Separator />

                {/* Resultado */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {t('modelo303.settlementResult')}
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {t('modelo303.formula')}
                      </span>
                      <span className="tabular-nums">
                        {formatCurrency(modelo303Data.ivaDevengado)} -{" "}
                        {formatCurrency(modelo303Data.ivaDeducible)}
                      </span>
                    </div>
                    <div
                      className={`flex items-center justify-between rounded-lg border-2 p-4 ${
                        modelo303Data.resultado > 0
                          ? "border-red-200 bg-red-50"
                          : modelo303Data.resultado < 0
                          ? "border-green-200 bg-green-50"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          {t('modelo303.settlementResult')}
                        </p>
                        <p
                          className={`text-xs ${
                            modelo303Data.resultado > 0
                              ? "text-red-600"
                              : modelo303Data.resultado < 0
                              ? "text-green-600"
                              : "text-muted-foreground"
                          }`}
                        >
                          {modelo303Data.resultado > 0
                            ? t('modelo303.toDepositHacienda')
                            : modelo303Data.resultado < 0
                            ? t('modelo303.toCompensateNext')
                            : t('modelo303.noResult')}
                        </p>
                      </div>
                      <span
                        className={`text-xl font-bold tabular-nums ${
                          modelo303Data.resultado > 0
                            ? "text-red-700"
                            : modelo303Data.resultado < 0
                            ? "text-green-700"
                            : "text-slate-700"
                        }`}
                      >
                        {formatCurrency(Math.abs(modelo303Data.resultado))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Info Card */}
                <div className="flex gap-3 rounded border bg-blue-50/50 border-blue-100 p-3">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-blue-700 space-y-1">
                    <p className="font-medium">
                      {t('modelo303.infoTitle')}
                    </p>
                    <p>
                      {t('modelo303.infoContent')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== MODELO 111 ==================== */}
        <TabsContent value="modelo111" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {t('modelo111.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t('quarter')}</Label>
                  <Select
                    value={trimestre111}
                    onValueChange={(value) => {
                      setTrimestre111(value)
                      setModelo111Data(null)
                      setError111(null)
                    }}
                  >
                    <SelectTrigger className="h-8 w-28 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {trimestreKeys.map((key, idx) => (
                        <SelectItem key={idx + 1} value={String(idx + 1)}>
                          {t(key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  onClick={handleCalcular111}
                  disabled={isLoading111 || !selectedEjercicioId}
                >
                  {isLoading111 ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Calculator className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t('calculate')}
                </Button>
              </div>

              {error111 && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error111}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resultados Modelo 111 */}
          {modelo111Data && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t('modelo111.resultTitle', { period: modelo111Data.periodo })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Total Retenciones */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {t('modelo111.retentionsPracticed')}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t('modelo111.retentionsDescription')}
                  </p>

                  {modelo111Data.totalRetenciones === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 rounded border bg-muted/30">
                      <FileText className="h-8 w-8 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {t('modelo111.noRetentions')}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded border p-3">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('modelo111.recipients')}</p>
                          <p className="text-lg font-semibold tabular-nums">{modelo111Data.numPerceptores}</p>
                        </div>
                        <div className="rounded border p-3">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('modelo111.retentionBase')}</p>
                          <p className="text-lg font-semibold tabular-nums">{formatCurrency(modelo111Data.baseRetenciones)}</p>
                        </div>
                        <div className="rounded border p-3">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('modelo111.retentions')}</p>
                          <p className="text-lg font-semibold tabular-nums">{formatCurrency(modelo111Data.totalRetenciones)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border-2 border-amber-200 bg-amber-50 p-4">
                        <div>
                          <p className="text-sm font-semibold">
                            {t('modelo111.totalToDeposit')}
                          </p>
                          <p className="text-xs text-amber-600">
                            {t('toDepositHacienda')}
                          </p>
                        </div>
                        <span className="text-xl font-bold tabular-nums text-amber-700">
                          {formatCurrency(modelo111Data.totalRetenciones)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Info Card */}
                <div className="flex gap-3 rounded border bg-blue-50/50 border-blue-100 p-3">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-blue-700 space-y-1">
                    <p className="font-medium">
                      {t('modelo111.infoTitle')}
                    </p>
                    <p>
                      {t('modelo111.infoContent')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== MODELO 390 ==================== */}
        <TabsContent value="modelo390" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {t('modelo390.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-3">
                <Button
                  size="sm"
                  onClick={handleCalcular390}
                  disabled={isLoading390 || !selectedEjercicioId}
                >
                  {isLoading390 ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Calculator className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t('calculateAnnualSummary')}
                </Button>
              </div>

              {error390 && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error390}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resultados Modelo 390 */}
          {modelo390Data && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t('modelo390.resultTitle', { year: modelo390Data.anio })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Tabla por Trimestres */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {t('modelo390.quarterSummary')}
                  </h3>
                  <div className="border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-9 text-xs">
                            {t('modelo390.quarterLabel')}
                          </TableHead>
                          <TableHead className="h-9 text-xs text-right">
                            {t('modelo390.accrued')}
                          </TableHead>
                          <TableHead className="h-9 text-xs text-right">
                            {t('modelo390.deductible')}
                          </TableHead>
                          <TableHead className="h-9 text-xs text-right">
                            {t('modelo390.result')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {modelo390Data.trimestres.map((tr) => (
                          <TableRow key={tr.trimestre}>
                            <TableCell className="py-2 text-sm">
                              {t('quarterT', { quarter: tr.trimestre })}
                            </TableCell>
                            <TableCell className="py-2 text-sm text-right tabular-nums">
                              {formatCurrency(tr.devengado)}
                            </TableCell>
                            <TableCell className="py-2 text-sm text-right tabular-nums">
                              {formatCurrency(tr.deducible)}
                            </TableCell>
                            <TableCell
                              className={`py-2 text-sm text-right tabular-nums ${
                                tr.resultado > 0
                                  ? "text-red-600"
                                  : tr.resultado < 0
                                  ? "text-green-600"
                                  : ""
                              }`}
                            >
                              {formatCurrency(tr.resultado)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/30 border-t-2 font-semibold">
                          <TableCell className="py-2 text-sm font-semibold">
                            {t('modelo390.totalAnnual')}
                          </TableCell>
                          <TableCell className="py-2 text-sm text-right tabular-nums font-semibold">
                            {formatCurrency(modelo390Data.totalDevengado)}
                          </TableCell>
                          <TableCell className="py-2 text-sm text-right tabular-nums font-semibold">
                            {formatCurrency(modelo390Data.totalDeducible)}
                          </TableCell>
                          <TableCell
                            className={`py-2 text-sm text-right tabular-nums font-semibold ${
                              modelo390Data.resultado > 0
                                ? "text-red-600"
                                : modelo390Data.resultado < 0
                                ? "text-green-600"
                                : ""
                            }`}
                          >
                            {formatCurrency(modelo390Data.resultado)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <Separator />

                {/* Resumen Anual */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {t('modelo390.annualSummary')}
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded border p-3">
                      <p className="text-xs text-muted-foreground">
                        {t('modelo390.totalAccrued')}
                      </p>
                      <p className="text-lg font-semibold tabular-nums mt-1">
                        {formatCurrency(modelo390Data.totalDevengado)}
                      </p>
                    </div>
                    <div className="rounded border p-3">
                      <p className="text-xs text-muted-foreground">
                        {t('modelo390.totalDeductible')}
                      </p>
                      <p className="text-lg font-semibold tabular-nums mt-1">
                        {formatCurrency(modelo390Data.totalDeducible)}
                      </p>
                    </div>
                    <div
                      className={`rounded border-2 p-3 ${
                        modelo390Data.resultado > 0
                          ? "border-red-200 bg-red-50"
                          : modelo390Data.resultado < 0
                          ? "border-green-200 bg-green-50"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <p className="text-xs text-muted-foreground">
                        {t('modelo390.annualResult')}
                      </p>
                      <p
                        className={`text-lg font-semibold tabular-nums mt-1 ${
                          modelo390Data.resultado > 0
                            ? "text-red-700"
                            : modelo390Data.resultado < 0
                            ? "text-green-700"
                            : ""
                        }`}
                      >
                        {formatCurrency(modelo390Data.resultado)}
                      </p>
                      <p
                        className={`text-xs mt-0.5 ${
                          modelo390Data.resultado > 0
                            ? "text-red-600"
                            : modelo390Data.resultado < 0
                            ? "text-green-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        {modelo390Data.resultado > 0
                          ? t('toDeposit')
                          : modelo390Data.resultado < 0
                          ? t('toCompensate')
                          : t('noDifference')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Info Card */}
                <div className="flex gap-3 rounded border bg-blue-50/50 border-blue-100 p-3">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-blue-700 space-y-1">
                    <p className="font-medium">
                      {t('modelo390.infoTitle')}
                    </p>
                    <p>
                      {t('modelo390.infoContent')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
