export type InkStrokePoint = {
  x: number;
  y: number;
  t: number;
};

export type InkStroke = {
  points: InkStrokePoint[];
  color: string;
  width: number;
};

export type InkDrawing =
  | {
      engine: "pencilkit";
      data: string;
    }
  | {
      engine: "skia";
      strokes: InkStroke[];
    };
