"use client";

/**
 * Neuro Event Bus (client)
 * Standardized on a single window CustomEvent to communicate across the app
 * without tight component coupling.
 *
 * Event name: "ntj_neuro_push"
 *
 * Payload:
 * - { kind: "neuro_open" }
 * - { kind: "neuro_push", text: string }
 *
 * Your NeuroAssistant already consumes `onNeuroPush(...)`.
 * Any part of the app can call `neuroPush(...)` / `neuroOpen(...)`.
 */

export type NeuroPush =
  | { kind: "neuro_open" }
  | { kind: "neuro_push"; text: string };

const EVT = "ntj_neuro_push";

type Listener = (p: NeuroPush) => void;

function isValidPayload(x: any): x is NeuroPush {
  if (!x || typeof x !== "object") return false;
  if (x.kind === "neuro_open") return true;
  if (x.kind === "neuro_push" && typeof x.text === "string") return true;
  return false;
}

export function onNeuroPush(cb: Listener) {
  const handler = (e: Event) => {
    const ce = e as CustomEvent;
    const payload = ce.detail;
    if (!isValidPayload(payload)) return;
    cb(payload);
  };

  window.addEventListener(EVT, handler as any);
  return () => window.removeEventListener(EVT, handler as any);
}

export function neuroOpen() {
  window.dispatchEvent(new CustomEvent(EVT, { detail: { kind: "neuro_open" } }));
}

export function neuroPush(text: string) {
  window.dispatchEvent(
    new CustomEvent(EVT, { detail: { kind: "neuro_push", text } })
  );
}

/** Backward/alt aliases (harmless if unused) */
export const pushNeuro = neuroPush;
export const openNeuro = neuroOpen;
export const emitNeuroPush = neuroPush;
