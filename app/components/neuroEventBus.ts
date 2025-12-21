export type NeuroPush =
  | { kind: "neuro_push"; text: string; ts: number }
  | { kind: "neuro_open"; ts: number };

const EVENT_NAME = "neuro:push";

export function pushNeuroMessage(text: string) {
  const payload: NeuroPush = { kind: "neuro_push", text, ts: Date.now() };
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
}

export function openNeuroPanel() {
  const payload: NeuroPush = { kind: "neuro_open", ts: Date.now() };
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
}

export function onNeuroPush(cb: (p: NeuroPush) => void) {
  const handler = (e: Event) => {
    const ce = e as CustomEvent<NeuroPush>;
    if (!ce.detail) return;
    cb(ce.detail);
  };

  window.addEventListener(EVENT_NAME, handler as any);
  return () => window.removeEventListener(EVENT_NAME, handler as any);
}
