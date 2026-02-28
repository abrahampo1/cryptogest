import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  Eye,
  Filter,
  HelpCircle,
  Calendar,
  MapPin,
  Mail,
  Phone,
  TrendingUp,
  BarChart3,
  FileText,
  User,
} from "lucide-react"
import { formatCurrency } from "@/lib/formatting"

type ClienteWithFacturas = Cliente

const emptyFormData = {
  nombre: "",
  email: "",
  telefono: "",
  direccion: "",
  ciudad: "",
  codigoPostal: "",
  provincia: "",
  pais: "España",
  nif: "",
  notas: "",
  activo: true,
}

export function ClientesPage({ onHelp, initialItemId }: { onHelp?: () => void; initialItemId?: number | null }) {
  const { t } = useTranslation(['clientes', 'common'])
  const [clientes, setClientes] = useState<ClienteWithFacturas[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [clienteToDelete, setClienteToDelete] = useState<ClienteWithFacturas | null>(null)
  const [editingCliente, setEditingCliente] = useState<ClienteWithFacturas | null>(null)
  const [selectedCliente, setSelectedCliente] = useState<ClienteWithFacturas | null>(null)
  const [detailCliente, setDetailCliente] = useState<(Cliente & { facturas?: (Factura & { lineas?: (LineaFactura & { producto?: Producto | null })[] })[] }) | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [formData, setFormData] = useState(emptyFormData)

  useEffect(() => {
    loadClientes()
  }, [])

  const loadClientes = async () => {
    try {
      setIsLoading(true)
      const response = await window.electronAPI?.clientes.getAll()
      if (response?.success && response.data) {
        setClientes(response.data)
      }
    } catch (error) {
      console.error("Error loading clientes:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (initialItemId && !isLoading && clientes.length > 0) {
      const cliente = clientes.find(c => c.id === initialItemId)
      if (cliente) {
        handleViewDetail(cliente)
      }
    }
  }, [initialItemId, isLoading])

  const filteredClientes = clientes.filter((cliente) => {
    const matchesSearch =
      cliente.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.nif?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "active" && cliente.activo) ||
      (filterStatus === "inactive" && !cliente.activo)

    return matchesSearch && matchesStatus
  })

  const activeCount = clientes.filter(c => c.activo).length
  const totalFacturado = clientes.reduce((sum, c) => {
    return sum + (c.facturas?.reduce((fSum, f) => fSum + f.total, 0) || 0)
  }, 0)

  const handleOpenDialog = (cliente?: ClienteWithFacturas) => {
    if (cliente) {
      setEditingCliente(cliente)
      setFormData({
        nombre: cliente.nombre,
        email: cliente.email || "",
        telefono: cliente.telefono || "",
        direccion: cliente.direccion || "",
        ciudad: cliente.ciudad || "",
        codigoPostal: cliente.codigoPostal || "",
        provincia: cliente.provincia || "",
        pais: cliente.pais || "España",
        nif: cliente.nif || "",
        notas: cliente.notas || "",
        activo: cliente.activo,
      })
    } else {
      setEditingCliente(null)
      setFormData(emptyFormData)
    }
    setIsDialogOpen(true)
  }

  const handleViewDetail = async (cliente: ClienteWithFacturas) => {
    setSelectedCliente(cliente)
    setDetailCliente(null)
    setIsDetailOpen(true)
    setIsDetailLoading(true)
    try {
      const response = await window.electronAPI?.clientes.getById(cliente.id)
      if (response?.success && response.data) {
        setDetailCliente(response.data)
      }
    } catch (error) {
      console.error("Error loading client detail:", error)
    } finally {
      setIsDetailLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!formData.nombre.trim()) return

    setIsSaving(true)
    try {
      if (editingCliente) {
        const response = await window.electronAPI?.clientes.update(editingCliente.id, formData)
        if (response?.success) {
          await loadClientes()
          setIsDialogOpen(false)
        }
      } else {
        const response = await window.electronAPI?.clientes.create(formData)
        if (response?.success) {
          await loadClientes()
          setIsDialogOpen(false)
        }
      }
    } catch (error) {
      console.error("Error saving cliente:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!clienteToDelete) return

    try {
      const response = await window.electronAPI?.clientes.delete(clienteToDelete.id)
      if (response?.success) {
        await loadClientes()
      }
    } catch (error) {
      console.error("Error deleting cliente:", error)
    } finally {
      setDeleteDialogOpen(false)
      setClienteToDelete(null)
    }
  }

  const confirmDelete = (cliente: ClienteWithFacturas) => {
    setClienteToDelete(cliente)
    setDeleteDialogOpen(true)
  }

  const getClienteFacturasTotal = (cliente: ClienteWithFacturas) =>
    cliente.facturas?.reduce((sum, f) => sum + f.total, 0) || 0

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl font-semibold">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('subtitle')}
            </p>
          </div>
          {onHelp && (
            <button onClick={onHelp} className="rounded-full p-1.5 hover:bg-accent transition-colors" title={t('common:viewHelp')}>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <Button size="sm" onClick={() => handleOpenDialog()}>
          <Plus className="mr-1 h-4 w-4" />
          {t('newClient')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('totalClients')}</p>
            <p className="text-lg font-semibold tabular-nums">{clientes.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('activeClients')}</p>
            <p className="text-lg font-semibold tabular-nums">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('inactiveClients')}</p>
            <p className="text-lg font-semibold tabular-nums">{clientes.length - activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('totalBilled')}</p>
            <p className="text-lg font-semibold tabular-nums">{formatCurrency(totalFacturado)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">{t('clientList')}</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('common:search')}
                  className="pl-8 h-8 w-48 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <Filter className="mr-1 h-3 w-3" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common:all')}</SelectItem>
                  <SelectItem value="active">{t('common:activeStatus')}</SelectItem>
                  <SelectItem value="inactive">{t('common:inactiveStatus')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 text-xs">{t('nifCif')}</TableHead>
                <TableHead className="h-9 text-xs">{t('nameCompany')}</TableHead>
                <TableHead className="h-9 text-xs">{t('contact')}</TableHead>
                <TableHead className="h-9 text-xs">{t('location')}</TableHead>
                <TableHead className="h-9 text-xs text-center">{t('invoices')}</TableHead>
                <TableHead className="h-9 text-xs text-right">{t('totalInvoiced')}</TableHead>
                <TableHead className="h-9 text-xs text-center">{t('common:status')}</TableHead>
                <TableHead className="h-9 text-xs text-right">{t('common:actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClientes.map((cliente) => (
                <TableRow key={cliente.id} className={!cliente.activo ? "opacity-60" : ""}>
                  <TableCell className="py-2 font-mono text-xs">
                    {cliente.nif || "-"}
                  </TableCell>
                  <TableCell className="py-2 font-medium">
                    {cliente.nombre}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    <div>{cliente.email || "-"}</div>
                    <div>{cliente.telefono || ""}</div>
                  </TableCell>
                  <TableCell className="py-2 text-xs">
                    {[cliente.ciudad, cliente.provincia].filter(Boolean).join(", ") || "-"}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    {cliente.facturas?.length || 0}
                  </TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums">
                    {formatCurrency(getClienteFacturasTotal(cliente))}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      cliente.activo
                        ? "bg-green-50 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}>
                      {cliente.activo ? t('common:active') : t('common:inactive')}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleViewDetail(cliente)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleOpenDialog(cliente)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                        onClick={() => confirmDelete(cliente)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredClientes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {searchTerm ? t('noClientsFound') : t('noClientsRegistered')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingCliente ? t('editClient') : t('newClientDialog')}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('nameRequired')}</Label>
                <Input
                  className="h-8 text-sm"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('nifCif')}</Label>
                <Input
                  className="h-8 text-sm"
                  value={formData.nif}
                  onChange={(e) => setFormData({ ...formData, nif: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('common:email')}</Label>
                <Input
                  className="h-8 text-sm"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('common:phone')}</Label>
                <Input
                  className="h-8 text-sm"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">{t('common:address')}</Label>
              <Input
                className="h-8 text-sm"
                value={formData.direccion}
                onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('postalCode')}</Label>
                <Input
                  className="h-8 text-sm"
                  value={formData.codigoPostal}
                  onChange={(e) => setFormData({ ...formData, codigoPostal: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('city')}</Label>
                <Input
                  className="h-8 text-sm"
                  value={formData.ciudad}
                  onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('province')}</Label>
                <Input
                  className="h-8 text-sm"
                  value={formData.provincia}
                  onChange={(e) => setFormData({ ...formData, provincia: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('country')}</Label>
                <Input
                  className="h-8 text-sm"
                  value={formData.pais}
                  onChange={(e) => setFormData({ ...formData, pais: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">{t('common:notes')}</Label>
              <Textarea
                className="text-sm resize-none"
                rows={2}
                value={formData.notas}
                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="activo"
                checked={formData.activo}
                onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
              />
              <Label htmlFor="activo" className="text-xs">{t('activeClient')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={isSaving || !formData.nombre.trim()}>
              {isSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {editingCliente ? t('common:save') : t('common:create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog - Enriched */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          {selectedCliente && (() => {
            const dc = detailCliente || selectedCliente
            const facturas = dc.facturas || []
            const totalFacturadoCliente = facturas.reduce((sum, f) => sum + f.total, 0)
            const facturaCount = facturas.length
            const facturaMedia = facturaCount > 0 ? totalFacturadoCliente / facturaCount : 0
            const pendienteCobro = facturas
              .filter(f => f.estado === 'emitida' || f.estado === 'vencida')
              .reduce((sum, f) => sum + f.total, 0)

            const estadoColors: Record<string, string> = {
              borrador: 'bg-slate-300',
              emitida: 'bg-blue-500',
              pagada: 'bg-green-500',
              vencida: 'bg-red-500',
              anulada: 'bg-gray-400',
            }
            const estadoLabels: Record<string, string> = {
              borrador: t('statusDraft'),
              emitida: t('statusIssued'),
              pagada: t('statusPaid'),
              vencida: t('statusOverdue'),
              anulada: t('statusCancelled'),
            }
            const estadoBadgeVariants: Record<string, 'secondary' | 'info' | 'success' | 'destructive' | 'outline'> = {
              borrador: 'secondary',
              emitida: 'info',
              pagada: 'success',
              vencida: 'destructive',
              anulada: 'outline',
            }
            const estadoCounts: Record<string, number> = {}
            for (const f of facturas) {
              estadoCounts[f.estado] = (estadoCounts[f.estado] || 0) + 1
            }

            // Monthly billing for last 6 months
            const now = new Date()
            const monthlyData: { label: string; total: number }[] = []
            for (let i = 5; i >= 0; i--) {
              const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
              const year = d.getFullYear()
              const month = d.getMonth()
              const label = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
              const total = facturas
                .filter(f => {
                  const fd = new Date(f.fecha)
                  return fd.getFullYear() === year && fd.getMonth() === month
                })
                .reduce((sum, f) => sum + f.total, 0)
              monthlyData.push({ label, total })
            }
            const maxMonthly = Math.max(...monthlyData.map(m => m.total), 1)

            // Top products from invoice lines
            const productMap = new Map<string, { nombre: string; cantidad: number; total: number }>()
            for (const f of facturas) {
              const lineas = (f as Factura & { lineas?: (LineaFactura & { producto?: Producto | null })[] }).lineas || []
              for (const l of lineas) {
                const nombre = l.producto?.nombre || l.descripcion
                const existing = productMap.get(nombre)
                if (existing) {
                  existing.cantidad += l.cantidad
                  existing.total += l.total
                } else {
                  productMap.set(nombre, { nombre, cantidad: l.cantidad, total: l.total })
                }
              }
            }
            const topProducts = [...productMap.values()]
              .sort((a, b) => b.total - a.total)
              .slice(0, 5)

            // Additional metrics
            const sortedByDate = [...facturas].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
            const firstInvoice = sortedByDate[0]
            const lastInvoice = sortedByDate[sortedByDate.length - 1]
            const avgDueDays = facturas.length > 0
              ? facturas
                  .filter(f => f.fechaVencimiento)
                  .reduce((sum, f) => {
                    const diff = new Date(f.fechaVencimiento!).getTime() - new Date(f.fecha).getTime()
                    return sum + diff / (1000 * 60 * 60 * 24)
                  }, 0) / (facturas.filter(f => f.fechaVencimiento).length || 1)
              : 0

            return (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{dc.nombre}</h2>
                      <Badge variant={dc.activo ? 'success' : 'secondary'}>
                        {dc.activo ? t('common:active') : t('common:inactive')}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      {dc.nif && (
                        <span className="font-mono">{dc.nif}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {t('memberSince')} {new Date(dc.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsDetailOpen(false)
                        handleOpenDialog(dc as ClienteWithFacturas)
                      }}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      {t('common:edit')}
                    </Button>
                  </div>
                </div>

                {isDetailLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Tabs defaultValue="overview">
                    <TabsList className="w-full justify-start">
                      <TabsTrigger value="overview">
                        <User className="mr-1 h-3.5 w-3.5" />
                        {t('tabOverview')}
                      </TabsTrigger>
                      <TabsTrigger value="invoices">
                        <FileText className="mr-1 h-3.5 w-3.5" />
                        {t('tabInvoices')}
                        {facturaCount > 0 && (
                          <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded-full">{facturaCount}</span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="stats">
                        <BarChart3 className="mr-1 h-3.5 w-3.5" />
                        {t('tabStats')}
                      </TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Overview */}
                    <TabsContent value="overview">
                      <div className="space-y-4">
                        {/* Contact info */}
                        <div className="rounded-lg border p-4">
                          <h3 className="text-sm font-medium mb-3">{t('contactInfo')}</h3>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex items-center gap-2">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{dc.email || "-"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{dc.telefono || "-"}</span>
                            </div>
                            <div className="flex items-start gap-2 col-span-2">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                              <span>
                                {[dc.direccion, dc.codigoPostal, dc.ciudad, dc.provincia, dc.pais].filter(Boolean).join(", ") || "-"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 4 KPI Cards */}
                        <div className="grid grid-cols-4 gap-3">
                          <div className="rounded-lg border p-3 text-center">
                            <div className="text-lg font-semibold tabular-nums text-blue-600">
                              {formatCurrency(totalFacturadoCliente)}
                            </div>
                            <div className="text-xs text-muted-foreground">{t('totalInvoiced')}</div>
                          </div>
                          <div className="rounded-lg border p-3 text-center">
                            <div className="text-lg font-semibold tabular-nums">{facturaCount}</div>
                            <div className="text-xs text-muted-foreground">{t('invoices')}</div>
                          </div>
                          <div className="rounded-lg border p-3 text-center">
                            <div className="text-lg font-semibold tabular-nums">
                              {formatCurrency(facturaMedia)}
                            </div>
                            <div className="text-xs text-muted-foreground">{t('averageInvoice')}</div>
                          </div>
                          <div className="rounded-lg border p-3 text-center">
                            <div className={`text-lg font-semibold tabular-nums ${pendienteCobro > 0 ? 'text-amber-600' : ''}`}>
                              {formatCurrency(pendienteCobro)}
                            </div>
                            <div className="text-xs text-muted-foreground">{t('pendingCollection')}</div>
                          </div>
                        </div>

                        {/* Invoice status distribution */}
                        {facturaCount > 0 && (
                          <div className="rounded-lg border p-4">
                            <h3 className="text-sm font-medium mb-3">{t('invoiceDistribution')}</h3>
                            {/* Stacked bar */}
                            <div className="flex h-3 rounded-full overflow-hidden mb-3">
                              {Object.entries(estadoCounts).map(([estado, count]) => (
                                <div
                                  key={estado}
                                  className={`${estadoColors[estado] || 'bg-gray-300'}`}
                                  style={{ width: `${(count / facturaCount) * 100}%` }}
                                  title={`${estadoLabels[estado] || estado}: ${count}`}
                                />
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs">
                              {Object.entries(estadoCounts).map(([estado, count]) => (
                                <div key={estado} className="flex items-center gap-1.5">
                                  <div className={`w-2.5 h-2.5 rounded-full ${estadoColors[estado] || 'bg-gray-300'}`} />
                                  <span>{estadoLabels[estado] || estado}</span>
                                  <span className="text-muted-foreground">({count})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {facturaCount === 0 && (
                          <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                            <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            {t('noInvoicesYet')}
                          </div>
                        )}

                        {/* Notes */}
                        {dc.notas && (
                          <div className="rounded-lg border p-4">
                            <h3 className="text-sm font-medium mb-2">{t('common:notes')}</h3>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{dc.notas}</p>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    {/* Tab 2: Invoices */}
                    <TabsContent value="invoices">
                      {facturaCount > 0 ? (
                        <div className="rounded-lg border">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="h-9 text-xs">{t('invoiceNumber')}</TableHead>
                                <TableHead className="h-9 text-xs">{t('date')}</TableHead>
                                <TableHead className="h-9 text-xs">{t('dueDate')}</TableHead>
                                <TableHead className="h-9 text-xs text-right">{t('total')}</TableHead>
                                <TableHead className="h-9 text-xs text-center">{t('status')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {facturas.map((factura) => (
                                <TableRow key={factura.id}>
                                  <TableCell className="py-2 font-mono text-xs">{factura.numero}</TableCell>
                                  <TableCell className="py-2 text-xs">
                                    {new Date(factura.fecha).toLocaleDateString()}
                                  </TableCell>
                                  <TableCell className="py-2 text-xs">
                                    {factura.fechaVencimiento
                                      ? new Date(factura.fechaVencimiento).toLocaleDateString()
                                      : "-"}
                                  </TableCell>
                                  <TableCell className="py-2 text-right font-mono tabular-nums text-xs">
                                    {formatCurrency(factura.total)}
                                  </TableCell>
                                  <TableCell className="py-2 text-center">
                                    <Badge variant={estadoBadgeVariants[factura.estado] || 'secondary'}>
                                      {estadoLabels[factura.estado] || factura.estado}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <div className="flex justify-between items-center px-4 py-2 border-t bg-muted/30 text-sm">
                            <span className="font-medium">{t('totalAtBottom')}</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(totalFacturadoCliente)}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                          {t('noInvoicesYet')}
                        </div>
                      )}
                    </TabsContent>

                    {/* Tab 3: Statistics */}
                    <TabsContent value="stats">
                      {facturaCount > 0 ? (
                        <div className="space-y-4">
                          {/* Monthly billing */}
                          <div className="rounded-lg border p-4">
                            <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                              <TrendingUp className="h-3.5 w-3.5" />
                              {t('monthlyBilling')}
                            </h3>
                            <div className="space-y-2">
                              {monthlyData.map((m) => (
                                <div key={m.label} className="flex items-center gap-3 text-xs">
                                  <span className="w-16 text-muted-foreground text-right">{m.label}</span>
                                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                                    {m.total > 0 && (
                                      <div
                                        className="h-full bg-blue-500 rounded-full flex items-center justify-end pr-2"
                                        style={{ width: `${Math.max((m.total / maxMonthly) * 100, 8)}%` }}
                                      >
                                        <span className="text-[10px] font-medium text-white whitespace-nowrap">
                                          {formatCurrency(m.total)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Top products */}
                          <div className="rounded-lg border p-4">
                            <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                              <BarChart3 className="h-3.5 w-3.5" />
                              {t('topProducts')}
                            </h3>
                            {topProducts.length > 0 ? (
                              <div className="space-y-2">
                                {topProducts.map((p, i) => (
                                  <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                                      <span>{p.nombre}</span>
                                      <span className="text-xs text-muted-foreground">({p.cantidad} {t('units')})</span>
                                    </div>
                                    <span className="font-mono tabular-nums text-xs">{formatCurrency(p.total)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">{t('noProductData')}</p>
                            )}
                          </div>

                          {/* Additional metrics */}
                          <div className="rounded-lg border p-4">
                            <h3 className="text-sm font-medium mb-3">{t('additionalMetrics')}</h3>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <div className="text-xs text-muted-foreground">{t('firstInvoice')}</div>
                                <div className="font-medium">
                                  {firstInvoice ? new Date(firstInvoice.fecha).toLocaleDateString() : "-"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">{t('lastInvoice')}</div>
                                <div className="font-medium">
                                  {lastInvoice ? new Date(lastInvoice.fecha).toLocaleDateString() : "-"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">{t('avgDueDays')}</div>
                                <div className="font-medium">{Math.round(avgDueDays)} d</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                          {t('noInvoicesYet')}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                )}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">{t('deleteClient')}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {t('deleteConfirm', { name: clienteToDelete?.nombre })}
              {(clienteToDelete?.facturas?.length || 0) > 0 && (
                <span className="block mt-2 text-red-600">
                  {t('clientHasInvoices', { count: clienteToDelete?.facturas?.length })}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-sm">{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-sm"
              disabled={(clienteToDelete?.facturas?.length || 0) > 0}
            >
              {t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
