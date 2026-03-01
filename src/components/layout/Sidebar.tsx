import { useState } from "react"
import { useTranslation } from "react-i18next"
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
  Mail,
} from "lucide-react"

export type Page = "dashboard" | "clientes" | "productos" | "facturas" | "gastos" | "ejercicios" | "contabilidad" | "modelos" | "buzon" | "cloud" | "configuracion" | "manual"

interface CloudSession {
  serverUrl: string
  token: string
  user: { id: number; name: string; email: string }
}

interface SidebarProps {
  currentPage: Page
  onPageChange: (page: Page) => void
  onLock?: () => Promise<void>
  onSwitchEmpresa?: () => Promise<void>
  empresaNombre?: string
  buzonEnabled?: boolean
  isCloudEmpresa?: boolean
  cloudSession?: CloudSession | null
}

const menuItems = [
  { id: "dashboard" as Page, labelKey: "dashboard", icon: LayoutDashboard },
  { id: "clientes" as Page, labelKey: "clientes", icon: Users },
  { id: "productos" as Page, labelKey: "productos", icon: Package },
  { id: "facturas" as Page, labelKey: "facturas", icon: FileText },
  { id: "gastos" as Page, labelKey: "gastos", icon: Receipt },
  { id: "ejercicios" as Page, labelKey: "ejercicios", icon: Calendar },
  { id: "contabilidad" as Page, labelKey: "contabilidad", icon: BookOpen },
  { id: "modelos" as Page, labelKey: "modelos", icon: FileBarChart },
]

const betaItems = [
  { id: "buzon" as Page, labelKey: "buzon", icon: Mail, beta: true },
]

const cloudItems = [
  { id: "cloud" as Page, labelKey: "cloudBackup", icon: Cloud },
]

const configItems = [
  { id: "configuracion" as Page, labelKey: "configuracion", icon: Settings },
]

const helpItems = [
  { id: "manual" as Page, labelKey: "manual", icon: HelpCircle },
]

export function Sidebar({ currentPage, onPageChange, onLock, onSwitchEmpresa, empresaNombre, buzonEnabled, isCloudEmpresa, cloudSession }: SidebarProps) {
  const { t } = useTranslation(['sidebar', 'common'])
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
            {t('modules')}
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
              <span className="truncate">{t(item.labelKey)}</span>
              {isActive && <ChevronRight className="ml-auto h-3 w-3" />}
            </button>
          )
        })}

        {buzonEnabled && (
          <>
            <div className="my-2 border-t border-slate-700" />
            <div className="px-3 py-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                {t('beta')}
              </span>
            </div>
            {betaItems.map((item) => {
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
                  <span className="truncate">{t(item.labelKey)}</span>
                  <span className="text-[9px] bg-amber-500/20 text-amber-400 rounded px-1 py-0.5 leading-none">Beta</span>
                  {isActive && <ChevronRight className="ml-auto h-3 w-3" />}
                </button>
              )
            })}
          </>
        )}

        <div className="my-2 border-t border-slate-700" />

        <div className="px-3 py-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {t('cloud')}
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
              <span className="truncate">{t(item.labelKey)}</span>
              {isActive && <ChevronRight className="ml-auto h-3 w-3" />}
            </button>
          )
        })}

        <div className="my-2 border-t border-slate-700" />

        <div className="px-3 py-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {t('system')}
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
              <span className="truncate">{t(item.labelKey)}</span>
              {isActive && <ChevronRight className="ml-auto h-3 w-3" />}
            </button>
          )
        })}

        <div className="my-2 border-t border-slate-700" />

        <div className="px-3 py-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {t('help')}
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
              <span className="truncate">{t(item.labelKey)}</span>
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
            {t('lockSystem')}
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
            <span className="text-[10px] text-slate-500 block leading-tight">{t('activeCompany')}</span>
            <span className="text-[11px] text-slate-300 truncate block leading-tight flex items-center gap-1">
              {empresaNombre || t('common:noCompany')}
              {isCloudEmpresa && <Cloud className="h-3 w-3 text-blue-400 shrink-0" />}
            </span>
          </div>
          <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />
        </button>
        {cloudSession && (
          <div className="flex items-center gap-1.5 px-1.5 pt-1">
            <Cloud className="h-3 w-3 text-blue-400 shrink-0" />
            <span className="text-[10px] text-slate-500 truncate">{cloudSession.user.email}</span>
          </div>
        )}
      </div>
    </div>
  )
}
