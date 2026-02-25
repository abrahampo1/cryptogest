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
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  Eye,
  Download,
  Filter,
  HelpCircle,
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

export function ClientesPage({ onHelp }: { onHelp?: () => void }) {
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

  const handleViewDetail = (cliente: ClienteWithFacturas) => {
    setSelectedCliente(cliente)
    setIsDetailOpen(true)
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

      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{t('clientCard')}</DialogTitle>
          </DialogHeader>
          {selectedCliente && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">{t('common:name')}</div>
                  <div className="font-medium">{selectedCliente.nombre}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('nifCif')}</div>
                  <div className="font-mono">{selectedCliente.nif || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('common:email')}</div>
                  <div>{selectedCliente.email || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('common:phone')}</div>
                  <div>{selectedCliente.telefono || "-"}</div>
                </div>
              </div>
              <div className="text-sm">
                <div className="text-xs text-muted-foreground">{t('common:address')}</div>
                <div>
                  {selectedCliente.direccion || "-"}
                  {selectedCliente.ciudad && `, ${selectedCliente.ciudad}`}
                  {selectedCliente.provincia && ` (${selectedCliente.provincia})`}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded">
                <div className="text-center">
                  <div className="text-lg font-semibold">{selectedCliente.facturas?.length || 0}</div>
                  <div className="text-xs text-muted-foreground">{t('invoices')}</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold tabular-nums">
                    {formatCurrency(getClienteFacturasTotal(selectedCliente))}
                  </div>
                  <div className="text-xs text-muted-foreground">{t('totalInvoiced')}</div>
                </div>
              </div>
              {selectedCliente.notas && (
                <div className="text-sm">
                  <div className="text-xs text-muted-foreground">{t('common:notes')}</div>
                  <div className="whitespace-pre-wrap">{selectedCliente.notas}</div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsDetailOpen(false)}>
              {t('common:close')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setIsDetailOpen(false)
                if (selectedCliente) handleOpenDialog(selectedCliente)
              }}
            >
              <Pencil className="mr-1 h-3 w-3" />
              {t('common:edit')}
            </Button>
          </DialogFooter>
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
