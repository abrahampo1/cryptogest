import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  Building2,
  Save,
  Database,
  FileText,
  Shield,
  HardDrive,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ScanFace,
  Fingerprint,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
  Plus,
  Pencil,
  Percent,
  Star,
  Download,
  Archive,
  FolderOutput,
  RotateCcw,
  ExternalLink,
  Upload,
  X,
  Image,
  Palette,
  HelpCircle,
} from "lucide-react"
import { generateInvoicePdf, TemplateConfig } from "@/lib/generateInvoicePdf"
import { PREVIEW_FACTURA } from "@/lib/invoicePreviewData"

interface EmpresaData {
  nombre: string
  nif: string
  direccion: string
  codigoPostal: string
  ciudad: string
  provincia: string
  telefono: string
  email: string
  web: string
}

interface FacturacionData {
  serieFactura: string
  proximoNumero: string
  ivaPorDefecto: string
  diasVencimiento: string
  piePagina: string
}

const defaultImpuestos = [
  { nombre: "IVA General", porcentaje: 21, tipo: "IVA", porDefecto: true },
  { nombre: "IVA Reducido", porcentaje: 10, tipo: "IVA", porDefecto: false },
  { nombre: "IVA Super Reducido", porcentaje: 4, tipo: "IVA", porDefecto: false },
  { nombre: "Exento de IVA", porcentaje: 0, tipo: "IVA", porDefecto: false },
  { nombre: "IRPF General", porcentaje: 15, tipo: "IRPF", porDefecto: false },
  { nombre: "IRPF Reducido", porcentaje: 7, tipo: "IRPF", porDefecto: false },
]

const emptyImpuestoForm = {
  nombre: "",
  porcentaje: "",
  tipo: "IVA",
  activo: true,
  porDefecto: false,
}

export function ConfiguracionPage({ onHelp }: { onHelp?: () => void }) {
  const [empresaData, setEmpresaData] = useState<EmpresaData>({
    nombre: "",
    nif: "",
    direccion: "",
    codigoPostal: "",
    ciudad: "",
    provincia: "",
    telefono: "",
    email: "",
    web: "",
  })

  const [facturacionData, setFacturacionData] = useState<FacturacionData>({
    serieFactura: "F",
    proximoNumero: "001",
    ivaPorDefecto: "21",
    diasVencimiento: "30",
    piePagina: "",
  })

  const [dbStatus, setDbStatus] = useState<{
    connected: boolean
    message: string
  } | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  // Security state
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [passkeyEnabled, setPasskeyEnabled] = useState(false)
  const [showPasskeyDialog, setShowPasskeyDialog] = useState(false)
  const [passkeyPassword, setPasskeyPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const [passkeySuccess, setPasskeySuccess] = useState<string | null>(null)

  // Impuestos state
  const [impuestos, setImpuestos] = useState<Impuesto[]>([])
  const [impuestosLoading, setImpuestosLoading] = useState(true)
  const [impuestoDialogOpen, setImpuestoDialogOpen] = useState(false)
  const [impuestoDeleteDialog, setImpuestoDeleteDialog] = useState(false)
  const [editingImpuesto, setEditingImpuesto] = useState<Impuesto | null>(null)
  const [impuestoToDelete, setImpuestoToDelete] = useState<Impuesto | null>(null)
  const [impuestoForm, setImpuestoForm] = useState(emptyImpuestoForm)
  const [impuestoSaving, setImpuestoSaving] = useState(false)
  const [impuestoError, setImpuestoError] = useState<string | null>(null)

  // Backup state
  const [isExporting, setIsExporting] = useState(false)
  const [exportSuccess, setExportSuccess] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [dataPathInfo, setDataPathInfo] = useState<{
    dataPath: string
    dbPath: string
    attachmentsPath: string
    dbSize: number
    attachmentsSize: number
    attachmentsCount: number
    customDataPath: string | null
    defaultDataPath: string
    isUsingCustomPath: boolean
  } | null>(null)

  // Migration state
  const [isMigrating, setIsMigrating] = useState(false)
  const [migrateSuccess, setMigrateSuccess] = useState<string | null>(null)
  const [migrateError, setMigrateError] = useState<string | null>(null)
  const [isResettingPath, setIsResettingPath] = useState(false)

  const [empresaSaving, setEmpresaSaving] = useState(false)
  const [empresaSuccess, setEmpresaSuccess] = useState<string | null>(null)
  const [facturacionSaving, setFacturacionSaving] = useState(false)
  const [facturacionSuccess, setFacturacionSuccess] = useState<string | null>(null)

  // Template state
  const [templateConfig, setTemplateConfig] = useState<TemplateConfig>({
    plantilla: 'clasica',
    colorAccento: '#374151',
    mostrarTelefono: true,
    mostrarEmail: true,
    mostrarWeb: true,
    mostrarNotas: true,
    mostrarFormaPago: true,
  })
  const [logoBase64, setLogoBase64] = useState<string | undefined>(undefined)
  const [logoLoading, setLogoLoading] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateSuccess, setTemplateSuccess] = useState<string | null>(null)
  const [previewPdf, setPreviewPdf] = useState<string>('')
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    checkSecurityStatus()
    loadImpuestos()
    loadDataPathInfo()
    loadConfig()
    loadLogo()
  }, [])

  const loadConfig = async () => {
    try {
      const result = await window.electronAPI?.config.getAll()
      if (result?.success && result.data) {
        const cfg = result.data
        setEmpresaData({
          nombre: cfg['empresa.nombre'] || '',
          nif: cfg['empresa.nif'] || '',
          direccion: cfg['empresa.direccion'] || '',
          codigoPostal: cfg['empresa.codigoPostal'] || '',
          ciudad: cfg['empresa.ciudad'] || '',
          provincia: cfg['empresa.provincia'] || '',
          telefono: cfg['empresa.telefono'] || '',
          email: cfg['empresa.email'] || '',
          web: cfg['empresa.web'] || '',
        })
        setFacturacionData({
          serieFactura: cfg['facturacion.serieFactura'] || 'F',
          proximoNumero: cfg['facturacion.proximoNumero'] || '001',
          ivaPorDefecto: cfg['facturacion.ivaPorDefecto'] || '21',
          diasVencimiento: cfg['facturacion.diasVencimiento'] || '30',
          piePagina: cfg['facturacion.piePagina'] || '',
        })
        setTemplateConfig(prev => ({
          ...prev,
          plantilla: (cfg['facturacion.plantilla'] as TemplateConfig['plantilla']) || 'clasica',
          colorAccento: cfg['facturacion.colorAccento'] || '#374151',
          mostrarTelefono: cfg['facturacion.mostrarTelefono'] !== 'false',
          mostrarEmail: cfg['facturacion.mostrarEmail'] !== 'false',
          mostrarWeb: cfg['facturacion.mostrarWeb'] !== 'false',
          mostrarNotas: cfg['facturacion.mostrarNotas'] !== 'false',
          mostrarFormaPago: cfg['facturacion.mostrarFormaPago'] !== 'false',
        }))
      }
    } catch (error) {
      console.error('Error loading config:', error)
    }
  }

  const checkSecurityStatus = async () => {
    if (!window.electronAPI?.auth) return

    try {
      const result = await window.electronAPI.auth.checkStatus()
      if (result.success && result.data) {
        setPasskeySupported(result.data.passkeySupported || false)
        setPasskeyEnabled(result.data.passkeyEnabled || false)
      }
    } catch (error) {
      console.error('Error checking security status:', error)
    }
  }

  const loadImpuestos = async () => {
    try {
      setImpuestosLoading(true)
      const result = await window.electronAPI?.impuestos.getAll()
      if (result?.success && result.data) {
        if (result.data.length === 0) {
          await createDefaultImpuestos()
        } else {
          setImpuestos(result.data)
        }
      }
    } catch (error) {
      console.error('Error loading impuestos:', error)
    } finally {
      setImpuestosLoading(false)
    }
  }

  const createDefaultImpuestos = async () => {
    try {
      for (const imp of defaultImpuestos) {
        await window.electronAPI?.impuestos.create(imp)
      }
      const result = await window.electronAPI?.impuestos.getAll()
      if (result?.success) {
        setImpuestos(result.data || [])
      }
    } catch (error) {
      console.error('Error creating default impuestos:', error)
    }
  }

  const handleOpenImpuestoDialog = (impuesto?: Impuesto) => {
    setImpuestoError(null)
    if (impuesto) {
      setEditingImpuesto(impuesto)
      setImpuestoForm({
        nombre: impuesto.nombre,
        porcentaje: String(impuesto.porcentaje),
        tipo: impuesto.tipo,
        activo: impuesto.activo,
        porDefecto: impuesto.porDefecto,
      })
    } else {
      setEditingImpuesto(null)
      setImpuestoForm(emptyImpuestoForm)
    }
    setImpuestoDialogOpen(true)
  }

  const handleSaveImpuesto = async () => {
    if (!impuestoForm.nombre.trim() || !impuestoForm.porcentaje) return

    setImpuestoSaving(true)
    setImpuestoError(null)
    try {
      const data = {
        nombre: impuestoForm.nombre,
        porcentaje: parseFloat(impuestoForm.porcentaje),
        tipo: impuestoForm.tipo,
        activo: impuestoForm.activo,
        porDefecto: impuestoForm.porDefecto,
      }

      if (editingImpuesto) {
        const result = await window.electronAPI?.impuestos.update(editingImpuesto.id, data)
        if (result?.success) {
          await loadImpuestos()
          setImpuestoDialogOpen(false)
        } else {
          setImpuestoError(result?.error || 'Error al actualizar el impuesto')
        }
      } else {
        const result = await window.electronAPI?.impuestos.create(data)
        if (result?.success) {
          await loadImpuestos()
          setImpuestoDialogOpen(false)
        } else {
          setImpuestoError(result?.error || 'Error al crear el impuesto')
        }
      }
    } catch (err) {
      console.error('Error saving impuesto:', err)
      setImpuestoError(String(err))
    } finally {
      setImpuestoSaving(false)
    }
  }

  const handleDeleteImpuesto = async () => {
    if (!impuestoToDelete) return

    try {
      const result = await window.electronAPI?.impuestos.delete(impuestoToDelete.id)
      if (result?.success) {
        await loadImpuestos()
      }
    } catch (error) {
      console.error('Error deleting impuesto:', error)
    } finally {
      setImpuestoDeleteDialog(false)
      setImpuestoToDelete(null)
    }
  }

  const handleSetDefaultImpuesto = async (impuesto: Impuesto) => {
    try {
      const result = await window.electronAPI?.impuestos.setDefault(impuesto.id)
      if (result?.success) {
        await loadImpuestos()
      }
    } catch (error) {
      console.error('Error setting default impuesto:', error)
    }
  }

  const confirmDeleteImpuesto = (impuesto: Impuesto) => {
    setImpuestoToDelete(impuesto)
    setImpuestoDeleteDialog(true)
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.testDB()
        setDbStatus({
          connected: result.success,
          message: result.message,
        })
      } else {
        setDbStatus({
          connected: false,
          message: "API de Electron no disponible",
        })
      }
    } catch (error) {
      setDbStatus({
        connected: false,
        message: String(error),
      })
    }
    setIsTesting(false)
  }

  const handleSaveEmpresa = async () => {
    setEmpresaSaving(true)
    setEmpresaSuccess(null)
    try {
      for (const [key, value] of Object.entries(empresaData)) {
        await window.electronAPI?.config.set(`empresa.${key}`, value)
      }
      setEmpresaSuccess('Datos de empresa guardados correctamente')
      setTimeout(() => setEmpresaSuccess(null), 3000)
    } catch (error) {
      console.error('Error saving empresa:', error)
    } finally {
      setEmpresaSaving(false)
    }
  }

  const handleSaveFacturacion = async () => {
    setFacturacionSaving(true)
    setFacturacionSuccess(null)
    try {
      for (const [key, value] of Object.entries(facturacionData)) {
        await window.electronAPI?.config.set(`facturacion.${key}`, value)
      }
      setFacturacionSuccess('Configuración de facturación guardada correctamente')
      setTimeout(() => setFacturacionSuccess(null), 3000)
    } catch (error) {
      console.error('Error saving facturacion:', error)
    } finally {
      setFacturacionSaving(false)
    }
  }

  const loadLogo = async () => {
    try {
      const result = await window.electronAPI?.logo.read()
      if (result?.success && result.data) {
        const bytes = new Uint8Array(result.data.data)
        const blob = new Blob([bytes], { type: result.data.tipoMime })
        const reader = new FileReader()
        reader.onloadend = () => {
          setLogoBase64(reader.result as string)
        }
        reader.readAsDataURL(blob)
      }
    } catch {
      // No logo, that's fine
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      alert('El logo no puede superar 2MB')
      return
    }
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      alert('Formato no soportado. Usa PNG o JPG.')
      return
    }

    setLogoLoading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const data = Array.from(new Uint8Array(arrayBuffer))
      await window.electronAPI?.logo.upload({ data, nombre: file.name, tipoMime: file.type })

      // Read back as base64 for preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoBase64(reader.result as string)
        setLogoLoading(false)
      }
      reader.readAsDataURL(file)
    } catch {
      setLogoLoading(false)
    }
    // Reset input
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const handleLogoDelete = async () => {
    try {
      await window.electronAPI?.logo.delete()
      setLogoBase64(undefined)
    } catch {
      // ignore
    }
  }

  const generatePreview = useCallback(() => {
    try {
      const base64 = generateInvoicePdf({
        factura: PREVIEW_FACTURA,
        empresa: empresaData,
        facturacion: { piePagina: facturacionData.piePagina },
        template: { ...templateConfig, logoBase64 },
      })
      setPreviewPdf(`data:application/pdf;base64,${base64}`)
    } catch (err) {
      console.error('Error generating preview:', err)
    }
  }, [templateConfig, logoBase64, empresaData, facturacionData.piePagina])

  // Debounced preview regeneration
  useEffect(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    previewTimerRef.current = setTimeout(() => {
      generatePreview()
    }, 500)
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    }
  }, [generatePreview])

  const handleSaveTemplate = async () => {
    setTemplateSaving(true)
    setTemplateSuccess(null)
    try {
      await window.electronAPI?.config.set('facturacion.plantilla', templateConfig.plantilla)
      await window.electronAPI?.config.set('facturacion.colorAccento', templateConfig.colorAccento)
      await window.electronAPI?.config.set('facturacion.mostrarTelefono', String(templateConfig.mostrarTelefono))
      await window.electronAPI?.config.set('facturacion.mostrarEmail', String(templateConfig.mostrarEmail))
      await window.electronAPI?.config.set('facturacion.mostrarWeb', String(templateConfig.mostrarWeb))
      await window.electronAPI?.config.set('facturacion.mostrarNotas', String(templateConfig.mostrarNotas))
      await window.electronAPI?.config.set('facturacion.mostrarFormaPago', String(templateConfig.mostrarFormaPago))
      setTemplateSuccess('Plantilla guardada correctamente')
      setTimeout(() => setTemplateSuccess(null), 3000)
    } catch (error) {
      console.error('Error saving template:', error)
    } finally {
      setTemplateSaving(false)
    }
  }

  const loadDataPathInfo = async () => {
    try {
      const result = await window.electronAPI?.backup.getDataPath()
      if (result?.success && result.data) {
        setDataPathInfo(result.data)
      }
    } catch (error) {
      console.error('Error loading data path info:', error)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleExportBackup = async () => {
    setIsExporting(true)
    setExportError(null)
    setExportSuccess(null)

    try {
      const result = await window.electronAPI?.backup.export()
      if (result?.success && result.data) {
        setExportSuccess(`Backup exportado correctamente: ${result.data.path} (${formatBytes(result.data.size)})`)
      } else {
        if (result?.error !== 'Operación cancelada') {
          setExportError(result?.error || 'Error al exportar')
        }
      }
    } catch (error) {
      setExportError(String(error))
    } finally {
      setIsExporting(false)
    }
  }

  const handleMigrateData = async () => {
    setIsMigrating(true)
    setMigrateError(null)
    setMigrateSuccess(null)

    try {
      const result = await window.electronAPI?.backup.migrate()
      if (result?.success && result.data) {
        setMigrateSuccess(result.data.message + ` (${formatBytes(result.data.size)})`)
        // Recargar información de rutas
        await loadDataPathInfo()
      } else {
        if (result?.error !== 'Operación cancelada') {
          setMigrateError(result?.error || 'Error al migrar')
        }
      }
    } catch (error) {
      setMigrateError(String(error))
    } finally {
      setIsMigrating(false)
    }
  }

  const handleResetToDefaultPath = async () => {
    setIsResettingPath(true)
    setMigrateError(null)
    setMigrateSuccess(null)

    try {
      const result = await window.electronAPI?.backup.resetToDefault()
      if (result?.success && result.data) {
        setMigrateSuccess(result.data.message)
        // Recargar información de rutas
        await loadDataPathInfo()
      } else {
        setMigrateError(result?.error || 'Error al restaurar')
      }
    } catch (error) {
      setMigrateError(String(error))
    } finally {
      setIsResettingPath(false)
    }
  }

  const handleSetupPasskey = async () => {
    if (!passkeyPassword) {
      setPasskeyError("Ingresa tu contraseña actual")
      return
    }

    setPasskeyLoading(true)
    setPasskeyError(null)

    try {
      if (!window.electronAPI?.auth) {
        throw new Error("API no disponible")
      }

      const result = await window.electronAPI.auth.setupPasskey(passkeyPassword)

      if (result.success) {
        setPasskeyEnabled(true)
        setPasskeySuccess("Passkey configurado correctamente")
        setShowPasskeyDialog(false)
        setPasskeyPassword("")
      } else {
        setPasskeyError(result.error || "Error al configurar passkey")
      }
    } catch (error) {
      setPasskeyError("Error al configurar passkey")
    } finally {
      setPasskeyLoading(false)
    }
  }

  const handleDisablePasskey = async () => {
    setPasskeyLoading(true)
    setPasskeyError(null)

    try {
      if (!window.electronAPI?.auth) {
        throw new Error("API no disponible")
      }

      const result = await window.electronAPI.auth.disablePasskey()

      if (result.success) {
        setPasskeyEnabled(false)
        setPasskeySuccess("Passkey deshabilitado")
      } else {
        setPasskeyError(result.error || "Error al deshabilitar passkey")
      }
    } catch (error) {
      setPasskeyError("Error al deshabilitar passkey")
    } finally {
      setPasskeyLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl font-semibold">Configuración</h1>
            <p className="text-sm text-muted-foreground">
              Ajustes del sistema y datos de empresa
            </p>
          </div>
          {onHelp && (
            <button onClick={onHelp} className="rounded-full p-1.5 hover:bg-accent transition-colors" title="Ver ayuda">
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <Tabs defaultValue="empresa" className="space-y-4">
        <TabsList className="h-8">
          <TabsTrigger value="empresa" className="text-xs h-7 px-3">
            <Building2 className="mr-1.5 h-3.5 w-3.5" />
            Empresa
          </TabsTrigger>
          <TabsTrigger value="facturacion" className="text-xs h-7 px-3">
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Facturación
          </TabsTrigger>
          <TabsTrigger value="impuestos" className="text-xs h-7 px-3">
            <Percent className="mr-1.5 h-3.5 w-3.5" />
            Impuestos
          </TabsTrigger>
          <TabsTrigger value="seguridad" className="text-xs h-7 px-3">
            <Shield className="mr-1.5 h-3.5 w-3.5" />
            Seguridad
          </TabsTrigger>
          <TabsTrigger value="sistema" className="text-xs h-7 px-3">
            <Database className="mr-1.5 h-3.5 w-3.5" />
            Sistema
          </TabsTrigger>
        </TabsList>

        {/* Empresa Tab */}
        <TabsContent value="empresa">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Datos de la Empresa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {empresaSuccess && (
                <div className="flex items-center gap-2 bg-green-50 text-green-700 p-2 rounded text-xs">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {empresaSuccess}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Nombre / Razón Social</Label>
                  <Input
                    className="h-8 text-sm"
                    value={empresaData.nombre}
                    onChange={(e) => setEmpresaData({ ...empresaData, nombre: e.target.value })}
                    placeholder="Mi Empresa S.L."
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">NIF/CIF</Label>
                  <Input
                    className="h-8 text-sm font-mono"
                    value={empresaData.nif}
                    onChange={(e) => setEmpresaData({ ...empresaData, nif: e.target.value })}
                    placeholder="B12345678"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs">Dirección</Label>
                <Input
                  className="h-8 text-sm"
                  value={empresaData.direccion}
                  onChange={(e) => setEmpresaData({ ...empresaData, direccion: e.target.value })}
                  placeholder="Calle Principal 123"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Código Postal</Label>
                  <Input
                    className="h-8 text-sm"
                    value={empresaData.codigoPostal}
                    onChange={(e) => setEmpresaData({ ...empresaData, codigoPostal: e.target.value })}
                    placeholder="28001"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Ciudad</Label>
                  <Input
                    className="h-8 text-sm"
                    value={empresaData.ciudad}
                    onChange={(e) => setEmpresaData({ ...empresaData, ciudad: e.target.value })}
                    placeholder="Madrid"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Provincia</Label>
                  <Input
                    className="h-8 text-sm"
                    value={empresaData.provincia}
                    onChange={(e) => setEmpresaData({ ...empresaData, provincia: e.target.value })}
                    placeholder="Madrid"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Teléfono</Label>
                  <Input
                    className="h-8 text-sm"
                    value={empresaData.telefono}
                    onChange={(e) => setEmpresaData({ ...empresaData, telefono: e.target.value })}
                    placeholder="912345678"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input
                    className="h-8 text-sm"
                    type="email"
                    value={empresaData.email}
                    onChange={(e) => setEmpresaData({ ...empresaData, email: e.target.value })}
                    placeholder="contacto@empresa.es"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Sitio Web</Label>
                  <Input
                    className="h-8 text-sm"
                    value={empresaData.web}
                    onChange={(e) => setEmpresaData({ ...empresaData, web: e.target.value })}
                    placeholder="www.empresa.es"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button size="sm" onClick={handleSaveEmpresa} disabled={empresaSaving}>
                  {empresaSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  Guardar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Facturación Tab */}
        <TabsContent value="facturacion" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Configuración de Facturación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {facturacionSuccess && (
                <div className="flex items-center gap-2 bg-green-50 text-green-700 p-2 rounded text-xs">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {facturacionSuccess}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Serie de Facturación</Label>
                  <Input
                    className="h-8 text-sm font-mono"
                    value={facturacionData.serieFactura}
                    onChange={(e) => setFacturacionData({ ...facturacionData, serieFactura: e.target.value })}
                    placeholder="F"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Próximo Número</Label>
                  <Input
                    className="h-8 text-sm font-mono"
                    value={facturacionData.proximoNumero}
                    onChange={(e) => setFacturacionData({ ...facturacionData, proximoNumero: e.target.value })}
                    placeholder="001"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">IVA por Defecto (%)</Label>
                  <Input
                    className="h-8 text-sm"
                    type="number"
                    value={facturacionData.ivaPorDefecto}
                    onChange={(e) => setFacturacionData({ ...facturacionData, ivaPorDefecto: e.target.value })}
                    placeholder="21"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Días hasta Vencimiento</Label>
                  <Input
                    className="h-8 text-sm"
                    type="number"
                    value={facturacionData.diasVencimiento}
                    onChange={(e) => setFacturacionData({ ...facturacionData, diasVencimiento: e.target.value })}
                    placeholder="30"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs">Texto Pie de Factura</Label>
                <Input
                  className="h-8 text-sm"
                  value={facturacionData.piePagina}
                  onChange={(e) => setFacturacionData({ ...facturacionData, piePagina: e.target.value })}
                  placeholder="Gracias por su confianza. Pago a 30 días."
                />
              </div>

              <div className="rounded border p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Vista previa del número:</p>
                <p className="text-lg font-mono font-semibold">
                  {facturacionData.serieFactura}{new Date().getFullYear()}-{facturacionData.proximoNumero.padStart(4, "0")}
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button size="sm" onClick={handleSaveFacturacion} disabled={facturacionSaving}>
                  {facturacionSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  Guardar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Template Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Plantilla de Factura
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {templateSuccess && (
                <div className="flex items-center gap-2 bg-green-50 text-green-700 p-2 rounded text-xs">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {templateSuccess}
                </div>
              )}

              {/* Template selector - 2x2 grid */}
              <div>
                <Label className="text-xs mb-2 block">Diseño</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {([
                    { id: 'clasica', name: 'Clásica', desc: 'Tabla a rayas, diseño tradicional' },
                    { id: 'moderna', name: 'Moderna', desc: 'Barra superior, cajas de color' },
                    { id: 'minimalista', name: 'Minimalista', desc: 'Tipografía limpia, sin fondos' },
                    { id: 'ejecutiva', name: 'Ejecutiva', desc: 'Sidebar lateral, estilo corporativo' },
                  ] as const).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTemplateConfig(prev => ({ ...prev, plantilla: t.id }))}
                      className={`relative p-3 rounded border-2 text-left transition-all ${
                        templateConfig.plantilla === t.id
                          ? 'border-blue-500 bg-blue-50/50'
                          : 'border-muted hover:border-muted-foreground/30'
                      }`}
                    >
                      {/* Mini schematic preview */}
                      <div className="mb-2 h-16 rounded bg-muted/50 border overflow-hidden p-1.5">
                        {t.id === 'clasica' && (
                          <div className="h-full flex flex-col gap-0.5">
                            <div className="flex justify-between">
                              <div className="w-8 h-1.5 rounded-sm" style={{ backgroundColor: templateConfig.colorAccento }} />
                              <div className="w-6 h-1.5 bg-muted-foreground/20 rounded-sm" />
                            </div>
                            <div className="w-full h-0.5 bg-muted-foreground/10 mt-0.5" />
                            <div className="flex-1 space-y-0.5 mt-0.5">
                              <div className="w-full h-1.5 rounded-sm" style={{ backgroundColor: templateConfig.colorAccento, opacity: 0.7 }} />
                              <div className="w-full h-1 bg-muted-foreground/5 rounded-sm" />
                              <div className="w-full h-1 bg-muted-foreground/10 rounded-sm" />
                              <div className="w-full h-1 bg-muted-foreground/5 rounded-sm" />
                            </div>
                          </div>
                        )}
                        {t.id === 'moderna' && (
                          <div className="h-full flex flex-col gap-0.5">
                            <div className="w-full h-1.5 rounded-sm" style={{ backgroundColor: templateConfig.colorAccento }} />
                            <div className="flex justify-between mt-0.5">
                              <div className="w-6 h-1.5 bg-muted-foreground/20 rounded-sm" />
                              <div className="w-10 h-2 rounded-sm" style={{ backgroundColor: templateConfig.colorAccento, opacity: 0.8 }} />
                            </div>
                            <div className="w-full h-2 bg-muted-foreground/10 rounded-sm mt-0.5" />
                            <div className="flex-1 space-y-0.5 mt-0.5">
                              <div className="w-full h-1.5 rounded-sm border border-muted-foreground/20" style={{ backgroundColor: templateConfig.colorAccento, opacity: 0.6 }} />
                              <div className="w-full h-1 border border-muted-foreground/10 rounded-sm" />
                              <div className="w-full h-1 border border-muted-foreground/10 rounded-sm" />
                            </div>
                          </div>
                        )}
                        {t.id === 'minimalista' && (
                          <div className="h-full flex flex-col gap-1">
                            <div className="flex justify-between">
                              <div className="w-8 h-1 bg-muted-foreground/30 rounded-sm" />
                              <div className="w-10 h-1 bg-muted-foreground/15 rounded-sm" />
                            </div>
                            <div className="w-full h-[0.5px] bg-muted-foreground/15 mt-0.5" />
                            <div className="flex-1 space-y-1 mt-0.5">
                              <div className="w-full h-[0.5px] bg-muted-foreground/20" />
                              <div className="w-full h-0.5 bg-muted-foreground/5 rounded-sm" />
                              <div className="w-full h-0.5 bg-muted-foreground/5 rounded-sm" />
                              <div className="w-full h-0.5 bg-muted-foreground/5 rounded-sm" />
                            </div>
                          </div>
                        )}
                        {t.id === 'ejecutiva' && (
                          <div className="h-full flex gap-1">
                            <div className="w-2 h-full rounded-sm" style={{ backgroundColor: templateConfig.colorAccento }} />
                            <div className="flex-1 flex flex-col gap-0.5">
                              <div className="flex justify-between">
                                <div className="w-6 h-1.5 bg-muted-foreground/20 rounded-sm" />
                                <div className="w-6 h-1.5 bg-muted-foreground/15 rounded-sm" />
                              </div>
                              <div className="w-full h-2 rounded-sm" style={{ backgroundColor: templateConfig.colorAccento, opacity: 0.1 }} />
                              <div className="flex-1 space-y-0.5 mt-0.5">
                                <div className="w-full h-1 rounded-sm" style={{ backgroundColor: templateConfig.colorAccento, opacity: 0.6 }} />
                                <div className="w-full h-0.5 bg-muted-foreground/5 rounded-sm" />
                                <div className="w-full h-0.5 bg-muted-foreground/10 rounded-sm" />
                              </div>
                              <div className="w-1/2 h-1.5 rounded-sm ml-auto" style={{ backgroundColor: templateConfig.colorAccento, opacity: 0.7 }} />
                            </div>
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-medium">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color de acento */}
              <div>
                <Label className="text-xs mb-2 block">Color de acento</Label>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {['#374151', '#1e40af', '#047857', '#b91c1c', '#7c3aed', '#c2410c'].map((color) => (
                      <button
                        key={color}
                        onClick={() => setTemplateConfig(prev => ({ ...prev, colorAccento: color }))}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${
                          templateConfig.colorAccento === color ? 'border-blue-500 scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-7 h-7 rounded border"
                      style={{ backgroundColor: templateConfig.colorAccento }}
                    />
                    <Input
                      className="h-8 text-sm font-mono w-24"
                      value={templateConfig.colorAccento}
                      onChange={(e) => {
                        const v = e.target.value
                        if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                          setTemplateConfig(prev => ({ ...prev, colorAccento: v }))
                        }
                      }}
                      placeholder="#374151"
                    />
                  </div>
                </div>
              </div>

              {/* Logo */}
              <div>
                <Label className="text-xs mb-2 block">Logo de empresa</Label>
                <div className="flex items-center gap-3">
                  {logoBase64 ? (
                    <div className="relative">
                      <img
                        src={logoBase64}
                        alt="Logo"
                        className="h-14 w-14 object-contain border rounded p-1"
                      />
                      <button
                        onClick={handleLogoDelete}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-14 w-14 border rounded border-dashed flex items-center justify-center bg-muted/30">
                      <Image className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoLoading}
                    >
                      {logoLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Upload className="h-3 w-3 mr-1" />
                      )}
                      Subir logo
                    </Button>
                    <p className="text-[10px] text-muted-foreground mt-1">PNG o JPG, max 2MB</p>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                  </div>
                </div>
              </div>

              {/* Visibility toggles */}
              <div>
                <Label className="text-xs mb-2 block">Elementos visibles</Label>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {([
                    { key: 'mostrarTelefono', label: 'Teléfono empresa' },
                    { key: 'mostrarEmail', label: 'Email empresa' },
                    { key: 'mostrarWeb', label: 'Web empresa' },
                    { key: 'mostrarNotas', label: 'Sección notas' },
                    { key: 'mostrarFormaPago', label: 'Forma de pago' },
                  ] as const).map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <Switch
                        id={`template-${key}`}
                        checked={templateConfig[key]}
                        onCheckedChange={(checked) =>
                          setTemplateConfig(prev => ({ ...prev, [key]: checked }))
                        }
                      />
                      <Label htmlFor={`template-${key}`} className="text-xs">{label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <Label className="text-xs mb-2 block">Vista previa</Label>
                {previewPdf ? (
                  <iframe
                    src={previewPdf}
                    className="w-full h-[500px] border rounded"
                    title="Vista previa de factura"
                  />
                ) : (
                  <div className="w-full h-[500px] border rounded flex items-center justify-center bg-muted/30">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button size="sm" onClick={handleSaveTemplate} disabled={templateSaving}>
                  {templateSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  Guardar plantilla
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Impuestos Tab */}
        <TabsContent value="impuestos">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Gestión de Impuestos</CardTitle>
                <Button size="sm" onClick={() => handleOpenImpuestoDialog()}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Nuevo
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {impuestosLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-8 text-xs">Nombre</TableHead>
                      <TableHead className="h-8 text-xs">Tipo</TableHead>
                      <TableHead className="h-8 text-xs text-center">Porcentaje</TableHead>
                      <TableHead className="h-8 text-xs text-center">Por Defecto</TableHead>
                      <TableHead className="h-8 text-xs text-center">Estado</TableHead>
                      <TableHead className="h-8 text-xs text-center w-20">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {impuestos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          <p className="text-sm text-muted-foreground">No hay impuestos configurados</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      impuestos.map((impuesto) => (
                        <TableRow key={impuesto.id}>
                          <TableCell className="py-2 text-xs font-medium">{impuesto.nombre}</TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline" className="text-[10px]">{impuesto.tipo}</Badge>
                          </TableCell>
                          <TableCell className="py-2 text-center">
                            <span className="text-xs font-mono tabular-nums">{impuesto.porcentaje}%</span>
                          </TableCell>
                          <TableCell className="py-2 text-center">
                            {impuesto.porDefecto ? (
                              <Star className="h-3.5 w-3.5 text-yellow-500 mx-auto fill-yellow-500" />
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleSetDefaultImpuesto(impuesto)}
                              >
                                <Star className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-center">
                            <span className={`text-[10px] px-2 py-0.5 rounded ${
                              impuesto.activo
                                ? "bg-green-50 text-green-700"
                                : "bg-slate-100 text-slate-500"
                            }`}>
                              {impuesto.activo ? "Activo" : "Inactivo"}
                            </span>
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex justify-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleOpenImpuestoDialog(impuesto)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              {!impuesto.porDefecto && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-red-600"
                                  onClick={() => confirmDeleteImpuesto(impuesto)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}

              <div className="border-t p-3 bg-muted/30">
                <p className="text-xs font-medium mb-1">Tipos de impuesto comunes en España</p>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <p><strong>IVA General (21%):</strong> Tipo general para la mayoría de bienes y servicios</p>
                  <p><strong>IVA Reducido (10%):</strong> Alimentos, transporte, hostelería</p>
                  <p><strong>IVA Super Reducido (4%):</strong> Productos de primera necesidad</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Seguridad Tab */}
        <TabsContent value="seguridad" className="space-y-4">
          {/* Passkey */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ScanFace className="h-4 w-4" />
                Autenticación Biométrica
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {passkeySuccess && (
                <div className="flex items-center gap-2 bg-green-50 text-green-700 p-2 rounded text-xs">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {passkeySuccess}
                </div>
              )}

              {passkeyError && (
                <div className="flex items-center gap-2 bg-red-50 text-red-700 p-2 rounded text-xs">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {passkeyError}
                </div>
              )}

              <div className="flex items-center justify-between p-3 border rounded">
                <div className="flex items-center gap-3">
                  <div className={`rounded-full p-2 ${passkeyEnabled ? 'bg-blue-50 text-blue-600' : 'bg-muted text-muted-foreground'}`}>
                    <Fingerprint className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Passkey</p>
                    <p className="text-xs text-muted-foreground">
                      {passkeySupported
                        ? passkeyEnabled
                          ? 'Habilitado - Usa biometría para desbloquear'
                          : 'Disponible - Configúralo para acceso rápido'
                        : 'No disponible en este sistema'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded ${
                    passkeyEnabled ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {passkeyEnabled ? 'Activo' : 'Inactivo'}
                  </span>
                  {passkeySupported && (
                    passkeyEnabled ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-red-600"
                        onClick={handleDisablePasskey}
                        disabled={passkeyLoading}
                      >
                        {passkeyLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Deshabilitar"}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setShowPasskeyDialog(true)}
                      >
                        Configurar
                      </Button>
                    )
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Encriptación */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Encriptación
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1.5 border-b">
                  <div className="flex items-center gap-2 text-xs">
                    <Shield className="h-3.5 w-3.5 text-green-500" />
                    <span>Algoritmo</span>
                  </div>
                  <span className="text-xs font-mono">AES-256-GCM</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b">
                  <div className="flex items-center gap-2 text-xs">
                    <KeyRound className="h-3.5 w-3.5 text-green-500" />
                    <span>Derivación de clave</span>
                  </div>
                  <span className="text-xs font-mono">PBKDF2</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    <span>Estado</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-green-50 text-green-700">Protegido</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sistema Tab */}
        <TabsContent value="sistema" className="space-y-4">
          {/* Backup / Exportar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Archive className="h-4 w-4" />
                Copia de Seguridad
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {exportSuccess && (
                <div className="flex items-center gap-2 bg-green-50 text-green-700 p-2 rounded text-xs">
                  <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="break-all">{exportSuccess}</span>
                </div>
              )}

              {exportError && (
                <div className="flex items-center gap-2 bg-red-50 text-red-700 p-2 rounded text-xs">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {exportError}
                </div>
              )}

              <div className="flex items-center justify-between p-3 border rounded">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2 bg-blue-50 text-blue-600">
                    <Download className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Exportar Datos</p>
                    <p className="text-xs text-muted-foreground">
                      Genera un archivo ZIP con toda la información
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleExportBackup}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Download className="h-3 w-3 mr-1" />
                  )}
                  Exportar
                </Button>
              </div>

              {dataPathInfo && (
                <div className="text-xs text-muted-foreground space-y-1 p-2 bg-muted/30 rounded">
                  <div className="flex justify-between">
                    <span>Base de datos:</span>
                    <span className="font-mono">{formatBytes(dataPathInfo.dbSize)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Adjuntos:</span>
                    <span className="font-mono">{dataPathInfo.attachmentsCount} archivos ({formatBytes(dataPathInfo.attachmentsSize)})</span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground bg-blue-50/50 p-2 rounded">
                <strong>Consejo:</strong> Exporta tu copia de seguridad a un USB o almacenamiento externo para mayor seguridad.
                Podrás importarla desde la pantalla de inicio de sesión en cualquier dispositivo.
              </p>
            </CardContent>
          </Card>

          {/* Ubicación de Datos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FolderOutput className="h-4 w-4" />
                Ubicación de Datos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {migrateSuccess && (
                <div className="flex items-center gap-2 bg-green-50 text-green-700 p-2 rounded text-xs">
                  <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="break-all">{migrateSuccess}</span>
                </div>
              )}

              {migrateError && (
                <div className="flex items-center gap-2 bg-red-50 text-red-700 p-2 rounded text-xs">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {migrateError}
                </div>
              )}

              {/* Estado actual */}
              {dataPathInfo && (
                <div className={`p-3 border rounded ${dataPathInfo.isUsingCustomPath ? 'border-purple-200 bg-purple-50/30' : 'border-green-200 bg-green-50/30'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`rounded-full p-1.5 ${dataPathInfo.isUsingCustomPath ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'}`}>
                      <ExternalLink className="h-3 w-3" />
                    </div>
                    <span className="text-xs font-medium">
                      {dataPathInfo.isUsingCustomPath ? 'Usando ruta personalizada' : 'Usando ruta por defecto'}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-muted-foreground break-all">
                    {dataPathInfo.dataPath}
                  </p>
                </div>
              )}

              {/* Cambiar ubicación */}
              <div className="flex items-center justify-between p-3 border rounded">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2 bg-purple-50 text-purple-600">
                    <FolderOutput className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Cambiar ubicación</p>
                    <p className="text-xs text-muted-foreground">
                      Mueve los datos a otra carpeta (USB, disco externo)
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleMigrateData}
                  disabled={isMigrating || isResettingPath}
                >
                  {isMigrating ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <FolderOutput className="h-3 w-3 mr-1" />
                  )}
                  Cambiar
                </Button>
              </div>

              {/* Restaurar a ubicación por defecto (solo si está usando ruta personalizada) */}
              {dataPathInfo?.isUsingCustomPath && (
                <div className="flex items-center justify-between p-3 border rounded border-dashed">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full p-2 bg-slate-50 text-slate-600">
                      <RotateCcw className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Restaurar ubicación por defecto</p>
                      <p className="text-xs text-muted-foreground">
                        Volver a usar la carpeta del sistema
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleResetToDefaultPath}
                    disabled={isMigrating || isResettingPath}
                  >
                    {isResettingPath ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="h-3 w-3 mr-1" />
                    )}
                    Restaurar
                  </Button>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground bg-purple-50/50 p-2 rounded">
                <strong>Portabilidad:</strong> Cambia la ubicación de tus datos a un USB o disco externo.
                La aplicación leerá y escribirá directamente desde esa ubicación.
                Se creará una carpeta <code className="bg-purple-100 px-1 rounded">CryptoGest-Data</code>.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4" />
                Base de Datos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded">
                <div className="flex items-center gap-3">
                  <div className={`rounded-full p-2 ${
                    dbStatus?.connected ? "bg-green-50 text-green-600" : "bg-muted text-muted-foreground"
                  }`}>
                    <HardDrive className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">SQLite Local</p>
                    <p className="text-xs text-muted-foreground">
                      {dbStatus?.message || "Sin verificar"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {dbStatus && (
                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                      dbStatus.connected ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                    }`}>
                      {dbStatus.connected ? "Conectado" : "Error"}
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                  >
                    {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Probar
                  </Button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground space-y-1 p-2 bg-muted/30 rounded">
                <div className="flex justify-between">
                  <span>Motor:</span>
                  <span className="font-mono">SQLite 3</span>
                </div>
                <div className="flex justify-between">
                  <span>ORM:</span>
                  <span className="font-mono">Prisma</span>
                </div>
                {dataPathInfo && (
                  <div className="flex justify-between">
                    <span>Ubicación:</span>
                    <span className="font-mono text-[10px] truncate max-w-[200px]" title={dataPathInfo.dbPath}>
                      {dataPathInfo.dbPath.split('/').slice(-2).join('/')}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Información de la Aplicación</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs space-y-2">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Versión</span>
                  <span className="font-mono">1.0.0</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Framework</span>
                  <span>Electron + React</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">UI</span>
                  <span>ShadCN + Tailwind</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Plataforma</span>
                  <span>{navigator.platform}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Passkey Setup Dialog */}
      <Dialog open={showPasskeyDialog} onOpenChange={setShowPasskeyDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <ScanFace className="h-4 w-4" />
              Configurar Passkey
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Contraseña Actual</Label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  value={passkeyPassword}
                  onChange={(e) => setPasskeyPassword(e.target.value)}
                  className="h-8 text-sm pl-8 pr-8"
                  placeholder="Tu contraseña"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {passkeyError && (
              <div className="bg-red-50 text-red-700 p-2 rounded text-xs flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5" />
                {passkeyError}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground bg-muted/50 p-2 rounded">
              Tu contraseña se almacenará en el llavero del sistema para usar Touch ID, Face ID o Windows Hello.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => {
              setShowPasskeyDialog(false)
              setPasskeyPassword("")
              setPasskeyError(null)
            }}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSetupPasskey} disabled={passkeyLoading}>
              {passkeyLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Fingerprint className="mr-1.5 h-3.5 w-3.5" />}
              Activar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Impuesto Dialog */}
      <Dialog open={impuestoDialogOpen} onOpenChange={setImpuestoDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingImpuesto ? "Editar Impuesto" : "Nuevo Impuesto"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            {impuestoError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {impuestoError}
              </div>
            )}
            <div className="grid gap-1.5">
              <Label className="text-xs">Nombre *</Label>
              <Input
                className="h-8 text-sm"
                value={impuestoForm.nombre}
                onChange={(e) => setImpuestoForm({ ...impuestoForm, nombre: e.target.value })}
                placeholder="IVA General"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Porcentaje *</Label>
                <Input
                  className="h-8 text-sm"
                  type="number"
                  step="0.01"
                  value={impuestoForm.porcentaje}
                  onChange={(e) => setImpuestoForm({ ...impuestoForm, porcentaje: e.target.value })}
                  placeholder="21"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select
                  value={impuestoForm.tipo}
                  onValueChange={(value) => setImpuestoForm({ ...impuestoForm, tipo: value })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IVA">IVA</SelectItem>
                    <SelectItem value="IRPF">IRPF</SelectItem>
                    <SelectItem value="RE">Recargo Equivalencia</SelectItem>
                    <SelectItem value="Otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="impuesto-activo"
                  checked={impuestoForm.activo}
                  onCheckedChange={(checked) => setImpuestoForm({ ...impuestoForm, activo: checked })}
                />
                <Label htmlFor="impuesto-activo" className="text-xs">Activo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="impuesto-defecto"
                  checked={impuestoForm.porDefecto}
                  onCheckedChange={(checked) => setImpuestoForm({ ...impuestoForm, porDefecto: checked })}
                />
                <Label htmlFor="impuesto-defecto" className="text-xs">Por defecto</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setImpuestoDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveImpuesto}
              disabled={impuestoSaving || !impuestoForm.nombre.trim() || !impuestoForm.porcentaje}
            >
              {impuestoSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {editingImpuesto ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Impuesto Confirmation */}
      <AlertDialog open={impuestoDeleteDialog} onOpenChange={setImpuestoDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Eliminar impuesto</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Se eliminará permanentemente "{impuestoToDelete?.nombre}".
              Asegúrate de que no esté siendo utilizado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-sm">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteImpuesto}
              className="h-8 text-sm bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
