export type ThemeMode = "neuro" | "light";

export type ThemeColors = {
  background: string;
  surface: string;
  card: string;
  border: string;
  textPrimary: string;
  textMuted: string;
  primary: string;
  danger: string;
  success: string;
  info: string;
  warning: string;
  successSoft: string;
  infoSoft: string;
  warningSoft: string;
  overlay: string;
  onPrimary: string;
  dangerSoft: string;
  dangerBorder: string;
  dangerText: string;
};

export const DARK_COLORS: ThemeColors = {
  background: "#020B26",
  surface: "#0A1331",
  card: "#0E1B44",
  border: "#1B2B5C",
  textPrimary: "#E5ECFF",
  textMuted: "#8CA0D3",
  primary: "#1EE6A8",
  danger: "#FF6B6B",
  success: "#1EE6A8",
  info: "#2E90FF",
  warning: "#D6B36A",
  successSoft: "#0F2C2A",
  infoSoft: "#0B1E3A",
  warningSoft: "#2A1D0B",
  overlay: "rgba(2, 11, 38, 0.55)",
  onPrimary: "#061122",
  dangerSoft: "#2A1020",
  dangerBorder: "#8A3153",
  dangerText: "#FF9FBD",
};

export const LIGHT_COLORS: ThemeColors = {
  background: "#F5F7FF",
  surface: "#FFFFFF",
  card: "#FFFFFF",
  border: "#D6DDEE",
  textPrimary: "#0C1B3A",
  textMuted: "#5A6C8F",
  primary: "#0F9D7A",
  danger: "#D64545",
  success: "#0F9D7A",
  info: "#2E6BFF",
  warning: "#C28B2C",
  successSoft: "#E2F3EE",
  infoSoft: "#E7F0FF",
  warningSoft: "#FFF4DD",
  overlay: "rgba(7, 22, 46, 0.35)",
  onPrimary: "#F5FBFF",
  dangerSoft: "#FFE6EE",
  dangerBorder: "#E3B6C6",
  dangerText: "#8A3153",
};

export const COLORS: ThemeColors = { ...DARK_COLORS };
