import { PropsWithChildren, createContext, useContext, useMemo, useState } from "react";

import { DARK_COLORS, LIGHT_COLORS, ThemeColors, ThemeMode } from "../theme";

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>("neuro");

  const colors = useMemo<ThemeColors>(() => (mode === "light" ? LIGHT_COLORS : DARK_COLORS), [mode]);

  const value = useMemo(() => ({ mode, setMode, colors }), [mode, colors]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return ctx;
}
