import { useTranslation } from "react-i18next"
import { ArrowLeft, Cloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CloudLoginPrompt } from "@/components/CloudLoginPrompt"
import type { CloudSession } from "./types"

interface Props {
  onConnected: (session: CloudSession) => void
  onBack: () => void
}

export function CloudLoginScreen({ onConnected, onBack }: Props) {
  const { t } = useTranslation(['auth', 'common'])
  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="h-14 w-14 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Cloud className="h-7 w-7 text-primary" />
            </div>
          </div>
          <h1 className="text-[18px] font-semibold text-foreground mb-1 tracking-tight">
            {t('empresaSelector.cloudLoginTitle')}
          </h1>
          <p className="text-[13px] text-muted-foreground">{t('empresaSelector.cloudLoginDesc')}</p>
        </div>

        <CloudLoginPrompt onConnected={onConnected} />

        <div className="mt-6 text-center">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            {t('common:back')}
          </Button>
        </div>
      </div>
    </div>
  )
}
