// Not a runtime test — a compile-time regression test for the typed
// translation-key mechanism (add-ui-i18n design.md D1). `tsc -b` runs this
// on every typecheck; if the `react-i18next` module augmentation in
// `./index.ts` ever stops working, the `@ts-expect-error` below becomes
// unused (a real TS error on its own), so this file fails loudly instead
// of silently accepting any string as a valid translation key.
import { useTranslation } from "react-i18next";

function TypecheckFixture() {
  const { t } = useTranslation();
  // @ts-expect-error - "this.key.does.not.exist" is not a real translation key
  t("this.key.does.not.exist");
  t("i18nTypecheck.placeholder");
}

void TypecheckFixture;
