"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";

import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";

import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";

type Theme = "dark" | "light";

type TableSize = { rows: number; cols: number };

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  onReady?: (editor: Editor) => void;
  theme?: Theme;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function useOnClickOutside(
  refs: React.RefObject<HTMLElement>[],
  handler: (e: MouseEvent | TouchEvent) => void,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return;

    const listener = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      for (const r of refs) {
        const el = r.current;
        if (el && el.contains(target)) return;
      }

      handler(e);
    };

    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [refs, handler, enabled]);
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex h-5 w-5 items-center justify-center">{children}</span>;
}

type ToolbarButtonProps = {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  theme: Theme;
};

const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(function ToolbarButton(
  { title, active, disabled, onClick, children, theme },
  ref
) {
  const cls = useMemo(() => {
    const base =
      "inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold transition focus:outline-none";

    if (theme === "light") {
      if (disabled) return `${base} cursor-not-allowed border-slate-200 bg-white text-slate-300`;
      if (active) return `${base} border-emerald-400 bg-emerald-50 text-emerald-700`;
      return `${base} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
    }

    // dark
    if (disabled) return `${base} cursor-not-allowed border-slate-700 bg-slate-900/60 text-slate-500`;
    if (active) return `${base} border-emerald-400 bg-emerald-500/10 text-emerald-200`;
    return `${base} border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800/70`;
  }, [active, disabled, theme]);

  return (
    <button ref={ref} type="button" className={cls} title={title} aria-label={title} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
});

function ToolbarDivider({ theme }: { theme: Theme }) {
  return <div className={`mx-1 h-6 w-px ${theme === "light" ? "bg-slate-200" : "bg-slate-700"}`} />;
}

function TablePickerPortal({
  open,
  anchorRef,
  onPick,
  onClose,
  theme,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement>;
  onPick: (size: TableSize) => void;
  onClose: () => void;
  theme: Theme;
}) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [hover, setHover] = useState<TableSize | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const el = anchorRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - 260));
    const top = rect.bottom + 10;
    setPos({ left, top });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useOnClickOutside([panelRef, anchorRef as any], () => onClose(), open);

  if (!open) return null;
  if (typeof document === "undefined" || !pos) return null;

  const panel = (
    <div
      ref={panelRef}
      className={`fixed z-9999 rounded-2xl border shadow-xl ${
        theme === "light" ? "border-slate-200 bg-white" : "border-slate-700 bg-slate-950"
      }`}
      style={{ left: pos.left, top: pos.top }}
    >
      <div className={`px-4 pt-3 text-[12px] ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}>
        {hover ? (
          <span className="font-semibold">{hover.rows} × {hover.cols}</span>
        ) : (
          <span className="font-semibold">Choose size</span>
        )}
        <span className={`ml-2 ${theme === "light" ? "text-slate-400" : "text-slate-400"}`}>(max 6×6)</span>
      </div>

      <div className="px-4 pb-4 pt-3">
        <div className="grid grid-cols-6 gap-1">
          {Array.from({ length: 36 }).map((_, i) => {
            const r = Math.floor(i / 6) + 1;
            const c = (i % 6) + 1;
            const active = !!hover && r <= hover.rows && c <= hover.cols;

            const cellCls =
              theme === "light"
                ? active
                  ? "bg-emerald-400"
                  : "bg-slate-200 hover:bg-slate-300"
                : active
                  ? "bg-emerald-400"
                  : "bg-slate-800 hover:bg-slate-700";

            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHover({ rows: r, cols: c })}
                onMouseLeave={() => setHover(null)}
                onClick={() => onPick({ rows: r, cols: c })}
                className={`h-6 w-6 rounded-md transition ${cellCls}`}
                aria-label={`Insert ${r} by ${c} table`}
              />
            );
          })}
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
              theme === "light"
                ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                : "border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900"
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  className = "",
  minHeight = 260,
  onReady,
  theme = "light",
}: Props) {
  const [tableOpen, setTableOpen] = useState(false);
  const tableBtnRef = useRef<HTMLButtonElement | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Avoid version-specific typing issues (and keep the editor focused on journaling)
        codeBlock: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: "nt-rte-link",
        },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Write...",
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: "nt-rte-table",
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    // Prevent hydration mismatch in Next.js app router
    immediatelyRender: false,
    content: value || "<p></p>",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "nt-rte-prosemirror",
        style: `min-height: ${minHeight}px;`,
      },
    },
  });

  // Expose editor instance to parent (dictation insertion, etc.)
  useEffect(() => {
    if (!editor || !onReady) return;
    onReady(editor);
  }, [editor, onReady]);

  // Keep editor in sync with external value
  useEffect(() => {
    if (!editor) return;
    const cur = editor.getHTML();
    const next = value || "<p></p>";
    if (cur !== next) {
      editor.commands.setContent(next);
    }
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;

    // Close the table picker if editor loses focus (optional)
    const onBlur = () => setTableOpen(false);
    editor.on("blur", onBlur);
    return () => {
      editor.off("blur", onBlur);
    };
  }, [editor]);

  const toolbarCls =
    theme === "light"
      ? "rounded-2xl border border-slate-200 bg-white px-2 py-2 shadow-sm"
      : "rounded-2xl border border-slate-700 bg-slate-950/60 px-2 py-2";

  const surfaceCls =
    theme === "light"
      ? "rounded-2xl border border-slate-200 bg-white"
      : "rounded-2xl border border-slate-800 bg-slate-950";

  const insertLink = () => {
    if (!editor) return;
    const prev = (editor.getAttributes("link")?.href as string | undefined) ?? "";
    const url = window.prompt("Paste URL", prev || "https://");
    if (url === null) return;

    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().setLink({ href: trimmed }).run();
  };

  const insertTable = (rows: number, cols: number) => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertTable({
        rows: clamp(rows, 1, 6),
        cols: clamp(cols, 1, 6),
        withHeaderRow: true,
      })
      .run();
  };

  const canAddRow = !!editor?.can().chain().focus().addRowAfter().run();
  const canAddCol = !!editor?.can().chain().focus().addColumnAfter().run();
  const canDelTable = !!editor?.can().chain().focus().deleteTable().run();

  return (
    <div className={`nt-rte w-full ${className}`.trim()}>
      {/* Toolbar */}
      <div className={toolbarCls}>
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarButton
            theme={theme}
            title="Bold"
            active={!!editor?.isActive("bold")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Icon>B</Icon>
          </ToolbarButton>

          <ToolbarButton
            theme={theme}
            title="Italic"
            active={!!editor?.isActive("italic")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Icon>I</Icon>
          </ToolbarButton>

          <ToolbarButton
            theme={theme}
            title="Underline"
            active={!!editor?.isActive("underline")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            <Icon>U</Icon>
          </ToolbarButton>

          <ToolbarDivider theme={theme} />

          <ToolbarButton
            theme={theme}
            title="Bullet list"
            active={!!editor?.isActive("bulletList")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <Icon>•</Icon>
          </ToolbarButton>

          <ToolbarButton
            theme={theme}
            title="Numbered list"
            active={!!editor?.isActive("orderedList")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <Icon>1.</Icon>
          </ToolbarButton>

          <ToolbarButton
            theme={theme}
            title="Quote"
            active={!!editor?.isActive("blockquote")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            <Icon>“”</Icon>
          </ToolbarButton>

          <ToolbarDivider theme={theme} />

          <ToolbarButton
            theme={theme}
            title="Insert link"
            active={!!editor?.isActive("link")}
            disabled={!editor}
            onClick={insertLink}
          >
            <Icon>🔗</Icon>
          </ToolbarButton>

          <ToolbarButton
            ref={tableBtnRef}
            theme={theme}
            title="Insert table"
            active={tableOpen}
            disabled={!editor}
            onClick={() => setTableOpen((v) => !v)}
          >
            <Icon>▦</Icon>
          </ToolbarButton>

          <ToolbarButton
            theme={theme}
            title="Add row"
            disabled={!editor || !canAddRow}
            onClick={() => editor?.chain().focus().addRowAfter().run()}
          >
            <Icon>+r</Icon>
          </ToolbarButton>

          <ToolbarButton
            theme={theme}
            title="Add column"
            disabled={!editor || !canAddCol}
            onClick={() => editor?.chain().focus().addColumnAfter().run()}
          >
            <Icon>+c</Icon>
          </ToolbarButton>

          <ToolbarButton
            theme={theme}
            title="Delete table"
            disabled={!editor || !canDelTable}
            onClick={() => editor?.chain().focus().deleteTable().run()}
          >
            <Icon>del</Icon>
          </ToolbarButton>

          <div className="ml-auto" />

          <ToolbarButton
            theme={theme}
            title="Undo"
            disabled={!editor || !editor.can().chain().focus().undo().run()}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Icon>↶</Icon>
          </ToolbarButton>

          <ToolbarButton
            theme={theme}
            title="Redo"
            disabled={!editor || !editor.can().chain().focus().redo().run()}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Icon>↷</Icon>
          </ToolbarButton>
        </div>
      </div>

      {/* Table picker (portal to avoid clipping inside cards) */}
      <TablePickerPortal
        open={tableOpen && !!editor}
        anchorRef={tableBtnRef as any}
        theme={theme}
        onPick={(size) => {
          insertTable(size.rows, size.cols);
          setTableOpen(false);
        }}
        onClose={() => setTableOpen(false)}
      />

      {/* Editor surface */}
      <div className={`${surfaceCls} mt-2`}>
        <EditorContent editor={editor} />
      </div>

      {/* Local styles: list bullets + table borders visible on dark backgrounds */}
      <style jsx global>{`
        .nt-rte .nt-rte-prosemirror {
          padding: 14px 14px;
          font-size: 15px;
          line-height: 1.6;
          color: rgb(226 232 240);
          outline: none;
        }

        /* Lists (Tailwind preflight removes markers by default) */
        .nt-rte .ProseMirror ul {
          list-style: disc;
          padding-left: 1.35rem;
          margin: 0.35rem 0;
        }
        .nt-rte .ProseMirror ol {
          list-style: decimal;
          padding-left: 1.35rem;
          margin: 0.35rem 0;
        }
        .nt-rte .ProseMirror li {
          margin: 0.15rem 0;
        }

        /* Paragraph spacing */
        .nt-rte .ProseMirror p {
          margin: 0.35rem 0;
        }

        /* Blockquote */
        .nt-rte .ProseMirror blockquote {
          border-left: 3px solid rgba(16, 185, 129, 0.5);
          padding-left: 0.85rem;
          margin: 0.6rem 0;
          color: rgb(226 232 240);
          opacity: 0.95;
        }

        /* Links */
        .nt-rte .ProseMirror a.nt-rte-link,
        .nt-rte .ProseMirror a {
          color: rgb(110 231 183);
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        /* Tables */
        .nt-rte .ProseMirror table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.6rem 0;
          table-layout: fixed;
        }
        .nt-rte .ProseMirror th,
        .nt-rte .ProseMirror td {
          border: 1px solid rgba(148, 163, 184, 0.35);
          padding: 0.45rem 0.55rem;
          vertical-align: top;
          word-break: break-word;
        }
        .nt-rte .ProseMirror th {
          background: rgba(2, 6, 23, 0.35);
          color: rgb(226 232 240);
          font-weight: 600;
        }
        .nt-rte .ProseMirror td {
          background: rgba(2, 6, 23, 0.12);
        }

        /* Make the editor feel better when empty */
        .nt-rte .ProseMirror p.is-editor-empty:first-child::before {
          color: rgba(148, 163, 184, 0.75);
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
