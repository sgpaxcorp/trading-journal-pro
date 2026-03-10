import { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { supabaseMobile } from "../lib/supabase";
import { type ThemeColors } from "../theme";
import { useTheme } from "../lib/ThemeContext";

const logo = require("../../assets/apple-touch-icon.png");

export function AuthScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError(null);

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

  return (
    <View style={styles.root}>
      <View style={styles.logoWrap}>
        <Image source={logo} style={styles.logo} resizeMode="contain" />
      </View>
      <View style={styles.card}>
        <Text style={styles.kicker}>Neuro Trader</Text>
        <Text style={styles.title}>{t(language, "Sign in", "Inicia sesión")}</Text>
        <Text style={styles.subtitle}>
          {t(
            language,
            "Sign in with your existing account to access your dashboard, journal, and analytics.",
            "Inicia sesión con tu cuenta existente para acceder a tu dashboard, journal y analíticas."
          )}
        </Text>

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

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
      paddingTop: 12,
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
    errorText: {
      color: colors.danger,
      fontSize: 12,
      textAlign: "center",
    },
  });
