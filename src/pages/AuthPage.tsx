import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { translateError } from '@/lib/formatting'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordInput, estimatePasswordStrength } from '@/components/ui/password-input'
import {
  InputOTP,
  InputOTPGroup,
} from '@/components/ui/input-otp'
import {
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle,
  ScanFace,
  Upload,
  ChevronRight,
  Building2,
  ArrowLeft,
  Shield,
  Database,
  CheckCircle2,
  Rocket,
} from 'lucide-react'

interface AuthPageProps {
  onAuthenticated: () => void
  empresaNombre?: string
  onBack?: () => void
}

type AuthMode = 'login' | 'setup' | 'loading' | 'configuring' | 'welcome'
type InputMode = 'password' | 'pin'

export function AuthPage({ onAuthenticated, empresaNombre, onBack }: AuthPageProps) {
  const { t } = useTranslation(['auth', 'common'])
  const [mode, setMode] = useState<AuthMode>('loading')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [inputMode, setInputMode] = useState<InputMode>('password')
  const [passkeyEnabled, setPasskeyEnabled] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [configuringStep, setConfiguringStep] = useState(0)
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    checkAuthStatus()
    window.electronAPI?.updater.getVersion().then((r) => {
      if (r.success && r.data) setAppVersion(r.data)
    })
  }, [])

  const checkAuthStatus = async () => {
    if (!window.electronAPI?.auth) {
      setError(t('authApiNotAvailable'))
      setMode('setup')
      return
    }

    try {
      const result = await window.electronAPI.auth.checkStatus()
      if (result.success && result.data) {
        setMode(result.data.isConfigured ? 'login' : 'setup')
        setPasskeyEnabled(result.data.passkeyEnabled || false)
      } else {
        setError(result.error ? translateError(result.error) : t('errorCheckingStatus'))
        setMode('setup')
      }
    } catch (err) {
      setError(t('connectionError'))
      setMode('setup')
    }
  }

  const handleSetup = async () => {
    setError(null)

    const finalPassword = inputMode === 'pin' ? pin : password

    if (inputMode === 'pin') {
      if (pin.length < 4 || pin.length > 8) {
        setError(t('pinLengthError'))
        return
      }
      if (!/^\d+$/.test(pin)) {
        setError(t('pinOnlyNumbers'))
        return
      }
    } else {
      if (password.length < 6) {
        setError(t('passwordMinLength'))
        return
      }
      if (password !== confirmPassword) {
        setError(t('passwordsDoNotMatch'))
        return
      }
    }

    setMode('configuring')
    setConfiguringStep(0)

    try {
      if (!window.electronAPI?.auth) {
        throw new Error(t('apiNotAvailable'))
      }

      // Paso 1: Configurando seguridad
      await new Promise(r => setTimeout(r, 600))
      setConfiguringStep(1)

      const result = await window.electronAPI.auth.setup(finalPassword)

      if (result.success) {
        // Paso 2: Base de datos creada
        setConfiguringStep(2)
        await new Promise(r => setTimeout(r, 500))

        // Paso 3: Todo listo
        setConfiguringStep(3)
        await new Promise(r => setTimeout(r, 400))

        setMode('welcome')
      } else {
        setError(result.error ? translateError(result.error) : t('errorConfiguring'))
        setMode('setup')
      }
    } catch (err) {
      setError(t('errorConfiguring'))
      setMode('setup')
    }
  }

  const handleLogin = async () => {
    setError(null)

    const finalPassword = inputMode === 'pin' ? pin : password

    if (!finalPassword) {
      setError(t('enterPasswordOrPin'))
      return
    }

    setIsLoading(true)

    try {
      if (!window.electronAPI?.auth) {
        throw new Error(t('apiNotAvailable'))
      }

      const result = await window.electronAPI.auth.unlock(finalPassword)

      if (result.success) {
        onAuthenticated()
      } else {
        setError(result.error ? translateError(result.error) : t('incorrectCredentials'))
        setPassword('')
        setPin('')
      }
    } catch (err) {
      setError(t('errorUnlocking'))
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasskeyLogin = async () => {
    setError(null)
    setIsLoading(true)

    try {
      if (!window.electronAPI?.auth) {
        throw new Error(t('apiNotAvailable'))
      }

      const result = await window.electronAPI.auth.unlockWithPasskey()

      if (result.success) {
        onAuthenticated()
      } else {
        setError(result.error ? translateError(result.error) : t('biometricError'))
      }
    } catch (err) {
      setError(t('passkeyError'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (mode === 'login') {
        handleLogin()
      } else if (mode === 'setup') {
        handleSetup()
      }
    }
  }

  const handleImportBackup = async () => {
    setIsImporting(true)
    setError(null)
    setImportSuccess(null)

    try {
      const result = await window.electronAPI?.backup.import()
      if (result?.success && result.data) {
        setImportSuccess(result.data.message || 'Importación completada correctamente')
        await checkAuthStatus()
      } else {
        if (result?.error !== 'Operación cancelada') {
          setError(result?.error ? translateError(result.error) : t('errors:importError'))
        }
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsImporting(false)
    }
  }

  const handleSubmit = () => {
    if (mode === 'login') {
      handleLogin()
    } else {
      handleSetup()
    }
  }

  if (mode === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-1">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="mt-3 text-[13px] text-muted-foreground">{t('verifyingSecurity')}</p>
        </div>
      </div>
    )
  }

  if (mode === 'configuring') {
    const steps = [
      { icon: Lock, label: t('configuringSecurity') },
      { icon: Database, label: t('creatingDatabase') },
      { icon: Shield, label: t('encryptingData') },
      { icon: CheckCircle2, label: t('finalizingSetup') },
    ]

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-1">
        <div className="w-full max-w-sm px-6">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2.5 mb-6">
              <img src="./assets/logo.png" alt="CryptoGest" className="h-8 w-8" />
              <span className="text-[18px] font-semibold text-foreground tracking-tight">CryptoGest</span>
            </div>
            {empresaNombre && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-2 border border-hairline mb-4">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] text-foreground">{empresaNombre}</span>
              </div>
            )}
            <h2 className="text-[18px] font-semibold text-foreground">{t('preparingCompany')}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{t('onlyFewSeconds')}</p>
          </div>

          <div className="space-y-2">
            {steps.map((step, i) => {
              const Icon = step.icon
              const isActive = i === configuringStep
              const isDone = i < configuringStep

              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-3 rounded-md border transition-colors duration-200 ${
                    isActive
                      ? 'border-primary/50 bg-surface-3'
                      : isDone
                        ? 'border-success/30 bg-success/5'
                        : 'border-hairline bg-surface-2'
                  }`}
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                    isActive
                      ? 'bg-primary/15'
                      : isDone
                        ? 'bg-success/15'
                        : 'bg-surface-3'
                  }`}>
                    {isActive ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : isDone ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <span className={`text-[13px] transition-colors ${
                    isActive ? 'text-foreground' : isDone ? 'text-success' : 'text-muted-foreground'
                  }`}>
                    {isDone ? step.label.replace('...', '') : step.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'welcome') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-1">
        <div className="w-full max-w-sm px-6 text-center">
          <div className="flex items-center justify-center gap-2.5 mb-8">
            <img src="./assets/logo.png" alt="CryptoGest" className="h-8 w-8" />
            <span className="text-[18px] font-semibold text-foreground tracking-tight">CryptoGest</span>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-center h-14 w-14 rounded-lg bg-success/10 border border-success/30 mx-auto mb-5">
              <CheckCircle2 className="h-7 w-7 text-success" />
            </div>
            <h2 className="text-[18px] font-semibold text-foreground mb-2 tracking-tight">{t('allReady')}</h2>
            {empresaNombre && (
              <p className="text-[13px] text-foreground mb-1">
                {t('companyConfigured', { name: empresaNombre })}
              </p>
            )}
            <p className="text-[13px] text-muted-foreground">
              {t('dbEncryptedReady')}
            </p>
          </div>

          <div className="space-y-2 text-left mb-8 px-2">
            <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
              <div className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
              {t('dbEncryptedAndReady')}
            </div>
            <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
              <div className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
              {t('masterPasswordConfigured')}
            </div>
            <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
              <div className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
              {t('startAddingData')}
            </div>
          </div>

          <Button className="w-full h-10" onClick={onAuthenticated}>
            <Rocket className="mr-2 h-4 w-4" />
            {t('begin')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-surface-1">
      {/* Panel izquierdo - Formulario */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-10">
            <img src="./assets/logo.png" alt="CryptoGest" className="h-8 w-8" />
            <span className="text-[18px] font-semibold text-foreground tracking-tight">CryptoGest</span>
          </div>

          {/* Empresa badge + Back */}
          {empresaNombre && (
            <div className="flex items-center gap-2 mb-4">
              {onBack && (
                <button
                  onClick={onBack}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t('common:back')}
                >
                  <ArrowLeft className="h-3 w-3" />
                </button>
              )}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-2 border border-hairline">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] text-foreground">{empresaNombre}</span>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-[18px] font-semibold text-foreground tracking-tight">
              {mode === 'setup' ? t('initialSetup') : t('welcomeBack')}
            </h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {mode === 'setup'
                ? t('setupDescription')
                : t('loginDescription')}
            </p>
          </div>

          {/* Passkey - solo en login si está habilitado */}
          {mode === 'login' && passkeyEnabled && (
            <>
              <button
                className="w-full flex items-center gap-4 p-4 rounded-md border border-hairline bg-surface-2 hover:bg-surface-3 transition-colors duration-150 text-left group"
                onClick={handlePasskeyLogin}
                disabled={isLoading}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-3 group-hover:bg-surface-3 transition-colors">
                  <ScanFace className="h-5 w-5 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground">{t('unlockWithBiometrics')}</p>
                  <p className="text-[11px] text-muted-foreground">{t('biometricsDescription')}</p>
                </div>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                )}
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-hairline" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-surface-1 px-3 text-[11px] text-muted-foreground">{t('common:or')}</span>
                </div>
              </div>
            </>
          )}

          {/* Selector contraseña / PIN */}
          <div className="flex gap-1 p-0.5 rounded-md bg-surface-2 border border-hairline mb-5">
            <button
              className={`flex-1 text-[11px] font-medium py-1.5 rounded transition-colors duration-150 ${
                inputMode === 'password'
                  ? 'bg-surface-3 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setInputMode('password')}
            >
              {t('password')}
            </button>
            <button
              className={`flex-1 text-[11px] font-medium py-1.5 rounded transition-colors duration-150 ${
                inputMode === 'pin'
                  ? 'bg-surface-3 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setInputMode('pin')}
            >
              {t('pin')}
            </button>
          </div>

          {/* Formulario */}
          <div className="space-y-4">
            {inputMode === 'password' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-[11px] text-muted-foreground font-normal">
                    {mode === 'setup' ? t('masterPassword') : t('password')}
                  </Label>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={t('enterPassword')}
                    autoFocus
                    autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                    strength={mode === 'setup' ? estimatePasswordStrength(password) : null}
                  />
                </div>

                {mode === 'setup' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword" className="text-[11px] text-muted-foreground font-normal">
                      {t('confirmPassword')}
                    </Label>
                    <PasswordInput
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder={t('repeatPassword')}
                      autoComplete="new-password"
                      error={!!confirmPassword && password !== confirmPassword}
                      hint={
                        confirmPassword && password !== confirmPassword
                          ? t('passwordsDoNotMatch')
                          : undefined
                      }
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <Label className="text-[11px] text-muted-foreground font-normal block text-center">
                  {mode === 'setup' ? t('setNumericPin') : t('enterPin')}
                </Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={8}
                    value={pin}
                    onChange={(value) => setPin(value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && pin.length >= 4) {
                        handleSubmit()
                      }
                    }}
                    autoFocus
                    render={({ slots }) => (
                      <InputOTPGroup className="gap-2">
                        {slots.slice(0, Math.max(4, pin.length + 1, 4)).map((slot, idx) => (
                          <div
                            key={idx}
                            className={`h-11 w-11 flex items-center justify-center rounded-md border bg-surface-2 text-foreground text-lg transition-all ${
                              slot.isActive
                                ? 'border-primary ring-2 ring-primary/40'
                                : 'border-hairline'
                            }`}
                          >
                            {slot.char ? (
                              <span className="text-xl">•</span>
                            ) : slot.isActive ? (
                              <span className="animate-pulse text-muted-foreground">|</span>
                            ) : null}
                            {slot.hasFakeCaret && (
                              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <div className="h-5 w-px animate-caret-blink bg-foreground" />
                              </div>
                            )}
                          </div>
                        ))}
                        {pin.length >= 4 && pin.length < 8 && (
                          <div className="h-11 w-11 flex items-center justify-center rounded-md border border-dashed border-hairline text-muted-foreground text-[13px]">
                            +
                          </div>
                        )}
                      </InputOTPGroup>
                    )}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  {mode === 'setup' ? t('minDigits') : ''}
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="text-[13px] leading-relaxed">{error}</span>
              </div>
            )}

            {/* Import success */}
            {importSuccess && (
              <div className="flex items-start gap-2.5 rounded-md bg-success/10 border border-success/30 px-3 py-2.5 text-success">
                <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="text-[13px] leading-relaxed">{importSuccess}</span>
              </div>
            )}

            {/* Submit */}
            <Button
              className="w-full h-10"
              onClick={handleSubmit}
              disabled={isLoading || (inputMode === 'pin' && pin.length < 4)}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === 'setup' ? t('configuring') : t('unlocking')}
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-3.5 w-3.5" />
                  {mode === 'setup' ? t('createPassword') : t('unlock')}
                </>
              )}
            </Button>
          </div>

          {/* Footer actions */}
          <div className="mt-8 pt-6 border-t border-hairline">
            <button
              onClick={handleImportBackup}
              disabled={isImporting}
              className="w-full flex items-center justify-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors py-2 disabled:opacity-50"
            >
              {isImporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {t('importBackup')}
            </button>
          </div>

          {/* Security note - solo en setup */}
          {mode === 'setup' && (
            <p className="mt-6 text-[11px] text-muted-foreground text-center leading-relaxed">
              {t('securityNote')}
            </p>
          )}
        </div>
      </div>

      {/* Panel derecho - Branding */}
      <div className="hidden lg:flex lg:w-[480px] flex-col justify-between bg-surface-2 border-l border-hairline p-10">
        <div>
          <div className="flex items-center gap-3">
            <img src="./assets/logo.png" alt="CryptoGest" className="h-9 w-9" />
            <span className="text-[18px] font-semibold text-foreground tracking-tight">CryptoGest</span>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-[28px] font-semibold text-foreground leading-tight tracking-tight">
            {t('secureAccounting')}
          </h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {t('secureDescription')}
          </p>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-success" />
              <span className="text-[13px] text-muted-foreground">{t('endToEndEncryption')}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-success" />
              <span className="text-[13px] text-muted-foreground">{t('localStorageOnly')}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-success" />
              <span className="text-[13px] text-muted-foreground">{t('portableBackups')}</span>
            </div>
          </div>
        </div>

        {appVersion && <p className="text-[11px] text-muted-foreground font-mono">v{appVersion}</p>}
      </div>
    </div>
  )
}
