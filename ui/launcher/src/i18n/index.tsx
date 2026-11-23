import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from 'react';
import english from './en';

export type LauncherLocale = 'zh-CN' | 'en';
export type LanguagePreference = 'system' | LauncherLocale;
type Values = Readonly<Record<string, string | number | boolean | null | undefined>>;

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || value === 'zh-CN' || value === 'en';
}

export function resolveLocale(
  preference: LanguagePreference,
  languages: readonly string[],
): LauncherLocale {
  if (preference !== 'system') return preference;
  for (const language of languages) {
    const base = language.split('-')[0]?.toLowerCase();
    if (base === 'zh') return 'zh-CN';
    if (base === 'en') return 'en';
  }
  return 'en';
}

function createTranslation(locale: LauncherLocale) {
  return {
    locale,
    t(source: string, values?: Values): string {
      const message = locale === 'en' && Object.hasOwn(english, source) ? english[source] : source;
      return values
        ? message.replace(/\{([A-Za-z]\w*)\}/g, (placeholder, name: string) =>
            Object.hasOwn(values, name) ? String(values[name] ?? '') : placeholder,
          )
        : message;
    },
  };
}

const TranslationContext = createContext(createTranslation('zh-CN'));

export function TranslationProvider({
  locale,
  children,
}: {
  locale: LauncherLocale;
  children: ReactNode;
}) {
  const translation = useMemo(() => createTranslation(locale), [locale]);
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <TranslationContext.Provider value={translation}>{children}</TranslationContext.Provider>;
}

export function useTranslation() {
  return useContext(TranslationContext);
}
