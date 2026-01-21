// app/components/AppSettingsButton.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppSettings } from "@/context/AppSettingsContext";

function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 15a8.3 8.3 0 0 0 .1-1l2-1.1-2-3.5-2.3.5a7.8 7.8 0 0 0-1.7-1L15 6l-4-.0-.5 2.0a7.8 7.8 0 0 0-1.7 1L6.5 8.4l-2 3.5 2 1.1a8.3 8.3 0 0 0 0 2l-2 1.1 2 3.5 2.3-.5a7.8 7.8 0 0 0 1.7 1L11 22h4l.5-2a7.8 7.8 0 0 0 1.7-1l2.3.5 2-3.5-2.1-1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

function normalizeLocaleInput(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "en";
  // Keep casing as lower for consistency; allow tags like es-PR
  return s.toLowerCase();
}

export default function AppSettingsButton() {
  const { theme, locale, setTheme, setLocale, t, localeOptions } = useAppSettings();

  const [open, setOpen] = useState(false);
  const [langMode, setLangMode] = useState<"preset" | "custom">("preset");
  const [customLocale, setCustomLocale] = useState("");

  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const el = wrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const presetCodes = useMemo(() => localeOptions.map((o) => o.code), [localeOptions]);
  const isPreset = presetCodes.includes((locale || "en").toLowerCase().split("-")[0]);

  useEffect(() => {
    // Keep the UI state consistent with the stored locale
    if (isPreset) {
      setLangMode("preset");
      setCustomLocale("");
    } else {
      setLangMode("custom");
      setCustomLocale(locale || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1.5 text-xs text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <GearIcon />
        <span className="hidden sm:inline">{t("settings.title")}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("settings.title")}
          className="absolute right-0 z-50 mt-2 w-[320px] rounded-2xl border border-slate-800 bg-slate-900/95 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-100">
                {t("settings.title")}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {t("settings.subtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
            >
              {t("common.close")}
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {/* Theme */}
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                {t("settings.theme")}
              </p>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTheme("neuro")}
                  className={`rounded-xl border px-3 py-2 text-xs transition ${
                    theme === "neuro"
                      ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                      : "border-slate-700 bg-slate-950/40 text-slate-200 hover:border-emerald-400/60"
                  }`}
                >
                  {t("settings.theme.neuro")}
                </button>

                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`rounded-xl border px-3 py-2 text-xs transition ${
                    theme === "light"
                      ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                      : "border-slate-700 bg-slate-950/40 text-slate-200 hover:border-emerald-400/60"
                  }`}
                >
                  {t("settings.theme.light")}
                </button>
              </div>
            </div>

            {/* Language */}
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                {t("settings.language")}
              </p>

              <div className="mt-2 flex items-center gap-2">
                <select
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30"
                  value={langMode === "custom" ? "__custom__" : (locale || "en").toLowerCase().split("-")[0]}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__custom__") {
                      setLangMode("custom");
                      setCustomLocale(locale || "");
                      return;
                    }
                    setLangMode("preset");
                    setCustomLocale("");
                    setLocale(v);
                  }}
                >
                  {localeOptions.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label} ({o.code})
                    </option>
                  ))}
                  <option value="__custom__">{t("settings.otherLanguage")}</option>
                </select>
              </div>

              {langMode === "custom" && (
                <div className="mt-2">
                  <input
                    value={customLocale}
                    onChange={(e) => setCustomLocale(e.target.value)}
                    onBlur={() => setLocale(normalizeLocaleInput(customLocale))}
                    placeholder="e.g. es-PR, de, it"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    {t("settings.saveHint")}
                  </p>
                </div>
              )}
            </div>
          </div>

          <p className="mt-4 text-[10px] text-slate-500">
            {t("settings.saveHint")}
          </p>
        </div>
      )}
    </div>
  );
}
