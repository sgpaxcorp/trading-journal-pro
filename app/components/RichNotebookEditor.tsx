"use client";

import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { Bold, Italic, List, ListOrdered } from "lucide-react";

type RichNotebookEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
};

type ToolbarButtonProps = {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function ToolbarButton({ active, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] border transition
        ${
          active
            ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-100"
            : "border-slate-700 bg-slate-900/80 text-slate-200 hover:border-emerald-400/60 hover:text-emerald-50"
        }`}
    >
      {children}
    </button>
  );
}

export default function RichNotebookEditor({
  value,
  onChange,
  placeholder = "Write your notes here…",
  minHeight = 260,
}: RichNotebookEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Placeholder.configure({
        placeholder,
      }),
      CharacterCount.configure(),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    // evita problemas de SSR / hidratación
    immediatelyRender: false,
  });

  // Sincronizar si cambia el value externo
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== (value || "")) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="rounded-[28px] border border-slate-700/80 bg-slate-950/90 shadow-inner shadow-slate-950/60 overflow-hidden">
      {/* Toolbar sencilla */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-slate-800/80 bg-slate-950/90">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="w-3 h-3" />
          <span>Bold</span>
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="w-3 h-3" />
          <span>Italic</span>
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="w-3 h-3" />
          <span>Bullet</span>
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="w-3 h-3" />
          <span>Numbered</span>
        </ToolbarButton>
      </div>

      {/* Contenido */}
      <div
        className="px-4 py-3 text-sm text-slate-100 prose prose-invert max-w-none"
        style={{ minHeight }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
