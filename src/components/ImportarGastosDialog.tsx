import { useState, useRef } from "react"
import Papa from "papaparse"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
  Upload,
  FileText,
  Check,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  X,
} from "lucide-react"

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

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  categorias: CategoriaGasto[]
  impuestos: Impuesto[]
  onImportComplete: () => void
}

// Aliases para auto-detección de columnas
const FIELD_ALIASES: Record<string, string[]> = {
  descripcion: ["descripcion", "descripción", "concepto", "detalle", "detail", "description", "desc"],
  monto: ["monto", "importe", "total", "cantidad", "amount", "precio", "price", "coste", "cost", "valor"],
  fecha: ["fecha", "date", "f.", "fch", "dia", "día"],
  proveedor: ["proveedor", "supplier", "empresa", "vendor", "provider", "emisor"],
  numeroFactura: ["factura", "nº factura", "num factura", "numero factura", "número factura", "invoice", "ref", "referencia"],
  notas: ["notas", "nota", "observaciones", "comentarios", "notes", "comments"],
  categoria: ["categoria", "categoría", "category", "tipo", "type", "grupo"],
}

const GASTO_FIELDS = [
  { key: "descripcion", label: "Descripción *", required: true },
  { key: "monto", label: "Monto *", required: true },
  { key: "fecha", label: "Fecha", required: false },
  { key: "proveedor", label: "Proveedor", required: false },
  { key: "numeroFactura", label: "Nº Factura", required: false },
  { key: "notas", label: "Notas", required: false },
  { key: "categoria", label: "Categoría", required: false },
]

function parseNumeroES(str: string): number | null {
  if (!str || !str.trim()) return null
  let cleaned = str.trim().replace(/[€$\s]/g, "")
  // Detect format: "1.234,56" (ES) vs "1,234.56" (EN)
  const lastComma = cleaned.lastIndexOf(",")
  const lastDot = cleaned.lastIndexOf(".")
  if (lastComma > lastDot) {
    // European: 1.234,56 → remove dots, replace comma with dot
    cleaned = cleaned.replace(/\./g, "").replace(",", ".")
  } else if (lastDot > lastComma && lastComma !== -1) {
    // English: 1,234.56 → remove commas
    cleaned = cleaned.replace(/,/g, "")
  } else if (lastComma !== -1 && lastDot === -1) {
    // Only comma: could be "123,45" → treat as decimal
    cleaned = cleaned.replace(",", ".")
  }
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : Math.round(num * 100) / 100
}

function parseFechaFlexible(str: string): Date | null {
  if (!str || !str.trim()) return null
  const trimmed = str.trim()

  // Try ISO: yyyy-mm-dd
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const d = new Date(trimmed + "T00:00:00")
    if (!isNaN(d.getTime())) return d
  }

  // Try dd/mm/yyyy or dd-mm-yyyy
  const match = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (match) {
    const day = parseInt(match[1])
    const month = parseInt(match[2])
    let year = parseInt(match[3])
    if (year < 100) year += 2000
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day)
      if (!isNaN(d.getTime())) return d
    }
  }

  // Fallback: try native parsing
  const d = new Date(trimmed)
  if (!isNaN(d.getTime())) return d

  return null
}

function fuzzyMatchCategoria(nombre: string, categorias: CategoriaGasto[]): number | null {
  if (!nombre || !nombre.trim()) return null
  const lower = nombre.trim().toLowerCase()
  const match = categorias.find(c => c.nombre.toLowerCase() === lower)
  if (match) return match.id
  // Partial match
  const partial = categorias.find(c =>
    c.nombre.toLowerCase().includes(lower) || lower.includes(c.nombre.toLowerCase())
  )
  return partial ? partial.id : null
}

function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const field of GASTO_FIELDS) {
    const aliases = FIELD_ALIASES[field.key] || []
    const match = headers.find(h =>
      aliases.some(a => h.toLowerCase().trim().includes(a))
    )
    if (match) {
      mapping[field.key] = match
    }
  }
  return mapping
}

interface ValidatedRow {
  raw: Record<string, string>
  mapped: {
    descripcion: string
    monto: number | null
    fecha: Date | null
    proveedor: string
    numeroFactura: string
    notas: string
    categoriaId: number | null
  }
  valid: boolean
  errors: string[]
}

export function ImportarGastosDialog({ open, onOpenChange, categorias, impuestos, onImportComplete }: Props) {
  const [step, setStep] = useState(1)
  const [csvData, setCsvData] = useState<Record<string, string>[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [fileName, setFileName] = useState("")
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [defaultCategoriaId, setDefaultCategoriaId] = useState<string>("")
  const [defaultImpuestoId, setDefaultImpuestoId] = useState<string>("")
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResults, setImportResults] = useState<{ success: number; errors: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setStep(1)
    setCsvData([])
    setCsvHeaders([])
    setFileName("")
    setMapping({})
    setDefaultCategoriaId("")
    setDefaultImpuestoId("")
    setValidatedRows([])
    setImporting(false)
    setImportProgress(0)
    setImportResults(null)
  }

  const handleClose = () => {
    if (importResults) {
      onImportComplete()
    }
    reset()
    onOpenChange(false)
  }

  // Step 1: File selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete: (results) => {
        const data = results.data as Record<string, string>[]
        const headers = results.meta.fields || []
        setCsvData(data)
        setCsvHeaders(headers)

        // Auto-detect column mapping
        const autoMapping = autoDetectMapping(headers)
        setMapping(autoMapping)

        // Set default impuesto (IVA por defecto)
        const defaultImp = impuestos.find(i => i.porDefecto && i.tipo === "IVA")
        if (defaultImp) {
          setDefaultImpuestoId(String(defaultImp.id))
        }
      },
      error: (err) => {
        console.error("Error parsing CSV:", err)
      },
    })
  }

  // Step 2 → 3: Validate mapped data
  const validateData = () => {
    const rows: ValidatedRow[] = csvData.map(row => {
      const errors: string[] = []

      const descripcion = mapping.descripcion ? (row[mapping.descripcion] || "").trim() : ""
      if (!descripcion) errors.push("Sin descripción")

      const montoStr = mapping.monto ? (row[mapping.monto] || "") : ""
      const monto = parseNumeroES(montoStr)
      if (monto === null || monto <= 0) errors.push("Monto inválido")

      const fechaStr = mapping.fecha ? (row[mapping.fecha] || "") : ""
      const fecha = fechaStr ? parseFechaFlexible(fechaStr) : new Date()
      if (fechaStr && !parseFechaFlexible(fechaStr)) errors.push("Fecha inválida")

      const proveedor = mapping.proveedor ? (row[mapping.proveedor] || "").trim() : ""
      const numeroFactura = mapping.numeroFactura ? (row[mapping.numeroFactura] || "").trim() : ""
      const notas = mapping.notas ? (row[mapping.notas] || "").trim() : ""

      const catStr = mapping.categoria ? (row[mapping.categoria] || "").trim() : ""
      let categoriaId = catStr ? fuzzyMatchCategoria(catStr, categorias) : null
      if (!categoriaId && defaultCategoriaId) {
        categoriaId = parseInt(defaultCategoriaId)
      }

      return {
        raw: row,
        mapped: { descripcion, monto, fecha, proveedor, numeroFactura, notas, categoriaId },
        valid: errors.length === 0,
        errors,
      }
    })
    setValidatedRows(rows)
  }

  // Step 4: Import
  const handleImport = async () => {
    const validRows = validatedRows.filter(r => r.valid)
    if (validRows.length === 0) return

    setImporting(true)
    setImportProgress(0)
    let success = 0
    let errors = 0

    const impuestoId = defaultImpuestoId ? parseInt(defaultImpuestoId) : null

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      try {
        const gastoData = {
          descripcion: row.mapped.descripcion,
          monto: row.mapped.monto!,
          impuestoIncluido: true,
          impuestoId: impuestoId,
          fecha: row.mapped.fecha || new Date(),
          proveedor: row.mapped.proveedor || undefined,
          numeroFactura: row.mapped.numeroFactura || undefined,
          notas: row.mapped.notas || undefined,
          categoriaId: row.mapped.categoriaId || undefined,
        }
        const response = await window.electronAPI?.gastos.create(gastoData)
        if (response?.success) {
          success++
        } else {
          errors++
        }
      } catch {
        errors++
      }
      setImportProgress(i + 1)
    }

    setImportResults({ success, errors })
    setImporting(false)
  }

  const validCount = validatedRows.filter(r => r.valid).length

  const canGoNext = (): boolean => {
    switch (step) {
      case 1: return csvData.length > 0
      case 2: return !!mapping.descripcion && !!mapping.monto
      case 3: return validCount > 0
      default: return false
    }
  }

  const handleNext = () => {
    if (step === 2) {
      validateData()
    }
    if (step === 3) {
      handleImport()
    }
    setStep(s => s + 1)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importing) { if (!v) handleClose(); else onOpenChange(v) } }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Gastos desde CSV
          </DialogTitle>
          {/* Step indicators */}
          <div className="flex items-center gap-2 pt-2">
            {[
              { n: 1, label: "Archivo" },
              { n: 2, label: "Mapeo" },
              { n: 3, label: "Validación" },
              { n: 4, label: "Importar" },
            ].map((s, idx) => (
              <div key={s.n} className="flex items-center gap-1">
                {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                  step === s.n ? "bg-primary text-primary-foreground" :
                  step > s.n ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {step > s.n ? <Check className="h-3 w-3" /> : null}
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0 py-2">
          {/* STEP 1: File Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {!fileName ? (
                  <div className="space-y-3">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Selecciona un archivo CSV con los gastos a importar
                    </p>
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-4 w-4 mr-2" />
                      Seleccionar archivo
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-5 w-5 text-green-600" />
                      <span className="text-sm font-medium">{fileName}</span>
                      <Badge variant="secondary">{csvData.length} filas</Badge>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setCsvData([])
                        setCsvHeaders([])
                        setFileName("")
                        setMapping({})
                        if (fileInputRef.current) fileInputRef.current.value = ""
                      }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {csvData.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Vista previa (primeras 5 filas)</Label>
                  <div className="border rounded overflow-auto max-h-48">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {csvHeaders.map(h => (
                            <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvData.slice(0, 5).map((row, i) => (
                          <TableRow key={i}>
                            {csvHeaders.map(h => (
                              <TableCell key={h} className="text-xs py-1 whitespace-nowrap max-w-[200px] truncate">
                                {row[h]}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Column Mapping */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Asigna cada columna del CSV al campo correspondiente de gasto.
                Los campos marcados con * son obligatorios.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {GASTO_FIELDS.map(field => (
                  <div key={field.key} className="space-y-1">
                    <Label className="text-xs">{field.label}</Label>
                    <Select
                      value={mapping[field.key] || "__none__"}
                      onValueChange={(v) => setMapping(prev => {
                        const next = { ...prev }
                        if (v === "__none__") {
                          delete next[field.key]
                        } else {
                          next[field.key] = v
                        }
                        return next
                      })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        {mapping[field.key]
                          ? <span className="truncate">{mapping[field.key]}</span>
                          : <SelectValue placeholder="No importar" />}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No importar</SelectItem>
                        {csvHeaders.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="border-t pt-3 space-y-3">
                <Label className="text-xs font-medium">Valores por defecto (se aplican a todos los registros)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Categoría por defecto</Label>
                    <Select value={defaultCategoriaId || "__none__"} onValueChange={(v) => setDefaultCategoriaId(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="h-8 text-xs">
                        {defaultCategoriaId
                          ? <span className="truncate">{categorias.find(c => c.id === Number(defaultCategoriaId))?.nombre}</span>
                          : <SelectValue placeholder="Sin categoría" />}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin categoría</SelectItem>
                        {categorias.filter(c => c.activo).map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Impuesto por defecto</Label>
                    <Select value={defaultImpuestoId || "__none__"} onValueChange={(v) => setDefaultImpuestoId(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="h-8 text-xs">
                        {defaultImpuestoId
                          ? <span className="truncate">{impuestos.find(i => i.id === Number(defaultImpuestoId))?.nombre} ({impuestos.find(i => i.id === Number(defaultImpuestoId))?.porcentaje}%)</span>
                          : <SelectValue placeholder="Sin impuesto" />}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin impuesto</SelectItem>
                        {impuestos.filter(i => i.activo && i.tipo === "IVA").map(i => (
                          <SelectItem key={i.id} value={String(i.id)}>{i.nombre} ({i.porcentaje}%)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Preview & Validation */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant={validCount === validatedRows.length ? "default" : "secondary"}>
                  {validCount} de {validatedRows.length} registros válidos
                </Badge>
                {validatedRows.length - validCount > 0 && (
                  <Badge variant="destructive">
                    {validatedRows.length - validCount} con errores
                  </Badge>
                )}
              </div>

              <div className="border rounded overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-10">#</TableHead>
                      <TableHead className="text-xs">Estado</TableHead>
                      <TableHead className="text-xs">Descripción</TableHead>
                      <TableHead className="text-xs text-right">Monto</TableHead>
                      <TableHead className="text-xs">Fecha</TableHead>
                      <TableHead className="text-xs">Proveedor</TableHead>
                      <TableHead className="text-xs">Categoría</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validatedRows.map((row, i) => (
                      <TableRow key={i} className={!row.valid ? "bg-red-50 dark:bg-red-950/20" : ""}>
                        <TableCell className="text-xs py-1">{i + 1}</TableCell>
                        <TableCell className="text-xs py-1">
                          {row.valid ? (
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <div className="flex items-center gap-1">
                              <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                              <span className="text-red-600 text-[10px]">{row.errors.join(", ")}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-1 max-w-[200px] truncate">
                          {row.mapped.descripcion || "—"}
                        </TableCell>
                        <TableCell className="text-xs py-1 text-right font-mono">
                          {row.mapped.monto !== null
                            ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(row.mapped.monto)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs py-1">
                          {row.mapped.fecha
                            ? row.mapped.fecha.toLocaleDateString("es-ES")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs py-1 max-w-[120px] truncate">
                          {row.mapped.proveedor || "—"}
                        </TableCell>
                        <TableCell className="text-xs py-1">
                          {row.mapped.categoriaId
                            ? categorias.find(c => c.id === row.mapped.categoriaId)?.nombre || "—"
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* STEP 4: Import Progress */}
          {step === 4 && (
            <div className="space-y-6 py-8">
              {importing ? (
                <div className="space-y-4 text-center">
                  <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
                  <p className="text-sm font-medium">
                    Importando {importProgress} de {validCount}...
                  </p>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${validCount > 0 ? (importProgress / validCount) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ) : importResults ? (
                <div className="space-y-4 text-center">
                  {importResults.errors === 0 ? (
                    <Check className="h-12 w-12 mx-auto text-green-600" />
                  ) : (
                    <AlertCircle className="h-12 w-12 mx-auto text-orange-500" />
                  )}
                  <div>
                    <p className="text-lg font-semibold">Importación completada</p>
                    <div className="flex items-center justify-center gap-4 mt-2">
                      <Badge variant="default" className="bg-green-600">
                        {importResults.success} importados
                      </Badge>
                      {importResults.errors > 0 && (
                        <Badge variant="destructive">
                          {importResults.errors} errores
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {step > 1 && step < 4 && !importing && (
              <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {!importing && (
              <Button variant="ghost" size="sm" onClick={handleClose}>
                {importResults ? "Cerrar" : "Cancelar"}
              </Button>
            )}
            {step < 4 && (
              <Button size="sm" onClick={handleNext} disabled={!canGoNext()}>
                {step === 3 ? (
                  <>
                    Importar {validCount} gastos
                    <Upload className="h-4 w-4 ml-1" />
                  </>
                ) : (
                  <>
                    Siguiente
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
