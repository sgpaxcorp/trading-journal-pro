import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { apiGet, apiPost } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useSupabaseUser } from "../lib/useSupabaseUser";
import { supabaseMobile } from "../lib/supabase";
import { type ThemeColors } from "../theme";
import { useTheme } from "../lib/ThemeContext";

type Entitlement = {
  entitlement_key?: string | null;
  status?: string | null;
  metadata?: Record<string, any> | null;
};

export function SettingsScreen() {
  const { language, setLanguage } = useLanguage();
  const { colors, mode: themeMode, setMode } = useTheme();
  const user = useSupabaseUser();
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    address: "",
  });
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [notificationReady, setNotificationReady] = useState(false);
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<"core" | "advanced" | null>(null);
  const [planStatus, setPlanStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleSignOut() {
    if (!supabaseMobile) {
      Alert.alert(
        t(language, "Sign out unavailable", "Cerrar sesión no disponible"),
        t(language, "Please update the app and try again.", "Actualiza la app e intenta otra vez.")
      );
      return;
    }

    const sb = supabaseMobile;
    const { error } = await sb.auth.signOut();
    if (error) {
      Alert.alert(t(language, "Sign out failed", "Error al cerrar sesión"), error.message);
      return;
    }
    Alert.alert(
      t(language, "Signed out", "Sesión cerrada"),
      t(language, "Your session has been closed on this device.", "La sesión se cerró en este dispositivo.")
    );
  }

  const loadProfile = useCallback(async () => {
    if (!supabaseMobile || !user?.id) return;
    const sb = supabaseMobile;
    const userId = user.id;
    try {
      setProfileLoading(true);
      setProfileError(null);
      const { data, error } = await sb
        .from("profiles")
        .select("first_name,last_name,phone,postal_address")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!mountedRef.current) return;
      setProfile({
        firstName: data?.first_name ?? "",
        lastName: data?.last_name ?? "",
        phone: data?.phone ?? "",
        address: data?.postal_address ?? "",
      });
    } catch (err: any) {
      if (!mountedRef.current) return;
      setProfileError(err?.message ?? "Failed to load profile.");
    } finally {
      if (!mountedRef.current) return;
      setProfileLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    async function initNotifications() {
      try {
        setNotificationLoading(true);
        const permissions = await Notifications.getPermissionsAsync();
        let status = permissions.status;
        if (status !== "granted") {
          const request = await Notifications.requestPermissionsAsync();
          status = request.status;
        }
        if (!active) return;
        setNotificationStatus(status);

        if (status !== "granted") {
          setNotificationEnabled(false);
          setNotificationReady(true);
          return;
        }

        const projectId =
          Constants.easConfig?.projectId ||
          Constants.expoConfig?.extra?.eas?.projectId ||
          process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;

        const tokenData = projectId
          ? await Notifications.getExpoPushTokenAsync({ projectId })
          : await Notifications.getExpoPushTokenAsync();

        if (!active) return;
        const token = tokenData.data;
        setPushToken(token);
        const resolvedDeviceName = Device.deviceName || Device.modelName || null;

        const res = await apiPost<{
          ok: boolean;
          token?: { daily_reminder_enabled?: boolean | null };
        }>("/api/notifications/register", {
          expoPushToken: token,
          platform: Platform.OS,
          deviceId: Device.osInternalBuildId ?? null,
          deviceName: resolvedDeviceName || Device.modelName || null,
          locale: language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });

        if (!active) return;
        const enabled = res?.token?.daily_reminder_enabled;
        setNotificationEnabled(typeof enabled === "boolean" ? enabled : true);
        setNotificationReady(true);
      } catch (err) {
        if (!active) return;
        setNotificationReady(true);
      } finally {
        if (!active) return;
        setNotificationLoading(false);
      }
    }

    initNotifications();
    return () => {
      active = false;
    };
  }, [user?.id, language]);

  const normalizePlan = useCallback((raw: unknown): "core" | "advanced" | null => {
    const v = String(raw ?? "").toLowerCase();
    if (v.includes("advanced")) return "advanced";
    if (v.includes("core")) return "core";
    return null;
  }, []);

  const isActiveStatus = useCallback((status?: string | null) => {
    const s = String(status ?? "").toLowerCase();
    return ["active", "trialing", "past_due"].includes(s);
  }, []);

  const loadPlan = useCallback(async () => {
    if (!user?.id) return;
    try {
      setPlanLoading(true);
      let plan: "core" | "advanced" | null = null;
      let status: string | null = null;

      if (supabaseMobile) {
        const { data, error } = await supabaseMobile
          .from("profiles")
          .select("plan, subscription_status")
          .eq("id", user.id)
          .maybeSingle();
        if (!error && data) {
          plan = normalizePlan((data as any)?.plan);
          status = String((data as any)?.subscription_status ?? "");
        }
      }

      if (!plan || !isActiveStatus(status)) {
        const res = await apiGet<{ entitlements: Entitlement[] }>("/api/entitlements/list");
        const entitlements = res?.entitlements ?? [];
        const activeEntitlements = entitlements.filter((e) => isActiveStatus(e.status));
        const entPlan =
          activeEntitlements.find((e) => normalizePlan(e.entitlement_key)) ??
          activeEntitlements.find((e) => normalizePlan(e.metadata?.planId || e.metadata?.plan));

        if (entPlan) {
          plan = normalizePlan(entPlan.entitlement_key || entPlan.metadata?.planId || entPlan.metadata?.plan);
          status = entPlan.status ?? status;
        }
      }

      if (!mountedRef.current) return;
      setCurrentPlan(plan);
      setPlanStatus(status);
    } catch {
      if (!mountedRef.current) return;
    } finally {
      if (!mountedRef.current) return;
      setPlanLoading(false);
    }
  }, [isActiveStatus, normalizePlan, user?.id]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  async function handleSaveProfile() {
    if (!supabaseMobile || !user?.id) return;
    const sb = supabaseMobile;
    const userId = user.id;
    try {
      setProfileSaving(true);
      setProfileError(null);
      const { error } = await sb
        .from("profiles")
        .update({
          first_name: profile.firstName.trim(),
          last_name: profile.lastName.trim(),
          phone: profile.phone.trim(),
          postal_address: profile.address.trim(),
        })
        .eq("id", userId);
      if (error) throw error;
      Alert.alert(
        t(language, "Profile updated", "Perfil actualizado"),
        t(language, "Your changes were saved.", "Tus cambios se guardaron.")
      );
    } catch (err: any) {
      setProfileError(err?.message ?? "Failed to save profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!supabaseMobile) return;
    const sb = supabaseMobile;
    if (!password || password.length < 8) {
      Alert.alert(
        t(language, "Password too short", "Contraseña muy corta"),
        t(language, "Use at least 8 characters.", "Usa mínimo 8 caracteres.")
      );
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert(
        t(language, "Passwords do not match", "Las contraseñas no coinciden"),
        t(language, "Please confirm your password.", "Confirma tu contraseña.")
      );
      return;
    }
    try {
      setPasswordLoading(true);
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setPasswordConfirm("");
      Alert.alert(
        t(language, "Password updated", "Contraseña actualizada"),
        t(language, "Your password was updated.", "Tu contraseña fue actualizada.")
      );
    } catch (err: any) {
      Alert.alert(t(language, "Password update failed", "Error al actualizar contraseña"), err?.message ?? "Error");
    } finally {
      setPasswordLoading(false);
    }
  }


  async function handleToggleNotifications(nextValue: boolean) {
    if (notificationLoading) return;
    if (notificationStatus !== "granted") {
      Alert.alert(
        t(language, "Enable notifications", "Habilita notificaciones"),
        t(
          language,
          "Please allow notifications in Settings to receive reminders.",
          "Activa notificaciones en Ajustes para recibir recordatorios."
        ),
        [
          { text: t(language, "Cancel", "Cancelar"), style: "cancel" },
          { text: t(language, "Open Settings", "Abrir ajustes"), onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    if (!pushToken) {
      Alert.alert(
        t(language, "Notification setup required", "Configuración necesaria"),
        t(
          language,
          "We could not register this device for reminders yet.",
          "No pudimos registrar este dispositivo para recordatorios."
        )
      );
      return;
    }

    try {
      setNotificationLoading(true);
      await apiPost("/api/notifications/register", {
        expoPushToken: pushToken,
        platform: Platform.OS,
        locale: language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        dailyReminderEnabled: nextValue,
      });
      setNotificationEnabled(nextValue);
    } catch (err: any) {
      Alert.alert(
        t(language, "Notification update failed", "Error al actualizar notificaciones"),
        err?.message ?? "Error"
      );
    } finally {
      setNotificationLoading(false);
    }
  }


  const styles = useMemo(() => createStyles(colors), [colors]);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadProfile(), loadPlan()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadPlan, loadProfile]);

  return (
    <ScreenScaffold
      title={t(language, "Settings", "Ajustes")}
      subtitle={t(
        language,
        "Manage your account, preferences, and security.",
        "Gestiona tu cuenta, preferencias y seguridad."
      )}
      refreshing={refreshing}
      onRefresh={handleRefresh}
    >
      <View style={styles.profileCard}>
        <Text style={styles.profileTitle}>{t(language, "Account", "Cuenta")}</Text>
        <Text style={styles.profileText}>
          {user?.email ?? t(language, "No email detected yet.", "Aún no hay email detectado.")}
        </Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t(language, "Profile", "Perfil")}</Text>
        {profileLoading ? (
          <Text style={styles.sectionHint}>{t(language, "Loading profile…", "Cargando perfil…")}</Text>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder={t(language, "First name", "Nombre")}
              placeholderTextColor={colors.textMuted}
              value={profile.firstName}
              onChangeText={(value) => setProfile((prev) => ({ ...prev, firstName: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder={t(language, "Last name", "Apellido")}
              placeholderTextColor={colors.textMuted}
              value={profile.lastName}
              onChangeText={(value) => setProfile((prev) => ({ ...prev, lastName: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder={t(language, "Phone", "Teléfono")}
              placeholderTextColor={colors.textMuted}
              value={profile.phone}
              onChangeText={(value) => setProfile((prev) => ({ ...prev, phone: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder={t(language, "Address", "Dirección")}
              placeholderTextColor={colors.textMuted}
              value={profile.address}
              onChangeText={(value) => setProfile((prev) => ({ ...prev, address: value }))}
            />
            {profileError ? <Text style={styles.errorText}>{profileError}</Text> : null}
            <Pressable
              style={[styles.saveButton, profileSaving && styles.saveButtonDisabled]}
              onPress={handleSaveProfile}
              disabled={profileSaving}
            >
              <Text style={styles.saveButtonText}>
                {profileSaving ? t(language, "Saving…", "Guardando…") : t(language, "Save profile", "Guardar perfil")}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t(language, "Security", "Seguridad")}</Text>
        <TextInput
          style={styles.input}
          placeholder={t(language, "New password", "Nueva contraseña")}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={styles.input}
          placeholder={t(language, "Confirm password", "Confirmar contraseña")}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
        />
        <Pressable
          style={[styles.saveButton, passwordLoading && styles.saveButtonDisabled]}
          onPress={handleChangePassword}
          disabled={passwordLoading}
        >
          <Text style={styles.saveButtonText}>
            {passwordLoading ? t(language, "Updating…", "Actualizando…") : t(language, "Update password", "Actualizar contraseña")}
          </Text>
        </Pressable>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t(language, "Subscription", "Suscripción")}</Text>
        {planLoading ? (
          <Text style={styles.sectionHint}>{t(language, "Loading subscription…", "Cargando suscripción…")}</Text>
        ) : currentPlan ? (
          <>
            <Text style={styles.sectionHint}>
              {t(
                language,
                `Current plan: ${currentPlan.toUpperCase()}`,
                `Plan actual: ${currentPlan.toUpperCase()}`
              )}
            </Text>
            {planStatus ? (
              <Text style={styles.sectionHint}>
                {t(language, `Status: ${planStatus}`, `Estado: ${planStatus}`)}
              </Text>
            ) : null}
            <Text style={styles.sectionHint}>
              {t(
                language,
                "Manage renewals or cancellation in the web app.",
                "Administra la renovación o cancelación en la web."
              )}
            </Text>
            <Pressable
              style={styles.saveButton}
              onPress={() => Linking.openURL("https://neurotrader-journal.com/billing")}
            >
              <Text style={styles.saveButtonText}>
                {t(language, "Open billing on web", "Abrir billing en la web")}
              </Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.sectionHint}>
            {t(
              language,
              "Plan details are syncing. Please refresh in a moment.",
              "El plan se está sincronizando. Actualiza en un momento."
            )}
          </Text>
        )}
      </View>

      {false ? null : null}

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t(language, "Notifications", "Notificaciones")}</Text>
        <Text style={styles.sectionHint}>
          {t(
            language,
            "Daily reminder at 9:00 AM EST.",
            "Recordatorio diario a las 9:00 AM EST."
          )}
        </Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>
            {t(language, "Daily reminder", "Recordatorio diario")}
          </Text>
          <Switch
            value={notificationEnabled}
            onValueChange={handleToggleNotifications}
            disabled={!notificationReady || notificationLoading}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={notificationEnabled ? colors.card : colors.border}
          />
        </View>
        {notificationStatus !== "granted" ? (
          <Text style={styles.sectionHint}>
            {t(
              language,
              "Notifications are off for this device. Enable them in iOS Settings.",
              "Las notificaciones están apagadas en este dispositivo. Actívalas en Ajustes."
            )}
          </Text>
        ) : null}
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.themeHeader}>
          <Text style={styles.sectionTitle}>{t(language, "Appearance", "Apariencia")}</Text>
          <Ionicons
            name="moon"
            size={18}
            color={colors.primary}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>
            {themeMode === "light" ? t(language, "Light mode", "Modo claro") : t(language, "Neuro mode", "Modo neuro")}
          </Text>
          <Switch
            value={themeMode === "light"}
            onValueChange={(value) => setMode(value ? "light" : "neuro")}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={themeMode === "light" ? colors.card : colors.border}
          />
        </View>
      </View>

      <View style={styles.languageRow}>
        <Text style={styles.languageLabel}>{t(language, "Language", "Idioma")}</Text>
        <View style={styles.languageButtons}>
          <Pressable
            style={[styles.languageButton, language === "en" && styles.languageButtonActive]}
            onPress={() => setLanguage("en")}
          >
            <Text style={styles.languageButtonText}>EN</Text>
          </Pressable>
          <Pressable
            style={[styles.languageButton, language === "es" && styles.languageButtonActive]}
            onPress={() => setLanguage("es")}
          >
            <Text style={styles.languageButtonText}>ES</Text>
          </Pressable>
        </View>
      </View>

      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>{t(language, "Sign out", "Cerrar sesión")}</Text>
      </Pressable>
    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) => {
  return StyleSheet.create({
    profileCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 12,
      gap: 4,
    },
    profileTitle: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    profileText: {
      color: colors.textMuted,
      fontSize: 12,
    },
    sectionCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 12,
      gap: 8,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "700",
    },
    sectionHint: {
      color: colors.textMuted,
      fontSize: 12,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 6,
    },
    themeHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    toggleLabel: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "600",
    },
    input: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
    },
    saveButton: {
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: "center",
      paddingVertical: 10,
    },
    dangerButton: {
      borderRadius: 10,
      backgroundColor: colors.danger,
      alignItems: "center",
      paddingVertical: 10,
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      color: colors.onPrimary,
      fontSize: 12,
      fontWeight: "700",
    },
    dangerButtonText: {
      color: "#FEE2E2",
      fontSize: 12,
      fontWeight: "700",
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
    },
    languageRow: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    languageLabel: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "600",
    },
    languageButtons: {
      flexDirection: "row",
      gap: 8,
    },
    languageButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    languageButtonActive: {
      borderColor: colors.primary,
      backgroundColor: colors.successSoft,
    },
    languageButtonText: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "700",
    },
    signOutButton: {
      marginTop: 4,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      backgroundColor: colors.dangerSoft,
      alignItems: "center",
      paddingVertical: 10,
    },
    signOutText: {
      color: colors.dangerText,
      fontWeight: "700",
      fontSize: 13,
    },
  });
};
