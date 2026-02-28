import { useState, useEffect, useCallback, useRef } from "react"
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
  ExternalLink,
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

interface EmpresaInfo {
  id: string
  nombre: string
  dataPath: string | null
  creadaEn: string
  tipo?: 'local' | 'cloud'
}

interface EmpresaSelectorPageProps {
  empresas: EmpresaInfo[]
  ultimaEmpresaId: string | null
  onSelect: (id: string) => void
  onCreated: () => void
}

type CreationStep = "name" | "location"
type LocationMode = "default" | "volume" | "custom" | "cloud"

interface VolumeInfo {
  name: string
  path: string
  available: boolean
}

export function EmpresaSelectorPage({ empresas, ultimaEmpresaId, onSelect, onCreated }: EmpresaSelectorPageProps) {
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
  // Cloud connection (inline)
  const [cloudConnected, setCloudConnected] = useState(false)
  const [cloudCheckingConfig, setCloudCheckingConfig] = useState(false)
  const [cloudServerUrl, setCloudServerUrl] = useState("https://cryptogest.app")
  const [cloudToken, setCloudToken] = useState("")
  const [codeDigits, setCodeDigits] = useState(["", "", "", "", "", ""])
  const [isVerifyingCode, setIsVerifyingCode] = useState(false)
  const [deviceName, setDeviceName] = useState("CryptoGest Desktop")
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([])
  // Join cloud
  const [isJoining, setIsJoining] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const [joinPassphrase, setJoinPassphrase] = useState("")

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

  // Check cloud connection when user selects cloud mode
  const checkCloudConnection = useCallback(async () => {
    setCloudCheckingConfig(true)
    try {
      const result = await window.electronAPI?.cloud.getConfig()
      if (result?.success && result.data?.token && result.data?.serverUrl) {
        setCloudConnected(true)
        setCloudToken(result.data.token)
        setCloudServerUrl(result.data.serverUrl)
      } else {
        setCloudConnected(false)
      }
    } catch {
      setCloudConnected(false)
    } finally {
      setCloudCheckingConfig(false)
    }
  }, [])

  useEffect(() => {
    if (locationMode === "cloud") {
      checkCloudConnection()
    }
  }, [locationMode, checkCloudConnection])

  const handleCodeChange = (index: number, value: string) => {
    const char = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-1)
    const newDigits = [...codeDigits]
    newDigits[index] = char
    setCodeDigits(newDigits)
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

  const handleVerifyCloudCode = async () => {
    const code = codeDigits.join("")
    if (code.length !== 6) return
    setIsVerifyingCode(true)
    setError(null)
    try {
      const result = await window.electronAPI?.cloud.verifyCode({ code, server: cloudServerUrl, deviceName: deviceName.trim() || undefined })
      if (result?.success && result.data) {
        setCloudConnected(true)
        setCloudToken(result.data.api_token)
        setCodeDigits(["", "", "", "", "", ""])
      } else {
        setError(result?.error ? translateError(result.error) : t('empresaSelector.codeInvalid', 'Invalid or expired code'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsVerifyingCode(false)
    }
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
    setCodeDigits(["", "", "", "", "", ""])
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
        if (!cloudConnected || !cloudToken || !cloudServerUrl) {
          setError(t('empresaSelector.cloudNotConnected', 'Connect to cloud first'))
          setIsSubmitting(false)
          return
        }
        const result = await window.electronAPI?.empresa.create({
          nombre: newName.trim(),
          tipo: 'cloud',
          passphrase: cloudPassphrase,
          cloudToken: cloudToken,
          serverUrl: cloudServerUrl,
        })
        if (result?.success) {
          resetCreation()
          onCreated()
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
    setIsJoining(true)
    setError(null)
    try {
      // Check cloud connection first
      let token = cloudToken
      let serverUrl = cloudServerUrl
      if (!token) {
        const cloudConfig = await window.electronAPI?.cloud.getConfig()
        if (!cloudConfig?.success || !cloudConfig.data?.token || !cloudConfig.data?.serverUrl) {
          setError(t('empresaSelector.cloudNotConnected', 'Connect to cloud first'))
          setIsJoining(false)
          return
        }
        token = cloudConfig.data.token
        serverUrl = cloudConfig.data.serverUrl
      }
      const result = await window.electronAPI?.empresa.joinCloud({
        code: joinCode.trim(),
        passphrase: joinPassphrase,
        cloudToken: token,
        serverUrl: serverUrl,
      })
      if (result?.success) {
        setIsJoining(false)
        setJoinCode("")
        setJoinPassphrase("")
        onCreated()
      } else {
        setError(result?.error ? translateError(result.error) : t('empresaSelector.errorCreating'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsJoining(false)
    }
  }

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

        {/* Lista de empresas */}
        <div className="space-y-2 mb-4">
          {empresas.map((empresa) => (
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
          ))}

          {empresas.length === 0 && !isCreating && (
            <div className="text-center py-12 text-slate-500">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t('empresaSelector.noCompanies')}</p>
              <p className="text-xs mt-1">{t('empresaSelector.createFirstCompany')}</p>
            </div>
          )}
        </div>

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
                    {cloudCheckingConfig ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                        <span className="text-xs text-slate-400">{t('common:loading', 'Loading...')}</span>
                      </div>
                    ) : cloudConnected ? (
                      <>
                        {/* Connected — show passphrase fields */}
                        <div className="flex items-center gap-2 p-2 rounded bg-green-500/10 border border-green-500/20">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                          <span className="text-xs text-green-400">{t('empresaSelector.cloudConnected', 'Connected to CryptoGest Cloud')}</span>
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
                      <>
                        {/* Not connected — show connection flow */}
                        <p className="text-xs text-slate-400">
                          {t('empresaSelector.cloudConnectFirst', 'Connect your CryptoGest Cloud account to create a cloud company.')}
                        </p>

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-xs"
                          onClick={() => window.electronAPI?.shell.openExternal(`${cloudServerUrl}/login`)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1.5" />
                          {t('empresaSelector.openCloudLogin', 'Open CryptoGest Cloud')}
                        </Button>

                        <div className="flex items-center gap-2">
                          <div className="flex-1 border-t border-slate-700" />
                          <span className="text-[10px] text-slate-500">{t('empresaSelector.orEnterCode', 'or enter device code')}</span>
                          <div className="flex-1 border-t border-slate-700" />
                        </div>

                        <div className="space-y-2">
                          <Input
                            value={deviceName}
                            onChange={(e) => setDeviceName(e.target.value)}
                            placeholder={t('empresaSelector.deviceName', 'Device name')}
                            className="h-7 text-xs bg-slate-800 border-slate-600 text-white text-center"
                            disabled={isVerifyingCode}
                          />
                          <div className="flex items-center justify-center gap-1.5" onPaste={handleCodePaste}>
                            {codeDigits.map((digit, i) => (
                              <Input
                                key={i}
                                ref={(el) => { codeInputRefs.current[i] = el }}
                                value={digit}
                                onChange={(e) => handleCodeChange(i, e.target.value)}
                                onKeyDown={(e) => handleCodeKeyDown(i, e)}
                                className="h-9 w-9 text-center text-sm font-mono uppercase bg-slate-800 border-slate-600 text-white"
                                maxLength={1}
                                disabled={isVerifyingCode}
                              />
                            ))}
                          </div>
                          <Button
                            size="sm"
                            className="w-full text-xs"
                            onClick={handleVerifyCloudCode}
                            disabled={codeDigits.join("").length !== 6 || isVerifyingCode}
                          >
                            {isVerifyingCode ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                            ) : (
                              <Cloud className="h-3 w-3 mr-1.5" />
                            )}
                            {t('empresaSelector.connectCloud', 'Connect')}
                          </Button>
                          <p className="text-[10px] text-slate-500 text-center">
                            {t('empresaSelector.codeHint', 'Generate a code at')}{' '}
                            <button
                              type="button"
                              onClick={() => window.electronAPI?.shell.openExternal(`${cloudServerUrl}/dashboard/devices`)}
                              className="text-blue-400 hover:underline"
                            >
                              {t('empresaSelector.devices', 'Devices')}
                            </button>
                          </p>
                        </div>
                      </>
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
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleJoinCloud}
                    disabled={!joinCode.trim() || !joinPassphrase || isJoining}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    {isJoining ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Cloud className="h-3.5 w-3.5 mr-1.5" />}
                    {t('empresaSelector.joinCloudButton')}
                  </Button>
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
