"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";

/* =========================================================
   Types
========================================================= */

type TableSize = { rows: number; cols: number };

type ToolbarTheme = "light";

export type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;

  /** Optional hook for parent components (e.g., dictation insertion) */
  onReady?: (editor: any) => void;

  /** Toolbar is intentionally "light" (white) for a professional look.
   *  Editor surface remains dark to match the app.
   */
  toolbarTheme?: ToolbarTheme;
};

/* =========================================================
   Small helpers
========================================================= */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex h-8 w-8 items-center justify-center">{children}</span>;
}

function TablePicker({
  onPick,
  label,
  ariaLabel,
  titleLabel,
}: {
  onPick: (size: TableSize) => void;
  label: (rows: number, cols: number) => string;
  ariaLabel: (rows: number, cols: number) => string;
  titleLabel: (rows: number, cols: number) => string;
}) {
  const [hover, setHover] = useState<TableSize | null>(null);

  return (
    <div className="absolute left-0 top-full mt-2 w-[220px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl z-50">
      <div className="mb-2 text-[11px] text-slate-500">
        {hover ? `${hover.rows} × ${hover.cols}` : label(6, 6)}
      </div>
      <div className="grid grid-cols-6 gap-1">
        {Array.from({ length: 36 }).map((_, i) => {
          const r = Math.floor(i / 6) + 1;
          const c = (i % 6) + 1;
          const active = !!hover && r <= hover.rows && c <= hover.cols;

          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHover({ rows: r, cols: c })}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPick({ rows: r, cols: c })}
              className={
                "h-6 w-6 rounded border transition " +
                (active
                  ? "border-emerald-500 bg-emerald-100"
                  : "border-slate-200 bg-slate-50 hover:bg-slate-100")
              }
              aria-label={ariaLabel(r, c)}
              title={titleLabel(r, c)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ToolbarButton({
  title,
  active,
  disabled,
  onClick,
  children,
  theme,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  theme: ToolbarTheme;
}) {
  const base =
    "inline-flex items-center justify-center rounded-lg border text-sm font-semibold transition select-none";

  // For now we only support light toolbar to match the design request.
  const cls =
    theme === "light"
      ? disabled
        ? `${base} border-slate-200 bg-white text-slate-300 cursor-not-allowed`
        : active
        ? `${base} border-slate-900 bg-slate-900 text-white`
        : `${base} border-slate-200 bg-white text-slate-700 hover:bg-slate-100`
      : base;

  return (
    <button type="button" title={title} aria-label={title} className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/* =========================================================
   Component
========================================================= */

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  className = "",
  minHeight = 260,
  onReady,
  toolbarTheme = "light",
}: RichTextEditorProps) {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const effectivePlaceholder = placeholder ?? L("Write…", "Escribe…");
  const [tableOpen, setTableOpen] = useState(false);

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
      Placeholder.configure({ placeholder: effectivePlaceholder }),
      Table.configure({
        resizable: true,
        lastColumnResizable: true,
        allowTableNodeSelection: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    [effectivePlaceholder]
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
          // Keep typography readable on dark background; use a scoped wrapper for list/table fixes.
          "nt-rte__content focus:outline-none px-4 py-3 text-[15px] leading-relaxed text-slate-100",
        style: `min-height: ${minHeight}px;`,
      },
    },
  });

  // Notify parent when ready
  useEffect(() => {
    if (!editor || !onReady) return;
    try {
      onReady(editor);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Keep editor in sync with outer state
  useEffect(() => {
    if (!editor) return;

    const current = editor.getHTML();
    const next = value || "<p></p>";

    if (current !== next) {
      // TipTap v2+: second argument is options
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [value, editor]);

  const can = (fn: () => boolean) => {
    try {
      return !!editor?.can().chain().focus() && fn();
    } catch {
      return false;
    }
  };

  const insertLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(
      isEs ? "Pega la URL" : "Paste URL",
      prev || "https://"
    );

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

  return (
    <div className={`w-full ${className}`.trim()}>
      {/*
        Professional "light" toolbar like the reference screenshot
        while keeping the editor surface dark (matching the app).
      */}
      <div className="mb-2 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <ToolbarButton
          theme={toolbarTheme}
          title={L("Bold", "Negrita")}
          active={!!editor?.isActive("bold")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Icon>
            <span className="font-black">B</span>
          </Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Italic", "Itálica")}
          active={!!editor?.isActive("italic")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Icon>
            <span className="italic">I</span>
          </Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Underline", "Subrayado")}
          active={!!editor?.isActive("underline")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <Icon>
            <span className="underline">U</span>
          </Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Bullet list", "Lista con viñetas")}
          active={!!editor?.isActive("bulletList")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <Icon>•</Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Numbered list", "Lista numerada")}
          active={!!editor?.isActive("orderedList")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <Icon>1.</Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Quote", "Cita")}
          active={!!editor?.isActive("blockquote")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Icon>“”</Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Insert link", "Insertar enlace")}
          active={!!editor?.isActive("link")}
          disabled={!editor}
          onClick={insertLink}
        >
          <Icon>🔗</Icon>
        </ToolbarButton>

        <div className="relative">
          <ToolbarButton
            theme={toolbarTheme}
            title={L("Insert table", "Insertar tabla")}
            disabled={!editor}
            onClick={() => setTableOpen((v) => !v)}
          >
            <Icon>▦</Icon>
          </ToolbarButton>
          {tableOpen && editor && (
            <TablePicker
              onPick={(size) => {
                insertTable(size.rows, size.cols);
                setTableOpen(false);
              }}
              label={() => L("Choose size (max 6×6)", "Elige tamaño (máx 6×6)")}
              ariaLabel={(r, c) => L(`Insert ${r} by ${c} table`, `Insertar tabla de ${r} × ${c}`)}
              titleLabel={(r, c) => L(`Insert ${r}×${c}`, `Insertar ${r}×${c}`)}
            />
          )}
        </div>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Add table row", "Agregar fila")}
          disabled={!editor || !can(() => editor!.can().addRowAfter())}
          onClick={() => editor?.chain().focus().addRowAfter().run()}
        >
          <Icon>+row</Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Add table column", "Agregar columna")}
          disabled={!editor || !can(() => editor!.can().addColumnAfter())}
          onClick={() => editor?.chain().focus().addColumnAfter().run()}
        >
          <Icon>+col</Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Delete table", "Eliminar tabla")}
          disabled={!editor || !can(() => editor!.can().deleteTable())}
          onClick={() => editor?.chain().focus().deleteTable().run()}
        >
          <Icon>del</Icon>
        </ToolbarButton>

        <div className="ml-auto" />

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Undo", "Deshacer")}
          disabled={!editor || !can(() => editor!.can().undo())}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Icon>↶</Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Redo", "Rehacer")}
          disabled={!editor || !can(() => editor!.can().redo())}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Icon>↷</Icon>
        </ToolbarButton>
      </div>

      {/* Dark editor surface (keeps the app look) */}
      <div className="nt-rte rounded-xl border border-slate-800 bg-slate-950">
        <EditorContent editor={editor} />
      </div>

      {/*
        Scoped fixes:
        - Force list markers to be visible (in case a global CSS reset removed them)
        - Force table borders to be visible on dark background
        - Provide reasonable table spacing and header styling
      */}
      <style jsx global>{`
        .nt-rte .ProseMirror {
          outline: none;
        }

        .nt-rte .ProseMirror p {
          margin: 0.4rem 0;
        }

        .nt-rte .ProseMirror ul,
        .nt-rte .ProseMirror ol {
          padding-left: 1.25rem;
          margin: 0.6rem 0;
        }

        .nt-rte .ProseMirror ul {
          list-style: disc;
        }

        .nt-rte .ProseMirror ol {
          list-style: decimal;
        }

        .nt-rte .ProseMirror li {
          margin: 0.25rem 0;
        }

        .nt-rte .ProseMirror table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.75rem 0;
          table-layout: fixed;
        }

        .nt-rte .ProseMirror th,
        .nt-rte .ProseMirror td {
          border: 1px solid rgba(226, 232, 240, 0.28);
          padding: 0.5rem 0.6rem;
          vertical-align: top;
          word-break: break-word;
        }

        .nt-rte .ProseMirror th {
          background: rgba(2, 6, 23, 0.6);
          color: rgba(226, 232, 240, 0.95);
          font-weight: 700;
        }

        .nt-rte .ProseMirror td {
          background: rgba(2, 6, 23, 0.25);
        }

        .nt-rte .ProseMirror .selectedCell:after {
          background: rgba(16, 185, 129, 0.18);
        }

        .nt-rte .ProseMirror a {
          color: rgba(110, 231, 183, 0.95);
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .nt-rte .ProseMirror blockquote {
          border-left: 2px solid rgba(16, 185, 129, 0.6);
          padding-left: 0.75rem;
          margin: 0.75rem 0;
          color: rgba(226, 232, 240, 0.85);
        }
      `}</style>
    </div>
  );
}
