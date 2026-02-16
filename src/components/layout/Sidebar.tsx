import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard,
  Users,
  FileText,
  Receipt,
  Settings,
  Lock,
  Loader2,
  Package,
  ChevronRight,
  BookOpen,
  FileBarChart,
  Calendar,
  Building2,
  Cloud,
  HelpCircle,
} from "lucide-react"

export type Page = "dashboard" | "clientes" | "productos" | "facturas" | "gastos" | "ejercicios" | "contabilidad" | "modelos" | "cloud" | "configuracion" | "manual"

interface SidebarProps {
  currentPage: Page
  onPageChange: (page: Page) => void
  onLock?: () => Promise<void>
  onSwitchEmpresa?: () => Promise<void>
  empresaNombre?: string
}

const menuItems = [
  { id: "dashboard" as Page, label: "Panel de Control", icon: LayoutDashboard },
  { id: "clientes" as Page, label: "Clientes", icon: Users },
  { id: "productos" as Page, label: "Productos y Servicios", icon: Package },
  { id: "facturas" as Page, label: "Facturación", icon: FileText },
  { id: "gastos" as Page, label: "Gastos", icon: Receipt },
  { id: "ejercicios" as Page, label: "Ejercicios Fiscales", icon: Calendar },
  { id: "contabilidad" as Page, label: "Contabilidad", icon: BookOpen },
  { id: "modelos" as Page, label: "Modelos Fiscales", icon: FileBarChart },
]

const cloudItems = [
  { id: "cloud" as Page, label: "Copias y Licencia", icon: Cloud },
]

const configItems = [
  { id: "configuracion" as Page, label: "Configuración", icon: Settings },
]

const helpItems = [
  { id: "manual" as Page, label: "Manual de Uso", icon: HelpCircle },
]

export function Sidebar({ currentPage, onPageChange, onLock, onSwitchEmpresa, empresaNombre }: SidebarProps) {
  const [isLocking, setIsLocking] = useState(false)

  const handleLock = async () => {
    if (!onLock || isLocking) return
    setIsLocking(true)
    try {
      await onLock()
    } finally {
      setIsLocking(false)
    }
  }

  return (
    <div className="flex h-full w-56 flex-col border-r bg-slate-900 text-slate-100">
      {/* Logo */}
      <div className="flex h-12 items-center gap-2 border-b border-slate-700 px-4">
        <img src="./assets/logo.png" alt="CryptoGest" className="h-6 w-6" />
        <span className="text-sm font-semibold tracking-tight">CryptoGest</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2">
        <div className="px-3 py-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Módulos
          </span>
        </div>
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPage === item.id
          return (
            <button
              key={item.id}
              className={cn(
                "flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-slate-800 text-white border-l-2 border-primary"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border-l-2 border-transparent"
              )}
              onClick={() => onPageChange(item.id)}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
              {isActive && <ChevronRight className="ml-auto h-3 w-3" />}
            </button>
          )
        })}

        <div className="my-2 border-t border-slate-700" />

        <div className="px-3 py-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Nube
          </span>
        </div>
        {cloudItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPage === item.id
          return (
            <button
              key={item.id}
              className={cn(
                "flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-slate-800 text-white border-l-2 border-primary"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border-l-2 border-transparent"
              )}
              onClick={() => onPageChange(item.id)}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
              {isActive && <ChevronRight className="ml-auto h-3 w-3" />}
            </button>
          )
        })}

        <div className="my-2 border-t border-slate-700" />

        <div className="px-3 py-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Sistema
          </span>
        </div>
        {configItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPage === item.id
          return (
            <button
              key={item.id}
              className={cn(
                "flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-slate-800 text-white border-l-2 border-primary"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border-l-2 border-transparent"
              )}
              onClick={() => onPageChange(item.id)}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
              {isActive && <ChevronRight className="ml-auto h-3 w-3" />}
            </button>
          )
        })}

        <div className="my-2 border-t border-slate-700" />

        <div className="px-3 py-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Ayuda
          </span>
        </div>
        {helpItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPage === item.id
          return (
            <button
              key={item.id}
              className={cn(
                "flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-slate-800 text-white border-l-2 border-primary"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border-l-2 border-transparent"
              )}
              onClick={() => onPageChange(item.id)}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
              {isActive && <ChevronRight className="ml-auto h-3 w-3" />}
            </button>
          )
        })}
      </nav>

      {/* Lock Button */}
      {onLock && (
        <div className="border-t border-slate-700 p-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center gap-2 border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white text-xs"
            onClick={handleLock}
            disabled={isLocking}
          >
            {isLocking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Lock className="h-3 w-3" />
            )}
            Bloquear Sistema
          </Button>
        </div>
      )}

      {/* Footer - Empresa activa */}
      <div className="border-t border-slate-700 px-3 py-2">
        <button
          onClick={onSwitchEmpresa}
          className="w-full flex items-center gap-2 text-left hover:bg-slate-800/50 rounded px-1.5 py-1.5 transition-colors"
        >
          <Building2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="text-[10px] text-slate-500 block leading-tight">Empresa activa</span>
            <span className="text-[11px] text-slate-300 truncate block leading-tight">{empresaNombre || 'Sin empresa'}</span>
          </div>
          <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />
        </button>
      </div>
    </div>
  )
}
