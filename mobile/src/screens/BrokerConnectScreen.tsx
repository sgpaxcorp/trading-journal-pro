import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { apiGet, apiPost } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";
import { supabaseMobile } from "../lib/supabase";
import { useSupabaseUser } from "../lib/useSupabaseUser";

type SnaptradeAccount = {
  id?: string;
  name?: string;
  account_name?: string;
  account_number?: string;
  institution_name?: string;
  brokerage_authorization?: string;
};

type AccountsResponse = {
  accounts?: SnaptradeAccount[];
};

const WEB_BASE = "https://www.neurotrader-journal.com";

async function resolveActiveAccountId(userId: string): Promise<string | null> {
  if (!supabaseMobile || !userId) return null;
  const { data } = await supabaseMobile
    .from("user_preferences")
    .select("active_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.active_account_id ?? null;
}

export function BrokerConnectScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useSupabaseUser();

  const [broker, setBroker] = useState("");
  const [accounts, setAccounts] = useState<SnaptradeAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadActiveAccount = useCallback(async () => {
    if (!user?.id) return;
    const id = await resolveActiveAccountId(user.id);
    setActiveAccountId(id);
  }, [user?.id]);

  const loadAccounts = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setStatus(null);
      const data = await apiGet<AccountsResponse>("/api/snaptrade/accounts");
      const list = Array.isArray(data?.accounts) ? data.accounts : Array.isArray(data) ? (data as any) : [];
      setAccounts(list);
      if (!selectedAccountId && list.length > 0) {
        setSelectedAccountId(String(list[0]?.id ?? ""));
      }
      if (list.length === 0) {
        setStatus(
          t(
            language,
            "No brokerage accounts found yet. Connect a broker to continue.",
            "No se encontraron cuentas aún. Conecta un bróker para continuar."
          )
        );
      }
    } catch (err: any) {
      const message = err?.message ?? "SnapTrade error";
      setError(message);
      if (message.toLowerCase().includes("not connected")) {
        setStatus(
          t(
            language,
            "No broker connected yet. Tap Connect to start.",
            "Aún no hay un bróker conectado. Presiona Conectar para comenzar."
          )
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [language, selectedAccountId]);

  useEffect(() => {
    loadActiveAccount();
    loadAccounts();
  }, [loadActiveAccount, loadAccounts]);

  const handleConnect = useCallback(async () => {
    try {
      setConnecting(true);
      setError(null);
      setStatus(null);
      await apiPost("/api/snaptrade/register", {});
      const loginData = await apiPost<{ url?: string; redirectUri?: string; redirectURI?: string }>(
        "/api/snaptrade/login",
        {
          broker: broker.trim() || undefined,
          connectionType: "read",
          immediateRedirect: true,
          darkMode: true,
          customRedirect: `${WEB_BASE}/import?snaptrade=connected`,
        }
      );
      const url = loginData?.url || loginData?.redirectURI || loginData?.redirectUri || "";
      if (!url) {
        throw new Error(
          t(
            language,
            "Missing SnapTrade redirect URL.",
            "Falta el enlace de conexión de SnapTrade."
          )
        );
      }
      await Linking.openURL(url);
      setStatus(
        t(
          language,
          "Connection portal opened. Complete login, then refresh accounts here.",
          "Portal abierto. Completa el login y luego refresca las cuentas aquí."
        )
      );
    } catch (err: any) {
      setError(err?.message ?? "SnapTrade error");
    } finally {
      setConnecting(false);
    }
  }, [broker, language]);

  const handleReset = useCallback(async () => {
    try {
      setError(null);
      setStatus(null);
      await apiPost("/api/snaptrade/reset", {});
      setAccounts([]);
      setSelectedAccountId("");
      setStatus(
        t(
          language,
          "SnapTrade link reset. You can connect again.",
          "Enlace SnapTrade reiniciado. Puedes conectar de nuevo."
        )
      );
    } catch (err: any) {
      setError(err?.message ?? "SnapTrade error");
    }
  }, [language]);

  const handleSetActive = useCallback(async () => {
    if (!supabaseMobile || !user?.id || !selectedAccountId) return;
    try {
      setError(null);
      setStatus(null);
      const { error: upErr } = await supabaseMobile
        .from("user_preferences")
        .upsert(
          { user_id: user.id, active_account_id: selectedAccountId, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      if (upErr) throw upErr;
      setActiveAccountId(selectedAccountId);
      setStatus(
        t(language, "Active account updated.", "Cuenta activa actualizada.")
      );
    } catch (err: any) {
      setError(err?.message ?? "Failed to update active account.");
    }
  }, [selectedAccountId, user?.id, language]);

  const accountLabel = (acc: SnaptradeAccount) =>
    acc?.name ||
    acc?.account_name ||
    acc?.brokerage_authorization ||
    acc?.account_number ||
    acc?.institution_name ||
    acc?.id ||
    t(language, "Broker account", "Cuenta de bróker");

  return (
    <ScreenScaffold
      title={t(language, "Broker connections", "Conexión de bróker")}
      subtitle={t(
        language,
        "Connect your broker on mobile. Statement uploads remain on the web.",
        "Conecta tu bróker en móvil. El statement se sube en la web."
      )}
      refreshing={refreshing}
      onRefresh={() => loadAccounts(true)}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t(language, "SnapTrade", "SnapTrade")}</Text>
        <Text style={styles.sectionHint}>
          {t(
            language,
            "Connect once and refresh to sync accounts.",
            "Conecta una vez y refresca para sincronizar cuentas."
          )}
        </Text>
        <Text style={styles.fieldLabel}>{t(language, "Broker (optional)", "Bróker (opcional)")}</Text>
        <TextInput
          style={styles.input}
          value={broker}
          onChangeText={setBroker}
          placeholder={t(language, "Leave blank for all brokers", "Déjalo en blanco para todos")}
          placeholderTextColor={colors.textMuted}
        />
        <View style={styles.actionRow}>
          <Pressable style={[styles.button, connecting && styles.buttonDisabled]} onPress={handleConnect}>
            <Text style={styles.buttonText}>
              {connecting ? t(language, "Connecting…", "Conectando…") : t(language, "Connect broker", "Conectar bróker")}
            </Text>
          </Pressable>
          <Pressable style={[styles.outlineButton]} onPress={handleReset}>
            <Text style={styles.outlineButtonText}>{t(language, "Reset link", "Reiniciar enlace")}</Text>
          </Pressable>
        </View>
      </View>

      {status ? <Text style={styles.statusText}>{status}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t(language, "Broker accounts", "Cuentas del bróker")}</Text>
          <Pressable style={styles.outlineButtonSmall} onPress={() => loadAccounts(true)}>
            <Text style={styles.outlineButtonText}>{t(language, "Refresh", "Refrescar")}</Text>
          </Pressable>
        </View>
        {loading ? (
          <Text style={styles.sectionHint}>{t(language, "Loading accounts…", "Cargando cuentas…")}</Text>
        ) : accounts.length === 0 ? (
          <Text style={styles.sectionHint}>
            {t(language, "No accounts yet. Connect first.", "Aún no hay cuentas. Conecta primero.")}
          </Text>
        ) : (
          <View style={styles.accountList}>
            {accounts.map((acc) => {
              const id = String(acc?.id ?? "");
              const selected = id && id === selectedAccountId;
              const isActive = id && id === activeAccountId;
              return (
                <Pressable
                  key={`acc-${id}`}
                  style={[styles.accountCard, selected && styles.accountCardActive]}
                  onPress={() => setSelectedAccountId(id)}
                >
                  <Text style={styles.accountTitle}>{accountLabel(acc)}</Text>
                  <Text style={styles.accountMeta}>
                    {acc?.institution_name ?? acc?.brokerage_authorization ?? "—"}
                  </Text>
                  {isActive ? (
                    <Text style={styles.accountTag}>{t(language, "Active", "Activa")}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
        <Pressable
          style={[styles.button, !selectedAccountId && styles.buttonDisabled]}
          onPress={handleSetActive}
          disabled={!selectedAccountId}
        >
          <Text style={styles.buttonText}>{t(language, "Use selected account", "Usar cuenta seleccionada")}</Text>
        </Pressable>
      </View>
    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      gap: 10,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 16,
    },
    sectionHint: {
      color: colors.textMuted,
      fontSize: 12,
    },
    fieldLabel: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 4,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    actionRow: {
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap",
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      flexGrow: 1,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: colors.background,
      fontWeight: "700",
    },
    outlineButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    outlineButtonSmall: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    outlineButtonText: {
      color: colors.textPrimary,
      fontWeight: "600",
      fontSize: 12,
    },
    statusText: {
      color: colors.primary,
      fontSize: 12,
    },
    errorText: {
      color: colors.negative,
      fontSize: 12,
    },
    accountList: {
      gap: 10,
    },
    accountCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      backgroundColor: colors.surface,
      gap: 4,
    },
    accountCardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceAccent,
    },
    accountTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 14,
    },
    accountMeta: {
      color: colors.textMuted,
      fontSize: 12,
    },
    accountTag: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "700",
      marginTop: 4,
    },
  });
