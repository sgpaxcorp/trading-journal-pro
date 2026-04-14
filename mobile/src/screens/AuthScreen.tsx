import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiPost } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { supabaseMobile } from "../lib/supabase";
import { type ThemeColors } from "../theme";
import { useTheme } from "../lib/ThemeContext";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logo = require("../../assets/apple-touch-icon.png");
const WEB_BASE = "https://www.neurotrader-journal.com";

type AuthMode = "signin" | "forgotPassword" | "recoverAccount";

function getReadableApiError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : String(error ?? "").trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string };
    if (parsed?.error) return parsed.error;
    if (parsed?.message) return parsed.message;
  } catch {
    // Keep the original error message when it is plain text.
  }
  return raw;
}

export function AuthScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
    if (nextMode !== "signin" && !recoveryEmail.trim() && email.trim()) {
      setRecoveryEmail(email.trim());
    }
  }

  async function handleSubmit() {
    setError(null);
    setMessage(null);

    if (!email.trim() || !password.trim()) {
      setError(t(language, "Enter email and password.", "Escribe email y contraseña."));
      return;
    }

    if (!supabaseMobile) {
      setError(
        t(
          language,
          "Sign in is temporarily unavailable. Please update the app.",
          "El inicio de sesión no está disponible temporalmente. Actualiza la app."
        )
      );
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabaseMobile.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });
      if (error) {
        setError(error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRecoveryRequest(kind: "password" | "account") {
    setError(null);
    setMessage(null);

    const cleanEmail = recoveryEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setError(t(language, "Enter the email tied to the account.", "Escribe el email vinculado a la cuenta."));
      return;
    }

    setBusy(true);
    try {
      const path = kind === "password" ? "/api/auth/password-reset/request" : "/api/auth/account-recovery/request";
      const response = await apiPost<{ message?: string }>(path, { email: cleanEmail });
      setMessage(
        response?.message ??
          (kind === "password"
            ? t(
                language,
                "If that account exists, a secure password reset email is on the way.",
                "Si esa cuenta existe, ya va en camino un email seguro para resetear la contraseña."
              )
            : t(
                language,
                "If that account exists, a recovery email with your sign-in details is on the way.",
                "Si esa cuenta existe, ya va en camino un email de recuperación con tus datos de acceso."
              ))
      );
    } catch (requestError) {
      setError(
        getReadableApiError(
          requestError,
          kind === "password"
            ? t(language, "Could not send the reset email.", "No se pudo enviar el email de reset.")
            : t(language, "Could not send the recovery email.", "No se pudo enviar el email de recuperación.")
        )
      );
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "signin"
      ? t(language, "Sign in", "Inicia sesión")
      : mode === "forgotPassword"
        ? t(language, "Forgot password", "Olvidé mi contraseña")
        : t(language, "Recover account", "Recuperar cuenta");

  const subtitle =
    mode === "signin"
      ? t(
          language,
          "Sign in with your existing account to access your dashboard, journal, and analytics.",
          "Inicia sesión con tu cuenta existente para acceder a tu dashboard, journal y analíticas."
        )
      : mode === "forgotPassword"
        ? t(
            language,
            "Enter the email linked to your account and we’ll send a secure password reset email.",
            "Ingresa el email vinculado a tu cuenta y te enviaremos un email seguro para resetear la contraseña."
          )
        : t(
            language,
            "If you are not sure which email you use to sign in, we’ll send a recovery email with your access details and a reset shortcut.",
            "Si no estás seguro de cuál email usas para entrar, te enviaremos un email de recuperación con tus datos de acceso y un atajo para resetear la contraseña."
          );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      bounces={false}
    >
      <View style={styles.logoWrap}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image source={logo} style={styles.logo} resizeMode="contain" />
      </View>
      <View style={styles.card}>
        <Text style={styles.kicker}>Neuro Trader</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {mode === "signin" ? (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t(language, "Email", "Correo")}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder={t(language, "Password", "Contraseña")}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.primaryButtonText}>{t(language, "Sign in", "Iniciar sesión")}</Text>
              )}
            </Pressable>

            <View style={styles.linkRow}>
              <Pressable onPress={() => switchMode("forgotPassword")}>
                <Text style={styles.secondaryLink}>{t(language, "Forgot password?", "¿Olvidaste tu contraseña?")}</Text>
              </Pressable>
              <Pressable onPress={() => switchMode("recoverAccount")}>
                <Text style={styles.secondaryLink}>{t(language, "Recover sign-in email", "Recuperar email de acceso")}</Text>
              </Pressable>
            </View>

            <View style={styles.tertiaryRow}>
              <Text style={styles.helperText}>
                {t(language, "Need a new account?", "¿Necesitas una cuenta nueva?")}
              </Text>
              <Pressable onPress={() => Linking.openURL(`${WEB_BASE}/signup`)}>
                <Text style={styles.tertiaryLink}>{t(language, "Create one on the web", "Créala en la web")}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <TextInput
              value={recoveryEmail}
              onChangeText={setRecoveryEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t(language, "Email linked to the account", "Email vinculado a la cuenta")}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Pressable
              style={styles.primaryButton}
              onPress={() => handleRecoveryRequest(mode === "forgotPassword" ? "password" : "account")}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === "forgotPassword"
                    ? t(language, "Send reset email", "Enviar email de reset")
                    : t(language, "Send recovery email", "Enviar email de recuperación")}
                </Text>
              )}
            </Pressable>

            <View style={styles.infoCard}>
              <Text style={styles.infoText}>
                {t(
                  language,
                  "We’ll send the secure email to the address you enter. Open the link from your email to continue the official reset flow.",
                  "Enviaremos el email seguro a la dirección que indiques. Abre el enlace desde tu correo para continuar el flujo oficial de reset."
                )}
              </Text>
            </View>

            <View style={styles.linkRow}>
              <Pressable onPress={() => switchMode("signin")}>
                <Text style={styles.secondaryLink}>{t(language, "Back to sign in", "Volver a sign in")}</Text>
              </Pressable>
              <Pressable onPress={() => switchMode(mode === "forgotPassword" ? "recoverAccount" : "forgotPassword")}>
                <Text style={styles.secondaryLink}>
                  {mode === "forgotPassword"
                    ? t(language, "Need account recovery instead?", "¿Necesitas recuperación de cuenta?")
                    : t(language, "Need a password reset instead?", "¿Necesitas resetear la contraseña?")}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {message ? <Text style={styles.successText}>{message}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
      paddingTop: 12,
      paddingBottom: 28,
      justifyContent: "flex-start",
    },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 16,
      gap: 10,
    },
    logoWrap: {
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    logo: {
      width: 350,
      height: 350,
      borderRadius: 36,
    },
    kicker: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    title: {
      color: colors.textPrimary,
      fontSize: 24,
      fontWeight: "700",
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 4,
    },
    input: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: "center",
      marginTop: 4,
    },
    primaryButtonText: {
      color: colors.onPrimary,
      fontWeight: "700",
      fontSize: 14,
    },
    linkRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: 10,
      marginTop: 4,
    },
    tertiaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
      marginTop: 2,
    },
    helperText: {
      color: colors.textMuted,
      fontSize: 12,
    },
    secondaryLink: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "600",
    },
    tertiaryLink: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "600",
      textDecorationLine: "underline",
    },
    infoCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 2,
    },
    infoText: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    successText: {
      color: colors.success,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
      marginTop: 2,
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
      marginTop: 2,
    },
  });
