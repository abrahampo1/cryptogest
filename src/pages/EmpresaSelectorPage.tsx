import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { translateError } from "@/lib/formatting"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Building2,
  Plus,
  Loader2,
  ChevronRight,
  Trash2,
  Pencil,
  X,
  Check,
  ArrowLeft,
  ArrowRight,
  HardDrive,
  FolderOpen,
  CheckCircle2,
  Database,
  Cloud,
  LogOut,
  Download,
} from "lucide-react"
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
import { formatDate } from "@/lib/formatting"
import { CloudLoginPrompt } from "@/components/CloudLoginPrompt"

interface EmpresaInfo {
  id: string
  nombre: string
  dataPath: string | null
  creadaEn: string
  tipo?: 'local' | 'cloud'
  cloudConfig?: {
    empresaId: number
    userId: number
    role: string
    salt: string
    verificationHash: string
  }
}

interface CloudSession {
  serverUrl: string
  token: string
  user: { id: number; name: string; email: string }
}

interface CloudEmpresaInfo {
  id: number
  nombre_encrypted: string
  salt: string
  verification_hash: string
  role: string
  created_at: string
  updated_at: string
}

interface EmpresaSelectorPageProps {
  empresas: EmpresaInfo[]
  ultimaEmpresaId: string | null
  onSelect: (id: string) => void
  onCreated: () => void
  deepLinkResult?: { success: boolean; user?: any; server?: string } | null
  onDeepLinkHandled?: () => void
  cloudSession: CloudSession | null
  onCloudSessionChange: (session: CloudSession | null) => void
}

type CreationStep = "name" | "location"
type LocationMode = "default" | "volume" | "custom" | "cloud"

interface VolumeInfo {
  name: string
  path: string
  available: boolean
}

export function EmpresaSelectorPage({ empresas, ultimaEmpresaId, onSelect, onCreated, deepLinkResult, onDeepLinkHandled, cloudSession, onCloudSessionChange }: EmpresaSelectorPageProps) {
  const { t } = useTranslation(['auth', 'common'])
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<EmpresaInfo | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // 2-step creation
  const [creationStep, setCreationStep] = useState<CreationStep>("name")
  const [locationMode, setLocationMode] = useState<LocationMode>("default")
  const [customDataPath, setCustomDataPath] = useState<string | null>(null)
  const [defaultPath, setDefaultPath] = useState<string>("")
  const [volumes, setVolumes] = useState<VolumeInfo[]>([])
  const [loadingVolumes, setLoadingVolumes] = useState(false)

  // Cloud creation
  const [cloudPassphrase, setCloudPassphrase] = useState("")
  const [cloudPassphraseConfirm, setCloudPassphraseConfirm] = useState("")
  // Join cloud
  const [isJoining, setIsJoining] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const [joinPassphrase, setJoinPassphrase] = useState("")

  // Cloud login fullscreen
  const [showCloudLogin, setShowCloudLogin] = useState(false)

  // Subscription upgrade flow
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState("")
  const [upgradeTargetPlan, setUpgradeTargetPlan] = useState("")
  const [upgradeHasSubscription, setUpgradeHasSubscription] = useState(false)
  const [isPollingSubscription, setIsPollingSubscription] = useState(false)
  const [upgradeSuccess, setUpgradeSuccess] = useState("")

  // Cloud empresas from server
  const [cloudEmpresas, setCloudEmpresas] = useState<CloudEmpresaInfo[]>([])
  const [loadingCloudEmpresas, setLoadingCloudEmpresas] = useState(false)
  const [joiningEmpresaId, setJoiningEmpresaId] = useState<number | null>(null)
  const [addPassphrase, setAddPassphrase] = useState("")

  const loadLocationData = useCallback(async () => {
    setLoadingVolumes(true)
    try {
      const [defaultRes, volumesRes] = await Promise.all([
        window.electronAPI?.empresa.getDefaultPath(),
        window.electronAPI?.empresa.detectVolumes(),
      ])
      if (defaultRes?.success && defaultRes.data) {
        setDefaultPath(defaultRes.data.path)
      }
      if (volumesRes?.success && volumesRes.data) {
        setVolumes(volumesRes.data.filter(v => v.available))
      }
    } catch {
      // silently fail
    } finally {
      setLoadingVolumes(false)
    }
  }, [])

  useEffect(() => {
    if (creationStep === "location") {
      loadLocationData()
    }
  }, [creationStep, loadLocationData])

  // Handle deep link connection result (user logged in via web browser)
  useEffect(() => {
    if (deepLinkResult?.success) {
      // Close fullscreen login if open
      setShowCloudLogin(false)
      // Refresh cloud session from main process
      window.electronAPI?.cloudSession.get().then((result) => {
        if (result?.success && result.data) {
          onCloudSessionChange(result.data)
        }
      })
      onDeepLinkHandled?.()
    }
  }, [deepLinkResult, onDeepLinkHandled, onCloudSessionChange])

  // Fetch cloud empresas when session changes
  const fetchCloudEmpresas = useCallback(async () => {
    if (!cloudSession) {
      setCloudEmpresas([])
      return
    }
    setLoadingCloudEmpresas(true)
    try {
      const result = await window.electronAPI?.empresa.listCloud()
      if (result?.success && result.data) {
        setCloudEmpresas(result.data)
      }
    } catch {
      // silently fail
    } finally {
      setLoadingCloudEmpresas(false)
    }
  }, [cloudSession])

  useEffect(() => {
    fetchCloudEmpresas()
  }, [fetchCloudEmpresas])

  const handleCloudLogout = async () => {
    await window.electronAPI?.cloudSession.logout()
    onCloudSessionChange(null)
    setCloudEmpresas([])
  }

  const handleNameNext = () => {
    if (!newName.trim()) return
    setError(null)
    setCreationStep("location")
  }

  const handleSelectCustomFolder = async () => {
    const result = await window.electronAPI?.empresa.selectDirectory()
    if (result?.success && result.data) {
      setCustomDataPath(result.data.path)
      setLocationMode("custom")
    }
  }

  const resetCreation = () => {
    setIsCreating(false)
    setNewName("")
    setCreationStep("name")
    setLocationMode("default")
    setCustomDataPath(null)
    setError(null)
    setCloudPassphrase("")
    setCloudPassphraseConfirm("")
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    if (locationMode === "cloud") {
      if (!cloudPassphrase || cloudPassphrase.length < 6) {
        setError(t('auth:passwordMinLength'))
        return
      }
      if (cloudPassphrase !== cloudPassphraseConfirm) {
        setError(t('auth:passwordsDoNotMatch'))
        return
      }
    }
    setIsSubmitting(true)
    setError(null)
    try {
      if (locationMode === "cloud") {
        if (!cloudSession) {
          setError(t('empresaSelector.cloudNotConnected', 'Connect to cloud first'))
          setIsSubmitting(false)
          return
        }
        const result = await window.electronAPI?.empresa.create({
          nombre: newName.trim(),
          tipo: 'cloud',
          passphrase: cloudPassphrase,
        })
        if (result?.success) {
          resetCreation()
          onCreated()
          fetchCloudEmpresas()
        } else if ((result as any)?.upgrade_required) {
          const hasSubscription = (result as any)?.has_subscription ?? false
          setUpgradeHasSubscription(hasSubscription)
          setUpgradeTargetPlan((result as any)?.target_plan || 'pro')
          setUpgradeMessage(
            hasSubscription
              ? t('empresaSelector.upgradeRequiredLimit')
              : t('empresaSelector.upgradeRequiredFree')
          )
          setShowUpgradeDialog(true)
        } else {
          setError(result?.error ? translateError(result.error) : t('empresaSelector.errorCreating'))
        }
      } else {
        const selectedPath =
          locationMode === "default" ? undefined :
          (locationMode === "custom" || locationMode === "volume") && customDataPath ? customDataPath :
          undefined
        const result = await window.electronAPI?.empresa.create({
          nombre: newName.trim(),
          ...(selectedPath ? { customDataPath: selectedPath } : {}),
        })
        if (result?.success) {
          resetCreation()
          onCreated()
        } else {
          setError(result?.error ? translateError(result.error) : t('empresaSelector.errorCreating'))
        }
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubscriptionCheckout = async () => {
    setShowUpgradeDialog(false)
    setError(null)
    try {
      const result = await window.electronAPI?.cloud.subscriptionCheckout(upgradeTargetPlan)
      if (result?.success) {
        if (result.data?.upgraded) {
          // Instant upgrade (already subscribed, just swapped plan)
          setUpgradeSuccess(t('empresaSelector.planUpgraded'))
          setTimeout(() => setUpgradeSuccess(""), 5000)
        } else if (result.data?.checkout_url) {
          // Checkout opened in browser, start polling
          setIsPollingSubscription(true)
        }
      } else {
        setError(result?.error || t('empresaSelector.errorCreating'))
      }
    } catch (err) {
      setError(String(err))
    }
  }

  // Poll for subscription activation after checkout
  useEffect(() => {
    if (!isPollingSubscription) return
    const interval = setInterval(async () => {
      try {
        const result = await window.electronAPI?.cloud.plan()
        if (result?.success && result.data?.plan) {
          const plan = result.data.plan
          // Check if plan has changed from free (subscription activated)
          if (plan.slug !== 'free' && plan.max_empresas !== 0) {
            setIsPollingSubscription(false)
            setUpgradeSuccess(t('empresaSelector.subscriptionActivated'))
            setTimeout(() => setUpgradeSuccess(""), 5000)
          }
        }
      } catch {
        // silently retry
      }
    }, 4000)
    const timeout = setTimeout(() => setIsPollingSubscription(false), 600000) // 10 min
    return () => { clearInterval(interval); clearTimeout(timeout) }
  }, [isPollingSubscription, t])

  const handleRename = async (id: string) => {
    if (!editName.trim()) return
    try {
      await window.electronAPI?.empresa.rename(id, editName.trim())
      setEditingId(null)
      onCreated()
    } catch (err) {
      console.error(err)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const result = await window.electronAPI?.empresa.delete(deleteTarget.id)
      if (result?.success) {
        onCreated()
      } else {
        setError(result?.error ? translateError(result.error) : t('empresaSelector.errorDeleting'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }

  const handleJoinCloud = async () => {
    if (!joinCode.trim() || !joinPassphrase) return
    if (!cloudSession) {
      setError(t('empresaSelector.cloudNotConnected', 'Connect to cloud first'))
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await window.electronAPI?.empresa.joinCloud({
        code: joinCode.trim(),
        passphrase: joinPassphrase,
      })
      if (result?.success) {
        setIsJoining(false)
        setJoinCode("")
        setJoinPassphrase("")
        onCreated()
        fetchCloudEmpresas()
      } else {
        setError(result?.error ? translateError(result.error) : t('empresaSelector.errorCreating'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddCloudLocal = async (cloudEmpresa: CloudEmpresaInfo) => {
    if (!addPassphrase) return
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await window.electronAPI?.empresa.addCloudLocal({
        empresaId: cloudEmpresa.id,
        salt: cloudEmpresa.salt,
        verificationHash: cloudEmpresa.verification_hash,
        role: cloudEmpresa.role,
        passphrase: addPassphrase,
      })
      if (result?.success) {
        setJoiningEmpresaId(null)
        setAddPassphrase("")
        onCreated()
      } else {
        setError(result?.error ? translateError(result.error) : t('empresaSelector.errorCreating'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Check if a cloud empresa is already set up locally
  const getLocalEmpresa = (cloudEmpresaId: number): EmpresaInfo | undefined => {
    return empresas.find(e => e.tipo === 'cloud' && e.cloudConfig?.empresaId === cloudEmpresaId)
  }

  // Separate local vs cloud empresas
  const localEmpresas = empresas.filter(e => e.tipo !== 'cloud')
  const hasCloudSection = !!cloudSession

  // Render empresa row (shared for local list)
  const renderEmpresaRow = (empresa: EmpresaInfo) => (
    <div
      key={empresa.id}
      className={`group relative flex items-center gap-3 p-4 rounded-lg border transition-colors cursor-pointer ${
        empresa.id === ultimaEmpresaId
          ? "border-primary/50 bg-slate-800/80 hover:bg-slate-800"
          : "border-slate-700 bg-slate-900/50 hover:bg-slate-800/50"
      }`}
      onClick={() => {
        if (editingId !== empresa.id) onSelect(empresa.id)
      }}
    >
      <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-slate-700/50 shrink-0">
        <Building2 className="h-5 w-5 text-slate-300" />
      </div>
      <div className="flex-1 min-w-0">
        {editingId === empresa.id ? (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Input
              className="h-7 text-sm bg-slate-800 border-slate-600 text-white"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename(empresa.id)
                if (e.key === "Escape") setEditingId(null)
              }}
              autoFocus
            />
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-400 hover:text-green-300" onClick={() => handleRename(empresa.id)}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-300" onClick={() => setEditingId(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-white truncate">{empresa.nombre}</p>
              {empresa.tipo === 'cloud' && (
                <span className="text-[9px] bg-blue-500/20 text-blue-400 rounded px-1 py-0.5 leading-none flex items-center gap-0.5">
                  <Cloud className="h-2.5 w-2.5" />
                  Cloud
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500">
              {t('empresaSelector.createdOn', { date: formatDate(empresa.creadaEn) })}
            </p>
          </>
        )}
      </div>
      {editingId !== empresa.id && (
        <>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-200"
              onClick={() => {
                setEditingId(empresa.id)
                setEditName(empresa.nombre)
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
              onClick={() => setDeleteTarget(empresa)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />
        </>
      )}
    </div>
  )

  // ========== FULLSCREEN CLOUD LOGIN ==========
  if (showCloudLogin) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="h-16 w-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Cloud className="h-8 w-8 text-blue-400" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-white mb-2">{t('empresaSelector.cloudLoginTitle')}</h1>
            <p className="text-sm text-slate-400">{t('empresaSelector.cloudLoginDesc')}</p>
          </div>

          <CloudLoginPrompt onConnected={(session) => {
            setShowCloudLogin(false)
            onCloudSessionChange(session)
          }} />

          <div className="mt-6 text-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-slate-200"
              onClick={() => setShowCloudLogin(false)}
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              {t('common:back')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ========== MAIN SELECTOR ==========
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <img src="./assets/logo.png" alt="CryptoGest" className="h-10 w-10" />
            <h1 className="text-2xl font-bold text-white">CryptoGest</h1>
          </div>
          <p className="text-sm text-slate-400">{t('empresaSelector.selectCompany')}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Local Empresas Section */}
        {(localEmpresas.length > 0 || !hasCloudSection) && (
          <div className="mb-4">
            {hasCloudSection && localEmpresas.length > 0 && (
              <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                {t('empresaSelector.localSection')}
              </h2>
            )}
            <div className="space-y-2">
              {localEmpresas.map(renderEmpresaRow)}

              {empresas.length === 0 && !isCreating && !hasCloudSection && (
                <div className="text-center py-12 text-slate-500">
                  <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{t('empresaSelector.noCompanies')}</p>
                  <p className="text-xs mt-1">{t('empresaSelector.createFirstCompany')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cloud Empresas Section */}
        {hasCloudSection && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Cloud className="h-3.5 w-3.5 text-blue-400" />
                <h2 className="text-xs font-medium text-blue-400 uppercase tracking-wider">
                  {t('empresaSelector.cloudSection')}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">{cloudSession.user.email}</span>
                <button
                  onClick={handleCloudLogout}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-0.5"
                  title={t('empresaSelector.cloudLogout')}
                >
                  <LogOut className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {loadingCloudEmpresas ? (
                <div className="flex items-center justify-center gap-2 py-6 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">{t('empresaSelector.loadingCloudEmpresas')}</span>
                </div>
              ) : cloudEmpresas.length === 0 ? (
                <div className="text-center py-6 text-slate-500">
                  <Cloud className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-xs">{t('empresaSelector.noCloudEmpresas')}</p>
                </div>
              ) : (
                cloudEmpresas.map((ce) => {
                  const localEmpresa = getLocalEmpresa(ce.id)
                  const isExpanded = joiningEmpresaId === ce.id

                  if (localEmpresa) {
                    // Already set up locally — render as normal clickable row
                    return renderEmpresaRow(localEmpresa)
                  }

                  // Not set up locally
                  return (
                    <div key={ce.id} className="rounded-lg border border-slate-700/50 bg-slate-900/30 overflow-hidden">
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-800/30 transition-colors opacity-70 hover:opacity-100"
                        onClick={() => {
                          if (isExpanded) {
                            setJoiningEmpresaId(null)
                            setAddPassphrase("")
                          } else {
                            setJoiningEmpresaId(ce.id)
                            setAddPassphrase("")
                            setError(null)
                          }
                        }}
                      >
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-500/10 shrink-0">
                          <Cloud className="h-5 w-5 text-blue-400/60" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-slate-300 truncate">
                              Cloud Empresa #{ce.id}
                            </p>
                            <span className="text-[9px] bg-slate-700/50 text-slate-400 rounded px-1 py-0.5 leading-none">
                              {ce.role}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500">
                            {t('empresaSelector.notJoined')}
                          </p>
                        </div>
                        <Download className="h-4 w-4 text-slate-500 shrink-0" />
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 space-y-2 border-t border-slate-700/30">
                          <input
                            type="password"
                            value={addPassphrase}
                            onChange={(e) => setAddPassphrase(e.target.value)}
                            placeholder={t('empresaSelector.enterPassphraseToJoin')}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && addPassphrase) handleAddCloudLocal(ce)
                              if (e.key === "Escape") { setJoiningEmpresaId(null); setAddPassphrase("") }
                            }}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleAddCloudLocal(ce)}
                              disabled={!addPassphrase || isSubmitting}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-xs"
                            >
                              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Download className="h-3 w-3 mr-1.5" />}
                              {t('empresaSelector.addToDevice')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setJoiningEmpresaId(null); setAddPassphrase("") }}
                              className="border-slate-600 text-slate-300 hover:bg-slate-800 text-xs"
                            >
                              {t('common:cancel')}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* Cloud Login Button (when not connected) */}
        {!cloudSession && (
          <div className="mb-4">
            <Button
              variant="outline"
              className="w-full border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
              onClick={() => setShowCloudLogin(true)}
            >
              <Cloud className="h-4 w-4 mr-2" />
              {t('empresaSelector.cloudLogin')}
            </Button>
          </div>
        )}

        {/* Crear empresa */}
        {isCreating ? (
          <div className="p-4 rounded-lg border border-slate-700 bg-slate-900/50 space-y-3">
            {creationStep === "name" ? (
              <>
                <Input
                  className="h-9 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                  placeholder={t('empresaSelector.companyNamePlaceholder')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleNameNext()
                    if (e.key === "Escape") resetCreation()
                  }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleNameNext}
                    disabled={!newName.trim()}
                    className="flex-1"
                  >
                    {t('common:next')}
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={resetCreation}
                    className="border-slate-600 text-slate-300 hover:bg-slate-800"
                  >
                    {t('common:cancel')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-slate-400">
                    {t('empresaSelector.locationFor')} <span className="text-slate-200 font-medium">{newName}</span>
                  </span>
                </div>

                {/* Opcion: Por defecto */}
                <button
                  className={`w-full text-left p-2.5 rounded-md border transition-colors ${
                    locationMode === "default"
                      ? "border-primary/50 bg-slate-800/80"
                      : "border-slate-700 bg-slate-800/30 hover:bg-slate-800/50"
                  }`}
                  onClick={() => { setLocationMode("default"); setCustomDataPath(null) }}
                >
                  <div className="flex items-center gap-2.5">
                    <Database className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-white">{t('empresaSelector.defaultFolder')}</span>
                      <p className="text-[10px] text-slate-500 truncate font-mono">{defaultPath || "..."}</p>
                    </div>
                    {locationMode === "default" && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </div>
                </button>

                {/* Discos externos */}
                {loadingVolumes ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-md border border-slate-700 bg-slate-800/30">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                    <span className="text-xs text-slate-500">{t('empresaSelector.detectingDisks')}</span>
                  </div>
                ) : (
                  volumes.map((vol) => (
                    <button
                      key={vol.path}
                      className={`w-full text-left p-2.5 rounded-md border transition-colors ${
                        locationMode === "volume" && customDataPath === vol.path
                          ? "border-primary/50 bg-slate-800/80"
                          : "border-slate-700 bg-slate-800/30 hover:bg-slate-800/50"
                      }`}
                      onClick={() => { setLocationMode("volume"); setCustomDataPath(vol.path) }}
                    >
                      <div className="flex items-center gap-2.5">
                        <HardDrive className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-white">{vol.name}</span>
                          <p className="text-[10px] text-slate-500 truncate font-mono">{vol.path}</p>
                        </div>
                        {locationMode === "volume" && customDataPath === vol.path && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                      </div>
                    </button>
                  ))
                )}

                {/* Cloud option */}
                <button
                  className={`w-full text-left p-2.5 rounded-md border transition-colors ${
                    locationMode === "cloud"
                      ? "border-blue-500/50 bg-blue-500/10"
                      : "border-slate-700 bg-slate-800/30 hover:bg-slate-800/50"
                  }`}
                  onClick={() => { setLocationMode("cloud"); setCustomDataPath(null) }}
                >
                  <div className="flex items-center gap-2.5">
                    <Cloud className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-white">{t('empresaSelector.cloudOption')}</span>
                      <p className="text-[10px] text-slate-500">{t('empresaSelector.cloudOptionDesc')}</p>
                    </div>
                    {locationMode === "cloud" && <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                  </div>
                </button>

                {/* Cloud connection + passphrase fields */}
                {locationMode === "cloud" && (
                  <div className="space-y-3 pl-6 border-l-2 border-blue-500/30">
                    {cloudSession ? (
                      <>
                        {/* Connected — show passphrase fields */}
                        <div className="flex items-center gap-2 p-2 rounded bg-green-500/10 border border-green-500/20">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                          <span className="text-xs text-green-400">{t('empresaSelector.cloudSessionActive', { email: cloudSession.user.email, defaultValue: 'Connected as {{email}}' })}</span>
                        </div>
                        <div>
                          <input
                            type="password"
                            value={cloudPassphrase}
                            onChange={(e) => setCloudPassphrase(e.target.value)}
                            placeholder={t('empresaSelector.passphrase')}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">{t('empresaSelector.passphraseHint')}</p>
                        </div>
                        <input
                          type="password"
                          value={cloudPassphraseConfirm}
                          onChange={(e) => setCloudPassphraseConfirm(e.target.value)}
                          placeholder={t('empresaSelector.passphraseConfirm')}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </>
                    ) : (
                      <CloudLoginPrompt onConnected={onCloudSessionChange} />
                    )}
                  </div>
                )}

                {/* Elegir carpeta */}
                <button
                  className={`w-full text-left p-2.5 rounded-md border transition-colors ${
                    locationMode === "custom"
                      ? "border-primary/50 bg-slate-800/80"
                      : "border-slate-700 bg-slate-800/30 hover:bg-slate-800/50"
                  }`}
                  onClick={handleSelectCustomFolder}
                >
                  <div className="flex items-center gap-2.5">
                    <FolderOpen className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-white">{t('empresaSelector.chooseFolder')}</span>
                      <p className="text-[10px] text-slate-500 truncate font-mono">
                        {locationMode === "custom" && customDataPath ? customDataPath : t('empresaSelector.openSelector')}
                      </p>
                    </div>
                    {locationMode === "custom" && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </div>
                </button>

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCreationStep("name")}
                    className="border-slate-600 text-slate-300 hover:bg-slate-800"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                    {t('common:back')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                    {t('empresaSelector.createCompany')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={resetCreation}
                    className="border-slate-600 text-slate-300 hover:bg-slate-800"
                  >
                    {t('common:cancel')}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full border-slate-700 bg-slate-900/30 text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={() => setIsCreating(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('empresaSelector.createNewCompany')}
            </Button>

            {/* Join Cloud Company */}
            {!isJoining ? (
              <Button
                variant="outline"
                className="w-full border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                onClick={() => setIsJoining(true)}
              >
                <Cloud className="h-4 w-4 mr-2" />
                {t('empresaSelector.joinCloud')}
              </Button>
            ) : (
              <div className="p-4 rounded-lg border border-blue-500/30 bg-slate-900/50 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Cloud className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-medium text-white">{t('empresaSelector.joinCloud')}</span>
                </div>

                {!cloudSession ? (
                  <CloudLoginPrompt onConnected={onCloudSessionChange} />
                ) : (
                  <>
                    <div className="flex items-center gap-2 p-2 rounded bg-green-500/10 border border-green-500/20">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                      <span className="text-xs text-green-400">{t('empresaSelector.cloudSessionActive', { email: cloudSession.user.email, defaultValue: 'Connected as {{email}}' })}</span>
                    </div>
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder={t('empresaSelector.joinCloudCode')}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono tracking-wider"
                      maxLength={8}
                    />
                    <input
                      type="password"
                      value={joinPassphrase}
                      onChange={(e) => setJoinPassphrase(e.target.value)}
                      placeholder={t('empresaSelector.joinCloudPassphrase')}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </>
                )}

                <div className="flex gap-2">
                  {cloudSession && (
                    <Button
                      size="sm"
                      onClick={handleJoinCloud}
                      disabled={!joinCode.trim() || !joinPassphrase || isSubmitting}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Cloud className="h-3.5 w-3.5 mr-1.5" />}
                      {t('empresaSelector.joinCloudButton')}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => { setIsJoining(false); setJoinCode(""); setJoinPassphrase("") }}
                    className="border-slate-600 text-slate-300 hover:bg-slate-800"
                  >
                    {t('common:cancel')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Subscription upgrade dialog */}
        <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('empresaSelector.upgradeRequired')}</AlertDialogTitle>
              <AlertDialogDescription>{upgradeMessage}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleSubscriptionCheckout}>
                {upgradeHasSubscription
                  ? t('empresaSelector.upgradePlan')
                  : t('empresaSelector.subscribePlan')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Polling for subscription activation */}
        {isPollingSubscription && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm mx-4 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
              <p className="font-medium text-sm">{t('empresaSelector.waitingSubscription')}</p>
              <p className="text-xs text-muted-foreground">{t('empresaSelector.completePaymentInBrowser')}</p>
              <Button variant="ghost" size="sm" onClick={() => setIsPollingSubscription(false)}>
                {t('empresaSelector.cancelWait')}
              </Button>
            </div>
          </div>
        )}

        {/* Subscription success message */}
        {upgradeSuccess && (
          <div className="fixed bottom-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {upgradeSuccess}
          </div>
        )}

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('empresaSelector.deleteCompany')}</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget && (
                  <span dangerouslySetInnerHTML={{ __html: t('empresaSelector.deleteCompanyConfirm', { name: deleteTarget.nombre }) }} />
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>{t('common:cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                {t('common:delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
