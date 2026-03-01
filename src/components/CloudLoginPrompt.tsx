import { useState, useRef } from "react"
import { useTranslation } from "react-i18next"
import { translateError } from "@/lib/formatting"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Cloud,
  ExternalLink,
  Loader2,
} from "lucide-react"

interface CloudSession {
  serverUrl: string
  token: string
  user: { id: number; name: string; email: string }
}

interface CloudLoginPromptProps {
  onConnected: (session: CloudSession) => void
  serverUrl?: string
}

export function CloudLoginPrompt({ onConnected, serverUrl: initialServerUrl }: CloudLoginPromptProps) {
  const { t } = useTranslation(['auth', 'common'])
  const [serverUrl] = useState(initialServerUrl || "https://cryptogest.app")
  const [codeDigits, setCodeDigits] = useState(["", "", "", "", "", ""])
  const [isVerifyingCode, setIsVerifyingCode] = useState(false)
  const [deviceName, setDeviceName] = useState("CryptoGest Desktop")
  const [error, setError] = useState<string | null>(null)
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleCodeChange = (index: number, value: string) => {
    const char = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-1)
    const newDigits = [...codeDigits]
    newDigits[index] = char
    setCodeDigits(newDigits)
    if (char && index < 5) {
      codeInputRefs.current[index + 1]?.focus()
    }
  }

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !codeDigits[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
  }

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6)
    if (pasted.length === 0) return
    const newDigits = [...codeDigits]
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || ""
    }
    setCodeDigits(newDigits)
    const focusIndex = Math.min(pasted.length, 5)
    codeInputRefs.current[focusIndex]?.focus()
  }

  const handleVerifyCode = async () => {
    const code = codeDigits.join("")
    if (code.length !== 6) return
    setIsVerifyingCode(true)
    setError(null)
    try {
      const result = await window.electronAPI?.cloud.verifyCode({ code, server: serverUrl, deviceName: deviceName.trim() || undefined })
      if (result?.success && result.data) {
        setCodeDigits(["", "", "", "", "", ""])
        // Fetch the updated session from main process
        const sessionResult = await window.electronAPI?.cloudSession.get()
        if (sessionResult?.success && sessionResult.data) {
          onConnected(sessionResult.data)
        } else {
          // Fallback: construct session from verifyCode response
          onConnected({
            serverUrl,
            token: result.data.api_token,
            user: result.data.user,
          })
        }
      } else {
        setError(result?.error ? translateError(result.error) : t('empresaSelector.codeInvalid', 'Invalid or expired code'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsVerifyingCode(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        {t('empresaSelector.cloudConnectFirst', 'Connect your CryptoGest Cloud account to create a cloud company.')}
      </p>

      {error && (
        <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-xs">
          {error}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-xs"
        onClick={() => window.electronAPI?.shell.openExternal(`${serverUrl}/authorize/device`)}
      >
        <ExternalLink className="h-3 w-3 mr-1.5" />
        {t('empresaSelector.openCloudLogin', 'Open CryptoGest Cloud')}
      </Button>

      <div className="flex items-center gap-2">
        <div className="flex-1 border-t border-slate-700" />
        <span className="text-[10px] text-slate-500">{t('empresaSelector.orEnterCode', 'or enter device code')}</span>
        <div className="flex-1 border-t border-slate-700" />
      </div>

      <div className="space-y-2">
        <Input
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder={t('empresaSelector.deviceName', 'Device name')}
          className="h-7 text-xs bg-slate-800 border-slate-600 text-white text-center"
          disabled={isVerifyingCode}
        />
        <div className="flex items-center justify-center gap-1.5" onPaste={handleCodePaste}>
          {codeDigits.map((digit, i) => (
            <Input
              key={i}
              ref={(el) => { codeInputRefs.current[i] = el }}
              value={digit}
              onChange={(e) => handleCodeChange(i, e.target.value)}
              onKeyDown={(e) => handleCodeKeyDown(i, e)}
              className="h-9 w-9 text-center text-sm font-mono uppercase bg-slate-800 border-slate-600 text-white"
              maxLength={1}
              disabled={isVerifyingCode}
            />
          ))}
        </div>
        <Button
          size="sm"
          className="w-full text-xs"
          onClick={handleVerifyCode}
          disabled={codeDigits.join("").length !== 6 || isVerifyingCode}
        >
          {isVerifyingCode ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
          ) : (
            <Cloud className="h-3 w-3 mr-1.5" />
          )}
          {t('empresaSelector.connectCloud', 'Connect')}
        </Button>
        <p className="text-[10px] text-slate-500 text-center">
          {t('empresaSelector.codeHint', 'Generate a code at')}{' '}
          <button
            type="button"
            onClick={() => window.electronAPI?.shell.openExternal(`${serverUrl}/authorize/device`)}
            className="text-blue-400 hover:underline"
          >
            {t('empresaSelector.devices', 'Devices')}
          </button>
        </p>
      </div>
    </div>
  )
}
