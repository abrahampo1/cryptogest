import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { translateError } from "@/lib/formatting"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { cn } from "@/lib/utils"
import {
  Mail,
  Inbox,
  Send,
  FileText,
  Trash2,
  Star,
  Archive,
  RefreshCw,
  Plus,
  Settings,
  Search,
  Paperclip,
  Reply,
  Forward,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Eye,
  EyeOff,
  Download,
  X,
  FolderOpen,
  AlertCircle,
  Check,
} from "lucide-react"

// --- Types ---

interface AccountFormData {
  nombre: string
  email: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  imapUser: string
  imapPass: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPass: string
  fromName: string
}

const emptyAccountForm: AccountFormData = {
  nombre: '', email: '',
  imapHost: '', imapPort: 993, imapSecure: true, imapUser: '', imapPass: '',
  smtpHost: '', smtpPort: 587, smtpSecure: false, smtpUser: '', smtpPass: '',
  fromName: '',
}

const folderIcon = (specialUse: string | null) => {
  switch (specialUse) {
    case '\\Inbox': return Inbox
    case '\\Sent': return Send
    case '\\Drafts': return FileText
    case '\\Trash': return Trash2
    case '\\Junk': return AlertCircle
    case '\\Flagged': return Star
    case '\\Archive': return Archive
    default: return FolderOpen
  }
}

const folderDisplayName = (folder: CarpetaEmail, t: (key: string) => string) => {
  if (folder.specialUse === '\\Inbox') return t('inbox')
  if (folder.specialUse === '\\Sent') return t('sent')
  if (folder.specialUse === '\\Drafts') return t('drafts')
  if (folder.specialUse === '\\Trash') return t('trash')
  if (folder.specialUse === '\\Junk') return t('spam')
  if (folder.specialUse === '\\Flagged') return t('starred')
  if (folder.specialUse === '\\Archive') return t('archive')
  return folder.nombre
}

function formatEmailDate(dateStr: string | null, t: (key: string) => string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return t('yesterday')
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  }
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatFullDate(dateStr: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
}

// ============================================
// Main Page Component
// ============================================

export function BuzonPage() {
  const { t } = useTranslation(['buzon', 'common'])

  // State
  const [accounts, setAccounts] = useState<CuentaEmail[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [folders, setFolders] = useState<CarpetaEmail[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [messages, setMessages] = useState<CorreoCache[]>([])
  const [totalMessages, setTotalMessages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedMessage, setSelectedMessage] = useState<CorreoCompleto | null>(null)
  const [selectedMessageUid, setSelectedMessageUid] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Loading states
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [syncingMessages, setSyncingMessages] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Dialogs
  const [showAccountDialog, setShowAccountDialog] = useState(false)
  const [showAccountManager, setShowAccountManager] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null)
  const [accountForm, setAccountForm] = useState<AccountFormData>(emptyAccountForm)
  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [savingAccount, setSavingAccount] = useState(false)
  const [deleteAccountId, setDeleteAccountId] = useState<number | null>(null)

  const [showComposeDialog, setShowComposeDialog] = useState(false)
  const [composeData, setComposeData] = useState({ to: '', cc: '', subject: '', body: '', inReplyTo: '', references: '' })
  const [composeSending, setComposeSending] = useState(false)
  const [composeAttachments, setComposeAttachments] = useState<Array<{ filename: string; data: number[] }>>([])

  const pageSize = 50
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // --- Load accounts on mount ---
  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    setLoadingAccounts(true)
    try {
      const res = await window.electronAPI?.buzon.listAccounts()
      if (res?.success && res.data) {
        setAccounts(res.data)
        if (res.data.length > 0 && !selectedAccountId) {
          setSelectedAccountId(res.data[0].id)
        }
      }
    } finally {
      setLoadingAccounts(false)
    }
  }

  // --- Load folders when account changes ---
  useEffect(() => {
    if (selectedAccountId) {
      loadFolders(selectedAccountId)
    } else {
      setFolders([])
      setSelectedFolderId(null)
    }
  }, [selectedAccountId])

  const loadFolders = async (accountId: number) => {
    setLoadingFolders(true)
    setFolders([])
    setSelectedFolderId(null)
    try {
      const res = await window.electronAPI?.buzon.listFolders(accountId)
      if (res?.success && res.data) {
        setFolders(res.data)
        // Auto-select inbox
        const inbox = res.data.find(f => f.specialUse === '\\Inbox')
        if (inbox) setSelectedFolderId(inbox.id)
        else if (res.data.length > 0) setSelectedFolderId(res.data[0].id)
      }
    } finally {
      setLoadingFolders(false)
    }
  }

  // --- Load messages when folder changes ---
  useEffect(() => {
    if (selectedAccountId && selectedFolderId) {
      setCurrentPage(1)
      loadMessages(selectedAccountId, selectedFolderId, 1)
    } else {
      setMessages([])
      setTotalMessages(0)
    }
    setSelectedMessage(null)
    setSelectedMessageUid(null)
  }, [selectedAccountId, selectedFolderId])

  const loadMessages = async (accountId: number, folderId: number, page: number) => {
    setLoadingMessages(true)
    try {
      const res = await window.electronAPI?.buzon.listMessages(accountId, folderId, page, pageSize)
      if (res?.success && res.data) {
        setMessages(res.data.messages)
        setTotalMessages(res.data.total)
      }
    } finally {
      setLoadingMessages(false)
    }
  }

  // --- Sync (IMAP fetch) ---
  const handleSync = async () => {
    if (!selectedAccountId) return
    setSyncingMessages(true)
    try {
      // Sync folders first
      const fRes = await window.electronAPI?.buzon.syncFolders(selectedAccountId)
      if (fRes?.success && fRes.data) {
        setFolders(fRes.data)
        // Keep selected folder, or pick inbox
        if (!fRes.data.find(f => f.id === selectedFolderId)) {
          const inbox = fRes.data.find(f => f.specialUse === '\\Inbox')
          setSelectedFolderId(inbox?.id || fRes.data[0]?.id || null)
        }
      }

      if (selectedFolderId) {
        await window.electronAPI?.buzon.syncMessages(selectedAccountId, selectedFolderId)
        await loadMessages(selectedAccountId, selectedFolderId, currentPage)
        // Refresh folder stats
        const fRes2 = await window.electronAPI?.buzon.listFolders(selectedAccountId)
        if (fRes2?.success && fRes2.data) setFolders(fRes2.data)
      }
    } finally {
      setSyncingMessages(false)
    }
  }

  // --- Read message ---
  const handleSelectMessage = async (msg: CorreoCache) => {
    if (!selectedAccountId || !selectedFolderId) return
    setSelectedMessageUid(msg.uid)
    setLoadingDetail(true)
    try {
      const res = await window.electronAPI?.buzon.getMessage(selectedAccountId, selectedFolderId, msg.uid)
      if (res?.success && res.data) {
        setSelectedMessage(res.data)
        // Mark as read in local cache
        setMessages(prev => prev.map(m => m.uid === msg.uid ? { ...m, seen: 1 } : m))
      }
    } finally {
      setLoadingDetail(false)
    }
  }

  // --- Mark read/unread ---
  const handleToggleRead = async (msg: CorreoCache) => {
    if (!selectedAccountId || !selectedFolderId) return
    if (msg.seen) {
      await window.electronAPI?.buzon.markUnread(selectedAccountId, selectedFolderId, msg.uid)
      setMessages(prev => prev.map(m => m.uid === msg.uid ? { ...m, seen: 0 } : m))
    } else {
      await window.electronAPI?.buzon.markRead(selectedAccountId, selectedFolderId, msg.uid)
      setMessages(prev => prev.map(m => m.uid === msg.uid ? { ...m, seen: 1 } : m))
    }
  }

  // --- Delete message ---
  const handleDeleteMessage = async (uid: number) => {
    if (!selectedAccountId || !selectedFolderId) return
    await window.electronAPI?.buzon.deleteMessage(selectedAccountId, selectedFolderId, uid)
    setMessages(prev => prev.filter(m => m.uid !== uid))
    if (selectedMessageUid === uid) {
      setSelectedMessage(null)
      setSelectedMessageUid(null)
    }
  }

  // --- Download attachment ---
  const handleDownloadAttachment = async (attachmentIndex: number) => {
    if (!selectedAccountId || !selectedFolderId || !selectedMessageUid) return
    await window.electronAPI?.buzon.downloadAttachment(selectedAccountId, selectedFolderId, selectedMessageUid, attachmentIndex)
  }

  // --- Pagination ---
  const totalPages = Math.ceil(totalMessages / pageSize)
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    if (selectedAccountId && selectedFolderId) {
      loadMessages(selectedAccountId, selectedFolderId, page)
    }
  }

  // --- Compose ---
  const openCompose = (mode: 'new' | 'reply' | 'forward' = 'new') => {
    if (mode === 'new') {
      setComposeData({ to: '', cc: '', subject: '', body: '', inReplyTo: '', references: '' })
    } else if (mode === 'reply' && selectedMessage) {
      const replyTo = selectedMessage.from[0]?.address || ''
      const subj = selectedMessage.subject.startsWith('Re:') ? selectedMessage.subject : `Re: ${selectedMessage.subject}`
      const quote = `\n\n${t('originalMessage')}\n${t('from')}: ${selectedMessage.from.map(f => `${f.name} <${f.address}>`).join(', ')}\n${t('date')}: ${formatFullDate(selectedMessage.date)}\n${t('subject')}: ${selectedMessage.subject}\n\n${selectedMessage.text}`
      setComposeData({
        to: replyTo, cc: '', subject: subj, body: quote,
        inReplyTo: selectedMessage.messageId,
        references: selectedMessage.messageId,
      })
    } else if (mode === 'forward' && selectedMessage) {
      const subj = selectedMessage.subject.startsWith('Fwd:') ? selectedMessage.subject : `Fwd: ${selectedMessage.subject}`
      const quote = `\n\n${t('forwardedMessage')}\n${t('from')}: ${selectedMessage.from.map(f => `${f.name} <${f.address}>`).join(', ')}\n${t('date')}: ${formatFullDate(selectedMessage.date)}\n${t('subject')}: ${selectedMessage.subject}\n\n${selectedMessage.text}`
      setComposeData({ to: '', cc: '', subject: subj, body: quote, inReplyTo: '', references: '' })
    }
    setComposeAttachments([])
    setShowComposeDialog(true)
  }

  const handleSendEmail = async () => {
    if (!selectedAccountId || !composeData.to.trim()) return
    setComposeSending(true)
    try {
      const res = await window.electronAPI?.buzon.sendEmail(selectedAccountId, {
        to: composeData.to,
        cc: composeData.cc || undefined,
        subject: composeData.subject,
        html: composeData.body.replace(/\n/g, '<br>'),
        text: composeData.body,
        inReplyTo: composeData.inReplyTo || undefined,
        references: composeData.references || undefined,
        attachments: composeAttachments.length > 0 ? composeAttachments : undefined,
      })
      if (res?.success) {
        setShowComposeDialog(false)
      }
    } finally {
      setComposeSending(false)
    }
  }

  const handleAddComposeAttachment = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = async (e: any) => {
      const files = e.target.files as FileList
      for (const file of Array.from(files)) {
        const buffer = await file.arrayBuffer()
        setComposeAttachments(prev => [...prev, {
          filename: file.name,
          data: Array.from(new Uint8Array(buffer)),
        }])
      }
    }
    input.click()
  }

  // --- Account management ---
  const handleSaveAccount = async () => {
    setSavingAccount(true)
    try {
      if (editingAccountId) {
        const data: any = { ...accountForm }
        if (!data.imapPass) delete data.imapPass
        if (!data.smtpPass) delete data.smtpPass
        await window.electronAPI?.buzon.updateAccount(editingAccountId, data)
      } else {
        await window.electronAPI?.buzon.addAccount(accountForm)
      }
      setShowAccountDialog(false)
      await loadAccounts()
    } finally {
      setSavingAccount(false)
    }
  }

  const handleTestConnection = async () => {
    setTestingConnection(true)
    setTestResult(null)
    try {
      // We need to save first to test, or test with temp data
      // For simplicity: save first, then test
      let accountId = editingAccountId
      if (!accountId) {
        const res = await window.electronAPI?.buzon.addAccount(accountForm)
        if (res?.success && res.data) {
          accountId = res.data.id
          setEditingAccountId(accountId)
        } else {
          setTestResult({ success: false, message: res?.error ? translateError(res.error) : t('saveError') })
          return
        }
      } else {
        const data: any = { ...accountForm }
        if (!data.imapPass) delete data.imapPass
        if (!data.smtpPass) delete data.smtpPass
        await window.electronAPI?.buzon.updateAccount(accountId, data)
      }

      const res = await window.electronAPI?.buzon.testConnection(accountId)
      if (res?.success) {
        setTestResult({ success: true, message: t('connectionImapSmtpOk') })
      } else {
        setTestResult({ success: false, message: res?.error ? translateError(res.error) : t('connectionError') })
      }
    } finally {
      setTestingConnection(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!deleteAccountId) return
    await window.electronAPI?.buzon.deleteAccount(deleteAccountId)
    setDeleteAccountId(null)
    if (selectedAccountId === deleteAccountId) {
      setSelectedAccountId(null)
    }
    await loadAccounts()
  }

  const openEditAccount = (account: CuentaEmail) => {
    setEditingAccountId(account.id)
    setAccountForm({
      nombre: account.nombre,
      email: account.email,
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      imapSecure: account.imapSecure === 1,
      imapUser: account.imapUser,
      imapPass: '',
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
      smtpSecure: account.smtpSecure === 1,
      smtpUser: account.smtpUser,
      smtpPass: '',
      fromName: account.fromName,
    })
    setTestResult(null)
    setShowAccountManager(false)
    setShowAccountDialog(true)
  }

  const openNewAccount = () => {
    setEditingAccountId(null)
    setAccountForm(emptyAccountForm)
    setTestResult(null)
    setShowAccountManager(false)
    setShowAccountDialog(true)
  }

  // --- Iframe content update ---
  const updateIframeContent = useCallback((html: string) => {
    if (!iframeRef.current) return
    const doc = iframeRef.current.contentDocument
    if (!doc) return
    doc.open()
    doc.write(`<!DOCTYPE html><html><head><style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #1e293b; margin: 12px; line-height: 1.5; word-wrap: break-word; }
      img { max-width: 100%; height: auto; }
      a { color: #3b82f6; }
      blockquote { border-left: 3px solid #cbd5e1; margin: 8px 0; padding: 4px 12px; color: #64748b; }
      pre { background: #f1f5f9; padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 13px; }
    </style></head><body>${sanitizeHtml(html)}</body></html>`)
    doc.close()
  }, [])

  useEffect(() => {
    if (selectedMessage?.html) {
      // Small delay to ensure iframe is mounted
      setTimeout(() => updateIframeContent(selectedMessage.html), 50)
    }
  }, [selectedMessage, updateIframeContent])

  // --- Filtered messages ---
  const filteredMessages = searchQuery
    ? messages.filter(m =>
        (m.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.fromName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.fromAddress || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || null
  const selectedFolder = folders.find(f => f.id === selectedFolderId) || null

  // ============================================
  // RENDER
  // ============================================

  // Empty state: no accounts
  if (!loadingAccounts && accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Mail className="h-16 w-16 text-slate-300" />
        <h2 className="text-lg font-semibold text-slate-700">{t('title')}</h2>
        <p className="text-sm text-slate-500 text-center max-w-md">
          {t('noAccountsDescription')}
        </p>
        <Button size="sm" onClick={openNewAccount}>
          <Plus className="h-4 w-4 mr-1" /> {t('addAccount')}
        </Button>

        {/* Account Dialog */}
        <AccountDialog
          open={showAccountDialog}
          onOpenChange={setShowAccountDialog}
          form={accountForm}
          setForm={setAccountForm}
          isEditing={!!editingAccountId}
          saving={savingAccount}
          testing={testingConnection}
          testResult={testResult}
          onSave={handleSaveAccount}
          onTest={handleTestConnection}
          t={t}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-slate-600" />
          <h1 className="text-base font-semibold text-slate-800">{t('title')}</h1>
          {selectedAccount && (
            <Badge variant="secondary" className="text-xs">{selectedAccount.email}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => openCompose('new')} className="text-xs h-7">
            <Plus className="h-3.5 w-3.5 mr-1" /> {t('compose')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncingMessages || !selectedAccountId} className="text-xs h-7">
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1", syncingMessages && "animate-spin")} />
            {syncingMessages ? t('syncing') : t('sync')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAccountManager(true)} className="text-xs h-7">
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Panel 1: Folders */}
        <div className="w-48 border-r bg-slate-50 flex flex-col shrink-0 overflow-hidden">
          {/* Account selector */}
          {accounts.length > 1 && (
            <div className="p-2 border-b">
              <select
                className="w-full text-xs bg-white border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                value={selectedAccountId || ''}
                onChange={e => setSelectedAccountId(Number(e.target.value))}
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {/* Folder list */}
          <div className="flex-1 overflow-y-auto py-1">
            {loadingFolders ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            ) : folders.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-slate-400 mb-2">{t('noFolders')}</p>
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleSync} disabled={syncingMessages}>
                  <RefreshCw className="h-3 w-3 mr-1" /> {t('sync')}
                </Button>
              </div>
            ) : (
              folders.map(folder => {
                const Icon = folderIcon(folder.specialUse)
                const isSelected = folder.id === selectedFolderId
                const unseen = folder.unseenMessages || 0
                return (
                  <button
                    key={folder.id}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                      isSelected ? "bg-primary/10 text-primary font-medium" : "text-slate-600 hover:bg-slate-100"
                    )}
                    onClick={() => setSelectedFolderId(folder.id)}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate flex-1">{folderDisplayName(folder, t)}</span>
                    {unseen > 0 && (
                      <span className="text-[10px] font-semibold bg-primary text-white rounded-full px-1.5 min-w-[18px] text-center">
                        {unseen}
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Panel 2: Message list */}
        <div className="w-80 border-r flex flex-col shrink-0 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                className="h-7 text-xs pl-7"
                placeholder={t('searchEmails')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Message list */}
          <div className="flex-1 overflow-y-auto">
            {loadingMessages || syncingMessages ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Inbox className="h-8 w-8 mb-2" />
                <p className="text-xs">{t('noMessagesShort')}</p>
              </div>
            ) : (
              filteredMessages.map(msg => {
                const isSelected = msg.uid === selectedMessageUid
                const isUnread = msg.seen === 0
                return (
                  <button
                    key={msg.uid}
                    className={cn(
                      "flex flex-col w-full px-3 py-2 text-left border-b transition-colors",
                      isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "border-l-2 border-l-transparent hover:bg-slate-50",
                      isUnread && "bg-blue-50/50"
                    )}
                    onClick={() => handleSelectMessage(msg)}
                  >
                    <div className="flex items-center gap-1 w-full">
                      <span className={cn("text-xs truncate flex-1", isUnread && "font-semibold text-slate-900")}>
                        {msg.fromName || msg.fromAddress || t('noSender')}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">{formatEmailDate(msg.fecha, t)}</span>
                    </div>
                    <div className="flex items-center gap-1 w-full mt-0.5">
                      <span className={cn("text-xs truncate flex-1", isUnread ? "text-slate-700" : "text-slate-500")}>
                        {msg.subject || t('noSubject')}
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {msg.hasAttachments === 1 && <Paperclip className="h-3 w-3 text-slate-400" />}
                        {msg.flagged === 1 && <Star className="h-3 w-3 text-amber-400 fill-amber-400" />}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-1.5 border-t text-xs text-slate-500 bg-slate-50">
              <span>{t('pageOf', { current: currentPage, total: totalPages })}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={currentPage <= 1} onClick={() => handlePageChange(currentPage - 1)}>
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={currentPage >= totalPages} onClick={() => handlePageChange(currentPage + 1)}>
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Panel 3: Message detail */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {loadingDetail ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : selectedMessage ? (
            <>
              {/* Message header */}
              <div className="px-4 py-3 border-b shrink-0">
                <h2 className="text-sm font-semibold text-slate-800 mb-2">{selectedMessage.subject || t('noSubject')}</h2>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs text-slate-600 space-y-0.5">
                    <p>
                      <span className="text-slate-400">{t('from')}: </span>
                      {selectedMessage.from.map((f, i) => (
                        <span key={i}>{f.name ? `${f.name} <${f.address}>` : f.address}{i < selectedMessage.from.length - 1 ? ', ' : ''}</span>
                      ))}
                    </p>
                    <p>
                      <span className="text-slate-400">{t('to')}: </span>
                      {selectedMessage.to.map((addr, i) => (
                        <span key={i}>{addr.name ? `${addr.name} <${addr.address}>` : addr.address}{i < selectedMessage.to.length - 1 ? ', ' : ''}</span>
                      ))}
                    </p>
                    {selectedMessage.cc.length > 0 && (
                      <p>
                        <span className="text-slate-400">{t('cc')}: </span>
                        {selectedMessage.cc.map((c, i) => (
                          <span key={i}>{c.name ? `${c.name} <${c.address}>` : c.address}{i < selectedMessage.cc.length - 1 ? ', ' : ''}</span>
                        ))}
                      </p>
                    )}
                    <p className="text-slate-400">{formatFullDate(selectedMessage.date)}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleToggleRead(messages.find(m => m.uid === selectedMessageUid)!)}>
                      {messages.find(m => m.uid === selectedMessageUid)?.seen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-600" onClick={() => handleDeleteMessage(selectedMessageUid!)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Message body */}
              <div className="flex-1 overflow-auto">
                {selectedMessage.html ? (
                  <iframe
                    ref={iframeRef}
                    sandbox="allow-same-origin"
                    className="w-full h-full border-0"
                    title="Email content"
                  />
                ) : (
                  <pre className="px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap font-sans">{selectedMessage.text}</pre>
                )}
              </div>

              {/* Attachments */}
              {selectedMessage.attachments.length > 0 && (
                <div className="px-4 py-2 border-t shrink-0 bg-slate-50">
                  <p className="text-xs text-slate-500 mb-1">
                    <Paperclip className="h-3 w-3 inline mr-1" />
                    {t('attachmentCount', { count: selectedMessage.attachments.length })}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedMessage.attachments.map(att => (
                      <Button
                        key={att.index}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => handleDownloadAttachment(att.index)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        {att.filename}
                        <span className="text-slate-400 ml-1">({(att.size / 1024).toFixed(0)} KB)</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="px-4 py-2 border-t shrink-0 flex gap-1">
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openCompose('reply')}>
                  <Reply className="h-3.5 w-3.5 mr-1" /> {t('reply')}
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openCompose('forward')}>
                  <Forward className="h-3.5 w-3.5 mr-1" /> {t('forward')}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-slate-400">
              <Mail className="h-12 w-12 mb-3" />
              <p className="text-sm">{t('selectMessage')}</p>
            </div>
          )}
        </div>
      </div>

      {/* --- Dialogs --- */}

      {/* Account Management Dialog */}
      <Dialog open={showAccountManager} onOpenChange={setShowAccountManager}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">{t('manageAccounts')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {accounts.map(account => (
              <div key={account.id} className="flex items-center justify-between p-2 border rounded text-sm">
                <div>
                  <p className="font-medium text-xs">{account.nombre}</p>
                  <p className="text-xs text-slate-500">{account.email}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEditAccount(account)}>
                    {t('common:edit')}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={() => setDeleteAccountId(account.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button size="sm" className="text-xs" onClick={openNewAccount}>
              <Plus className="h-3.5 w-3.5 mr-1" /> {t('addAccount')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account Add/Edit Dialog */}
      <AccountDialog
        open={showAccountDialog}
        onOpenChange={setShowAccountDialog}
        form={accountForm}
        setForm={setAccountForm}
        isEditing={!!editingAccountId}
        saving={savingAccount}
        testing={testingConnection}
        testResult={testResult}
        onSave={handleSaveAccount}
        onTest={handleTestConnection}
        t={t}
      />

      {/* Delete Account Confirmation */}
      <AlertDialog open={!!deleteAccountId} onOpenChange={open => !open && setDeleteAccountId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">{t('deleteAccount')}</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {t('deleteAccountDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8">{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction className="text-xs h-8 bg-red-600 hover:bg-red-700" onClick={handleDeleteAccount}>
              {t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Compose Dialog */}
      <Dialog open={showComposeDialog} onOpenChange={setShowComposeDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {composeData.inReplyTo ? t('reply') : composeData.subject.startsWith('Fwd:') ? t('forward') : t('newEmail')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 flex-1 overflow-y-auto">
            <div>
              <Label className="text-xs">{t('toRequired')}</Label>
              <Input className="h-8 text-xs" value={composeData.to} onChange={e => setComposeData(prev => ({ ...prev, to: e.target.value }))} placeholder={t('recipientPlaceholder')} />
            </div>
            <div>
              <Label className="text-xs">{t('cc')}</Label>
              <Input className="h-8 text-xs" value={composeData.cc} onChange={e => setComposeData(prev => ({ ...prev, cc: e.target.value }))} placeholder={t('ccPlaceholder')} />
            </div>
            <div>
              <Label className="text-xs">{t('subject')}</Label>
              <Input className="h-8 text-xs" value={composeData.subject} onChange={e => setComposeData(prev => ({ ...prev, subject: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">{t('message')}</Label>
              <Textarea
                className="text-xs min-h-[200px] resize-none"
                value={composeData.body}
                onChange={e => setComposeData(prev => ({ ...prev, body: e.target.value }))}
              />
            </div>
            {/* Attachments */}
            {composeAttachments.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">{t('attachments')}</Label>
                {composeAttachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-slate-50 rounded px-2 py-1">
                    <Paperclip className="h-3 w-3 text-slate-400" />
                    <span className="flex-1 truncate">{att.filename}</span>
                    <span className="text-slate-400">({(att.data.length / 1024).toFixed(0)} KB)</span>
                    <button onClick={() => setComposeAttachments(prev => prev.filter((_, idx) => idx !== i))}>
                      <X className="h-3 w-3 text-slate-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="flex-row justify-between">
            <Button variant="outline" size="sm" className="text-xs h-8" onClick={handleAddComposeAttachment}>
              <Paperclip className="h-3.5 w-3.5 mr-1" /> {t('attach')}
            </Button>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setShowComposeDialog(false)}>
                {t('common:cancel')}
              </Button>
              <Button size="sm" className="text-xs h-8" onClick={handleSendEmail} disabled={composeSending || !composeData.to.trim()}>
                {composeSending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                {t('send')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================
// Account Dialog Component
// ============================================

function AccountDialog({
  open, onOpenChange, form, setForm, isEditing, saving, testing, testResult, onSave, onTest, t,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  form: AccountFormData
  setForm: (v: AccountFormData) => void
  isEditing: boolean
  saving: boolean
  testing: boolean
  testResult: { success: boolean; message: string } | null
  onSave: () => void
  onTest: () => void
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">{isEditing ? t('editAccount') : t('addAccount')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{t('accountNameRequired')}</Label>
              <Input className="h-8 text-xs" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">{t('emailRequired')}</Label>
              <Input className="h-8 text-xs" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" />
            </div>
          </div>

          <div>
            <Label className="text-xs">{t('fromName')}</Label>
            <Input className="h-8 text-xs" value={form.fromName} onChange={e => setForm({ ...form, fromName: e.target.value })} />
          </div>

          {/* IMAP */}
          <div className="border rounded p-2 space-y-2">
            <p className="text-xs font-semibold text-slate-600">{t('imapReception')}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">{t('hostRequired')}</Label>
                <Input className="h-8 text-xs" value={form.imapHost} onChange={e => setForm({ ...form, imapHost: e.target.value })} placeholder="imap.gmail.com" />
              </div>
              <div>
                <Label className="text-xs">{t('port')}</Label>
                <Input className="h-8 text-xs" type="number" value={form.imapPort} onChange={e => setForm({ ...form, imapPort: parseInt(e.target.value) || 993 })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('userRequired')}</Label>
                <Input className="h-8 text-xs" value={form.imapUser} onChange={e => setForm({ ...form, imapUser: e.target.value })} placeholder="user@example.com" />
              </div>
              <div>
                <Label className="text-xs">{t('passwordRequired')}</Label>
                <Input className="h-8 text-xs" type="password" value={form.imapPass} onChange={e => setForm({ ...form, imapPass: e.target.value })} placeholder={isEditing ? t('noChanges') : ''} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.imapSecure} onCheckedChange={v => setForm({ ...form, imapSecure: v })} />
              <Label className="text-xs">{t('secure')}</Label>
            </div>
          </div>

          {/* SMTP */}
          <div className="border rounded p-2 space-y-2">
            <p className="text-xs font-semibold text-slate-600">{t('smtpSending')}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">{t('hostRequired')}</Label>
                <Input className="h-8 text-xs" value={form.smtpHost} onChange={e => setForm({ ...form, smtpHost: e.target.value })} placeholder="smtp.gmail.com" />
              </div>
              <div>
                <Label className="text-xs">{t('port')}</Label>
                <Input className="h-8 text-xs" type="number" value={form.smtpPort} onChange={e => setForm({ ...form, smtpPort: parseInt(e.target.value) || 587 })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('userRequired')}</Label>
                <Input className="h-8 text-xs" value={form.smtpUser} onChange={e => setForm({ ...form, smtpUser: e.target.value })} placeholder="user@example.com" />
              </div>
              <div>
                <Label className="text-xs">{t('passwordRequired')}</Label>
                <Input className="h-8 text-xs" type="password" value={form.smtpPass} onChange={e => setForm({ ...form, smtpPass: e.target.value })} placeholder={isEditing ? t('noChanges') : ''} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.smtpSecure} onCheckedChange={v => setForm({ ...form, smtpSecure: v })} />
              <Label className="text-xs">{t('secure')}</Label>
            </div>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={cn("flex items-center gap-2 text-xs rounded p-2", testResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
              {testResult.success ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {testResult.message}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={onTest} disabled={testing || !form.imapHost || !form.smtpHost}>
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            {t('testConnection')}
          </Button>
          <Button size="sm" className="text-xs h-8" onClick={onSave} disabled={saving || !form.nombre || !form.email || !form.imapHost || !form.smtpHost}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            {isEditing ? t('saveChanges') : t('addAccount')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
