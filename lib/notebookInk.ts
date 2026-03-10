export type NotebookInkStrokePoint = {
  x: number;
  y: number;
  t: number;
};

export type NotebookInkStroke = {
  points: NotebookInkStrokePoint[];
  color: string;
  width: number;
};

export type NotebookInkDrawing =
  | {
      engine: "pencilkit";
      data: string;
    }
  | {
      engine: "skia";
      strokes: NotebookInkStroke[];
    };

export type NotebookInkMode = "text" | "ink";

export type NotebookInkPayload = {
  mode?: NotebookInkMode;
  drawing?: NotebookInkDrawing | null;
};

export type NotebookEditableContent = {
  content: string;
  ink: NotebookInkPayload | null;
};

function normalizeStrokePoint(value: unknown): NotebookInkStrokePoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Record<string, unknown>;
  if (
    typeof point.x !== "number" ||
    typeof point.y !== "number" ||
    typeof point.t !== "number"
  ) {
    return null;
  }
  return {
    x: point.x,
    y: point.y,
    t: point.t,
  };
}

function normalizeStroke(value: unknown): NotebookInkStroke | null {
  if (!value || typeof value !== "object") return null;
  const stroke = value as Record<string, unknown>;
  if (
    !Array.isArray(stroke.points) ||
    typeof stroke.color !== "string" ||
    typeof stroke.width !== "number"
  ) {
    return null;
  }

  const points = stroke.points
    .map(normalizeStrokePoint)
    .filter((point): point is NotebookInkStrokePoint => Boolean(point));

  return {
    points,
    color: stroke.color,
    width: stroke.width,
  };
}

export function normalizeNotebookInkDrawing(
  value: unknown
): NotebookInkDrawing | null {
  if (!value || typeof value !== "object") return null;
  const drawing = value as Record<string, unknown>;

  if (drawing.engine === "pencilkit" && typeof drawing.data === "string") {
    return {
      engine: "pencilkit",
      data: drawing.data,
    };
  }

  if (drawing.engine === "skia" && Array.isArray(drawing.strokes)) {
    return {
      engine: "skia",
      strokes: drawing.strokes
        .map(normalizeStroke)
        .filter((stroke): stroke is NotebookInkStroke => Boolean(stroke)),
    };
  }

  return null;
}

export function normalizeNotebookInkPayload(
  value: unknown
): NotebookInkPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const mode =
    payload.mode === "ink"
      ? "ink"
      : payload.mode === "text"
      ? "text"
      : undefined;
  const drawing = normalizeNotebookInkDrawing(payload.drawing);

  if (!mode && !drawing) return null;

  return {
    mode,
    drawing,
  };
}

export function getNotebookInkMode(
  payload: NotebookInkPayload | null | undefined
): NotebookInkMode {
  return payload?.mode === "ink" ? "ink" : "text";
}

export function buildNotebookInkPayload(
  mode: NotebookInkMode,
  drawing: NotebookInkDrawing | null
): NotebookInkPayload | null {
  if (mode === "text" && !drawing) {
    return null;
  }

  return {
    mode,
    drawing,
  };
}

export function createNotebookEditableContent(
  content?: string | null,
  ink?: unknown
): NotebookEditableContent {
  return {
    content: content ?? "",
    ink: normalizeNotebookInkPayload(ink),
  };
}
