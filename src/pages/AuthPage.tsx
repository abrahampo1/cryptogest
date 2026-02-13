import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  InputOTP,
  InputOTPGroup,
} from '@/components/ui/input-otp'
import {
  Lock,
  Eye,
  EyeOff,
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
  const [mode, setMode] = useState<AuthMode>('loading')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pin, setPin] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [inputMode, setInputMode] = useState<InputMode>('password')
  const [passkeyEnabled, setPasskeyEnabled] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [configuringStep, setConfiguringStep] = useState(0)

  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    if (!window.electronAPI?.auth) {
      setError('API de autenticación no disponible')
      setMode('setup')
      return
    }

    try {
      const result = await window.electronAPI.auth.checkStatus()
      if (result.success && result.data) {
        setMode(result.data.isConfigured ? 'login' : 'setup')
        setPasskeyEnabled(result.data.passkeyEnabled || false)
      } else {
        setError(result.error || 'Error al verificar estado')
        setMode('setup')
      }
    } catch (err) {
      setError('Error de conexión')
      setMode('setup')
    }
  }

  const handleSetup = async () => {
    setError(null)

    const finalPassword = inputMode === 'pin' ? pin : password

    if (inputMode === 'pin') {
      if (pin.length < 4 || pin.length > 8) {
        setError('El PIN debe tener entre 4 y 8 dígitos')
        return
      }
      if (!/^\d+$/.test(pin)) {
        setError('El PIN solo debe contener números')
        return
      }
    } else {
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres')
        return
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden')
        return
      }
    }

    setMode('configuring')
    setConfiguringStep(0)

    try {
      if (!window.electronAPI?.auth) {
        throw new Error('API no disponible')
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
        setError(result.error || 'Error al configurar')
        setMode('setup')
      }
    } catch (err) {
      setError('Error al configurar la seguridad')
      setMode('setup')
    }
  }

  const handleLogin = async () => {
    setError(null)

    const finalPassword = inputMode === 'pin' ? pin : password

    if (!finalPassword) {
      setError('Ingresa tu contraseña o PIN')
      return
    }

    setIsLoading(true)

    try {
      if (!window.electronAPI?.auth) {
        throw new Error('API no disponible')
      }

      const result = await window.electronAPI.auth.unlock(finalPassword)

      if (result.success) {
        onAuthenticated()
      } else {
        setError(result.error || 'Credenciales incorrectas')
        setPassword('')
        setPin('')
      }
    } catch (err) {
      setError('Error al desbloquear')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasskeyLogin = async () => {
    setError(null)
    setIsLoading(true)

    try {
      if (!window.electronAPI?.auth) {
        throw new Error('API no disponible')
      }

      const result = await window.electronAPI.auth.unlockWithPasskey()

      if (result.success) {
        onAuthenticated()
      } else {
        setError(result.error || 'Error de autenticación biométrica')
      }
    } catch (err) {
      setError('Error al usar passkey')
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
          setError(result?.error || 'Error al importar')
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
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto" />
          <p className="mt-3 text-sm text-slate-500">Verificando seguridad...</p>
        </div>
      </div>
    )
  }

  if (mode === 'configuring') {
    const steps = [
      { icon: Lock, label: 'Configurando seguridad...' },
      { icon: Database, label: 'Creando base de datos...' },
      { icon: Shield, label: 'Encriptando datos...' },
      { icon: CheckCircle2, label: 'Finalizando configuración...' },
    ]

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="w-full max-w-sm px-6">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2.5 mb-6">
              <img src="./assets/logo.png" alt="CryptoGest" className="h-8 w-8" />
              <span className="text-lg font-semibold text-white tracking-tight">CryptoGest</span>
            </div>
            {empresaNombre && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/60 border border-slate-700/50 mb-4">
                <Building2 className="h-3 w-3 text-slate-400" />
                <span className="text-xs text-slate-300">{empresaNombre}</span>
              </div>
            )}
            <h2 className="text-lg font-semibold text-white">Preparando tu empresa</h2>
            <p className="mt-1 text-sm text-slate-500">Esto solo tardará unos segundos...</p>
          </div>

          <div className="space-y-3">
            {steps.map((step, i) => {
              const Icon = step.icon
              const isActive = i === configuringStep
              const isDone = i < configuringStep

              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-300 ${
                    isActive
                      ? 'border-primary/50 bg-slate-800/80'
                      : isDone
                        ? 'border-emerald-800/40 bg-emerald-950/20'
                        : 'border-slate-800/50 bg-slate-900/30'
                  }`}
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary/20'
                      : isDone
                        ? 'bg-emerald-900/30'
                        : 'bg-slate-800/50'
                  }`}>
                    {isActive ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : isDone ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Icon className="h-4 w-4 text-slate-600" />
                    )}
                  </div>
                  <span className={`text-sm transition-colors ${
                    isActive ? 'text-white' : isDone ? 'text-emerald-400/80' : 'text-slate-600'
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
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="w-full max-w-sm px-6 text-center">
          <div className="flex items-center justify-center gap-2.5 mb-8">
            <img src="./assets/logo.png" alt="CryptoGest" className="h-8 w-8" />
            <span className="text-lg font-semibold text-white tracking-tight">CryptoGest</span>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-emerald-900/30 border border-emerald-800/40 mx-auto mb-5">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Todo listo</h2>
            {empresaNombre && (
              <p className="text-sm text-slate-400 mb-1">
                <strong className="text-slate-300">{empresaNombre}</strong> se ha configurado correctamente.
              </p>
            )}
            <p className="text-sm text-slate-500">
              Tu base de datos está creada y protegida con encriptación AES-256.
            </p>
          </div>

          <div className="space-y-3 text-left mb-8 px-2">
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              Base de datos encriptada y lista
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              Contraseña maestra configurada
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              Empieza añadiendo clientes, productos y facturas
            </div>
          </div>

          <Button
            className="w-full h-10 bg-white text-slate-900 hover:bg-slate-200 font-medium"
            onClick={onAuthenticated}
          >
            <Rocket className="mr-2 h-4 w-4" />
            Comenzar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Panel izquierdo - Branding */}
      <div className="hidden lg:flex lg:w-[480px] flex-col justify-between bg-slate-900 border-r border-slate-800 p-10">
        <div>
          <div className="flex items-center gap-3">
            <img src="./assets/logo.png" alt="CryptoGest" className="h-9 w-9" />
            <span className="text-lg font-semibold text-white tracking-tight">CryptoGest</span>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-white leading-tight">
            Gestión contable<br />segura y privada
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Tus datos financieros protegidos con encriptación AES-256.
            Sin servidores externos, sin terceros. Todo permanece en tu dispositivo.
          </p>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-slate-400">Encriptación de extremo a extremo</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-slate-400">Almacenamiento 100% local</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-slate-400">Copias de seguridad portátiles</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-600">v1.0.0</p>
      </div>

      {/* Panel derecho - Formulario */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-10">
            <img src="./assets/logo.png" alt="CryptoGest" className="h-8 w-8" />
            <span className="text-lg font-semibold text-white tracking-tight">CryptoGest</span>
          </div>

          {/* Empresa badge + Back */}
          {empresaNombre && (
            <div className="flex items-center gap-2 mb-4">
              {onBack && (
                <button
                  onClick={onBack}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" />
                </button>
              )}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/60 border border-slate-700/50">
                <Building2 className="h-3 w-3 text-slate-400" />
                <span className="text-xs text-slate-300">{empresaNombre}</span>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-xl font-semibold text-white">
              {mode === 'setup' ? 'Configuración inicial' : 'Bienvenido de nuevo'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-400">
              {mode === 'setup'
                ? 'Establece una contraseña maestra para proteger tus datos'
                : 'Introduce tus credenciales para desbloquear'}
            </p>
          </div>

          {/* Passkey - solo en login si está habilitado */}
          {mode === 'login' && passkeyEnabled && (
            <>
              <button
                className="w-full flex items-center gap-4 p-4 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800/80 transition-colors text-left group"
                onClick={handlePasskeyLogin}
                disabled={isLoading}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 group-hover:bg-slate-700 transition-colors">
                  <ScanFace className="h-5 w-5 text-slate-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">Desbloquear con biometría</p>
                  <p className="text-xs text-slate-500">Touch ID, Face ID o Windows Hello</p>
                </div>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                )}
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-slate-950 px-3 text-xs text-slate-600">o</span>
                </div>
              </div>
            </>
          )}

          {/* Selector contraseña / PIN */}
          <div className="flex gap-1 p-0.5 rounded-md bg-slate-900 border border-slate-800 mb-5">
            <button
              className={`flex-1 text-xs font-medium py-1.5 rounded transition-colors ${
                inputMode === 'password'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              onClick={() => setInputMode('password')}
            >
              Contraseña
            </button>
            <button
              className={`flex-1 text-xs font-medium py-1.5 rounded transition-colors ${
                inputMode === 'pin'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              onClick={() => setInputMode('pin')}
            >
              PIN
            </button>
          </div>

          {/* Formulario */}
          <div className="space-y-4">
            {inputMode === 'password' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs text-slate-400 font-normal">
                    {mode === 'setup' ? 'Contraseña maestra' : 'Contraseña'}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="h-10 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 pr-10 focus-visible:ring-slate-700 focus-visible:ring-offset-slate-950"
                      placeholder="Introduce tu contraseña"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {mode === 'setup' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword" className="text-xs text-slate-400 font-normal">
                      Confirmar contraseña
                    </Label>
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="h-10 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-slate-700 focus-visible:ring-offset-slate-950"
                      placeholder="Repite la contraseña"
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <Label className="text-xs text-slate-400 font-normal block text-center">
                  {mode === 'setup' ? 'Establece un PIN numérico' : 'Introduce tu PIN'}
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
                            className={`h-11 w-11 flex items-center justify-center rounded-md border bg-slate-900 text-white text-lg transition-all ${
                              slot.isActive
                                ? 'border-slate-600 ring-1 ring-slate-600'
                                : 'border-slate-800'
                            }`}
                          >
                            {slot.char ? (
                              <span className="text-xl">•</span>
                            ) : slot.isActive ? (
                              <span className="animate-pulse text-slate-600">|</span>
                            ) : null}
                            {slot.hasFakeCaret && (
                              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <div className="h-5 w-px animate-caret-blink bg-white" />
                              </div>
                            )}
                          </div>
                        ))}
                        {pin.length >= 4 && pin.length < 8 && (
                          <div className="h-11 w-11 flex items-center justify-center rounded-md border border-dashed border-slate-800 text-slate-700 text-sm">
                            +
                          </div>
                        )}
                      </InputOTPGroup>
                    )}
                  />
                </div>
                <p className="text-[11px] text-slate-600 text-center">
                  {mode === 'setup' ? 'Mínimo 4 dígitos' : ''}
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 rounded-md bg-red-950/30 border border-red-900/30 px-3 py-2.5 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="text-xs leading-relaxed">{error}</span>
              </div>
            )}

            {/* Import success */}
            {importSuccess && (
              <div className="flex items-start gap-2.5 rounded-md bg-emerald-950/30 border border-emerald-900/30 px-3 py-2.5 text-sm text-emerald-400">
                <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="text-xs leading-relaxed">{importSuccess}</span>
              </div>
            )}

            {/* Submit */}
            <Button
              className="w-full h-10 bg-white text-slate-900 hover:bg-slate-200 font-medium"
              onClick={handleSubmit}
              disabled={isLoading || (inputMode === 'pin' && pin.length < 4)}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === 'setup' ? 'Configurando...' : 'Desbloqueando...'}
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-3.5 w-3.5" />
                  {mode === 'setup' ? 'Crear contraseña' : 'Desbloquear'}
                </>
              )}
            </Button>
          </div>

          {/* Footer actions */}
          <div className="mt-8 pt-6 border-t border-slate-900">
            <button
              onClick={handleImportBackup}
              disabled={isImporting}
              className="w-full flex items-center justify-center gap-2 text-xs text-slate-600 hover:text-slate-400 transition-colors py-2 disabled:opacity-50"
            >
              {isImporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Importar copia de seguridad
            </button>
          </div>

          {/* Security note - solo en setup */}
          {mode === 'setup' && (
            <p className="mt-6 text-[11px] text-slate-700 text-center leading-relaxed">
              Esta contraseña no se puede recuperar. Asegúrate de guardarla en un lugar seguro.
              Todos los datos se encriptan localmente con AES-256.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
