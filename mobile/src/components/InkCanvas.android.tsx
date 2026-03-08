import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { Canvas, Path, Skia } from "@shopify/react-native-skia";

import type { InkDrawing, InkStroke } from "./inkTypes";

type InkCanvasProps = {
  value?: InkDrawing | null;
  onChange: (next: InkDrawing) => void;
  height?: number;
  strokeColor?: string;
};

const DEFAULT_COLOR = "#36f5d6";
const DEFAULT_WIDTH = 3;

export type InkCanvasHandle = {
  showColorPicker: () => void;
};

function strokeToPath(stroke: InkStroke) {
  const path = Skia.Path.Make();
  if (!stroke.points.length) return path;
  const [first, ...rest] = stroke.points;
  path.moveTo(first.x, first.y);
  rest.forEach((pt) => path.lineTo(pt.x, pt.y));
  return path;
}

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(
  ({ value, onChange, height = 260, strokeColor }: InkCanvasProps, ref) => {
  const [strokes, setStrokes] = useState<InkStroke[]>([]);
  const [current, setCurrent] = useState<InkStroke | null>(null);
  const lastUpdate = useRef<number>(0);

  useImperativeHandle(
    ref,
    () => ({
      showColorPicker: () => {},
    }),
    []
  );

  useEffect(() => {
    if (!value || value.engine !== "skia") return;
    setStrokes(value.strokes || []);
  }, [value?.engine, (value as any)?.strokes]);

  useEffect(() => {
    onChange({ engine: "skia", strokes });
  }, [strokes, onChange]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          setCurrent({
            color: strokeColor || DEFAULT_COLOR,
            width: DEFAULT_WIDTH,
            points: [{ x: locationX, y: locationY, t: Date.now() }],
          });
        },
        onPanResponderMove: (evt) => {
          const now = Date.now();
          if (now - lastUpdate.current < 10) return;
          lastUpdate.current = now;
          const { locationX, locationY } = evt.nativeEvent;
          setCurrent((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              points: [...prev.points, { x: locationX, y: locationY, t: now }],
            };
          });
        },
        onPanResponderRelease: () => {
          if (current && current.points.length > 0) {
            setStrokes((prev) => [...prev, current]);
          }
          setCurrent(null);
        },
        onPanResponderTerminate: () => {
          if (current && current.points.length > 0) {
            setStrokes((prev) => [...prev, current]);
          }
          setCurrent(null);
        },
      }),
    [current]
  );

  return (
    <View style={[styles.wrapper, { height }]} {...panResponder.panHandlers}>
      <Canvas style={StyleSheet.absoluteFill}>
        {strokes.map((stroke, idx) => (
          <Path
            key={`stroke-${idx}`}
            path={strokeToPath(stroke)}
            color={stroke.color}
            style="stroke"
            strokeWidth={stroke.width}
          />
        ))}
        {current ? (
          <Path
            path={strokeToPath(current)}
            color={current.color}
            style="stroke"
            strokeWidth={current.width}
          />
        ) : null}
      </Canvas>
    </View>
  );
}
);

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 12,
    overflow: "hidden",
  },
});
