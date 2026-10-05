/**
 * Fixed point DDA line tracing: one sample per pixel along the major axis.
 * Integer only and allocation free, so it can run millions of times per second.
 */

/** Number of pixels the line from (x0,y0) to (x1,y1) covers. */
export function lineLength(x0: number, y0: number, x1: number, y1: number): number {
  return Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1;
}

/**
 * Thread each traced pixel receives, relative to a horizontal line.
 * A diagonal line crosses more area per sample, so it lays down more thread per pixel.
 */
export function lineWeight(x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  return n === 0 ? 1 : Math.sqrt(dx * dx + dy * dy) / n;
}

/** Writes the pixel indices of the line into `out` starting at `offset`. Returns the count. */
export function traceLine(
  x0: number, y0: number, x1: number, y1: number,
  width: number, out: Int32Array, offset: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  if (n === 0) {
    out[offset] = y0 * width + x0;
    return 1;
  }
  // 16.16 fixed point, starting at the pixel center so rounding is symmetric.
  const sx = Math.trunc((dx * 65536) / n);
  const sy = Math.trunc((dy * 65536) / n);
  let fx = (x0 << 16) + 32768;
  let fy = (y0 << 16) + 32768;
  for (let i = 0; i <= n; i++) {
    out[offset + i] = (fy >> 16) * width + (fx >> 16);
    fx += sx;
    fy += sy;
  }
  return n + 1;
}

/** Sum of `values` along the line, same traversal as traceLine. */
export function sumLine(
  x0: number, y0: number, x1: number, y1: number,
  width: number, values: Float32Array,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  if (n === 0) return values[y0 * width + x0];
  const sx = Math.trunc((dx * 65536) / n);
  const sy = Math.trunc((dy * 65536) / n);
  let fx = (x0 << 16) + 32768;
  let fy = (y0 << 16) + 32768;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    sum += values[(fy >> 16) * width + (fx >> 16)];
    fx += sx;
    fy += sy;
  }
  return sum;
}
