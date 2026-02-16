import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  Cloud,
  Upload,
  Download,
  Trash2,
  Loader2,
  LogOut,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  HardDrive,
  Database,
  ArrowDownToLine,
  KeyRound,
  HelpCircle,
} from "lucide-react"

// ============================================
// Helpers
// ============================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ============================================
// Main Component
// ============================================

interface CloudPageProps {
  deepLinkResult?: { success: boolean; user?: any; server?: string } | null
  onDeepLinkHandled?: () => void
  onHelp?: () => void
}

export function CloudPage({ deepLinkResult, onDeepLinkHandled, onHelp }: CloudPageProps) {
  // Connection state
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<CloudUser | null>(null)

  // Server URL (set by config or deep link)
  const [serverUrl, setServerUrl] = useState("https://cryptogest.app")

  // Backups
  const [backups, setBackups] = useState<CloudBackup[]>([])
  const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null)
  const [isLoadingBackups, setIsLoadingBackups] = useState(false)

  // Plan & License
  const [plan, setPlan] = useState<CloudPlan | null>(null)
  const [usage, setUsage] = useState<CloudUsage | null>(null)
  const [license, setLicense] = useState<CloudLicense | null>(null)

  // Upload
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [showNotesDialog, setShowNotesDialog] = useState(false)
  const [uploadNotes, setUploadNotes] = useState("")

  // Download
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  // Import
  const [importConfirmId, setImportConfirmId] = useState<number | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  // Delete
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Disconnect
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

  // Messages
  const [successMessage, setSuccessMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  // ============================================
  // Load config on mount
  // ============================================

  useEffect(() => {
    loadConfig()
  }, [])

  // Handle deep link result passed from App.tsx (main process already confirmed the link)
  useEffect(() => {
    if (deepLinkResult?.success && deepLinkResult.user) {
      setIsConnected(true)
      setUser(deepLinkResult.user)
      if (deepLinkResult.server) setServerUrl(deepLinkResult.server)
      setSuccessMessage('Conectado automáticamente desde CryptoGest Cloud')
      loadBackups(1)
      loadPlan()
      onDeepLinkHandled?.()
    }
  }, [deepLinkResult])

  // Progress listeners
  useEffect(() => {
    const cleanupUpload = window.electronAPI?.cloud.onUploadProgress((percent) => {
      setUploadProgress(percent)
    })
    const cleanupDownload = window.electronAPI?.cloud.onDownloadProgress((percent) => {
      setDownloadProgress(percent)
    })
    return () => {
      cleanupUpload?.()
      cleanupDownload?.()
    }
  }, [])

  // Auto-clear messages
  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(""), 5000)
      return () => clearTimeout(t)
    }
  }, [successMessage])

  useEffect(() => {
    if (errorMessage) {
      const t = setTimeout(() => setErrorMessage(""), 8000)
      return () => clearTimeout(t)
    }
  }, [errorMessage])

  const loadConfig = async () => {
    setIsLoading(true)
    try {
      const result = await window.electronAPI?.cloud.getConfig()
      if (result?.success && result.data) {
        // Load locally persisted license (perpetual, independent of connection)
        if (result.data.license) {
          setLicense(result.data.license)
        }

        if (result.data.serverUrl && result.data.token) {
          setServerUrl(result.data.serverUrl)
          setIsConnected(true)
          if (result.data.user) {
            setUser(result.data.user)
          }
          // Load backups and plan
          await Promise.all([loadBackups(1), loadPlan()])
        }
      }
    } catch (err) {
      console.error("Error loading cloud config:", err)
    } finally {
      setIsLoading(false)
    }
  }

  // ============================================
  // Actions
  // ============================================

  const handleOpenCloud = () => {
    window.electronAPI?.shell.openExternal(`${serverUrl}/login`)
  }

  const handleDisconnect = async () => {
    try {
      await window.electronAPI?.cloud.disconnect()
      setIsConnected(false)
      setUser(null)
      setBackups([])
      setMeta(null)
      setPlan(null)
      setUsage(null)
      // License is NOT cleared — it's perpetual and persisted locally
      setShowDisconnectConfirm(false)
      setSuccessMessage("Desconectado de CryptoGest Cloud")
    } catch (err) {
      setErrorMessage(String(err))
    }
  }

  const loadBackups = useCallback(async (page: number) => {
    setIsLoadingBackups(true)
    try {
      const result = await window.electronAPI?.cloud.listBackups(page)
      if (result?.success && result.data) {
        setBackups(result.data.backups)
        setMeta(result.data.meta)
      }
    } catch (err) {
      console.error("Error loading backups:", err)
    } finally {
      setIsLoadingBackups(false)
    }
  }, [])

  const loadPlan = async () => {
    try {
      const result = await window.electronAPI?.cloud.plan()
      if (result?.success && result.data) {
        setPlan(result.data.plan)
        setUsage(result.data.usage)
        setLicense(result.data.license ?? null)
      }
    } catch (err) {
      console.error("Error loading plan:", err)
    }
  }

  const handleUpload = async () => {
    setIsUploading(true)
    setUploadProgress(0)
    setErrorMessage("")
    try {
      const result = await window.electronAPI?.cloud.upload(uploadNotes || undefined)
      if (result?.success) {
        setSuccessMessage("Backup subido correctamente a la nube")
        setUploadNotes("")
        setShowNotesDialog(false)
        await Promise.all([loadBackups(1), loadPlan()])
      } else {
        setErrorMessage(result?.error || "Error al subir el backup")
      }
    } catch (err) {
      setErrorMessage(String(err))
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const handleDownload = async (backupId: number) => {
    setIsDownloading(true)
    setDownloadProgress(0)
    setDownloadingId(backupId)
    try {
      const result = await window.electronAPI?.cloud.download(backupId)
      if (result?.success && result.data) {
        setSuccessMessage(`Backup descargado en: ${result.data.path}`)
      } else if (result?.error !== "Operación cancelada") {
        setErrorMessage(result?.error || "Error al descargar")
      }
    } catch (err) {
      setErrorMessage(String(err))
    } finally {
      setIsDownloading(false)
      setDownloadProgress(0)
      setDownloadingId(null)
    }
  }

  const handleImport = async (backupId: number) => {
    setIsImporting(true)
    setDownloadProgress(0)
    setImportConfirmId(null)
    try {
      const result = await window.electronAPI?.cloud.import(backupId)
      if (result?.success) {
        // App will go to auth screen after import (data replaced)
        // Force page reload
        window.location.reload()
      } else {
        setErrorMessage(result?.error || "Error al importar")
      }
    } catch (err) {
      setErrorMessage(String(err))
    } finally {
      setIsImporting(false)
    }
  }

  const handleDelete = async (backupId: number) => {
    setIsDeleting(true)
    setDeleteConfirmId(null)
    try {
      const result = await window.electronAPI?.cloud.delete(backupId)
      if (result?.success) {
        setSuccessMessage("Backup eliminado de la nube")
        await Promise.all([loadBackups(meta?.current_page || 1), loadPlan()])
      } else {
        setErrorMessage(result?.error || "Error al eliminar")
      }
    } catch (err) {
      setErrorMessage(String(err))
    } finally {
      setIsDeleting(false)
    }
  }

  // ============================================
  // Loading state
  // ============================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ============================================
  // Not Connected — Open browser CTA
  // ============================================

  if (!isConnected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h1 className="text-xl font-semibold">Cloud Backup</h1>
            <p className="text-sm text-muted-foreground">
              Guarda copias de seguridad en la nube con CryptoGest Cloud
            </p>
          </div>
          {onHelp && (
            <button onClick={onHelp} className="rounded-full p-1.5 hover:bg-accent transition-colors" title="Ver ayuda">
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Messages */}
        {successMessage && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {successMessage}
          </div>
        )}

        {/* License status (persisted locally, shown even when disconnected) */}
        {license?.has_license && (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
                  <KeyRound className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Licencia Empresarial activa</p>
                  <p className="text-xs text-muted-foreground">
                    Adquirida el {license.purchased_at ? formatDate(license.purchased_at) : "—"} — Perpetua
                  </p>
                </div>
                <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
                  <KeyRound className="mr-1 h-3 w-3" />
                  Licenciado
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="max-w-lg mx-auto py-12">
          <div className="text-center space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Cloud className="h-8 w-8 text-primary" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Conecta tu cuenta</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Inicia sesión en CryptoGest Cloud desde el navegador. Tu cuenta se vinculará automáticamente con esta aplicación.
              </p>
            </div>

            <Button onClick={handleOpenCloud} size="lg" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Iniciar sesión en CryptoGest Cloud
            </Button>

            <p className="text-xs text-muted-foreground">
              Se abrirá {serverUrl} en tu navegador
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // Connected — Main View
  // ============================================

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl font-semibold">Cloud Backup</h1>
            <p className="text-sm text-muted-foreground">
              Gestiona tus copias de seguridad en la nube
            </p>
          </div>
          {onHelp && (
            <button onClick={onHelp} className="rounded-full p-1.5 hover:bg-accent transition-colors" title="Ver ayuda">
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm">
            <p className="font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          {plan && <Badge variant="info">{plan.name}</Badge>}
          {license?.has_license && (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
              <KeyRound className="mr-1 h-3 w-3" />
              Licenciado
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDisconnectConfirm(true)}
            className="text-xs"
          >
            <LogOut className="mr-1.5 h-3 w-3" />
            Desconectar
          </Button>
        </div>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="backups">
        <TabsList>
          <TabsTrigger value="backups">Backups</TabsTrigger>
          <TabsTrigger value="plan">Plan y uso</TabsTrigger>
        </TabsList>

        {/* Tab: Backups */}
        <TabsContent value="backups">
          <div className="space-y-4">
            {/* Upload button + progress */}
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setShowNotesDialog(true)}
                disabled={isUploading || isImporting}
              >
                {isUploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Subir backup a la nube
              </Button>
              {isUploading && (
                <div className="flex items-center gap-2 flex-1 max-w-xs">
                  <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-8">{uploadProgress}%</span>
                </div>
              )}
            </div>

            {/* Download progress */}
            {isDownloading && (
              <div className="flex items-center gap-2 max-w-xs">
                <Download className="h-4 w-4 text-muted-foreground animate-pulse" />
                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums w-8">{downloadProgress}%</span>
              </div>
            )}

            {/* Backups table */}
            {isLoadingBackups ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : backups.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <Cloud className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    No hay backups en la nube
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sube tu primer backup para empezar
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 text-xs">Archivo</TableHead>
                        <TableHead className="h-9 text-xs">Tamaño</TableHead>
                        <TableHead className="h-9 text-xs">Fecha</TableHead>
                        <TableHead className="h-9 text-xs">Notas</TableHead>
                        <TableHead className="h-9 text-xs text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {backups.map((backup) => (
                        <TableRow key={backup.id} className="text-sm">
                          <TableCell className="py-2 font-medium">
                            <div className="flex items-center gap-2">
                              <Database className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="truncate max-w-[200px]">{backup.original_filename}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2 tabular-nums text-muted-foreground">
                            {formatBytes(backup.size_bytes)}
                          </TableCell>
                          <TableCell className="py-2 text-muted-foreground">
                            {formatDate(backup.uploaded_at || backup.created_at)}
                          </TableCell>
                          <TableCell className="py-2 text-muted-foreground">
                            <span className="truncate max-w-[150px] block">{backup.notes || "—"}</span>
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="Descargar"
                                disabled={isDownloading || isUploading || isImporting}
                                onClick={() => handleDownload(backup.id)}
                              >
                                {downloadingId === backup.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="Importar (restaurar datos)"
                                disabled={isDownloading || isUploading || isImporting}
                                onClick={() => setImportConfirmId(backup.id)}
                              >
                                <ArrowDownToLine className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                title="Eliminar"
                                disabled={isDownloading || isUploading || isDeleting}
                                onClick={() => setDeleteConfirmId(backup.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>

                {/* Pagination */}
                {meta && meta.last_page > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {meta.total} backup{meta.total !== 1 ? "s" : ""} en total
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        disabled={meta.current_page <= 1 || isLoadingBackups}
                        onClick={() => loadBackups(meta.current_page - 1)}
                      >
                        Anterior
                      </Button>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {meta.current_page} / {meta.last_page}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        disabled={meta.current_page >= meta.last_page || isLoadingBackups}
                        onClick={() => loadBackups(meta.current_page + 1)}
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>

        {/* Tab: Plan y uso */}
        <TabsContent value="plan">
          <div className="space-y-4">
          {/* License card */}
          {license && (
            <Card>
              <CardContent className="py-4">
                {license.has_license ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
                      <KeyRound className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Licencia Empresarial activa</p>
                      <p className="text-xs text-muted-foreground">
                        Adquirida el {license.purchased_at ? formatDate(license.purchased_at) : "—"}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">Perpetua</Badge>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Licencia Empresarial</p>
                        <p className="text-xs text-muted-foreground">
                          Gratis para uso personal. Licencia comercial: 99 EUR + IVA (pago unico)
                        </p>
                      </div>
                    </div>
                    <a
                      href={`${serverUrl}/dashboard/license`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0 ml-4"
                    >
                      Comprar licencia <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Plan card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Plan actual</CardTitle>
              </CardHeader>
              <CardContent>
                {plan ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="info" className="text-sm">{plan.name}</Badge>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Almacenamiento máximo</span>
                        <span className="tabular-nums">{formatBytes(plan.max_storage_bytes)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Backups máximos</span>
                        <span className="tabular-nums">
                          {plan.max_backups === -1 ? "Ilimitados" : plan.max_backups}
                        </span>
                      </div>
                    </div>
                    <a
                      href="https://cryptogest.app/pricing"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-2"
                    >
                      Mejorar plan <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                )}
              </CardContent>
            </Card>

            {/* Usage card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Uso actual</CardTitle>
              </CardHeader>
              <CardContent>
                {usage ? (
                  <div className="space-y-4">
                    {/* Storage usage */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <HardDrive className="h-3.5 w-3.5" />
                          Almacenamiento
                        </span>
                        <span className="tabular-nums text-xs">
                          {formatBytes(usage.storage_used_bytes)} / {formatBytes(usage.max_storage_bytes)}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            usage.max_storage_bytes > 0 && usage.storage_used_bytes / usage.max_storage_bytes > 0.9
                              ? "bg-red-500"
                              : usage.max_storage_bytes > 0 && usage.storage_used_bytes / usage.max_storage_bytes > 0.7
                              ? "bg-amber-500"
                              : "bg-primary"
                          }`}
                          style={{
                            width: `${usage.max_storage_bytes > 0
                              ? Math.min((usage.storage_used_bytes / usage.max_storage_bytes) * 100, 100)
                              : 0}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Backups usage */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Database className="h-3.5 w-3.5" />
                          Backups
                        </span>
                        <span className="tabular-nums text-xs">
                          {usage.backup_count} / {usage.unlimited_backups ? "∞" : usage.max_backups}
                        </span>
                      </div>
                      {!usage.unlimited_backups && (
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              usage.max_backups > 0 && usage.backup_count / usage.max_backups > 0.9
                                ? "bg-red-500"
                                : usage.max_backups > 0 && usage.backup_count / usage.max_backups > 0.7
                                ? "bg-amber-500"
                                : "bg-primary"
                            }`}
                            style={{
                              width: `${usage.max_backups > 0
                                ? Math.min((usage.backup_count / usage.max_backups) * 100, 100)
                                : 0}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Remaining */}
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>Espacio restante: {formatBytes(usage.storage_remaining_bytes)}</p>
                      {!usage.unlimited_backups && usage.backups_remaining !== null && (
                        <p>Backups restantes: {usage.backups_remaining}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                )}
              </CardContent>
            </Card>
          </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ============================================ */}
      {/* Dialogs */}
      {/* ============================================ */}

      {/* Upload notes dialog */}
      <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir backup a la nube</DialogTitle>
            <DialogDescription>
              Se creará una copia de seguridad de todos tus datos y se subirá a CryptoGest Cloud.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="upload-notes">Notas (opcional)</Label>
            <Textarea
              id="upload-notes"
              value={uploadNotes}
              onChange={(e) => setUploadNotes(e.target.value)}
              placeholder="Ej: Backup antes de actualizar..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotesDialog(false)} disabled={isUploading}>
              Cancelar
            </Button>
            <Button onClick={() => { setShowNotesDialog(false); handleUpload() }} disabled={isUploading}>
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Subir backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import confirmation */}
      <AlertDialog open={importConfirmId !== null} onOpenChange={(open) => !open && setImportConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Importar backup desde la nube?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción reemplazará todos los datos actuales de tu empresa con los datos del backup.
              Deberás volver a iniciar sesión después de la importación.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isImporting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => importConfirmId !== null && handleImport(importConfirmId)}
              disabled={isImporting}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isImporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowDownToLine className="mr-2 h-4 w-4" />
              )}
              Importar y reemplazar datos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar backup de la nube?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente el backup del servidor. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId !== null && handleDelete(deleteConfirmId)}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disconnect confirmation */}
      <AlertDialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar de CryptoGest Cloud?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la configuración de conexión. Tus backups en la nube no se verán afectados
              y podrás volver a conectar en cualquier momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect}>
              <LogOut className="mr-2 h-4 w-4" />
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
