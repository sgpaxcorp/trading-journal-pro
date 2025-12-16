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

/** ✅ mins 50% menor (y nunca menos de 1) */
function halveMins(l: Layout): Layout {
  const minW =
    typeof l.minW === "number" ? Math.max(1, Math.ceil(l.minW / 2)) : 1;
  const minH =
    typeof l.minH === "number" ? Math.max(1, Math.ceil(l.minH / 2)) : 1;
  return { ...l, minW, minH };
}

/**
 * Crea fallbacks por breakpoint desde lg.
 * ✅ FIX: clamp x para que x+w no se salga del grid en breakpoints pequeños.
 */
function buildFallbackLayoutsFromLg(lg: Layout[]): Layouts {
  const clone = (colsFrom: number, colsTo: number) =>
    lg.map((l) => {
      const w = Math.max(1, Math.round((l.w / colsFrom) * colsTo));
      const x = Math.max(
        0,
        Math.min(colsTo - w, Math.round((l.x / colsFrom) * colsTo))
      );

      return {
        ...l,
        x,
        w,
        minW: l.minW,
        minH: l.minH,
      };
    });

  return {
    lg,
    md: clone(12, 10),
    sm: clone(12, 6),
    xs: clone(12, 4),
    xxs: clone(12, 2),
  };
}

/**
 * ✅ Inyecta mins nuevos en TODOS los breakpoints,
 * eliminando mins guardados viejos.
 */
function injectMinsAllBreakpoints(layouts: Layouts, defaultsAll: Layouts): Layouts {
  const out: Layouts = { ...layouts };

  (Object.keys(defaultsAll) as (keyof Layouts)[]).forEach((bp) => {
    const defBp = (defaultsAll[bp] || []) as Layout[];
    const curBp = (out[bp] || []) as Layout[];

    out[bp] = curBp.map((l) => {
      const d = defBp.find((x) => x.i === l.i);
      if (!d) return { ...l, minW: 1, minH: 1 };
      return {
        ...l,
        minW: d.minW ?? 1,
        minH: d.minH ?? 1,
      };
    });
  });

  return out;
}

/**
 * Merge por breakpoint sin perder posición/tamaño,
 * pero respetando mins nuevos (ya halved).
 */
function mergeLayouts(
  prev: Layout[],
  incoming: Layout[],
  activeIds: string[],
  defaultsBp: Layout[]
) {
  const byIdPrev = Object.fromEntries(prev.map((l) => [l.i, l]));
  const byIdIncoming = Object.fromEntries(incoming.map((l) => [l.i, l]));

  const merged: Layout[] = [];

  for (const id of activeIds) {
    const a = byIdIncoming[id];
    const p = byIdPrev[id];
    const d = defaultsBp.find((x) => x.i === id);

    const base =
      d ||
      ({
        i: id,
        x: 0,
        y: Infinity,
        w: 4,
        h: 4,
        minW: 1,
        minH: 1,
      } as Layout);

    merged.push({
      ...base,
      ...(p || {}),
      ...(a || {}),
      i: id,
      // ✅ fuerza min actual, no el viejo
      minW: base.minW,
      minH: base.minH,
    });
  }

  return merged;
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
  /**
   * ✅ FIX de hydration:
   * react-grid-layout calcula height diferente en server vs client.
   * Renderizamos el grid SOLO después de montar en cliente.
   */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const activeWidgets = React.useMemo(
    () => widgets.filter((w) => activeIds.includes(w.id)),
    [widgets, activeIds]
  );

  /** defaults lg con mins halved */
  const defaultLg = React.useMemo(
    () => activeWidgets.map((w) => halveMins(w.defaultLayout)),
    [activeWidgets]
  );

  /** defaults para TODOS bp */
  const defaultsAll = React.useMemo(
    () => buildFallbackLayoutsFromLg(defaultLg),
    [defaultLg]
  );

  const [breakpoint, setBreakpoint] = React.useState<keyof Layouts>("lg");

  const [layouts, setLayouts] = React.useState<Layouts>(() => {
    const saved = safeReadJSON<Layouts | null>(storageKey, null);

    if (!saved || !saved.lg) {
      const base = defaultsAll;
      safeWriteJSON(storageKey, base);
      return base;
    }

    // 1) Filtra solo activos
    const filtered: Layouts = { ...saved };
    (Object.keys(filtered) as (keyof Layouts)[]).forEach((bp) => {
      filtered[bp] = ((filtered[bp] || []) as Layout[]).filter((l) =>
        activeIds.includes(l.i as JournalWidgetId)
      );
    });

    // 2) Añade missing en lg (y luego fallbacks)
    const savedLg = (filtered.lg || []) as Layout[];
    const missingLg = activeWidgets
      .filter((w) => !savedLg.find((l) => l.i === w.id))
      .map((w) => halveMins(w.defaultLayout));

    const mergedLg = [...savedLg, ...missingLg];
    const rebuiltAll = buildFallbackLayoutsFromLg(mergedLg);

    // 3) ✅ inyecta nuevos mins en todos bp
    const finalAll = injectMinsAllBreakpoints(rebuiltAll, defaultsAll);

    safeWriteJSON(storageKey, finalAll);
    return finalAll;
  });

  // ✅ cuando cambian widgets activos -> añade/borra y vuelve a inyectar mins
  React.useEffect(() => {
    setLayouts((prev) => {
      const next: Layouts = { ...prev };

      (Object.keys(next) as (keyof Layouts)[]).forEach((bp) => {
        const prevBp = (next[bp] || []) as Layout[];
        const kept = prevBp.filter((l) =>
          activeIds.includes(l.i as JournalWidgetId)
        );

        const defBp = (defaultsAll[bp] || []) as Layout[];
        const missing = activeWidgets
          .filter((w) => !kept.find((l) => l.i === w.id))
          .map((w) => {
            const d = defBp.find((x) => x.i === w.id);
            return d || halveMins(w.defaultLayout);
          });

        next[bp] = [...kept, ...missing];
      });

      const finalAll = injectMinsAllBreakpoints(next, defaultsAll);
      safeWriteJSON(storageKey, finalAll);
      return finalAll;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds.join("|")]);

  const handleLayoutChange = (current: Layout[], all: Layouts) => {
    setLayouts((prev) => {
      const prevBp = (prev[breakpoint] || []) as Layout[];
      const defaultsBp = (defaultsAll[breakpoint] || []) as Layout[];

      const mergedBp = mergeLayouts(
        prevBp,
        current,
        activeIds as unknown as string[],
        defaultsBp
      );

      const next: Layouts = {
        ...prev,
        ...all,
        [breakpoint]: mergedBp,
      };

      const finalAll = injectMinsAllBreakpoints(next, defaultsAll);
      safeWriteJSON(storageKey, finalAll);
      return finalAll;
    });
  };

  // ✅ evita hydration mismatch
  if (!mounted) return null;

  return (
    <ResponsiveGridLayout
      className="journal-layout"
      layouts={layouts}
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
      cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
      rowHeight={30}
      margin={[12, 12]}
      containerPadding={[0, 0]}
      onBreakpointChange={(bp) => setBreakpoint(bp)}
      onLayoutChange={handleLayoutChange}
      compactType="vertical"
      verticalCompact={true}
      preventCollision={false}
      isBounded={true}
      draggableHandle=".drag-handle"
      resizeHandles={["se", "s", "e"]}
    >
      {activeWidgets.map((w) => (
        <div key={w.id} className="min-h-0 h-full w-full flex flex-col">
          {w.render()}
        </div>
      ))}
    </ResponsiveGridLayout>
  );
}
