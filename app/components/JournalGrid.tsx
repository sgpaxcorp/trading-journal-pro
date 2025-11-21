"use client";

import React from "react";
import {
  Responsive,
  WidthProvider,
  type Layout,
  type Layouts,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

export type JournalWidgetId =
  | "pnl"
  | "premarket"
  | "inside"
  | "after"
  | "entries"
  | "exits"
  | "emotional"
  | "strategy"
  | "screenshots"
  | "templates"
  | "actions";

export type JournalWidgetDef = {
  id: JournalWidgetId;
  title: string;
  defaultLayout: Layout; // SOLO primera vez (lg)
  render: () => React.ReactNode;
};

function safeReadJSON<T>(key: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fb;
    return JSON.parse(raw) as T;
  } catch {
    return fb;
  }
}
function safeWriteJSON(key: string, value: any) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * Merge: mantiene tamaños/pos previos, mete nuevos widgets con defaults.
 */
function mergeLayouts(
  prev: Layout[],
  incoming: Layout[],
  activeIds: string[],
  defaults: Layout[]
) {
  const byIdPrev = Object.fromEntries(prev.map((l) => [l.i, l]));
  const byIdIncoming = Object.fromEntries(incoming.map((l) => [l.i, l]));

  const merged: Layout[] = [];

  for (const id of activeIds) {
    const a = byIdIncoming[id];
    const p = byIdPrev[id];
    const d = defaults.find((x) => x.i === id);

    merged.push({
      ...(d || { i: id, x: 0, y: Infinity, w: 4, h: 4 }),
      ...(p || {}),
      ...(a || {}),
      i: id,
    });
  }
  return merged;
}

/**
 * Crea layouts "fallback" por breakpoint basado en lg.
 * Esto evita que responsive meta cosas raras al entrar por primera vez.
 */
function buildFallbackLayoutsFromLg(lg: Layout[]): Layouts {
  const clone = (colsFrom: number, colsTo: number) =>
    lg.map((l) => ({
      ...l,
      x: Math.round((l.x / colsFrom) * colsTo),
      w: Math.max(1, Math.round((l.w / colsFrom) * colsTo)),
    }));

  return {
    lg,
    md: clone(12, 10),
    sm: clone(12, 6),
    xs: clone(12, 4),
    xxs: clone(12, 2),
  };
}

export default function JournalGrid({
  storageKey,
  widgets,
  activeIds,
}: {
  storageKey: string;
  widgets: JournalWidgetDef[];
  activeIds: JournalWidgetId[];
}) {
  const activeWidgets = React.useMemo(
    () => widgets.filter((w) => activeIds.includes(w.id)),
    [widgets, activeIds]
  );

  const defaultLg = React.useMemo(
    () => activeWidgets.map((w) => w.defaultLayout),
    [activeWidgets]
  );

  const [breakpoint, setBreakpoint] =
    React.useState<keyof Layouts>("lg");

  const [layouts, setLayouts] = React.useState<Layouts>(() => {
    const saved = safeReadJSON<Layouts | null>(storageKey, null);

    // Primera vez -> usa un layout bonito (lg) y genera fallbacks para otros bp.
    if (!saved || !saved.lg) {
      const base = buildFallbackLayoutsFromLg(defaultLg);
      safeWriteJSON(storageKey, base);
      return base;
    }

    const savedLg = (saved.lg || []).filter((l) =>
      activeIds.includes(l.i as JournalWidgetId)
    );

    const missing = activeWidgets
      .filter((w) => !savedLg.find((l) => l.i === w.id))
      .map((w) => w.defaultLayout);

    const mergedLg = [...savedLg, ...missing];

    const mergedAll: Layouts = {
      ...saved,
      ...buildFallbackLayoutsFromLg(mergedLg),
      lg: mergedLg,
    };

    safeWriteJSON(storageKey, mergedAll);
    return mergedAll;
  });

  // Si cambian widgets activos: NO resetea tamaños, solo añade/borra.
  React.useEffect(() => {
    setLayouts((prev) => {
      const prevBp = (prev[breakpoint] || []) as Layout[];
      const kept = prevBp.filter((l) =>
        activeIds.includes(l.i as JournalWidgetId)
      );
      const missing = activeWidgets
        .filter((w) => !kept.find((l) => l.i === w.id))
        .map((w) => w.defaultLayout);

      const nextBp = [...kept, ...missing];
      const next = { ...prev, [breakpoint]: nextBp };

      safeWriteJSON(storageKey, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds.join("|")]);

  const handleLayoutChange = (current: Layout[], all: Layouts) => {
    setLayouts((prev) => {
      const prevBp = (prev[breakpoint] || []) as Layout[];
      const mergedBp = mergeLayouts(
        prevBp,
        current,
        activeIds as string[],
        defaultLg
      );

      const next = {
        ...prev,
        ...all,
        [breakpoint]: mergedBp,
      };

      safeWriteJSON(storageKey, next);
      return next;
    });
  };

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={layouts}
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
      cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
      rowHeight={30}
      margin={[12, 12]}
      containerPadding={[0, 0]}
      onBreakpointChange={(bp) => setBreakpoint(bp)}
      onLayoutChange={handleLayoutChange}

      /** ✅ clave: compact vertical para que re-acomode */
      compactType="vertical"
      verticalCompact={true}
      preventCollision={false}
      isBounded={true}
      draggableHandle=".widget-drag"
    >
      {activeWidgets.map((w) => (
        <div
          key={w.id}
          className="rounded-2xl border border-slate-800 bg-slate-900/95 overflow-hidden shadow-sm min-h-0"
        >
          <div className="widget-drag cursor-move px-3 py-2 text-xs text-slate-300 border-b border-slate-800 bg-slate-950/50">
            {w.title}
          </div>
          <div className="p-3 min-h-0 h-full">{w.render()}</div>
        </div>
      ))}
    </ResponsiveGridLayout>
  );
}
