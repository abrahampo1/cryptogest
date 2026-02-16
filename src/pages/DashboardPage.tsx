import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Page } from "@/components/layout/Sidebar"
import {
  FileText,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  UserPlus,
  PackagePlus,
  FilePlus,
  Receipt,
  HelpCircle,
} from "lucide-react"

interface DashboardPageProps {
  onNavigate: (page: Page) => void
  onHelp?: () => void
}

export function DashboardPage({ onNavigate, onHelp }: DashboardPageProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activities, setActivities] = useState<RecentActivity[]>([])
  const [pendingInvoices, setPendingInvoices] = useState<Factura[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    setIsLoading(true)
    try {
      const [statsRes, activitiesRes, pendingRes] = await Promise.all([
        window.electronAPI?.dashboard.getStats(),
        window.electronAPI?.dashboard.getRecentActivity(),
        window.electronAPI?.dashboard.getPendingInvoices()
      ])

      if (statsRes?.success && statsRes.data) {
        setStats(statsRes.data)
      }
      if (activitiesRes?.success && activitiesRes.data) {
        setActivities(activitiesRes.data)
      }
      if (pendingRes?.success && pendingRes.data) {
        setPendingInvoices(pendingRes.data)
      }
    } catch (error) {
      console.error('Error cargando dashboard:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(amount)

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const getDaysUntilDue = (fechaVencimiento: Date | string | null | undefined) => {
    if (!fechaVencimiento) return null
    const vencimiento = new Date(fechaVencimiento)
    const now = new Date()
    return Math.ceil((vencimiento.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  const balance = stats ? stats.ingresosTotales - stats.gastosTotales : 0

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h1 className="text-xl font-semibold">Panel de Control</h1>
          <p className="text-sm text-muted-foreground">
            Resumen del ejercicio fiscal actual
          </p>
        </div>
        {onHelp && (
          <button onClick={onHelp} className="rounded-full p-1.5 hover:bg-accent transition-colors" title="Ver ayuda">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Acciones rápidas:</span>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => onNavigate('clientes')}>
          <UserPlus className="h-3.5 w-3.5" />
          Nuevo Cliente
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => onNavigate('productos')}>
          <PackagePlus className="h-3.5 w-3.5" />
          Nuevo Producto
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => onNavigate('facturas')}>
          <FilePlus className="h-3.5 w-3.5" />
          Nueva Factura
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => onNavigate('gastos')}>
          <Receipt className="h-3.5 w-3.5" />
          Nuevo Gasto
        </Button>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-600">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Ingresos</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatCurrency(stats?.ingresosTotales || 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats?.facturasEmitidas || 0} facturas
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-600">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Gastos</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatCurrency(stats?.gastosTotales || 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats?.gastosRegistrados || 0} registros
            </p>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${balance >= 0 ? 'border-l-green-600' : 'border-l-amber-600'}`}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className={`text-lg font-semibold tabular-nums ${balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatCurrency(balance)}
            </p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {balance > 0 ? (
                <><TrendingUp className="h-3 w-3 text-green-600" /> Positivo</>
              ) : balance < 0 ? (
                <><TrendingDown className="h-3 w-3 text-red-600" /> Negativo</>
              ) : (
                <><Minus className="h-3 w-3" /> Neutro</>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Pendiente Cobro</p>
            <p className="text-lg font-semibold tabular-nums text-amber-700">
              {formatCurrency(stats?.facturasPendientesTotal || 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats?.facturasPendientesCount || 0} facturas
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Pending Invoices Table */}
        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Facturas Pendientes de Cobro
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pendingInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No hay facturas pendientes
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs">Nº Factura</TableHead>
                    <TableHead className="h-9 text-xs">Cliente</TableHead>
                    <TableHead className="h-9 text-xs">Vencimiento</TableHead>
                    <TableHead className="h-9 text-xs text-right">Importe</TableHead>
                    <TableHead className="h-9 text-xs text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvoices.slice(0, 8).map((factura) => {
                    const daysUntilDue = getDaysUntilDue(factura.fechaVencimiento)
                    const isOverdue = daysUntilDue !== null && daysUntilDue < 0
                    const isUrgent = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 5

                    return (
                      <TableRow key={factura.id} className="text-sm">
                        <TableCell className="py-2 font-mono text-xs">{factura.numero}</TableCell>
                        <TableCell className="py-2 truncate max-w-[150px]" title={factura.cliente?.nombre}>
                          {factura.cliente?.nombre || '-'}
                        </TableCell>
                        <TableCell className="py-2 text-xs">
                          {factura.fechaVencimiento ? formatDate(factura.fechaVencimiento) : '-'}
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono tabular-nums">
                          {formatCurrency(factura.total)}
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          {isOverdue ? (
                            <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded">
                              <AlertTriangle className="h-3 w-3" />
                              Vencida
                            </span>
                          ) : isUrgent ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                              <Clock className="h-3 w-3" />
                              {daysUntilDue}d
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded">
                              Pendiente
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Movimientos Recientes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No hay movimientos recientes
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs">Tipo</TableHead>
                    <TableHead className="h-9 text-xs">Descripción</TableHead>
                    <TableHead className="h-9 text-xs">Fecha</TableHead>
                    <TableHead className="h-9 text-xs text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.slice(0, 8).map((activity, idx) => (
                    <TableRow key={`${activity.tipo}-${activity.id}-${idx}`} className="text-sm">
                      <TableCell className="py-2">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded ${
                          activity.tipo === 'factura' ? 'bg-blue-50 text-blue-700' :
                          activity.tipo === 'gasto' ? 'bg-red-50 text-red-700' :
                          activity.tipo === 'cliente' ? 'bg-green-50 text-green-700' :
                          'bg-slate-50 text-slate-700'
                        }`}>
                          {activity.tipo === 'factura' ? 'Factura' :
                           activity.tipo === 'gasto' ? 'Gasto' :
                           activity.tipo === 'cliente' ? 'Cliente' :
                           activity.tipo === 'producto' ? 'Producto' : activity.tipo}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 truncate max-w-[180px]" title={activity.descripcion}>
                        {activity.descripcion}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">
                        {formatDate(activity.fecha)}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono tabular-nums">
                        {activity.monto !== undefined ? (
                          <span className={activity.tipo === 'gasto' ? 'text-red-700' : 'text-green-700'}>
                            {activity.tipo === 'gasto' ? '-' : '+'}{formatCurrency(activity.monto)}
                          </span>
                        ) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary Counts */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Clientes Activos</p>
            <p className="text-lg font-semibold tabular-nums">{stats?.clientesActivos || 0}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Facturas Emitidas</p>
            <p className="text-lg font-semibold tabular-nums">{stats?.facturasEmitidas || 0}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Facturas Pendientes</p>
            <p className="text-lg font-semibold tabular-nums">{stats?.facturasPendientesCount || 0}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Gastos Registrados</p>
            <p className="text-lg font-semibold tabular-nums">{stats?.gastosRegistrados || 0}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
