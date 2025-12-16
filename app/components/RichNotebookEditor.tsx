"use client";

import React, { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

type RichNotebookEditorProps = {
  value: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
};

export default function RichNotebookEditor({
  value,
  onChange,
  placeholder,
  minHeight = 220,
}: RichNotebookEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
    ],
    content: value || "",
    editable: true,
    autofocus: false,
    immediatelyRender: false, // evita problemas de SSR
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

  if (!editor) {
    // estado mientras se monta el editor
    return (
      <div
        className="rounded-[28px] border border-slate-700/80 bg-slate-950/90"
        style={{ minHeight }}
      />
    );
  }

  const toolbarButtonBase =
    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition";

  return (
    <div
      className="rounded-[28px] border border-slate-700/80 bg-slate-950/90 shadow-inner shadow-slate-950/50 overflow-hidden"
      style={{ minHeight }}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 bg-slate-950/90 px-4 py-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${toolbarButtonBase} ${
            editor.isActive("bold")
              ? "bg-slate-100 text-slate-900 border-slate-200"
              : "bg-slate-900 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
        >
          <span className="font-semibold">B</span>
          <span>Bold</span>
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${toolbarButtonBase} ${
            editor.isActive("italic")
              ? "bg-slate-100 text-slate-900 border-slate-200"
              : "bg-slate-900 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
        >
          <span className="italic">I</span>
          <span>Italic</span>
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`${toolbarButtonBase} ${
            editor.isActive("bulletList")
              ? "bg-slate-100 text-slate-900 border-slate-200"
              : "bg-slate-900 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
        >
          <span>•</span>
          <span>Bullet</span>
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`${toolbarButtonBase} ${
            editor.isActive("orderedList")
              ? "bg-slate-100 text-slate-900 border-slate-200"
              : "bg-slate-900 text-slate-200 border-slate-700 hover:border-emerald-400/60"
          }`}
        >
          <span>1.</span>
          <span>Numbered</span>
        </button>
      </div>

      {/* Área de escritura */}
      <div className="relative px-4 py-3">
        {placeholder && isEmpty && (
          <div className="pointer-events-none absolute left-4 top-3 text-xs text-slate-500">
            {placeholder}
          </div>
        )}

        <EditorContent
          editor={editor}
          className="prose prose-invert max-w-none text-sm focus:outline-none **:focus-visible:outline-none min-h-[140px]"
        />
      </div>
    </div>
  );
}
