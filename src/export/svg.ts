import type { Look, SegmentStore } from "../render/canvas.ts";

/**
 * Vector export, in working pixel units. Light mode blends with multiply and dark
 * mode with plus-lighter, matching the on-screen drawing.
 */
export function toSvg(store: SegmentStore, look: Look, count: number): string {
  const n = Math.min(count, store.length);
  const blend = look.dark ? "plus-lighter" : "multiply";
  const bg = look.dark ? "#000000" : "#ffffff";
  const px = look.pegsX;
  const py = look.pegsY;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${look.width} ${look.height}" width="${look.width}" height="${look.height}">`,
    `<rect width="100%" height="100%" fill="${bg}"/>`,
    `<g style="isolation:isolate" stroke-width="${look.thickness}" stroke-linecap="round" stroke-opacity="${look.opacity}">`,
  );
  // Inside one light mode color group, normal compositing already equals multiply
  // (every channel is 0 or 1), so only dark mode needs the blend on each line.
  const lineStyle = look.dark ? ` style="mix-blend-mode:${blend}"` : "";
  for (let t = 0; t < look.inks.length; t++) {
    parts.push(`<g stroke="${look.inks[t].css}" style="mix-blend-mode:${blend}">`);
    for (let i = 0; i < n; i++) {
      if (store.thread[i] !== t) continue;
      const a = store.from[i];
      const b = store.to[i];
      parts.push(
        `<line x1="${f(px[a] + 0.5)}" y1="${f(py[a] + 0.5)}" x2="${f(px[b] + 0.5)}" y2="${f(py[b] + 0.5)}"${lineStyle}/>`,
      );
    }
    parts.push("</g>");
  }
  parts.push("</g></svg>");
  return parts.join("\n");
}

function f(v: number): string {
  return v.toFixed(2).replace(/\.?0+$/, "");
}
