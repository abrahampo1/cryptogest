import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Loader2, Building2, FileDown, Send, Trash2, HelpCircle, AlertCircle } from 'lucide-react'
import { buildPain001Xml, buildPain008Xml } from '@/lib/generateSEPAXml'
import { formatCurrency, formatDate } from '@/lib/formatting'

// ── Types ──────────────────────────────────────────────────────────────

interface SEPAConfig {
  ordenante: string
  iban: string
  bic: string
  nif: string
  idAcreedor: string
}

interface Nomina {
  id: number
  empleadoId: number
  empleado?: { nombre: string; apellidos: string; iban?: string }
  mes: number
  anio: number
  liquidoPercibir: number
  estado: string
  iban?: string
}

interface Factura {
  id: number
  numero: string
  clienteId: number
  cliente?: { nombre: string; iban?: string }
  total: number
  estado: string
}

interface Cliente {
  id: number
  nombre: string
  iban?: string
}

interface SEPALote {
  id: number
  referencia: string
  tipo: 'pain001' | 'pain008'
  fecha: string
  numOperaciones: number
  importeTotal: number
  estado: string
  xmlContent: string
}

const emptyConfig: SEPAConfig = {
  ordenante: '',
  iban: '',
  bic: '',
  nif: '',
  idAcreedor: '',
}

const estadoLoteConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive' }> = {
  generado: { label: 'Generado', variant: 'info' },
  enviado: { label: 'Enviado', variant: 'success' },
  procesado: { label: 'Procesado', variant: 'success' },
  rechazado: { label: 'Rechazado', variant: 'destructive' },
}

// ── Component ──────────────────────────────────────────────────────────

export function SEPAPage({ onHelp }: { onHelp?: () => void }) {
  const { t } = useTranslation(['sepa', 'common'])

  // ── Shared state ─────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true)
  const [config, setConfig] = useState<SEPAConfig>({ ...emptyConfig })
  const [configLoaded, setConfigLoaded] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [configSuccess, setConfigSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Tab 1: Transferencias pain.001 ───────────────────────────────────
  const [nominas, setNominas] = useState<Nomina[]>([])
  const [selectedNominaIds, setSelectedNominaIds] = useState<Set<number>>(new Set())
  const [fechaEjecucion, setFechaEjecucion] = useState(new Date().toISOString().split('T')[0])
  const [isGenerating001, setIsGenerating001] = useState(false)

  // ── Tab 2: Adeudos pain.008 ──────────────────────────────────────────
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [selectedFacturaIds, setSelectedFacturaIds] = useState<Set<number>>(new Set())
  const [fechaEjecucion008, setFechaEjecucion008] = useState(new Date().toISOString().split('T')[0])
  const [isGenerating008, setIsGenerating008] = useState(false)

  // ── Tab 3: Lotes Generados ───────────────────────────────────────────
  const [lotes, setLotes] = useState<SEPALote[]>([])
  const [isLoadingLotes, setIsLoadingLotes] = useState(false)
  const [deleteLoteDialogOpen, setDeleteLoteDialogOpen] = useState(false)
  const [loteToDelete, setLoteToDelete] = useState<SEPALote | null>(null)

  // ── Load initial data ────────────────────────────────────────────────

  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    try {
      setIsLoading(true)
      await Promise.all([
        loadConfig(),
        loadNominas(),
        loadFacturasAndClientes(),
        loadLotes(),
      ])
    } catch (err) {
      console.error('Error loading SEPA data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadConfig = async () => {
    try {
      const keys = ['sepa.ordenante', 'sepa.iban', 'sepa.bic', 'sepa.nif', 'sepa.idAcreedor']
      const values: Record<string, string> = {}

      for (const key of keys) {
        const res = await window.electronAPI?.config.get(key)
        if (res?.success && res.data != null) {
          values[key] = String(res.data)
        }
      }

      setConfig({
        ordenante: values['sepa.ordenante'] || '',
        iban: values['sepa.iban'] || '',
        bic: values['sepa.bic'] || '',
        nif: values['sepa.nif'] || '',
        idAcreedor: values['sepa.idAcreedor'] || '',
      })

      const hasBasicConfig = !!(values['sepa.ordenante'] && values['sepa.iban'] && values['sepa.bic'] && values['sepa.nif'])
      setConfigLoaded(hasBasicConfig)
    } catch (err) {
      console.error('Error loading SEPA config:', err)
    }
  }

  const loadNominas = async () => {
    try {
      const res = await window.electronAPI?.nominas.getAll({ estado: 'confirmada' })
      if (res?.success) {
        // Filter to only unpaid payrolls
        const confirmed = (res.data || []).filter((n: Nomina) => n.estado === 'confirmada')
        setNominas(confirmed)
      }
    } catch (err) {
      console.error('Error loading nominas:', err)
    }
  }

  const loadFacturasAndClientes = async () => {
    try {
      const [facturasRes, clientesRes] = await Promise.all([
        window.electronAPI?.facturas.getAll(),
        window.electronAPI?.clientes.getAll(),
      ])

      if (clientesRes?.success) {
        setClientes(clientesRes.data || [])
      }

      if (facturasRes?.success) {
        const clientesMap = new Map<number, Cliente>()
        ;(clientesRes?.data || []).forEach((c: Cliente) => clientesMap.set(c.id, c))

        // Filter to emitida/pendiente invoices where client has IBAN
        const sepaFacturas = (facturasRes.data || []).filter((f: Factura) => {
          const isEligible = f.estado === 'emitida' || f.estado === 'pendiente'
          const cliente = clientesMap.get(f.clienteId)
          return isEligible && cliente?.iban
        }).map((f: Factura) => ({
          ...f,
          cliente: clientesMap.get(f.clienteId),
        }))

        setFacturas(sepaFacturas)
      }
    } catch (err) {
      console.error('Error loading facturas:', err)
    }
  }

  const loadLotes = async () => {
    try {
      setIsLoadingLotes(true)
      const res = await window.electronAPI?.sepa.getLotes()
      if (res?.success) {
        setLotes(res.data || [])
      }
    } catch (err) {
      console.error('Error loading SEPA lotes:', err)
    } finally {
      setIsLoadingLotes(false)
    }
  }

  // ── Config handlers ──────────────────────────────────────────────────

  const handleSaveConfig = async () => {
    setConfigSaving(true)
    setConfigSuccess(null)
    setError(null)
    try {
      await window.electronAPI?.config.set('sepa.ordenante', config.ordenante)
      await window.electronAPI?.config.set('sepa.iban', config.iban)
      await window.electronAPI?.config.set('sepa.bic', config.bic)
      await window.electronAPI?.config.set('sepa.nif', config.nif)
      await window.electronAPI?.config.set('sepa.idAcreedor', config.idAcreedor)
      setConfigLoaded(true)
      setConfigSuccess(t('config.saved'))
      setTimeout(() => setConfigSuccess(null), 3000)
    } catch (err) {
      console.error('Error saving SEPA config:', err)
      setError(t('config.saveError'))
    } finally {
      setConfigSaving(false)
    }
  }

  // ── pain.001 handlers ────────────────────────────────────────────────

  const handleToggleNomina = (id: number) => {
    setSelectedNominaIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelectAllNominas = () => {
    if (selectedNominaIds.size === nominas.length) {
      setSelectedNominaIds(new Set())
    } else {
      setSelectedNominaIds(new Set(nominas.map((n) => n.id)))
    }
  }

  const getSelectedNominasTotal = () => {
    return nominas
      .filter((n) => selectedNominaIds.has(n.id))
      .reduce((sum, n) => sum + n.liquidoPercibir, 0)
  }

  const handleGeneratePain001 = async () => {
    if (selectedNominaIds.size === 0) return
    if (!configLoaded) return

    setIsGenerating001(true)
    setError(null)
    try {
      const selectedNominas = nominas.filter((n) => selectedNominaIds.has(n.id))
      const payments = selectedNominas.map((n) => ({
        nombre: n.empleado ? `${n.empleado.nombre} ${n.empleado.apellidos}` : `Empleado ${n.empleadoId}`,
        iban: n.empleado?.iban || n.iban || '',
        importe: n.liquidoPercibir,
        concepto: `Nomina ${String(n.mes).padStart(2, '0')}/${n.anio}`,
      }))

      const xmlContent = buildPain001Xml({
        ordenante: config.ordenante,
        iban: config.iban,
        bic: config.bic,
        nif: config.nif,
        fechaEjecucion,
        pagos: payments,
      })

      const referencia = `PAIN001-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`

      const res = await window.electronAPI?.sepa.createLote({
        referencia,
        tipo: 'pain001',
        fecha: new Date().toISOString(),
        numOperaciones: payments.length,
        importeTotal: getSelectedNominasTotal(),
        estado: 'generado',
        xmlContent,
      })

      if (res?.success) {
        setSelectedNominaIds(new Set())
        await Promise.all([loadNominas(), loadLotes()])
      } else {
        setError(res?.error || t('pain001.generateError'))
      }
    } catch (err) {
      console.error('Error generating pain.001:', err)
      setError(t('pain001.generateError'))
    } finally {
      setIsGenerating001(false)
    }
  }

  // ── pain.008 handlers ────────────────────────────────────────────────

  const handleToggleFactura = (id: number) => {
    setSelectedFacturaIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelectAllFacturas = () => {
    if (selectedFacturaIds.size === facturas.length) {
      setSelectedFacturaIds(new Set())
    } else {
      setSelectedFacturaIds(new Set(facturas.map((f) => f.id)))
    }
  }

  const getSelectedFacturasTotal = () => {
    return facturas
      .filter((f) => selectedFacturaIds.has(f.id))
      .reduce((sum, f) => sum + f.total, 0)
  }

  const handleGeneratePain008 = async () => {
    if (selectedFacturaIds.size === 0) return
    if (!configLoaded || !config.idAcreedor) return

    setIsGenerating008(true)
    setError(null)
    try {
      const selectedFacturas = facturas.filter((f) => selectedFacturaIds.has(f.id))
      const adeudos = selectedFacturas.map((f) => ({
        nombre: f.cliente?.nombre || `Cliente ${f.clienteId}`,
        iban: f.cliente?.iban || '',
        importe: f.total,
        concepto: `Factura ${f.numero}`,
        referenciaMandato: `MAND-${f.clienteId}`,
        fechaMandato: new Date().toISOString().split('T')[0],
      }))

      const xmlContent = buildPain008Xml({
        ordenante: config.ordenante,
        iban: config.iban,
        bic: config.bic,
        nif: config.nif,
        idAcreedor: config.idAcreedor,
        fechaEjecucion: fechaEjecucion008,
        adeudos,
      })

      const referencia = `PAIN008-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`

      const res = await window.electronAPI?.sepa.createLote({
        referencia,
        tipo: 'pain008',
        fecha: new Date().toISOString(),
        numOperaciones: adeudos.length,
        importeTotal: getSelectedFacturasTotal(),
        estado: 'generado',
        xmlContent,
      })

      if (res?.success) {
        setSelectedFacturaIds(new Set())
        await Promise.all([loadFacturasAndClientes(), loadLotes()])
      } else {
        setError(res?.error || t('pain008.generateError'))
      }
    } catch (err) {
      console.error('Error generating pain.008:', err)
      setError(t('pain008.generateError'))
    } finally {
      setIsGenerating008(false)
    }
  }

  // ── Lotes handlers ───────────────────────────────────────────────────

  const handleDownloadXml = async (lote: SEPALote) => {
    try {
      await window.electronAPI?.export.saveFile({
        content: lote.xmlContent,
        defaultFilename: lote.referencia + '.xml',
        filters: [{ name: 'XML', extensions: ['xml'] }],
      })
    } catch (err) {
      console.error('Error downloading XML:', err)
    }
  }

  const handleMarkAsSent = async (lote: SEPALote) => {
    try {
      const res = await window.electronAPI?.sepa.updateEstado(lote.id, 'enviado')
      if (res?.success) {
        await loadLotes()
      }
    } catch (err) {
      console.error('Error updating lote estado:', err)
    }
  }

  const handleDeleteLote = async () => {
    if (!loteToDelete) return
    try {
      const res = await window.electronAPI?.sepa.deleteLote(loteToDelete.id)
      if (res?.success) {
        await loadLotes()
      }
    } catch (err) {
      console.error('Error deleting lote:', err)
    } finally {
      setDeleteLoteDialogOpen(false)
      setLoteToDelete(null)
    }
  }

  // ── Loading state ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  const monthName = (mes: number) => {
    const date = new Date(2024, mes - 1, 1)
    return date.toLocaleDateString('es-ES', { month: 'long' })
  }

  // ── Config Form (reused in Tab 1 and Tab 2) ──────────────────────────

  const renderConfigForm = (showIdAcreedor: boolean) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          {t('config.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!configLoaded && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded text-sm mb-4">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {t('config.missingAlert')}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">{t('config.ordenante')}</Label>
            <Input
              className="h-8 text-xs"
              placeholder={t('config.ordenantePlaceholder')}
              value={config.ordenante}
              onChange={(e) => setConfig({ ...config, ordenante: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{t('config.nif')}</Label>
            <Input
              className="h-8 text-xs"
              placeholder={t('config.nifPlaceholder')}
              value={config.nif}
              onChange={(e) => setConfig({ ...config, nif: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{t('config.iban')}</Label>
            <Input
              className="h-8 text-xs"
              placeholder="ES00 0000 0000 0000 0000 0000"
              value={config.iban}
              onChange={(e) => setConfig({ ...config, iban: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{t('config.bic')}</Label>
            <Input
              className="h-8 text-xs"
              placeholder="XXXXXXXXYYY"
              value={config.bic}
              onChange={(e) => setConfig({ ...config, bic: e.target.value })}
            />
          </div>
          {showIdAcreedor && (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label className="text-xs">{t('config.idAcreedor')}</Label>
              <Input
                className="h-8 text-xs"
                placeholder={t('config.idAcreedorPlaceholder')}
                value={config.idAcreedor}
                onChange={(e) => setConfig({ ...config, idAcreedor: e.target.value })}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Button size="sm" onClick={handleSaveConfig} disabled={configSaving}>
            {configSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t('config.save')}
          </Button>
          {configSuccess && (
            <span className="text-xs text-green-600">{configSuccess}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )

  // ── Render ───────────────────────────────────────────────────────────

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

      {/* Global error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700 text-xs font-medium">
            {t('common:close')}
          </button>
        </div>
      )}

      <Tabs defaultValue="pain001" className="space-y-4">
        <TabsList className="h-8">
          <TabsTrigger value="pain001" className="text-xs h-7 px-3">
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {t('tabs.pain001')}
          </TabsTrigger>
          <TabsTrigger value="pain008" className="text-xs h-7 px-3">
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            {t('tabs.pain008')}
          </TabsTrigger>
          <TabsTrigger value="lotes" className="text-xs h-7 px-3">
            <Building2 className="mr-1.5 h-3.5 w-3.5" />
            {t('tabs.lotes')}
          </TabsTrigger>
        </TabsList>

        {/* ================================================================
            TAB 1: TRANSFERENCIAS pain.001
            ================================================================ */}
        <TabsContent value="pain001">
          <div className="space-y-4">
            {/* Description */}
            <p className="text-sm text-muted-foreground">
              {t('pain001.description')}
            </p>

            {/* Company SEPA Config */}
            {renderConfigForm(false)}

            {/* Fecha de ejecucion */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {t('pain001.executionDate')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-1.5 max-w-xs">
                  <Label className="text-xs">{t('pain001.dateLabel')}</Label>
                  <Input
                    type="date"
                    className="h-8 text-xs"
                    value={fechaEjecucion}
                    onChange={(e) => setFechaEjecucion(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Payroll list */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {t('pain001.payrollsTitle')}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({nominas.length} {t('pain001.available')})
                    </span>
                  </CardTitle>
                  {nominas.length > 0 && (
                    <button
                      onClick={handleSelectAllNominas}
                      className="text-xs text-primary hover:underline"
                    >
                      {selectedNominaIds.size === nominas.length
                        ? t('common:deselectAll')
                        : t('common:selectAll')}
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {nominas.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {t('pain001.noPayrolls')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {nominas.map((nomina) => {
                      const empleadoNombre = nomina.empleado
                        ? `${nomina.empleado.nombre} ${nomina.empleado.apellidos}`
                        : `Empleado ${nomina.empleadoId}`
                      const empleadoIban = nomina.empleado?.iban || nomina.iban || ''

                      return (
                        <div
                          key={nomina.id}
                          className={`flex items-center gap-3 rounded border p-3 transition-colors ${
                            selectedNominaIds.has(nomina.id) ? 'bg-primary/5 border-primary/20' : 'hover:bg-muted/50'
                          }`}
                        >
                          <Checkbox
                            checked={selectedNominaIds.has(nomina.id)}
                            onCheckedChange={() => handleToggleNomina(nomina.id)}
                            disabled={!empleadoIban}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">
                                {empleadoNombre}
                              </span>
                              <Badge variant="secondary" className="text-[10px] px-1.5">
                                {monthName(nomina.mes)} {nomina.anio}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-muted-foreground truncate">
                                {empleadoIban || t('pain001.noIban')}
                              </span>
                            </div>
                          </div>
                          <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
                            {formatCurrency(nomina.liquidoPercibir)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Summary and generate button */}
                {selectedNominaIds.size > 0 && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t">
                    <div className="text-sm">
                      <span className="text-muted-foreground">{t('pain001.selected')}:</span>{' '}
                      <span className="font-semibold">{selectedNominaIds.size}</span>
                      <span className="mx-2 text-muted-foreground">|</span>
                      <span className="text-muted-foreground">{t('pain001.total')}:</span>{' '}
                      <span className="font-semibold">{formatCurrency(getSelectedNominasTotal())}</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleGeneratePain001}
                      disabled={isGenerating001 || !configLoaded}
                    >
                      {isGenerating001 ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {t('pain001.generate')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================
            TAB 2: ADEUDOS pain.008
            ================================================================ */}
        <TabsContent value="pain008">
          <div className="space-y-4">
            {/* Description */}
            <p className="text-sm text-muted-foreground">
              {t('pain008.description')}
            </p>

            {/* Company SEPA Config with idAcreedor */}
            {renderConfigForm(true)}

            {/* Fecha de ejecucion */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {t('pain008.executionDate')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-1.5 max-w-xs">
                  <Label className="text-xs">{t('pain008.dateLabel')}</Label>
                  <Input
                    type="date"
                    className="h-8 text-xs"
                    value={fechaEjecucion008}
                    onChange={(e) => setFechaEjecucion008(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Invoice list */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {t('pain008.invoicesTitle')}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({facturas.length} {t('pain008.available')})
                    </span>
                  </CardTitle>
                  {facturas.length > 0 && (
                    <button
                      onClick={handleSelectAllFacturas}
                      className="text-xs text-primary hover:underline"
                    >
                      {selectedFacturaIds.size === facturas.length
                        ? t('common:deselectAll')
                        : t('common:selectAll')}
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {facturas.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {t('pain008.noInvoices')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {facturas.map((factura) => {
                      const clienteNombre = factura.cliente?.nombre || `Cliente ${factura.clienteId}`
                      const clienteIban = factura.cliente?.iban || ''

                      return (
                        <div
                          key={factura.id}
                          className={`flex items-center gap-3 rounded border p-3 transition-colors ${
                            selectedFacturaIds.has(factura.id) ? 'bg-primary/5 border-primary/20' : 'hover:bg-muted/50'
                          }`}
                        >
                          <Checkbox
                            checked={selectedFacturaIds.has(factura.id)}
                            onCheckedChange={() => handleToggleFactura(factura.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">
                                {clienteNombre}
                              </span>
                              <Badge variant="secondary" className="text-[10px] px-1.5">
                                {factura.numero}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-muted-foreground truncate">
                                {clienteIban}
                              </span>
                            </div>
                          </div>
                          <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
                            {formatCurrency(factura.total)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Summary and generate button */}
                {selectedFacturaIds.size > 0 && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t">
                    <div className="text-sm">
                      <span className="text-muted-foreground">{t('pain008.selected')}:</span>{' '}
                      <span className="font-semibold">{selectedFacturaIds.size}</span>
                      <span className="mx-2 text-muted-foreground">|</span>
                      <span className="text-muted-foreground">{t('pain008.total')}:</span>{' '}
                      <span className="font-semibold">{formatCurrency(getSelectedFacturasTotal())}</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleGeneratePain008}
                      disabled={isGenerating008 || !configLoaded || !config.idAcreedor}
                    >
                      {isGenerating008 ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileDown className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {t('pain008.generate')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================
            TAB 3: LOTES GENERADOS
            ================================================================ */}
        <TabsContent value="lotes">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  {t('lotes.title')}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({lotes.length})
                  </span>
                </CardTitle>
                <Button variant="outline" size="sm" onClick={loadLotes} disabled={isLoadingLotes}>
                  {isLoadingLotes && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {t('common:refresh')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {lotes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {t('lotes.noLotes')}
                </p>
              ) : (
                <div className="rounded border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{t('lotes.referencia')}</TableHead>
                        <TableHead className="text-xs">{t('lotes.tipo')}</TableHead>
                        <TableHead className="text-xs">{t('lotes.fecha')}</TableHead>
                        <TableHead className="text-xs text-right">{t('lotes.numOperaciones')}</TableHead>
                        <TableHead className="text-xs text-right">{t('lotes.importeTotal')}</TableHead>
                        <TableHead className="text-xs">{t('lotes.estado')}</TableHead>
                        <TableHead className="text-xs text-right">{t('lotes.acciones')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lotes.map((lote) => {
                        const estadoCfg = estadoLoteConfig[lote.estado] || { label: lote.estado, variant: 'secondary' as const }
                        return (
                          <TableRow key={lote.id}>
                            <TableCell className="text-xs font-mono">
                              {lote.referencia}
                            </TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline" className="text-[10px]">
                                {lote.tipo === 'pain001' ? 'pain.001' : 'pain.008'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {formatDate(lote.fecha)}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums">
                              {lote.numOperaciones}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-medium">
                              {formatCurrency(lote.importeTotal)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={estadoCfg.variant} className="text-[10px]">
                                {estadoCfg.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleDownloadXml(lote)}
                                  title={t('lotes.downloadXml')}
                                >
                                  <FileDown className="h-3.5 w-3.5" />
                                </Button>
                                {lote.estado === 'generado' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => handleMarkAsSent(lote)}
                                    title={t('lotes.markSent')}
                                  >
                                    <Send className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                  onClick={() => {
                                    setLoteToDelete(lote)
                                    setDeleteLoteDialogOpen(true)
                                  }}
                                  title={t('lotes.delete')}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Delete Lote Confirmation Dialog ─────────────────────────────── */}
      <AlertDialog open={deleteLoteDialogOpen} onOpenChange={setDeleteLoteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('lotes.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('lotes.deleteDescription', { referencia: loteToDelete?.referencia || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLote}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
