import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  InputOTP,
  InputOTPGroup,
} from "@/components/ui/input-otp"
import {
  Building2,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Rocket,
  Shield,
  Database,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from "lucide-react"

interface SetupWizardPageProps {
  onComplete: () => void
}

type WizardStep = "bienvenida" | "empresa" | "seguridad" | "procesando" | "completado"
type InputMode = "password" | "pin"

export function SetupWizardPage({ onComplete }: SetupWizardPageProps) {
  const [step, setStep] = useState<WizardStep>("bienvenida")

  // Empresa
  const [empresaNombre, setEmpresaNombre] = useState("")
  const [empresaNif, setEmpresaNif] = useState("")

  // Seguridad
  const [inputMode, setInputMode] = useState<InputMode>("password")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pin, setPin] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  // Estado
  const [error, setError] = useState<string | null>(null)
  const [processingStep, setProcessingStep] = useState(0)

  const handleEmpresaNext = () => {
    setError(null)
    if (!empresaNombre.trim()) {
      setError("El nombre de la empresa es obligatorio")
      return
    }
    setStep("seguridad")
  }

  const handleSecuritySubmit = async () => {
    setError(null)
    const finalPassword = inputMode === "pin" ? pin : password

    if (inputMode === "pin") {
      if (pin.length < 4 || pin.length > 8) {
        setError("El PIN debe tener entre 4 y 8 dígitos")
        return
      }
      if (!/^\d+$/.test(pin)) {
        setError("El PIN solo debe contener números")
        return
      }
    } else {
      if (password.length < 6) {
        setError("La contraseña debe tener al menos 6 caracteres")
        return
      }
      if (password !== confirmPassword) {
        setError("Las contraseñas no coinciden")
        return
      }
    }

    // Iniciar proceso
    setStep("procesando")
    setProcessingStep(0)

    try {
      // Paso 1: Creando empresa
      await new Promise((r) => setTimeout(r, 400))
      setProcessingStep(1)

      const createResult = await window.electronAPI?.empresa.create({
        nombre: empresaNombre.trim(),
      })
      if (!createResult?.success || !createResult.data) {
        throw new Error(createResult?.error || "Error al crear la empresa")
      }

      const empresaId = createResult.data.id

      // Paso 2: Seleccionando empresa
      setProcessingStep(2)
      await new Promise((r) => setTimeout(r, 300))

      const selectResult = await window.electronAPI?.empresa.select(empresaId)
      if (!selectResult?.success) {
        throw new Error(selectResult?.error || "Error al seleccionar la empresa")
      }

      // Paso 3: Configurando seguridad
      setProcessingStep(3)
      await new Promise((r) => setTimeout(r, 300))

      const authResult = await window.electronAPI?.auth.setup(finalPassword)
      if (!authResult?.success) {
        throw new Error(authResult?.error || "Error al configurar la seguridad")
      }

      // Paso 4: Guardando datos de empresa
      setProcessingStep(4)

      if (empresaNif.trim()) {
        await window.electronAPI?.config.set("empresa_nif", empresaNif.trim())
      }
      await window.electronAPI?.config.set("empresa_nombre", empresaNombre.trim())

      await new Promise((r) => setTimeout(r, 400))

      // Paso 5: Todo listo
      setProcessingStep(5)
      await new Promise((r) => setTimeout(r, 300))

      setStep("completado")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStep("seguridad")
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (step === "empresa") handleEmpresaNext()
      if (step === "seguridad") handleSecuritySubmit()
    }
  }

  // ── Bienvenida ──
  if (step === "bienvenida") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <img src="./assets/logo.png" alt="CryptoGest" className="h-12 w-12" />
            <h1 className="text-3xl font-bold text-white tracking-tight">CryptoGest</h1>
          </div>

          <div className="mb-10">
            <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 mx-auto mb-6">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-3">
              Bienvenido a CryptoGest
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
              Gestión contable segura y privada. Tus datos financieros protegidos
              con encriptación AES-256, sin servidores externos.
            </p>
          </div>

          <div className="space-y-3 text-left mb-10 max-w-xs mx-auto">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-800/50">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/80 shrink-0">
                <Building2 className="h-4 w-4 text-slate-300" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-200">Configura tu empresa</p>
                <p className="text-[11px] text-slate-500">Nombre y datos fiscales básicos</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-800/50">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/80 shrink-0">
                <Lock className="h-4 w-4 text-slate-300" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-200">Protege tus datos</p>
                <p className="text-[11px] text-slate-500">Contraseña maestra o PIN de acceso</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-800/50">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/80 shrink-0">
                <Database className="h-4 w-4 text-slate-300" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-200">Base de datos encriptada</p>
                <p className="text-[11px] text-slate-500">Se crea automáticamente</p>
              </div>
            </div>
          </div>

          <Button
            className="w-full max-w-xs h-11 bg-white text-slate-900 hover:bg-slate-200 font-medium"
            onClick={() => setStep("empresa")}
          >
            Comenzar configuración
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // ── Empresa ──
  if (step === "empresa") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Progress */}
          <div className="flex items-center gap-2 mb-8">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-xs text-primary font-medium">Empresa</span>
            </div>
            <div className="flex-1 h-px bg-slate-800" />
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-slate-700" />
              <span className="text-xs text-slate-600">Seguridad</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 mb-8">
            <img src="./assets/logo.png" alt="CryptoGest" className="h-7 w-7" />
            <span className="text-sm font-semibold text-white">CryptoGest</span>
          </div>

          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-1">Datos de tu empresa</h2>
            <p className="text-sm text-slate-500">
              Introduce el nombre de tu empresa o negocio. Podrás completar el resto más adelante.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nombre" className="text-xs text-slate-400 font-normal">
                Nombre de la empresa *
              </Label>
              <Input
                id="nombre"
                value={empresaNombre}
                onChange={(e) => setEmpresaNombre(e.target.value)}
                onKeyDown={handleKeyPress}
                className="h-10 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-slate-700 focus-visible:ring-offset-slate-950"
                placeholder="Ej: Mi Empresa S.L."
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nif" className="text-xs text-slate-400 font-normal">
                NIF / CIF
                <span className="text-slate-600 ml-1">(opcional)</span>
              </Label>
              <Input
                id="nif"
                value={empresaNif}
                onChange={(e) => setEmpresaNif(e.target.value)}
                onKeyDown={handleKeyPress}
                className="h-10 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-slate-700 focus-visible:ring-offset-slate-950"
                placeholder="Ej: B12345678"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-md bg-red-950/30 border border-red-900/30 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-400" />
                <span className="text-xs text-red-400 leading-relaxed">{error}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-white"
                onClick={() => { setStep("bienvenida"); setError(null) }}
              >
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Atrás
              </Button>
              <Button
                className="flex-1 h-10 bg-white text-slate-900 hover:bg-slate-200 font-medium"
                onClick={handleEmpresaNext}
                disabled={!empresaNombre.trim()}
              >
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          <p className="mt-6 text-[11px] text-slate-700 text-center">
            Puedes gestionar múltiples empresas desde el selector de empresas.
          </p>
        </div>
      </div>
    )
  }

  // ── Seguridad ──
  if (step === "seguridad") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Progress */}
          <div className="flex items-center gap-2 mb-8">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-emerald-500 font-medium">Empresa</span>
            </div>
            <div className="flex-1 h-px bg-slate-800" />
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-xs text-primary font-medium">Seguridad</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 mb-4">
            <img src="./assets/logo.png" alt="CryptoGest" className="h-7 w-7" />
            <span className="text-sm font-semibold text-white">CryptoGest</span>
          </div>

          {/* Empresa badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/60 border border-slate-700/50 mb-6">
            <Building2 className="h-3 w-3 text-slate-400" />
            <span className="text-xs text-slate-300">{empresaNombre}</span>
          </div>

          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-1">Protege tus datos</h2>
            <p className="text-sm text-slate-500">
              Establece una contraseña maestra o PIN para encriptar tu base de datos.
            </p>
          </div>

          {/* Selector contraseña / PIN */}
          <div className="flex gap-1 p-0.5 rounded-md bg-slate-900 border border-slate-800 mb-5">
            <button
              className={`flex-1 text-xs font-medium py-1.5 rounded transition-colors ${
                inputMode === "password"
                  ? "bg-slate-800 text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
              onClick={() => setInputMode("password")}
            >
              Contraseña
            </button>
            <button
              className={`flex-1 text-xs font-medium py-1.5 rounded transition-colors ${
                inputMode === "pin"
                  ? "bg-slate-800 text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
              onClick={() => setInputMode("pin")}
            >
              PIN
            </button>
          </div>

          <div className="space-y-4">
            {inputMode === "password" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs text-slate-400 font-normal">
                    Contraseña maestra
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={handleKeyPress}
                      className="h-10 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 pr-10 focus-visible:ring-slate-700 focus-visible:ring-offset-slate-950"
                      placeholder="Mínimo 6 caracteres"
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

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs text-slate-400 font-normal">
                    Confirmar contraseña
                  </Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={handleKeyPress}
                    className="h-10 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-slate-700 focus-visible:ring-offset-slate-950"
                    placeholder="Repite la contraseña"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <Label className="text-xs text-slate-400 font-normal block text-center">
                  Establece un PIN numérico
                </Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={8}
                    value={pin}
                    onChange={(value) => setPin(value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && pin.length >= 4) {
                        handleSecuritySubmit()
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
                                ? "border-slate-600 ring-1 ring-slate-600"
                                : "border-slate-800"
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
                <p className="text-[11px] text-slate-600 text-center">Mínimo 4 dígitos</p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2.5 rounded-md bg-red-950/30 border border-red-900/30 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-400" />
                <span className="text-xs text-red-400 leading-relaxed">{error}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-white"
                onClick={() => { setStep("empresa"); setError(null) }}
              >
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Atrás
              </Button>
              <Button
                className="flex-1 h-10 bg-white text-slate-900 hover:bg-slate-200 font-medium"
                onClick={handleSecuritySubmit}
                disabled={
                  inputMode === "pin"
                    ? pin.length < 4
                    : !password || !confirmPassword
                }
              >
                <Lock className="mr-2 h-3.5 w-3.5" />
                Configurar seguridad
              </Button>
            </div>

            <p className="mt-4 text-[11px] text-slate-700 text-center leading-relaxed">
              Esta contraseña no se puede recuperar. Asegúrate de guardarla en un lugar seguro.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Procesando ──
  if (step === "procesando") {
    const steps = [
      { icon: Building2, label: "Preparando configuración..." },
      { icon: Building2, label: "Creando empresa..." },
      { icon: Database, label: "Configurando base de datos..." },
      { icon: Shield, label: "Configurando seguridad y encriptación..." },
      { icon: Database, label: "Guardando configuración..." },
      { icon: CheckCircle2, label: "Finalizando..." },
    ]

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2.5 mb-6">
              <img src="./assets/logo.png" alt="CryptoGest" className="h-8 w-8" />
              <span className="text-lg font-semibold text-white tracking-tight">CryptoGest</span>
            </div>
            <h2 className="text-lg font-semibold text-white">Preparando tu empresa</h2>
            <p className="mt-1 text-sm text-slate-500">Esto solo tardará unos segundos...</p>
          </div>

          <div className="space-y-2.5">
            {steps.map((s, i) => {
              const Icon = s.icon
              const isActive = i === processingStep
              const isDone = i < processingStep

              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all duration-300 ${
                    isActive
                      ? "border-primary/50 bg-slate-800/80"
                      : isDone
                        ? "border-emerald-800/40 bg-emerald-950/20"
                        : "border-slate-800/50 bg-slate-900/30"
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                      isActive
                        ? "bg-primary/20"
                        : isDone
                          ? "bg-emerald-900/30"
                          : "bg-slate-800/50"
                    }`}
                  >
                    {isActive ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : isDone ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Icon className="h-3.5 w-3.5 text-slate-600" />
                    )}
                  </div>
                  <span
                    className={`text-sm transition-colors ${
                      isActive
                        ? "text-white"
                        : isDone
                          ? "text-emerald-400/80"
                          : "text-slate-600"
                    }`}
                  >
                    {isDone ? s.label.replace("...", "") : s.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── Completado ──
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <img src="./assets/logo.png" alt="CryptoGest" className="h-8 w-8" />
          <span className="text-lg font-semibold text-white tracking-tight">CryptoGest</span>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-emerald-900/30 border border-emerald-800/40 mx-auto mb-5">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Todo listo</h2>
          <p className="text-sm text-slate-400 mb-1">
            <strong className="text-slate-300">{empresaNombre}</strong> se ha configurado
            correctamente.
          </p>
          <p className="text-sm text-slate-500">
            Tu base de datos está creada y protegida con encriptación AES-256.
          </p>
        </div>

        <div className="space-y-3 text-left mb-8 px-2">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            Empresa creada y configurada
          </div>
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
          className="w-full h-11 bg-white text-slate-900 hover:bg-slate-200 font-medium"
          onClick={onComplete}
        >
          <Rocket className="mr-2 h-4 w-4" />
          Comenzar a usar CryptoGest
        </Button>
      </div>
    </div>
  )
}
