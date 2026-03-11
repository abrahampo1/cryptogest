import { useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  ChevronDown,
  BookOpen,
  FileBarChart,
  Calendar,
  Building2,
  Cloud,
  HelpCircle,
  Mail,
  ChevronsUpDown,
  Check,
  ArrowLeft,
  UserCog,
  Banknote,
  CalendarOff,
  Clock,
  type LucideIcon,
} from "lucide-react"

export type Page = "dashboard" | "clientes" | "productos" | "facturas" | "gastos" | "ejercicios" | "contabilidad" | "modelos" | "rrhh" | "nominas" | "ausencias" | "jornada" | "sepa" | "buzon" | "cloud" | "configuracion" | "manual"

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
  onSelectEmpresa?: (id: string) => void
  empresaNombre?: string
  empresas?: EmpresaInfo[]
  activeEmpresaId?: string
  buzonEnabled?: boolean
  isCloudEmpresa?: boolean
  cloudSession?: CloudSession | null
}

interface MenuItem {
  id: Page
  labelKey: string
  icon: LucideIcon
  badge?: string
}

interface MenuSection {
  key: string
  labelKey: string
  items: MenuItem[]
  collapsible?: boolean
  defaultOpen?: boolean
  visible?: boolean
}

function NavItem({
  item,
  isActive,
  onClick,
  label,
}: {
  item: MenuItem
  isActive: boolean
  onClick: () => void
  label: string
}) {
  const Icon = item.icon
  return (
    <button
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md mx-2 px-2.5 py-1.5 text-left text-[13px] transition-all duration-150",
        isActive
          ? "bg-primary/15 text-primary font-medium shadow-sm shadow-primary/5"
          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
      )}
      style={{ width: "calc(100% - 16px)" }}
      onClick={onClick}
    >
      <Icon
        className={cn(
          "h-4 w-4 flex-shrink-0 transition-colors",
          isActive ? "text-primary" : "text-slate-500 group-hover:text-slate-400"
        )}
      />
      <span className="truncate flex-1">{label}</span>
      {item.badge && (
        <span className="text-[9px] bg-amber-500/20 text-amber-400 rounded-full px-1.5 py-0.5 leading-none font-medium">
          {item.badge}
        </span>
      )}
      {isActive && <ChevronRight className="h-3 w-3 text-primary/60 flex-shrink-0" />}
    </button>
  )
}

function NavSection({
  section,
  currentPage,
  onPageChange,
  t,
  isOpen,
  onToggle,
}: {
  section: MenuSection
  currentPage: Page
  onPageChange: (page: Page) => void
  t: (key: string) => string
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <div className="mb-1">
      {section.collapsible ? (
        <button
          className="flex w-full items-center gap-1 px-3 py-1.5 group cursor-pointer"
          onClick={onToggle}
        >
          {isOpen ? (
            <ChevronDown className="h-3 w-3 text-slate-600 transition-transform" />
          ) : (
            <ChevronRight className="h-3 w-3 text-slate-600 transition-transform" />
          )}
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 group-hover:text-slate-400 transition-colors">
            {t(section.labelKey)}
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-1 px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 ml-4">
            {t(section.labelKey)}
          </span>
        </div>
      )}

      {isOpen && (
        <div className="space-y-0.5 pb-1">
          {section.items.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              isActive={currentPage === item.id}
              onClick={() => onPageChange(item.id)}
              label={t(item.labelKey)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const menuItems: MenuItem[] = [
  { id: "dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { id: "clientes", labelKey: "clientes", icon: Users },
  { id: "productos", labelKey: "productos", icon: Package },
  { id: "facturas", labelKey: "facturas", icon: FileText },
  { id: "gastos", labelKey: "gastos", icon: Receipt },
  { id: "ejercicios", labelKey: "ejercicios", icon: Calendar },
  { id: "contabilidad", labelKey: "contabilidad", icon: BookOpen },
  { id: "modelos", labelKey: "modelos", icon: FileBarChart },
]

const rrhhItems: MenuItem[] = [
  { id: "rrhh", labelKey: "rrhh", icon: UserCog },
  { id: "nominas", labelKey: "nominas", icon: Banknote },
  { id: "ausencias", labelKey: "ausencias", icon: CalendarOff },
  { id: "jornada", labelKey: "jornada", icon: Clock },
  { id: "sepa", labelKey: "sepa", icon: Building2 },
]

const betaItems: MenuItem[] = [
  { id: "buzon", labelKey: "buzon", icon: Mail, badge: "Beta" },
]

const cloudItems: MenuItem[] = [
  { id: "cloud", labelKey: "cloudBackup", icon: Cloud },
]

const configItems: MenuItem[] = [
  { id: "configuracion", labelKey: "configuracion", icon: Settings },
  { id: "manual", labelKey: "manual", icon: HelpCircle },
]

export function Sidebar({ currentPage, onPageChange, onLock, onSwitchEmpresa, onSelectEmpresa, empresaNombre, empresas, activeEmpresaId, buzonEnabled, isCloudEmpresa, cloudSession }: SidebarProps) {
  const { t } = useTranslation(['sidebar', 'common'])
  const [isLocking, setIsLocking] = useState(false)

  const sections: MenuSection[] = [
    {
      key: "modules",
      labelKey: "modules",
      items: menuItems,
      collapsible: true,
      defaultOpen: true,
    },
    {
      key: "rrhh",
      labelKey: "rrhhSection",
      items: rrhhItems,
      collapsible: true,
      defaultOpen: true,
    },
    {
      key: "beta",
      labelKey: "beta",
      items: betaItems,
      collapsible: true,
      defaultOpen: true,
      visible: buzonEnabled,
    },
    {
      key: "cloud",
      labelKey: "cloud",
      items: cloudItems,
      collapsible: false,
      defaultOpen: true,
    },
    {
      key: "system",
      labelKey: "system",
      items: configItems,
      collapsible: false,
      defaultOpen: true,
    },
  ]

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const section of sections) {
      initial[section.key] = section.defaultOpen !== false
    }
    return initial
  })

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleLock = async () => {
    if (!onLock || isLocking) return
    setIsLocking(true)
    try {
      await onLock()
    } finally {
      setIsLocking(false)
    }
  }

  const visibleSections = sections.filter((s) => s.visible !== false)

  return (
    <div className="flex h-full w-56 flex-col bg-slate-900 text-slate-100">
      {/* Header - Logo */}
      <div className="flex h-12 items-center gap-2.5 border-b border-slate-800 px-4 shrink-0">
        <img src="./assets/logo.png" alt="CryptoGest" className="h-6 w-6" />
        <span className="text-sm font-bold tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
          CryptoGest
        </span>
      </div>

      {/* Scrollable Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-sidebar">
        {visibleSections.map((section, index) => (
          <div key={section.key}>
            {index > 0 && (
              <div className="mx-3 my-1.5 border-t border-slate-800/80" />
            )}
            <NavSection
              section={section}
              currentPage={currentPage}
              onPageChange={onPageChange}
              t={t}
              isOpen={openSections[section.key] !== false}
              onToggle={() => toggleSection(section.key)}
            />
          </div>
        ))}
      </nav>

      {/* Footer - Lock + Empresa */}
      <div className="shrink-0 border-t border-slate-800">
        {/* Lock Button */}
        {onLock && (
          <div className="px-3 pt-2 pb-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center gap-2 border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200 hover:border-slate-600 text-xs h-8 transition-all"
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

        {/* Empresa Selector */}
        <div className="px-3 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-full flex items-center gap-2 text-left hover:bg-slate-800/60 rounded-md px-2 py-2 transition-colors"
              >
                <div className="h-7 w-7 rounded-md bg-slate-800 flex items-center justify-center shrink-0">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-slate-500 block leading-tight">{t('activeCompany')}</span>
                  <span className="text-[11px] text-slate-300 truncate block leading-tight flex items-center gap-1">
                    {empresaNombre || t('common:noCompany')}
                    {isCloudEmpresa && <Cloud className="h-3 w-3 text-blue-400 shrink-0" />}
                  </span>
                </div>
                <ChevronsUpDown className="h-3 w-3 text-slate-600 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52 bg-slate-900 border-slate-700">
              {empresas?.map((empresa) => (
                <DropdownMenuItem
                  key={empresa.id}
                  className="flex items-center gap-2 text-slate-300 focus:bg-slate-800 focus:text-white cursor-pointer"
                  onClick={() => {
                    if (empresa.id !== activeEmpresaId) {
                      onSelectEmpresa?.(empresa.id)
                    }
                  }}
                >
                  <Building2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <span className="truncate text-xs flex-1">{empresa.nombre}</span>
                  {empresa.tipo === 'cloud' && <Cloud className="h-3 w-3 text-blue-400 shrink-0" />}
                  {empresa.id === activeEmpresaId && <Check className="h-3 w-3 text-primary shrink-0" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-slate-700" />
              <DropdownMenuItem
                className="flex items-center gap-2 text-slate-400 focus:bg-slate-800 focus:text-white cursor-pointer"
                onClick={() => onSwitchEmpresa?.()}
              >
                <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs">{t('backToMenu')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {cloudSession && (
            <div className="flex items-center gap-1.5 px-2 pt-1">
              <Cloud className="h-3 w-3 text-blue-400 shrink-0" />
              <span className="text-[10px] text-slate-500 truncate">{cloudSession.user.email}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
