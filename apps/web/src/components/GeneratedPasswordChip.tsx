import { useState } from 'react'
import { CopyIcon, CheckIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

// Shared "here's a secret, shown once — copy it" chip (add-change-own-password
// extraction) — used by the New-user form and Edit-user dialog's Generate
// action, ResetPasswordPage's Generate action, and the admin
// temporary-password fallback. Matches TokensPage's identical idiom for a
// newly-created API token.
export function GeneratedPasswordChip({ value }: { value: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
  }
  return (
    <div className="flex items-center gap-2">
      <code className="block flex-1 rounded bg-muted p-1.5 text-xs break-all">{value}</code>
      <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
        {copied ? (
          <>
            <CheckIcon className="size-3.5" aria-hidden="true" />
            {t('GeneratedPasswordChip.copiedLabel')}
          </>
        ) : (
          <>
            <CopyIcon className="size-3.5" aria-hidden="true" />
            {t('GeneratedPasswordChip.copyLabel')}
          </>
        )}
      </Button>
    </div>
  )
}
