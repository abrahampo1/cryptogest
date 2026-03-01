import { useState, useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { translateError } from "@/lib/formatting"
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
  HelpCircle,
  Eye,
  TrendingUp,
  ShoppingCart,
  Users,
  Calendar,
  BarChart3,
  FileText,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { formatCurrency, formatDate } from "@/lib/formatting"

export function ProductosPage({ onHelp, initialItemId }: { onHelp?: () => void; initialItemId?: number | null }) {
  const { t } = useTranslation(['productos', 'common'])
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
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [relatedFacturas, setRelatedFacturas] = useState<Factura[]>([])

  const handleViewDetail = async (producto: Producto) => {
    setSelectedProducto(producto)
    setIsDetailOpen(true)
    setDetailLoading(true)
    try {
      const res = await window.electronAPI?.facturas.getAll()
      if (res?.success && res.data) {
        const related = res.data.filter(f =>
          f.lineas?.some(l => l.productoId === producto.id)
        )
        setRelatedFacturas(related)
      }
    } catch (err) {
      console.error('Error loading related invoices:', err)
    } finally {
      setDetailLoading(false)
    }
  }

  const productStats = useMemo(() => {
    if (!selectedProducto || relatedFacturas.length === 0) {
      return { unitsSold: 0, totalRevenue: 0, avgPrice: 0, invoiceCount: 0, clientCount: 0, lastSale: null as Date | null }
    }

    let unitsSold = 0
    let totalRevenue = 0
    const clientIds = new Set<number>()
    let lastSale: Date | null = null

    for (const factura of relatedFacturas) {
      clientIds.add(factura.clienteId)
      const fechaFactura = new Date(factura.fecha)
      if (!lastSale || fechaFactura > lastSale) {
        lastSale = fechaFactura
      }
      for (const linea of factura.lineas || []) {
        if (linea.productoId === selectedProducto.id) {
          unitsSold += linea.cantidad
          totalRevenue += linea.subtotal
        }
      }
    }

    return {
      unitsSold,
      totalRevenue,
      avgPrice: unitsSold > 0 ? totalRevenue / unitsSold : 0,
      invoiceCount: relatedFacturas.length,
      clientCount: clientIds.size,
      lastSale,
    }
  }, [selectedProducto, relatedFacturas])

  const topClients = useMemo(() => {
    if (!selectedProducto || relatedFacturas.length === 0) return []

    const clientMap = new Map<number, { cliente: Cliente | undefined; revenue: number; invoiceCount: number }>()

    for (const factura of relatedFacturas) {
      const existing = clientMap.get(factura.clienteId) || { cliente: factura.cliente, revenue: 0, invoiceCount: 0 }
      existing.invoiceCount++
      for (const linea of factura.lineas || []) {
        if (linea.productoId === selectedProducto.id) {
          existing.revenue += linea.subtotal
        }
      }
      clientMap.set(factura.clienteId, existing)
    }

    return Array.from(clientMap.values())
      .sort((a, b) => b.revenue - a.revenue)
  }, [selectedProducto, relatedFacturas])

  useEffect(() => {
    loadData()
  }, [])

  // Re-load when cloud entities update in background
  useEffect(() => {
    const unsub = window.electronAPI?.onEntityUpdated?.((data) => {
      if (['producto', 'impuesto'].includes(data.entityType)) {
        loadData()
      }
    })
    return () => { unsub?.() }
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

  useEffect(() => {
    if (initialItemId && !isLoading && productos.length > 0) {
      const producto = productos.find(p => p.id === initialItemId)
      if (producto) {
        handleViewDetail(producto)
      }
    }
  }, [initialItemId, isLoading])

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
          setError(result?.error ? translateError(result.error) : t('errorUpdating'))
        }
      } else {
        const result = await window.electronAPI?.productos.create(data)
        if (result?.success) {
          await loadData()
          setIsDialogOpen(false)
        } else {
          setError(result?.error ? translateError(result.error) : t('errorCreating'))
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
          {t('common:create')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('totalItems')}</p>
            <p className="text-lg font-semibold tabular-nums">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('services')}</p>
            <p className="text-lg font-semibold tabular-nums">{stats.servicios}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('products')}</p>
            <p className="text-lg font-semibold tabular-nums">{stats.productosCount}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('activeItems')}</p>
            <p className="text-lg font-semibold tabular-nums">{stats.activos}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">{t('catalog')}</CardTitle>
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
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common:all')}</SelectItem>
                  <SelectItem value="servicio">{t('services')}</SelectItem>
                  <SelectItem value="producto">{t('products')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 w-28 text-xs">
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
                <TableHead className="h-9 text-xs">{t('code')}</TableHead>
                <TableHead className="h-9 text-xs">{t('common:name')}</TableHead>
                <TableHead className="h-9 text-xs">{t('type')}</TableHead>
                <TableHead className="h-9 text-xs text-right">{t('basePrice')}</TableHead>
                <TableHead className="h-9 text-xs">{t('tax')}</TableHead>
                <TableHead className="h-9 text-xs text-right">{t('pvp')}</TableHead>
                <TableHead className="h-9 text-xs text-center">{t('common:status')}</TableHead>
                <TableHead className="h-9 text-xs text-right">{t('common:actions')}</TableHead>
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
                      {producto.tipo === "servicio" ? t('service') : t('product')}
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
                      {producto.activo ? t('common:active') : t('common:inactive')}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleViewDetail(producto)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
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
                  ? t('noProductsFound')
                  : t('noProductsRegistered')}
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
              {editingProducto ? t('editProduct') : t('newProductService')}
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
                <Label className="text-xs">{t('code')}</Label>
                <Input
                  className="h-8 text-sm"
                  value={formData.codigo}
                  onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                  placeholder="PROD-001"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('typeRequired')}</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="servicio">{t('service')}</SelectItem>
                    <SelectItem value="producto">{t('product')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">{t('nameRequired')}</Label>
              <Input
                className="h-8 text-sm"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">{t('common:description')}</Label>
              <Textarea
                className="text-sm resize-none"
                rows={2}
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('taxIva')}</Label>
                <Select
                  value={formData.impuestoId}
                  onValueChange={handleImpuestoChange}
                >
                  <SelectTrigger className="h-8 text-sm">
                    {formData.impuestoId
                      ? <span className="truncate">{(() => { const imp = impuestos.find(i => i.id === Number(formData.impuestoId)); return imp ? `${imp.nombre} (${imp.porcentaje}%)` : "" })()}</span>
                      : <SelectValue placeholder={t('noIva')} />}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('noIva')}</SelectItem>
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
                <Label className="text-xs">{t('retentionIrpf')}</Label>
                <Select
                  value={formData.retencionId}
                  onValueChange={(value) => setFormData({ ...formData, retencionId: value })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    {formData.retencionId
                      ? <span className="truncate">{(() => { const ret = impuestos.find(i => i.id === Number(formData.retencionId)); return ret ? `${ret.nombre} (${ret.porcentaje}%)` : "" })()}</span>
                      : <SelectValue placeholder={t('noRetention')} />}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('noRetention')}</SelectItem>
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
                <Label className="text-xs">{t('basePriceRequired')}</Label>
                <Input
                  className="h-8 text-sm"
                  type="number"
                  step="0.01"
                  value={formData.precioBase}
                  onChange={(e) => handlePrecioBaseChange(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t('pvp')}</Label>
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
                        <span className="text-muted-foreground">{t('base')}</span>
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
                          <span>{t('invoiceTotal')}</span>
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
              <Label htmlFor="activo" className="text-xs">{t('activeLabel')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={isSaving || !formData.nombre || !formData.precioBase}>
              {isSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {editingProducto ? t('common:save') : t('common:create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedProducto && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base flex items-center gap-3">
                  <span>{t('detail.title')}</span>
                </DialogTitle>
              </DialogHeader>

              {/* Product Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold">{selectedProducto.nombre}</h2>
                  <div className="flex items-center gap-2">
                    {selectedProducto.codigo && (
                      <span className="font-mono text-sm text-muted-foreground">{selectedProducto.codigo}</span>
                    )}
                    <Badge variant={selectedProducto.tipo === 'servicio' ? 'info' : 'secondary'}>
                      {selectedProducto.tipo === 'servicio' ? t('service') : t('product')}
                    </Badge>
                    <Badge variant={selectedProducto.activo ? 'success' : 'outline'}>
                      {selectedProducto.activo ? t('common:active') : t('common:inactive')}
                    </Badge>
                  </div>
                  {selectedProducto.descripcion && (
                    <p className="text-sm text-muted-foreground mt-1">{selectedProducto.descripcion}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold tabular-nums">{formatCurrency(getPrecioConImpuesto(selectedProducto))}</p>
                  <p className="text-xs text-muted-foreground">{t('pvp')}</p>
                </div>
              </div>

              <Separator />

              {/* Price Breakdown */}
              <div>
                <h3 className="text-sm font-medium mb-2">{t('detail.priceBreakdown')}</h3>
                <div className="bg-slate-50 dark:bg-slate-900 border rounded p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('base')}</span>
                    <span className="tabular-nums">{formatCurrency(selectedProducto.precioBase)}</span>
                  </div>
                  {selectedProducto.impuesto && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{selectedProducto.impuesto.nombre} ({selectedProducto.impuesto.porcentaje}%):</span>
                      <span className="tabular-nums">+{formatCurrency(selectedProducto.precioBase * selectedProducto.impuesto.porcentaje / 100)}</span>
                    </div>
                  )}
                  {selectedProducto.retencion && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{selectedProducto.retencion.nombre} ({selectedProducto.retencion.porcentaje}%):</span>
                      <span className="tabular-nums text-red-600">-{formatCurrency(selectedProducto.precioBase * selectedProducto.retencion.porcentaje / 100)}</span>
                    </div>
                  )}
                  {(selectedProducto.impuesto || selectedProducto.retencion) && (
                    <div className="flex justify-between font-medium border-t pt-1">
                      <span>{t('pvp')}</span>
                      <span className="tabular-nums">{formatCurrency(getPrecioConImpuesto(selectedProducto))}</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Stats Cards */}
              <div>
                <h3 className="text-sm font-medium mb-2">{t('detail.statistics')}</h3>
                {detailLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <Card>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="rounded-md bg-blue-50 p-2">
                          <ShoppingCart className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('detail.unitsSold')}</p>
                          <p className="text-lg font-semibold tabular-nums">{productStats.unitsSold}</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="rounded-md bg-green-50 p-2">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('detail.totalRevenue')}</p>
                          <p className="text-lg font-semibold tabular-nums">{formatCurrency(productStats.totalRevenue)}</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="rounded-md bg-amber-50 p-2">
                          <BarChart3 className="h-4 w-4 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('detail.avgPrice')}</p>
                          <p className="text-lg font-semibold tabular-nums">{formatCurrency(productStats.avgPrice)}</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="rounded-md bg-purple-50 p-2">
                          <FileText className="h-4 w-4 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('detail.invoiceCount')}</p>
                          <p className="text-lg font-semibold tabular-nums">{productStats.invoiceCount}</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="rounded-md bg-indigo-50 p-2">
                          <Users className="h-4 w-4 text-indigo-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('detail.clientCount')}</p>
                          <p className="text-lg font-semibold tabular-nums">{productStats.clientCount}</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="rounded-md bg-rose-50 p-2">
                          <Calendar className="h-4 w-4 text-rose-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('detail.lastSale')}</p>
                          <p className="text-lg font-semibold tabular-nums">
                            {productStats.lastSale ? formatDate(productStats.lastSale) : t('detail.never')}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>

              <Separator />

              {/* Tabs: Invoices & Clients */}
              {!detailLoading && (
                <Tabs defaultValue="invoices">
                  <TabsList>
                    <TabsTrigger value="invoices">
                      <FileText className="h-3.5 w-3.5 mr-1.5" />
                      {t('detail.relatedInvoices')} ({productStats.invoiceCount})
                    </TabsTrigger>
                    <TabsTrigger value="clients">
                      <Users className="h-3.5 w-3.5 mr-1.5" />
                      {t('detail.topClients')} ({productStats.clientCount})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="invoices">
                    {relatedFacturas.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
                        <p className="text-sm text-muted-foreground">{t('detail.noInvoices')}</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-9 text-xs">{t('detail.invoiceNumber')}</TableHead>
                            <TableHead className="h-9 text-xs">{t('detail.client')}</TableHead>
                            <TableHead className="h-9 text-xs">{t('detail.date')}</TableHead>
                            <TableHead className="h-9 text-xs text-right">{t('detail.quantity')}</TableHead>
                            <TableHead className="h-9 text-xs text-right">{t('detail.amount')}</TableHead>
                            <TableHead className="h-9 text-xs text-center">{t('detail.status')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {relatedFacturas.map((factura) => {
                            const lineasProducto = (factura.lineas ?? []).filter((l: LineaFactura) => l.productoId === selectedProducto.id)
                            const cantidadTotal = lineasProducto.reduce((sum: number, l: LineaFactura) => sum + l.cantidad, 0)
                            const importeTotal = lineasProducto.reduce((sum: number, l: LineaFactura) => sum + l.subtotal, 0)
                            return (
                              <TableRow key={factura.id}>
                                <TableCell className="py-2 font-mono text-xs">{factura.numero}</TableCell>
                                <TableCell className="py-2 text-sm">{factura.cliente?.nombre || '-'}</TableCell>
                                <TableCell className="py-2 text-sm">{formatDate(factura.fecha)}</TableCell>
                                <TableCell className="py-2 text-right tabular-nums">{cantidadTotal}</TableCell>
                                <TableCell className="py-2 text-right font-mono tabular-nums">{formatCurrency(importeTotal)}</TableCell>
                                <TableCell className="py-2 text-center">
                                  <Badge variant={
                                    factura.estado === 'pagada' ? 'success' :
                                    factura.estado === 'pendiente' ? 'warning' :
                                    factura.estado === 'vencida' ? 'destructive' : 'secondary'
                                  }>
                                    {factura.estado}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  <TabsContent value="clients">
                    {topClients.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Users className="h-8 w-8 text-muted-foreground/40 mb-2" />
                        <p className="text-sm text-muted-foreground">{t('detail.noClients')}</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-9 text-xs w-8">#</TableHead>
                            <TableHead className="h-9 text-xs">{t('detail.client')}</TableHead>
                            <TableHead className="h-9 text-xs text-right">{t('detail.invoiceCount')}</TableHead>
                            <TableHead className="h-9 text-xs text-right">{t('detail.revenue')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {topClients.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell className="py-2 text-sm text-muted-foreground">{index + 1}</TableCell>
                              <TableCell className="py-2 text-sm font-medium">{item.cliente?.nombre || '-'}</TableCell>
                              <TableCell className="py-2 text-right tabular-nums">{item.invoiceCount}</TableCell>
                              <TableCell className="py-2 text-right font-mono tabular-nums font-medium">{formatCurrency(item.revenue)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">{t('deleteProduct')}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {t('deleteConfirm', { name: productoToDelete?.nombre })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-sm">{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-sm">
              {t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
