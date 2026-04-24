import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Page } from '@/components/layout/Sidebar'
import { DashboardPage } from '@/pages/DashboardPage'
import { ClientesPage } from '@/pages/ClientesPage'
import { ProductosPage } from '@/pages/ProductosPage'
import { FacturasPage } from '@/pages/FacturasPage'
import { GastosPage } from '@/pages/GastosPage'
import { ConfiguracionPage } from '@/pages/ConfiguracionPage'
import { EjerciciosPage } from '@/pages/EjerciciosPage'
import { ContabilidadPage } from '@/pages/ContabilidadPage'
import { ModelosHaciendaPage } from '@/pages/ModelosHaciendaPage'
import { CloudPage } from '@/pages/CloudPage'
import { ManualPage } from '@/pages/ManualPage'
import { BuzonPage } from '@/pages/BuzonPage'
import { RRHHPage } from '@/pages/RRHHPage'
import { NominasPage } from '@/pages/NominasPage'
import { AusenciasPage } from '@/pages/AusenciasPage'
import { JornadaPage } from '@/pages/JornadaPage'
import { SEPAPage } from '@/pages/SEPAPage'
import { AuthPage } from '@/pages/AuthPage'
import { EmpresaSelectorPage } from '@/pages/EmpresaSelectorPage'
import { SetupWizardPage } from '@/pages/SetupWizardPage'
import { Loader2, Cloud, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { CloudLoginPrompt } from '@/components/CloudLoginPrompt'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'

type AppPhase = 'loading' | 'setup-wizard' | 'empresa-selector' | 'auth' | 'cloud-auth' | 'authenticated'

interface CloudSession {
  serverUrl: string
  token: string
  user: { id: number; name: string; email: string }
}

function App() {
  const { t } = useTranslation('common')
  const [phase, setPhase] = useState<AppPhase>('loading')
  const [empresas, setEmpresas] = useState<EmpresaInfo[]>([])
  const [ultimaEmpresaId, setUltimaEmpresaId] = useState<string | null>(null)
  const [activeEmpresa, setActiveEmpresa] = useState<EmpresaInfo | null>(null)
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [navigateItemId, setNavigateItemId] = useState<number | null>(null)
  const [deepLinkResult, setDeepLinkResult] = useState<{ success: boolean; user?: any; server?: string } | null>(null)
  const [manualSection, setManualSection] = useState<string | undefined>()
  const [buzonEnabled, setBuzonEnabled] = useState(() => localStorage.getItem('beta.buzon') === 'true')
  const [isCloudEmpresa, setIsCloudEmpresa] = useState(false)
  const [cloudPassphrase, setCloudPassphrase] = useState('')
  const [cloudAuthError, setCloudAuthError] = useState<string | null>(null)
  const [cloudAuthLoading, setCloudAuthLoading] = useState(false)
  const [cloudSession, setCloudSession] = useState<CloudSession | null>(null)
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null)

  // Page transition state
  const [transitionAnim, setTransitionAnim] = useState<'' | 'exit-forward' | 'enter-forward' | 'exit-back' | 'enter-back'>('')
  const transitionTimeout = useRef<ReturnType<typeof setTimeout>>()

  const transitionTo = useCallback((nextPhase: AppPhase, direction: 'forward' | 'back') => {
    if (transitionTimeout.current) clearTimeout(transitionTimeout.current)
    setTransitionAnim(`exit-${direction}`)
    transitionTimeout.current = setTimeout(() => {
      setPhase(nextPhase)
      setTransitionAnim(`enter-${direction}`)
      transitionTimeout.current = setTimeout(() => {
        setTransitionAnim('')
      }, 360)
    }, 290)
  }, [])

  useEffect(() => {
    loadEmpresas()
    loadCloudSession()
  }, [])

  const loadCloudSession = async () => {
    try {
      const result = await window.electronAPI?.cloudSession.get()
      if (result?.success && result.data) {
        setCloudSession(result.data)
      }
    } catch {
      // Cloud session is optional
    }
  }

  const handleCloudSessionChange = (session: CloudSession | null) => {
    setCloudSession(session)
  }

  // Listen for deep link connection results from main process (fires after auth + API confirm)
  useEffect(() => {
    const cleanup = window.electronAPI?.cloud.onDeepLinkConnected((data) => {
      if (data.success) {
        setDeepLinkResult({ success: true, user: data.user, server: data.server })
        // Refresh cloud session
        loadCloudSession()
        // Only navigate to cloud page if authenticated (not on empresa-selector/setup)
        if (phase === 'authenticated') {
          setCurrentPage('cloud')
        }
      }
    })
    return () => cleanup?.()
  }, [phase])

  // Listen for invite deep link (cryptogest://invite?code=...)
  useEffect(() => {
    const cleanup = window.electronAPI?.cloud.onInviteDeepLink?.((data) => {
      if (data.code) {
        setPendingInviteCode(data.code)
        if (phase !== 'empresa-selector') {
          setPhase('empresa-selector' as AppPhase)
        }
      }
    })
    return () => cleanup?.()
  }, [phase])

  const loadEmpresas = async () => {
    setPhase('loading')
    try {
      const result = await window.electronAPI?.empresa.list()
      if (result?.success && result.data) {
        const { empresas: list, ultimaEmpresaId: lastId } = result.data
        setEmpresas(list)
        setUltimaEmpresaId(lastId)

        if (list.length === 0) {
          setPhase('setup-wizard')
        } else if (list.length === 1) {
          await handleSelectEmpresa(list[0].id)
        } else {
          setPhase('empresa-selector')
        }
      } else {
        setPhase('empresa-selector')
      }
    } catch (error) {
      console.error('Error loading empresas:', error)
      setPhase('empresa-selector')
    }
  }

  const handleSelectEmpresa = async (id: string) => {
    try {
      const result = await window.electronAPI?.empresa.select(id)
      if (result?.success && result.data) {
        setActiveEmpresa(result.data.empresa)
        if (result.data.isCloud) {
          setIsCloudEmpresa(true)
          setCloudPassphrase('')
          setCloudAuthError(null)
          transitionTo('cloud-auth', 'forward')
        } else {
          setIsCloudEmpresa(false)
          transitionTo('auth', 'forward')
        }
      }
    } catch (error) {
      console.error('Error selecting empresa:', error)
    }
  }

  const handleSetupComplete = async () => {
    // After wizard finishes, the empresa is already created, selected, and authenticated
    try {
      const result = await window.electronAPI?.empresa.getActive()
      if (result?.success && result.data) {
        setActiveEmpresa(result.data)
      }
    } catch {
      // empresa info is nice-to-have for the sidebar
    }
    setPhase('authenticated')
    refreshEmpresas()
  }

  const refreshEmpresas = async () => {
    try {
      const result = await window.electronAPI?.empresa.list()
      if (result?.success && result.data) {
        setEmpresas(result.data.empresas)
      }
    } catch {
      // silent
    }
  }

  const handleAuthenticated = () => {
    transitionTo('authenticated', 'forward')
    refreshEmpresas()
  }

  const handleLock = async () => {
    if (!window.electronAPI?.auth) return
    try {
      const result = await window.electronAPI.auth.lock()
      if (result.success) {
        setCurrentPage('dashboard')
        setCloudPassphrase('')
        setCloudAuthError(null)
        transitionTo(isCloudEmpresa ? 'cloud-auth' : 'auth', 'back')
      }
    } catch (error) {
      console.error('Error al bloquear:', error)
    }
  }

  const handleCloudAuth = async () => {
    if (!cloudPassphrase) return
    setCloudAuthLoading(true)
    setCloudAuthError(null)
    try {
      const result = await window.electronAPI?.auth.unlockCloud(cloudPassphrase)
      if (result?.success) {
        transitionTo('authenticated', 'forward')
        refreshEmpresas()
      } else {
        setCloudAuthError(result?.error === 'passwordIncorrect' ? t('auth:passwordIncorrect', 'Incorrect passphrase') : result?.error || 'Error')
      }
    } catch (error) {
      setCloudAuthError(String(error))
    } finally {
      setCloudAuthLoading(false)
    }
  }

  const handleSwitchEmpresa = async () => {
    try {
      await window.electronAPI?.auth.lock()
    } catch {
      // Puede fallar si no está autenticado
    }
    setActiveEmpresa(null)
    setIsCloudEmpresa(false)
    setCurrentPage('dashboard')
    // Recargar lista pero siempre mostrar el selector (no auto-seleccionar)
    try {
      const result = await window.electronAPI?.empresa.list()
      if (result?.success && result.data) {
        setEmpresas(result.data.empresas)
        setUltimaEmpresaId(result.data.ultimaEmpresaId)
      }
    } catch (error) {
      console.error('Error loading empresas:', error)
    }
    transitionTo('empresa-selector', 'back')
  }

  const handleBackFromAuth = async () => {
    setActiveEmpresa(null)
    transitionTo('empresa-selector', 'back')
  }

  const handleNavigateWithItem = (page: Page, itemId?: number) => {
    setNavigateItemId(itemId ?? null)
    setCurrentPage(page)
  }

  const navigateToManual = (section?: string) => {
    setManualSection(section)
    setCurrentPage('manual')
  }

  const handlePageChange = (page: Page) => {
    setNavigateItemId(null)
    setCurrentPage(page)
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage onNavigate={handleNavigateWithItem} onHelp={() => navigateToManual('dashboard')} />
      case 'clientes':
        return <ClientesPage initialItemId={navigateItemId} onHelp={() => navigateToManual('clientes')} />
      case 'productos':
        return <ProductosPage initialItemId={navigateItemId} onHelp={() => navigateToManual('productos')} />
      case 'facturas':
        return <FacturasPage initialItemId={navigateItemId} onHelp={() => navigateToManual('facturas')} />
      case 'gastos':
        return <GastosPage initialItemId={navigateItemId} onHelp={() => navigateToManual('gastos')} />
      case 'ejercicios':
        return <EjerciciosPage onHelp={() => navigateToManual('ejercicios')} />
      case 'contabilidad':
        return <ContabilidadPage onHelp={() => navigateToManual('contabilidad')} />
      case 'modelos':
        return <ModelosHaciendaPage onHelp={() => navigateToManual('modelos')} />
      case 'rrhh':
        return <RRHHPage onHelp={() => navigateToManual('rrhh')} />
      case 'nominas':
        return <NominasPage onHelp={() => navigateToManual('nominas')} />
      case 'ausencias':
        return <AusenciasPage onHelp={() => navigateToManual('ausencias')} />
      case 'jornada':
        return <JornadaPage onHelp={() => navigateToManual('jornada')} />
      case 'sepa':
        return <SEPAPage onHelp={() => navigateToManual('sepa')} />
      case 'buzon':
        return <BuzonPage />
      case 'cloud':
        return <CloudPage deepLinkResult={deepLinkResult} onDeepLinkHandled={() => setDeepLinkResult(null)} onHelp={() => navigateToManual('cloud')} isCloudEmpresa={isCloudEmpresa} cloudSession={cloudSession} onCloudSessionChange={handleCloudSessionChange} />
      case 'configuracion':
        return <ConfiguracionPage onHelp={() => navigateToManual('configuracion')} buzonEnabled={buzonEnabled} onBuzonToggle={(v) => { localStorage.setItem('beta.buzon', v ? 'true' : 'false'); setBuzonEnabled(v) }} isCloudEmpresa={isCloudEmpresa} />
      case 'manual':
        return <ManualPage section={manualSection} onNavigateToPage={(page) => handlePageChange(page as Page)} />
      default:
        return <DashboardPage onNavigate={setCurrentPage} onHelp={() => navigateToManual('dashboard')} />
    }
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-surface-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-[13px] text-muted-foreground">{t('loading')}</p>
        </div>
      </div>
    )
  }

  if (phase === 'setup-wizard') {
    return <SetupWizardPage onComplete={handleSetupComplete} />
  }

  const transitionClass = transitionAnim ? `page-${transitionAnim} overflow-hidden` : ''

  if (phase === 'empresa-selector') {
    return (
      <div className={`min-h-screen bg-surface-1 ${transitionClass}`}>
        <EmpresaSelectorPage
          empresas={empresas}
          ultimaEmpresaId={ultimaEmpresaId}
          onSelect={handleSelectEmpresa}
          onCreated={loadEmpresas}
          deepLinkResult={deepLinkResult}
          onDeepLinkHandled={() => setDeepLinkResult(null)}
          cloudSession={cloudSession}
          onCloudSessionChange={handleCloudSessionChange}
          pendingInviteCode={pendingInviteCode}
          onInviteCodeHandled={() => setPendingInviteCode(null)}
        />
      </div>
    )
  }

  if (phase === 'auth') {
    return (
      <div className={`min-h-screen bg-surface-1 ${transitionClass}`}>
        <AuthPage
          onAuthenticated={handleAuthenticated}
          empresaNombre={activeEmpresa?.nombre}
          onBack={handleBackFromAuth}
        />
      </div>
    )
  }

  if (phase === 'cloud-auth') {
    return (
      <div className={`min-h-screen bg-surface-1 flex items-center justify-center ${transitionClass}`}>
        <div className="w-full max-w-md p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-primary/10 border border-primary/20 mb-4">
              <Cloud className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-[18px] font-semibold text-foreground mb-1 tracking-tight">
              {t('auth:empresaSelector.cloudPassphraseTitle', 'Unlock Cloud Company')}
            </h1>
            <p className="text-[15px] text-foreground">{activeEmpresa?.nombre}</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              {t('auth:empresaSelector.cloudPassphraseDesc', 'Enter the passphrase to decrypt the data')}
            </p>
          </div>
          {!cloudSession ? (
            <div className="space-y-3">
              <CloudLoginPrompt onConnected={handleCloudSessionChange} />
              <Button variant="ghost" onClick={handleBackFromAuth} className="w-full">
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                {t('common:back', 'Back')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 p-2.5 rounded-md bg-success/10 border border-success/20">
                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                <span className="text-[13px] text-success">
                  {t('auth:empresaSelector.cloudSessionActive', {
                    email: cloudSession.user.email,
                    defaultValue: 'Connected as {{email}}',
                  })}
                </span>
              </div>
              <PasswordInput
                value={cloudPassphrase}
                onChange={(e) => setCloudPassphrase(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCloudAuth()}
                placeholder={t('auth:empresaSelector.passphrase', 'Passphrase')}
                error={!!cloudAuthError}
                hint={cloudAuthError || undefined}
                autoComplete="current-password"
                autoFocus
              />
              <Button
                onClick={handleCloudAuth}
                disabled={!cloudPassphrase || cloudAuthLoading}
                className="w-full"
              >
                {cloudAuthLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('auth:unlock', 'Unlock')
                )}
              </Button>
              <Button variant="ghost" onClick={handleBackFromAuth} className="w-full">
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                {t('common:back', 'Back')}
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={transitionClass}>
      <DashboardLayout
        currentPage={currentPage}
        onPageChange={handlePageChange}
        onLock={handleLock}
        onSwitchEmpresa={handleSwitchEmpresa}
        onSelectEmpresa={handleSelectEmpresa}
        empresaNombre={activeEmpresa?.nombre}
        empresas={empresas}
        activeEmpresaId={activeEmpresa?.id}
        buzonEnabled={buzonEnabled}
        isCloudEmpresa={isCloudEmpresa}
        cloudSession={cloudSession}
      >
        {renderPage()}
      </DashboardLayout>
    </div>
  )
}

export default App
