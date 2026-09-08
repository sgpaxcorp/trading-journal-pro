import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiPost } from "../lib/api";
import { MOBILE_PASSWORD_RESET_REDIRECT_URL } from "../lib/authRecovery";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { supabaseMobile } from "../lib/supabase";
import { type ThemeColors } from "../theme";
import { useTheme } from "../lib/ThemeContext";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logo = require("../../assets/apple-touch-icon.png");

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
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isTablet = Platform.OS === "ios" ? Platform.isPad : width >= 768;
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
      const response = await apiPost<{ message?: string }>(path, {
        email: cleanEmail,
        redirectTo: MOBILE_PASSWORD_RESET_REDIRECT_URL,
      });
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
          "Sign in with your Trader Entrepreneur account to access your Trading Business Center.",
          "Inicia sesión con tu cuenta de Empresario Trader para acceder a tu Trading Business Center."
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
      contentContainerStyle={[
        styles.content,
        { paddingTop: Math.max(insets.top + 12, 24), paddingBottom: Math.max(insets.bottom + 16, 28) },
        isTablet && styles.contentTablet,
      ]}
      keyboardShouldPersistTaps="handled"
      bounces={false}
    >
      <View style={[styles.authShell, isTablet && styles.authShellTablet]}>
        <View style={[styles.hero, isTablet && styles.heroTablet]}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image source={logo} style={[styles.logo, isTablet && styles.logoTablet]} resizeMode="contain" />
          <Text style={styles.heroEyebrow}>
            {t(language, "Trading Business Center", "Trading Business Center")}
          </Text>
          <Text style={[styles.heroTitle, isTablet && styles.heroTitleTablet]}>
            {t(
              language,
              "Run your trading business like a trading entrepreneur.",
              "Dirige tu negocio de trading como un empresario del trading."
            )}
          </Text>
          <Text style={styles.heroBody}>
            {t(
              language,
              "Monitor performance, review your KPIs, follow your operating plan, document execution, and consult your Business AI Coach inside one secure business center.",
              "Monitorea resultados, revisa tus KPIs, sigue tu plan operativo, documenta la ejecución y consulta a tu Coach Empresarial IA dentro de un centro empresarial seguro."
            )}
          </Text>
          <View style={styles.heroPoints}>
            <Text style={styles.heroPoint}>• {t(language, "Business performance and risk control", "Rendimiento empresarial y control de riesgo")}</Text>
            <Text style={styles.heroPoint}>• {t(language, "Operating plan and milestone tracking", "Plan operativo y seguimiento de milestones")}</Text>
            <Text style={styles.heroPoint}>• {t(language, "AI coaching and decision memory", "Coaching con IA y memoria de decisiones")}</Text>
          </View>
        </View>

        <View style={[styles.card, isTablet && styles.cardTablet]}>
          <Text style={styles.kicker}>{t(language, "Secure business access", "Acceso empresarial seguro")}</Text>
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
              autoComplete="email"
              textContentType="username"
              returnKeyType="next"
              placeholder={t(language, "Email", "Correo")}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
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

            <Text style={styles.accountNote}>
              {t(
                language,
                "Use your existing NeuroTrader account. This app is the secure mobile companion for account holders.",
                "Usa tu cuenta existente de NeuroTrader. Esta app es el centro móvil seguro para quienes ya tienen acceso."
              )}
            </Text>
          </>
        ) : (
          <>
            <TextInput
              value={recoveryEmail}
              onChangeText={setRecoveryEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={() => handleRecoveryRequest(mode === "forgotPassword" ? "password" : "account")}
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
                  "We’ll send the secure email to the address you enter. Open the link from this phone to finish the reset flow natively in the app.",
                  "Enviaremos el email seguro a la dirección que indiques. Abre el enlace desde este teléfono para terminar el reset de forma nativa dentro del app."
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
      paddingVertical: 24,
      flexGrow: 1,
      justifyContent: "center",
    },
    contentTablet: {
      paddingHorizontal: 32,
      paddingVertical: 40,
    },
    authShell: {
      width: "100%",
      maxWidth: 1120,
      alignSelf: "center",
      overflow: "hidden",
      borderRadius: 26,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    authShellTablet: {
      flexDirection: "row",
      alignItems: "stretch",
    },
    hero: {
      backgroundColor: colors.surface,
      padding: 20,
      gap: 10,
    },
    heroTablet: {
      flex: 1.15,
      minHeight: 520,
      justifyContent: "center",
      padding: 36,
    },
    heroEyebrow: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.5,
      textTransform: "uppercase",
    },
    heroTitle: {
      color: colors.textPrimary,
      fontSize: 27,
      lineHeight: 33,
      fontWeight: "900",
      maxWidth: 520,
    },
    heroTitleTablet: {
      fontSize: 34,
      lineHeight: 41,
    },
    heroBody: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
      maxWidth: 560,
    },
    heroPoints: {
      gap: 7,
      marginTop: 4,
    },
    heroPoint: {
      color: colors.textPrimary,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "700",
    },
    card: {
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      padding: 20,
      gap: 10,
    },
    cardTablet: {
      flex: 0.85,
      alignSelf: "stretch",
      justifyContent: "center",
      borderTopWidth: 0,
      borderLeftWidth: 1,
      borderLeftColor: colors.border,
      padding: 32,
    },
    logo: {
      width: 88,
      height: 88,
      borderRadius: 22,
      marginBottom: 2,
    },
    logoTablet: {
      width: 124,
      height: 124,
      borderRadius: 30,
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
      backgroundColor: colors.background,
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
    secondaryLink: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "600",
    },
    accountNote: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
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
