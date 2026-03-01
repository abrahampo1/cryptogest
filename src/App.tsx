import { useState, useEffect } from 'react'
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
import { AuthPage } from '@/pages/AuthPage'
import { EmpresaSelectorPage } from '@/pages/EmpresaSelectorPage'
import { SetupWizardPage } from '@/pages/SetupWizardPage'
import { Loader2, Cloud, ArrowLeft, Lock, CheckCircle2 } from 'lucide-react'
import { CloudLoginPrompt } from '@/components/CloudLoginPrompt'

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
          setPhase('cloud-auth')
        } else {
          setIsCloudEmpresa(false)
          setPhase('auth')
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
  }

  const handleAuthenticated = () => {
    setPhase('authenticated')
  }

  const handleLock = async () => {
    if (!window.electronAPI?.auth) return
    try {
      const result = await window.electronAPI.auth.lock()
      if (result.success) {
        setPhase(isCloudEmpresa ? 'cloud-auth' : 'auth')
        setCurrentPage('dashboard')
        setCloudPassphrase('')
        setCloudAuthError(null)
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
        setPhase('authenticated')
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
    setPhase('empresa-selector')
  }

  const handleBackFromAuth = async () => {
    setActiveEmpresa(null)
    setPhase('empresa-selector')
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
      case 'buzon':
        return <BuzonPage />
      case 'cloud':
        return <CloudPage deepLinkResult={deepLinkResult} onDeepLinkHandled={() => setDeepLinkResult(null)} onHelp={() => navigateToManual('cloud')} isCloudEmpresa={isCloudEmpresa} cloudSession={cloudSession} onCloudSessionChange={handleCloudSessionChange} />
      case 'configuracion':
        return <ConfiguracionPage onHelp={() => navigateToManual('configuracion')} buzonEnabled={buzonEnabled} onBuzonToggle={(v) => { localStorage.setItem('beta.buzon', v ? 'true' : 'false'); setBuzonEnabled(v) }} isCloudEmpresa={isCloudEmpresa} />
      case 'manual':
        return <ManualPage section={manualSection} />
      default:
        return <DashboardPage onNavigate={setCurrentPage} onHelp={() => navigateToManual('dashboard')} />
    }
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-slate-400">{t('loading')}</p>
        </div>
      </div>
    )
  }

  if (phase === 'setup-wizard') {
    return <SetupWizardPage onComplete={handleSetupComplete} />
  }

  if (phase === 'empresa-selector') {
    return (
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
    )
  }

  if (phase === 'auth') {
    return (
      <AuthPage
        onAuthenticated={handleAuthenticated}
        empresaNombre={activeEmpresa?.nombre}
        onBack={handleBackFromAuth}
      />
    )
  }

  if (phase === 'cloud-auth') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-full max-w-md p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 mb-4">
              <Cloud className="h-8 w-8 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">{t('auth:empresaSelector.cloudPassphraseTitle', 'Unlock Cloud Company')}</h1>
            <p className="text-sm text-slate-400">{activeEmpresa?.nombre}</p>
            <p className="text-xs text-slate-500 mt-1">{t('auth:empresaSelector.cloudPassphraseDesc', 'Enter the passphrase to decrypt the data')}</p>
          </div>
          {!cloudSession ? (
            <div className="space-y-4">
              <CloudLoginPrompt onConnected={handleCloudSessionChange} />
              <button
                onClick={handleBackFromAuth}
                className="w-full py-2 text-slate-400 hover:text-white text-sm transition-colors flex items-center justify-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" />
                {t('common:back', 'Back')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs text-green-400">{t('auth:empresaSelector.cloudSessionActive', { email: cloudSession.user.email, defaultValue: 'Connected as {{email}}' })}</span>
              </div>
              <div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    value={cloudPassphrase}
                    onChange={(e) => setCloudPassphrase(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCloudAuth()}
                    placeholder={t('auth:empresaSelector.passphrase', 'Passphrase')}
                    className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
              </div>
              {cloudAuthError && (
                <p className="text-sm text-red-400">{cloudAuthError}</p>
              )}
              <button
                onClick={handleCloudAuth}
                disabled={!cloudPassphrase || cloudAuthLoading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {cloudAuthLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('auth:unlock', 'Unlock')
                )}
              </button>
              <button
                onClick={handleBackFromAuth}
                className="w-full py-2 text-slate-400 hover:text-white text-sm transition-colors flex items-center justify-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" />
                {t('common:back', 'Back')}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout
      currentPage={currentPage}
      onPageChange={handlePageChange}
      onLock={handleLock}
      onSwitchEmpresa={handleSwitchEmpresa}
      empresaNombre={activeEmpresa?.nombre}
      buzonEnabled={buzonEnabled}
      isCloudEmpresa={isCloudEmpresa}
      cloudSession={cloudSession}
    >
      {renderPage()}
    </DashboardLayout>
  )
}

export default App
