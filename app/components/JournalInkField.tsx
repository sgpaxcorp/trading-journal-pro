"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { PencilLine, RotateCcw, Trash2, TriangleAlert, Type } from "lucide-react";

import type { RichTextEditorProps } from "@/app/components/RichTextEditor";
import NotebookInkCanvas from "@/app/components/NotebookInkCanvas";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import {
  buildNotebookInkPayload,
  getNotebookInkMode,
  normalizeNotebookInkPayload,
  type NotebookEditableContent,
  type NotebookInkDrawing,
  type NotebookInkMode,
} from "@/lib/notebookInk";

type JournalInkFieldProps = {
  label?: string;
  value: NotebookEditableContent;
  onChange: (next: NotebookEditableContent) => void;
  placeholder?: string;
  minHeight?: number;
  onReady?: (editor: any) => void;
};

const PALETTE = [
  { id: "white", value: "#FFFFFF" },
  { id: "mint", value: "#36F5D6" },
  { id: "sky", value: "#7DD3FC" },
  { id: "amber", value: "#FDE68A" },
];

const RichTextEditor = dynamic<RichTextEditorProps>(
  () => import("@/app/components/RichTextEditor"),
  {
    ssr: false,
    loading: () => <div className="min-h-[180px] rounded-lg border border-slate-700/70 bg-slate-950/40" />,
  }
);

function saveEditableValue(
  content: string,
  mode: NotebookInkMode,
  drawing: NotebookInkDrawing | null
): NotebookEditableContent {
  return {
    content,
    ink: buildNotebookInkPayload(mode, drawing),
  };
}

export default function JournalInkField({
  label,
  value,
  onChange,
  placeholder,
  minHeight = 220,
  onReady,
}: JournalInkFieldProps) {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const L = (en: string, es: string) => (lang === "es" ? es : en);
  const [inkColor, setInkColor] = useState(PALETTE[0].value);

  const ink = normalizeNotebookInkPayload(value.ink);
  const mode = getNotebookInkMode(ink);
  const drawing = ink?.drawing ?? null;
  const skiaDrawing = drawing?.engine === "skia" ? drawing : null;
  const isIosInk = drawing?.engine === "pencilkit";

  const updateMode = (nextMode: NotebookInkMode) => {
    onChange(saveEditableValue(value.content, nextMode, drawing));
  };

  const updateText = (nextContent: string) => {
    onChange(saveEditableValue(nextContent, mode, drawing));
  };

  const updateDrawing = (nextDrawing: NotebookInkDrawing | null) => {
    onChange(saveEditableValue(value.content, "ink", nextDrawing));
  };

  const undoStroke = () => {
    if (!skiaDrawing || skiaDrawing.strokes.length === 0) return;
    updateDrawing({
      engine: "skia",
      strokes: skiaDrawing.strokes.slice(0, -1),
    });
  };

  const clearDrawing = () => {
    updateDrawing(null);
  };

  const replaceIosDrawing = () => {
    updateDrawing({
      engine: "skia",
      strokes: [],
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {label ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {label}
          </p>
        ) : (
          <div />
        )}

        <div className="inline-flex rounded-full border border-slate-800 bg-slate-950/80 p-1">
          <button
            type="button"
            onClick={() => updateMode("text")}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              mode === "text"
                ? "bg-slate-800 text-slate-50"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            <Type size={14} />
            {L("Text", "Texto")}
          </button>
          <button
            type="button"
            onClick={() => updateMode("ink")}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              mode === "ink"
                ? "bg-emerald-500/20 text-emerald-100"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            <PencilLine size={14} />
            {L("Ink", "Tinta")}
          </button>
        </div>
      </div>

      {mode === "ink" ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {L("Ink color", "Color de tinta")}
            </span>
            {PALETTE.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setInkColor(item.value)}
                className={`h-7 w-7 rounded-full border transition ${
                  inkColor === item.value
                    ? "border-emerald-300 ring-2 ring-emerald-400/40"
                    : "border-slate-700"
                }`}
                style={{ backgroundColor: item.value }}
                aria-label={`${L("Use color", "Usar color")} ${item.id}`}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={undoStroke}
              disabled={!skiaDrawing || skiaDrawing.strokes.length === 0}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-400/50 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40 transition"
            >
              <RotateCcw size={14} />
              {L("Undo", "Deshacer")}
            </button>
            <button
              type="button"
              onClick={clearDrawing}
              disabled={!drawing}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-rose-400/50 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-40 transition"
            >
              <Trash2 size={14} />
              {L("Clear", "Limpiar")}
            </button>
          </div>
        </div>
      ) : null}

      {mode === "text" ? (
        <RichTextEditor
          value={value.content}
          onChange={updateText}
          placeholder={placeholder}
          minHeight={minHeight}
          onReady={onReady}
        />
      ) : isIosInk ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-amber-500/15 p-2 text-amber-200">
              <TriangleAlert size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-100">
                {L(
                  "This drawing was created with PencilKit on iPhone or iPad.",
                  "Este dibujo fue creado con PencilKit en iPhone o iPad."
                )}
              </p>
              <p className="mt-2 text-sm leading-7 text-amber-50/85">
                {L(
                  "The journal keeps this drawing saved, but the web app cannot render that native Apple format yet. Open the entry on mobile to edit it, or replace it here with a new web sketch.",
                  "El journal conserva este dibujo, pero la aplicación web todavía no puede mostrar ese formato nativo de Apple. Abre la entrada en mobile para editarla o reemplázala aquí con un nuevo dibujo web."
                )}
              </p>
              <button
                type="button"
                onClick={replaceIosDrawing}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-300 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-200 transition"
              >
                <PencilLine size={14} />
                {L("Replace with web sketch", "Reemplazar con dibujo web")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <NotebookInkCanvas
          value={drawing}
          onChange={updateDrawing}
          height={minHeight}
          strokeColor={inkColor}
          emptyTitle={L("Draw with mouse, trackpad, or stylus", "Dibuja con mouse, trackpad o lápiz digital")}
          emptySubtitle={L(
            "This sketch stays inside the journal entry and saves with the rest of the day.",
            "Este dibujo permanece dentro de la entrada del journal y se guarda con el resto del día."
          )}
        />
      )}
    </div>
  );
}
