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
}

export function DashboardLayout({ children, currentPage, onPageChange, onLock, onSwitchEmpresa, empresaNombre, buzonEnabled }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentPage={currentPage} onPageChange={onPageChange} onLock={onLock} onSwitchEmpresa={onSwitchEmpresa} empresaNombre={empresaNombre} buzonEnabled={buzonEnabled} />
      <main className="flex-1 overflow-auto">
        <div className="h-full p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
