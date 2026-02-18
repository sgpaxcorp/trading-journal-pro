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
};

export const COLORS: ThemeColors = { ...DARK_COLORS };
