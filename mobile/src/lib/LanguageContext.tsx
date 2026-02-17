import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";

import { AppLanguage, normalizeLanguage } from "./i18n";

const LANGUAGE_KEY = "ntj_language";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  ready: boolean;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<AppLanguage>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(LANGUAGE_KEY)
      .then((value) => {
        if (!active) return;
        setLanguageState(normalizeLanguage(value));
      })
      .finally(() => {
        if (!active) return;
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = (next: AppLanguage) => {
    setLanguageState(next);
    SecureStore.setItemAsync(LANGUAGE_KEY, next).catch(() => null);
  };

  const value = useMemo(() => ({ language, setLanguage, ready }), [language, ready]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return ctx;
}
