import { useTranslation } from "react-i18next"
import { Calendar, Sparkles, Tag } from "lucide-react"
import type { Release } from "./types"
import { renderReleaseBody } from "./markdown"

interface Props {
  releases: Release[]
  loading: boolean
  currentVersion: string
}

export function ChangelogPanel({ releases, loading, currentVersion }: Props) {
  const { t } = useTranslation(['auth'])

  return (
    <div className="rounded-lg border border-hairline bg-surface-2 overflow-hidden">
      <div className="px-4 py-3 border-b border-hairline flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand" />
        <h2 className="text-[13px] font-semibold text-foreground">
          {t('empresaSelector.changelog', { defaultValue: 'Novedades' })}
        </h2>
        {currentVersion && (
          <span className="ml-auto text-[11px] font-mono bg-surface-3 text-muted-foreground rounded-full px-2 py-0.5">
            v{currentVersion}
          </span>
        )}
      </div>

      <div className="max-h-[70vh] overflow-y-auto scrollbar-hide">
        {loading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-3 w-24 bg-surface-3 rounded" />
                <div className="h-2 w-full bg-surface-3/60 rounded" />
                <div className="h-2 w-3/4 bg-surface-3/60 rounded" />
              </div>
            ))}
          </div>
        ) : releases.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-[13px]">
            {t('empresaSelector.noReleases', { defaultValue: 'No hay novedades disponibles' })}
          </div>
        ) : (
          <div className="divide-y divide-hairline">
            {releases.map((release, idx) => {
              const isCurrent = currentVersion && release.tag === `v${currentVersion}`
              return (
                <div key={release.tag} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Tag className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[13px] font-medium text-foreground">{release.tag}</span>
                    {release.prerelease && (
                      <span className="text-[11px] bg-warning/20 text-warning rounded px-1.5 py-0.5 leading-none">
                        pre
                      </span>
                    )}
                    {isCurrent && idx === 0 && (
                      <span className="text-[11px] bg-success/15 text-success rounded px-1.5 py-0.5 leading-none">
                        {t('empresaSelector.currentVersion', { defaultValue: 'instalada' })}
                      </span>
                    )}
                  </div>
                  {release.name && release.name !== release.tag && (
                    <p className="text-[13px] font-medium text-foreground mb-1">{release.name}</p>
                  )}
                  {release.body && (
                    <div className="leading-relaxed space-y-0.5">{renderReleaseBody(release.body)}</div>
                  )}
                  {release.date && (
                    <div className="flex items-center gap-1 mt-2">
                      <Calendar className="h-3 w-3 text-muted-foreground/60" />
                      <span className="text-[11px] text-muted-foreground/80">
                        {new Date(release.date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
