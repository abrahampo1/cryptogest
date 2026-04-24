import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { translateError } from "@/lib/formatting"
import { Button } from "@/components/ui/button"
import { Building2, Cloud, Loader2, Plus } from "lucide-react"
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
import { EmpresaCard } from "@/components/empresa-selector/EmpresaCard"
import { CloudPendingCard } from "@/components/empresa-selector/CloudPendingCard"
import { CreateEmpresaWizard } from "@/components/empresa-selector/CreateEmpresaWizard"
import { JoinCloudPanel } from "@/components/empresa-selector/JoinCloudPanel"
import { CloudSessionHeader } from "@/components/empresa-selector/CloudSessionHeader"
import { ChangelogPanel } from "@/components/empresa-selector/ChangelogPanel"
import { CloudLoginScreen } from "@/components/empresa-selector/CloudLoginScreen"
import type {
  CloudEmpresaInfo,
  CloudSession,
  EmpresaInfo,
  LocationMode,
  Release,
} from "@/components/empresa-selector/types"

interface EmpresaSelectorPageProps {
  empresas: EmpresaInfo[]
  ultimaEmpresaId: string | null
  onSelect: (id: string) => void
  onCreated: () => void
  deepLinkResult?: { success: boolean; user?: any; server?: string } | null
  onDeepLinkHandled?: () => void
  cloudSession: CloudSession | null
  onCloudSessionChange: (session: CloudSession | null) => void
  pendingInviteCode?: string | null
  onInviteCodeHandled?: () => void
}

export function EmpresaSelectorPage({
  empresas,
  ultimaEmpresaId,
  onSelect,
  onCreated,
  deepLinkResult,
  onDeepLinkHandled,
  cloudSession,
  onCloudSessionChange,
  pendingInviteCode,
  onInviteCodeHandled,
}: EmpresaSelectorPageProps) {
  const { t, i18n } = useTranslation(['auth', 'common'])

  // Edit / delete
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<EmpresaInfo | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Creation + joining
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [joinPassphrase, setJoinPassphrase] = useState('')

  // Cloud fullscreen login
  const [showCloudLogin, setShowCloudLogin] = useState(false)

  // Subscription upgrade
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState('')
  const [upgradeTargetPlan, setUpgradeTargetPlan] = useState('')
  const [upgradeHasSubscription, setUpgradeHasSubscription] = useState(false)
  const [isPollingSubscription, setIsPollingSubscription] = useState(false)
  const [upgradeSuccess, setUpgradeSuccess] = useState('')

  // Cloud data
  const [cloudEmpresas, setCloudEmpresas] = useState<CloudEmpresaInfo[]>([])
  const [loadingCloudEmpresas, setLoadingCloudEmpresas] = useState(false)
  const [joiningEmpresaId, setJoiningEmpresaId] = useState<number | null>(null)
  const [addPassphrase, setAddPassphrase] = useState('')

  // Releases
  const [releases, setReleases] = useState<Release[]>([])
  const [releasesLoading, setReleasesLoading] = useState(true)
  const [currentVersion, setCurrentVersion] = useState('')

  // Deep-link: cloud connected via browser
  useEffect(() => {
    if (deepLinkResult?.success) {
      setShowCloudLogin(false)
      window.electronAPI?.cloudSession.get().then((result) => {
        if (result?.success && result.data) onCloudSessionChange(result.data)
      })
      onDeepLinkHandled?.()
    }
  }, [deepLinkResult, onDeepLinkHandled, onCloudSessionChange])

  // Deep-link: invite code
  useEffect(() => {
    if (pendingInviteCode) {
      setIsJoining(true)
      setJoinCode(pendingInviteCode)
      onInviteCodeHandled?.()
    }
  }, [pendingInviteCode, onInviteCodeHandled])

  const fetchCloudEmpresas = useCallback(async () => {
    if (!cloudSession) {
      setCloudEmpresas([])
      return
    }
    setLoadingCloudEmpresas(true)
    try {
      const result = await window.electronAPI?.empresa.listCloud()
      if (result?.success && result.data) setCloudEmpresas(result.data)
    } catch {
      // silent
    } finally {
      setLoadingCloudEmpresas(false)
    }
  }, [cloudSession])

  useEffect(() => {
    fetchCloudEmpresas()
  }, [fetchCloudEmpresas])

  useEffect(() => {
    window.electronAPI?.updater.getVersion().then((r) => {
      if (r?.success && r.data) setCurrentVersion(r.data)
    })
    setReleasesLoading(true)
    window.electronAPI?.updater.getReleases(i18n.language).then((r) => {
      if (r?.success && r.data) setReleases(r.data)
    }).finally(() => setReleasesLoading(false))
  }, [i18n.language])

  const handleCloudLogout = async () => {
    await window.electronAPI?.cloudSession.logout()
    onCloudSessionChange(null)
    setCloudEmpresas([])
  }

  const handleCreate = async (args: {
    nombre: string
    mode: LocationMode
    customPath?: string
    cloudPassphrase?: string
  }) => {
    setIsSubmitting(true)
    setError(null)
    try {
      if (args.mode === 'cloud') {
        if (!cloudSession) {
          setError(t('empresaSelector.cloudNotConnected', 'Connect to cloud first'))
          setIsSubmitting(false)
          return
        }
        const result = await window.electronAPI?.empresa.create({
          nombre: args.nombre,
          tipo: 'cloud',
          passphrase: args.cloudPassphrase!,
        })
        if (result?.success) {
          setIsCreating(false)
          onCreated()
          fetchCloudEmpresas()
        } else if ((result as any)?.upgrade_required) {
          const hasSubscription = (result as any)?.has_subscription ?? false
          setUpgradeHasSubscription(hasSubscription)
          setUpgradeTargetPlan((result as any)?.target_plan || 'pro')
          setUpgradeMessage(
            hasSubscription
              ? t('empresaSelector.upgradeRequiredLimit')
              : t('empresaSelector.upgradeRequiredFree')
          )
          setShowUpgradeDialog(true)
        } else {
          setError(result?.error ? translateError(result.error) : t('empresaSelector.errorCreating'))
        }
      } else {
        const result = await window.electronAPI?.empresa.create({
          nombre: args.nombre,
          ...(args.customPath ? { customDataPath: args.customPath } : {}),
        })
        if (result?.success) {
          setIsCreating(false)
          onCreated()
        } else {
          setError(result?.error ? translateError(result.error) : t('empresaSelector.errorCreating'))
        }
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubscriptionCheckout = async () => {
    setShowUpgradeDialog(false)
    setError(null)
    try {
      const result = await window.electronAPI?.cloud.subscriptionCheckout(upgradeTargetPlan)
      if (result?.success) {
        if (result.data?.upgraded) {
          setUpgradeSuccess(t('empresaSelector.planUpgraded'))
          setTimeout(() => setUpgradeSuccess(''), 5000)
        } else if (result.data?.checkout_url) {
          setIsPollingSubscription(true)
        }
      } else {
        setError(result?.error || t('empresaSelector.errorCreating'))
      }
    } catch (err) {
      setError(String(err))
    }
  }

  useEffect(() => {
    if (!isPollingSubscription) return
    const interval = setInterval(async () => {
      try {
        const result = await window.electronAPI?.cloud.planCheck()
        if (result?.success && result.data?.plan) {
          const plan = result.data.plan
          if (plan.slug !== 'free' && plan.max_empresas !== 0) {
            setIsPollingSubscription(false)
            setUpgradeSuccess(t('empresaSelector.subscriptionActivated'))
            setTimeout(() => setUpgradeSuccess(''), 5000)
          }
        }
      } catch {
        // silent
      }
    }, 4000)
    const timeout = setTimeout(() => setIsPollingSubscription(false), 600000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [isPollingSubscription, t])

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
        setError(result?.error ? translateError(result.error) : t('empresaSelector.errorDeleting'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }

  const handleJoinCloud = async () => {
    if (!joinCode.trim() || !joinPassphrase) return
    if (!cloudSession) {
      setError(t('empresaSelector.cloudNotConnected', 'Connect to cloud first'))
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await window.electronAPI?.empresa.joinCloud({
        code: joinCode.trim(),
        passphrase: joinPassphrase,
      })
      if (result?.success) {
        setIsJoining(false)
        setJoinCode('')
        setJoinPassphrase('')
        onCreated()
        fetchCloudEmpresas()
      } else {
        setError(result?.error ? translateError(result.error) : t('empresaSelector.errorCreating'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddCloudLocal = async (cloudEmpresa: CloudEmpresaInfo) => {
    if (!addPassphrase) return
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await window.electronAPI?.empresa.addCloudLocal({
        empresaId: cloudEmpresa.id,
        salt: cloudEmpresa.salt,
        verificationHash: cloudEmpresa.verification_hash,
        role: cloudEmpresa.role,
        passphrase: addPassphrase,
      })
      if (result?.success) {
        setJoiningEmpresaId(null)
        setAddPassphrase('')
        onCreated()
      } else {
        setError(result?.error ? translateError(result.error) : t('empresaSelector.errorCreating'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const getLocalEmpresa = (cloudEmpresaId: number): EmpresaInfo | undefined =>
    empresas.find((e) => e.tipo === 'cloud' && e.cloudConfig?.empresaId === cloudEmpresaId)

  const localEmpresas = empresas.filter((e) => e.tipo !== 'cloud')
  const hasCloudSection = !!cloudSession

  // Fullscreen login branch
  if (showCloudLogin) {
    return (
      <CloudLoginScreen
        onConnected={(session) => {
          setShowCloudLogin(false)
          onCloudSessionChange(session)
        }}
        onBack={() => setShowCloudLogin(false)}
      />
    )
  }

  const cardProps = {
    editingId,
    editName,
    onEditNameChange: setEditName,
    onStartEdit: (e: EmpresaInfo) => {
      setEditingId(e.id)
      setEditName(e.nombre)
    },
    onCancelEdit: () => setEditingId(null),
    onCommitEdit: handleRename,
    onDelete: (e: EmpresaInfo) => setDeleteTarget(e),
    onSelect,
  }

  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center p-6">
      <div className="w-full max-w-5xl grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        {/* Left column */}
        <div className="w-full max-w-[560px] justify-self-center lg:justify-self-start lg:max-w-none">
          {/* Hero */}
          <div className="mb-6 animate-slide-up-fade">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <img src="./assets/logo.png" alt="CryptoGest" className="h-8 w-8" />
                <h1 className="text-[28px] font-semibold text-foreground tracking-tight">CryptoGest</h1>
              </div>
              {currentVersion && (
                <span className="text-[11px] font-mono bg-surface-2 border border-hairline text-muted-foreground rounded-full px-2 py-0.5">
                  v{currentVersion}
                </span>
              )}
            </div>
            <p className="text-[15px] text-muted-foreground">
              {t('empresaSelector.selectCompany')}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-[13px] animate-slide-up-fade"
            >
              {error}
            </div>
          )}

          {/* Local section */}
          {(localEmpresas.length > 0 || !hasCloudSection) && (
            <div className="mb-4">
              {hasCloudSection && localEmpresas.length > 0 && (
                <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {t('empresaSelector.localSection')}
                </h2>
              )}
              <div className="space-y-2">
                {localEmpresas.map((empresa, idx) => (
                  <div
                    key={empresa.id}
                    className="animate-slide-up-fade"
                    style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
                  >
                    <EmpresaCard
                      empresa={empresa}
                      isLast={empresa.id === ultimaEmpresaId}
                      {...cardProps}
                    />
                  </div>
                ))}

                {empresas.length === 0 && !isCreating && !hasCloudSection && (
                  <div className="text-center py-12 text-muted-foreground animate-slide-up-fade">
                    <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-[13px]">{t('empresaSelector.noCompanies')}</p>
                    <p className="text-[11px] mt-1">{t('empresaSelector.createFirstCompany')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cloud section */}
          {hasCloudSection && (
            <div className="mb-4 animate-slide-up-fade">
              <CloudSessionHeader session={cloudSession!} onLogout={handleCloudLogout} />
              <div className="space-y-2">
                {loadingCloudEmpresas ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-[13px]">
                      {t('empresaSelector.loadingCloudEmpresas')}
                    </span>
                  </div>
                ) : cloudEmpresas.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Cloud className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p className="text-[13px]">{t('empresaSelector.noCloudEmpresas')}</p>
                  </div>
                ) : (
                  cloudEmpresas.map((ce, idx) => {
                    const localEmpresa = getLocalEmpresa(ce.id)
                    if (localEmpresa) {
                      return (
                        <div
                          key={localEmpresa.id}
                          className="animate-slide-up-fade"
                          style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
                        >
                          <EmpresaCard
                            empresa={localEmpresa}
                            isLast={localEmpresa.id === ultimaEmpresaId}
                            {...cardProps}
                          />
                        </div>
                      )
                    }
                    return (
                      <div
                        key={ce.id}
                        className="animate-slide-up-fade"
                        style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
                      >
                        <CloudPendingCard
                          cloudEmpresa={ce}
                          isExpanded={joiningEmpresaId === ce.id}
                          passphrase={addPassphrase}
                          isSubmitting={isSubmitting}
                          onToggle={() => {
                            if (joiningEmpresaId === ce.id) {
                              setJoiningEmpresaId(null)
                              setAddPassphrase('')
                            } else {
                              setJoiningEmpresaId(ce.id)
                              setAddPassphrase('')
                              setError(null)
                            }
                          }}
                          onPassphraseChange={setAddPassphrase}
                          onAdd={() => handleAddCloudLocal(ce)}
                          onCancel={() => {
                            setJoiningEmpresaId(null)
                            setAddPassphrase('')
                          }}
                        />
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* Primary actions */}
          {isCreating ? (
            <CreateEmpresaWizard
              cloudSession={cloudSession}
              onCloudSessionChange={onCloudSessionChange}
              isSubmitting={isSubmitting}
              error={error}
              onCreate={handleCreate}
              onCancel={() => {
                setIsCreating(false)
                setError(null)
              }}
              onErrorClear={() => setError(null)}
            />
          ) : isJoining ? (
            <JoinCloudPanel
              cloudSession={cloudSession}
              onCloudSessionChange={onCloudSessionChange}
              code={joinCode}
              passphrase={joinPassphrase}
              isSubmitting={isSubmitting}
              onCodeChange={setJoinCode}
              onPassphraseChange={setJoinPassphrase}
              onSubmit={handleJoinCloud}
              onCancel={() => {
                setIsJoining(false)
                setJoinCode('')
                setJoinPassphrase('')
              }}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="h-10 text-[13px]"
                  onClick={() => {
                    setIsCreating(true)
                    setError(null)
                  }}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  {t('empresaSelector.createNewCompany')}
                </Button>
                <Button
                  variant="outline"
                  className="h-10 text-[13px] border-hairline"
                  onClick={() => {
                    setIsJoining(true)
                    setError(null)
                  }}
                >
                  <Cloud className="h-4 w-4 mr-1.5" />
                  {t('empresaSelector.joinCloud')}
                </Button>
              </div>
              {!cloudSession && (
                <button
                  onClick={() => setShowCloudLogin(true)}
                  className="w-full mt-3 flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground hover:text-primary transition-colors duration-150 py-2"
                >
                  <Cloud className="h-3.5 w-3.5" />
                  {t('empresaSelector.cloudLogin')}
                </button>
              )}
            </>
          )}

          {/* Upgrade dialog */}
          <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('empresaSelector.upgradeRequired')}</AlertDialogTitle>
                <AlertDialogDescription>{upgradeMessage}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleSubscriptionCheckout}>
                  {upgradeHasSubscription
                    ? t('empresaSelector.upgradePlan')
                    : t('empresaSelector.subscribePlan')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {isPollingSubscription && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-surface-2 border border-hairline rounded-lg p-6 max-w-sm mx-4 text-center space-y-3 shadow-xl">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="font-medium text-[13px]">{t('empresaSelector.waitingSubscription')}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t('empresaSelector.completePaymentInBrowser')}
                </p>
                <Button variant="ghost" size="sm" onClick={() => setIsPollingSubscription(false)}>
                  {t('empresaSelector.cancelWait')}
                </Button>
              </div>
            </div>
          )}

          {upgradeSuccess && (
            <div className="fixed bottom-4 right-4 z-50 bg-success text-success-foreground px-4 py-2.5 rounded-md shadow-lg text-[13px] font-medium flex items-center gap-2">
              {upgradeSuccess}
            </div>
          )}

          <AlertDialog
            open={!!deleteTarget}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('empresaSelector.deleteCompany')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteTarget && (
                    <span
                      dangerouslySetInnerHTML={{
                        __html: t('empresaSelector.deleteCompanyConfirm', {
                          name: deleteTarget.nombre,
                        }),
                      }}
                    />
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>{t('common:cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  {t('common:delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Right column — changelog */}
        <div className="hidden lg:block sticky top-6 animate-slide-up-fade">
          <ChangelogPanel
            releases={releases}
            loading={releasesLoading}
            currentVersion={currentVersion}
          />
        </div>
      </div>
    </div>
  )
}
