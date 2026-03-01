import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  BookOpen,
  Rocket,
  LayoutDashboard,
  Users,
  Package,
  FileText,
  Receipt,
  Calendar,
  FileBarChart,
  Palette,
  Cloud,
  Settings,
  Shield,
  Lightbulb,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  GraduationCap,
  Home,
  HelpCircle,
  ArrowRight,
  CheckCircle2,
  Pencil,
  Eye,
  Trash2,
  Plus,
  Upload,
  Download,
  Lock,
  Fingerprint,
  Star,
  Paperclip,
  FileUp,
  Save,
  Send,
  Clock,
  XCircle,
  UserPlus,
  Mail,
  FileSearch,
  FolderOpen,
  HardDrive,
  Key,
  ExternalLink,
  Check,
  RotateCcw,
  Trophy,
  Timer,
  Sparkles,
  type LucideIcon,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────

interface ManualPageProps {
  section?: string
  onNavigateToPage?: (page: string) => void
}

// ─── Section metadata ────────────────────────────────────────────────────────

// Section IDs mapped to translation keys for sections
const sectionDefs = [
  { id: "inicio", key: "inicio", icon: Home, color: "text-primary", border: "border-l-primary", bg: "bg-primary/10", group: "inicio" as const },
  { id: "primeros-pasos", key: "primerosPasos", icon: Rocket, color: "text-emerald-600", border: "border-l-emerald-500", bg: "bg-emerald-50", group: "basico" as const },
  { id: "dashboard", key: "dashboard", icon: LayoutDashboard, color: "text-blue-600", border: "border-l-blue-500", bg: "bg-blue-50", group: "basico" as const },
  { id: "clientes", key: "clientes", icon: Users, color: "text-violet-600", border: "border-l-violet-500", bg: "bg-violet-50", group: "basico" as const },
  { id: "productos", key: "productos", icon: Package, color: "text-amber-600", border: "border-l-amber-500", bg: "bg-amber-50", group: "basico" as const },
  { id: "facturas", key: "facturas", icon: FileText, color: "text-rose-600", border: "border-l-rose-500", bg: "bg-rose-50", group: "basico" as const },
  { id: "gastos", key: "gastos", icon: Receipt, color: "text-orange-600", border: "border-l-orange-500", bg: "bg-orange-50", group: "basico" as const },
  { id: "ejercicios", key: "ejercicios", icon: Calendar, color: "text-teal-600", border: "border-l-teal-500", bg: "bg-teal-50", group: "avanzado" as const },
  { id: "contabilidad", key: "contabilidad", icon: BookOpen, color: "text-indigo-600", border: "border-l-indigo-500", bg: "bg-indigo-50", group: "avanzado" as const },
  { id: "modelos", key: "modelos", icon: FileBarChart, color: "text-cyan-600", border: "border-l-cyan-500", bg: "bg-cyan-50", group: "avanzado" as const },
  { id: "plantillas", key: "plantillas", icon: Palette, color: "text-pink-600", border: "border-l-pink-500", bg: "bg-pink-50", group: "sistema" as const },
  { id: "cloud", key: "cloud", icon: Cloud, color: "text-sky-600", border: "border-l-sky-500", bg: "bg-sky-50", group: "sistema" as const },
  { id: "configuracion", key: "configuracion", icon: Settings, color: "text-slate-600", border: "border-l-slate-500", bg: "bg-slate-50", group: "sistema" as const },
  { id: "seguridad", key: "seguridad", icon: Shield, color: "text-red-600", border: "border-l-red-500", bg: "bg-red-50", group: "sistema" as const },
  { id: "glosario", key: "glosario", icon: GraduationCap, color: "text-purple-600", border: "border-l-purple-500", bg: "bg-purple-50", group: "referencia" as const },
]

function useSections() {
  const { t } = useTranslation('manual')
  return useMemo(() => sectionDefs.map(def => ({
    id: def.id,
    title: t(`sections.${def.key}.title`),
    icon: def.icon,
    color: def.color,
    border: def.border,
    bg: def.bg,
    keywords: (t(`sections.${def.key}.keywords`) as string).split(','),
    desc: t(`sections.${def.key}.desc`),
    group: def.group,
  })), [t])
}

function useGroupLabels() {
  const { t } = useTranslation('manual')
  return useMemo((): Record<string, string> => ({
    inicio: t('groupLabels.inicio'),
    basico: t('groupLabels.basico'),
    avanzado: t('groupLabels.avanzado'),
    sistema: t('groupLabels.sistema'),
    referencia: t('groupLabels.referencia'),
  }), [t])
}

// ─── Context & hooks ─────────────────────────────────────────────────────────

interface ManualContextType {
  onNavigateToPage?: (page: string) => void
  readSections: Set<string>
  totalSections: number
}

const ManualContext = createContext<ManualContextType>({ readSections: new Set(), totalSections: 0 })

const READ_SECTIONS_KEY = "manual-read-sections"
const CHECKLIST_PREFIX = "manual-check-"

function useReadSections() {
  const [readSections, setReadSections] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(READ_SECTIONS_KEY)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  const markRead = useCallback((id: string) => {
    setReadSections(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      localStorage.setItem(READ_SECTIONS_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  const resetProgress = useCallback(() => {
    setReadSections(new Set())
    localStorage.removeItem(READ_SECTIONS_KEY)
    // Also clear checklists
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(CHECKLIST_PREFIX)) localStorage.removeItem(k)
    })
  }, [])

  return { readSections, markRead, resetProgress }
}

// Estimated reading time in minutes per section
const readingTimeMap: Record<string, number> = {
  "inicio": 3, "primeros-pasos": 4, "dashboard": 3, "clientes": 3,
  "productos": 3, "facturas": 5, "gastos": 4, "ejercicios": 3,
  "contabilidad": 4, "modelos": 4, "plantillas": 3, "cloud": 5,
  "configuracion": 4, "seguridad": 4, "glosario": 5,
}

// ─── Reusable components ─────────────────────────────────────────────────────

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg bg-blue-50 border border-blue-200 p-4 my-5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100">
        <Lightbulb className="h-3.5 w-3.5 text-blue-600" />
      </div>
      <div className="text-sm text-blue-800 leading-relaxed">{children}</div>
    </div>
  )
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg bg-amber-50 border border-amber-200 p-4 my-5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
      </div>
      <div className="text-sm text-amber-800 leading-relaxed">{children}</div>
    </div>
  )
}

function Step({ n, children, checkId }: { n: number; children: React.ReactNode; checkId?: string }) {
  const [checked, setChecked] = useState(() => checkId ? localStorage.getItem(`${CHECKLIST_PREFIX}${checkId}`) === "1" : false)
  const toggle = checkId ? () => {
    const next = !checked
    setChecked(next)
    localStorage.setItem(`${CHECKLIST_PREFIX}${checkId}`, next ? "1" : "0")
  } : undefined
  return (
    <div className={`flex gap-3 py-3 relative transition-opacity duration-300 ${checked ? "opacity-50" : ""}`}>
      {toggle ? (
        <button onClick={toggle} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold border-2 z-10 transition-all duration-300 ${checked ? "bg-emerald-100 border-emerald-300 scale-95" : "bg-primary/10 border-primary/20 hover:border-primary/40"}`}>
          {checked ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <span className="text-primary">{n}</span>}
        </button>
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary border-2 border-primary/20 z-10">{n}</div>
      )}
      <div className={`text-sm text-muted-foreground pt-1 leading-relaxed transition-all duration-300 ${checked ? "line-through" : ""}`}>{children}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[13px] font-semibold mt-8 mb-3 text-foreground flex items-center gap-2 before:content-[''] before:h-px before:w-4 before:bg-border">{children}</h3>
}

function Concept({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-l-[3px] border-l-purple-400 bg-purple-50/50 border border-purple-100 p-4 my-5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <GraduationCap className="h-3.5 w-3.5 text-purple-500" />
        <span className="text-sm font-semibold text-purple-900">{term}</span>
      </div>
      <p className="text-sm text-purple-800/80 leading-relaxed">{children}</p>
    </div>
  )
}

function Ic({ icon: Icon, label, className }: { icon: LucideIcon; label?: string; className?: string }) {
  return (
    <span className="inline-flex items-center gap-1 mx-0.5 align-baseline">
      <Icon className={`inline h-3.5 w-3.5 shrink-0 ${className || "text-muted-foreground"}`} />
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{children}</p>
}

function FAQ({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-accent/30 transition-colors">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <HelpCircle className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-sm font-medium flex-1">{q}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 ml-9 text-sm text-muted-foreground leading-relaxed animate-fade-in-up" style={{ animationDuration: "0.2s" }}>
          {children}
        </div>
      )}
    </div>
  )
}

function QuickAction({ icon: Icon, color, bg, title, desc, onClick }: { icon: LucideIcon; color: string; bg: string; title: string; desc: string; onClick: () => void }) {
  const { t } = useTranslation('manual')
  return (
    <button onClick={onClick} className="flex flex-col items-start gap-2.5 rounded-xl border p-4 text-left transition-all hover:shadow-md hover:-translate-y-0.5 group">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`h-4.5 w-4.5 ${color}`} />
      </div>
      <div>
        <span className="text-sm font-medium block">{title}</span>
        <span className="text-xs text-muted-foreground">{desc}</span>
      </div>
      <span className="text-xs text-primary font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {t('readGuide')} <ArrowRight className="h-3 w-3" />
      </span>
    </button>
  )
}

function GoToPage({ page, icon: Icon, color, bg, label }: { page: string; icon: LucideIcon; color: string; bg: string; label: string }) {
  const { t } = useTranslation('manual')
  const { onNavigateToPage } = useContext(ManualContext)
  if (!onNavigateToPage) return null
  return (
    <button
      onClick={() => onNavigateToPage(page)}
      className="mt-6 flex items-center gap-3 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/10 hover:shadow-sm w-full group"
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`h-4.5 w-4.5 ${color}`} />
      </div>
      <div className="flex-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[11px] text-muted-foreground block mt-0.5">{t('tryItNow')}</span>
      </div>
      <ExternalLink className="h-4 w-4 text-primary/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
    </button>
  )
}

function ProgressSummary() {
  const { t } = useTranslation('manual')
  const { readSections, totalSections } = useContext(ManualContext)
  const readCount = readSections.size
  if (readCount === 0) return null
  const pct = Math.round((readCount / totalSections) * 100)
  const isComplete = readCount >= totalSections
  return (
    <div className={`mb-8 p-4 rounded-xl border transition-all ${isComplete ? "bg-gradient-to-r from-emerald-50 to-emerald-50/30 border-emerald-200" : "bg-gradient-to-r from-primary/5 to-transparent"}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isComplete ? "bg-emerald-100" : "bg-primary/10"}`}>
          {isComplete ? <Trophy className="h-5 w-5 text-emerald-600" /> : <Sparkles className="h-5 w-5 text-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{t('progressTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('sectionsRead', { count: readCount, total: totalSections })}</p>
        </div>
        <span className={`text-lg font-bold ${isComplete ? "text-emerald-600" : "text-primary"}`}>{pct}%</span>
      </div>
      <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ease-out ${isComplete ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── HOME PAGE ───────────────────────────────────────────────────────────────

function InicioContent({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { t } = useTranslation('manual')
  const sections = useSections()
  const { readSections } = useContext(ManualContext)
  return <>
    {/* Hero */}
    <div className="text-center mb-8">
      <div className="flex justify-center mb-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <BookOpen className="h-7 w-7 text-primary" />
        </div>
      </div>
      <h2 className="text-lg font-semibold mb-1.5">{t('inicio.welcomeTitle')}</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
        {t('inicio.welcomeDesc')}
      </p>
    </div>

    {/* Progress summary */}
    <ProgressSummary />

    {/* Quick start */}
    <div className="mb-8">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('inicio.startHere')}</h3>
      <div className="grid grid-cols-3 gap-3">
        <QuickAction icon={Rocket} color="text-emerald-600" bg="bg-emerald-50" title={t('inicio.quickSetup')} desc={t('inicio.quickSetupDesc')} onClick={() => onNavigate("primeros-pasos")} />
        <QuickAction icon={FileText} color="text-rose-600" bg="bg-rose-50" title={t('inicio.quickInvoice')} desc={t('inicio.quickInvoiceDesc')} onClick={() => onNavigate("facturas")} />
        <QuickAction icon={Receipt} color="text-orange-600" bg="bg-orange-50" title={t('inicio.quickExpense')} desc={t('inicio.quickExpenseDesc')} onClick={() => onNavigate("gastos")} />
      </div>
    </div>

    {/* FAQ */}
    <div className="mb-8">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('inicio.faqTitle')}</h3>
      <div className="space-y-2.5">
        <FAQ q={t('inicio.faqAccounting')}>
          <span dangerouslySetInnerHTML={{ __html: t('inicio.faqAccountingAnswer') }} />
        </FAQ>
        <FAQ q={t('inicio.faqInvoice')}>
          <span dangerouslySetInnerHTML={{ __html: t('inicio.faqInvoiceAnswer') }} />
        </FAQ>
        <FAQ q={t('inicio.faqVat')}>
          <span dangerouslySetInnerHTML={{ __html: t('inicio.faqVatAnswer') }} />
        </FAQ>
        <FAQ q={t('inicio.faqExpenseVsInvoice')}>
          <span dangerouslySetInnerHTML={{ __html: t('inicio.faqExpenseVsInvoiceAnswer') }} />
        </FAQ>
        <FAQ q={t('inicio.faqTaxBase')}>
          <span dangerouslySetInnerHTML={{ __html: t('inicio.faqTaxBaseAnswer') }} />
        </FAQ>
        <FAQ q={t('inicio.faqIrpf')}>
          <span dangerouslySetInnerHTML={{ __html: t('inicio.faqIrpfAnswer') }} />
        </FAQ>
        <FAQ q={t('inicio.faqSecurity')}>
          <span dangerouslySetInnerHTML={{ __html: t('inicio.faqSecurityAnswer') }} />
        </FAQ>
        <FAQ q={t('inicio.faqPassword')}>
          <span dangerouslySetInnerHTML={{ __html: t('inicio.faqPasswordAnswer') }} />
        </FAQ>
        <FAQ q={t('inicio.faqModels')}>
          <span dangerouslySetInnerHTML={{ __html: t('inicio.faqModelsAnswer') }} />
        </FAQ>
        <FAQ q={t('inicio.faqEmail')}>
          <span dangerouslySetInnerHTML={{ __html: t('inicio.faqEmailAnswer') }} />
        </FAQ>
        <FAQ q={t('inicio.faqMultiCompany')}>
          <span dangerouslySetInnerHTML={{ __html: t('inicio.faqMultiCompanyAnswer') }} />
        </FAQ>
      </div>
    </div>

    {/* All sections grid */}
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('inicio.allSections')}</h3>
      <div className="grid grid-cols-2 gap-2.5">
        {sections.filter(s => s.id !== "inicio").map((s, i) => {
          const Icon = s.icon
          return (
            <button
              key={s.id}
              onClick={() => onNavigate(s.id)}
              className="flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-all hover:shadow-sm hover:border-primary/30 opacity-0 animate-fade-in-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${s.bg}`}>
                <Icon className={`h-3.5 w-3.5 ${s.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium block truncate">{s.title}</span>
                <span className="text-[11px] text-muted-foreground truncate block">{s.desc}</span>
              </div>
              {readSections.has(s.id) && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
            </button>
          )
        })}
      </div>
    </div>
  </>
}

// ─── Section content components ──────────────────────────────────────────────

function PrimerosPasosContent() {
  const { t } = useTranslation('manual')
  return <>
    <P>{t('primerosPasos.intro')}</P>

    <SectionTitle>{t('primerosPasos.createCompany')}</SectionTitle>
    <P>{t('primerosPasos.createCompanyDesc')}</P>
    <Step n={1} checkId="setup-1"><span dangerouslySetInnerHTML={{ __html: t('primerosPasos.step1') }} /></Step>
    <Step n={2} checkId="setup-2"><span dangerouslySetInnerHTML={{ __html: t('primerosPasos.step2') }} /></Step>
    <Step n={3} checkId="setup-3"><span dangerouslySetInnerHTML={{ __html: t('primerosPasos.step3') }} /></Step>
    <Step n={4} checkId="setup-4">{t('primerosPasos.step4DataLocation')}<Ic icon={FolderOpen} className="text-slate-600" />{t('primerosPasos.step4Folder')}<Ic icon={HardDrive} className="text-slate-600" />{t('primerosPasos.step4Disk')}</Step>
    <Step n={5} checkId="setup-5"><span dangerouslySetInnerHTML={{ __html: t('primerosPasos.step5') }} /></Step>

    <Warning>
      <span dangerouslySetInnerHTML={{ __html: t('primerosPasos.passwordWarning') }} />
    </Warning>

    <SectionTitle>{t('primerosPasos.multiCompany')}</SectionTitle>
    <P>{t('primerosPasos.multiCompanyDesc')}</P>
    <Step n={1}>{t('primerosPasos.multiStep1')}<Ic icon={Plus} className="text-primary" /><strong>{t('primerosPasos.multiStep1Action')}</strong>.</Step>
    <Step n={2}>{t('primerosPasos.multiStep2')}</Step>
    <Step n={3}>{t('primerosPasos.multiStep3')}</Step>

    <Tip>{t('primerosPasos.multiTip')}</Tip>

    <SectionTitle>{t('primerosPasos.whatNext')}</SectionTitle>
    <P>{t('primerosPasos.whatNextDesc')}</P>
    <Step n={1} checkId="next-1"><span dangerouslySetInnerHTML={{ __html: t('primerosPasos.nextStep1') }} /><Ic icon={Users} className="text-violet-600" />{t('primerosPasos.nextStep1Clients')}</Step>
    <Step n={2} checkId="next-2"><span dangerouslySetInnerHTML={{ __html: t('primerosPasos.nextStep2') }} /><Ic icon={Package} className="text-amber-600" />{t('primerosPasos.nextStep2Products')}</Step>
    <Step n={3} checkId="next-3"><span dangerouslySetInnerHTML={{ __html: t('primerosPasos.nextStep3') }} /><Ic icon={FileText} className="text-rose-600" />{t('primerosPasos.nextStep3Invoices')}</Step>
    <Step n={4} checkId="next-4"><span dangerouslySetInnerHTML={{ __html: t('primerosPasos.nextStep4') }} /><Ic icon={Receipt} className="text-orange-600" />{t('primerosPasos.nextStep4Expenses')}</Step>
    <Step n={5} checkId="next-5"><span dangerouslySetInnerHTML={{ __html: t('primerosPasos.nextStep5') }} /><Ic icon={LayoutDashboard} className="text-blue-600" />{t('primerosPasos.nextStep5Dashboard')}</Step>
  </>
}

function DashboardContent() {
  const { t } = useTranslation('manual')
  return <>
    <P>{t('dashboard.intro')}</P>

    <SectionTitle>{t('dashboard.topCards')}</SectionTitle>
    <P>{t('dashboard.topCardsDesc')}</P>
    <Step n={1}><span dangerouslySetInnerHTML={{ __html: t('dashboard.cardIncome') }} /></Step>
    <Step n={2}><span dangerouslySetInnerHTML={{ __html: t('dashboard.cardExpenses') }} /></Step>
    <Step n={3}><span dangerouslySetInnerHTML={{ __html: t('dashboard.cardProfit') }} /></Step>
    <Step n={4}><span dangerouslySetInnerHTML={{ __html: t('dashboard.cardVat') }} /></Step>

    <Concept term={t('dashboard.profitConcept')}>
      <span dangerouslySetInnerHTML={{ __html: t('dashboard.profitConceptDesc') }} />
    </Concept>

    <SectionTitle>{t('dashboard.quickButtons')}</SectionTitle>
    <P>{t('dashboard.quickButtonsDesc')}</P>

    <SectionTitle>{t('dashboard.recentActivity')}</SectionTitle>
    <P>{t('dashboard.recentActivityDesc')}</P>

    <Tip>{t('dashboard.emptyTip')}<Ic icon={Calendar} className="text-teal-600" />{t('dashboard.emptyTipEnd')}</Tip>

    <GoToPage page="dashboard" icon={LayoutDashboard} color="text-blue-600" bg="bg-blue-50" label={t('sections.dashboard.title')} />
  </>
}

function ClientesContent() {
  const { t } = useTranslation('manual')
  return <>
    <P>{t('clientes.intro')}</P>

    <SectionTitle>{t('clientes.newClient')}</SectionTitle>
    <Step n={1}>{t('clientes.newStep1')}<Ic icon={UserPlus} className="text-primary" /><strong>{t('clientes.newStep1Action')}</strong>{t('clientes.newStep1End')}</Step>
    <Step n={2}><span dangerouslySetInnerHTML={{ __html: t('clientes.newStep2') }} /></Step>
    <Step n={3}>{t('clientes.newStep3')}</Step>
    <Step n={4}>{t('clientes.newStep4')}<Ic icon={Save} className="text-primary" /><strong>{t('clientes.newStep4Action')}</strong>{t('clientes.newStep4End')}</Step>

    <Concept term={t('clientes.nifConcept')}>
      <span dangerouslySetInnerHTML={{ __html: t('clientes.nifConceptDesc') }} />
    </Concept>

    <SectionTitle>{t('clientes.search')}</SectionTitle>
    <P>{t('clientes.searchDesc')}<Ic icon={Search} />{t('clientes.searchDescEnd')}</P>

    <SectionTitle>{t('clientes.editDelete')}</SectionTitle>
    <P>{t('clientes.editDeleteDesc')}</P>
    <Step n={1}><Ic icon={Pencil} className="text-blue-600" /><span dangerouslySetInnerHTML={{ __html: t('clientes.editAction') }} /></Step>
    <Step n={2}><Ic icon={Eye} className="text-slate-600" /><span dangerouslySetInnerHTML={{ __html: t('clientes.viewAction') }} /></Step>
    <Step n={3}><Ic icon={Trash2} className="text-red-500" /><span dangerouslySetInnerHTML={{ __html: t('clientes.deleteAction') }} /></Step>

    <Warning><span dangerouslySetInnerHTML={{ __html: t('clientes.deleteWarning') }} /></Warning>

    <Tip>{t('clientes.firstClientTip')}</Tip>

    <GoToPage page="clientes" icon={Users} color="text-violet-600" bg="bg-violet-50" label={t('sections.clientes.title')} />
  </>
}

function ProductosContent() {
  const { t } = useTranslation('manual')
  return <>
    <P>{t('productos.intro')}</P>

    <SectionTitle>{t('productos.create')}</SectionTitle>
    <Step n={1}>{t('productos.createStep1')}<Ic icon={Plus} className="text-primary" /><strong>{t('productos.createStep1Action')}</strong>{t('productos.createStep1End')}</Step>
    <Step n={2}><span dangerouslySetInnerHTML={{ __html: t('productos.createStep2') }} /></Step>
    <Step n={3}><span dangerouslySetInnerHTML={{ __html: t('productos.createStep3') }} /></Step>
    <Step n={4}><span dangerouslySetInnerHTML={{ __html: t('productos.createStep4') }} /></Step>
    <Step n={5}><span dangerouslySetInnerHTML={{ __html: t('productos.createStep5') }} /></Step>
    <Step n={6}><span dangerouslySetInnerHTML={{ __html: t('productos.createStep6') }} /></Step>

    <Concept term={t('productos.priceConcept')}>
      <span dangerouslySetInnerHTML={{ __html: t('productos.priceConceptDesc') }} />
    </Concept>

    <SectionTitle>{t('productos.useInInvoices')}</SectionTitle>
    <P>{t('productos.useInInvoicesDesc')}</P>

    <SectionTitle>{t('productos.deactivate')}</SectionTitle>
    <P><span dangerouslySetInnerHTML={{ __html: t('productos.deactivateDesc') }} /></P>

    <Tip>{t('productos.priceTip')}</Tip>

    <GoToPage page="productos" icon={Package} color="text-amber-600" bg="bg-amber-50" label={t('sections.productos.title')} />
  </>
}

function FacturasContent() {
  const { t } = useTranslation('manual')
  return <>
    <P>{t('facturas.intro')}</P>

    <SectionTitle>{t('facturas.create')}</SectionTitle>
    <Step n={1}>{t('facturas.createStep1')}<Ic icon={Plus} className="text-primary" /><strong>{t('facturas.createStep1Action')}</strong>{t('facturas.createStep1End')}</Step>
    <Step n={2}><span dangerouslySetInnerHTML={{ __html: t('facturas.createStep2') }} /><Ic icon={Users} className="text-violet-600" />{t('facturas.createStep2Clients')}</Step>
    <Step n={3}><span dangerouslySetInnerHTML={{ __html: t('facturas.createStep3') }} /></Step>
    <Step n={4}><span dangerouslySetInnerHTML={{ __html: t('facturas.createStep4') }} /></Step>
    <Step n={5}><span dangerouslySetInnerHTML={{ __html: t('facturas.createStep5') }} /></Step>
    <Step n={6}><span dangerouslySetInnerHTML={{ __html: t('facturas.createStep6') }} /></Step>
    <Step n={7}>{t('facturas.createStep7')}<Ic icon={Save} className="text-primary" /><strong>{t('facturas.createStep7Action')}</strong>{t('facturas.createStep7End')}</Step>

    <Concept term={t('facturas.taxBaseConcept')}>
      <span dangerouslySetInnerHTML={{ __html: t('facturas.taxBaseConceptDesc') }} />
    </Concept>

    <SectionTitle>{t('facturas.states')}</SectionTitle>
    <P>{t('facturas.statesDesc')}</P>
    <Step n={1}><Ic icon={Pencil} className="text-slate-500" /><span dangerouslySetInnerHTML={{ __html: t('facturas.stateDraft') }} /></Step>
    <Step n={2}><Ic icon={Send} className="text-blue-500" /><span dangerouslySetInnerHTML={{ __html: t('facturas.stateIssued') }} /></Step>
    <Step n={3}><Ic icon={CheckCircle2} className="text-emerald-500" /><span dangerouslySetInnerHTML={{ __html: t('facturas.statePaid') }} /></Step>
    <Step n={4}><Ic icon={Clock} className="text-amber-500" /><span dangerouslySetInnerHTML={{ __html: t('facturas.stateOverdue') }} /></Step>
    <Step n={5}><Ic icon={XCircle} className="text-red-500" /><span dangerouslySetInnerHTML={{ __html: t('facturas.stateCancelled') }} /></Step>

    <Concept term={t('facturas.outputVatConcept')}>
      <span dangerouslySetInnerHTML={{ __html: t('facturas.outputVatConceptDesc') }} />
    </Concept>

    <Concept term={t('facturas.irpfConcept')}>
      <span dangerouslySetInnerHTML={{ __html: t('facturas.irpfConceptDesc') }} />
    </Concept>

    <SectionTitle>{t('facturas.pdfs')}</SectionTitle>
    <P>{t('facturas.pdfsDesc')}</P>
    <Step n={1}><Ic icon={FileSearch} className="text-slate-600" /><span dangerouslySetInnerHTML={{ __html: t('facturas.pdfPreview') }} /></Step>
    <Step n={2}><Ic icon={Download} className="text-slate-600" /><span dangerouslySetInnerHTML={{ __html: t('facturas.pdfDownload') }} /></Step>
    <Step n={3}><Ic icon={Mail} className="text-slate-600" /><span dangerouslySetInnerHTML={{ __html: t('facturas.pdfEmail') }} /></Step>
    <P>{t('facturas.pdfsExtra')}</P>

    <Tip>{t('facturas.smtpTip')}<Ic icon={Settings} className="text-slate-600" />{t('facturas.smtpTipConfig')}<Ic icon={Mail} className="text-rose-600" />{t('facturas.smtpTipEmail')}</Tip>

    <SectionTitle>{t('facturas.export')}</SectionTitle>
    <P><span dangerouslySetInnerHTML={{ __html: t('facturas.exportDesc') }} /><Ic icon={Download} className="text-slate-600" />{t('facturas.exportDescEnd')}</P>

    <Warning><span dangerouslySetInnerHTML={{ __html: t('facturas.numberingWarning') }} /></Warning>

    <Tip>{t('facturas.autoEntryTip')}</Tip>

    <GoToPage page="facturas" icon={FileText} color="text-rose-600" bg="bg-rose-50" label={t('sections.facturas.title')} />
  </>
}

function GastosContent() {
  const { t } = useTranslation('manual')
  return <>
    <P>{t('gastos.intro')}</P>

    <SectionTitle>{t('gastos.register')}</SectionTitle>
    <Step n={1}>{t('gastos.registerStep1')}<Ic icon={Plus} className="text-primary" /><strong>{t('gastos.registerStep1Action')}</strong>{t('gastos.registerStep1End')}</Step>
    <Step n={2}><span dangerouslySetInnerHTML={{ __html: t('gastos.registerStep2') }} /></Step>
    <Step n={3}><span dangerouslySetInnerHTML={{ __html: t('gastos.registerStep3') }} /></Step>
    <Step n={4}><span dangerouslySetInnerHTML={{ __html: t('gastos.registerStep4') }} /></Step>
    <Step n={5}><span dangerouslySetInnerHTML={{ __html: t('gastos.registerStep5') }} /></Step>
    <Step n={6}><span dangerouslySetInnerHTML={{ __html: t('gastos.registerStep6') }} /></Step>
    <Step n={7}><span dangerouslySetInnerHTML={{ __html: t('gastos.registerStep7') }} /><Ic icon={Paperclip} className="text-slate-600" />{t('gastos.registerStep7End')}</Step>

    <Concept term={t('gastos.inputVatConcept')}>
      <span dangerouslySetInnerHTML={{ __html: t('gastos.inputVatConceptDesc') }} />
    </Concept>

    <SectionTitle>{t('gastos.deductible')}</SectionTitle>
    <P>{t('gastos.deductibleDesc')}</P>
    <Step n={1}><span dangerouslySetInnerHTML={{ __html: t('gastos.deductibleStep1') }} /></Step>
    <Step n={2}><span dangerouslySetInnerHTML={{ __html: t('gastos.deductibleStep2') }} /></Step>
    <Step n={3}><span dangerouslySetInnerHTML={{ __html: t('gastos.deductibleStep3') }} /></Step>

    <Tip>{t('gastos.registerTip')}</Tip>

    <SectionTitle>{t('gastos.bulkImport')}</SectionTitle>
    <P>{t('gastos.bulkImportDesc')}<Ic icon={FileUp} className="text-primary" /><strong>{t('gastos.bulkImportAction')}</strong>{t('gastos.bulkImportDescEnd')}</P>

    <SectionTitle>{t('gastos.accounting')}</SectionTitle>
    <P>{t('gastos.accountingDesc')}</P>

    <GoToPage page="gastos" icon={Receipt} color="text-orange-600" bg="bg-orange-50" label={t('sections.gastos.title')} />
  </>
}

function EjerciciosContent() {
  const { t } = useTranslation('manual')
  return <>
    <P>{t('ejercicios.intro')}</P>

    <Concept term={t('ejercicios.concept')}>
      {t('ejercicios.conceptDesc')}
    </Concept>

    <SectionTitle>{t('ejercicios.manage')}</SectionTitle>
    <Step n={1}><Ic icon={Plus} className="text-primary" /><span dangerouslySetInnerHTML={{ __html: t('ejercicios.manageStep1') }} /></Step>
    <Step n={2}><Ic icon={Eye} className="text-slate-600" /><span dangerouslySetInnerHTML={{ __html: t('ejercicios.manageStep2') }} /></Step>
    <Step n={3}><Ic icon={Lock} className="text-amber-600" /><span dangerouslySetInnerHTML={{ __html: t('ejercicios.manageStep3') }} /></Step>
    <Step n={4}><Ic icon={Clock} className="text-emerald-600" /><span dangerouslySetInnerHTML={{ __html: t('ejercicios.manageStep4') }} /></Step>

    <SectionTitle>{t('ejercicios.relation')}</SectionTitle>
    <P>{t('ejercicios.relationDesc')}</P>

    <Warning><span dangerouslySetInnerHTML={{ __html: t('ejercicios.dateWarning') }} /></Warning>

    <Tip>{t('ejercicios.newYearTip')}</Tip>

    <GoToPage page="ejercicios" icon={Calendar} color="text-teal-600" bg="bg-teal-50" label={t('sections.ejercicios.title')} />
  </>
}

function ContabilidadContent() {
  const { t } = useTranslation('manual')
  return <>
    <P>{t('contabilidad.intro')}</P>

    <Concept term={t('contabilidad.concept')}>
      <span dangerouslySetInnerHTML={{ __html: t('contabilidad.conceptDesc') }} />
    </Concept>

    <SectionTitle>{t('contabilidad.tabs')}</SectionTitle>

    <Step n={1}><Ic icon={BookOpen} className="text-indigo-600" /><span dangerouslySetInnerHTML={{ __html: t('contabilidad.tabPlan') }} /></Step>
    <Step n={2}><Ic icon={FileText} className="text-indigo-600" /><span dangerouslySetInnerHTML={{ __html: t('contabilidad.tabEntries') }} /></Step>
    <Step n={3}><Ic icon={Calendar} className="text-indigo-600" /><span dangerouslySetInnerHTML={{ __html: t('contabilidad.tabJournal') }} /></Step>
    <Step n={4}><Ic icon={FileBarChart} className="text-indigo-600" /><span dangerouslySetInnerHTML={{ __html: t('contabilidad.tabLedger') }} /></Step>

    <Concept term={t('contabilidad.entryConcept')}>
      <span dangerouslySetInnerHTML={{ __html: t('contabilidad.entryConceptDesc') }} />
    </Concept>

    <Concept term={t('contabilidad.debitCreditConcept')}>
      <span dangerouslySetInnerHTML={{ __html: t('contabilidad.debitCreditConceptDesc') }} />
    </Concept>

    <SectionTitle>{t('contabilidad.pgc')}</SectionTitle>
    <P>{t('contabilidad.pgcDesc')}</P>
    <Step n={1}><span dangerouslySetInnerHTML={{ __html: t('contabilidad.pgcGroup4') }} /></Step>
    <Step n={2}><span dangerouslySetInnerHTML={{ __html: t('contabilidad.pgcGroup5') }} /></Step>
    <Step n={3}><span dangerouslySetInnerHTML={{ __html: t('contabilidad.pgcGroup6') }} /></Step>
    <Step n={4}><span dangerouslySetInnerHTML={{ __html: t('contabilidad.pgcGroup7') }} /></Step>

    <Tip>{t('contabilidad.autoTip')}</Tip>

    <GoToPage page="contabilidad" icon={BookOpen} color="text-indigo-600" bg="bg-indigo-50" label={t('sections.contabilidad.title')} />
  </>
}

function ModelosContent() {
  const { t } = useTranslation('manual')
  return <>
    <P>{t('modelos.intro')}</P>

    <Concept term={t('modelos.quarterConcept')}>
      <span dangerouslySetInnerHTML={{ __html: t('modelos.quarterConceptDesc') }} />
    </Concept>

    <SectionTitle>{t('modelos.model303')}</SectionTitle>
    <P>{t('modelos.model303Desc')}</P>
    <Step n={1}><span dangerouslySetInnerHTML={{ __html: t('modelos.model303Step1') }} /></Step>
    <Step n={2}><span dangerouslySetInnerHTML={{ __html: t('modelos.model303Step2') }} /></Step>
    <Step n={3}><span dangerouslySetInnerHTML={{ __html: t('modelos.model303Step3') }} /></Step>

    <Concept term={t('modelos.model303Example')}>
      <span dangerouslySetInnerHTML={{ __html: t('modelos.model303ExampleDesc') }} />
    </Concept>

    <SectionTitle>{t('modelos.model111')}</SectionTitle>
    <P>{t('modelos.model111Desc')}</P>
    <Step n={1}><span dangerouslySetInnerHTML={{ __html: t('modelos.model111Step1') }} /></Step>
    <Step n={2}><span dangerouslySetInnerHTML={{ __html: t('modelos.model111Step2') }} /></Step>
    <Step n={3}><span dangerouslySetInnerHTML={{ __html: t('modelos.model111Step3') }} /></Step>

    <SectionTitle>{t('modelos.model390')}</SectionTitle>
    <P>{t('modelos.model390Desc')}</P>

    <Warning>{t('modelos.statusWarning')}</Warning>

    <Tip>{t('modelos.compareTip')}</Tip>

    <GoToPage page="modelos" icon={FileBarChart} color="text-cyan-600" bg="bg-cyan-50" label={t('sections.modelos.title')} />
  </>
}

function PlantillasContent() {
  const { t } = useTranslation('manual')
  return <>
    <P>{t('plantillas.intro')}</P>

    <SectionTitle>{t('plantillas.customize')}</SectionTitle>
    <Step n={1}>{t('plantillas.customizeStep1')}<Ic icon={Settings} className="text-slate-600" /><span dangerouslySetInnerHTML={{ __html: t('plantillas.customizeStep1Config') }} /></Step>
    <Step n={2}>{t('plantillas.customizeStep2')}<Ic icon={Palette} className="text-pink-600" /><span dangerouslySetInnerHTML={{ __html: t('plantillas.customizeStep2Tab') }} /></Step>
    <Step n={3}><span dangerouslySetInnerHTML={{ __html: t('plantillas.customizeStep3') }} /></Step>
    <Step n={4}><span dangerouslySetInnerHTML={{ __html: t('plantillas.customizeStep4') }} /></Step>
    <Step n={5}><span dangerouslySetInnerHTML={{ __html: t('plantillas.customizeStep5') }} /></Step>

    <SectionTitle>{t('plantillas.preview')}</SectionTitle>
    <P>{t('plantillas.previewDesc')}</P>

    <Tip>{t('plantillas.professionalTip')}</Tip>

    <GoToPage page="configuracion" icon={Palette} color="text-pink-600" bg="bg-pink-50" label={t('sections.plantillas.title')} />
  </>
}

function CloudContent() {
  const { t } = useTranslation('manual')
  return <>
    <P>{t('cloud.intro')}</P>

    <SectionTitle>{t('cloud.connect')}</SectionTitle>
    <P>{t('cloud.connectDesc')}</P>

    <Step n={1}><span dangerouslySetInnerHTML={{ __html: t('cloud.connectStep1') }} /></Step>
    <Step n={2}><span dangerouslySetInnerHTML={{ __html: t('cloud.connectStep2Start') }} /><Ic icon={Cloud} className="text-sky-600" />{t('cloud.connectStep2Action')}{t('cloud.connectStep2End')}</Step>
    <Step n={3}>{t('cloud.connectStep3')}</Step>

    <SectionTitle>{t('cloud.license')}</SectionTitle>
    <P><span dangerouslySetInnerHTML={{ __html: t('cloud.licenseDesc') }} /></P>
    <Step n={1}><span dangerouslySetInnerHTML={{ __html: t('cloud.licenseStep1') }} /></Step>
    <Step n={2}>{t('cloud.licenseStep2')}</Step>
    <Step n={3}>{t('cloud.licenseStep3Start')}<Ic icon={Key} className="text-amber-600" /><span dangerouslySetInnerHTML={{ __html: t('cloud.licenseStep3Action') }} />{t('cloud.licenseStep3End')}</Step>
    <Step n={4}>{t('cloud.licenseStep4')}</Step>

    <SectionTitle>{t('cloud.backup')}</SectionTitle>
    <Step n={1}>{t('cloud.backupStep1')}<Ic icon={Upload} className="text-primary" /><span dangerouslySetInnerHTML={{ __html: t('cloud.backupStep1Action') }} /></Step>
    <Step n={2}>{t('cloud.backupStep2')}<Ic icon={Shield} className="text-emerald-600" /><span dangerouslySetInnerHTML={{ __html: t('cloud.backupStep2Encrypt') }} /></Step>
    <Step n={3}>{t('cloud.backupStep3')}</Step>

    <SectionTitle>{t('cloud.restore')}</SectionTitle>
    <Step n={1}>{t('cloud.restoreStep1')}</Step>
    <Step n={2}>{t('cloud.restoreStep2')}<Ic icon={Download} className="text-primary" /><span dangerouslySetInnerHTML={{ __html: t('cloud.restoreStep2Action') }} />{t('cloud.restoreStep2End')}</Step>

    <Warning>
      <span dangerouslySetInnerHTML={{ __html: t('cloud.restoreWarning') }} />
    </Warning>

    <Concept term={t('cloud.securityConcept')}>
      <span dangerouslySetInnerHTML={{ __html: t('cloud.securityConceptDesc') }} />
    </Concept>

    <SectionTitle>{t('cloud.deleteBackups')}</SectionTitle>
    <P>{t('cloud.deleteBackupsDesc')}</P>

    <Tip>{t('cloud.backupTip')}</Tip>

    <GoToPage page="cloud" icon={Cloud} color="text-sky-600" bg="bg-sky-50" label={t('sections.cloud.title')} />
  </>
}

function ConfiguracionContent() {
  const { t } = useTranslation('manual')
  return <>
    <P>{t('configuracion.intro')}</P>

    <SectionTitle>{t('configuracion.tabCompany')}</SectionTitle>
    <P>{t('configuracion.tabCompanyDesc')}</P>
    <Step n={1}>{t('configuracion.tabCompanyStep1')}<Ic icon={Save} className="text-primary" /><span dangerouslySetInnerHTML={{ __html: t('configuracion.tabCompanyStep1Action') }} /></Step>
    <Step n={2}><span dangerouslySetInnerHTML={{ __html: t('configuracion.tabCompanyStep2') }} /></Step>

    <SectionTitle>{t('configuracion.tabBilling')}</SectionTitle>
    <Step n={1}><span dangerouslySetInnerHTML={{ __html: t('configuracion.tabBillingStep1') }} /></Step>
    <Step n={2}><span dangerouslySetInnerHTML={{ __html: t('configuracion.tabBillingStep2') }} /></Step>
    <Step n={3}><span dangerouslySetInnerHTML={{ __html: t('configuracion.tabBillingStep3') }} /></Step>
    <Step n={4}><span dangerouslySetInnerHTML={{ __html: t('configuracion.tabBillingStep4') }} /></Step>

    <SectionTitle>{t('configuracion.tabTaxes')}</SectionTitle>
    <P>{t('configuracion.tabTaxesDesc')}</P>
    <Step n={1}>{t('configuracion.tabTaxesStep1')}</Step>
    <Step n={2}><span dangerouslySetInnerHTML={{ __html: t('configuracion.tabTaxesStep2') }} /></Step>
    <Step n={3}><span dangerouslySetInnerHTML={{ __html: t('configuracion.tabTaxesStep3') }} /></Step>
    <Step n={4}><span dangerouslySetInnerHTML={{ __html: t('configuracion.tabTaxesStep4') }} /><Ic icon={Star} className="text-amber-500" />{t('configuracion.tabTaxesStep4End')}</Step>

    <SectionTitle>{t('configuracion.tabEmail')}</SectionTitle>
    <P>{t('configuracion.tabEmailDesc')}</P>
    <Step n={1}><span dangerouslySetInnerHTML={{ __html: t('configuracion.tabEmailStep1') }} /></Step>
    <Step n={2}><span dangerouslySetInnerHTML={{ __html: t('configuracion.tabEmailStep2') }} /></Step>
    <Step n={3}><span dangerouslySetInnerHTML={{ __html: t('configuracion.tabEmailStep3') }} /></Step>
    <Step n={4}><span dangerouslySetInnerHTML={{ __html: t('configuracion.tabEmailStep4') }} /></Step>
    <Step n={5}><span dangerouslySetInnerHTML={{ __html: t('configuracion.tabEmailStep5') }} /></Step>

    <Tip>{t('configuracion.licenseTip')}</Tip>

    <SectionTitle>{t('configuracion.otherTabs')}</SectionTitle>
    <Step n={1}><Ic icon={Shield} className="text-red-600" /><span dangerouslySetInnerHTML={{ __html: t('configuracion.otherTabSecurity') }} /></Step>
    <Step n={2}><Ic icon={Cloud} className="text-sky-600" /><span dangerouslySetInnerHTML={{ __html: t('configuracion.otherTabBackup') }} /></Step>
    <Step n={3}><Ic icon={Palette} className="text-pink-600" /><span dangerouslySetInnerHTML={{ __html: t('configuracion.otherTabTemplates') }} /></Step>

    <Tip>{t('configuracion.addressTip')}</Tip>

    <GoToPage page="configuracion" icon={Settings} color="text-slate-600" bg="bg-slate-50" label={t('sections.configuracion.title')} />
  </>
}

function SeguridadContent() {
  const { t } = useTranslation('manual')
  return <>
    <P>{t('seguridad.intro')}</P>

    <SectionTitle>{t('seguridad.encryption')}</SectionTitle>
    <P><span dangerouslySetInnerHTML={{ __html: t('seguridad.encryptionDesc') }} /></P>

    <Concept term={t('seguridad.aesConcept')}>
      <span dangerouslySetInnerHTML={{ __html: t('seguridad.aesConceptDesc') }} />
    </Concept>

    <SectionTitle>{t('seguridad.masterPassword')}</SectionTitle>
    <Step n={1}>{t('seguridad.masterStep1')}</Step>
    <Step n={2}>{t('seguridad.masterStep2')}<Ic icon={Settings} className="text-slate-600" />{t('seguridad.masterStep2Config')}<Ic icon={Shield} className="text-red-600" />{t('seguridad.masterStep2Security')}</Step>
    <Step n={3}><span dangerouslySetInnerHTML={{ __html: t('seguridad.masterStep3') }} /></Step>

    <Warning>
      <span dangerouslySetInnerHTML={{ __html: t('seguridad.lostPasswordWarning') }} />
    </Warning>

    <SectionTitle>{t('seguridad.passkey')}</SectionTitle>
    <P>{t('seguridad.passkeyDesc')}</P>
    <Step n={1}>{t('seguridad.passkeyStep1')}<Ic icon={Settings} className="text-slate-600" />{t('seguridad.passkeyStep1Config')}<Ic icon={Shield} className="text-red-600" />{t('seguridad.passkeyStep1Security')}</Step>
    <Step n={2}>{t('seguridad.passkeyStep2')}<Ic icon={Fingerprint} className="text-primary" /><span dangerouslySetInnerHTML={{ __html: t('seguridad.passkeyStep2Action') }} /></Step>
    <Step n={3}>{t('seguridad.passkeyStep3')}<Ic icon={Fingerprint} className="text-emerald-600" />{t('seguridad.passkeyStep3End')}</Step>
    <Step n={4}>{t('seguridad.passkeyStep4')}</Step>

    <SectionTitle>{t('seguridad.lock')}</SectionTitle>
    <P>{t('seguridad.lockDesc')}<Ic icon={Lock} className="text-red-500" /><span dangerouslySetInnerHTML={{ __html: t('seguridad.lockAction') }} />{t('seguridad.lockDescEnd')}</P>

    <SectionTitle>{t('seguridad.independent')}</SectionTitle>
    <P>{t('seguridad.independentDesc')}</P>

    <Tip>{t('seguridad.passwordTip')}</Tip>

    <GoToPage page="configuracion" icon={Shield} color="text-red-600" bg="bg-red-50" label={t('sections.seguridad.title')} />
  </>
}

function GlosarioContent() {
  const { t } = useTranslation('manual')
  return <>
    <P>{t('glosario.intro')}</P>

    <SectionTitle>{t('glosario.taxesTitle')}</SectionTitle>

    <Concept term={t('glosario.vatTerm')}>
      <span dangerouslySetInnerHTML={{ __html: t('glosario.vatDesc') }} />
    </Concept>

    <Concept term={t('glosario.outputVatTerm')}>
      <span dangerouslySetInnerHTML={{ __html: t('glosario.outputVatDesc') }} />
    </Concept>

    <Concept term={t('glosario.inputVatTerm')}>
      <span dangerouslySetInnerHTML={{ __html: t('glosario.inputVatDesc') }} />
    </Concept>

    <Concept term={t('glosario.irpfTerm')}>
      <span dangerouslySetInnerHTML={{ __html: t('glosario.irpfDesc') }} />
    </Concept>

    <Concept term={t('glosario.taxBaseTerm')}>
      <span dangerouslySetInnerHTML={{ __html: t('glosario.taxBaseDesc') }} />
    </Concept>

    <Concept term={t('glosario.taxableEventTerm')}>
      {t('glosario.taxableEventDesc')}
    </Concept>

    <Concept term={t('glosario.accrualTerm')}>
      <span dangerouslySetInnerHTML={{ __html: t('glosario.accrualDesc') }} />
    </Concept>

    <Concept term={t('glosario.deductibleTerm')}>
      {t('glosario.deductibleDesc')}
    </Concept>

    <SectionTitle>{t('glosario.billingTitle')}</SectionTitle>

    <Concept term={t('glosario.invoiceTerm')}>
      {t('glosario.invoiceDesc')}
    </Concept>

    <Concept term={t('glosario.rectifyingTerm')}>
      {t('glosario.rectifyingDesc')}
    </Concept>

    <Concept term={t('glosario.seriesTerm')}>
      {t('glosario.seriesDesc')}
    </Concept>

    <Concept term={t('glosario.dueDateTerm')}>
      {t('glosario.dueDateDesc')}
    </Concept>

    <Concept term={t('glosario.witholdingTerm')}>
      {t('glosario.witholdingDesc')}
    </Concept>

    <SectionTitle>{t('glosario.accountingTitle')}</SectionTitle>

    <Concept term={t('glosario.pgcTerm')}>
      {t('glosario.pgcDesc')}
    </Concept>

    <Concept term={t('glosario.entryTerm')}>
      {t('glosario.entryDesc')}
    </Concept>

    <Concept term={t('glosario.doubleEntryTerm')}>
      {t('glosario.doubleEntryDesc')}
    </Concept>

    <Concept term={t('glosario.debitCreditTerm')}>
      <span dangerouslySetInnerHTML={{ __html: t('glosario.debitCreditDesc') }} />
    </Concept>

    <Concept term={t('glosario.journalTerm')}>
      {t('glosario.journalDesc')}
    </Concept>

    <Concept term={t('glosario.ledgerTerm')}>
      {t('glosario.ledgerDesc')}
    </Concept>

    <Concept term={t('glosario.assetTerm')}>
      {t('glosario.assetDesc')}
    </Concept>

    <Concept term={t('glosario.liabilityTerm')}>
      {t('glosario.liabilityDesc')}
    </Concept>

    <Concept term={t('glosario.equityTerm')}>
      {t('glosario.equityDesc')}
    </Concept>

    <SectionTitle>{t('glosario.fiscalTitle')}</SectionTitle>

    <Concept term={t('glosario.fiscalYearTerm')}>
      {t('glosario.fiscalYearDesc')}
    </Concept>

    <Concept term={t('glosario.quarterTerm')}>
      {t('glosario.quarterDesc')}
    </Concept>

    <Concept term={t('glosario.model303Term')}>
      {t('glosario.model303Desc')}
    </Concept>

    <Concept term={t('glosario.model111Term')}>
      {t('glosario.model111Desc')}
    </Concept>

    <Concept term={t('glosario.model390Term')}>
      {t('glosario.model390Desc')}
    </Concept>

    <Concept term={t('glosario.aeatTerm')}>
      {t('glosario.aeatDesc')}
    </Concept>

    <Concept term={t('glosario.depreciationTerm')}>
      {t('glosario.depreciationDesc')}
    </Concept>

    <Tip>{t('glosario.disclaimerTip')}</Tip>
  </>
}

// ─── Page content registry ───────────────────────────────────────────────────

const pageContent: Record<string, (props: { onNavigate: (id: string) => void }) => JSX.Element> = {
  "inicio": InicioContent,
  "primeros-pasos": () => <PrimerosPasosContent />,
  "dashboard": () => <DashboardContent />,
  "clientes": () => <ClientesContent />,
  "productos": () => <ProductosContent />,
  "facturas": () => <FacturasContent />,
  "gastos": () => <GastosContent />,
  "ejercicios": () => <EjerciciosContent />,
  "contabilidad": () => <ContabilidadContent />,
  "modelos": () => <ModelosContent />,
  "plantillas": () => <PlantillasContent />,
  "cloud": () => <CloudContent />,
  "configuracion": () => <ConfiguracionContent />,
  "seguridad": () => <SeguridadContent />,
  "glosario": () => <GlosarioContent />,
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ManualPage({ section, onNavigateToPage }: ManualPageProps) {
  const { t } = useTranslation('manual')
  const sections = useSections()
  const groupLabels = useGroupLabels()
  const { readSections, markRead, resetProgress } = useReadSections()
  const topRef = useRef<HTMLDivElement>(null)

  const sectionIds = useMemo(() => sectionDefs.map(d => d.id), [])
  const [activePage, setActivePage] = useState(section && sectionIds.includes(section) ? section : "inicio")
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    if (section && sectionIds.includes(section)) {
      setActivePage(section)
    }
  }, [section, sectionIds])

  const filteredSections = useMemo(() => {
    if (!searchTerm.trim()) return sections
    const q = searchTerm.toLowerCase()
    return sections.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.keywords.some(k => k.includes(q)) ||
      s.desc.toLowerCase().includes(q)
    )
  }, [searchTerm, sections])

  const currentSection = sections.find(s => s.id === activePage) || sections[0]
  const currentIndex = sections.findIndex(s => s.id === activePage)
  const prevSection = currentIndex > 0 ? sections[currentIndex - 1] : null
  const nextSection = currentIndex < sections.length - 1 ? sections[currentIndex + 1] : null
  const isHome = activePage === "inicio"

  const ContentComponent = pageContent[activePage] || pageContent["inicio"]
  const SectionIcon = currentSection.icon

  // Group sections for nav
  const groups = ["inicio", "basico", "avanzado", "sistema", "referencia"] as const
  const groupedFiltered = groups.map(g => ({
    group: g,
    label: groupLabels[g],
    items: filteredSections.filter(s => s.group === g),
  })).filter(g => g.items.length > 0)

  const navigate = useCallback((id: string) => {
    // Mark current section as read when leaving
    if (activePage !== "inicio") {
      markRead(activePage)
    }
    setActivePage(id)
    setSearchTerm("")
    // Scroll to top
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50)
  }, [activePage, markRead])

  // Keyboard navigation: ← →
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowLeft" && prevSection) navigate(prevSection.id)
      if (e.key === "ArrowRight" && nextSection) navigate(nextSection.id)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [prevSection, nextSection, navigate])

  // Progress stats
  const readCount = readSections.size
  const totalSections = sections.length - 1 // exclude "inicio"
  const progressPct = totalSections > 0 ? Math.round((readCount / totalSections) * 100) : 0

  // Context value
  const ctxValue = useMemo(() => ({
    onNavigateToPage,
    readSections,
    totalSections,
  }), [onNavigateToPage, readSections, totalSections])

  return (
    <ManualContext.Provider value={ctxValue}>
      <div className="flex gap-0 min-h-0 pb-4">
        {/* Left nav */}
        <div className="w-48 shrink-0 pr-4 border-r mr-5 space-y-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          {/* Progress bar */}
          {readCount > 0 && (
            <div className="px-1 pt-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">{progressPct}% {t('completed')}</span>
                <button onClick={resetProgress} className="text-muted-foreground/40 hover:text-muted-foreground transition-colors" title={t('resetProgress')}>
                  <RotateCcw className="h-2.5 w-2.5" />
                </button>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-700 ease-out" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {/* Section list grouped */}
          <nav className="space-y-3 pt-1">
            {groupedFiltered.map(({ group, label, items }) => (
              <div key={group}>
                {label && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-2 block mb-1">{label}</span>
                )}
                <div className="space-y-px">
                  {items.map((s) => {
                    const Icon = s.icon
                    const isActive = s.id === activePage
                    const isRead = readSections.has(s.id)
                    return (
                      <button
                        key={s.id}
                        onClick={() => navigate(s.id)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? s.color : ""}`} />
                        <span className="truncate flex-1">{s.title}</span>
                        {isActive ? (
                          <CheckCircle2 className="h-3 w-3 shrink-0 ml-auto text-primary/50" />
                        ) : isRead ? (
                          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0 ml-auto" />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {filteredSections.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                {t('noResults', { term: searchTerm })}
              </p>
            )}
          </nav>

          {/* Keyboard hint */}
          <div className="px-2 pt-2 border-t">
            <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">&larr;</kbd>
              <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">&rarr;</kbd>
              <span className="ml-0.5">{t('keyboardHint')}</span>
            </span>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          <div ref={topRef} />

          {/* Page header */}
          {!isHome && (
            <div className={`border-b pb-4 mb-6 border-l-4 pl-4 ${currentSection.border}`}>
              <div className="flex items-center gap-2.5">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${currentSection.bg}`}>
                  <SectionIcon className={`h-4 w-4 ${currentSection.color}`} />
                </div>
                <div className="flex-1">
                  <h1 className="text-lg font-semibold">{currentSection.title}</h1>
                  <p className="text-xs text-muted-foreground">{currentSection.desc} — {t('ofTotal', { current: currentIndex + 1, total: sections.length })}</p>
                </div>
                {readingTimeMap[activePage] && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60 shrink-0">
                    <Timer className="h-3 w-3" />
                    {readingTimeMap[activePage]} min
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Page content with animation */}
          <div key={activePage} className="animate-fade-in-up" style={{ animationDuration: "0.3s" }}>
            {isHome ? (
              <ContentComponent onNavigate={navigate} />
            ) : (
              <Card>
                <CardContent className="pt-6 pb-8 max-w-none">
                  <ContentComponent onNavigate={navigate} />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Pagination */}
          {!isHome && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              {prevSection ? (
                <button
                  onClick={() => navigate(prevSection.id)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
                >
                  <ChevronLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  <span>{prevSection.title}</span>
                </button>
              ) : <div />}
              <span className="text-[10px] text-muted-foreground/30">
                <kbd className="px-1 py-0.5 rounded bg-muted/50 text-[9px] font-mono">&larr;</kbd>
                {" "}{t('keyboardHint')}{" "}
                <kbd className="px-1 py-0.5 rounded bg-muted/50 text-[9px] font-mono">&rarr;</kbd>
              </span>
              {nextSection ? (
                <button
                  onClick={() => navigate(nextSection.id)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
                >
                  <span>{nextSection.title}</span>
                  <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              ) : <div />}
            </div>
          )}
        </div>
      </div>
    </ManualContext.Provider>
  )
}
