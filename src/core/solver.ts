import type { Pegs } from "./pegs.ts";
import { afterPass, passGain, type Targets } from "./image.ts";
import { lineLength, lineWeight, sumLine, traceLine } from "./line.ts";

export interface SolverOptions {
  /** Pegs closer than this (counted along the frame) are never joined. Default: count / 20. */
  minGap?: number;
  /** Memory budget for the precomputed line table, in pixel indices. 0 disables it. */
  cacheBudget?: number;
}

/** About 96 MB of Int32 pixel indices. */
export const DEFAULT_CACHE_BUDGET = 24_000_000;

/**
 * Greedy thread solver.
 *
 * Each thread sits on a peg. At every step it looks at the line to every peg it may
 * reach and adds up, pixel by pixel, how much one more pass of thread would bring the
 * drawing closer to the picture. It takes the line with the biggest total, like an
 * artist putting the next hatching stroke where the drawing most needs it, draws it,
 * and moves to the new peg. Each pixel keeps its "gain if hit again" up to date, so
 * scoring a line is a plain sum over an array.
 *
 * The threads work on separate channels, so a thread's best move only changes when
 * that thread moves. We keep each thread's best move and only refresh the one that was
 * just used: three colors cost the same per segment as one.
 */
export class Solver {
  readonly width: number;
  readonly pegCount: number;
  readonly threads: number;
  readonly cached: boolean;

  /** Peg each thread currently sits on. */
  readonly current: Int32Array;
  /** Peg each thread came from (forbidden as the next target). */
  readonly previous: Int32Array;

  /** Last segment produced by step(). */
  lastThread = -1;
  lastFrom = -1;
  lastTo = -1;

  private readonly px: Int32Array;
  private readonly py: Int32Array;
  private readonly targets: Targets;
  private readonly minGap: number;

  private readonly bestPeg: Int32Array;
  private readonly bestScore: Float64Array;
  private readonly fresh: Uint8Array;

  // Line table, indexed by a * pegCount + b with a < b.
  private readonly start: Int32Array | null = null;
  private readonly count: Int32Array | null = null;
  private readonly weight: Float32Array;
  private readonly lines: Int32Array | null = null;
  private readonly scratch: Int32Array;

  constructor(width: number, pegs: Pegs, targets: Targets, options: SolverOptions = {}) {
    const n = pegs.ix.length;
    this.width = width;
    this.pegCount = n;
    this.threads = targets.goal.length;
    this.px = pegs.ix;
    this.py = pegs.iy;
    this.targets = targets;
    this.minGap = Math.max(1, options.minGap ?? Math.floor(n / 20));

    this.current = new Int32Array(this.threads);
    this.previous = new Int32Array(this.threads).fill(-1);
    for (let t = 0; t < this.threads; t++) this.current[t] = Math.floor((t * n) / this.threads);
    this.bestPeg = new Int32Array(this.threads);
    this.bestScore = new Float64Array(this.threads);
    this.fresh = new Uint8Array(this.threads);

    // Weights are cheap to keep for every pair; this pass also sizes the table.
    this.weight = new Float32Array(n * n);
    let total = 0;
    let longest = 1;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const len = lineLength(this.px[a], this.py[a], this.px[b], this.py[b]);
        this.weight[a * n + b] = lineWeight(this.px[a], this.py[a], this.px[b], this.py[b]);
        total += len;
        if (len > longest) longest = len;
      }
    }
    this.scratch = new Int32Array(longest);

    const budget = options.cacheBudget ?? DEFAULT_CACHE_BUDGET;
    if (total <= budget) {
      const start = new Int32Array(n * n);
      const count = new Int32Array(n * n);
      const lines = new Int32Array(total);
      let offset = 0;
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          const k = a * n + b;
          const c = traceLine(this.px[a], this.py[a], this.px[b], this.py[b], width, lines, offset);
          start[k] = offset;
          count[k] = c;
          offset += c;
        }
      }
      this.start = start;
      this.count = count;
      this.lines = lines;
    }
    this.cached = this.lines !== null;
  }

  /** Total gain of one pass along a-b on one channel. */
  score(a: number, b: number, gain: Float32Array): number {
    const n = this.pegCount;
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    const k = lo * n + hi;
    const lines = this.lines;
    let sum = 0;
    if (lines !== null) {
      const e = this.start![k] + this.count![k];
      for (let i = this.start![k]; i < e; i++) sum += gain[lines[i]];
    } else {
      // Always trace from the lower peg, like the table, so both paths hit the same pixels.
      sum = sumLine(this.px[lo], this.py[lo], this.px[hi], this.py[hi], this.width, gain);
    }
    // Diagonal lines cover more area per traced pixel.
    return sum * this.weight[k];
  }

  /** Finds and stores the best next peg for a thread. */
  private refresh(t: number): void {
    const n = this.pegCount;
    const a = this.current[t];
    const prev = this.previous[t];
    const gain = this.targets.gain[t];
    const gap = this.minGap;
    const lines = this.lines;
    let best = -1;
    let bestScore = -Infinity;
    for (let b = 0; b < n; b++) {
      const d = b > a ? b - a : a - b;
      if (d < gap || n - d < gap || b === prev) continue;
      let s: number;
      if (lines !== null) {
        // Hot path, kept inline: a flat run of pixel indices per line.
        const k = a < b ? a * n + b : b * n + a;
        const i0 = this.start![k];
        const i1 = i0 + this.count![k];
        let sum = 0;
        for (let i = i0; i < i1; i++) sum += gain[lines[i]];
        s = sum * this.weight[k];
      } else {
        s = this.score(a, b, gain);
      }
      if (s > bestScore) {
        bestScore = s;
        best = b;
      }
    }
    this.bestPeg[t] = best;
    this.bestScore[t] = bestScore;
    this.fresh[t] = 1;
  }

  /** Lays one pass of thread along a-b on thread t's channel. */
  private draw(t: number, a: number, b: number): void {
    const n = this.pegCount;
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    const k = lo * n + hi;
    const { opacity, dark } = this.targets;
    const goal = this.targets.goal[t];
    const shown = this.targets.shown[t];
    const gain = this.targets.gain[t];
    // A diagonal pass covers each traced pixel a bit more than a straight one.
    const w = this.weight[k];
    const local = dark ? opacity * w : 1 - Math.pow(1 - opacity, w);

    let idx: Int32Array;
    let s: number;
    let e: number;
    if (this.lines !== null) {
      idx = this.lines;
      s = this.start![k];
      e = s + this.count![k];
    } else {
      idx = this.scratch;
      s = 0;
      e = traceLine(this.px[lo], this.py[lo], this.px[hi], this.py[hi], this.width, idx, 0);
    }
    for (let i = s; i < e; i++) {
      const p = idx[i];
      const c = afterPass(shown[p], local, dark);
      shown[p] = c;
      gain[p] = passGain(c, goal[p], opacity, dark);
    }
  }

  /**
   * Adds one segment. Returns false when no line would still improve the picture.
   * The segment is in lastThread / lastFrom / lastTo.
   */
  step(): boolean {
    let t = -1;
    let best = 0;
    for (let i = 0; i < this.threads; i++) {
      if (!this.fresh[i]) this.refresh(i);
      if (this.bestPeg[i] >= 0 && this.bestScore[i] > best) {
        best = this.bestScore[i];
        t = i;
      }
    }
    if (t < 0) return false;

    const from = this.current[t];
    const to = this.bestPeg[t];
    this.draw(t, from, to);
    this.previous[t] = from;
    this.current[t] = to;
    this.fresh[t] = 0;
    this.lastThread = t;
    this.lastFrom = from;
    this.lastTo = to;
    return true;
  }
}
