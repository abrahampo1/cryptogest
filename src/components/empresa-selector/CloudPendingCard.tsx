import { useTranslation } from "react-i18next"
import { Cloud, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import type { CloudEmpresaInfo } from "./types"

interface Props {
  cloudEmpresa: CloudEmpresaInfo
  isExpanded: boolean
  passphrase: string
  isSubmitting: boolean
  onToggle: () => void
  onPassphraseChange: (v: string) => void
  onAdd: () => void
  onCancel: () => void
}

export function CloudPendingCard({
  cloudEmpresa: ce,
  isExpanded,
  passphrase,
  isSubmitting,
  onToggle,
  onPassphraseChange,
  onAdd,
  onCancel,
}: Props) {
  const { t } = useTranslation(['auth', 'common'])

  return (
    <div className="rounded-md border border-hairline bg-surface-2 overflow-hidden transition-all duration-200">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-3 transition-colors duration-150"
        onClick={onToggle}
      >
        <div className="flex items-center justify-center h-10 w-10 rounded-md bg-surface-3 shrink-0">
          <Cloud className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-medium text-foreground truncate">
              Cloud Empresa #{ce.id}
            </p>
            <span className="text-[11px] bg-surface-3 text-muted-foreground rounded px-1.5 py-0.5 leading-none">
              {ce.role}
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground">{t('empresaSelector.notJoined')}</p>
        </div>
        <Download
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 pt-3 space-y-3 border-t border-hairline animate-expand">
          <PasswordInput
            value={passphrase}
            onChange={(e) => onPassphraseChange(e.target.value)}
            placeholder={t('empresaSelector.enterPassphraseToJoin')}
            autoFocus
            autoComplete="current-password"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && passphrase) onAdd()
              if (e.key === 'Escape') onCancel()
            }}
          />
          <div className="flex gap-2">
            <Button
              onClick={onAdd}
              disabled={!passphrase || isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Download className="h-4 w-4 mr-1.5" />
              )}
              {t('empresaSelector.addToDevice')}
            </Button>
            <Button variant="outline" onClick={onCancel}>
              {t('common:cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
