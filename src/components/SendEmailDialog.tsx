import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Mail,
  Paperclip,
  Loader2,
  CheckCircle,
  AlertCircle,
  Send,
} from "lucide-react"

interface SendEmailDialogProps {
  open: boolean
  onClose: () => void
  attachmentName?: string
  attachmentBase64?: string
  defaultRecipient?: string
  defaultSubject?: string
  defaultBody?: string
}

export function SendEmailDialog({
  open,
  onClose,
  attachmentName,
  attachmentBase64,
  defaultRecipient,
  defaultSubject,
  defaultBody,
}: SendEmailDialogProps) {
  const [to, setTo] = useState("")
  const [cc, setCc] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTo(defaultRecipient || "")
      setCc("")
      setSubject(defaultSubject || "")
      setBody(defaultBody || "")
      setSending(false)
      setSuccess(false)
      setError(null)
    }
  }, [open, defaultRecipient, defaultSubject, defaultBody])

  const handleSend = async () => {
    if (!to.trim()) {
      setError("El destinatario es obligatorio")
      return
    }

    setSending(true)
    setError(null)

    try {
      const result = await window.electronAPI?.email.send({
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject: subject.trim(),
        body: body.trim(),
        attachmentName,
        attachmentBase64,
      })

      if (result?.success) {
        setSuccess(true)
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        setError(result?.error || "Error al enviar el email")
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Enviar por Email
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {success && (
            <div className="flex items-center gap-2 bg-green-50 text-green-700 p-2 rounded text-xs">
              <CheckCircle className="h-3.5 w-3.5" />
              Email enviado correctamente
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 p-2 rounded text-xs">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label className="text-xs">Para *</Label>
            <Input
              className="h-8 text-sm"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="destinatario@email.com"
              disabled={sending || success}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">CC</Label>
            <Input
              className="h-8 text-sm"
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="copia@email.com"
              disabled={sending || success}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Asunto</Label>
            <Input
              className="h-8 text-sm"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto del mensaje"
              disabled={sending || success}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Mensaje</Label>
            <Textarea
              className="text-sm min-h-[100px] resize-none"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Cuerpo del mensaje..."
              disabled={sending || success}
            />
          </div>

          {attachmentName && (
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded border text-xs">
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Adjunto:</span>
              <span className="font-medium truncate">{attachmentName}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSend} disabled={sending || success || !to.trim()}>
            {sending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
