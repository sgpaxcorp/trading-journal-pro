"use client";

import { useState } from "react";
import { PencilLine, RotateCcw, Trash2, TriangleAlert, Type } from "lucide-react";

import RichTextEditor from "@/app/components/RichTextEditor";
import NotebookInkCanvas from "@/app/components/NotebookInkCanvas";
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
            Text
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
            Ink
          </button>
        </div>
      </div>

      {mode === "ink" ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Ink color
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
                aria-label={`Use color ${item.id}`}
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
              Undo
            </button>
            <button
              type="button"
              onClick={clearDrawing}
              disabled={!drawing}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-rose-400/50 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-40 transition"
            >
              <Trash2 size={14} />
              Clear
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
                This drawing was created with PencilKit on iPhone or iPad.
              </p>
              <p className="mt-2 text-sm leading-7 text-amber-50/85">
                The journal keeps this drawing saved, but the web app cannot render that native Apple format yet. Open
                the entry on mobile to edit it, or replace it here with a new web sketch.
              </p>
              <button
                type="button"
                onClick={replaceIosDrawing}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-300 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-200 transition"
              >
                <PencilLine size={14} />
                Replace with web sketch
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
          emptyTitle="Draw with mouse, trackpad, or stylus"
          emptySubtitle="This sketch stays inside the journal entry and saves with the rest of the day."
        />
      )}
    </div>
  );
}
