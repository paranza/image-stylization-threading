import type { ValueKey } from "./types.ts";

/**
 * Tone shaping, applied to brightness values in 0..1 before the solver sees them.
 * These are the same moves a draughtsman makes in a value study:
 * pick a key, push the contrast, then group tones into a few clear steps.
 */

export const KEY_GAMMA: Record<ValueKey, number> = { high: 0.7, normal: 1, low: 1.4 };

export interface ToneSettings {
  key: ValueKey;
  contrast: number;
  steps: number;
}

/** Builds a 256 entry lookup table from 8 bit brightness to toned brightness. */
export function toneTable(t: ToneSettings): Float32Array {
  const table = new Float32Array(256);
  const gamma = KEY_GAMMA[t.key];
  for (let i = 0; i < 256; i++) {
    table[i] = posterize(contrast(Math.pow(i / 255, gamma), t.contrast), t.steps);
  }
  return table;
}

/** S-curve blend: 0 leaves tone as is, 1 is a full smoothstep (darks darker, lights lighter). */
export function contrast(v: number, amount: number): number {
  const s = v * v * (3 - 2 * v);
  return v + amount * (s - v);
}

/** Rounds tone to `steps` evenly spaced values. Fewer than 2 steps means smooth. */
export function posterize(v: number, steps: number): number {
  if (steps < 2) return v;
  const n = steps - 1;
  return Math.round(v * n) / n;
}

/** Rec. 709 luma weights, close to how the eye ranks the lightness of colors. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Share of pixels in each of `bins` value steps, darkest first. */
export function valueHistogram(pixels: Uint8ClampedArray, table: Float32Array, bins: number): Float32Array {
  const counts = new Float32Array(bins);
  const total = pixels.length >> 2;
  for (let i = 0; i < pixels.length; i += 4) {
    const v = table[Math.round(luminance(pixels[i], pixels[i + 1], pixels[i + 2]))];
    counts[Math.min(bins - 1, Math.floor(v * bins))]++;
  }
  for (let i = 0; i < bins; i++) counts[i] /= total;
  return counts;
}
