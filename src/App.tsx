import { useState, useEffect } from 'react'
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
import { AuthPage } from '@/pages/AuthPage'
import { EmpresaSelectorPage } from '@/pages/EmpresaSelectorPage'
import { SetupWizardPage } from '@/pages/SetupWizardPage'
import { Loader2 } from 'lucide-react'

type AppPhase = 'loading' | 'setup-wizard' | 'empresa-selector' | 'auth' | 'authenticated'

function App() {
  const [phase, setPhase] = useState<AppPhase>('loading')
  const [empresas, setEmpresas] = useState<EmpresaInfo[]>([])
  const [ultimaEmpresaId, setUltimaEmpresaId] = useState<string | null>(null)
  const [activeEmpresa, setActiveEmpresa] = useState<EmpresaInfo | null>(null)
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [deepLinkResult, setDeepLinkResult] = useState<{ success: boolean; user?: any; server?: string } | null>(null)

  useEffect(() => {
    loadEmpresas()
  }, [])

  // Listen for deep link connection results from main process (fires after auth + API confirm)
  useEffect(() => {
    const cleanup = window.electronAPI?.cloud.onDeepLinkConnected((data) => {
      if (data.success) {
        setDeepLinkResult({ success: true, user: data.user, server: data.server })
        setCurrentPage('cloud')
      }
    })
    return () => cleanup?.()
  }, [])

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
        setPhase('auth')
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
        setPhase('auth')
        setCurrentPage('dashboard')
      }
    } catch (error) {
      console.error('Error al bloquear:', error)
    }
  }

  const handleSwitchEmpresa = async () => {
    try {
      await window.electronAPI?.auth.lock()
    } catch {
      // Puede fallar si no está autenticado
    }
    setActiveEmpresa(null)
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

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage onNavigate={setCurrentPage} />
      case 'clientes':
        return <ClientesPage />
      case 'productos':
        return <ProductosPage />
      case 'facturas':
        return <FacturasPage />
      case 'gastos':
        return <GastosPage />
      case 'ejercicios':
        return <EjerciciosPage />
      case 'contabilidad':
        return <ContabilidadPage />
      case 'modelos':
        return <ModelosHaciendaPage />
      case 'cloud':
        return <CloudPage deepLinkResult={deepLinkResult} onDeepLinkHandled={() => setDeepLinkResult(null)} />
      case 'configuracion':
        return <ConfiguracionPage />
      default:
        return <DashboardPage onNavigate={setCurrentPage} />
    }
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-slate-400">Cargando...</p>
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

  return (
    <DashboardLayout
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      onLock={handleLock}
      onSwitchEmpresa={handleSwitchEmpresa}
      empresaNombre={activeEmpresa?.nombre}
    >
      {renderPage()}
    </DashboardLayout>
  )
}

export default App
