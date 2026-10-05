import { luminance, toneTable, valueHistogram, type ToneSettings } from "../core/tone.ts";

/** Steps used for the study view when the tone itself is smooth (Ross's 9 step scale). */
export const STUDY_STEPS = 9;

/**
 * A grey value study of the picture: the toned image grouped into a few values,
 * the sketch a painter makes before committing to the final work.
 */
export function drawValueStudy(canvas: HTMLCanvasElement, image: ImageData, tone: ToneSettings): void {
  const steps = tone.steps >= 2 ? tone.steps : STUDY_STEPS;
  const table = toneTable({ ...tone, steps });
  const src = image.data;
  const out = new ImageData(image.width, image.height);
  const dst = out.data;
  for (let i = 0; i < src.length; i += 4) {
    const v = Math.round(table[Math.round(luminance(src[i], src[i + 1], src[i + 2]))] * 255);
    dst[i] = dst[i + 1] = dst[i + 2] = v;
    dst[i + 3] = 255;
  }
  putScaled(canvas, out);
}

/** The working image as the solver sees it, before tone changes. */
export function drawOriginal(canvas: HTMLCanvasElement, image: ImageData): void {
  putScaled(canvas, image);
}

/** Longest side of the reference views, matching the thread drawing. */
const VIEW_SIZE = 1600;

function putScaled(canvas: HTMLCanvasElement, image: ImageData): void {
  const scale = VIEW_SIZE / Math.max(image.width, image.height);
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const src = new OffscreenCanvas(image.width, image.height);
  src.getContext("2d")!.putImageData(image, 0, 0);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
}

/**
 * Fills `host` with a 9 step value scale, each swatch labeled with the share
 * of the picture that falls in that value. Darkest on the left.
 */
export function renderValueScale(host: HTMLElement, image: ImageData, tone: ToneSettings): void {
  const table = toneTable(tone);
  const shares = valueHistogram(image.data, table, STUDY_STEPS);
  host.replaceChildren();
  for (let i = 0; i < STUDY_STEPS; i++) {
    const v = Math.round(((i + 0.5) / STUDY_STEPS) * 255);
    const cell = document.createElement("div");
    cell.className = "swatch";
    cell.style.background = `rgb(${v},${v},${v})`;
    cell.style.color = v < 128 ? "#fff" : "#000";
    cell.title = `Value ${i + 1} of ${STUDY_STEPS}: ${(shares[i] * 100).toFixed(1)}% of the picture`;
    cell.textContent = `${Math.round(shares[i] * 100)}%`;
    host.append(cell);
  }
}
