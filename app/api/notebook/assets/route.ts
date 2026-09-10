import { NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { requireAdvancedPlan } from "@/lib/serverFeatureAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_USER_BYTES = 250 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "attachment";
}

async function authorize(req: Request) {
  const auth = await getAuthUser(req);
  if (!auth) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const gate = await requireAdvancedPlan(auth.userId);
  if (gate) return { response: gate } as const;
  return { userId: auth.userId } as const;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req);
    if ("response" in auth) return auth.response;
    const form = await req.formData();
    const file = form.get("file");
    const pageId = String(form.get("pageId") ?? "").slice(0, 80);
    const caption = String(form.get("caption") ?? "").trim().slice(0, 240) || null;
    if (!(file instanceof File) || !pageId) {
      return NextResponse.json({ error: "A page and file are required." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Only PNG, JPEG, WebP, and PDF files are supported." }, { status: 415 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "The file must be 10 MB or smaller." }, { status: 413 });
    }

    const usage = await supabaseAdmin
      .from("ntj_notebook_assets")
      .select("size_bytes")
      .eq("user_id", auth.userId)
      .limit(5000);
    if (usage.error) throw usage.error;
    const usedBytes = (usage.data ?? []).reduce((sum, asset) => sum + (Number(asset.size_bytes) || 0), 0);
    if (usedBytes + file.size > MAX_USER_BYTES) {
      return NextResponse.json({ error: "Notebook attachment storage is limited to 250 MB per user." }, { status: 413 });
    }

    const page = await supabaseAdmin
      .from("ntj_notebook_pages")
      .select("id")
      .eq("id", pageId)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (page.error) throw page.error;
    if (!page.data) return NextResponse.json({ error: "Page not found." }, { status: 404 });

    const storagePath = `${auth.userId}/${crypto.randomUUID()}/${safeName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const upload = await supabaseAdmin.storage.from("notebook-assets").upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });
    if (upload.error) throw upload.error;

    const result = await supabaseAdmin
      .from("ntj_notebook_assets")
      .insert({
        user_id: auth.userId,
        page_id: pageId,
        storage_path: storagePath,
        file_name: safeName(file.name),
        mime_type: file.type,
        size_bytes: file.size,
        caption,
      })
      .select("id,page_id,note_id,storage_path,file_name,mime_type,size_bytes,caption,created_at")
      .single();
    if (result.error) {
      await supabaseAdmin.storage.from("notebook-assets").remove([storagePath]);
      throw result.error;
    }
    const signed = await supabaseAdmin.storage.from("notebook-assets").createSignedUrl(storagePath, 3600);
    return NextResponse.json({ asset: { ...result.data, signed_url: signed.data?.signedUrl ?? null } });
  } catch (error) {
    console.error("[notebook/assets] POST", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Attachment upload failed." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authorize(req);
    if ("response" in auth) return auth.response;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const assetId = String(body.assetId ?? "").slice(0, 80);
    const asset = await supabaseAdmin
      .from("ntj_notebook_assets")
      .select("id,storage_path")
      .eq("id", assetId)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (asset.error) throw asset.error;
    if (!asset.data) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    const removed = await supabaseAdmin.storage.from("notebook-assets").remove([asset.data.storage_path]);
    if (removed.error) throw removed.error;
    const deleted = await supabaseAdmin.from("ntj_notebook_assets").delete().eq("id", assetId).eq("user_id", auth.userId);
    if (deleted.error) throw deleted.error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[notebook/assets] DELETE", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Attachment removal failed." },
      { status: 500 }
    );
  }
}
