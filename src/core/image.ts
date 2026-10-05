import type { Mode, SolverSettings } from "./types.ts";
import { luminance, toneTable } from "./tone.ts";

/** A thread color and the image channel it is responsible for (-1 = lightness). */
export interface Ink {
  name: string;
  css: string;
  channel: -1 | 0 | 1 | 2;
}

/**
 * Light ground: threads absorb light, so color mode uses the subtractive primaries of
 * printing inks. Cyan absorbs red, magenta absorbs green, yellow absorbs blue.
 * Dark ground: threads add light, so color mode uses the additive primaries.
 */
export function inksFor(mode: Mode, dark: boolean): Ink[] {
  if (mode === "mono") return [{ name: dark ? "white" : "black", css: dark ? "#ffffff" : "#000000", channel: -1 }];
  return dark
    ? [
        { name: "red", css: "#ff0000", channel: 0 },
        { name: "green", css: "#00ff00", channel: 1 },
        { name: "blue", css: "#0000ff", channel: 2 },
      ]
    : [
        { name: "cyan", css: "#00ffff", channel: 0 },
        { name: "magenta", css: "#ff00ff", channel: 1 },
        { name: "yellow", css: "#ffff00", channel: 2 },
      ];
}

/**
 * The picture as the solver sees it, one channel per thread.
 *
 * Light ground: each pass of thread lets through a share (1 - opacity) of the light, so
 * stacked passes multiply, like glazes of paint or layers of ink.
 * Dark ground: each pass adds light, up to white.
 */
export interface Targets {
  /** Toned brightness the picture should reach, 0..1. */
  goal: Float32Array[];
  /** Brightness the thread drawing shows now, 0..1. */
  shown: Float32Array[];
  /** Drop in squared error if one more pass lands on the pixel (can be negative). */
  gain: Float32Array[];
  opacity: number;
  dark: boolean;
}

export function buildTargets(pixels: Uint8ClampedArray, width: number, height: number, s: SolverSettings): Targets {
  const table = toneTable(s);
  const inks = inksFor(s.mode, s.dark);
  const size = width * height;
  const opacity = Math.min(0.95, Math.max(0.005, s.opacity));
  const start = s.dark ? 0 : 1;
  const goal: Float32Array[] = [];
  const shown: Float32Array[] = [];
  const gain: Float32Array[] = [];

  for (const ink of inks) {
    const g = new Float32Array(size);
    const c = new Float32Array(size).fill(start);
    const d = new Float32Array(size);
    for (let i = 0, p = 0; i < size; i++, p += 4) {
      const raw = ink.channel < 0
        ? Math.round(luminance(pixels[p], pixels[p + 1], pixels[p + 2]))
        : pixels[p + ink.channel];
      g[i] = table[raw];
      d[i] = passGain(start, g[i], opacity, s.dark);
    }
    goal.push(g);
    shown.push(c);
    gain.push(d);
  }
  return { goal, shown, gain, opacity, dark: s.dark };
}

/** Brightness after one more pass of thread. */
export function afterPass(shown: number, opacity: number, dark: boolean): number {
  return dark ? Math.min(1, shown + opacity) : shown * (1 - opacity);
}

/** How much one more pass lowers the squared error of a pixel. */
export function passGain(shown: number, goal: number, opacity: number, dark: boolean): number {
  const before = shown - goal;
  const after = afterPass(shown, opacity, dark) - goal;
  return before * before - after * after;
}
