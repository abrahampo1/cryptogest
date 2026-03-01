import { useState, useEffect, useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import { translateError } from "@/lib/formatting"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  ShoppingCart,
  Users,
  UserPlus,
  UserMinus,
  Shield,
  Copy,
  RefreshCw,
} from "lucide-react"
import { formatDateTime } from "@/lib/formatting"

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

// ============================================
// Main Component
// ============================================

interface CloudSession {
  serverUrl: string
  token: string
  user: { id: number; name: string; email: string }
}

interface CloudPageProps {
  deepLinkResult?: { success: boolean; user?: any; server?: string } | null
  onDeepLinkHandled?: () => void
  onHelp?: () => void
  isCloudEmpresa?: boolean
  cloudSession?: CloudSession | null
  onCloudSessionChange?: (session: CloudSession | null) => void
}

export function CloudPage({ deepLinkResult, onDeepLinkHandled, onHelp, isCloudEmpresa, cloudSession, onCloudSessionChange }: CloudPageProps) {
  const { t } = useTranslation(['cloud', 'common'])

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

  // License purchase
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [isPollingLicense, setIsPollingLicense] = useState(false)

  // Code-based connection
  const [codeDigits, setCodeDigits] = useState(["", "", "", "", "", ""])
  const [isVerifyingCode, setIsVerifyingCode] = useState(false)
  const [deviceName, setDeviceName] = useState("CryptoGest Desktop")
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Disconnect
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

  // Messages
  const [successMessage, setSuccessMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  // Cloud empresa user management
  const [cloudUsers, setCloudUsers] = useState<CloudEmpresaUser[]>([])
  const [cloudUsersLoading, setCloudUsersLoading] = useState(false)
  const [inviteRole, setInviteRole] = useState<string>("editor")
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [removeUserId, setRemoveUserId] = useState<number | null>(null)
  const [removeUserName, setRemoveUserName] = useState("")
  const [isRemovingUser, setIsRemovingUser] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

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
      setSuccessMessage(t('connectedAutomatic'))
      // Refresh cloud session
      window.electronAPI?.cloudSession.get().then((result) => {
        if (result?.success && result.data) {
          onCloudSessionChange?.(result.data)
        }
      })
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

  // Load cloud empresa users
  useEffect(() => {
    if (isCloudEmpresa) {
      loadCloudUsers()
    }
  }, [isCloudEmpresa])

  const loadCloudUsers = async () => {
    setCloudUsersLoading(true)
    try {
      const result = await window.electronAPI?.cloudEmpresa.getUsers()
      if (result?.success && result.data) {
        setCloudUsers(result.data)
      }
    } catch (err) {
      console.error("Error loading cloud users:", err)
    } finally {
      setCloudUsersLoading(false)
    }
  }

  const handleInviteUser = async () => {
    setInviteLoading(true)
    setInviteCode(null)
    setInviteUrl(null)
    setLinkCopied(false)
    try {
      const result = await window.electronAPI?.cloudEmpresa.inviteUser(inviteRole)
      if (result?.success && result.data?.code) {
        setInviteCode(result.data.code)
        setInviteUrl(result.data.invite_url || null)
        setSuccessMessage(t('inviteGenerated'))
      } else {
        setErrorMessage(result?.error || "Error")
      }
    } catch (err) {
      setErrorMessage(String(err))
    } finally {
      setInviteLoading(false)
    }
  }

  const handleRemoveUser = async (userId: number) => {
    setIsRemovingUser(true)
    try {
      const result = await window.electronAPI?.cloudEmpresa.removeUser(userId)
      if (result?.success) {
        setSuccessMessage(t('removeUser') + " OK")
        setRemoveUserId(null)
        loadCloudUsers()
      } else {
        setErrorMessage(result?.error || "Error")
      }
    } catch (err) {
      setErrorMessage(String(err))
    } finally {
      setIsRemovingUser(false)
    }
  }

  const handleChangeRole = async (userId: number, newRole: string) => {
    try {
      const result = await window.electronAPI?.cloudEmpresa.updateUserRole(userId, newRole)
      if (result?.success) {
        loadCloudUsers()
      } else {
        setErrorMessage(result?.error || "Error")
      }
    } catch (err) {
      setErrorMessage(String(err))
    }
  }

  const copyInviteCode = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    }
  }

  const copyInviteLink = () => {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    }
  }

  const loadConfig = async () => {
    setIsLoading(true)
    try {
      // Initialize from cloudSession prop if available
      if (cloudSession) {
        setServerUrl(cloudSession.serverUrl)
        setIsConnected(true)
        setUser(cloudSession.user)
      }

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

  const handleCodeChange = (index: number, value: string) => {
    // Only allow alphanumeric
    const char = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-1)
    const newDigits = [...codeDigits]
    newDigits[index] = char
    setCodeDigits(newDigits)
    // Auto-focus next input
    if (char && index < 5) {
      codeInputRefs.current[index + 1]?.focus()
    }
  }

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !codeDigits[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
  }

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6)
    if (pasted.length === 0) return
    const newDigits = [...codeDigits]
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || ""
    }
    setCodeDigits(newDigits)
    const focusIndex = Math.min(pasted.length, 5)
    codeInputRefs.current[focusIndex]?.focus()
  }

  const handleVerifyCode = async () => {
    const code = codeDigits.join("")
    if (code.length !== 6) return
    setIsVerifyingCode(true)
    setErrorMessage("")
    try {
      const result = await window.electronAPI?.cloud.verifyCode({ code, server: serverUrl, deviceName: deviceName.trim() || undefined })
      if (result?.success && result.data) {
        setIsConnected(true)
        setUser(result.data.user)
        setSuccessMessage(t('connectedSuccess'))
        setCodeDigits(["", "", "", "", "", ""])
        // Update cloud session
        const sessionResult = await window.electronAPI?.cloudSession.get()
        if (sessionResult?.success && sessionResult.data) {
          onCloudSessionChange?.(sessionResult.data)
        }
        loadBackups(1)
        loadPlan()
      } else {
        setErrorMessage(result?.error ? translateError(result.error) : t('codeInvalidOrExpired'))
      }
    } catch (err) {
      setErrorMessage(String(err))
    } finally {
      setIsVerifyingCode(false)
    }
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
      setSuccessMessage(t('disconnectedSuccess'))
      onCloudSessionChange?.(null)
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
        setSuccessMessage(t('uploadSuccess'))
        setUploadNotes("")
        setShowNotesDialog(false)
        await Promise.all([loadBackups(1), loadPlan()])
      } else {
        setErrorMessage(result?.error ? translateError(result.error) : t('uploadError'))
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
        setSuccessMessage(t('downloadSuccess', { path: result.data.path }))
      } else if (result?.error !== t('common:operationCancelled')) {
        setErrorMessage(result?.error ? translateError(result.error) : t('downloadError'))
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
        setErrorMessage(result?.error ? translateError(result.error) : t('importError'))
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
        setSuccessMessage(t('deleteSuccess'))
        await Promise.all([loadBackups(meta?.current_page || 1), loadPlan()])
      } else {
        setErrorMessage(result?.error ? translateError(result.error) : t('deleteError'))
      }
    } catch (err) {
      setErrorMessage(String(err))
    } finally {
      setIsDeleting(false)
    }
  }

  // ============================================
  // License purchase
  // ============================================

  const handlePurchaseLicense = async () => {
    setIsPurchasing(true)
    setErrorMessage("")
    try {
      const result = await window.electronAPI?.cloud.licenseCheckout()
      if (result?.success) {
        setIsPollingLicense(true)
      } else {
        setErrorMessage(result?.error ? translateError(result.error) : t('purchaseError'))
      }
    } catch (err) {
      setErrorMessage(String(err))
    } finally {
      setIsPurchasing(false)
    }
  }

  // Poll for license activation after checkout
  useEffect(() => {
    if (!isPollingLicense) return
    const interval = setInterval(async () => {
      const result = await window.electronAPI?.cloud.plan()
      if (result?.success && result.data?.license?.has_license) {
        setLicense(result.data.license)
        setPlan(result.data.plan)
        setUsage(result.data.usage)
        setIsPollingLicense(false)
        setSuccessMessage(t('licenseActivated'))
      }
    }, 4000)
    const timeout = setTimeout(() => setIsPollingLicense(false), 600000)
    return () => { clearInterval(interval); clearTimeout(timeout) }
  }, [isPollingLicense])

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
  // Cloud Empresa — User Management View
  // ============================================

  if (isCloudEmpresa) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <div>
              <h1 className="text-xl font-semibold">{t('empresaCloud')}</h1>
              <p className="text-sm text-muted-foreground">
                {t('cloudEmpresaInfo')}
              </p>
            </div>
            {onHelp && (
              <button onClick={onHelp} className="rounded-full p-1.5 hover:bg-accent transition-colors" title={t('common:viewHelp')}>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">
            <Cloud className="mr-1 h-3 w-3" />
            {t('connected')}
          </Badge>
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

        {/* User Management */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                {t('usersManagement')}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={loadCloudUsers}
                disabled={cloudUsersLoading}
              >
                {cloudUsersLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                {t('common:refresh', 'Refresh')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Users List */}
            {cloudUsersLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : cloudUsers.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t('noUsersYet')}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs">{t('usersList')}</TableHead>
                    <TableHead className="h-9 text-xs">{t('changeRole')}</TableHead>
                    <TableHead className="h-9 text-xs text-right">{t('common:actions', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cloudUsers.map((u) => (
                    <TableRow key={u.id} className="text-sm">
                      <TableCell className="py-2">
                        <div>
                          <p className="font-medium">{u.name} {u.isCurrentUser && <span className="text-xs text-muted-foreground">({t('you')})</span>}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        {u.role === 'owner' ? (
                          <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                            <Shield className="mr-1 h-3 w-3" />
                            {t('roleOwner')}
                          </Badge>
                        ) : u.isCurrentUser ? (
                          <Badge variant="secondary">{t(`role${u.role.charAt(0).toUpperCase() + u.role.slice(1)}`)}</Badge>
                        ) : (
                          <Select value={u.role} onValueChange={(val) => handleChangeRole(u.id, val)}>
                            <SelectTrigger className="h-7 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">{t('roleAdmin')}</SelectItem>
                              <SelectItem value="editor">{t('roleEditor')}</SelectItem>
                              <SelectItem value="viewer">{t('roleViewer')}</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        {u.role !== 'owner' && !u.isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => { setRemoveUserId(u.id); setRemoveUserName(u.name) }}
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Invite User */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              {t('invite')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder={t('inviteRole')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t('roleAdmin')}</SelectItem>
                  <SelectItem value="editor">{t('roleEditor')}</SelectItem>
                  <SelectItem value="viewer">{t('roleViewer')}</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleInviteUser} disabled={inviteLoading} size="sm">
                {inviteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <UserPlus className="h-3.5 w-3.5 mr-1.5" />}
                {t('invite')}
              </Button>
            </div>

            {inviteCode && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 border border-blue-200 bg-blue-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-xs text-blue-600 font-medium mb-1">{t('inviteCode')}</p>
                    <p className="font-mono text-lg font-bold text-blue-800 tracking-wider">{inviteCode}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={copyInviteCode} className="shrink-0">
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    {codeCopied ? t('codeCopied') : t('copyCode')}
                  </Button>
                </div>

                {inviteUrl && (
                  <div className="flex items-center gap-3 p-3 border border-blue-200 bg-blue-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-blue-600 font-medium mb-1">{t('inviteLink')}</p>
                      <p className="text-sm text-blue-800 truncate">{inviteUrl}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={copyInviteLink} className="shrink-0">
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      {linkCopied ? t('linkCopied') : t('copyLink')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Remove User Confirmation */}
        <AlertDialog open={removeUserId !== null} onOpenChange={(open) => !open && setRemoveUserId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('removeUser')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('removeUserConfirm', { name: removeUserName })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isRemovingUser}>{t('common:cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => removeUserId !== null && handleRemoveUser(removeUserId)}
                disabled={isRemovingUser}
                className="bg-red-600 hover:bg-red-700"
              >
                {isRemovingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserMinus className="mr-2 h-4 w-4" />}
                {t('removeUser')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
            <h1 className="text-xl font-semibold">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('subtitleDisconnected')}
            </p>
          </div>
          {onHelp && (
            <button onClick={onHelp} className="rounded-full p-1.5 hover:bg-accent transition-colors" title={t('common:viewHelp')}>
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
                  <p className="text-sm font-medium">{t('enterpriseLicenseActive')}</p>
                  <p className="text-xs text-muted-foreground">
                    {license.purchased_at ? t('purchasedAtPerpetual', { date: formatDateTime(license.purchased_at) }) : "—"}
                  </p>
                </div>
                <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
                  <KeyRound className="mr-1 h-3 w-3" />
                  {t('licensed')}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {errorMessage}
          </div>
        )}

        <div className="max-w-lg mx-auto py-12">
          <div className="text-center space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Cloud className="h-8 w-8 text-primary" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold">{t('connectAccount')}</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {t('connectAccountDescription')}
              </p>
            </div>

            <Button onClick={handleOpenCloud} size="lg" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              {t('loginCloud')}
            </Button>

            <p className="text-xs text-muted-foreground">
              {t('willOpenUrl', { url: serverUrl })}
            </p>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t" />
              <span className="text-xs text-muted-foreground">{t('orConnectWithCode')}</span>
              <div className="flex-1 border-t" />
            </div>

            {/* Code input */}
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t('generateCodeIn')}{" "}
                <button
                  onClick={() => window.electronAPI?.shell.openExternal(`${serverUrl}/dashboard/devices`)}
                  className="text-primary hover:underline"
                >
                  {t('devices')}
                </button>
                {" "}{t('andEnterItHere')}
              </p>
              <div className="max-w-[264px] mx-auto">
                <Input
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder={t('deviceName')}
                  className="h-8 text-sm text-center"
                  disabled={isVerifyingCode}
                />
              </div>
              <div className="flex items-center justify-center gap-2" onPaste={handleCodePaste}>
                {codeDigits.map((digit, i) => (
                  <Input
                    key={i}
                    ref={(el) => { codeInputRefs.current[i] = el }}
                    value={digit}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(i, e)}
                    className="h-11 w-11 text-center text-lg font-mono uppercase"
                    maxLength={1}
                    disabled={isVerifyingCode}
                  />
                ))}
              </div>
              <Button
                onClick={handleVerifyCode}
                disabled={codeDigits.join("").length !== 6 || isVerifyingCode}
                size="sm"
              >
                {isVerifyingCode ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Cloud className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t('connect')}
              </Button>
            </div>
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
        <div className="flex items-center gap-3">
          <div className="text-right text-sm">
            <p className="font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          {plan && <Badge variant="info">{plan.name}</Badge>}
          {license?.has_license && (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
              <KeyRound className="mr-1 h-3 w-3" />
              {t('licensed')}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDisconnectConfirm(true)}
            className="text-xs"
          >
            <LogOut className="mr-1.5 h-3 w-3" />
            {t('disconnect')}
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
          <TabsTrigger value="backups">{t('backups')}</TabsTrigger>
          <TabsTrigger value="plan">{t('planAndUsage')}</TabsTrigger>
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
                {t('uploadBackupToCloud')}
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
                    {t('noBackups')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('noBackupsHint')}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 text-xs">{t('file')}</TableHead>
                        <TableHead className="h-9 text-xs">{t('size')}</TableHead>
                        <TableHead className="h-9 text-xs">{t('common:date')}</TableHead>
                        <TableHead className="h-9 text-xs">{t('common:notes')}</TableHead>
                        <TableHead className="h-9 text-xs text-right">{t('common:actions')}</TableHead>
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
                            {formatDateTime(backup.uploaded_at || backup.created_at)}
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
                                title={t('downloadBackup')}
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
                                title={t('importRestore')}
                                disabled={isDownloading || isUploading || isImporting}
                                onClick={() => setImportConfirmId(backup.id)}
                              >
                                <ArrowDownToLine className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                title={t('common:delete')}
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
                      {t('totalBackups', { count: meta.total })}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        disabled={meta.current_page <= 1 || isLoadingBackups}
                        onClick={() => loadBackups(meta.current_page - 1)}
                      >
                        {t('previous')}
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
                        {t('common:next')}
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
          <Card>
            <CardContent className="py-4">
              {license?.has_license ? (
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
                    <KeyRound className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t('enterpriseLicenseActive')}</p>
                    <p className="text-xs text-muted-foreground">
                      {license.purchased_at ? t('purchasedAt', { date: formatDateTime(license.purchased_at) }) : "—"}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">{t('perpetual')}</Badge>
                </div>
              ) : isPollingLicense ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <div className="text-center">
                    <p className="text-sm font-medium">{t('waitingPayment')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('completePaymentInBrowser')}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setIsPollingLicense(false)}>
                    {t('cancelWait')}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100">
                      <KeyRound className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t('enterpriseLicense')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('enterpriseLicensePrice')}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0 ml-4"
                    onClick={handlePurchaseLicense}
                    disabled={isPurchasing}
                  >
                    {isPurchasing ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {t('buyLicense')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            {/* Plan card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t('currentPlan')}</CardTitle>
              </CardHeader>
              <CardContent>
                {plan ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="info" className="text-sm">{plan.name}</Badge>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t('maxStorage')}</span>
                        <span className="tabular-nums">{formatBytes(plan.max_storage_bytes)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t('maxBackups')}</span>
                        <span className="tabular-nums">
                          {plan.max_backups === -1 ? t('unlimitedPlural') : plan.max_backups}
                        </span>
                      </div>
                    </div>
                    <a
                      href="https://cryptogest.app/pricing"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-2"
                    >
                      {t('upgradePlan')} <ExternalLink className="h-3 w-3" />
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
                <CardTitle className="text-sm font-medium">{t('currentUsage')}</CardTitle>
              </CardHeader>
              <CardContent>
                {usage ? (
                  <div className="space-y-4">
                    {/* Storage usage */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <HardDrive className="h-3.5 w-3.5" />
                          {t('storage')}
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
                          {t('backups')}
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
                      <p>{t('remainingSpace', { space: formatBytes(usage.storage_remaining_bytes) })}</p>
                      {!usage.unlimited_backups && usage.backups_remaining !== null && (
                        <p>{t('remainingBackups', { count: usage.backups_remaining })}</p>
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
            <DialogTitle>{t('uploadDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('uploadDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="upload-notes">{t('uploadNotesLabel')}</Label>
            <Textarea
              id="upload-notes"
              value={uploadNotes}
              onChange={(e) => setUploadNotes(e.target.value)}
              placeholder={t('uploadNotesPlaceholder')}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotesDialog(false)} disabled={isUploading}>
              {t('common:cancel')}
            </Button>
            <Button onClick={() => { setShowNotesDialog(false); handleUpload() }} disabled={isUploading}>
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {t('uploadButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import confirmation */}
      <AlertDialog open={importConfirmId !== null} onOpenChange={(open) => !open && setImportConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('importTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('importDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isImporting}>{t('common:cancel')}</AlertDialogCancel>
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
              {t('importButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('common:cancel')}</AlertDialogCancel>
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
              {t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disconnect confirmation */}
      <AlertDialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('disconnectTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('disconnectDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect}>
              <LogOut className="mr-2 h-4 w-4" />
              {t('disconnect')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
