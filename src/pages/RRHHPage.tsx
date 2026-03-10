import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { formatDate, formatCurrency, translateError } from "@/lib/formatting"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  UserCog,
  HelpCircle,
  FileText,
  Building2,
  Users,
} from "lucide-react"

// ── Empty form defaults ────────────────────────────────────────────────

const emptyEmpleadoForm = {
  nombre: "",
  apellidos: "",
  nif: "",
  fechaNacimiento: "",
  genero: "",
  estadoCivil: "",
  email: "",
  telefono: "",
  direccion: "",
  codigoPostal: "",
  ciudad: "",
  provincia: "",
  departamentoId: "",
  categoriaProfesional: "",
  grupoCotizacion: "1",
  codigoCNAE: "",
  fechaAlta: new Date().toISOString().split("T")[0],
  porcentajeIRPF: "15",
  diasVacacionesAnuales: "22",
  iban: "",
  numSeguridadSocial: "",
}

const emptyContratoForm = {
  empleadoId: "",
  tipoContrato: "indefinido",
  fechaInicio: new Date().toISOString().split("T")[0],
  fechaFin: "",
  jornada: "completa",
  horasSemanales: "40",
  salarioBrutoAnual: "",
  salarioBrutoMensual: "",
  numPagasExtra: "2",
  pagasProrrateadas: false,
  convenioColectivo: "",
  porcentajeATEP: "1.5",
}

const emptyDepartamentoForm = {
  nombre: "",
  activo: true,
}

// ── Helper: compute monthly salary ─────────────────────────────────────

function calcularSalarioMensual(
  brutoAnual: number,
  numPagasExtra: number,
  pagasProrrateadas: boolean
): number {
  if (!brutoAnual || brutoAnual <= 0) return 0
  const divisor = 12 + numPagasExtra * (pagasProrrateadas ? 0 : 1)
  return divisor > 0 ? brutoAnual / divisor : 0
}

// ── Contract type labels ───────────────────────────────────────────────

const TIPOS_CONTRATO = [
  { value: "indefinido", label: "Indefinido" },
  { value: "temporal", label: "Temporal" },
  { value: "formacion", label: "Formacion y aprendizaje" },
  { value: "practicas", label: "Practicas" },
  { value: "obra_servicio", label: "Obra o servicio" },
  { value: "interinidad", label: "Interinidad" },
  { value: "relevo", label: "Relevo" },
  { value: "fijo_discontinuo", label: "Fijo discontinuo" },
]

const TIPOS_JORNADA = [
  { value: "completa", label: "Jornada completa" },
  { value: "parcial", label: "Jornada parcial" },
  { value: "reducida", label: "Jornada reducida" },
]

// ═══════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════

export function RRHHPage({ onHelp }: { onHelp?: () => void }) {
  const { t } = useTranslation(["rrhh", "common"])
  const [activeTab, setActiveTab] = useState("empleados")

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          {onHelp && (
            <button
              onClick={onHelp}
              className="rounded-full p-1.5 hover:bg-accent transition-colors"
              title={t("common:viewHelp")}
            >
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="empleados">
            <Users className="mr-1 h-3.5 w-3.5" />
            {t("tabs.empleados")}
          </TabsTrigger>
          <TabsTrigger value="contratos">
            <FileText className="mr-1 h-3.5 w-3.5" />
            {t("tabs.contratos")}
          </TabsTrigger>
          <TabsTrigger value="departamentos">
            <Building2 className="mr-1 h-3.5 w-3.5" />
            {t("tabs.departamentos")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="empleados">
          <EmpleadosTab />
        </TabsContent>
        <TabsContent value="contratos">
          <ContratosTab />
        </TabsContent>
        <TabsContent value="departamentos">
          <DepartamentosTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Tab 1 — Empleados
// ═══════════════════════════════════════════════════════════════════════

function EmpleadosTab() {
  const { t } = useTranslation(["rrhh", "common"])

  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [departamentos, setDepartamentos] = useState<Departamento[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingEmpleado, setEditingEmpleado] = useState<Empleado | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [empleadoToDelete, setEmpleadoToDelete] = useState<Empleado | null>(null)
  const [formData, setFormData] = useState(emptyEmpleadoForm)
  const [error, setError] = useState("")

  const loadData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true)
      const [empRes, depRes] = await Promise.all([
        window.electronAPI?.empleados.getAll(),
        window.electronAPI?.departamentos.getAll(),
      ])
      if (empRes?.success && empRes.data) setEmpleados(empRes.data)
      if (depRes?.success && depRes.data) setDepartamentos(depRes.data)
    } catch (err) {
      console.error("Error loading empleados:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const unsub = window.electronAPI?.onEntityUpdated?.((data) => {
      if (["empleado", "departamento"].includes(data.entityType)) {
        loadData(false)
      }
    })
    return () => { unsub?.() }
  }, [loadData])

  const filteredEmpleados = empleados.filter((emp) => {
    const fullName = `${emp.nombre} ${emp.apellidos}`.toLowerCase()
    const term = searchTerm.toLowerCase()
    return (
      fullName.includes(term) ||
      (emp.nif ?? "").toLowerCase().includes(term) ||
      (emp.email ?? "").toLowerCase().includes(term)
    )
  })

  const activeCount = empleados.filter((e) => e.activo).length

  const handleOpenDialog = (empleado?: Empleado) => {
    setError("")
    if (empleado) {
      setEditingEmpleado(empleado)
      setFormData({
        nombre: empleado.nombre,
        apellidos: empleado.apellidos,
        nif: empleado.nif,
        fechaNacimiento: empleado.fechaNacimiento
          ? new Date(empleado.fechaNacimiento).toISOString().split("T")[0]
          : "",
        genero: empleado.genero || "",
        estadoCivil: empleado.estadoCivil || "",
        email: empleado.email || "",
        telefono: empleado.telefono || "",
        direccion: empleado.direccion || "",
        codigoPostal: empleado.codigoPostal || "",
        ciudad: empleado.ciudad || "",
        provincia: empleado.provincia || "",
        departamentoId: empleado.departamentoId?.toString() || "",
        categoriaProfesional: empleado.categoriaProfesional || "",
        grupoCotizacion: empleado.grupoCotizacion.toString(),
        codigoCNAE: empleado.codigoCNAE || "",
        fechaAlta: new Date(empleado.fechaAlta).toISOString().split("T")[0],
        porcentajeIRPF: empleado.porcentajeIRPF.toString(),
        diasVacacionesAnuales: empleado.diasVacacionesAnuales.toString(),
        iban: empleado.iban || "",
        numSeguridadSocial: empleado.numSeguridadSocial || "",
      })
    } else {
      setEditingEmpleado(null)
      setFormData(emptyEmpleadoForm)
    }
    setIsDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.nombre.trim() || !formData.apellidos.trim() || !formData.nif.trim()) return

    setIsSaving(true)
    setError("")
    try {
      const payload: any = {
        nombre: formData.nombre.trim(),
        apellidos: formData.apellidos.trim(),
        nif: formData.nif.trim(),
        fechaNacimiento: formData.fechaNacimiento || null,
        genero: formData.genero || null,
        estadoCivil: formData.estadoCivil || null,
        email: formData.email || null,
        telefono: formData.telefono || null,
        direccion: formData.direccion || null,
        codigoPostal: formData.codigoPostal || null,
        ciudad: formData.ciudad || null,
        provincia: formData.provincia || null,
        departamentoId: formData.departamentoId ? parseInt(formData.departamentoId) : null,
        categoriaProfesional: formData.categoriaProfesional || null,
        grupoCotizacion: parseInt(formData.grupoCotizacion) || 1,
        codigoCNAE: formData.codigoCNAE || null,
        fechaAlta: formData.fechaAlta,
        porcentajeIRPF: parseFloat(formData.porcentajeIRPF) || 0,
        diasVacacionesAnuales: parseInt(formData.diasVacacionesAnuales) || 22,
        iban: formData.iban || null,
        numSeguridadSocial: formData.numSeguridadSocial || null,
      }

      let response
      if (editingEmpleado) {
        response = await window.electronAPI?.empleados.update(editingEmpleado.id, payload)
      } else {
        response = await window.electronAPI?.empleados.create(payload)
      }

      if (response?.success) {
        await loadData()
        setIsDialogOpen(false)
      } else {
        setError(translateError(response?.error, response?.errorParams))
      }
    } catch (err) {
      console.error("Error saving empleado:", err)
      setError(translateError("generic"))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!empleadoToDelete) return
    try {
      const response = await window.electronAPI?.empleados.delete(empleadoToDelete.id)
      if (response?.success) {
        await loadData()
      }
    } catch (err) {
      console.error("Error deleting empleado:", err)
    } finally {
      setDeleteDialogOpen(false)
      setEmpleadoToDelete(null)
    }
  }

  const confirmDelete = (empleado: Empleado) => {
    setEmpleadoToDelete(empleado)
    setDeleteDialogOpen(true)
  }

  const getDepartamentoNombre = (depId: number | null | undefined) => {
    if (!depId) return "-"
    return departamentos.find((d) => d.id === depId)?.nombre || "-"
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t("empleados.totalEmpleados")}</p>
            <p className="text-lg font-semibold tabular-nums">{empleados.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t("empleados.activos")}</p>
            <p className="text-lg font-semibold tabular-nums">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t("empleados.inactivos")}</p>
            <p className="text-lg font-semibold tabular-nums">{empleados.length - activeCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">{t("empleados.listTitle")}</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("common:search")}
                  className="pl-8 h-8 w-48 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button size="sm" onClick={() => handleOpenDialog()}>
                <Plus className="mr-1 h-4 w-4" />
                {t("empleados.nuevo")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 text-xs">{t("empleados.nombreCompleto")}</TableHead>
                <TableHead className="h-9 text-xs">{t("empleados.nif")}</TableHead>
                <TableHead className="h-9 text-xs">{t("empleados.departamento")}</TableHead>
                <TableHead className="h-9 text-xs">{t("empleados.categoria")}</TableHead>
                <TableHead className="h-9 text-xs text-center">{t("common:status")}</TableHead>
                <TableHead className="h-9 text-xs">{t("empleados.fechaAlta")}</TableHead>
                <TableHead className="h-9 text-xs text-right">{t("common:actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmpleados.map((emp) => (
                <TableRow key={emp.id} className={!emp.activo ? "opacity-60" : ""}>
                  <TableCell className="py-2 font-medium">
                    {emp.nombre} {emp.apellidos}
                  </TableCell>
                  <TableCell className="py-2 font-mono text-xs">{emp.nif}</TableCell>
                  <TableCell className="py-2 text-xs">
                    {getDepartamentoNombre(emp.departamentoId)}
                  </TableCell>
                  <TableCell className="py-2 text-xs">
                    {emp.categoriaProfesional || "-"}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <Badge variant={emp.activo ? "success" : "secondary"}>
                      {emp.activo ? t("common:active") : t("common:inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-xs">
                    {formatDate(emp.fechaAlta)}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleOpenDialog(emp)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                        onClick={() => confirmDelete(emp)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredEmpleados.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserCog className="h-8 w-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {searchTerm
                  ? t("empleados.noResultados")
                  : t("empleados.sinEmpleados")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Empleado Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingEmpleado ? t("empleados.editar") : t("empleados.nuevoDialog")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Section: Personal data */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">
                {t("empleados.seccionPersonal")}
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.nombre")} *</Label>
                  <Input
                    className="h-8 text-sm"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.apellidos")} *</Label>
                  <Input
                    className="h-8 text-sm"
                    value={formData.apellidos}
                    onChange={(e) => setFormData({ ...formData, apellidos: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.nif")} *</Label>
                  <Input
                    className="h-8 text-sm"
                    value={formData.nif}
                    onChange={(e) => setFormData({ ...formData, nif: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.fechaNacimiento")}</Label>
                  <Input
                    className="h-8 text-sm"
                    type="date"
                    value={formData.fechaNacimiento}
                    onChange={(e) => setFormData({ ...formData, fechaNacimiento: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.genero")}</Label>
                  <Select
                    value={formData.genero}
                    onValueChange={(v) => setFormData({ ...formData, genero: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder={t("common:select")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">{t("empleados.generoM")}</SelectItem>
                      <SelectItem value="femenino">{t("empleados.generoF")}</SelectItem>
                      <SelectItem value="otro">{t("empleados.generoO")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.estadoCivil")}</Label>
                  <Select
                    value={formData.estadoCivil}
                    onValueChange={(v) => setFormData({ ...formData, estadoCivil: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder={t("common:select")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="soltero">{t("empleados.estadoCivilSoltero")}</SelectItem>
                      <SelectItem value="casado">{t("empleados.estadoCivilCasado")}</SelectItem>
                      <SelectItem value="divorciado">{t("empleados.estadoCivilDivorciado")}</SelectItem>
                      <SelectItem value="viudo">{t("empleados.estadoCivilViudo")}</SelectItem>
                      <SelectItem value="separado">{t("empleados.estadoCivilSeparado")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Section: Contact */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">
                {t("empleados.seccionContacto")}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("common:email")}</Label>
                  <Input
                    className="h-8 text-sm"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("common:phone")}</Label>
                  <Input
                    className="h-8 text-sm"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1.5 mt-3">
                <Label className="text-xs">{t("common:address")}</Label>
                <Input
                  className="h-8 text-sm"
                  value={formData.direccion}
                  onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.codigoPostal")}</Label>
                  <Input
                    className="h-8 text-sm"
                    value={formData.codigoPostal}
                    onChange={(e) => setFormData({ ...formData, codigoPostal: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.ciudad")}</Label>
                  <Input
                    className="h-8 text-sm"
                    value={formData.ciudad}
                    onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.provincia")}</Label>
                  <Input
                    className="h-8 text-sm"
                    value={formData.provincia}
                    onChange={(e) => setFormData({ ...formData, provincia: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Section: Laboral */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wide">
                {t("empleados.seccionLaboral")}
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.departamento")}</Label>
                  <Select
                    value={formData.departamentoId}
                    onValueChange={(v) => setFormData({ ...formData, departamentoId: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder={t("common:select")} />
                    </SelectTrigger>
                    <SelectContent>
                      {departamentos
                        .filter((d) => d.activo)
                        .map((dep) => (
                          <SelectItem key={dep.id} value={dep.id.toString()}>
                            {dep.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.categoria")}</Label>
                  <Input
                    className="h-8 text-sm"
                    value={formData.categoriaProfesional}
                    onChange={(e) =>
                      setFormData({ ...formData, categoriaProfesional: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.grupoCotizacion")}</Label>
                  <Select
                    value={formData.grupoCotizacion}
                    onValueChange={(v) => setFormData({ ...formData, grupoCotizacion: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
                        <SelectItem key={g} value={g.toString()}>
                          {t(`empleados.grupo${g}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.codigoCNAE")}</Label>
                  <Input
                    className="h-8 text-sm"
                    value={formData.codigoCNAE}
                    onChange={(e) => setFormData({ ...formData, codigoCNAE: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.fechaAlta")} *</Label>
                  <Input
                    className="h-8 text-sm"
                    type="date"
                    value={formData.fechaAlta}
                    onChange={(e) => setFormData({ ...formData, fechaAlta: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.porcentajeIRPF")}</Label>
                  <Input
                    className="h-8 text-sm"
                    type="number"
                    step="0.01"
                    value={formData.porcentajeIRPF}
                    onChange={(e) => setFormData({ ...formData, porcentajeIRPF: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.diasVacaciones")}</Label>
                  <Input
                    className="h-8 text-sm"
                    type="number"
                    value={formData.diasVacacionesAnuales}
                    onChange={(e) =>
                      setFormData({ ...formData, diasVacacionesAnuales: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.iban")}</Label>
                  <Input
                    className="h-8 text-sm font-mono"
                    value={formData.iban}
                    onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t("empleados.numSeguridadSocial")}</Label>
                  <Input
                    className="h-8 text-sm font-mono"
                    value={formData.numSeguridadSocial}
                    onChange={(e) =>
                      setFormData({ ...formData, numSeguridadSocial: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
              {t("common:cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={
                isSaving ||
                !formData.nombre.trim() ||
                !formData.apellidos.trim() ||
                !formData.nif.trim()
              }
            >
              {isSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {editingEmpleado ? t("common:save") : t("common:create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              {t("empleados.eliminar")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {t("empleados.eliminarConfirm", {
                name: empleadoToDelete
                  ? `${empleadoToDelete.nombre} ${empleadoToDelete.apellidos}`
                  : "",
              })}
              {(empleadoToDelete?.contratos?.length || 0) > 0 && (
                <span className="block mt-2 text-red-600">
                  {t("empleados.tieneContratos", {
                    count: empleadoToDelete?.contratos?.length,
                  })}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-sm">{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-sm"
            >
              {t("common:delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Tab 2 — Contratos
// ═══════════════════════════════════════════════════════════════════════

function ContratosTab() {
  const { t } = useTranslation(["rrhh", "common"])

  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingContratos, setIsLoadingContratos] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingContrato, setEditingContrato] = useState<Contrato | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [contratoToDelete, setContratoToDelete] = useState<Contrato | null>(null)
  const [formData, setFormData] = useState(emptyContratoForm)
  const [error, setError] = useState("")

  const loadEmpleados = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await window.electronAPI?.empleados.getAll()
      if (res?.success && res.data) {
        setEmpleados(res.data)
      }
    } catch (err) {
      console.error("Error loading empleados:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEmpleados()
  }, [loadEmpleados])

  const loadContratos = useCallback(async (empleadoId: number) => {
    try {
      setIsLoadingContratos(true)
      const res = await window.electronAPI?.contratos.getByEmpleado(empleadoId)
      if (res?.success && res.data) {
        setContratos(res.data)
      } else {
        setContratos([])
      }
    } catch (err) {
      console.error("Error loading contratos:", err)
      setContratos([])
    } finally {
      setIsLoadingContratos(false)
    }
  }, [])

  useEffect(() => {
    if (selectedEmpleadoId) {
      loadContratos(parseInt(selectedEmpleadoId))
    } else {
      setContratos([])
    }
  }, [selectedEmpleadoId, loadContratos])

  useEffect(() => {
    const unsub = window.electronAPI?.onEntityUpdated?.((data) => {
      if (data.entityType === "contrato" && selectedEmpleadoId) {
        loadContratos(parseInt(selectedEmpleadoId))
      }
      if (data.entityType === "empleado") {
        loadEmpleados()
      }
    })
    return () => { unsub?.() }
  }, [selectedEmpleadoId, loadContratos, loadEmpleados])

  // Auto-calculate monthly salary when relevant fields change
  const updateSalarioMensual = (updates: Partial<typeof formData>) => {
    const merged = { ...formData, ...updates }
    const brutoAnual = parseFloat(merged.salarioBrutoAnual) || 0
    const numPagas = parseInt(merged.numPagasExtra) || 0
    const prorrateadas = merged.pagasProrrateadas
    const mensual = calcularSalarioMensual(brutoAnual, numPagas, prorrateadas)
    return {
      ...merged,
      salarioBrutoMensual: mensual > 0 ? mensual.toFixed(2) : "",
    }
  }

  const handleOpenDialog = (contrato?: Contrato) => {
    setError("")
    if (contrato) {
      setEditingContrato(contrato)
      const fd = {
        empleadoId: contrato.empleadoId.toString(),
        tipoContrato: contrato.tipoContrato,
        fechaInicio: new Date(contrato.fechaInicio).toISOString().split("T")[0],
        fechaFin: contrato.fechaFin
          ? new Date(contrato.fechaFin).toISOString().split("T")[0]
          : "",
        jornada: contrato.jornada,
        horasSemanales: contrato.horasSemanales.toString(),
        salarioBrutoAnual: contrato.salarioBrutoAnual.toString(),
        salarioBrutoMensual: contrato.salarioBrutoMensual.toString(),
        numPagasExtra: contrato.numPagasExtra.toString(),
        pagasProrrateadas: contrato.pagasProrrateadas,
        convenioColectivo: contrato.convenioColectivo || "",
        porcentajeATEP: contrato.porcentajeATEP.toString(),
      }
      setFormData(fd)
    } else {
      setEditingContrato(null)
      setFormData({
        ...emptyContratoForm,
        empleadoId: selectedEmpleadoId,
      })
    }
    setIsDialogOpen(true)
  }

  const handleSubmit = async () => {
    const empId = parseInt(formData.empleadoId)
    if (!empId || !formData.fechaInicio) return

    setIsSaving(true)
    setError("")
    try {
      const brutoAnual = parseFloat(formData.salarioBrutoAnual) || 0
      const numPagas = parseInt(formData.numPagasExtra) || 0
      const prorrateadas = formData.pagasProrrateadas
      const mensual = calcularSalarioMensual(brutoAnual, numPagas, prorrateadas)

      const payload: any = {
        empleadoId: empId,
        tipoContrato: formData.tipoContrato,
        fechaInicio: formData.fechaInicio,
        fechaFin: formData.fechaFin || null,
        jornada: formData.jornada,
        horasSemanales: parseFloat(formData.horasSemanales) || 40,
        salarioBrutoAnual: brutoAnual,
        salarioBrutoMensual: mensual,
        numPagasExtra: numPagas,
        pagasProrrateadas: prorrateadas,
        convenioColectivo: formData.convenioColectivo || null,
        porcentajeATEP: parseFloat(formData.porcentajeATEP) || 0,
      }

      let response
      if (editingContrato) {
        response = await window.electronAPI?.contratos.update(editingContrato.id, payload)
      } else {
        response = await window.electronAPI?.contratos.create(payload)
      }

      if (response?.success) {
        if (selectedEmpleadoId) {
          await loadContratos(parseInt(selectedEmpleadoId))
        }
        setIsDialogOpen(false)
      } else {
        setError(translateError(response?.error, response?.errorParams))
      }
    } catch (err) {
      console.error("Error saving contrato:", err)
      setError(translateError("generic"))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!contratoToDelete) return
    try {
      const response = await window.electronAPI?.contratos.delete(contratoToDelete.id)
      if (response?.success && selectedEmpleadoId) {
        await loadContratos(parseInt(selectedEmpleadoId))
      }
    } catch (err) {
      console.error("Error deleting contrato:", err)
    } finally {
      setDeleteDialogOpen(false)
      setContratoToDelete(null)
    }
  }

  const confirmDelete = (contrato: Contrato) => {
    setContratoToDelete(contrato)
    setDeleteDialogOpen(true)
  }

  const getTipoContratoLabel = (tipo: string) =>
    TIPOS_CONTRATO.find((tc) => tc.value === tipo)?.label || tipo

  const getJornadaLabel = (jornada: string) =>
    TIPOS_JORNADA.find((j) => j.value === jornada)?.label || jornada

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Employee selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium whitespace-nowrap">
              {t("contratos.seleccionarEmpleado")}
            </Label>
            <Select value={selectedEmpleadoId} onValueChange={setSelectedEmpleadoId}>
              <SelectTrigger className="h-8 text-sm max-w-sm">
                <SelectValue placeholder={t("contratos.elegirEmpleado")} />
              </SelectTrigger>
              <SelectContent>
                {empleados
                  .filter((e) => e.activo)
                  .map((emp) => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>
                      {emp.nombre} {emp.apellidos} - {emp.nif}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {selectedEmpleadoId && (
              <Button size="sm" onClick={() => handleOpenDialog()}>
                <Plus className="mr-1 h-4 w-4" />
                {t("contratos.nuevo")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contracts list */}
      {selectedEmpleadoId ? (
        isLoadingContratos ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-sm font-medium">
                {t("contratos.listTitle")}
                {contratos.length > 0 && (
                  <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded-full">
                    {contratos.length}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs">{t("contratos.tipo")}</TableHead>
                    <TableHead className="h-9 text-xs">{t("contratos.fechaInicio")}</TableHead>
                    <TableHead className="h-9 text-xs">{t("contratos.fechaFin")}</TableHead>
                    <TableHead className="h-9 text-xs">{t("contratos.jornada")}</TableHead>
                    <TableHead className="h-9 text-xs text-right">
                      {t("contratos.salarioBrutoAnual")}
                    </TableHead>
                    <TableHead className="h-9 text-xs text-right">
                      {t("contratos.salarioBrutoMensual")}
                    </TableHead>
                    <TableHead className="h-9 text-xs text-center">{t("common:status")}</TableHead>
                    <TableHead className="h-9 text-xs text-right">{t("common:actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contratos.map((contrato) => {
                    const isActive = contrato.activo
                    return (
                      <TableRow key={contrato.id} className={!isActive ? "opacity-60" : ""}>
                        <TableCell className="py-2 text-xs font-medium">
                          {getTipoContratoLabel(contrato.tipoContrato)}
                        </TableCell>
                        <TableCell className="py-2 text-xs">
                          {formatDate(contrato.fechaInicio)}
                        </TableCell>
                        <TableCell className="py-2 text-xs">
                          {contrato.fechaFin ? formatDate(contrato.fechaFin) : t("contratos.indefinido")}
                        </TableCell>
                        <TableCell className="py-2 text-xs">
                          {getJornadaLabel(contrato.jornada)}
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono tabular-nums text-xs">
                          {formatCurrency(contrato.salarioBrutoAnual)}
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono tabular-nums text-xs">
                          {formatCurrency(contrato.salarioBrutoMensual)}
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          <Badge variant={isActive ? "success" : "secondary"}>
                            {isActive ? t("common:active") : t("common:inactive")}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleOpenDialog(contrato)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                              onClick={() => confirmDelete(contrato)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {contratos.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {t("contratos.sinContratos")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("contratos.seleccioneEmpleado")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Contrato Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingContrato ? t("contratos.editar") : t("contratos.nuevoDialog")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("contratos.tipo")} *</Label>
                <Select
                  value={formData.tipoContrato}
                  onValueChange={(v) => setFormData({ ...formData, tipoContrato: v })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_CONTRATO.map((tc) => (
                      <SelectItem key={tc.value} value={tc.value}>
                        {tc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("contratos.jornada")} *</Label>
                <Select
                  value={formData.jornada}
                  onValueChange={(v) => setFormData({ ...formData, jornada: v })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_JORNADA.map((j) => (
                      <SelectItem key={j.value} value={j.value}>
                        {j.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("contratos.fechaInicio")} *</Label>
                <Input
                  className="h-8 text-sm"
                  type="date"
                  value={formData.fechaInicio}
                  onChange={(e) => setFormData({ ...formData, fechaInicio: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("contratos.fechaFin")}</Label>
                <Input
                  className="h-8 text-sm"
                  type="date"
                  value={formData.fechaFin}
                  onChange={(e) => setFormData({ ...formData, fechaFin: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("contratos.horasSemanales")}</Label>
                <Input
                  className="h-8 text-sm"
                  type="number"
                  value={formData.horasSemanales}
                  onChange={(e) => setFormData({ ...formData, horasSemanales: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("contratos.salarioBrutoAnual")} *</Label>
                <Input
                  className="h-8 text-sm"
                  type="number"
                  step="0.01"
                  value={formData.salarioBrutoAnual}
                  onChange={(e) =>
                    setFormData(updateSalarioMensual({ salarioBrutoAnual: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("contratos.salarioBrutoMensual")}</Label>
                <Input
                  className="h-8 text-sm bg-muted"
                  type="number"
                  step="0.01"
                  value={formData.salarioBrutoMensual}
                  readOnly
                  tabIndex={-1}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("contratos.numPagasExtra")}</Label>
                <Select
                  value={formData.numPagasExtra}
                  onValueChange={(v) =>
                    setFormData(updateSalarioMensual({ numPagasExtra: v }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("contratos.pagasProrrateadas")}</Label>
                <div className="flex items-center h-8 gap-2">
                  <Switch
                    id="pagasProrrateadas"
                    checked={formData.pagasProrrateadas}
                    onCheckedChange={(checked) =>
                      setFormData(updateSalarioMensual({ pagasProrrateadas: checked }))
                    }
                  />
                  <Label htmlFor="pagasProrrateadas" className="text-xs">
                    {formData.pagasProrrateadas
                      ? t("contratos.prorrateadasSi")
                      : t("contratos.prorrateadasNo")}
                  </Label>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("contratos.porcentajeATEP")}</Label>
                <Input
                  className="h-8 text-sm"
                  type="number"
                  step="0.01"
                  value={formData.porcentajeATEP}
                  onChange={(e) => setFormData({ ...formData, porcentajeATEP: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">{t("contratos.convenioColectivo")}</Label>
              <Input
                className="h-8 text-sm"
                value={formData.convenioColectivo}
                onChange={(e) => setFormData({ ...formData, convenioColectivo: e.target.value })}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
              {t("common:cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={
                isSaving ||
                !formData.empleadoId ||
                !formData.fechaInicio ||
                !formData.salarioBrutoAnual
              }
            >
              {isSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {editingContrato ? t("common:save") : t("common:create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              {t("contratos.eliminar")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {t("contratos.eliminarConfirm", {
                tipo: contratoToDelete
                  ? getTipoContratoLabel(contratoToDelete.tipoContrato)
                  : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-sm">{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-sm"
            >
              {t("common:delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Tab 3 — Departamentos
// ═══════════════════════════════════════════════════════════════════════

function DepartamentosTab() {
  const { t } = useTranslation(["rrhh", "common"])

  const [departamentos, setDepartamentos] = useState<Departamento[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingDepartamento, setEditingDepartamento] = useState<Departamento | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [departamentoToDelete, setDepartamentoToDelete] = useState<Departamento | null>(null)
  const [formData, setFormData] = useState(emptyDepartamentoForm)
  const [error, setError] = useState("")

  const loadDepartamentos = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true)
      const res = await window.electronAPI?.departamentos.getAll()
      if (res?.success && res.data) {
        setDepartamentos(res.data)
      }
    } catch (err) {
      console.error("Error loading departamentos:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDepartamentos()
  }, [loadDepartamentos])

  useEffect(() => {
    const unsub = window.electronAPI?.onEntityUpdated?.((data) => {
      if (data.entityType === "departamento") {
        loadDepartamentos(false)
      }
    })
    return () => { unsub?.() }
  }, [loadDepartamentos])

  const handleOpenDialog = (departamento?: Departamento) => {
    setError("")
    if (departamento) {
      setEditingDepartamento(departamento)
      setFormData({
        nombre: departamento.nombre,
        activo: departamento.activo,
      })
    } else {
      setEditingDepartamento(null)
      setFormData(emptyDepartamentoForm)
    }
    setIsDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.nombre.trim()) return

    setIsSaving(true)
    setError("")
    try {
      const payload = {
        nombre: formData.nombre.trim(),
        activo: formData.activo,
      }

      let response
      if (editingDepartamento) {
        response = await window.electronAPI?.departamentos.update(editingDepartamento.id, payload)
      } else {
        response = await window.electronAPI?.departamentos.create(payload)
      }

      if (response?.success) {
        await loadDepartamentos()
        setIsDialogOpen(false)
      } else {
        setError(translateError(response?.error, response?.errorParams))
      }
    } catch (err) {
      console.error("Error saving departamento:", err)
      setError(translateError("generic"))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!departamentoToDelete) return
    try {
      const response = await window.electronAPI?.departamentos.delete(departamentoToDelete.id)
      if (response?.success) {
        await loadDepartamentos()
      }
    } catch (err) {
      console.error("Error deleting departamento:", err)
    } finally {
      setDeleteDialogOpen(false)
      setDepartamentoToDelete(null)
    }
  }

  const confirmDelete = (departamento: Departamento) => {
    setDepartamentoToDelete(departamento)
    setDeleteDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">{t("departamentos.listTitle")}</CardTitle>
            <Button size="sm" onClick={() => handleOpenDialog()}>
              <Plus className="mr-1 h-4 w-4" />
              {t("departamentos.nuevo")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 text-xs">{t("departamentos.nombre")}</TableHead>
                <TableHead className="h-9 text-xs text-center">
                  {t("departamentos.empleados")}
                </TableHead>
                <TableHead className="h-9 text-xs text-center">{t("common:status")}</TableHead>
                <TableHead className="h-9 text-xs text-right">{t("common:actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departamentos.map((dep) => (
                <TableRow key={dep.id} className={!dep.activo ? "opacity-60" : ""}>
                  <TableCell className="py-2 font-medium">{dep.nombre}</TableCell>
                  <TableCell className="py-2 text-center tabular-nums">
                    {dep._count?.empleados ?? 0}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <Badge variant={dep.activo ? "success" : "secondary"}>
                      {dep.activo ? t("common:active") : t("common:inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleOpenDialog(dep)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                        onClick={() => confirmDelete(dep)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {departamentos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("departamentos.sinDepartamentos")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Departamento Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingDepartamento
                ? t("departamentos.editar")
                : t("departamentos.nuevoDialog")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">{t("departamentos.nombre")} *</Label>
              <Input
                className="h-8 text-sm"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="departamento-activo"
                checked={formData.activo}
                onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
              />
              <Label htmlFor="departamento-activo" className="text-xs">
                {t("departamentos.activo")}
              </Label>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
              {t("common:cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSaving || !formData.nombre.trim()}
            >
              {isSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {editingDepartamento ? t("common:save") : t("common:create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              {t("departamentos.eliminar")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {t("departamentos.eliminarConfirm", {
                name: departamentoToDelete?.nombre,
              })}
              {(departamentoToDelete?._count?.empleados || 0) > 0 && (
                <span className="block mt-2 text-red-600">
                  {t("departamentos.tieneEmpleados", {
                    count: departamentoToDelete?._count?.empleados,
                  })}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-sm">{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-sm"
            >
              {t("common:delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
