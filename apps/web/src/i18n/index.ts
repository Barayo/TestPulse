import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en/translation.json";
import es from "@/locales/es/translation.json";
import fr from "@/locales/fr/translation.json";
import de from "@/locales/de/translation.json";
import pt from "@/locales/pt/translation.json";
import zh from "@/locales/zh/translation.json";

export const SUPPORTED_LANGUAGES = ["en", "es", "fr", "de", "pt", "zh"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

void i18next.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: {
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
    pt: { translation: pt },
    zh: { translation: zh },
  },
  interpolation: { escapeValue: false },
});

export default i18next;
