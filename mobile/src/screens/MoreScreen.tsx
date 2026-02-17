import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useEffect, useState } from "react";
import { useStripe } from "@stripe/stripe-react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { apiPost } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useSupabaseUser } from "../lib/useSupabaseUser";
import { supabaseMobile } from "../lib/supabase";
import { COLORS } from "../theme";

export function SettingsScreen() {
  const { language, setLanguage } = useLanguage();
  const user = useSupabaseUser();
  const stripe = useStripe();
  const [planId, setPlanId] = useState<"core" | "advanced">("core");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [billingLoading, setBillingLoading] = useState(false);
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

  useEffect(() => {
    if (!supabaseMobile || !user?.id) return;
    const sb = supabaseMobile;
    const userId = user.id;
    let active = true;

    async function loadProfile() {
      try {
        setProfileLoading(true);
        setProfileError(null);
        const { data, error } = await sb
          .from("profiles")
          .select("first_name,last_name,phone,postal_address")
          .eq("id", userId)
          .maybeSingle();
        if (error) throw error;
        if (!active) return;
        setProfile({
          firstName: data?.first_name ?? "",
          lastName: data?.last_name ?? "",
          phone: data?.phone ?? "",
          address: data?.postal_address ?? "",
        });
      } catch (err: any) {
        if (!active) return;
        setProfileError(err?.message ?? "Failed to load profile.");
      } finally {
        if (!active) return;
        setProfileLoading(false);
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [user?.id]);

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

  async function handleSubscribe() {
    try {
      setBillingLoading(true);
      const res = await apiPost<{
        customerId: string;
        ephemeralKey: string;
        paymentIntentClientSecret: string;
      }>("/api/stripe/mobile/subscribe", {
        planId,
        billingCycle,
        addonOptionFlow: false,
      });

      const init = await stripe.initPaymentSheet({
        merchantDisplayName: "Neuro Trader",
        customerId: res.customerId,
        customerEphemeralKeySecret: res.ephemeralKey,
        paymentIntentClientSecret: res.paymentIntentClientSecret,
        allowsDelayedPaymentMethods: true,
      });

      if (init.error) {
        Alert.alert(t(language, "Payment setup failed", "Fallo al preparar pago"), init.error.message);
        return;
      }

      const present = await stripe.presentPaymentSheet();
      if (present.error) {
        Alert.alert(t(language, "Payment failed", "Pago fallido"), present.error.message);
        return;
      }

      Alert.alert(
        t(language, "Subscription active", "Suscripción activa"),
        t(language, "Your plan is now active.", "Tu plan ya está activo.")
      );
    } catch (err: any) {
      Alert.alert(t(language, "Billing error", "Error de facturación"), err?.message ?? "Unknown error");
    } finally {
      setBillingLoading(false);
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

  return (
    <ScreenScaffold
      title={t(language, "Settings", "Ajustes")}
      subtitle={t(
        language,
        "Manage your account, preferences, and security.",
        "Gestiona tu cuenta, preferencias y seguridad."
      )}
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
              placeholderTextColor={COLORS.textMuted}
              value={profile.firstName}
              onChangeText={(value) => setProfile((prev) => ({ ...prev, firstName: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder={t(language, "Last name", "Apellido")}
              placeholderTextColor={COLORS.textMuted}
              value={profile.lastName}
              onChangeText={(value) => setProfile((prev) => ({ ...prev, lastName: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder={t(language, "Phone", "Teléfono")}
              placeholderTextColor={COLORS.textMuted}
              value={profile.phone}
              onChangeText={(value) => setProfile((prev) => ({ ...prev, phone: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder={t(language, "Address", "Dirección")}
              placeholderTextColor={COLORS.textMuted}
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
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={styles.input}
          placeholder={t(language, "Confirm password", "Confirmar contraseña")}
          placeholderTextColor={COLORS.textMuted}
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

      {false ? (
        <View style={styles.billingCard}>
          <Text style={styles.billingTitle}>{t(language, "Choose your plan", "Elige tu plan")}</Text>
          <View style={styles.billingRow}>
            {(["core", "advanced"] as const).map((plan) => (
              <Pressable
                key={plan}
                onPress={() => setPlanId(plan)}
                style={[styles.billingOption, planId === plan && styles.billingOptionActive]}
              >
                <Text style={styles.billingOptionText}>{plan === "core" ? "Core" : "Advanced"}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.billingRow}>
            {(["monthly", "annual"] as const).map((cycle) => (
              <Pressable
                key={cycle}
                onPress={() => setBillingCycle(cycle)}
                style={[styles.billingOption, billingCycle === cycle && styles.billingOptionActive]}
              >
                <Text style={styles.billingOptionText}>
                  {cycle === "monthly" ? t(language, "Monthly", "Mensual") : t(language, "Annual", "Anual")}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.subscribeButton, billingLoading && styles.subscribeButtonDisabled]}
            onPress={handleSubscribe}
            disabled={billingLoading}
          >
            <Text style={styles.subscribeButtonText}>
              {billingLoading ? t(language, "Processing…", "Procesando…") : t(language, "Start subscription", "Activar plan")}
            </Text>
          </Pressable>
        </View>
      ) : null}

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
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={notificationEnabled ? "#0D1F1A" : "#1F2A3A"}
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

const styles = StyleSheet.create({
  profileCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 4,
  },
  profileTitle: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  profileText: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  sectionHint: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  toggleLabel: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  saveButton: {
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    paddingVertical: 10,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#061122",
    fontSize: 12,
    fontWeight: "700",
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
  },
  languageRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  languageLabel: {
    color: COLORS.textPrimary,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  languageButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: "#0F2C2A",
  },
  languageButtonText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  signOutButton: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#8A3153",
    backgroundColor: "#2A1020",
    alignItems: "center",
    paddingVertical: 10,
  },
  signOutText: {
    color: "#FF9FBD",
    fontWeight: "700",
    fontSize: 13,
  },
  billingCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 10,
  },
  billingTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  billingRow: {
    flexDirection: "row",
    gap: 8,
  },
  billingOption: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingVertical: 8,
    alignItems: "center",
  },
  billingOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: "#0F2C2A",
  },
  billingOptionText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  subscribeButton: {
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    paddingVertical: 10,
  },
  subscribeButtonDisabled: {
    opacity: 0.6,
  },
  subscribeButtonText: {
    color: "#061122",
    fontSize: 12,
    fontWeight: "700",
  },
});
