import type { Shape } from "../core/types.ts";
import type { Look, SegmentStore } from "../render/canvas.ts";

/** Plain text winding guide, for making the piece with real pegs and thread. */
export function toInstructions(store: SegmentStore, look: Look, count: number, shape: Shape): string {
  const n = Math.min(count, store.length);
  const pegs = look.pegsX.length;
  const lines: string[] = [];
  lines.push("STRING ART WINDING GUIDE");
  lines.push("");
  lines.push(`Frame: ${shape}, ${pegs} pegs, aspect ${look.width}:${look.height}`);
  lines.push(
    shape === "rectangle"
      ? "Pegs are numbered 0 to " + (pegs - 1) + ", clockwise, starting at the top left corner."
      : "Pegs are numbered 0 to " + (pegs - 1) + ", clockwise, starting at the top.",
  );
  lines.push(`Background: ${look.dark ? "black" : "white"}. Total segments: ${n}.`);
  lines.push("");

  for (let t = 0; t < look.inks.length; t++) {
    const seq: number[] = [];
    for (let i = 0; i < n; i++) {
      if (store.thread[i] !== t) continue;
      if (seq.length === 0) seq.push(store.from[i]);
      seq.push(store.to[i]);
    }
    lines.push(`THREAD ${t + 1}: ${look.inks[t].name} (${Math.max(0, seq.length - 1)} segments)`);
    lines.push("Tie on at the first peg, then wind to each peg in order.");
    for (let i = 0; i < seq.length; i += 20) {
      lines.push(`  ${String(i + 1).padStart(5)}: ${seq.slice(i, i + 20).join(" ")}`);
    }
    lines.push("");
  }

  if (look.inks.length > 1) {
    lines.push("ORDER OF COLORS");
    lines.push("Winding each color in short runs keeps the colors woven together, like the");
    lines.push("solver did. Runs below are 'color: segments'.");
    let run = 0;
    let prev = -1;
    const runs: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = store.thread[i];
      if (t !== prev && run > 0) {
        runs.push(`${look.inks[prev].name}: ${run}`);
        run = 0;
      }
      prev = t;
      run++;
    }
    if (run > 0) runs.push(`${look.inks[prev].name}: ${run}`);
    for (let i = 0; i < runs.length; i += 8) lines.push("  " + runs.slice(i, i + 8).join(", "));
    lines.push("");
  }
  return lines.join("\n");
}
