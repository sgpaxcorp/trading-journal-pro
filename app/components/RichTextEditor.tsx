"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";

type TableSize = { rows: number; cols: number };

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  /** Called once when the editor is ready (useful for dictation insertion, etc.). */
  onReady?: (editor: any) => void;
  /** Max rows/cols shown in the picker. You can still add more with +row/+col commands. */
  maxTableSize?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function useIsMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

function TablePickerPortal({
  open,
  anchorEl,
  max,
  onPick,
  onClose,
}: {
  open: boolean;
  anchorEl: HTMLElement | null;
  max: number;
  onPick: (size: TableSize) => void;
  onClose: () => void;
}) {
  const mounted = useIsMounted();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<TableSize | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!open || !anchorEl) return;

    const update = () => {
      const r = anchorEl.getBoundingClientRect();

      // Default position: left-aligned under the button.
      let left = r.left;
      let top = r.bottom + 8;

      // Constrain within viewport (with a small margin).
      const margin = 12;
      const panelWidth = 16 + max * 28; // approx
      const panelHeight = 64 + max * 28; // approx

      left = Math.min(left, window.innerWidth - panelWidth - margin);
      left = Math.max(margin, left);

      top = Math.min(top, window.innerHeight - panelHeight - margin);
      top = Math.max(margin, top);

      setPos({ left, top });
    };

    update();

    window.addEventListener("resize", update);
    // Capture scroll events from any scrollable parent
    window.addEventListener("scroll", update, true);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorEl, max]);

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorEl && anchorEl.contains(t)) return;
      if (panelRef.current && panelRef.current.contains(t)) return;
      onClose();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, anchorEl, onClose]);

  if (!mounted || !open || !pos) return null;

  const squares = max * max;

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", left: pos.left, top: pos.top }}
      className="rounded-xl border border-slate-700 bg-slate-950 p-2 shadow-2xl z-[9999]"
      role="dialog"
      aria-label="Insert table"
    >
      <div className="mb-2 text-[11px] text-slate-400">
        {hover ? `${hover.rows} × ${hover.cols}` : `Choose size (max ${max}×${max})`}
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${max}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: squares }).map((_, i) => {
          const r = Math.floor(i / max) + 1;
          const c = (i % max) + 1;
          const active = !!hover && r <= hover.rows && c <= hover.cols;

          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHover({ rows: r, cols: c })}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPick({ rows: r, cols: c })}
              className={`h-6 w-6 rounded ${active ? "bg-emerald-400" : "bg-slate-800"}`}
              aria-label={`Insert ${r} by ${c} table`}
              title={`${r}×${c}`}
            />
          );
        })}
      </div>
    </div>,
    document.body
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Write...",
  className = "",
  minHeight = 260,
  onReady,
  maxTableSize = 10,
}: RichTextEditorProps) {
  const [tableOpen, setTableOpen] = useState(false);
  const tableBtnRef = useRef<HTMLButtonElement | null>(null);
  const onReadyCalledRef = useRef(false);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      Placeholder.configure({ placeholder }),
      Table.configure({
        resizable: true,
        lastColumnResizable: true,
        allowTableNodeSelection: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    [placeholder]
  );

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    content: value || "<p></p>",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none focus:outline-none px-3 py-2 text-[16px] leading-relaxed text-slate-100",
        style: `min-height: ${minHeight}px;`,
      },
    },
  });

  // Expose editor instance when ready
  useEffect(() => {
    if (!editor) return;
    if (!onReady) return;
    if (onReadyCalledRef.current) return;
    onReadyCalledRef.current = true;
    onReady(editor);
  }, [editor, onReady]);

  // Keep editor in sync with outer state.
  // Use a version-tolerant setContent call (TipTap changed the 2nd argument type across versions).
  useEffect(() => {
    if (!editor) return;

    const current = editor.getHTML();
    const next = value || "<p></p>";

    if (current === next) return;

    try {
      (editor.commands as any).setContent(next, { emitUpdate: false });
      return;
    } catch {
      // ignore
    }

    try {
      (editor.commands as any).setContent(next, false);
      return;
    } catch {
      // ignore
    }

    try {
      (editor.commands as any).setContent(next);
    } catch {
      // ignore
    }
  }, [value, editor]);

  const btnBase =
    "inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1 text-[12px] font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-200 transition";

  const insertLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Paste URL", prev || "https://");

    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().setLink({ href: url.trim() }).run();
  };

  const insertTable = (rows: number, cols: number) => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertTable({
        rows: clamp(rows, 1, maxTableSize),
        cols: clamp(cols, 1, maxTableSize),
        withHeaderRow: true,
      })
      .run();
  };

  const canAddRow = !!editor && !!(editor as any).can?.().addRowAfter?.();
  const canAddCol = !!editor && !!(editor as any).can?.().addColumnAfter?.();
  const canDelTable = !!editor && !!(editor as any).can?.().deleteTable?.();
  const canUndo = !!editor && !!(editor as any).can?.().undo?.();
  const canRedo = !!editor && !!(editor as any).can?.().redo?.();

  return (
    <div className={`w-full ${className}`.trim()}>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <button
          type="button"
          className={`${btnBase} ${editor?.isActive("bold") ? "border-emerald-400 text-emerald-200" : ""}`}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={!editor}
          aria-label="Bold"
          title="Bold"
        >
          B
        </button>

        <button
          type="button"
          className={`${btnBase} ${editor?.isActive("italic") ? "border-emerald-400 text-emerald-200" : ""}`}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={!editor}
          aria-label="Italic"
          title="Italic"
        >
          I
        </button>

        <button
          type="button"
          className={`${btnBase} ${editor?.isActive("underline") ? "border-emerald-400 text-emerald-200" : ""}`}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          disabled={!editor}
          aria-label="Underline"
          title="Underline"
        >
          U
        </button>

        <button
          type="button"
          className={`${btnBase} ${editor?.isActive("bulletList") ? "border-emerald-400 text-emerald-200" : ""}`}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          disabled={!editor}
          aria-label="Bullet list"
          title="Bullet list"
        >
          •
        </button>

        <button
          type="button"
          className={`${btnBase} ${editor?.isActive("orderedList") ? "border-emerald-400 text-emerald-200" : ""}`}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          disabled={!editor}
          aria-label="Numbered list"
          title="Numbered list"
        >
          1.
        </button>

        <button
          type="button"
          className={`${btnBase} ${editor?.isActive("blockquote") ? "border-emerald-400 text-emerald-200" : ""}`}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          disabled={!editor}
          aria-label="Quote"
          title="Quote"
        >
          “ ”
        </button>

        <button
          type="button"
          className={`${btnBase} ${editor?.isActive("link") ? "border-emerald-400 text-emerald-200" : ""}`}
          onClick={insertLink}
          disabled={!editor}
          aria-label="Insert link"
          title="Insert link"
        >
          Link
        </button>

        <button
          ref={tableBtnRef}
          type="button"
          className={btnBase}
          onClick={() => setTableOpen((v) => !v)}
          disabled={!editor}
          aria-label="Insert table"
          title="Insert table"
        >
          ▦
        </button>

        <TablePickerPortal
          open={tableOpen && !!editor}
          anchorEl={tableBtnRef.current}
          max={clamp(maxTableSize, 2, 12)}
          onClose={() => setTableOpen(false)}
          onPick={(size) => {
            insertTable(size.rows, size.cols);
            setTableOpen(false);
          }}
        />

        <button
          type="button"
          className={`${btnBase} ${canAddRow ? "" : "opacity-40 cursor-not-allowed"}`}
          onClick={() => editor?.chain().focus().addRowAfter().run()}
          disabled={!editor || !canAddRow}
          aria-label="Add table row"
          title="Add table row"
        >
          +row
        </button>

        <button
          type="button"
          className={`${btnBase} ${canAddCol ? "" : "opacity-40 cursor-not-allowed"}`}
          onClick={() => editor?.chain().focus().addColumnAfter().run()}
          disabled={!editor || !canAddCol}
          aria-label="Add table column"
          title="Add table column"
        >
          +col
        </button>

        <button
          type="button"
          className={`${btnBase} ${canDelTable ? "" : "opacity-40 cursor-not-allowed"}`}
          onClick={() => editor?.chain().focus().deleteTable().run()}
          disabled={!editor || !canDelTable}
          aria-label="Delete table"
          title="Delete table"
        >
          del
        </button>

        <div className="ml-auto" />

        <button
          type="button"
          className={`${btnBase} ${canUndo ? "" : "opacity-40 cursor-not-allowed"}`}
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!editor || !canUndo}
          aria-label="Undo"
          title="Undo"
        >
          Undo
        </button>

        <button
          type="button"
          className={`${btnBase} ${canRedo ? "" : "opacity-40 cursor-not-allowed"}`}
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!editor || !canRedo}
          aria-label="Redo"
          title="Redo"
        >
          Redo
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
