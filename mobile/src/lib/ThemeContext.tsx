import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";

import { DARK_COLORS, LIGHT_COLORS, ThemeColors, ThemeMode } from "../theme";

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_KEY = "ntj_theme";

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>("neuro");

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(THEME_KEY)
      .then((storedMode) => {
        if (active && (storedMode === "neuro" || storedMode === "light")) {
          setModeState(storedMode);
        }
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    SecureStore.setItemAsync(THEME_KEY, nextMode).catch(() => null);
  }, []);

  const colors = useMemo<ThemeColors>(() => (mode === "light" ? LIGHT_COLORS : DARK_COLORS), [mode]);

  const value = useMemo(() => ({ mode, setMode, colors }), [mode, setMode, colors]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return ctx;
}
