"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { useEditor, EditorContent } from "@tiptap/react";
import { Mark, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  Link2,
  Table2,
  Highlighter,
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

type RichNotebookEditorProps = {
  value: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
};

type TableSize = { rows: number; cols: number };

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
    <div className="absolute left-0 top-full mt-2 w-[210px] rounded-xl border border-slate-800 bg-slate-950 p-3 shadow-xl z-50">
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
                  ? "border-emerald-400 bg-emerald-400/20"
                  : "border-slate-700 bg-slate-900/70 hover:bg-slate-800/70")
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

export default function RichNotebookEditor({
  value,
  onChange,
  placeholder,
  minHeight = 220,
}: RichNotebookEditorProps) {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      TextStyle,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
        defaultAlignment: "left",
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || "",
    editable: true,
    autofocus: false,
    immediatelyRender: false, // evita problemas de SSR
    editorProps: {
      attributes: {
        class:
          "ntj-notebook-editor w-full focus:outline-none text-sm leading-relaxed text-slate-100 px-4 py-3",
        style: `min-height: ${minHeight}px;`,
        spellcheck: "true",
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      if (html !== value && onChange) {
        onChange(html);
      }
    },
  });

  // Mantener el editor sincronizado si cambia el value desde fuera
  useEffect(() => {
    if (!editor) return;

    const current = editor.getHTML();
    const target = value || "";

    if (current === target) return;

    editor.commands.setContent(target, {}); // sin 'false' para evitar errores de tipos
  }, [value, editor]);

  const [isEmpty, setIsEmpty] = useState(true);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const tableButtonRef = useRef<HTMLButtonElement | null>(null);
  const tablePickerRef = useRef<HTMLDivElement | null>(null);

  // Para mostrar placeholder cuando está vacío
  useEffect(() => {
    if (!editor) return;

    const updateEmpty = () => {
      setIsEmpty(editor.isEmpty);
    };

    updateEmpty();
    editor.on("update", updateEmpty);
    editor.on("selectionUpdate", updateEmpty);

    return () => {
      editor.off("update", updateEmpty);
      editor.off("selectionUpdate", updateEmpty);
    };
  }, [editor]);

  useEffect(() => {
    if (!tablePickerOpen) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        tablePickerRef.current?.contains(target) ||
        tableButtonRef.current?.contains(target)
      ) {
        return;
      }
      setTablePickerOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [tablePickerOpen]);

  if (!editor) {
    return (
      <div
        className="rounded-2xl border border-slate-800/80 bg-slate-950/80 shadow-inner shadow-slate-950/60"
        style={{ minHeight }}
      />
    );
  }

  const toolbarButtonBase =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border text-[11px] font-semibold tracking-wide transition";

  const activeTextStyle = editor.getAttributes("textStyle") as any;
  const currentFont = activeTextStyle?.fontFamily || "Inter";
  const currentSize = activeTextStyle?.fontSize || "14px";
  const isHighlighted = Boolean(activeTextStyle?.backgroundColor);

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(L("Link URL", "URL del enlace"), prev || "");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-slate-950/80 shadow-[0_20px_60px_rgba(0,0,0,0.35)] overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 bg-slate-950/90 px-4 py-2">
        <div className="flex items-center gap-2 mr-2">
          <select
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1 text-[11px] text-slate-200"
            value={currentFont}
            onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
          >
            <option value="Inter">Inter</option>
            <option value="system-ui">System</option>
            <option value="Georgia">Georgia</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Menlo">Menlo</option>
          </select>
          <select
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1 text-[11px] text-slate-200"
            value={currentSize}
            onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
          >
            {["12px", "14px", "16px", "18px", "20px", "24px"].map((size) => (
              <option key={size} value={size}>
                {size.replace("px", "")}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${toolbarButtonBase} ${
            editor.isActive("bold")
              ? "bg-emerald-200 text-slate-900 border-emerald-200"
              : "bg-slate-900/70 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
          title={L("Bold", "Negrita")}
        >
          <Bold size={14} />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${toolbarButtonBase} ${
            editor.isActive("italic")
              ? "bg-emerald-200 text-slate-900 border-emerald-200"
              : "bg-slate-900/70 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
          title={L("Italic", "Itálica")}
        >
          <Italic size={14} />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`${toolbarButtonBase} ${
            editor.isActive("underline")
              ? "bg-emerald-200 text-slate-900 border-emerald-200"
              : "bg-slate-900/70 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
          title={L("Underline", "Subrayado")}
        >
          <UnderlineIcon size={14} />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`${toolbarButtonBase} ${
            editor.isActive("strike")
              ? "bg-emerald-200 text-slate-900 border-emerald-200"
              : "bg-slate-900/70 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
          title={L("Strike", "Tachar")}
        >
          <Strikethrough size={14} />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`${toolbarButtonBase} ${
            editor.isActive("heading", { level: 2 })
              ? "bg-emerald-200 text-slate-900 border-emerald-200"
              : "bg-slate-900/70 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
          title={L("Heading", "Título")}
        >
          <Heading2 size={14} />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`${toolbarButtonBase} ${
            editor.isActive("bulletList")
              ? "bg-emerald-200 text-slate-900 border-emerald-200"
              : "bg-slate-900/70 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
          title={L("Bullet", "Viñetas")}
        >
          <List size={14} />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`${toolbarButtonBase} ${
            editor.isActive("orderedList")
              ? "bg-emerald-200 text-slate-900 border-emerald-200"
              : "bg-slate-900/70 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
          title={L("Numbered", "Numerado")}
        >
          <ListOrdered size={14} />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`${toolbarButtonBase} ${
            editor.isActive("blockquote")
              ? "bg-emerald-200 text-slate-900 border-emerald-200"
              : "bg-slate-900/70 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
          title={L("Quote", "Cita")}
        >
          <Quote size={14} />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`${toolbarButtonBase} ${
            editor.isActive("codeBlock")
              ? "bg-emerald-200 text-slate-900 border-emerald-200"
              : "bg-slate-900/70 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
          title={L("Code", "Código")}
        >
          <Code size={14} />
        </button>

        <button
          type="button"
          onClick={() =>
            editor
              .chain()
              .focus()
              .setHighlight(isHighlighted ? null : "rgba(16,185,129,0.35)")
              .run()
          }
          className={`${toolbarButtonBase} ${
            isHighlighted
              ? "bg-emerald-200 text-slate-900 border-emerald-200"
              : "bg-slate-900/70 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
          title={L("Highlight", "Resaltar")}
        >
          <Highlighter size={14} />
        </button>

        <button
          type="button"
          onClick={setLink}
          className={`${toolbarButtonBase} ${
            editor.isActive("link")
              ? "bg-emerald-200 text-slate-900 border-emerald-200"
              : "bg-slate-900/70 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
          title={L("Link", "Enlace")}
        >
          <Link2 size={14} />
        </button>

        <div className="relative" ref={tablePickerRef}>
          <button
            ref={tableButtonRef}
            type="button"
            onClick={() => setTablePickerOpen((prev) => !prev)}
            className={`${toolbarButtonBase} bg-slate-900/70 text-slate-200 border-slate-700 hover:border-emerald-400/60`}
            title={L("Insert table", "Insertar tabla")}
          >
            <Table2 size={14} />
          </button>
          {tablePickerOpen && (
            <TablePicker
              onPick={({ rows, cols }) => {
                editor
                  .chain()
                  .focus()
                  .insertTable({ rows, cols, withHeaderRow: true })
                  .run();
                setTablePickerOpen(false);
              }}
              label={(r, c) =>
                L(`Pick table size`, `Selecciona tamaño`)
              }
              ariaLabel={(r, c) =>
                L(`Insert ${r} by ${c} table`, `Insertar tabla de ${r} × ${c}`)
              }
              titleLabel={(r, c) =>
                L(`Insert ${r}×${c}`, `Insertar ${r}×${c}`)
              }
            />
          )}
        </div>
      </div>

      {/* Área de escritura */}
      <div
        className="relative cursor-text"
        onMouseDown={(e) => {
          if (!editor) return;
          const target = e.target as HTMLElement;
          if (target.closest(".ProseMirror")) return;
          editor.chain().focus().run();
        }}
      >
        {placeholder && isEmpty && (
          <div className="pointer-events-none absolute left-4 top-3 text-xs text-slate-500">
            {placeholder}
          </div>
        )}

        <EditorContent
          editor={editor}
          className="w-full **:focus-visible:outline-none"
          style={{ minHeight }}
        />
      </div>

      <style jsx global>{`
        .ntj-notebook-editor {
          width: 100%;
          max-width: 100%;
          min-height: ${minHeight}px;
          height: 100%;
          outline: none;
          text-align: left;
          white-space: pre-wrap;
          word-break: break-word;
          overflow-wrap: anywhere;
          caret-color: rgba(226, 232, 240, 0.9);
        }

        .ntj-notebook-editor p {
          margin: 0.45rem 0;
        }

        .ntj-notebook-editor ul,
        .ntj-notebook-editor ol {
          padding-left: 1.25rem;
          margin: 0.6rem 0;
        }

        .ntj-notebook-editor ul {
          list-style: disc;
        }

        .ntj-notebook-editor ol {
          list-style: decimal;
        }

        .ntj-notebook-editor li {
          margin: 0.25rem 0;
        }

        .ntj-notebook-editor table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.75rem 0;
          table-layout: fixed;
        }

        .ntj-notebook-editor th,
        .ntj-notebook-editor td {
          border: 1px solid rgba(226, 232, 240, 0.28);
          padding: 0.5rem 0.6rem;
          vertical-align: top;
          word-break: break-word;
        }

        .ntj-notebook-editor th {
          background: rgba(2, 6, 23, 0.6);
          color: rgba(226, 232, 240, 0.95);
          font-weight: 700;
        }

        .ntj-notebook-editor td {
          background: rgba(2, 6, 23, 0.25);
        }

        .ntj-notebook-editor .selectedCell:after {
          background: rgba(16, 185, 129, 0.18);
        }

        .ntj-notebook-editor a {
          color: rgba(110, 231, 183, 0.95);
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .ntj-notebook-editor blockquote {
          border-left: 2px solid rgba(16, 185, 129, 0.6);
          padding-left: 0.75rem;
          margin: 0.75rem 0;
          color: rgba(226, 232, 240, 0.85);
        }
      `}</style>
    </div>
  );
}
