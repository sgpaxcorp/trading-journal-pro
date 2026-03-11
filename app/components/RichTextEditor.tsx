"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

import { EditorContent, useEditor } from "@tiptap/react";
import { Mark, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import {
  Bold,
  ChevronDown,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Quote,
  Link2,
  Table2,
  Rows3,
  Columns3,
  Trash2,
  Undo2,
  Redo2,
  Heading1,
} from "lucide-react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textStyle: {
      setFontFamily: (font: string | null) => ReturnType;
      setFontSize: (size: string | null) => ReturnType;
      setHighlight: (color: string | null) => ReturnType;
      unsetTextStyle: () => ReturnType;
    };
  }
}

/* =========================================================
   Types
========================================================= */

type TableSize = { rows: number; cols: number };

type ToolbarTheme = "dark";

export type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;

  /** Optional hook for parent components (e.g., dictation insertion) */
  onReady?: (editor: any) => void;

  /** Toolbar theme stays aligned with the platform surface. */
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

function ToolbarSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative flex h-11 min-w-[122px] flex-col justify-center rounded-2xl border border-slate-800 bg-slate-950/85 pl-3 pr-9 transition hover:border-slate-700 focus-within:border-emerald-400/60 focus-within:bg-slate-900/95">
      <span className="pointer-events-none text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </span>
      <select
        className="h-5 appearance-none bg-transparent text-[12px] font-semibold text-slate-100 outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    </label>
  );
}

const FONT_FAMILY_OPTIONS = [
  { value: "Inter", label: "Inter" },
  { value: "system-ui", label: "System" },
  { value: "Georgia", label: "Georgia" },
  { value: "Times New Roman", label: "Times" },
  { value: "Menlo", label: "Menlo" },
];

const FONT_SIZE_OPTIONS = ["13px", "15px", "17px", "19px", "22px", "26px"];

const TextStyle = Mark.create({
  name: "textStyle",
  addAttributes() {
    return {
      fontFamily: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.fontFamily || null,
      },
      fontSize: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
      },
      backgroundColor: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.backgroundColor || null,
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[style]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const { fontFamily, fontSize, backgroundColor, ...rest } = HTMLAttributes as any;
    const styles = [
      fontFamily ? `font-family: ${fontFamily}` : null,
      fontSize ? `font-size: ${fontSize}` : null,
      backgroundColor ? `background-color: ${backgroundColor}` : null,
    ]
      .filter(Boolean)
      .join("; ");

    return ["span", mergeAttributes(rest, styles ? { style: styles } : {}), 0];
  },
  addCommands() {
    return {
      setFontFamily:
        (font) =>
        ({ chain }) =>
          chain().setMark(this.name, { fontFamily: font }).run(),
      setFontSize:
        (size) =>
        ({ chain }) =>
          chain().setMark(this.name, { fontSize: size }).run(),
      setHighlight:
        (color) =>
        ({ chain }) =>
          chain().setMark(this.name, { backgroundColor: color }).run(),
      unsetTextStyle:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
    };
  },
});

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
    <div className="absolute left-0 top-full z-50 mt-2 w-[220px] rounded-2xl border border-slate-800 bg-slate-950/95 p-3 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="mb-2 text-[11px] text-slate-400">
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
                  ? "border-emerald-400 bg-emerald-400/20"
                  : "border-slate-700 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800/80")
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
    "inline-flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-semibold transition select-none";

  const cls =
    theme === "dark"
      ? disabled
        ? `${base} border-slate-800 bg-slate-950/60 text-slate-600 cursor-not-allowed`
        : active
        ? `${base} border-emerald-400/50 bg-emerald-400/15 text-emerald-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`
        : `${base} border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900`
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
  toolbarTheme = "dark",
}: RichTextEditorProps) {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const effectivePlaceholder = placeholder ?? L("Write…", "Escribe…");
  const [tableOpen, setTableOpen] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const editorRef = useRef<any>(null);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      TextStyle,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
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
    onFocus: () => {
      setEditorFocused(true);
    },
    onBlur: () => {
      setEditorFocused(false);
    },
    editorProps: {
      attributes: {
        class:
          // Keep typography readable on dark background; use a scoped wrapper for list/table fixes.
          "nt-rte__content focus:outline-none px-4 py-3 text-[15px] leading-relaxed text-slate-100",
        style: `min-height: ${minHeight}px;`,
      },
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((item) => item.type.startsWith("image/"));
        if (!imageItem) return false;
        const file = imageItem.getAsFile();
        if (!file) return false;
        event.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          const src = reader.result as string;
          if (!src) return;
          editorRef.current?.chain().focus().setImage({ src }).run();
        };
        reader.readAsDataURL(file);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        const imageFile = files.find((file) => file.type.startsWith("image/"));
        if (!imageFile) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        const insertPos = coords?.pos;
        const reader = new FileReader();
        reader.onload = () => {
          const src = reader.result as string;
          if (!src) return;
          const chain = editorRef.current?.chain().focus();
          if (!chain) return;
          if (typeof insertPos === "number") {
            chain.insertContentAt(insertPos, { type: "image", attrs: { src } }).run();
          } else {
            chain.setImage({ src }).run();
          }
        };
        reader.readAsDataURL(imageFile);
        return true;
      },
    },
  });

  // Notify parent when ready
  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;
    if (!onReady) return;
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

  const activeTextStyle = (editor?.getAttributes("textStyle") as { fontFamily?: string; fontSize?: string }) ?? {};
  const currentFont = activeTextStyle.fontFamily || "Inter";
  const currentSize = activeTextStyle.fontSize || "15px";

  return (
    <div className={`w-full ${className}`.trim()}>
      {/*
        Keep the toolbar and the writing surface in the same dark language
        as the rest of the platform.
      */}
      <div
        className={`mb-2 flex flex-wrap items-center gap-1.5 rounded-2xl border p-2 shadow-[0_18px_40px_rgba(0,0,0,0.24)] transition ${
          editorFocused
            ? "border-emerald-400/40 bg-slate-950 shadow-[0_0_0_1px_rgba(52,211,153,0.12),0_18px_40px_rgba(0,0,0,0.26)]"
            : "border-slate-800/90 bg-slate-950/90"
        }`}
      >
        <div className="flex items-center gap-2 pr-1">
          <ToolbarSelect
            label={L("Font", "Fuente")}
            value={currentFont}
            onChange={(next) => editor?.chain().focus().setFontFamily(next).run()}
            options={FONT_FAMILY_OPTIONS}
          />
          <ToolbarSelect
            label={L("Size", "Tamaño")}
            value={currentSize}
            onChange={(next) => editor?.chain().focus().setFontSize(next).run()}
            options={FONT_SIZE_OPTIONS.map((size) => ({ value: size, label: size.replace("px", "") }))}
          />
        </div>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Bold", "Negrita")}
          active={!!editor?.isActive("bold")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Icon><Bold size={15} strokeWidth={2.2} /></Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Italic", "Itálica")}
          active={!!editor?.isActive("italic")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Icon><Italic size={15} strokeWidth={2.2} /></Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Underline", "Subrayado")}
          active={!!editor?.isActive("underline")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <Icon><UnderlineIcon size={15} strokeWidth={2.2} /></Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Bullet list", "Lista con viñetas")}
          active={!!editor?.isActive("bulletList")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <Icon><List size={15} strokeWidth={2.2} /></Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Numbered list", "Lista numerada")}
          active={!!editor?.isActive("orderedList")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <Icon><ListOrdered size={15} strokeWidth={2.2} /></Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Quote", "Cita")}
          active={!!editor?.isActive("blockquote")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Icon><Quote size={15} strokeWidth={2.2} /></Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Insert link", "Insertar enlace")}
          active={!!editor?.isActive("link")}
          disabled={!editor}
          onClick={insertLink}
        >
          <Icon><Link2 size={15} strokeWidth={2.2} /></Icon>
        </ToolbarButton>

        <div className="relative">
          <ToolbarButton
            theme={toolbarTheme}
            title={L("Insert table", "Insertar tabla")}
            disabled={!editor}
            onClick={() => setTableOpen((v) => !v)}
          >
            <Icon><Table2 size={15} strokeWidth={2.2} /></Icon>
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
          <Icon><Rows3 size={15} strokeWidth={2.2} /></Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Add table column", "Agregar columna")}
          disabled={!editor || !can(() => editor!.can().addColumnAfter())}
          onClick={() => editor?.chain().focus().addColumnAfter().run()}
        >
          <Icon><Columns3 size={15} strokeWidth={2.2} /></Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Delete table", "Eliminar tabla")}
          disabled={!editor || !can(() => editor!.can().deleteTable())}
          onClick={() => editor?.chain().focus().deleteTable().run()}
        >
          <Icon><Trash2 size={15} strokeWidth={2.2} /></Icon>
        </ToolbarButton>

        <div className="ml-auto" />

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Heading", "Título")}
          active={!!editor?.isActive("heading", { level: 1 })}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Icon><Heading1 size={15} strokeWidth={2.2} /></Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Undo", "Deshacer")}
          disabled={!editor || !can(() => editor!.can().undo())}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Icon><Undo2 size={15} strokeWidth={2.2} /></Icon>
        </ToolbarButton>

        <ToolbarButton
          theme={toolbarTheme}
          title={L("Redo", "Rehacer")}
          disabled={!editor || !can(() => editor!.can().redo())}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Icon><Redo2 size={15} strokeWidth={2.2} /></Icon>
        </ToolbarButton>
      </div>

      <div
        className={`nt-rte overflow-hidden rounded-2xl border bg-slate-950/95 shadow-[inset_0_1px_0_rgba(148,163,184,0.05)] transition ${
          editorFocused
            ? "border-emerald-400/45 shadow-[0_0_0_1px_rgba(52,211,153,0.12),inset_0_1px_0_rgba(148,163,184,0.05),0_16px_36px_rgba(0,0,0,0.22)]"
            : "border-slate-800/90"
        }`}
      >
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

        .nt-rte .ProseMirror {
          caret-color: rgba(30, 230, 168, 0.95);
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

        .nt-rte .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          margin: 0.6rem 0;
        }
      `}</style>
    </div>
  );
}
