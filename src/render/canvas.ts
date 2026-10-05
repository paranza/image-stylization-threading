import type { Ink } from "../core/image.ts";

/** Growing list of segments, stored as typed arrays. */
export class SegmentStore {
  thread = new Uint8Array(4096);
  from = new Uint16Array(4096);
  to = new Uint16Array(4096);
  length = 0;

  clear(): void {
    this.length = 0;
  }

  push(thread: Uint8Array, from: Uint16Array, to: Uint16Array): void {
    const need = this.length + thread.length;
    if (need > this.thread.length) {
      let cap = this.thread.length;
      while (cap < need) cap *= 2;
      this.thread = grow(this.thread, new Uint8Array(cap));
      this.from = grow(this.from, new Uint16Array(cap));
      this.to = grow(this.to, new Uint16Array(cap));
    }
    this.thread.set(thread, this.length);
    this.from.set(from, this.length);
    this.to.set(to, this.length);
    this.length = need;
  }
}

function grow<T extends Uint8Array | Uint16Array>(old: T, next: T): T {
  next.set(old);
  return next;
}

export interface Look {
  width: number;
  height: number;
  pegsX: Float32Array;
  pegsY: Float32Array;
  inks: Ink[];
  dark: boolean;
  opacity: number;
  thickness: number;
}

/** Longest side of the drawing canvas in device pixels. */
const DISPLAY_SIZE = 1600;

/**
 * Draws threads one stroke at a time. Each stroke is its own path so that
 * overlapping passes build up tone, exactly like real thread or a pencil hatching
 * over itself. Light mode multiplies (absorbs light), dark mode adds light.
 */
export class ThreadRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private look: Look | null = null;
  private scale = 1;
  private drawn = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
  }

  get scaleFactor(): number {
    return this.scale;
  }

  setLook(look: Look): void {
    this.look = look;
    this.scale = DISPLAY_SIZE / Math.max(look.width, look.height);
    const w = Math.round(look.width * this.scale);
    const h = Math.round(look.height * this.scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.clear();
  }

  clear(): void {
    const look = this.look;
    if (look === null) return;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = look.dark ? "#000000" : "#ffffff";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawn = 0;
  }

  /** Draws segments [drawn, limit). If limit went down, starts again from blank. */
  drawUpTo(store: SegmentStore, limit: number): void {
    const look = this.look;
    if (look === null) return;
    const end = Math.min(limit, store.length);
    if (end < this.drawn) this.clear();
    if (end === this.drawn) return;

    const ctx = this.ctx;
    const s = this.scale;
    // Peg positions are pixel indices; their centers are half a pixel in.
    const px = look.pegsX;
    const py = look.pegsY;
    ctx.globalCompositeOperation = look.dark ? "lighter" : "multiply";
    ctx.globalAlpha = look.opacity;
    ctx.lineWidth = Math.max(0.25, look.thickness * s);
    ctx.lineCap = "round";
    let ink = -1;
    for (let i = this.drawn; i < end; i++) {
      const t = store.thread[i];
      if (t !== ink) {
        ink = t;
        ctx.strokeStyle = look.inks[t].css;
      }
      const a = store.from[i];
      const b = store.to[i];
      ctx.beginPath();
      ctx.moveTo((px[a] + 0.5) * s, (py[a] + 0.5) * s);
      ctx.lineTo((px[b] + 0.5) * s, (py[b] + 0.5) * s);
      ctx.stroke();
    }
    this.drawn = end;
  }
}

/** Pegs and "where each thread is now" markers, on a canvas laid over the drawing. */
export function drawOverlay(
  canvas: HTMLCanvasElement, look: Look, scale: number,
  showPegs: boolean, showIndicators: boolean, current: Int32Array | null,
): void {
  const w = Math.round(look.width * scale);
  const h = Math.round(look.height * scale);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  // Sized to the canvas, so markers look the same at every quality.
  const r = Math.max(w, h) * 0.0022;
  if (showPegs) {
    ctx.fillStyle = look.dark ? "rgba(255,255,255,0.8)" : "rgba(13,13,13,0.7)";
    for (let i = 0; i < look.pegsX.length; i++) {
      ctx.beginPath();
      ctx.arc((look.pegsX[i] + 0.5) * scale, (look.pegsY[i] + 0.5) * scale, r, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  if (showIndicators && current !== null) {
    ctx.lineWidth = r * 1.4;
    for (let t = 0; t < current.length; t++) {
      const p = current[t];
      const ink = look.inks[t];
      ctx.strokeStyle = ink.channel < 0 ? "#2337ff" : ink.css;
      ctx.beginPath();
      ctx.arc((look.pegsX[p] + 0.5) * scale, (look.pegsY[p] + 0.5) * scale, r * 5, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }
}
