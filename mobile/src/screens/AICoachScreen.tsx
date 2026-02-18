import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { apiPost } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useSupabaseUser } from "../lib/useSupabaseUser";
import { supabaseMobile } from "../lib/supabase";
import { type ThemeColors } from "../theme";
import { useTheme } from "../lib/ThemeContext";

type AICoachScreenProps = {
  onOpenModule: (title: string, description: string) => void;
};

type CoachThread = {
  id: string;
  title: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

type CoachMessage = {
  id: string;
  thread_id: string;
  role: "user" | "coach" | "system";
  content: string;
  created_at: string;
};

export function AICoachScreen({}: AICoachScreenProps) {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useSupabaseUser();
  const [threads, setThreads] = useState<CoachThread[]>([]);
  const [activeThread, setActiveThread] = useState<CoachThread | null>(null);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<CoachMessage>>(null);

  useEffect(() => {
    if (!supabaseMobile || !user?.id) return;
    const sb = supabaseMobile;
    const userId = user.id;
    let active = true;

    async function loadThreads() {
      try {
        setLoadingThreads(true);
        const { data, error } = await sb
          .from("ai_coach_threads")
          .select("id,title,summary,created_at,updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(20);

        if (error) throw error;
        if (!active) return;

        const rows = (data || []) as CoachThread[];
        if (!rows.length) {
          const created = await createNewThread();
          if (created) {
            setThreads([created]);
            setActiveThread(created);
          }
          return;
        }
        setThreads(rows);
        setActiveThread(rows[0]);
      } catch {
        if (!active) return;
      } finally {
        if (!active) return;
        setLoadingThreads(false);
      }
    }

    loadThreads();
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!supabaseMobile || !activeThread?.id) return;
    const sb = supabaseMobile;
    const threadId = activeThread.id;
    let active = true;

    async function loadMessages() {
      try {
        setLoadingMessages(true);
        const { data, error } = await sb
          .from("ai_coach_messages")
          .select("id,thread_id,role,content,created_at")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true })
          .limit(200);
        if (error) throw error;
        if (!active) return;
        setMessages((data || []) as CoachMessage[]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
      } catch {
        if (!active) return;
      } finally {
        if (!active) return;
        setLoadingMessages(false);
      }
    }

    loadMessages();
    return () => {
      active = false;
    };
  }, [activeThread?.id]);

  async function createNewThread() {
    if (!supabaseMobile || !user?.id) return null;
    const sb = supabaseMobile;
    const { data, error } = await sb
      .from("ai_coach_threads")
      .insert({ user_id: user.id, title: "AI Coaching", summary: null })
      .select("id,title,summary,created_at,updated_at")
      .single();
    if (error) return null;
    return data as CoachThread;
  }

  async function handleNewThread() {
    const created = await createNewThread();
    if (created) {
      setThreads((prev) => [created, ...prev]);
      setActiveThread(created);
      setMessages([]);
    }
  }

  const chatHistory = useMemo(() => {
    const tail = messages.slice(-12);
    return tail.map((m) => ({
      role: m.role === "coach" ? "coach" : "user",
      text: m.content,
      createdAt: m.created_at,
    }));
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || sending || !supabaseMobile || !user?.id || !activeThread?.id) return;
    const sb = supabaseMobile;
    const text = input.trim();
    setInput("");
    setSending(true);

    const optimistic: CoachMessage = {
      id: `local-${Date.now()}`,
      thread_id: activeThread.id,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const { data } = await sb
        .from("ai_coach_messages")
        .insert({
          thread_id: activeThread.id,
          user_id: user.id,
          role: "user",
          content: text,
        })
        .select("id,thread_id,role,content,created_at")
        .single();

      if (data) {
        setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? (data as CoachMessage) : m)));
      }

      await sb
        .from("ai_coach_threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", activeThread.id);

      const res = await apiPost<{ text: string }>("/api/ai-coach", {
        threadId: activeThread.id,
        chatHistory: [...chatHistory, { role: "user", text }],
        question: text,
        language,
      });

      const coachText = res?.text || t(language, "No response from coach.", "Sin respuesta del coach.");
      const { data: coachRow } = await sb
        .from("ai_coach_messages")
        .insert({
          thread_id: activeThread.id,
          user_id: user.id,
          role: "coach",
          content: coachText,
        })
        .select("id,thread_id,role,content,created_at")
        .single();

      if (coachRow) {
        setMessages((prev) => [...prev, coachRow as CoachMessage]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `coach-${Date.now()}`,
            thread_id: activeThread.id,
            role: "coach",
            content: coachText,
            created_at: new Date().toISOString(),
          },
        ]);
      }

      await sb
        .from("ai_coach_threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", activeThread.id);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          thread_id: activeThread?.id ?? "",
          role: "coach",
          content: t(language, "There was an error talking to the AI coach.", "Hubo un error con el coach AI."),
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  return (
    <ScreenScaffold
      title={t(language, "AI Coach", "AI Coach")}
      subtitle={t(
        language,
        "Live coaching based on your journal, plan, and performance.",
        "Coaching en vivo basado en tu journal, plan y desempeño."
      )}
    >
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>{t(language, "Sessions", "Sesiones")}</Text>
        <Pressable style={styles.newButton} onPress={handleNewThread}>
          <Text style={styles.newButtonText}>{t(language, "New session", "Nueva sesión")}</Text>
        </Pressable>
      </View>

      {loadingThreads ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>{t(language, "Loading sessions…", "Cargando sesiones…")}</Text>
        </View>
      ) : (
        <View style={styles.threadList}>
          {threads.map((thread) => {
            const isActive = thread.id === activeThread?.id;
            return (
              <Pressable
                key={thread.id}
                onPress={() => setActiveThread(thread)}
                style={[styles.threadCard, isActive && styles.threadCardActive]}
              >
                <Text style={styles.threadTitle}>{thread.title || "AI Coaching"}</Text>
                <Text style={styles.threadDate}>{(thread.updated_at || thread.created_at).slice(0, 10)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.chatCard}>
        <Text style={styles.cardTitle}>{t(language, "Conversation", "Conversación")}</Text>
        {loadingMessages ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>{t(language, "Loading messages…", "Cargando mensajes…")}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isUser = item.role === "user";
              return (
                <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleCoach]}>
                  <Text style={styles.bubbleText}>{item.content}</Text>
                  <Text style={styles.bubbleMeta}>{item.created_at.slice(11, 16)}</Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {t(
                  language,
                  "Ask your coach about your last trades, emotions, or discipline.",
                  "Pregunta al coach sobre tus trades, emociones o disciplina."
                )}
              </Text>
            }
          />
        )}
      </View>

      <KeyboardAvoidingView behavior="padding">
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={t(language, "Ask your coach…", "Pregunta al coach…")}
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <Pressable style={[styles.sendButton, sending && styles.sendButtonDisabled]} onPress={handleSend}>
            <Text style={styles.sendButtonText}>{sending ? "..." : t(language, "Send", "Enviar")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    kicker: {
      color: colors.textMuted,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: "700",
    },
    newButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    newButtonText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "700",
    },
    threadList: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    threadCard: {
      flexBasis: "48%",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 10,
      gap: 4,
    },
    threadCardActive: {
      borderColor: colors.primary,
      backgroundColor: "#0F2C2A",
    },
    threadTitle: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "700",
    },
    threadDate: {
      color: colors.textMuted,
      fontSize: 10,
    },
    chatCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
      gap: 6,
      minHeight: 280,
    },
    cardTitle: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    bubble: {
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginBottom: 6,
      maxWidth: "85%",
    },
    bubbleUser: {
      alignSelf: "flex-end",
      backgroundColor: "#0F2C2A",
      borderWidth: 1,
      borderColor: "#1EE6A8",
    },
    bubbleCoach: {
      alignSelf: "flex-start",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bubbleText: {
      color: colors.textPrimary,
      fontSize: 12,
      lineHeight: 18,
    },
    bubbleMeta: {
      marginTop: 4,
      color: colors.textMuted,
      fontSize: 9,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
    },
    input: {
      flex: 1,
      minHeight: 48,
      maxHeight: 140,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
    },
    sendButton: {
      borderRadius: 10,
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    sendButtonDisabled: {
      opacity: 0.6,
    },
    sendButtonText: {
      color: "#061122",
      fontSize: 12,
      fontWeight: "700",
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 12,
    },
  });
