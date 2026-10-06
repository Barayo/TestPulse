// Resolution order for a visitor's active UI language (add-ui-i18n
// design.md D4): the instance default always wins unless per-user
// customization is enabled AND the visitor has a personal language set.
// An anonymous visitor has no personal language to check, so they always
// see the instance default.
export function resolveLanguage(input: {
  perUserLanguageEnabled: boolean
  defaultLanguage: string
  userLanguage: string | null | undefined
}): string {
  if (input.perUserLanguageEnabled && input.userLanguage) {
    return input.userLanguage
  }
  return input.defaultLanguage
}
