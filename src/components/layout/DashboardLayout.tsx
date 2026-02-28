import { ReactNode } from "react"
import { Sidebar, Page } from "./Sidebar"

interface DashboardLayoutProps {
  children: ReactNode
  currentPage: Page
  onPageChange: (page: Page) => void
  onLock?: () => Promise<void>
  onSwitchEmpresa?: () => Promise<void>
  empresaNombre?: string
  buzonEnabled?: boolean
  isCloudEmpresa?: boolean
}

export function DashboardLayout({ children, currentPage, onPageChange, onLock, onSwitchEmpresa, empresaNombre, buzonEnabled, isCloudEmpresa }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentPage={currentPage} onPageChange={onPageChange} onLock={onLock} onSwitchEmpresa={onSwitchEmpresa} empresaNombre={empresaNombre} buzonEnabled={buzonEnabled} isCloudEmpresa={isCloudEmpresa} />
      <main className="flex-1 overflow-auto">
        <div className="h-full p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
