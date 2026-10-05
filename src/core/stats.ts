import type { Stats } from "./types.ts";
import type { Targets } from "./image.ts";

/** Compares the brightness the threads show with the toned goal, inside the frame. */
export function computeStats(t: Targets, mask: Uint8Array): Stats {
  let n = 0;
  let sum = 0;
  let sumAbs = 0;
  let sumSq = 0;
  for (let c = 0; c < t.goal.length; c++) {
    const goal = t.goal[c];
    const shown = t.shown[c];
    for (let i = 0; i < goal.length; i++) {
      if (mask[i] === 0) continue;
      const e = shown[i] - goal[i];
      sum += e;
      sumAbs += e < 0 ? -e : e;
      sumSq += e * e;
      n++;
    }
  }
  if (n === 0) return { average: 0, meanSquare: 0, variance: 0 };
  const mean = sum / n;
  return { average: sumAbs / n, meanSquare: sumSq / n, variance: sumSq / n - mean * mean };
}
