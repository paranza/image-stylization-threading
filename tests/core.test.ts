import { describe, expect, it } from "vitest";
import { makePegs, frameMask } from "../src/core/pegs.ts";
import { lineLength, sumLine, traceLine } from "../src/core/line.ts";
import { contrast, posterize, toneTable } from "../src/core/tone.ts";
import { buildTargets } from "../src/core/image.ts";
import { computeStats } from "../src/core/stats.ts";
import { Solver } from "../src/core/solver.ts";
import type { SolverSettings } from "../src/core/types.ts";

function settings(over: Partial<SolverSettings> = {}): SolverSettings {
  return {
    shape: "ellipse", pegs: 120, quality: "low", mode: "mono", dark: false,
    opacity: 0.2, maxSegments: 600, key: "normal", contrast: 0, steps: 0, ...over,
  };
}

/** A dark disc on a light ground, with a soft gradient. */
function testImage(w: number, h: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - w / 2, y - h / 2) / (w / 4);
      const v = d < 1 ? 30 : 200 + (55 * x) / w;
      const i = (y * w + x) * 4;
      px[i] = v;
      px[i + 1] = v * 0.8;
      px[i + 2] = v * 0.6;
      px[i + 3] = 255;
    }
  }
  return px;
}

describe("pegs", () => {
  it("places rectangle pegs on the border, starting top left", () => {
    const p = makePegs("rectangle", 40, 100, 60);
    expect(p.x[0]).toBe(0);
    expect(p.y[0]).toBe(0);
    for (let i = 0; i < 40; i++) {
      const onEdge = p.ix[i] === 0 || p.ix[i] === 99 || p.iy[i] === 0 || p.iy[i] === 59;
      expect(onEdge).toBe(true);
    }
  });

  it("places ellipse pegs inside the image, peg 0 at the top", () => {
    const p = makePegs("ellipse", 64, 101, 51);
    expect(p.x[0]).toBeCloseTo(50);
    expect(p.y[0]).toBeCloseTo(0);
    for (let i = 0; i < 64; i++) {
      expect(p.ix[i]).toBeGreaterThanOrEqual(0);
      expect(p.ix[i]).toBeLessThanOrEqual(100);
      expect(p.iy[i]).toBeGreaterThanOrEqual(0);
      expect(p.iy[i]).toBeLessThanOrEqual(50);
    }
  });

  it("masks only the inside of the ellipse", () => {
    const m = frameMask("ellipse", 21, 21);
    expect(m[10 * 21 + 10]).toBe(1);
    expect(m[0]).toBe(0);
    expect(frameMask("rectangle", 5, 5).every((v) => v === 1)).toBe(true);
  });
});

describe("line tracing", () => {
  it("hits both endpoints and steps one pixel at a time", () => {
    const w = 50;
    const out = new Int32Array(100);
    const cases = [[0, 0, 49, 17], [49, 49, 3, 0], [10, 40, 10, 2], [5, 5, 5, 5], [0, 30, 49, 30]];
    for (const [x0, y0, x1, y1] of cases) {
      const n = traceLine(x0, y0, x1, y1, w, out, 0);
      expect(n).toBe(lineLength(x0, y0, x1, y1));
      expect(out[0]).toBe(y0 * w + x0);
      expect(out[n - 1]).toBe(y1 * w + x1);
      for (let i = 1; i < n; i++) {
        const ax = out[i - 1] % w, ay = Math.floor(out[i - 1] / w);
        const bx = out[i] % w, by = Math.floor(out[i] / w);
        expect(Math.max(Math.abs(ax - bx), Math.abs(ay - by))).toBe(1);
      }
    }
  });

  it("sums the same pixels it traces", () => {
    const w = 40;
    const values = new Float32Array(w * w).map((_, i) => (i % 7) * 0.25);
    const out = new Int32Array(64);
    const n = traceLine(3, 37, 36, 1, w, out, 0);
    let expected = 0;
    for (let i = 0; i < n; i++) expected += values[out[i]];
    expect(sumLine(3, 37, 36, 1, w, values)).toBeCloseTo(expected, 5);
  });
});

describe("tone", () => {
  it("keeps black and white fixed and stays monotonic", () => {
    for (const key of ["high", "normal", "low"] as const) {
      for (const c of [0, 0.5, 1]) {
        for (const steps of [0, 3, 5, 9]) {
          const t = toneTable({ key, contrast: c, steps });
          expect(t[0]).toBeCloseTo(0);
          expect(t[255]).toBeCloseTo(1);
          for (let i = 1; i < 256; i++) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1] - 1e-6);
        }
      }
    }
  });

  it("posterizes into the requested number of values", () => {
    const seen = new Set<number>();
    for (let i = 0; i <= 100; i++) seen.add(posterize(i / 100, 5));
    expect(seen.size).toBe(5);
    expect(contrast(0.5, 1)).toBeCloseTo(0.5);
    expect(contrast(0.25, 1)).toBeLessThan(0.25);
  });
});

describe("solver", () => {
  const w = 96, h = 96;
  const pixels = testImage(w, h);

  function run(s: SolverSettings, cacheBudget?: number) {
    const pegs = makePegs(s.shape, s.pegs, w, h);
    const targets = buildTargets(pixels, w, h, s);
    const solver = new Solver(w, pegs, targets, { cacheBudget });
    const before = computeStats(targets, frameMask(s.shape, w, h));
    const path: number[] = [];
    for (let i = 0; i < s.maxSegments && solver.step(); i++) path.push(solver.lastThread, solver.lastFrom, solver.lastTo);
    const after = computeStats(targets, frameMask(s.shape, w, h));
    return { solver, before, after, path };
  }

  it("lowers the error in every mode", () => {
    for (const mode of ["mono", "color"] as const) {
      for (const dark of [false, true]) {
        const { before, after } = run(settings({ mode, dark }));
        expect(after.meanSquare).toBeLessThan(before.meanSquare);
      }
    }
  });

  it("gives the same path with and without the line table", () => {
    const a = run(settings({ mode: "color" }));
    const b = run(settings({ mode: "color" }), 0);
    expect(a.solver.cached).toBe(true);
    expect(b.solver.cached).toBe(false);
    expect(b.path).toEqual(a.path);
  });

  it("never joins neighbouring pegs or goes straight back", () => {
    const s = settings({ pegs: 100 });
    const { path } = run(s);
    const gap = Math.floor(s.pegs / 20);
    const prev = new Map<number, number>();
    for (let i = 0; i < path.length; i += 3) {
      const [t, a, b] = [path[i], path[i + 1], path[i + 2]];
      const d = Math.abs(a - b);
      expect(Math.min(d, s.pegs - d)).toBeGreaterThanOrEqual(gap);
      expect(b).not.toBe(prev.get(t));
      prev.set(t, a);
    }
  });
});
