import { ReactNode } from "react"
import { Sidebar, Page } from "./Sidebar"

interface CloudSession {
  serverUrl: string
  token: string
  user: { id: number; name: string; email: string }
}

interface DashboardLayoutProps {
  children: ReactNode
  currentPage: Page
  onPageChange: (page: Page) => void
  onLock?: () => Promise<void>
  onSwitchEmpresa?: () => Promise<void>
  onSelectEmpresa?: (id: string) => void
  empresaNombre?: string
  empresas?: EmpresaInfo[]
  activeEmpresaId?: string
  buzonEnabled?: boolean
  isCloudEmpresa?: boolean
  cloudSession?: CloudSession | null
}

export function DashboardLayout({ children, currentPage, onPageChange, onLock, onSwitchEmpresa, onSelectEmpresa, empresaNombre, empresas, activeEmpresaId, buzonEnabled, isCloudEmpresa, cloudSession }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentPage={currentPage} onPageChange={onPageChange} onLock={onLock} onSwitchEmpresa={onSwitchEmpresa} onSelectEmpresa={onSelectEmpresa} empresaNombre={empresaNombre} empresas={empresas} activeEmpresaId={activeEmpresaId} buzonEnabled={buzonEnabled} isCloudEmpresa={isCloudEmpresa} cloudSession={cloudSession} />
      <main className="flex-1 overflow-auto border-l border-border">
        <div className="h-full p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
