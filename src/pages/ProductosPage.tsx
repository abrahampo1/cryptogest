import { useState, useEffect } from "react"
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
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  Filter,
} from "lucide-react"

export function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [impuestos, setImpuestos] = useState<Impuesto[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterTipo, setFilterTipo] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [productoToDelete, setProductoToDelete] = useState<Producto | null>(null)
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({
    codigo: "",
    nombre: "",
    descripcion: "",
    tipo: "servicio",
    precioBase: "",
    pvp: "",
    impuestoId: "",
    retencionId: "",
    activo: true,
  })
  const [precioMode, setPrecioMode] = useState<'base' | 'pvp'>('base')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [productosRes, impuestosRes] = await Promise.all([
        window.electronAPI?.productos.getAll(),
        window.electronAPI?.impuestos.getAll()
      ])

      if (productosRes?.success && productosRes.data) {
        setProductos(productosRes.data)
      }
      if (impuestosRes?.success && impuestosRes.data) {
        setImpuestos(impuestosRes.data)
      }
    } catch (error) {
      console.error('Error cargando datos:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredProductos = productos.filter((producto) => {
    const matchesSearch =
      producto.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (producto.codigo?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
    const matchesTipo = filterTipo === "all" || producto.tipo === filterTipo
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "active" && producto.activo) ||
      (filterStatus === "inactive" && !producto.activo)
    return matchesSearch && matchesTipo && matchesStatus
  })

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(amount)

  const handleOpenDialog = (producto?: Producto) => {
    setError(null)
    if (producto) {
      setEditingProducto(producto)
      const pvpValue = producto.impuesto
        ? parseFloat((producto.precioBase * (1 + producto.impuesto.porcentaje / 100)).toFixed(2)).toString()
        : String(producto.precioBase)
      setFormData({
        codigo: producto.codigo || "",
        nombre: producto.nombre,
        descripcion: producto.descripcion || "",
        tipo: producto.tipo,
        precioBase: String(producto.precioBase),
        pvp: pvpValue,
        impuestoId: producto.impuestoId ? String(producto.impuestoId) : "",
        retencionId: producto.retencionId ? String(producto.retencionId) : "",
        activo: producto.activo,
      })
      setPrecioMode('base')
    } else {
      setEditingProducto(null)
      const defaultImpuesto = impuestos.find(i => i.porDefecto)
      setFormData({
        codigo: "",
        nombre: "",
        descripcion: "",
        tipo: "servicio",
        precioBase: "",
        pvp: "",
        impuestoId: defaultImpuesto ? String(defaultImpuesto.id) : "",
        retencionId: "",
        activo: true,
      })
      setPrecioMode('base')
    }
    setIsDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.nombre || !formData.precioBase) return

    setIsSaving(true)
    setError(null)
    try {
      const data = {
        codigo: formData.codigo || null,
        nombre: formData.nombre,
        descripcion: formData.descripcion || null,
        tipo: formData.tipo,
        precioBase: parseFloat(formData.precioBase),
        impuestoId: formData.impuestoId ? parseInt(formData.impuestoId) : null,
        retencionId: formData.retencionId ? parseInt(formData.retencionId) : null,
        activo: formData.activo,
      }

      if (editingProducto) {
        const result = await window.electronAPI?.productos.update(editingProducto.id, data)
        if (result?.success) {
          await loadData()
          setIsDialogOpen(false)
        } else {
          setError(result?.error || 'Error al actualizar el producto')
        }
      } else {
        const result = await window.electronAPI?.productos.create(data)
        if (result?.success) {
          await loadData()
          setIsDialogOpen(false)
        } else {
          setError(result?.error || 'Error al crear el producto')
        }
      }
    } catch (err) {
      console.error('Error guardando producto:', err)
      setError(String(err))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!productoToDelete) return
    try {
      const result = await window.electronAPI?.productos.delete(productoToDelete.id)
      if (result?.success) {
        await loadData()
      }
    } catch (error) {
      console.error('Error eliminando producto:', error)
    } finally {
      setDeleteDialogOpen(false)
      setProductoToDelete(null)
    }
  }

  const confirmDelete = (producto: Producto) => {
    setProductoToDelete(producto)
    setDeleteDialogOpen(true)
  }

  const stats = {
    total: productos.length,
    servicios: productos.filter(p => p.tipo === 'servicio').length,
    productosCount: productos.filter(p => p.tipo === 'producto').length,
    activos: productos.filter(p => p.activo).length,
  }

  const getPrecioConImpuesto = (producto: Producto) => {
    if (!producto.impuesto) return producto.precioBase
    return producto.precioBase * (1 + producto.impuesto.porcentaje / 100)
  }

  const calcPvpFromBase = (base: string, impuestoId: string): string => {
    const baseNum = parseFloat(base)
    if (isNaN(baseNum)) return ""
    if (!impuestoId) return base
    const imp = impuestos.find(i => i.id === parseInt(impuestoId))
    const porcentaje = imp?.porcentaje || 0
    return parseFloat((baseNum * (1 + porcentaje / 100)).toFixed(2)).toString()
  }

  const calcBaseFromPvp = (pvp: string, impuestoId: string): string => {
    const pvpNum = parseFloat(pvp)
    if (isNaN(pvpNum)) return ""
    if (!impuestoId) return pvp
    const imp = impuestos.find(i => i.id === parseInt(impuestoId))
    const porcentaje = imp?.porcentaje || 0
    return parseFloat((pvpNum / (1 + porcentaje / 100)).toFixed(2)).toString()
  }

  const handlePrecioBaseChange = (value: string) => {
    const pvp = value ? calcPvpFromBase(value, formData.impuestoId) : ""
    setFormData(prev => ({ ...prev, precioBase: value, pvp }))
    setPrecioMode('base')
  }

  const handlePvpChange = (value: string) => {
    const base = value ? calcBaseFromPvp(value, formData.impuestoId) : ""
    setFormData(prev => ({ ...prev, precioBase: base, pvp: value }))
    setPrecioMode('pvp')
  }

  const handleImpuestoChange = (value: string) => {
    if (precioMode === 'pvp' && formData.pvp) {
      const base = calcBaseFromPvp(formData.pvp, value)
      setFormData(prev => ({ ...prev, impuestoId: value, precioBase: base }))
    } else if (formData.precioBase) {
      const pvp = calcPvpFromBase(formData.precioBase, value)
      setFormData(prev => ({ ...prev, impuestoId: value, pvp }))
    } else {
      setFormData(prev => ({ ...prev, impuestoId: value }))
    }
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
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h1 className="text-xl font-semibold">Productos y Servicios</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de productos y servicios facturables
          </p>
        </div>
        <Button size="sm" onClick={() => handleOpenDialog()}>
          <Plus className="mr-1 h-4 w-4" />
          Nuevo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Items</p>
            <p className="text-lg font-semibold tabular-nums">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Servicios</p>
            <p className="text-lg font-semibold tabular-nums">{stats.servicios}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Productos</p>
            <p className="text-lg font-semibold tabular-nums">{stats.productosCount}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Activos</p>
            <p className="text-lg font-semibold tabular-nums">{stats.activos}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Catálogo</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  className="pl-8 h-8 w-48 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="servicio">Servicios</SelectItem>
                  <SelectItem value="producto">Productos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 w-28 text-xs">
                  <Filter className="mr-1 h-3 w-3" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="inactive">Inactivos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 text-xs">Código</TableHead>
                <TableHead className="h-9 text-xs">Nombre</TableHead>
                <TableHead className="h-9 text-xs">Tipo</TableHead>
                <TableHead className="h-9 text-xs text-right">Precio Base</TableHead>
                <TableHead className="h-9 text-xs">Impuesto</TableHead>
                <TableHead className="h-9 text-xs text-right">P.V.P.</TableHead>
                <TableHead className="h-9 text-xs text-center">Estado</TableHead>
                <TableHead className="h-9 text-xs text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProductos.map((producto) => (
                <TableRow key={producto.id} className={!producto.activo ? "opacity-60" : ""}>
                  <TableCell className="py-2 font-mono text-xs">
                    {producto.codigo || "-"}
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="font-medium">{producto.nombre}</div>
                    {producto.descripcion && (
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {producto.descripcion}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      producto.tipo === "servicio"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-slate-100 text-slate-700"
                    }`}>
                      {producto.tipo === "servicio" ? "Servicio" : "Producto"}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums">
                    {formatCurrency(producto.precioBase)}
                  </TableCell>
                  <TableCell className="py-2 text-xs">
                    <div className="space-y-0.5">
                      {producto.impuesto ? (
                        <span className="text-muted-foreground">
                          {producto.impuesto.nombre} ({producto.impuesto.porcentaje}%)
                        </span>
                      ) : <span className="text-muted-foreground">-</span>}
                      {producto.retencion && (
                        <div>
                          <span className="text-red-600 text-[10px]">
                            -{producto.retencion.nombre} ({producto.retencion.porcentaje}%)
                          </span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums font-medium">
                    {formatCurrency(getPrecioConImpuesto(producto))}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      producto.activo
                        ? "bg-green-50 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}>
                      {producto.activo ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleOpenDialog(producto)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                        onClick={() => confirmDelete(producto)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredProductos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {searchTerm || filterTipo !== "all" || filterStatus !== "all"
                  ? "No se encontraron productos"
                  : "No hay productos registrados"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingProducto ? "Editar Producto" : "Nuevo Producto/Servicio"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Código</Label>
                <Input
                  className="h-8 text-sm"
                  value={formData.codigo}
                  onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                  placeholder="PROD-001"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Tipo *</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="servicio">Servicio</SelectItem>
                    <SelectItem value="producto">Producto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Nombre *</Label>
              <Input
                className="h-8 text-sm"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Descripción</Label>
              <Textarea
                className="text-sm resize-none"
                rows={2}
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Impuesto (IVA)</Label>
                <Select
                  value={formData.impuestoId}
                  onValueChange={handleImpuestoChange}
                >
                  <SelectTrigger className="h-8 text-sm">
                    {formData.impuestoId
                      ? <span className="truncate">{(() => { const imp = impuestos.find(i => i.id === Number(formData.impuestoId)); return imp ? `${imp.nombre} (${imp.porcentaje}%)` : "" })()}</span>
                      : <SelectValue placeholder="Sin IVA" />}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin IVA</SelectItem>
                    {impuestos
                      .filter(i => (i.activo && i.tipo === 'IVA') || String(i.id) === formData.impuestoId)
                      .map((imp) => (
                        <SelectItem key={imp.id} value={String(imp.id)}>
                          {imp.nombre} ({imp.porcentaje}%)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Retención (IRPF)</Label>
                <Select
                  value={formData.retencionId}
                  onValueChange={(value) => setFormData({ ...formData, retencionId: value })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    {formData.retencionId
                      ? <span className="truncate">{(() => { const ret = impuestos.find(i => i.id === Number(formData.retencionId)); return ret ? `${ret.nombre} (${ret.porcentaje}%)` : "" })()}</span>
                      : <SelectValue placeholder="Sin retención" />}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin retención</SelectItem>
                    {impuestos
                      .filter(i => (i.activo && i.tipo === 'IRPF') || String(i.id) === formData.retencionId)
                      .map((imp) => (
                        <SelectItem key={imp.id} value={String(imp.id)}>
                          {imp.nombre} ({imp.porcentaje}%)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Precio Base *</Label>
                <Input
                  className="h-8 text-sm"
                  type="number"
                  step="0.01"
                  value={formData.precioBase}
                  onChange={(e) => handlePrecioBaseChange(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">P.V.P.</Label>
                <Input
                  className="h-8 text-sm"
                  type="number"
                  step="0.01"
                  value={formData.pvp}
                  onChange={(e) => handlePvpChange(e.target.value)}
                />
              </div>
            </div>
            {formData.precioBase && (
              <div className="bg-slate-50 border rounded p-3 text-sm space-y-1">
                {(() => {
                  const base = parseFloat(formData.precioBase) || 0
                  const imp = formData.impuestoId ? impuestos.find(i => i.id === parseInt(formData.impuestoId)) : null
                  const ret = formData.retencionId ? impuestos.find(i => i.id === parseInt(formData.retencionId)) : null
                  const ivaAmount = imp ? base * (imp.porcentaje / 100) : 0
                  const irpfAmount = ret ? base * (ret.porcentaje / 100) : 0
                  const total = base + ivaAmount - irpfAmount
                  return (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Base:</span>
                        <span className="tabular-nums">{formatCurrency(base)}</span>
                      </div>
                      {imp && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>{imp.nombre}:</span>
                          <span className="tabular-nums">+{formatCurrency(ivaAmount)}</span>
                        </div>
                      )}
                      {ret && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>{ret.nombre}:</span>
                          <span className="tabular-nums text-red-600">-{formatCurrency(irpfAmount)}</span>
                        </div>
                      )}
                      {(imp || ret) && (
                        <div className="flex justify-between font-medium border-t pt-1">
                          <span>Total factura:</span>
                          <span className="tabular-nums">{formatCurrency(total)}</span>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="activo"
                checked={formData.activo}
                onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
              />
              <Label htmlFor="activo" className="text-xs">Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={isSaving || !formData.nombre || !formData.precioBase}>
              {isSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {editingProducto ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Eliminar Producto</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              ¿Confirma la eliminación de "{productoToDelete?.nombre}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-sm">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-sm">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
