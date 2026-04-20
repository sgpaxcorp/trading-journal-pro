import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { supabaseMobile } from "../lib/supabase";
import { useTheme } from "../lib/ThemeContext";
import { type ThemeColors } from "../theme";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logo = require("../../assets/apple-touch-icon.png");

type ResetPasswordScreenProps = {
  initialError?: string | null;
  hasRecoverySession: boolean;
  onComplete: () => void;
  onCancel: () => void;
};

export function ResetPasswordScreen({
  initialError,
  hasRecoverySession,
  onComplete,
  onCancel,
}: ResetPasswordScreenProps) {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError(initialError ?? null);
  }, [initialError]);

  async function handleSubmit() {
    setError(null);
    setMessage(null);

    if (password.length < 8) {
      setError(t(language, "Password must be at least 8 characters.", "La contraseña debe tener al menos 8 caracteres."));
      return;
    }
    if (password !== confirm) {
      setError(t(language, "Passwords do not match.", "Las contraseñas no coinciden."));
      return;
    }
    if (!supabaseMobile || !hasRecoverySession) {
      setError(
        t(
          language,
          "We could not validate the recovery session on this device. Request a new reset email and open it again from your phone.",
          "No pudimos validar la sesión de recuperación en este dispositivo. Solicita un nuevo email de reset y ábrelo otra vez desde tu teléfono."
        )
      );
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabaseMobile.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      setMessage(
        t(
          language,
          "Password updated successfully. Opening your account…",
          "Contraseña actualizada correctamente. Abriendo tu cuenta…"
        )
      );
      setTimeout(onComplete, 900);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image source={logo} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.kicker}>Neuro Trader</Text>
        <Text style={styles.title}>{t(language, "Choose a new password", "Elige una nueva contraseña")}</Text>
        <Text style={styles.subtitle}>
          {t(
            language,
            "This secure screen finishes the recovery flow inside the app. Choose your new password and continue directly to your account.",
            "Esta pantalla segura termina el flujo de recuperación dentro del app. Elige tu nueva contraseña y continúa directo a tu cuenta."
          )}
        </Text>

        {!hasRecoverySession ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>
              {initialError ??
                t(
                  language,
                  "This recovery session is no longer valid on the device. Go back to sign in and request another reset email.",
                  "Esta sesión de recuperación ya no es válida en el dispositivo. Vuelve a sign in y solicita otro email de reset."
                )}
            </Text>
          </View>
        ) : null}

        {message ? <Text style={styles.successText}>{message}</Text> : null}
        {error && hasRecoverySession ? <Text style={styles.errorText}>{error}</Text> : null}

        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          placeholder={t(language, "New password", "Nueva contraseña")}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          placeholder={t(language, "Confirm new password", "Confirmar nueva contraseña")}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />

        <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={busy || !hasRecoverySession}>
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>{t(language, "Save new password", "Guardar nueva contraseña")}</Text>
          )}
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>{t(language, "Back", "Volver")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 16,
      justifyContent: "center",
    },
    card: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 18,
      gap: 12,
    },
    logoWrap: {
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 2,
    },
    logo: {
      width: 96,
      height: 96,
      borderRadius: 24,
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
      lineHeight: 19,
    },
    warningCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.warning,
      backgroundColor: colors.warningSoft,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    warningText: {
      color: colors.textPrimary,
      fontSize: 12,
      lineHeight: 18,
    },
    input: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 14,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 2,
    },
    primaryButtonText: {
      color: colors.onPrimary,
      fontWeight: "700",
      fontSize: 14,
    },
    secondaryButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 11,
      alignItems: "center",
    },
    secondaryButtonText: {
      color: colors.textPrimary,
      fontWeight: "600",
      fontSize: 13,
    },
    successText: {
      color: colors.success,
      fontSize: 12,
      lineHeight: 18,
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
    },
  });
