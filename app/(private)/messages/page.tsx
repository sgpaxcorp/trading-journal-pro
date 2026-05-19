"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import TopNav from "@/app/components/TopNav";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import {
  addSupportMessage,
  createSupportTicket,
  getSignedAttachmentUrl,
  isAdminUser,
  listSupportMessages,
  listSupportTickets,
  requestSupportAgentReply,
  updateSupportTicket,
  updateSupportTicketStatus,
  uploadSupportAttachments,
  type SupportMessage,
  type SupportTicket,
  type SupportTicketStatus,
} from "@/lib/supportTicketsSupabase";

function ticketStatusLabel(status: SupportTicketStatus, isEs: boolean) {
  if (status === "waiting_user") return isEs ? "Esperando tu respuesta" : "Waiting on you";
  if (status === "waiting_support") return isEs ? "En soporte" : "Waiting on support";
  if (status === "closed") return isEs ? "Cerrado" : "Closed";
  return isEs ? "Abierto" : "Open";
}

function fmtDate(d?: string | null) {
  if (!d) return "-";
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return "-";
  const locale =
    typeof document !== "undefined"
      ? document.documentElement.lang || undefined
      : undefined;
  return new Date(t).toLocaleString(locale);
}

export default function SupportCenterPage() {
  const { user } = useAuth() as any;
  const userId = (user as any)?.id || (user as any)?.uid || "";
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [isAdmin, setIsAdmin] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [status, setStatus] = useState<SupportTicketStatus | "all">("open");
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | "mine" | "unassigned">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [newTicketAlert, setNewTicketAlert] = useState(false);
  const previousCount = useRef(0);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);

  const [replyBody, setReplyBody] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});

  const refreshTickets = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const admin = await isAdminUser(userId);
      setIsAdmin(admin);

      const res = await listSupportTickets({
        userId,
        status,
        includeAll: admin,
        limit: 100,
      });

      const nextTickets = res.ok ? res.tickets : [];
      setTickets(nextTickets);

      if (admin) {
        if (previousCount.current && nextTickets.length > previousCount.current) {
          setNewTicketAlert(true);
        }
        previousCount.current = nextTickets.length;
      }

      if (!selectedTicketId && nextTickets.length > 0) {
        setSelectedTicketId(nextTickets[0].id);
      }
      if (selectedTicketId && !nextTickets.some((ticket) => ticket.id === selectedTicketId)) {
        setSelectedTicketId(nextTickets[0]?.id ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedTicketId, status, userId]);

  useEffect(() => {
    refreshTickets();
  }, [refreshTickets]);

  useEffect(() => {
    if (!userId || !isAdmin) return;
    const channel = supabaseBrowser
      .channel(`support-tickets-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_tickets" },
        () => {
          setNewTicketAlert(true);
          refreshTickets();
        }
      )
      .subscribe();
    return () => {
      try {
        supabaseBrowser.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [isAdmin, refreshTickets, userId]);

  useEffect(() => {
    if (!selectedTicketId) {
      setMessages([]);
      return;
    }
    (async () => {
      const res = await listSupportMessages(selectedTicketId);
      setMessages(res.ok ? res.messages : []);
    })();
  }, [selectedTicketId]);

  useEffect(() => {
    const loadUrls = async () => {
      const next: Record<string, string> = {};
      for (const message of messages) {
        const attachments = (message.attachments ?? []) as any[];
        for (const attachment of attachments) {
          const path = String(attachment?.path ?? "");
          if (!path || attachmentUrls[path]) continue;
          const url = await getSignedAttachmentUrl(path);
          if (url) next[path] = url;
        }
      }
      if (Object.keys(next).length) {
        setAttachmentUrls((prev) => ({ ...prev, ...next }));
      }
    };
    loadUrls();
  }, [attachmentUrls, messages]);

  const filteredTickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = tickets;

    if (status !== "all") {
      list = list.filter((ticket) => ticket.status === status);
    }
    if (isAdmin && assigneeFilter !== "all") {
      list =
        assigneeFilter === "mine"
          ? list.filter((ticket) => ticket.assigned_to === userId)
          : list.filter((ticket) => !ticket.assigned_to);
    }
    if (!q) return list;

    return list.filter((ticket) => {
      return (
        String(ticket.subject ?? "").toLowerCase().includes(q) ||
        String(ticket.email ?? "").toLowerCase().includes(q) ||
        String(ticket.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [assigneeFilter, isAdmin, query, status, tickets, userId]);

  const stats = useMemo(() => {
    return {
      open: tickets.filter((ticket) => ticket.status === "open").length,
      waitingSupport: tickets.filter((ticket) => ticket.status === "waiting_support").length,
      waitingUser: tickets.filter((ticket) => ticket.status === "waiting_user").length,
      closed: tickets.filter((ticket) => ticket.status === "closed").length,
    };
  }, [tickets]);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;

  async function handleCreateTicket() {
    if (!userId || !composeBody.trim()) return;
    setSending(true);
    setNotice(null);
    try {
      const ticketRes = await createSupportTicket({
        userId,
        name: user?.user_metadata?.full_name || user?.email,
        email: user?.email,
        subject: composeSubject || L("Support request", "Solicitud de soporte"),
        message: undefined,
        source: "support_center",
      });
      if (!ticketRes.ok || !ticketRes.ticket) throw new Error(ticketRes.error || "Ticket failed");

      const ticketId = ticketRes.ticket.id;
      let attachments: any[] = [];
      if (composeFiles.length) {
        const uploaded = await uploadSupportAttachments({
          userId,
          ticketId,
          files: composeFiles,
        });
        if (!uploaded.ok) throw new Error(uploaded.error || "Upload failed");
        attachments = uploaded.attachments;
      }

      const msgRes = await addSupportMessage({
        ticketId,
        userId,
        message: composeBody,
        attachments,
        authorRole: "user",
      });
      if (!msgRes.ok) throw new Error(msgRes.error || "Message failed");

      const agentRes = await requestSupportAgentReply({ ticketId });
      setComposeBody("");
      setComposeSubject("");
      setComposeFiles([]);
      setComposeOpen(false);
      await refreshTickets();

      const latest = await listSupportMessages(ticketId);
      setMessages(latest.ok ? latest.messages : []);
      setSelectedTicketId(ticketId);
      setNotice(
        agentRes.ok && agentRes.canAnswer
          ? L(
              "Ticket created. The 24/7 virtual support agent replied below.",
              "Ticket creado. El agente virtual 24/7 respondió abajo."
            )
          : L(
              "Ticket created. We are reviewing it and will reply within 24 to 48 hours.",
              "Ticket creado. Ya lo estamos evaluando y responderemos en 24 a 48 horas."
            )
      );
    } catch (err) {
      console.error("[support] create failed", err);
      setNotice(L("We couldn't create the ticket.", "No pudimos crear el ticket."));
    } finally {
      setSending(false);
    }
  }

  async function handleReply() {
    if (!selectedTicket || !userId || !replyBody.trim()) return;
    setSending(true);
    setNotice(null);
    try {
      let attachments: any[] = [];
      if (replyFiles.length) {
        const uploaded = await uploadSupportAttachments({
          userId,
          ticketId: selectedTicket.id,
          files: replyFiles,
        });
        if (!uploaded.ok) throw new Error(uploaded.error || "Upload failed");
        attachments = uploaded.attachments;
      }

      const res = await addSupportMessage({
        ticketId: selectedTicket.id,
        userId,
        message: replyBody,
        attachments,
        authorRole: isAdmin ? "admin" : "user",
      });
      if (!res.ok) throw new Error(res.error || "Reply failed");

      const agentRes = !isAdmin
        ? await requestSupportAgentReply({ ticketId: selectedTicket.id })
        : null;

      setReplyBody("");
      setReplyFiles([]);
      await refreshTickets();
      const msgRes = await listSupportMessages(selectedTicket.id);
      setMessages(msgRes.ok ? msgRes.messages : []);
      setNotice(
        !isAdmin && agentRes?.ok && agentRes.canAnswer
          ? L(
              "Reply sent. The support agent also answered in the thread.",
              "Respuesta enviada. El agente de soporte también respondió en el hilo."
            )
          : !isAdmin
            ? L(
                "Reply sent. The case stays under review for a 24 to 48 hour follow-up if needed.",
                "Respuesta enviada. El caso queda bajo revisión para seguimiento en 24 a 48 horas si hace falta."
              )
            : L("Reply sent.", "Respuesta enviada.")
      );
    } catch (err) {
      console.error("[support] reply failed", err);
      setNotice(L("We couldn't send the reply.", "No pudimos enviar la respuesta."));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="mx-auto w-full max-w-7xl px-6 pb-24 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">
              {L("Support Center", "Centro de soporte")}
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">
              {L("24/7 Virtual Support + Tickets", "Soporte virtual 24/7 + tickets")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              {L(
                "Open a support ticket, attach screenshots, and let the virtual agent answer what it can immediately. Anything account-specific stays tracked until it is resolved.",
                "Abre un ticket, adjunta screenshots y deja que el agente virtual conteste lo que pueda al instante. Todo lo que requiera revisión de cuenta queda en seguimiento hasta resolverse."
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
              onClick={refreshTickets}
              disabled={loading}
            >
              {L("Refresh", "Actualizar")}
            </button>
            {!isAdmin && (
              <button
                onClick={() => setComposeOpen((value) => !value)}
                className="rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
              >
                {composeOpen ? L("Hide request", "Ocultar solicitud") : L("New support ticket", "Nuevo ticket")}
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {[
            [L("Open", "Abiertos"), stats.open],
            [L("Waiting support", "En soporte"), stats.waitingSupport],
            [L("Waiting user", "Esperando usuario"), stats.waitingUser],
            [L("Closed", "Cerrados"), stats.closed],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div>
            </div>
          ))}
        </div>

        {newTicketAlert && isAdmin && (
          <div className="mt-5 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200 flex items-center justify-between gap-2">
            <span>{L("New support ticket received.", "Nuevo ticket recibido.")}</span>
            <button
              className="rounded-full border border-emerald-300/60 px-3 py-1 text-[11px] font-semibold"
              onClick={() => setNewTicketAlert(false)}
            >
              {L("Dismiss", "Cerrar")}
            </button>
          </div>
        )}

        {notice && (
          <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-xs text-slate-300">
            {notice}
          </div>
        )}

        {composeOpen && !isAdmin && (
          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
              {L("New support request", "Nueva solicitud")}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                value={composeSubject}
                onChange={(event) => setComposeSubject(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                placeholder={L("Subject", "Asunto")}
              />
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => setComposeFiles(Array.from(event.target.files ?? []).slice(0, 3))}
                className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-300"
              />
              <textarea
                value={composeBody}
                onChange={(event) => setComposeBody(event.target.value)}
                rows={4}
                className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                placeholder={L("Describe the issue, request, or improvement you need…", "Describe el problema, solicitud o mejora que necesitas…")}
              />
              <div className="md:col-span-2 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-400">
                  {composeFiles.length
                    ? `${composeFiles.length} ${L("files selected", "archivos seleccionados")}`
                    : L("Optional screenshots help us solve it faster.", "Screenshots opcionales ayudan a resolver más rápido.")}
                </span>
                <button
                  onClick={handleCreateTicket}
                  className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                  disabled={sending || !composeBody.trim()}
                >
                  {sending ? L("Sending…", "Enviando…") : L("Send ticket", "Enviar ticket")}
                </button>
              </div>
            </div>
          </section>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/80">
                  {L("Tickets", "Tickets")}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {L("Every request stays visible until closed.", "Cada solicitud queda visible hasta cerrarse.")}
                </p>
              </div>
              <div className="flex min-w-[220px] items-center gap-2 rounded-full border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-300">
                <Search className="h-4 w-4 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
                  placeholder={L("Search tickets...", "Buscar tickets...")}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {(["all", "open", "waiting_support", "waiting_user", "closed"] as const).map((item) => (
                <button
                  key={item}
                  onClick={() => setStatus(item)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    status === item
                      ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                      : "border-slate-700 bg-slate-900/40 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-200"
                  }`}
                >
                  {item === "all" ? L("All", "Todos") : ticketStatusLabel(item, isEs)}
                </button>
              ))}
            </div>

            {isAdmin && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span className="uppercase tracking-[0.2em]">{L("Assigned", "Asignado")}</span>
                {(["all", "mine", "unassigned"] as const).map((item) => (
                  <button
                    key={item}
                    onClick={() => setAssigneeFilter(item)}
                    className={`rounded-full border px-3 py-1 ${
                      assigneeFilter === item
                        ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                        : "border-slate-700 bg-slate-900/40 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-200"
                    }`}
                  >
                    {item === "all" ? L("All", "Todos") : item === "mine" ? L("Mine", "Míos") : L("Unassigned", "Sin asignar")}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-2">
              {loading && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
                  {L("Loading tickets…", "Cargando tickets…")}
                </div>
              )}
              {!loading && filteredTickets.length === 0 && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
                  {L("No tickets yet.", "Aún no hay tickets.")}
                </div>
              )}
              {filteredTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left text-xs transition ${
                    selectedTicketId === ticket.id
                      ? "border-emerald-400/60 bg-emerald-500/10"
                      : "border-slate-800 bg-slate-950/40 hover:border-emerald-400/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-slate-100">{ticket.subject || L("Support request", "Solicitud")}</div>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
                      {ticketStatusLabel(ticket.status, isEs)}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    {ticket.email ? ticket.email : L("In-app request", "Solicitud dentro del app")}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                    <span>
                      {L("Priority", "Prioridad")}:{" "}
                      <span className="text-slate-300">{ticket.priority ?? "normal"}</span>
                    </span>
                    {isAdmin && (
                      <span>
                        {ticket.assigned_to
                          ? ticket.assigned_to === userId
                            ? L("Assigned to you", "Asignado a ti")
                            : L("Assigned", "Asignado")
                          : L("Unassigned", "Sin asignar")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {L("Updated", "Actualizado")}: {fmtDate(ticket.last_message_at)}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            {!selectedTicket && (
              <div className="text-sm text-slate-400">
                {L("Select a ticket to view the conversation.", "Selecciona un ticket para ver la conversación.")}
              </div>
            )}

            {selectedTicket && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                      {L("Conversation", "Conversación")}
                    </div>
                    <h3 className="mt-1 text-lg font-semibold text-slate-100">
                      {selectedTicket.subject || L("Support request", "Solicitud")}
                    </h3>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {ticketStatusLabel(selectedTicket.status, isEs)} · {fmtDate(selectedTicket.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isAdmin && (
                      <>
                        <select
                          value={selectedTicket.priority ?? "normal"}
                          onChange={async (event) => {
                            const next = event.target.value as any;
                            await updateSupportTicket(selectedTicket.id, { priority: next });
                            await refreshTickets();
                          }}
                          className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1 text-[11px] text-slate-200"
                        >
                          <option value="low">{L("Low", "Baja")}</option>
                          <option value="normal">{L("Normal", "Normal")}</option>
                          <option value="high">{L("High", "Alta")}</option>
                          <option value="urgent">{L("Urgent", "Urgente")}</option>
                        </select>
                        <button
                          onClick={async () => {
                            if (!userId) return;
                            const assignTo = selectedTicket.assigned_to === userId ? null : userId;
                            await updateSupportTicket(selectedTicket.id, {
                              assigned_to: assignTo,
                              assigned_at: assignTo ? new Date().toISOString() : null,
                            });
                            await refreshTickets();
                          }}
                          className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:border-emerald-400/50"
                        >
                          {selectedTicket.assigned_to === userId ? L("Unassign", "Desasignar") : L("Assign to me", "Asignarme")}
                        </button>
                      </>
                    )}
                    {selectedTicket.status !== "closed" && (
                      <button
                        onClick={async () => {
                          await updateSupportTicketStatus(selectedTicket.id, "closed");
                          await refreshTickets();
                        }}
                        className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:border-emerald-400/50"
                      >
                        {L("Close ticket", "Cerrar ticket")}
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-2">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-xl border px-4 py-3 text-xs ${
                        message.author_role === "assistant"
                          ? "border-sky-400/30 bg-sky-500/10"
                          : message.author_role === "admin"
                            ? "border-emerald-400/30 bg-emerald-500/10"
                            : "border-slate-800 bg-slate-950/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold text-slate-200">
                          {message.author_role === "assistant"
                            ? L("Virtual support agent", "Agente virtual de soporte")
                            : message.author_role === "admin"
                              ? L("Support team", "Equipo de soporte")
                              : L("You", "Tú")}
                        </div>
                        <div className="text-[10px] text-slate-500">{fmtDate(message.created_at)}</div>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-slate-100">{message.message}</div>
                      {(message.attachments ?? []).length > 0 && (
                        <div className="mt-3 space-y-1">
                          {(message.attachments ?? []).map((attachment: any, idx: number) => {
                            const path = String(attachment?.path ?? "");
                            const url = path ? attachmentUrls[path] : null;
                            return (
                              <div key={`${message.id}-${idx}`} className="text-[11px] text-emerald-200">
                                {url ? (
                                  <a className="hover:underline" href={url} target="_blank" rel="noreferrer">
                                    {attachment?.name || L("Attachment", "Adjunto")}
                                  </a>
                                ) : (
                                  <span>{attachment?.name || L("Attachment", "Adjunto")}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <textarea
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    placeholder={L("Write a reply…", "Escribe una respuesta…")}
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => setReplyFiles(Array.from(event.target.files ?? []).slice(0, 3))}
                      className="text-[11px] text-slate-300"
                    />
                    <button
                      onClick={handleReply}
                      disabled={sending || !replyBody.trim()}
                      className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                    >
                      {sending ? L("Sending…", "Enviando…") : L("Send reply", "Enviar respuesta")}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
