import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cloud,
  Database,
  FolderOpen,
  HardDrive,
  Loader2,
  Lock,
  Plus,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput, estimatePasswordStrength } from "@/components/ui/password-input"
import { CloudLoginPrompt } from "@/components/CloudLoginPrompt"
import type { CloudSession, CreationStep, LocationMode, VolumeInfo } from "./types"

interface Props {
  cloudSession: CloudSession | null
  onCloudSessionChange: (session: CloudSession | null) => void
  isSubmitting: boolean
  error: string | null
  onCreate: (args: {
    nombre: string
    mode: LocationMode
    customPath?: string
    cloudPassphrase?: string
  }) => Promise<void>
  onCancel: () => void
  onErrorClear: () => void
}

export function CreateEmpresaWizard({
  cloudSession,
  onCloudSessionChange,
  isSubmitting,
  error,
  onCreate,
  onCancel,
  onErrorClear,
}: Props) {
  const { t } = useTranslation(['auth', 'common'])
  const [step, setStep] = useState<CreationStep>('name')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<LocationMode>('default')
  const [customPath, setCustomPath] = useState<string | null>(null)
  const [defaultPath, setDefaultPath] = useState('')
  const [volumes, setVolumes] = useState<VolumeInfo[]>([])
  const [loadingVolumes, setLoadingVolumes] = useState(false)
  const [cloudPassphrase, setCloudPassphrase] = useState('')
  const [cloudPassphraseConfirm, setCloudPassphraseConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const loadLocationData = useCallback(async () => {
    setLoadingVolumes(true)
    try {
      const [defaultRes, volumesRes] = await Promise.all([
        window.electronAPI?.empresa.getDefaultPath(),
        window.electronAPI?.empresa.detectVolumes(),
      ])
      if (defaultRes?.success && defaultRes.data) setDefaultPath(defaultRes.data.path)
      if (volumesRes?.success && volumesRes.data) {
        setVolumes(volumesRes.data.filter((v) => v.available))
      }
    } catch {
      // silent
    } finally {
      setLoadingVolumes(false)
    }
  }, [])

  useEffect(() => {
    if (step === 'location') loadLocationData()
  }, [step, loadLocationData])

  const handleNext = () => {
    if (!name.trim()) return
    setLocalError(null)
    onErrorClear()
    setStep('location')
  }

  const handleSelectCustomFolder = async () => {
    const result = await window.electronAPI?.empresa.selectDirectory()
    if (result?.success && result.data) {
      setCustomPath(result.data.path)
      setMode('custom')
    }
  }

  const handleSubmit = async () => {
    setLocalError(null)
    if (mode === 'cloud') {
      if (!cloudPassphrase || cloudPassphrase.length < 6) {
        setLocalError(t('auth:passwordMinLength'))
        return
      }
      if (cloudPassphrase !== cloudPassphraseConfirm) {
        setLocalError(t('auth:passwordsDoNotMatch'))
        return
      }
    }
    const selectedPath =
      mode === 'custom' || mode === 'volume' ? customPath ?? undefined : undefined
    await onCreate({
      nombre: name.trim(),
      mode,
      customPath: selectedPath,
      cloudPassphrase: mode === 'cloud' ? cloudPassphrase : undefined,
    })
  }

  const displayError = localError || error

  return (
    <div className="relative rounded-lg border border-hairline bg-surface-2 p-5 space-y-3 animate-expand">
      <button
        onClick={onCancel}
        className="absolute top-3 right-3 h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors duration-150"
        aria-label={t('common:cancel')}
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {step === 'name' ? (
        <>
          <label className="text-[13px] font-medium text-foreground block">
            {t('empresaSelector.createNewCompany')}
          </label>
          <Input
            className="h-10 text-[15px]"
            placeholder={t('empresaSelector.companyNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNext()
              if (e.key === 'Escape') onCancel()
            }}
            autoFocus
          />
          {displayError && (
            <p className="text-[13px] text-destructive">{displayError}</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button onClick={handleNext} disabled={!name.trim()} className="flex-1">
              {t('common:next')}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 pb-1">
            <span className="text-[13px] text-muted-foreground">
              {t('empresaSelector.locationFor')}{' '}
              <span className="text-foreground font-medium">{name}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <OptionTile
              selected={mode === 'default'}
              icon={<Database className="h-4 w-4" />}
              title={t('empresaSelector.defaultFolder')}
              subtitle={defaultPath || '…'}
              monoSubtitle
              onClick={() => {
                setMode('default')
                setCustomPath(null)
              }}
            />

            {loadingVolumes ? (
              <div className="flex items-center gap-2 p-3 rounded-md border border-hairline bg-surface-1">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-[13px] text-muted-foreground">
                  {t('empresaSelector.detectingDisks')}
                </span>
              </div>
            ) : (
              volumes.map((vol) => (
                <OptionTile
                  key={vol.path}
                  selected={mode === 'volume' && customPath === vol.path}
                  icon={<HardDrive className="h-4 w-4" />}
                  title={vol.name}
                  subtitle={vol.path}
                  monoSubtitle
                  onClick={() => {
                    setMode('volume')
                    setCustomPath(vol.path)
                  }}
                />
              ))
            )}

            <OptionTile
              selected={mode === 'cloud'}
              icon={<Cloud className="h-4 w-4 text-primary" />}
              title={t('empresaSelector.cloudOption')}
              subtitle={t('empresaSelector.cloudOptionDesc')}
              onClick={() => {
                setMode('cloud')
                setCustomPath(null)
              }}
              accent
            />

            <OptionTile
              selected={mode === 'custom'}
              icon={<FolderOpen className="h-4 w-4" />}
              title={t('empresaSelector.chooseFolder')}
              subtitle={
                mode === 'custom' && customPath
                  ? customPath
                  : t('empresaSelector.openSelector')
              }
              monoSubtitle={mode === 'custom' && !!customPath}
              onClick={handleSelectCustomFolder}
            />
          </div>

          {mode === 'cloud' && (
            <div className="pt-3 mt-1 border-t border-hairline space-y-3">
              <h3 className="text-[13px] font-medium text-foreground flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-brand" />
                {t('empresaSelector.cloudEncryption', { defaultValue: 'Cifrado de la empresa' })}
              </h3>
              {cloudSession ? (
                <>
                  <div className="flex items-center gap-2 p-2.5 rounded-md bg-success/10 border border-success/20">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    <span className="text-[13px] text-success">
                      {t('empresaSelector.cloudSessionActive', {
                        email: cloudSession.user.email,
                        defaultValue: 'Connected as {{email}}',
                      })}
                    </span>
                  </div>
                  <PasswordInput
                    value={cloudPassphrase}
                    onChange={(e) => setCloudPassphrase(e.target.value)}
                    placeholder={t('empresaSelector.passphrase')}
                    hint={t('empresaSelector.passphraseHint')}
                    strength={estimatePasswordStrength(cloudPassphrase)}
                    autoComplete="new-password"
                  />
                  <PasswordInput
                    value={cloudPassphraseConfirm}
                    onChange={(e) => setCloudPassphraseConfirm(e.target.value)}
                    placeholder={t('empresaSelector.passphraseConfirm')}
                    error={
                      !!cloudPassphraseConfirm && cloudPassphrase !== cloudPassphraseConfirm
                    }
                    hint={
                      cloudPassphraseConfirm && cloudPassphrase !== cloudPassphraseConfirm
                        ? t('auth:passwordsDoNotMatch')
                        : undefined
                    }
                    autoComplete="new-password"
                  />
                </>
              ) : (
                <CloudLoginPrompt onConnected={onCloudSessionChange} />
              )}
            </div>
          )}

          {displayError && (
            <p className="text-[13px] text-destructive">{displayError}</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setStep('name')} className="text-[13px]">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              {t('common:back')}
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Plus className="h-4 w-4 mr-1.5" />
              )}
              {t('empresaSelector.createCompany')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function OptionTile({
  selected,
  icon,
  title,
  subtitle,
  monoSubtitle,
  accent,
  onClick,
}: {
  selected: boolean
  icon: React.ReactNode
  title: string
  subtitle: string
  monoSubtitle?: boolean
  accent?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-md border transition-colors duration-150 min-h-[72px] ${
        selected
          ? accent
            ? 'border-primary/50 bg-primary/5'
            : 'border-primary/50 bg-surface-3'
          : 'border-hairline bg-surface-1 hover:bg-surface-3'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className="shrink-0 mt-0.5 text-muted-foreground">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-foreground truncate">{title}</p>
          <p
            className={`text-[11px] text-muted-foreground truncate ${
              monoSubtitle ? 'font-mono' : ''
            }`}
          >
            {subtitle}
          </p>
        </div>
        {selected && (
          <CheckCircle2
            className={`h-4 w-4 shrink-0 ${accent ? 'text-primary' : 'text-primary'}`}
          />
        )}
      </div>
    </button>
  )
}
