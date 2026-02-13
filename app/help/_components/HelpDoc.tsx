import fs from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

type HelpDocProps = {
  source: string;
};

type DocSection = {
  title: string;
  body: string;
};

function loadDoc(source: string): string {
  const filePath = path.join(process.cwd(), source);
  return fs.readFileSync(filePath, "utf8");
}

function splitDoc(content: string): { intro: string; sections: DocSection[] } {
  const lines = content.split(/\r?\n/);
  const introLines: string[] = [];
  const sections: DocSection[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];
  let inCodeBlock = false;

  const pushSection = () => {
    if (!currentTitle) return;
    sections.push({
      title: currentTitle,
      body: currentLines.join("\n").trim(),
    });
    currentTitle = null;
    currentLines = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
    }

    if (!inCodeBlock && line.startsWith("## ")) {
      if (currentTitle) pushSection();
      currentTitle = line.slice(3).trim();
      currentLines = [];
      continue;
    }

    if (currentTitle) {
      currentLines.push(line);
    } else {
      introLines.push(line);
    }
  }

  if (currentTitle) pushSection();

  return {
    intro: introLines.join("\n").trim(),
    sections,
  };
}

export default function HelpDoc({ source }: HelpDocProps) {
  const content = loadDoc(source);
  const { intro, sections } = splitDoc(content);

  const markdownComponents: Components = {
    h1: ({ children }: any) => (
      <h1 className="text-3xl font-semibold text-slate-100 tracking-tight mb-4">
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-xl font-semibold text-slate-100 mt-10 mb-3">
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-lg font-semibold text-slate-100 mt-6 mb-2">
        {children}
      </h3>
    ),
    p: ({ children }: any) => (
      <p className="text-sm text-slate-300 leading-relaxed mb-3">
        {children}
      </p>
    ),
    ul: ({ children }: any) => (
      <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1 mb-4">
        {children}
      </ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal pl-5 text-sm text-slate-300 space-y-1 mb-4">
        {children}
      </ol>
    ),
    li: ({ children }: any) => <li>{children}</li>,
    a: ({ href, children }: any) => (
      <a
        href={href}
        className="underline underline-offset-2"
        style={{ color: "var(--nt-emerald)" }}
      >
        {children}
      </a>
    ),
    img: ({ src, alt }: any) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src || ""}
        alt={alt || "Screenshot"}
        className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 my-4"
      />
    ),
    code: ({ children }: any) => (
      <code className="rounded bg-slate-900/80 px-1 py-0.5 text-[12px] text-emerald-200">
        {children}
      </code>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-2 border-emerald-400/40 pl-3 text-sm text-slate-300 my-4">
        {children}
      </blockquote>
    ),
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full text-sm text-slate-300 border border-slate-800">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-slate-900/70 text-slate-200">{children}</thead>
    ),
    th: ({ children }: any) => (
      <th className="text-left font-semibold px-3 py-2 border-b border-slate-800">
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className="px-3 py-2 border-b border-slate-800">{children}</td>
    ),
    hr: () => <hr className="border-slate-800 my-6" />,
  };

  return (
    <article className="max-w-none">
      {intro ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {intro}
        </ReactMarkdown>
      ) : null}

      {sections.length > 0 ? (
        <div className="mt-5 space-y-3">
          {sections.map((section) => (
            <details
              key={section.title}
              className="rounded-2xl border px-4 py-3"
              style={{
                backgroundColor: "rgba(15, 23, 42, 0.82)",
                borderColor: "rgba(148, 163, 184, 0.22)",
              }}
            >
              <summary className="cursor-pointer text-sm font-semibold text-slate-100">
                {section.title}
              </summary>
              <div className="mt-3">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {section.body}
                </ReactMarkdown>
              </div>
            </details>
          ))}
        </div>
      ) : null}
    </article>
  );
}
