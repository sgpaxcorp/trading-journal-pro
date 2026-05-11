"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import {
  addSupportMessage,
  getSignedAttachmentUrl,
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

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function ticketStatusLabel(status: SupportTicketStatus, isEs: boolean) {
  if (status === "waiting_user") return isEs ? "Esperando usuario" : "Waiting on user";
  if (status === "waiting_support") return isEs ? "Pendiente staff" : "Needs staff";
  if (status === "closed") return isEs ? "Cerrado" : "Closed";
  return isEs ? "Abierto" : "Open";
}

function authorLabel(role: string | null | undefined, isEs: boolean) {
  if (role === "assistant") return isEs ? "Agente de servicio" : "Service agent";
  if (role === "admin") return isEs ? "Staff" : "Staff";
  if (role === "system") return isEs ? "Sistema" : "System";
  return isEs ? "Usuario" : "User";
}

export default function AdminSupportInbox({ lang }: { lang: string }) {
  const { user } = useAuth() as any;
  const userId = (user as any)?.id || (user as any)?.uid || "";
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | "all">("open");
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | "mine" | "unassigned">("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});

  const refreshTickets = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await listSupportTickets({
        userId,
        status: statusFilter,
        includeAll: true,
        limit: 200,
      });
      const nextTickets = result.ok ? result.tickets : [];
      setTickets(nextTickets);
      setSelectedTicketId((current) => {
        if (!current && nextTickets.length) return nextTickets[0].id;
        if (current && !nextTickets.some((ticket) => ticket.id === current)) {
          return nextTickets[0]?.id ?? null;
        }
        return current;
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, userId]);

  const refreshMessages = useCallback(async (ticketId: string) => {
    const result = await listSupportMessages(ticketId);
    setMessages(result.ok ? result.messages : []);
  }, []);

  useEffect(() => {
    refreshTickets();
  }, [refreshTickets]);

  useEffect(() => {
    if (!selectedTicketId) {
      setMessages([]);
      return;
    }
    refreshMessages(selectedTicketId);
  }, [refreshMessages, selectedTicketId]);

  useEffect(() => {
    const loadUrls = async () => {
      const pending: Record<string, string> = {};
      for (const message of messages) {
        for (const attachment of message.attachments ?? []) {
          const path = String(attachment?.path ?? "");
          if (!path || attachmentUrls[path]) continue;
          const signed = await getSignedAttachmentUrl(path);
          if (signed) pending[path] = signed;
        }
      }
      if (Object.keys(pending).length) {
        setAttachmentUrls((prev) => ({ ...prev, ...pending }));
      }
    };
    loadUrls();
  }, [attachmentUrls, messages]);

  const filteredTickets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let next = tickets;

    if (assigneeFilter === "mine") {
      next = next.filter((ticket) => ticket.assigned_to === userId);
    } else if (assigneeFilter === "unassigned") {
      next = next.filter((ticket) => !ticket.assigned_to);
    }

    if (!normalized) return next;
    return next.filter((ticket) => {
      return (
        String(ticket.subject ?? "").toLowerCase().includes(normalized) ||
        String(ticket.email ?? "").toLowerCase().includes(normalized) ||
        String(ticket.name ?? "").toLowerCase().includes(normalized)
      );
    });
  }, [assigneeFilter, query, tickets, userId]);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;

  const queueStats = useMemo(() => {
    return {
      open: tickets.filter((ticket) => ticket.status === "open").length,
      staff: tickets.filter((ticket) => ticket.status === "waiting_support").length,
      user: tickets.filter((ticket) => ticket.status === "waiting_user").length,
      closed: tickets.filter((ticket) => ticket.status === "closed").length,
    };
  }, [tickets]);

  async function handleRunAgent(dryRun = false) {
    if (!selectedTicketId) return;
    setAgentBusy(true);
    setNotice(null);
    try {
      const result = await requestSupportAgentReply({ ticketId: selectedTicketId, dryRun });
      if (!result.ok) {
        setNotice(result.error);
        return;
      }
      if (result.skipped) {
        setNotice(L("The latest message already has a staff or agent response.", "El último mensaje ya tiene respuesta de staff o del agente."));
        return;
      }
      setNotice(
        result.canAnswer
          ? L("Service agent replied on this thread.", "El agente respondió en este hilo.")
          : L("Agent left the 24–48 hour follow-up note for staff review.", "El agente dejó la nota de seguimiento de 24–48 horas para revisión del staff.")
      );
      if (!dryRun) {
        await refreshTickets();
        await refreshMessages(selectedTicketId);
      }
    } finally {
      setAgentBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
            {L("Admin inbox", "Inbox admin")}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-100">
            {L("Support queue and service agent", "Cola de soporte y agente de servicio")}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {L(
              "Read user tickets here, let the service agent answer clear questions, and keep the hard cases for human follow-up.",
              "Lee aquí los tickets de usuarios, deja que el agente responda las preguntas claras y reserva los casos difíciles para seguimiento humano."
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => refreshTickets()}
            className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/50"
          >
            {L("Refresh inbox", "Actualizar inbox")}
          </button>
          <button
            type="button"
            onClick={() => handleRunAgent(false)}
            disabled={!selectedTicketId || agentBusy}
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50"
          >
            {agentBusy ? L("Reviewing…", "Revisando…") : L("Run service agent", "Correr agente")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Open", "Abiertos")}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-100">{queueStats.open}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Needs staff", "Pendientes staff")}</div>
          <div className="mt-2 text-2xl font-semibold text-amber-200">{queueStats.staff}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Waiting user", "Esperando usuario")}</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-200">{queueStats.user}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Closed", "Cerrados")}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-100">{queueStats.closed}</div>
        </div>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "open", "waiting_support", "waiting_user", "closed"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                  statusFilter === status
                    ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                    : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-200"
                }`}
              >
                {status === "all" ? L("All", "Todos") : ticketStatusLabel(status, isEs)}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(["all", "mine", "unassigned"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAssigneeFilter(value)}
                className={`rounded-full border px-3 py-1 text-[11px] ${
                  assigneeFilter === value
                    ? "border-sky-400/50 bg-sky-500/10 text-sky-100"
                    : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-sky-400/40 hover:text-sky-100"
                }`}
              >
                {value === "all" ? L("All assignees", "Todos") : value === "mine" ? L("Assigned to me", "Asignados a mí") : L("Unassigned", "Sin asignar")}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={L("Search by subject, user, or email…", "Busca por asunto, usuario o email…")}
              className="w-full bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-500"
            />
          </div>

          <div className="mt-4 space-y-2">
            {loading ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">
                {L("Loading support inbox…", "Cargando inbox…")}
              </div>
            ) : null}
            {!loading && !filteredTickets.length ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">
                {L("No tickets match this filter.", "No hay tickets para este filtro.")}
              </div>
            ) : null}

            {filteredTickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => setSelectedTicketId(ticket.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  selectedTicketId === ticket.id
                    ? "border-emerald-400/60 bg-emerald-500/10"
                    : "border-slate-800 bg-slate-950/40 hover:border-emerald-400/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-100">
                      {ticket.subject || L("Support request", "Solicitud de soporte")}
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-400">
                      {ticket.name || ticket.email || L("In-app user", "Usuario de la app")}
                    </div>
                  </div>
                  <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-300">
                    {ticketStatusLabel(ticket.status, isEs)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    {ticket.assigned_to
                      ? ticket.assigned_to === userId
                        ? L("Assigned to you", "Asignado a ti")
                        : L("Assigned", "Asignado")
                      : L("Unassigned", "Sin asignar")}
                  </span>
                  <span>{fmtDate(ticket.last_message_at)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          {!selectedTicket ? (
            <div className="text-sm text-slate-400">
              {L("Select a ticket to open the conversation.", "Selecciona un ticket para abrir la conversación.")}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    {L("Conversation", "Conversación")}
                  </p>
                  <div className="text-xl font-semibold text-slate-100">
                    {selectedTicket.subject || L("Support request", "Solicitud de soporte")}
                  </div>
                  <div className="text-sm text-slate-400">
                    {(selectedTicket.name || selectedTicket.email || L("User", "Usuario"))} · {fmtDate(selectedTicket.created_at)}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedTicket.priority ?? "normal"}
                    onChange={async (event) => {
                      await updateSupportTicket(selectedTicket.id, { priority: event.target.value as any });
                      await refreshTickets();
                    }}
                    className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-2 text-[11px] text-slate-200"
                  >
                    <option value="low">{L("Low", "Baja")}</option>
                    <option value="normal">{L("Normal", "Normal")}</option>
                    <option value="high">{L("High", "Alta")}</option>
                    <option value="urgent">{L("Urgent", "Urgente")}</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      const assignTo = selectedTicket.assigned_to === userId ? null : userId;
                      await updateSupportTicket(selectedTicket.id, {
                        assigned_to: assignTo,
                        assigned_at: assignTo ? new Date().toISOString() : null,
                      });
                      await refreshTickets();
                    }}
                    className="rounded-full border border-slate-700 px-3 py-2 text-[11px] text-slate-300 hover:border-emerald-400/50"
                  >
                    {selectedTicket.assigned_to === userId ? L("Unassign", "Desasignar") : L("Assign to me", "Asignarme")}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const next = selectedTicket.status === "closed" ? "open" : "closed";
                      await updateSupportTicketStatus(selectedTicket.id, next);
                      await refreshTickets();
                    }}
                    className="rounded-full border border-slate-700 px-3 py-2 text-[11px] text-slate-300 hover:border-emerald-400/50"
                  >
                    {selectedTicket.status === "closed" ? L("Reopen", "Reabrir") : L("Close ticket", "Cerrar ticket")}
                  </button>
                </div>
              </div>

              <div className="mt-5 max-h-[460px] space-y-3 overflow-y-auto pr-1">
                {messages.map((message) => {
                  const role = String(message.author_role || "user");
                  const roleClass =
                    role === "assistant"
                      ? "border-sky-400/30 bg-sky-500/10"
                      : role === "admin"
                        ? "border-emerald-400/30 bg-emerald-500/10"
                        : "border-slate-800 bg-slate-950/40";

                  return (
                    <div key={message.id} className={`rounded-2xl border px-4 py-3 text-sm ${roleClass}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                          {authorLabel(role, isEs)}
                        </div>
                        <div className="text-[10px] text-slate-500">{fmtDate(message.created_at)}</div>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-slate-100">{message.message}</div>
                      {(message.attachments ?? []).length > 0 ? (
                        <div className="mt-3 space-y-1">
                          {(message.attachments ?? []).map((attachment: any, index: number) => {
                            const path = String(attachment?.path ?? "");
                            const url = path ? attachmentUrls[path] : null;
                            return (
                              <div key={`${message.id}-${index}`} className="text-xs text-emerald-200">
                                {url ? (
                                  <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
                                    {attachment?.name || L("Attachment", "Adjunto")}
                                  </a>
                                ) : (
                                  <span>{attachment?.name || L("Attachment", "Adjunto")}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <textarea
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  rows={4}
                  placeholder={L("Write the staff reply…", "Escribe la respuesta del staff…")}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400"
                />
                <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => setReplyFiles(Array.from(event.target.files ?? []).slice(0, 3))}
                    className="text-[11px] text-slate-300"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleRunAgent(false)}
                      disabled={agentBusy}
                      className="rounded-full border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-100 disabled:opacity-50"
                    >
                      {agentBusy ? L("Reviewing…", "Revisando…") : L("Ask agent first", "Pedirle al agente")}
                    </button>
                    <button
                      type="button"
                      disabled={sending || !replyBody.trim() || !selectedTicket}
                      onClick={async () => {
                        if (!selectedTicket || !replyBody.trim() || !userId) return;
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
                          const result = await addSupportMessage({
                            ticketId: selectedTicket.id,
                            userId,
                            message: replyBody,
                            attachments,
                            authorRole: "admin",
                          });
                          if (!result.ok) throw new Error(result.error || "Reply failed");
                          setReplyBody("");
                          setReplyFiles([]);
                          await refreshTickets();
                          await refreshMessages(selectedTicket.id);
                          setNotice(L("Staff reply sent.", "Respuesta enviada."));
                        } catch (error: any) {
                          setNotice(String(error?.message ?? L("We couldn't send the reply.", "No pudimos enviar la respuesta.")));
                        } finally {
                          setSending(false);
                        }
                      }}
                      className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {sending ? L("Sending…", "Enviando…") : L("Send staff reply", "Enviar respuesta")}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
