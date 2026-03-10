import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { InkDrawing } from "./inkTypes";

type InkCanvasProps = {
  value?: InkDrawing | null;
  onChange: (next: InkDrawing) => void;
  height?: number;
  strokeColor?: string;
};

type PencilKitModule = {
  PencilKitView: any;
};

export type InkCanvasHandle = {
  showColorPicker: () => void;
  getCurrentDrawing: () => Promise<InkDrawing | null>;
};

function loadPencilKit(): PencilKitModule | null {
  try {
    // Lazy require to avoid crashing if native module isn't linked yet
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-pencilkit-ui") as PencilKitModule;
  } catch {
    return null;
  }
}

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(
  ({ value, onChange, height = 260 }: InkCanvasProps, ref) => {
  const viewRef = useRef<any>(null);
  const pencilkit = useMemo(loadPencilKit, []);

  useImperativeHandle(
    ref,
    () => ({
      showColorPicker: () => {
        viewRef.current?.showColorPicker?.();
      },
      getCurrentDrawing: async () => {
        const data = await viewRef.current?.getCanvasDataAsBase64?.();
        if (!data) return value ?? null;
        return { engine: "pencilkit", data };
      },
    }),
    [value]
  );

  useEffect(() => {
    if (!pencilkit || !value || value.engine !== "pencilkit") return;
    let attempts = 0;
    const apply = () => {
      attempts += 1;
      viewRef.current?.setCanvasDataFromBase64?.(value.data);
      if (attempts < 4) {
        setTimeout(apply, 120);
      }
    };
    apply();
  }, [pencilkit, value?.engine, (value as any)?.data]);

  useEffect(() => {
    if (!pencilkit) return;
    const timer = setTimeout(() => {
      viewRef.current?.setupToolPicker?.();
    }, 120);
    return () => clearTimeout(timer);
  }, [pencilkit]);

  const handleDrawingChange = async () => {
    const data = await viewRef.current?.getCanvasDataAsBase64();
    if (data) {
      onChange({ engine: "pencilkit", data });
    }
  };

  if (!pencilkit) {
    return (
      <View style={[styles.wrapper, styles.fallback, { height }]}>
        <Text style={styles.fallbackText}>
          PencilKit no está disponible en este build. Revisa `npm run ios:sync-native` y vuelve a compilar.
        </Text>
      </View>
    );
  }

  const { PencilKitView } = pencilkit;

  return (
    <View style={[styles.wrapper, { height }]}>
      <PencilKitView
        ref={viewRef}
        style={styles.canvas}
        onDrawingChange={handleDrawingChange}
      />
    </View>
  );
}
);

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 12,
    overflow: "hidden",
  },
  canvas: {
    flex: 1,
    backgroundColor: "transparent",
  },
  fallback: {
    backgroundColor: "rgba(10,18,40,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  fallbackText: {
    color: "#9fb4d9",
    fontSize: 12,
    textAlign: "center",
  },
});
