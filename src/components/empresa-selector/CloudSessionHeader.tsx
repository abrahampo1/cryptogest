import { useTranslation } from "react-i18next"
import { Cloud, LogOut } from "lucide-react"
import type { CloudSession } from "./types"

interface Props {
  session: CloudSession
  onLogout: () => void
}

export function CloudSessionHeader({ session, onLogout }: Props) {
  const { t } = useTranslation(['auth'])
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5">
        <Cloud className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {t('empresaSelector.cloudSection')}
        </h2>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">{session.user.email}</span>
        <button
          onClick={onLogout}
          className="text-muted-foreground hover:text-foreground transition-colors duration-150"
          title={t('empresaSelector.cloudLogout')}
          aria-label={t('empresaSelector.cloudLogout')}
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
