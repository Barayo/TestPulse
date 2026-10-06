import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2Icon } from 'lucide-react'
import { api } from '@/lib/api'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import type { components } from '@testpulse/shared/api'

type InstanceSettings = components['schemas']['InstanceSettings']
type Team = components['schemas']['Team']
type OIDCTeamMapping = components['schemas']['OIDCTeamMapping']

// Instance-wide, Tenant-Admin-only SSO configuration (add-sso-oidc) — a
// card on InstanceSettingsPage, alongside Public project access/Run
// retention/Color theme. Saving validates the issuer via live discovery
// before persisting (design.md D8); the client secret is write-only and
// never rendered back once set.
export function SSOSettingsCard({
  settings,
  onSettingsChange,
}: {
  settings: InstanceSettings
  onSettingsChange: (settings: InstanceSettings) => void
}) {
  const { t } = useTranslation()
  const [issuer, setIssuer] = useState(settings.oidcIssuer ?? '')
  const [clientId, setClientId] = useState(settings.oidcClientId ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [groupClaim, setGroupClaim] = useState(settings.oidcGroupClaim ?? '')
  const [adminClaimValues, setAdminClaimValues] = useState((settings.oidcAdminClaimValues ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [disableOpen, setDisableOpen] = useState(false)

  const ssoConfigured = Boolean(settings.oidcIssuer) && Boolean(settings.oidcClientId) && settings.oidcClientSecretSet

  async function save() {
    setSaving(true)
    setError(undefined)
    const { data, error: err } = await api.PATCH('/api/v1/instance-settings', {
      body: {
        oidcIssuer: issuer,
        oidcClientId: clientId,
        ...(clientSecret ? { oidcClientSecret: clientSecret } : {}),
        oidcGroupClaim: groupClaim,
        oidcAdminClaimValues: adminClaimValues
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      },
    })
    setSaving(false)
    if (err) {
      setError((err as { error?: string }).error ?? t('SSOSettingsCard.saveError'))
      return
    }
    if (data) {
      setClientSecret('')
      onSettingsChange(data)
    }
  }

  async function toggleSSOOnly(next: boolean) {
    const { data } = await api.PATCH('/api/v1/instance-settings', { body: { oidcOnly: next } })
    if (data) onSettingsChange(data)
  }

  async function confirmDisable() {
    const { data } = await api.PATCH('/api/v1/instance-settings', { body: { disableSso: true } })
    setDisableOpen(false)
    if (data) {
      setIssuer('')
      setClientId('')
      setGroupClaim('')
      setAdminClaimValues('')
      onSettingsChange(data)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('SSOSettingsCard.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('SSOSettingsCard.description')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="sso-issuer">{t('SSOSettingsCard.issuerUrlLabel')}</Label>
            <Input id="sso-issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder={t('SSOSettingsCard.issuerUrlPlaceholder')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sso-client-id">{t('SSOSettingsCard.clientIdLabel')}</Label>
            <Input id="sso-client-id" value={clientId} onChange={(e) => setClientId(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sso-client-secret">{t('SSOSettingsCard.clientSecretLabel')}</Label>
            <Input
              id="sso-client-secret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={settings.oidcClientSecretSet ? t('SSOSettingsCard.clientSecretPlaceholder') : undefined}
            />
            {settings.oidcClientSecretSet && !clientSecret && (
              <p className="text-xs text-muted-foreground">{t('SSOSettingsCard.clientSecretConfiguredNote')}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="sso-group-claim">{t('SSOSettingsCard.groupClaimLabel')}</Label>
            <Input id="sso-group-claim" value={groupClaim} onChange={(e) => setGroupClaim(e.target.value)} placeholder={t('SSOSettingsCard.groupClaimPlaceholder')} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="sso-admin-values">{t('SSOSettingsCard.adminClaimValuesLabel')}</Label>
            <Input
              id="sso-admin-values"
              value={adminClaimValues}
              onChange={(e) => setAdminClaimValues(e.target.value)}
              placeholder={t('SSOSettingsCard.adminClaimValuesPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">
              {t('SSOSettingsCard.adminClaimValuesNote')}
            </p>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-2">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? t('SSOSettingsCard.saving') : t('SSOSettingsCard.save')}
          </Button>
          {ssoConfigured && (
            <Button variant="outline" onClick={() => setDisableOpen(true)}>
              {t('SSOSettingsCard.disableSsoButton')}
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t pt-4">
          <div>
            <span className="text-sm font-medium">{t('SSOSettingsCard.ssoOnlyLabel')}</span>
            <p className="text-xs text-muted-foreground">
              {t('SSOSettingsCard.ssoOnlyDescription')}
            </p>
          </div>
          <Switch
            aria-label={t('SSOSettingsCard.ssoOnlyLabel')}
            checked={settings.oidcOnly}
            disabled={!ssoConfigured}
            onCheckedChange={(next) => void toggleSSOOnly(next)}
          />
        </div>

        <OIDCTeamMappings />
      </CardContent>

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t('SSOSettingsCard.disableDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('SSOSettingsCard.disableDialogDescription')}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>
              {t('SSOSettingsCard.cancelButton')}
            </Button>
            <Button variant="destructive" onClick={() => void confirmDisable()}>
              {t('SSOSettingsCard.confirmButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// OIDCTeamMappings lets a Tenant Admin declare {claim value, Team} pairs
// (design.md D10) — on every OIDC login, a user whose group claim includes
// the value is added to that Team, additive only.
function OIDCTeamMappings() {
  const { t } = useTranslation()
  const [teams, setTeams] = useState<Team[]>([])
  const [teamsTruncated, setTeamsTruncated] = useState(false)
  const [mappings, setMappings] = useState<OIDCTeamMapping[]>([])
  const [claimValue, setClaimValue] = useState('')
  const [teamId, setTeamId] = useState('')

  useEffect(() => {
    void fetchAllPages((cursor) =>
      api.GET('/api/v1/teams', { params: { query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
    ).then(({ items, truncated }) => {
      setTeams(items)
      setTeamsTruncated(truncated)
    })
    void api.GET('/api/v1/sso/team-mappings').then(({ data }) => data && setMappings(data))
  }, [])

  function teamName(id: string) {
    return teams.find((team) => team.id === id)?.name ?? id
  }

  async function addMapping() {
    if (!claimValue || !teamId) return
    const { data } = await api.POST('/api/v1/sso/team-mappings', { body: { claimValue, teamId } })
    if (data) {
      setMappings((prev) => [...prev, data])
      setClaimValue('')
      setTeamId('')
    }
  }

  async function removeMapping(id: string) {
    await api.DELETE('/api/v1/sso/team-mappings/{mappingId}', { params: { path: { mappingId: id } } })
    setMappings((prev) => prev.filter((m) => m.id !== id))
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <span className="text-sm font-medium">{t('SSOSettingsCard.claimTeamMappingLabel')}</span>
        <p className="text-xs text-muted-foreground">
          {t('SSOSettingsCard.claimTeamMappingDescription')}
        </p>
      </div>
      {mappings.length > 0 && (
        <ul className="space-y-1">
          {mappings.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm">
              <span>
                <span className="font-medium">{m.claimValue}</span>
                <span className="text-muted-foreground"> → {teamName(m.teamId)}</span>
              </span>
              <Button variant="ghost" size="icon" aria-label={t('SSOSettingsCard.removeMappingAriaLabel')} onClick={() => void removeMapping(m.id)}>
                <Trash2Icon className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="sso-mapping-claim-value">{t('SSOSettingsCard.mappingClaimValueLabel')}</Label>
          <Input id="sso-mapping-claim-value" value={claimValue} onChange={(e) => setClaimValue(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sso-mapping-team">{t('SSOSettingsCard.teamLabel')}</Label>
          <select
            id="sso-mapping-team"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="">{t('SSOSettingsCard.noTeamOption')}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          {teamsTruncated && (
            <p className="text-xs text-muted-foreground">{t('SSOSettingsCard.teamsTruncatedNote')}</p>
          )}
        </div>
        <Button variant="outline" onClick={() => void addMapping()} disabled={!claimValue || !teamId}>
          {t('SSOSettingsCard.addMappingButton')}
        </Button>
      </div>
    </div>
  )
}
