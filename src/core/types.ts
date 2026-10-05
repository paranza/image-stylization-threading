export type Shape = "rectangle" | "ellipse";
export type Quality = "low" | "medium" | "high";
export type Mode = "mono" | "color";
export type ValueKey = "high" | "normal" | "low";

/** Settings that change the computed thread path. Any change restarts the solver. */
export interface SolverSettings {
  shape: Shape;
  pegs: number;
  quality: Quality;
  mode: Mode;
  dark: boolean;
  /** Darkness (light mode) or light (dark mode) one pass of thread adds, 0..1. */
  opacity: number;
  maxSegments: number;
  key: ValueKey;
  /** Strength of the S-curve, 0..1 (chiaroscuro). */
  contrast: number;
  /** Number of value steps, 0 means smooth tone. */
  steps: number;
}

export const QUALITY_SIZE: Record<Quality, number> = { low: 256, medium: 512, high: 1024 };

export interface Stats {
  /** Mean absolute error between the thread picture and the toned target, 0..1. */
  average: number;
  meanSquare: number;
  variance: number;
}

export type ToWorker =
  | {
      type: "start";
      gen: number;
      width: number;
      height: number;
      pixels: Uint8ClampedArray;
      settings: SolverSettings;
    }
  | { type: "setMax"; gen: number; max: number }
  | { type: "stop" };

export type FromWorker =
  | {
      type: "ready";
      gen: number;
      pegsX: Float32Array;
      pegsY: Float32Array;
      threads: number;
      cached: boolean;
      setupMs: number;
    }
  | {
      type: "segments";
      gen: number;
      thread: Uint8Array;
      from: Uint16Array;
      to: Uint16Array;
      /** Current peg of each thread after this batch. */
      current: Int32Array;
      stats: Stats | null;
      /** True when the solver has stopped (max reached or nothing left to improve). */
      idle: boolean;
      exhausted: boolean;
      elapsedMs: number;
    };
