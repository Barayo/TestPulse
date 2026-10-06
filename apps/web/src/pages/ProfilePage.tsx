import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { KeyRoundIcon, LockIcon, ChevronRightIcon, UploadIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/useAuth'
import { Avatar } from '@/components/Avatar'
import { AVATAR_PRESETS } from '@/lib/avatarPresets'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ChangePasswordForm } from '@/components/ChangePasswordForm'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { useTheme } from '@/lib/ThemeProvider'
import type { Theme } from '@/lib/theme'
import { Pill } from '@/components/ui/Pill'

const THEME_LABELS = ['System', 'Light', 'Dark'] as const
const THEME_LABEL_KEYS = {
  System: 'ProfilePage.themeSystem',
  Light: 'ProfilePage.themeLight',
  Dark: 'ProfilePage.themeDark',
} as const satisfies Record<(typeof THEME_LABELS)[number], string>

// Shared with InstanceSettingsPage.tsx's default-language picker (add-ui-i18n,
// Pepe design review) — the six locale names are identity labels, not
// per-page copy, so both surfaces read the same `Languages.*` keys rather
// than forking two copies of the same six strings.
const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'pt', 'zh'] as const
const LANGUAGE_LABEL_KEYS = {
  en: 'Languages.en',
  es: 'Languages.es',
  fr: 'Languages.fr',
  de: 'Languages.de',
  pt: 'Languages.pt',
  zh: 'Languages.zh',
} as const satisfies Record<(typeof SUPPORTED_LANGUAGES)[number], string>

// Mirrors avatarimage.MaxUploadBytes / the format allowlist on the server
// (add-custom-avatar-upload design.md) — a client-side precheck is a
// convenience that avoids a round trip, not a security boundary; the
// server re-validates regardless.
const MAX_AVATAR_UPLOAD_BYTES = 500 * 1024
const ACCEPTED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export default function ProfilePage() {
  const { t } = useTranslation()
  const { user, refreshUser, perUserLanguageEnabled } = useAuth()
  const navigate = useNavigate()
  const [, setThemeOverride, themeOverride] = useTheme()
  const [displayName, setDisplayName] = useState('')
  const [avatarKey, setAvatarKey] = useState<string | null>(null)
  const [timezone, setTimezone] = useState('')
  const [language, setLanguage] = useState<(typeof SUPPORTED_LANGUAGES)[number] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  function closeChangePasswordDialog() {
    setChangePasswordOpen(false)
  }

  useEffect(() => {
    if (!user) return
    setDisplayName(user.displayName ?? '')
    setAvatarKey(user.avatarKey ?? null)
    setTimezone(user.timezone ?? '')
    setLanguage((user.language as (typeof SUPPORTED_LANGUAGES)[number] | null | undefined) ?? null)
  }, [user])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      await api.PATCH('/api/v1/users/me', {
        body: {
          displayName: displayName || null,
          avatarKey,
          timezone: timezone || null,
          ...(perUserLanguageEnabled ? { language } : {}),
        },
      })
      await refreshUser()
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadError(null)

    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      setUploadError(t('ProfilePage.invalidFileTypeError', { fileName: file.name }))
      return
    }
    if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
      setUploadError(t('ProfilePage.fileTooLargeError', { fileName: file.name, sizeKb: (file.size / 1024).toFixed(0) }))
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)
      // openapi-fetch's generated body type expects the schema's object
      // shape, not a FormData instance — use fetch directly for this one
      // multipart request (openapi-fetch passes FormData through
      // unchanged at runtime, but its types don't model that).
      const res = await fetch('/api/v1/users/me/avatar', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      if (!res.ok) {
        setUploadError(t('ProfilePage.uploadFailedError'))
        return
      }
      const updated = await res.json()
      setAvatarKey(updated.avatarKey ?? null)
      await refreshUser()
    } finally {
      setUploading(false)
    }
  }

  async function handleRemoveAvatar() {
    setUploading(true)
    try {
      const { data, response } = await api.DELETE('/api/v1/users/me/avatar', {})
      if (response.ok && data) {
        setAvatarKey(data.avatarKey ?? null)
        await refreshUser()
      }
    } finally {
      setUploading(false)
    }
  }

  if (!user) return null

  return (
    <div className="max-w-2xl space-y-4">
      <Breadcrumbs segments={[{ label: t('ProfilePage.heading') }]} />
      <h1 className="tp-heading text-xl">{t('ProfilePage.heading')}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">{t('ProfilePage.yourDetailsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar
                seed={displayName || user.email}
                avatarKey={avatarKey}
                userId={user.id}
                className="size-12 rounded-full text-base"
              />
              <div className="flex-1 space-y-1">
                <Label htmlFor="display-name">{t('ProfilePage.displayNameLabel')}</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={user.email}
                />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t('ProfilePage.avatarLegend')}</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('ProfilePage.avatarLegend')}>
                <label className="flex flex-col items-center gap-1" title={t('ProfilePage.generatedDefaultLabel')}>
                  <input
                    type="radio"
                    name="avatar"
                    className="sr-only"
                    checked={avatarKey === null}
                    onChange={() => setAvatarKey(null)}
                    aria-label={t('ProfilePage.generatedDefaultLabel')}
                  />
                  <span
                    className={`flex size-10 items-center justify-center rounded-full border-2 text-xs font-bold ${
                      avatarKey === null ? 'border-primary' : 'border-transparent'
                    }`}
                    style={{ background: 'var(--muted)' }}
                    aria-hidden="true"
                  >
                    {(displayName || user.email)[0]?.toUpperCase() ?? '?'}
                  </span>
                </label>
                {avatarKey === 'custom' ? (
                  <label className="flex flex-col items-center gap-1" title={t('ProfilePage.uploadedPhotoLabel')}>
                    <input
                      type="radio"
                      name="avatar"
                      className="sr-only"
                      checked
                      onChange={() => setAvatarKey('custom')}
                      aria-label={t('ProfilePage.uploadedPhotoLabel')}
                    />
                    <Avatar
                      seed={displayName || user.email}
                      avatarKey="custom"
                      userId={user.id}
                      className="size-10 rounded-full border-2 border-primary text-xs"
                    />
                  </label>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    title={t('ProfilePage.uploadPhotoLabel')}
                    aria-label={t('ProfilePage.uploadPhotoLabel')}
                    className="flex size-10 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed"
                  >
                    {uploading ? (
                      <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <UploadIcon className="size-4" aria-hidden="true" />
                    )}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_AVATAR_TYPES.join(',')}
                  className="sr-only"
                  onChange={handleAvatarFileSelected}
                />
                {AVATAR_PRESETS.map((preset) => (
                  <label key={preset.key} className="flex flex-col items-center gap-1" title={preset.name}>
                    <input
                      type="radio"
                      name="avatar"
                      className="sr-only"
                      checked={avatarKey === preset.key}
                      onChange={() => setAvatarKey(preset.key)}
                      aria-label={preset.name}
                    />
                    <Avatar
                      seed={preset.name}
                      avatarKey={preset.key}
                      className={`size-10 rounded-full border-2 ${
                        avatarKey === preset.key ? 'border-primary' : 'border-transparent'
                      }`}
                    />
                  </label>
                ))}
              </div>
              {uploadError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5"
                >
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">{t('ProfilePage.uploadFailedTitle')}</p>
                    <p className="text-sm text-muted-foreground">{uploadError}</p>
                  </div>
                </div>
              )}
              {avatarKey === 'custom' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span>{t('ProfilePage.usingUploadedPhotoNote')}</span>
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={uploading}
                    className="font-medium text-foreground underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {t('ProfilePage.removeButton')}
                  </button>
                </div>
              )}
            </fieldset>

            <div className="space-y-1">
              <Label htmlFor="timezone">{t('ProfilePage.timezoneLabel')}</Label>
              <Input
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder={t('ProfilePage.timezonePlaceholder')}
              />
            </div>

            {perUserLanguageEnabled && (
              <div className="space-y-1">
                <Label>{t('ProfilePage.languageLabel')}</Label>
                <p className="text-xs text-muted-foreground">{t('ProfilePage.languageDescription')}</p>
                <div role="group" aria-label={t('ProfilePage.languageLabel')} className="flex flex-wrap gap-2">
                  <Pill active={language === null} onClick={() => setLanguage(null)}>
                    {t('ProfilePage.languageInstanceDefaultOption')}
                  </Pill>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <Pill key={lang} active={language === lang} onClick={() => setLanguage(lang)}>
                      {t(LANGUAGE_LABEL_KEYS[lang])}
                    </Pill>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? t('ProfilePage.saving') : t('ProfilePage.save')}
              </Button>
              {saved && <span className="text-sm text-muted-foreground">{t('ProfilePage.savedLabel')}</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">{t('ProfilePage.appearanceTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{t('ProfilePage.themeLabel')}</p>
              <p className="text-xs text-muted-foreground">
                {t('ProfilePage.themeDescription')}
              </p>
            </div>
            <div role="group" aria-label={t('ProfilePage.themeLabel')} className="flex gap-0.5 rounded-full bg-muted p-1">
              {THEME_LABELS.map((label) => {
                const value: Theme | null = label === 'System' ? null : (label.toLowerCase() as Theme)
                const active = themeOverride === value
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setThemeOverride(value)}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                      active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t(THEME_LABEL_KEYS[label])}
                  </button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">{t('ProfilePage.accountTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="rounded-lg border">
            <li className="border-b last:border-b-0">
              <Link
                to="/settings/tokens"
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <KeyRoundIcon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t('ProfilePage.apiTokensLabel')}</span>
                  <span className="block text-xs text-muted-foreground">{t('ProfilePage.manageTokensDescription')}</span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
            <li className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => setChangePasswordOpen(true)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <LockIcon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t('ProfilePage.changePasswordLabel')}</span>
                  <span className="block text-xs text-muted-foreground">{t('ProfilePage.setNewPasswordDescription')}</span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Dialog open={changePasswordOpen} onOpenChange={(open) => !open && closeChangePasswordDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t('ProfilePage.changePasswordLabel')}</DialogTitle>
          <ChangePasswordForm
            onSuccess={() => navigate('/login', { replace: true, state: { passwordReset: true } })}
            onCancel={closeChangePasswordDialog}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
