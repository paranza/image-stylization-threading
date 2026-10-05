/**
 * Solver benchmark, runs in plain Node (type stripping): `npm run bench`.
 * Uses a synthetic portrait-like image so it needs no image decoder.
 */
import { buildTargets } from "../src/core/image.ts";
import { makePegs } from "../src/core/pegs.ts";
import { Solver } from "../src/core/solver.ts";
import { QUALITY_SIZE, type Mode, type Quality, type SolverSettings } from "../src/core/types.ts";

function syntheticImage(w: number, h: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const head = Math.hypot((x - w * 0.5) / (w * 0.22), (y - h * 0.4) / (h * 0.28));
      const body = y > h * 0.65 ? Math.abs(x - w * 0.5) / (w * 0.4) : 9;
      const light = 0.5 + 0.5 * Math.cos((x / w) * Math.PI);
      const v = head < 1 ? 120 + 120 * light * (1 - head) : body < 1 ? 70 : 20 + 30 * (y / h);
      const i = (y * w + x) * 4;
      px[i] = v * 1.05;
      px[i + 1] = v * 0.9;
      px[i + 2] = v * 0.7;
      px[i + 3] = 255;
    }
  }
  return px;
}

function bench(quality: Quality, mode: Mode, pegs: number, segments: number): void {
  const w = QUALITY_SIZE[quality];
  const h = Math.round(w * 1.2);
  const s: SolverSettings = {
    shape: "ellipse", pegs, quality, mode, dark: false, opacity: 0.15,
    maxSegments: segments, key: "normal", contrast: 0, steps: 0,
  };
  const pixels = syntheticImage(w, h);
  const t0 = performance.now();
  const targets = buildTargets(pixels, w, h, s);
  const solver = new Solver(w, makePegs(s.shape, s.pegs, w, h), targets);
  const t1 = performance.now();
  let done = 0;
  while (done < segments && solver.step()) done++;
  const t2 = performance.now();
  const rate = Math.round((done / (t2 - t1)) * 1000);
  console.log(
    `${quality.padEnd(6)} ${mode.padEnd(5)} ${w}x${h} pegs=${pegs} ` +
      `cache=${solver.cached ? "yes" : "no "} setup=${(t1 - t0).toFixed(0).padStart(4)}ms ` +
      `segments=${String(done).padStart(5)} solve=${(t2 - t1).toFixed(0).padStart(5)}ms  ${rate.toLocaleString()} seg/s`,
  );
}

for (const quality of ["low", "medium", "high"] as const) {
  bench(quality, "mono", 300, 4000);
  bench(quality, "color", 300, 6000);
}
