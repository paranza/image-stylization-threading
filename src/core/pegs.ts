import type { Shape } from "./types.ts";

export interface Pegs {
  /** Exact positions in working pixel units (pixel centers sit at +0.5). */
  x: Float32Array;
  y: Float32Array;
  /** Rounded pixel positions, used for line tracing. */
  ix: Int32Array;
  iy: Int32Array;
}

/**
 * Places `count` pegs evenly along the frame, numbered clockwise.
 * Rectangle: peg 0 is the top left corner. Ellipse: peg 0 is at the top.
 */
export function makePegs(shape: Shape, count: number, width: number, height: number): Pegs {
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const w = width - 1;
  const h = height - 1;

  if (shape === "ellipse") {
    const cx = w / 2;
    const cy = h / 2;
    for (let i = 0; i < count; i++) {
      const a = (2 * Math.PI * i) / count;
      x[i] = cx + cx * Math.sin(a);
      y[i] = cy - cy * Math.cos(a);
    }
  } else {
    const perimeter = 2 * (w + h);
    for (let i = 0; i < count; i++) {
      let d = (perimeter * i) / count;
      if (d < w) {
        x[i] = d;
        y[i] = 0;
      } else if ((d -= w) < h) {
        x[i] = w;
        y[i] = d;
      } else if ((d -= h) < w) {
        x[i] = w - d;
        y[i] = h;
      } else {
        d -= w;
        x[i] = 0;
        y[i] = h - d;
      }
    }
  }

  const ix = new Int32Array(count);
  const iy = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    ix[i] = Math.min(w, Math.max(0, Math.round(x[i])));
    iy[i] = Math.min(h, Math.max(0, Math.round(y[i])));
  }
  return { x, y, ix, iy };
}

/** 1 for pixels inside the frame, 0 outside (only the ellipse has an outside). */
export function frameMask(shape: Shape, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (shape === "rectangle") return mask.fill(1);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const rx = Math.max(cx, 0.5);
  const ry = Math.max(cy, 0.5);
  for (let y = 0; y < height; y++) {
    const dy = (y - cy) / ry;
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx;
      if (dx * dx + dy * dy <= 1) mask[y * width + x] = 1;
    }
  }
  return mask;
}
