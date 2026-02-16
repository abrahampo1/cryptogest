import { useEffect, useMemo, useState } from "react"
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
  type LucideIcon,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────

interface ManualPageProps {
  section?: string
}

interface ManualSection {
  id: string
  title: string
  icon: LucideIcon
  color: string
  border: string
  bg: string
  keywords: string[]
  desc: string
  group: "inicio" | "basico" | "avanzado" | "sistema" | "referencia"
}

// ─── Section metadata ────────────────────────────────────────────────────────

const sections: ManualSection[] = [
  { id: "inicio", title: "Inicio", icon: Home, color: "text-primary", border: "border-l-primary", bg: "bg-primary/10", keywords: ["inicio", "bienvenido", "empezar", "ayuda", "faq", "preguntas"], desc: "Bienvenida y preguntas frecuentes", group: "inicio" },
  { id: "primeros-pasos", title: "Primeros Pasos", icon: Rocket, color: "text-emerald-600", border: "border-l-emerald-500", bg: "bg-emerald-50", keywords: ["inicio", "empezar", "configurar", "empresa", "asistente", "wizard", "crear empresa", "contraseña"], desc: "Configura tu empresa y empieza", group: "basico" },
  { id: "dashboard", title: "Panel de Control", icon: LayoutDashboard, color: "text-blue-600", border: "border-l-blue-500", bg: "bg-blue-50", keywords: ["panel", "resumen", "inicio", "estadísticas", "ingresos", "beneficio"], desc: "Tu centro de mando", group: "basico" },
  { id: "clientes", title: "Clientes", icon: Users, color: "text-violet-600", border: "border-l-violet-500", bg: "bg-violet-50", keywords: ["cliente", "cartera", "nif", "cif", "dirección", "contacto", "ficha", "buscar"], desc: "Gestiona tu cartera de clientes", group: "basico" },
  { id: "productos", title: "Productos y Servicios", icon: Package, color: "text-amber-600", border: "border-l-amber-500", bg: "bg-amber-50", keywords: ["producto", "servicio", "catálogo", "precio", "pvp", "referencia"], desc: "Tu catálogo de lo que vendes", group: "basico" },
  { id: "facturas", title: "Facturación", icon: FileText, color: "text-rose-600", border: "border-l-rose-500", bg: "bg-rose-50", keywords: ["factura", "emitir", "cobrar", "pdf", "serie", "línea", "borrador", "emitida", "pagada", "anulada", "iva", "irpf", "retención", "base imponible", "previsualizar", "email", "enviar", "correo"], desc: "Crea y gestiona tus facturas", group: "basico" },
  { id: "gastos", title: "Gastos", icon: Receipt, color: "text-orange-600", border: "border-l-orange-500", bg: "bg-orange-50", keywords: ["gasto", "proveedor", "ticket", "justificante", "adjunto", "categoría", "deducir", "iva soportado", "importar", "csv"], desc: "Registra y clasifica gastos", group: "basico" },
  { id: "ejercicios", title: "Ejercicios Fiscales", icon: Calendar, color: "text-teal-600", border: "border-l-teal-500", bg: "bg-teal-50", keywords: ["ejercicio", "fiscal", "año", "período", "abrir", "cerrar", "reabrir"], desc: "Períodos contables anuales", group: "avanzado" },
  { id: "contabilidad", title: "Contabilidad", icon: BookOpen, color: "text-indigo-600", border: "border-l-indigo-500", bg: "bg-indigo-50", keywords: ["contabilidad", "plan de cuentas", "pgc", "asiento", "debe", "haber", "libro diario", "libro mayor", "partida doble"], desc: "Plan de cuentas y asientos", group: "avanzado" },
  { id: "modelos", title: "Modelos Fiscales", icon: FileBarChart, color: "text-cyan-600", border: "border-l-cyan-500", bg: "bg-cyan-50", keywords: ["modelo", "303", "111", "390", "hacienda", "aeat", "trimestral", "anual", "declaración"], desc: "Declaraciones de Hacienda", group: "avanzado" },
  { id: "plantillas", title: "Plantillas de Factura", icon: Palette, color: "text-pink-600", border: "border-l-pink-500", bg: "bg-pink-50", keywords: ["plantilla", "template", "pdf", "logo", "logotipo", "color", "diseño"], desc: "Personaliza tus PDFs", group: "sistema" },
  { id: "cloud", title: "Cloud Backup", icon: Cloud, color: "text-sky-600", border: "border-l-sky-500", bg: "bg-sky-50", keywords: ["cloud", "nube", "backup", "copia", "seguridad", "restaurar", "subir", "cifrado", "licencia", "código", "vincular", "dispositivo", "plan"], desc: "Copias de seguridad en la nube", group: "sistema" },
  { id: "configuracion", title: "Configuración", icon: Settings, color: "text-slate-600", border: "border-l-slate-500", bg: "bg-slate-50", keywords: ["configuración", "ajustes", "empresa", "facturación", "impuestos", "serie", "passkey", "email", "smtp", "correo"], desc: "Ajustes del sistema", group: "sistema" },
  { id: "seguridad", title: "Seguridad y Cifrado", icon: Shield, color: "text-red-600", border: "border-l-red-500", bg: "bg-red-50", keywords: ["seguridad", "cifrado", "aes", "contraseña", "passkey", "bloquear", "encriptar"], desc: "Protección de tus datos", group: "sistema" },
  { id: "glosario", title: "Glosario Financiero", icon: GraduationCap, color: "text-purple-600", border: "border-l-purple-500", bg: "bg-purple-50", keywords: ["glosario", "concepto", "definición", "iva", "irpf", "base imponible", "devengo", "pgc", "debe", "haber", "activo", "pasivo", "amortización"], desc: "Conceptos explicados con sencillez", group: "referencia" },
]

const groupLabels: Record<string, string> = {
  inicio: "",
  basico: "Uso diario",
  avanzado: "Contabilidad y fiscalidad",
  sistema: "Sistema y seguridad",
  referencia: "Referencia",
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

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-3 relative">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary border-2 border-primary/20 z-10">{n}</div>
      <div className="text-sm text-muted-foreground pt-1 leading-relaxed">{children}</div>
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
        Leer guía <ArrowRight className="h-3 w-3" />
      </span>
    </button>
  )
}

// ─── HOME PAGE ───────────────────────────────────────────────────────────────

function InicioContent({ onNavigate }: { onNavigate: (id: string) => void }) {
  return <>
    {/* Hero */}
    <div className="text-center mb-8">
      <div className="flex justify-center mb-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <BookOpen className="h-7 w-7 text-primary" />
        </div>
      </div>
      <h2 className="text-lg font-semibold mb-1.5">Bienvenido al Manual de CryptoGest</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
        No te preocupes si nunca has usado un programa de facturación. Aquí te explicamos todo paso a paso, con palabras sencillas y sin tecnicismos innecesarios.
      </p>
    </div>

    {/* Quick start */}
    <div className="mb-8">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Empieza por aquí</h3>
      <div className="grid grid-cols-3 gap-3">
        <QuickAction icon={Rocket} color="text-emerald-600" bg="bg-emerald-50" title="Configurar mi empresa" desc="Lo primero que necesitas hacer" onClick={() => onNavigate("primeros-pasos")} />
        <QuickAction icon={FileText} color="text-rose-600" bg="bg-rose-50" title="Crear mi primera factura" desc="Paso a paso, muy fácil" onClick={() => onNavigate("facturas")} />
        <QuickAction icon={Receipt} color="text-orange-600" bg="bg-orange-50" title="Registrar un gasto" desc="Para deducir el IVA" onClick={() => onNavigate("gastos")} />
      </div>
    </div>

    {/* FAQ */}
    <div className="mb-8">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Preguntas frecuentes</h3>
      <div className="space-y-2.5">
        <FAQ q="¿Necesito saber contabilidad para usar CryptoGest?">
          <strong>No.</strong> CryptoGest está diseñado para personas sin conocimientos contables. El programa hace la contabilidad por ti de forma automática: cuando creas una factura o registras un gasto, se generan los asientos contables correctos sin que tengas que saber qué es un "asiento" o una "partida doble". Solo tienes que introducir tus datos y CryptoGest se encarga del resto.
        </FAQ>
        <FAQ q="¿Qué es una factura y cuándo tengo que hacer una?">
          Una factura es el documento que acredita que has vendido algo o prestado un servicio. <strong>Debes emitir una factura siempre que cobres a otra empresa o autónomo.</strong> La factura incluye tus datos, los del cliente, la descripción de lo que vendes, el precio y los impuestos (IVA). Es como un recibo oficial que sirve tanto para ti como para tu cliente como prueba de la transacción.
        </FAQ>
        <FAQ q="¿Qué es el IVA y por qué aparece en mis facturas?">
          El IVA (Impuesto sobre el Valor Añadido) es un impuesto que se añade al precio de todo lo que se vende en España. <strong>Tú no te quedas con ese dinero</strong>: lo cobras al cliente y después se lo pagas a Hacienda. El tipo más habitual es el 21%. Ejemplo: si tu servicio cuesta 100 €, le sumas 21 € de IVA y cobras 121 €. Esos 21 € son de Hacienda, no tuyos.
        </FAQ>
        <FAQ q="¿Qué diferencia hay entre un gasto y una factura?">
          Una <strong>factura</strong> es lo que tú emites cuando <strong>cobras</strong> a un cliente (dinero que entra). Un <strong>gasto</strong> es lo que tú <strong>pagas</strong> por algo que necesitas para tu negocio (dinero que sale): alquiler, software, material, etc. En CryptoGest las gestionas en secciones separadas, pero ambas se combinan para calcular tus impuestos.
        </FAQ>
        <FAQ q="¿Qué es la 'base imponible' que veo en las facturas?">
          Es simplemente el precio de lo que vendes <strong>antes de añadir impuestos</strong>. Si cobras 100 € por un servicio, esos 100 € son la base imponible. Luego se le suma el IVA (ej. 21 € si es el 21%) para obtener el total que paga el cliente (121 €). Es el punto de partida para calcular todos los impuestos.
        </FAQ>
        <FAQ q="¿Qué son las retenciones de IRPF?">
          Si eres autónomo y facturas a una empresa, es probable que tengas que incluir una retención de IRPF (normalmente el 15%). Esto significa que <strong>tu cliente no te paga el total</strong>: se "queda" con un porcentaje y se lo paga directamente a Hacienda en tu nombre, como un adelanto de tu declaración de la renta. Es decir, es un impuesto que pagas poco a poco en vez de todo de golpe a final de año.
        </FAQ>
        <FAQ q="¿Mis datos están seguros?">
          <strong>Sí, muy seguros.</strong> CryptoGest cifra toda tu base de datos con el mismo sistema que usan los bancos (AES-256). Tus datos se guardan en tu propio ordenador, no en Internet. Sin tu contraseña maestra, nadie puede leer la información, ni siquiera abriendo el archivo de la base de datos directamente.
        </FAQ>
        <FAQ q="¿Qué pasa si pierdo mi contraseña?">
          <strong>No se puede recuperar.</strong> Es el precio de la seguridad total: como CryptoGest no almacena tu contraseña (ni la envía a ningún servidor), nadie puede resetearla. Por eso es importante apuntarla en un lugar seguro fuera del ordenador. Si usas Cloud Backup, el backup también está cifrado con tu contraseña.
        </FAQ>
        <FAQ q="¿Qué son los modelos fiscales (303, 111, 390)?">
          Son los formularios que presentas a Hacienda periódicamente para declarar tus impuestos. El <strong>303</strong> es la declaración trimestral de IVA (cada 3 meses). El <strong>111</strong> son las retenciones de IRPF (también trimestral). El <strong>390</strong> es el resumen anual de IVA. <strong>CryptoGest los calcula automáticamente</strong> a partir de tus facturas y gastos, solo tienes que revisar las cifras.
        </FAQ>
        <FAQ q="¿Puedo enviar facturas por email directamente?">
          <strong>Sí.</strong> CryptoGest puede enviar facturas como PDF adjunto por email directamente desde la aplicación. Solo necesitas configurar tu cuenta de correo (SMTP) en Configuración → Email. Una vez configurado, en cada factura emitida verás un botón de correo que abre un formulario con el email del cliente, el asunto y un mensaje ya rellenados. Solo tienes que revisarlo y pulsar "Enviar".
        </FAQ>
        <FAQ q="¿Puedo usar CryptoGest para varias empresas?">
          <strong>Sí.</strong> Puedes crear tantas empresas como necesites. Cada una tiene su propia base de datos completamente separada, con su propia contraseña. Los datos de una empresa nunca se mezclan con los de otra. Es perfecto si gestionas un negocio como autónomo y además administras una sociedad.
        </FAQ>
      </div>
    </div>

    {/* All sections grid */}
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Todas las secciones del manual</h3>
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
              <div className="min-w-0">
                <span className="text-xs font-medium block truncate">{s.title}</span>
                <span className="text-[11px] text-muted-foreground truncate block">{s.desc}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  </>
}

// ─── Section content components ──────────────────────────────────────────────

function PrimerosPasosContent() {
  return <>
    <P>¡Bienvenido a CryptoGest! Esta guía te acompañará paso a paso. No necesitas saber de contabilidad ni de informática: todo está pensado para que sea fácil e intuitivo.</P>

    <SectionTitle>Crear tu primera empresa</SectionTitle>
    <P>Al abrir CryptoGest por primera vez, aparece un asistente que te guía. Solo tienes que rellenar unos pocos campos:</P>
    <Step n={1}><strong>Nombre de la empresa:</strong> pon el nombre de tu negocio o tu nombre como autónomo. Este nombre aparecerá en todas tus facturas.</Step>
    <Step n={2}><strong>NIF/CIF:</strong> es tu número de identificación fiscal. Si eres autónomo, es tu DNI con una letra al final (ej. 12345678A). Si tienes una sociedad (S.L., S.A.), empieza por letra (ej. B12345678). Si no lo tienes a mano, puedes dejarlo para después.</Step>
    <Step n={3}><strong>Dirección y datos fiscales:</strong> dirección completa de tu negocio. Estos datos se imprimen automáticamente en tus facturas, así que pon la dirección que aparece en tu alta de Hacienda.</Step>
    <Step n={4}><strong>Ubicación de los datos:</strong> elige dónde guardar los archivos de la empresa. Puedes usar la <Ic icon={FolderOpen} className="text-slate-600" />carpeta por defecto, un <Ic icon={HardDrive} className="text-slate-600" />disco externo (USB, disco duro portátil) o seleccionar una carpeta personalizada. Esto es útil si quieres guardar los datos en una unidad externa o en una carpeta sincronizada.</Step>
    <Step n={5}><strong>Contraseña maestra:</strong> elige una contraseña segura. CryptoGest cifra todos tus datos con ella, así que es muy importante. Usa al menos 8 caracteres mezclando letras, números y algún símbolo (ej. MiEmpresa2026!).</Step>

    <Warning>
      <strong>Muy importante:</strong> la contraseña maestra no se puede recuperar si la olvidas. No hay botón de "he olvidado mi contraseña". Apúntala en un papel y guárdalo en un lugar seguro (un cajón con llave, una caja fuerte, etc.).
    </Warning>

    <SectionTitle>Si gestionas más de una empresa</SectionTitle>
    <P>CryptoGest permite crear tantas empresas como necesites. Cada una es completamente independiente, con sus propios clientes, facturas, gastos y su propia contraseña.</P>
    <Step n={1}>En la pantalla de selección de empresa (la primera que ves al abrir el programa), pulsa <Ic icon={Plus} className="text-primary" /><strong>"Crear nueva empresa"</strong>.</Step>
    <Step n={2}>Rellena los datos como en el paso anterior.</Step>
    <Step n={3}>Para cambiar entre empresas, pulsa sobre el nombre de la empresa en la parte inferior del menú de la izquierda.</Step>

    <Tip>Cada empresa es un mundo aparte: los datos de una nunca se mezclan con los de otra. Es perfecto si eres autónomo con varios negocios, o si llevas la contabilidad de un familiar.</Tip>

    <SectionTitle>¿Por dónde empiezo después?</SectionTitle>
    <P>Una vez dentro, te recomendamos seguir este orden:</P>
    <Step n={1}><strong>Da de alta tus clientes</strong> — ve a <Ic icon={Users} className="text-violet-600" />"Clientes" en el menú y crea las fichas de las personas o empresas a las que les vas a facturar.</Step>
    <Step n={2}><strong>Crea tu catálogo</strong> — en <Ic icon={Package} className="text-amber-600" />"Productos y Servicios", define lo que vendes con sus precios. Así, al hacer facturas, solo tendrás que seleccionar de una lista.</Step>
    <Step n={3}><strong>Haz tu primera factura</strong> — ve a <Ic icon={FileText} className="text-rose-600" />"Facturación", selecciona un cliente, añade productos del catálogo, y pulsa guardar. ¡Ya está!</Step>
    <Step n={4}><strong>Registra tus gastos</strong> — cada vez que pagues algo para tu negocio (alquiler, material, software...), regístralo en <Ic icon={Receipt} className="text-orange-600" />"Gastos". Así podrás deducir el IVA.</Step>
    <Step n={5}><strong>Revisa tus números</strong> — el <Ic icon={LayoutDashboard} className="text-blue-600" />"Panel de Control" te muestra un resumen de cuánto has facturado, cuánto has gastado y cuánto le debes a Hacienda.</Step>
  </>
}

function DashboardContent() {
  return <>
    <P>El Panel de Control es lo primero que ves al entrar. Piensa en él como el "cuadro de mandos" de tu negocio: te dice de un vistazo cómo van las cosas.</P>

    <SectionTitle>Las tarjetas de arriba</SectionTitle>
    <P>En la parte superior hay cuatro tarjetas de colores. Cada una te dice algo importante:</P>
    <Step n={1}><strong>Ingresos facturados</strong> — el total de lo que has cobrado (o vas a cobrar) según tus facturas emitidas y pagadas. No cuenta los borradores ni las anuladas.</Step>
    <Step n={2}><strong>Gastos registrados</strong> — el total de lo que has pagado por tu negocio: alquiler, material, software, etc.</Step>
    <Step n={3}><strong>Beneficio neto</strong> — la resta: ingresos menos gastos. Si es positivo, vas bien. Si es negativo, estás gastando más de lo que facturas.</Step>
    <Step n={4}><strong>IVA pendiente</strong> — cuánto IVA le debes a Hacienda (o cuánto te debe Hacienda a ti). Es la diferencia entre el IVA que cobras a tus clientes y el IVA que pagas en tus compras.</Step>

    <Concept term="¿Qué es el beneficio neto?">
      Imagina que facturas 10.000 € en un trimestre, pero has gastado 6.000 € en alquiler, material y servicios. Tu <strong>beneficio neto</strong> es 4.000 €. Es lo que realmente te queda en el bolsillo (antes de impuestos sobre la renta). CryptoGest lo calcula automáticamente para que siempre sepas cómo va tu negocio.
    </Concept>

    <SectionTitle>Botones de acceso rápido</SectionTitle>
    <P>Debajo de las tarjetas hay botones para las acciones más habituales: crear una factura nueva, registrar un gasto, dar de alta un cliente, etc. Son atajos para no tener que buscar en el menú.</P>

    <SectionTitle>Actividad reciente</SectionTitle>
    <P>En la parte inferior ves una lista con las últimas facturas y gastos que has creado o modificado. Así siempre tienes a la vista tu actividad más reciente.</P>

    <Tip>Si el panel aparece vacío o con todo a cero, lo más probable es que no tengas un ejercicio fiscal abierto para el año actual. Ve a <Ic icon={Calendar} className="text-teal-600" />"Ejercicios Fiscales" en el menú y comprueba que existe el ejercicio del año en curso.</Tip>
  </>
}

function ClientesContent() {
  return <>
    <P>Aquí guardas los datos de todas las personas o empresas a las que les facturas. Es como una agenda de contactos, pero pensada para la facturación: cuando crees una factura, solo tendrás que elegir el cliente de una lista.</P>

    <SectionTitle>Dar de alta un cliente nuevo</SectionTitle>
    <Step n={1}>Pulsa el botón <Ic icon={UserPlus} className="text-primary" /><strong>"Nuevo Cliente"</strong> (arriba a la derecha).</Step>
    <Step n={2}>Rellena al menos el <strong>nombre</strong> y el <strong>NIF/CIF</strong> del cliente. Son los únicos campos obligatorios.</Step>
    <Step n={3}>Añade los demás datos si los tienes: email, teléfono, dirección. Cuantos más datos rellenes, más completas serán las facturas que les hagas.</Step>
    <Step n={4}>Pulsa <Ic icon={Save} className="text-primary" /><strong>"Guardar"</strong> y listo. El cliente aparecerá en la lista.</Step>

    <Concept term="¿Qué es el NIF/CIF de un cliente?">
      Es el número con el que Hacienda identifica a esa persona o empresa. Si tu cliente es una persona (autónomo), su NIF es su DNI con letra (ej. 12345678A). Si es una empresa (S.L., S.A.), su NIF empieza por letra (ej. B12345678). Es <strong>obligatorio</strong> incluirlo en las facturas, así que pídelo a tu cliente si no lo tienes.
    </Concept>

    <SectionTitle>Buscar un cliente</SectionTitle>
    <P>Usa la barra de búsqueda <Ic icon={Search} /> para encontrar clientes rápidamente. Puedes buscar por nombre, NIF o email. Si tienes muchos clientes, también puedes filtrar entre activos e inactivos.</P>

    <SectionTitle>Editar o eliminar un cliente</SectionTitle>
    <P>En cada fila de la tabla ves unos iconos pequeños:</P>
    <Step n={1}><Ic icon={Pencil} className="text-blue-600" /><strong>Lápiz</strong> — abre el formulario para modificar los datos del cliente.</Step>
    <Step n={2}><Ic icon={Eye} className="text-slate-600" /><strong>Ojo</strong> — muestra una ficha detallada con las estadísticas del cliente (total facturado, número de facturas, etc.).</Step>
    <Step n={3}><Ic icon={Trash2} className="text-red-500" /><strong>Papelera</strong> — elimina el cliente. Solo funciona si no tiene facturas asociadas.</Step>

    <Warning>No se pueden eliminar clientes que ya tienen facturas. Esto es una protección: si borraras un cliente, sus facturas quedarían huérfanas. Si ya no trabajas con un cliente, lo mejor es <strong>desactivarlo</strong> (editar → desmarcar "Activo") para que no aparezca en los desplegables al crear facturas.</Warning>

    <Tip>Antes de crear tu primera factura, asegúrate de tener al menos un cliente dado de alta. No podrás crear facturas sin un cliente seleccionado.</Tip>
  </>
}

function ProductosContent() {
  return <>
    <P>El catálogo de productos y servicios es tu "lista de precios". Aquí defines todo lo que vendes o facturas con sus precios e impuestos. La ventaja es que al crear facturas, solo tienes que seleccionar un producto de esta lista y todos los datos se rellenan solos.</P>

    <SectionTitle>Crear un producto o servicio</SectionTitle>
    <Step n={1}>Pulsa <Ic icon={Plus} className="text-primary" /><strong>"Nuevo"</strong> (arriba a la derecha).</Step>
    <Step n={2}>Escribe el <strong>nombre</strong> (ej. "Diseño de logotipo", "Hora de consultoría", "Pack mantenimiento web").</Step>
    <Step n={3}>Elige el <strong>tipo</strong>: "Producto" si vendes algo físico, "Servicio" si facturas trabajo, asesoría o algo intangible. Esto es solo para clasificar, no afecta a los cálculos.</Step>
    <Step n={4}>Pon el <strong>precio base</strong> (el precio sin IVA). CryptoGest calcula automáticamente cuánto será con IVA incluido (PVP). Si prefieres, puedes poner el precio con IVA y se calcula al revés.</Step>
    <Step n={5}>Selecciona el <strong>tipo de IVA</strong>: lo más habitual es el 21%. Si vendes alimentos, transporte o similar, puede ser el 10% o 4%.</Step>
    <Step n={6}>Si aplica, selecciona la <strong>retención de IRPF</strong> (normalmente 15% para autónomos).</Step>

    <Concept term="¿Qué diferencia hay entre precio base y PVP?">
      El <strong>precio base</strong> es lo que cobras <strong>antes de impuestos</strong>. El <strong>PVP</strong> (Precio de Venta al Público) es lo que paga el cliente, <strong>con IVA incluido</strong>. Ejemplo: si cobras 100 € por un servicio y el IVA es del 21%, el precio base es 100 € y el PVP es 121 €. En la factura siempre se muestra desglosado (100 € + 21 € de IVA = 121 €).
    </Concept>

    <SectionTitle>Usar productos al crear facturas</SectionTitle>
    <P>Cuando añadas una línea a una factura, verás un desplegable con todos tus productos. Al seleccionar uno, se rellena automáticamente el nombre, el precio, el IVA y la retención. Solo tendrás que poner la cantidad (por ejemplo, 5 horas, 3 unidades, etc.).</P>

    <SectionTitle>Desactivar un producto</SectionTitle>
    <P>Si dejas de ofrecer algo, no lo borres: <strong>desactívalo</strong>. Al editar un producto, desmarca el switch "Activo". Así desaparece de los desplegables pero se mantiene en el historial de facturas antiguas.</P>

    <Tip>Si cambias el precio de un producto, las facturas que ya creaste no se modifican. Solo afecta a las facturas nuevas que hagas a partir de ese momento.</Tip>
  </>
}

function FacturasContent() {
  return <>
    <P>La facturación es la función principal de CryptoGest. Aquí creas las facturas que envías a tus clientes, controlas si te han pagado y generas PDFs profesionales. Si nunca has hecho una factura, no te preocupes: te guiamos paso a paso.</P>

    <SectionTitle>Crear una factura nueva</SectionTitle>
    <Step n={1}>Pulsa <Ic icon={Plus} className="text-primary" /><strong>"Nueva Factura"</strong> (arriba a la derecha).</Step>
    <Step n={2}>Elige el <strong>cliente</strong> del desplegable. Si no aparece, primero tienes que darlo de alta en la sección <Ic icon={Users} className="text-violet-600" />"Clientes".</Step>
    <Step n={3}>El <strong>número de factura</strong> se pone solo (ej. FACT-001, FACT-002...). No lo cambies salvo que tengas una razón concreta.</Step>
    <Step n={4}>Comprueba la <strong>fecha</strong>. Por defecto es hoy. Si quieres, puedes poner una fecha de vencimiento (cuándo debe pagar el cliente).</Step>
    <Step n={5}><strong>Añade líneas:</strong> cada línea es algo que cobras. Puedes seleccionar un producto del catálogo (se rellena solo) o escribir un concepto libre. Para cada línea pon la cantidad, el precio y el impuesto.</Step>
    <Step n={6}>Revisa los <strong>totales</strong> de abajo: base imponible (precio sin impuestos), IVA, retención IRPF (si aplica) y total final.</Step>
    <Step n={7}>Pulsa <Ic icon={Save} className="text-primary" /><strong>"Guardar"</strong>. La factura se crea en estado "Borrador".</Step>

    <Concept term="¿Qué es la base imponible?">
      Es el precio de lo que vendes <strong>antes de sumar impuestos</strong>. Si vendes un servicio de diseño web por 500 €, esa es la base imponible. Luego se le suma el IVA (500 × 21% = 105 €) y se resta la retención IRPF si la hay (500 × 15% = 75 €). El cliente paga: 500 + 105 − 75 = <strong>530 €</strong>. La base imponible siempre son esos 500 € iniciales.
    </Concept>

    <SectionTitle>Los estados de una factura</SectionTitle>
    <P>Cada factura tiene un estado que indica en qué punto está:</P>
    <Step n={1}><Ic icon={Pencil} className="text-slate-500" /><strong>Borrador</strong> — acabas de crearla. Puedes editarla libremente. Todavía no "cuenta" para Hacienda ni para la contabilidad.</Step>
    <Step n={2}><Ic icon={Send} className="text-blue-500" /><strong>Emitida</strong> — la has enviado al cliente. A partir de aquí ya es oficial: se genera un asiento contable y aparece en los modelos fiscales. Intenta no editarla después de emitirla.</Step>
    <Step n={3}><Ic icon={CheckCircle2} className="text-emerald-500" /><strong>Pagada</strong> — el cliente ya te ha pagado. Márcala así para llevar el control de cobros.</Step>
    <Step n={4}><Ic icon={Clock} className="text-amber-500" /><strong>Vencida</strong> — ha pasado la fecha de vencimiento y no te han pagado. CryptoGest la marca automáticamente.</Step>
    <Step n={5}><Ic icon={XCircle} className="text-red-500" /><strong>Anulada</strong> — la has cancelado (por error, devolución, etc.). Se crea un asiento contable que anula el anterior.</Step>

    <Concept term="IVA repercutido: el IVA de tus ventas">
      El IVA que cobras en tus facturas se llama <strong>IVA repercutido</strong>. Tú lo cobras al cliente, pero no es dinero tuyo: lo recaudas para Hacienda. Los tipos en España son: <strong>21%</strong> (general, la mayoría de servicios y productos), <strong>10%</strong> (reducido: hostelería, transporte, alimentos elaborados) y <strong>4%</strong> (superreducido: pan, leche, libros, medicamentos).
    </Concept>

    <Concept term="Retención de IRPF: el adelanto de tus impuestos">
      Si eres autónomo y facturas a empresas, tus facturas suelen incluir una <strong>retención de IRPF</strong> (normalmente el 15%, o el 7% si llevas menos de 2 años de alta). Esto significa que el cliente no te paga todo: se queda un porcentaje y se lo paga a Hacienda por ti, como un adelanto de tu declaración de la renta. La factura muestra: Base + IVA − Retención = Total a pagar.
    </Concept>

    <SectionTitle>Previsualizar, descargar y enviar PDFs</SectionTitle>
    <P>Cada factura emitida se puede ver como PDF, descargar o enviar directamente por email al cliente. En la tabla de facturas verás tres botones en cada fila (solo para facturas no borrador):</P>
    <Step n={1}><Ic icon={FileSearch} className="text-slate-600" /><strong>Previsualizar:</strong> abre el PDF directamente en la aplicación, en una ventana modal a pantalla casi completa. Puedes revisarlo sin descargar nada. Desde ahí también puedes descargarlo si todo está correcto.</Step>
    <Step n={2}><Ic icon={Download} className="text-slate-600" /><strong>Descargar:</strong> guarda el PDF en tu ordenador. Se abre un diálogo para elegir dónde guardarlo.</Step>
    <Step n={3}><Ic icon={Mail} className="text-slate-600" /><strong>Enviar por email:</strong> envía la factura como PDF adjunto directamente desde CryptoGest. El email se rellena automáticamente con los datos del cliente, el asunto y un mensaje personalizado que puedes editar antes de enviar.</Step>
    <P>Estos mismos botones también aparecen al abrir el detalle de una factura.</P>

    <Tip>Para poder enviar facturas por email, primero tienes que configurar tu cuenta SMTP en <Ic icon={Settings} className="text-slate-600" />Configuración → <Ic icon={Mail} className="text-rose-600" />Email. Consulta la sección "Configuración" del manual para más detalles.</Tip>

    <SectionTitle>Exportar listados</SectionTitle>
    <P>Además de los PDFs individuales, puedes exportar el listado completo de facturas a <strong>CSV</strong>, <strong>Excel</strong> o <strong>JSON</strong> usando el botón <Ic icon={Download} className="text-slate-600" />"Exportar" de la parte superior.</P>

    <Warning>Hacienda exige que la numeración de facturas sea <strong>correlativa y sin saltos</strong>. Es decir, si tu última factura es la 003, la siguiente debe ser la 004, no la 007. CryptoGest se encarga de esto automáticamente, así que no cambies los números manualmente.</Warning>

    <Tip>Cuando emitas una factura (pases de "Borrador" a "Emitida"), CryptoGest crea automáticamente el asiento contable. No tienes que hacer nada en la sección de Contabilidad: todo se genera solo.</Tip>
  </>
}

function GastosContent() {
  return <>
    <P>Cada euro que gastas en tu negocio y no registras es un euro que podrías haberte deducido en impuestos. Registrar los gastos es tan importante como facturar: te permite saber cuánto ganas realmente y pagar menos IVA e IRPF de forma legal.</P>

    <SectionTitle>Registrar un gasto</SectionTitle>
    <Step n={1}>Pulsa <Ic icon={Plus} className="text-primary" /><strong>"Nuevo Gasto"</strong> (arriba a la derecha).</Step>
    <Step n={2}>Escribe una <strong>descripción</strong> breve (ej. "Hosting web enero", "Material de oficina", "Licencia Adobe").</Step>
    <Step n={3}>Pon quién te ha cobrado (<strong>proveedor</strong>) y, si la tienes, la referencia o número de la factura del proveedor.</Step>
    <Step n={4}>Introduce el <strong>importe</strong>. Puedes elegir si es con IVA incluido o sin IVA, y CryptoGest calcula el desglose solo.</Step>
    <Step n={5}>Elige el <strong>tipo de impuesto</strong> (IVA al 21% es el más habitual). CryptoGest calculará cuánto IVA puedes deducirte.</Step>
    <Step n={6}>Selecciona una <strong>categoría</strong> para clasificar el gasto (alquiler, material, software, transporte...).</Step>
    <Step n={7}>Si tienes el ticket o la factura del proveedor, <strong>adjúntalo</strong> pulsando el icono <Ic icon={Paperclip} className="text-slate-600" /> del clip. Puedes subir fotos o PDFs.</Step>

    <Concept term="IVA soportado: el IVA que TÚ pagas">
      Cuando compras algo para tu negocio y pagas IVA, ese IVA se llama <strong>IVA soportado</strong>. La buena noticia es que te lo puedes <strong>deducir</strong>: se resta del IVA que cobras a tus clientes. Ejemplo: si has cobrado 2.100 € de IVA a tus clientes y has pagado 840 € de IVA en tus compras, solo pagas a Hacienda la diferencia: 2.100 − 840 = 1.260 €. Por eso es vital registrar todos los gastos con su IVA.
    </Concept>

    <SectionTitle>¿Qué gastos me puedo deducir?</SectionTitle>
    <P>Para que un gasto sea deducible, tiene que cumplir tres cosas:</P>
    <Step n={1}><strong>Que sea de tu actividad:</strong> tiene que estar relacionado con tu negocio. El ordenador con el que trabajas sí; unas vacaciones, no.</Step>
    <Step n={2}><strong>Que tengas justificante:</strong> una factura del proveedor o un ticket. Por eso CryptoGest te permite adjuntar documentos.</Step>
    <Step n={3}><strong>Que lo registres:</strong> si no lo metes en CryptoGest, para Hacienda ese gasto no existe.</Step>

    <Tip>Registra los gastos lo antes posible, el mismo día si puedes. Acumular tickets sin registrar es la causa número uno de errores en las declaraciones trimestrales y de dinero perdido en deducciones que no se aplican.</Tip>

    <SectionTitle>Importar muchos gastos a la vez</SectionTitle>
    <P>Si tienes gastos en una hoja de cálculo (Excel, Google Sheets), puedes importarlos masivamente con <Ic icon={FileUp} className="text-primary" /><strong>"Importar CSV"</strong>. Prepara un archivo CSV con columnas: descripción, monto, fecha, proveedor y categoría, y CryptoGest los creará todos de golpe.</P>

    <SectionTitle>¿Qué pasa en la contabilidad?</SectionTitle>
    <P>Cada gasto que guardas genera automáticamente un asiento contable (no tienes que hacer nada extra). CryptoGest apunta el gasto en la cuenta correcta del plan contable y registra el IVA soportado para que se deduzca en el modelo 303.</P>
  </>
}

function EjerciciosContent() {
  return <>
    <P>Un ejercicio fiscal es, simplemente, un año contable. Va del 1 de enero al 31 de diciembre. Todas tus facturas, gastos y asientos se agrupan dentro de su ejercicio correspondiente. Es como tener una carpeta por cada año.</P>

    <Concept term="¿Qué es un ejercicio fiscal?">
      Piensa en el ejercicio fiscal como el "año escolar" de tu negocio. Empieza el 1 de enero y termina el 31 de diciembre. Durante el año registras facturas y gastos. Al final del año, "cierras" el ejercicio, presentas el resumen anual a Hacienda y abres uno nuevo para el año siguiente. CryptoGest organiza todos tus datos por ejercicios.
    </Concept>

    <SectionTitle>Gestionar ejercicios</SectionTitle>
    <Step n={1}><Ic icon={Plus} className="text-primary" /><strong>Crear:</strong> al configurar tu empresa, se crea automáticamente el ejercicio del año actual. Si necesitas uno de otro año, pulsa "Nuevo Ejercicio" y selecciona el año.</Step>
    <Step n={2}><Ic icon={Eye} className="text-slate-600" /><strong>Ver estadísticas:</strong> al pulsar sobre un ejercicio, ves un resumen de cuántas facturas, gastos y asientos tiene.</Step>
    <Step n={3}><Ic icon={Lock} className="text-amber-600" /><strong>Cerrar:</strong> cuando ha terminado el año y ya has hecho todas las declaraciones, cierra el ejercicio. Así ya nadie podrá crear facturas o gastos en ese año por error.</Step>
    <Step n={4}><Ic icon={Clock} className="text-emerald-600" /><strong>Reabrir:</strong> si después de cerrar descubres un error, puedes reabrir el ejercicio temporalmente para corregirlo. Luego vuelve a cerrarlo.</Step>

    <SectionTitle>Relación con el resto del programa</SectionTitle>
    <P>El Panel de Control muestra datos del ejercicio activo. Los modelos fiscales se calculan sobre un ejercicio concreto. Los asientos contables se agrupan por ejercicio. Es decir, todo gira alrededor del ejercicio fiscal.</P>

    <Warning>Cuando creas una factura o un gasto, CryptoGest lo asigna al ejercicio según la <strong>fecha del documento</strong>. Si pones una factura con fecha del 15 de marzo de 2026, se asigna al ejercicio 2026. Asegúrate de que el ejercicio existe y está abierto.</Warning>

    <Tip>Cada enero, recuerda crear el ejercicio fiscal del nuevo año antes de empezar a facturar. Es lo primero que deberías hacer al arrancar el año.</Tip>
  </>
}

function ContabilidadContent() {
  return <>
    <P>La contabilidad puede sonar complicada, pero CryptoGest hace casi todo automáticamente. Cuando emites una factura o registras un gasto, el programa genera los asientos contables por ti. Esta sección es para consultar esos datos y, en casos excepcionales, crear asientos manuales.</P>

    <Concept term="¿Qué es la contabilidad en pocas palabras?">
      La contabilidad es simplemente <strong>llevar un registro ordenado de todo el dinero que entra y sale</strong> de tu negocio. Cada operación (una venta, un gasto, un pago) se registra en el "libro de cuentas". Hay unas reglas para hacerlo (el Plan General Contable), pero CryptoGest las aplica automáticamente por ti.
    </Concept>

    <SectionTitle>Las 4 pestañas de Contabilidad</SectionTitle>

    <Step n={1}><Ic icon={BookOpen} className="text-indigo-600" /><strong>Plan de Cuentas:</strong> es la lista de "categorías" contables. Cada cuenta tiene un número y un nombre (ej. cuenta 430 = "Clientes", cuenta 572 = "Bancos", cuenta 705 = "Ingresos por servicios"). CryptoGest viene con las cuentas más habituales ya creadas.</Step>
    <Step n={2}><Ic icon={FileText} className="text-indigo-600" /><strong>Asientos:</strong> aquí ves todos los registros contables. La mayoría se generan solos cuando creas facturas o gastos. También puedes crear asientos manuales si necesitas registrar algo especial.</Step>
    <Step n={3}><Ic icon={Calendar} className="text-indigo-600" /><strong>Libro Diario:</strong> es la lista de todos los asientos ordenados por fecha. Es como un historial de todas las operaciones económicas de tu negocio.</Step>
    <Step n={4}><Ic icon={FileBarChart} className="text-indigo-600" /><strong>Libro Mayor:</strong> aquí puedes filtrar por una cuenta concreta para ver todos sus movimientos. Ejemplo: selecciona la cuenta 430 (Clientes) para ver todas las facturas pendientes de cobro.</Step>

    <Concept term="¿Qué es un asiento contable?">
      Un asiento es una anotación que dice: "el día X, por el concepto Y, el dinero se movió de la cuenta A a la cuenta B". Siempre tiene dos lados: el <strong>Debe</strong> (donde entra algo) y el <strong>Haber</strong> (de donde sale algo). Los dos lados siempre suman lo mismo. CryptoGest los genera automáticamente, así que solo necesitas entender qué son si quieres crear uno manual.
    </Concept>

    <Concept term="Debe y Haber: más fácil de lo que parece">
      Son simplemente la columna <strong>izquierda</strong> (Debe) y <strong>derecha</strong> (Haber) de cada asiento. No significan "deber dinero" ni "tener dinero". La regla básica: cuando <strong>vendes algo</strong>, los ingresos van al Haber. Cuando <strong>gastas algo</strong>, el gasto va al Debe. No te preocupes por esto: CryptoGest lo hace automáticamente.
    </Concept>

    <SectionTitle>El Plan General Contable (PGC) en resumen</SectionTitle>
    <P>Las cuentas se organizan en 7 grupos. Los más importantes para ti son:</P>
    <Step n={1}><strong>Grupo 4 — Clientes y proveedores:</strong> cuenta 430 (lo que te deben tus clientes), cuenta 410 (lo que tú debes a proveedores), cuentas 472/477 (IVA).</Step>
    <Step n={2}><strong>Grupo 5 — Dinero:</strong> cuenta 572 (tu banco), cuenta 570 (caja/efectivo).</Step>
    <Step n={3}><strong>Grupo 6 — Gastos:</strong> alquileres (621), suministros (628), servicios profesionales (623).</Step>
    <Step n={4}><strong>Grupo 7 — Ingresos:</strong> por servicios (705), por ventas de productos (700).</Step>

    <Tip>No necesitas tocar la contabilidad manualmente para el día a día. Los asientos automáticos cubren el 90% de las necesidades de un autónomo o pequeña empresa. Solo necesitarías crear asientos manuales para operaciones especiales (un préstamo, un ajuste, etc.).</Tip>
  </>
}

function ModelosContent() {
  return <>
    <P>Los modelos fiscales son los formularios que presentas a Hacienda cada cierto tiempo para declarar tus impuestos. CryptoGest los calcula automáticamente a partir de tus facturas y gastos. Tú solo tienes que revisarlos y trasladar las cifras a la web de Hacienda.</P>

    <Concept term="¿Qué es una declaración trimestral?">
      Cada 3 meses tienes que "rendir cuentas" a Hacienda. Le dices cuánto IVA has cobrado, cuánto has pagado y cuál es la diferencia. Los trimestres son: <strong>1T</strong> (enero-marzo, se presenta en abril), <strong>2T</strong> (abril-junio, se presenta en julio), <strong>3T</strong> (julio-septiembre, se presenta en octubre), <strong>4T</strong> (octubre-diciembre, se presenta en enero del año siguiente). El plazo es hasta el día 20 del mes.
    </Concept>

    <SectionTitle>Modelo 303 — Tu declaración de IVA trimestral</SectionTitle>
    <P>Es el modelo más importante. Calcula cuánto IVA le debes a Hacienda (o cuánto te debe ella a ti).</P>
    <Step n={1}><strong>IVA repercutido</strong> (el que cobras): CryptoGest suma el IVA de todas tus facturas emitidas y pagadas en el trimestre.</Step>
    <Step n={2}><strong>IVA soportado</strong> (el que pagas): suma el IVA de todos tus gastos del trimestre.</Step>
    <Step n={3}><strong>Resultado:</strong> repercutido menos soportado. Si el resultado es <strong>positivo</strong>, debes ese dinero a Hacienda. Si es <strong>negativo</strong>, Hacienda te lo debe a ti (puedes compensarlo en el siguiente trimestre o pedir devolución en el 4T).</Step>

    <Concept term="Ejemplo práctico del Modelo 303">
      Imagina que en el primer trimestre has emitido facturas por valor de 10.000 € (base), con 2.100 € de IVA repercutido (21%). Y has tenido gastos con una base de 4.000 € y 840 € de IVA soportado. El resultado del 303 sería: 2.100 − 840 = <strong>1.260 €</strong> a ingresar a Hacienda. Es decir, de esos 2.100 € que cobraste en IVA, te "devuelves" 840 € (porque los pagaste en compras) y el resto (1.260 €) se lo pagas a Hacienda.
    </Concept>

    <SectionTitle>Modelo 111 — Retenciones de IRPF</SectionTitle>
    <P>Si en tus facturas aplicas retención de IRPF, este modelo resume las retenciones del trimestre:</P>
    <Step n={1}><strong>Número de perceptores:</strong> cuántas facturas con retención has recibido o emitido.</Step>
    <Step n={2}><strong>Base de retenciones:</strong> la suma de las bases sobre las que se calculó la retención.</Step>
    <Step n={3}><strong>Retenciones practicadas:</strong> el total retenido que se ingresa a Hacienda.</Step>

    <SectionTitle>Modelo 390 — Resumen anual de IVA</SectionTitle>
    <P>Se presenta en enero, después de cerrar el año. Es un resumen de los 4 trimestres del 303. CryptoGest lo genera automáticamente sumando los datos de todo el año.</P>

    <Warning>Solo las facturas en estado "Emitida" o "Pagada" se incluyen en los modelos. Las facturas en "Borrador" o "Anulada" no cuentan. Si echas en falta alguna cifra, comprueba que has cambiado el estado de tus facturas.</Warning>

    <Tip>Selecciona el ejercicio y el trimestre con los desplegables de la parte superior. Compara las cifras con las de tu gestoría o asesor fiscal. Si todo cuadra, ya puedes trasladarlas a la web de Hacienda (sede electrónica AEAT).</Tip>
  </>
}

function PlantillasContent() {
  return <>
    <P>Las plantillas te permiten personalizar cómo se ven las facturas cuando las generas en PDF. Puedes poner tu logotipo, elegir colores y añadir textos personalizados en el pie de página.</P>

    <SectionTitle>Cómo personalizar tu plantilla</SectionTitle>
    <Step n={1}>Ve a <Ic icon={Settings} className="text-slate-600" /><strong>Configuración</strong> en el menú de la izquierda.</Step>
    <Step n={2}>Haz clic en la pestaña <Ic icon={Palette} className="text-pink-600" /><strong>"Templates"</strong>.</Step>
    <Step n={3}><strong>Sube tu logotipo:</strong> usa una imagen PNG con fondo transparente, idealmente de unos 200×200 píxeles. El logotipo aparecerá en la esquina superior de tus facturas.</Step>
    <Step n={4}><strong>Elige un color:</strong> selecciona el color principal que se usará en los encabezados y bordes de la factura. Puedes usar el selector visual o escribir un código de color (ej. #2563EB para azul).</Step>
    <Step n={5}><strong>Texto del pie de página:</strong> escribe lo que quieras que aparezca abajo de la factura. Lo habitual es poner el número de cuenta bancaria (IBAN) para que el cliente sepa dónde pagar, y opcionalmente condiciones de pago o un mensaje de agradecimiento.</Step>

    <SectionTitle>Vista previa en tiempo real</SectionTitle>
    <P>A la derecha del editor ves una vista previa de cómo quedará tu factura. Se actualiza en tiempo real con cada cambio que hagas. Usa datos de ejemplo para que veas cómo queda con contenido real.</P>

    <Tip>Un PDF profesional con tu logotipo y colores transmite mucha más confianza que uno genérico. Dedica 5 minutos a personalizar tu plantilla: es la imagen que reciben tus clientes cada vez que les facturas.</Tip>
  </>
}

function CloudContent() {
  return <>
    <P>Cloud Backup te permite guardar una copia de seguridad de todos tus datos en la nube (Internet). Si tu ordenador se estropea, te lo roban o lo cambias, podrás recuperar toda tu información en minutos.</P>

    <SectionTitle>Conectar tu cuenta</SectionTitle>
    <P>Hay dos formas de vincular CryptoGest con tu cuenta en la nube:</P>

    <Step n={1}><strong>Iniciar sesión desde el navegador:</strong> pulsa <strong>"Iniciar sesión en CryptoGest Cloud"</strong>. Se abrirá tu navegador para crear una cuenta o iniciar sesión. Es la forma más rápida.</Step>
    <Step n={2}><strong>Conectar con código:</strong> si prefieres no abrir el navegador, puedes vincular tu dispositivo con un código de 6 dígitos. Introduce el código que obtienes desde tu cuenta web de CryptoGest Cloud y pulsa <Ic icon={Cloud} className="text-sky-600" />"Conectar". Opcionalmente, puedes darle un nombre al dispositivo (ej. "PC Oficina", "Portátil") para identificarlo fácilmente.</Step>
    <Step n={3}>Una vez conectado, verás tu nombre, email y el plan que tienes contratado.</Step>

    <SectionTitle>Licencia y planes</SectionTitle>
    <P>CryptoGest Cloud ofrece diferentes planes según tus necesidades de almacenamiento. Además, puedes adquirir una <strong>licencia empresarial</strong> directamente desde la aplicación:</P>
    <Step n={1}>Ve a la pestaña <strong>"Plan y uso"</strong> dentro de Cloud Backup.</Step>
    <Step n={2}>Verás tu plan actual con el espacio de almacenamiento y el número de backups disponibles.</Step>
    <Step n={3}>Si quieres la licencia, pulsa <Ic icon={Key} className="text-amber-600" /><strong>"Comprar licencia"</strong>. Se abrirá una pasarela de pago segura. La licencia es de <strong>pago único y perpetua</strong> (no hay cuotas mensuales).</Step>
    <Step n={4}>Con la licencia puedes, entre otras cosas, ocultar la firma de CryptoGest en los emails que envíes a tus clientes.</Step>

    <SectionTitle>Hacer una copia de seguridad</SectionTitle>
    <Step n={1}>Pulsa <Ic icon={Upload} className="text-primary" /><strong>"Subir Backup"</strong>.</Step>
    <Step n={2}>CryptoGest comprime y <Ic icon={Shield} className="text-emerald-600" /><strong>cifra</strong> toda tu base de datos antes de enviarla. Nadie puede leer tus datos en el servidor.</Step>
    <Step n={3}>Cuando termine, el backup aparece en la lista con la fecha y el tamaño.</Step>

    <SectionTitle>Restaurar un backup</SectionTitle>
    <Step n={1}>Selecciona el backup que quieres recuperar de la lista.</Step>
    <Step n={2}>Pulsa <Ic icon={Download} className="text-primary" /><strong>"Restaurar"</strong>. CryptoGest lo descarga, lo descifra y reemplaza la base de datos actual.</Step>

    <Warning>
      <strong>Cuidado:</strong> restaurar un backup reemplaza todos los datos actuales. Si has hecho cambios después de la fecha del backup, se perderán. Lo ideal es hacer un backup de la base actual antes de restaurar otro.
    </Warning>

    <Concept term="¿Están seguros mis datos en la nube?">
      <strong>Sí.</strong> CryptoGest usa cifrado de extremo a extremo. Esto significa que tus datos se cifran en tu ordenador <strong>antes</strong> de salir, y solo se pueden descifrar con tu contraseña maestra. Ni el servidor, ni los administradores, ni nadie puede leer tus datos. Es como mandar una carta en una caja fuerte: aunque alguien intercepte la caja, no puede abrirla sin la llave (tu contraseña).
    </Concept>

    <SectionTitle>Eliminar backups antiguos</SectionTitle>
    <P>Puedes borrar copias de seguridad antiguas que ya no necesites para liberar espacio en tu cuenta. El espacio disponible depende de tu plan.</P>

    <Tip>Haz un backup al menos una vez por semana, y siempre antes de actualizar CryptoGest o hacer cambios importantes. Un backup de más nunca sobra; un backup de menos puede ser un desastre.</Tip>
  </>
}

function ConfiguracionContent() {
  return <>
    <P>Aquí ajustas todo lo relacionado con tu empresa, la facturación, los impuestos y la seguridad. Es la "sala de máquinas" de CryptoGest.</P>

    <SectionTitle>Pestaña "Empresa"</SectionTitle>
    <P>Los datos de tu empresa: nombre, NIF, dirección, teléfono, email y web. Estos datos aparecen automáticamente en las cabeceras de tus facturas.</P>
    <Step n={1}>Modifica cualquier campo y pulsa <Ic icon={Save} className="text-primary" /><strong>"Guardar"</strong>.</Step>
    <Step n={2}>Los cambios se aplican a las facturas <strong>nuevas</strong>. Las que ya creaste conservan los datos originales.</Step>

    <SectionTitle>Pestaña "Facturación"</SectionTitle>
    <Step n={1}><strong>Serie de factura:</strong> el prefijo de tus facturas (ej. "FACT", "F-2026"). Puedes cambiarlo cuando quieras.</Step>
    <Step n={2}><strong>Próximo número:</strong> el número que se asignará a la siguiente factura. CryptoGest lo incrementa automáticamente.</Step>
    <Step n={3}><strong>Días de vencimiento:</strong> cuántos días tiene el cliente para pagar (ej. 30). Se aplica por defecto al crear facturas.</Step>
    <Step n={4}><strong>Pie de página:</strong> texto del pie de tus PDFs (datos bancarios, condiciones de pago, etc.).</Step>

    <SectionTitle>Pestaña "Impuestos"</SectionTitle>
    <P>Aquí gestionas los tipos de IVA e IRPF disponibles:</P>
    <Step n={1}>CryptoGest viene con los más habituales: IVA 21%, 10%, 4%, Exento, IRPF 15% y 7%.</Step>
    <Step n={2}>Puedes <strong>crear</strong> nuevos tipos si los necesitas (ej. IGIC para Canarias).</Step>
    <Step n={3}>Puedes <strong>editar</strong> o <strong>desactivar</strong> los existentes. Los desactivados dejan de aparecer en los desplegables.</Step>
    <Step n={4}>Marca uno como <strong>por defecto</strong> (icono <Ic icon={Star} className="text-amber-500" /> estrella) para que se seleccione automáticamente al crear productos y líneas de factura.</Step>

    <SectionTitle>Pestaña "Email"</SectionTitle>
    <P>Configura tu cuenta de correo para poder enviar facturas por email directamente desde CryptoGest:</P>
    <Step n={1}><strong>Servidor SMTP:</strong> la dirección del servidor de correo (ej. smtp.gmail.com para Gmail, smtp.office365.com para Outlook).</Step>
    <Step n={2}><strong>Puerto:</strong> normalmente 587. Si usas SSL/TLS, el puerto suele ser 465 (activa el interruptor "SSL/TLS").</Step>
    <Step n={3}><strong>Usuario y contraseña:</strong> las credenciales de tu cuenta de correo. Para Gmail, necesitas una "contraseña de aplicación" (no tu contraseña normal): ve a tu cuenta de Google → Seguridad → Contraseñas de aplicaciones.</Step>
    <Step n={4}><strong>Nombre y email del remitente:</strong> el nombre y dirección que verán tus clientes cuando reciban la factura (ej. "Mi Empresa S.L." y "facturacion@empresa.es").</Step>
    <Step n={5}>Pulsa <strong>"Probar conexión"</strong> para verificar que todo está bien configurado antes de guardar.</Step>

    <Tip>Si tienes la licencia empresarial, puedes ocultar la firma de CryptoGest en los emails. Activa el interruptor "Firma de CryptoGest en emails" en esta misma pestaña.</Tip>

    <SectionTitle>Otras pestañas</SectionTitle>
    <Step n={1}><Ic icon={Shield} className="text-red-600" /><strong>"Seguridad":</strong> cambiar contraseña maestra y configurar passkey (ver sección "Seguridad y Cifrado" del manual).</Step>
    <Step n={2}><Ic icon={Cloud} className="text-sky-600" /><strong>"Backup":</strong> opciones de copia de seguridad local (exportar/importar la base de datos a un archivo).</Step>
    <Step n={3}><Ic icon={Palette} className="text-pink-600" /><strong>"Templates":</strong> editor de plantillas de factura (ver sección "Plantillas de Factura" del manual).</Step>

    <Tip>Si cambias de domicilio fiscal, actualiza la dirección aquí para que las nuevas facturas la reflejen. Las facturas ya emitidas conservan la dirección antigua, que es lo correcto legalmente.</Tip>
  </>
}

function SeguridadContent() {
  return <>
    <P>La seguridad es una prioridad en CryptoGest. Toda tu información se guarda cifrada en tu ordenador. Sin tu contraseña, nadie puede acceder a tus datos, ni siquiera si tiene acceso físico al archivo de la base de datos.</P>

    <SectionTitle>Cómo funciona el cifrado</SectionTitle>
    <P>CryptoGest usa <strong>AES-256</strong>, el mismo sistema de cifrado que utilizan bancos, gobiernos y ejércitos. Tu contraseña maestra se transforma en una clave de cifrado que protege cada dato almacenado.</P>

    <Concept term="¿Qué es el cifrado AES-256?">
      Imagina que metes tus datos en una caja fuerte digital con una combinación de 256 ceros y unos. Hay tantas combinaciones posibles (más que átomos en el universo observable) que ni el ordenador más potente del mundo podría probar todas en miles de años. <strong>Es literalmente imposible</strong> acceder a tus datos sin la contraseña. Es el estándar de seguridad más alto que existe.
    </Concept>

    <SectionTitle>La contraseña maestra</SectionTitle>
    <Step n={1}>Se establece al crear la empresa. Es la llave de todos tus datos.</Step>
    <Step n={2}>Puedes cambiarla en <Ic icon={Settings} className="text-slate-600" />Configuración → <Ic icon={Shield} className="text-red-600" />Seguridad. Al hacerlo, toda la base de datos se recifra con la nueva clave.</Step>
    <Step n={3}>CryptoGest <strong>nunca guarda tu contraseña</strong>. Solo guarda una "huella digital" (hash) para verificar que es correcta cuando la introduces.</Step>

    <Warning>
      <strong>Si pierdes la contraseña, pierdes los datos.</strong> No hay "olvidé mi contraseña", no hay servicio de soporte que pueda recuperarla, no hay puerta trasera. Es el precio de la seguridad total. Apúntala en papel y guárdalo en un lugar seguro.
    </Warning>

    <SectionTitle>Passkey: desbloqueo rápido</SectionTitle>
    <P>Para no tener que escribir la contraseña cada vez que abres CryptoGest, puedes configurar una passkey:</P>
    <Step n={1}>Ve a <Ic icon={Settings} className="text-slate-600" />Configuración → <Ic icon={Shield} className="text-red-600" />Seguridad.</Step>
    <Step n={2}>Pulsa <Ic icon={Fingerprint} className="text-primary" /><strong>"Configurar Passkey"</strong>.</Step>
    <Step n={3}>Tu ordenador o móvil te pedirá una verificación: <Ic icon={Fingerprint} className="text-emerald-600" /> huella dactilar, reconocimiento facial o llave de seguridad USB.</Step>
    <Step n={4}>A partir de ahora, al abrir CryptoGest puedes desbloquear con tu huella o rostro en vez de escribir la contraseña.</Step>

    <SectionTitle>Bloquear el programa</SectionTitle>
    <P>El botón <Ic icon={Lock} className="text-red-500" /><strong>"Bloquear Sistema"</strong> (abajo en el menú de la izquierda) cierra la sesión inmediatamente. Úsalo siempre que te levantes del ordenador. Para volver a entrar necesitarás la contraseña o la passkey.</P>

    <SectionTitle>Cada empresa es independiente</SectionTitle>
    <P>Si tienes varias empresas, cada una tiene su propia base de datos cifrada con su propia contraseña. Es imposible que los datos de una se mezclen con los de otra.</P>

    <Tip>Usa una contraseña diferente para cada empresa. Así, aunque alguien descubra la contraseña de una, las demás siguen protegidas.</Tip>
  </>
}

function GlosarioContent() {
  return <>
    <P>Aquí encontrarás los conceptos financieros, fiscales y contables que aparecen en CryptoGest, explicados con palabras sencillas. Consúltalos siempre que veas un término que no entiendas.</P>

    <SectionTitle>Impuestos (lo que pagas a Hacienda)</SectionTitle>

    <Concept term="IVA (Impuesto sobre el Valor Añadido)">
      Impuesto que se añade al precio de todo lo que se vende. Tú lo cobras al cliente y se lo pagas a Hacienda. Los tipos en España son: <strong>21%</strong> (general: la mayoría de cosas), <strong>10%</strong> (reducido: hostelería, transporte) y <strong>4%</strong> (superreducido: pan, leche, libros). En Canarias se llama IGIC y tiene otros porcentajes.
    </Concept>

    <Concept term="IVA repercutido">
      El IVA que <strong>cobras</strong> a tus clientes en tus facturas. Se llama "repercutido" porque lo "repercutes" (trasladas) al cliente. No es dinero tuyo: lo recaudas para Hacienda.
    </Concept>

    <Concept term="IVA soportado">
      El IVA que <strong>pagas</strong> cuando compras algo para tu negocio. Lo "soportas" (aguantas) como comprador. Te lo puedes deducir: se resta del IVA repercutido. Así solo pagas la diferencia.
    </Concept>

    <Concept term="IRPF (Impuesto sobre la Renta)">
      Impuesto sobre lo que ganas. Los autónomos lo pagan en la declaración de la renta anual. Las <strong>retenciones</strong> son pagos anticipados: tu cliente retiene un porcentaje de tus facturas (15% general, 7% los 2 primeros años) y lo ingresa a Hacienda en tu nombre.
    </Concept>

    <Concept term="Base imponible">
      El precio de lo que vendes <strong>antes de impuestos</strong>. Es el punto de partida para calcular el IVA y las retenciones. Ejemplo: servicio de 100 € → base imponible 100 €, IVA 21 €, total 121 €.
    </Concept>

    <Concept term="Hecho imponible">
      La acción que genera la obligación de pagar un impuesto. Para el IVA, es vender algo o prestar un servicio. Para el IRPF, es ganar dinero.
    </Concept>

    <Concept term="Devengo">
      El momento en que "nace" la obligación de pagar el impuesto. Para el IVA, es cuando emites la factura, <strong>no cuando te pagan</strong>. Esto es importante: si emites una factura en marzo pero el cliente te paga en junio, el IVA se declara en el trimestre de marzo (1T).
    </Concept>

    <Concept term="Gasto deducible">
      Un gasto que puedes restar de tus ingresos para pagar menos impuestos. Debe estar relacionado con tu negocio, tener justificante (factura/ticket) y estar registrado en tu contabilidad. Ejemplos: alquiler, software, material, transporte, formación profesional.
    </Concept>

    <SectionTitle>Facturación (tus ventas)</SectionTitle>

    <Concept term="Factura">
      Documento legal que acredita que has vendido algo o prestado un servicio. Debe incluir: tus datos, los del cliente, número correlativo, fecha, descripción, precios, impuestos y total. Es obligatorio emitirla cuando vendes a otras empresas o autónomos.
    </Concept>

    <Concept term="Factura rectificativa">
      Factura que corrige un error de otra anterior. Si te equivocas en una factura emitida, no la "borras": la anulas y creas una nueva correcta.
    </Concept>

    <Concept term="Serie de facturación">
      El sistema de numeración: un prefijo (ej. "FACT-") más un número correlativo (001, 002, 003...). La ley exige que no haya saltos. CryptoGest gestiona la numeración automáticamente.
    </Concept>

    <Concept term="Fecha de vencimiento">
      Fecha límite para que el cliente pague. Lo normal son 30 o 60 días desde la emisión. Si no paga a tiempo, la factura se marca como "vencida".
    </Concept>

    <Concept term="Retención">
      Porcentaje que el cliente retiene de tu factura y paga directamente a Hacienda en tu nombre, como adelanto de tu IRPF. Normalmente 15% (o 7% los primeros 2 años de autónomo).
    </Concept>

    <SectionTitle>Contabilidad (el registro de todo)</SectionTitle>

    <Concept term="Plan General Contable (PGC)">
      La "lista oficial" de categorías contables en España. Cada cuenta tiene un número y un nombre: 430 = Clientes, 572 = Bancos, 705 = Ingresos por servicios, etc. CryptoGest lo usa internamente para registrar las operaciones.
    </Concept>

    <Concept term="Asiento contable">
      El registro de una operación en el libro de cuentas. Dice qué cuentas se mueven, cuánto y en qué dirección (Debe o Haber). CryptoGest los genera automáticamente al crear facturas y gastos.
    </Concept>

    <Concept term="Partida doble">
      Regla de oro de la contabilidad: cada operación se anota en dos sitios, Debe y Haber, por el mismo importe. Es como una balanza que siempre está equilibrada.
    </Concept>

    <Concept term="Debe y Haber">
      Son las dos columnas de cada asiento. <strong>Debe</strong> = columna izquierda. <strong>Haber</strong> = columna derecha. No significan "deber" ni "tener": son solo nombres técnicos. CryptoGest los rellena automáticamente.
    </Concept>

    <Concept term="Libro Diario">
      Lista de todas las operaciones contables ordenadas por fecha. Es obligatorio por ley. CryptoGest lo genera automáticamente.
    </Concept>

    <Concept term="Libro Mayor">
      Vista de una cuenta concreta con todos sus movimientos y su saldo. Es como ver el extracto de una "cuenta" específica de tu contabilidad.
    </Concept>

    <Concept term="Activo">
      Lo que la empresa tiene o le deben: dinero en el banco, equipos, facturas pendientes de cobro. Es todo lo que "suma".
    </Concept>

    <Concept term="Pasivo">
      Lo que la empresa debe a otros: facturas de proveedores pendientes, préstamos, IVA pendiente de pagar a Hacienda.
    </Concept>

    <Concept term="Patrimonio neto">
      Activo menos Pasivo. Es lo que realmente "vale" tu negocio después de pagar todas las deudas.
    </Concept>

    <SectionTitle>Fiscalidad (tus obligaciones con Hacienda)</SectionTitle>

    <Concept term="Ejercicio fiscal">
      Un año contable: del 1 de enero al 31 de diciembre. Al final se cierran las cuentas y se presentan las declaraciones anuales.
    </Concept>

    <Concept term="Trimestre fiscal">
      División del año en 4 períodos de 3 meses. Cada trimestre se presentan declaraciones. 1T: ene-mar (se presenta en abril). 2T: abr-jun (en julio). 3T: jul-sep (en octubre). 4T: oct-dic (en enero del año siguiente).
    </Concept>

    <Concept term="Modelo 303">
      Declaración trimestral de IVA. IVA cobrado − IVA pagado = resultado a pagar (o a compensar). Se presenta los primeros 20 días del mes siguiente al trimestre.
    </Concept>

    <Concept term="Modelo 111">
      Declaración trimestral de retenciones de IRPF. Se presenta en los mismos plazos que el 303.
    </Concept>

    <Concept term="Modelo 390">
      Resumen anual de IVA. Junta los 4 trimestres. Se presenta en enero del año siguiente.
    </Concept>

    <Concept term="AEAT (Hacienda)">
      Agencia Estatal de Administración Tributaria. Es el organismo que recauda los impuestos en España. Ante ella presentas tus declaraciones trimestrales y anuales.
    </Concept>

    <Concept term="Amortización">
      Cuando compras algo caro que dura años (un ordenador de 1.200 €, un coche...), no puedes deducirlo todo de golpe. Lo "repartes" en varios años según su vida útil. Un ordenador se suele amortizar en 4 años: 300 €/año.
    </Concept>

    <Tip>Este glosario cubre lo más habitual para autónomos y pymes en España. Si tienes dudas sobre situaciones complejas (operaciones internacionales, régimen de módulos, etc.), consulta con un asesor fiscal o gestoría.</Tip>
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

export function ManualPage({ section }: ManualPageProps) {
  const [activePage, setActivePage] = useState(section && sections.find(s => s.id === section) ? section : "inicio")
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    if (section && sections.find(s => s.id === section)) {
      setActivePage(section)
    }
  }, [section])

  const filteredSections = useMemo(() => {
    if (!searchTerm.trim()) return sections
    const q = searchTerm.toLowerCase()
    return sections.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.keywords.some(k => k.includes(q)) ||
      s.desc.toLowerCase().includes(q)
    )
  }, [searchTerm])

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

  const navigate = (id: string) => {
    setActivePage(id)
    setSearchTerm("")
  }

  return (
    <div className="flex gap-0 min-h-0 pb-4">
      {/* Left nav */}
      <div className="w-48 shrink-0 pr-4 border-r mr-5 space-y-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

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
                      <span className="truncate">{s.title}</span>
                      {isActive && <CheckCircle2 className="h-3 w-3 shrink-0 ml-auto text-primary/50" />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {filteredSections.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">
              Sin resultados para "{searchTerm}"
            </p>
          )}
        </nav>
      </div>

      {/* Content area */}
      <div className="flex-1 min-w-0">
        {/* Page header */}
        {!isHome && (
          <div className={`border-b pb-4 mb-6 border-l-4 pl-4 ${currentSection.border}`}>
            <div className="flex items-center gap-2.5">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${currentSection.bg}`}>
                <SectionIcon className={`h-4 w-4 ${currentSection.color}`} />
              </div>
              <div>
                <h1 className="text-lg font-semibold">{currentSection.title}</h1>
                <p className="text-xs text-muted-foreground">{currentSection.desc} — {currentIndex + 1} de {sections.length}</p>
              </div>
            </div>
          </div>
        )}

        {/* Page content */}
        {isHome ? (
          <ContentComponent onNavigate={navigate} />
        ) : (
          <Card>
            <CardContent className="pt-6 pb-8 max-w-none">
              <ContentComponent onNavigate={navigate} />
            </CardContent>
          </Card>
        )}

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
  )
}
