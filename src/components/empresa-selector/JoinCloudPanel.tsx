import { useTranslation } from "react-i18next"
import { CheckCircle2, Cloud, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { CloudLoginPrompt } from "@/components/CloudLoginPrompt"
import type { CloudSession } from "./types"

interface Props {
  cloudSession: CloudSession | null
  onCloudSessionChange: (session: CloudSession | null) => void
  code: string
  passphrase: string
  isSubmitting: boolean
  onCodeChange: (v: string) => void
  onPassphraseChange: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export function JoinCloudPanel({
  cloudSession,
  onCloudSessionChange,
  code,
  passphrase,
  isSubmitting,
  onCodeChange,
  onPassphraseChange,
  onSubmit,
  onCancel,
}: Props) {
  const { t } = useTranslation(['auth', 'common'])

  return (
    <div className="rounded-lg border border-hairline bg-surface-2 p-5 space-y-3 animate-expand">
      <div className="flex items-center gap-2">
        <Cloud className="h-4 w-4 text-primary" />
        <span className="text-[15px] font-medium text-foreground">
          {t('empresaSelector.joinCloud')}
        </span>
      </div>

      {!cloudSession ? (
        <CloudLoginPrompt onConnected={onCloudSessionChange} />
      ) : (
        <>
          <div className="flex items-center gap-2 p-2.5 rounded-md bg-success/10 border border-success/20">
            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
            <span className="text-[13px] text-success">
              {t('empresaSelector.cloudSessionActive', {
                email: cloudSession.user.email,
                defaultValue: 'Connected as {{email}}',
              })}
            </span>
          </div>
          <Input
            value={code}
            onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
            placeholder={t('empresaSelector.joinCloudCode')}
            className="h-10 font-mono tracking-[0.3em] text-[15px] text-center uppercase"
            maxLength={8}
            autoFocus
          />
          <PasswordInput
            value={passphrase}
            onChange={(e) => onPassphraseChange(e.target.value)}
            placeholder={t('empresaSelector.joinCloudPassphrase')}
            autoComplete="current-password"
          />
        </>
      )}

      <div className="flex gap-2 pt-1">
        {cloudSession && (
          <Button
            onClick={onSubmit}
            disabled={!code.trim() || !passphrase || isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Cloud className="h-4 w-4 mr-1.5" />
            )}
            {t('empresaSelector.joinCloudButton')}
          </Button>
        )}
        <Button variant="outline" onClick={onCancel} className="text-[13px]">
          {t('common:cancel')}
        </Button>
      </div>
    </div>
  )
}
