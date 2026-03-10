import type { ComponentType, Ref } from "react";
import { Platform } from "react-native";

import type { InkDrawing } from "./inkTypes";

type InkCanvasProps = {
  value?: InkDrawing | null;
  onChange: (next: InkDrawing) => void;
  height?: number;
  strokeColor?: string;
};

export type InkCanvasHandle = {
  showColorPicker: () => void;
  getCurrentDrawing: () => Promise<InkDrawing | null>;
};

const platformModule =
  Platform.OS === "ios" ? require("./InkCanvas.ios") : require("./InkCanvas.android");

export const InkCanvas = platformModule.InkCanvas as ComponentType<
  InkCanvasProps & { ref?: Ref<InkCanvasHandle> }
>;
