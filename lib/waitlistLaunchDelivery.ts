import "server-only";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { WAITLIST_CAMPAIGN } from "@/lib/waitlistCampaign";
import {
  getWaitlistLaunchEmailStatus,
  getWaitlistLaunchPromoCode,
  sendWaitlistLaunchDiscountEmail,
} from "@/lib/waitlistLaunchEmail";

type LaunchChannel = "email" | "push" | "inapp";
type DispatchMode = "pending" | "failed";
type LaunchStatus = "pending" | "processing" | "sent" | "failed" | "unavailable";

type WaitlistDeliveryRow = {
  id: string;
  position: number;
  name: string | null;
  email: string;
  email_normalized: string;
  linked_user_id: string | null;
  launch_discount_email_status: LaunchStatus;
  launch_discount_push_status: LaunchStatus;
  launch_discount_inapp_status: LaunchStatus;
};

type StatusColumns = {
  status: keyof WaitlistDeliveryRow;
  sentAt: string;
  error: string;
};

const CHANNEL_COLUMNS: Record<LaunchChannel, StatusColumns> = {
  email: {
    status: "launch_discount_email_status",
    sentAt: "launch_discount_email_sent_at",
    error: "launch_discount_email_error",
  },
  push: {
    status: "launch_discount_push_status",
    sentAt: "launch_discount_push_sent_at",
    error: "launch_discount_push_error",
  },
  inapp: {
    status: "launch_discount_inapp_status",
    sentAt: "launch_discount_inapp_sent_at",
    error: "launch_discount_inapp_error",
  },
};

function isExpoPushToken(value: string) {
  return value.startsWith("ExponentPushToken") || value.startsWith("ExpoPushToken");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown delivery error";
}

async function setChannelStatus(
  rowId: string,
  channel: LaunchChannel,
  status: LaunchStatus,
  error: string | null = null
) {
  const columns = CHANNEL_COLUMNS[channel];
  const payload: Record<string, unknown> = {
    [columns.status]: status,
    [columns.error]: error,
  };
  if (status === "sent") payload[columns.sentAt] = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from("launch_waitlist")
    .update(payload)
    .eq("id", rowId);
  if (updateError) throw new Error(updateError.message);
}

async function claimChannel(rowId: string, channel: LaunchChannel, mode: DispatchMode) {
  const columns = CHANNEL_COLUMNS[channel];
  const expected = mode === "failed" ? "failed" : "pending";
  const { data, error } = await supabaseAdmin
    .from("launch_waitlist")
    .update({ [columns.status]: "processing", [columns.error]: null })
    .eq("id", rowId)
    .eq(columns.status, expected)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

async function resolveLinkedUser(row: WaitlistDeliveryRow) {
  if (row.linked_user_id) return row.linked_user_id;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", row.email_normalized)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const userId = String(data?.id || "");
  if (!userId) return null;

  const { error: updateError } = await supabaseAdmin
    .from("launch_waitlist")
    .update({ linked_user_id: userId })
    .eq("id", row.id);
  if (updateError) throw new Error(updateError.message);
  row.linked_user_id = userId;
  return userId;
}

async function createPlatformMessage(row: WaitlistDeliveryRow, userId: string) {
  const emailStatus = getWaitlistLaunchEmailStatus();
  const promoCode = getWaitlistLaunchPromoCode();
  const subject = "Your NeuroTrader annual launch discount";
  const message = [
    `Your ${WAITLIST_CAMPAIGN.discountPercent}% annual launch discount is ready.`,
    `Promo code: ${promoCode}`,
    `Activate annual access: ${emailStatus.discountUrl}`,
    "This offer is connected to your eligible launch waitlist registration.",
  ].join("\n\n");

  const { data: existingTicket, error: ticketLookupError } = await supabaseAdmin
    .from("support_tickets")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "waitlist_launch")
    .limit(1)
    .maybeSingle();
  if (ticketLookupError) throw new Error(ticketLookupError.message);

  let ticketId = String(existingTicket?.id || "");
  if (!ticketId) {
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("support_tickets")
      .insert({
        user_id: userId,
        name: row.name,
        email: row.email,
        subject,
        status: "open",
        priority: "normal",
        source: "waitlist_launch",
        last_message_at: new Date().toISOString(),
        last_message_by: "admin",
      })
      .select("id")
      .single();
    if (ticketError) throw new Error(ticketError.message);
    ticketId = String(ticket?.id || "");
  }

  const { data: existingMessage, error: messageLookupError } = await supabaseAdmin
    .from("support_messages")
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("author_role", "admin")
    .limit(1)
    .maybeSingle();
  if (messageLookupError) throw new Error(messageLookupError.message);

  if (!existingMessage?.id) {
    const { error: messageError } = await supabaseAdmin.from("support_messages").insert({
      ticket_id: ticketId,
      user_id: null,
      author_role: "admin",
      message,
      attachments: [],
    });
    if (messageError) throw new Error(messageError.message);
  }
}

async function sendMobilePush(userId: string) {
  const promoCode = getWaitlistLaunchPromoCode();
  const { data, error } = await supabaseAdmin
    .from("push_tokens")
    .select("expo_push_token")
    .eq("user_id", userId)
    .eq("marketing_push_enabled", true);
  if (error) throw new Error(error.message);

  const tokens = Array.from(
    new Set(
      (data ?? [])
        .map((row: { expo_push_token?: string | null }) => String(row.expo_push_token || "").trim())
        .filter(isExpoPushToken)
    )
  );
  if (!tokens.length) return { available: false, sent: 0 };

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      tokens.map((token) => ({
        to: token,
        title: "Your NeuroTrader launch discount is ready",
        body: `${WAITLIST_CAMPAIGN.discountPercent}% off annual access. Promo code: ${promoCode}`,
        sound: "default",
        data: {
          screen: "Dashboard",
          type: "waitlist_launch_discount",
          promoCode,
          discountPercent: WAITLIST_CAMPAIGN.discountPercent,
          discountUrl: getWaitlistLaunchEmailStatus().discountUrl,
        },
      }))
    ),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Expo push request failed (${response.status}).`);

  const tickets = Array.isArray(body?.data) ? body.data : [];
  const sent = tickets.filter((ticket: { status?: string }) => ticket?.status === "ok").length;
  if (!sent) {
    const firstError = tickets.find((ticket: { status?: string; message?: string }) => ticket?.status === "error");
    throw new Error(firstError?.message || "Expo did not accept the push notification.");
  }
  return { available: true, sent };
}

export async function getWaitlistLaunchOverview() {
  const { count: total, error: countError } = await supabaseAdmin
    .from("launch_waitlist")
    .select("id", { count: "exact", head: true });

  const { data, error } = await supabaseAdmin
    .from("launch_waitlist")
    .select(
      "id, position, name, email, email_normalized, linked_user_id, launch_discount_email_status, launch_discount_push_status, launch_discount_inapp_status"
    )
    .eq("discount_reserved", true)
    .order("position", { ascending: true })
    .limit(WAITLIST_CAMPAIGN.discountLimit);

  if (countError || error) {
    return {
      storageReady: false,
      error: countError?.message || error?.message || "Waitlist storage is unavailable.",
      total: 0,
      eligible: 0,
      pending: 0,
      emailSent: 0,
      pushSent: 0,
      inappSent: 0,
      failed: 0,
      unavailable: 0,
    };
  }

  const rows = (data ?? []) as WaitlistDeliveryRow[];
  const channelStatuses = rows.flatMap((row) => [
    row.launch_discount_email_status,
    row.launch_discount_push_status,
    row.launch_discount_inapp_status,
  ]);
  return {
    storageReady: true,
    error: null,
    total: total ?? rows.length,
    eligible: rows.length,
    pending: channelStatuses.filter((status) => status === "pending" || status === "processing").length,
    emailSent: rows.filter((row) => row.launch_discount_email_status === "sent").length,
    pushSent: rows.filter((row) => row.launch_discount_push_status === "sent").length,
    inappSent: rows.filter((row) => row.launch_discount_inapp_status === "sent").length,
    failed: channelStatuses.filter((status) => status === "failed").length,
    unavailable: channelStatuses.filter((status) => status === "unavailable").length,
  };
}

export async function dispatchWaitlistLaunch(args: {
  mode: DispatchMode;
  limit?: number;
}) {
  const promoCode = getWaitlistLaunchPromoCode();
  if (!promoCode) {
    throw new Error("WAITLIST_ANNUAL_PROMO_CODE must be configured before launch delivery.");
  }
  if (!getWaitlistLaunchEmailStatus().configured) {
    throw new Error("Resend is not configured.");
  }

  const limit = Math.min(WAITLIST_CAMPAIGN.discountLimit, Math.max(1, args.limit || WAITLIST_CAMPAIGN.discountLimit));
  const expectedStatus = args.mode === "failed" ? "failed" : "pending";
  const { data, error } = await supabaseAdmin
    .from("launch_waitlist")
    .select(
      "id, position, name, email, email_normalized, linked_user_id, launch_discount_email_status, launch_discount_push_status, launch_discount_inapp_status"
    )
    .eq("discount_reserved", true)
    .or(
      `launch_discount_email_status.eq.${expectedStatus},launch_discount_push_status.eq.${expectedStatus},launch_discount_inapp_status.eq.${expectedStatus}`
    )
    .order("position", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as WaitlistDeliveryRow[];
  const result = {
    selected: rows.length,
    emailSent: 0,
    pushSent: 0,
    inappSent: 0,
    failed: 0,
    unavailable: 0,
  };

  async function deliverRow(row: WaitlistDeliveryRow) {
    if (await claimChannel(row.id, "email", args.mode)) {
      try {
        await sendWaitlistLaunchDiscountEmail({
          email: row.email,
          name: row.name,
          position: row.position,
        });
        await setChannelStatus(row.id, "email", "sent");
        result.emailSent += 1;
      } catch (deliveryError) {
        await setChannelStatus(row.id, "email", "failed", errorMessage(deliveryError));
        result.failed += 1;
      }
    }

    let linkedUserId: string | null = null;
    try {
      linkedUserId = await resolveLinkedUser(row);
    } catch (linkError) {
      linkedUserId = null;
      console.error("[waitlist-launch] account lookup failed", row.email, linkError);
    }

    if (await claimChannel(row.id, "inapp", args.mode)) {
      if (!linkedUserId) {
        await setChannelStatus(row.id, "inapp", "unavailable", "No platform account is linked to this waitlist email.");
        result.unavailable += 1;
      } else {
        try {
          await createPlatformMessage(row, linkedUserId);
          await setChannelStatus(row.id, "inapp", "sent");
          result.inappSent += 1;
        } catch (deliveryError) {
          await setChannelStatus(row.id, "inapp", "failed", errorMessage(deliveryError));
          result.failed += 1;
        }
      }
    }

    if (await claimChannel(row.id, "push", args.mode)) {
      if (!linkedUserId) {
        await setChannelStatus(row.id, "push", "unavailable", "No platform account is linked to this waitlist email.");
        result.unavailable += 1;
      } else {
        try {
          const pushResult = await sendMobilePush(linkedUserId);
          if (!pushResult.available) {
            await setChannelStatus(row.id, "push", "unavailable", "No registered mobile device has marketing notifications enabled.");
            result.unavailable += 1;
          } else {
            await setChannelStatus(row.id, "push", "sent");
            result.pushSent += pushResult.sent;
          }
        } catch (deliveryError) {
          await setChannelStatus(row.id, "push", "failed", errorMessage(deliveryError));
          result.failed += 1;
        }
      }
    }
  }

  const concurrency = 8;
  for (let index = 0; index < rows.length; index += concurrency) {
    await Promise.all(rows.slice(index, index + concurrency).map(deliverRow));
  }

  return result;
}
