import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Building2,
  Plus,
  Loader2,
  ChevronRight,
  Trash2,
  Pencil,
  X,
  Check,
} from "lucide-react"
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

interface EmpresaInfo {
  id: string
  nombre: string
  dataPath: string | null
  creadaEn: string
}

interface EmpresaSelectorPageProps {
  empresas: EmpresaInfo[]
  ultimaEmpresaId: string | null
  onSelect: (id: string) => void
  onCreated: () => void
}

export function EmpresaSelectorPage({ empresas, ultimaEmpresaId, onSelect, onCreated }: EmpresaSelectorPageProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<EmpresaInfo | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleCreate = async () => {
    if (!newName.trim()) return
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await window.electronAPI?.empresa.create({ nombre: newName.trim() })
      if (result?.success) {
        setNewName("")
        setIsCreating(false)
        onCreated()
      } else {
        setError(result?.error || "Error al crear empresa")
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRename = async (id: string) => {
    if (!editName.trim()) return
    try {
      await window.electronAPI?.empresa.rename(id, editName.trim())
      setEditingId(null)
      onCreated()
    } catch (err) {
      console.error(err)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const result = await window.electronAPI?.empresa.delete(deleteTarget.id)
      if (result?.success) {
        onCreated()
      } else {
        setError(result?.error || "Error al eliminar empresa")
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <img src="./assets/logo.png" alt="CryptoGest" className="h-10 w-10" />
            <h1 className="text-2xl font-bold text-white">CryptoGest</h1>
          </div>
          <p className="text-sm text-slate-400">Selecciona una empresa para continuar</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Lista de empresas */}
        <div className="space-y-2 mb-4">
          {empresas.map((empresa) => (
            <div
              key={empresa.id}
              className={`group relative flex items-center gap-3 p-4 rounded-lg border transition-colors cursor-pointer ${
                empresa.id === ultimaEmpresaId
                  ? "border-primary/50 bg-slate-800/80 hover:bg-slate-800"
                  : "border-slate-700 bg-slate-900/50 hover:bg-slate-800/50"
              }`}
              onClick={() => {
                if (editingId !== empresa.id) onSelect(empresa.id)
              }}
            >
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-slate-700/50 shrink-0">
                <Building2 className="h-5 w-5 text-slate-300" />
              </div>
              <div className="flex-1 min-w-0">
                {editingId === empresa.id ? (
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Input
                      className="h-7 text-sm bg-slate-800 border-slate-600 text-white"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(empresa.id)
                        if (e.key === "Escape") setEditingId(null)
                      }}
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-400 hover:text-green-300" onClick={() => handleRename(empresa.id)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-300" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-white truncate">{empresa.nombre}</p>
                    <p className="text-[10px] text-slate-500">
                      Creada el {new Date(empresa.creadaEn).toLocaleDateString("es-ES")}
                    </p>
                  </>
                )}
              </div>
              {editingId !== empresa.id && (
                <>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-slate-400 hover:text-slate-200"
                      onClick={() => {
                        setEditingId(empresa.id)
                        setEditName(empresa.nombre)
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
                      onClick={() => setDeleteTarget(empresa)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />
                </>
              )}
            </div>
          ))}

          {empresas.length === 0 && !isCreating && (
            <div className="text-center py-12 text-slate-500">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay empresas configuradas</p>
              <p className="text-xs mt-1">Crea tu primera empresa para comenzar</p>
            </div>
          )}
        </div>

        {/* Crear empresa */}
        {isCreating ? (
          <div className="p-4 rounded-lg border border-slate-700 bg-slate-900/50 space-y-3">
            <Input
              className="h-9 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
              placeholder="Nombre de la empresa..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
                if (e.key === "Escape") { setIsCreating(false); setNewName("") }
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!newName.trim() || isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                Crear empresa
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setIsCreating(false); setNewName("") }}
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full border-slate-700 bg-slate-900/30 text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Crear nueva empresa
          </Button>
        )}

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar empresa</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget && (
                  <>
                    Se eliminará la empresa <strong>{deleteTarget.nombre}</strong> y todos sus datos (base de datos, adjuntos, configuración).
                    Esta acción no se puede deshacer.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
