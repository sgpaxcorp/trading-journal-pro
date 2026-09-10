"use client";

import { useState } from "react";
import { Check, LoaderCircle, NotebookPen } from "lucide-react";

import { useUserPlan } from "@/hooks/useUserPlan";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { notebookApi, notebookWorkspaceAction } from "@/lib/notebookClient";
import type { NotebookBook, NotebookLibrary, NotebookPageSummary, NotebookPageType } from "@/lib/notebookKnowledge";

type NotebookCaptureButtonProps = {
  accountId?: string | null;
  sourceType: "journal_day" | "trade" | "back_study" | "business_plan" | "ai_coaching";
  sourceId: string;
  title: string;
  content: string;
  pageType?: NotebookPageType;
  className?: string;
};

export default function NotebookCaptureButton({
  accountId,
  sourceType,
  sourceId,
  title,
  content,
  pageType = "lesson",
  className = "",
}: NotebookCaptureButtonProps) {
  const { plan } = useUserPlan();
  const { locale } = useAppSettings();
  const isEs = resolveLocale(locale) === "es";
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  if (plan !== "advanced") return null;

  async function capture() {
    if (state === "saving") return;
    setState("saving");
    setMessage("");
    try {
      const scope = accountId ? "account" : "business";
      const params = new URLSearchParams({ view: "library", scope });
      if (accountId) params.set("accountId", accountId);
      let library = (await notebookApi<{ library: NotebookLibrary }>(`/api/notebook/workspace?${params}`)).library;
      let book: NotebookBook | undefined = library.books[0];
      if (!book) {
        const created = await notebookWorkspaceAction<{ book: NotebookBook }>("create_book", {
          scope,
          accountId: accountId ?? null,
          name: accountId
            ? (isEs ? "Playbook de la cuenta" : "Account Playbook")
            : (isEs ? "Conocimiento del negocio" : "Business Knowledge"),
        });
        book = created.book;
        library = { ...library, books: [book] };
      }
      const result = await notebookWorkspaceAction<{ page: NotebookPageSummary }>("create_page", {
        notebookId: book.id,
        title,
        content,
        pageType,
        status: "candidate",
        sourceType,
        sourceId,
        language: isEs ? "es" : "en",
      });
      setState("saved");
      setMessage(isEs ? "Guardado como candidato" : "Saved as candidate");
      window.setTimeout(() => {
        setState("idle");
        setMessage("");
      }, 3500);
      window.history.replaceState(window.history.state, "", window.location.href);
      void result;
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : (isEs ? "No se pudo guardar" : "Unable to save"));
    }
  }

  return (
    <div className={`inline-flex flex-col items-end gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => void capture()}
        disabled={state === "saving"}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/15 disabled:opacity-50"
      >
        {state === "saving" ? <LoaderCircle size={15} className="animate-spin" /> : state === "saved" ? <Check size={15} /> : <NotebookPen size={15} />}
        {state === "saving" ? (isEs ? "Guardando..." : "Saving...") : state === "saved" ? (isEs ? "Guardado" : "Saved") : (isEs ? "Guardar en Notebook" : "Save to Notebook")}
      </button>
      {message ? <span className={`max-w-64 text-right text-[10px] ${state === "error" ? "text-rose-300" : "text-emerald-300"}`}>{message}</span> : null}
    </div>
  );
}
