"use client";

import { useEffect, useMemo, useState } from "react";
import RGL, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ReactGridLayout = WidthProvider(RGL);

// Versión base global (si la cambias, reseteas layouts viejos)
const DEFAULT_STORAGE_KEY = "tjp_dashboard_layout_v3";

/* ================================
   Single source of truth for IDs
================================ */
export const GRID_IDS = [
  "progress",
  "streak",
  "actions",
  "calendar",
  "weekly",
  "daily-target",
  "mindset-ratio",
  "trading-days",
  "economic-news",
] as const;

export type GridItemId = (typeof GRID_IDS)[number];

/** Default layout for all widgets */
const defaultLayout: Layout[] = [
  { i: "progress", x: 0, y: 0, w: 4, h: 7 },
  { i: "streak", x: 4, y: 0, w: 4, h: 7 },
  { i: "actions", x: 8, y: 0, w: 4, h: 7 },
  { i: "calendar", x: 0, y: 7, w: 8, h: 22 },
  { i: "weekly", x: 8, y: 7, w: 4, h: 22 },
  { i: "daily-target", x: 0, y: 30, w: 4, h: 12 },
  { i: "mindset-ratio", x: 4, y: 30, w: 8, h: 12 },
  // Nuevos widgets al final
  { i: "trading-days", x: 0, y: 42, w: 4, h: 10 },
  { i: "economic-news", x: 4, y: 42, w: 8, h: 12 },
];

/** Min height per widget */
const MIN_H: Record<GridItemId, number> = {
  progress: 7,
  streak: 7,
  actions: 7,
  calendar: 22,
  weekly: 12,
  "daily-target": 12,
  "mindset-ratio": 10,
  "trading-days": 10,
  "economic-news": 12,
};

function isGridItemId(id: string): id is GridItemId {
  return (GRID_IDS as readonly string[]).includes(id as GridItemId);
}

/* ================================
   LocalStorage helpers
================================ */

function normalizeLayout(raw: unknown): Layout[] {
  if (!Array.isArray(raw)) return [...defaultLayout];

  const asLayouts = raw as Layout[];

  // Remove unknown ids
  const filtered = asLayouts.filter((l) => isGridItemId(l.i));

  // Add missing widgets at the bottom
  const existingIds = new Set(filtered.map((l) => l.i));
  const missing: Layout[] = GRID_IDS.filter((id) => !existingIds.has(id)).map(
    (id, idx) => ({
      i: id,
      x: (idx * 4) % 12,
      y: 40 + Math.floor((idx * 4) / 12) * 8,
      w: 4,
      h: MIN_H[id],
    })
  );

  const merged = [...filtered, ...missing];

  // Enforce min height
  const normalized = merged.map((l) => {
    if (!isGridItemId(l.i)) return l;
    const min = MIN_H[l.i];
    return { ...l, h: Math.max(l.h ?? min, min) };
  });

  return normalized;
}

function loadLayoutFromStorage(storageKey: string): Layout[] {
  if (typeof window === "undefined") return [...defaultLayout];

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [...defaultLayout];

    const parsed = JSON.parse(raw);
    const normalized = normalizeLayout(parsed);

    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
    return normalized;
  } catch (e) {
    console.warn("[DashboardGrid] Error reading layout from storage:", e);
    return [...defaultLayout];
  }
}

function saveLayoutToStorage(storageKey: string, layout: Layout[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch (e) {
    console.warn("[DashboardGrid] Error saving layout:", e);
  }
}

/* ================================
   Component
================================ */

export default function DashboardGrid({
  renderItem,
  items,
  storageKey,
}: {
  renderItem: (id: GridItemId) => React.ReactNode;
  /** Widgets activos (desde la librería). Si no se pasa, se muestran todos. */
  items?: GridItemId[];
  /** Storage key opcional (por usuario). Si no se pasa, usa DEFAULT_STORAGE_KEY. */
  storageKey?: string;
}) {
  const effectiveStorageKey = storageKey || DEFAULT_STORAGE_KEY;

  // Layout completo (incluye widgets aunque estén ocultos)
  const [fullLayout, setFullLayout] = useState<Layout[]>(defaultLayout);
  const [ready, setReady] = useState(false);

  // Load layout once on mount (o cuando cambia storageKey)
  useEffect(() => {
    const initial = loadLayoutFromStorage(effectiveStorageKey);
    setFullLayout(initial);
    setReady(true);
  }, [effectiveStorageKey]);

  // ✅ FIX: calcular activeIds con if/return para que TS no se queje
  const activeIds: GridItemId[] = useMemo(() => {
    if (!items || items.length === 0) {
      return [...GRID_IDS];
    }
    return items.filter((id): id is GridItemId => isGridItemId(id));
  }, [items]);

  // Layout visible = solo los widgets activos
  const visibleLayout = useMemo(
    () =>
      fullLayout.filter(
        (l) => isGridItemId(l.i) && activeIds.includes(l.i as GridItemId)
      ),
    [fullLayout, activeIds]
  );

  const updateFromPartial = (partial: Layout[], persist: boolean) => {
    setFullLayout((prev) => {
      const map = new Map(prev.map((l) => [l.i, l]));
      partial.forEach((l) => {
        const prevL = map.get(l.i) || {};
        map.set(l.i, { ...prevL, ...l });
      });
      const merged = Array.from(map.values());
      const normalized = normalizeLayout(merged);
      if (persist) {
        saveLayoutToStorage(effectiveStorageKey, normalized);
      }
      return normalized;
    });
  };

  const handleLayoutChange = (currentLayout: Layout[]) => {
    updateFromPartial(currentLayout, false);
  };

  const handleDragStop = (currentLayout: Layout[]) => {
    updateFromPartial(currentLayout, true);
  };

  const handleResizeStop = (currentLayout: Layout[]) => {
    updateFromPartial(currentLayout, true);
  };

  // Dev helper opcional: window.addWidget("mindset-ratio")
  useEffect(() => {
    (window as any).addWidget = (id: string) => {
      if (!isGridItemId(id)) {
        console.warn("[DashboardGrid] Invalid id:", id);
        return;
      }
      setFullLayout((prev) => {
        if (prev.some((l) => l.i === id)) return prev;
        const maxY = prev.reduce((m, it) => Math.max(m, it.y + it.h), 0);
        const h = MIN_H[id];
        const next = [...prev, { i: id, x: 0, y: maxY, w: 4, h }];
        const normalized = normalizeLayout(next);
        saveLayoutToStorage(effectiveStorageKey, normalized);
        return normalized;
      });
    };
  }, [effectiveStorageKey]);

  if (!ready) {
    return (
      <div className="w-full min-h-[200px] rounded-2xl border border-slate-800 bg-slate-900/60 flex items-center justify-center text-slate-400 text-sm">
        Loading layout...
      </div>
    );
  }

  return (
    <ReactGridLayout
      layout={visibleLayout}
      cols={12}
      rowHeight={8}
      margin={[16, 16]}
      compactType="vertical"
      isBounded
      draggableHandle=".drag-handle"
      onLayoutChange={handleLayoutChange}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
    >
      {visibleLayout.map((it) => {
        if (!isGridItemId(it.i)) return null;
        const id = it.i as GridItemId;
        return (
          <div
            key={id}
            className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 overflow-hidden"
          >
            <div className="drag-handle cursor-move text-[12px] text-slate-400 mb-2">
              Drag · {id}
            </div>
            <div className="text-[14px] h-full min-h-0 overflow-auto pr-1">
              {renderItem(id)}
            </div>
          </div>
        );
      })}
    </ReactGridLayout>
  );
}
