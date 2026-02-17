import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ModuleTile } from "../components/ModuleTile";
import { ScreenScaffold } from "../components/ScreenScaffold";
import { hasSupabaseConfig } from "../lib/supabase";
import { COLORS } from "../theme";

type AICoachScreenProps = {
  onOpenModule: (title: string, description: string) => void;
};

export function AICoachScreen({ onOpenModule }: AICoachScreenProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "coach"; text: string }>>([
    {
      role: "coach",
      text:
        "Modo objetivo activo. Te voy a responder solo con evidencia de tu data (journal + stats + plan + audit).",
    },
  ]);

  const canSend = draft.trim().length > 0;
  const envStatus = useMemo(
    () => (hasSupabaseConfig ? "Supabase config: OK" : "Supabase config: missing (.env)"),
    []
  );

  function onSend() {
    if (!canSend) return;
    const text = draft.trim();
    setDraft("");
    setMessages((prev) => [
      ...prev,
      { role: "user", text },
      {
        role: "coach",
        text:
          "Scaffold inicial móvil: próxima iteración conecta este chat al endpoint real de AI coaching con contexto de journal y audit.",
      },
    ]);
  }

  return (
    <ScreenScaffold
      title="AI Coaching"
      subtitle="Base del chat móvil. Regla: no inventar, no asumir, razonar con data real."
    >
      <View style={styles.statusBox}>
        <Text style={styles.statusTitle}>Connection status</Text>
        <Text style={styles.statusText}>{envStatus}</Text>
      </View>

      <View style={styles.chatBox}>
        {messages.slice(-4).map((m, idx) => (
          <View key={`${m.role}-${idx}`} style={[styles.msg, m.role === "user" ? styles.userMsg : styles.coachMsg]}>
            <Text style={styles.msgRole}>{m.role === "user" ? "You" : "Coach"}</Text>
            <Text style={styles.msgText}>{m.text}</Text>
          </View>
        ))}
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Write your question..."
          placeholderTextColor={COLORS.textMuted}
          multiline
        />
        <Pressable onPress={onSend} disabled={!canSend} style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}>
          <Text style={styles.sendBtnText}>Send</Text>
        </Pressable>
      </View>

      <ModuleTile
        title="Audit bridge"
        description="Consultar primero el audit antes del coaching para feedback más preciso."
        iconName="shield-checkmark-outline"
        onPress={() =>
          onOpenModule(
            "Audit bridge",
            "Plan: traer resumen del audit y exponerlo como contexto principal del coach."
          )
        }
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  statusBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 12,
    gap: 4,
  },
  statusTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: COLORS.primary,
  },
  statusText: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  chatBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 12,
    gap: 8,
  },
  msg: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 3,
  },
  userMsg: {
    borderColor: "#3359B8",
    backgroundColor: "#0E1F55",
  },
  coachMsg: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  msgRole: {
    color: COLORS.textMuted,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  msgText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    minHeight: 80,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    color: COLORS.textPrimary,
    padding: 10,
    textAlignVertical: "top",
    fontSize: 13,
  },
  sendBtn: {
    alignSelf: "flex-end",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    color: "#061122",
    fontSize: 12,
    fontWeight: "700",
  },
});
