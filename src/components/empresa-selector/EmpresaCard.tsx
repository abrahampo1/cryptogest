import { useTranslation } from "react-i18next"
import { Building2, Check, ChevronRight, Cloud, Pencil, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/formatting"
import type { EmpresaInfo } from "./types"

interface Props {
  empresa: EmpresaInfo
  isLast: boolean
  editingId: string | null
  editName: string
  onEditNameChange: (v: string) => void
  onStartEdit: (e: EmpresaInfo) => void
  onCancelEdit: () => void
  onCommitEdit: (id: string) => void
  onDelete: (e: EmpresaInfo) => void
  onSelect: (id: string) => void
}

export function EmpresaCard({
  empresa,
  isLast,
  editingId,
  editName,
  onEditNameChange,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  onDelete,
  onSelect,
}: Props) {
  const { t } = useTranslation(['auth', 'common'])
  const isEditing = editingId === empresa.id
  const isCloud = empresa.tipo === 'cloud'

  return (
    <div
      className={`group relative flex items-center gap-3 rounded-md border px-4 py-3 transition-colors duration-150 cursor-pointer bg-surface-2 ${
        isLast
          ? 'border-l-2 border-l-primary border-y border-r border-hairline'
          : 'border-hairline hover:bg-surface-3 hover:border-hairline/60'
      }`}
      onClick={() => {
        if (!isEditing) onSelect(empresa.id)
      }}
    >
      <div className="flex items-center justify-center h-10 w-10 rounded-md bg-surface-3 shrink-0">
        {isCloud ? (
          <Cloud className="h-5 w-5 text-primary" />
        ) : (
          <Building2 className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Input
              className="h-8 text-[13px]"
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommitEdit(empresa.id)
                if (e.key === 'Escape') onCancelEdit()
              }}
              autoFocus
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => onCommitEdit(empresa.id)}
              aria-label={t('common:save')}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={onCancelEdit}
              aria-label={t('common:cancel')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-medium text-foreground truncate">{empresa.nombre}</p>
              {isLast && (
                <span className="text-[11px] bg-primary/10 text-primary rounded px-1.5 py-0.5 leading-none">
                  {t('empresaSelector.lastUsed', { defaultValue: 'última' })}
                </span>
              )}
            </div>
            <p className="text-[13px] text-muted-foreground truncate">
              {isCloud && empresa.cloudConfig?.role
                ? `Cloud · ${empresa.cloudConfig.role} · ${formatDate(empresa.creadaEn)}`
                : formatDate(empresa.creadaEn)}
            </p>
          </>
        )}
      </div>
      {!isEditing && (
        <>
          <div
            className="flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => onStartEdit(empresa)}
              aria-label={t('common:edit')}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 hover:text-destructive"
              onClick={() => onDelete(empresa)}
              aria-label={t('common:delete')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
        </>
      )}
    </div>
  )
}
