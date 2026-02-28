import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  FolderOpen,
  Check,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Database,
  Users,
  Package,
  FileText,
  Receipt,
  Tags,
} from "lucide-react"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}

interface ScanResult {
  [key: string]: { found: boolean; count: number }
}

interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

type Step = 1 | 2 | 3

const ENTITY_ICONS: Record<string, any> = {
  categorias: Tags,
  clientes: Users,
  productos: Package,
  facturas: FileText,
  gastos: Receipt,
}

const ENTITY_COLORS: Record<string, string> = {
  categorias: "bg-purple-50 text-purple-600",
  clientes: "bg-blue-50 text-blue-600",
  productos: "bg-green-50 text-green-600",
  facturas: "bg-amber-50 text-amber-600",
  gastos: "bg-red-50 text-red-600",
}

export default function ImportarClasGesDialog({ open, onOpenChange, onImportComplete }: Props) {
  const { t } = useTranslation(['configuracion', 'common'])

  const [step, setStep] = useState<Step>(1)
  const [folderPath, setFolderPath] = useState("")
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanError, setScanError] = useState("")

  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set())
  const [previewEntity, setPreviewEntity] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<any[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<Record<string, { current: number; total: number; status: string }>>({})
  const [importResults, setImportResults] = useState<Record<string, ImportResult> | null>(null)
  const [importError, setImportError] = useState("")

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setStep(1)
      setFolderPath("")
      setScanning(false)
      setScanResult(null)
      setScanError("")
      setSelectedEntities(new Set())
      setPreviewEntity(null)
      setPreviewData([])
      setImporting(false)
      setProgress({})
      setImportResults(null)
      setImportError("")
    }
  }, [open])

  // Listen to progress events
  useEffect(() => {
    if (!open) return
    const cleanup = window.electronAPI?.clasges.onProgress((data) => {
      setProgress(prev => ({
        ...prev,
        [data.entity]: { current: data.current, total: data.total, status: data.status }
      }))
    })
    return () => { cleanup?.() }
  }, [open])

  const handleSelectFolder = useCallback(async () => {
    const result = await window.electronAPI?.clasges.selectFolder()
    if (result?.success && result.data) {
      setFolderPath(result.data.path)
      setScanError("")
      setScanResult(null)

      // Auto-scan
      setScanning(true)
      const scanRes = await window.electronAPI?.clasges.scan(result.data.path)
      setScanning(false)
      if (scanRes?.success && scanRes.data) {
        setScanResult(scanRes.data)
        // Auto-select entities that have data
        const available = new Set<string>()
        for (const [key, info] of Object.entries(scanRes.data)) {
          if (key !== 'lineasFactura' && info.found && info.count > 0) {
            available.add(key)
          }
        }
        setSelectedEntities(available)
      } else {
        setScanError(scanRes?.error || 'Error scanning folder')
      }
    }
  }, [])

  const handlePreview = useCallback(async (entity: string) => {
    if (previewEntity === entity) {
      setPreviewEntity(null)
      return
    }
    setPreviewEntity(entity)
    setPreviewLoading(true)
    const result = await window.electronAPI?.clasges.preview(folderPath, entity)
    setPreviewLoading(false)
    if (result?.success && result.data) {
      setPreviewData(result.data)
    } else {
      setPreviewData([])
    }
  }, [folderPath, previewEntity])

  const toggleEntity = useCallback((entity: string) => {
    setSelectedEntities(prev => {
      const next = new Set(prev)
      if (next.has(entity)) next.delete(entity)
      else next.add(entity)
      return next
    })
  }, [])

  const handleImport = useCallback(async () => {
    if (selectedEntities.size === 0) return
    setStep(3)
    setImporting(true)
    setImportError("")
    setImportResults(null)
    setProgress({})

    // Ensure categorias are imported first if gastos are selected
    const entities = Array.from(selectedEntities)
    if (entities.includes('gastos') && !entities.includes('categorias') && scanResult?.categorias?.found) {
      entities.unshift('categorias')
    }

    const result = await window.electronAPI?.clasges.import(folderPath, entities)
    setImporting(false)
    if (result?.success && result.data) {
      setImportResults(result.data)
      onImportComplete()
    } else {
      setImportError(result?.error || 'Import failed')
    }
  }, [selectedEntities, folderPath, scanResult, onImportComplete])

  const td = (key: string) => t(`data.importClassicGesDialog.${key}`)

  const importableEntities = ['categorias', 'clientes', 'productos', 'facturas', 'gastos']

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            {td('title')}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                step === s ? 'bg-blue-600 text-white' :
                step > s ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
              }`}>
                {step > s ? <Check className="h-3.5 w-3.5" /> : s}
              </div>
              <span className="text-xs text-muted-foreground">
                {s === 1 && td('step1Title')}
                {s === 2 && td('step2Title')}
                {s === 3 && td('step3Title')}
              </span>
              {s < 3 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Step 1: Select folder */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {td('selectFolderDesc')}
            </p>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectFolder} disabled={scanning}>
                {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <FolderOpen className="h-3.5 w-3.5 mr-1.5" />}
                {td('browse')}
              </Button>
              {folderPath && (
                <span className="text-xs font-mono text-muted-foreground truncate max-w-md">{folderPath}</span>
              )}
            </div>

            {scanning && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {td('scanning')}
              </div>
            )}

            {scanError && (
              <div className="flex items-center gap-2 bg-red-50 text-red-700 p-2 rounded text-xs">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {scanError}
              </div>
            )}

            {scanResult && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{td('filesDetected')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(scanResult).map(([key, info]) => {
                    const Icon = ENTITY_ICONS[key] || Database
                    const colors = ENTITY_COLORS[key] || "bg-muted text-muted-foreground"
                    const labelKey = key === 'lineasFactura' ? 'facturas' : key
                    return (
                      <div key={key} className={`flex items-center gap-2 p-2 rounded border ${info.found ? 'border-green-200' : 'border-dashed border-muted'}`}>
                        <div className={`rounded-full p-1.5 ${info.found ? colors : 'bg-muted text-muted-foreground'}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{td(labelKey)}{key === 'lineasFactura' && ' (lineas)'}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {info.found ? `${info.count} ${td('records')}` : td('notFound')}
                          </p>
                        </div>
                        {info.found && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {info.count}
                          </Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Select data to import */}
        {step === 2 && scanResult && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{td('selectEntities')}</p>

            <div className="space-y-2">
              {importableEntities.map((entity) => {
                const info = scanResult[entity]
                if (!info?.found) return null
                const Icon = ENTITY_ICONS[entity] || Database
                const colors = ENTITY_COLORS[entity] || "bg-muted text-muted-foreground"
                const isSelected = selectedEntities.has(entity)
                const isPreview = previewEntity === entity

                return (
                  <div key={entity} className="space-y-1">
                    <div
                      className={`flex items-center gap-3 p-2.5 rounded border cursor-pointer transition-colors ${
                        isSelected ? 'border-blue-300 bg-blue-50/50' : 'border-muted hover:bg-muted/30'
                      }`}
                      onClick={() => toggleEntity(entity)}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                        isSelected ? 'bg-blue-600 border-blue-600' : 'border-muted-foreground/30'
                      }`}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className={`rounded-full p-1.5 ${colors}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{td(entity)}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {info.count} {td('records')}
                          {entity === 'facturas' && scanResult.lineasFactura?.found &&
                            ` + ${scanResult.lineasFactura.count} lineas`
                          }
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={(e) => { e.stopPropagation(); handlePreview(entity) }}
                      >
                        {td('preview')}
                      </Button>
                    </div>

                    {/* Preview table */}
                    {isPreview && (
                      <div className="ml-8 border rounded p-2 bg-muted/20 max-h-48 overflow-auto">
                        {previewLoading ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {td('loadingPreview')}
                          </div>
                        ) : previewData.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {Object.keys(previewData[0]).slice(0, 6).map((col) => (
                                  <TableHead key={col} className="text-[10px] h-6 px-2 whitespace-nowrap">{col}</TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {previewData.map((row, idx) => (
                                <TableRow key={idx}>
                                  {Object.values(row).slice(0, 6).map((val: any, ci) => (
                                    <TableCell key={ci} className="text-[10px] py-1 px-2 max-w-[150px] truncate">
                                      {val instanceof Date ? val.toLocaleDateString() :
                                       val != null ? String(val) : ''}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <p className="text-xs text-muted-foreground p-2">{td('notFound')}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Step 3: Import progress/results */}
        {step === 3 && (
          <div className="space-y-4">
            {importing && (
              <div className="space-y-3">
                {Array.from(selectedEntities).map((entity) => {
                  const p = progress[entity]
                  const Icon = ENTITY_ICONS[entity] || Database
                  const percent = p ? Math.round((p.current / Math.max(p.total, 1)) * 100) : 0
                  const isDone = p?.status === 'done'

                  return (
                    <div key={entity} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium flex-1">{td(entity)}</span>
                        {isDone ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : p ? (
                          <span className="text-xs text-muted-foreground">{p.current}/{p.total}</span>
                        ) : (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${isDone ? 'bg-green-500' : 'bg-blue-600'}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {importResults && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 bg-green-50 text-green-700 p-2.5 rounded text-sm">
                  <Check className="h-4 w-4 flex-shrink-0" />
                  {td('importComplete')}
                </div>

                {Object.entries(importResults).map(([entity, result]) => {
                  const Icon = ENTITY_ICONS[entity] || Database
                  return (
                    <div key={entity} className="flex items-center gap-3 p-2.5 border rounded">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium flex-1">{td(entity)}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700">
                          {result.imported} {td('imported')}
                        </Badge>
                        {result.skipped > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700">
                            {result.skipped} {td('skipped')}
                          </Badge>
                        )}
                        {result.errors.length > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700">
                            {result.errors.length} {td('errors')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {importError && (
              <div className="flex items-center gap-2 bg-red-50 text-red-700 p-2.5 rounded text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {td('importError')}: {importError}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 1 && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setStep(2)}
              disabled={!scanResult || Object.values(scanResult).every(f => !f.found)}
            >
              {td('next')}
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}

          {step === 2 && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                {td('back')}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleImport}
                disabled={selectedEntities.size === 0}
              >
                {td('startImport')}
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </>
          )}

          {step === 3 && !importing && (
            <Button variant="default" size="sm" onClick={() => onOpenChange(false)}>
              {td('close')}
            </Button>
          )}

          {step === 3 && importing && (
            <Button variant="outline" size="sm" disabled>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              {td('importing')}...
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
