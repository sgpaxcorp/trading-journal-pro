"use client";

import { supabaseBrowser } from "@/lib/supaBaseClient";

export type SupportTicketStatus = "open" | "waiting_support" | "waiting_user" | "closed";
export type SupportTicketPriority = "low" | "normal" | "high" | "urgent";
export type SupportMessageAuthorRole = "user" | "admin" | "assistant" | "system";

export type SupportAttachment = {
  path: string;
  name: string;
  size?: number | null;
  type?: string | null;
};

export type SupportTicket = {
  id: string;
  user_id: string | null;
  name?: string | null;
  email?: string | null;
  subject?: string | null;
  status: SupportTicketStatus;
  priority?: SupportTicketPriority | null;
  source?: string | null;
  assigned_to?: string | null;
  assigned_at?: string | null;
  last_message_at?: string | null;
  last_message_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  user_id: string | null;
  author_role?: SupportMessageAuthorRole | string | null;
  message: string;
  attachments?: SupportAttachment[] | null;
  created_at?: string | null;
};

const LOG = "[supportTickets]";

export async function isAdminUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabaseBrowser
    .from("admin_users")
    .select("user_id,active,role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.user_id) && data?.active !== false;
}

export async function listSupportTickets(params: {
  userId: string;
  status?: SupportTicketStatus | "all";
  limit?: number;
  includeAll?: boolean; // admin-only
}) {
  const limit = Math.max(1, Math.min(200, params.limit ?? 50));
  let q = supabaseBrowser
    .from("support_tickets")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(limit);

  if (!params.includeAll) {
    q = q.eq("user_id", params.userId);
  }
  if (params.status && params.status !== "all") {
    q = q.eq("status", params.status);
  }

  const { data, error } = await q;
  if (error) {
    return { ok: false as const, error: error.message, tickets: [] as SupportTicket[] };
  }
  return { ok: true as const, tickets: (data ?? []) as SupportTicket[] };
}

export async function listSupportMessages(ticketId: string) {
  if (!ticketId) return { ok: false as const, error: "Missing ticket id", messages: [] as SupportMessage[] };
  const { data, error } = await supabaseBrowser
    .from("support_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false as const, error: error.message, messages: [] };
  return { ok: true as const, messages: (data ?? []) as SupportMessage[] };
}

export async function createSupportTicket(input: {
  userId: string;
  name?: string | null;
  email?: string | null;
  subject: string;
  message?: string;
  attachments?: SupportAttachment[];
  source?: string;
}) {
  const now = new Date().toISOString();
  const { data: ticket, error } = await supabaseBrowser
    .from("support_tickets")
    .insert({
      user_id: input.userId,
      name: input.name ?? null,
      email: input.email ?? null,
      subject: input.subject,
      status: "open",
      priority: "normal",
      source: input.source ?? "inapp",
      last_message_at: now,
      last_message_by: "user",
    })
    .select("*")
    .maybeSingle();

  if (error || !ticket) {
    return { ok: false as const, error: error?.message ?? "Ticket creation failed", ticket: null };
  }

  if (input.message) {
    const { error: msgErr } = await supabaseBrowser.from("support_messages").insert({
      ticket_id: (ticket as any).id,
      user_id: input.userId,
      author_role: "user",
      message: input.message,
      attachments: input.attachments ?? [],
    });

    if (msgErr) {
      console.warn(LOG, "message insert failed", msgErr);
    }
  }

  return { ok: true as const, ticket: ticket as SupportTicket };
}

export async function addSupportMessage(input: {
  ticketId: string;
  userId: string;
  message: string;
  attachments?: SupportAttachment[];
  authorRole: SupportMessageAuthorRole;
}) {
  const { error } = await supabaseBrowser.from("support_messages").insert({
    ticket_id: input.ticketId,
    user_id: input.userId,
    author_role: input.authorRole,
    message: input.message,
    attachments: input.attachments ?? [],
  });
  if (error) {
    return { ok: false as const, error: error.message };
  }

  const status = input.authorRole === "admin" ? "waiting_user" : "waiting_support";
  await supabaseBrowser
    .from("support_tickets")
    .update({
      status,
      last_message_at: new Date().toISOString(),
      last_message_by: input.authorRole,
    })
    .eq("id", input.ticketId);

  return { ok: true as const };
}

export async function requestSupportAgentReply(input: {
  ticketId: string;
  dryRun?: boolean;
}) {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    return { ok: false as const, error: "Missing session" };
  }

  const res = await fetch("/api/support/agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ticketId: input.ticketId,
      dryRun: input.dryRun === true,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false as const,
      error: String(body?.error ?? "Support agent request failed"),
    };
  }

  return {
    ok: true as const,
    canAnswer: Boolean(body?.canAnswer),
    reply: String(body?.reply ?? ""),
    skipped: Boolean(body?.skipped),
    status: String(body?.status ?? ""),
  };
}

export async function updateSupportTicketStatus(ticketId: string, status: SupportTicketStatus) {
  const { error } = await supabaseBrowser
    .from("support_tickets")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function updateSupportTicket(
  ticketId: string,
  input: Partial<Pick<SupportTicket, "status" | "priority" | "assigned_to" | "assigned_at">>
) {
  const payload: Record<string, any> = { ...input, updated_at: new Date().toISOString() };
  const { error } = await supabaseBrowser.from("support_tickets").update(payload).eq("id", ticketId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function uploadSupportAttachments(params: {
  userId: string;
  ticketId: string;
  files: File[];
}) {
  const files = params.files ?? [];
  if (!files.length) return { ok: true as const, attachments: [] as SupportAttachment[] };
  const uploaded: SupportAttachment[] = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${params.userId}/${params.ticketId}/${Date.now()}-${safeName}`;
    const { error } = await supabaseBrowser.storage
      .from("support_attachments")
      .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });
    if (error) {
      return { ok: false as const, error: error.message, attachments: [] as SupportAttachment[] };
    }
    uploaded.push({ path, name: file.name, size: file.size, type: file.type });
  }
  return { ok: true as const, attachments: uploaded };
}

export async function getSignedAttachmentUrl(path: string) {
  const { data, error } = await supabaseBrowser.storage
    .from("support_attachments")
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}
