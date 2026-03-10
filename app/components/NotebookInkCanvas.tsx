"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

import type {
  NotebookInkDrawing,
  NotebookInkStroke,
  NotebookInkStrokePoint,
} from "@/lib/notebookInk";

const DEFAULT_COLOR = "#FFFFFF";
const DEFAULT_WIDTH = 3;

type NotebookInkCanvasProps = {
  value: NotebookInkDrawing | null;
  onChange: (next: NotebookInkDrawing | null) => void;
  height?: number;
  strokeColor?: string;
  strokeWidth?: number;
  emptyTitle?: string;
  emptySubtitle?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function strokeToPath(stroke: NotebookInkStroke): string {
  if (!stroke.points.length) return "";
  const [first, ...rest] = stroke.points;
  const segments = [`M ${first.x} ${first.y}`];
  rest.forEach((point) => {
    segments.push(`L ${point.x} ${point.y}`);
  });
  return segments.join(" ");
}

function isDuplicatePoint(
  lastPoint: NotebookInkStrokePoint | undefined,
  nextPoint: NotebookInkStrokePoint
) {
  if (!lastPoint) return false;
  return (
    Math.abs(lastPoint.x - nextPoint.x) < 0.5 &&
    Math.abs(lastPoint.y - nextPoint.y) < 0.5
  );
}

export default function NotebookInkCanvas({
  value,
  onChange,
  height = 320,
  strokeColor = DEFAULT_COLOR,
  strokeWidth = DEFAULT_WIDTH,
  emptyTitle = "Draw with mouse, trackpad, or stylus",
  emptySubtitle = "Your sketch stays inside this notebook page and saves with autosave.",
}: NotebookInkCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const strokesRef = useRef<NotebookInkStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<NotebookInkStroke | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height });

  const strokes = value?.engine === "skia" ? value.strokes : [];

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    setCurrentStroke(null);
  }, [value?.engine]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(rect.width, 1),
        height: Math.max(rect.height, height),
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, [height]);

  const readPoint = (clientX: number, clientY: number): NotebookInkStrokePoint | null => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;

    return {
      x: clamp(clientX - rect.left, 0, rect.width),
      y: clamp(clientY - rect.top, 0, rect.height),
      t: Date.now(),
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const point = readPoint(event.clientX, event.clientY);
    if (!point) return;

    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCurrentStroke({
      color: strokeColor,
      width: strokeWidth,
      points: [point],
    });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;

    const point = readPoint(event.clientX, event.clientY);
    if (!point) return;

    setCurrentStroke((prev) => {
      if (!prev) return prev;
      const lastPoint = prev.points[prev.points.length - 1];
      if (isDuplicatePoint(lastPoint, point)) {
        return prev;
      }
      return {
        ...prev,
        points: [...prev.points, point],
      };
    });
  };

  const finishStroke = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointerIdRef.current = null;

    setCurrentStroke((prev) => {
      if (!prev || prev.points.length === 0) return null;
      onChange({
        engine: "skia",
        strokes: [...strokesRef.current, prev],
      });
      return null;
    });
  };

  const renderedStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-[1.5rem] border border-slate-800 bg-slate-950/90 touch-none select-none cursor-crosshair"
      style={{ height }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(51,65,85,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(51,65,85,0.18) 1px, transparent 1px), radial-gradient(circle at top, rgba(52,211,153,0.08), transparent 55%)",
          backgroundSize: "28px 28px, 28px 28px, auto",
        }}
      />

      {renderedStrokes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-slate-200">
              {emptyTitle}
            </p>
            <p className="mt-2 text-xs leading-6 text-slate-500">
              {emptySubtitle}
            </p>
          </div>
        </div>
      ) : null}

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
        preserveAspectRatio="none"
      >
        {renderedStrokes.map((stroke, index) => (
          <path
            key={`${stroke.color}-${index}-${stroke.points.length}`}
            d={strokeToPath(stroke)}
            fill="none"
            stroke={stroke.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={stroke.width}
          />
        ))}
      </svg>
    </div>
  );
}
